---
description: Scaffold a .atomic-design-rules.json at the current repo root so the make-no-mistakes atomic-design hooks (PreToolUse ownership enforcement + PostToolUse drift telemetry) start enforcing for this repo. No-op if the file already exists.
priority: 60
---

# Atomic Rules Init

Bootstrap atomic-design ownership enforcement for the current repo by writing
a `.atomic-design-rules.json` at the repo root. The make-no-mistakes plugin
hooks (`hooks/atomic/pre-atomic.sh` and `hooks/atomic/post-atomic-drift.sh`)
read this file at every Edit/Write/MultiEdit/NotebookEdit call. If the file
is absent, the hooks are a no-op — installing the plugin is always safe.

This command produces a STARTER config based on what it can infer from the
current repo. You will refine it before committing.

---

## Step 1: Sanity-check the repo

Run these commands in parallel:

```bash
# Find repo root
git rev-parse --show-toplevel

# Detect the components root by checking the two most common conventions
ls -d src/components 2>/dev/null || ls -d components 2>/dev/null || echo "no components root found"

# Check if a config already exists
test -f .atomic-design-rules.json && echo "EXISTS" || echo "MISSING"
```

If the config already exists, STOP and tell the user. Do not overwrite.

If no components root is found, ask the user to clarify before proceeding.

---

## Step 2: Detect candidate pillars

Run:

```bash
# Each first-level subfolder under the components root is a pillar candidate
ls -d $COMPONENTS_ROOT/*/ 2>/dev/null | xargs -n1 basename
```

For each candidate, ask the user:
- Slug (kebab-case; default = folder name)
- Owner (Slack handle or Linear team; required so violation messages name a reviewer)
- Whether this is a SHARED pillar (importable by any other pillar)
- Optional `max_organisms` override

Stop after the user has confirmed at least one pillar. The starter config
can list as few as one pillar; more can be added later.

---

## Step 3: Detect junk drawers (heuristic)

Run:

```bash
# Folders directly under components root that have > 5 loose files and
# no atomic subfolders are likely junk drawers.
for d in $COMPONENTS_ROOT/*/; do
  loose=$(find "$d" -maxdepth 1 -type f \( -name '*.tsx' -o -name '*.ts' \) 2>/dev/null | wc -l)
  has_atomic=$(ls -d "$d"{atoms,molecules,organisms,templates} 2>/dev/null | wc -l)
  if [ "$loose" -gt 5 ] && [ "$has_atomic" -eq 0 ]; then
    echo "candidate junk drawer: $d (loose=$loose)"
  fi
done
```

Surface candidates to the user and ask which to mark as junk drawers.

---

## Step 4: Detect plural/singular drift

Run:

```bash
# Pairs of folders that differ only by a trailing 's' are drift candidates.
ls -d $COMPONENTS_ROOT/*/ | xargs -n1 basename | sort -u > /tmp/pillar-list
for name in $(cat /tmp/pillar-list); do
  plural="${name}s"
  if grep -qx "$plural" /tmp/pillar-list; then
    echo "drift pair: $name <-> $plural"
  fi
done
```

For each pair, ask the user which form is canonical, then add a
`canonical_folders` entry.

---

## Step 5: Write the config

Compose the JSON using the schema at:
`make-no-mistakes-toolkit/schemas/atomic-design-rules.schema.json`

Reference example:
`make-no-mistakes-toolkit/references/atomic-design-rules.example.json`

Minimum viable starter (replace placeholders with what you gathered above):

```json
{
  "$schema": "https://raw.githubusercontent.com/DojoCodingLabs/make-no-mistakes-toolkit/main/schemas/atomic-design-rules.schema.json",
  "version": 1,
  "components_root": "src/components",
  "pillars": [
    { "slug": "platform", "folder": "platform", "owner": "@platform-team" }
  ],
  "shared_pillars": ["platform"],
  "atomic_levels": {
    "atoms": {
      "folder": "atoms",
      "forbid_content_patterns": [
        "use(State|Reducer|Effect|LayoutEffect|Query|Mutation|InfiniteQuery)\\b",
        "useContext\\b"
      ],
      "forbid_message": "Atoms must be stateless. Move state to a molecule or organism."
    }
  },
  "drift_thresholds": {
    "max_organisms_per_pillar": 100,
    "max_root_files_per_pillar": 5,
    "public_prefix_stale_days": 30
  }
}
```

Write it via the standard Write tool. Then print:

> Created .atomic-design-rules.json. The atomic-design hooks will now
> enforce on every Edit/Write/MultiEdit/NotebookEdit. To bypass for a
> single file, add `// @atomic-exempt: <reason>` to its content.
> Kill switch: `CLAUDE_DISABLE_PLUGIN_HOOKS=1`.

---

## Step 6: Quick verification

Suggest the user run a known-violating Edit so they can see the hook fire:

> Try editing a file in a junk drawer or under `*/atoms/*` with a
> `useState` import. The hook should block the write and explain why.

Do NOT actually perform the edit. The user owns that test.

---

## Boundaries

- This command writes ONE file. Do not modify CLAUDE.md, AGENTS.md, or any
  other repo file. Pillar enforcement starts from the JSON alone.
- Do NOT commit. Show the user the diff via `git status`/`git diff` and
  let them decide.
- If the user asks for a more sophisticated setup (e.g. importing
  pillars from a Linear team mapping), defer to a manual PR — this
  command intentionally produces a clean starter.
