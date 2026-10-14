#!/usr/bin/env bash
# Regression guard for pr-auto-review.yml. Locks the Dependabot-resilience
# invariant whose loss inflates the Fleet Monitor failure rate (#466):
#
#   pr-auto-review.yml is a thin caller stub that hands GH_PAT_WORKFLOWS to the
#   org reusable. Dependabot-triggered `pull_request` events, however, run against
#   the Dependabot secret store where that PAT is unavailable, so the secret
#   arrives empty and the reusable's authenticated checkout / gh calls fail at
#   startup with "Input required and not supplied: token". That event can NEVER
#   succeed, and a reusable cannot rescue a run it was handed no secret for — so
#   the caller MUST skip it with a job-level `if:` guard. Readiness for Dependabot
#   PRs is still evaluated via workflow_run (CI green) and check_suite, which run
#   in the base-repo context with full secrets. If that guard silently drifts
#   away, every Dependabot PR turns a green build red again and the workflow
#   degrades. This guard fails the build the moment that happens.
#
# It also asserts the thin-caller reusable ref stays intact so the stub keeps
# delegating to the org-level pr-auto-review reusable.
#
# Accepts an optional workflow path (default: .github/workflows/pr-auto-review.yml)
# so the checks can be exercised against fixtures — see
# test-pr-auto-review-workflow.test.sh.
# Run: bash scripts/test-pr-auto-review-workflow.sh
set -euo pipefail

WORKFLOW="${1:-.github/workflows/pr-auto-review.yml}"
REUSABLE="pr-auto-review-reusable"
REUSABLE_ORG_PATH="petry-projects/.github/.github/workflows"
PASS=true

echo "=== test-pr-auto-review-workflow ==="

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

# ── Check 2: the caller still delegates to the org reusable ────────────────
# Count every job that calls the pr-auto-review reusable. Exactly one caller
# must exist — a second caller could slip through without the if-guard, and
# zero means the stub has stopped delegating entirely.
caller_count=""
if ! caller_count=$(yq "
  [ (.jobs // {})[]
    | select((.uses // \"\") | test(\"${REUSABLE}\\.yml@\")) ] | length
" "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse $WORKFLOW. Please check if it is valid YAML."
  exit 1
fi
if [[ "$caller_count" -eq 0 ]]; then
  {
    echo "FAIL: no job in $WORKFLOW delegates to the '${REUSABLE}' reusable"
    echo "      The stub must keep 'uses: ${REUSABLE_ORG_PATH}/${REUSABLE}.yml@<ref>'."
  } >&2
  PASS=false
elif [[ "$caller_count" -gt 1 ]]; then
  echo "FAIL: $caller_count jobs in $WORKFLOW call the '${REUSABLE}' reusable — expected exactly one" >&2
  PASS=false
else
  uses_ref=""
  if ! uses_ref=$(yq "
    [ (.jobs // {})[]
      | select((.uses // \"\") | test(\"${REUSABLE}\\.yml@\")) ] | .[0].uses // \"\"
  " "$WORKFLOW" 2>/dev/null); then
    echo "FAIL: yq failed to parse $WORKFLOW. Please check if it is valid YAML."
    exit 1
  fi
  # Reject a ref from a different org that happens to share the filename.
  if [[ "$uses_ref" != "${REUSABLE_ORG_PATH}/"* ]]; then
    {
      echo "FAIL: reusable ref '$uses_ref' is not from the required org path"
      echo "      Expected prefix: ${REUSABLE_ORG_PATH}/"
    } >&2
    PASS=false
  else
    echo "PASS: caller delegates to the '${REUSABLE}' reusable in $WORKFLOW"
  fi
fi

# ── Check 3: the reusable-calling job carries an `if:` guard ────────────────
# The guard is what keeps a Dependabot `pull_request` event — which can never
# obtain the PAT — from ever entering (and failing) the job.
job_if=""
if ! job_if=$(yq "
  [ (.jobs // {})[]
    | select((.uses // \"\") | test(\"${REUSABLE}\\.yml@\"))
    | .if // \"\" ] | .[0] // \"\"
" "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse $WORKFLOW. Please check if it is valid YAML."
  exit 1
fi
if [[ -z "$job_if" || "$job_if" == "null" ]]; then
  {
    echo "FAIL: the reusable-calling job in $WORKFLOW has no 'if:' guard"
    echo "      Add a job-level 'if:' that skips Dependabot 'pull_request' events, e.g.:"
    echo "        if: \"!(github.event_name == 'pull_request' && github.actor == 'dependabot[bot]')\""
    echo "      Dependabot 'pull_request' events run without GH_PAT_WORKFLOWS and can"
    echo "      never succeed (Fleet Monitor #466)."
  } >&2
  PASS=false
else
  echo "PASS: reusable-calling job has an 'if:' guard in $WORKFLOW"

  # ── Check 4: the guard excludes Dependabot 'pull_request' events ─────────
  # The invariant has three parts, all required for the skip to be correct and
  # narrowly scoped:
  #   • references dependabot[bot]      — the actor that has no PAT
  #   • references pull_request         — the event that runs without the PAT
  #                                       (workflow_run / check_suite keep secrets,
  #                                       so they must NOT be disabled)
  #   • uses a negated group !( … )     — the combination is excluded, not required.
  #                                       Bare != can inadvertently scope the job to
  #                                       pull_request-only, silencing workflow_run
  #                                       and check_suite readiness paths.
  guard_ok=true
  if [[ "$job_if" != *"dependabot[bot]"* ]]; then
    echo "FAIL: the job 'if:' in $WORKFLOW does not reference 'dependabot[bot]'" >&2
    guard_ok=false
  fi
  if [[ "$job_if" != *"pull_request"* ]]; then
    {
      echo "FAIL: the job 'if:' in $WORKFLOW does not scope the skip to 'pull_request' events"
      echo "      Scope the exclusion to pull_request so workflow_run / check_suite"
      echo "      readiness (which DO have the PAT) keeps running for Dependabot PRs."
    } >&2
    guard_ok=false
  fi
  # Require a negated group !(…) rather than a bare ! or !=. A bare !=
  # expression (e.g. "pull_request && actor != 'dependabot[bot]'") passes the
  # actor and event checks but silences workflow_run / check_suite entirely.
  if [[ "$job_if" != *"!("* ]]; then
    {
      echo "FAIL: the job 'if:' in $WORKFLOW does not use a negated group !(…)"
      echo "      Use: !(github.event_name == 'pull_request' && github.actor == 'dependabot[bot]')"
      echo "      A bare != or stray ! does not correctly exclude the Dependabot"
      echo "      pull_request combination while keeping workflow_run / check_suite enabled."
      echo "      (found: $job_if)"
    } >&2
    guard_ok=false
  fi
  if [[ "$guard_ok" == "true" ]]; then
    echo "PASS: job 'if:' excludes Dependabot 'pull_request' events in $WORKFLOW"
  else
    PASS=false
  fi
fi

echo ""
if [[ "$PASS" == "true" ]]; then
  echo "All checks passed."
else
  echo "One or more checks failed."
  exit 1
fi
