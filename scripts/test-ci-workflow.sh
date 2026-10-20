#!/usr/bin/env bash
# Regression guard for ci.yml. Locks durable invariants whose loss inflates the
# Fleet Monitor failure rate:
#
#   1. (#380) ci.yml serializes redundant runs per Git ref via a top-level
#      `concurrency:` block. Without one, a bot pushing several commits to a PR
#      branch in quick succession fans out redundant runs that pile up as
#      `action_required`. Mirrors every sibling caller (pr-review.yml,
#      ci-failure-analyst.yml, add-to-project.yml, ...). See Checks 2-4.
#   2. (#430) any `Install yq` step extracts the SHA-256 from the mikefarah/yq
#      `checksums` release asset correctly (filename anchored at line start,
#      column 19). The buggy end-anchored / column-1 extraction produced an empty
#      checksum and a deterministic `sha256sum: no properly formatted checksum
#      lines found` failure that degraded CI. See Check 5.
#   3. (#438) every `curl` download retries on transient network failures
#      (`--retry`), so a DNS/connection blip is absorbed rather than failing CI
#      deterministically. See Check 6.
#   4. (#470) every job declares a positive-integer `timeout-minutes`, so a
#      stalled step fails fast instead of inheriting GitHub's 6-hour default and
#      landing as a timeout failure. See Check 7.
#   5. (#474) any `gitleaks detect` enforcement step loads a committed `--config`
#      whose file exists. Path-based allowlists in that config suppress reviewed
#      false positives independently of the commit SHA; without it, suppression
#      falls back to `.gitleaksignore` commit-SHA fingerprints, so a reviewed
#      false positive reappears under a fresh SHA on every commit touching the
#      file and fails CI deterministically until hand-suppressed. See Check 8.
#   6. (#486) every job declaring a `strategy.matrix` sets `strategy.fail-fast:
#      false`. With fail-fast enabled (GitHub's default when it is absent) the
#      first failing matrix leg cancels its siblings, which land as cancelled
#      runs and discard the other OSes' results — inflating the Fleet Monitor
#      cancelled/failure metrics and hiding per-OS signal. See Check 9.
#   7. (#552) every `curl` download passes `--proto '=https'`, so a followed
#      redirect cannot downgrade it to plain HTTP (SonarCloud
#      githubactions:S6506). See Check 10.
#
# Accepts an optional workflow path (default: .github/workflows/ci.yml) so the
# checks can be exercised against fixtures — see test-ci-workflow.test.sh.
# Run: bash scripts/test-ci-workflow.sh
set -euo pipefail

WORKFLOW="${1:-.github/workflows/ci.yml}"
PASS=true

echo "=== test-ci-workflow ==="

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

# ── Check 2: a top-level concurrency block is present ──────────────────────
if ! group=$(yq '.concurrency.group' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse $WORKFLOW. Please check if it is valid YAML."
  exit 1
fi
if [[ "$group" == "null" || -z "$group" ]]; then
  echo "FAIL: no top-level 'concurrency.group' block in $WORKFLOW"
  echo "      Add one to serialize redundant runs of the same ref."
  PASS=false
else
  echo "PASS: 'concurrency.group' block present in $WORKFLOW"
fi

# ── Check 3: the group is keyed on the Git ref ─────────────────────────────
# Grouping per ref lets each branch/PR have its own lane while redundant runs
# for the same ref share it. Main and each PR branch stay isolated.
if [[ "$PASS" == "true" ]]; then
  ref_pattern='github\.ref'
  if [[ ! "$group" =~ $ref_pattern ]]; then
    echo "FAIL: concurrency group ($group) is not keyed on github.ref in $WORKFLOW"
    PASS=false
  else
    echo "PASS: concurrency group keyed on github.ref in $WORKFLOW"
  fi
fi

# ── Check 4: cancel-in-progress is unconditionally true ───────────────────
# With a SHA-scoped concurrency group each commit gets its own slot, so runs for
# different commits never compete. cancel-in-progress: true only affects duplicate
# runs within the same slot (same ref + SHA), making it safe to set unconditionally.
if ! cancel=$(yq '.concurrency.cancel-in-progress' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse $WORKFLOW. Please check if it is valid YAML."
  exit 1
fi
if [[ "$cancel" == "null" || -z "$cancel" ]]; then
  echo "FAIL: 'concurrency.cancel-in-progress' is missing in $WORKFLOW"
  PASS=false
elif [[ "$cancel" != "true" ]]; then
  echo "FAIL: 'concurrency.cancel-in-progress' (found: '$cancel') must be 'true' in $WORKFLOW"
  PASS=false
else
  echo "PASS: 'concurrency.cancel-in-progress' is unconditionally true in $WORKFLOW"
fi

# ── Check 5: any `Install yq` step extracts the SHA-256 correctly ──────────
# Root cause of Fleet Monitor #430: ci.yml's `workflow-tests` job installs yq by
# downloading the mikefarah/yq `checksums` release asset and comparing it to the
# binary. That file is a *multi-hash table* — the asset filename is the FIRST
# column and SHA-256 is column 19 (see the release's `checksums_hashes_order`).
# The step that degraded CI matched the filename with an end-anchor
# (`grep "yq_linux_amd64$"`, which never matches — the name is at line start) and
# selected column 1 (the filename) via `awk '{print $1}'`. Either mistake yields
# an empty checksum and a deterministic `sha256sum: no properly formatted
# checksum lines found` failure. This check locks the correct extraction so the
# drift cannot return. It is a no-op when no `Install yq` step is present.
if ! yq_run=$(yq '.jobs[].steps[] | select(.name == "Install yq") | .run' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse $WORKFLOW. Please check if it is valid YAML."
  exit 1
fi

if [[ -z "$yq_run" || "$yq_run" == "null" ]]; then
  echo "PASS: no 'Install yq' step in $WORKFLOW — yq checksum check not applicable"
else
  # The filename must be anchored at line start; an end-anchor never matches the
  # `checksums` table (the filename is column 1), leaving the checksum empty.
  if grep -Fq 'yq_linux_amd64$' <<< "$yq_run"; then
    echo "FAIL: 'Install yq' matches the checksum line with an end-anchor"
    echo "      ('yq_linux_amd64\$'). The filename is column 1 — anchor at line"
    echo "      start ('^yq_linux_amd64  ') so the match succeeds."
    PASS=false
  # Column 1 is the filename, not a hash; selecting it yields an empty checksum.
  elif grep -Fq "awk '{print \$1}'" <<< "$yq_run"; then
    echo "FAIL: 'Install yq' extracts checksum column 1 (the filename) via"
    echo "      awk '{print \$1}'. SHA-256 is column 19 in the mikefarah/yq"
    echo "      checksums table — use awk '{print \$19}'."
    PASS=false
  # SHA-256 lives in column 19 (per checksums_hashes_order); require it explicitly.
  elif ! grep -Fq "\$19" <<< "$yq_run"; then
    echo "FAIL: 'Install yq' does not select checksum column 19 (SHA-256) in"
    echo "      $WORKFLOW. The mikefarah/yq checksums file lists SHA-256 as"
    echo "      column 19 — use awk '{print \$19}'."
    PASS=false
  else
    echo "PASS: 'Install yq' extracts the SHA-256 (column 19) in $WORKFLOW"
  fi
fi

# ── Check 6: every `curl` download retries on transient network failures ───
# A curl without --retry turns a transient network blip (DNS hiccup, connection
# reset, 429/5xx from the release host) into a hard, deterministic-looking CI
# failure — exactly the class of noise that inflates the Fleet Monitor failure
# rate (#438). Require every curl invocation to pass --retry so such blips are
# absorbed. Backslash line-continuations are folded first so a curl whose flags
# span multiple lines is evaluated as a single logical command. No-op when the
# workflow contains no curl.
runs=""
if ! runs=$(yq '.jobs[].steps[].run' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse $WORKFLOW. Please check if it is valid YAML."
  exit 1
fi

# Fold "\<newline>" continuations into one line so multi-line curls are whole.
folded=""
if ! folded=$(printf '%s\n' "$runs" | sed -e ':a' -e '/\\$/{N;s/\\\n/ /;ba}'); then
  echo "FAIL: failed to fold multi-line commands."
  exit 1
fi

# Split chained commands (&&, ||, ;, |) so a curl missing --retry is not
# masked by another command on the same line that has --retry.
split_commands=""
if ! split_commands=$(awk '{gsub(/&&|\|\||;|\|/, "\n"); print}' <<< "$folded"); then
  echo "FAIL: failed to split chained commands."
  exit 1
fi

curl_missing_retry=false
while IFS= read -r line; do
  # Match `curl` only as a command word (line start or after a non-name char
  # such as the `$(` of a command substitution), not as a substring.
  if grep -Eq '(^|[^[:alnum:]_-])curl([[:space:]]|$)' <<< "$line" \
    && ! grep -Fq -- '--retry' <<< "$line"; then
    curl_missing_retry=true
  fi
done <<< "$split_commands"

if [[ "$curl_missing_retry" == "true" ]]; then
  echo "FAIL: a 'curl' download in $WORKFLOW has no '--retry' flag. A transient"
  echo "      network failure would then fail CI deterministically and inflate"
  echo "      the Fleet Monitor failure rate. Add e.g."
  echo "      '--retry 3 --retry-delay 2 --retry-all-errors' to every curl."
  PASS=false
else
  echo "PASS: every 'curl' download retries on transient failures in $WORKFLOW"
fi

# ── Check 7: every job declares a positive-integer `timeout-minutes` ───────
# Root cause class for Fleet Monitor #470: a job without `timeout-minutes`
# inherits GitHub's 6-hour default. A step that *stalls* rather than errors — a
# curl that connects then hangs (which --retry does not cover), or any wedged
# process — then runs for hours before being killed and counted as a timeout
# failure, inflating the Fleet Monitor failure rate and burning runner minutes.
# p95 for this workflow is ~150s, so a bounded per-job timeout turns a hang into
# a fast, obvious failure instead of a 6-hour one. Mirrors the timeout-minutes
# convention already used by sonarcloud.yml, copilot-setup-steps.yml,
# initiative-driver.yml and feature-ideation.yml.
job_names=""
if ! job_names=$(yq '.jobs | keys | .[]' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse $WORKFLOW. Please check if it is valid YAML."
  exit 1
fi

timeout_pattern='^[0-9]+$'
while IFS= read -r job; do
  [[ -z "$job" ]] && continue
  timeout=""
  if ! timeout=$(J="$job" yq '.jobs[env(J)]["timeout-minutes"]' "$WORKFLOW" 2>/dev/null); then
    echo "FAIL: yq failed to read timeout-minutes for job '$job' in $WORKFLOW."
    exit 1
  fi
  if [[ "$timeout" == "null" || -z "$timeout" ]]; then
    echo "FAIL: job '$job' in $WORKFLOW declares no 'timeout-minutes'. Without one"
    echo "      it inherits GitHub's 6-hour default, so a stalled step runs for"
    echo "      hours and lands as a timeout failure. Add e.g. 'timeout-minutes: 10'."
    PASS=false
  elif [[ ! "$timeout" =~ $timeout_pattern || "$timeout" -le 0 ]]; then
    echo "FAIL: job '$job' in $WORKFLOW has an invalid 'timeout-minutes'"
    echo "      (found: '$timeout'). It must be a positive integer."
    PASS=false
  else
    timeout_tag=""
    timeout_tag=$(J="$job" yq '.jobs[env(J)]["timeout-minutes"] | tag' "$WORKFLOW" 2>/dev/null) || true
    if [[ "$timeout_tag" != "!!int" ]]; then
      echo "FAIL: job '$job' in $WORKFLOW declares 'timeout-minutes' as a quoted string"
      echo "      (found: '\"$timeout\"'). GitHub Actions requires a bare integer, e.g. 'timeout-minutes: $timeout'."
      PASS=false
    else
      echo "PASS: job '$job' declares timeout-minutes ($timeout) in $WORKFLOW"
    fi
  fi
done <<< "$job_names"

# ── Check 8: the gitleaks CLI enforcement step loads a committed --config ──
# Root cause of Fleet Monitor #474: ci.yml's full-history gitleaks scan
# (`gitleaks detect --source .`) suppressed known false positives only through
# the root `.gitleaksignore`, whose entries are per-commit-SHA fingerprints
# (`<commit-sha>:<file>:<rule>:<line>`). Recurring false positives — SHA-256
# content checksums in _bmad/_config/files-manifest.csv, an example expired JWT
# in a BMAD knowledge article — reappear under a NEW commit SHA on every PR that
# touches or rebases those files. The new fingerprint is absent from
# `.gitleaksignore`, so the scan fails deterministically until a human hand-adds
# the SHA — an unwinnable whack-a-mole that inflates the Fleet Monitor failure
# rate. A committed `--config` file with PATH-based (commit-SHA-independent)
# allowlists ends it. Lock the invariant: any `gitleaks detect` step must pass
# `--config <file>` and that file must exist in the repo. No-op when the
# workflow has no gitleaks step.
gitleaks_run=""
if ! gitleaks_run=$(yq '.jobs[].steps[] | select(.run // "" | test("gitleaks detect")) | .run' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse $WORKFLOW. Please check if it is valid YAML."
  exit 1
fi

if [[ -z "$gitleaks_run" || "$gitleaks_run" == "null" ]]; then
  echo "PASS: no 'gitleaks detect' step in $WORKFLOW — gitleaks --config check not applicable"
else
  # Fold "\<newline>" continuations so a --config whose flags span lines is whole.
  folded_gitleaks=""
  if ! folded_gitleaks=$(printf '%s\n' "$gitleaks_run" | sed -e ':a' -e '/\\$/{N;s/\\\n/ /;ba}'); then
    echo "FAIL: failed to fold multi-line gitleaks command."
    exit 1
  fi
  # Validate every gitleaks detect call — including those chained with && on one
  # line. Split each output line from yq on ' && ' and ' ; ' so each gitleaks
  # detect subcommand is examined independently; non-gitleaks segments are skipped.
  while IFS= read -r cmd; do
    [[ -z "$cmd" ]] && continue
    any_detect=false
    config_path=""
    seg_bad=false
    while IFS= read -r seg; do
      [[ "$seg" != *"gitleaks detect"* ]] && continue
      any_detect=true
      # Accept both `--config <path>` and `--config=<path>`; strip surrounding quotes.
      seg_path=""
      seg_path=$(grep -Eo -- '--config[= ][^[:space:]]+' <<< "$seg" | head -1 | \
        sed -E "s/^--config[= ]//; s/^['\"]//; s/['\"]$//") || true
      if [[ -z "$seg_path" ]]; then
        seg_bad=true
        break
      fi
      config_path="$seg_path"
    done < <(printf '%s\n' "$cmd" | sed 's/ && /\n/g; s/ ; /\n/g')
    [[ "$any_detect" == "false" ]] && continue
    [[ "$seg_bad" == "true" ]] && config_path=""

    if [[ -z "$config_path" ]]; then
      echo "FAIL: the 'gitleaks detect' step in $WORKFLOW passes no '--config'. Without"
      echo "      a committed config its path-based allowlists never load, so false"
      echo "      positives are suppressed only by per-commit .gitleaksignore"
      echo "      fingerprints and reappear under a fresh SHA on every commit — a"
      echo "      whack-a-mole that fails CI deterministically (#474). Add"
      echo "      '--config .gitleaks.toml'."
      PASS=false
    elif [[ "$config_path" == /* || "$config_path" == *..* ]]; then
      echo "FAIL: the 'gitleaks detect' step in $WORKFLOW references '--config"
      echo "      $config_path', which must be a relative repo path (no absolute"
      echo "      paths or '..' traversal). The config must be committed to the repo."
      PASS=false
    elif [[ ! -f "$config_path" ]]; then
      echo "FAIL: the 'gitleaks detect' step in $WORKFLOW references '--config"
      echo "      $config_path', but that file does not exist in the repo. The"
      echo "      config carries the path-based false-positive allowlists; a dangling"
      echo "      reference silently falls back to the default config (#474)."
      PASS=false
    elif git rev-parse --git-dir >/dev/null 2>&1 && \
         ! git ls-files --error-unmatch "$config_path" >/dev/null 2>&1; then
      echo "FAIL: the 'gitleaks detect' step in $WORKFLOW references '--config"
      echo "      $config_path', which exists but is not tracked by git. The config"
      echo "      must be committed to prevent bypass via an untracked substitute"
      echo "      placed before the scan."
      PASS=false
    else
      echo "PASS: 'gitleaks detect' loads a committed --config ($config_path) in $WORKFLOW"
    fi
  done <<< "$folded_gitleaks"
fi

# ── Check 9: every matrix job sets `strategy.fail-fast: false` ─────────────
# Fleet Monitor #486: the app-build `quality` job runs a
# `strategy.matrix.os: [ubuntu, macos, windows]` fan-out. GitHub defaults an
# absent (or explicit-true) `fail-fast` to true, so the first failing leg
# CANCELS the still-running siblings. Those cancelled legs land as cancelled
# runs (a metric Fleet Monitor tracks) and, worse, discard the other OSes'
# results — so a failure that is really Linux-only looks like a whole-workflow
# failure and the true cross-OS signal is lost. `fail-fast: false` lets every
# leg run to completion and report independently, keeping the failure/cancelled
# metrics an honest reflection of genuine per-OS results. Lock the invariant:
# any job declaring a `strategy.matrix` must set `strategy.fail-fast: false`.
# No-op when the workflow declares no matrix (as on main today) — mirrors the
# not-applicable handling of Checks 5 and 8.
matrix_job_names=""
if ! matrix_job_names=$(yq '.jobs | keys | .[]' "$WORKFLOW" 2>/dev/null); then
  echo "FAIL: yq failed to parse $WORKFLOW. Please check if it is valid YAML."
  exit 1
fi

any_matrix=false
while IFS= read -r job; do
  [[ -z "$job" ]] && continue
  matrix=""
  if ! matrix=$(J="$job" yq '.jobs[env(J)].strategy.matrix' "$WORKFLOW" 2>/dev/null); then
    echo "FAIL: yq failed to read strategy.matrix for job '$job' in $WORKFLOW."
    exit 1
  fi
  # Only jobs that actually declare a matrix are subject to this invariant.
  [[ "$matrix" == "null" || -z "$matrix" ]] && continue
  any_matrix=true

  fail_fast=""
  if ! fail_fast=$(J="$job" yq '.jobs[env(J)].strategy["fail-fast"]' "$WORKFLOW" 2>/dev/null); then
    echo "FAIL: yq failed to read strategy.fail-fast for job '$job' in $WORKFLOW."
    exit 1
  fi
  if [[ "$fail_fast" == "null" || -z "$fail_fast" ]]; then
    echo "FAIL: matrix job '$job' in $WORKFLOW does not set 'strategy.fail-fast'."
    echo "      GitHub defaults an absent fail-fast to true, so the first failing"
    echo "      matrix leg cancels its siblings — inflating the Fleet Monitor"
    echo "      cancelled/failure metrics and hiding per-OS signal (#486). Add"
    echo "      'fail-fast: false' under the job's 'strategy'."
    PASS=false
  elif [[ "$fail_fast" =~ ^\$\{\{.*\}\}$ ]]; then
    echo "INFO: matrix job '$job' in $WORKFLOW sets strategy.fail-fast to a GitHub"
    echo "      Actions expression ('$fail_fast') — cannot verify statically; skipping."
  elif [[ "$fail_fast" != "false" ]]; then
    echo "FAIL: matrix job '$job' in $WORKFLOW sets 'strategy.fail-fast: $fail_fast'."
    echo "      With fail-fast enabled the first failing leg cancels its siblings,"
    echo "      so a single-OS failure registers as a whole-workflow failure and"
    echo "      the other OSes' results are lost (#486). Set 'fail-fast: false'."
    PASS=false
  else
    echo "PASS: matrix job '$job' sets strategy.fail-fast: false in $WORKFLOW"
  fi
done <<< "$matrix_job_names"

if [[ "$any_matrix" == "false" ]]; then
  echo "PASS: no matrix strategy in $WORKFLOW — fail-fast check not applicable"
fi

# ── Check 10: every `curl` download is restricted to HTTPS ─────────────────
# SonarCloud githubactions:S6506 (#552): `curl -L` follows redirects to any
# protocol, so an https:// URL can be redirected to plain http:// and the
# download fetched in cleartext. `--proto '=https'` restricts every request —
# including followed redirects — to HTTPS. Unlike Check 6, this one tokenizes
# the shell (quotes honoured, `#` comments dropped when they begin an unquoted
# word, `&&`/`||`/`;`/`|` split commands) so that text inside a comment cannot
# satisfy the check, and curl uses the LAST `--proto` given, so only the final
# value is judged. `curl` must be an exact executable token. No-op when the
# workflow contains no curl.
curl_proto_bad=false

# Judge one tokenized command (args: tokens). Sets curl_proto_bad when it runs
# curl without an effective final `--proto =https`.
judge_curl_command() {
  local i tok proto="" found=false
  for ((i = 1; i <= $#; i++)); do
    tok="${!i}"
    if [[ "$found" == "false" ]]; then
      tok="${tok##*\$(}"
      tok="${tok##*\`}"
      tok="${tok#(}"
      [[ "$tok" == "curl" ]] && found=true
      continue
    fi
    if [[ "$tok" == "--proto" ]]; then
      i=$((i + 1))
      proto="${!i:-}"
    elif [[ "$tok" == --proto=* ]]; then
      proto="${tok#--proto=}"
    fi
  done
  if [[ "$found" == "true" && "$proto" != "=https" ]]; then
    curl_proto_bad=true
  fi
}

# Tokenize each line of $1 and judge every command found in it.
scan_curl_proto() {
  local text="$1" line c i quote word has_word
  local -a toks
  while IFS= read -r line; do
    toks=()
    quote=""
    word=""
    has_word=false
    for ((i = 0; i < ${#line}; i++)); do
      c="${line:i:1}"
      if [[ "$quote" == "'" ]]; then
        if [[ "$c" == "'" ]]; then quote=""; else word+="$c"; fi
      elif [[ "$quote" == '"' ]]; then
        if [[ "$c" == '"' ]]; then
          quote=""
        elif [[ "$c" == "\\" && $((i + 1)) -lt ${#line} ]]; then
          i=$((i + 1))
          word+="${line:i:1}"
        else
          word+="$c"
        fi
      elif [[ "$c" == "'" || "$c" == '"' ]]; then
        quote="$c"
        has_word=true
      elif [[ "$c" == "\\" && $((i + 1)) -lt ${#line} ]]; then
        i=$((i + 1))
        word+="${line:i:1}"
        has_word=true
      elif [[ "$c" == "#" && "$has_word" == "false" ]]; then
        break
      elif [[ "$c" == [[:space:]] ]]; then
        if [[ "$has_word" == "true" ]]; then toks+=("$word"); fi
        word=""
        has_word=false
      elif [[ "$c" == "&" || "$c" == "|" || "$c" == ";" ]]; then
        if [[ "$has_word" == "true" ]]; then toks+=("$word"); fi
        word=""
        has_word=false
        if [[ ${#toks[@]} -gt 0 ]]; then judge_curl_command "${toks[@]}"; fi
        toks=()
      else
        word+="$c"
        has_word=true
      fi
    done
    if [[ "$has_word" == "true" ]]; then toks+=("$word"); fi
    if [[ ${#toks[@]} -gt 0 ]]; then judge_curl_command "${toks[@]}"; fi
  done <<< "$text"
}

scan_curl_proto "$folded"
curl_missing_proto="$curl_proto_bad"

if [[ "$curl_missing_proto" == "true" ]]; then
  echo "FAIL: a 'curl' download in $WORKFLOW does not pass \"--proto '=https'\"."
  echo "      Following a redirect could then downgrade the download to plain"
  echo "      HTTP (SonarCloud githubactions:S6506). Add \"--proto '=https'\" to"
  echo "      every curl."
  PASS=false
else
  echo "PASS: every 'curl' download is restricted to HTTPS in $WORKFLOW"
fi

echo ""
if [[ "$PASS" == "true" ]]; then
  echo "All checks passed."
else
  echo "One or more checks failed."
  exit 1
fi
