import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  classifyError,
  createUserFriendlyMessage,
  recoveryOptionsForCategory,
} from '../../shared/types/domain/agent-error';
import type { AgentEvent } from '../../shared/types/domain/agent-event';
import { createAuditEntry } from '../../shared/types/domain/audit-entry';
import type {
  AgentBackend,
  AgentSessionConfig,
  AuthMode,
} from '../../shared/types/ports/agent-backend';
import type { AuditRepository } from '../../shared/types/ports/audit-repository';

/**
 * Subset of the SDK module we actually use.
 * Keeps the rest of the codebase decoupled from the SDK's full surface.
 */
interface SdkModule {
  query(params: { prompt: string; options?: SdkQueryOptions }): SdkQuery;
}

interface SdkQueryOptions {
  abortController?: AbortController | undefined;
  cwd?: string | undefined;
  maxTurns?: number | undefined;
  maxBudgetUsd?: number | undefined;
  allowedTools?: string[] | undefined;
  disallowedTools?: string[] | undefined;
  tools?: string[] | undefined;
  systemPrompt?:
    | string
    | { type: 'preset'; preset: 'claude_code'; append?: string | undefined }
    | undefined;
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | undefined;
  persistSession?: boolean | undefined;
  /** Continue the most recent conversation in the current directory. */
  continue?: boolean | undefined;
  env?: Record<string, string | undefined> | undefined;
  forceLoginMethod?: 'claudeai' | 'console' | undefined;
  promptSuggestions?: boolean | undefined;
}

/**
 * SDK query is an AsyncGenerator that yields SDK messages.
 */
interface SdkQuery extends AsyncGenerator<SdkMessage, void> {
  interrupt(): Promise<void>;
}

/**
 * Minimal SDK message types we map from — avoids coupling to SDK internals.
 */
type SdkMessage =
  | SdkAssistantMessage
  | SdkResultSuccess
  | SdkResultError
  | SdkToolUseSummaryMessage
  | SdkToolProgressMessage
  | SdkStatusMessage
  | SdkSystemMessage
  | SdkAuthStatusMessage
  | SdkPromptSuggestionMessage
  | SdkOtherMessage;

interface SdkAssistantMessage {
  type: 'assistant';
  message: {
    content: SdkContentBlock[];
    stop_reason?: string | null;
  };
  error?: string;
  session_id: string;
}

type SdkContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'thinking'; thinking: string }
  | { type: string };

interface SdkResultSuccess {
  type: 'result';
  subtype: 'success';
  result: string;
  total_cost_usd: number;
  num_turns: number;
  session_id: string;
}

interface SdkResultError {
  type: 'result';
  subtype: string;
  errors?: string[];
  session_id: string;
}

interface SdkToolUseSummaryMessage {
  type: 'tool_use_summary';
  summary: string;
  session_id: string;
}

interface SdkToolProgressMessage {
  type: 'tool_progress';
  tool_name: string;
  elapsed_time_seconds?: number;
  session_id: string;
}

interface SdkAuthStatusMessage {
  type: 'auth_status';
  isAuthenticating: boolean;
  output: string[];
  error?: string;
  session_id: string;
}

interface SdkPromptSuggestionMessage {
  type: 'prompt_suggestion';
  suggestion: string;
  session_id: string;
}

interface SdkStatusMessage {
  type: 'system';
  subtype: 'status';
  session_id: string;
}

interface SdkSystemMessage {
  type: 'system';
  subtype: 'init';
  session_id: string;
}

interface SdkOtherMessage {
  type: string;
  session_id?: string;
}

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * ClaudeSdkBackend — the ONLY file that imports @anthropic-ai/claude-agent-sdk.
 * Anti-corruption layer: maps SDK messages → domain AgentEvent types.
 * Maintains per-session conversation history so the agent has full context.
 */
export class ClaudeSdkBackend implements AgentBackend {
  private abortController: AbortController | null = null;
  private activeQuery: SdkQuery | null = null;
  private readonly sessionHistory = new Map<string, ConversationTurn[]>();

  constructor(
    private readonly auditRepo: AuditRepository,
    private readonly getApiKey: () => string | null,
    private readonly getAuthMode: () => AuthMode = () => 'api-key',
    private readonly getUserName: () => string = () => 'User',
    private readonly getMemoryContext: () => string | null = () => null,
  ) {}

  async *startSession(config: AgentSessionConfig): AsyncIterable<AgentEvent> {
    const useSubscription = this.getAuthMode() === 'claude-subscription';

    if (!useSubscription) {
      const apiKey = config.apiKey !== '' ? config.apiKey : this.getApiKey();
      if (apiKey === null) {
        yield {
          type: 'error',
          userMessage: 'No API key configured. Please set up your API key first.',
          recoveryOptions: [
            { label: 'Set up API key', action: 'setup-key', description: 'Go to API key setup' },
          ],
        };
        return;
      }
    }

    const sdk = await this.loadSdk();
    if (sdk === null) {
      yield {
        type: 'text',
        content:
          "The Claude Agent SDK is not yet installed. I'm running in demo mode — I can show you how things work, but I can't execute real agent actions yet.",
      };
      yield { type: 'complete', summary: 'Demo mode — SDK not available' };
      return;
    }

    const apiKey = useSubscription ? null : config.apiKey !== '' ? config.apiKey : this.getApiKey();
    yield* this.runSdkSession(sdk, config, apiKey);
  }

  async *sendMessage(
    sessionId: string,
    message: string,
    workspacePath?: string,
  ): AsyncIterable<AgentEvent> {
    // Audit logging is best-effort — don't let it break the conversation
    try {
      this.auditRepo.append(createAuditEntry(sessionId, 'user:message', 'success', message));
    } catch {
      // Audit failure is non-fatal
    }

    // Track user message in conversation history
    const history = this.getOrCreateHistory(sessionId);
    history.push({ role: 'user', content: message });

    const useSubscription = this.getAuthMode() === 'claude-subscription';

    if (!useSubscription) {
      const apiKey = this.getApiKey();
      if (apiKey === null) {
        yield {
          type: 'error',
          userMessage: 'No API key configured. Please set up your API key first.',
          recoveryOptions: [
            { label: 'Set up API key', action: 'setup-key', description: 'Go to API key setup' },
          ],
        };
        return;
      }
    }

    const sdk = await this.loadSdk();
    if (sdk === null) {
      yield {
        type: 'error',
        userMessage: 'The Claude Agent SDK is not available.',
        recoveryOptions: [],
      };
      return;
    }

    const apiKey = useSubscription ? null : this.getApiKey();
    yield* this.runSdkTurn(sdk, apiKey, sessionId, message, workspacePath);
  }

  cancelCurrentAction(): void {
    this.abortController?.abort();
    // Fire-and-forget interrupt on the active query — ignore if already completed
    this.activeQuery?.interrupt().catch((err: unknown) => {
      console.debug('[SDK] Query interrupt failed (likely already completed):', err);
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- will be async when resume uses SDK
  async *resumeSession(sessionId: string): AsyncIterable<AgentEvent> {
    const history = this.sessionHistory.get(sessionId);
    const turnCount = history?.length ?? 0;
    yield {
      type: 'text',
      content:
        turnCount > 0
          ? `Resuming session with ${String(turnCount)} previous messages. Where were we?`
          : 'Resuming session...',
    };
  }

  private async loadSdk(): Promise<SdkModule | null> {
    try {
      return (await import('@anthropic-ai/claude-agent-sdk')) as SdkModule;
    } catch {
      return null;
    }
  }

  private getOrCreateHistory(sessionId: string): ConversationTurn[] {
    let history = this.sessionHistory.get(sessionId);
    if (history === undefined) {
      history = [];
      this.sessionHistory.set(sessionId, history);
    }
    return history;
  }

  /**
   * Try to read the BMAD agent definition from a candidate directory.
   * Returns [agentContent, configContent] or null if agent file not found.
   */
  private async tryLoadBmadFromDir(
    dir: string,
  ): Promise<{ agent: string; config: string | null } | null> {
    const agentPath = path.join(dir, '_bmad', 'bmm', 'agents', 'analyst.md');
    const configPath = path.join(dir, '_bmad', 'bmm', 'config.yaml');

    const [agentResult, configResult] = await Promise.allSettled([
      readFile(agentPath, 'utf-8'),
      readFile(configPath, 'utf-8'),
    ]);

    if (agentResult.status === 'rejected') {
      console.log(`[SDK Debug] No BMAD agent at ${agentPath}`);
      return null;
    }

    console.log(`[SDK Debug] Found BMAD agent at ${agentPath}`);
    return {
      agent: agentResult.value,
      config: configResult.status === 'fulfilled' ? configResult.value : null,
    };
  }

  /**
   * Load the BMAD agent definition and config.
   * Checks the workspace first, then falls back to app root (process.cwd()).
   * Replaces {project-root} placeholders with the resolved project path.
   */
  async loadBmadContext(workspacePath?: string): Promise<string | null> {
    const candidates: string[] = [];
    if (workspacePath !== undefined) {
      candidates.push(workspacePath);
    }
    // Fallback to app root (project root in dev, app path in prod)
    const appRoot = process.cwd();
    if (appRoot !== workspacePath) {
      candidates.push(appRoot);
    }

    if (candidates.length === 0) {
      console.log('[SDK Debug] No candidates for BMAD context loading');
      return null;
    }

    let bmad: { agent: string; config: string | null } | null = null;
    let resolvedRoot = workspacePath ?? appRoot;

    for (const candidate of candidates) {
      try {
        bmad = await this.tryLoadBmadFromDir(candidate);
        if (bmad !== null) {
          resolvedRoot = candidate;
          break;
        }
      } catch (err) {
        console.log(
          `[SDK Debug] Error checking BMAD in ${candidate}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    if (bmad === null) {
      console.log('[SDK Debug] No BMAD files found in any candidate directory');
      return null;
    }

    // Replace placeholders with actual values
    const userName = this.getUserName();
    const resolvePlaceholders = (text: string): string =>
      text
        .replace(/\{project-root\}/g, resolvedRoot)
        .replace(/^user_name:[ \t]*\S[^\r\n]*$/m, `user_name: ${userName}`);

    let context = `<bmad-agent-definition>\n${resolvePlaceholders(bmad.agent)}\n</bmad-agent-definition>`;
    if (bmad.config !== null) {
      context += `\n<bmad-config>\n${resolvePlaceholders(bmad.config)}\n</bmad-config>`;
    }

    console.log(
      `[SDK Debug] Loaded BMAD context (${String(context.length)} chars) from ${resolvedRoot}`,
    );
    return context;
  }

  private buildSdkEnv(apiKey: string | null): Record<string, string | undefined> {
    const env = { ...process.env };
    if (apiKey !== null) {
      env.ANTHROPIC_API_KEY = apiKey;
    }
    return env;
  }

  private buildSdkOptions(
    apiKey: string | null,
    overrides: Partial<SdkQueryOptions> = {},
    bmadContext?: string | null,
  ): SdkQueryOptions {
    const basePrompt =
      'You are loading a predefined agent and following its workflow. ' +
      'IMPORTANT: Do NOT use tools, create files, run commands, or take any actions ' +
      'unless the user explicitly asks you to. Ask clarifying questions instead of ' +
      'assuming intent. Keep responses conversational and concise.';

    // Include cross-session memory for personalization
    const memoryContext = this.getMemoryContext();
    let appendPrompt = basePrompt;
    if (bmadContext != null) {
      appendPrompt = `${bmadContext}\n\n${basePrompt}`;
    }
    if (memoryContext !== null) {
      appendPrompt = `${appendPrompt}\n\n<cross-session-memory>\n${memoryContext}\n</cross-session-memory>`;
    }

    const opts: SdkQueryOptions = {
      abortController: this.abortController ?? undefined,
      persistSession: true,
      env: this.buildSdkEnv(apiKey),
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: appendPrompt,
      },
      permissionMode: 'acceptEdits',
      promptSuggestions: true,
      ...overrides,
    };
    if (this.getAuthMode() === 'claude-subscription') {
      opts.forceLoginMethod = 'claudeai';
    }
    return opts;
  }

  private async *runSdkSession(
    sdk: SdkModule,
    config: AgentSessionConfig,
    apiKey: string | null,
  ): AsyncIterable<AgentEvent> {
    this.abortController = new AbortController();

    const bmadContext = await this.loadBmadContext(config.workspacePath);
    const prompt = 'Hello — I just opened a new session. Please introduce yourself briefly.';
    const options = this.buildSdkOptions(
      apiKey,
      {
        cwd: config.workspacePath,
        maxTurns: 1,
        maxBudgetUsd: config.maxBudgetUsd,
        allowedTools: [],
      },
      bmadContext,
    );

    console.log(
      '[SDK Debug] startSession query()',
      JSON.stringify(
        {
          prompt,
          options: { ...options, env: '[redacted]', abortController: '[AbortController]' },
        },
        null,
        2,
      ),
    );

    const queryObj = sdk.query({ prompt, options });

    this.activeQuery = queryObj;
    yield* this.consumeSdkStream(queryObj, 'session-init');
    this.activeQuery = null;
  }

  private async *runSdkTurn(
    sdk: SdkModule,
    apiKey: string | null,
    sessionId: string,
    message: string,
    workspacePath?: string,
  ): AsyncIterable<AgentEvent> {
    const maxRetries = 3;
    const bmadContext = await this.loadBmadContext(workspacePath);
    const history = this.sessionHistory.get(sessionId);
    const hasPriorTurns = history !== undefined && history.length > 1;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      this.abortController = new AbortController();

      // On retry, disable continue to avoid session resume errors
      const useContinue = hasPriorTurns && attempt === 0;
      const options = this.buildSdkOptions(
        apiKey,
        {
          cwd: workspacePath,
          maxTurns: 25,
          continue: useContinue,
        },
        bmadContext,
      );

      console.log(
        `[SDK Debug] sendMessage query() attempt=${String(attempt + 1)}/${String(maxRetries + 1)}`,
        JSON.stringify(
          {
            prompt: message,
            sessionId,
            continue: useContinue,
            options: { ...options, env: '[redacted]', abortController: '[AbortController]' },
          },
          null,
          2,
        ),
      );

      const queryObj = sdk.query({ prompt: message, options });
      this.activeQuery = queryObj;

      let hadError = false;
      for await (const event of this.consumeSdkStream(queryObj, sessionId)) {
        if (event.type === 'error' && attempt < maxRetries) {
          // Swallow error and retry
          hadError = true;
          console.warn(
            `[SDK Debug] Error on attempt ${String(attempt + 1)}, retrying...`,
            event.userMessage,
          );
          yield {
            type: 'progress',
            step: `Retrying (${String(attempt + 1)}/${String(maxRetries)})...`,
            status: 'in-progress',
          };
          break;
        }
        yield event;
      }

      this.activeQuery = null;
      if (!hadError) {
        return;
      }
    }
  }

  /**
   * Consume the SDK's async generator and map each message to domain AgentEvents.
   * This is the anti-corruption layer boundary.
   */
  private async *consumeSdkStream(
    queryStream: AsyncGenerator<SdkMessage, void>,
    sessionId: string,
  ): AsyncIterable<AgentEvent> {
    try {
      for await (const msg of queryStream) {
        if (this.abortController?.signal.aborted === true) {
          yield { type: 'complete', summary: 'Cancelled by user' };
          return;
        }

        const msgType = `${msg.type}${(msg as { subtype?: string }).subtype !== undefined ? `:${(msg as { subtype?: string }).subtype ?? ''}` : ''}`;
        console.log(`[SDK Debug] ← ${msgType}`, JSON.stringify(msg, null, 2));
        const events = this.mapSdkMessage(msg, sessionId);
        for (const event of events) {
          console.log(`[SDK Debug] → UI event: ${event.type}`, JSON.stringify(event));
          yield event;
        }
      }
    } catch (err: unknown) {
      console.error('[ClaudeSdkBackend] SDK error:', err instanceof Error ? err.message : err);
      const category = classifyError(err);
      yield {
        type: 'error',
        userMessage: createUserFriendlyMessage(category),
        recoveryOptions: recoveryOptionsForCategory(category),
      };
    }
  }

  /**
   * Map a single SDK message to zero or more domain AgentEvents.
   * SDK types stay on this side of the boundary — only AgentEvents cross out.
   */
  private mapSdkMessage(msg: SdkMessage, sessionId: string): AgentEvent[] {
    switch (msg.type) {
      case 'assistant':
        return this.mapAssistantMessage(msg as SdkAssistantMessage, sessionId);
      case 'result':
        return this.mapResultMessage(msg as SdkResultSuccess | SdkResultError);
      case 'tool_use_summary': {
        const summary = msg as SdkToolUseSummaryMessage;
        return [{ type: 'progress', step: summary.summary, status: 'completed' }];
      }
      case 'tool_progress': {
        const progress = msg as SdkToolProgressMessage;
        return [
          { type: 'progress', step: `Running ${progress.tool_name}...`, status: 'in-progress' },
        ];
      }
      case 'auth_status': {
        const authMsg = msg as SdkAuthStatusMessage;
        const authText = authMsg.error ?? authMsg.output.join(' ');
        if (authText.trim() !== '') {
          return [{ type: 'auth-status', message: authText }];
        }
        return [];
      }
      case 'prompt_suggestion': {
        const sugMsg = msg as SdkPromptSuggestionMessage;
        return [{ type: 'suggestion', suggestions: [sugMsg.suggestion] }];
      }
      default:
        return this.mapDefaultMessage(msg);
    }
  }

  private mapAssistantMessage(msg: SdkAssistantMessage, sessionId: string): AgentEvent[] {
    if (msg.error !== undefined) {
      return [
        {
          type: 'error',
          userMessage: 'Something unexpected happened. Let me try a different approach.',
          recoveryOptions: [
            { label: 'Try again', action: 'retry', description: 'Retry the last action' },
          ],
        },
      ];
    }
    return msg.message.content.flatMap((block) => this.mapAssistantContentBlock(block, sessionId));
  }

  private mapAssistantContentBlock(block: SdkContentBlock, sessionId: string): AgentEvent[] {
    if (block.type === 'text') {
      const textBlock = block as { type: 'text'; text: string };
      if (textBlock.text.trim() === '') return [];
      const history = this.getOrCreateHistory(sessionId);
      history.push({ role: 'assistant', content: textBlock.text });
      try {
        this.auditRepo.append(
          createAuditEntry(sessionId, 'agent:response', 'success', textBlock.text),
        );
      } catch {
        // Audit failure is non-fatal
      }
      return [{ type: 'text', content: textBlock.text }];
    }
    if (block.type === 'tool_use') {
      const toolBlock = block as { type: 'tool_use'; name: string; input: Record<string, unknown> };
      return [{ type: 'tool-call', toolName: toolBlock.name, toolInput: toolBlock.input }];
    }
    if (block.type === 'thinking') {
      const thinkBlock = block as { type: 'thinking'; thinking: string };
      const truncated =
        thinkBlock.thinking.length > 100
          ? `${thinkBlock.thinking.slice(0, 100)}...`
          : thinkBlock.thinking;
      return [{ type: 'thinking', summary: truncated }];
    }
    if (block.type === 'tool_result') {
      const resultBlock = block as {
        type: 'tool_result';
        tool_use_id: string;
        content: string;
        is_error?: boolean;
      };
      const preview =
        resultBlock.content.length > 80
          ? `${resultBlock.content.slice(0, 80)}...`
          : resultBlock.content;
      if (preview.trim() === '') return [];
      return [
        {
          type: 'progress',
          step: resultBlock.is_error === true ? `Tool error: ${preview}` : preview,
          status: resultBlock.is_error === true ? 'failed' : 'completed',
        },
      ];
    }
    return [];
  }

  private mapResultMessage(msg: SdkResultSuccess | SdkResultError): AgentEvent[] {
    if (msg.subtype === 'success') {
      const success = msg as SdkResultSuccess;
      return [
        { type: 'complete', summary: success.result !== '' ? success.result : 'Task completed' },
      ];
    }
    if (msg.subtype === 'error_max_turns') {
      return [
        {
          type: 'error',
          userMessage:
            "I've reached the maximum number of steps for this request. Try breaking it into smaller parts.",
          recoveryOptions: [
            { label: 'Try again', action: 'retry', description: 'Retry with a simpler request' },
          ],
        },
      ];
    }
    if (msg.subtype === 'error_max_budget_usd') {
      return [
        {
          type: 'error',
          userMessage: "This request exceeded the cost budget. Let's try a simpler approach.",
          recoveryOptions: [
            { label: 'Try again', action: 'retry', description: 'Retry with a simpler request' },
          ],
        },
      ];
    }
    const error = msg as SdkResultError;
    const rawDetail = error.errors?.join('; ') ?? '';
    const category = classifyError(new Error(rawDetail));
    return [
      {
        type: 'error',
        userMessage: createUserFriendlyMessage(category),
        recoveryOptions: recoveryOptionsForCategory(category),
      },
    ];
  }

  // Note: `user` type messages are SDK-internal (turn confirmations) — intentionally not mapped.
  private mapDefaultMessage(msg: SdkMessage): AgentEvent[] {
    if (msg.type === 'rate_limit_event') {
      console.warn('[ClaudeSdkBackend] Rate limited — SDK is waiting');
      return [{ type: 'progress', step: 'Waiting for API availability...', status: 'in-progress' }];
    }
    if (msg.type === 'system') {
      return this.mapSystemMessage(
        msg as {
          type: 'system';
          subtype?: string;
          description?: string;
          status?: string;
          summary?: string;
          last_tool_name?: string;
        },
      );
    }
    return [];
  }

  private mapSystemMessage(sysMsg: {
    type: 'system';
    subtype?: string;
    description?: string;
    status?: string;
    summary?: string;
    last_tool_name?: string;
  }): AgentEvent[] {
    if (sysMsg.subtype === 'task_started') {
      return [
        { type: 'progress', step: sysMsg.description ?? 'Processing...', status: 'in-progress' },
      ];
    }
    if (sysMsg.subtype === 'task_notification') {
      const taskStatus = sysMsg.status ?? 'completed';
      if (taskStatus === 'completed') {
        return [{ type: 'complete', summary: sysMsg.summary ?? 'Task completed' }];
      }
      return [
        {
          type: 'error',
          userMessage: sysMsg.summary ?? 'A background task did not complete successfully.',
          recoveryOptions: [
            { label: 'Try again', action: 'retry', description: 'Retry the last action' },
          ],
        },
      ];
    }
    if (sysMsg.subtype === 'task_progress' && sysMsg.last_tool_name !== undefined) {
      return [{ type: 'tool-call', toolName: sysMsg.last_tool_name, toolInput: {} }];
    }
    if (sysMsg.subtype === 'api_retry') {
      // Silent — SDK handles retries internally. Log only.
      console.log('[ClaudeSdkBackend] SDK API retry:', JSON.stringify(sysMsg));
    }
    // session_state_changed, compact_boundary, files_persisted, hooks — log only
    return [];
  }
}
