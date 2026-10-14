#!/usr/bin/env bash
# test-pr-auto-review-workflow.test.sh — portable tests for the pr-auto-review.yml
# regression guard (scripts/test-pr-auto-review-workflow.sh). Verifies the guard
# enforces the Dependabot-resilience invariant that keeps the PR Auto-Review
# workflow's Fleet Monitor failure rate low (#466): the reusable-calling job must
# carry a job-level `if:` that skips Dependabot `pull_request` events (which run
# without GH_PAT_WORKFLOWS and can never succeed), while keeping the thin-caller
# reusable ref intact. No bats dependency: the guard is driven as a subprocess
# against temporary fixture workflows.
# Run: bash scripts/test-pr-auto-review-workflow.test.sh
set -euo pipefail

SCRIPT_DIR=""
if ! SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; then
  echo "FAIL: Failed to determine script directory" >&2
  exit 1
fi
GUARD="${SCRIPT_DIR}/test-pr-auto-review-workflow.sh"

fails=0
pass() {
  local desc="$1"
  echo "ok   - $desc"
}
fail() {
  local desc="$1"
  echo "FAIL - $desc"
  fails=$((fails + 1))
}

# The guard uses yq to parse YAML. Without yq it exits early and these fixtures
# cannot be exercised, so skip cleanly rather than report noise.
if ! command -v yq >/dev/null 2>&1; then
  echo "SKIP: 'yq' not installed — cannot exercise the guard"
  exit 0
fi

TMP=""
if ! TMP="$(mktemp -d)"; then
  echo "FAIL: Failed to create temporary directory" >&2
  exit 1
fi
trap 'rm -rf "$TMP"' EXIT

# ── Fixture fragments ──────────────────────────────────────────────────────
# A valid header shared by every fixture: the on/permissions block plus the
# thin-caller job skeleton. The `if:` line and the `uses:` line vary per case.
write_fixture() {
  local file="$1" job_if="$2" uses="$3"
  {
    cat <<'YAML'
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
jobs:
  pr-auto-review:
YAML
    if [[ -n "$job_if" ]]; then
      printf '    if: >-\n      %s\n' "$job_if"
    fi
    cat <<'YAML'
    permissions:
      pull-requests: read
      checks: read
      actions: read
YAML
    printf '    uses: %s\n' "$uses"
    cat <<'YAML'
    secrets:
      GH_PAT_WORKFLOWS: ${{ secrets.GH_PAT_WORKFLOWS }}
YAML
  } > "$file"
}

REUSABLE_REF="petry-projects/.github/.github/workflows/pr-auto-review-reusable.yml@pr-auto-review/v1-ring1"
GOOD_IF="!(github.event_name == 'pull_request' && github.actor == 'dependabot[bot]')"

run_guard() {
  local file="$1"
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
good="${TMP}/good.yml"
write_fixture "$good" "$GOOD_IF" "$REUSABLE_REF"
if run_guard "$good"; then
  pass "a job with a Dependabot-scoped pull_request skip guard is accepted"
else
  fail "a valid Dependabot-skip guard should be ACCEPTED"
fi

# ── Case 3: a job with no `if:` guard is rejected ──────────────────────────
noif="${TMP}/no-if.yml"
write_fixture "$noif" "" "$REUSABLE_REF"
if run_guard "$noif"; then
  fail "a reusable-calling job with no 'if:' guard should be REJECTED"
else
  pass "a reusable-calling job with no 'if:' guard is rejected"
fi

# ── Case 4: an `if:` that never mentions dependabot is rejected ────────────
nodependabot="${TMP}/no-dependabot.yml"
write_fixture "$nodependabot" "github.event.pull_request.draft == false" "$REUSABLE_REF"
if run_guard "$nodependabot"; then
  fail "an 'if:' that does not exclude dependabot[bot] should be REJECTED"
else
  pass "an 'if:' that does not exclude dependabot[bot] is rejected"
fi

# ── Case 5: a guard not scoped to pull_request is rejected ─────────────────
# Excluding ALL dependabot events (no pull_request scope) would also silence the
# workflow_run / check_suite readiness paths that DO have the PAT — too broad.
unscoped="${TMP}/unscoped.yml"
write_fixture "$unscoped" "github.actor != 'dependabot[bot]'" "$REUSABLE_REF"
if run_guard "$unscoped"; then
  fail "a Dependabot skip not scoped to pull_request should be REJECTED"
else
  pass "a Dependabot skip not scoped to pull_request is rejected"
fi

# ── Case 6: a guard with no negation is rejected ───────────────────────────
# An `if:` that REQUIRES the Dependabot pull_request combination (no negation)
# inverts the intent — the job would run only on the failing event.
nonegation="${TMP}/no-negation.yml"
write_fixture "$nonegation" "github.event_name == 'pull_request' && github.actor == 'dependabot[bot]'" "$REUSABLE_REF"
if run_guard "$nonegation"; then
  fail "a guard with no negation (requires the failing event) should be REJECTED"
else
  pass "a guard with no negation is rejected"
fi

# ── Case 7: a stub that no longer references the reusable is rejected ───────
noreusable="${TMP}/no-reusable.yml"
write_fixture "$noreusable" "$GOOD_IF" "petry-projects/.github/.github/workflows/some-other-reusable.yml@main"
if run_guard "$noreusable"; then
  fail "a stub that no longer delegates to the reusable should be REJECTED"
else
  pass "a stub that no longer delegates to the reusable is rejected"
fi

# ── Case 8: a missing workflow file fails cleanly ──────────────────────────
if run_guard "${TMP}/does-not-exist.yml"; then
  fail "a missing workflow file should be REJECTED"
else
  pass "a missing workflow file is rejected"
fi

# ── Case 9: a reusable from a different org is rejected ─────────────────────
# A file with the correct name but a different owner must not satisfy the check.
difforg="${TMP}/diff-org.yml"
write_fixture "$difforg" "$GOOD_IF" "other-org/.github/.github/workflows/pr-auto-review-reusable.yml@pr-auto-review/v1-ring1"
if run_guard "$difforg"; then
  fail "a reusable from a different org should be REJECTED"
else
  pass "a reusable from a different org is rejected"
fi

# ── Case 10: two jobs calling the same reusable is rejected ─────────────────
# A second caller could bypass the if-guard entirely.
multicallers="${TMP}/multi-callers.yml"
{
  cat <<'YAML'
name: PR Auto-Review — Ready Check
on:
  pull_request:
    types: [opened]
permissions: {}
jobs:
  pr-auto-review-1:
    if: "!(github.event_name == 'pull_request' && github.actor == 'dependabot[bot]')"
    permissions:
      pull-requests: read
    uses: petry-projects/.github/.github/workflows/pr-auto-review-reusable.yml@pr-auto-review/v1-ring1
    secrets:
      GH_PAT_WORKFLOWS: ${{ secrets.GH_PAT_WORKFLOWS }}
  pr-auto-review-2:
    if: "!(github.event_name == 'pull_request' && github.actor == 'dependabot[bot]')"
    permissions:
      pull-requests: read
    uses: petry-projects/.github/.github/workflows/pr-auto-review-reusable.yml@pr-auto-review/v1-ring1
    secrets:
      GH_PAT_WORKFLOWS: ${{ secrets.GH_PAT_WORKFLOWS }}
YAML
} > "$multicallers"
if run_guard "$multicallers"; then
  fail "a workflow with multiple reusable callers should be REJECTED"
else
  pass "a workflow with multiple reusable callers is rejected"
fi

# ── Case 11: a guard with a stray negation (e.g. !false) is rejected ────────
# A bare ! not wrapping a group is too coarse to correctly exclude the
# Dependabot pull_request combination.
falsenegation="${TMP}/false-negation.yml"
write_fixture "$falsenegation" "!false && github.event_name == 'pull_request' && github.actor == 'dependabot[bot]'" "$REUSABLE_REF"
if run_guard "$falsenegation"; then
  fail "a guard with a stray negation (!false) should be REJECTED"
else
  pass "a guard with a stray negation (!false) is rejected"
fi

# ── Case 12: a guard scoped to non-Dependabot pull_request only is rejected ──
# "pull_request && actor != dependabot" passes the three simple keyword checks
# (contains dependabot[bot], pull_request, and !=) but silences workflow_run /
# check_suite readiness events entirely — the job would never run for those
# events and Dependabot PRs would never get an auto-review signal.
badinverted="${TMP}/bad-inverted.yml"
write_fixture "$badinverted" "github.event_name == 'pull_request' && github.actor != 'dependabot[bot]'" "$REUSABLE_REF"
if run_guard "$badinverted"; then
  fail "a guard scoping to non-Dependabot pull_request only should be REJECTED"
else
  pass "a guard scoping to non-Dependabot pull_request only is rejected"
fi

echo ""
if [[ "$fails" -eq 0 ]]; then
  echo "All tests passed."
  exit 0
fi
echo "$fails test(s) failed." >&2
exit 1
