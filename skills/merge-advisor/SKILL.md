---
name: merge-advisor
description: >
  Computes the ORDER in which a set of open PRs should be merged so that each one
  is still mergeable when its turn arrives. Measures pairwise file collisions,
  latent conflicts that only appear after an earlier PR lands, artifacts anchored
  to a base SHA that every other PR must regenerate, and CI queue capacity. Use
  when the user asks "in what order do I merge these", "which PR goes first",
  "how do I avoid conflicts merging all of these", "will merging this break the
  others", or has a backlog of open PRs against one base. Do NOT trigger for:
  reviewing a single PR, checking whether one branch is behind (that is
  sync-advisor), or listing PR status (that is review-open-prs).
---

# Merge Advisor

A pile of PRs is open against one base. Each was measured green **against a base
that no longer exists by the time its turn comes**. This skill computes the
order that keeps them green, and it never merges anything.

## The question nobody else answers

Three skills look at PRs and only one of them answers ordering:

| skill | question | unit |
|-------|----------|------|
| `review-open-prs` | which PRs need attention? | one PR at a time |
| `sync-advisor` | this checkout drifted, what do I run? | one branch vs its base |
| **`merge-advisor`** | **in what ORDER, so each is still valid at its turn?** | **the SET** |

The distinction is not bookkeeping. **"Mergeable" is not a property of a PR. It
is a property of the pair (PR, base-it-will-land-on).** A per-PR report reads
every row against *today's* base, and the moment the first merge lands, every
other row is describing a base that is gone. Ten green PRs is not ten merges.

## This skill never acts

Everything below reads. The fixes are **printed for the user to run**:

- `gh pr merge`, `git merge`, `git rebase`, `git push` — recommended, never run.
- Regeneration commands — printed with their exact invocation, never executed.

One exception, named out loud when used: `git fetch origin --quiet` runs first.
It writes remote-tracking refs and nothing else. Without it every measurement is
taken against a stale base and produces an order that was correct yesterday.

**Never offer a bypass as an option.** `--admin`, `--force`, merging past a red
or unanswered check, disabling a required check to unblock a queue — none of
these is a row in a menu. If the ordering is blocked, the block is the finding.

## Step 0 — Resolve the base and the PR set

`$BASE` is a **bare branch name** (`develop`, never `origin/develop`). Every
command below interpolates `origin/$BASE`, so a value carrying the remote becomes
`origin/origin/develop`, which is not a ref.

```bash
# 1. a base the user named explicitly — take it
# 2. the repo's PR default
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
# 3. otherwise probe, in order
for b in develop main master trunk; do
  git show-ref --verify --quiet "refs/remotes/origin/$b" && { echo "$b"; break; }
done
```

Normalise unconditionally, then fetch:

```bash
BASE=${BASE#refs/remotes/}; BASE=${BASE#origin/}
git fetch origin --quiet
```

Enumerate the set, and **fetch every PR head as a local ref** — the measurements
below need the actual commits, not just their SHAs:

```bash
gh pr list --base "$BASE" --state open --limit 100 \
  --json number,title,headRefName,headRefOid,isDraft,mergeable,author,url

# Materialize the heads. Without this, merge-tree has nothing to read.
gh pr list --base "$BASE" --state open --json number --jq '.[].number' \
  | while read -r n; do git fetch origin "pull/$n/head:pr-$n" --quiet --force; done
```

Record `### ref: origin/$BASE @ <sha>` above every measurement that follows.
An order computed against an unnamed base is an opinion.

## Step 1 — The seven predicates

Run all of them. Predicates 4 and 5 are the two that no per-PR view can produce.

| # | Predicate | Answers |
|---|-----------|---------|
| 1 | Eligibility | Which PRs are candidates at all? |
| 2 | Check freshness | Is that green mark about the CURRENT base? |
| 3 | Conflicts with base NOW | Which need work before anything else happens |
| 4 | **Pairwise file collision** | **Which PRs touch the same files** |
| 5 | **Latent conflicts** | **Which pairs conflict with EACH OTHER, not with base** |
| 6 | Base-anchored artifacts | What every other PR must regenerate after a merge |
| 7 | Queue capacity | How many can be in flight without starving CI |

### 1. Eligibility — and you must FORCE the mergeable calculation

GitHub computes mergeability **lazily**, and the shape of that laziness is worse
than "it might be stale". Measured against a live repo with 8 open PRs on
2026-08-02:

```bash
gh api "repos/$OWNER/$REPO/pulls?state=open&per_page=8" \
  --jq '.[] | {n: .number, mergeable, state: .mergeable_state}'
#  {"mergeable":null,"n":4309,"state":null}
#  {"mergeable":null,"n":4308,"state":null}      ... all 8 null
```

```bash
gh api "repos/$OWNER/$REPO/pulls/4309" --jq '{mergeable, mergeable_state}'
#  {"mergeable":true,"mergeable_state":"unstable"}
```

**The list endpoint never populates these fields.** Not "not yet" — never. They
exist only in the individual-PR representation, and the two calls above were
made seconds apart, so 4309's value was already computed when the list returned
`null` for it. Anything built from `gh pr list` reads `null` on every row, and a
consumer that treats `null` as a value gets eight PRs that look identical.

This matters more here than in a status report. `review-open-prs` reading a
stale field produces one wrong row; **merge-advisor reading it produces a wrong
ORDER**, and the order is the whole output.

So force it, per PR, and poll rather than guessing at a sleep:

```bash
force_mergeable() {                       # $1 = PR number
  local n="$1" try=0 delay=2 out
  while [ "$try" -lt 5 ]; do
    # The individual endpoint is what STARTS the background job. Reading it is
    # the trigger, so the first call is expected to come back uncomputed.
    out=$(gh api "repos/$OWNER/$REPO/pulls/$n" \
            --jq '{mergeable, mergeable_state}' 2>>"$MNM_LOG")
    case "$out" in
      *'"mergeable":null'*|'') ;;         # still computing, or the call failed
      *) printf '%s\n' "$out"; return 0 ;;
    esac
    sleep "$delay"; delay=$(( delay * 2 )); try=$(( try + 1 ))
  done
  printf '{"mergeable":"unverifiable","after":%d}\n' "$try"; return 2
}
```

Three properties of that loop, each load-bearing:

- **Backoff, not a fixed `sleep 5`.** The job takes as long as the diff is
  large, so a constant wait is either wasted time on small PRs or a premature
  give-up on big ones — and big PRs are exactly the ones this skill orders first.
- **stderr goes to a log, never to `/dev/null`.** A failing `gh` call and a PR
  that is genuinely still computing both return empty, and discarding stderr
  makes them the same event. `$MNM_LOG` is `${TMPDIR:-/tmp}/merge-advisor.log`.
- **Exhausting the retries returns `unverifiable`, not a guess.** Not `"clean"`,
  not `"calculating"` — a fourth adjective is how three states become two again.

Then read the rest, which are cheap and not lazily computed:

```bash
gh pr view "$N" --json isDraft,reviewDecision,statusCheckRollup
```

**`mergeable: true` is not `CLEAN`.** In the same measurement, 4 of 8 PRs read
`mergeable_state: "unstable"` — the branch applies, and its checks are failing
or pending. `unstable` is a merge that *works* and *should not happen yet*. Use
`mergeable` for the ordering constraint and `mergeable_state` for eligibility;
collapsing them produces an order that is technically applicable and wrong.

A draft is not a candidate. Say so as a row rather than dropping it silently:
a PR missing from the plan reads as "already handled".

### 1b. Re-force it between tiers — the value expires on every merge

This is the part a per-PR tool never needs and this one cannot skip.

`mergeable` is computed **against the base as it stands**. The instant Tier 1
lands, every value measured for Tier 2 describes a base that no longer exists —
which is the premise of this whole skill, applied to its own inputs. GitHub does
not proactively recompute; it invalidates and waits to be asked again.

So `force_mergeable` runs again for every remaining PR **after each tier**, and
a plan printed once and followed for an hour is a plan whose later tiers were
computed against the wrong base. If the recomputation changes the shape, the
remaining tiers are re-derived rather than executed as printed.

### 2. Check freshness — the green mark's expiry date

```bash
# What base SHA was the rollup computed against?
gh api "repos/{owner}/{repo}/commits/$(gh pr view "$N" --json headRefOid --jq .headRefOid)/check-runs" \
  --jq '.check_runs[] | {name, conclusion, started_at}'

# How far has the base moved since this PR last saw it?
git rev-list --count "pr-$N..origin/$BASE"
```

`gh pr checks` has no `--json`; use the check-runs API.

A green check computed 84 commits ago tested a tree that no longer resembles the
merge result. **This is not a reason to distrust the PR** — it is the reason
ordering exists. Record the distance; it feeds the fragility ranking in Step 2.

### 3. Conflicts with the base as it stands

If the repo already has a program that answers this, **run it** rather than
re-deriving it — a second implementation of a measurement drifts exactly like a
second implementation of code. Look for one before reaching for `merge-tree`:

```bash
ls scripts/ | grep -iE 'mergeab|conflict'
```

Otherwise, and note the redirect order — `2>&1 >/dev/null` keeps stderr, which
`>/dev/null 2>&1` throws away along with the ability to tell "no conflicts" from
"the command failed":

```bash
git merge-tree --write-tree "origin/$BASE" "pr-$N" 2>&1 >/dev/null; echo "exit=$?"
# exit 0 = clean, exit 1 = conflicts, anything else = the command itself failed
```

Treat a non-0/1 exit as **unverifiable**, never as clean.

### 4. Pairwise file collision — the matrix

```bash
# The files each PR touches, against the merge base rather than the branch tip
git diff --name-only "$(git merge-base "origin/$BASE" "pr-$N")...pr-$N"
```

Then intersect every pair. Two PRs sharing zero files are order-independent and
can be batched together; two sharing a file are a sequencing decision even when
neither currently conflicts, because a clean textual merge of two edits to the
same file is exactly how a semantic conflict ships green.

Report the intersection **by filename**, not as a count. "PR #A and PR #B
overlap on 3 files" is unactionable; naming `lefthook.yml` tells the reader
which of the two is the cheap rebase.

### 5. Latent conflicts — the ones that do not exist yet

The dangerous conflict is not the one blocking a PR today. It is the one that
appears **only after an earlier PR lands**, in a PR that is green right now.

```bash
# Simulate: does B still apply once A has landed?
git merge-tree --write-tree "pr-$A" "pr-$B" 2>&1 >/dev/null; echo "exit=$?"
```

Run this for every pair that Step 4 flagged as overlapping. A pair that is clean
against base and dirty against each other is a **hard ordering constraint**, and
it is invisible to `gh pr list`, to any per-PR status report, and to the PR
author.

If the exit code is neither 0 nor 1, report `unverifiable` and name the pair.
Do not fill the cell by inference.

### 6. Base-anchored artifacts — generalised

Some checked-in files are **derived from the base** and carry the base SHA they
were derived from. When the base moves — and especially when a **squash merge**
rewrites it — that anchor points at a commit that no longer exists, and the
artifact breaks on **every open PR at once**. One merge, N failures, none of them
caused by the PR they appear on.

This skill does not hardcode any project's artifact. **Discover them:**

```bash
# Files carrying a base SHA, a "baseline", or a generated-from marker
git grep -lE '(baseSha|sourceSha|baselineSha|generatedFrom|"base":\s*"[0-9a-f]{7,40}")' \
  "origin/$BASE" -- . | head -20

# Common shapes, by convention rather than by name
git ls-tree -r --name-only "origin/$BASE" \
  | grep -iE '(baseline|snapshot|\.lock$|lockb?$|generated|__snapshots__)'
```

For each candidate, ask the two questions that decide whether it constrains the
order:

1. **Is it touched by more than one open PR?** If one, it is that PR's problem.
2. **Is it regenerated from the base rather than authored?** A lockfile and a
   typecheck baseline both are; a hand-written config is not.

Both yes means a **regeneration checkpoint** goes into the sequence: a point at
which every remaining PR re-derives the artifact before its checks are trusted.
Print the regeneration command the repo already provides — find it, do not
invent it:

```bash
grep -nE '"(baseline|typecheck|gen:|generate)' package.json
```

If no regeneration command exists, say so: the artifact is anchored with no way
to re-anchor it, and **that is a defect to file, not a step to improvise.**

### 7. Queue capacity

Measure it. A recommendation to "merge three at a time" with no measurement
behind it is a guess wearing a number.

```bash
# In-flight and queued runs right now
gh run list --limit 40 --json status,name,createdAt \
  --jq '[.[] | select(.status == "in_progress" or .status == "queued")] | length'

# Runners and their state (self-hosted fleets)
gh api "repos/{owner}/{repo}/actions/runners" --jq '.runners[] | {name, status, busy}'
# org-level fleets live at: gh api "orgs/{org}/actions/runners"
```

Each merge into the base triggers the base's own workflows **plus** a re-run on
every remaining open PR that auto-syncs. On a FIFO fleet with no priority lane,
merging four at once can queue deeper than the fleet drains, and the last PR's
checks then report against a base two merges further along than the one they
started on.

Batch size is `min(idle runners, count of collision-free PRs in the current
tier)`. State both inputs.

## Step 2 — Order the set

Apply in this order. Earlier rules are hard constraints; the last is the
tie-breaker.

1. **Latent-conflict edges (predicate 5) are directed and non-negotiable.** If B
   fails to apply over A, then A precedes B, and B carries a rebase note. If the
   pair conflicts in both directions, they are not orderable — the two authors
   reconcile before either lands, and that is the finding.
2. **A PR that changes a base-anchored artifact's SHAPE goes at a tier boundary**,
   with a regeneration checkpoint immediately after it. Never in the middle of a
   batch.
3. **A PR already conflicting with the base does not enter the order at all.** It
   is rebased first, re-measured, and then placed. Placing it on the strength of
   a plan to fix it is scheduling work that does not exist yet.
4. **Tie-break by FRAGILITY, highest first — not by importance.**

That fourth rule is the one that surprises people, so it carries its reason.
Fragility is *how likely this PR is to stop applying while it waits*, and it is
approximated by breadth of change times distance behind base (predicates 4 and
2). The wide, old PR goes first — not because it matters more, but because its
window is the shortest and every merge ahead of it narrows that window further.
Merging the small clean ones first *feels* like progress and spends the exact
resource the large one is running out of.

Then group into **tiers**: within a tier, no two PRs share a file (predicate 4)
and no latent edge connects them (predicate 5), so a tier merges in any order
and, capacity permitting, concurrently.

## Step 3 — Report shape

Keep it to what was measured.

```
### ref: origin/develop @ 706a6676 | 11 open PRs | 4 idle runners

TIER 1 — merge in any order, no shared files
  #4299  https://github.com/org/repo/pull/4299   docs(observability): the record
         green @ base-12  ·  3 files  ·  no overlap
  #4309  https://github.com/org/repo/pull/4309   feat: gate receipts
         green @ base-0   ·  4 files  ·  no overlap

  ↓ REGENERATE: bun run typecheck:baseline   (tsconfig baseline anchors to
    sourceSha; the squash above orphans it on all remaining PRs)

TIER 2 — sequenced, latent conflicts
  #4242  ...  MUST precede #4120 — clean vs base, conflicts with #4120 on
              .github/workflows/quality-report-allure.yml

NOT IN THE ORDER
  #4054  conflicts with base today. Rebase, re-measure, then place.
  #4124  mergeable: UNKNOWN after two reads — unverifiable, not clean.

CAPACITY  4 idle runners, 6 runs queued. Batch of 2, not 4: each merge
          re-triggers checks on the 9 PRs still open.
```

Every PR row carries its **full URL**. A bare `#4309` is not clickable from a
terminal and not resolvable from a pasted report.

## Degraded modes, stated rather than hidden

- **No `gh` auth** — report distance and collisions from git alone, and say the
  check states are unmeasured. Do not infer green from a clean merge-tree.
- **PR heads not fetchable** (deleted fork, permissions) — that PR is
  `unverifiable`, listed with the reason. It is not "clean".
- **No anchored artifacts found** — say the search ran and found none, with the
  command. Silence reads as "not checked".

## Why the order matters more than it looks

The failure this prevents is quiet. Merging in arrival order does not throw an
error: each merge succeeds, each PR was green when it was measured, and the
breakage surfaces two merges later on a PR whose author changed nothing. The
time is then spent debugging the wrong PR — and the actual cause, a base-anchored
artifact orphaned by a squash three merges back, is the one thing nobody re-reads
because its own PR is already closed and green.
