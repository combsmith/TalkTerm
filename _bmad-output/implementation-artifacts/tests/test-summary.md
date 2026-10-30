# Test Automation Summary — Epic 13: Structured Question Input

**Generated:** 2026-03-29
**Feature:** FR57–FR59 (Structured Question Input)
**Framework:** Vitest (unit/component) + Playwright (E2E)

## Generated Tests

### Unit Tests — Domain Layer (Vitest)

- [x] `src/shared/types/domain/question-parser.test.ts` — Question detection, parsing, title extraction, suggestion parsing, edge cases
  - 14 test cases covering: detection threshold (1 vs 2+ questions), preamble extraction, bold title extraction, first-sentence fallback title, body with sub-items, dash-list suggestion parsing, 1-based indexing, realistic agent response, parenthesis numbering, trailing text, non-question numbered lists

### Component Tests — Renderer Layer (Vitest + React Testing Library)

- [x] `src/renderer/components/session/QuestionCardStack.test.tsx` — Card stack rendering, navigation, input, chips, submission
  - 18 test cases covering: first card rendering, question body, dot navigation count, answer textarea, Next/Back navigation, dot-click navigation, no Back on first question, Submit All on last, answer persistence across navigation, suggestion chip rendering, chip toggle, skip behavior, dot active state, answered dot state, submit flow, dismiss callback, accessible labels, textarea accessibility

- [x] `src/renderer/components/session/QuestionReview.test.tsx` — Review overlay rendering, edit, confirm
  - 10 test cases covering: all answers displayed, heading, answer count, skipped indicator, edit icons, edit callback with index, confirm callback, Edit button, avatar name in submit label, heading structure

### E2E Tests — Full Flow (Playwright)

- [x] `test/e2e/structured-questions.spec.ts` — End-to-end question detection, navigation, input, review, submission
  - 14 test cases across 6 test groups:
    - **Question Detection** (5): card stack appears, progress indicator, title, answer input, dot navigation
    - **Card Navigation** (3): Next, Back, dot click
    - **Answer Input** (2): typing, persistence across navigation
    - **Suggestion Chips** (2): rendering, toggle
    - **Review and Submit** (4): review overlay, all answers shown, edit returns to card, confirm sends and dismisses
    - **Skip Behavior** (1): skip advances
    - **Accessibility** (3): ARIA structure, dot button names, 32x32px click targets

## Coverage Matrix

| FR | What it Covers | Unit Tests | Component Tests | E2E Tests |
|---|---|---|---|---|
| FR57 | Question detection (2+ numbered Qs) | `question-parser.test.ts` (8 cases) | — | `structured-questions.spec.ts` (detection group) |
| FR58 | Card anatomy, chips, dot nav, skip | `question-parser.test.ts` (suggestions) | `QuestionCardStack.test.tsx` (18 cases) | `structured-questions.spec.ts` (nav, input, chips) |
| FR59 | Review overlay, aggregated submission, voice mode | — | `QuestionReview.test.tsx` (10 cases) | `structured-questions.spec.ts` (review group) |

## Coverage Gaps (To Address During Implementation)

| Gap | Reason | Recommended Action |
|---|---|---|
| Voice-guided flow (FR59 voice mode) | Requires STT/TTS mocking + ConversationView integration | Add to `ConversationView.test.tsx` when Story 13.4 is implemented |
| ConversationView integration | Parser detection in text event handler | Add to existing `ConversationView.test.tsx` when Story 13.5 is implemented |
| 10+ question scrollable dot nav | Edge case UI behavior | Add to `QuestionCardStack.test.tsx` when Story 13.2 handles this |
| Network loss with preserved answers | Requires network mock | Add to E2E `error-recovery.spec.ts` when Story 13.5 is implemented |
| Answer dismissal and re-open | Panel close/reopen with preserved state | Add to `ConversationView.test.tsx` when Story 13.5 is implemented |

## Test Execution Status

**Note:** These tests are test-first (TDD) — they define the coverage contract for Epic 13. They will fail until the corresponding implementation code is written. This is by design per the project's TDD workflow.

- Unit tests: **Will pass** once `question-parser.ts` is implemented (Story 13.1)
- Component tests: **Will pass** once `QuestionCardStack.tsx` and `QuestionReview.tsx` are implemented (Stories 13.2, 13.3)
- E2E tests: **Will pass** once full integration is complete (Story 13.5)

## Checklist Validation

- [x] Unit tests generated for domain logic
- [x] Component tests generated for UI components
- [x] E2E tests generated for full user flow
- [x] Tests use standard framework APIs (Vitest, React Testing Library, Playwright)
- [x] Tests cover happy path
- [x] Tests cover critical edge cases (1 question = no stack, skipped questions, non-question lists)
- [x] Tests use proper locators (semantic, accessible — roles, labels, data-testid)
- [x] Tests have clear descriptions
- [x] No hardcoded waits or sleeps (Playwright auto-waiting used)
- [x] Tests are independent (no inter-test state dependency within unit/component tests)
- [x] Test summary created with coverage metrics
- [x] Tests saved to appropriate co-located directories
- [ ] All tests pass — **Pending implementation** (TDD: tests written first)

## Next Steps

1. Implement Story 13.1 (`question-parser.ts`) — unit tests will pass
2. Implement Story 13.2 (`QuestionCardStack.tsx`) — component tests will pass
3. Implement Story 13.3 (`QuestionReview.tsx`) — review tests will pass
4. Implement Story 13.4 — add voice flow tests to ConversationView.test.tsx
5. Implement Story 13.5 — E2E tests will pass, add integration tests to ConversationView.test.tsx
6. Run full test suite to verify no regressions
