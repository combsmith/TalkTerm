# TalkTerm — Project Context & Implementation Rules

This file is the single source of truth for all implementation agents working on TalkTerm. It enforces SDLC best practices, coding standards, and architectural rules. Every story implementation, code review, and PR must comply with these rules.

> **Organization standards:** This repo inherits shared standards from [petry-projects/.github/AGENTS.md](https://github.com/petry-projects/.github/blob/main/AGENTS.md). The sections below are project-specific.

---

## Project Overview

TalkTerm is a desktop AI agent interface (Electron + React + TypeScript) that makes CLI-based agentic workflows accessible to non-technical users through voice-enabled animated avatars. The Claude Agent SDK runs in-process in the Electron main process.

**Stack:** Electron 41 (Node.js 24 + Chromium 144) | TypeScript (strict) | React | Vite | Tailwind CSS | Rive (avatar animation) | better-sqlite3 | electron-store | Web Speech API | Claude Agent SDK

**Planning artifacts:** `_bmad-output/planning-artifacts/` contains PRD, Architecture, UX Design Specification, and Epics & Stories documents. Always consult these before implementing.

---

## 1. Test-Driven Development (TDD)

> **Extends org-wide TDD standards.** See [shared AGENTS.md](https://github.com/petry-projects/.github/blob/main/AGENTS.md) for mandatory TDD workflow, coverage rules, and prohibited patterns (`.skip()`, coverage-ignore).
> **Workflow and checklist (planned):** `.claude/rules/tdd-sequence.md` *(not yet created)*

### Testing Framework & Configuration

- **Framework:** Vitest (aligned with Vite build pipeline)
- **Component testing:** React Testing Library + @testing-library/user-event
- **E2E:** Playwright with Electron support
- **Test location:** Co-located next to source files with `.test.ts` / `.test.tsx` suffix
- **Integration tests:** `test/integration/` directory
- **E2E tests:** `test/e2e/` directory

### Vitest Workspace Configuration

| Workspace | Files | Environment | Purpose |
|-----------|-------|-------------|---------|
| `main` | `src/main/**/*.test.ts` | `node` | Agent backend, storage, security, IPC handlers |
| `renderer` | `src/renderer/**/*.test.{ts,tsx}` | `jsdom` | React components, hooks, reducers |
| `shared` | `src/shared/**/*.test.ts` | `node` | Type guards, validators, domain types |

### What to Test (by Layer)

| Layer | What to Test | How |
|-------|-------------|-----|
| **Domain types** (`shared/`) | Type guards, validators, branded type constructors, invariant checks | Pure unit tests, no mocking |
| **Repositories & stores** (`main/storage/`) | CRUD operations, query correctness, constraint enforcement | Use `:memory:` SQLite databases |
| **Use cases** (`main/agent/`) | Session lifecycle, message routing, error classification | Mock repository interfaces, test against ports |
| **Security** (`main/security/`) | Admin check logic, key state machine, validation flow | Mock Electron APIs (`safeStorage`, `process`) |
| **IPC handlers** (`main/ipc/`) | Handler registration, message routing, error wrapping | Mock `mainWindow.webContents.send` |
| **React hooks** (`renderer/hooks/`) | State transitions, side effect triggers, return values | `renderHook()` from React Testing Library |
| **React reducers** (`renderer/context/`) | State transitions for every action type | Pure unit tests on reducer function |
| **React components** (`renderer/components/`) | User interactions, conditional rendering, accessibility | React Testing Library with user-event |
| **Speech abstractions** (`renderer/speech/`) | Interface compliance, state machine transitions | Mock Web Speech API globals |

### Mocking Strategy

- **Main process:** Mock Electron modules (`electron`, `safeStorage`), `better-sqlite3` (use `:memory:` DB), and `@anthropic-ai/claude-agent-sdk` (create `FakeAgentBackend` implementing `AgentBackend` interface)
- **Renderer process:** Mock the preload bridge (`window.electronAPI`) — this is the architectural seam. Never import from `src/main/` in renderer tests.
- **Shared types:** No mocking needed — pure functions only.
- **Test against interfaces, not implementations.** If code works with `FakeAgentBackend`, it works with any real backend.

### Coverage & Mutation Testing

- **Coverage:** 90% branch/function/line/statement (enforced in CI)
- **Mutation testing:** Stryker Mutator — 80% minimum score (CI gate), 90%+ target for domain/repos/use cases
- Stryker config in `stryker.config.mjs` — excludes composition roots, preload scripts, type-only files

---

## 2. SOLID Principles

- **Single Responsibility:** Each file has one reason to change. Each `src/main/` directory = one bounded context.
- **Open/Closed:** New behaviors via new implementations, not modifying existing code. `AgentBackend`, `SpeechToText`, `TextToSpeech`, `SessionRepository`, `AuditRepository` are extension points.
- **Liskov Substitution:** Validate with `Fake*` implementations in tests.
- **Interface Segregation:** IPC channels segregated: `agent:*`, `session:*`, `settings:*`, `voice:*`.
- **Dependency Inversion:** Manual constructor injection in `main.ts`. No DI frameworks.

---

## 3. Clean Architecture

Dependencies point inward. Inner layers never import from outer layers.

```
src/
  shared/types/              DOMAIN LAYER (entities, value objects, domain events)
    ├── domain/              Aggregate roots, value objects, domain events
    ├── ports/               Repository and service interfaces (ports)
    └── ...                  Shared type definitions

  main/                      APPLICATION + INFRASTRUCTURE LAYER
    ├── agent/               Use case: agent session management
    ├── storage/             Infrastructure: persistence adapters
    ├── security/            Infrastructure: credential management
    ├── ipc/                 Infrastructure: IPC handler adapters
    └── main.ts              Composition root (wires everything)

  renderer/                  PRESENTATION LAYER
    ├── components/          React UI components
    ├── hooks/               React hooks (consume preload bridge)
    ├── context/             State management (useReducer)
    └── speech/              STT/TTS abstraction implementations

  preload/                   GATEWAY (Electron contextBridge)
    └── preload.ts           Exposes main process ports to renderer
```

> **Import rules (planned):** `.claude/rules/architectural-boundaries.md` *(not yet created)*

---

## 4. Domain-Driven Design (DDD)

### Bounded Contexts

| Context | Directory | Responsibility | Aggregate Root |
|---------|-----------|---------------|----------------|
| **Agent** | `main/agent/` | Session lifecycle, message routing, backend abstraction | `AgentSession` |
| **Storage** | `main/storage/` | Session persistence, audit trail, config | `Session` |
| **Security** | `main/security/` | API key lifecycle, admin privilege check | `ApiKeyState` |
| **Voice** | `renderer/speech/` | STT/TTS pipeline, barge-in state machine | `VoiceSession` |
| **Avatar** | `renderer/components/avatar/` | Animation state machine, persona mapping | `AvatarState` |
| **Overlay** | `renderer/components/overlay/` + `display/` | Action cards, output panels, display modes | `OverlayStack` |

### Key Patterns

- **Aggregate roots** are the only entry points for modifications to their clusters
- **Branded types** (`SessionId`, `WorkspacePath`, `ApiKey`) prevent wrong-string bugs
- **Repository interfaces** (ports) in `src/shared/types/ports/` — implementations in `src/main/storage/`
- **Domain events** (`DomainEventBus`) decouple bounded contexts
- **Anti-corruption layer** in `claude-sdk-backend.ts` maps SDK types to domain types at the boundary

---

## 5. Pre-Commit Quality Checks

> **Extends org-wide pre-commit standards.** Project-specific tooling below.

Husky v9 + lint-staged v15 run on every commit (~15-40s total):

| Check | Tool | Purpose |
|-------|------|---------|
| Lint + autofix | ESLint | Floating promises, unused code, type issues |
| Format | Prettier | Consistent formatting |
| Type check | `tsc --noEmit` | Full project type safety |
| Related tests | `vitest related --run` | Tests affected by staged files |

---

## 6. Code Quality Tooling

### ESLint — Zero Warnings Policy (`--max-warnings 0`)

Key rules: `no-floating-promises`, `strict-boolean-expressions`, `explicit-function-return-type`, `no-unused-vars`, `import-x/order`, React hooks rules.

### Prettier

`semi: true` | `singleQuote: true` | `trailingComma: "all"` | `printWidth: 100` | `tabWidth: 2`

### TypeScript — `strict: true`

Plus: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`

> **Hard constraints (planned):** `.claude/rules/no-shortcuts.md` *(not yet created)*

---

## 7. CI Quality Gates (GitHub Actions)

> **Extends org-wide CI gate standards.** See [shared AGENTS.md](https://github.com/petry-projects/.github/blob/main/AGENTS.md) for iterate-until-green policy. Project-specific gates:

| Gate | Command | Threshold |
|------|---------|-----------|
| Type check | `tsc --noEmit` | Zero errors |
| Lint | `eslint . --max-warnings 0` | Zero warnings |
| Format | `prettier --check .` | All files formatted |
| Tests | `vitest run` | All pass |
| Coverage | `vitest run --coverage` | 90% branch/function/line/statement |
| Mutation | `npx stryker run` | 80% score |
| E2E | `playwright test` | All pass (macOS + Windows) |

---

## 8. Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Variables / functions | camelCase | `sessionId`, `startSession()` |
| Types / interfaces | PascalCase | `AgentBackend`, `SessionConfig` |
| React components | PascalCase | `AvatarCanvas`, `ActionCard` |
| Constants / enums | UPPER_SNAKE_CASE | `MAX_TURNS`, `AvatarState.SPEAKING` |
| General source files | kebab-case | `agent-backend.ts` |
| React component files | PascalCase | `AvatarCanvas.tsx` |
| Test files | Co-located, `.test.ts` | `agent-backend.test.ts` |
| IPC channels | `namespace:verb` | `agent:message`, `session:resume` |
| SQLite tables/columns | snake_case | `sessions`, `session_id` |
| Domain events | `context:past-tense` | `session:created` |
| Branded types | PascalCase | `SessionId`, `WorkspacePath` |

> **IPC naming (planned):** `.claude/rules/ipc-naming.md` *(not yet created)*

---

## 9. Architectural Boundaries

> **Full rules (planned):** `.claude/rules/architectural-boundaries.md` *(not yet created)*
> **Error pipeline (planned):** `.claude/rules/error-pipeline.md` *(not yet created)*

---

## 10. Story Implementation Protocol

> **Full workflow and checklist (planned):** `.claude/rules/tdd-sequence.md` *(not yet created)*

---

## 11. Development Environment

### Required Tools

- Node.js 24+ (bundled with Electron 41)
- npm (package manager)
- Git

### npm Scripts

```
npm test           → vitest run
npm run test:watch → vitest
npm run test:e2e   → playwright test
npm run test:mutate → stryker run
npm run lint       → eslint . --max-warnings 0
npm run format     → prettier --write .
npm run typecheck  → tsc --noEmit
npm run dev        → electron-forge start
npm run build      → electron-forge make
```

---

## 12. File Organization

- Feature-based in renderer: `avatar/`, `overlay/`, `voice/`, `session/`, `display/`, `setup/`
- Concern-based in main: `agent/`, `storage/`, `security/`, `ipc/`
- Shared types in `src/shared/types/` — the ONLY code importable by both processes
- Domain objects in `src/shared/types/domain/`
- Port interfaces in `src/shared/types/ports/`
- Tests co-located next to source files
- Integration tests in `test/integration/`, E2E tests in `test/e2e/`

---

## References

- **PRD:** `_bmad-output/planning-artifacts/prd.md` (v2.2)
- **Architecture:** `_bmad-output/planning-artifacts/architecture.md`
- **UX Design:** `_bmad-output/planning-artifacts/ux-design-specification.md` (v1.5)
- **Epics & Stories:** `_bmad-output/planning-artifacts/epics.md` (12 epics, 45 stories)
- **Readiness Report:** `_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-24.md`
