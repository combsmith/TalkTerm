#!/usr/bin/env bash
# Regression guard for pr-auto-review.yml. Locks the event-dependent concurrency
# contract of the thin caller stub (issues #1126, #508) so a future edit cannot
# silently change its deduplication or cancellation behaviour. The stub is synced
# verbatim from petry-projects/.github/standards/workflows/pr-auto-review.yml, so
# this guard enforces the canonical policy:
#
#   The stub fans out on check_suite / workflow_run / pull_request(_review). To
#   stay under GitHub Free's org-wide concurrency cap it collapses the
#   default-branch-context events (check_suite / workflow_run) onto one group per
#   PR with cancel-in-progress: true, while pull_request events keep a
#   unique-per-run group that never cancels. Invariants:
#
#     1. Per-PR deduplication — each of the check_suite and workflow_run branches
#        of the group is keyed on its own event's pull_requests[0].number. Stricter
#        forms that also add head_sha and/or a pull_requests[1] guard are accepted.
#     2. No-PR unique fallback — an event with no associated PR falls back to a
#        run-unique group (github.run_id) so unrelated work never collapses into
#        one cancelable group.
#
#   It also asserts cancel-in-progress stays gated on the check_suite / workflow_run
#   events (never unconditional), so pull_request-head runs are never cancelled.
#
# Accepts an optional workflow path (default: .github/workflows/pr-auto-review.yml)
# so the checks can be exercised against fixtures — see
# test-pr-auto-review-workflow.test.sh.
# Run: bash scripts/test-pr-auto-review-workflow.sh
set -euo pipefail

WORKFLOW="${1:-.github/workflows/pr-auto-review.yml}"
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

# ── Check 2: a top-level concurrency.group is present ──────────────────────
group=""
if ! group=$(yq '.concurrency.group' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse $WORKFLOW. Please check if it is valid YAML."
  exit 1
fi
if [[ "$group" == "null" || -z "$group" ]]; then
  {
    echo "FAIL: no top-level 'concurrency.group' block in $WORKFLOW"
    echo "      Add a per-PR group so check_suite / workflow_run events"
    echo "      dedupe per PR and fall back to a run-unique group otherwise."
  } >&2
  PASS=false
else
  echo "PASS: top-level 'concurrency.group' is present in $WORKFLOW"
fi

# The remaining group-shape checks only make sense once a group exists.
if [[ "$group" != "null" && -n "$group" ]]; then
  # ── Checks 3-4: per-PR dedup, scoped to each event's own branch ───────────
  # Split the (single-line, folded) expression at the workflow_run clause so each
  # event is checked against its own branch only; an unbounded match could be
  # satisfied by the other event's branch.
  wr_marker="github.event_name == 'workflow_run'"
  # Drop the terminal fallback (which legitimately uses github.run_id) so the
  # per-PR branches can be checked for run-unique values: a run-unique argument
  # (run_id / run_number / run_attempt) gives every run its own group and
  # silently disables deduplication.
  per_pr="${group%||*}"
  cs_part="${per_pr%%"$wr_marker"*}"
  wr_part="${per_pr#*"$wr_marker"}"
  # Event-specific identifiers (check_suite.id / workflow_run.id, ...) differ
  # between completion events for the same PR, so they disable deduplication too.
  run_unique_re="github\\.run_(id|number|attempt)|github\\.event\\.(check_suite|workflow_run)\\.(id|node_id|run_number|run_attempt|created_at|updated_at|url)([^[:alnum:]_]|$)"
  if [[ "$cs_part" =~ $run_unique_re || "$wr_part" =~ $run_unique_re ]]; then
    {
      echo "FAIL: a per-PR concurrency branch contains a run- or event-unique value in $WORKFLOW"
      echo "      Per-PR groups must be stable across runs so repeated events dedupe."
    } >&2
    PASS=false
  fi

  # The group must be a complete ${{ ... }} expression; without the delimiters the
  # whole text is one hard-coded group string shared by every run.
  group_trim="${group#"${group%%[![:space:]]*}"}"
  group_trim="${group_trim%"${group_trim##*[![:space:]]}"}"
  if [[ "$group_trim" != '${{'*'}}' ]]; then
    echo "FAIL: concurrency.group is not a complete \${{ ... }} expression in $WORKFLOW" >&2
    PASS=false
  fi

  # Each branch condition (the text before its format(...) call) must itself test
  # that event's PR number, so an event with no PR falls through to the run_id
  # fallback instead of matching a truthy format() result.
  cs_cond="${cs_part%%format(*}"
  wr_cond="${wr_part%%format(*}"
  if [[ "$cs_cond" != *"github.event_name == 'check_suite'"* \
    || "$cs_cond" != *"github.event.check_suite.pull_requests[0].number"* \
    || "$wr_cond" != *"github.event.workflow_run.pull_requests[0].number"* ]]; then
    {
      echo "FAIL: a per-PR concurrency branch condition does not test its event name and PR number in $WORKFLOW"
      echo "      Gate each branch on its event's pull_requests[0].number so no-PR runs"
      echo "      reach the github.run_id fallback."
    } >&2
    PASS=false
  fi

  # Both branches must produce the same key: compare the complete format(...)
  # call (string + arguments) with the event name normalised, so a branch that
  # appends an event-specific argument cannot split the group per event type.
  call_re="format\\('[^']*'[^)]*\\)"
  cs_call=""
  wr_call=""
  if [[ "$cs_part" =~ $call_re ]]; then cs_call="${BASH_REMATCH[0]//[[:space:]]/}"; fi
  if [[ "$wr_part" =~ $call_re ]]; then wr_call="${BASH_REMATCH[0]//[[:space:]]/}"; fi
  cs_call="${cs_call//check_suite/EVT}"
  wr_call="${wr_call//workflow_run/EVT}"
  if [[ "$cs_call" != "$wr_call" ]]; then
    {
      echo "FAIL: check_suite and workflow_run branches build different group keys in $WORKFLOW"
      echo "      ('$cs_call' vs '$wr_call'); both must use identical format(...) arguments."
    } >&2
    PASS=false
  fi

  # Both branches must produce the same group namespace so check_suite and
  # workflow_run runs for one PR dedupe against each other.
  fmt_re="format\\('([^']*)'"
  cs_fmt=""
  wr_fmt=""
  if [[ "$cs_part" =~ $fmt_re ]]; then cs_fmt="${BASH_REMATCH[1]}"; fi
  if [[ "$wr_part" =~ $fmt_re ]]; then wr_fmt="${BASH_REMATCH[1]}"; fi
  if [[ "$cs_fmt" != "$wr_fmt" ]]; then
    {
      echo "FAIL: check_suite and workflow_run branches use different group formats in $WORKFLOW"
      echo "      ('$cs_fmt' vs '$wr_fmt'); they must share one per-PR key."
    } >&2
    PASS=false
  fi

  # The PR number must be the FIRST argument of the branch's format(...) call and
  # the format string must reference it via {0}, so it actually contributes to the
  # resulting group string (not merely appear as an unused argument or in the
  # branch's condition).
  cs_re="format\\('[^']*\\{0\\}[^']*',[[:space:]]*github\\.event\\.check_suite\\.pull_requests\\[0\\]\\.number[,)]"
  wr_re="format\\('[^']*\\{0\\}[^']*',[[:space:]]*github\\.event\\.workflow_run\\.pull_requests\\[0\\]\\.number[,)]"
  # Doubled braces are escaped literals in GitHub expressions; {0} must survive
  # after removing them, otherwise the key is a constant.
  cs_unescaped="${cs_fmt//\{\{/}"
  cs_unescaped="${cs_unescaped//\}\}/}"
  wr_unescaped="${wr_fmt//\{\{/}"
  wr_unescaped="${wr_unescaped//\}\}/}"
  if [[ "$group" == *"$wr_marker"* && "$cs_part" =~ $cs_re && "$cs_unescaped" == *"{0}"* ]]; then
    echo "PASS: check_suite group is keyed on the PR number in $WORKFLOW"
  else
    {
      echo "FAIL: check_suite concurrency group is not keyed on the PR number in $WORKFLOW"
      echo "      Key the check_suite branch on github.event.check_suite.pull_requests[0].number"
    } >&2
    PASS=false
  fi

  if [[ "$group" == *"$wr_marker"* && "$wr_part" =~ $wr_re && "$wr_unescaped" == *"{0}"* ]]; then
    echo "PASS: workflow_run group is keyed on the PR number in $WORKFLOW"
  else
    {
      echo "FAIL: workflow_run concurrency group is not keyed on the PR number in $WORKFLOW"
      echo "      Key the workflow_run branch on github.event.workflow_run.pull_requests[0].number"
    } >&2
    PASS=false
  fi

  # ── Check 5: no-PR unique fallback keyed on github.run_id ──────
  # The terminal (last `||`) expression must itself be format('...{0}...', github.run_id),
  # so the run ID actually forms the group rather than appearing as an unused argument.
  fallback="${group##*||}"
  fallback_re="^[[:space:]]*format\\('[^']*\\{0\\}[^']*',[[:space:]]*github\\.run_id[[:space:]]*\\)[[:space:]]*\\}\\}[[:space:]]*$"
  fb_fmt=""
  fb_fmt_re="format\\('([^']*)'"
  if [[ "$fallback" =~ $fb_fmt_re ]]; then fb_fmt="${BASH_REMATCH[1]}"; fi
  fb_unescaped="${fb_fmt//\{\{/}"
  fb_unescaped="${fb_unescaped//\}\}/}"
  if [[ "$fallback" =~ $fallback_re && "$fb_unescaped" == *"{0}"* ]]; then
    echo "PASS: group has a run-unique (github.run_id) fallback in $WORKFLOW"
  else
    {
      echo "FAIL: concurrency group has no run-unique (github.run_id) fallback in $WORKFLOW"
      echo "      An event with no PR (fork / no PR) must fall back to"
      echo "      format('pr-auto-review-ready-check-unique-{0}', github.run_id) so"
      echo "      unrelated work never collapses into one cancelable group."
    } >&2
    PASS=false
  fi
fi

# ── Check 7: cancel-in-progress stays gated on check_suite / workflow_run ──
# Cancellation is only safe for the default-branch-context events (which do not
# attach to the PR head). It must NOT be unconditionally true, or a pull_request
# run on the PR head could be cancelled, leaving a cancelled check on the head.
cancel=""
if ! cancel=$(yq '.concurrency.cancel-in-progress' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse $WORKFLOW. Please check if it is valid YAML."
  exit 1
fi
# Validate the whole expression, not just its identifiers: after stripping the
# ${{ }} wrapper, whitespace and redundant outer parens it must be exactly the
# OR of the two event-name equalities (either order). A contradictory '&&' is
# false for every event and would silently disable cancellation.
cancel_norm="${cancel//[[:space:]]/}"
cancel_wrapped=true
if [[ "$cancel_norm" != '${{'*'}}' ]]; then cancel_wrapped=false; fi
cancel_norm="${cancel_norm#\$\{\{}"
cancel_norm="${cancel_norm%\}\}}"
cs_eq="github.event_name=='check_suite'"
wr_eq="github.event_name=='workflow_run'"
# Single-PR form: each event is additionally restricted to exactly one listed PR,
# so a multi-PR (run-unique group) run is never cancelled.
cs_one="(${cs_eq}&&github.event.check_suite.pull_requests[0]&&(github.event.check_suite.pull_requests[1]==null))"
cs_one_strict="(${cs_eq}&&github.event.check_suite.pull_requests[0]&&github.event.check_suite.pull_requests[0].number&&(github.event.check_suite.pull_requests[1]==null))"
wr_one="(${wr_eq}&&github.event.workflow_run.pull_requests[0]&&(github.event.workflow_run.pull_requests[1]==null))"
wr_one_strict="(${wr_eq}&&github.event.workflow_run.pull_requests[0]&&github.event.workflow_run.pull_requests[0].number&&(github.event.workflow_run.pull_requests[1]==null))"
cancel_plain="$cancel_norm"
while [[ "$cancel_plain" == \(*\) ]]; do
  cancel_plain="${cancel_plain#\(}"
  cancel_plain="${cancel_plain%\)}"
done
if [[ "$cancel_wrapped" == true ]] && [[ "$cancel_plain" == "${cs_eq}||${wr_eq}" || "$cancel_plain" == "${wr_eq}||${cs_eq}" \
  || "$cancel_norm" == "${cs_one}||${wr_one}" || "$cancel_norm" == "${wr_one}||${cs_one}" \
  || "$cancel_norm" == "${cs_one_strict}||${wr_one_strict}" || "$cancel_norm" == "${wr_one_strict}||${cs_one_strict}" ]]; then
  echo "PASS: cancel-in-progress is gated on check_suite / workflow_run in $WORKFLOW"
else
  {
    echo "FAIL: 'concurrency.cancel-in-progress' (found: '$cancel') is not gated on the"
    echo "      check_suite / workflow_run events in $WORKFLOW"
    echo "      Use an expression such as:"
    echo "        \${{ github.event_name == 'check_suite' || github.event_name == 'workflow_run' }}"
    echo "      so pull_request-head runs are never cancelled."
  } >&2
  PASS=false
fi

echo ""
if [[ "$PASS" == "true" ]]; then
  echo "All checks passed."
else
  echo "One or more checks failed."
  exit 1
fi
