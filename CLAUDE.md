@https://github.com/petry-projects/.github/blob/main/AGENTS.md
@AGENTS.md

# TalkTerm — Claude Code Project Context

This file extends the [petry-projects organization standards](https://github.com/petry-projects/.github/blob/main/AGENTS.md) with TalkTerm-specific guidance. **Read the org-level AGENTS.md first** — it defines TDD, SOLID, CLEAN, DRY, DDD, KISS, YAGNI, pre-commit checks, CI gates, BMAD workflow, and multi-agent isolation rules that apply to all repositories.

> If a rule here conflicts with the org-level AGENTS.md, the rule here takes precedence.

For comprehensive project guidelines (architecture, testing, code style, conventions), see [AGENTS.md](./AGENTS.md).

## Quick Reference

- **Install:** `npm install`
- **Test:** `npm test`
- **Lint:** `npm run lint`
- **Format:** `npm run format`
- **Type check:** `npm run typecheck`
- **Dev:** `npm run dev`

## Key Rules

1. **TDD is mandatory** — write tests before implementation (see AGENTS.md Section 1)
2. **Coverage thresholds** — 90% branch/function/line/statement
3. **Mutation testing** — 80% minimum Stryker score
4. **Clean Architecture** — dependencies point inward, never import outer from inner layers
5. **DDD bounded contexts** — Agent, Storage, Security, Voice, Avatar, Overlay
6. **Pre-commit checks run manually** — `npm run lint && npm run format && npm run typecheck && npm test`

See [AGENTS.md](./AGENTS.md) for full details.

---

## 1. Testing — Project-Specific Configuration

The org-level AGENTS.md defines TDD workflow and general testing rules. This section adds TalkTerm-specific framework configuration.

### Testing Framework & Configuration

- **Framework:** Vitest (aligned with Vite build pipeline)
- **Component testing:** React Testing Library + @testing-library/user-event
- **E2E:** Playwright with Electron support
- **Test location:** Co-located next to source files with `.test.ts` / `.test.tsx` suffix
- **Integration tests:** `test/integration/` directory
- **E2E tests:** `test/e2e/` directory

### Vitest Workspace Configuration

Tests run in environment-appropriate contexts:

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

- **Coverage thresholds:** 90% branch, function, line, and statement (enforced in CI)
- **Mutation testing:** Stryker Mutator with Vitest runner — 80% minimum score, 90%+ target for domain/repository/use-case layers
- **Mutation exclusions:** composition roots, preload scripts, type-only files

---

## 2. Clean Architecture — TalkTerm Layers

Dependencies point inward. Inner layers never import from outer layers.

```
src/
  shared/types/              DOMAIN LAYER (entities, value objects, domain events)
    ├── domain/              Aggregate roots, value objects, domain events
    ├── ports/               Repository and service interfaces (ports)
    └── ...                  Shared type definitions

  main/                      APPLICATION + INFRASTRUCTURE LAYER
    ├── agent/               Use case: agent session management
    │   ├── agent-backend.ts          Port (interface)
    │   ├── claude-sdk-backend.ts     Adapter (SDK implementation)
    │   └── agent-message-router.ts   Use case orchestration
    ├── storage/             Infrastructure: persistence adapters
    │   ├── sqlite-session-repository.ts   Implements SessionRepository
    │   ├── sqlite-audit-repository.ts     Implements AuditRepository
    │   └── electron-config-store.ts       Implements ConfigStore
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

### Import Rules (Enforced)

- `shared/` imports **nothing** from `main/` or `renderer/`
- `main/` imports from `shared/` only — never from `renderer/`
- `renderer/` imports from `shared/` only — never from `main/`
- `preload/` imports from `shared/` only
- Only `claude-sdk-backend.ts` may import `@anthropic-ai/claude-agent-sdk`
- Only `web-speech-*.ts` files may use Web Speech API directly
- Only `src/main/storage/` files may import `better-sqlite3` or `electron-store`

---

## 3. DDD — TalkTerm Bounded Contexts

The org-level AGENTS.md defines general DDD principles. This section maps them to TalkTerm's specific bounded contexts.

| Context | Directory | Responsibility | Aggregate Root |
|---------|-----------|---------------|----------------|
| **Agent** | `main/agent/` | Session lifecycle, message routing, backend abstraction | `AgentSession` |
| **Storage** | `main/storage/` | Session persistence, audit trail, config | `Session` |
| **Security** | `main/security/` | API key lifecycle, admin privilege check | `ApiKeyState` |
| **Voice** | `renderer/speech/` | STT/TTS pipeline, barge-in state machine | `VoiceSession` |
| **Avatar** | `renderer/components/avatar/` | Animation state machine, persona mapping | `AvatarState` |
| **Overlay** | `renderer/components/overlay/` + `display/` | Action cards, output panels, display modes | `OverlayStack` |

### Anti-Corruption Layer

The Claude Agent SDK's message types are external — do not let them leak into domain code. Map SDK messages to domain events at the boundary (`claude-sdk-backend.ts`).

### Dependency Injection

**Manual constructor injection** in `main.ts` — no DI frameworks (TSyringe, InversifyJS, etc.). Manual wiring is simpler, fully type-safe, and sufficient for this project's ~7 components.

---

## 4. Pre-Commit — TalkTerm Configuration

The org-level AGENTS.md defines general pre-commit requirements. TalkTerm uses **Husky v9 + lint-staged v15**:

**Pre-commit hook** (`.husky/pre-commit`):
```bash
#!/usr/bin/env sh
npx lint-staged && npx tsc --noEmit && npx vitest related --run
```

**lint-staged configuration** (in `package.json`):
```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix --max-warnings 0", "prettier --write"],
    "*.{css,json,md}": ["prettier --write"]
  }
}
```

---

## 5. Code Quality Tooling

### ESLint (Flat Config) — Key Rules

| Rule | Why |
|------|-----|
| `@typescript-eslint/no-floating-promises` | The #1 async bug — forgotten `await` |
| `@typescript-eslint/strict-boolean-expressions` | Prevents truthy/falsy surprises with `""`, `0`, `null` |
| `@typescript-eslint/explicit-function-return-type` | Documents intent, catches type widening |
| `@typescript-eslint/no-unused-vars` | Dead code removal (with `_` prefix exceptions) |
| `import-x/order` | Consistent import ordering: builtin → external → internal → parent → sibling |
| React hooks rules | Enforce rules of hooks and exhaustive deps |

### Prettier
```json
{ "semi": true, "singleQuote": true, "trailingComma": "all", "printWidth": 100, "tabWidth": 2 }
```

### TypeScript
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`

---

## 6. Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Variables / functions | camelCase | `sessionId`, `startSession()` |
| Types / interfaces | PascalCase | `AgentBackend`, `SessionConfig` |
| React components | PascalCase | `AvatarCanvas`, `ActionCard` |
| Constants / enums | UPPER_SNAKE_CASE | `MAX_TURNS`, `AvatarState.SPEAKING` |
| General source files | kebab-case | `agent-backend.ts`, `session-store.ts` |
| React component files | PascalCase | `AvatarCanvas.tsx`, `ActionCard.tsx` |
| Test files | Co-located, `.test.ts` | `agent-backend.test.ts` next to source |
| IPC channels | `namespace:verb` | `agent:message`, `session:resume` |
| SQLite tables | snake_case, plural | `sessions`, `audit_entries` |
| SQLite columns | snake_case | `session_id`, `created_at` |
| Rive state inputs | camelCase | `isListening`, `isThinking` |
| Domain events | `context:past-tense` | `session:created`, `agent:error-classified` |
| Branded types | PascalCase | `SessionId`, `WorkspacePath`, `ApiKey` |

---

## 7. Architectural Boundaries (Hard Rules)

These are **non-negotiable** — any violation must be fixed before merge:

1. **Process boundary:** Main process NEVER imports from `src/renderer/`. Renderer NEVER imports from `src/main/`. Both import from `src/shared/types/` only.
2. **SDK isolation:** Only `claude-sdk-backend.ts` imports `@anthropic-ai/claude-agent-sdk`.
3. **Speech isolation:** Only `web-speech-stt.ts` and `web-speech-tts.ts` use Web Speech API.
4. **Storage isolation:** Only `src/main/storage/` imports `better-sqlite3` or `electron-store`.
5. **Error pipeline:** ALL errors route through the avatar conversation layer. No raw errors, stack traces, error codes, or API error text in the UI. Ever.
6. **Audit trail:** ALL agent actions logged. Logging is never skipped.
7. **State management:** `useReducer` via context for app state. No `useState` for complex state. Action names follow `domain:verb` pattern.
8. **No barrel files:** Import directly from source files. No `index.ts` re-exports.

---

## 8. Story Implementation Protocol

When implementing any story, follow this exact sequence:

1. **Read the story** from `_bmad-output/planning-artifacts/epics.md`
2. **Read referenced FRs** from the PRD for full context
3. **Read architecture decisions** relevant to the story
4. **Read UX design specs** for any UI components in the story
5. **Write failing tests** for each acceptance criterion (Red)
6. **Implement minimum code** to pass each test (Green)
7. **Refactor** while keeping tests green
8. **Verify pre-commit passes** before committing
9. **Run full test suite** to catch regressions

### Story Completion Checklist

Before marking a story as done:

- [ ] All acceptance criteria have corresponding tests
- [ ] All tests pass
- [ ] Pre-commit hook passes (lint + format + type check + related tests)
- [ ] Coverage meets 90% threshold (branch, function, line, statement)
- [ ] Mutation testing run on changed files — surviving mutants investigated
- [ ] No `any` types introduced
- [ ] No `// @ts-ignore` or `// eslint-disable` without documented justification
- [ ] Domain objects use branded types for IDs
- [ ] Repository interfaces used (not direct DB access in use cases)
- [ ] Errors routed through error pipeline (no raw errors in UI)
- [ ] IPC channels follow `namespace:verb` naming
- [ ] New files follow naming conventions
- [ ] Imports follow the architectural boundary rules

---

## 9. Development Environment

### Required Tools

- Node.js 24+ (bundled with Electron 41)
- npm (package manager)
- Git

### npm Scripts

```
npm test          → vitest run
npm run test:watch → vitest
npm run test:e2e  → playwright test
npm run test:mutate → stryker run
npm run lint      → eslint . --max-warnings 0
npm run format    → prettier --write .
npm run typecheck → tsc --noEmit
npm run dev       → electron-forge start
npm run build     → electron-forge make
```

---

## 10. File Organization Rules

- Feature-based organization in renderer: `avatar/`, `overlay/`, `voice/`, `session/`, `display/`, `setup/`
- Concern-based organization in main: `agent/`, `storage/`, `security/`, `ipc/`
- Shared types in `src/shared/types/` — the ONLY code importable by both processes
- Domain objects in `src/shared/types/domain/` — aggregate roots, value objects, events
- Port interfaces in `src/shared/types/ports/` — repository and service contracts
- Tests co-located next to source files with `.test.ts` suffix
- Integration tests in `test/integration/`
- E2E tests in `test/e2e/`

---

## References

- **Org Standards:** [petry-projects AGENTS.md](https://github.com/petry-projects/.github/blob/main/AGENTS.md)
- **PRD:** `_bmad-output/planning-artifacts/prd.md` (v2.2)
- **Architecture:** `_bmad-output/planning-artifacts/architecture.md`
- **UX Design:** `_bmad-output/planning-artifacts/ux-design-specification.md` (v1.5)
- **Epics & Stories:** `_bmad-output/planning-artifacts/epics.md` (12 epics, 42 stories)
- **Readiness Report:** `_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-24.md`
