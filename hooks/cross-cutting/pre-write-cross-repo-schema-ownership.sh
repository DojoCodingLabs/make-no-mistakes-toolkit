#!/bin/bash
# Cure 4b cross-cutting hook (DOJ-4571 #2): block creation of SQL
# migrations for tables this repo does not own.
#
# Generalized from
# dojo-agent-openclaw-plugin/.claude/hooks/pre-write-plugin-side-migration.sh
# (DOJ-4554). The 4a hook hard-blocks ANY supabase/migrations/*.sql write
# because the gateway repo has no migration pipeline; the 4b
# generalization supports two modes via per-repo config:
#
#   owned_tables: []        → block every write in the configured
#                             migration_paths (gateway pattern: no migrations
#                             at all belong in this repo)
#   owned_tables: [...]     → block only writes that touch a CREATE/ALTER/
#                             DROP for a table not in the allowlist
#                             (dojo-os pattern: this repo owns chat_sessions,
#                             chat_messages, ...; reject migrations for tables
#                             owned by other repos)
#
# Surface: `schema_ownership`
# Bypass:  `# hook-bypass: cross-cutting-schema-ownership` or `// ...`
#
# Tool match: Write only. Edit/MultiEdit on existing migrations is
# expected (e.g. cleanup "moved to other repo" comments).
#
# Fail-open on missing jq, malformed input, missing/disabled config,
# `defer_to_local_hook: true`, or `CLAUDE_DISABLE_PLUGIN_HOOKS=1`.

set -u

HOOK_NAME="pre-write-cross-repo-schema-ownership.sh"
BYPASS_MARKER="cross-cutting-schema-ownership"
SURFACE="schema_ownership"

if [[ "${CLAUDE_DISABLE_PLUGIN_HOOKS:-}" == "1" ]]; then
  exit 0
fi

LIB_DIR="$(dirname "$0")/lib"
# shellcheck source=lib/jq-input.sh
source "${LIB_DIR}/jq-input.sh"
# shellcheck source=lib/load-config.sh
source "${LIB_DIR}/load-config.sh"

if ! cc_parse_hook_input; then
  echo "[${HOOK_NAME}] WARN: input parse failed; failing open." >&2
  exit 0
fi

# Only intercept Write (new file). Edit/MultiEdit on existing migrations
# is expected (annotation cleanup of historical mis-placed migrations).
if [[ "$TOOL_NAME" != "Write" ]]; then
  exit 0
fi

if cc_has_bypass_marker "$BYPASS_MARKER"; then
  exit 0
fi

cc_load_config || exit 0
[[ "$CONFIG_FOUND" != "1" ]] && exit 0
cc_surface_enabled "$SURFACE" || exit 0

if cc_surface_defer_to_local "$SURFACE"; then
  echo "[${HOOK_NAME}] info: defer_to_local_hook=true; local 4a hook owns this surface in this repo." >&2
  exit 0
fi

# Resolve migration_paths (default ["supabase/migrations"]).
MIG_PATHS_JSON=$(printf '%s' "$CONFIG_JSON" | jq -c ".${SURFACE}.migration_paths // [\"supabase/migrations\"]" 2>/dev/null)
if [[ -z "$MIG_PATHS_JSON" || "$MIG_PATHS_JSON" == "null" || "$MIG_PATHS_JSON" == "[]" ]]; then
  MIG_PATHS_JSON='["supabase/migrations"]'
fi

# Check if FILE_PATH lives under any migration_paths entry AND is a .sql file.
IN_MIG_PATH="0"
while IFS= read -r p; do
  [[ -z "$p" ]] && continue
  # Match either "<p>/...*.sql" anywhere in the path or at the root.
  case "$FILE_PATH" in
    */"${p}"/*.sql|"${p}"/*.sql)
      IN_MIG_PATH="1"
      break
      ;;
  esac
done < <(printf '%s' "$MIG_PATHS_JSON" | jq -r '.[]' 2>/dev/null)

if [[ "$IN_MIG_PATH" != "1" ]]; then
  exit 0
fi

# Resolve owned_tables.
OWNED_TABLES_JSON=$(printf '%s' "$CONFIG_JSON" | jq -c ".${SURFACE}.owned_tables // []" 2>/dev/null)
OWNED_COUNT=$(printf '%s' "$OWNED_TABLES_JSON" | jq -r 'length' 2>/dev/null)
OWNED_COUNT=${OWNED_COUNT:-0}

if [[ "$OWNED_COUNT" == "0" ]]; then
  # Empty allowlist → block ANY migration in this repo (the gateway pattern).
  cat >&2 <<EOF
BLOCKED [${HOOK_NAME}]: this repo's cross-cutting-hooks.json declares
owned_tables=[] for the migration_paths under discipline, meaning this
repo has no migration pipeline and should not host SQL migrations.

Attempted file: ${FILE_PATH}

Why this hook exists (DOJ-4571 / DOJ-4554 / DOJ-4524):
  The gateway repo's PR #235 introduced a chat_sessions migration that
  was silently dropped (no workflow applies migrations in that repo).
  Result: 15 days of silent persistence freeze. This guard prevents the
  same failure mode in any repo that opts in.

How to fix:
  - Move the migration to the repo that owns the schema (e.g. dojo-os
    for chat_* tables: supabase/migrations/ + deploy-migrations.yml).
  - If this repo SHOULD own some tables, add them to
    .claude/config/cross-cutting-hooks.json → schema_ownership →
    owned_tables and the hook will allow migrations touching those.

Bypass (intentional historical artifact only):
  Add "# hook-bypass: ${BYPASS_MARKER}" inside the migration file.

Defer to local 4a hook:
  Set schema_ownership.defer_to_local_hook = true in
  .claude/config/cross-cutting-hooks.json.
EOF
  exit 2
fi

# Non-empty allowlist → extract referenced table names from the proposed
# content and block if any referenced table is NOT in the allowlist.
#
# Conservative SQL parser: look for CREATE TABLE / ALTER TABLE / DROP TABLE
# / RENAME TABLE statements + the schema-qualified or bare table name that
# follows. Case-insensitive on the keyword, preserve case on the identifier
# (Postgres folds to lower for unquoted, but the allowlist matches the
# raw token to be conservative).
if [[ -z "$PROPOSED" ]]; then
  # No content extractable from input → can't decide; fail-open with a warning.
  echo "[${HOOK_NAME}] WARN: empty content extracted; failing open." >&2
  exit 0
fi

# Capture identifiers after CREATE TABLE, ALTER TABLE, DROP TABLE, RENAME TABLE.
# Strip optional IF NOT EXISTS / IF EXISTS, optional schema prefix (`public.`),
# and trailing punctuation. ERE-only to stay portable.
#
# Portability note (DOJ-4571 review P2, dojo-code-reviewer): the previous
# implementation used `sed -E '...//I'` to match the TABLE keyword case-
# insensitively. The `/I` flag is a GNU extension; BSD sed on macOS errors
# out with "unknown option to `s'". Replaced with explicit bracket-class
# spelling (`[Tt][Aa][Bb][Ll][Ee]`) which is ERE-portable across both
# implementations. `grep -i` is portable for the upstream extraction so it
# stays as-is.
REFERENCED_TABLES=$(echo "$PROPOSED" \
  | grep -oiE '(CREATE|ALTER|DROP|RENAME)[[:space:]]+TABLE[[:space:]]+(IF[[:space:]]+(NOT[[:space:]]+)?EXISTS[[:space:]]+)?[A-Za-z_][A-Za-z0-9_."]*' \
  | sed -E 's/.*[Tt][Aa][Bb][Ll][Ee][[:space:]]+([Ii][Ff][[:space:]]+([Nn][Oo][Tt][[:space:]]+)?[Ee][Xx][Ii][Ss][Tt][Ss][[:space:]]+)?//' \
  | sed -E 's/"//g' \
  | sed -E 's/^[A-Za-z_][A-Za-z0-9_]*\.//' \
  | sed -E 's/[^A-Za-z0-9_].*$//' \
  | grep -v '^$' \
  | sort -u)

if [[ -z "$REFERENCED_TABLES" ]]; then
  # Migration doesn't reference any table at the SQL level (could be a
  # function, view, policy, or data-only migration). Allow — the ownership
  # check has no signal to act on.
  exit 0
fi

# Build a lookup of owned tables.
OWNED_LIST=$(printf '%s' "$OWNED_TABLES_JSON" | jq -r '.[]' 2>/dev/null | sort -u)

UNOWNED=""
while IFS= read -r t; do
  [[ -z "$t" ]] && continue
  if ! echo "$OWNED_LIST" | grep -qxF "$t"; then
    UNOWNED="${UNOWNED}${t} "
  fi
done <<<"$REFERENCED_TABLES"

UNOWNED=$(echo "$UNOWNED" | tr ' ' '\n' | sort -u | grep -v '^$' | tr '\n' ' ' | sed 's/ $//')

if [[ -z "$UNOWNED" ]]; then
  exit 0
fi

cat >&2 <<EOF
BLOCKED [${HOOK_NAME}]: migration touches table(s) not owned by this repo.

Attempted file: ${FILE_PATH}
Unowned tables: ${UNOWNED}
Owned tables:   $(printf '%s' "$OWNED_LIST" | tr '\n' ',' | sed 's/,$//')

Why this hook exists (DOJ-4571 / DOJ-4554 / DOJ-4524):
  Schemas live in one repo per table family. Writing a migration for a
  table owned by another repo means the migration ships from the wrong
  pipeline (may be silently dropped, may double-apply, may race the
  canonical owner's migration). DOJ-4524 was 15 days of silent
  persistence freeze caused by exactly this failure.

How to fix:
  - Confirm which repo owns each listed table (check the canonical
    repo's supabase/migrations/ history).
  - Move this migration to the owning repo.
  - If this repo should own a listed table, add it to
    .claude/config/cross-cutting-hooks.json → schema_ownership →
    owned_tables.

Bypass (single-migration override only):
  Add "# hook-bypass: ${BYPASS_MARKER}" inside the migration file.

Defer to local 4a hook:
  Set schema_ownership.defer_to_local_hook = true in
  .claude/config/cross-cutting-hooks.json.
EOF

exit 2
