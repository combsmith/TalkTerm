---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain-skipped', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-multi-agent-review-enhancement']
inputDocuments: ['_bmad-output/brainstorming/brainstorming-session-2026-03-20.md']
validationReport: '_bmad-output/planning-artifacts/prd-validation-report.md'
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 1
  projectDocs: 0
classification:
  projectType: desktop_app
  domain: general
  complexity: medium
  projectContext: greenfield
revisionHistory:
  - date: '2026-03-20'
    revision: 'v1.1 — Multi-agent review enhancement: fixed 15/20-min contradiction, added FR16 (file upload), FR36 (user identity), FR37 (barge-in), FR38 (network recovery); hardened 10 FR measurability specs; hardened 8 NFR measurement specs; decomposed latency NFR; added conversation privacy NFR16; removed implementation leakage (FR11, NFR13, NFR14); fixed store compliance gate; annotated Journey 2 Phase 2 references; added API key model; quantified business success metrics'
  - date: '2026-03-21'
    revision: 'v2.0 — Desktop pivot: changed from mobile-first to desktop-first architecture. Claude Code runs as local subprocess with full MCP/file system/network access. Replaced mobile platform requirements with desktop (macOS/Windows/Linux). Removed app store compliance gate. Updated all user journeys, FRs, and NFRs for desktop context. Mobile moved to Phase 3 as enhancement.'
  - date: '2026-03-22'
    revision: 'v2.1 — Added FR39 (admin privilege check on every launch), FR40 (guided API key setup with live validation), FR41 (API key state management), FR42 (combined launch state assessment), FR43 (live task progress display), FR44 (plan preview with confirm-plan integration), FR45 (multi-mode rich content rendering). Updated MVP scope to macOS + Windows. Added admin privilege requirement to platform requirements.'
  - date: '2026-03-23'
    revision: 'v2.2 — Strengthened FR8 (text input co-equal with voice). Added FR48-50 (external system writeback via MCP). Added FR51 (preference memory via context-scribe). Added FR52-53 (workspace selection). Added FR54 (contextual writeback: ADO→ADO, repo→PR, local→file based on session origin), FR55 (PR flow), FR56 (ADO writeback flow). Updated FR42 to include workspace in launch state assessment. Driven by UX review feedback.'
  - date: '2026-03-29'
    revision: 'v2.3 — Added FR57-FR59 (Structured Question Input): agent multi-question responses detected and presented as Question Card Stack with per-question input cards, suggestion chips, non-linear navigation, review overlay, and aggregated submission. Voice mode supports guided question-by-question flow. Driven by UX design review of agent question patterns.'
  - date: '2026-03-29'
    revision: 'v2.4 — Added FR60-FR62 (Native STT): replaced non-functional Web Speech API with sherpa-onnx local streaming speech recognition. Audio captured via getUserMedia in renderer, streamed as 16kHz PCM to main process via IPC, transcribed by sherpa-onnx OnlineRecognizer with Zipformer streaming model (~44 MB auto-download on first use). Driven by confirmed Electron Web Speech API limitation (network error: Google servers unreachable without Chrome API keys).'
---

# Product Requirements Document - TalkTerm

**Author:** Root
**Date:** 2026-03-20

## Executive Summary

TalkTerm is a desktop AI agent interface that makes the full power of CLI-based agentic workflows — tool execution, API calls, MCP integration, and system control — accessible to non-technical users through voice-enabled animated avatars. While tools like Claude Code and GitHub Copilot have proven that natural-language-driven agents can perform complex tasks autonomously, these tools remain locked behind terminal interfaces that exclude product managers, designers, analysts, and other knowledge workers. TalkTerm replaces the terminal with a personal, conversational companion that users select, speak to, and delegate work to — with zero learning curve. The Claude Agent SDK runs in-process, giving TalkTerm full access to the local file system, MCP tools, shell execution, and network services — without requiring Claude Code CLI to be installed.

The agent backend is commodity infrastructure. The relationship layer is the product. ChatGPT and Claude.ai can converse but cannot execute — they lack permissions to run tools, call APIs, use MCP, or control the user's system. CLI agents can execute but exclude anyone uncomfortable with a terminal. TalkTerm is the first product that combines real agent capability with an embodied, personal interface. Users pick an avatar, start talking, and get work done.

The interaction model follows game-dialog UX — the avatar speaks context, graphical overlays present actionable options, and the user never sees a command, a log, or raw output. Each agent type has a distinct avatar persona with its own look, voice, and personality, enabling natural context switching across different tasks. The underlying agents' thinking is hidden; only final results and clear decision points surface to the user. All agent actions are logged with full traceability — providing an audit trail of what was done, when, and why, giving users and teams confidence and accountability without exposing operational complexity in the UI.

## Success Criteria

### User Success

- A non-technical user completes a full agent workflow and produces a real output artifact (e.g., a brainstorming document, a PRD, a research report) without technical assistance
- Users interact with specialized agent avatars conversationally and receive structured, actionable outputs — not chat transcripts
- Non-technical coworkers can use TalkTerm independently without requiring guidance from technical team members
- First completed workflow achieved within 25 minutes of starting an agent interaction

### Business Success

- Daily usage by technical users as a replacement for some terminal-based agent interactions (target: ≥1 TalkTerm session/day for power users within 30 days of first use)
- Independent adoption by non-technical coworkers — measured by ability to complete workflows without help (target: ≥3 non-technical users completing workflows independently within 60 days of launch)
- Community adoption measured by: number of agent runs performed and total time spent in agent conversations (target: ≥100 agent runs in first month post-launch)
- BMAD community serves as initial distribution channel and feedback loop; secondary channel via direct outreach to non-technical coworkers of BMAD users

### Technical Success

- Avatar acknowledges user input within 1 second of speech completion (conversational responsiveness)
- First spoken response segment begins within 3 seconds for standard conversational turns (via streaming TTS)
- Voice input accurately captured and transcribed with intent intact for natural speech patterns
- Avatar renders smoothly on supported desktop systems without frame drops during standard conversation
- Full traceability logging of all agent actions with audit trail accessible in-session
- AI agent backend abstraction layer isolates UI from backend implementation — backend is swappable without UI changes

### Measurable Outcomes

| Metric | MVP Target |
|---|---|
| Time to first completed workflow | ≤ 25 minutes from first agent interaction |
| Non-technical user independence | Complete workflow without technical help |
| Daily active usage (power users) | ≥1 TalkTerm session/day within 30 days of first use |
| Agent runs in first month | ≥100 total runs post-launch |
| Total conversation time | Tracked as primary engagement metric |
| Input acknowledgement latency | ≤1 second from speech completion |
| First response segment latency | ≤3 seconds for conversational turns |

## User Journeys

### Journey 1: The Non-Technical PM — First Workflow

**Persona:** Sarah, Product Manager at a mid-size startup
**Situation:** Sarah manages a product roadmap but relies on her engineering lead to run any structured workflow — brainstorming, competitive analysis, sprint planning. She's heard about AI agents but every tool she's tried is either a chatbot that can't do anything or a terminal tool she can't use.

**Opening Scene:** Sarah installs TalkTerm on her MacBook. The app opens to a simple screen: "Choose your assistant." She sees a friendly animated character — Mary, the Business Analyst — and clicks her.

**Rising Action:** Mary greets her by voice: "Hi Sarah, I'm Mary. I specialize in research, brainstorming, and product analysis. What are you working on today?" Sarah says, "I need to brainstorm features for our new onboarding flow." Mary walks her through a structured brainstorming session — asking questions, presenting technique options as clickable overlay cards, building on Sarah's ideas. Sarah speaks naturally. Mary responds conversationally.

**Climax:** Twenty minutes in, Mary says: "We've generated 24 ideas across 4 categories. Here's the organized summary." A visual overlay shows clustered ideas with priority tags. Sarah clicks to expand each cluster. She says "This is exactly what I needed" — she's produced a structured brainstorming artifact without writing a single command or asking engineering for help.

**Resolution:** Sarah shares the output document with her team. She opens TalkTerm the next morning and Mary greets her: "Morning, Sarah. Want to continue developing those onboarding ideas, or start something new?" Sarah is a daily user.

### Journey 2: The Technical User — Terminal Replacement

**Persona:** Marcus, Full-Stack Developer
**Situation:** Marcus uses Claude Code daily in his terminal. He's productive, but some tasks — brainstorming with his PM, reviewing architecture options, sprint planning — feel clunky in a text-only interface. He also can't easily share agent sessions with non-technical teammates.

**Opening Scene:** Marcus opens TalkTerm on his laptop to try running a BMAD architecture session while waiting for a build. He picks the available avatar — a technical-focused persona.

**Rising Action:** Marcus says "I need to evaluate three approaches for our auth migration." The avatar presents a structured comparison framework via overlay cards. Marcus speaks his constraints — "We need OAuth2, can't break existing sessions, and have a two-week window." The avatar synthesizes options and presents trade-offs visually. The agent examines his project's codebase and existing auth configuration directly via the in-process Claude Agent SDK, with full access to the repo.

**Climax:** The avatar presents a decision matrix as a graphical overlay — three approaches scored across six criteria. Marcus clicks each to drill into details. He picks an approach and the avatar generates an architecture decision record, writing it directly to his project's docs folder.

**Resolution:** Marcus shares the architecture doc with Sarah (the PM) and his team. He starts using TalkTerm for structured agent workflows where the visual output is clearer than terminal text, while keeping his terminal for code-focused tasks.

*Scope notes: Named specialist avatars (e.g., Winston the Architect) are Phase 2 — this journey illustrates the architecture workflow interaction model, achievable with a single avatar in MVP.*

### Journey 3: The Non-Technical User — Error Recovery

**Persona:** Sarah, two weeks into using TalkTerm
**Situation:** Sarah is comfortable with TalkTerm. She asks Mary to generate a competitive analysis by pulling data from several documents she's uploaded.

**Opening Scene:** Sarah says "Analyze these three competitor PDFs and summarize their pricing models." Mary begins processing.

**Rising Action:** Mary encounters an issue — one PDF is image-based and can't be parsed. Instead of a stack trace or cryptic error, Mary says: "I was able to read two of the three documents, but 'Competitor_C_pricing.pdf' is a scanned image I can't read directly. Would you like me to proceed with the two I have, or can you provide a text version of the third?"

**Climax:** Sarah says "Go ahead with the two." Mary presents the analysis as an overlay — a comparison table with key findings. Sarah clicks to expand each section.

**Resolution:** Sarah is never confused or scared. The error was handled conversationally. She trusts TalkTerm more because it explained what happened and gave her clear options instead of failing silently or dumping technical output.

### Journey Requirements Summary

| Journey | Key Capabilities Revealed |
|---|---|
| Sarah: First Workflow | Avatar selection, voice I/O, agent workflow execution, overlay-based options, structured output generation, onboarding-by-doing |
| Marcus: Terminal Replacement | Complex agent workflows, visual decision frameworks, local codebase access via Claude Code subprocess, output sharing |
| Sarah: Error Recovery | Graceful error handling via avatar conversation, partial completion, clear user options, trust-building through transparency |

## Competitive Landscape & Validation

### Market Context

- CLI agents (Claude Code, Copilot CLI) own the technical user segment
- Chat UIs (ChatGPT, Claude.ai) own the casual conversation segment but lack execution capability
- Character.ai proved demand for AI personas but has no agent capability
- No product occupies the intersection: real agent power + embodied personal interface

### Validation Approach

- BMAD community as initial user base for non-technical workflow validation
- Measure: can a non-technical user complete a BMAD workflow independently via TalkTerm?
- Compare time-to-completion and user satisfaction vs terminal-based agent workflows

## Desktop App Specific Requirements

### Platform Requirements

- Cross-platform single codebase — specific framework deferred to architecture phase
- Target platforms: macOS, Windows, Linux
- Must support path to mobile without full rewrite (mobile is a Phase 3 enhancement)
- Internet connectivity required for AI agent backend API calls
- Required system permissions: administrator/elevated privileges (agent SDK needs full file system and shell access), microphone (voice input), file system read/write (document I/O and Claude Code workspace access), network access (agent backend API)
- Application must verify admin privileges on every launch and display a blocking error with platform-specific relaunch instructions if not running as admin
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is bundled with TalkTerm — no separate Claude Code CLI installation required
- Minimum supported OS: macOS 12+ / Windows 10+ / Ubuntu 22.04+ (or equivalent — to be confirmed in architecture phase)

### System Notification Strategy

- Notify via OS system notifications when long-running agent tasks complete
- Prompt to continue unfinished workflows (e.g., "Mary is waiting — you left your brainstorming session mid-way")
- Notification tone/style should match the active avatar's personality
- System tray / menu bar presence for background task monitoring

### Distribution Strategy

- Direct download from project website / GitHub Releases
- Package manager distribution: Homebrew (macOS/Linux), winget / Chocolatey (Windows)
- No app store gatekeeping — direct distribution avoids AI policy compliance risk entirely
- Auto-update mechanism for new versions

### Implementation Considerations

- Avatar rendering must be performant on any desktop system with a GPU manufactured in the last 5 years — no high-end GPU dependency
- Voice pipeline must handle background noise typical of desktop usage (office, home office, coffee shop)
- Latency strategy: acknowledgement (≤1s) via immediate avatar animation state change; first response (≤3s) via streaming TTS, with avatar speaking before full response is generated. Long-running agent steps show progress animation with no response-time SLA; the user is never shown a blank or frozen state.
- Claude Agent SDK runs in-process in the Electron main process — no subprocess management needed. SDK handles its own agent loop lifecycle (start, resume, cancel).
- Agent has full access to the local file system (via SDK's built-in Read/Edit/Write tools), shell execution (via Bash tool), MCP tools, and local network services
- Session state must persist to durable local storage on graceful and unexpected shutdown
- Speech-to-text and TTS services must be configurable via abstraction layer — swappable without app-level code changes (architecture constraint; not an NFR)
- Window must support resizing with responsive layout; overlay panels can use full desktop screen real estate

## Product Scope & Phased Development

### MVP Strategy

**Approach:** Experience MVP — prove that the avatar + voice + overlay interaction model delivers real value to non-technical users completing agent workflows. The BMAD brainstorming workflow serves as both the initial use case and the product showcase — a non-technical user's first session IS the proof of concept.

**Resource Requirements:** Single developer. Scope must remain achievable by one person.

**API Key Model (MVP):** Users provide their own AI agent backend API key (BYOK — Bring Your Own Key). Key is stored per NFR6. This avoids per-session API cost burden on the developer and defers monetization to post-validation. Hosted subscription model (developer absorbs API costs) is a Phase 2 decision once usage patterns are understood.

### MVP Feature Set (Phase 1)

**Core User Journey:** Sarah completes first BMAD brainstorming workflow → structured output artifact

**Must-Have Capabilities:**
- Admin privilege check on every launch with blocking error screen if not running as admin
- Guided API key setup with live validation against Anthropic API, secure OS credential store storage, and inline error feedback
- Combined launch state assessment (API key + profile + avatar) to route users to the correct entry point
- Single animated avatar with voice (2D if needed to meet latency budget)
- Voice input with speech-to-text
- Text-to-speech avatar responses
- Claude as agent backend
- Graphical overlay for options and decisions
- Confirm plan pattern before agent execution
- Structured output document generation
- Action traceability logging
- Rich display panel with multiple modes: live task progress, plan preview, rendered documents, comparison tables, clustered cards
- Cross-session memory — avatar remembers context, decisions, and user preferences across sessions via Claude Agent SDK session persistence; references past work naturally and builds progressively richer understanding of user's work context
- Desktop app (macOS + Windows for MVP — expand to Linux post-validation)
- BMAD workflow support (minimum: brainstorming agent)

**Explicitly NOT in MVP:**
- Multiple avatars
- Mobile support
- Multi-backend support
- System notifications for background tasks
- Avatar customization or wardrobe variation
- Offline capability
- Output sharing/export beyond local file access

### Phase 2: Growth

- Multiple avatar personas mapped to BMAD agent roster (Mary the Analyst, Alex the Designer, Winston the Architect)
- System notifications for long-running tasks and session continuity
- Additional BMAD workflows (PRD creation, architecture, sprint planning)
- Windows and Linux platform support
- Output sharing and export
- Avatar memory — learns user preferences, projects, vocabulary over time

### Phase 3: Expansion

- **Mobile support:** Mobile companion app connecting to Claude Code on user's desktop/server via relay server; Android-local execution via Termux as advanced option
- **Multi-backend:** Additional AI agent backends (Copilot, Gemini) and multi-agent handoff within workflows
- **Avatar aliveness:** Daily cosmetic variation (wardrobe, accessories, expressions) and user-customizable avatar creation
- **Community:** Marketplace for agent personas and workflows
- **Enterprise:** Team dashboards, shared configs, advanced audit reporting

### Enhancement Ideas (Post-MVP, from Competitive Research)

- **Effort modes:** User-selectable cost/capability tiers per session (Economy/Power/Turbo) — inspired by Replit Agent. Economy uses smaller/cheaper models with turn limits for quick tasks; Power is the default balanced mode; Turbo uses the most capable model with extended context and higher turn/budget limits for complex workflows. Surfaces estimated cost before session start. Lets users trade cost vs. capability based on task complexity, supporting the BYOK model where users pay their own API costs.

### Risk Mitigation

**Technical Risks:**
- *Response latency has multiple pipeline sources.* **Mitigation:** See Implementation Considerations latency strategy (acknowledgement/first-response split with streaming TTS). Downscale avatar to 2D if rendering budget requires it.
- *Single developer bottleneck.* **Mitigation:** Framework choice (deferred to architecture phase) must prioritize developer velocity and existing ecosystem. Avoid custom solutions where off-the-shelf exists.
- *Claude Agent SDK cost/runaway risk.* **Mitigation:** SDK supports `maxTurns` and `maxBudgetUsd` limits. Permission callbacks enforce user confirmation before destructive actions (FR20).

**Market Risks:**
- *Non-technical users may not seek out an "agent" tool.* **Mitigation:** Position as "personal AI assistant" not "agent interface." BMAD community provides warm initial audience.

**Resource Risks:**
- *Solo developer scope creep.* **Mitigation:** MVP is ruthlessly scoped — one avatar, one backend, one workflow, two desktop platforms only (macOS + Windows). No mobile, web, or additional OS in Phase 1. Everything else is Phase 2+. No exceptions.

## Functional Requirements

### Avatar & Persona

- FR1: User can select an avatar persona from an available roster
- FR2: Avatar renders as an animated 2D character on screen with smooth motion (no static images)
- FR3: Avatar displays distinct animation states for each conversational mode: listening, thinking, and speaking
- FR4: Avatar speaks responses aloud using synthesized voice output
- FR5: Each avatar persona has a unique character name, visual design, and assigned voice — no two personas share the same combination of these attributes

### Voice Interaction

- FR6: User can speak to the avatar using device microphone
- FR7: System begins transcribing user speech within 500ms of silence detection; transcription completes within 1 second for utterances under 15 seconds
- FR8: User can input text as a full-featured alternative to voice — all workflow interactions available via text input; the text input field must support paste (Ctrl/Cmd+V), multi-line entry (Shift+Enter for newlines), and be visually co-equal with the voice input button — not a secondary or diminished input mode
- FR9: System displays a distinct visual indicator (e.g., animated microphone icon) while actively capturing voice input

### Agent Workflow Execution

- FR10: User can initiate an agent workflow through natural language conversation
- FR11: System translates user intent into AI agent backend actions and executes them on the user's behalf
- FR12: System executes multi-step agent workflows (e.g., BMAD brainstorming, PRD creation)
- FR13: Agent can read, create, and modify files on behalf of the user
- FR14: Agent can invoke tools and integrations via MCP
- FR15: System maintains conversation context throughout a workflow session
- FR16: User can provide input documents (PDF, TXT, DOCX files) to the agent for use in workflow processing, via system file dialog or drag-and-drop
- FR17: System provides visual feedback while the agent is working (avatar animation, progress indication)

### Decision Presentation & Confirmation

- FR18: System presents agent options and decisions as graphical overlay cards
- FR19: User can select options by clicking overlay cards or speaking a choice
- FR20: System presents a confirmation prompt before any agent action that creates, modifies, or deletes files, invokes external APIs, or performs any operation that is not reversible
- FR21: User can approve, modify, or reject a proposed agent plan; the modified plan is re-presented for confirmation before execution
- FR22: System hides agent intermediate thinking and only surfaces final results and decision points

### Output & Artifacts

- FR23: System generates structured output documents from completed workflows
- FR24: User can view completed output artifacts within the app
- FR25: User can access output files on the local file system
- FR26: Avatar verbally summarizes completed workflow output in 2–4 sentences before transitioning to the output display overlay

### Traceability & Logging

- FR27: System logs all agent actions with timestamp, action type, and outcome
- FR28: User can view a history of agent actions performed in a session
- FR29: System maintains an audit trail recording: timestamp, action type, outcome, and the user intent or workflow step that triggered each action

### Session Management

- FR30: User can start a new workflow session
- FR31: User can resume an incomplete workflow session based on an agent-provided list of resumable sessions
- FR32: Session state is persisted to durable local storage on application close, crash, or unexpected termination
- FR33: Avatar greets returning users by name (from local profile) and offers to continue the most recent incomplete session or start a new one
- FR36: System identifies and persists a user profile locally on the user's machine (no account or login required for MVP); profile stores: user name, avatar preference, and session history references

### Error Handling

- FR34: System communicates errors through avatar conversation using non-technical language; error messages must not contain stack traces, error codes, agent internal logs, or raw API error text
- FR35: When an error occurs, system presents 2–3 concrete recovery options via overlay within the same conversational turn as the error message

### Voice Interaction — Additional Behaviors

- FR37: When the user speaks during avatar audio playback, system stops playback and captures the new user input (barge-in support)
- FR38: When network connectivity is lost mid-session, system pauses the active workflow, displays a connectivity error via text overlay, and resumes the session automatically when connectivity is restored without requiring the user to restart

### Native Speech-to-Text

- FR60: The system must provide speech-to-text using a local, offline-capable speech recognition engine (sherpa-onnx with Zipformer streaming model) that runs in the Electron main process. The Web Speech API must not be used as it is non-functional in Electron. Audio is captured in the renderer via getUserMedia, streamed as 16kHz mono PCM Float32 to the main process via IPC, and transcribed in real-time with streaming partial results and endpoint detection.
- FR61: On first launch or when speech model files are not present, the system must automatically download the sherpa-onnx streaming model files (~44 MB total) from HuggingFace to the application's userData directory. Download progress must be indicated to the user. The model must persist across app restarts.
- FR62: Speech recognition must provide streaming interim results (partial transcriptions displayed in real-time as the user speaks) and emit a final result when an utterance endpoint is detected (silence after speech). The avatar must display the 'listening' animation state during active speech capture.

### System Prerequisites

- FR39: On every launch, TalkTerm must verify that the application is running with administrator/elevated privileges (macOS: root or admin group; Windows: Run as Administrator). If the app is not running as admin, it must display a blocking error screen with platform-specific instructions to relaunch as admin. The app must not proceed past this check until admin privileges are confirmed.

### API Key Management

- FR40: System must provide a guided API key entry experience that: (a) accepts an Anthropic API key via a single text input field, (b) presents a "Validate API Key" button that is visible but disabled until the user enters input, and triggers validation on click, (c) validates the key against the Anthropic API before accepting it, (d) stores the validated key securely in the OS credential store via safeStorage, (e) displays inline validation feedback (success or specific error reason) and on success auto-advances to the next setup step after a brief success indicator (~1 s) without requiring an additional click, and (f) provides a help link explaining how to obtain an API key
- FR41: System must detect and handle three API key states on every launch: (a) no key stored — route to API key entry, (b) key stored and valid — proceed to next setup step, (c) key stored but expired/revoked — route to API key entry with a clear message explaining the key is no longer valid and must be replaced

### Launch State Assessment

- FR42: On every launch, after the admin privilege check passes, the system must simultaneously assess the combined state of API key validity, user profile completeness, avatar selection, and workspace selection to determine the correct entry point. The system must not check these states sequentially — all four are evaluated together to route the user directly to the first incomplete step

### Workspace Selection

- FR52: After avatar selection and before the first conversation, the system must present a workspace selection screen offering two paths: (a) the user selects a local project folder or provides a Git repository URL to clone — giving the agent full project context for workflows, or (b) the user skips workspace selection, in which case the system silently clones the BMAD-method repository (https://github.com/bmadcode/BMAD-METHOD) as the default workspace so that BMAD agent workflows have a valid working context. The selected or default workspace must be persisted across sessions.
- FR53: When the user skips workspace selection, the BMAD-method repo clone must happen silently in the background with no user-visible progress or confirmation — the avatar proceeds directly to the greeting. The user may connect a project repo later through conversation ("use my project at /path" or "clone this repo").

### Cross-Session Memory

- FR46: System must persist conversation context, user decisions, project vocabulary, and workflow outcomes across sessions using Claude Agent SDK session persistence; on session resume, the avatar must have access to the full history of prior sessions for the active workspace
- FR47: Avatar must reference past work naturally in conversation (e.g., "Last week you chose the incremental migration approach — want to check how that's going?") when contextually relevant, without requiring the user to remind it of prior decisions or context

### Preference Memory

- FR51: System must track user interaction patterns — including frequently chosen workflow options, preferred brainstorming techniques, default output destinations (local path or external system), avatar persona preferences, and workflow-specific settings — and persist them across sessions using context-scribe (https://github.com/Joaolfelicio/context-scribe) as the preference memory engine. Learned preferences must be surfaced as prioritized defaults or pre-selected options in future sessions without requiring explicit user configuration. Preferences must be scoped per agent type (e.g., Mary may have different defaults than Winston) and per workspace. The user must be able to override any learned preference at any time by simply choosing a different option — the system must adapt to the new pattern without requiring a reset.

### Rich Display

- FR43: During multi-step agent workflows, the system must display a live task progress view showing each workflow step with status (pending/in-progress/completed/failed), a visual progress indicator, elapsed time per step, and live counters for workflow-specific metrics (e.g., "18 ideas generated"); progress updates must be driven by the SDK message stream in real time
- FR44: Before executing a multi-step workflow, the system must present a plan preview showing numbered steps with descriptions, estimated scope, and approach summary; the plan must be presented as part of the confirm-plan pattern (FR20) with options to approve, modify, or choose a different approach; on approval, the plan preview must transition to the task progress view automatically
- FR45: The output display panel must support multiple display modes that auto-select based on content type: task progress (live workflow tracking), plan preview (proposed approach), document (rendered markdown), comparison table (scored matrix with color coding and expandable rows), clustered cards (categorized ideas with expandable groups), and activity feed (streaming agent action log, hidden by default)
- FR46: The agent backend must support long-running multi-turn conversations. Each user message must allow the agent up to 25 agentic turns (tool calls + responses) to complete its work. The greeting/session-init query is limited to 1 turn with no tools. These limits serve as safety caps — the agent may complete in fewer turns. If the turn limit is reached, the system must display a specific user-friendly message ("I've reached the maximum number of steps for this request") rather than a generic error.

### External System Writeback

- FR48: After a workflow produces an output artifact, the system must present a "Send to..." option alongside the local file save option, allowing the user to write the artifact back to a connected external system (e.g., Azure DevOps work item, GitHub issue/PR, Confluence page) via MCP tool integrations
- FR49: The writeback flow must present the user with: (a) a list of available connected systems detected via MCP, (b) a target location picker appropriate to the selected system (e.g., project/board/work item type for Azure DevOps, repo/path for GitHub), and (c) a preview of the content that will be written before confirmation
- FR50: Writeback actions must follow the confirm-plan pattern (FR20) — the user must approve the target system, location, and content before execution; the avatar must verbally describe what will be written and where before presenting the confirmation overlay

### Structured Question Input

- FR57: When the agent responds with a message containing two or more numbered questions, the system must detect the question structure (via renderer-side parsing of numbered patterns such as `1.`, `2.`, etc.), extract individual questions with their titles and body text, and present them as a Question Card Stack in the right panel — one card per question — instead of rendering the full response as a single text block. Single-question responses must remain in the standard caption and text input flow with no special treatment.
- FR58: Each question card must contain: the question title (extracted from bold text or first sentence), full question body including sub-items, an auto-expanding text input for the user's answer, optional suggestion chips parsed from example options listed in the question body, a skip option for questions the user chooses not to answer, and dot navigation indicators showing completion state (answered, skipped, unanswered) for all questions in the set. Users must be able to answer questions in any order via dot navigation or Back/Next controls.
- FR59: Before submission, the system must present a review overlay showing all answers (and skipped questions) in a compact list with edit affordances for each answer. On user confirmation, the system must aggregate all answers into a single structured message (numbered list format matching the original questions) and send it to the agent via the existing `sendAgentMessage` channel. In voice/live mode, the avatar must read each question aloud, capture the spoken answer via STT, auto-advance to the next question, and present the review overlay after the final question is answered.

### Repository-Aware Save Behavior

- FR54: The writeback method presented at workflow completion must be contextual based on how the session originated. The system must detect the session context and present the appropriate default writeback: (a) if the session originated from or references an Azure DevOps work item — default to writing back to that ADO work item/wiki; (b) if the session is working within a Git repo workspace — default to committing and offering a Pull Request; (c) if the session is working with local files or BMAD defaults — default to local file save. All three writeback paths remain available as alternatives regardless of the detected context, but the contextually appropriate option must be presented first and pre-selected.
- FR55: When the user selects "Open Pull Request" (repo context), the system must: (a) create a feature branch with a descriptive name derived from the workflow (e.g., `brainstorming/onboarding-features`), (b) commit the artifact to that branch, (c) push the branch, and (d) create a pull request with a title and description summarizing the workflow output. The PR link must be displayed in the right panel confirmation view.
- FR56: When the user selects writeback to Azure DevOps (ADO context), the system must: (a) identify the originating work item or wiki page from the session context, (b) present the target pre-filled with the source item details, (c) show a preview of the content formatted for ADO, and (d) write the artifact back to the source item (e.g., update work item description, add attachment, or create linked wiki page) via MCP. The confirmation must show a link to the updated ADO item.

## Non-Functional Requirements

### Performance

- NFR1a: Avatar input acknowledgement (animation state change to "listening") must occur within 1 second of speech completion for 95th percentile of interactions, as measured by in-app telemetry
- NFR1b: First spoken response segment must begin within 3 seconds of speech completion for standard conversational turns (non-tool-call responses), achieved via streaming TTS, for 95th percentile of interactions
- NFR1c: Long-running agent steps (multi-tool-call sequences) must show continuous progress animation with no response-time SLA — user is never shown a blank or frozen state
- NFR2: Avatar animation must render at minimum 30fps on desktop systems with a GPU manufactured within the last 5 years, as measured by frame timing during standard conversation
- NFR3: Speech-to-text transcription must begin processing within 500ms of user finishing speech, measured from silence detection
- NFR4: App launch to avatar-ready state (avatar visible and responsive) must complete within 3 seconds on supported desktop systems, measured from cold launch
- NFR5: Agent workflow progress feedback (avatar animation change or overlay indicator) must appear within 1 second of user input confirmation, measured from click/voice confirmation event

### Security

- NFR6: Agent backend API keys must be stored in the OS credential store (macOS Keychain / Windows Credential Manager / Linux Secret Service via libsecret); must never be stored in plaintext, exposed in client-side code, or included in logs
- NFR7: Raw voice audio must not be stored beyond the active transcription session unless user explicitly opts in; this opt-in must be a separate, clearly labeled consent action
- NFR8: File system access must be scoped to user-approved directories only; agent may not access directories outside user-granted scope
- NFR9: All communication with agent backends and third-party services must use TLS 1.2 or higher
- NFR16: Conversation transcripts transmitted to the AI agent backend are not persisted by TalkTerm beyond the active session; the AI backend's data handling policy must be disclosed to the user before first use in a plain-language summary screen

### Accessibility

- NFR10: Text input must be a full-featured alternative to voice — no voice-only functionality
- NFR11: Overlay cards must meet minimum click target sizes of 32×32px and provide clear hover/focus states for keyboard and mouse interaction
- NFR16: All setup screens must support keyboard-driven interaction: text inputs must auto-focus on mount, and pressing Enter must trigger the screen's primary action (equivalent to clicking the primary button). Screens with a single primary button must allow Enter to activate it when the button is enabled
- NFR12: Avatar speech must be accompanied by on-screen text captions

### Integration

- NFR13: AI agent backend integration must retry failed requests up to 3 times with exponential backoff; must surface a user-facing error via FR34 after 10 seconds of unresponsiveness; rate limit responses must trigger a "service busy" avatar message with an estimated wait, not a silent failure
- NFR15: MCP tool integrations must follow the MCP protocol specification
