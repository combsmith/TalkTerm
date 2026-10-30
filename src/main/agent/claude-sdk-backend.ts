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
  /** Resume a specific SDK conversation by session ID. */
  resume?: string | undefined;
  env?: Record<string, string | undefined> | undefined;
  forceLoginMethod?: 'claudeai' | 'console' | undefined;
  promptSuggestions?: boolean | undefined;
  /** Permission callback invoked by the SDK before running a tool that is not pre-approved. */
  canUseTool?: SdkCanUseTool | undefined;
}

type SdkPermissionResult =
  | { behavior: 'allow'; updatedInput: Record<string, unknown> }
  | { behavior: 'deny'; message: string; interrupt?: boolean };

type SdkCanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal },
) => Promise<SdkPermissionResult>;

interface PendingPermission {
  toolName: string;
  input: Record<string, unknown>;
  resolve: (result: SdkPermissionResult) => void;
}

/** Build a human-readable description of a tool request for the confirm prompt. */
function describeToolRequest(toolName: string, input: Record<string, unknown>): string {
  const filePath = input['file_path'];
  const command = input['command'];
  const target =
    typeof filePath === 'string' ? filePath : typeof command === 'string' ? command : toolName;
  return `${toolName}: ${target}`;
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
  private lastTurnError = '';
  private readonly sessionHistory = new Map<string, ConversationTurn[]>();
  private readonly sdkSessionIds = new Map<string, string>();
  /** Tool-permission requests awaiting a user decision; the head is the one shown in the UI. */
  private readonly permissionQueue: PendingPermission[] = [];
  /** Events raised outside the SDK message stream (e.g. permission prompts) awaiting delivery. */
  private readonly injectedEvents: AgentEvent[] = [];
  /** Wakes consumeSdkStream when an injected event arrives while it awaits the SDK. */
  private wakeConsumer: (() => void) | null = null;

  constructor(
    private readonly auditRepo: AuditRepository,
    private readonly getApiKey: () => string | null,
    private readonly getAuthMode: () => AuthMode = () => 'api-key',
    private readonly getUserName: () => string = () => 'User',
    private readonly getMemoryContext: () => string | null = () => null,
    private readonly onSdkSessionId?: (sessionId: string, sdkSessionId: string) => void,
    private readonly getSdkSessionId?: (sessionId: string) => string | null,
    /** Directories containing bundled `_bmad` assets (e.g. Electron resources path). */
    private readonly getBundledAssetRoots: () => readonly string[] = () => [],
  ) {}

  async *startSession(config: AgentSessionConfig): AsyncIterable<AgentEvent> {
    const controller = new AbortController();
    this.abortController = controller;
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
    if (controller.signal.aborted) {
      yield { type: 'complete', summary: 'Cancelled by user' };
      return;
    }
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
    const controller = new AbortController();
    this.abortController = controller;
    // Audit logging is best-effort — don't let it break the conversation
    try {
      this.auditRepo.append(createAuditEntry(sessionId, 'user:message', 'success', message));
    } catch {
      // Audit failure is non-fatal
    }

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
    if (controller.signal.aborted) {
      yield { type: 'complete', summary: 'Cancelled by user' };
      return;
    }
    if (sdk === null) {
      yield {
        type: 'error',
        userMessage: 'The Claude Agent SDK is not available.',
        recoveryOptions: [],
      };
      return;
    }

    // Track user message in conversation history once pre-checks succeed
    const history = this.getOrCreateHistory(sessionId);
    history.push({ role: 'user', content: message });

    const apiKey = useSubscription ? null : this.getApiKey();
    yield* this.runSdkTurn(sdk, apiKey, sessionId, message, workspacePath);
  }

  cancelCurrentAction(): void {
    this.denyAllPermissions('Request was cancelled.');
    this.abortController?.abort();
    // Fire-and-forget interrupt on the active query — ignore if already completed
    this.activeQuery?.interrupt().catch((err: unknown) => {
      console.debug('[SDK] Query interrupt failed (likely already completed):', err);
    });
  }

  /** Resolve the permission request currently shown to the user, then present the next one. */
  respondToConfirmation(approved: boolean): void {
    const current = this.permissionQueue.shift();
    if (current === undefined) return;
    current.resolve(
      approved
        ? { behavior: 'allow', updatedInput: current.input }
        : { behavior: 'deny', message: 'The user declined this action.', interrupt: true },
    );
    this.presentNextPermission();
  }

  private denyAllPermissions(message: string): void {
    const pending = this.permissionQueue.splice(0);
    for (const request of pending) {
      request.resolve({ behavior: 'deny', message, interrupt: true });
    }
  }

  /** Surface the head of the permission queue to the UI as a confirm-request. */
  private presentNextPermission(): void {
    const next = this.permissionQueue[0];
    if (next === undefined) return;
    this.injectedEvents.push({
      type: 'confirm-request',
      action: next.toolName,
      description: describeToolRequest(next.toolName, next.input),
    });
    this.wakeConsumer?.();
  }

  /**
   * SDK permission callback: surfaces a confirm-request to the UI and waits for the
   * user's decision (delivered through respondToConfirmation) before the tool runs.
   * Concurrent requests (parallel tool calls) are queued and presented one at a time.
   */
  private readonly canUseTool: SdkCanUseTool = (toolName, input, { signal }) =>
    new Promise<SdkPermissionResult>((resolve) => {
      if (signal.aborted) {
        resolve({ behavior: 'deny', message: 'Request was cancelled.', interrupt: true });
        return;
      }
      const request: PendingPermission = { toolName, input, resolve };
      this.permissionQueue.push(request);
      signal.addEventListener(
        'abort',
        () => {
          const index = this.permissionQueue.indexOf(request);
          if (index === -1) return;
          this.permissionQueue.splice(index, 1);
          resolve({ behavior: 'deny', message: 'Request was cancelled.', interrupt: true });
          if (index === 0) {
            this.presentNextPermission();
          }
        },
        { once: true },
      );
      if (this.permissionQueue.length === 1) {
        this.presentNextPermission();
      }
    });

  // eslint-disable-next-line @typescript-eslint/require-await -- will be async when resume uses SDK
  async *resumeSession(sessionId: string): AsyncIterable<AgentEvent> {
    const persistedSdkId =
      this.sdkSessionIds.get(sessionId) ?? this.getSdkSessionId?.(sessionId) ?? null;
    if (persistedSdkId !== null) {
      this.sdkSessionIds.set(sessionId, persistedSdkId);
      if (!this.sessionHistory.has(sessionId)) {
        this.sessionHistory.set(sessionId, [
          { role: 'assistant', content: 'Resumed previous session.' },
        ]);
      }
    }
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
    const legacyAgentPath = path.join(dir, '_bmad', 'bmm', 'agents', 'analyst.md');
    const skillAgentPath = path.join(
      dir,
      '_bmad',
      'bmm',
      '1-analysis',
      'bmad-agent-analyst',
      'SKILL.md',
    );
    const configPath = path.join(dir, '_bmad', 'bmm', 'config.yaml');

    const [legacyResult, configResult] = await Promise.allSettled([
      readFile(legacyAgentPath, 'utf-8'),
      readFile(configPath, 'utf-8'),
    ]);

    let agentContent: string | null =
      legacyResult.status === 'fulfilled' ? legacyResult.value : null;
    let resolvedAgentPath = legacyAgentPath;

    if (agentContent === null) {
      const [skillResult] = await Promise.allSettled([readFile(skillAgentPath, 'utf-8')]);
      if (skillResult.status === 'fulfilled') {
        agentContent = skillResult.value;
        resolvedAgentPath = skillAgentPath;
      }
    }

    if (agentContent === null) {
      this.debugLog(`[SDK Debug] No BMAD agent at ${legacyAgentPath} or ${skillAgentPath}`);
      return null;
    }

    this.debugLog(`[SDK Debug] Found BMAD agent at ${resolvedAgentPath}`);
    return {
      agent: agentContent,
      config: configResult.status === 'fulfilled' ? configResult.value : null,
    };
  }

  /**
   * Load the BMAD agent definition and config.
   * Checks the workspace first, then the bundled app assets (injected — e.g. Electron's
   * resources path when packaged), then falls back to process.cwd().
   * Replaces {project-root} placeholders with the resolved project path.
   */
  async loadBmadContext(workspacePath?: string): Promise<string | null> {
    const candidates: string[] = [];
    const addCandidate = (dir: string): void => {
      if (dir !== '' && !candidates.includes(dir)) {
        candidates.push(dir);
      }
    };
    if (workspacePath !== undefined) {
      addCandidate(workspacePath);
    }
    // Bundled assets are independent of the launch directory (packaged apps start with cwd '/')
    for (const root of this.getBundledAssetRoots()) {
      addCandidate(root);
    }
    // Last resort: launch directory (project root when running from a checkout)
    const appRoot = process.cwd();
    addCandidate(appRoot);

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
        this.debugLog(
          `[SDK Debug] Error checking BMAD in ${candidate}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    if (bmad === null) {
      this.debugLog('[SDK Debug] No BMAD files found in any candidate directory');
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

    this.debugLog(
      `[SDK Debug] Loaded BMAD context (${String(context.length)} chars) from ${resolvedRoot}`,
    );
    return context;
  }

  private isDebugEnabled(): boolean {
    const flag = process.env['TALKTERM_DEBUG_SDK'];
    return flag === '1' || flag === 'true';
  }

  private debugLog(label: string, payload?: unknown): void {
    if (!this.isDebugEnabled()) {
      return;
    }
    if (payload !== undefined) {
      console.log(label, typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2));
    } else {
      console.log(label);
    }
  }

  private buildSdkEnv(apiKey: string | null): Record<string, string | undefined> {
    const env = { ...process.env };
    if (apiKey !== null) {
      env.ANTHROPIC_API_KEY = apiKey;
    } else {
      delete env.ANTHROPIC_API_KEY;
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
      permissionMode: 'default',
      allowedTools: ['Read', 'Glob', 'Grep', 'LS'],
      promptSuggestions: true,
      canUseTool: this.canUseTool,
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
    const controller = this.abortController ?? new AbortController();
    this.abortController = controller;

    const bmadContext = await this.loadBmadContext(config.workspacePath);
    if (controller.signal.aborted) {
      yield { type: 'complete', summary: 'Cancelled by user' };
      return;
    }
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

    this.debugLog('[SDK Debug] startSession query()', {
      prompt: '[redacted]',
      options: { ...options, env: '[redacted]', abortController: '[AbortController]' },
    });

    const queryObj = sdk.query({ prompt, options });

    const initSessionId =
      config.sessionId !== undefined && config.sessionId !== '' ? config.sessionId : 'session-init';
    this.activeQuery = queryObj;
    yield* this.consumeSdkStream(queryObj, initSessionId);
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
    const initialController = this.abortController ?? new AbortController();
    this.abortController = initialController;
    const bmadContext = await this.loadBmadContext(workspacePath);
    if (initialController.signal.aborted) {
      yield { type: 'complete', summary: 'Cancelled by user' };
      return;
    }
    const persistedSdkId =
      this.sdkSessionIds.get(sessionId) ?? this.getSdkSessionId?.(sessionId) ?? null;
    if (persistedSdkId !== null) {
      this.sdkSessionIds.set(sessionId, persistedSdkId);
    }
    let resumeFailed = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        this.abortController = new AbortController();
      }
      this.lastTurnError = '';

      const useContinue = persistedSdkId !== null && !resumeFailed;
      const options = this.buildSdkOptions(
        apiKey,
        {
          cwd: workspacePath,
          maxTurns: 25,
          maxBudgetUsd: 1.0,
          continue: useContinue,
          ...(useContinue ? { resume: persistedSdkId } : {}),
        },
        bmadContext,
      );

      this.debugLog(
        `[SDK Debug] sendMessage query() attempt=${String(attempt + 1)}/${String(maxRetries + 1)}`,
        {
          prompt: '[redacted]',
          sessionId,
          continue: useContinue,
          options: { ...options, env: '[redacted]', abortController: '[AbortController]' },
        },
      );

      const queryObj = sdk.query({ prompt: message, options });
      this.activeQuery = queryObj;

      let hadError = false;
      let hadToolActivity = false;
      for await (const event of this.consumeSdkStream(queryObj, sessionId)) {
        if (event.type === 'tool-call' || event.type === 'progress') {
          hadToolActivity = true;
        }
        const isBudgetExhausted = this.lastTurnError === 'error_max_budget_usd';
        if (
          event.type === 'error' &&
          attempt < maxRetries &&
          !hadToolActivity &&
          !isBudgetExhausted &&
          !this.abortController.signal.aborted
        ) {
          // Swallow transient pre-tool error and retry; only drop resume context on confirmed resume failures
          hadError = true;
          if (this.isResumeFailure(this.lastTurnError)) {
            resumeFailed = true;
          }
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
      if (!hadError || this.abortController.signal.aborted) {
        return;
      }
    }
  }

  private isResumeFailure(rawError: string): boolean {
    return /\b(?:resume|session|conversation)\b.*\b(?:not found|invalid|missing|expired|no such)\b|\b(?:no conversation|not found|invalid|no such)\b.*\b(?:resume|session|conversation)\b/i.test(
      rawError,
    );
  }

  /**
   * Consume the SDK's async generator and map each message to domain AgentEvents.
   * This is the anti-corruption layer boundary.
   */
  private async *consumeSdkStream(
    queryStream: AsyncGenerator<SdkMessage, void>,
    sessionId: string,
  ): AsyncIterable<AgentEvent> {
    // Manual iteration (instead of for-await) so permission prompts raised by canUseTool
    // can be delivered while the SDK stream is blocked waiting on the user's decision.
    const iterator = queryStream[Symbol.asyncIterator]();
    let nextMessage: Promise<IteratorResult<SdkMessage, void>> | null = null;
    try {
      nextMessage = iterator.next();
      for (;;) {
        // Deliver events raised outside the SDK stream (permission prompts) first.
        let injected = this.injectedEvents.shift();
        while (injected !== undefined) {
          yield injected;
          injected = this.injectedEvents.shift();
        }

        const woken = new Promise<'woken'>((resolve) => {
          this.wakeConsumer = (): void => {
            resolve('woken');
          };
        });
        const result = await Promise.race([nextMessage, woken]);
        this.wakeConsumer = null;
        if (result === 'woken') continue;
        if (result.done === true) break;
        nextMessage = iterator.next();
        const msg = result.value;

        if (this.abortController?.signal.aborted === true) {
          yield { type: 'complete', summary: 'Cancelled by user' };
          return;
        }

        if (
          typeof msg.session_id === 'string' &&
          msg.session_id !== '' &&
          sessionId !== 'session-init' &&
          this.sdkSessionIds.get(sessionId) !== msg.session_id
        ) {
          this.sdkSessionIds.set(sessionId, msg.session_id);
          this.onSdkSessionId?.(sessionId, msg.session_id);
        }

        const subtype = (msg as { subtype?: string }).subtype;
        const msgType = subtype !== undefined ? `${msg.type}:${subtype}` : msg.type;
        this.debugLog(`[SDK Debug] ← ${msgType}`, { type: msg.type, session_id: msg.session_id });
        const events = this.mapSdkMessage(msg, sessionId);
        for (const event of events) {
          this.debugLog(`[SDK Debug] → UI event: ${event.type}`, { type: event.type });
          yield event;
        }
      }
    } catch (err: unknown) {
      if (this.abortController?.signal.aborted === true) {
        yield { type: 'complete', summary: 'Cancelled by user' };
        return;
      }
      const errMessage = err instanceof Error ? err.message : String(err);
      this.lastTurnError = errMessage;
      console.error('[ClaudeSdkBackend] SDK error:', errMessage);
      const category = classifyError(err);
      yield {
        type: 'error',
        userMessage: createUserFriendlyMessage(category),
        recoveryOptions: recoveryOptionsForCategory(category),
      };
    } finally {
      this.wakeConsumer = null;
      // Avoid unhandled rejections from a prefetched message and close the SDK stream
      // when the consumer stops early (cancel, retry).
      nextMessage?.catch(() => undefined);
      iterator.return(undefined).catch(() => undefined);
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
      this.lastTurnError = msg.error;
      const rawCategory = classifyError(msg.error);
      const category = rawCategory === 'unknown' ? 'sdk-error' : rawCategory;
      return [
        {
          type: 'error',
          userMessage: createUserFriendlyMessage(category),
          recoveryOptions: recoveryOptionsForCategory(category),
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
      // Approval for write/execute tools is requested via the SDK canUseTool callback,
      // which blocks the tool until the user responds — no confirm prompt is emitted here.
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
      this.lastTurnError = 'error_max_budget_usd';
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
    this.lastTurnError = rawDetail;
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
        return [
          {
            type: 'progress',
            step: sysMsg.summary ?? 'Task completed',
            status: 'completed',
          },
        ];
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
