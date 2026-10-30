---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
---

# TalkTerm - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for TalkTerm, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: User can select an avatar persona from an available roster
FR2: Avatar renders as an animated 2D character on screen with smooth motion (no static images)
FR3: Avatar displays distinct animation states for each conversational mode: listening, thinking, and speaking
FR4: Avatar speaks responses aloud using synthesized voice output
FR5: Each avatar persona has a unique character name, visual design, and assigned voice — no two personas share the same combination of these attributes
FR6: User can speak to the avatar using device microphone
FR7: System begins transcribing user speech within 500ms of silence detection; transcription completes within 1 second for utterances under 15 seconds
FR8: User can input text as a full-featured alternative to voice — all workflow interactions available via text input; the text input field must support paste (Ctrl/Cmd+V), multi-line entry (Shift+Enter for newlines), and be visually co-equal with the voice input button — not a secondary or diminished input mode
FR9: System displays a distinct visual indicator (e.g., animated microphone icon) while actively capturing voice input
FR10: User can initiate an agent workflow through natural language conversation
FR11: System translates user intent into AI agent backend actions and executes them on the user's behalf
FR12: System executes multi-step agent workflows (e.g., BMAD brainstorming, PRD creation)
FR13: Agent can read, create, and modify files on behalf of the user
FR14: Agent can invoke tools and integrations via MCP
FR15: System maintains conversation context throughout a workflow session
FR16: User can provide input documents (PDF, TXT, DOCX files) to the agent for use in workflow processing, via system file dialog or drag-and-drop
FR17: System provides visual feedback while the agent is working (avatar animation, progress indication)
FR18: System presents agent options and decisions as graphical overlay cards
FR19: User can select options by clicking overlay cards or speaking a choice
FR20: System presents a confirmation prompt before any agent action that creates, modifies, or deletes files, invokes external APIs, or performs any operation that is not reversible
FR21: User can approve, modify, or reject a proposed agent plan; the modified plan is re-presented for confirmation before execution
FR22: System hides agent intermediate thinking and only surfaces final results and decision points
FR23: System generates structured output documents from completed workflows
FR24: User can view completed output artifacts within the app
FR25: User can access output files on the local file system
FR26: Avatar verbally summarizes completed workflow output in 2–4 sentences before transitioning to the output display overlay
FR27: System logs all agent actions with timestamp, action type, and outcome
FR28: User can view a history of agent actions performed in a session
FR29: System maintains an audit trail recording: timestamp, action type, outcome, and the user intent or workflow step that triggered each action
FR30: User can start a new workflow session
FR31: User can resume an incomplete workflow session based on an agent-provided list of resumable sessions
FR32: Session state is persisted to durable local storage on application close, crash, or unexpected termination
FR33: Avatar greets returning users by name (from local profile) and offers to continue the most recent incomplete session or start a new one
FR34: System communicates errors through avatar conversation using non-technical language; error messages must not contain stack traces, error codes, agent internal logs, or raw API error text
FR35: When an error occurs, system presents 2–3 concrete recovery options via overlay within the same conversational turn as the error message
FR36: System identifies and persists a user profile locally on the user's machine (no account or login required for MVP); profile stores: user name, avatar preference, and session history references
FR37: When the user speaks during avatar audio playback, system stops playback and captures the new user input (barge-in support)
FR38: When network connectivity is lost mid-session, system pauses the active workflow, displays a connectivity error via text overlay, and resumes the session automatically when connectivity is restored without requiring the user to restart
FR39: On every launch, TalkTerm must verify that the application is running with administrator/elevated privileges (macOS: root or admin group; Windows: Run as Administrator). If the app is not running as admin, it must display a blocking error screen with platform-specific relaunch instructions. The app must not proceed past this check until admin privileges are confirmed.
FR40: System must provide a guided API key entry experience that: (a) accepts an Anthropic API key via a single text input field, (b) validates the key against the Anthropic API before accepting it, (c) stores the validated key securely in the OS credential store via safeStorage, (d) displays inline validation feedback (success or specific error reason), and (e) provides a help link explaining how to obtain an API key
FR41: System must detect and handle three API key states on every launch: (a) no key stored — route to API key entry, (b) key stored and valid — proceed to next setup step, (c) key stored but expired/revoked — route to API key entry with a clear message explaining the key is no longer valid and must be replaced
FR42: On every launch, after the admin privilege check passes, the system must simultaneously assess the combined state of API key validity, user profile completeness, avatar selection, and workspace selection to determine the correct entry point. The system must not check these states sequentially — all four are evaluated together to route the user directly to the first incomplete step
FR43: During multi-step agent workflows, the system must display a live task progress view showing each workflow step with status (pending/in-progress/completed/failed), a visual progress indicator, elapsed time per step, and live counters for workflow-specific metrics; progress updates must be driven by the SDK message stream in real time
FR44: Before executing a multi-step workflow, the system must present a plan preview showing numbered steps with descriptions, estimated scope, and approach summary; the plan must be presented as part of the confirm-plan pattern (FR20) with options to approve, modify, or choose a different approach; on approval, the plan preview must transition to the task progress view automatically
FR45: The output display panel must support multiple display modes that auto-select based on content type: task progress (live workflow tracking), plan preview (proposed approach), document (rendered markdown), comparison table (scored matrix with color coding and expandable rows), clustered cards (categorized ideas with expandable groups), and activity feed (streaming agent action log, hidden by default)
FR46: System must persist conversation context, user decisions, project vocabulary, and workflow outcomes across sessions using Claude Agent SDK session persistence; on session resume, the avatar must have access to the full history of prior sessions for the active workspace
FR47: Avatar must reference past work naturally in conversation when contextually relevant, without requiring the user to remind it of prior decisions or context
FR48: After a workflow produces an output artifact, the system must present a "Send to..." option alongside the local file save option, allowing the user to write the artifact back to a connected external system via MCP tool integrations
FR49: The writeback flow must present the user with: (a) a list of available connected systems detected via MCP, (b) a target location picker appropriate to the selected system, and (c) a preview of the content that will be written before confirmation
FR50: Writeback actions must follow the confirm-plan pattern (FR20) — the user must approve the target system, location, and content before execution; the avatar must verbally describe what will be written and where before presenting the confirmation overlay
FR51: System must track user interaction patterns and persist them across sessions using context-scribe as the preference memory engine. Learned preferences must be surfaced as prioritized defaults or pre-selected options. Preferences must be scoped per agent type and per workspace. The user must be able to override any learned preference at any time.
FR52: After avatar selection and before the first conversation, the system must present a workspace selection screen offering two paths: (a) the user selects a local project folder or provides a Git repository URL to clone, or (b) the user skips workspace selection, in which case the system silently clones the BMAD-method repository as the default workspace
FR53: When the user skips workspace selection, the BMAD-method repo clone must happen silently in the background with no user-visible progress or confirmation — the avatar proceeds directly to the greeting
FR54: The writeback method presented at workflow completion must be contextual based on how the session originated: (a) ADO work item → default to ADO writeback; (b) Git repo workspace → default to commit + PR; (c) local files/BMAD defaults → default to local file save. All three paths remain available as alternatives.
FR55: When the user selects "Open Pull Request" (repo context), the system must: create a feature branch, commit the artifact, push the branch, and create a pull request with title and description summarizing the workflow output
FR56: When the user selects writeback to Azure DevOps (ADO context), the system must: identify the originating work item, present the target pre-filled, show a preview formatted for ADO, and write back via MCP

### NonFunctional Requirements

NFR1a: Avatar input acknowledgement (animation state change to "listening") must occur within 1 second of speech completion for 95th percentile of interactions
NFR1b: First spoken response segment must begin within 3 seconds of speech completion for standard conversational turns (non-tool-call responses), achieved via streaming TTS, for 95th percentile of interactions
NFR1c: Long-running agent steps (multi-tool-call sequences) must show continuous progress animation with no response-time SLA — user is never shown a blank or frozen state
NFR2: Avatar animation must render at minimum 30fps on desktop systems with a GPU manufactured within the last 5 years
NFR3: Speech-to-text transcription must begin processing within 500ms of user finishing speech
NFR4: App launch to avatar-ready state must complete within 3 seconds on supported desktop systems
NFR5: Agent workflow progress feedback must appear within 1 second of user input confirmation
NFR6: Agent backend API keys must be stored in the OS credential store (macOS Keychain / Windows Credential Manager / Linux Secret Service via libsecret); must never be stored in plaintext, exposed in client-side code, or included in logs
NFR7: Raw voice audio must not be stored beyond the active transcription session unless user explicitly opts in
NFR8: File system access must be scoped to user-approved directories only
NFR9: All communication with agent backends and third-party services must use TLS 1.2 or higher
NFR10: Text input must be a full-featured alternative to voice — no voice-only functionality
NFR11: Overlay cards must meet minimum click target sizes of 32x32px and provide clear hover/focus states for keyboard and mouse interaction
NFR12: Avatar speech must be accompanied by on-screen text captions
NFR13: AI agent backend integration must retry failed requests up to 3 times with exponential backoff; must surface a user-facing error via FR34 after 10 seconds of unresponsiveness; rate limit responses must trigger a "service busy" avatar message
NFR15: MCP tool integrations must follow the MCP protocol specification
NFR16: Conversation transcripts transmitted to the AI agent backend are not persisted by TalkTerm beyond the active session; the AI backend's data handling policy must be disclosed to the user before first use

### Additional Requirements

- Starter template: Electron Forge + Vite + TypeScript — project initialization via `npx create-electron-app@latest talkterm --template=vite-typescript` should be Epic 1 Story 1
- Post-init setup: add React, React DOM, Rive (`@rive-app/react-webgl2`), and TypeScript React types
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) runs in-process in Electron's Node.js main process — no CLI subprocess needed
- Agent backend abstraction layer interface (`AgentBackend`) must be defined before SDK integration — renderer never imports SDK directly
- STT/TTS abstraction layer interfaces (`SpeechToText`, `TextToSpeech`) must be defined — MVP uses Web Speech API, cloud services are Phase 2 drop-in replacements
- IPC streaming pattern: event-based via Electron IPC (`contextBridge` + `ipcMain`/`ipcRenderer`) for agent message streaming
- Data architecture: hybrid JSON (`electron-store`) for config/profile + SQLite (`better-sqlite3`) for sessions/audit
- API key security: Electron `safeStorage` encryption backed by OS credential store
- Admin privilege check in main process before any other operation (macOS: `process.getuid()`, Windows: `is-elevated`)
- Project structure: `src/main/` (agent, storage, security, ipc), `src/renderer/` (components, hooks, context, speech), `src/shared/types/`, `src/preload/`
- Process boundary enforcement: main never imports from renderer, renderer never imports from main, shared types only in `src/shared/`
- Error handling pipeline: all errors classified → wrapped as `AgentError` → sent via IPC → avatar speaks `userMessage` → overlay shows recovery options. No raw errors in UI ever.
- Agent action confirmation flow: SDK tool calls checked for destructive actions → IPC `agent:confirm` → avatar explains → overlay approve/modify/reject → response forwarded to SDK permission callback
- CI/CD: GitHub Actions for build, test, package, publish on all platforms
- Packaging: Electron Forge makers — `.dmg` (macOS), `.exe`/NSIS (Windows), `.deb`/`.rpm` (Linux)
- Auto-update: Electron Forge publisher to GitHub Releases + `electron-updater`
- Implementation sequence from Architecture: (1) project init, (2) admin check, (3) API key + launch state, (4) agent abstraction + SDK, (5) IPC bridge, (6) avatar + Rive, (7) voice pipeline, (8) three-zone layout, (9) rich display modes, (10) session management, (11) audit logging, (12) packaging
- Naming conventions: camelCase (vars/functions), PascalCase (types/interfaces/React components), UPPER_SNAKE_CASE (constants/enums), kebab-case (general source files), PascalCase (React component files), `namespace:verb` (IPC channels), snake_case (SQLite tables/columns)
- State management: React Context + `useReducer` — no Redux/Zustand. Action names follow `domain:verb` pattern.
- Co-located tests with `.test.ts` suffix next to source files
- No barrel files (`index.ts` re-exports) — import directly from source files
- SDK session continuity via session IDs stored in SQLite for resume (FR31)
- Cross-session memory: lightweight memory index in SQLite (key decisions, project vocabulary, user preferences) for fast avatar greeting personalization

### UX Design Requirements

UX-DR1: Three-zone layout system — Left Panel (240px, action options), Center Stage (avatar + input, always visible), Right Panel (380px, output/detail viewer) with four adaptive layout states: conversation (center only), decision point (center + left), output review (center + left + right), output only (center + right). Minimum window size 800x600px. Responsive behavior: panels overlay on narrow windows, center stage minimum 400px.
UX-DR2: ActionCard component — labeled option cards (A, B, C or 1, 2, 3) for left panel decision points. Anatomy: label badge (Primary accent), title (15px Semi-bold), description (13px). States: default (#E0E0E0 border), hover (#EB8C00 border + translateY(-2px)), selected (#EB8C00 + outer glow), disabled (50% opacity). Interaction: click, voice (speak label), or type label. Accessibility: `role="option"`, `aria-label`, keyboard arrow navigation + Enter/Space.
UX-DR3: ActionPanel (Left Panel container) — 240px fixed width, slides from left (200ms ease-out), vertical card stack with 12px gap, panel header shows context ("Choose an approach"), scrollable if cards exceed viewport. Hidden during avatar working state, visible at decision points.
UX-DR4: OutputPanel (Right Panel container) — 380px fixed width, slides from right (200ms ease-out), scrollable, dismissible via close button or voice. Display mode auto-selected based on content type via `useDisplayMode` hook. Avatar announces content verbally before panel appears.
UX-DR5: CaptionBar component — centered below avatar, semi-transparent dark background (rgba(0,0,0,0.6)), backdrop-filter blur, rounded 8px, max-width 500px, 14px Inter #F0F0F0. Text appears synced with TTS, fades out 3 seconds after speech ends.
UX-DR6: StatusIndicator component — compact pill below caption bar. States: listening (pulsing dot + "Listening", Primary), thinking (pulsing dot + contextual text, Primary 60%), speaking (static dot, Primary Light), ready (hidden), error (static dot + "Connection issue", Danger).
UX-DR7: Design token system — PwC Flame color palette: Primary Tangerine (#EB8C00), Primary Light Yellow (#FFB600), Primary Dark Orange (#D04A02), Accent Rose (#DB536A), Danger Red (#E0301E). Stage Background #1A1A1A, Surface White #FFFFFF, Surface Elevated #F5F5F5, Surface Muted #2A2A2A. Semantic colors: Success #2E7D32, Warning #EB8C00, Error #E0301E, Info #1565C0. Typography: Inter font, type scale from Display 28px to Caption 12px. Spacing: 4px base unit. All implemented as Tailwind theme extensions.
UX-DR8: Panel transition animations — 200ms ease-out for panel slide, content fade-in 100ms after slide completes. Left panel slides from left edge, right panel slides from right edge, center stage width animates to accommodate. Panels always preceded by avatar verbal announcement.
UX-DR9: Text input design (co-equal with voice, FR8) — full-width field next to mic button, placeholder "Type, paste, or speak to [avatar name]...", Enter to send, Shift+Enter for newline, Ctrl/Cmd+V paste support, auto-expand up to 4 lines then scroll, focus border Primary accent, brief "Pasted" toast on paste. Typing just a letter/number selects corresponding ActionCard.
UX-DR10: Admin privilege check screen — center stage only, blocking (no dismiss/skip). Warning icon 48px Danger, title Display size, body Text Muted, platform-specific instruction box (Surface Muted background, monospace for terminal commands, only relevant platform shown). Retry button (Primary accent) + Quit button (Ghost).
UX-DR11: API key setup screen — center stage only, setup card (Surface Muted 80% opacity, 16px border-radius, 40px padding, max-width 420px). Single text input with placeholder `sk-ant-api03-...`, masked after entry. Six validation states (empty, typing, validating, valid, invalid format, invalid key, expired/revoked, network error) with specific border colors and messages. Help link opens Anthropic console. Continue button disabled until validated.
UX-DR12: Workspace selection screen — two paths: (a) browse local folder or paste Git URL, (b) skip with silent BMAD-method repo clone in background. Persisted across sessions. User can connect project later via conversation.
UX-DR13: Six rich display modes for OutputPanel — TaskProgress (live tree with status icons, progress bar, time tracking, live counters), PlanPreview (numbered steps with scope/approach, integrates confirm-plan), Document (rendered markdown), ComparisonTable (scored matrix with color-coded bars, expandable rows), ClusteredCards (expandable category groups with count badges and priority tags), ActivityFeed (streaming agent action log, hidden by default).
UX-DR14: Preference memory UX (FR51) — "Your usual" badge (Primary Light pill) on preferred ActionCard, pre-selected border state, avatar verbal cue referencing preference. Adaptation after 3 consistent choices, 2 consecutive different choices to shift. Per-agent-type scoping. No explicit settings screen — learns silently. "Forget my preferences" voice command to reset.
UX-DR15: Contextual writeback confirm cards (FR54-56) — ADO context: pre-filled source work item, "Update Work Item" primary button; Repo context: file path + auto-generated commit message, "Open Pull Request" primary; Local context: file path + size, "Save to File" primary. All three paths always available as alternatives.
UX-DR16: Accessibility compliance — WCAG AA contrast ratios verified (text on light 16.75:1, text on dark 15.3:1, Primary on dark 5.2:1, caption on dark 5.4:1). 32x32px minimum click targets (NFR11). Focus states with 2px Primary accent border. Keyboard navigation for all overlay cards. Color independence: no info by color alone, semantic colors paired with shape indicators (checkmark, X, triangle).
UX-DR17: Empty states — avatar-driven guidance for first-time views (no sessions, no output, no workspace). Avatar speaks contextual guidance rather than showing static empty state screens.
UX-DR18: Conversational error recovery pattern — avatar explains error calmly, left panel shows 2-3 recovery ActionCards. No error dialogs, no red banners, no technical details. Partial completion celebrated ("working with what we have").

### FR Coverage Map

FR1: Epic 3 - Avatar persona selection from roster
FR2: Epic 3 - Animated 2D avatar rendering
FR3: Epic 3 - Avatar animation states (listening, thinking, speaking)
FR4: Epic 3 - Avatar voice output via TTS
FR5: Epic 3 - Unique persona identity (name, visual, voice)
FR6: Epic 3 - Voice input via microphone
FR7: Epic 3 - Speech transcription within latency targets
FR8: Epic 3 - Text input as co-equal alternative to voice
FR9: Epic 3 - Visual recording indicator
FR10: Epic 4 - Initiate workflow via natural language
FR11: Epic 4 - Translate user intent to agent actions
FR12: Epic 6 - Multi-step agent workflow execution
FR13: Epic 4 - Agent file read/create/modify
FR14: Epic 4 - Agent MCP tool invocation
FR15: Epic 4 - Conversation context maintenance
FR16: Epic 6 - File upload via dialog or drag-and-drop
FR17: Epic 6 - Visual feedback during agent work
FR18: Epic 5 - Options as graphical overlay/action cards
FR19: Epic 5 - Selection by click or voice
FR20: Epic 5 - Confirmation prompt for destructive actions
FR21: Epic 5 - Approve/modify/reject agent plans
FR22: Epic 4 - Hide intermediate agent thinking
FR23: Epic 6 - Structured output document generation
FR24: Epic 6 - View output artifacts in-app
FR25: Epic 6 - Access output files on local filesystem
FR26: Epic 6 - Avatar verbal summary before output display
FR27: Epic 9 - Log all agent actions with timestamp/type/outcome
FR28: Epic 9 - View session action history
FR29: Epic 9 - Full audit trail with triggering intent
FR30: Epic 8 - Start new workflow session
FR31: Epic 8 - Resume incomplete session
FR32: Epic 8 - Durable session state persistence
FR33: Epic 8 - Avatar greets returning users with session offer
FR34: Epic 7 - Conversational error communication (non-technical)
FR35: Epic 7 - Recovery options via overlay on error
FR36: Epic 2 - Local user profile persistence
FR37: Epic 3 - Barge-in support (stop playback on user speech)
FR38: Epic 7 - Network loss pause and auto-recovery
FR39: Epic 1 - Admin privilege check on every launch
FR40: Epic 2 - Guided API key entry with live validation
FR41: Epic 2 - Three-state API key management
FR42: Epic 2 - Combined launch state assessment
FR43: Epic 6 - Live task progress display
FR44: Epic 5 - Plan preview with confirm-plan integration
FR45: Epic 6 - Multi-mode output display panel
FR46: Epic 8 - Cross-session memory persistence
FR47: Epic 8 - Natural memory references in conversation
FR48: Epic 11 - "Send to..." writeback option
FR49: Epic 11 - Writeback flow with system picker and preview
FR50: Epic 11 - Writeback follows confirm-plan pattern
FR51: Epic 10 - Preference memory via context-scribe
FR52: Epic 2 - Workspace selection screen
FR53: Epic 2 - Silent BMAD-method repo clone on skip
FR54: Epic 11 - Contextual writeback based on session origin
FR55: Epic 11 - Pull request flow for repo context
FR56: Epic 11 - ADO writeback flow
FR57: Epic 13 - Structured question detection and card stack presentation
FR58: Epic 13 - Question card anatomy with inputs, chips, and navigation
FR59: Epic 13 - Review overlay and aggregated response submission

## Epic List

### Epic 1: Project Foundation & First Launch Gate
Users can install TalkTerm and the app verifies it has the system access it needs to operate.
**FRs covered:** FR39
**NFRs addressed:** NFR4, NFR9
**UX-DRs:** UX-DR10
**Architecture:** Electron Forge + Vite + TS project init, admin privilege check, project structure, process boundaries

### Epic 2: API Key Setup & User Onboarding
Users can enter their API key, create a profile, select an avatar, and choose a workspace — completing all setup needed to start working.
**FRs covered:** FR36, FR40, FR41, FR42, FR52, FR53
**NFRs addressed:** NFR6
**UX-DRs:** UX-DR7 (design tokens/Tailwind), UX-DR11, UX-DR12

### Epic 3: Avatar Presence & Voice Interaction
Users can see their animated avatar companion and interact through voice and text — the avatar listens, thinks, speaks, and displays captions.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR37
**NFRs addressed:** NFR1a, NFR1b, NFR1c, NFR2, NFR3, NFR7, NFR10, NFR12
**UX-DRs:** UX-DR5, UX-DR6, UX-DR8, UX-DR9

### Epic 4: Agent Backbone & Conversation
Users can have a natural language conversation with the avatar that is backed by the Claude Agent SDK — the agent can execute actions, read/write files, and maintain context.
**FRs covered:** FR10, FR11, FR13, FR14, FR15, FR22
**NFRs addressed:** NFR8, NFR13, NFR15
**Architecture:** Agent backend abstraction layer, Claude SDK integration, IPC message bridge

### Epic 5: Decision Presentation & Workflow Interaction
Users can make decisions through a game-dialog overlay system — the avatar presents options as action cards in the left panel, and users can select by click, voice, or text.
**FRs covered:** FR18, FR19, FR20, FR21, FR44
**NFRs addressed:** NFR5, NFR11
**UX-DRs:** UX-DR1 (three-zone layout), UX-DR2, UX-DR3, UX-DR4

### Epic 6: Workflow Execution & Rich Output
Users can run complete multi-step agent workflows (starting with BMAD brainstorming), see live progress, and review structured output artifacts in the right panel.
**FRs covered:** FR12, FR16, FR17, FR23, FR24, FR25, FR26, FR43, FR45
**UX-DRs:** UX-DR13 (all six display modes)

### Epic 7: Error Handling & Network Recovery
Users experience graceful error recovery through conversational avatar interaction — errors are never technical, always have clear recovery options, and network issues auto-recover.
**FRs covered:** FR34, FR35, FR38
**UX-DRs:** UX-DR17, UX-DR18

### Epic 8: Session Management & Cross-Session Memory
Users can start new sessions, resume incomplete ones, and the avatar remembers past work — providing continuity and the "colleague who remembers" experience.
**FRs covered:** FR30, FR31, FR32, FR33, FR46, FR47
**NFRs addressed:** NFR16
**UX-DRs:** UX-DR16 (accessibility)

### Epic 9: Traceability & Audit Logging
Users can view a complete history of what the agent did, when, and why — providing accountability and confidence in agent actions.
**FRs covered:** FR27, FR28, FR29

### Epic 10: Preference Memory & Personalized Experience
Users experience an increasingly personalized assistant — the system learns preferred techniques, destinations, and workflow patterns, surfacing them as smart defaults.
**FRs covered:** FR51
**UX-DRs:** UX-DR14

### Epic 11: External System Writeback & Contextual Save
Users can push workflow outputs to connected external systems (Azure DevOps, GitHub PRs) with context-aware defaults, alongside local file save.
**FRs covered:** FR48, FR49, FR50, FR54, FR55, FR56
**UX-DRs:** UX-DR15

### Epic 12: Packaging, Distribution & Auto-Update
Users can download, install, and auto-update TalkTerm on macOS and Windows through standard distribution channels.
**Architecture:** CI/CD, Electron Forge makers, code signing, auto-update, GitHub Releases + Homebrew/winget

### Epic 13: Structured Question Input
Users receive agent multi-question responses as interactive Question Card Stacks instead of a wall of text — enabling focused per-question input with suggestion chips, non-linear navigation, review-before-submit, and voice-guided mode.
**FRs covered:** FR57, FR58, FR59
**NFRs addressed:** NFR10, NFR11
**UX-DRs:** UX-DR1, UX-DR4, UX-DR9
**Architecture:** Renderer-side question parser in `shared/types/domain/`, `QuestionCardStack` component in `renderer/components/session/`, integration with existing `sendAgentMessage` IPC channel

---

## Epic 1: Project Foundation & First Launch Gate

Users can install TalkTerm and the app verifies it has the system access it needs to operate. This epic establishes the Electron project skeleton, enforces the architectural boundaries defined in the architecture doc, and implements the admin privilege pre-gate that blocks all other functionality until system access is confirmed.

### Story 1.1: Initialize Electron Forge Project with React and Rive

As a developer,
I want the TalkTerm Electron project initialized with the correct starter template, React, Rive, and TypeScript configuration,
So that all future development has a consistent, working foundation aligned with the architecture doc.

**Acceptance Criteria:**

**Given** a clean project directory
**When** the Electron Forge project is initialized with the vite-typescript template
**Then** the project compiles and launches an empty Electron window
**And** React, React DOM, `@rive-app/react-webgl2`, and TypeScript React types are installed
**And** `tsconfig.json` includes `"jsx": "react-jsx"` in compiler options
**And** the `src/` directory structure matches the architecture doc: `main/`, `renderer/`, `shared/types/`, `preload/`
**And** sub-directories exist: `main/agent/`, `main/storage/`, `main/security/`, `main/ipc/`, `renderer/components/`, `renderer/hooks/`, `renderer/context/`, `renderer/speech/`, `renderer/types/`, `renderer/styles/`
**And** `forge.config.ts` is configured with makers for `.dmg` (macOS) and `.exe`/NSIS (Windows)
**And** Tailwind CSS is installed and configured in the Vite renderer build pipeline with PostCSS
**And** a basic `global.css` exists with Tailwind directives

### Story 1.2: Implement Admin Privilege Check with Blocking Error Screen

As a TalkTerm user launching the app,
I want the app to verify it has administrator privileges before starting,
So that the Claude Agent SDK can access the file system, run shell commands, and use MCP tools without permission failures mid-workflow.

**Acceptance Criteria:**

**Given** the app is launched on macOS with admin privileges
**When** the main process runs the admin privilege check
**Then** the check passes silently with no UI shown and the app proceeds to the next initialization step

**Given** the app is launched on macOS without admin privileges
**When** the main process runs the admin privilege check
**Then** a blocking error screen is displayed in center stage with the warning icon (48px, #E0301E), title "TalkTerm needs admin privileges", and macOS-specific relaunch instructions
**And** a Retry button (Primary accent #EB8C00) and Quit button (Ghost style) are shown
**And** clicking Retry re-runs the admin check
**And** clicking Quit closes the application
**And** no other app functionality is accessible — no avatar, no setup, no conversation

**Given** the app is launched on Windows without elevated privileges
**When** the main process runs the admin privilege check
**Then** a blocking error screen is displayed with Windows-specific instructions ("Right-click TalkTerm → Run as administrator")
**And** only the platform-relevant instructions are shown (macOS instructions on macOS, Windows instructions on Windows)

**Given** the admin check screen is displayed
**When** the user relaunches with admin privileges and clicks Retry
**Then** the check passes and the app proceeds to initialization

---

## Epic 2: API Key Setup & User Onboarding

Users can enter their API key, create a profile, select an avatar, and choose a workspace — completing all setup needed to start their first conversation. This epic implements the complete first-run experience and the combined launch state assessment that routes returning users past completed steps.

### Story 2.1: Implement API Key Entry with Live Validation

As a new TalkTerm user,
I want to enter my Anthropic API key in a guided setup screen with live validation,
So that TalkTerm can connect to Claude and I know immediately if my key works.

**Acceptance Criteria:**

**Given** the admin check has passed and no API key is stored
**When** the API key setup screen is displayed
**Then** a centered setup card (Surface Muted #2A2A2A, 80% opacity, max-width 420px) shows with heading "Get Started", a description, a single text input with placeholder `sk-ant-api03-...`, a help link, and a Continue button

**Given** the user enters text in the API key field
**When** they submit or the field loses focus
**Then** the key is validated against the Anthropic API (not just format-checked)
**And** during validation, the Continue button shows "Validating..." and is disabled

**Given** the API key is valid
**When** validation succeeds
**Then** the key is encrypted via `safeStorage.encryptString()` and stored in the OS credential store
**And** the input border changes to Success (#2E7D32) with a checkmark and "Key verified" message
**And** the Continue button becomes enabled

**Given** the API key is invalid
**When** validation fails
**Then** an inline error message appears below the field with a specific reason ("That key didn't work — check for typos", "This key has been revoked — generate a new one", or "Can't reach the API — check your connection")
**And** the input border changes to the appropriate color (Danger or Warning)
**And** the key is not stored
**And** the Continue button remains disabled

**Given** the user has entered and validated a key
**When** they view the input field
**Then** the key is masked (shows `••••••••••••`) and never displayed in plaintext

**Given** the help link is visible
**When** the user clicks "How do I get an API key?"
**Then** the Anthropic console opens in the system browser

### Story 2.2: Implement User Profile Setup

As a new TalkTerm user,
I want to enter my name so the avatar can greet me personally,
So that the experience feels like working with a colleague who knows me.

**Acceptance Criteria:**

**Given** the API key is valid and no user profile exists
**When** the profile setup screen is displayed
**Then** a centered setup card shows with the prompt "What should I call you?" and a single name input field

**Given** the user enters their name and submits
**When** the profile is saved
**Then** the name is persisted to `electron-store` (JSON) as part of the local user profile (FR36)
**And** the profile includes: user name, avatar preference (initially empty), and session history references
**And** the app proceeds to the next incomplete setup step

### Story 2.3: Implement Avatar Selection Screen

As a new TalkTerm user,
I want to choose my avatar team member from a selection screen,
So that I feel a personal connection with my assistant from the start.

**Acceptance Criteria:**

**Given** the API key is valid and profile is complete but no avatar is selected
**When** the avatar selection screen is displayed
**Then** the screen shows "Choose your team member" with avatar card(s) showing preview

**Given** the user selects an avatar
**When** they confirm their choice
**Then** the avatar preference is saved to `electron-store`
**And** the app proceeds to the next incomplete setup step

**Given** only one avatar exists (MVP)
**When** the selection screen is shown
**Then** the single avatar is displayed with enough context to establish the "team" mental model (implies more members coming)

### Story 2.4: Implement Workspace Selection Screen

As a new TalkTerm user,
I want to optionally connect a project folder or skip to use BMAD defaults,
So that the agent has the right context for my workflows.

**Acceptance Criteria:**

**Given** the API key, profile, and avatar are all set up but no workspace is selected
**When** the workspace selection screen is displayed
**Then** two paths are offered: (a) browse for a local project folder or paste a Git repository URL, and (b) "Skip — use BMAD defaults"

**Given** the user selects a local project folder
**When** they confirm the selection
**Then** the workspace path is persisted across sessions
**And** the app proceeds to the avatar greeting

**Given** the user provides a Git repository URL
**When** they confirm
**Then** the repository is cloned to a local directory and set as the workspace
**And** the workspace path is persisted

**Given** the user selects "Skip"
**When** the skip action is triggered
**Then** the BMAD-method repository (github.com/bmadcode/BMAD-METHOD) is cloned silently in the background with no user-visible progress or confirmation
**And** the avatar proceeds directly to the greeting
**And** the BMAD-method clone serves as the default workspace

### Story 2.5: Implement Combined Launch State Assessment

As a returning TalkTerm user,
I want the app to skip any setup steps I've already completed and take me directly to where I need to be,
So that I'm never forced through setup screens I don't need.

**Acceptance Criteria:**

**Given** the admin check passes on any launch
**When** the system performs state assessment
**Then** it simultaneously reads four state values: API key validity (from OS credential store), profile completeness (from electron-store), avatar selection (from electron-store), and workspace selection
**And** it routes directly to the first incomplete step without sequential checking

**Given** the API key is stored but expired or revoked
**When** state assessment runs
**Then** the user is routed to the API key entry screen with the message "Your API key has expired or been revoked"

**Given** all four states are complete (key valid, profile complete, avatar selected, workspace selected)
**When** state assessment runs
**Then** the user goes directly to the avatar greeting in under 2 seconds (NFR4)

**Given** any setup step is completed
**When** the result is saved
**Then** it persists immediately so a crash mid-setup resumes from the last incomplete step on next launch

### Story 2.6: Implement Design Token System with Tailwind Theme

As a developer building TalkTerm UI components,
I want the design token system (colors, typography, spacing) configured as Tailwind theme extensions,
So that all future components use consistent styling aligned with the UX design specification.

**Acceptance Criteria:**

**Given** the Tailwind configuration file exists
**When** the design tokens are configured
**Then** the PwC Flame color palette is available: Primary Tangerine (#EB8C00), Primary Light (#FFB600), Primary Dark (#D04A02), Accent Rose (#DB536A), Danger Red (#E0301E)
**And** stage/surface colors are available: Stage Background (#1A1A1A), Surface (#FFFFFF), Surface Elevated (#F5F5F5), Surface Muted (#2A2A2A)
**And** semantic colors are available: Success (#2E7D32), Warning (#EB8C00), Error (#E0301E), Info (#1565C0)
**And** text colors are available: Primary (#1A1A1A), Secondary (#6B6B6B), On Dark (#F0F0F0), Muted on Dark (#A0A0A0)
**And** Inter font is configured as the primary typeface with the type scale (Display 28px through Caption 12px)
**And** the 4px base spacing unit is configured
**And** custom animation timing curves are defined for overlay transitions

---

## Epic 3: Avatar Presence & Voice Interaction

Users can see their animated avatar companion and interact through voice and text — the avatar listens, thinks, speaks, and displays captions. This epic delivers the core emotional experience: a face, a voice, and a conversation.

### Story 3.1: Implement Avatar Canvas with Rive State Machine

As a TalkTerm user,
I want to see an animated avatar character on screen that responds with smooth motion,
So that I feel like I'm interacting with a living companion, not a static interface.

**Acceptance Criteria:**

**Given** the app has completed setup and the avatar is loaded
**When** the avatar canvas renders
**Then** the Rive WebGL2 component (`<AvatarCanvas>`) displays the avatar centered in the upper portion of the center stage with the dark stage background (#1A1A1A)

**Given** the avatar is rendered
**When** the conversation state changes
**Then** the Rive state machine transitions between distinct animation states: ready, listening, thinking, and speaking
**And** transitions are smooth with no visible jumps
**And** the avatar renders at minimum 30fps on desktop systems with a GPU manufactured within the last 5 years (NFR2)

**Given** the `useAvatarState` hook is connected
**When** it receives state change signals
**Then** it maps to Rive state machine inputs: `setInputState("isListening", true/false)`, `setInputState("isThinking", true/false)`, `setInputState("isSpeaking", true/false)`

### Story 3.2: Implement Caption Bar and Status Indicator

As a TalkTerm user,
I want to see text captions of what the avatar says and know what state it's in,
So that I can follow along even without audio and always know what's happening.

**Acceptance Criteria:**

**Given** the avatar is speaking via TTS
**When** speech output is active
**Then** the CaptionBar displays the spoken text below the avatar, centered horizontally, with semi-transparent dark background (rgba(0,0,0,0.6)), backdrop-filter blur, rounded 8px, max-width 500px, 14px Inter #F0F0F0
**And** text appears synced with TTS playback (NFR12)

**Given** the avatar finishes speaking
**When** 3 seconds elapse after speech ends
**Then** the caption bar fades out

**Given** the avatar is in any active state
**When** the state is listening, thinking, or speaking
**Then** the StatusIndicator shows a compact pill below the caption bar with the appropriate visual: listening (pulsing dot, Primary), thinking (pulsing dot + contextual text like "Analyzing your ideas...", Primary 60%), speaking (static dot, Primary Light)

**Given** the avatar is in the ready state
**When** no active interaction is occurring
**Then** the StatusIndicator is hidden

### Story 3.3: Implement Voice Input with Speech-to-Text

As a TalkTerm user,
I want to speak to the avatar using my microphone,
So that I can interact naturally through conversation without typing.

**Acceptance Criteria:**

**Given** the STT abstraction interface (`SpeechToText`) is implemented
**When** the Web Speech API `SpeechRecognition` implementation is initialized
**Then** it conforms to the abstraction interface with `start()`, `stop()`, `onResult`, and `onError` callbacks

**Given** the user activates voice input (clicks mic button)
**When** the microphone begins capturing
**Then** a distinct visual indicator appears: the mic button (48px circle, Primary accent) pulses with a red ring
**And** the avatar transitions to the listening animation state
**And** the StatusIndicator shows "Listening..." (FR9)

**Given** the user finishes speaking
**When** 1.5 seconds of silence is detected
**Then** transcription begins within 500ms of silence detection (NFR3)
**And** transcription completes within 1 second for utterances under 15 seconds (FR7)
**And** the transcribed text is sent as user input to the agent

**Given** raw voice audio is captured
**When** transcription completes
**Then** the raw audio is not stored beyond the active transcription session (NFR7)

### Story 3.4: Implement Text Input as Co-Equal Alternative

As a TalkTerm user,
I want to type or paste text as a full alternative to voice,
So that I can interact effectively even when I can't or prefer not to speak.

**Acceptance Criteria:**

**Given** the input area at the bottom of center stage
**When** the text input is rendered
**Then** it displays as a full-width field next to the mic button with placeholder "Type, paste, or speak to [avatar name]..."
**And** it is visually co-equal with the voice input button — not secondary or diminished (FR8)

**Given** the user types in the text field
**When** they press Enter
**Then** the text is sent as user input to the agent

**Given** the user wants to enter multi-line content
**When** they press Shift+Enter
**Then** a newline is inserted and the field auto-expands (up to 4 visible lines, then scrolls)

**Given** the user pastes content
**When** they press Ctrl/Cmd+V
**Then** the pasted content appears in the field and a brief "Pasted" toast appears for 1 second

**Given** action cards are visible in the left panel
**When** the user types just a letter (A, B, C) or number (1, 2, 3) and presses Enter
**Then** the corresponding ActionCard is selected immediately

**Given** all workflow interactions
**When** compared between voice and text input modes
**Then** every workflow interaction available via voice is equally available via text (NFR10)

### Story 3.5: Implement Text-to-Speech with Avatar Voice Output

As a TalkTerm user,
I want the avatar to speak responses aloud,
So that the interaction feels like talking to a real colleague.

**Acceptance Criteria:**

**Given** the TTS abstraction interface (`TextToSpeech`) is implemented
**When** the Web Speech API `SpeechSynthesis` implementation is initialized
**Then** it conforms to the abstraction interface with `speak()`, `stop()`, and `onEnd` callbacks

**Given** the agent produces a text response
**When** TTS is triggered
**Then** the avatar transitions to the speaking animation state
**And** the response is spoken aloud using synthesized voice (FR4)
**And** the first spoken response segment begins within 3 seconds of speech completion for standard conversational turns via streaming TTS (NFR1b)
**And** captions appear synced with the speech

**Given** the avatar has a persona identity
**When** TTS speaks
**Then** the assigned voice is used — each persona has a unique character name, visual design, and assigned voice (FR5)

### Story 3.6: Implement Barge-In Support

As a TalkTerm user,
I want to interrupt the avatar while it's speaking by starting to talk,
So that the conversation feels natural and I don't have to wait for the avatar to finish.

**Acceptance Criteria:**

**Given** the avatar is currently speaking via TTS
**When** the user begins speaking (microphone detects voice input)
**Then** TTS playback stops immediately (FR37)
**And** the avatar transitions from speaking to listening state
**And** the user's new speech input is captured and transcribed
**And** the conversation continues with the user's new input

---

## Epic 4: Agent Backbone & Conversation

Users can have a natural language conversation with the avatar that is backed by the Claude Agent SDK — the agent can execute actions, read/write files, invoke MCP tools, and maintain context. This epic connects the avatar interface to real agent power.

### Story 4.1: Implement Agent Backend Abstraction Layer

As a developer,
I want a clean abstraction layer for the agent backend,
So that the Claude Agent SDK can be swapped for other backends without changing any renderer or UI code.

**Acceptance Criteria:**

**Given** the `AgentBackend` interface is defined in `src/main/agent/agent-backend.ts`
**When** any component needs agent communication
**Then** it uses only the interface: `startSession(config)`, `sendMessage(sessionId, message)`, `cancelCurrentAction()`, `resumeSession(sessionId)` — each returning `AsyncIterable<AgentEvent>`

**Given** the renderer process needs agent data
**When** it communicates with the agent
**Then** all communication flows through IPC channels (`agent:message`, `agent:action`, `agent:confirm`) — the renderer never imports the SDK directly

**Given** shared types are needed
**When** both processes need the same type definitions
**Then** they import from `src/shared/types/` only — the sole cross-process import path

### Story 4.2: Integrate Claude Agent SDK in Main Process

As a TalkTerm user,
I want to have natural language conversations that the Claude Agent SDK processes,
So that my requests are understood and acted upon by a capable AI agent.

**Acceptance Criteria:**

**Given** the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is installed
**When** a session is started
**Then** the SDK runs in-process in Electron's Node.js main process with the user's API key (decrypted from safeStorage)
**And** the SDK's `query()` returns an `AsyncGenerator<SDKMessage>` streaming typed messages

**Given** an SDK session is running
**When** the agent generates messages
**Then** each `SDKMessage` is forwarded to the renderer via `mainWindow.webContents.send("agent:message", message)`
**And** the renderer subscribes via `ipcRenderer.on("agent:message", handler)` through `contextBridge`

**Given** the SDK message stream is active
**When** different message types arrive
**Then** they drive the correct avatar state: `system` → ready, `assistant` text → speaking, `assistant` tool-calls → thinking, `result` success → summarizing, `result` error → error recovery

**Given** conversation context
**When** a session is active
**Then** the system maintains conversation context throughout the workflow session (FR15)
**And** intermediate agent thinking is hidden — only final results and decision points surface (FR22)

### Story 4.3: Implement IPC Message Bridge

As a developer,
I want a structured IPC message bridge between main and renderer processes,
So that agent messages stream reliably and user actions flow back correctly.

**Acceptance Criteria:**

**Given** the IPC bridge is implemented
**When** messages flow between processes
**Then** they follow the `IPCMessage<T>` envelope format with `channel`, `payload`, and `timestamp`
**And** channels follow the `namespace:verb` naming convention

**Given** the main process streams agent messages
**When** the renderer needs to consume them
**Then** channels are registered: `agent:message` (streaming), `agent:error` (classified errors), `session:updated` (state changes)

**Given** the renderer sends user actions
**When** the user interacts with the UI
**Then** actions flow via `ipcRenderer.invoke`: `agent:action` (message/approve/reject/cancel), `session:start`, `session:resume`, `settings:get`, `settings:set`

**Given** the user wants to cancel a running agent loop
**When** they trigger cancellation from the UI
**Then** the SDK's `query.cancel()` method is called via the IPC bridge

### Story 4.4: Enable Agent File Operations and MCP Tool Invocation

As a TalkTerm user,
I want the agent to read, create, and modify files and use connected tools on my behalf,
So that real work gets done through our conversation.

**Acceptance Criteria:**

**Given** a session is active with a workspace path
**When** the agent needs to access files
**Then** the SDK's built-in tools (Read, Edit, Write, Glob, Grep, Bash) operate within the workspace directory context (FR13)
**And** file system access is scoped to the workspace directory (NFR8)

**Given** MCP servers are configured in the workspace
**When** the agent needs to invoke external tools
**Then** the SDK's built-in MCP support invokes tools per the MCP protocol specification (FR14, NFR15)

**Given** the user initiates a workflow
**When** they speak or type their intent
**Then** the system translates intent into agent backend actions and executes them (FR10, FR11)

---

## Epic 5: Decision Presentation & Workflow Interaction

Users can make decisions through a game-dialog system — the avatar presents options as labeled action cards in the left panel, users select by click/voice/text, and destructive actions require confirmation. This epic delivers the three-zone layout and the interactive decision-making experience.

### Story 5.1: Implement Three-Zone Layout Shell

As a TalkTerm user,
I want the app to adapt its layout based on what's happening in my workflow,
So that I see options when I need to decide, output when it's ready, and just the avatar when we're talking.

**Acceptance Criteria:**

**Given** the three-zone layout is implemented
**When** the app renders
**Then** three zones exist: Left Panel (240px fixed), Center Stage (remaining width, min 400px), Right Panel (380px fixed)
**And** the minimum window size is 800x600px

**Given** no decisions or output are pending
**When** the conversation layout state is active
**Then** center stage takes full width with both panels hidden

**Given** the avatar presents choices
**When** the decision point layout state activates
**Then** the left panel slides in from the left (200ms ease-out) and center stage narrows

**Given** the agent produces output
**When** the output review layout state activates
**Then** the right panel slides in from the right (200ms ease-out)
**And** the avatar remains visible in center stage

**Given** the window is narrower than 1100px
**When** panels need to appear
**Then** panels overlay the stage rather than pushing it — the avatar always stays visible

### Story 5.2: Implement Action Cards and Action Panel

As a TalkTerm user,
I want to see clear, labeled options when the avatar asks me to make a decision,
So that I can quickly understand and select my choice.

**Acceptance Criteria:**

**Given** the avatar reaches a decision point
**When** the ActionPanel slides in
**Then** it displays ActionCards stacked vertically with 12px gap
**And** a panel header shows context ("Choose an approach" or "Next steps")
**And** the panel scrolls if cards exceed viewport height

**Given** an ActionCard is rendered
**When** it displays
**Then** it shows: label badge (A, B, C — Primary accent background, top-left), title (15px Semi-bold), and description (13px Secondary color)
**And** states render correctly: default (#E0E0E0 border), hover (#EB8C00 border + translateY(-2px) + shadow), selected (#EB8C00 + outer glow), disabled (50% opacity)

**Given** an ActionCard is interactive
**When** the user interacts
**Then** click, voice (speak the label letter/number), and text input (type the label) all trigger the same selection event
**And** accessibility is correct: `role="option"`, `aria-label` includes label + title + description, keyboard arrow navigation + Enter/Space selects
**And** click targets meet 32x32px minimum (NFR11)

### Story 5.3: Implement Confirm-Plan Pattern for Destructive Actions

As a TalkTerm user,
I want to review and approve any action that modifies files or calls external services,
So that I maintain control and trust over what the agent does on my behalf.

**Acceptance Criteria:**

**Given** the SDK yields an `assistant` message with tool calls
**When** the main process checks if the tool requires confirmation
**Then** destructive actions (file create/modify/delete, external API calls, irreversible operations) trigger the confirmation flow (FR20)

**Given** a confirmation is required
**When** the confirmation is sent via IPC `agent:confirm`
**Then** the avatar verbally describes the proposed action
**And** the left panel shows three ActionCards: Approve (Primary accent), Modify (Ghost with border), Cancel (Ghost muted text)

**Given** the user approves
**When** they select Approve
**Then** the approval is forwarded to the SDK permission callback and the action executes

**Given** the user modifies the plan
**When** they select Modify and provide changes
**Then** the modified plan is re-presented for confirmation before execution (FR21)

**Given** the user rejects
**When** they select Cancel
**Then** the action is not executed and the avatar offers alternatives

### Story 5.4: Implement Plan Preview Display Mode

As a TalkTerm user,
I want to see the agent's proposed approach before it starts working,
So that I can approve, modify, or choose a different approach.

**Acceptance Criteria:**

**Given** the agent proposes a multi-step workflow plan
**When** the plan preview is triggered
**Then** the right panel shows the Plan Preview display mode with numbered steps, descriptions, estimated scope, and approach summary (FR44)

**Given** the plan preview is displayed
**When** the left panel shows simultaneously
**Then** ActionCards offer: [A] Approve plan, [B] Modify, [C] Different approach

**Given** the user approves the plan
**When** they select Approve
**Then** the plan preview transitions automatically to the Task Progress display mode
**And** agent workflow progress feedback appears within 1 second of confirmation (NFR5)

---

## Epic 6: Workflow Execution & Rich Output

Users can run complete multi-step agent workflows (starting with BMAD brainstorming), see live progress, and review structured output artifacts in the right panel. This epic delivers the end-to-end workflow experience that proves TalkTerm's value.

### Story 6.1: Implement Multi-Step Workflow Execution

As a TalkTerm user,
I want to run complete multi-step agent workflows like BMAD brainstorming,
So that I can produce real output artifacts through conversation.

**Acceptance Criteria:**

**Given** the user describes their intent (e.g., "I need to brainstorm features for our onboarding flow")
**When** the agent interprets the request
**Then** it executes a multi-step workflow (FR12) — asking clarifying questions, guiding with expertise, and working through structured steps

**Given** the agent is actively working
**When** visual feedback is needed
**Then** the avatar shows the thinking animation state and the StatusIndicator displays contextual text (FR17, NFR1c)
**And** the user is never shown a blank or frozen state

**Given** the BMAD brainstorming workflow is available
**When** the user initiates a brainstorming session
**Then** the workflow runs end-to-end: technique selection → conversation → idea generation → organization → output document

### Story 6.2: Implement Task Progress Display Mode

As a TalkTerm user,
I want to see live progress during multi-step workflows,
So that I know what's happening and how far along we are.

**Acceptance Criteria:**

**Given** a multi-step workflow is executing
**When** the Task Progress display mode is active in the right panel
**Then** it shows: each workflow step with status icons (completed ✓ green, in-progress ● amber pulse, pending ○ muted), a visual progress bar (percentage based on completed/total), elapsed time per step, and live counters (e.g., "18 ideas generated") (FR43)

**Given** the SDK message stream produces updates
**When** a tool call completes or a step finishes
**Then** the progress view updates in real time

### Story 6.3: Implement Document Display Mode

As a TalkTerm user,
I want to view completed workflow outputs as rendered documents in the app,
So that I can review the result before deciding what to do with it.

**Acceptance Criteria:**

**Given** the agent produces a markdown output artifact
**When** the Document display mode activates in the right panel
**Then** the markdown is rendered with headings, lists, and expandable sections (FR24)
**And** the content is scrollable for long documents
**And** the avatar verbally summarizes the output in 2-4 sentences before the panel appears (FR26)

**Given** the output document is displayed
**When** the user reviews it
**Then** the file is also accessible on the local file system (FR25)
**And** the avatar remains visible in center stage during review

### Story 6.4: Implement Comparison Table Display Mode

As a TalkTerm user,
I want to see decision matrices as visual comparison tables,
So that I can evaluate options clearly and make informed decisions.

**Acceptance Criteria:**

**Given** the agent produces a scored decision matrix
**When** the Comparison Table display mode activates
**Then** a scored table renders with color-coded bars (green 4-5, amber 3, red 1-2), clickable rows that expand to show detailed analysis, and the winning approach highlighted with Primary accent border

**Given** the comparison table is visible
**When** the left panel shows simultaneously
**Then** approach selection cards appear so the user can review data and select simultaneously

### Story 6.5: Implement Clustered Cards Display Mode

As a TalkTerm user,
I want brainstorming output organized as expandable category groups,
So that I can explore ideas by theme.

**Acceptance Criteria:**

**Given** the agent produces categorized ideas (e.g., brainstorming output)
**When** the Clustered Cards display mode activates
**Then** expandable category groups render with idea cards inside, count badges per category, and priority tags on individual ideas

### Story 6.6: Implement Activity Feed Display Mode

As a technical TalkTerm user,
I want to optionally see a streaming log of what the agent is doing,
So that I can understand the agent's actions in detail when I want to.

**Acceptance Criteria:**

**Given** the Activity Feed display mode exists
**When** it is toggled on by user preference
**Then** it shows a streaming text log of agent actions in real time
**And** it is hidden by default — only visible when the user opts in

### Story 6.7: Implement Display Mode Auto-Selection

As a TalkTerm user,
I want the right panel to automatically show the right view for each type of content,
So that I never have to manually switch display modes.

**Acceptance Criteria:**

**Given** the `useDisplayMode` hook is implemented
**When** agent output content arrives
**Then** the display mode auto-selects based on content type: workflow status → Task Progress, proposed plan → Plan Preview, markdown → Document, scored matrix → Comparison Table, categorized ideas → Clustered Cards, action log → Activity Feed (FR45)

### Story 6.8: Implement File Upload via Dialog and Drag-and-Drop

As a TalkTerm user,
I want to provide input documents to the agent by browsing or dragging files,
So that the agent can use my existing documents in workflows.

**Acceptance Criteria:**

**Given** the user wants to provide input documents
**When** they use the system file dialog or drag-and-drop
**Then** PDF, TXT, and DOCX files are accepted and made available to the agent for workflow processing (FR16)

---

## Epic 7: Error Handling & Network Recovery

Users experience graceful error recovery through conversational avatar interaction — errors are never technical, always have clear recovery options, and network issues auto-recover.

### Story 7.1: Implement Error Classification and Avatar Error Pipeline

As a TalkTerm user,
I want errors explained to me in plain language with clear options,
So that I'm never confused or scared when something goes wrong.

**Acceptance Criteria:**

**Given** any error occurs (SDK, STT, TTS, file system, SQLite)
**When** the error is caught in the originating process
**Then** it is classified as recoverable or fatal
**And** wrapped as `AgentError { userMessage: string, options: RecoveryOption[] }`
**And** sent via IPC `agent:error`

**Given** the renderer receives an `agent:error`
**When** the error is displayed
**Then** the avatar speaks the `userMessage` in non-technical language (FR34)
**And** the left panel shows 2-3 concrete recovery options as ActionCards (FR35)
**And** no stack traces, error codes, agent internal logs, or raw API error text are ever shown

**Given** the AI agent backend is unresponsive
**When** 3 retries with exponential backoff fail within 10 seconds
**Then** a "service busy" avatar message appears with an estimated wait (NFR13)

### Story 7.2: Implement Network Loss Detection and Auto-Recovery

As a TalkTerm user,
I want the app to handle network issues automatically,
So that I don't have to restart my session when connectivity blips.

**Acceptance Criteria:**

**Given** the network connectivity is lost mid-session
**When** the loss is detected
**Then** the active workflow pauses
**And** the avatar displays a connectivity error via text overlay ("Connection issue" — StatusIndicator in Danger color)
**And** no agent actions are attempted during the outage

**Given** network connectivity is restored
**When** the system detects reconnection
**Then** the session resumes automatically without requiring the user to restart (FR38)
**And** the avatar acknowledges recovery: "We're back — picking up where we left off"

---

## Epic 8: Session Management & Cross-Session Memory

Users can start new sessions, resume incomplete ones, and the avatar remembers past work — providing continuity and the "colleague who remembers" experience.

### Story 8.1: Implement Session Persistence with SQLite

As a TalkTerm user,
I want my session state saved automatically,
So that I never lose my work even if the app crashes.

**Acceptance Criteria:**

**Given** an active session
**When** the application closes gracefully, crashes, or terminates unexpectedly
**Then** session state is persisted to SQLite via `better-sqlite3` (FR32)
**And** the session record includes: session ID (from SDK), workspace path, status, timestamps, avatar persona, and resume state

**Given** the SQLite database
**When** sessions are stored
**Then** tables use snake_case naming (`sessions`, `audit_entries`) with snake_case columns (`session_id`, `created_at`)

### Story 8.2: Implement Session Start and Resume Flow

As a returning TalkTerm user,
I want to resume where I left off or start fresh,
So that I have full continuity with my work.

**Acceptance Criteria:**

**Given** a returning user with one incomplete session
**When** the avatar greets them
**Then** it says "Welcome back, [name]! You left your [workflow name] mid-way. Want to pick up where we left off?" (FR33)
**And** the left panel shows: [A] Resume [session name] — pick up where you left off, [B] Start new — begin something different

**Given** a returning user with multiple incomplete sessions
**When** the avatar greets them
**Then** it lists sessions with timestamps in the left panel as ActionCards

**Given** a returning user with no incomplete sessions
**When** the avatar greets them
**Then** it says "Hey [name]! What are you working on today?" with center stage input active

**Given** the user selects resume
**When** the session is restored
**Then** the SDK session is resumed via the stored session ID (FR31)
**And** the layout is restored to its last active state (panels visible if they were open)
**And** the avatar provides a verbal summary of where things left off

**Given** the user starts a new session
**When** they select "Start new"
**Then** a fresh session begins with center stage input active (FR30)

### Story 8.3: Implement Cross-Session Memory

As a TalkTerm user,
I want the avatar to remember our past work together,
So that it feels like a colleague who knows my project history.

**Acceptance Criteria:**

**Given** multiple sessions have been completed in a workspace
**When** a new session starts in that workspace
**Then** the avatar has access to the full history of prior sessions via SDK session persistence (FR46)

**Given** past decisions are contextually relevant
**When** the avatar is conversing
**Then** it references past work naturally (e.g., "Last week you chose the incremental migration approach — want to check how that's going?") without the user needing to remind it (FR47)

**Given** cross-session memory is stored
**When** the lightweight memory index is accessed
**Then** key decisions, project vocabulary, and user preferences are available in SQLite for fast avatar greeting personalization without loading full session history

**Given** conversation transcripts
**When** they are handled
**Then** transcripts transmitted to the AI backend are not persisted by TalkTerm beyond the active session (NFR16)
**And** only structured memory summaries and decision metadata are stored — not full verbatim transcripts

### Story 8.4: Implement Accessibility Foundations

As a TalkTerm user with accessibility needs,
I want the app to be keyboard navigable and meet contrast standards,
So that I can use TalkTerm effectively regardless of ability.

**Acceptance Criteria:**

**Given** all interactive elements
**When** rendered
**Then** they meet WCAG AA contrast ratios: text on light 16.75:1, text on dark 15.3:1, Primary on dark 5.2:1, caption on dark 5.4:1

**Given** all clickable elements
**When** focused via keyboard
**Then** focus states show a 2px Primary accent (#EB8C00) border visible on both light and dark surfaces
**And** keyboard navigation is supported: Tab for focus movement, arrow keys within groups, Enter/Space to activate

**Given** status information
**When** conveyed visually
**Then** no information is communicated by color alone — success/error states include icons and text labels (checkmark ✓, X, triangle warning)

---

## Epic 9: Traceability & Audit Logging

Users can view a complete history of what the agent did, when, and why — providing accountability and confidence in agent actions.

### Story 9.1: Implement Audit Trail Logging

As a TalkTerm user,
I want all agent actions logged with full context,
So that I have a complete record of what was done on my behalf.

**Acceptance Criteria:**

**Given** the agent performs any action
**When** the action completes
**Then** an audit entry is written to SQLite with: auto-increment ID, session_id (FK), timestamp (ISO 8601), action_type (e.g., "tool:bash", "tool:edit", "user:approve"), outcome ("success"/"failure"/"cancelled"), user_intent (triggering workflow step or user message), and details (JSON blob) (FR27, FR29)

**Given** all agent interactions
**When** they occur during a session
**Then** every action is logged — logging is never skipped

### Story 9.2: Implement Session Action History Viewer

As a TalkTerm user,
I want to view a history of agent actions from my session,
So that I can review what happened and verify the agent's work.

**Acceptance Criteria:**

**Given** a session with logged actions
**When** the user requests to view action history
**Then** the AuditLog component displays a chronological list of agent actions with timestamps, action types, and outcomes (FR28)
**And** the list is scrollable and filterable

---

## Epic 10: Preference Memory & Personalized Experience

Users experience an increasingly personalized assistant — the system learns preferred techniques, destinations, and workflow patterns, surfacing them as smart defaults.

### Story 10.1: Integrate Context-Scribe for Preference Tracking

As a TalkTerm user,
I want the system to learn my preferences over time,
So that my usual choices appear as defaults and I work faster.

**Acceptance Criteria:**

**Given** context-scribe is integrated as the preference memory engine
**When** the user makes workflow choices
**Then** the system tracks: frequently chosen workflow options, preferred brainstorming techniques, default output destinations, avatar persona preferences, and workflow-specific settings (FR51)

**Given** preferences are tracked
**When** they are stored
**Then** they are scoped per agent type (e.g., Mary may have different defaults than Winston) and per workspace

**Given** the user overrides a learned preference
**When** they simply choose a different option
**Then** the system adapts without requiring a reset
**And** it takes 3 consistent choices to establish a preference and 2 consecutive different choices to shift it

### Story 10.2: Surface Learned Preferences in UI

As a returning TalkTerm user,
I want my preferred options highlighted automatically,
So that I can quickly confirm or change my usual choices.

**Acceptance Criteria:**

**Given** a learned preference exists for an option
**When** ActionCards are displayed at a decision point
**Then** the preferred card shows a "Your usual" badge (Primary Light #FFB600 pill with dark text)
**And** the preferred card has the selected border state (#EB8C00) by default

**Given** the avatar knows user preferences
**When** presenting options verbally
**Then** it references preferences naturally: "Last 3 times you went with Guided Questions — want that again?" — never robotic

**Given** the user says "forget my preferences" or "stop suggesting defaults"
**When** the command is processed
**Then** the preference store is cleared for that agent type and the avatar confirms

---

## Epic 11: External System Writeback & Contextual Save

Users can push workflow outputs to connected external systems (Azure DevOps, GitHub PRs) with context-aware defaults, alongside local file save.

### Story 11.1: Implement "Send To" Writeback Option

As a TalkTerm user,
I want to send my workflow output to a connected external system,
So that my work lands directly where my team uses it.

**Acceptance Criteria:**

**Given** a workflow produces an output artifact
**When** completion options are presented
**Then** a "Send to..." option appears alongside the local file save option (FR48)

**Given** the user selects "Send to..."
**When** connected systems are checked
**Then** the left panel shows available systems detected via MCP (e.g., Azure DevOps, GitHub) (FR49)

**Given** the user selects a target system
**When** the target picker appears in the right panel
**Then** it shows system-specific options (project/board/item type for ADO, repo/path for GitHub)
**And** a preview of the content formatted for the target system is shown before confirmation

**Given** the writeback is ready
**When** confirmation is presented
**Then** it follows the confirm-plan pattern (FR50) — the avatar verbally describes what will be written and where
**And** ActionCards offer: Approve & Send, Change target, Cancel

### Story 11.2: Implement Contextual Writeback Defaults

As a TalkTerm user,
I want the save method to default to the right destination based on how I started my session,
So that saving feels natural and context-aware.

**Acceptance Criteria:**

**Given** the session originated from an Azure DevOps work item
**When** the completion options are presented
**Then** "Update Work Item" is the primary/default option with the source work item pre-filled (FR54, FR56)
**And** "Open PR instead" and "Save locally" are available as alternatives

**Given** the session is working within a Git repo workspace
**When** the completion options are presented
**Then** "Open Pull Request" is the primary/default option (FR54)
**And** "Commit & Push" and "Save locally" are available as alternatives

**Given** the session uses local files or BMAD defaults
**When** the completion options are presented
**Then** "Save to File" is the primary/default option (FR54)
**And** "Send to..." routes to the writeback system picker

### Story 11.3: Implement Pull Request Flow

As a TalkTerm user working in a repo,
I want the agent to create a PR with my workflow output,
So that my work goes through the normal review process.

**Acceptance Criteria:**

**Given** the user selects "Open Pull Request"
**When** the PR flow executes
**Then** the system creates a feature branch with a descriptive name (e.g., `brainstorming/onboarding-features`), commits the artifact, pushes the branch, and creates a pull request with a generated title and description (FR55)
**And** the PR link is displayed in the right panel confirmation view

---

## Epic 12: Packaging, Distribution & Auto-Update

Users can download, install, and auto-update TalkTerm on macOS and Windows through standard distribution channels.

### Story 12.1: Configure CI/CD Pipeline with GitHub Actions

As a developer,
I want automated build, test, and packaging on every push and release,
So that releases are consistent and reliable.

**Acceptance Criteria:**

**Given** code is pushed or a PR is opened
**When** the CI workflow triggers
**Then** the app builds and tests run on macOS and Windows

**Given** a version tag is pushed
**When** the release workflow triggers
**Then** platform-specific packages are built: `.dmg` (macOS) and `.exe`/NSIS (Windows)
**And** code signing is applied (macOS notarization + Windows Authenticode)
**And** artifacts are published to GitHub Releases

### Story 12.2: Implement Auto-Update Mechanism

As a TalkTerm user,
I want the app to update itself when new versions are available,
So that I always have the latest features and fixes.

**Acceptance Criteria:**

**Given** the app launches
**When** it checks for updates
**Then** `electron-updater` checks GitHub Releases for new versions
**And** if an update is available, the user is notified and can install it

**Given** distribution channels are configured
**When** a release is published
**Then** Homebrew cask (macOS) and winget (Windows) formulas are updated or updatable

---

## Epic 13: Structured Question Input

Users receive agent multi-question responses as interactive Question Card Stacks instead of a wall of text — enabling focused per-question input with suggestion chips, non-linear navigation, review-before-submit, and voice-guided mode. This epic transforms one of the most common AI friction points (multi-question responses) into a guided, delightful interaction aligned with TalkTerm's "companion, not tool" principle.

### Story 13.1: Implement Question Parser and Detection

As a TalkTerm user,
I want the system to automatically detect when the agent asks multiple numbered questions,
So that I receive a structured input experience instead of a wall of text.

**Acceptance Criteria:**

**Given** the agent sends a `text` event containing two or more numbered questions (patterns: `1.`, `2.`, etc. with question marks or bold headers)
**When** the renderer processes the event
**Then** a `QuestionSet` is parsed containing: preamble text (any content before the first question), and an array of `Question` objects each with extracted title (from bold text or first sentence up to `?` or `—`), body text (full question including sub-items), and optional suggestion options (parsed from dash-lists, slash-separated, or comma-separated items)

**Given** the agent sends a `text` event with only one question or no numbered questions
**When** the renderer processes the event
**Then** the parser returns `null` and the standard caption + text input flow is used

**Given** the agent sends a mixed response with preamble text followed by numbered questions
**When** the parser extracts the `QuestionSet`
**Then** the preamble is preserved separately for the avatar to speak, and only the questions become cards

**Technical notes:**
- Parser lives in `src/shared/types/domain/question-parser.ts` (pure function, no dependencies)
- Returns `QuestionSet | null` — null means no structured questions detected
- `QuestionSet` type: `{ preamble: string; questions: Question[] }`
- `Question` type: `{ index: number; title: string; body: string; suggestions: string[] }`
- Detection threshold: minimum 2 numbered questions required to trigger card stack (FR57)

### Story 13.2: Implement Question Card Stack Component

As a TalkTerm user,
I want each agent question presented as its own interactive card with a dedicated input field,
So that I can focus on one question at a time and answer them clearly.

**Acceptance Criteria:**

**Given** a `QuestionSet` with N questions is detected
**When** the Question Card Stack renders in the right panel
**Then** the first question card is displayed with: progress indicator (`1 of N`), clickable dot navigation showing all question states, question title (H2 style), full question body, auto-expanding text area for the answer, and Next button

**Given** the question body contains enumerated options (dash-lists, slash-separated, or comma-separated)
**When** the card renders
**Then** suggestion chips appear below the question body as selectable pills (FR58)
**And** selecting a chip toggles it on/off and the selected chips are combined with any typed text as the answer

**Given** the user is on a question card
**When** they click a dot in the navigation
**Then** the card stack navigates to that question (non-linear navigation supported)

**Given** the user is on a question card
**When** they click Skip
**Then** the question is marked as skipped, the dot shows a dash indicator, and the next unanswered question is shown

**Given** dot navigation is displayed
**When** the user has answered some questions, skipped some, and left others untouched
**Then** dots show distinct states: current (Primary #EB8C00), answered (Success #2E7D32 with checkmark), skipped (dash, Text Muted), unanswered (hollow, Border #E0E0E0)

**Given** question cards with 10+ questions
**When** the dot navigation renders
**Then** it remains usable with scrollable or wrapped dot layout

**Technical notes:**
- Component: `src/renderer/components/session/QuestionCardStack.tsx`
- State: local `useState` for answer array (ephemeral form state, not `useReducer`)
- Suggestion chips component: `src/renderer/components/session/SuggestionChips.tsx`
- Cards follow existing design token system (UX-DR7)
- Input meets NFR10 (text as full alternative) and NFR11 (32x32px minimum targets)

### Story 13.3: Implement Review Overlay and Aggregated Submission

As a TalkTerm user,
I want to review all my answers before they are sent to the agent,
So that I can verify and edit responses before the agent acts on them.

**Acceptance Criteria:**

**Given** the user clicks "Submit All" on the last card or when all questions are answered
**When** the review overlay appears
**Then** it shows a compact list of all answers with: question number and title, the answer text (truncated with ellipsis if long), a skipped indicator for unanswered questions, and an edit icon (✎) for each answer

**Given** the review overlay is displayed
**When** the user clicks the edit icon on any answer
**Then** the card stack navigates back to that specific question card with the existing answer preserved

**Given** the user confirms submission from the review overlay
**When** they click "Send to [Avatar Name]"
**Then** all answers are aggregated into a single structured message in numbered list format matching the original question numbers, skipped questions are included as `(no answer provided)`, and the message is sent via `sendAgentMessage` (FR59)

**Given** the aggregated message is sent
**When** the agent receives it
**Then** the card stack is dismissed, the avatar enters thinking state, and normal conversation resumes

**Technical notes:**
- Review component: `src/renderer/components/session/QuestionReview.tsx`
- Aggregated message format: `1. [Title]: [Answer]\n2. [Title]: [Answer]\n...`
- Uses existing `sendAgentMessage` IPC channel — no new backend changes needed
- Avatar name passed as prop for the submit button label

### Story 13.4: Implement Voice-Guided Question Flow

As a TalkTerm user in voice/live mode,
I want the avatar to read each question aloud and capture my spoken answers,
So that I can complete the structured input entirely by voice.

**Acceptance Criteria:**

**Given** the user is in live/voice mode when a `QuestionSet` is detected
**When** the Question Card Stack appears
**Then** the avatar speaks the first question aloud and enters listening state after speaking

**Given** the avatar has read a question aloud
**When** the user speaks their answer
**Then** the STT transcription fills the current card's answer field
**And** after a brief pause (silence detection), the avatar auto-advances to the next question and reads it aloud

**Given** all questions have been answered via voice
**When** the avatar finishes the last question
**Then** the avatar speaks: "I've got all [N]. Here's what I heard — take a look."
**And** the review overlay appears

**Given** the user is viewing the review overlay in voice mode
**When** they say "Looks good" or "Send"
**Then** the aggregated response is submitted

**Given** the user is in voice mode during the card stack
**When** they say "Next", "Skip", "Back", "Question [N]", or "Change [N]"
**Then** the card stack navigates accordingly (voice commands recognized per FR59)

**Technical notes:**
- Voice flow integrates with existing `WebSpeechStt` and `WebSpeechTts` from ConversationView
- Voice commands parsed via simple keyword matching in the STT result handler
- Auto-advance uses existing silence detection + a 1.5s delay before reading next question
- Falls back gracefully if STT is not available (cards still work via keyboard/mouse)

### Story 13.5: Integrate Question Card Stack into ConversationView

As a TalkTerm user,
I want the Question Card Stack to appear seamlessly within my conversation flow,
So that structured question input feels like a natural part of talking with my avatar.

**Acceptance Criteria:**

**Given** the agent sends a `text` event that the parser detects as containing structured questions
**When** ConversationView processes the event
**Then** the avatar speaks the preamble text (e.g., "Great concept! I have 5 questions to help me understand your vision.")
**And** the Question Card Stack slides into the right panel (using existing OutputPanel slide animation)
**And** the caption bar shows the preamble, not the full question text

**Given** the Question Card Stack is visible in the right panel
**When** the layout state transitions
**Then** center stage narrows to accommodate the right panel (consistent with existing three-zone behavior)
**And** the avatar remains visible in center stage

**Given** the user dismisses the card stack without submitting
**When** they close the right panel
**Then** a left panel ActionCard appears: "Answer [Avatar]'s questions" to reopen the card stack with answers preserved

**Given** the aggregated response has been sent
**When** the agent responds with a follow-up containing new structured questions
**Then** a new Question Card Stack replaces the previous one (previous answers already submitted)

**Given** network connectivity is lost while the card stack is open
**When** FR38 network recovery triggers
**Then** all typed answers are preserved locally and the card stack remains intact
**And** on reconnect, the user can continue answering and submit normally

**Technical notes:**
- Integration point: `ConversationView.tsx` — add parser call in the `text` event handler
- Conditional rendering: `QuestionCardStack` shown in right panel when `questionSet` state is non-null
- Layout state: reuses existing right panel visibility logic from OutputPanel
- Answer preservation: answers stored in component state, survive panel close/reopen within the same session
