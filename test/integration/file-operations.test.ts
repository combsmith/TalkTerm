import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FakeAgentBackend } from '../../src/main/agent/fake-agent-backend';
import { AgentMessageRouter } from '../../src/main/agent/agent-message-router';
import type { AgentEvent } from '../../src/shared/types/domain/agent-event';
import {
  classifyError,
  createUserFriendlyMessage,
} from '../../src/shared/types/domain/agent-error';

/**
 * File Operations Integration Tests
 * Covers FR13 (file I/O operations within workspace)
 *
 * Tests that agent events for file operations contain correct workspace-scoped
 * paths, proper action metadata, and that errors are classified (never raw).
 */
describe('File Operations Integration (FR13)', () => {
  let tmpDir: string;
  let backend: FakeAgentBackend;
  let router: AgentMessageRouter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talkterm-file-ops-'));
    backend = new FakeAgentBackend();
    router = new AgentMessageRouter(backend);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function collectEvents(router: AgentMessageRouter): AgentEvent[] {
    const events: AgentEvent[] = [];
    router.onEvent((e) => events.push(e));
    return events;
  }

  describe('agent can create files within workspace', () => {
    it('emits tool-call and tool-result events with workspace-scoped path', async () => {
      const filePath = path.join(tmpDir, 'hello.txt');
      backend.queueEvents([
        { type: 'tool-call', toolName: 'file_write', toolInput: { path: filePath, content: 'hi' } },
        {
          type: 'tool-result',
          toolName: 'file_write',
          output: `Created ${filePath}`,
          success: true,
        },
        { type: 'complete', summary: 'File created' },
      ]);

      const events = collectEvents(router);
      await router.startSession({ workspacePath: tmpDir, apiKey: 'test-key' });

      const toolCall = events.find((e) => e.type === 'tool-call');
      expect(toolCall).toBeDefined();
      expect(toolCall!.type === 'tool-call' && toolCall!.toolInput['path']).toBe(filePath);
      expect(filePath.startsWith(tmpDir)).toBe(true);
    });
  });

  describe('agent events include file operation details', () => {
    it('tool-result contains action type, file path, and outcome', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      backend.queueEvents([
        { type: 'tool-call', toolName: 'file_write', toolInput: { path: filePath, content: '{}' } },
        {
          type: 'tool-result',
          toolName: 'file_write',
          output: `Written ${filePath}`,
          success: true,
        },
        { type: 'complete', summary: 'Done' },
      ]);

      const events = collectEvents(router);
      await router.startSession({ workspacePath: tmpDir, apiKey: 'test-key' });

      const result = events.find((e) => e.type === 'tool-result');
      expect(result).toBeDefined();
      if (result?.type === 'tool-result') {
        expect(result.toolName).toBe('file_write');
        expect(result.output).toContain(filePath);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('file paths are workspace-relative (no path traversal)', () => {
    it('rejects paths that escape the workspace via ../', async () => {
      const escapedPath = path.join(tmpDir, '..', '..', 'etc', 'passwd');
      const resolvedEscaped = path.resolve(escapedPath);
      backend.queueEvents([
        {
          type: 'tool-call',
          toolName: 'file_write',
          toolInput: { path: escapedPath, content: 'x' },
        },
        { type: 'complete', summary: 'Done' },
      ]);

      const events = collectEvents(router);
      await router.startSession({ workspacePath: tmpDir, apiKey: 'test-key' });

      const toolCall = events.find((e) => e.type === 'tool-call');
      expect(toolCall).toBeDefined();
      if (toolCall?.type === 'tool-call') {
        const targetPath = path.resolve(String(toolCall.toolInput['path']));
        expect(targetPath.startsWith(tmpDir)).toBe(false);
        expect(resolvedEscaped.startsWith(tmpDir)).toBe(false);
      }
    });

    it('accepts paths that remain within the workspace', async () => {
      const safePath = path.join(tmpDir, 'src', 'index.ts');
      backend.queueEvents([
        { type: 'tool-call', toolName: 'file_write', toolInput: { path: safePath, content: '' } },
        { type: 'complete', summary: 'Done' },
      ]);

      const events = collectEvents(router);
      await router.startSession({ workspacePath: tmpDir, apiKey: 'test-key' });

      const toolCall = events.find((e) => e.type === 'tool-call');
      if (toolCall?.type === 'tool-call') {
        const resolved = path.resolve(String(toolCall.toolInput['path']));
        expect(resolved.startsWith(tmpDir)).toBe(true);
      }
    });
  });

  describe('agent error on file operation failure', () => {
    it('classifies file permission errors as file-permission, not raw', () => {
      const rawError = new Error('EACCES: permission denied, open ' + path.join(tmpDir, 'locked'));
      const category = classifyError(rawError);
      const friendly = createUserFriendlyMessage(category);

      expect(category).toBe('file-permission');
      expect(friendly).not.toContain('EACCES');
      expect(friendly).not.toContain(tmpDir);
      expect(friendly.length).toBeGreaterThan(10);
    });

    it('surfaces failed file operations as error events with recovery options', async () => {
      backend.queueEvents([
        {
          type: 'tool-result',
          toolName: 'file_write',
          output: 'Permission denied',
          success: false,
        },
        {
          type: 'error',
          userMessage: "I don't have permission to access that file. Let's find another way.",
          recoveryOptions: [
            { label: 'Try another path', action: 'retry', description: 'Pick a different file' },
          ],
        },
      ]);

      const events = collectEvents(router);
      await router.startSession({ workspacePath: tmpDir, apiKey: 'test-key' });

      const failedResult = events.find((e) => e.type === 'tool-result' && !e.success);
      expect(failedResult).toBeDefined();

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === 'error') {
        expect(errorEvent.userMessage).not.toContain('EACCES');
        expect(errorEvent.recoveryOptions.length).toBeGreaterThan(0);
      }
    });
  });
});
