import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeSdkBackend } from '../../src/main/agent/claude-sdk-backend';
import type { AuditRepository } from '../../src/shared/types/ports/audit-repository';

/**
 * Workspace read permissions, end to end through the real Claude Agent SDK.
 *
 * A local stand-in for the Messages API asks for one Read tool call and records the
 * tool result the SDK sends back. This exercises the SDK's own permission engine
 * together with ClaudeSdkBackend's canUseTool, rather than a mocked SDK.
 */

interface FakeApi {
  url: string;
  /** File the next model turn asks the Read tool to open. */
  readTarget: string;
  /** Tool results the SDK sent back, in order. */
  toolResults: string[];
  /** Every request body the SDK sent, to prove what never left the machine. */
  bodies: string[];
  close: () => Promise<void>;
}

type SseEvent = [string, Record<string, unknown>];

function messageEvents(model: string, blocks: SseEvent[], stopReason: string): SseEvent[] {
  return [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model,
          content: [],
          stop_reason: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ],
    ...blocks,
    [
      'message_delta',
      { type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: 1 } },
    ],
    ['message_stop', { type: 'message_stop' }],
  ];
}

function toolUseTurn(model: string, filePath: string): SseEvent[] {
  return messageEvents(
    model,
    [
      [
        'content_block_start',
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_test', name: 'Read', input: {} },
        },
      ],
      [
        'content_block_delta',
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: JSON.stringify({ file_path: filePath }),
          },
        },
      ],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ],
    'tool_use',
  );
}

function textTurn(model: string): SseEvent[] {
  return messageEvents(
    model,
    [
      [
        'content_block_start',
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
      ],
      [
        'content_block_delta',
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done.' } },
      ],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ],
    'end_turn',
  );
}

interface MessagesRequest {
  model: string;
  messages: Array<{ content: unknown }>;
  tools?: Array<{ name: string }>;
}

function toolResultText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const block = (content as Array<{ type?: string; content?: unknown }>).find(
    (b) => b.type === 'tool_result',
  );
  return block === undefined ? null : JSON.stringify(block.content);
}

async function startFakeApi(): Promise<FakeApi> {
  const api: Omit<FakeApi, 'url' | 'close'> = { readTarget: '', toolResults: [], bodies: [] };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const url = req.url ?? '';
      if (req.method !== 'POST' || !url.startsWith('/v1/messages') || url.includes('count')) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end('{}');
        return;
      }
      api.bodies.push(body);
      const request = JSON.parse(body) as MessagesRequest;
      const result = toolResultText(request.messages.at(-1)?.content);
      if (result !== null) api.toolResults.push(result);
      const offersRead = request.tools?.some((tool) => tool.name === 'Read') ?? false;
      const events =
        offersRead && result === null
          ? toolUseTurn(request.model, api.readTarget)
          : textTurn(request.model);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const [event, data] of events) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return Object.assign(api, {
    url: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  });
}

function createAuditRepo(): AuditRepository {
  return { append: vi.fn(), findBySession: vi.fn(() => []), findByDateRange: vi.fn(() => []) };
}

describe('Workspace read permissions through the real SDK', () => {
  let api: FakeApi;
  let root: string;
  let workspace: string;
  let secret: string;

  beforeAll(async () => {
    api = await startFakeApi();
  });

  afterAll(async () => {
    await api.close();
  });

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'talkterm-read-perm-')));
    workspace = path.join(root, 'workspace');
    secret = path.join(root, 'secret.txt');
    fs.mkdirSync(workspace);
    fs.mkdirSync(path.join(root, 'home'));
    fs.writeFileSync(path.join(workspace, 'notes.md'), 'INSIDE-CONTENT');
    fs.writeFileSync(secret, 'OUTSIDE-CONTENT');
    fs.symlinkSync(secret, path.join(workspace, 'link.txt'));
    api.toolResults.length = 0;
    api.bodies.length = 0;

    // Isolate the SDK from the developer's own Claude settings and point it at the fake API.
    vi.stubEnv('HOME', path.join(root, 'home'));
    vi.stubEnv('USERPROFILE', path.join(root, 'home'));
    vi.stubEnv('CLAUDE_CONFIG_DIR', path.join(root, 'home', '.claude'));
    vi.stubEnv('ANTHROPIC_BASE_URL', api.url);
    vi.stubEnv('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '1');
    vi.stubEnv('DISABLE_AUTOUPDATER', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** Run one turn in which the model asks to read `target`; decline any prompt. */
  async function readThroughSdk(target: string): Promise<string[]> {
    api.readTarget = target;
    const backend = new ClaudeSdkBackend(createAuditRepo(), () => 'sk-ant-test-key');
    const prompts: string[] = [];
    for await (const event of backend.sendMessage('sess-read', 'read it', workspace)) {
      if (event.type === 'confirm-request') {
        prompts.push(event.description);
        backend.respondToConfirmation(false);
      }
    }
    return prompts;
  }

  it('reads a workspace file without prompting', async () => {
    const prompts = await readThroughSdk(path.join(workspace, 'notes.md'));

    expect(prompts).toEqual([]);
    expect(api.toolResults.length).toBeGreaterThan(0);
    expect(api.toolResults[0]).toContain('INSIDE-CONTENT');
  }, 60_000);

  it('asks before reading a file outside the workspace and withholds it when declined', async () => {
    const prompts = await readThroughSdk(secret);

    expect(prompts).toEqual([`Read: ${secret}`]);
    expect(api.bodies.length).toBeGreaterThan(0);
    expect(api.bodies.join('\n')).not.toContain('OUTSIDE-CONTENT');
  }, 60_000);

  it('asks before following a workspace symlink that leads outside', async () => {
    const link = path.join(workspace, 'link.txt');
    const prompts = await readThroughSdk(link);

    expect(prompts).toEqual([`Read: ${link}`]);
    expect(api.bodies.length).toBeGreaterThan(0);
    expect(api.bodies.join('\n')).not.toContain('OUTSIDE-CONTENT');
  }, 60_000);
});
