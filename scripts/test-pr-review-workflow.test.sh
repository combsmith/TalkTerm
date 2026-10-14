#!/usr/bin/env bash
# test-pr-review-workflow.test.sh — portable tests for the pr-review.yml
# regression guard (scripts/test-pr-review-workflow.sh). The guard asserts the
# invariants that keep the PR Review workflow's Fleet Monitor failure rate low:
# a head-SHA concurrency lane with cancel-in-progress: false (#374) AND a
# review-job guard that skips Dependabot-triggered runs (#465). Dependabot
# events read the separate Dependabot secret store, so `secrets: inherit`
# forwards empty PAT/OAuth secrets and the reusable's auth-scope check fails;
# skipping the job makes those runs neutral instead of failed.
# No bats dependency: the guard is driven as a subprocess against temporary
# fixture workflows.
# Run: bash scripts/test-pr-review-workflow.test.sh
set -euo pipefail

if ! SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; then
  echo "FAIL: Failed to determine script directory" >&2
  exit 1
fi
GUARD="${SCRIPT_DIR}/test-pr-review-workflow.sh"

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

# ── Fixture builder ─────────────────────────────────────────────────────────
# Emits a minimal pr-review caller with a valid head-SHA concurrency lane
# (cancel-in-progress: false). The review job's `if:` guard is parameterised so
# each case isolates exactly the Dependabot-skip invariant (Check 5). Passing an
# empty string omits the guard entirely.
write_workflow() {
  local file="$1"
  local job_if="${2-}"
  cat > "$file" <<'YAML'
name: PR Review Agent
on:
  pull_request:
    types: [opened, synchronize]
permissions: {}
concurrency:
  group: >-
    pr-review-${{
      github.event.pull_request.head.sha ||
      github.run_id }}
  cancel-in-progress: false
jobs:
  review:
YAML
  if [[ -n "$job_if" ]]; then
    printf '    if: %s\n' "$job_if" >> "$file"
  fi
  cat >> "$file" <<'YAML'
    permissions:
      contents: read
      pull-requests: write
      checks: read
    uses: petry-projects/.github-private/.github/workflows/pr-review.yml@pr-review/stable
    secrets: inherit
YAML
}

run_guard() {
  local file="$1"
  bash "$GUARD" "$file" >/dev/null 2>&1
}

# ── Case 1: the real workflow is accepted ──────────────────────────────────
real="${SCRIPT_DIR}/../.github/workflows/pr-review.yml"
if run_guard "$real"; then
  pass "the checked-in .github/workflows/pr-review.yml is accepted"
else
  fail "the checked-in .github/workflows/pr-review.yml should be ACCEPTED"
fi

# ── Case 2: a valid synthesized caller (Dependabot guard present) is accepted ─
good="${TMP}/good.yml"
write_workflow "$good" "\${{ github.actor != 'dependabot[bot]' }}"
if run_guard "$good"; then
  pass "review job guarded on github.actor != dependabot[bot] is accepted"
else
  fail "a review job with the Dependabot skip guard should be ACCEPTED"
fi

# ── Case 3: a review job with NO if: guard is rejected ─────────────────────
noif="${TMP}/no-if.yml"
write_workflow "$noif" ""
if run_guard "$noif"; then
  fail "a review job with no Dependabot skip guard should be REJECTED"
else
  pass "a review job with no Dependabot skip guard is rejected"
fi

# ── Case 4: an if: guard that never references dependabot[bot] is rejected ──
wrongactor="${TMP}/wrong-actor.yml"
write_workflow "$wrongactor" "\${{ github.actor != 'github-actions[bot]' }}"
if run_guard "$wrongactor"; then
  fail "an if: guard not referencing dependabot[bot] should be REJECTED"
else
  pass "an if: guard not referencing dependabot[bot] is rejected"
fi

# ── Case 5: an if: that references dependabot[bot] but does NOT negate it ───
# e.g. running ONLY on Dependabot (== instead of !=) — the exact inversion of
# the intended skip. Must be rejected.
inverted="${TMP}/inverted.yml"
write_workflow "$inverted" "\${{ github.actor == 'dependabot[bot]' }}"
if run_guard "$inverted"; then
  fail "an if: that runs only on dependabot[bot] (== not !=) should be REJECTED"
else
  pass "an if: that runs only on dependabot[bot] (== not !=) is rejected"
fi

# ── Case 6: the concurrency invariant is still enforced (regression, #374) ──
# Drop cancel-in-progress to confirm the pre-existing checks were not weakened
# by the Dependabot guard addition.
nocancel="${TMP}/no-cancel.yml"
write_workflow "$nocancel" "\${{ github.actor != 'dependabot[bot]' }}"
# Flip cancel-in-progress: false -> true.
sed 's/cancel-in-progress: false/cancel-in-progress: true/' "$nocancel" > "${nocancel}.tmp" && mv "${nocancel}.tmp" "$nocancel"
if run_guard "$nocancel"; then
  fail "cancel-in-progress: true should be REJECTED (concurrency invariant)"
else
  pass "cancel-in-progress: true is rejected (concurrency invariant intact)"
fi

# ── Case 7: a missing workflow file fails cleanly ──────────────────────────
if run_guard "${TMP}/does-not-exist.yml"; then
  fail "a missing workflow file should be REJECTED"
else
  pass "a missing workflow file is rejected"
fi

# ── Case 8: an always-true if: guard is rejected ───────────────────────────
# "${{ github.actor != 'dependabot[bot]' || github.actor == 'dependabot[bot]' }}"
# contains both required tokens so old regex checks passed it, but the
# condition is always true — Dependabot runs are NOT skipped. The exact-match
# check must reject it.
alwaystrue="${TMP}/always-true.yml"
write_workflow "$alwaystrue" "\${{ github.actor != 'dependabot[bot]' || github.actor == 'dependabot[bot]' }}"
if run_guard "$alwaystrue"; then
  fail "an always-true if: guard should be REJECTED (counterexample for exact-match check)"
else
  pass "an always-true if: guard is rejected (exact-match check rejects always-true expressions)"
fi

echo ""
if [[ "$fails" -eq 0 ]]; then
  echo "All tests passed."
  exit 0
fi
echo "$fails test(s) failed." >&2
exit 1
