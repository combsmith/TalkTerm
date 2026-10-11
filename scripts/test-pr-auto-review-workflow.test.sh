#!/usr/bin/env bash
# test-pr-auto-review-workflow.test.sh — portable tests for the pr-auto-review.yml
# regression guard (scripts/test-pr-auto-review-workflow.sh). Verifies the guard
# enforces the event-dependent concurrency contract of the thin caller stub
# (#1126, #508): each of the check_suite / workflow_run group branches must be
# keyed on its own event's PR number (the canonical PR-number-only policy, with
# stricter head_sha / multi-PR forms also accepted), an event with no PR must fall
# back to a run-unique group (github.run_id), and cancel-in-progress must stay
# gated on those two events.
# No bats dependency: the guard is driven as a subprocess against temporary
# fixture workflows.
# Run: bash scripts/test-pr-auto-review-workflow.test.sh
set -euo pipefail

if ! SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; then
  echo "FAIL: Failed to determine script directory" >&2
  exit 1
fi
GUARD="${SCRIPT_DIR}/test-pr-auto-review-workflow.sh"

fails=0

# Report a passing test case with description.
pass() {
  local desc="$1"
  # Output test result in TAP-compatible format.
  echo "ok   - $desc"
}

# Report a failing test case, increment failure counter, and log to stderr.
fail() {
  local desc="$1"
  # Output test result and increment failure counter.
  echo "FAIL - $desc"
  fails=$((fails + 1))
}

# The guard uses yq to parse YAML (its Check 0). Without yq it exits early and
# these fixtures cannot be exercised, so skip cleanly rather than report noise.
if ! command -v yq >/dev/null 2>&1; then
  echo "SKIP: 'yq' not installed — cannot exercise the guard"
  exit 0
fi

if ! TMP="$(mktemp -d)"; then
  echo "FAIL: Failed to create temporary directory" >&2
  exit 1
fi
trap 'rm -rf "$TMP"' EXIT

# ── Fixture fragments ──────────────────────────────────────────────────────
# The invariant part shared by every fixture: name, triggers, permissions, and a
# minimal job. Each fixture supplies its own `concurrency:` block, which is what
# the guard inspects.

# Write the common workflow header (name, triggers, permissions) to a fixture file.
write_header() {
  local file="$1"
  # Generate fixture header with standard triggers and permissions block.
  cat > "$file" <<'YAML'
name: PR Auto-Review — Ready Check
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
  check_suite:
    types: [completed]
  pull_request_review:
    types: [submitted, dismissed]
  pull_request:
    types: [opened, reopened, synchronize, ready_for_review]
permissions: {}
YAML
}

# Append the common workflow footer (job definition) to a fixture file.
write_footer() {
  local file="$1"
  # Append fixture footer with standard job definition.
  cat >> "$file" <<'YAML'
jobs:
  pr-auto-review:
    runs-on: ubuntu-latest
    steps:
      - run: 'true'
YAML
}

# The correct, commit-scoped concurrency block: check_suite / workflow_run groups
# keyed on PR number AND head_sha, a multi-PR guard (pull_requests[1]) and a
# run-unique (github.run_id) fallback, with cancel-in-progress gated on the two
# default-branch-context events.

# Append a valid concurrency block (commit-scoped, multi-PR-guarded, with fallback).
append_good_concurrency() {
  local file="$1"
  # Append a correct concurrency config with PR+commit keying and proper fallbacks.
  cat >> "$file" <<'YAML'
concurrency:
  group: >-
    ${{
    (github.event_name == 'check_suite' && github.event.check_suite.pull_requests[0].number && !github.event.check_suite.pull_requests[1] && github.event.check_suite.head_sha)
    && format('pr-auto-review-ready-check-pr-{0}-{1}', github.event.check_suite.pull_requests[0].number, github.event.check_suite.head_sha)
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number && !github.event.workflow_run.pull_requests[1] && github.event.workflow_run.head_sha)
    && format('pr-auto-review-ready-check-pr-{0}-{1}', github.event.workflow_run.pull_requests[0].number, github.event.workflow_run.head_sha)
    || format('pr-auto-review-ready-check-unique-{0}', github.run_id)
    }}
  cancel-in-progress: ${{ github.event_name == 'check_suite' || github.event_name == 'workflow_run' }}
YAML
}

# The canonical org policy: groups keyed on PR number ONLY (no head_sha, no
# multi-PR guard), mirroring the synced standards stub.

# Append the canonical PR-number-only concurrency block.
append_concurrency_pr_number_only() {
  local file="$1"
  # Append the canonical policy fixture: PR-number-only keying.
  cat >> "$file" <<'YAML'
concurrency:
  group: >-
    ${{
    (github.event_name == 'check_suite' && github.event.check_suite.pull_requests[0].number)
    && format('pr-auto-review-ready-check-pr-{0}', github.event.check_suite.pull_requests[0].number)
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number)
    && format('pr-auto-review-ready-check-pr-{0}', github.event.workflow_run.pull_requests[0].number)
    || format('pr-auto-review-ready-check-unique-{0}', github.run_id)
    }}
  cancel-in-progress: ${{ github.event_name == 'check_suite' || github.event_name == 'workflow_run' }}
YAML
}

# The check_suite branch lost its PR number while the workflow_run branch keeps
# one: an unbounded match would still pass, so the guard must scope per branch.

# Append a regression concurrency block (check_suite branch not keyed on PR number).
append_concurrency_check_suite_unkeyed() {
  local file="$1"
  # Append regression fixture: only the workflow_run branch is keyed on a PR number.
  cat >> "$file" <<'YAML'
concurrency:
  group: >-
    ${{
    (github.event_name == 'check_suite' && github.event.check_suite.head_sha)
    && format('pr-auto-review-ready-check-sha-{0}', github.event.check_suite.head_sha)
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number)
    && format('pr-auto-review-ready-check-pr-{0}', github.event.workflow_run.pull_requests[0].number)
    || format('pr-auto-review-ready-check-unique-{0}', github.run_id)
    }}
  cancel-in-progress: ${{ github.event_name == 'check_suite' || github.event_name == 'workflow_run' }}
YAML
}

# Commit-scoped and multi-PR-guarded but with NO run-unique fallback: a no-PR
# event (fork / no PR) or a multi-PR event has no distinct slot to fall back to.

# Append a regression concurrency block (missing run-unique fallback).
append_concurrency_no_run_id_fallback() {
  local file="$1"
  # Append regression fixture: lacks fallback, so multi-PR events have no safety slot.
  cat >> "$file" <<'YAML'
concurrency:
  group: >-
    ${{
    (github.event_name == 'check_suite' && github.event.check_suite.pull_requests[0].number && !github.event.check_suite.pull_requests[1] && github.event.check_suite.head_sha)
    && format('pr-auto-review-ready-check-pr-{0}-{1}', github.event.check_suite.pull_requests[0].number, github.event.check_suite.head_sha)
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number && !github.event.workflow_run.pull_requests[1] && github.event.workflow_run.head_sha)
    && format('pr-auto-review-ready-check-pr-{0}-{1}', github.event.workflow_run.pull_requests[0].number, github.event.workflow_run.head_sha)
    || 'pr-auto-review-ready-check-shared'
    }}
  cancel-in-progress: ${{ github.event_name == 'check_suite' || github.event_name == 'workflow_run' }}
YAML
}

# A commit-scoped group but cancel-in-progress: true unconditionally, so a
# pull_request run on the PR head could be cancelled, leaving a cancelled
# `pr-auto-review / check-and-dispatch` check on the head.

# Append a regression concurrency block (unconditional cancel-in-progress).
append_concurrency_unconditional_cancel() {
  local file="$1"
  # Append regression fixture: cancels unconditionally, so PR-head runs get cancelled.
  cat >> "$file" <<'YAML'
concurrency:
  group: >-
    ${{
    (github.event_name == 'check_suite' && github.event.check_suite.pull_requests[0].number && !github.event.check_suite.pull_requests[1] && github.event.check_suite.head_sha)
    && format('pr-auto-review-ready-check-pr-{0}-{1}', github.event.check_suite.pull_requests[0].number, github.event.check_suite.head_sha)
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number && !github.event.workflow_run.pull_requests[1] && github.event.workflow_run.head_sha)
    && format('pr-auto-review-ready-check-pr-{0}-{1}', github.event.workflow_run.pull_requests[0].number, github.event.workflow_run.head_sha)
    || format('pr-auto-review-ready-check-unique-{0}', github.run_id)
    }}
  cancel-in-progress: true
YAML
}

# A commit-scoped group whose cancel-in-progress ANDs the two event names, so it
# is false for every event and cancellation is silently disabled.

# Append a regression concurrency block (contradictory '&&' cancel condition).
append_concurrency_contradictory_cancel() {
  local file="$1"
  # Append regression fixture: cancel condition can never be true.
  cat >> "$file" <<'YAML'
concurrency:
  group: >-
    ${{
    (github.event_name == 'check_suite' && github.event.check_suite.pull_requests[0].number && !github.event.check_suite.pull_requests[1] && github.event.check_suite.head_sha)
    && format('pr-auto-review-ready-check-pr-{0}-{1}', github.event.check_suite.pull_requests[0].number, github.event.check_suite.head_sha)
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number && !github.event.workflow_run.pull_requests[1] && github.event.workflow_run.head_sha)
    && format('pr-auto-review-ready-check-pr-{0}-{1}', github.event.workflow_run.pull_requests[0].number, github.event.workflow_run.head_sha)
    || format('pr-auto-review-ready-check-unique-{0}', github.run_id)
    }}
  cancel-in-progress: ${{ github.event_name == 'check_suite' && github.event_name == 'workflow_run' }}
YAML
}

# Both branches reference the PR number only in their condition; the resulting
# group is a constant, so every PR would share one cancelable group.

# Append a regression concurrency block (PR number not part of the group value).
append_concurrency_pr_number_not_in_group() {
  local file="$1"
  # Append regression fixture: PR number gates the branch but never reaches the key.
  cat >> "$file" <<'YAML'
concurrency:
  group: >-
    ${{
    (github.event_name == 'check_suite' && github.event.check_suite.pull_requests[0].number)
    && 'pr-auto-review-ready-check-shared'
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number)
    && 'pr-auto-review-ready-check-shared'
    || format('pr-auto-review-ready-check-unique-{0}', github.run_id)
    }}
  cancel-in-progress: ${{ github.event_name == 'check_suite' || github.event_name == 'workflow_run' }}
YAML
}

# Append nothing to the fixture (no concurrency block at all).
append_no_concurrency() {
  # No-op: the fixture contains only the header and footer.
  : # nothing — the fixture has only header + footer
}

# Invoke the regression guard script against a fixture file.
run_guard() {
  local file="$1"
  # Execute the guard script, suppressing output to check exit status.
  bash "$GUARD" "$file" >/dev/null 2>&1
}

# ── Case 1: the real workflow is accepted ──────────────────────────────────
real="${SCRIPT_DIR}/../.github/workflows/pr-auto-review.yml"
if run_guard "$real"; then
  pass "the checked-in .github/workflows/pr-auto-review.yml is accepted"
else
  fail "the checked-in .github/workflows/pr-auto-review.yml should be ACCEPTED"
fi

# ── Case 2: a valid synthesized workflow is accepted ───────────────────────
good="${TMP}/par-good.yml"
write_header "$good"
append_good_concurrency "$good"
write_footer "$good"
if run_guard "$good"; then
  pass "commit-scoped group with multi-PR + run-unique fallback is accepted"
else
  fail "a valid commit-scoped concurrency block should be ACCEPTED"
fi

# ── Case 3: the canonical PR-number-only group is accepted ─────────────────
nosha="${TMP}/par-pr-number-only.yml"
write_header "$nosha"
append_concurrency_pr_number_only "$nosha"
write_footer "$nosha"
if run_guard "$nosha"; then
  pass "the canonical PR-number-only group is accepted"
else
  fail "the canonical PR-number-only group should be ACCEPTED"
fi

# ── Case 4: a check_suite branch not keyed on the PR number is rejected ────
nomulti="${TMP}/par-check-suite-unkeyed.yml"
write_header "$nomulti"
append_concurrency_check_suite_unkeyed "$nomulti"
write_footer "$nomulti"
if run_guard "$nomulti"; then
  fail "a check_suite branch not keyed on the PR number should be REJECTED"
else
  pass "a check_suite branch not keyed on the PR number is rejected"
fi

# ── Case 5: missing run-unique (github.run_id) fallback is rejected ────────
norunid="${TMP}/par-no-run-id.yml"
write_header "$norunid"
append_concurrency_no_run_id_fallback "$norunid"
write_footer "$norunid"
if run_guard "$norunid"; then
  fail "a group with no run-unique (github.run_id) fallback should be REJECTED"
else
  pass "a group with no run-unique (github.run_id) fallback is rejected"
fi

# ── Case 5b: run ID as an unused arg with a constant fallback is rejected ──
unusedrunid="${TMP}/par-unused-run-id.yml"
write_header "$unusedrunid"
cat >> "$unusedrunid" <<'YAML'
concurrency:
  group: >-
    ${{
    (github.event_name == 'check_suite' && github.event.check_suite.pull_requests[0].number)
    && format('pr-auto-review-ready-check-pr-{0}', github.event.check_suite.pull_requests[0].number)
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number)
    && format('pr-auto-review-ready-check-pr-{0}', github.event.workflow_run.pull_requests[0].number)
    || format('pr-auto-review-ready-check-shared-{1}', 'x', github.run_id)
    }}
  cancel-in-progress: ${{ github.event_name == 'check_suite' || github.event_name == 'workflow_run' }}
YAML
write_footer "$unusedrunid"
if run_guard "$unusedrunid"; then
  fail "a fallback that does not use github.run_id as {0} should be REJECTED"
else
  pass "a fallback that does not use github.run_id as {0} is rejected"
fi

# ── Case 5c: PR number not selected by the placeholder is rejected ─────────
unusedpr="${TMP}/par-unused-pr.yml"
write_header "$unusedpr"
cat >> "$unusedpr" <<'YAML'
concurrency:
  group: >-
    ${{
    (github.event_name == 'check_suite' && github.event.check_suite.pull_requests[0].number)
    && format('pr-auto-review-ready-check-{0}', github.run_id, github.event.check_suite.pull_requests[0].number)
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number)
    && format('pr-auto-review-ready-check-pr-{0}', github.event.workflow_run.pull_requests[0].number)
    || format('pr-auto-review-ready-check-unique-{0}', github.run_id)
    }}
  cancel-in-progress: ${{ github.event_name == 'check_suite' || github.event_name == 'workflow_run' }}
YAML
write_footer "$unusedpr"
if run_guard "$unusedpr"; then
  fail "a group whose {0} placeholder is not the PR number should be REJECTED"
else
  pass "a group whose {0} placeholder is not the PR number is rejected"
fi

# ── Case 5d: run-unique suffix in a per-PR branch is rejected ──────────────
runsuffix="${TMP}/par-run-suffix.yml"
write_header "$runsuffix"
cat >> "$runsuffix" <<'YAML'
concurrency:
  group: >-
    ${{
    (github.event_name == 'check_suite' && github.event.check_suite.pull_requests[0].number)
    && format('pr-auto-review-ready-check-pr-{0}-{1}', github.event.check_suite.pull_requests[0].number, github.run_id)
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number)
    && format('pr-auto-review-ready-check-pr-{0}', github.event.workflow_run.pull_requests[0].number)
    || format('pr-auto-review-ready-check-unique-{0}', github.run_id)
    }}
  cancel-in-progress: ${{ github.event_name == 'check_suite' || github.event_name == 'workflow_run' }}
YAML
write_footer "$runsuffix"
if run_guard "$runsuffix"; then
  fail "a per-PR group with a run-unique suffix should be REJECTED"
else
  pass "a per-PR group with a run-unique suffix is rejected"
fi

# ── a branch not gated on its PR number ──
nopr_gate="${TMP}/par-nopr_gate.yml"
write_header "$nopr_gate"
cat >> "$nopr_gate" <<'YAML'
concurrency:
  group: >-
    ${{
    (github.event_name == 'check_suite') && format('pr-auto-review-ready-check-pr-{0}', github.event.check_suite.pull_requests[0].number)
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number)
    && format('pr-auto-review-ready-check-pr-{0}', github.event.workflow_run.pull_requests[0].number)
    || format('pr-auto-review-ready-check-unique-{0}', github.run_id)
    }}
  cancel-in-progress: ${{ github.event_name == 'check_suite' || github.event_name == 'workflow_run' }}
YAML
write_footer "$nopr_gate"
if run_guard "$nopr_gate"; then
  fail "a branch not gated on its PR number should be REJECTED"
else
  pass "a branch not gated on its PR number is rejected"
fi

# ── branches with different group formats ──
mixed_ns="${TMP}/par-mixed_ns.yml"
write_header "$mixed_ns"
cat >> "$mixed_ns" <<'YAML'
concurrency:
  group: >-
    ${{
    (github.event_name == 'check_suite' && github.event.check_suite.pull_requests[0].number)
    && format('check-{0}', github.event.check_suite.pull_requests[0].number)
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number)
    && format('run-{0}', github.event.workflow_run.pull_requests[0].number)
    || format('pr-auto-review-ready-check-unique-{0}', github.run_id)
    }}
  cancel-in-progress: ${{ github.event_name == 'check_suite' || github.event_name == 'workflow_run' }}
YAML
write_footer "$mixed_ns"
if run_guard "$mixed_ns"; then
  fail "branches with different group formats should be REJECTED"
else
  pass "branches with different group formats is rejected"
fi

# ── a group without expression delimiters ──
no_delims="${TMP}/par-no_delims.yml"
write_header "$no_delims"
cat >> "$no_delims" <<'YAML'
concurrency:
  group: >-
    (github.event_name == 'check_suite' && github.event.check_suite.pull_requests[0].number)
    && format('pr-auto-review-ready-check-pr-{0}', github.event.check_suite.pull_requests[0].number)
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number)
    && format('pr-auto-review-ready-check-pr-{0}', github.event.workflow_run.pull_requests[0].number)
    || format('pr-auto-review-ready-check-unique-{0}', github.run_id)
  cancel-in-progress: ${{ github.event_name == 'check_suite' || github.event_name == 'workflow_run' }}
YAML
write_footer "$no_delims"
if run_guard "$no_delims"; then
  fail "a group without expression delimiters should be REJECTED"
else
  pass "a group without expression delimiters is rejected"
fi

# ── a per-PR key containing an event-specific id ──
event_id="${TMP}/par-event_id.yml"
write_header "$event_id"
cat >> "$event_id" <<'YAML'
concurrency:
  group: >-
    ${{
    (github.event_name == 'check_suite' && github.event.check_suite.pull_requests[0].number)
    && format('pr-auto-review-ready-check-pr-{0}-{1}', github.event.check_suite.pull_requests[0].number, github.event.check_suite.id)
    || (github.event_name == 'workflow_run' && github.event.workflow_run.pull_requests[0].number)
    && format('pr-auto-review-ready-check-pr-{0}-{1}', github.event.workflow_run.pull_requests[0].number, github.event.workflow_run.id)
    || format('pr-auto-review-ready-check-unique-{0}', github.run_id)
    }}
  cancel-in-progress: ${{ github.event_name == 'check_suite' || github.event_name == 'workflow_run' }}
YAML
write_footer "$event_id"
if run_guard "$event_id"; then
  fail "a per-PR key containing an event-specific id should be REJECTED"
else
  pass "a per-PR key containing an event-specific id is rejected"
fi

# ── Case 6: unconditional cancel-in-progress is rejected ───────────────────
uncond="${TMP}/par-unconditional-cancel.yml"
write_header "$uncond"
append_concurrency_unconditional_cancel "$uncond"
write_footer "$uncond"
if run_guard "$uncond"; then
  fail "unconditional cancel-in-progress: true should be REJECTED"
else
  pass "unconditional cancel-in-progress: true is rejected"
fi

# ── Case 6b: contradictory '&&' cancel-in-progress is rejected ─────────────
contra="${TMP}/par-contradictory-cancel.yml"
write_header "$contra"
append_concurrency_contradictory_cancel "$contra"
write_footer "$contra"
if run_guard "$contra"; then
  fail "contradictory cancel-in-progress (check_suite && workflow_run) should be REJECTED"
else
  pass "contradictory cancel-in-progress (check_suite && workflow_run) is rejected"
fi

# ── Case 6c: PR number only in the condition, not in the group value ───────
notinkey="${TMP}/par-pr-number-not-in-group.yml"
write_header "$notinkey"
append_concurrency_pr_number_not_in_group "$notinkey"
write_footer "$notinkey"
if run_guard "$notinkey"; then
  fail "a group whose value does not include the PR number should be REJECTED"
else
  pass "a group whose value does not include the PR number is rejected"
fi

# ── Case 7: no concurrency block at all is rejected ────────────────────────
noconc="${TMP}/par-no-concurrency.yml"
write_header "$noconc"
append_no_concurrency "$noconc"
write_footer "$noconc"
if run_guard "$noconc"; then
  fail "a workflow with no concurrency block should be REJECTED"
else
  pass "a workflow with no concurrency block is rejected"
fi

# ── Case 8: a missing workflow file fails cleanly ──────────────────────────
if run_guard "${TMP}/does-not-exist.yml"; then
  fail "a missing workflow file should be REJECTED"
else
  pass "a missing workflow file is rejected"
fi

# ── Case 9: mutations of the checked-in workflow's group are rejected ─────
mutant_rejected() {
  local desc="$1" expr="$2" out="${TMP}/mutant.yml"
  sed "$expr" "$real" > "$out"
  if cmp -s "$real" "$out"; then
    fail "mutation did not apply: $desc"
  elif run_guard "$out"; then
    fail "$desc should be REJECTED"
  else
    pass "$desc is rejected"
  fi
}
mutant_rejected "escaped {{0}} placeholders in both group keys" \
  "s/ready-check-pr-{0}'/ready-check-pr-{{0}}'/"
mutant_rejected "an event-specific extra argument in one branch key" \
  "0,/ready-check-pr-{0}', github.event.check_suite.pull_requests\[0\].number/s//ready-check-pr-{0}-{1}', github.event.check_suite.pull_requests[0].number, github.event_name/"
mutant_rejected "a check_suite branch not gated on its event name" \
  "s/github.event_name == 'check_suite' \&\& github.event.check_suite.pull_requests\[0\].number)/github.event_name == 'push' \&\& github.event.check_suite.pull_requests[0].number)/"
mutant_rejected "an escaped {{0}} placeholder in the run_id fallback" \
  "s/unique-{0}'/unique-{{0}}'/"
mutant_rejected "a cancel-in-progress expression without the \${{ }} wrapper" \
  "s/cancel-in-progress: \${{ \(.*\) }}\$/cancel-in-progress: \1/"

echo ""
if [[ "$fails" -eq 0 ]]; then
  echo "All tests passed."
  exit 0
fi
echo "$fails test(s) failed." >&2
exit 1
