# Atomic-design hooks

Cure 4 of the 4-cure ownership-drift defense for component-heavy repos
(reference: DOJ-3946 premortem). Where the manifest engine in
`hooks/rules/rules.yaml` handles stateless single-file regex checks, these
two hooks add **per-repo, filesystem-aware** enforcement that the regex
engine can't express.

## Files

- `pre-atomic.sh` — **PreToolUse** on `Edit | Write | MultiEdit | NotebookEdit`.
  Blocks atomic-design ownership violations. Exits 2 to halt the tool call.
- `post-atomic-drift.sh` — **PostToolUse** on the same tools. Warns on
  accumulating drift. Never blocks (exits 0).

Both hooks are **no-ops** unless the consumer repo has a
`.atomic-design-rules.json` at its root. Installing the plugin in a repo
that hasn't opted in is harmless.

## Activation

Drop a `.atomic-design-rules.json` at your repo root. See:

- Schema: `../../schemas/atomic-design-rules.schema.json`
- Example: `../../references/atomic-design-rules.example.json`
- Scaffold: `/make-no-mistakes:atomic-rules-init` in Claude Code

## What `pre-atomic.sh` enforces

Given a `.atomic-design-rules.json` config, the hook detects:

1. **Plural / singular drift** — write to `src/components/courses/` blocked,
   pointed at canonical `src/components/course/` (configurable per pair).
2. **Junk-drawer writes** — file written directly to a known junk folder
   (e.g. `src/components/dashboard/Foo.tsx`) blocked with a message
   suggesting the owning pillar. Writes to sub-folders of a junk drawer
   are allowed.
3. **Atomic-level statelessness** — file written under `*/atoms/*` whose
   content matches a forbidden pattern (default: `useState`, `useReducer`,
   `useEffect`, `useLayoutEffect`, `useQuery`, `useMutation`,
   `useInfiniteQuery`, `useContext`) is blocked. Other atomic levels are
   configurable but ship with no patterns.
4. **Cross-pillar imports** — file under pillar X that imports
   `from "@/components/Y/..."` where Y is a different pillar AND Y is not
   listed in `shared_pillars` is blocked.

## What `post-atomic-drift.sh` warns about

Scoped to the pillar of the file just written (no whole-repo scans):

- **Organism cap** — pillar's `organisms/` folder exceeds
  `drift_thresholds.max_organisms_per_pillar` (default 100), or the
  per-pillar `max_organisms` override.
- **Pillar root flat** — pillar has > `max_root_files_per_pillar`
  (default 5) loose files at its root with no atomic substructure.
- **Stale `Public*` files** — file with the `Public` prefix older than
  `public_prefix_stale_days` (default 30); signals a missing canonical-URL
  consolidation (DOJ-4064).
- **Duplicate filenames across pillars** — same basename exists in another
  pillar; signals either genuine shared code (move to a shared pillar) or
  accidental forks (rename to disambiguate).

## Exemption

Add a comment to the file content to skip enforcement for that write:

```ts
// @atomic-exempt: <reason for reviewer>
```

The marker is `@atomic-exempt` by default; configurable via
`exempt_markers` in the JSON. The reason text is for code reviewers; the
hook does not validate it.

## Kill switch

The global `CLAUDE_DISABLE_PLUGIN_HOOKS=1` env var disables both atomic
hooks (and every other rule in the toolkit). Use temporarily if you need
to bypass enforcement for an entire session.

## Performance

Both hooks target < 500ms per call:

- `pre-atomic.sh` reads only `.atomic-design-rules.json` and processes the
  incoming `tool_input`. No filesystem scans.
- `post-atomic-drift.sh` scans only the pillar of the file just written,
  with `find -maxdepth` bounds to avoid recursive whole-repo walks.

If you observe slow hooks, set `CLAUDE_DISABLE_PLUGIN_HOOKS=1` to confirm
this is the culprit and file an issue with timings.
