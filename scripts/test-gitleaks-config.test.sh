#!/usr/bin/env bash
# test-gitleaks-config.test.sh — portable tests for the .gitleaks.toml regression
# guard (scripts/test-gitleaks-config.sh). The guard enforces the invariant that
# keeps ci.yml's secret-scan job green (Fleet Monitor #483): no allowlist using
# `regexTarget = "line"` may anchor its regex with a leading `^`, because gitleaks
# passes a multi-line fragment as the "line" target and a leading ^ silently
# disables the allowlist. No bats dependency: the guard is driven as a subprocess
# against temporary fixture configs.
# Run: bash scripts/test-gitleaks-config.test.sh
set -euo pipefail

SCRIPT_DIR=""
if ! SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; then
  echo "FAIL: Failed to determine script directory" >&2
  exit 1
fi
GUARD="${SCRIPT_DIR}/test-gitleaks-config.sh"

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

# The guard uses yq to parse TOML (its Check 0). Without yq it exits early and
# these fixtures cannot be exercised, so skip cleanly rather than report noise.
if ! command -v yq >/dev/null 2>&1; then
  echo "SKIP: 'yq' not installed — cannot exercise the guard"
  exit 0
fi
# base64 is needed to round-trip regexes through the guard.
if ! command -v base64 >/dev/null 2>&1; then
  echo "SKIP: 'base64' not installed — cannot exercise the guard"
  exit 0
fi

TMP=""
if ! TMP="$(mktemp -d)"; then
  echo "FAIL: Failed to create temporary directory" >&2
  exit 1
fi
trap 'rm -rf "$TMP"' EXIT

# Run the guard against a fixture config and assert on its exit status. The
# guard's git-tracking check (Check 2) keys off the *current directory's* repo,
# so invoke the guard with cwd set to $TMP (which is not inside a git repo) and
# pass the fixture's basename. Check 2 then skips cleanly — exactly the
# behaviour we want when exercising throwaway fixtures.
assert_pass() {
  local desc="$1" file="$2"
  if (cd "$TMP" && bash "$GUARD" "$(basename "$file")") >/dev/null 2>&1; then
    pass "$desc"
  else
    fail "$desc (guard exited non-zero; expected pass)"
  fi
}
assert_fail() {
  local desc="$1" file="$2"
  if (cd "$TMP" && bash "$GUARD" "$(basename "$file")") >/dev/null 2>&1; then
    fail "$desc (guard exited zero; expected fail)"
  else
    pass "$desc"
  fi
}

# ── Fixtures ───────────────────────────────────────────────────────────────

# 1. The corrected form used in the repo: regexTarget "line", no leading ^ but a
#    trailing $. This is the shape the fix ships.
good="$TMP/good.toml"
cat > "$good" <<'TOML'
title = "good"
[extend]
useDefault = true
[[allowlists]]
targetRules = ["generic-api-key"]
condition = "AND"
paths = ['''^_bmad/_config/files-manifest\.csv$''']
regexTarget = "line"
regexes = ['''"[^"]*","[^"]*","[^"]*","[^"]*","[0-9a-f]{64}"$''']
TOML
assert_pass "line allowlist without a leading ^ anchor passes" "$good"

# 2. The #483 footgun: regexTarget "line" with a leading ^ anchor.
bad="$TMP/bad.toml"
cat > "$bad" <<'TOML'
title = "bad"
[extend]
useDefault = true
[[allowlists]]
targetRules = ["generic-api-key"]
condition = "AND"
paths = ['''^_bmad/_config/files-manifest\.csv$''']
regexTarget = "line"
regexes = ['''^"[^"]*","[^"]*","[^"]*","[^"]*","[0-9a-f]{64}"$''']
TOML
assert_fail "line allowlist with a leading ^ anchor fails" "$bad"

# 3. A leading ^ is legitimate when the target is the extracted secret, not the
#    multi-line line fragment — it must NOT be flagged.
secret_target="$TMP/secret-target.toml"
cat > "$secret_target" <<'TOML'
title = "secret-target"
[extend]
useDefault = true
[[allowlists]]
targetRules = ["generic-api-key"]
condition = "AND"
paths = ['''^_bmad/_config/files-manifest\.csv$''']
regexTarget = "secret"
regexes = ['''^[0-9a-f]{64}$''']
TOML
assert_pass "leading ^ on regexTarget = secret is allowed" "$secret_target"

# 4. When regexTarget is omitted it defaults to "secret" (not "line"), so a
#    leading ^ must not be flagged.
no_target="$TMP/no-target.toml"
cat > "$no_target" <<'TOML'
title = "no-target"
[extend]
useDefault = true
[[allowlists]]
targetRules = ["generic-api-key"]
condition = "AND"
paths = ['''^_bmad/_config/files-manifest\.csv$''']
regexes = ['''^[0-9a-f]{64}$''']
TOML
assert_pass "leading ^ with no regexTarget (defaults to secret) is allowed" "$no_target"

# 5. An escaped \^ in a line regex is a literal caret, not an anchor — allowed.
escaped="$TMP/escaped.toml"
cat > "$escaped" <<'TOML'
title = "escaped"
[extend]
useDefault = true
[[allowlists]]
targetRules = ["generic-api-key"]
regexTarget = "line"
regexes = ['''\^literal-caret-prefix''']
TOML
assert_pass "escaped \\^ literal caret in a line regex is allowed" "$escaped"

# 6. A leading ^ after an inline-flag group ((?i)^...) is still an anchor — flagged.
flag_anchor="$TMP/flag-anchor.toml"
cat > "$flag_anchor" <<'TOML'
title = "flag-anchor"
[extend]
useDefault = true
[[allowlists]]
targetRules = ["generic-api-key"]
regexTarget = "line"
regexes = ['''(?i)^inline-flag-then-anchor''']
TOML
assert_fail "leading ^ after an inline-flag group is flagged" "$flag_anchor"

# 6b. A leading ^ after an inline-flag group with flag-removal ((?i-m)^...) is
#     still an anchor — flagged. The guard's pattern must cover the `-flags` form.
flag_minus_anchor="$TMP/flag-minus-anchor.toml"
cat > "$flag_minus_anchor" <<'TOML'
title = "flag-minus-anchor"
[extend]
useDefault = true
[[allowlists]]
targetRules = ["generic-api-key"]
regexTarget = "line"
regexes = ['''(?i-m)^inline-flag-removal-then-anchor''']
TOML
assert_fail "leading ^ after an inline-flag group with flag removal (?i-m) is flagged" "$flag_minus_anchor"

# 7. Multiple regexes in one line allowlist: a bad one anywhere in the list fails.
mixed="$TMP/mixed.toml"
cat > "$mixed" <<'TOML'
title = "mixed"
[extend]
useDefault = true
[[allowlists]]
targetRules = ["generic-api-key"]
regexTarget = "line"
regexes = ['''trailing-only$''', '''^leading-anchor''']
TOML
assert_fail "a leading ^ in any regex of a line allowlist fails" "$mixed"

# 8. A config with no line-targeted allowlist at all passes trivially.
none="$TMP/none.toml"
cat > "$none" <<'TOML'
title = "none"
[extend]
useDefault = true
TOML
assert_pass "config with no line allowlist passes" "$none"

# 9. A missing config file fails (Check 1).
assert_fail "missing config file fails" "$TMP/does-not-exist.toml"

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
if [[ "$fails" -eq 0 ]]; then
  echo "All test-gitleaks-config guard tests passed."
else
  echo "$fails test(s) failed."
  exit 1
fi
