# TalkTerm Test Suite

## Quick Start

```bash
npm test              # Run all unit + integration tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
npm run test:e2e      # Playwright E2E (requires ANTHROPIC_API_KEY)
npm run test:mutate   # Stryker mutation testing
```

## Architecture

Tests are organized by process boundary and test level:

```
src/
  main/**/*.test.ts          # Main process unit tests (node environment)
  renderer/**/*.test.tsx     # Renderer unit tests (jsdom environment)
  shared/**/*.test.ts        # Domain type tests (node environment)
test/
  integration/               # Cross-module integration tests
  e2e/                       # Playwright Electron E2E tests
  support/
    fixtures/                # Shared mock factories
    factories/               # Data builders with @faker-js/faker
  setup-renderer.ts          # jsdom setup (jest-dom matchers)
```

## Test Levels

| Level | Location | Environment | What to Test |
|-------|----------|-------------|-------------|
| Unit | `src/**/*.test.ts` | node/jsdom | Single module in isolation |
| Integration | `test/integration/` | node | Multi-module interactions with real SQLite |
| E2E | `test/e2e/` | Electron | Full app flow: setup, conversation, SDK |

## Fixtures & Factories

Shared test infrastructure lives in `test/support/`:

- **Fixtures** (`test/support/fixtures/`) — Mock factories for database, repositories, IPC, security, speech
- **Factories** (`test/support/factories/`) — Data builders using `@faker-js/faker` for Session, AuditEntry, etc.

```typescript
import { createMockDb, createMockSessionRepo } from '../support/fixtures';
import { buildSession, buildAuditEntry } from '../support/factories';
```

## Mocking Strategy

- **Main process:** Mock Electron modules, use `:memory:` SQLite, mock `@anthropic-ai/claude-agent-sdk`
- **Renderer:** Mock `window.electronAPI` (preload bridge). Never import from `src/main/`
- **Shared types:** No mocking — pure functions only

## Coverage Targets

- Branch/Function/Line/Statement: 90% (enforced in CI)
- Mutation score: 80% minimum (Stryker)

## E2E Tests

Require a built app and `ANTHROPIC_API_KEY`:

```bash
cp .env.example .env  # Add your API key
npm run build
npx playwright test --config playwright.electron.config.ts
```

## CI Pipeline

All gates run on every PR across ubuntu/macos/windows:
typecheck, lint, format, tests, coverage, mutation testing, E2E
