# Copilot Instructions — TalkTerm

## About

TalkTerm is a desktop AI agent interface (Electron + React + TypeScript) that makes CLI-based agentic workflows accessible to non-technical users through voice-enabled animated avatars; the Claude Agent SDK runs in-process in the Electron main process.

## Tech Stack

- **Runtime:** Node.js 24 (bundled with Electron 41 / Chromium 144)
- **Framework:** Electron 41 · React · Vite
- **Language:** TypeScript (`strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`)
- **Styling:** Tailwind CSS
- **Testing:** Vitest · React Testing Library · Playwright (Electron E2E) · Stryker (mutation)
- **Linting:** ESLint (zero-warnings policy) + Prettier
- **Key libraries:** Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), Rive (avatar animation), better-sqlite3, electron-store, Web Speech API

## Project Structure

Clean Architecture — dependencies point inward; inner layers never import from outer layers.

```
src/
  shared/types/      Domain layer: entities, value objects, domain events
    domain/          Aggregate roots, value objects, domain events
    ports/           Repository and service interfaces (ports)
  main/              Application + infrastructure layer
    agent/           Use case: agent session management
    storage/         Infrastructure: persistence adapters
    security/        Infrastructure: credential management
    ipc/             Infrastructure: IPC handler adapters
    main.ts          Composition root (manual constructor injection)
  renderer/          Presentation layer
    components/      React UI components
    hooks/           React hooks (consume preload bridge)
    context/         State management (useReducer)
    speech/          STT/TTS abstraction implementations
  preload/           Gateway: Electron contextBridge exposing main ports to renderer
```

DDD bounded contexts: **Agent**, **Storage**, **Security**, **Voice**, **Avatar**, **Overlay**. Use branded types (`SessionId`, `WorkspacePath`, `ApiKey`) to prevent wrong-string bugs. Never import from `src/main/` in renderer code or from `src/renderer/` in main code — the preload bridge (`window.electronAPI`) is the only seam, and `src/shared/` is the only code importable by both processes.

## Local Dev Commands

- Install:    `npm install`
- Dev run:    `npm run dev`
- Test:       `npm test`
- Test (watch): `npm run test:watch`
- Test (E2E): `npm run test:e2e`
- Mutation:   `npm run test:mutate`
- Lint:       `npm run lint`
- Format:     `npm run format`
- Typecheck:  `npm run typecheck`
- Build:      `npm run build`

## Required Environment Variables

- None at build/dev time. The Claude API key is supplied by the user at runtime through the in-app setup flow and stored via Electron `safeStorage` (Security context) — never hardcode it or read it from `process.env` in committed code.

## Testing Framework

- Runner: Vitest, with three workspaces — `main` (`node` env), `renderer` (`jsdom` env), `shared` (`node` env).
- Coverage threshold: 90% branch / function / line / statement (CI-enforced).
- Mutation testing: Stryker — 80% minimum score (CI gate), 90%+ target for domain/repos/use cases.
- TDD is mandatory: write tests before implementation. Test against interfaces/ports, not implementations — use `Fake*` doubles (e.g. `FakeAgentBackend`) and `:memory:` SQLite for repositories. Never use `.skip()` or coverage-ignore.

## Repo-Specific Overrides

None. This repo follows the org-level defaults; project specifics above add detail rather than override.

## Org Standards

See [petry-projects/.github — AGENTS.md](https://github.com/petry-projects/.github/blob/main/AGENTS.md) for org-wide development standards, and this repo's [AGENTS.md](../AGENTS.md) for the full project-specific implementation rules.
