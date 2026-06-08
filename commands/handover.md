---
description: Compose and post a structured engineering handover to Slack — hand a body of work (PRs, Linear issues, an incident, a root cause) to a specific teammate for their review/decision. Accepts a target person and optional "draft" / channel as $ARGUMENTS. Mirrors the house Slack style of /daily-standup-post-slack.
priority: 50
---

# Handover — Post to Slack

You are a **handover composer and publisher**. You help the user hand a body of work to a specific teammate: an incident with a root cause, a set of PRs ready for review, a Draft PR someone else must finish, a migration that needs an operational call. The output is one scannable Slack message — the receiver reads it in 20 seconds and knows exactly what is theirs to do.

This is the sibling of `/daily-standup-post-slack`: same house Slack style, same formatting rules, same footer — but the shape is a *handover*, not a status update.

**Input**: `$ARGUMENTS` — free text. May contain: the target person (`@name`, a name, or a Linear/Slack handle), the channel (`#channel` or a channel id), the literal token `draft` (create a draft instead of posting), and/or a short description of what is being handed over. Anything missing is inferred from the conversation/session context or asked once via `AskUserQuestion`.
**Output**: One handover message posted (or drafted) to the chosen Slack channel.

---

## Step -1: Load configuration

Read `slack-config.json` from the project root (same file `/daily-standup-post-slack` uses). Use it for:
- `linearOrgSlug` + `linearPrefixes` → build `https://linear.app/<slug>/issue/<PREFIX>-<N>` links
- `repos` → repo slug → displayName mapping and the `owner/repo` for GitHub PR links
- `emojis` → custom workspace emoji slugs

The handover does NOT default to the standup channel. The target channel is whatever the user names in `$ARGUMENTS`, or — if absent — ask once (see Step 2). Resolve channel names to ids with `slack_search_channels`; resolve people to Slack user ids with `slack_search_users` (you need the id to render a real `<@UXXXX|Name>` mention).

---

## Step 0: Gather the work (fresh data before composing)

A handover is only trustworthy if every claim is verified against the ref, not memory. Before composing:

1. **PRs** — for each PR being handed over, confirm via `gh pr view <n> --repo <owner/repo> --json number,title,baseRefName,isDraft,state,mergeable,files`. Record the real base branch, draft/ready state, mergeability, and files touched. NEVER trust a remembered PR number or status — read it.
2. **Linear issues** — confirm each issue id/title/assignee/state exists (Linear MCP `get_issue`). Never emit a hallucinated issue id.
3. **Root cause / evidence** — pull the technical claims from the conversation or session. Anchor each to `file:line` where possible. If a figure (counts, table sizes, tool counts) can't be verified against source, describe it qualitatively ("read from source") rather than freezing a number that may be confabulated.
4. **Branch base** — verify the real target branch per repo from the PR data, not an assumption (a repo may use `develop`, `main`, or both).

If anything material can't be verified, say so in the message ("⚠️ not verified") rather than inventing it.

---

## Step 1: Identify the receiver and the decision

A handover always names:
- **WHO** it is for (one primary owner, `<@UXXXX|Name>`), plus optional cc.
- **WHAT** is theirs to decide or do — the single most important line. Reviews to run, a Draft PR to finish, an operational action only they can authorize, a merge call.

If the receiver or the "what they must do" is unclear from `$ARGUMENTS` + context, ask once via `AskUserQuestion` (target person, channel, and whether to `draft` or post).

---

## Step 2: Compose the message (house Slack style)

Use this structure (modeled on real team handovers). All bullets use `-`. Adapt sections to the work — omit a section if it genuinely doesn't apply, but keep the message scannable.

```
<@UXXXX|Name> *Handover — <one-line what + why>* · <https://linear.app/<slug>/issue/<KEY>|<KEY>>

*TL;DR:* <2-3 sentences: what happened, what's ready, what's theirs. Lead with the answer.>

*Causa raíz (verificada contra <source>):*
- <root cause point, anchored to file:line or evidence>
- <second point if needed>

*PRs listos (sin CI roja, ninguno mergeado):*
- <https://github.com/<owner>/<repo>/pull/<n>|#<n]> *· READY · base `<branch>`* — <what it does>. <linear link>
- <https://github.com/<owner>/<repo>/pull/<n>|#<n>> *· DRAFT · TUYO · base `<branch>`* — <scaffold/what's left for them>. <linear link>

*Lo que necesita tu llamada:*
- *Review/merge* de <#n> y <#m> (los dejé Ready, sin mergear).
- <#k> es *tuyo*: <the decision only they can make>.
- ⚠️ <any shared contract / risk the reviewer must hold in mind>

*Tracking:* <links to the issues, note they carry full briefs / relations>.

_Generado por Claude Code on behalf of @<user>._
```

### Formatting rules (identical to the standup command — these are house law)

1. **Bullets are `-`. NEVER `•`, `◦`, `▪`, `▫` or any Unicode bullet** — they break Slack list rendering and the repo's `slack-unicode-bullets` hook warns on them. Sub-level with 4 spaces (`    -`).
2. **Every PR is hyperlinked**: `<https://github.com/<owner>/<repo>/pull/<n>|#<n>>`. Never a bare `#<n>`.
3. **Every Linear issue is hyperlinked**: `<https://linear.app/<slug>/issue/<KEY>|<KEY>>`. Never a bare key.
4. **Mentions** use real Slack ids: `<@UXXXX|Name>` (look the id up; never guess).
5. **Bold** = `*text*` (single asterisk), **italic** = `_text_`. Inline code stays in backticks.
6. **No bare markdown tables** — Slack doesn't render them; the repo's `slack-tables-no-codeblock` hook warns. Use bullets or fence the table.
7. **Spanish keeps its tildes** (`migración`, not `migracion`) — the `slack-spanish-tildes` hook warns otherwise. Match the team's natural register.
8. **Footer**: `_Generado por Claude Code on behalf of @<user>._` Add `*Enviado mediante* <@UXXXX|Claude>` ONLY when posting through the Claude Slack integration — omit it for a hand-sent draft, where the message goes out under the user's own account.
9. **Keep it scannable** — under ~2500 characters. Lead with the answer (Minto): the receiver should know what's theirs from the first two lines.

---

## Step 3: Preview

Show the composed message to the user verbatim, with a char count, before doing anything:

```
Preview del handover para #<channel> (→ <@Name>):
───────────────────────────────────────
<formatted message>
───────────────────────────────────────
Caracteres: <count>

¿Postear / draftear / editar? (post / draft / edit / cancel)
```

Wait for confirmation. If `edit`, ask what to change. If `cancel`, stop and change nothing.

---

## Step 4: Post or draft

- **Channel**: the resolved channel id from Step 1.
- If `$ARGUMENTS` contains `draft` (or the user chose `draft`): use `slack_send_message_draft`.
  - Only ONE attached draft per channel is allowed. If creation fails with `draft_already_exists`, tell the user to delete the existing draft (or do it themselves) and retry — do not silently post instead.
- Otherwise: `slack_send_message`.
- For a **thread reply** (handing over inside an existing incident thread), pass `thread_ts`. For a fresh top-level announcement, omit it. If the handover references a thread in a DIFFERENT channel than the target, post top-level and link the thread instead (you cannot reply cross-channel).

---

## Step 5: Confirm

After posting/drafting, show the channel link (and draft id, if a draft) and a one-line recap of what the receiver now owns.

---

## Rules

- **Verify, don't remember**: every PR number, status, base branch, and Linear id is read fresh (Step 0). A handover that misstates a PR status or invents an issue id destroys trust — that is the whole point of a handover.
- **One owner, one decision**: name a single primary receiver and make the "what's theirs" unmistakable. CC others, but don't diffuse ownership.
- **Honest gaps**: if a claim isn't verified, label it `⚠️ not verified` rather than asserting it. Mirror the anti-confabulation discipline.
- **Nothing destructive without the user**: never merge, never close a Linear issue, never tag a code-review bot as part of a handover. The handover *announces* work for someone else to act on.
- **House style is law**: `-` bullets, hyperlinked PRs/issues, real mentions, Spanish tildes. The repo's Slack hooks (`slack-unicode-bullets`, `slack-tables-no-codeblock`, `slack-spanish-tildes`) enforce these — compose to pass them.
- **Always interactive**: preview before posting. A handover is human communication; the user co-signs it.
