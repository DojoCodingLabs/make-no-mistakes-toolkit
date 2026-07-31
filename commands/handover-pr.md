---
description: Package your open PR(s) / branch work into a structured handover and post it to a Slack thread for a teammate to pick up. The mirror of /takeover-pr. Accepts a repo (optionally PR number), a teammate, and optional "draft" / "broadcast" / a thread URL as $ARGUMENTS.
priority: 90
---

# Handover PR: $ARGUMENTS

You are a **PR handover assistant**. The user wants to hand OFF their own open PR(s) or current branch work to a teammate — gathering the full PR context (the same discipline as `/takeover-pr`) and publishing a structured **handover post** to Slack so the teammate can pick it up cleanly.

This is the inverse of `/takeover-pr`: takeover = *check out a teammate's PR and continue*; handover = *package your work and hand it off*. The OUTPUT here is a Slack handover message (see the format references in Step 5), NOT a local checkout.

**Input**: `$ARGUMENTS` — flexible, parse in Step 1. May contain: a repo name, an optional PR number, a teammate handle/name, a Slack thread URL or `thread_ts`, and the flags `draft` and/or `broadcast`.
**Output**: A structured handover message posted to the target Slack thread (with `reply_broadcast` when `broadcast` is requested), addressed to the receiving teammate.

---

## Step -1: Load Configuration

Read `slack-config.json` from the project root (same file `/daily-standup-post-slack` uses). If it does not exist, fall back to defaults and ask for any missing required value:

```json
{
  "handoverChannel": { "id": "", "name": "#pathways" },
  "repos": {},
  "linearPrefixes": ["DOJ"],
  "linearOrgSlug": "yourorg",
  "emojis": {
    "prOpen": ":github-pr:", "prMerged": ":github-merged:",
    "repo": ":github:", "linear": ":linear:", "claude": ":claude-code:"
  }
}
```

Use config values throughout:
- `handoverChannel.id` → default channel when no thread URL/channel is supplied
- `repos` → repo-to-displayName mapping for sub-leveling headers
- `linearPrefixes` → issue prefixes to recognize and hyperlink
- `linearOrgSlug` → for building `linear.app/<org>/issue/` URLs
- `emojis` → custom emoji slugs per workspace

If neither a thread URL nor `handoverChannel.id` resolves a destination, ask the user where to post before composing.

---

## Step 0: Detect Organization

Same as `/takeover-pr`. Try in order:

**Method A** — infer from the current repo:
```bash
ORG=$(gh repo view --json owner --jq '.owner.login' 2>/dev/null)
```
**Method B** — read from `linear-setup.json` at repo root:
```bash
ORG=$(cat linear-setup.json 2>/dev/null | jq -r '.github.org // empty')
```
**Method C** — if neither works, ask the user which org to use.

---

## Step 1: Parse Arguments

Parse `$ARGUMENTS` into these slots (order-independent, all optional):

- **repo** — a repository name under `$ORG` (e.g., `dojo-os`). Defaults to the current repo if omitted.
- **PR number(s)** — one or more PR numbers. If omitted, fall to Step 2 to resolve the PR set.
- **teammate** — a Slack handle (`@daniel`), display name, or user ID to address the handover to. Resolve to a Slack user ID with `slack_search_users` if not already an ID.
- **thread** — a Slack thread URL (e.g., `https://<workspace>.slack.com/archives/<CHANNEL>/p<TS>`) or a raw `thread_ts`. Parse the channel ID and `thread_ts` from the URL: the `p1779936531143379` segment becomes `1779936531.143379` (insert a dot before the last 6 digits). If present, this overrides `handoverChannel.id`.
- **flags** — `draft` (use `slack_send_message_draft` instead of posting) and `broadcast` (set `reply_broadcast: true` so the threaded reply also lands in the channel).

If `$ARGUMENTS` is empty, ask the user for at minimum: the repo (or "current branch"), and the destination (thread URL or channel).

---

## Step 2: Resolve the PR Set to Hand Over

Determine which PR(s) the handover covers. In priority order:

1. **Explicit PR number(s)** in args → use those directly.
2. **Current branch** → if running inside the repo, resolve the open PR for the current branch:
   ```bash
   gh pr view --json number,title,url --jq '{number,title,url}' 2>/dev/null
   ```
3. **The user's open PRs in the repo** (multi-PR handover, like a session handover) → list the current user's open PRs:
   ```bash
   ME=$(gh api user --jq '.login')
   gh pr list --repo "$ORG/$REPO" --state open --author "$ME" \
     --json number,title,headRefName,isDraft,updatedAt,url
   ```
   Show the set and ask the user to confirm which PRs to include (default: all).

A handover may also cover **work in flight that is not yet a PR** (a branch pushed, a Linear issue queued). Capture those as narrative items if the user mentions them — the handover is about transferring *context + ownership*, not only merged diffs.

---

## Step 3: Gather Context Per PR

For each PR in the set, gather the same context `/takeover-pr` collects — this is what makes the handover actionable rather than a bare link dump.

### 3a. PR Details
```bash
gh pr view NUMBER --repo "$ORG/$REPO" --json title,body,additions,deletions,changedFiles,commits,labels,reviews,comments,mergeable,mergeStateStatus,isDraft,url
```

### 3b. Diff Summary
```bash
gh pr diff NUMBER --repo "$ORG/$REPO" --stat
```

### 3c. CI Status
```bash
gh pr checks NUMBER --repo "$ORG/$REPO"
```
Note the real state: **green / failing / pending**. Flag a suspiciously fast "pass" (e.g., a gate that skipped) rather than reporting it as green.

### 3d. Linear Issue (if linked)
Extract a Linear issue ID from the branch name or PR title (`PREFIX-123-slug`, `[PREFIX-123]`, `(PREFIX-123)`). If found, fetch context via `mcp__claude_ai_Linear__get_issue` (or the Linear MCP available) to enrich the "what / why".

### 3e. Reviewer / Bot State
```bash
gh pr view NUMBER --repo "$ORG/$REPO" --json reviews \
  --jq '.reviews[] | {author: .author.login, state: .state}'
```
The verdict of an automated reviewer (e.g., `dojo-code-reviewer`) lands in `.reviews[*]`, NOT `.comments[*]` — read the right field. Capture the score / APPROVED state and any blocking findings.

### 3f. Mergeability
From 3a, record `mergeable` + `mergeStateStatus`. If `UNSTABLE`/`DIRTY`/conflicts, flag it prominently — the receiver needs to know whether they can merge or must rebase/fix first.

### 3g. What's Left to Do
Synthesize from PR body + Linear + review feedback + CI: the concrete unfinished items. This becomes the "next steps with owners" the receiving teammate acts on.

---

## Step 4: Build the Handover Model

Organize the gathered context into a handover model with these buckets (omit empty ones):

- **Headline** — one line: what this handover is and who it's for.
- **Shipped / merged** — what already landed (with PR links + Linear).
- **In review / awaiting merge** — open PRs, each with state (CI, bot verdict, mergeable).
- **Subsystems / context** — grouping of related work so the receiver sees the shape, not just a list.
- **Diagnosis / gotchas** — anything non-obvious the receiver MUST know (a routing trap, a desynced secret, a decision you made that they can veto, a `db reset` they'll need). This is the highest-value section — it's the context that would otherwise be lost.
- **Next steps with owners** — explicit `who → does what`. Name the owner per step (the receiver, an admin, an instructor, yourself).
- **Blocked / awaiting humans** — anything the receiver can't unblock alone.

---

## Step 5: Compose the Slack Handover Message

Render the model into the team's Slack format. Follow the formatting conventions from `/daily-standup-post-slack` (Step 3 "Format rules" + sub-leveling) and the two reference handover posts below.

### Format rules (house style — load-bearing)

1. **Header line** addresses the receiver: `:ninja: *Handover — <topic>* · <@USER_ID>` (or `:clipboard: _Handover <pillar> — sesión <date>_` for a session-wide handover).
2. **Section headers** use a leading emoji + bold/italic label, e.g. `:white_check_mark: *Shipped*`, `:satellite_antenna: *Subsistemas*`, `:warning: *Diagnóstico / gotchas*`, `:dart: *Próximos pasos (con dueños)*`, `:no_entry_sign: *Blocked*`.
3. **Bullets use `-`, NEVER `•`** or other Unicode bullets — they break Slack formatting and the `slack-unicode-bullets` hook will flag them. (Older posts used `•`; the current convention is `-`.)
4. **Sub-leveling** when spanning repos (mirrors the standup):
   - Level 1 `-` → repo group header `:github: *<displayName>*`
   - Level 2 `    -` (4 spaces) → items within the repo
   - Level 3 `        -` (8 spaces) → sub-details (rare)
5. **PR references MUST be hyperlinked**: `<https://github.com/ORG/REPO/pull/NNN|#NNN>` — never bare `#NNN`.
6. **Linear issues MUST be hyperlinked**: `<https://linear.app/{linearOrgSlug}/issue/{PREFIX}-{N}|{PREFIX}-{N}>` — never a bare ID.
7. **Mentions** use Slack user IDs: `<@U0XXXX>`.
8. **Markdown → mrkdwn**: `**bold**`→`*bold*`, `[t](u)`→`<u|t>`, keep `` `code` ``.
9. **Tone**: natural team Spanish, scannable in ~15 seconds. Lead with the headline + the gotchas; detail lives in the bullets and (optionally) a `:thread:` note pointing to per-PR detail in replies.
10. **Footer**: `*Enviado mediante* <@CLAUDE_USER_ID>` if the workspace tags Claude-authored posts (check the reference messages / config).
11. **Keep under ~3000 characters.** If longer, collapse each item to one line and move per-PR detail to a threaded follow-up.

### Reference — handover post format

Two canonical examples (read for tone + structure):
- A **feedback-round handover** (single topic, addressed to one teammate, with a "why X didn't work — corrige el diagnóstico" gotchas section and next-steps-with-owners): the 2026-05-27 Pathways Masterclass/Live handover.
- A **session-wide handover** (`:clipboard: _Handover <pillar> — sesión <date>_`, buckets: Shipped / Awaiting review / New Linear issues / Blocked / Open agent state / Próximos movimientos): the 2026-06-01 Pathways session handover.

Match whichever shape fits: a single-PR/topic handover uses the first; a multi-PR/session handover uses the second.

---

## Step 6: Preview and Confirm

Show the rendered message before sending:

```
Preview del handover para <#channel o thread>:
───────────────────────────────────────
<formatted message>
───────────────────────────────────────
Destino: <channel name> · thread: <thread_ts or "nuevo mensaje"> · broadcast: <yes/no> · modo: <post/draft>
Caracteres: <count>/3000

¿Postear? (y / n / edit)
```

Wait for confirmation. On `edit`, ask what to change and re-render. On `n`, stop without posting.

---

## Step 7: Post to Slack

Resolve the destination and send:

- **channel_id** — from the parsed thread URL, else `handoverChannel.id` from config, else the value the user supplied.
- **thread_ts** — set when handing over inside an existing thread (parsed from the thread URL). Omit to start a new top-level message.
- **reply_broadcast** — set `true` when the `broadcast` flag is present AND a `thread_ts` is set (broadcast only applies to threaded replies; it also surfaces the reply in the channel).
- **draft vs post** — if `draft` flag present, use `slack_send_message_draft`; otherwise `slack_send_message`.

```
slack_send_message({
  channel_id: "<CHANNEL>",
  message: "<rendered handover>",
  thread_ts: "<TS or omit>",
  reply_broadcast: <true when broadcast + thread>
})
```

Draft caveat: `slack_send_message_draft` silently no-ops if a draft already exists for that channel (returns success with a `widget_id` but no `draft_id`, and does NOT overwrite). Check for a `draft_id` in the response; if absent, tell the user to delete the stale draft rather than retrying blindly.

---

## Step 8: Confirm

After posting, return the message link:
```
Handover posteado en <#channel> (thread <thread_ts>, broadcast <yes/no>)
<message_link>
```

---

## Notes

- **This command does NOT check out or modify code.** It reads PR/branch/Linear state and publishes a handover. If the user also wants the receiver to literally take the branch, that's `/takeover-pr` on their side.
- **The gotchas section is the point.** A link dump is not a handover — the receiver needs the non-obvious context (routing traps, decisions made that they can veto, required `db reset`, desynced secrets, why something looked broken). Always include it when there's anything load-bearing.
- **Owners are mandatory in next-steps.** Every action item names who does it — the receiver, an admin, an instructor, or the sender.
- **Respect shared-state coordination.** If the handover implies pushing to the receiver's branch or touching shared infra, say so explicitly and let the human coordinate; do not assume the post grants that authority.
- **Spanish for all UI and message text** (match the team).
- Show relative times for dates (e.g., "hace 3 días").
