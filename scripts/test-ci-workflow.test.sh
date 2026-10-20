#!/usr/bin/env bash
# test-ci-workflow.test.sh — portable tests for the ci.yml regression guard
# (scripts/test-ci-workflow.sh). Verifies it both enforces the concurrency
# invariants (Fleet Monitor #380) and catches the yq checksum-extraction bug
# that degraded ci.yml in Fleet Monitor #430. No bats dependency: the guard is
# driven as a subprocess against temporary fixture workflows.
# Run: bash scripts/test-ci-workflow.test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD="${SCRIPT_DIR}/test-ci-workflow.sh"

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

# ── Fixture fragments ──────────────────────────────────────────────────────
# A valid header that satisfies the concurrency invariants (Checks 1-4) so that
# only the yq check (Check 5) differentiates the fixtures below.
write_header() {
  local file="$1"
  cat > "$file" <<'YAML'
name: CI
on:
  pull_request:
    branches: [main]
concurrency:
  group: ci-${{ github.ref }}-${{ github.sha }}
  cancel-in-progress: true
jobs:
  secret-scan:
    name: Secret scan
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo scan
YAML
}

# The buggy Install yq step that caused #430: the filename is matched with an
# end-anchor (never matches — it is the first column) and column 1 (the
# filename) is selected instead of the SHA-256 column.
append_buggy_yq() {
  local file="$1"
  cat >> "$file" <<'YAML'
  workflow-tests:
    name: Workflow regression guards
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Install yq
        env:
          YQ_VERSION: v4.44.6
        run: |
          curl -sSfL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" -o /tmp/yq
          EXPECTED=$(curl -sSfL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/checksums" | grep "yq_linux_amd64$" | awk '{print $1}')
          echo "${EXPECTED}  /tmp/yq" | sha256sum --check
YAML
}

# The correct Install yq step: filename anchored at line start, SHA-256 column
# (19, per checksums_hashes_order) selected.
append_correct_yq() {
  local file="$1"
  cat >> "$file" <<'YAML'
  workflow-tests:
    name: Workflow regression guards
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Install yq
        env:
          YQ_VERSION: v4.44.6
        run: |
          curl -sSfL --proto '=https' --retry 3 --retry-delay 2 --retry-all-errors "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" -o /tmp/yq
          EXPECTED=$(curl -sSfL --proto '=https' --retry 3 --retry-delay 2 --retry-all-errors "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/checksums" | grep "^yq_linux_amd64  " | awk '{print $19}')
          echo "${EXPECTED}  /tmp/yq" | sha256sum --check
YAML
}

# Buggy Install yq step followed by an unnamed step that contains $19 as a decoy.
# The guard must scope validation to the Install yq step only and reject the decoy.
append_buggy_yq_with_decoy() {
  local file="$1"
  cat >> "$file" <<'YAML'
  workflow-tests:
    name: Workflow regression guards
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Install yq
        env:
          YQ_VERSION: v4.44.6
        run: |
          curl -sSfL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" -o /tmp/yq
          EXPECTED=$(curl -sSfL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/checksums" | grep "yq_linux_amd64$" | awk '{print $1}')
          echo "${EXPECTED}  /tmp/yq" | sha256sum --check
      - run: |
          # decoy: $19 lives in an unnamed step — must not rescue the buggy Install yq above
          echo "awk '{print $19}'"
YAML
}

# A second job that declares a positive-integer `timeout-minutes` and no curl.
# Appended after a valid header so ONLY the timeout invariant (Check 7) is at
# play: with it present on every job the guard accepts, without it the guard
# rejects.
append_job_with_timeout() {
  local file="$1"
  cat >> "$file" <<'YAML'
  workflow-tests:
    name: Workflow regression guards
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo guards
YAML
}

# A second job that declares NO `timeout-minutes`. Without a job timeout a
# stalled step runs to GitHub's 6-hour default before being killed and counted
# as a failure — the class of noise that inflates the Fleet Monitor failure rate
# (#470). ONLY the missing timeout differentiates this fixture (Check 7).
append_job_without_timeout() {
  local file="$1"
  cat >> "$file" <<'YAML'
  workflow-tests:
    name: Workflow regression guards
    runs-on: ubuntu-latest
    steps:
      - run: echo guards
YAML
}

# A second job that declares `timeout-minutes: "10"` (quoted string). GitHub
# Actions requires a bare YAML integer; a quoted value is a YAML type error
# that yq masks by stripping quotes, so the guard checks the YAML tag (#471).
append_job_with_quoted_timeout() {
  local file="$1"
  cat >> "$file" <<'YAML'
  workflow-tests:
    name: Workflow regression guards
    runs-on: ubuntu-latest
    timeout-minutes: "10"
    steps:
      - run: echo guards
YAML
}

# A second job that declares `timeout-minutes: 0`. Zero is not a valid job
# timeout (GitHub requires a positive integer) and must be rejected just like a
# missing value.
append_job_zero_timeout() {
  local file="$1"
  cat >> "$file" <<'YAML'
  workflow-tests:
    name: Workflow regression guards
    runs-on: ubuntu-latest
    timeout-minutes: 0
    steps:
      - run: echo guards
YAML
}

# A job whose curl download omits --retry. A transient network blip would then
# fail CI deterministically and inflate the Fleet Monitor failure rate. The
# filename is anchored correctly and column 19 is selected so ONLY the missing
# --retry (Check 6) differentiates this fixture.
append_curl_without_retry() {
  local file="$1"
  cat >> "$file" <<'YAML'
  workflow-tests:
    name: Workflow regression guards
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Install yq
        env:
          YQ_VERSION: v4.44.6
        run: |
          curl -sSfL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" -o /tmp/yq
          EXPECTED=$(curl -sSfL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/checksums" | grep "^yq_linux_amd64  " | awk '{print $19}')
          echo "${EXPECTED}  /tmp/yq" | sha256sum --check
YAML
}

# A job whose curl downloads all pass --retry, including one whose flags span a
# backslash line-continuation. The guard must fold the continuation and accept it.
append_curl_with_retry_multiline() {
  local file="$1"
  cat >> "$file" <<'YAML'
  workflow-tests:
    name: Workflow regression guards
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Install yq
        env:
          YQ_VERSION: v4.44.6
        run: |
          curl -sSfL --proto '=https' --retry 3 --retry-delay 2 --retry-all-errors \
            "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" \
            -o /tmp/yq
          EXPECTED=$(curl -sSfL --proto '=https' --retry 3 --retry-delay 2 --retry-all-errors \
            "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/checksums" \
            | grep "^yq_linux_amd64  " | awk '{print $19}')
          echo "${EXPECTED}  /tmp/yq" | sha256sum --check
YAML
}

# A step where a curl without --retry is chained (&&) with one that has it.
# A line-level check would miss the missing --retry because --retry appears
# elsewhere in the same line; the guard must split chained commands first.
append_curl_without_retry_chained() {
  local file="$1"
  cat >> "$file" <<'YAML'
  workflow-tests:
    name: Workflow regression guards
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Download tools
        run: |
          curl -sSfL "https://example.com/tool" -o /tmp/tool && curl -sSfL --proto '=https' --retry 3 --retry-delay 2 --retry-all-errors "https://example.com/checksums" -o /tmp/checksums
YAML
}

# Correct Install yq step followed by an unnamed step whose content would trip
# up an over-broad line-capture but must not cause a false failure.
append_correct_yq_with_unnamed_step() {
  local file="$1"
  cat >> "$file" <<'YAML'
  workflow-tests:
    name: Workflow regression guards
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Install yq
        env:
          YQ_VERSION: v4.44.6
        run: |
          curl -sSfL --proto '=https' --retry 3 --retry-delay 2 --retry-all-errors "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" -o /tmp/yq
          EXPECTED=$(curl -sSfL --proto '=https' --retry 3 --retry-delay 2 --retry-all-errors "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/checksums" | grep "^yq_linux_amd64  " | awk '{print $19}')
          echo "${EXPECTED}  /tmp/yq" | sha256sum --check
      - run: |
          # unnamed step with suspicious content — guard must ignore it
          echo "grep 'yq_linux_amd64$' | awk '{print $1}'"
YAML
}

# A job whose curl downloads retry but do not restrict protocols to HTTPS. A
# redirect could then downgrade the download to plain HTTP (SonarCloud
# githubactions:S6506, #552). ONLY the missing --proto '=https' (Check 10)
# differentiates this fixture from append_curl_with_retry_multiline.
append_curl_without_proto() {
  local file="$1"
  cat >> "$file" <<'YAML'
  workflow-tests:
    name: Workflow regression guards
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Install yq
        env:
          YQ_VERSION: v4.44.6
        run: |
          curl -sSfL --retry 3 --retry-delay 2 --retry-all-errors \
            "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" \
            -o /tmp/yq
          EXPECTED=$(curl -sSfL --retry 3 --retry-delay 2 --retry-all-errors \
            "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/checksums" \
            | grep "^yq_linux_amd64  " | awk '{print $19}')
          echo "${EXPECTED}  /tmp/yq" | sha256sum --check
YAML
}

# A step where a curl without --proto '=https' is chained (&&) with one that has
# it. The guard must evaluate each chained curl independently.
append_curl_without_proto_chained() {
  local file="$1"
  cat >> "$file" <<'YAML'
  workflow-tests:
    name: Workflow regression guards
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Download tools
        run: |
          curl -sSfL --retry 3 "https://example.com/tool" -o /tmp/tool && curl -sSfL --proto '=https' --retry 3 "https://example.com/checksums" -o /tmp/checksums
YAML
}

# A gitleaks CLI enforcement step that runs a full-history scan but passes NO
# --config. Root cause of Fleet Monitor #474: without a committed --config the
# scan suppresses false positives only via .gitleaksignore commit-SHA
# fingerprints, so a reviewed false positive reappears under a fresh SHA on
# every commit touching the file and fails CI until hand-suppressed (Check 8).
append_gitleaks_no_config() {
  local file="$1"
  cat >> "$file" <<'YAML'
  gitleaks-scan:
    name: Gitleaks CLI
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Run gitleaks (CLI)
        run: |
          /tmp/gitleaks detect --source . --redact --verbose --exit-code 1
YAML
}

# A gitleaks step whose --config points at a file that does not exist in the
# repo. A committed, present config is what makes the path-based allowlists
# actually load, so a dangling reference must be rejected (Check 8).
append_gitleaks_config_missing() {
  local file="$1"
  cat >> "$file" <<'YAML'
  gitleaks-scan:
    name: Gitleaks CLI
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Run gitleaks (CLI)
        run: |
          /tmp/gitleaks detect --source . --config .gitleaks-does-not-exist.toml --redact --exit-code 1
YAML
}

# A gitleaks step whose --config points at the repo's committed .gitleaks.toml.
# This is the fixed shape (Check 8 accepts it). The referenced file must exist
# in the directory the guard runs from — the fixture is exercised with CWD set
# to a scratch dir that contains a .gitleaks.toml, mirroring how CI resolves the
# path relative to the checked-out repo root.
append_gitleaks_config_ok() {
  local file="$1"
  cat >> "$file" <<'YAML'
  gitleaks-scan:
    name: Gitleaks CLI
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Run gitleaks (CLI)
        run: |
          /tmp/gitleaks detect --source . --config .gitleaks.toml --redact --verbose --exit-code 1
YAML
}

# Two gitleaks steps: second one omits --config. Both must be validated.
append_gitleaks_two_steps_second_no_config() {
  local file="$1"
  cat >> "$file" <<'YAML'
  gitleaks-scan:
    name: Gitleaks CLI
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Run gitleaks (CLI) with config
        run: |
          /tmp/gitleaks detect --source . --config .gitleaks.toml --redact --exit-code 1
      - name: Run gitleaks (CLI) without config
        run: |
          /tmp/gitleaks detect --source . --redact --exit-code 1
YAML
}

# A gitleaks step whose --config is a quoted path, e.g. --config ".gitleaks.toml".
append_gitleaks_config_quoted() {
  local file="$1"
  cat >> "$file" <<'YAML'
  gitleaks-scan:
    name: Gitleaks CLI
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Run gitleaks (CLI)
        run: |
          /tmp/gitleaks detect --source . --config ".gitleaks.toml" --redact --exit-code 1
YAML
}

# A gitleaks step whose --config is an absolute path (must be rejected).
append_gitleaks_config_absolute() {
  local file="$1"
  cat >> "$file" <<'YAML'
  gitleaks-scan:
    name: Gitleaks CLI
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Run gitleaks (CLI)
        run: |
          /tmp/gitleaks detect --source . --config /etc/gitleaks.toml --redact --exit-code 1
YAML
}

# A gitleaks step whose --config uses path traversal (must be rejected).
append_gitleaks_config_traversal() {
  local file="$1"
  cat >> "$file" <<'YAML'
  gitleaks-scan:
    name: Gitleaks CLI
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Run gitleaks (CLI)
        run: |
          /tmp/gitleaks detect --source . --config ../../etc/gitleaks.toml --redact --exit-code 1
YAML
}

# A single run line with two gitleaks detect calls chained with &&:
# the first has --config, the second does not. Both shapes must be validated.
append_gitleaks_chained_second_no_config() {
  local file="$1"
  cat >> "$file" <<'YAML'
  gitleaks-scan:
    name: Gitleaks CLI
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Run gitleaks (CLI) chained
        run: /tmp/gitleaks detect --source . --config .gitleaks.toml --exit-code 1 && /tmp/gitleaks detect --source . --exit-code 1
YAML
}

# A matrix job that sets `strategy.fail-fast: false`. This is the fixed shape
# (Check 9 accepts it): every OS leg runs to completion and reports
# independently, so one leg's failure never cancels its siblings. Only the
# fail-fast setting differentiates the three matrix fixtures below.
append_matrix_failfast_false() {
  local file="$1"
  cat >> "$file" <<'YAML'
  quality:
    runs-on: ${{ matrix.os }}
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - run: echo build
YAML
}

# A matrix job that sets `strategy.fail-fast: true`. The default GitHub
# behaviour: the first failing leg cancels the still-running siblings, which
# land as cancelled runs and hide per-OS signal — inflating the Fleet Monitor
# cancelled/failure metrics. Check 9 must reject it.
append_matrix_failfast_true() {
  local file="$1"
  cat >> "$file" <<'YAML'
  quality:
    runs-on: ${{ matrix.os }}
    timeout-minutes: 30
    strategy:
      fail-fast: true
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - run: echo build
YAML
}

# A matrix job that omits `strategy.fail-fast` entirely. GitHub defaults an
# absent fail-fast to true, so the cascade-cancellation risk is identical to
# an explicit `fail-fast: true`. Check 9 must reject the omission too.
append_matrix_no_failfast() {
  local file="$1"
  cat >> "$file" <<'YAML'
  quality:
    runs-on: ${{ matrix.os }}
    timeout-minutes: 30
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - run: echo build
YAML
}

# A matrix job that sets `strategy.fail-fast` to a GitHub Actions expression.
# yq emits the expression literal (e.g. `${{ false }}`), not the boolean it
# resolves to at runtime. Check 9 cannot statically evaluate GHA expressions
# and must accept them rather than blocking valid dynamic configurations.
append_matrix_failfast_expression() {
  local file="$1"
  cat >> "$file" <<'YAML'
  quality:
    runs-on: ${{ matrix.os }}
    timeout-minutes: 30
    strategy:
      fail-fast: ${{ false }}
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - run: echo build
YAML
}

run_guard() {
  local file="$1"
  bash "$GUARD" "$file" >/dev/null 2>&1
}

# Run the guard with a chosen working directory so a workflow's `--config
# <path>` (a repo-root-relative path, exactly as CI resolves it) is checked
# against a file that actually exists there. Uses an absolute path to both the
# guard and the workflow so the cd does not disturb resolution of either.
run_guard_in() {
  local cwd="$1" file="$2"
  ( cd "$cwd" && bash "$GUARD" "$file" ) >/dev/null 2>&1
}

# ── Case 1: buggy yq extraction is rejected (root cause of #430) ────────────
buggy="${TMP}/ci-buggy.yml"
write_header "$buggy"
append_buggy_yq "$buggy"
if run_guard "$buggy"; then
  fail "buggy yq extraction (yq_linux_amd64\$ / column 1) should be REJECTED"
else
  pass "buggy yq extraction is rejected"
fi

# ── Case 2: correct yq extraction is accepted ──────────────────────────────
good="${TMP}/ci-good.yml"
write_header "$good"
append_correct_yq "$good"
if run_guard "$good"; then
  pass "correct yq extraction (^yq_linux_amd64 / column 19) is accepted"
else
  fail "correct yq extraction should be ACCEPTED"
fi

# ── Case 3: no yq step present — check is skipped, guard still passes ───────
none="${TMP}/ci-none.yml"
write_header "$none"
if run_guard "$none"; then
  pass "workflow without an Install yq step passes (check skipped)"
else
  fail "workflow without an Install yq step should pass"
fi

# ── Case 4: concurrency invariant still enforced (regression for #380) ─────
noconc="${TMP}/ci-noconc.yml"
cat > "$noconc" <<'YAML'
name: CI
on:
  pull_request:
    branches: [main]
jobs:
  secret-scan:
    name: Secret scan
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo scan
YAML
if run_guard "$noconc"; then
  fail "workflow missing a concurrency block should be REJECTED"
else
  pass "workflow missing a concurrency block is rejected"
fi

# ── Case 5: decoy $19 in unnamed step must not rescue buggy Install yq ─────
decoy="${TMP}/ci-decoy.yml"
write_header "$decoy"
append_buggy_yq_with_decoy "$decoy"
if run_guard "$decoy"; then
  fail "buggy Install yq with decoy \$19 in unnamed step should be REJECTED"
else
  pass "decoy \$19 in unnamed step does not rescue buggy Install yq"
fi

# ── Case 6: correct Install yq with following unnamed step still passes ─────
correct_unnamed="${TMP}/ci-correct-unnamed.yml"
write_header "$correct_unnamed"
append_correct_yq_with_unnamed_step "$correct_unnamed"
if run_guard "$correct_unnamed"; then
  pass "correct Install yq with following unnamed step is accepted"
else
  fail "correct Install yq with following unnamed step should be ACCEPTED"
fi

# ── Case 7: a curl download without --retry is rejected (Check 6) ──────────
noretry="${TMP}/ci-noretry.yml"
write_header "$noretry"
append_curl_without_retry "$noretry"
if run_guard "$noretry"; then
  fail "curl download without --retry should be REJECTED"
else
  pass "curl download without --retry is rejected"
fi

# ── Case 8: curl downloads with --retry (incl. multi-line) are accepted ────
retry="${TMP}/ci-retry.yml"
write_header "$retry"
append_curl_with_retry_multiline "$retry"
if run_guard "$retry"; then
  pass "curl downloads with --retry (multi-line continuation) are accepted"
else
  fail "curl downloads with --retry should be ACCEPTED"
fi

# ── Case 9: curl without --retry chained (&&) with one that has it — rejected
chained="${TMP}/ci-chained.yml"
write_header "$chained"
append_curl_without_retry_chained "$chained"
if run_guard "$chained"; then
  fail "curl without --retry chained with one that has --retry should be REJECTED"
else
  pass "curl without --retry chained with one that has --retry is rejected"
fi

# ── Case 10: every job declaring timeout-minutes is accepted (Check 7) ──────
timeout_ok="${TMP}/ci-timeout-ok.yml"
write_header "$timeout_ok"
append_job_with_timeout "$timeout_ok"
if run_guard "$timeout_ok"; then
  pass "every job declaring timeout-minutes is accepted"
else
  fail "every job declaring timeout-minutes should be ACCEPTED"
fi

# ── Case 11: a job missing timeout-minutes is rejected (root cause of #470) ─
timeout_missing="${TMP}/ci-timeout-missing.yml"
write_header "$timeout_missing"
append_job_without_timeout "$timeout_missing"
if run_guard "$timeout_missing"; then
  fail "a job missing timeout-minutes should be REJECTED"
else
  pass "a job missing timeout-minutes is rejected"
fi

# ── Case 12: timeout-minutes: 0 (not a positive integer) is rejected ────────
timeout_zero="${TMP}/ci-timeout-zero.yml"
write_header "$timeout_zero"
append_job_zero_timeout "$timeout_zero"
if run_guard "$timeout_zero"; then
  fail "timeout-minutes: 0 should be REJECTED"
else
  pass "timeout-minutes: 0 is rejected"
fi

# ── Case 13: timeout-minutes: "10" (quoted string) is rejected ───────────────
timeout_quoted="${TMP}/ci-timeout-quoted.yml"
write_header "$timeout_quoted"
append_job_with_quoted_timeout "$timeout_quoted"
if run_guard "$timeout_quoted"; then
  fail 'timeout-minutes: "10" (quoted string) should be REJECTED'
else
  pass 'timeout-minutes: "10" (quoted string) is rejected'
fi

# ── Case 14: gitleaks step with no --config is rejected (root cause of #474) ─
gl_noconfig="${TMP}/ci-gl-noconfig.yml"
write_header "$gl_noconfig"
append_gitleaks_no_config "$gl_noconfig"
if run_guard "$gl_noconfig"; then
  fail "gitleaks step without --config should be REJECTED"
else
  pass "gitleaks step without --config is rejected"
fi

# ── Case 15: gitleaks --config pointing at a missing file is rejected ───────
gl_missing="${TMP}/ci-gl-missing.yml"
write_header "$gl_missing"
append_gitleaks_config_missing "$gl_missing"
if run_guard "$gl_missing"; then
  fail "gitleaks --config pointing at a missing file should be REJECTED"
else
  pass "gitleaks --config pointing at a missing file is rejected"
fi

# ── Case 16: gitleaks --config to an existing git-tracked config is accepted ──
# The guard resolves the repo-root-relative --config path against its working
# directory (as CI does against the checked-out repo). Exercise it from a scratch
# dir that is a git repo with .gitleaks.toml staged, mirroring a real CI checkout.
gl_ok_dir="${TMP}/gl-ok"
mkdir -p "$gl_ok_dir"
: > "${gl_ok_dir}/.gitleaks.toml"
git -C "$gl_ok_dir" init -q
git -C "$gl_ok_dir" add .gitleaks.toml
gl_ok="${gl_ok_dir}/ci-gl-ok.yml"
write_header "$gl_ok"
append_gitleaks_config_ok "$gl_ok"
if run_guard_in "$gl_ok_dir" "ci-gl-ok.yml"; then
  pass "gitleaks --config to an existing git-tracked config is accepted"
else
  fail "gitleaks --config to an existing git-tracked config should be ACCEPTED"
fi

# ── Case 17: no gitleaks step present — Check 8 is a no-op, guard still passes
gl_none="${TMP}/ci-gl-none.yml"
write_header "$gl_none"
append_job_with_timeout "$gl_none"
if run_guard "$gl_none"; then
  pass "workflow without a gitleaks step passes (Check 8 skipped)"
else
  fail "workflow without a gitleaks step should pass"
fi

# ── Case 18: two gitleaks steps — second without --config is rejected ─────────
gl_two_dir="${TMP}/gl-two"
mkdir -p "$gl_two_dir"
: > "${gl_two_dir}/.gitleaks.toml"
git -C "$gl_two_dir" init -q
git -C "$gl_two_dir" add .gitleaks.toml
cp /dev/null "${gl_two_dir}/ci-gl-two.yml"
write_header "${gl_two_dir}/ci-gl-two.yml"
append_gitleaks_two_steps_second_no_config "${gl_two_dir}/ci-gl-two.yml"
if run_guard_in "$gl_two_dir" "ci-gl-two.yml"; then
  fail "second gitleaks step without --config should be REJECTED"
else
  pass "second gitleaks step without --config is rejected"
fi

# ── Case 19: gitleaks --config with quoted path is accepted ──────────────────
gl_quoted_dir="${TMP}/gl-quoted"
mkdir -p "$gl_quoted_dir"
: > "${gl_quoted_dir}/.gitleaks.toml"
git -C "$gl_quoted_dir" init -q
git -C "$gl_quoted_dir" add .gitleaks.toml
write_header "${gl_quoted_dir}/ci-gl-quoted.yml"
append_gitleaks_config_quoted "${gl_quoted_dir}/ci-gl-quoted.yml"
if run_guard_in "$gl_quoted_dir" "ci-gl-quoted.yml"; then
  pass "gitleaks --config with quoted path is accepted"
else
  fail "gitleaks --config with quoted path should be ACCEPTED"
fi

# ── Case 20: gitleaks --config with absolute path is rejected ────────────────
gl_abs="${TMP}/ci-gl-abs.yml"
write_header "$gl_abs"
append_gitleaks_config_absolute "$gl_abs"
if run_guard "$gl_abs"; then
  fail "gitleaks --config with absolute path should be REJECTED"
else
  pass "gitleaks --config with absolute path is rejected"
fi

# ── Case 21: gitleaks --config with path traversal is rejected ───────────────
gl_trav="${TMP}/ci-gl-traversal.yml"
write_header "$gl_trav"
append_gitleaks_config_traversal "$gl_trav"
if run_guard "$gl_trav"; then
  fail "gitleaks --config with path traversal should be REJECTED"
else
  pass "gitleaks --config with path traversal is rejected"
fi

# ── Case 22: two gitleaks detect calls chained with &&, second lacks --config ─
# Validates that every gitleaks detect subcommand on a single line is checked,
# not just the first one (head -1 bug: configured first + unconfigured second).
gl_chained_dir="${TMP}/gl-chained"
mkdir -p "$gl_chained_dir"
: > "${gl_chained_dir}/.gitleaks.toml"
git -C "$gl_chained_dir" init -q
git -C "$gl_chained_dir" add .gitleaks.toml
write_header "${gl_chained_dir}/ci-gl-chained.yml"
append_gitleaks_chained_second_no_config "${gl_chained_dir}/ci-gl-chained.yml"
if run_guard_in "$gl_chained_dir" "ci-gl-chained.yml"; then
  fail "chained gitleaks detect with second call lacking --config should be REJECTED"
else
  pass "chained gitleaks detect with second call lacking --config is rejected"
fi

# ── Case 23: gitleaks --config pointing at an untracked file is rejected ──────
# Even if the file exists, using an untracked config is a security risk: an
# unreviewed file could be placed before the scan to bypass allowlist controls.
gl_untracked_dir="${TMP}/gl-untracked"
mkdir -p "$gl_untracked_dir"
git -C "$gl_untracked_dir" init -q
: > "${gl_untracked_dir}/.gitleaks.toml"  # exists but NOT staged/committed
write_header "${gl_untracked_dir}/ci-gl-untracked.yml"
append_gitleaks_config_ok "${gl_untracked_dir}/ci-gl-untracked.yml"
if run_guard_in "$gl_untracked_dir" "ci-gl-untracked.yml"; then
  fail "gitleaks --config pointing at an untracked file should be REJECTED"
else
  pass "gitleaks --config pointing at an untracked file is rejected"
fi

# ── Case 24: matrix job with fail-fast: false is accepted (Check 9) ──────────
ff_false="${TMP}/ci-ff-false.yml"
write_header "$ff_false"
append_matrix_failfast_false "$ff_false"
if run_guard "$ff_false"; then
  pass "matrix job with strategy.fail-fast: false is accepted"
else
  fail "matrix job with strategy.fail-fast: false should be ACCEPTED"
fi

# ── Case 25: matrix job with fail-fast: true is rejected (Check 9) ───────────
ff_true="${TMP}/ci-ff-true.yml"
write_header "$ff_true"
append_matrix_failfast_true "$ff_true"
if run_guard "$ff_true"; then
  fail "matrix job with strategy.fail-fast: true should be REJECTED"
else
  pass "matrix job with strategy.fail-fast: true is rejected"
fi

# ── Case 26: matrix job omitting fail-fast is rejected (Check 9) ─────────────
ff_missing="${TMP}/ci-ff-missing.yml"
write_header "$ff_missing"
append_matrix_no_failfast "$ff_missing"
if run_guard "$ff_missing"; then
  fail "matrix job omitting strategy.fail-fast should be REJECTED"
else
  pass "matrix job omitting strategy.fail-fast is rejected"
fi

# ── Case 27: matrix job with GHA expression for fail-fast is accepted (Check 9) ─
ff_expr="${TMP}/ci-ff-expr.yml"
write_header "$ff_expr"
append_matrix_failfast_expression "$ff_expr"
if run_guard "$ff_expr"; then
  pass "matrix job with strategy.fail-fast as GHA expression is accepted"
else
  fail "matrix job with strategy.fail-fast as GHA expression should be ACCEPTED"
fi

# ── Case 28: no matrix present — Check 9 is a no-op, guard still passes ───────
ff_none="${TMP}/ci-ff-none.yml"
write_header "$ff_none"
append_job_with_timeout "$ff_none"
if run_guard "$ff_none"; then
  pass "workflow without a matrix strategy passes (Check 9 skipped)"
else
  fail "workflow without a matrix strategy should pass"
fi

# ── Case 29: curl without --proto '=https' is rejected (S6506, #552) ──────────
noproto="${TMP}/ci-noproto.yml"
write_header "$noproto"
append_curl_without_proto "$noproto"
if run_guard "$noproto"; then
  fail "curl download without --proto '=https' should be REJECTED"
else
  pass "curl download without --proto '=https' is rejected"
fi

# ── Case 30: curl without --proto chained (&&) with one that has it — rejected ─
noproto_chained="${TMP}/ci-noproto-chained.yml"
write_header "$noproto_chained"
append_curl_without_proto_chained "$noproto_chained"
if run_guard "$noproto_chained"; then
  fail "curl without --proto '=https' chained with one that has it should be REJECTED"
else
  pass "curl without --proto '=https' chained with one that has it is rejected"
fi

echo ""
if [[ "$fails" -eq 0 ]]; then
  echo "All tests passed."
  exit 0
fi
echo "$fails test(s) failed." >&2
exit 1
