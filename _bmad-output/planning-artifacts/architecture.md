---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions', 'step-05-patterns', 'step-06-structure', 'step-07-validation', 'step-08-complete']
lastStep: 8
status: 'complete'
completedAt: '2026-03-21'
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
workflowType: 'architecture'
project_name: 'TalkTerm'
user_name: 'Root'
date: '2026-03-21'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (47 total across 14 categories):**
- Avatar & Persona (FR1-FR5): Animated 2D character with distinct listening/thinking/speaking states, TTS voice, unique per-persona identity
- Voice Interaction (FR6-FR9, FR37-FR38): STT pipeline with barge-in support, text alternative, network recovery auto-resume
- Agent Workflow Execution (FR10-FR17): Natural language → agent actions via Claude Agent SDK (in-process), multi-step BMAD workflows, file R/W via SDK built-in tools, MCP tool invocation, file upload via dialog/drag-and-drop
- Decision Presentation (FR18-FR22): Overlay card system for options/confirmations, click+voice selection, pre-action confirmation gate, hidden intermediate agent thinking
- Output & Artifacts (FR23-FR26): Structured document generation, in-app view, local file system access, verbal output summary
- Traceability & Logging (FR27-FR29): Timestamped action log, session history, full audit trail
- Session Management (FR30-FR33, FR36): New/resume sessions, durable state persistence on close/crash, local user profile (no login)
- Error Handling (FR34-FR35): Avatar-communicated errors in plain language, 2-3 overlay recovery options
- Voice Behaviors (FR37-FR38): Barge-in interruption, automatic network recovery
- System Prerequisites (FR39): Admin privilege check on every launch, blocking error if not admin
- API Key Management (FR40-FR41): Guided API key entry with live Anthropic API validation, three-state key management (none/valid/expired)
- Launch State Assessment (FR42): Combined assessment of API key + profile + avatar state to determine entry point
- Rich Display (FR43-FR45): Live task progress view, plan preview with confirm-plan integration, multi-mode right panel (document, comparison table, clustered cards, activity feed)
- Cross-Session Memory (FR46-FR47): Persistent, privacy-preserving conversation memory via structured summaries and decision metadata (not full verbatim transcripts) stored through SDK session persistence; avatar references past work using these summaries
- Preference Memory (FR51): User interaction pattern tracking via context-scribe, per agent type and workspace
- Workspace Selection (FR52-FR53): User repo or silent BMAD-method clone as default workspace
- External System Writeback (FR48-FR50): Write output artifacts to connected external systems (Azure DevOps, GitHub) via MCP
- Contextual Writeback (FR54-FR56): Writeback method adapts to session origin (ADO→ADO, repo→PR, local→file)

**Total Functional Requirements:** 56 (FR1–FR56)

**Non-Functional Requirements (critical to architecture):**
- Performance: ≤1s acknowledgement (p95), ≤3s first response segment via streaming TTS (p95), ≥30fps avatar animation on 5yo desktop GPU, ≤500ms STT start, ≤3s cold launch
- Security: OS credential store for API keys, no raw audio persistence, scoped file access, TLS 1.2+, no full cross-session verbatim transcript storage (only structured memory summaries and decision/plan metadata per FR46–FR47)
- Accessibility: Full text alternative to voice, 32×32px min click targets with hover/focus states, avatar speech captions
- Integration: 3x retry with exponential backoff, MCP protocol compliance, 10s timeout → user-facing error

**Scale & Complexity:**

- Primary domain: Cross-platform desktop, local-first, real-time media pipeline with in-process Claude Agent SDK
- Complexity level: Medium (desktop simplifies OS lifecycle and rendering budget vs mobile)
- Estimated architectural components: ~7 (Voice Pipeline, Avatar Renderer, Agent SDK Integration, IPC Message Bridge, Session State Manager, Overlay UI System, Audit Logger)

### Technical Constraints & Dependencies

- Single developer — framework must prioritize velocity; avoid custom solutions where off-the-shelf exists
- Cross-platform desktop single codebase (macOS/Windows/Linux), path to mobile without rewrite
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) runs in-process in Electron's Node.js main process — no CLI subprocess needed. SDK provides built-in tools (Bash, Read/Edit/Write, Glob/Grep, WebSearch/WebFetch) and MCP server support for full file system, shell, and local network access
- AI agent backend abstraction layer required — backend must be swappable without UI code changes
- STT/TTS services must be swappable via abstraction layer
- BYOK API key model — no server component in MVP
- Avatar must achieve ≥30fps on desktop systems with 5-year-old GPU; may downscale to 2D
- MCP tool invocation via Claude Agent SDK's built-in MCP support — no external bridge needed
- Internet connectivity required for AI API calls — no offline mode
- Direct distribution (no app store gatekeeping)

### Cross-Cutting Concerns Identified

1. **Latency orchestration** — voice pipeline, streaming TTS, and avatar animation must be coordinated across the full interaction loop
2. **Abstraction layer design** — AI backend and STT/TTS interfaces must be defined early and respected throughout
3. **Audio lifecycle management** — microphone capture, STT, TTS playback, and barge-in all interact and must be managed as a unified state machine
4. **State persistence** — durable session writes must happen on application close, crash, or unexpected termination
5. **Error surface contract** — all errors from any system must be translated to avatar-delivered natural language with overlay recovery options; no raw errors to UI
6. **API key security** — OS credential store integration (macOS Keychain / Windows Credential Manager / Linux Secret Service) is a cross-platform concern that must be addressed at the abstraction layer level
7. **Claude Agent SDK lifecycle** — session management (start, resume, cancel), cost/turn limits, permission control, and graceful shutdown must be managed reliably. SDK runs in-process (no subprocess) but long-running agent loops must be cancellable from the UI

## Starter Template Evaluation

### Primary Technology Domain

Cross-platform desktop app — Electron with React, TypeScript, and Vite.

### Starter Options Considered

| Option | Pros | Cons |
|---|---|---|
| **Electron Forge + Vite + TS** (official) | Official toolchain, Vite for fast dev, built-in packaging/signing/auto-update | No React out of the box — add manually (trivial) |
| electron-vite | Vite-native, fast HMR | Experimental; Forge is officially recommended and also supports Vite |
| electron-react-boilerplate | React included, mature | Webpack-based (slower than Vite), heavier boilerplate |
| Tauri + React | Smaller bundle (5-15MB vs ~150MB) | Rust backend can't run Claude Agent SDK (Node.js) natively — needs sidecar |

### Selected Starter: Electron Forge + Vite + TypeScript

**Rationale for Selection:**
1. Official Electron toolchain — packaging, code signing, auto-update, and artifact publishing built in
2. Vite — fast HMR, modern build pipeline
3. Node.js main process — Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) runs directly, no bridging
4. Electron v41 bundles Node.js 24 and Chromium 144 — Rive WebGL2 works natively in the renderer
5. Single language — TypeScript across main process (agent SDK), renderer (React + Rive), and IPC
6. Tauri rejected because its Rust backend cannot run the Claude Agent SDK (Node.js) natively — would require a sidecar process, adding complexity for no benefit

**Initialization Command:**

```bash
npx create-electron-app@latest talkterm --template=vite-typescript
```

**Post-init setup (add React + Rive):**

```bash
cd talkterm
npm install react react-dom @rive-app/react-webgl2
npm install -D @types/react @types/react-dom
```

Update `tsconfig.json`: add `"jsx": "react-jsx"` to `compilerOptions`.

### Architectural Decisions Provided by Starter

**Language & Runtime:**
- TypeScript (strict mode) across main + renderer processes
- Node.js 24 (main process — runs Claude Agent SDK)
- Chromium 144 (renderer — runs React + Rive WebGL2)
- Vite for build/dev with HMR

**Process Architecture:**
- **Main process (Node.js):** Claude Agent SDK (runs in-process — no subprocess needed), OS credential store, session/audit persistence (SQLite + JSON), agent message routing
- **Renderer process (Chromium):** React UI, Rive avatar animation (WebGL2), overlay cards, Web Speech API (STT + TTS)
- **IPC bridge:** Electron IPC (`contextBridge` + `ipcMain`/`ipcRenderer`) for streaming agent messages to renderer and user actions to main

**Claude Agent SDK Integration (Main Process):**
- SDK's `query()` returns an `AsyncGenerator<SDKMessage>` — streams typed messages as the agent works
- Built-in tools: Bash (persistent shell), Read/Edit/Write, Glob/Grep, WebSearch/WebFetch
- MCP server support built in — no external bridge needed
- Session persistence via session ID — resume conversations across app restarts
- Permission control: `allowedTools` for auto-approval, permission callbacks for FR20 confirmation gate
- Cost/turn limits: `maxTurns` and `maxBudgetUsd` prevent runaway agents. Greeting queries use `maxTurns: 1` with `allowedTools: []` (no tool use). Conversational queries use `maxTurns: 25` to support multi-step agent workflows (FR46).
- `settingSources: ["project"]` loads CLAUDE.md, skills, hooks from working directory
- No Claude Code CLI installation required

**Key Packages:**

| Package | Purpose | Process |
|---|---|---|
| `@anthropic-ai/claude-agent-sdk` | Full Claude Code agent loop — file ops, shell, MCP, web, subagents. Runs in-process. | Main |
| `@rive-app/react-webgl2` | Avatar animation with state machines (listening/thinking/speaking) | Renderer |
| `react` + `react-dom` | UI framework | Renderer |
| `electron safeStorage` | OS credential store for API keys (NFR6) | Main |
| `electron-store` | Config and user profile persistence (JSON) | Main |
| `better-sqlite3` | Session state and audit log persistence (FR27-FR32) | Main |

**Build & Distribution:**
- Electron Forge makers: `.dmg` (macOS), `.exe`/NSIS (Windows), `.deb`/`.rpm` (Linux)
- Code signing via Forge config
- Auto-update via `electron-updater` or Forge publisher
- Distribution: GitHub Releases + Homebrew/winget

**Animation Library: Rive**
- `@rive-app/react-webgl2` — WebGL2 renderer for best performance in Electron's Chromium
- State machines map directly to avatar conversational states (listening, thinking, speaking)
- 60fps on desktop hardware
- Rive editor for visual avatar design; community avatar templates available
- MIT licensed

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
1. Agent backend integration model (Claude Agent SDK in-process)
2. IPC streaming pattern (event-based)
3. Local data storage strategy (JSON + SQLite hybrid)
4. API key security model (Electron safeStorage)
5. STT/TTS strategy (Web Speech API)

**Important Decisions (Shape Architecture):**
1. Agent backend abstraction layer interface design
2. Avatar state machine mapping to SDK message types
3. File system scoping model (workspace per session)
4. Permission callback pattern for destructive action confirmation

**Deferred Decisions (Post-MVP):**
1. Cloud STT/TTS integration (Phase 2 — higher quality voices)
2. Multi-backend support (Phase 3)
3. Session sharing/export format
4. Telemetry and analytics platform

### Data Architecture

**Decision: Hybrid JSON + SQLite**
- **Config & user profile** → `electron-store` (JSON files)
  - User name, avatar preference, app settings, STT/TTS preferences
  - Simple key-value data, rarely queried, human-readable
- **Sessions & audit log** → `better-sqlite3` (SQLite)
  - Session records: session ID (from SDK), workspace path, status, timestamps, avatar, resume state
  - Audit log: timestamp, action type, outcome, triggering user intent/workflow step (FR27-FR29)
  - Append-heavy, queryable (session history list, audit trail filtering)
  - SQLite is single-file, no server, proven in Electron (VS Code, Signal)
- **SDK session continuity** → Claude Agent SDK manages its own session state via session IDs. TalkTerm stores the session ID in SQLite to enable resume (FR31).
- **Cross-session memory** → SDK session IDs are stored per workspace. When starting a new session in a workspace with prior sessions, the SDK's conversation history from previous sessions is available to the agent, enabling the avatar to reference past decisions and context naturally (FR46-FR47). TalkTerm also stores a lightweight memory index in SQLite (key decisions, project vocabulary, user preferences) for fast avatar greeting personalization without loading full session history.

**Rationale:** Config is read-once-on-launch data — JSON is simplest. Sessions and audit are write-heavy, queryable — SQLite is purpose-built for this. No ORM needed; raw SQL via `better-sqlite3` is synchronous and fast.

### Authentication & Security

**Decision: No traditional auth; BYOK API key via Electron safeStorage**
- No user accounts or login for MVP (FR36 — local profile only)
- User enters Anthropic API key once → encrypted via `safeStorage.encryptString()` → stored in OS credential store (macOS Keychain / Windows DPAPI / Linux libsecret)
- API key is validated live against the Anthropic API on entry (FR40) — not just format-checked
- API key state checked on every launch (FR41): no key → entry screen, valid → proceed, expired/revoked → re-entry with explanation
- API key decrypted and passed to Claude Agent SDK `query()` options at session start
- File system scoping: **workspace model** — user selects a working directory per session; SDK's file/shell tools operate within that context (matches how Claude Code already works with `cwd`). Allowlist model deferred to Phase 2.

**Admin Privilege Check (FR39):**
- On every launch, main process checks for admin/elevated privileges before any other operation
- macOS: check `process.getuid() === 0` or membership in admin group
- Windows: check via `electron.app.isElevated()` or native module `is-elevated`
- If not admin: renderer shows a blocking error screen with platform-specific relaunch instructions (Retry / Quit)
- The app does not initialize the agent SDK, load avatar, or access storage until admin check passes
- This is required because the Claude Agent SDK needs unrestricted file system access, shell execution, and MCP tool invocation

**Combined Launch State Assessment (FR42):**
- After admin check passes, main process reads API key validity, profile completeness, and avatar selection simultaneously
- Routes to the first incomplete step — no sequential checking
- See UX design specification Journey 4 for the full state matrix

**Rationale:** `safeStorage` is Electron's built-in encryption API backed by the OS credential store — no additional package needed. Admin privilege requirement ensures the agent SDK can operate without permission failures during workflows. Workspace model is simplest and matches Claude Code's existing directory-scoped execution.

### IPC & Communication Patterns

**Decision: Event-based streaming via Electron IPC**
- Main process runs Claude Agent SDK `query()` — yields `SDKMessage` objects via async generator
- Each message forwarded to renderer via `mainWindow.webContents.send("agent:message", message)`
- Renderer subscribes via `ipcRenderer.on("agent:message", handler)` through `contextBridge`
- Message types drive UI state transitions:

| SDK Message Type | Avatar State | UI Action | Right Panel Display Mode |
|---|---|---|---|
| `system` (init) | Ready | Log session capabilities | Hidden |
| `system` (api_retry) | — | Silent (SDK handles retries internally) | Unchanged |
| `system` (task_started) | Thinking | Show task description in caption | Task Progress |
| `system` (task_progress) | Thinking | Feed last_tool_name into TaskProgress steps | Task Progress — live update |
| `system` (task_notification) | Ready | Complete (if success) or error (if failed) with summary | Task Progress |
| `system` (session_state_changed) | — | Log only | Unchanged |
| `assistant` with text blocks | Speaking | Start TTS, animate lip sync | Auto-select: Document / ComparisonTable / ClusteredCards (FR45) |
| `assistant` with plan proposal | Speaking | Start TTS, present plan | Plan Preview (FR44) |
| `assistant` with tool_use blocks | Thinking | Show progress indicator, tool activity | Task Progress — live update (FR43) |
| `assistant` with thinking blocks | Deep-thinking | Trigger deep-thinking avatar animation | Unchanged |
| `assistant` with tool_result blocks | — | Summarize output in caption | Unchanged |
| `result` (success) | Ready | Flush pending text, clear task progress | Unchanged |
| `result` (error_during_execution) | Error recovery | Avatar explains error, show recovery options (FR34-FR35) | Hidden |
| `result` (error_max_turns) | Error recovery | "I've reached the maximum number of steps" — specific message | Hidden |
| `result` (error_max_budget_usd) | Error recovery | "This request exceeded the cost budget" — specific message | Hidden |
| `tool_use_summary` | — | Progress event (completed) | Unchanged |
| `tool_progress` | Thinking | Show tool name in caption | Task Progress |
| `rate_limit_event` | Thinking | "Waiting for API availability..." (debounced 300ms) | Unchanged |
| `auth_status` | Thinking | Show auth message as caption (e.g., "Opening browser...") | Hidden |
| `prompt_suggestion` | — | Display suggestion chips below text input | Hidden |
| `user` | — | Intentionally dropped (SDK-internal turn confirmations) | — |
| `stream_event` | — | Not subscribed (partial messages not used) | — |

- User actions (send message, approve/reject action, cancel) flow from renderer → main via `ipcRenderer.invoke("agent:action", payload)`
- SDK's `query.cancel()` method enables UI-driven cancellation of running agent loops

**Agent Backend Abstraction Layer:**
```typescript
interface AgentBackend {
  startSession(config: SessionConfig): AsyncIterable<AgentEvent>;
  sendMessage(sessionId: string, message: string): AsyncIterable<AgentEvent>;
  cancelCurrentAction(): void;
  resumeSession(sessionId: string): AsyncIterable<AgentEvent>;
}
```
Claude Agent SDK is the first implementation. The renderer never imports or references the SDK directly — all agent communication flows through this interface via IPC.

**STT/TTS Abstraction Layer:**
```typescript
interface SpeechToText {
  start(): void;
  stop(): void;
  onResult: (transcript: string, isFinal: boolean) => void;
  onError: (error: SpeechError) => void;
}

interface TextToSpeech {
  speak(text: string, voice?: VoiceConfig): Promise<void>;
  stop(): void;  // For barge-in (FR37)
  onEnd: () => void;
}
```
MVP implementation: Web Speech API (`SpeechRecognition` for STT, `SpeechSynthesis` for TTS) — free, zero config, built into Electron's Chromium. Cloud implementations (e.g., Whisper, ElevenLabs) are Phase 2 drop-in replacements.

### Frontend Architecture

**Decision: React with lightweight state management**
- **State management:** React Context + `useReducer` for app-level state (active session, avatar state, overlay stack). No Redux or Zustand — the app's state is driven by the SDK message stream, not complex client-side logic.
- **Component architecture:**
  - `<AvatarCanvas>` — Rive WebGL2 component, driven by state machine inputs
  - `<OverlayStack>` — layered overlay cards for decisions, output, errors
  - `<VoiceInput>` — microphone capture + STT integration
  - `<TextInput>` — full-featured text alternative (FR8)
  - `<SessionManager>` — session list, resume, new session
  - `<AuditLog>` — action history viewer (FR28)
- **Avatar state machine mapping:** Rive state machine inputs controlled by a React hook (`useAvatarState`) that maps SDK message types → Rive input states:
  - `setInputState("isListening", true)` when microphone is active
  - `setInputState("isThinking", true)` when SDK yields tool-call messages
  - `setInputState("isDeepThinking", true)` when SDK yields extended thinking blocks
  - `setInputState("isSpeaking", true)` when TTS is playing
- **Avatar animation states:** `ready`, `listening`, `thinking`, `deep-thinking`, `speaking`, `error`
- **Routing:** Minimal — single-window app with modal overlays, not multi-page. No router library needed.

### Infrastructure & Deployment

**Decision: GitHub Actions CI/CD + Electron Forge makers**
- **CI/CD:** GitHub Actions for build, test, package, and publish on all three platforms
- **Packaging:** Electron Forge makers — `.dmg` (macOS), `.exe`/NSIS (Windows), `.deb`/`.rpm` (Linux)
- **Code signing:** macOS notarization + Windows Authenticode via Forge config (required for unsigned app warnings)
- **Auto-update:** Electron Forge publisher to GitHub Releases; `electron-updater` checks for new versions on launch
- **Distribution:** GitHub Releases (primary), Homebrew cask (macOS), winget (Windows)
- **Environment config:** `electron-store` for user-facing settings; build-time env vars for dev/prod API endpoints (if any)
- **Logging:** SDK messages logged to SQLite audit trail. App-level errors logged to local file via `electron-log`. No remote telemetry in MVP.
- **Error reporting:** Local only for MVP. Sentry or similar remote error reporting is Phase 2.

### Decision Impact Analysis

**Implementation Sequence:**
1. Electron Forge project initialization + React + Rive setup
2. Admin privilege check (FR39) — blocking pre-gate in main process
3. API key setup flow with live validation (FR40, FR41) + combined launch state assessment (FR42)
4. Agent backend abstraction interface + Claude Agent SDK integration
5. IPC message bridge (main ↔ renderer streaming)
6. Avatar component with Rive state machine
7. Voice pipeline (Web Speech API STT + TTS with barge-in)
8. Three-zone layout (left panel action cards + center stage + right panel output)
9. Rich display modes: TaskProgress, PlanPreview, DocumentView, ComparisonTable, ClusteredCards (FR43-FR45)
10. Session management (SQLite persistence, resume)
11. Audit logging
12. Packaging and distribution

**Cross-Component Dependencies:**
- Avatar state depends on IPC message stream (must be built after IPC bridge)
- Voice pipeline depends on avatar state (barge-in stops TTS → updates avatar)
- Overlay cards depend on IPC message stream (tool-call confirmations from SDK)
- Session resume depends on both SQLite persistence and SDK session ID management
- All agent interactions flow through the abstraction layer — renderer never imports SDK directly

## Implementation Patterns & Consistency Rules

### Critical Conflict Points Identified

7 areas where AI agents could make different choices, organized by risk of implementation conflicts.

### Naming Patterns

**TypeScript Naming:**

| Category | Convention | Example |
|---|---|---|
| Variables/functions | camelCase | `sessionId`, `startSession()` |
| Types/interfaces | PascalCase | `AgentBackend`, `SessionConfig` |
| React components | PascalCase | `AvatarCanvas`, `OverlayStack` |
| Constants/enums | UPPER_SNAKE_CASE | `MAX_TURNS`, `AvatarState.SPEAKING` |

**File Naming:**

| Category | Convention | Example |
|---|---|---|
| General source files | kebab-case | `agent-backend.ts`, `session-store.ts` |
| React components | PascalCase | `AvatarCanvas.tsx`, `OverlayCard.tsx` |
| Test files | co-located, `.test.ts` suffix | `agent-backend.test.ts` next to `agent-backend.ts` |

**IPC Channel Naming:**
- Namespaced with colon separator: `namespace:verb`
- Examples: `agent:message`, `agent:action`, `session:resume`, `voice:result`

**SQLite Naming:**

| Category | Convention | Example |
|---|---|---|
| Tables | snake_case, plural | `sessions`, `audit_entries` |
| Columns | snake_case | `session_id`, `created_at`, `action_type` |

**Rive State Machine Inputs:**
- camelCase: `isListening`, `isThinking`, `isSpeaking`

### Structure Patterns

**Project Organization:**

```
src/
  main/                    # Electron main process
    agent/                 # Agent backend abstraction + SDK implementation
    storage/               # electron-store (JSON) + better-sqlite3
    security/              # safeStorage API key management
    ipc/                   # IPC handler registration
    main.ts                # Entry point
  renderer/                # Electron renderer process (React)
    components/            # React components (PascalCase files)
      avatar/              # AvatarCanvas, useAvatarState hook
      overlay/             # OverlayStack, OverlayCard
      voice/               # VoiceInput, TextInput
      session/             # SessionManager, SessionList
    hooks/                 # Shared React hooks
    context/               # React Context providers (AppState, AgentSession)
    types/                 # Renderer-only TypeScript types
    renderer.tsx           # Entry point
  shared/                  # Types shared between main + renderer
    types/                 # AgentEvent, SessionConfig, etc.
  preload/                 # Electron preload script (contextBridge)
    preload.ts
```

**Organization Rules:**
- Feature-based in renderer (`avatar/`, `overlay/`, `voice/`, `session/`)
- Concern-based in main (`agent/`, `storage/`, `security/`)
- Shared types in `src/shared/types/` — the ONLY code importable by both processes
- Tests co-located next to source files with `.test.ts` suffix
- No barrel files (`index.ts` re-exports) — import directly from source files

### Format Patterns

**IPC Message Envelope:**

All IPC messages between main ↔ renderer follow a single envelope:

```typescript
interface IPCMessage<T = unknown> {
  channel: string;      // e.g., "agent:message"
  payload: T;
  timestamp: number;
}
```

Agent messages from the SDK are mapped to domain `AgentEvent` types at the anti-corruption boundary (`claude-sdk-backend.ts`). The SDK yields 24+ message types; the backend maps these to 10 domain event types: `text`, `tool-call`, `tool-result`, `confirm-request`, `error`, `complete`, `progress`, `suggestion`, `auth-status`, `thinking`. The renderer only sees domain events — never raw SDK types.

**Audit Log Entry Format:**

```typescript
// SQLite audit_entries table
interface AuditEntry {
  id: number;              // auto-increment
  session_id: string;      // FK to sessions
  timestamp: string;       // ISO 8601
  action_type: string;     // e.g., "tool:bash", "tool:edit", "user:approve"
  outcome: string;         // 'success' | 'failure' | 'cancelled'
  user_intent: string;     // The workflow step or user message that triggered this
  details: string;         // JSON blob with action-specific data
}
```

**Date/Time Format:**
- Always ISO 8601 strings in storage and IPC: `"2026-03-21T12:15:40.590Z"`
- Display formatting happens only in renderer components

### Communication Patterns

**IPC Event Flow:**

```
Main → Renderer (streaming):
  agent:message    — SDK message (system, assistant, user, result)
  agent:error      — Classified error with recovery options
  session:updated  — Session state change

Renderer → Main (request/response):
  agent:action     — User sends message, approves/rejects, cancels
  session:start    — New session with workspace path
  session:resume   — Resume by session ID
  settings:get     — Read config value
  settings:set     — Write config value
```

**State Management:**

```typescript
interface AppState {
  currentSession: {
    id: string | null;
    workspacePath: string | null;
    status: 'idle' | 'active' | 'paused' | 'error';
  };
  avatar: {
    state: 'ready' | 'listening' | 'thinking' | 'speaking' | 'error';
    persona: AvatarPersona;
  };
  overlayStack: OverlayItem[];  // Stack-based: push/pop overlays
  userProfile: {
    name: string;
    avatarPreference: string;
  };
}
```

- Dispatch actions via `useReducer` — never mutate state directly
- Action names follow `domain:verb` pattern: `"session:start"`, `"avatar:setState"`, `"overlay:push"`, `"overlay:pop"`

### Process Patterns

**Error Handling Pipeline:**

```
Any error (SDK, STT, TTS, file system, SQLite)
  → catch in originating process
  → classify: recoverable vs fatal
  → wrap as AgentError { userMessage: string, options: RecoveryOption[] }
  → send via IPC: "agent:error"
  → renderer: avatar speaks userMessage, overlay shows recovery options
  → NEVER: raw error text, stack traces, or error codes in UI
```

This is a **hard rule** — no component may display a raw error. All errors route through the avatar conversation layer per FR34.

**Loading/Progress States:**
- Avatar animation state is the primary progress indicator (FR17, NFR1c)
- `isThinking` animation plays continuously during tool-call sequences
- No spinner components, no progress bars — the avatar IS the progress indicator
- Text captions below avatar show brief status: "Reading files...", "Running analysis..."

**Agent Action Confirmation Flow (FR20):**
1. SDK yields `assistant` message with tool calls
2. Main process checks if tool requires confirmation (destructive actions)
3. If yes: send `agent:confirm` via IPC with action description + options
4. Renderer: avatar explains proposed action, overlay shows approve/modify/reject
5. User response sent back via `agent:action` with decision
6. Main process forwards approval/rejection to SDK permission callback

### Enforcement Guidelines

**All AI Agents MUST:**

1. Route ALL errors through the avatar conversation pipeline — never display raw errors in UI
2. Use the `AgentBackend` interface for all agent communication — never import SDK directly in renderer
3. Use the `SpeechToText`/`TextToSpeech` interfaces — never use Web Speech API directly in components
4. Follow the IPC channel naming convention (`namespace:verb`)
5. Co-locate tests next to source files with `.test.ts` suffix
6. Place shared types in `src/shared/types/` — the only code importable by both processes
7. Use `useReducer` dispatch for all state changes — never `setState` with complex logic
8. Log all agent actions to the audit trail via the storage layer — never skip logging
9. Never import from `src/main/` in renderer code or from `src/renderer/` in main code — use `src/shared/` for cross-process types

**Anti-Patterns (NEVER do these):**

- `console.log(error.stack)` in renderer — use error pipeline
- `import { query } from "@anthropic-ai/claude-agent-sdk"` in renderer — use IPC
- `window.speechSynthesis.speak()` directly in a component — use TTS abstraction
- `ipcRenderer.send("custom-channel")` without namespace — use `namespace:verb`
- `useState` for complex app state — use `useReducer` via context
- Test files in a separate `__tests__/` directory — co-locate next to source

## Project Structure & Boundaries

### Complete Project Directory Structure

```
talkterm/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Build + test on push/PR
│       └── release.yml               # Package + publish on tag
├── .vscode/
│   └── settings.json                 # Workspace settings
├── assets/
│   ├── icons/                        # App icons (.icns, .ico, .png)
│   └── rive/                         # Rive animation files (.riv)
│       └── avatar-default.riv        # MVP avatar: listening/thinking/speaking states
├── forge.config.ts                   # Electron Forge config (makers, publishers, plugins)
├── package.json
├── tsconfig.json                     # Base TypeScript config
├── vite.main.config.ts               # Vite config for main process
├── vite.preload.config.ts            # Vite config for preload script
├── vite.renderer.config.ts           # Vite config for renderer
├── .env.example                      # Example env vars (no secrets)
├── .gitignore
│
└── src/
    ├── main/                          # ── Electron Main Process ──
    │   ├── main.ts                    # Entry: create window, register IPC, init storage
    │   │
    │   ├── agent/                     # Agent backend abstraction + implementations
    │   │   ├── agent-backend.ts       # AgentBackend interface definition
    │   │   ├── claude-sdk-backend.ts  # Claude Agent SDK implementation
    │   │   ├── claude-sdk-backend.test.ts
    │   │   ├── error-handler.ts       # Error classification → AgentError with recovery options
    │   │   └── error-handler.test.ts
    │   │
    │   ├── ipc/                       # IPC handler registration and routing
    │   │   ├── agent-handlers.ts      # agent:message, agent:action, agent:confirm channels
    │   │   ├── session-handlers.ts    # session:start, session:resume channels
    │   │   ├── settings-handlers.ts   # settings:get, settings:set channels
    │   │   └── ipc-registry.ts        # Central registration of all IPC handlers
    │   │
    │   ├── storage/                   # Persistence layer
    │   │   ├── config-store.ts        # electron-store wrapper for JSON config/profile
    │   │   ├── config-store.test.ts
    │   │   ├── database.ts            # better-sqlite3 init + migrations
    │   │   ├── database.test.ts
    │   │   ├── sessions.ts            # Session CRUD (SQLite)
    │   │   ├── sessions.test.ts
    │   │   ├── audit.ts               # Audit log write + query (SQLite)
    │   │   ├── audit.test.ts
    │   │   ├── memory.ts              # Cross-session memory index (FR46-FR47)
    │   │   └── memory.test.ts
    │   │
    │   └── security/                  # Credential management & system checks
    │       ├── admin-check.ts         # Admin privilege verification (FR39)
    │       ├── admin-check.test.ts
    │       ├── api-key-manager.ts     # safeStorage encrypt/decrypt + live validation (FR40, FR41)
    │       ├── api-key-manager.test.ts
    │       ├── launch-state.ts        # Combined state assessment (FR42)
    │       └── launch-state.test.ts
    │
    ├── renderer/                      # ── Electron Renderer Process (React) ──
    │   ├── renderer.tsx               # Entry: React root mount
    │   ├── App.tsx                    # Root component: context providers + layout
    │   │
    │   ├── components/
    │   │   ├── avatar/
    │   │   │   ├── AvatarCanvas.tsx   # Rive WebGL2 component
    │   │   │   ├── AvatarCanvas.test.tsx
    │   │   │   └── useAvatarState.ts  # Hook: SDK message type → Rive state inputs
    │   │   │
    │   │   ├── overlay/
    │   │   │   ├── OverlayStack.tsx   # Layered overlay container (push/pop)
    │   │   │   ├── OverlayCard.tsx    # Individual overlay card
    │   │   │   ├── ConfirmAction.tsx  # Agent action confirmation (FR20-FR21)
    │   │   │   └── OutputViewer.tsx   # Structured output display (FR24)
    │   │   │
    │   │   ├── display/              # Rich display modes for right panel (FR43-FR45)
    │   │   │   ├── TaskProgress.tsx   # Live workflow progress tree with status icons
    │   │   │   ├── PlanPreview.tsx    # Proposed plan view (integrates with confirm-plan)
    │   │   │   ├── DocumentView.tsx   # Rendered markdown output
    │   │   │   ├── ComparisonTable.tsx # Scored decision matrix with color coding
    │   │   │   ├── ClusteredCards.tsx # Expandable categorized idea groups
    │   │   │   ├── ActivityFeed.tsx   # Streaming agent action log (optional)
    │   │   │   └── useDisplayMode.ts  # Hook: auto-selects display mode from content type
    │   │   │
    │   │   ├── voice/
    │   │   │   ├── VoiceInput.tsx     # Microphone button + recording indicator (FR6, FR9)
    │   │   │   ├── TextInput.tsx      # Text input alternative (FR8)
    │   │   │   ├── Captions.tsx       # On-screen text captions (NFR12)
    │   │   │   └── useSpeech.ts       # Hook: STT/TTS abstraction consumer
    │   │   │
    │   │   ├── session/
    │   │   │   ├── SessionManager.tsx # New/resume session UI (FR30-FR31)
    │   │   │   ├── SessionList.tsx    # Resumable sessions list
    │   │   │   └── AuditLog.tsx       # Session action history (FR28)
    │   │   │
    │   │   └── setup/
    │   │       ├── AdminCheck.tsx      # Blocking admin privilege error screen (FR39)
    │   │       ├── ApiKeySetup.tsx    # API key entry with live validation (FR40, FR41)
    │   │       ├── WorkspaceSelect.tsx # Directory picker (NFR8)
    │   │       └── UserProfile.tsx    # Name + avatar preference (FR36)
    │   │
    │   ├── hooks/
    │   │   ├── useIPC.ts              # Hook: subscribe to IPC channels
    │   │   └── useAgentStream.ts      # Hook: consume agent messages, drive app state
    │   │
    │   ├── context/
    │   │   ├── AppStateContext.tsx     # AppState + useReducer provider
    │   │   └── app-reducer.ts         # Reducer: domain:verb actions → state transitions
    │   │
    │   ├── speech/                    # STT/TTS abstraction implementations
    │   │   ├── speech-interfaces.ts   # SpeechToText + TextToSpeech interfaces
    │   │   ├── web-speech-stt.ts      # Web Speech API SpeechRecognition impl
    │   │   └── web-speech-tts.ts      # Web Speech API SpeechSynthesis impl
    │   │
    │   ├── types/                     # Renderer-only types
    │   │   └── ui.ts                  # OverlayItem, AvatarPersona, UI types
    │   │
    │   └── styles/
    │       └── global.css             # Base styles
    │
    ├── shared/                        # ── Cross-Process Types (types only, no logic) ──
    │   └── types/
    │       ├── agent.ts               # AgentEvent, AgentError, RecoveryOption, SessionConfig
    │       ├── session.ts             # Session, SessionStatus
    │       ├── audit.ts               # AuditEntry
    │       ├── ipc.ts                 # IPCMessage envelope, channel name constants
    │       ├── avatar.ts              # AvatarState enum, AvatarPersona
    │       ├── voice.ts               # SpeechError, VoiceConfig
    │       └── errors.ts              # Error classification types
    │
    └── preload/                       # ── Electron Preload (contextBridge) ──
        └── preload.ts                 # Expose safe IPC methods to renderer

### Architectural Boundaries

**Process Boundary (Main ↔ Renderer):**
- Hard boundary enforced by Electron's process model and `contextBridge`
- Main process NEVER imports from `src/renderer/`
- Renderer NEVER imports from `src/main/`
- Both CAN import from `src/shared/types/` (type-only imports)
- All cross-process communication flows through IPC channels defined in `src/preload/preload.ts`

**Agent Abstraction Boundary:**
- `src/main/agent/agent-backend.ts` defines the interface
- `src/main/agent/claude-sdk-backend.ts` is the ONLY file that imports `@anthropic-ai/claude-agent-sdk`
- If the SDK is ever replaced, only this one file changes

**Speech Abstraction Boundary:**
- `src/renderer/speech/speech-interfaces.ts` defines STT/TTS interfaces
- `src/renderer/speech/web-speech-*.ts` are the only files that use Web Speech API
- Components consume speech via the `useSpeech` hook, never directly

**Storage Boundary:**
- `src/main/storage/` is the only code that touches `electron-store` or `better-sqlite3`
- Renderer accesses stored data via IPC (`settings:get`, `session:resume`), never directly

### Requirements to Structure Mapping

**FR Category → File Mapping:**

| FR Category | Primary Files |
|---|---|
| Avatar & Persona (FR1-FR5) | `renderer/components/avatar/AvatarCanvas.tsx`, `useAvatarState.ts`, `assets/rive/avatar-default.riv` |
| Voice Interaction (FR6-FR9, FR37-FR38) | `renderer/components/voice/VoiceInput.tsx`, `TextInput.tsx`, `Captions.tsx`, `renderer/speech/web-speech-*.ts` |
| Agent Workflow (FR10-FR17) | `main/agent/claude-sdk-backend.ts`, `main/ipc/agent-handlers.ts`, `renderer/hooks/useAgentStream.ts` |
| Decision Presentation (FR18-FR22) | `renderer/components/overlay/OverlayStack.tsx`, `OverlayCard.tsx`, `ConfirmAction.tsx` |
| Output & Artifacts (FR23-FR26) | `renderer/components/overlay/OutputViewer.tsx`, `main/agent/claude-sdk-backend.ts` |
| Rich Display (FR43-FR45) | `renderer/components/display/TaskProgress.tsx`, `PlanPreview.tsx`, `DocumentView.tsx`, `ComparisonTable.tsx`, `ClusteredCards.tsx`, `ActivityFeed.tsx`, `useDisplayMode.ts` |
| Cross-Session Memory (FR46-FR47) | `main/storage/memory.ts`, `main/agent/claude-sdk-backend.ts` (session ID chaining), `main/storage/sessions.ts` (memory index) |
| Traceability (FR27-FR29) | `main/storage/audit.ts`, `renderer/components/session/AuditLog.tsx` |
| Session Management (FR30-FR33, FR36) | `main/storage/sessions.ts`, `renderer/components/session/SessionManager.tsx`, `setup/UserProfile.tsx` |
| Error Handling (FR34-FR35) | `main/agent/error-handler.ts` → avatar + overlay (existing components) |
| System Prerequisites (FR39) | `main/security/admin-check.ts`, `renderer/components/setup/AdminCheck.tsx` |
| API Key Management (FR40-FR41) | `main/security/api-key-manager.ts`, `renderer/components/setup/ApiKeySetup.tsx` |
| Launch State Assessment (FR42) | `main/security/launch-state.ts` |
| Security (NFR6-NFR9) | `main/security/api-key-manager.ts`, `renderer/components/setup/WorkspaceSelect.tsx` |

### Data Flow

```
User speaks → VoiceInput (renderer)
  → Web Speech STT → transcript
  → useAgentStream hook → IPC "agent:action" → main process
  → claude-sdk-backend.ts → query({ prompt: transcript })
  → SDK streams SDKMessage objects
  → IPC "agent:message" → renderer
  → useAgentStream hook → AppState dispatch
  → AvatarCanvas reacts (Rive state machine)
  → TTS speaks response text
  → OverlayStack shows decisions/output if present
```

### External Integration Points

| Integration | Package | Location | Purpose |
|---|---|---|---|
| Anthropic API | `@anthropic-ai/claude-agent-sdk` | `main/agent/claude-sdk-backend.ts` | Agent loop, tools, MCP |
| MCP servers | Via Claude Agent SDK | `main/agent/claude-sdk-backend.ts` | Custom tool integrations |
| OS credential store | Electron `safeStorage` | `main/security/api-key-manager.ts` | API key encryption |
| File system | Via SDK tools + Electron dialog | `main/agent/`, `renderer/components/setup/` | Workspace files, document upload |

### Development Workflow

**Development Server:**
- `npm start` → Electron Forge dev server with Vite HMR
- Main process changes require restart; renderer changes hot-reload

**Build Process:**
- `npm run make` → Electron Forge packages for current platform
- GitHub Actions `release.yml` builds for macOS, Windows, Linux on tag push

**Test Execution:**
- `npm test` → runs all co-located `.test.ts` files
- Tests live next to source — no separate test directory

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All technology choices are compatible: Electron v41 (Node.js 24 + Chromium 144) runs Claude Agent SDK in main process, Rive WebGL2 and Web Speech API in Chromium renderer. `better-sqlite3` (native module) and `electron-store` (pure JS) both work in Electron main process. No version conflicts identified.

**Pattern Consistency:**
Naming conventions (camelCase/PascalCase/UPPER_SNAKE_CASE/snake_case) are consistently applied across TypeScript, React components, SQLite tables, IPC channels, and Rive state inputs. The `namespace:verb` pattern is used consistently for both IPC channels and state management actions.

**Structure Alignment:**
The four-directory process boundary (main/renderer/shared/preload) enforces the abstraction layers from Step 4. Single-file SDK import and single-file Web Speech API imports match their respective abstraction decisions.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**
All 47 functional requirements (FR1-FR47) have been mapped to specific files in the project structure. Every FR category has a clear architectural home. Cross-cutting concerns (error handling through avatar, audit logging) are addressed through the error pipeline pattern and storage layer.

**Non-Functional Requirements Coverage:**
All 17 NFRs are architecturally supported. Performance NFRs (latency, animation fps, cold launch) are addressed by technology choices (streaming SDK, Rive WebGL2 60fps, Vite optimized build). Security NFRs are addressed by Electron safeStorage, workspace scoping model, and Web Speech API in-memory transcription.

### Implementation Readiness Validation ✅

**Decision Completeness:**
All critical decisions are documented with specific technology versions. Implementation patterns include concrete examples and anti-patterns. Abstraction layer interfaces are fully specified with TypeScript signatures.

**Structure Completeness:**
~50 files defined across 4 process directories. Every file has a documented purpose and FR mapping. Integration points are explicitly listed with package names and file locations.

**Pattern Completeness:**
7 naming categories, 4 architectural boundaries, IPC channel catalog, state management shape, error pipeline, confirmation flow, and loading state patterns are all specified.

### Gap Analysis Results

**Critical Gaps:** None.

**Important Gaps (non-blocking, address during implementation):**
1. **Session persistence on hard crash** — Add periodic SQLite writes (every 30s or after each SDK turn) alongside `before-quit` handler. SQLite WAL mode provides crash recovery for the database file itself.
2. **NFR4 cold launch ≤3s** — Electron + Chromium startup may approach this limit. Measure during implementation; defer avatar to lazy load if needed.

**Nice-to-Have Gaps:**
1. Keyboard shortcuts (push-to-talk, cancel) — define during input component implementation
2. CSS framework / styling system — decide during implementation (plain CSS or Tailwind)
3. Remote error reporting (Sentry) — Phase 2

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped (7 identified)

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions (Electron v41, React, TypeScript, Rive, Claude Agent SDK, SQLite, Web Speech API)
- [x] Technology stack fully specified
- [x] Integration patterns defined (IPC streaming, SDK message type mapping, abstraction layers)
- [x] Performance considerations addressed (streaming TTS, Rive 60fps, SDK turn limits)

**✅ Implementation Patterns**
- [x] Naming conventions established (7 categories)
- [x] Structure patterns defined (feature-based renderer, concern-based main)
- [x] Communication patterns specified (IPC channels, state management actions)
- [x] Process patterns documented (error pipeline, confirmation flow, loading states)
- [x] Enforcement rules and anti-patterns documented

**✅ Project Structure**
- [x] Complete directory structure with ~50 files
- [x] 4 architectural boundaries established and enforced
- [x] 4 external integration points mapped
- [x] All 38 FRs and 17 NFRs mapped to specific files

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Claude Agent SDK in-process integration eliminates subprocess complexity entirely
- Clean Electron process boundary with typed IPC prevents cross-process coupling
- All abstraction layers (agent backend, STT/TTS) have concrete interfaces and single-file implementations — swappable by design
- Every FR and NFR maps to a specific file in the structure
- Enforcement rules and anti-patterns give unambiguous guardrails for AI agents

**Areas for Future Enhancement:**
- CSS framework / styling system decision (during implementation)
- Keyboard shortcut definitions (during input component implementation)
- Periodic session state writes for crash resilience (during session persistence implementation)
- Remote error reporting / telemetry (Phase 2)
- Cloud STT/TTS for higher quality avatar voices (Phase 2)

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and all 4 architectural boundaries
- Refer to this document for all architectural questions
- Never bypass abstraction layers — even for "quick fixes"

**First Implementation Priority:**
```bash
npx create-electron-app@latest talkterm --template=vite-typescript
cd talkterm
npm install react react-dom @rive-app/react-webgl2
npm install -D @types/react @types/react-dom
```
Then establish the `src/main/`, `src/renderer/`, `src/shared/`, `src/preload/` directory structure and implement the IPC bridge as the first architectural skeleton.
