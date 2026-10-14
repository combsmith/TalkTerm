#!/usr/bin/env bash
# Apply repository-level standard settings via the GitHub API.
#
# Applies security_and_analysis settings and disables check-suite auto-trigger
# for apps that queue suites on every push without completing them (Claude,
# CodeRabbit), which permanently blocks GitHub auto-merge.
#
# Standard: petry-projects/.github/standards/github-settings.md
#           #check-suite-auto-trigger-preferences
#
# Usage:
#   bash scripts/apply-repo-settings.sh <repo-name>      # e.g. TalkTerm
#   bash scripts/apply-repo-settings.sh <owner/repo>
#   GITHUB_REPOSITORY=owner/repo bash scripts/apply-repo-settings.sh   # CI form
#
# Environment:
#   GH_TOKEN           GitHub token. The check-suites API rejects OAuth app
#                      tokens — use a classic PAT with `repo` scope (or admin).
#   ORG                GitHub org used to expand a bare repo name (default:
#                      petry-projects).
#   GITHUB_REPOSITORY  owner/repo, used when no positional argument is given
#                      (set automatically by GitHub Actions).
#
# The helpers below are pure and side-effect-free so they can be sourced and
# unit-tested; main only runs when the script is executed directly.

# App IDs whose check-suite auto-trigger must be disabled. GitHub creates a
# queued suite on every push when auto-trigger is on; these apps never complete
# those suites, permanently blocking auto-merge.
readonly -a CHECK_SUITE_APP_IDS=(1236702 347564) # Claude, CodeRabbit

# The pr-quality ruleset enforces squash-only merges. The repo-level merge
# settings stay all-true (see .github/settings.yml); the ruleset restricts the
# allowed methods on the default branch to squash only.
# Standard: petry-projects/.github/standards/github-settings.md
#           #pr-quality--standard-ruleset-all-repositories
readonly PR_QUALITY_RULESET_NAME='pr-quality'
readonly PR_QUALITY_MERGE_METHOD='squash'
# The pr-quality ruleset requires stale approvals to be dismissed when new
# commits are pushed, so a review always reflects the code being merged.
# Standard: petry-projects/.github/standards/github-settings.md
#           #pr-quality--standard-ruleset-all-repositories
readonly PR_QUALITY_DISMISS_STALE_REVIEWS='true'
# The pr-quality ruleset requires that the most recent push be approved by a
# reviewer other than its pusher. Expected true; GitHub omits/defaults it to
# false, which is the drift this reconciler corrects.
# Standard: petry-projects/.github/standards/github-settings.md
#           #pr-quality--standard-ruleset-all-repositories
readonly PR_QUALITY_REQUIRE_LAST_PUSH_APPROVAL='true'
readonly MISSING='missing'

# resolve_repo <arg>
# Resolves the target "owner/repo". Precedence: positional arg, then
# GITHUB_REPOSITORY, then REPO. A bare name is expanded to "<ORG>/<name>".
# Returns non-zero if no repo can be determined.
resolve_repo() {
  local repo="${1:-}"
  [[ -z "$repo" ]] && repo="${GITHUB_REPOSITORY:-}"
  [[ -z "$repo" ]] && repo="${REPO:-}"
  [[ -z "$repo" ]] && return 1
  case "$repo" in
    */*) printf '%s' "$repo" ;;
    *) printf '%s/%s' "${ORG:-petry-projects}" "$repo" ;;
  esac
}

# auto_trigger_status <prefs_json> <app_id>
# Echoes the current auto_trigger setting for app_id: "true", "false", or
# "missing" (app absent from preferences — never run in repo, so compliant).
auto_trigger_status() {
  local json="${1:-}" app_id="$2"
  if [[ -z "$json" ]]; then
    printf '%s' "$MISSING"
    return 0
  fi
  printf '%s' "$json" | jq -r --argjson id "$app_id" --arg missing "$MISSING" \
    '.preferences.auto_trigger_checks // []
     | map(select(.app_id == $id))
     | if length == 0 then $missing else (.[0].setting | tostring) end'
}

# apply_security_and_analysis <owner/repo>
apply_security_and_analysis() {
  local repo="$1"
  echo "Applying security_and_analysis settings to ${repo} ..."
  gh api -X PATCH "repos/${repo}" --input - <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" },
    "secret_scanning_ai_detection": { "status": "enabled" },
    "secret_scanning_non_provider_patterns": { "status": "enabled" },
    "dependabot_security_updates": { "status": "enabled" }
  }
}
JSON
  return
}

# apply_check_suite_prefs <owner/repo>
# Disables auto-trigger for any configured app that currently has it enabled.
# Apps that are "missing" (never run) or already "false" are compliant and left
# untouched. The check-suites/preferences GET endpoint is PATCH-only on GitHub
# and returns 404, so when preferences cannot be read we conservatively apply
# the disabling PATCH for every configured app.
apply_check_suite_prefs() {
  local repo="$1"
  echo "Configuring check-suite auto-trigger preferences for ${repo} ..."

  local prefs status app_id
  local -a to_disable=()
  if prefs=$(gh api "repos/${repo}/check-suites/preferences" 2>/dev/null) && [[ -n "$prefs" ]]; then
    for app_id in "${CHECK_SUITE_APP_IDS[@]}"; do
      status=$(auto_trigger_status "$prefs" "$app_id")
      case "$status" in
        missing) echo "  app ${app_id}: never run in repo — compliant, skipping" ;;
        false) echo "  app ${app_id}: already disabled — skipping" ;;
        *) echo "  app ${app_id}: auto-trigger enabled — disabling"; to_disable+=("$app_id") ;;
      esac
    done
  else
    echo "  could not read current preferences — applying disable for all configured apps"
    to_disable=("${CHECK_SUITE_APP_IDS[@]}")
  fi

  if [[ "${#to_disable[@]}" -eq 0 ]]; then
    echo "  already compliant — nothing to do"
    return 0
  fi

  local payload
  payload=$(printf '%s\n' "${to_disable[@]}" |
    jq -Rcn '[inputs | tonumber] | map({app_id: ., setting: false}) | {auto_trigger_checks: .}')
  gh api -X PATCH "repos/${repo}/check-suites/preferences" --input - <<<"$payload"
}

# pr_quality_merge_methods_status <ruleset_json>
# Echoes the ruleset's pull_request-rule allowed_merge_methods as a sorted,
# comma-joined string (e.g. "squash" or "merge,rebase,squash"), or "missing"
# when the JSON is empty, has no pull_request rule, or that rule declares no
# allowed_merge_methods (GitHub omits the key when all methods are permitted).
pr_quality_merge_methods_status() {
  local json="${1:-}"
  if [[ -z "$json" ]]; then
    printf '%s' "$MISSING"
    return 0
  fi
  printf '%s' "$json" | jq -r --arg missing "$MISSING" '
    (.rules // [])
    | map(select(.type == "pull_request"))
    | if length == 0 then $missing
      else (.[0].parameters.allowed_merge_methods // []) as $m
        | if ($m | length) == 0 then $missing else ($m | sort | join(",")) end
      end'
}

# pr_quality_dismiss_stale_reviews_status <ruleset_json>
# Echoes the ruleset's pull_request-rule dismiss_stale_reviews_on_push value as
# "true" or "false", or "missing" when the JSON is empty or has no pull_request
# rule. An absent parameter is treated as "false" (not "missing") so the apply
# function can reconcile it to true.
pr_quality_dismiss_stale_reviews_status() {
  local json="${1:-}"
  if [[ -z "$json" ]]; then
    printf '%s' "$MISSING"
    return 0
  fi
  printf '%s' "$json" | jq -r --arg missing "$MISSING" '
    (.rules // [])
    | map(select(.type == "pull_request"))
    | if length == 0 then $missing
      else (.[0].parameters.dismiss_stale_reviews_on_push // false | tostring)
      end'
}

# pr_quality_require_last_push_approval_status <ruleset_json>
# Echoes the ruleset's pull_request-rule require_last_push_approval as "true" or
# "false", or "missing" when the JSON is empty or has no pull_request rule.
# When the pull_request rule exists but omits the parameter, returns "false"
# (GitHub omits the key when the value is its default of false).
pr_quality_require_last_push_approval_status() {
  local json="${1:-}"
  if [[ -z "$json" ]]; then
    printf '%s' "$MISSING"
    return 0
  fi
  printf '%s' "$json" | jq -r --arg missing "$MISSING" '
    (.rules // [])
    | map(select(.type == "pull_request"))
    | if length == 0 then $missing
      else (.[0].parameters.require_last_push_approval) as $v
        | if $v == null then "false" else ($v | tostring) end
      end'
}

# pr_quality_reconcile_payload <ruleset_json>
# Builds the PUT body that reconciles the pr-quality ruleset's pull_request rule
# to the codified standard: allowed_merge_methods=[squash],
# require_last_push_approval=true, dismiss_stale_reviews_on_push=true. Structural
# fields (name, target, enforcement, bypass_actors, conditions) are carried over
# from the current ruleset; absent bypass_actors default to []. Non-pull_request
# rules pass through unchanged. Pure and side-effect-free so it can be
# unit-tested without hitting the API.
pr_quality_reconcile_payload() {
  local ruleset="${1:-}"
  printf '%s' "$ruleset" | jq \
    --arg method "$PR_QUALITY_MERGE_METHOD" '
    {
      name: .name,
      target: .target,
      enforcement: .enforcement,
      bypass_actors: (.bypass_actors // []),
      conditions: .conditions,
      rules: [
        (.rules // [])[]
        | if .type == "pull_request"
          then .parameters = ((.parameters // {}) + {allowed_merge_methods: [$method], require_last_push_approval: true, dismiss_stale_reviews_on_push: true})
          else . end
      ]
    }'
  return
}

# pr_quality_needs_reconcile <merge_status> <rlpa_status> <dismiss_status>
# Echoes "true" when any of the three pull_request-rule parameters has drifted
# from its codified standard value (allowed_merge_methods=squash-only,
# require_last_push_approval=true, dismiss_stale_reviews_on_push=true), else
# "false". Pure and side-effect-free so the reconcile decision — including the
# require_last_push_approval drift this reconciler corrects — is unit-testable
# without hitting the API.
pr_quality_needs_reconcile() {
  local merge_status="${1:-}" rlpa_status="${2:-}" dismiss_status="${3:-}"
  if [[ "$merge_status" != "$PR_QUALITY_MERGE_METHOD" ||
    "$rlpa_status" != "$PR_QUALITY_REQUIRE_LAST_PUSH_APPROVAL" ||
    "$dismiss_status" != "$PR_QUALITY_DISMISS_STALE_REVIEWS" ]]; then
    printf '%s\n' 'true'
  else
    printf '%s\n' 'false'
  fi
  return
}

# apply_pr_quality_ruleset <owner/repo>
# Reconciles the allowed_merge_methods, require_last_push_approval, and
# dismiss_stale_reviews_on_push settings in the pr-quality ruleset in a single
# GET+PUT cycle, eliminating the read-modify-write race that arises from
# consecutive PUT operations sharing stale state. Skips when the ruleset is
# absent. Skips the pull_request-rule parameters when the ruleset has no
# pull_request rule (org automation owns rule creation). Idempotent.
apply_pr_quality_ruleset() {
  local repo="$1"
  echo "Reconciling ${PR_QUALITY_RULESET_NAME} ruleset for ${repo} ..."

  local ruleset_id
  if ! ruleset_id=$(gh api "repos/${repo}/rulesets" \
    --jq "map(select(.name == \"${PR_QUALITY_RULESET_NAME}\")) | .[0].id // empty" 2>/dev/null); then
    echo "  failed to query rulesets for ${repo}"
    return 1
  fi
  if [[ -z "$ruleset_id" ]]; then
    echo "  ${PR_QUALITY_RULESET_NAME} ruleset not found — org automation owns creation, skipping"
    return 0
  fi

  local ruleset
  if ! ruleset=$(gh api "repos/${repo}/rulesets/${ruleset_id}" 2>/dev/null) || [[ -z "$ruleset" ]]; then
    echo "  could not read ruleset ${ruleset_id} — skipping"
    return 0
  fi

  local merge_status rlpa_status ds_status needs_update=""
  if ! merge_status=$(pr_quality_merge_methods_status "$ruleset"); then
    echo "  failed to parse ruleset merge methods status"
    return 1
  fi
  if ! rlpa_status=$(pr_quality_require_last_push_approval_status "$ruleset"); then
    echo "  failed to parse ruleset require_last_push_approval status"
    return 1
  fi
  if ! ds_status=$(pr_quality_dismiss_stale_reviews_status "$ruleset"); then
    echo "  failed to parse ruleset dismiss_stale_reviews_on_push status"
    return 1
  fi

  if [[ "$rlpa_status" == "$MISSING" ]]; then
    echo "  no pull_request rule found — skipping ruleset reconciliation (org automation owns rule creation)"
    return 0
  fi

  if [[ "$merge_status" == "$PR_QUALITY_MERGE_METHOD" ]]; then
    echo "  already ${PR_QUALITY_MERGE_METHOD}-only — nothing to do for merge methods"
  else
    echo "  merge methods '${merge_status}' drifted — reconciling to ${PR_QUALITY_MERGE_METHOD}-only"
  fi

  if [[ "$rlpa_status" == "$PR_QUALITY_REQUIRE_LAST_PUSH_APPROVAL" ]]; then
    echo "  already require_last_push_approval=${PR_QUALITY_REQUIRE_LAST_PUSH_APPROVAL} — nothing to do"
  else
    echo "  require_last_push_approval '${rlpa_status}' drifted — reconciling to ${PR_QUALITY_REQUIRE_LAST_PUSH_APPROVAL}"
  fi

  if [[ "$ds_status" == "$PR_QUALITY_DISMISS_STALE_REVIEWS" ]]; then
    echo "  already dismiss_stale_reviews_on_push=${PR_QUALITY_DISMISS_STALE_REVIEWS} — nothing to do"
  else
    echo "  dismiss_stale_reviews_on_push '${ds_status}' drifted — reconciling to ${PR_QUALITY_DISMISS_STALE_REVIEWS}"
  fi

  if ! needs_update=$(pr_quality_needs_reconcile "$merge_status" "$rlpa_status" "$ds_status"); then
    echo "  failed to determine if reconciliation is needed"
    return 1
  fi
  if [[ "$needs_update" == "false" ]]; then
    return 0
  fi

  # Refetch immediately before PUT to narrow the GET-then-PUT race window.
  local fresh_ruleset
  if ! fresh_ruleset=$(gh api "repos/${repo}/rulesets/${ruleset_id}" 2>/dev/null) || [[ -z "$fresh_ruleset" ]]; then
    echo "  could not re-read ruleset ${ruleset_id} before update — skipping"
    return 0
  fi

  local payload
  if ! payload=$(pr_quality_reconcile_payload "$fresh_ruleset"); then
    echo "  failed to generate payload for ruleset update"
    return 1
  fi
  gh api -X PUT "repos/${repo}/rulesets/${ruleset_id}" --input - <<<"$payload"
}

# Run main only when executed directly, so tests can source the helpers.
if [[ "${BASH_SOURCE[0]:-$0}" == "$0" ]]; then
  set -euo pipefail
  repo="$(resolve_repo "${1:-}")" || {
    echo "Usage: $0 <repo-name|owner/repo>  (or set GITHUB_REPOSITORY)" >&2
    exit 1
  }
  apply_security_and_analysis "$repo"
  apply_check_suite_prefs "$repo"
  apply_pr_quality_ruleset "$repo"
  echo "Done."
fi
