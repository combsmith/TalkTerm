#!/usr/bin/env bash
# Regression guard: assert that pr-review.yml matches the invariants of the org
# template it is synced from (combsmith/.github
# standards/workflows/pr-review.yml): a review job that skips Dependabot-
# triggered events (#465).
#
# Run: bash scripts/test-pr-review-workflow.sh
#
# Accepts an optional workflow path as $1 (defaults to the checked-in caller) so
# the companion test-of-guard (test-pr-review-workflow.test.sh) can drive it
# against fixtures.
set -euo pipefail

WORKFLOW="${1:-.github/workflows/pr-review.yml}"
PASS=true

echo "=== test-pr-review-workflow ==="

# ── Check 0: yq is available ───────────────────────────────────────────────
if ! command -v yq &> /dev/null; then
  echo "FAIL: 'yq' is required to parse YAML safely but was not found."
  exit 1
fi
echo "PASS: 'yq' is available"

# ── Check 1: file exists ───────────────────────────────────────────────────
if [[ ! -f "$WORKFLOW" ]]; then
  echo "FAIL: $WORKFLOW not found"
  exit 1
fi
echo "PASS: $WORKFLOW exists"

# ── Check 2: top-level concurrency block (report only) ─────────────────────
# The org template (combsmith/.github standards/workflows/pr-review.yml)
# has no stub-level block (the engine owns concurrency), while this repo's
# stub may still carry one until the standards sync lands. Both are accepted;
# the block is reported but never fails the guard (#533).
has_concurrency=$(yq 'has("concurrency")' "$WORKFLOW" 2>/dev/null || echo "error")
if [[ "$has_concurrency" == "false" ]]; then
  echo "PASS: no stub-level 'concurrency' block in $WORKFLOW"
elif [[ "$has_concurrency" == "true" ]]; then
  echo "INFO: top-level 'concurrency' block present in $WORKFLOW (allowed until the standards sync)"
else
  echo "FAIL: could not parse $WORKFLOW to check for a 'concurrency' block"
  PASS=false
fi

# ── Check 3: the review job skips Dependabot-triggered events ──────────────
# Dependabot-triggered runs read the separate Dependabot secret store, so
# `secrets: inherit` forwards empty PAT/OAuth secrets and the reusable's
# "Verify auth scopes" step fails outright (Fleet Monitor #465). Guarding the
# job on the triggering actor makes those runs skip (neutral) instead of
# failing. A human-initiated workflow_dispatch on a Dependabot PR still runs
# because github.actor is then the human.
job_if=""
if ! job_if=$(yq '.jobs.review.if' "$WORKFLOW" 2>/dev/null); then
  job_if=""
fi
EXPECTED_JOB_IF="\${{ github.actor != 'dependabot[bot]' }}"
if [[ "$job_if" == "null" || -z "$job_if" ]]; then
  echo "FAIL: 'jobs.review.if' guard is missing in $WORKFLOW"
  echo "      Add \"if: \${{ github.actor != 'dependabot[bot]' }}\" so Dependabot runs skip."
  PASS=false
elif [[ "$job_if" != "$EXPECTED_JOB_IF" ]]; then
  echo "FAIL: 'jobs.review.if' ($job_if) does not match the required Dependabot guard in $WORKFLOW"
  PASS=false
else
  echo "PASS: review job skips Dependabot-triggered events in $WORKFLOW"
fi

echo ""
if [[ "$PASS" == "true" ]]; then
  echo "All checks passed."
else
  echo "One or more checks failed."
  exit 1
fi
