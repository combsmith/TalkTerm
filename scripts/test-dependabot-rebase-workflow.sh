#!/usr/bin/env bash
# Regression guard: assert that dependabot-rebase.yml keeps the reliability- and
# security-critical invariants its own header marks as MUST-NOT-CHANGE. The file
# is a thin caller stub for the org reusable
# petry-projects/.github/.github/workflows/dependabot-rebase-reusable.yml; the
# rebase/merge-serialization logic lives there, not here.
#
# Context (Fleet Monitor #428): the single failing run tipping this workflow over
# the 10% threshold died on a *transient* GitHub-API TLS certificate error
# ("Post https://api.github.com/graphql: tls: failed to verify certificate")
# inside the reusable — infrastructure flakiness, not a caller defect, and not
# preventable here. The durable retry/backoff hardening belongs upstream in the
# reusable. What IS preventable in this repo is configuration drift in the stub:
# each invariant below, if lost, turns the workflow into a *hard* 100%-failure
# (e.g. dropping the permissions block breaks every reusable `gh` API call;
# repointing the `uses:` ref off its channel; dropping the App secrets breaks
# token generation). This guard locks those in, mirroring the convention of the
# sibling Fleet Monitor guards (test-pr-review-workflow.sh #374,
# test-ci-workflow.sh #380).
#
# Run: bash scripts/test-dependabot-rebase-workflow.sh
set -euo pipefail

WORKFLOW="${1:-.github/workflows/dependabot-rebase.yml}"
JOB="dependabot-rebase"
REUSABLE_PREFIX="petry-projects/.github/.github/workflows/dependabot-rebase-reusable.yml@"
PASS=true

echo "=== test-dependabot-rebase-workflow ($WORKFLOW) ==="

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

# ── Check 2: file is valid YAML ────────────────────────────────────────────
if ! yq '.' "$WORKFLOW" > /dev/null 2>&1; then
  echo "FAIL: yq failed to parse $WORKFLOW. Please check if it is valid YAML."
  exit 1
fi
echo "PASS: $WORKFLOW is valid YAML"

# ── Check 3: job `uses` is the org reusable pinned to an approved channel tag ─
# The ref must ride an approved moving channel (stable, next, or vN-ringN) —
# never @main, a bare SHA, a frozen @vN, or an arbitrary/unknown channel tag.
uses=""
if ! uses=$(yq ".jobs[\"${JOB}\"].uses" "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse job uses in $WORKFLOW"
  PASS=false
fi
if [[ "$uses" == "null" || -z "$uses" ]]; then
  echo "FAIL: job '$JOB' has no 'uses:' calling the org reusable in $WORKFLOW"
  PASS=false
elif [[ "$uses" != "${REUSABLE_PREFIX}"* ]]; then
  echo "FAIL: job 'uses' ($uses) does not reference the org reusable '${REUSABLE_PREFIX}...' in $WORKFLOW"
  PASS=false
else
  channel_ref="${uses#"${REUSABLE_PREFIX}"}"
  if [[ ! "$channel_ref" =~ ^dependabot-rebase/(stable|next|v[0-9]+-ring[0-9]+)$ ]]; then
    echo "FAIL: job 'uses' channel '$channel_ref' is not a recognized approved channel in $WORKFLOW"
    echo "      Approved: dependabot-rebase/(stable|next|v<N>-ring<N>) — not @main, a SHA, or an arbitrary tag."
    PASS=false
  else
    echo "PASS: job 'uses' rides the dependabot-rebase channel"
  fi
fi

# ── Check 4: job-level permissions grant the reusable's gh writes ──────────
# A reusable can be granted no more permission than the calling job holds;
# dropping either scope breaks the reusable's update-branch / re-approve calls.
contents=""
pulls=""
if ! contents=$(yq ".jobs[\"${JOB}\"].permissions.contents" "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse permissions.contents in $WORKFLOW"
  PASS=false
fi
if ! pulls=$(yq ".jobs[\"${JOB}\"].permissions[\"pull-requests\"]" "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse permissions.pull-requests in $WORKFLOW"
  PASS=false
fi
if [[ "$contents" != "write" ]]; then
  echo "FAIL: job permission 'contents' must be 'write' (found: '$contents') in $WORKFLOW"
  PASS=false
else
  echo "PASS: job permission 'contents: write' present"
fi
if [[ "$pulls" != "write" ]]; then
  echo "FAIL: job permission 'pull-requests' must be 'write' (found: '$pulls') in $WORKFLOW"
  PASS=false
else
  echo "PASS: job permission 'pull-requests: write' present"
fi

# ── Check 5: the GitHub App secrets are passed through ─────────────────────
# Without these the reusable's create-github-app-token step fails immediately.
# Validate the actual mapping value, not merely key presence.
for secret in APP_ID APP_PRIVATE_KEY; do
  val=""
  if ! val=$(yq ".jobs[\"${JOB}\"].secrets.${secret}" "$WORKFLOW" 2>/dev/null); then
    echo "FAIL: yq failed to parse secrets in $WORKFLOW"
    PASS=false
  fi
  expected="\${{ secrets.${secret} }}"
  if [[ "$val" != "$expected" ]]; then
    echo "FAIL: secret '$secret' mapping (found: '$val', expected: '$expected') in $WORKFLOW"
    PASS=false
  else
    echo "PASS: secret '$secret' is correctly mapped to secrets.${secret}"
  fi
done

# ── Check 6: concurrency serializes runs one-at-a-time ─────────────────────
# The merge chain assumes a single in-flight run; the group name is contract and
# cancel-in-progress must stay false so a mid-merge run is never interrupted.
group=""
cancel=""
if ! group=$(yq '.concurrency.group' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse concurrency.group in $WORKFLOW"
  PASS=false
fi
if ! cancel=$(yq '.concurrency.cancel-in-progress' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse concurrency.cancel-in-progress in $WORKFLOW"
  PASS=false
fi
if [[ "$group" != "dependabot-update-and-merge" ]]; then
  echo "FAIL: concurrency.group must be 'dependabot-update-and-merge' (found: '$group') in $WORKFLOW"
  PASS=false
else
  echo "PASS: concurrency.group is 'dependabot-update-and-merge'"
fi
if [[ "$cancel" != "false" ]]; then
  echo "FAIL: concurrency.cancel-in-progress must be 'false' (found: '$cancel') in $WORKFLOW"
  PASS=false
else
  echo "PASS: concurrency.cancel-in-progress is 'false'"
fi

# ── Check 7: all three triggers remain wired ───────────────────────────────
# push keeps the self-sustaining chain, schedule is the safety net, and
# workflow_dispatch allows manual queue flushes — none may be dropped.
for trig in push schedule workflow_dispatch; do
  has=""
  if ! has=$(yq ".on | has(\"${trig}\")" "$WORKFLOW" 2>/dev/null); then
    echo "FAIL: yq failed to parse triggers in $WORKFLOW"
    PASS=false
  fi
  if [[ "$has" != "true" ]]; then
    echo "FAIL: trigger '$trig' is missing from $WORKFLOW"
    PASS=false
  else
    echo "PASS: trigger '$trig' present"
  fi
done
# push must target main so merges to main re-arm the chain.
push_main=""
if ! push_main=$(yq '.on.push.branches | any_c(. == "main")' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse push branches in $WORKFLOW"
  PASS=false
fi
if [[ "$push_main" != "true" ]]; then
  echo "FAIL: 'push' trigger must include the 'main' branch in $WORKFLOW"
  PASS=false
else
  echo "PASS: 'push' trigger includes 'main'"
fi
# schedule must have the 4-hour safety net cron entry (non-empty, exact value).
cron_val=""
if ! cron_val=$(yq '.on.schedule[0].cron' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse schedule cron in $WORKFLOW"
  PASS=false
fi
if [[ "$cron_val" == "null" || -z "$cron_val" ]]; then
  echo "FAIL: schedule trigger must contain a non-empty cron entry in $WORKFLOW"
  PASS=false
elif [[ "$cron_val" != "0 */4 * * *" ]]; then
  echo "FAIL: schedule cron must be '0 */4 * * *' (found: '$cron_val') in $WORKFLOW"
  PASS=false
else
  echo "PASS: schedule cron is '0 */4 * * *'"
fi

echo ""
if [[ "$PASS" == "true" ]]; then
  echo "All checks passed."
else
  echo "One or more checks failed."
  exit 1
fi
