#!/usr/bin/env bash
# hook-bypass: secret-leak
# =============================================================================
# test-cross-cutting.sh — Test runner for the Cure 4b cross-cutting hooks
# (DOJ-4571). Invoked by hooks/test-hooks.sh.
#
# The "secret-leak" bypass marker above is intentional: this file contains
# synthetic ${SUPABASE_SERVICE_ROLE_KEY} / ${DB_PASSWORD} fixtures that
# would otherwise trip the toolkit's own `secrets-hardcoded` rule. These
# are obviously test inputs, not real credentials.
#
# Pattern: each test spins up an isolated git repo in a tempdir, writes a
# synthetic .claude/config/cross-cutting-hooks.json, and pipes a JSON
# hook-input envelope to the hook script. We assert exit code + (optionally)
# a stderr substring.
#
# Why isolated repos: load-config.sh walks up for a .git directory; we never
# want the test to leak into the real toolkit repo's own config.
#
# Why fixtures are materialized in subshells (not inline): hook scripts
# inspect the literal stdin string for bypass markers. The fixture payloads
# stay in pipe buffers, never on argv.
#
# Usage: bash hooks/cross-cutting/tests/test-cross-cutting.sh
# Exit:  0 if all pass; 1 if any fail.
# =============================================================================
set -uo pipefail

CC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_SECRET="$CC_DIR/pre-write-no-cleartext-secret-in-config.sh"
HOOK_SCHEMA="$CC_DIR/pre-write-cross-repo-schema-ownership.sh"
HOOK_VERSION="$CC_DIR/pre-write-version-bump-discipline.sh"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required to run cross-cutting tests." >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git is required to run cross-cutting tests." >&2
  exit 1
fi

CC_PASS=0
CC_FAIL=0
CC_FAIL_DETAILS=()

# --- helpers ---------------------------------------------------------------

# Create an isolated git repo with optional config + optional initial files.
# Echoes the absolute repo path on stdout.
make_repo() {
  local base
  base="$(mktemp -d)"
  (
    cd "$base" || exit 1
    git init -q --initial-branch=main
    git config user.email t@t.t
    git config user.name t
    git commit -q --allow-empty -m "init"
  )
  echo "$base"
}

# Write a config file at <repo>/.claude/config/cross-cutting-hooks.json.
# Pass JSON as $2.
write_config() {
  local repo="$1" json="$2"
  mkdir -p "$repo/.claude/config"
  printf '%s' "$json" > "$repo/.claude/config/cross-cutting-hooks.json"
}

# Drive a hook with synthetic stdin (a single tool-input envelope).
# Args: <hook> <repo> <input-json>
# Stdout: actual exit code
# Side effect: writes hook stderr to LAST_STDERR_FILE (a deterministic path).
#
# The stderr file lives at a fixed path so that `actual=$(drive_hook …)`
# subshell capture doesn't lose the assignment (assigning LAST_STDERR_FILE
# inside the subshell would not propagate out).
LAST_STDERR_FILE="/tmp/cc-test-last-stderr.$$"
drive_hook() {
  local hook="$1" repo="$2" input="$3"
  : > "$LAST_STDERR_FILE"   # truncate
  local exit_code=0
  (
    cd "$repo" || exit 1
    CLAUDE_PROJECT_ROOT="$repo" \
      printf '%s' "$input" | bash "$hook"
  ) 2>"$LAST_STDERR_FILE" || exit_code=$?
  echo "$exit_code"
}

# Run one assertion. Args: <name> <expected_exit> <actual_exit> [<expected_stderr_substring>]
assert_case() {
  local name="$1" expected="$2" actual="$3" expected_stderr="${4:-}"
  local status="PASS" reason=""

  if [ "$actual" != "$expected" ]; then
    status="FAIL"; reason="exit expected=$expected actual=$actual; stderr=$(cat "$LAST_STDERR_FILE" 2>/dev/null | head -c 400)"
  elif [ -n "$expected_stderr" ]; then
    if ! grep -qF -- "$expected_stderr" "$LAST_STDERR_FILE" 2>/dev/null; then
      status="FAIL"; reason="stderr did not contain '$expected_stderr'; got=$(cat "$LAST_STDERR_FILE" 2>/dev/null | head -c 400)"
    fi
  fi

  if [ "$status" = "PASS" ]; then
    CC_PASS=$((CC_PASS + 1))
    echo "  PASS  cross-cutting / ${name}"
  else
    CC_FAIL=$((CC_FAIL + 1))
    echo "  FAIL  cross-cutting / ${name}  --  ${reason}"
    CC_FAIL_DETAILS+=("cross-cutting/${name}: ${reason}")
  fi
}

# Final cleanup hook.
trap 'rm -f "$LAST_STDERR_FILE"' EXIT

# --- cleartext_secrets tests -----------------------------------------------

# 1. Blocks Write of a YAML config introducing a high-impact placeholder.
repo="$(make_repo)"
write_config "$repo" '{"version":1,"cleartext_secrets":{"enabled":true}}'
input="$(jq -nc --arg fp "$repo/config.yaml" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"db:\n  service_role_key: ${SUPABASE_SERVICE_ROLE_KEY}\n"}}')"
actual="$(drive_hook "$HOOK_SECRET" "$repo" "$input")"
assert_case "cleartext-secret/blocks-service-role-in-yaml" "2" "$actual" "BLOCKED"
rm -rf "$repo"

# 2. Allows the *_FILE cure shape.
repo="$(make_repo)"
write_config "$repo" '{"version":1,"cleartext_secrets":{"enabled":true}}'
input="$(jq -nc --arg fp "$repo/config.yaml" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"db:\n  service_role_key_file: ${SUPABASE_SERVICE_ROLE_KEY_FILE}\n"}}')"
actual="$(drive_hook "$HOOK_SECRET" "$repo" "$input")"
assert_case "cleartext-secret/allows-file-cure-shape" "0" "$actual"
rm -rf "$repo"

# 3. No-ops when config is missing.
repo="$(make_repo)"
input="$(jq -nc --arg fp "$repo/config.yaml" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"db:\n  pass: ${DB_PASSWORD}\n"}}')"
actual="$(drive_hook "$HOOK_SECRET" "$repo" "$input")"
assert_case "cleartext-secret/no-op-without-config" "0" "$actual"
rm -rf "$repo"

# 4. No-ops when surface disabled.
repo="$(make_repo)"
write_config "$repo" '{"version":1,"cleartext_secrets":{"enabled":false}}'
input="$(jq -nc --arg fp "$repo/config.yaml" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"db:\n  pass: ${DB_PASSWORD}\n"}}')"
actual="$(drive_hook "$HOOK_SECRET" "$repo" "$input")"
assert_case "cleartext-secret/no-op-when-disabled" "0" "$actual"
rm -rf "$repo"

# 5. Honors bypass marker.
repo="$(make_repo)"
write_config "$repo" '{"version":1,"cleartext_secrets":{"enabled":true}}'
input="$(jq -nc --arg fp "$repo/config.yaml" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"# hook-bypass: cross-cutting-cleartext-secret\ndb:\n  pass: ${DB_PASSWORD}\n"}}')"
actual="$(drive_hook "$HOOK_SECRET" "$repo" "$input")"
assert_case "cleartext-secret/honors-bypass-marker" "0" "$actual"
rm -rf "$repo"

# 6. Defers to local 4a hook.
repo="$(make_repo)"
write_config "$repo" '{"version":1,"cleartext_secrets":{"enabled":true,"defer_to_local_hook":true}}'
input="$(jq -nc --arg fp "$repo/config.yaml" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"db:\n  pass: ${DB_PASSWORD}\n"}}')"
actual="$(drive_hook "$HOOK_SECRET" "$repo" "$input")"
assert_case "cleartext-secret/defers-to-local-4a-hook" "0" "$actual" "defer_to_local_hook=true"
rm -rf "$repo"

# 7. Passes non-config file types.
repo="$(make_repo)"
write_config "$repo" '{"version":1,"cleartext_secrets":{"enabled":true}}'
input="$(jq -nc --arg fp "$repo/src/foo.ts" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"const x = `${DB_PASSWORD}`;"}}')"
actual="$(drive_hook "$HOOK_SECRET" "$repo" "$input")"
assert_case "cleartext-secret/passes-non-config-file" "0" "$actual"
rm -rf "$repo"

# 8. extra_cure_suffixes allows _REF tail.
repo="$(make_repo)"
write_config "$repo" '{"version":1,"cleartext_secrets":{"enabled":true,"extra_cure_suffixes":["_REF"]}}'
input="$(jq -nc --arg fp "$repo/config.yaml" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"db:\n  pass: ${DB_PASSWORD_REF}\n"}}')"
actual="$(drive_hook "$HOOK_SECRET" "$repo" "$input")"
assert_case "cleartext-secret/extra-cure-suffix-allows-ref" "0" "$actual"
rm -rf "$repo"

# --- schema_ownership tests ------------------------------------------------

# 1. Blocks Write of a migration when owned_tables=[] (gateway pattern).
repo="$(make_repo)"
write_config "$repo" '{"version":1,"schema_ownership":{"enabled":true,"owned_tables":[],"migration_paths":["supabase/migrations"]}}'
input="$(jq -nc --arg fp "$repo/supabase/migrations/20260528_001_add_table.sql" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"CREATE TABLE chat_sessions (id uuid PRIMARY KEY);"}}')"
actual="$(drive_hook "$HOOK_SCHEMA" "$repo" "$input")"
assert_case "schema-ownership/blocks-when-no-tables-owned" "2" "$actual" "no migration pipeline"
rm -rf "$repo"

# 2. Allows Write of a migration for an owned table.
repo="$(make_repo)"
write_config "$repo" '{"version":1,"schema_ownership":{"enabled":true,"owned_tables":["chat_sessions"],"migration_paths":["supabase/migrations"]}}'
input="$(jq -nc --arg fp "$repo/supabase/migrations/20260528_001.sql" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"ALTER TABLE chat_sessions ADD COLUMN persona text;"}}')"
actual="$(drive_hook "$HOOK_SCHEMA" "$repo" "$input")"
assert_case "schema-ownership/allows-owned-table" "0" "$actual"
rm -rf "$repo"

# 3. Blocks Write of a migration for an unowned table.
repo="$(make_repo)"
write_config "$repo" '{"version":1,"schema_ownership":{"enabled":true,"owned_tables":["users"],"migration_paths":["supabase/migrations"]}}'
input="$(jq -nc --arg fp "$repo/supabase/migrations/20260528_001.sql" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"CREATE TABLE chat_sessions (id uuid PRIMARY KEY);"}}')"
actual="$(drive_hook "$HOOK_SCHEMA" "$repo" "$input")"
assert_case "schema-ownership/blocks-unowned-table" "2" "$actual" "not owned by this repo"
rm -rf "$repo"

# 4. No-ops when surface disabled.
repo="$(make_repo)"
write_config "$repo" '{"version":1,"schema_ownership":{"enabled":false,"owned_tables":[]}}'
input="$(jq -nc --arg fp "$repo/supabase/migrations/20260528_001.sql" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"CREATE TABLE chat_sessions (id uuid PRIMARY KEY);"}}')"
actual="$(drive_hook "$HOOK_SCHEMA" "$repo" "$input")"
assert_case "schema-ownership/no-op-when-disabled" "0" "$actual"
rm -rf "$repo"

# 5. No-ops when config is missing.
repo="$(make_repo)"
input="$(jq -nc --arg fp "$repo/supabase/migrations/20260528_001.sql" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"CREATE TABLE chat_sessions (id uuid PRIMARY KEY);"}}')"
actual="$(drive_hook "$HOOK_SCHEMA" "$repo" "$input")"
assert_case "schema-ownership/no-op-without-config" "0" "$actual"
rm -rf "$repo"

# 6. Passes Edit (only Write is intercepted).
repo="$(make_repo)"
write_config "$repo" '{"version":1,"schema_ownership":{"enabled":true,"owned_tables":[],"migration_paths":["supabase/migrations"]}}'
input="$(jq -nc --arg fp "$repo/supabase/migrations/20260528_001.sql" \
  '{tool_name:"Edit",tool_input:{file_path:$fp,old_string:"CREATE TABLE chat_sessions",new_string:"-- moved to dojo-os\n-- CREATE TABLE chat_sessions"}}')"
actual="$(drive_hook "$HOOK_SCHEMA" "$repo" "$input")"
assert_case "schema-ownership/passes-edit" "0" "$actual"
rm -rf "$repo"

# 7. Honors bypass marker.
repo="$(make_repo)"
write_config "$repo" '{"version":1,"schema_ownership":{"enabled":true,"owned_tables":[],"migration_paths":["supabase/migrations"]}}'
input="$(jq -nc --arg fp "$repo/supabase/migrations/20260528_001.sql" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"-- hook-bypass: cross-cutting-schema-ownership\nCREATE TABLE chat_sessions (id uuid PRIMARY KEY);"}}')"
actual="$(drive_hook "$HOOK_SCHEMA" "$repo" "$input")"
assert_case "schema-ownership/honors-bypass-marker" "0" "$actual"
rm -rf "$repo"

# 8. Defers to local 4a hook.
repo="$(make_repo)"
write_config "$repo" '{"version":1,"schema_ownership":{"enabled":true,"defer_to_local_hook":true,"owned_tables":[],"migration_paths":["supabase/migrations"]}}'
input="$(jq -nc --arg fp "$repo/supabase/migrations/20260528_001.sql" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"CREATE TABLE chat_sessions (id uuid PRIMARY KEY);"}}')"
actual="$(drive_hook "$HOOK_SCHEMA" "$repo" "$input")"
assert_case "schema-ownership/defers-to-local-4a-hook" "0" "$actual" "defer_to_local_hook=true"
rm -rf "$repo"

# --- version_bumps tests ---------------------------------------------------

# Helper: build a repo with a Dockerfile pinned to OLD_VERSION + a validator
# script that blocks if NEW - OLD spans more than 1 minor.
make_version_repo() {
  local old_version="$1"
  local repo
  repo="$(make_repo)"
  mkdir -p "$repo/scripts"
  cat > "$repo/Dockerfile" <<EOF
FROM scratch
ADD https://github.com/example/openclaw/releases/download/${old_version}/openclaw /openclaw
EOF
  cat > "$repo/scripts/check-version.sh" <<'EOF'
#!/usr/bin/env bash
# Toy validator: block if minor delta > 1.
old="$1" new="$2"
o="${old#v}" n="${new#v}"
om=$(echo "$o" | awk -F. '{print $2}')
nm=$(echo "$n" | awk -F. '{print $2}')
delta=$(( nm - om ))
if [ "${delta#-}" -gt 1 ]; then
  echo "validator: minor delta $delta > 1 (old=$old new=$new)" >&2
  exit 2
fi
exit 0
EOF
  chmod +x "$repo/scripts/check-version.sh"
  (cd "$repo" && git add -A && git -c user.email=t@t.t -c user.name=t commit -q -m "pin $old_version")
  echo "$repo"
}

# 1. Blocks multi-minor bump via validator.
repo="$(make_version_repo "v2026.4.10")"
write_config "$repo" "$(jq -nc \
  --arg fp "Dockerfile" \
  --arg vr 'openclaw/releases/download/(v[0-9]+\.[0-9]+\.[0-9]+)/' \
  --arg vs "scripts/check-version.sh" \
  '{version:1,version_bumps:[{file_pattern:$fp,version_regex:$vr,validator_script:$vs}]}')"
input="$(jq -nc --arg fp "$repo/Dockerfile" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"FROM scratch\nADD https://github.com/example/openclaw/releases/download/v2026.6.0/openclaw /openclaw\n"}}')"
actual="$(drive_hook "$HOOK_VERSION" "$repo" "$input")"
assert_case "version-bump/blocks-multi-minor" "2" "$actual" "BLOCKED"
rm -rf "$repo"

# 2. Allows single-minor bump.
repo="$(make_version_repo "v2026.4.10")"
write_config "$repo" "$(jq -nc \
  --arg fp "Dockerfile" \
  --arg vr 'openclaw/releases/download/(v[0-9]+\.[0-9]+\.[0-9]+)/' \
  --arg vs "scripts/check-version.sh" \
  '{version:1,version_bumps:[{file_pattern:$fp,version_regex:$vr,validator_script:$vs}]}')"
input="$(jq -nc --arg fp "$repo/Dockerfile" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"FROM scratch\nADD https://github.com/example/openclaw/releases/download/v2026.5.0/openclaw /openclaw\n"}}')"
actual="$(drive_hook "$HOOK_VERSION" "$repo" "$input")"
assert_case "version-bump/allows-single-minor" "0" "$actual"
rm -rf "$repo"

# 3. No-ops when no entries configured.
repo="$(make_version_repo "v2026.4.10")"
write_config "$repo" '{"version":1,"version_bumps":[]}'
input="$(jq -nc --arg fp "$repo/Dockerfile" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"FROM scratch\nADD https://github.com/example/openclaw/releases/download/v2026.6.0/openclaw /openclaw\n"}}')"
actual="$(drive_hook "$HOOK_VERSION" "$repo" "$input")"
assert_case "version-bump/no-op-when-empty" "0" "$actual"
rm -rf "$repo"

# 4. No-ops when validator script missing.
repo="$(make_version_repo "v2026.4.10")"
write_config "$repo" "$(jq -nc \
  --arg fp "Dockerfile" \
  --arg vr 'openclaw/releases/download/(v[0-9]+\.[0-9]+\.[0-9]+)/' \
  --arg vs "scripts/missing.sh" \
  '{version:1,version_bumps:[{file_pattern:$fp,version_regex:$vr,validator_script:$vs}]}')"
input="$(jq -nc --arg fp "$repo/Dockerfile" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"FROM scratch\nADD https://github.com/example/openclaw/releases/download/v2026.6.0/openclaw /openclaw\n"}}')"
actual="$(drive_hook "$HOOK_VERSION" "$repo" "$input")"
assert_case "version-bump/no-op-when-validator-missing" "0" "$actual" "validator missing"
rm -rf "$repo"

# 5. Defers to local 4a hook.
repo="$(make_version_repo "v2026.4.10")"
write_config "$repo" "$(jq -nc \
  --arg fp "Dockerfile" \
  --arg vr 'openclaw/releases/download/(v[0-9]+\.[0-9]+\.[0-9]+)/' \
  --arg vs "scripts/check-version.sh" \
  '{version:1,version_bumps:[{file_pattern:$fp,version_regex:$vr,validator_script:$vs,defer_to_local_hook:true}]}')"
input="$(jq -nc --arg fp "$repo/Dockerfile" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"FROM scratch\nADD https://github.com/example/openclaw/releases/download/v2026.6.0/openclaw /openclaw\n"}}')"
actual="$(drive_hook "$HOOK_VERSION" "$repo" "$input")"
assert_case "version-bump/defers-to-local-4a-hook" "0" "$actual" "defer_to_local_hook=true"
rm -rf "$repo"

# 6. Honors bypass marker.
repo="$(make_version_repo "v2026.4.10")"
write_config "$repo" "$(jq -nc \
  --arg fp "Dockerfile" \
  --arg vr 'openclaw/releases/download/(v[0-9]+\.[0-9]+\.[0-9]+)/' \
  --arg vs "scripts/check-version.sh" \
  '{version:1,version_bumps:[{file_pattern:$fp,version_regex:$vr,validator_script:$vs}]}')"
input="$(jq -nc --arg fp "$repo/Dockerfile" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"# hook-bypass: cross-cutting-version-bump\nFROM scratch\nADD https://github.com/example/openclaw/releases/download/v2026.6.0/openclaw /openclaw\n"}}')"
actual="$(drive_hook "$HOOK_VERSION" "$repo" "$input")"
assert_case "version-bump/honors-bypass-marker" "0" "$actual"
rm -rf "$repo"

# 7. Passes when version unchanged.
repo="$(make_version_repo "v2026.4.10")"
write_config "$repo" "$(jq -nc \
  --arg fp "Dockerfile" \
  --arg vr 'openclaw/releases/download/(v[0-9]+\.[0-9]+\.[0-9]+)/' \
  --arg vs "scripts/check-version.sh" \
  '{version:1,version_bumps:[{file_pattern:$fp,version_regex:$vr,validator_script:$vs}]}')"
input="$(jq -nc --arg fp "$repo/Dockerfile" \
  '{tool_name:"Write",tool_input:{file_path:$fp,content:"FROM scratch\nADD https://github.com/example/openclaw/releases/download/v2026.4.10/openclaw /openclaw\n# cosmetic edit\n"}}')"
actual="$(drive_hook "$HOOK_VERSION" "$repo" "$input")"
assert_case "version-bump/passes-when-version-unchanged" "0" "$actual"
rm -rf "$repo"

# --- summary ---------------------------------------------------------------
echo ""
CC_TOTAL=$((CC_PASS + CC_FAIL))
echo "Cross-cutting results: ${CC_PASS} / ${CC_TOTAL} passed"

if [ "$CC_FAIL" -gt 0 ]; then
  echo ""
  echo "Cross-cutting failures:"
  for line in "${CC_FAIL_DETAILS[@]}"; do
    echo "  - $line"
  done
  exit 1
fi
exit 0
