---
description: Decompose a body of work and fan it out across named, worktree-isolated agents. Forces a capability gate (agent-teams flag AND the live tool surface) before anything is spawned, splits streams by who can execute them rather than by topic alone, and converges the results. Accepts a description of the work, a plan file, or a set of issue IDs as $ARGUMENTS.
priority: 85
---

# /parallelize — Fan-Out Execution Protocol

You are an **orchestrator**. The user has a body of work that plausibly wants more than one agent on it. Your job is to decide whether that is true, split it correctly, brief each stream so it can run unattended, spawn the agents in isolation, coordinate them, and converge the results into one answer.

**Input**: `$ARGUMENTS` — a description of the work, a path to a plan/spec file, or a list of issue IDs. If empty, ask what should be parallelized before doing anything else.
**Output**: N named background agents running in isolated worktrees, plus a convergence report the user reads instead of N separate transcripts.

The failure this command exists to prevent is not "too slow". It is **two agents editing the same file**, and **a stream that stalls because its central step was never something an agent could perform**.

---

## Step 0 — Capability Gate (MANDATORY, before anything else)

Do not read the target work, do not decompose, do not spawn. Produce a verdict first.

The gate has two readings because **either one alone gives a wrong answer**:

- The flag `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` being set does **not** prove the coordination surface exists. The harness ANDs the local flag with a **server-side feature gate** (at the time of writing, one named `tengu_amber_flint`), so the layer can be off while your settings file says it is on. "Flag set" is necessary, not sufficient — which is exactly the discrepancy that sends someone debugging their settings when the answer was never local.
- `TeamCreate` being absent does **not** prove parallelization is unavailable — in current harnesses team lifecycle tools are retired *by design* and teams were folded into the `Agent` tool. Reporting that absence as an outage is a false negative, and it is the single most likely way this command misfires.

### 0a. Read the flag — never infer it

```bash
printenv CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS     # empty output = unset
grep -n 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' .claude/settings.json
grep -n 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' ~/.claude/settings.json
```

Never append `2>/dev/null`. A suppressed "no such file" is indistinguishable from "flag not present", and a silenced error reads as a passing check.

The process environment is authoritative. A settings file may declare the flag for *future* sessions while the running one predates it — if `printenv` and the settings files disagree, `printenv` wins and you say so.

Even a `printenv` hit only tells you the local half. The server-side gate is not readable from here, which is why Step 0b exists: **the tool surface is the observable proxy for the layer actually being on.** If the flag reads set but the mailbox tools are absent, believe the tools, report the discrepancy, and take the *degraded* row of the table below rather than assuming the flag settles it.

### 0b. Read the live tool surface — the flag alone proves nothing

Inspect the tools actually available to you and record **present / absent** for each, by exact name:

| Tool | What its presence means |
|------|-------------------------|
| `Agent` | The spawn primitive. Also check its schema for a **`name`** parameter and an **`isolation`** parameter — those two are what make fan-out addressable and collision-safe. |
| `SendMessage` | The mailbox. Mid-run course correction and shutdown requests travel on it. |
| `TaskCreate` | Shared task list, if the harness exposes one. |
| `TeamCreate` / `TeamDelete` | Legacy team-lifecycle tools. **Expected absent.** Their absence is not a failure. |

If a tool-search facility is available, select by **exact name** rather than by keyword — a keyword sweep for "team" returns unrelated matches from integrations (project-management, hosting, design tools) and will make an absent tool look present.

### 0c. Branch on both readings

| Flag | `TeamCreate` | Verdict | Action |
|------|--------------|---------|--------|
| set | absent | **NORMAL — this is the current, working configuration** | Proceed. Fan out with `Agent` + `name` + `isolation: "worktree"`; coordinate with `SendMessage`. |
| set | present | Older harness that still exposes team lifecycle | Proceed **the same way**. Do not call `TeamCreate` — the `Agent` path works on both and stays valid after the next upgrade. |
| unset | absent | **DEGRADED but workable** | Proceed with fan-out. Mid-run coordination may be unavailable, so brief each agent to be fully self-contained and to report back at the end rather than converse during the run. Surface the one-line settings change to the user; **never edit their settings without consent**. |
| unset | present | Unusual | Treat as the *unset* row. Do not rely on the legacy tools. |

**The only aborting branch** is none of the above: `Agent` is missing, or `Agent` has no `isolation` parameter. Then isolated fan-out genuinely cannot be performed. Say exactly that, name the missing capability, and offer to run the work sequentially in this session instead. Never abort merely because `TeamCreate` was not found.

### 0d. Report the verdict before continuing

Print it, in one block, so the reasoning is auditable:

```
Capability gate
  CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS : set (process env) / declared in ~/.claude/settings.json
  Agent                                : present (name: yes, isolation: yes)
  SendMessage                          : present
  TaskCreate                           : present
  TeamCreate / TeamDelete              : absent  <- expected; teams are folded into Agent
  Verdict                              : NORMAL — proceeding with named worktree-isolated fan-out
```

---

## Step 1 — Is a fan-out worth it?

A fan-out costs roughly **3-4x the tokens** of doing the work in one session. Decide before spending it.

**Parallelize when**: the streams are genuinely independent; each has enough work to justify its own context; they touch disjoint file sets; or a slow stream would otherwise block a fast one.

**Do NOT parallelize when**:
- One stream's output is another's input. Two agents that mostly wait on each other are slower *and* dearer than one agent doing both in order.
- The whole job is a search or a read. Use read-only exploration subagents — that is ~1.5x, not 3-4x.
- The work is under roughly an hour of single-session effort. Briefing overhead eats the gain.
- The streams edit the same files. Isolation prevents clobbering, not merge conflicts.

If a fan-out is not worth it, say so and propose the sequential plan instead. Declining is a valid outcome of this command.

---

## Step 2 — Decompose

Split along **two axes at once**. Topic alone is the common mistake.

### Axis 1 — By subject matter

The obvious cut: surface / service / data layer / tests / docs. Each stream owns a **disjoint file set**. Write the owned paths down per stream; you will put them in the brief, and they are how you detect an overlap before it happens.

### Axis 2 — By who can actually execute it

Some steps an agent cannot perform, and a stream whose *central* step is one of those must be its own stream. Otherwise it silently stalls, or — worse — the agent improvises around the blocker and does something unsanctioned.

An agent cannot: read a credential's value out of a password manager or vault; change a setting in a hosting or database provider's dashboard; grant access; approve its own change; make a decision only the owner can make.

Give that work its **own agent**, and define its deliverable as **artifacts, not actions**: the exact commands to run, the exact values to set and where, a checklist the human executes, a diff staged and left uncommitted. The agent prepares; the human performs. That single split reliably prevents two streams from overlapping on the same blocked step, each waiting for the other to clear it.

Name the streams after what they own (`api`, `migrations`, `handoff-pack`), not after roles.

### Overlap check before spawning

For each pair of streams, confirm the owned path sets are disjoint. If two streams must touch one file, that file belongs to exactly one of them, and the other requests the change by message. State the owner explicitly in both briefs.

---

## Step 3 — Brief each stream

A background agent starts with **zero conversation context**. A terse prompt produces shallow, generic work, and you may not get a chance to clarify mid-run. Brief it like a capable colleague who just walked in.

Each brief must carry:

- **What** — the goal restated in one paragraph, and the definition of done.
- **Why** — the motivation, so the agent can judge trade-offs you did not anticipate.
- **Where** — repo root, base branch, branch-naming pattern, and the **exact paths this stream owns**.
- **Out of scope** — the paths owned by the *other* streams, named, with the instruction to request rather than edit.
- **Constraints** — the project's own rules that apply (base-branch target, file-count limits, forbidden operations, review gates). Point at the repo's guidance file rather than paraphrasing it.
- **Concurrent work** — who else is running and what they own. Without this an agent cannot avoid a collision it cannot see.
- **Human-gated steps** — if this stream hits one, it produces the artifact and reports back; it does not attempt the action and does not invent a workaround.
- **Escalation path** — report to the orchestrator, not to the user. Only the orchestrator holds the interactive surface in the main conversation. Anything needing a human decision comes back as a question in the agent's report, and the orchestrator relays the answer via `SendMessage`.
- **Deliverable shape** — the exact format of the final report you want back.

---

## Step 4 — Spawn

```text
Agent(
  name: "api",                        // addressable via SendMessage, during AND after the run
  description: "Implement the API layer",
  subagent_type: "general-purpose",   // or a specialized type where one fits
  model: "opus",                      // never Sonnet for subagents — Opus, or omit to inherit
  isolation: "worktree",              // mandatory for any agent that writes
  run_in_background: true,
  prompt: "<the full brief from Step 3>",
)
```

Send all independent spawns **in one message** so they start concurrently.

Non-negotiables at spawn time:

- **`isolation: "worktree"` for every agent that writes files.** Without it, parallel agents edit the same working tree and clobber each other. Read-only exploration agents may omit it.
- **Never Sonnet for subagents.** Set `model: "opus"` or omit `model` to inherit the parent.
- **Do not pass `team_name` or `mode`.** Current harnesses document both as *"Deprecated; ignored."*
- Give every agent a `name`. An unnamed agent cannot be corrected mid-run.

---

## Step 5 — Coordinate

- **Mid-run correction**: `SendMessage({ to: "<name>", ... })`. The name resolves after the agent has completed too — it resumes from its transcript, so a follow-up does not restart the work.
- **Cross-stream requests**: route them through the orchestrator. Agent-to-agent negotiation over a shared file produces two plausible answers and no decision.
- **Stopping an agent**: **`TaskStop` does NOT shut down a teammate.** Send a `shutdown_request` via `SendMessage` and wait for it to wind down. Killing a task leaves a locked worktree behind.
- **Never fabricate a pending result.** If the user asks about a stream that has not reported, say it is still running. The completion notification is delivered to you; it is never something you write.

---

## Step 6 — Converge

When every stream has reported:

1. **Reconcile** — read the reports against each other. Two streams that describe the same file differently means one of them is wrong; resolve it before reporting success.
2. **Verify at the ref, not the working tree** — a multi-worktree checkout drifts. Confirm what actually landed by reading the branch (`git show <ref>:<path>`, `git ls-tree <ref>`), not by listing the local directory.
3. **Collect the human-gated artifacts** — present the prepared commands, values, and checklists together, in one place, as the actions the user performs.
4. **Clean up** — remove worktrees for streams that produced nothing.
5. **Report once** — one convergence summary: per stream, what landed, what is blocked, what needs the user. The user should not have to open N transcripts.

---

## Notes

- **The gate is the point.** A command that refuses to run because it looked for one retired tool name is worse than no command: it reports a harness upgrade as an outage, and the user goes hunting for a flag that was never the cause. Check the flag *and* the surface, and treat "flag set, legacy tools absent" as the healthy case.
- **Isolation is not merge-conflict prevention.** It stops two agents corrupting one checkout. Disjoint file ownership is what stops the conflict.
- **The executor axis is not a nicety.** A stream blocked on a human step, buried inside a stream that is otherwise unblocked, is the failure mode that looks like slowness and is actually a stall.
- **This command does not commit, push, or open PRs.** It orchestrates. Landing the work follows the project's own execution and review protocol, with its own consent gates.
- Cost is real: three agents is 3-4x the tokens. Say so when recommending a fan-out, and be willing to recommend against one.
