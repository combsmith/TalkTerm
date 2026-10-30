# System-Level Test Design: TalkTerm

**Version**: 1.0
**Date**: 2026-03-28
**Author**: Murat (Master Test Architect)
**Mode**: System-Level (PRD + Architecture → comprehensive test strategy)
**Status**: All 12 epics, 44 stories COMPLETE

---

## 1. Executive Summary

TalkTerm is a desktop AI agent interface (Electron + React + TypeScript) with voice-enabled avatars. The system has 56 functional requirements, 16 non-functional requirements, and 12 architecture decision records. All stories are implemented with 343 passing unit/integration tests across 62 files.

This document defines a risk-based test strategy covering all requirement tiers, maps requirements to appropriate test levels, and identifies coverage gaps requiring attention.

---

## 2. Risk Matrix

### Probability × Impact Scoring

| Impact \ Probability | Unlikely (1) | Possible (2) | Likely (3) |
|---------------------|-------------|-------------|-----------|
| **Critical (3)** | 3 MONITOR | 6 MITIGATE | 9 BLOCK |
| **Degraded (2)** | 2 DOCUMENT | 4 MONITOR | 6 MITIGATE |
| **Minor (1)** | 1 DOCUMENT | 2 DOCUMENT | 3 MONITOR |

### Risk Register — Top Risks

| ID | Area | Risk | Prob | Impact | Score | Action | Priority |
|----|------|------|------|--------|-------|--------|----------|
| R1 | Security | API key stored insecurely or leaked in logs | 2 | 3 | 6 | MITIGATE | P1 |
| R2 | Security | File system access outside workspace scope | 2 | 3 | 6 | MITIGATE | P1 |
| R3 | Data | Session state lost on crash (FR32) | 2 | 3 | 6 | MITIGATE | P1 |
| R4 | UX | Raw errors/stack traces shown to user | 3 | 2 | 6 | MITIGATE | P1 |
| R5 | Security | Destructive action without confirmation (FR20) | 1 | 3 | 3 | MONITOR | P2 |
| R6 | UX | Admin check bypassed on launch (FR39) | 1 | 3 | 3 | MONITOR | P2 |
| R7 | Perf | Avatar animation drops below 30fps | 2 | 2 | 4 | MONITOR | P2 |
| R8 | Reliability | SDK timeout with no user feedback | 2 | 2 | 4 | MONITOR | P2 |
| R9 | UX | Voice input fails silently | 2 | 2 | 4 | MONITOR | P2 |
| R10 | Data | Audit trail gaps (missing actions) | 2 | 2 | 4 | MONITOR | P2 |
| R11 | Network | Network loss mid-session with data loss | 1 | 3 | 3 | MONITOR | P2 |
| R12 | Privacy | Conversation transcripts persisted (NFR16) | 1 | 3 | 3 | MONITOR | P2 |

---

## 3. Requirement-to-Test-Level Mapping

### P0 Requirements (Critical — Must Test at Multiple Levels)

| Requirement | Description | Unit | Integration | E2E |
|------------|-------------|------|-------------|-----|
| **FR20** | Confirm before destructive actions | ActionCard.test, ConfirmPlan.test | — | Setup flow |
| **FR29** | Audit trail: timestamp, action, outcome, intent | audit-entry.test | audit-trail.test | — |
| **FR32** | Session state survives crash | session.test | session-lifecycle.test | — |
| **FR39** | Admin privilege blocking check | admin-check.test | — | E2E spec |
| **NFR6** | API keys in OS credential store only | safe-storage-key-manager.test | — | — |
| **NFR8** | File access scoped to workspace | — | sdk-executable-path.test | — |
| **NFR9** | TLS 1.2+ for all external comms | — | — | Network audit |

### P1 Requirements — Test Level Assignment

| Area | Requirements | Primary Level | Secondary |
|------|-------------|--------------|-----------|
| **Avatar & Animation** | FR2, FR3, FR4, FR5 | Unit (state machine) | E2E (visual) |
| **Voice Input** | FR6, FR7, FR8, FR9 | Unit (mock Web Speech) | E2E (real audio) |
| **Agent Execution** | FR10-FR15, FR17 | Unit (mock SDK) | Integration (message flow) |
| **Decision UI** | FR18, FR19, FR21 | Component (RTL) | E2E (click/voice) |
| **Output Display** | FR23, FR43-FR45 | Component (RTL) | — |
| **Error Handling** | FR34, FR35 | Unit (classification) | Integration (pipeline) |
| **Session Mgmt** | FR30, FR31, FR36 | Unit (domain) | Integration (SQLite) |
| **API Key** | FR40, FR41, FR42 | Unit (state machine) | E2E (setup flow) |
| **Workspace** | FR52, FR53 | Component (RTL) | E2E (folder picker) |
| **Performance** | NFR1a-c, NFR2-5 | — | — (telemetry) |
| **Accessibility** | NFR11, NFR12, NFR16 | Component (RTL) | E2E (keyboard nav) |

### P2 Requirements — Test Level Assignment

| Area | Requirements | Primary Level | Notes |
|------|-------------|--------------|-------|
| **Cross-Session** | FR46, FR47 | Integration | Memory index queries |
| **Writeback** | FR48-FR50, FR54-FR56 | Unit (flow logic) | MCP integration needs real MCP |
| **Preferences** | FR51 | Integration | Context-scribe integration |
| **Barge-In** | FR37 | Unit (controller) | Timing-dependent |
| **Network Recovery** | FR38 | Unit (hook) | Integration (reconnect) |
| **Greeting** | FR33 | Component | Profile lookup |
| **Privacy** | NFR7, NFR16 | Unit | Storage inspection |

---

## 4. Test Strategy by Level

### 4.1 Unit Tests (343 existing, target: 90% coverage)

**Environment**: Vitest + jsdom (renderer) / node (main/shared)
**Current state**: 62 files, 343 tests, all passing

#### Coverage by Bounded Context

| Context | Files | Tests | Status | Gaps |
|---------|-------|-------|--------|------|
| **Domain Types** (shared/) | 12 | ~50 | GOOD | None identified |
| **Agent** (main/agent/) | 2 | ~14 | PARTIAL | Missing: message router edge cases, SDK event mapping completeness |
| **Storage** (main/storage/) | 5 | ~45 | GOOD | better-sqlite3 rebuild required (done) |
| **Security** (main/security/) | 2 | ~12 | GOOD | None identified |
| **IPC** (main/ipc/) | 2 | ~10 | PARTIAL | Missing: agent-ipc-handler tests |
| **Components** (renderer/) | 22 | ~150 | GOOD | Missing: some display mode components lack assertion depth |
| **Hooks** (renderer/hooks/) | 5 | ~25 | GOOD | None identified |
| **Speech** (renderer/speech/) | 3 | ~15 | GOOD | Barge-in controller tested |

#### Recommended Unit Test Additions

1. **agent-ipc-handler.test.ts** — The new `agent-ipc-handler.ts` file has no tests
2. **debug-logger.test.ts** — Exists but verify edge cases (file rotation, concurrent writes)
3. **card-parser.test.ts** — Exists; verify all card types covered
4. **DevPanel.test.tsx** — Exists; verify stream rendering

### 4.2 Integration Tests (5 existing)

**Environment**: Vitest + real SQLite (`:memory:`) + mock IPC
**Current state**: 5 files in `test/integration/`

| Test File | What It Tests | Status |
|-----------|--------------|--------|
| `session-lifecycle.test.ts` | Session CRUD, resume, status transitions | GOOD |
| `audit-trail.test.ts` | Audit entry logging and retrieval | GOOD |
| `error-pipeline.test.ts` | Error classification → user message | GOOD |
| `agent-message-flow.test.ts` | SDK message → IPC → state update | GOOD |
| `sdk-executable-path.test.ts` | SDK binary resolution | NEW |

#### Recommended Integration Test Additions

| Priority | Test | What to Verify | Risk Mitigated |
|----------|------|---------------|----------------|
| P1 | `ipc-roundtrip.test.ts` | Full IPC message flow: renderer → main → SDK mock → main → renderer | R4 (error leakage) |
| P1 | `session-crash-recovery.test.ts` | Write session → simulate crash (close DB) → reopen → verify state | R3 (data loss) |
| P1 | `api-key-lifecycle.test.ts` | Store → retrieve → validate → expire → re-enter flow | R1 (key security) |
| P2 | `display-mode-selection.test.ts` | Content type → auto-selected display mode mapping | FR45 |
| P2 | `workspace-scoping.test.ts` | Agent actions confined to workspace directory | R2 (scope escape) |
| P2 | `cross-session-memory.test.ts` | Write decisions → new session → retrieve context | FR46-47 |

### 4.3 E2E Tests (1 existing)

**Environment**: Playwright + Electron + real app
**Current state**: 1 spec file, 6 tests (requires API key)

| Test | What It Covers | Status |
|------|---------------|--------|
| Setup → conversation flow | FR39-42, FR52, FR1-3, FR6, FR10 | GOOD |
| Text input + SDK response | FR8, FR10-11, FR17 | GOOD |
| Dev panel toggle | FR28 (action history) | GOOD |
| Debug log verification | FR27 (audit logging) | GOOD |

#### Recommended E2E Test Additions

| Priority | Test | What to Verify | Requirements |
|----------|------|---------------|--------------|
| P1 | `error-recovery.spec.ts` | Invalid API key → error screen → retry flow | FR34, FR35, FR41 |
| P1 | `destructive-action-confirm.spec.ts` | File write → confirmation overlay → approve/reject | FR20, FR21 |
| P2 | `session-resume.spec.ts` | Start workflow → close app → reopen → resume | FR31, FR32 |
| P2 | `keyboard-navigation.spec.ts` | Tab through setup, Enter to submit, Ctrl+D dev panel | NFR11, NFR16 |
| P2 | `network-loss-recovery.spec.ts` | Simulate offline → error overlay → reconnect → resume | FR38 |
| P3 | `multi-step-workflow.spec.ts` | Start BMAD workflow → progress view → output display | FR12, FR43-45 |

---

## 5. Test Priority Matrix

### P0 Tests (Block Release — Score 9)

None currently at score 9. All P0 requirements have existing test coverage at unit or integration level.

### P1 Tests (Must Have Before Release — Score 6-8)

| Test | Level | Requirements | Existing? | Gap? |
|------|-------|-------------|-----------|------|
| Admin check blocks non-admin launch | Unit | FR39 | YES (admin-check.test) | NO |
| API key encrypted via safeStorage | Unit | NFR6 | YES (safe-storage-key-manager.test) | NO |
| Session persists across restart | Integration | FR32 | YES (session-lifecycle.test) | PARTIAL — no crash simulation |
| Audit entries contain all fields | Integration | FR29 | YES (audit-trail.test) | NO |
| Error pipeline transforms all error types | Integration | FR34 | YES (error-pipeline.test) | NO |
| Confirmation overlay for destructive actions | Component | FR20 | YES (ConfirmPlan.test) | NO |
| Agent IPC handler routes correctly | Unit | FR10-15 | NO | **GAP** |
| IPC roundtrip message integrity | Integration | ADR-5 | NO | **GAP** |
| API key lifecycle (store/validate/expire) | Integration | FR40-41 | NO | **GAP** |

### P2 Tests (Should Have — Score 4-5)

| Test | Level | Requirements | Existing? | Gap? |
|------|-------|-------------|-----------|------|
| Display mode auto-selection | Component | FR45 | PARTIAL (OutputPanel.test) | PARTIAL |
| Barge-in stops TTS on voice | Unit | FR37 | YES (barge-in-controller.test) | NO |
| Network loss detection | Unit | FR38 | YES (useNetworkStatus.test) | NO |
| Workspace selection flow | Component | FR52 | YES (WorkspaceSelection.test) | NO |
| Cross-session memory retrieval | Integration | FR46-47 | NO | **GAP** |
| E2E error recovery flow | E2E | FR34-35 | NO | **GAP** |
| E2E session resume | E2E | FR31-32 | NO | **GAP** |

### P3 Tests (Nice to Have — Score 1-3)

| Test | Level | Requirements | Existing? |
|------|-------|-------------|-----------|
| Avatar persona uniqueness | Unit | FR5 | YES (avatar-persona.test) |
| Caption bar displays response | Component | FR26 | YES (CaptionBar.test) |
| File drop zone accepts files | Component | FR16 | YES (FileDropZone.test) |
| Preference tracking | Integration | FR51 | NO |
| Writeback flow | Integration | FR48-56 | NO |

---

## 6. Coverage Gap Analysis

### Critical Gaps (Must Address)

| # | Gap | Requirements | Risk | Recommended Action |
|---|-----|-------------|------|-------------------|
| 1 | **No agent-ipc-handler tests** | FR10-15 | R4, R8 | Create unit tests for the new handler |
| 2 | **No IPC roundtrip integration test** | ADR-5 | R4 | Test full message flow with mock SDK |
| 3 | **No API key lifecycle integration test** | FR40-41 | R1 | Test store → validate → expire → re-enter |
| 4 | **No crash recovery test** | FR32 | R3 | Simulate crash mid-session, verify recovery |
| 5 | **No E2E error recovery test** | FR34-35 | R4 | Test invalid key → error → retry flow |

### Important Gaps (Should Address)

| # | Gap | Requirements | Recommended Action |
|---|-----|-------------|-------------------|
| 6 | No cross-session memory test | FR46-47 | Integration test with SQLite memory index |
| 7 | No E2E session resume test | FR31-32 | Start → close → reopen → resume |
| 8 | No E2E destructive action confirm | FR20 | Trigger file write → confirm overlay |
| 9 | No keyboard-only E2E test | NFR11, NFR16 | Tab navigation through full setup |
| 10 | No mutation testing in CI | CLAUDE.md | Add `npm run test:mutate` to CI (done) |

### Acceptable Gaps (Documented — Low Risk)

| # | Gap | Requirements | Rationale |
|---|-----|-------------|-----------|
| 11 | No real audio STT/TTS tests | FR6-7, NFR3 | Web Speech API mocked; real audio impractical in CI |
| 12 | No frame rate performance test | NFR2 | Requires GPU; manual verification on reference hardware |
| 13 | No MCP tool integration test | FR14, NFR15 | Requires configured MCP servers; mock at interface boundary |
| 14 | No writeback flow tests | FR48-56 | Requires external systems (GitHub, ADO); defer to integration env |

---

## 7. Test Architecture Recommendations

### 7.1 Fixture Architecture (DONE)

Created in this session:
- `test/support/fixtures/` — database, repositories, security, IPC, speech mocks
- `test/support/factories/` — Session, AuditEntry builders with `@faker-js/faker`

### 7.2 Vitest Workspace (Recommended)

Split single config into three workspaces per CLAUDE.md spec:

```
vitest.workspace.ts
├── main:     src/main/**/*.test.ts     → environment: 'node'
├── renderer: src/renderer/**/*.test.tsx → environment: 'jsdom'
└── shared:   src/shared/**/*.test.ts   → environment: 'node'
```

**Benefit**: Proper environment isolation. Renderer tests get full jsdom, main tests get pure node.

### 7.3 E2E Test Strategy

**Scope**: Critical user journeys only (not business logic)
**Trigger**: CI on macOS (Electron requires desktop env)
**API Key**: GitHub secret `ANTHROPIC_API_KEY`
**Retry**: 1 retry for network flakiness
**Artifacts**: Screenshots + traces on failure (30-day retention)

### 7.4 Mutation Testing

**Tool**: Stryker with Vitest runner
**Target**: 80% minimum score (CI gate)
**Focus areas**: Domain types (90%+), storage repos (90%+), agent use cases (90%+), security logic (90%+)

---

## 8. Test Execution Order

### CI Pipeline (per PR)

```
1. typecheck     → tsc --noEmit
2. lint          → eslint . --max-warnings 0
3. format        → prettier --check .
4. unit+integ    → vitest run (343+ tests)
5. coverage      → vitest run --coverage (90% gate)
6. mutation      → stryker run (80% gate) [after quality]
7. e2e           → playwright test (macOS) [after quality]
```

### Local Development (pre-commit)

```
lint-staged + tsc --noEmit + vitest related --run (~15-40s)
```

---

## 9. Scoring Summary

### Current Test Maturity

| Dimension | Score | Notes |
|-----------|-------|-------|
| Unit test coverage (files) | 8/10 | 62 files, missing agent-ipc-handler |
| Integration coverage | 6/10 | 5 files, missing IPC roundtrip + crash recovery |
| E2E coverage | 4/10 | 1 spec, missing error recovery + session resume |
| Fixture architecture | 8/10 | Just created; needs adoption in existing tests |
| CI pipeline | 7/10 | Just improved; mutation + E2E added |
| Risk coverage | 7/10 | P0/P1 well covered, P2 gaps in cross-session + writeback |

**Overall Test Maturity: 67/100 (B- Acceptable)**

### Target After Addressing Gaps

| Dimension | Current | Target | Actions Needed |
|-----------|---------|--------|----------------|
| Unit | 8/10 | 9/10 | +1 test file (agent-ipc-handler) |
| Integration | 6/10 | 8/10 | +3 test files (IPC roundtrip, crash recovery, key lifecycle) |
| E2E | 4/10 | 7/10 | +3 spec files (error recovery, session resume, confirm flow) |
| Overall | 67/100 | 80/100 | Close 5 critical gaps + 4 important gaps |

---

## 10. Next Steps (Priority Order)

1. **Create `agent-ipc-handler.test.ts`** — Unit tests for the new IPC handler (P1)
2. **Create `ipc-roundtrip.test.ts`** — Integration test for full message flow (P1)
3. **Create `session-crash-recovery.test.ts`** — Simulate crash, verify recovery (P1)
4. **Create `api-key-lifecycle.test.ts`** — End-to-end key management flow (P1)
5. **Create `error-recovery.spec.ts`** — E2E test for error → retry flow (P2)
6. **Create `session-resume.spec.ts`** — E2E test for close → reopen → resume (P2)
7. **Adopt fixture/factory layer** — Refactor existing tests to use shared fixtures (P2)
8. **Split Vitest workspace** — Three environments per CLAUDE.md (P3)
9. **Add Stryker config** — `stryker.config.mjs` for mutation testing gate (P3)

---

## Appendix A: Requirement Coverage Matrix

### P0 Requirements Coverage

| Req | Description | Unit | Integration | E2E | Covered? |
|-----|-------------|------|-------------|-----|----------|
| FR20 | Confirm destructive actions | ConfirmPlan.test | — | — | YES |
| FR29 | Audit trail all fields | audit-entry.test | audit-trail.test | — | YES |
| FR32 | Session survives crash | session.test | session-lifecycle.test | — | PARTIAL |
| FR39 | Admin privilege check | admin-check.test | — | electron-app.spec | YES |
| NFR6 | API key in OS credential store | safe-storage-key-manager.test | — | — | YES |
| NFR8 | File access scoped to workspace | — | sdk-executable-path.test | — | YES |
| NFR9 | TLS 1.2+ | — | — | — | NOT TESTED |

### P1 Requirements Coverage (Sampling)

| Req | Description | Covered? | Test File(s) |
|-----|-------------|----------|-------------|
| FR2 | Avatar animated, not static | YES | AvatarCanvas.test |
| FR3 | 3 animation states | YES | useAvatarState.test |
| FR6 | Voice via microphone | YES | web-speech-stt.test |
| FR8 | Text input co-equal | YES | TextInput.test, ConversationView.test |
| FR10 | Natural language → agent | PARTIAL | claude-sdk-backend.test |
| FR17 | Visual feedback while working | YES | StatusIndicator.test |
| FR27 | Log all actions with timestamp | YES | audit-entry.test |
| FR34 | Non-technical error messages | YES | error-pipeline.test |
| FR40 | API key entry + validation | YES | ApiKeySetup.test |
| FR42 | Combined launch state assessment | YES | useSetupRouter.test |
| FR43 | Task progress view | YES | TaskProgress.test |
| FR52 | Workspace selection | YES | WorkspaceSelection.test |

---

**Generated By**: Murat (BMad TEA Agent — Test Architect)
**Workflow**: testarch-test-design (System-Level Mode)
**Timestamp**: 2026-03-28
