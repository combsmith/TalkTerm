#!/usr/bin/env bash
# test-dependency-audit-workflow.test.sh — portable tests for the
# dependency-audit.yml regression guard (scripts/test-dependency-audit-workflow.sh).
# The guard asserts the centrally-owned invariants of the thin caller stub: the
# `uses:` reusable pinned to an approved channel, exactly `contents: read`
# permissions with no job-level override, the caller job being exactly the
# canonical `{ uses }` mapping (no execution-control keys), and the exact `on:`
# trigger surface (pull_request/push on `[main]` plus an empty merge_group).
# Each case drives the guard against a temporary fixture and asserts that
# accepted stubs pass and drifted stubs are REJECTED — a guard whose checks
# silently no-op is otherwise indistinguishable from a working one until drift
# reaches prod.
# No bats dependency: the guard is driven as a subprocess against temporary
# fixture workflows.
# Run: bash scripts/test-dependency-audit-workflow.test.sh
set -euo pipefail

if ! SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; then
  echo "FAIL: Failed to determine script directory" >&2
  exit 1
fi
GUARD="${SCRIPT_DIR}/test-dependency-audit-workflow.sh"

fails=0

# Print a passed test line; increments the fail counter if output formatting changes.
pass() {
  local desc="$1"
  echo "ok   - $desc"
}

# Print a failed test line and increment the failure counter.
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
# Write the canonical dependency-audit caller stub to a file for testing.
write_canonical() {
  local file="$1"
  cat > "$file" <<'YAML'
name: Dependency audit
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  merge_group:
permissions:
  contents: read
jobs:
  dependency-audit:
    uses: petry-projects/.github/.github/workflows/dependency-audit-reusable.yml@dependency-audit/v2-ring1
YAML
}

# Run the regression guard against a workflow file and return its exit code.
run_guard() {
  local file="$1"
  bash "$GUARD" "$file" >/dev/null 2>&1
}

# ── Case 1: the real workflow is accepted ──────────────────────────────────
real="${SCRIPT_DIR}/../.github/workflows/dependency-audit.yml"
if run_guard "$real"; then
  pass "the checked-in .github/workflows/dependency-audit.yml is accepted"
else
  fail "the checked-in .github/workflows/dependency-audit.yml should be ACCEPTED"
fi

# ── Case 2: a synthesized canonical stub is accepted ───────────────────────
good="${TMP}/good.yml"
write_canonical "$good"
if run_guard "$good"; then
  pass "a canonical synthesized stub is accepted"
else
  fail "a canonical synthesized stub should be ACCEPTED"
fi

# ── Case 2b: the canonical v2-stable channel is accepted ───────────────────
v2stable="${TMP}/v2-stable.yml"
write_canonical "$v2stable"
yq -i '.jobs.dependency-audit.uses = "petry-projects/.github/.github/workflows/dependency-audit-reusable.yml@dependency-audit/v2-stable"' "$v2stable"
if run_guard "$v2stable"; then
  pass "a uses: on the canonical dependency-audit/v2-stable channel is accepted"
else
  fail "a uses: on dependency-audit/v2-stable should be ACCEPTED"
fi

# ── Case 3: `uses:` repointed off the approved channel is rejected ─────────
offchannel="${TMP}/off-channel.yml"
write_canonical "$offchannel"
yq -i '.jobs.dependency-audit.uses = "petry-projects/.github/.github/workflows/dependency-audit-reusable.yml@main"' "$offchannel"
if run_guard "$offchannel"; then
  fail "a uses: pinned to @main (off approved channel) should be REJECTED"
else
  pass "a uses: pinned off the approved channel is rejected"
fi

# ── Case 4: widened top-level permission (contents: write) is rejected ─────
writeperm="${TMP}/write-perm.yml"
write_canonical "$writeperm"
yq -i '.permissions.contents = "write"' "$writeperm"
if run_guard "$writeperm"; then
  fail "top-level contents: write should be REJECTED"
else
  pass "top-level contents: write is rejected"
fi

# ── Case 5: an extra top-level permission key is rejected ──────────────────
extraperm="${TMP}/extra-perm.yml"
write_canonical "$extraperm"
yq -i '.permissions.["pull-requests"] = "write"' "$extraperm"
if run_guard "$extraperm"; then
  fail "an extra top-level permission key should be REJECTED"
else
  pass "an extra top-level permission key is rejected"
fi

# ── Case 6: a job-level permissions override is rejected ───────────────────
jobperm="${TMP}/job-perm.yml"
write_canonical "$jobperm"
yq -i '.jobs.dependency-audit.permissions.contents = "write"' "$jobperm"
if run_guard "$jobperm"; then
  fail "a job-level permissions override should be REJECTED"
else
  pass "a job-level permissions override is rejected"
fi

# ── Case 7: an execution-control key (if: false) on the job is rejected ────
# The reusable ref, triggers, and permissions all still validate, but `if: false`
# skips the required audit — the guard must reject any key beyond `uses`.
ifguard="${TMP}/if-false.yml"
write_canonical "$ifguard"
yq -i '.jobs.dependency-audit.if = false' "$ifguard"
if run_guard "$ifguard"; then
  fail "a caller job with 'if: false' should be REJECTED (always-skipped audit)"
else
  pass "a caller job with an execution-control 'if:' key is rejected"
fi

# ── Case 8: a `with:` forward grafted onto the job is rejected ─────────────
withfwd="${TMP}/with-forward.yml"
write_canonical "$withfwd"
yq -i '.jobs.dependency-audit.with.foo = "bar"' "$withfwd"
if run_guard "$withfwd"; then
  fail "a caller job carrying a 'with:' forward should be REJECTED"
else
  pass "a caller job carrying a 'with:' forward is rejected"
fi

# ── Case 9: dropping merge_group is rejected ───────────────────────────────
nomerge="${TMP}/no-merge-group.yml"
write_canonical "$nomerge"
yq -i 'del(.on.merge_group)' "$nomerge"
if run_guard "$nomerge"; then
  fail "dropping the merge_group trigger should be REJECTED"
else
  pass "dropping the merge_group trigger is rejected"
fi

# ── Case 10: an inert merge_group mapping (types: []) is rejected ──────────
# `merge_group: { types: [] }` retains the key but cannot select the default
# checks_requested activity, so the audit never runs on merge-queue events.
inertmerge="${TMP}/inert-merge-group.yml"
write_canonical "$inertmerge"
yq -i '.on.merge_group.types = []' "$inertmerge"
if run_guard "$inertmerge"; then
  fail "merge_group: { types: [] } should be REJECTED (inert mapping)"
else
  pass "an inert merge_group mapping is rejected"
fi

# ── Case 11: a widened pull_request branches array is rejected ─────────────
# branches: ['*'] evaluates to include main but widens the centrally-owned
# surface — the exact [main] comparison must reject it.
widebranch="${TMP}/wide-branch.yml"
write_canonical "$widebranch"
yq -i '.on.pull_request.branches = ["*"]' "$widebranch"
if run_guard "$widebranch"; then
  fail "pull_request branches: ['*'] should be REJECTED (not exactly [main])"
else
  pass "a widened pull_request branches array is rejected"
fi

# ── Case 12: an extra push branch (main + develop) is rejected ─────────────
extrabranch="${TMP}/extra-branch.yml"
write_canonical "$extrabranch"
yq -i '.on.push.branches = ["main", "develop"]' "$extrabranch"
if run_guard "$extrabranch"; then
  fail "push branches: [main, develop] should be REJECTED (not exactly [main])"
else
  pass "an extra push branch is rejected"
fi

# ── Case 13: an extra grafted trigger (workflow_dispatch) is rejected ──────
extratrig="${TMP}/extra-trigger.yml"
write_canonical "$extratrig"
yq -i '.on.workflow_dispatch = null' "$extratrig"
if run_guard "$extratrig"; then
  fail "an extra workflow_dispatch trigger should be REJECTED (exact on: surface)"
else
  pass "an extra grafted trigger is rejected"
fi

# ── Case 14: a paths filter on pull_request is rejected ────────────────────
pathsfilter="${TMP}/paths-filter.yml"
write_canonical "$pathsfilter"
yq -i '.on.pull_request.paths = ["src/**"]' "$pathsfilter"
if run_guard "$pathsfilter"; then
  fail "a pull_request paths: filter should be REJECTED (only branches allowed)"
else
  pass "a pull_request paths: filter is rejected"
fi

# ── Case 15a: a top-level concurrency block is rejected ────────────────────
# A workflow-level `concurrency: { group: dependency-audit, cancel-in-progress:
# true }` passes every job- and trigger-level check yet lets a newer run cancel
# unrelated in-progress audits sharing that constant group — the exact top-level
# key-set assertion (Check 2b) must reject it.
concurrency="${TMP}/concurrency.yml"
write_canonical "$concurrency"
yq -i '.concurrency.group = "dependency-audit" | .concurrency.cancel-in-progress = true' "$concurrency"
if run_guard "$concurrency"; then
  fail "a top-level concurrency block should be REJECTED (workflow-level execution control)"
else
  pass "a top-level concurrency block is rejected"
fi

# ── Case 15b: any other extra top-level key (env) is rejected ──────────────
extratop="${TMP}/extra-top.yml"
write_canonical "$extratop"
yq -i '.env.FOO = "bar"' "$extratop"
if run_guard "$extratop"; then
  fail "an extra top-level 'env:' key should be REJECTED (exact top-level surface)"
else
  pass "an extra top-level key is rejected"
fi

# ── Case 15c: a dropped canonical top-level key (name) is rejected ─────────
droptop="${TMP}/drop-top.yml"
write_canonical "$droptop"
yq -i 'del(.name)' "$droptop"
if run_guard "$droptop"; then
  fail "a removed top-level 'name:' key should be REJECTED (exact top-level surface)"
else
  pass "a removed canonical top-level key is rejected"
fi

# ── Case 15d: an additional job alongside the caller job is rejected ───────
extrajob="${TMP}/extra-job.yml"
write_canonical "$extrajob"
yq -i '.jobs.extra.runs-on = "ubuntu-latest"' "$extrajob"
if run_guard "$extrajob"; then
  fail "an additional job should be REJECTED (exact jobs surface)"
else
  pass "an additional job is rejected"
fi

# ── Case 15e: a renamed workflow is rejected ───────────────────────────────
renamed="${TMP}/renamed.yml"
write_canonical "$renamed"
yq -i '.name = "Renamed audit"' "$renamed"
if run_guard "$renamed"; then
  fail "a renamed workflow should be REJECTED (exact name)"
else
  pass "a renamed workflow is rejected"
fi

# ── Case 15f: a lexically valid but non-existent channel is rejected ───────
fakechan="${TMP}/fake-channel.yml"
write_canonical "$fakechan"
yq -i '.jobs.dependency-audit.uses = "petry-projects/.github/.github/workflows/dependency-audit-reusable.yml@dependency-audit/v999-ring999"' "$fakechan"
if run_guard "$fakechan"; then
  fail "a non-existent channel (v999-ring999) should be REJECTED"
else
  pass "a non-existent channel is rejected"
fi

# ── Case 15g: duplicate mapping keys are rejected ──────────────────────────
dupkey="${TMP}/dup-key.yml"
write_canonical "$dupkey"
cat >> "$dupkey" <<'YAML'
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  merge_group:
YAML
if run_guard "$dupkey"; then
  fail "a duplicated top-level 'on:' key should be REJECTED"
else
  pass "a duplicated top-level key is rejected"
fi

# ── Case 15: a missing workflow file fails cleanly ─────────────────────────
if run_guard "${TMP}/does-not-exist.yml"; then
  fail "a missing workflow file should be REJECTED"
else
  pass "a missing workflow file is rejected"
fi

echo ""
if [[ "$fails" -eq 0 ]]; then
  echo "All tests passed."
  exit 0
fi
echo "$fails test(s) failed." >&2
exit 1
