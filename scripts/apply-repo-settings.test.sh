#!/usr/bin/env bash
# apply-repo-settings.test.sh — portable unit tests for the pure helpers in
# apply-repo-settings.sh. No bats dependency: sourcing the script must not run
# its main body (guarded by the BASH_SOURCE check), so the helpers can be tested
# in isolation. Run: bash scripts/apply-repo-settings.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Sourcing must not execute main; if it errors the whole test run aborts here.
# MISSING and other shared constants are declared readonly in the production script and available after sourcing.
# shellcheck source=scripts/apply-repo-settings.sh
source "${SCRIPT_DIR}/apply-repo-settings.sh"

fails=0
pass() {
  local desc="$1"
  echo "ok   - $desc"
  return 0
}
fail() {
  local desc="$1"
  echo "FAIL - $desc"
  fails=$((fails + 1))
  return 0
}

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    pass "$desc"
  else
    fail "$desc (expected '$expected', got '$actual')"
  fi
  return 0
}

# ── auto_trigger_status ───────────────────────────────────────────────────────
prefs_true='{"preferences":{"auto_trigger_checks":[{"app_id":1236702,"setting":true},{"app_id":347564,"setting":false}]}}'
prefs_missing='{"preferences":{"auto_trigger_checks":[{"app_id":999,"setting":true}]}}'
prefs_empty='{"preferences":{"auto_trigger_checks":[]}}'

assert_eq "auto_trigger_status: enabled app -> true" \
  "true" "$(auto_trigger_status "$prefs_true" 1236702)"
assert_eq "auto_trigger_status: disabled app -> false" \
  "false" "$(auto_trigger_status "$prefs_true" 347564)"
assert_eq "auto_trigger_status: app absent -> missing" \
  "$MISSING" "$(auto_trigger_status "$prefs_missing" 1236702)"
assert_eq "auto_trigger_status: empty list -> missing" \
  "$MISSING" "$(auto_trigger_status "$prefs_empty" 1236702)"
assert_eq "auto_trigger_status: empty string -> missing" \
  "$MISSING" "$(auto_trigger_status "" 1236702)"

# ── pr_quality_merge_methods_status ───────────────────────────────────────────
ruleset_squash='{"rules":[{"type":"pull_request","parameters":{"allowed_merge_methods":["squash"]}}]}'
ruleset_drifted='{"rules":[{"type":"pull_request","parameters":{"allowed_merge_methods":["merge","rebase","squash"]}}]}'
ruleset_unsorted='{"rules":[{"type":"pull_request","parameters":{"allowed_merge_methods":["squash","merge"]}}]}'
ruleset_no_pr='{"rules":[{"type":"required_status_checks","parameters":{}}]}'
ruleset_no_methods='{"rules":[{"type":"pull_request","parameters":{}}]}'

assert_eq "pr_quality_merge_methods_status: squash-only -> squash" \
  "squash" "$(pr_quality_merge_methods_status "$ruleset_squash")"
assert_eq "pr_quality_merge_methods_status: drifted -> merge,rebase,squash" \
  "merge,rebase,squash" "$(pr_quality_merge_methods_status "$ruleset_drifted")"
assert_eq "pr_quality_merge_methods_status: unsorted input is sorted" \
  "merge,squash" "$(pr_quality_merge_methods_status "$ruleset_unsorted")"
assert_eq "pr_quality_merge_methods_status: no pull_request rule -> missing" \
  "$MISSING" "$(pr_quality_merge_methods_status "$ruleset_no_pr")"
assert_eq "pr_quality_merge_methods_status: rule without methods -> missing" \
  "$MISSING" "$(pr_quality_merge_methods_status "$ruleset_no_methods")"
assert_eq "pr_quality_merge_methods_status: empty string -> missing" \
  "$MISSING" "$(pr_quality_merge_methods_status "")"

# ── pr_quality_dismiss_stale_reviews_status ───────────────────────────────────
ruleset_dismiss_true='{"rules":[{"type":"pull_request","parameters":{"dismiss_stale_reviews_on_push":true}}]}'
ruleset_dismiss_false='{"rules":[{"type":"pull_request","parameters":{"dismiss_stale_reviews_on_push":false}}]}'
ruleset_dismiss_no_pr='{"rules":[{"type":"required_status_checks","parameters":{}}]}'
ruleset_dismiss_no_param='{"rules":[{"type":"pull_request","parameters":{}}]}'

assert_eq "pr_quality_dismiss_stale_reviews_status: enabled -> true" \
  "true" "$(pr_quality_dismiss_stale_reviews_status "$ruleset_dismiss_true")"
assert_eq "pr_quality_dismiss_stale_reviews_status: disabled -> false" \
  "false" "$(pr_quality_dismiss_stale_reviews_status "$ruleset_dismiss_false")"
assert_eq "pr_quality_dismiss_stale_reviews_status: no pull_request rule -> missing" \
  "$MISSING" "$(pr_quality_dismiss_stale_reviews_status "$ruleset_dismiss_no_pr")"
assert_eq "pr_quality_dismiss_stale_reviews_status: rule without parameter -> false" \
  "false" "$(pr_quality_dismiss_stale_reviews_status "$ruleset_dismiss_no_param")"
assert_eq "pr_quality_dismiss_stale_reviews_status: empty string -> missing" \
  "$MISSING" "$(pr_quality_dismiss_stale_reviews_status "")"
# ── pr_quality_require_last_push_approval_status ───────────────────────────────
ruleset_rlpa_true='{"rules":[{"type":"pull_request","parameters":{"require_last_push_approval":true}}]}'
ruleset_rlpa_false='{"rules":[{"type":"pull_request","parameters":{"require_last_push_approval":false}}]}'
ruleset_rlpa_no_pr='{"rules":[{"type":"required_status_checks","parameters":{}}]}'
ruleset_rlpa_absent='{"rules":[{"type":"pull_request","parameters":{}}]}'

assert_eq "pr_quality_require_last_push_approval_status: true -> true" \
  "true" "$(pr_quality_require_last_push_approval_status "$ruleset_rlpa_true")"
assert_eq "pr_quality_require_last_push_approval_status: false (drifted) -> false" \
  "false" "$(pr_quality_require_last_push_approval_status "$ruleset_rlpa_false")"
assert_eq "pr_quality_require_last_push_approval_status: no pull_request rule -> missing" \
  "$MISSING" "$(pr_quality_require_last_push_approval_status "$ruleset_rlpa_no_pr")"
assert_eq "pr_quality_require_last_push_approval_status: rule without parameter -> false (GitHub default)" \
  "false" "$(pr_quality_require_last_push_approval_status "$ruleset_rlpa_absent")"
assert_eq "pr_quality_require_last_push_approval_status: empty string -> missing" \
  "$MISSING" "$(pr_quality_require_last_push_approval_status "")"

# ── pr_quality_reconcile_payload ──────────────────────────────────────────────
# A fully-drifted ruleset: multiple merge methods allowed, both review-safety
# parameters false, plus structural fields and a second (non-pull_request) rule
# that must pass through untouched.
ruleset_drifted_full='{
  "name":"pr-quality",
  "target":"branch",
  "enforcement":"active",
  "bypass_actors":[{"actor_id":1,"actor_type":"Team","bypass_mode":"always"}],
  "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
  "rules":[
    {"type":"pull_request","parameters":{"allowed_merge_methods":["merge","rebase","squash"],"require_last_push_approval":false,"dismiss_stale_reviews_on_push":false}},
    {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":true}}
  ]
}'
payload_drifted=""
payload_drifted="$(pr_quality_reconcile_payload "$ruleset_drifted_full")"

assert_eq "pr_quality_reconcile_payload: require_last_push_approval reconciled to true" \
  "true" "$(printf '%s' "$payload_drifted" | jq -r '.rules[] | select(.type=="pull_request") | .parameters.require_last_push_approval')"
assert_eq "pr_quality_reconcile_payload: dismiss_stale_reviews_on_push reconciled to true" \
  "true" "$(printf '%s' "$payload_drifted" | jq -r '.rules[] | select(.type=="pull_request") | .parameters.dismiss_stale_reviews_on_push')"
assert_eq "pr_quality_reconcile_payload: allowed_merge_methods reconciled to squash-only" \
  '["squash"]' "$(printf '%s' "$payload_drifted" | jq -c '.rules[] | select(.type=="pull_request") | .parameters.allowed_merge_methods')"
assert_eq "pr_quality_reconcile_payload: preserves ruleset name" \
  "pr-quality" "$(printf '%s' "$payload_drifted" | jq -r '.name')"
assert_eq "pr_quality_reconcile_payload: preserves target" \
  "branch" "$(printf '%s' "$payload_drifted" | jq -r '.target')"
assert_eq "pr_quality_reconcile_payload: preserves enforcement" \
  "active" "$(printf '%s' "$payload_drifted" | jq -r '.enforcement')"
assert_eq "pr_quality_reconcile_payload: preserves conditions" \
  '{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}}' \
  "$(printf '%s' "$payload_drifted" | jq -c '.conditions')"
assert_eq "pr_quality_reconcile_payload: preserves bypass_actors" \
  '[{"actor_id":1,"actor_type":"Team","bypass_mode":"always"}]' \
  "$(printf '%s' "$payload_drifted" | jq -c '.bypass_actors')"
assert_eq "pr_quality_reconcile_payload: non-pull_request rule passes through untouched" \
  '{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":true}}' \
  "$(printf '%s' "$payload_drifted" | jq -c '.rules[] | select(.type=="required_status_checks")')"

# Ruleset missing bypass_actors and with the pull_request rule's parameters
# entirely absent: the payload must still add the two review-safety params and
# default bypass_actors to [].
ruleset_minimal='{
  "name":"pr-quality","target":"branch","enforcement":"active",
  "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
  "rules":[{"type":"pull_request"}]
}'
payload_minimal=""
payload_minimal="$(pr_quality_reconcile_payload "$ruleset_minimal")"

assert_eq "pr_quality_reconcile_payload: absent bypass_actors defaults to []" \
  '[]' "$(printf '%s' "$payload_minimal" | jq -c '.bypass_actors')"
assert_eq "pr_quality_reconcile_payload: adds require_last_push_approval when params absent" \
  "true" "$(printf '%s' "$payload_minimal" | jq -r '.rules[] | select(.type=="pull_request") | .parameters.require_last_push_approval')"
assert_eq "pr_quality_reconcile_payload: adds squash-only when params absent" \
  '["squash"]' "$(printf '%s' "$payload_minimal" | jq -c '.rules[] | select(.type=="pull_request") | .parameters.allowed_merge_methods')"

# ── pr_quality_needs_reconcile ────────────────────────────────────────────────
# The reconcile decision: given the three parsed parameter statuses, does the
# pr-quality ruleset need a PUT? Guards the require_last_push_approval drift this
# finding tracks (compliance: ruleset-drift-pr-quality-require_last_push_approval)
# so an inverted/broken comparison in apply_pr_quality_ruleset can't silently
# stop correcting drift while the parser tests still pass.
assert_eq "pr_quality_needs_reconcile: all compliant -> false" \
  "false" "$(pr_quality_needs_reconcile "$PR_QUALITY_MERGE_METHOD" "$PR_QUALITY_REQUIRE_LAST_PUSH_APPROVAL" "$PR_QUALITY_DISMISS_STALE_REVIEWS")"
assert_eq "pr_quality_needs_reconcile: require_last_push_approval drifted (false) -> true" \
  "true" "$(pr_quality_needs_reconcile "$PR_QUALITY_MERGE_METHOD" "false" "$PR_QUALITY_DISMISS_STALE_REVIEWS")"
assert_eq "pr_quality_needs_reconcile: merge methods drifted -> true" \
  "true" "$(pr_quality_needs_reconcile "merge,rebase,squash" "$PR_QUALITY_REQUIRE_LAST_PUSH_APPROVAL" "$PR_QUALITY_DISMISS_STALE_REVIEWS")"
assert_eq "pr_quality_needs_reconcile: dismiss_stale_reviews drifted (false) -> true" \
  "true" "$(pr_quality_needs_reconcile "$PR_QUALITY_MERGE_METHOD" "$PR_QUALITY_REQUIRE_LAST_PUSH_APPROVAL" "false")"

# ── pr_quality_merge_methods_status ───────────────────────────────────────────
ruleset_squash='{"rules":[{"type":"pull_request","parameters":{"allowed_merge_methods":["squash"]}}]}'
ruleset_drifted='{"rules":[{"type":"pull_request","parameters":{"allowed_merge_methods":["merge","rebase","squash"]}}]}'
ruleset_unsorted='{"rules":[{"type":"pull_request","parameters":{"allowed_merge_methods":["squash","merge"]}}]}'
ruleset_no_pr='{"rules":[{"type":"required_status_checks","parameters":{}}]}'
ruleset_no_methods='{"rules":[{"type":"pull_request","parameters":{}}]}'

assert_eq "pr_quality_merge_methods_status: squash-only -> squash" \
  "squash" "$(pr_quality_merge_methods_status "$ruleset_squash")"
assert_eq "pr_quality_merge_methods_status: drifted -> merge,rebase,squash" \
  "merge,rebase,squash" "$(pr_quality_merge_methods_status "$ruleset_drifted")"
assert_eq "pr_quality_merge_methods_status: unsorted input is sorted" \
  "merge,squash" "$(pr_quality_merge_methods_status "$ruleset_unsorted")"
assert_eq "pr_quality_merge_methods_status: no pull_request rule -> missing" \
  "missing" "$(pr_quality_merge_methods_status "$ruleset_no_pr")"
assert_eq "pr_quality_merge_methods_status: rule without methods -> missing" \
  "missing" "$(pr_quality_merge_methods_status "$ruleset_no_methods")"
assert_eq "pr_quality_merge_methods_status: empty string -> missing" \
  "missing" "$(pr_quality_merge_methods_status "")"

# ── pr_quality_merge_methods_status ───────────────────────────────────────────
ruleset_squash='{"rules":[{"type":"pull_request","parameters":{"allowed_merge_methods":["squash"]}}]}'
ruleset_drifted='{"rules":[{"type":"pull_request","parameters":{"allowed_merge_methods":["merge","rebase","squash"]}}]}'
ruleset_unsorted='{"rules":[{"type":"pull_request","parameters":{"allowed_merge_methods":["squash","merge"]}}]}'
ruleset_no_pr='{"rules":[{"type":"required_status_checks","parameters":{}}]}'
ruleset_no_methods='{"rules":[{"type":"pull_request","parameters":{}}]}'

assert_eq "pr_quality_merge_methods_status: squash-only -> squash" \
  "squash" "$(pr_quality_merge_methods_status "$ruleset_squash")"
assert_eq "pr_quality_merge_methods_status: drifted -> merge,rebase,squash" \
  "merge,rebase,squash" "$(pr_quality_merge_methods_status "$ruleset_drifted")"
assert_eq "pr_quality_merge_methods_status: unsorted input is sorted" \
  "merge,squash" "$(pr_quality_merge_methods_status "$ruleset_unsorted")"
assert_eq "pr_quality_merge_methods_status: no pull_request rule -> missing" \
  "missing" "$(pr_quality_merge_methods_status "$ruleset_no_pr")"
assert_eq "pr_quality_merge_methods_status: rule without methods -> missing" \
  "missing" "$(pr_quality_merge_methods_status "$ruleset_no_methods")"
assert_eq "pr_quality_merge_methods_status: empty string -> missing" \
  "missing" "$(pr_quality_merge_methods_status "")"

# ── resolve_repo ──────────────────────────────────────────────────────────────
assert_eq "resolve_repo: bare name -> org/name" \
  "petry-projects/TalkTerm" "$(ORG=petry-projects resolve_repo "TalkTerm")"
assert_eq "resolve_repo: owner/repo passthrough" \
  "acme/widgets" "$(ORG=petry-projects resolve_repo "acme/widgets")"
assert_eq "resolve_repo: GITHUB_REPOSITORY fallback" \
  "petry-projects/TalkTerm" "$(ORG=petry-projects GITHUB_REPOSITORY=petry-projects/TalkTerm resolve_repo "")"
assert_eq "resolve_repo: REPO env fallback" \
  "petry-projects/TalkTerm" "$(ORG=petry-projects REPO=petry-projects/TalkTerm resolve_repo "")"

if [[ "$fails" -eq 0 ]]; then
  echo "All tests passed."
  exit 0
fi
echo "$fails test(s) failed." >&2
exit 1
