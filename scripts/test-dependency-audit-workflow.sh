#!/usr/bin/env bash
# Regression guard: assert that dependency-audit.yml keeps the centrally-owned
# invariants its own header marks as MUST-NOT-CHANGE. The file is a thin caller
# stub for the org reusable
# petry-projects/.github/.github/workflows/dependency-audit-reusable.yml; the
# ecosystem-detection and audit logic lives there, not here.
#
# Context (compliance audit #519): the stub's `on:` surface drifted from the
# canonical standards/workflows/dependency-audit.yml — the `merge_group` trigger
# was dropped. `merge_group` is part of the standard trigger set: it is required
# so this stub's `dependency-audit / Detect ecosystems` check reports on a merge
# queue's `gh-readonly-queue/*` ref. Losing it silently removes the required
# status check from merge-queue runs. The `on:` triggers, `permissions:` grant,
# and job name are owned centrally and are not repo-adjustable; only the
# documented tier channel pin on the `uses:` ref may differ per repo. This guard
# locks the centrally-owned surface in, mirroring the sibling Fleet Monitor
# guards (test-dependabot-rebase-workflow.sh, test-pr-review-workflow.sh #374,
# test-ci-workflow.sh #380).
#
# Run: bash scripts/test-dependency-audit-workflow.sh
set -euo pipefail

WORKFLOW="${1:-.github/workflows/dependency-audit.yml}"
JOB="dependency-audit"
REUSABLE_PREFIX="petry-projects/.github/.github/workflows/dependency-audit-reusable.yml@"
PASS=true

echo "=== test-dependency-audit-workflow ($WORKFLOW) ==="

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

# ── Check 2a: no duplicate mapping keys anywhere in the file ───────────────
# `yq` silently keeps the LAST value of a duplicated key, so a file with two `on:`
# or `jobs:` blocks would let every later assertion inspect only the final
# (canonical-looking) block while GitHub rejects duplicate workflow keys outright
# and the required audit never starts. Use a duplicate-aware loader (PyYAML).
if ! command -v python3 &> /dev/null || ! python3 -c 'import yaml' &> /dev/null; then
  echo "FAIL: python3 with PyYAML is required to detect duplicate YAML keys but was not found."
  exit 1
fi
if ! python3 -I - "$WORKFLOW" <<'PY'
import sys
import yaml


class UniqueKeyLoader(yaml.SafeLoader):
    pass


def construct_mapping(loader, node, deep=False):
    seen = set()
    for key_node, _ in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in seen:
            raise yaml.constructor.ConstructorError(
                None, None, "duplicate mapping key %r" % (key,), key_node.start_mark
            )
        seen.add(key)
    return yaml.SafeLoader.construct_mapping(loader, node, deep)


UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, construct_mapping
)

with open(sys.argv[1], encoding="utf-8") as fh:
    yaml.load(fh, Loader=UniqueKeyLoader)
PY
then
  echo "FAIL: $WORKFLOW contains duplicate mapping keys (GitHub rejects the workflow; yq would mask them)"
  exit 1
fi
echo "PASS: $WORKFLOW has no duplicate mapping keys"

# ── Check 2b: the top-level mapping is EXACTLY the canonical key set ─────────
# The canonical stub has only `name`, `on`, `permissions`, and `jobs` at the top
# level. Any additional top-level key is drift — in particular a workflow-level
# execution-control key such as `concurrency:` (e.g.
# `concurrency: { group: dependency-audit, cancel-in-progress: true }`) would let
# a newer PR/push/merge-queue run cancel unrelated in-progress audits sharing that
# constant group, leaving their required checks cancelled instead of successful.
# The workflow `name` is also centrally owned (it is the identity shown in the
# Actions UI), so assert its exact value as well as the key set.
# Job-level exactness (Check 3b) and the per-mapping assertions on `permissions:`
# and `on:` do not see top-level keys, so assert the whole top-level surface here.
# Also rejects `defaults:`, `env:`, `run-name:`, and any other grafted-on key.
top_keys=""
if ! top_keys=$(yq -o=json -I=0 'keys | sort' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse top-level keys in $WORKFLOW"
  PASS=false
fi
if [[ "$top_keys" != '["jobs","name","on","permissions"]' ]]; then
  echo "FAIL: top-level mapping must be exactly name/on/permissions/jobs — no concurrency/defaults/env/run-name or other workflow-level keys (found keys: $top_keys) in $WORKFLOW"
  PASS=false
else
  echo "PASS: top-level mapping is exactly the canonical name/on/permissions/jobs"
fi

wf_name=""
if ! wf_name=$(yq '.name' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse workflow name in $WORKFLOW"
  PASS=false
fi
if [[ "$wf_name" != "Dependency audit" ]]; then
  echo "FAIL: workflow 'name' must be exactly 'Dependency audit' (found: '$wf_name') in $WORKFLOW"
  PASS=false
else
  echo "PASS: workflow name is exactly 'Dependency audit'"
fi

# ── Check 2c: the `jobs:` mapping contains EXACTLY the one caller job ────────
# Check 3b only inspects the named job, so an additional job grafted alongside it
# (with its own steps and permissions) would run on every PR/push/merge-queue
# event and still pass. Assert the complete jobs mapping is just `{ JOB }`.
jobs_keys=""
if ! jobs_keys=$(yq -o=json -I=0 '.jobs | keys' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse jobs keys in $WORKFLOW"
  PASS=false
fi
if [[ "$jobs_keys" != "[\"${JOB}\"]" ]]; then
  echo "FAIL: 'jobs' must contain exactly the '$JOB' job — no additional jobs (found keys: $jobs_keys) in $WORKFLOW"
  PASS=false
else
  echo "PASS: 'jobs' contains exactly the '$JOB' job"
fi

# ── Check 3: job `uses` is the org reusable pinned to an approved channel tag ─
# The ref must be one of the explicitly supported moving channels below — never
# @main, a bare SHA, a frozen @vN, or a lexically plausible but non-existent tag
# (e.g. v999-ring999). Add a channel here only once it exists in the central repo.
# The tier channel pin is the one part of this stub that may differ per repo.
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
  approved_channels=(
    dependency-audit/stable
    dependency-audit/next
    dependency-audit/v2-stable
    dependency-audit/v2-ring0
    dependency-audit/v2-ring1
    dependency-audit/v2-ring2
  )
  channel_ok=false
  for approved in "${approved_channels[@]}"; do
    if [[ "$channel_ref" == "$approved" ]]; then
      channel_ok=true
    fi
  done
  if [[ "$channel_ok" != "true" ]]; then
    echo "FAIL: job 'uses' channel '$channel_ref' is not a recognized approved channel in $WORKFLOW"
    echo "      Approved: ${approved_channels[*]} — not @main, a SHA, or an arbitrary tag."
    PASS=false
  else
    echo "PASS: job 'uses' rides the dependency-audit channel"
  fi
fi

# ── Check 3b: the caller job is EXACTLY the canonical `{ uses: … }` mapping ──
# The stub's job carries a single key, `uses`. Any other key is drift: an
# execution-control key (`if:`, `strategy:`) can disable or throttle the caller
# job while the approved `uses:`, triggers, and permissions all still validate —
# so `if: false` would silently skip the required dependency audit yet this guard
# would still report success. A `with:`/`secrets:` forward, or a job-level
# `permissions:` widening the reusable's authority, is likewise centrally owned
# and not repo-adjustable. Assert the complete job mapping is just `{ uses }`.
job_keys=""
if ! job_keys=$(yq -o=json -I=0 ".jobs[\"${JOB}\"] | keys" "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse job keys in $WORKFLOW"
  PASS=false
fi
if [[ "$job_keys" != '["uses"]' ]]; then
  echo "FAIL: job '$JOB' must contain exactly the 'uses' key — no if/with/secrets/permissions/strategy (found keys: $job_keys) in $WORKFLOW"
  PASS=false
else
  echo "PASS: job '$JOB' is exactly the canonical '{ uses }' mapping"
fi

# ── Check 4: top-level permissions grant exactly the reusable's read scope ──
# The centrally-owned grant is `contents: read` and nothing else; a reusable can
# be granted no more permission than the caller holds, so any additional
# top-level permission (e.g. `actions: write`, `pull-requests: write`) is drift
# and must fail — not just an incorrect `contents` value.
perm_keys=""
if ! perm_keys=$(yq -o=json -I=0 '.permissions | keys' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse permissions in $WORKFLOW"
  PASS=false
fi
contents=""
if ! contents=$(yq '.permissions.contents' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse permissions.contents in $WORKFLOW"
  PASS=false
fi
if [[ "$perm_keys" != '["contents"]' ]]; then
  echo "FAIL: top-level 'permissions' must contain exactly 'contents' (found keys: $perm_keys) in $WORKFLOW"
  PASS=false
elif [[ "$contents" != "read" ]]; then
  echo "FAIL: top-level permission 'contents' must be 'read' (found: '$contents') in $WORKFLOW"
  PASS=false
else
  echo "PASS: top-level permissions grant exactly 'contents: read'"
fi

# The caller job must not carry its own `permissions:` block: a job-level grant
# overrides the top-level one and would widen the reusable's authority past the
# read-only scope while Check 4's top-level assertion still passed. The canonical
# stub sets no job-level permissions.
job_perms=""
if ! job_perms=$(yq ".jobs[\"${JOB}\"].permissions" "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse job permissions in $WORKFLOW"
  PASS=false
fi
if [[ "$job_perms" != "null" ]]; then
  echo "FAIL: job '$JOB' must not set its own 'permissions:' (found: '$job_perms') in $WORKFLOW"
  PASS=false
else
  echo "PASS: job '$JOB' sets no overriding job-level permissions"
fi

# ── Check 5: the centrally-owned `on:` trigger surface is intact ────────────
# pull_request and push gate merges to main; merge_group is required so the
# required status check reports on a merge queue's gh-readonly-queue/* ref.
# None of these may be dropped on sync (see standards/ci-standards.md).
for trig in pull_request push merge_group; do
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

# The trigger surface must be EXACTLY these three events — no additional events
# (e.g. workflow_dispatch, schedule) may be grafted on, since the `on:` surface
# is centrally owned. Adding an event is drift even though each required key
# above still exists.
on_keys=""
if ! on_keys=$(yq -o=json -I=0 '.on | keys | sort' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse triggers in $WORKFLOW"
  PASS=false
fi
if [[ "$on_keys" != '["merge_group","pull_request","push"]' ]]; then
  echo "FAIL: 'on:' must contain exactly pull_request, push, merge_group (found keys: $on_keys) in $WORKFLOW"
  PASS=false
else
  echo "PASS: 'on:' trigger surface is exactly pull_request, push, merge_group"
fi

# merge_group must be the canonical EMPTY mapping (`merge_group:` with no body).
# Key presence alone is not enough: `merge_group: { types: [] }` cannot select
# the default `checks_requested` activity, so the required audit never runs for
# merge-queue events even though the key exists. GitHub defaults an empty
# merge_group to `checks_requested`; any explicit body is drift.
merge_group_val=""
if ! merge_group_val=$(yq -o=json -I=0 '.on.merge_group' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse 'merge_group' mapping in $WORKFLOW"
  PASS=false
fi
if [[ "$merge_group_val" != "null" ]]; then
  echo "FAIL: 'merge_group' must be the canonical empty mapping (no body) so it selects the default 'checks_requested' activity (found: '$merge_group_val') in $WORKFLOW"
  PASS=false
else
  echo "PASS: 'merge_group' is the canonical empty mapping"
fi

# pull_request and push must carry ONLY a `branches` filter — extra filters such
# as `paths:` or `types:` narrow when the required check reports and are drift.
for trig in pull_request push; do
  trig_keys=""
  if ! trig_keys=$(yq -o=json -I=0 ".on.${trig} | keys" "$WORKFLOW" 2>/dev/null); then
    echo "FAIL: yq failed to parse '$trig' filters in $WORKFLOW"
    PASS=false
  fi
  if [[ "$trig_keys" != '["branches"]' ]]; then
    echo "FAIL: '$trig' trigger must carry only a 'branches' filter (found keys: $trig_keys) in $WORKFLOW"
    PASS=false
  else
    echo "PASS: '$trig' trigger carries only a 'branches' filter"
  fi
done

# The branches filter is centrally owned and must be the canonical array exactly
# `[main]` — not merely a pattern set whose final evaluation happens to include
# main. `branches: ['*']`, `[main, develop]`, or `[main, '!main']` all differ
# from the canonical surface (they widen or invert when the required check
# reports) and are drift, so compare each array directly against `["main"]`.
for trig in pull_request push; do
  branches_json=""
  if ! branches_json=$(yq -o=json -I=0 ".on.${trig}.branches" "$WORKFLOW" 2>/dev/null); then
    echo "FAIL: yq failed to parse $trig branches in $WORKFLOW"
    PASS=false
  fi
  if [[ "$branches_json" != '["main"]' ]]; then
    echo "FAIL: '$trig' trigger 'branches' must be exactly [main] (found: $branches_json) in $WORKFLOW"
    PASS=false
  else
    echo "PASS: '$trig' trigger 'branches' is exactly [main]"
  fi
done

echo ""
if [[ "$PASS" == "true" ]]; then
  echo "All checks passed."
else
  echo "One or more checks failed."
  exit 1
fi
