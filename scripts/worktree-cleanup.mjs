#!/usr/bin/env node
/**
 * Reclaim disk from git worktrees — and REFUSE the ones that still hold work.
 *
 *   node scripts/worktree-cleanup.mjs                  # dry run, node_modules only
 *   node scripts/worktree-cleanup.mjs --worktrees      # dry run, + merged-worktree removal
 *   node scripts/worktree-cleanup.mjs --worktrees --apply
 *   node scripts/worktree-cleanup.mjs /path/to/repo --json
 *
 * ## Why this is a program and not a prose checklist
 *
 * This tool DELETES. The value is entirely in what it refuses, and a refusal
 * written as a bullet point in a skill is a refusal that runs only when the
 * reader remembers it. Every refusal below is a predicate with a name, an
 * evidence string, and a test.
 *
 * The cost asymmetry is the whole design. Twenty gigabytes of stale worktrees
 * costs nothing but disk. One removed worktree holding the only copy of
 * someone's commits costs the work itself, and no later command recovers it.
 * So the classifier is biased all the way to the safe side: anything it cannot
 * MEASURE as safe comes back `unverifiable`, and `unverifiable` never collapses
 * into `remove`.
 *
 * ## The refusals, and what each one is protecting
 *
 *   main-checkout        `git worktree list` puts the repository itself first.
 *                        It is never a candidate, for either action.
 *   locked               `git worktree list --porcelain` reported `locked`.
 *                        A lock means someone or something claimed it.
 *   uncommitted          `git status --porcelain` is non-empty. Untracked files
 *                        count: they are work with no other copy either.
 *   unpushed             The branch is AHEAD of its upstream. This is the
 *                        single most likely way to destroy work, because a
 *                        branch that is ahead is not stale — it is unfinished.
 *   not-merged           No merge evidence from any of the three tests below.
 *
 * ## "Merged" is measured three ways, and the third is the common one
 *
 *   ancestor   `git merge-base --is-ancestor HEAD origin/<base>` — a true merge
 *              commit or a fast-forward. Cheap, local, and WRONG for most of
 *              this repo's history.
 *   cherry     `git cherry origin/<base> <branch>` with every line `-` — the
 *              commits are patch-equivalent upstream. Catches rebase-merges.
 *   pr         A GitHub PR whose `state == MERGED` has this branch as its head.
 *
 * A SQUASH merge collapses N commits into one new commit with a new patch id,
 * so the branch is neither an ancestor of the base nor patch-equivalent to it.
 * Ancestry alone therefore reports "not merged" for work that certainly landed,
 * and in a squash-merge repo that is the MAJORITY case — which is why the `pr`
 * test exists and why losing `gh` downgrades a verdict to `unverifiable`
 * instead of to `not-merged`.
 *
 * ## Two ambiguities that are reported rather than resolved
 *
 *   branch-changed-under-us   The branch `git worktree list` recorded and the
 *                             branch the worktree reports RIGHT NOW disagree.
 *                             A sibling process re-checked it out mid-run; the
 *                             measurements above describe a state that is gone.
 *   commits-after-merge       The PR merged, and the branch tip is NEWER than
 *                             `mergedAt`. Something was added after the merge,
 *                             and that something is not covered by the PR.
 *
 * ## No stream is ever discarded
 *
 * Every subprocess runs through `run()` with `stdio: 'pipe'` and no shell, so
 * stderr is captured and surfaced rather than dropped. An empty result from a
 * command that ERRORED must never read as "found nothing" — in this tool that
 * misreading is the difference between "no unpushed commits" and "the check
 * did not run".
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

/* ------------------------------------------------------------------ */
/* Subprocess                                                          */
/* ------------------------------------------------------------------ */

/**
 * Run a command with no shell, capturing BOTH streams.
 * Never throws; the caller reads `ok` and, when it is false, `stderr`.
 */
export function run(cmd, args, cwd) {
  try {
    const stdout = execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, stdout: stdout.replace(/\n+$/, ''), stderr: '', code: 0 };
  } catch (err) {
    return {
      ok: false,
      stdout: String(err.stdout ?? '').replace(/\n+$/, ''),
      stderr: String(err.stderr ?? err.message ?? '').replace(/\n+$/, ''),
      code: err.status ?? -1,
    };
  }
}

const git = (args, cwd) => run('git', args, cwd);

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Parse `git worktree list --porcelain`.
 * The FIRST record is the main checkout — that ordering is the only thing
 * identifying it, and it is load-bearing.
 */
export function parseWorktreeList(text) {
  const entries = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line === '') { if (cur) { entries.push(cur); cur = null; } continue; }
    const sp = line.indexOf(' ');
    const key = sp === -1 ? line : line.slice(0, sp);
    const val = sp === -1 ? '' : line.slice(sp + 1);
    if (key === 'worktree') {
      if (cur) entries.push(cur);
      cur = {
        path: val, head: null, branch: null, detached: false,
        bare: false, locked: false, lockReason: '',
        prunable: false, prunableReason: '',
      };
      continue;
    }
    if (!cur) continue;
    if (key === 'HEAD') cur.head = val;
    else if (key === 'branch') cur.branch = val.replace(/^refs\/heads\//, '');
    else if (key === 'detached') cur.detached = true;
    else if (key === 'bare') cur.bare = true;
    else if (key === 'locked') { cur.locked = true; cur.lockReason = val; }
    else if (key === 'prunable') { cur.prunable = true; cur.prunableReason = val; }
  }
  if (cur) entries.push(cur);
  return entries.map((e, i) => ({ ...e, isMain: i === 0 }));
}

/* ------------------------------------------------------------------ */
/* Classification — pure, and the reason this file is testable          */
/* ------------------------------------------------------------------ */

export const REMOVE = 'remove';
export const REFUSE = 'refuse';
export const UNVERIFIABLE = 'unverifiable';

/**
 * Decide a worktree's fate from measured facts alone.
 *
 * Collects EVERY applicable finding rather than returning at the first one:
 * "skipped for unpushed commits" and "skipped for unpushed commits AND
 * uncommitted changes" are different reports, and the second is the one that
 * tells its reader how much is at stake.
 *
 * Verdict precedence: any refusal wins; otherwise any ambiguity wins;
 * otherwise, and only otherwise, `remove`.
 */
export function classify(f) {
  const findings = [];
  const add = (verdict, reason, evidence) => findings.push({ verdict, reason, evidence });

  if (f.isMain) {
    add(REFUSE, 'main-checkout', 'first entry of `git worktree list` — this is the repository itself');
    return finalize(findings);
  }
  if (f.bare) {
    add(REFUSE, 'bare', 'bare repository, not a working checkout');
    return finalize(findings);
  }
  if (f.locked) {
    add(REFUSE, 'locked', `\`git worktree list --porcelain\` reports locked${f.lockReason ? `: ${f.lockReason}` : ''}`);
    return finalize(findings);
  }
  if (f.missing) {
    add(UNVERIFIABLE, 'gitdir-missing', `path is absent from disk${f.prunableReason ? ` (${f.prunableReason})` : ''} — nothing to measure; \`git worktree prune\` is the operation, and it is yours to run`);
    return finalize(findings);
  }
  if (f.liveBranch !== null && f.recordedBranch !== null && f.liveBranch !== f.recordedBranch) {
    add(UNVERIFIABLE, 'branch-changed-under-us',
      `\`git worktree list\` recorded \`${f.recordedBranch}\`, the worktree now reports \`${f.liveBranch}\` — a sibling process re-checked it out`);
    return finalize(findings);
  }
  if (f.statusFailed) {
    add(UNVERIFIABLE, 'status-unreadable', `\`git status --porcelain\` failed: ${f.statusError || 'no stderr captured'}`);
    return finalize(findings);
  }
  if (f.detached) {
    add(UNVERIFIABLE, 'detached-head', 'HEAD is detached — there is no branch whose merge state can be read');
  }
  if (f.dirty) {
    add(REFUSE, 'uncommitted', `\`git status --porcelain\` returns ${f.dirtyCount} line(s) — untracked files included, they have no other copy either`);
  }
  if (f.ahead !== null && f.ahead > 0) {
    add(REFUSE, 'unpushed', `${f.ahead} commit(s) ahead of \`${f.upstream}\` — ahead is not stale, it is unfinished`);
  }
  if (!f.mergedBy) {
    if (f.ghAvailable) {
      add(REFUSE, 'not-merged', `no merge evidence: not an ancestor of any of [${f.base}], not patch-equivalent (\`git cherry\`), no merged PR for this head`);
    } else {
      add(UNVERIFIABLE, 'merge-unmeasurable',
        `not an ancestor of any of [${f.base}] and not patch-equivalent — but a SQUASH merge looks exactly like this, and \`gh\` is unavailable to check the PR (${f.ghError || 'no reason captured'})`);
    }
  } else if (f.tipAfterMerge) {
    add(UNVERIFIABLE, 'commits-after-merge',
      `PR #${f.prNumber} merged at ${f.mergedAt}, but the branch tip is dated ${f.tipDate} — work was added after the merge`);
  }
  if (!f.hasUpstream && f.mergedBy !== 'ancestor') {
    add(UNVERIFIABLE, 'no-upstream',
      'the branch tracks no remote, so "is it pushed" cannot be answered from the ref alone');
  }
  return finalize(findings);
}

function finalize(findings) {
  if (findings.length === 0) return { verdict: REMOVE, findings: [] };
  if (findings.some((x) => x.verdict === REFUSE)) return { verdict: REFUSE, findings };
  return { verdict: UNVERIFIABLE, findings };
}

/* ------------------------------------------------------------------ */
/* Measurement                                                         */
/* ------------------------------------------------------------------ */

/**
 * Resolve the bases to measure "merged" against — a SET, as BARE names
 * (`develop`, never `origin/develop`; `origin/origin/develop` is not a ref).
 *
 * ## Why a set and not one branch
 *
 * The first version of this took `origin/HEAD` and stopped. Run against a repo
 * that merges features into `develop` and only promotes `develop` to `main` at
 * release time, `origin/HEAD` resolves to `main` and EVERY landed feature
 * branch reports `not-merged` — measured on a real 60-worktree checkout, that
 * was 41 refusals, most of them wrong about why.
 *
 * A branch whose commits are contained in ANY shared remote base branch is
 * merged for this tool's purposes, because the question being answered is
 * "does this work exist somewhere other than this directory". Which base it
 * reached is reported, never assumed.
 *
 * `--base X` narrows the set back to exactly one when that distinction matters.
 */
export function resolveBases(repo, explicit) {
  if (explicit) return { bases: [explicit], how: 'named on the command line' };
  const bases = [];
  const head = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], repo);
  if (head.ok && head.stdout) bases.push(head.stdout.replace(/^origin\//, ''));
  for (const b of ['develop', 'main', 'master', 'trunk']) {
    if (bases.includes(b)) continue;
    if (git(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${b}`], repo).ok) bases.push(b);
  }
  if (bases.length === 0) return { bases: [], how: 'no remote base branch found' };
  const how = head.ok && head.stdout
    ? `origin/HEAD = ${head.stdout}, plus every conventional base that exists`
    : `origin/HEAD unset (${head.stderr || 'not a symbolic ref'}); probed conventional names`;
  return { bases, how };
}

/** One bulk `gh pr list`, indexed by head branch. Falls back per-branch on a miss. */
function loadPrIndex(repo, enabled) {
  if (!enabled) return { available: false, error: 'disabled with --no-gh', byHead: new Map() };
  const probe = run('gh', ['--version'], repo);
  if (!probe.ok) return { available: false, error: probe.stderr || 'gh not on PATH', byHead: new Map() };
  const res = run('gh', [
    'pr', 'list', '--state', 'all', '--limit', '1000',
    '--json', 'number,headRefName,state,mergedAt',
  ], repo);
  if (!res.ok) return { available: false, error: res.stderr || `gh exited ${res.code}`, byHead: new Map() };
  let rows;
  try { rows = JSON.parse(res.stdout || '[]'); }
  catch (err) { return { available: false, error: `unparseable gh output: ${err.message}`, byHead: new Map() }; }
  const byHead = new Map();
  for (const r of rows) {
    if (r.state !== 'MERGED') continue;
    const prev = byHead.get(r.headRefName);
    // Keep the LATEST merge for a re-used branch name.
    if (!prev || String(r.mergedAt) > String(prev.mergedAt)) byHead.set(r.headRefName, r);
  }
  return { available: true, error: '', byHead, scanned: rows.length };
}

/** A branch the bulk page missed — ask directly before concluding "no PR". */
function lookupPr(repo, branch, index) {
  if (index.byHead.has(branch)) return index.byHead.get(branch);
  if (!index.available) return null;
  const res = run('gh', [
    'pr', 'list', '--head', branch, '--state', 'merged', '--limit', '5',
    '--json', 'number,headRefName,state,mergedAt',
  ], repo);
  if (!res.ok) return null;
  let rows = [];
  try { rows = JSON.parse(res.stdout || '[]'); } catch { return null; }
  const merged = rows.filter((r) => r.state === 'MERGED')
    .sort((a, b) => String(b.mergedAt).localeCompare(String(a.mergedAt)));
  if (merged.length) index.byHead.set(branch, merged[0]);
  return merged[0] ?? null;
}

/** Gather every fact `classify()` needs for one worktree. */
export function measure(repo, entry, bases, prIndex) {
  const f = {
    isMain: entry.isMain, bare: entry.bare, locked: entry.locked, lockReason: entry.lockReason,
    missing: !existsSync(entry.path), prunableReason: entry.prunableReason,
    detached: entry.detached, recordedBranch: entry.branch, liveBranch: null,
    dirty: false, dirtyCount: 0, statusFailed: false, statusError: '',
    hasUpstream: false, upstream: null, ahead: null,
    base: bases.map((b) => `origin/${b}`).join(', '),
    mergedBy: null, mergedBase: null, prNumber: null, mergedAt: null,
    tipDate: null, tipAfterMerge: false,
    ghAvailable: prIndex.available, ghError: prIndex.error,
  };
  if (f.isMain || f.bare || f.locked || f.missing) return f;

  const live = git(['rev-parse', '--abbrev-ref', 'HEAD'], entry.path);
  f.liveBranch = live.ok && live.stdout !== 'HEAD' ? live.stdout : null;
  if (f.liveBranch !== null && f.recordedBranch !== null && f.liveBranch !== f.recordedBranch) return f;

  const status = git(['status', '--porcelain'], entry.path);
  if (!status.ok) { f.statusFailed = true; f.statusError = status.stderr; return f; }
  const lines = status.stdout.split('\n').filter((l) => l.trim() !== '');
  f.dirty = lines.length > 0;
  f.dirtyCount = lines.length;

  const branch = f.recordedBranch;
  if (branch) {
    const up = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], entry.path);
    if (up.ok && up.stdout) {
      f.hasUpstream = true;
      f.upstream = up.stdout;
      const ahead = git(['rev-list', '--count', `${up.stdout}..HEAD`], entry.path);
      f.ahead = ahead.ok ? Number(ahead.stdout) : null;
    }
  }

  for (const base of bases) {
    if (f.mergedBy) break;
    if (!git(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${base}`], repo).ok) continue;
    if (git(['merge-base', '--is-ancestor', 'HEAD', `origin/${base}`], entry.path).ok) {
      f.mergedBy = 'ancestor';
      f.mergedBase = base;
      break;
    }
    if (!branch) continue;
    const cherry = git(['cherry', `origin/${base}`, branch], repo);
    if (!cherry.ok) continue;
    const rows = cherry.stdout.split('\n').filter((l) => l.trim() !== '');
    if (rows.length > 0 && rows.every((l) => l.startsWith('-'))) {
      f.mergedBy = 'cherry';
      f.mergedBase = base;
    }
  }
  if (!f.mergedBy && branch) {
    const pr = lookupPr(repo, branch, prIndex);
    if (pr) {
      f.mergedBy = 'pr';
      f.prNumber = pr.number;
      f.mergedAt = pr.mergedAt;
      const tip = git(['log', '-1', '--format=%cI', 'HEAD'], entry.path);
      if (tip.ok && tip.stdout) {
        f.tipDate = tip.stdout;
        f.tipAfterMerge = Boolean(pr.mergedAt) && tip.stdout > pr.mergedAt;
      }
    }
  }
  return f;
}

/* ------------------------------------------------------------------ */
/* Disk                                                                */
/* ------------------------------------------------------------------ */

/** Bytes on disk, via `du -sk` (portable; `-b` is GNU-only). 0 when unreadable. */
export function dirBytes(dir) {
  const res = run('du', ['-sk', dir], undefined);
  if (!res.ok) return { bytes: 0, error: res.stderr };
  const kb = Number(String(res.stdout).split(/\s+/)[0]);
  return Number.isFinite(kb) ? { bytes: kb * 1024, error: '' } : { bytes: 0, error: `unparseable du output: ${res.stdout}` };
}

export function humanBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

/**
 * Find `node_modules` directories inside a worktree.
 *
 * Does not descend into a found `node_modules` (nested copies belong to their
 * parent's total), into `.git`, or into ANY other worktree — worktrees live
 * under the main checkout, so without that exclusion the main checkout would be
 * charged for every sibling's dependencies.
 */
export function findNodeModules(root, excludedPaths = [], maxDepth = 6) {
  const excluded = new Set(excludedPaths.map((p) => path.resolve(p)));
  const out = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let items;
    try { items = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const it of items) {
      if (!it.isDirectory() || it.isSymbolicLink()) continue;
      const full = path.join(dir, it.name);
      if (excluded.has(path.resolve(full))) continue;
      if (it.name === 'node_modules') { out.push(full); continue; }
      if (it.name === '.git') continue;
      walk(full, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

/* ------------------------------------------------------------------ */
/* Deletion — guarded                                                  */
/* ------------------------------------------------------------------ */

/**
 * Refuse to delete a path that is not a `node_modules` inside a KNOWN worktree.
 * A guard that only ever passes is not a guard, so this is asserted by tests
 * with paths it must reject.
 */
export function assertRemovableNodeModules(target, worktreePaths) {
  const abs = path.resolve(target);
  if (path.basename(abs) !== 'node_modules') {
    throw new Error(`refusing to delete a path that is not a node_modules: ${abs}`);
  }
  const inside = worktreePaths.some((w) => {
    const wr = path.resolve(w);
    return abs === wr || abs.startsWith(`${wr}${path.sep}`);
  });
  if (!inside) throw new Error(`refusing to delete outside every known worktree: ${abs}`);
  return true;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

export function parseArgs(argv) {
  const o = {
    repo: null, base: null, nodeModules: true, worktrees: false,
    apply: false, force: false, fetch: true, gh: true, json: false, help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--worktrees') o.worktrees = true;
    else if (a === '--no-node-modules') o.nodeModules = false;
    else if (a === '--apply') o.apply = true;
    else if (a === '--force') o.force = true;
    else if (a === '--no-fetch') o.fetch = false;
    else if (a === '--no-gh') o.gh = false;
    else if (a === '--json') o.json = true;
    else if (a === '--base') { o.base = argv[i + 1]; i += 1; }
    else if (a.startsWith('--base=')) o.base = a.slice(7);
    else if (a.startsWith('-')) throw new Error(`unknown flag: ${a}`);
    else o.repo = a;
  }
  return o;
}

const USAGE = `
worktree-cleanup — reclaim disk from git worktrees, refusing the ones that hold work

  node scripts/worktree-cleanup.mjs [repo] [options]

  (default)            DRY RUN. Reports the node_modules it would reclaim.
  --worktrees          Also classify worktrees for removal (merged + clean + pushed).
  --no-node-modules    Skip the node_modules pass.
  --apply              Actually delete. Without it nothing is removed.
  --force              Pass --force to \`git worktree remove\`. Only when you asked for it.
  --base <branch>      Measure "merged" against exactly this branch. Default: the SET
                       {origin/HEAD, develop, main, master, trunk} that actually exists.
  --no-fetch           Skip \`git fetch\` (measurements then run against stale refs).
  --no-gh              Skip the PR check. Squash-merged branches become unverifiable.
  --json               Machine-readable output.
`.trim();

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (err) { console.error(err.message); console.error(USAGE); return 2; }
  if (opts.help) { console.log(USAGE); return 0; }

  const repo = path.resolve(opts.repo ?? process.cwd());
  const top = git(['rev-parse', '--show-toplevel'], repo);
  if (!top.ok) { console.error(`not a git repository: ${repo}\n${top.stderr}`); return 2; }

  const listed = git(['worktree', 'list', '--porcelain'], repo);
  if (!listed.ok) { console.error(`\`git worktree list\` failed: ${listed.stderr}`); return 2; }
  const entries = parseWorktreeList(listed.stdout);
  const allPaths = entries.map((e) => e.path);

  const notes = [];
  if (opts.fetch) {
    const f = git(['fetch', 'origin', '--quiet', '--prune'], repo);
    notes.push(f.ok
      ? 'fetched origin (remote-tracking refs only — no branch, index or working tree touched)'
      : `fetch FAILED, measurements run against possibly stale refs: ${f.stderr}`);
  } else {
    notes.push('--no-fetch: every "merged" verdict below is measured against whatever origin/* already said');
  }

  const { bases, how } = resolveBases(repo, opts.base);
  if (bases.length === 0) { console.error('could not resolve a base branch; pass --base <branch>'); return 2; }
  notes.push(`bases = ${bases.map((b) => `origin/${b}`).join(', ')} (${how})`);

  const prIndex = opts.worktrees ? loadPrIndex(repo, opts.gh) : { available: false, error: 'not needed', byHead: new Map() };
  if (opts.worktrees) {
    notes.push(prIndex.available
      ? `gh: indexed ${prIndex.scanned} PRs, ${prIndex.byHead.size} merged heads`
      : `gh UNAVAILABLE (${prIndex.error}) — squash-merged branches will report \`unverifiable\`, never \`remove\``);
  }

  /* ---- worktree classification ---- */
  const classified = entries.map((e) => {
    const facts = opts.worktrees
      ? measure(repo, e, bases, prIndex)
      : { isMain: e.isMain, locked: e.locked, missing: !existsSync(e.path) };
    const result = opts.worktrees ? classify(facts) : null;
    return { entry: e, facts, result };
  });

  /* ---- node_modules pass ---- */
  const reclaim = [];
  const reclaimRefused = [];
  if (opts.nodeModules) {
    for (const c of classified) {
      const e = c.entry;
      if (e.isMain) { reclaimRefused.push({ path: e.path, reason: 'main-checkout', evidence: 'the repository itself — its node_modules is your working install' }); continue; }
      if (e.locked) { reclaimRefused.push({ path: e.path, reason: 'locked', evidence: `worktree is locked${e.lockReason ? `: ${e.lockReason}` : ''}` }); continue; }
      if (!existsSync(e.path)) { reclaimRefused.push({ path: e.path, reason: 'gitdir-missing', evidence: 'path absent from disk' }); continue; }
      for (const nm of findNodeModules(e.path, allPaths)) {
        const { bytes, error } = dirBytes(nm);
        reclaim.push({ path: nm, worktree: e.path, branch: e.branch, bytes, error });
      }
    }
    reclaim.sort((a, b) => b.bytes - a.bytes);
  }

  /* ---- worktree removal candidates ---- */
  const removals = [];
  const refusals = [];
  const ambiguous = [];
  if (opts.worktrees) {
    for (const c of classified) {
      const row = {
        path: c.entry.path, branch: c.entry.branch ?? '(detached)',
        findings: c.result.findings, mergedBy: c.facts.mergedBy ?? null,
        mergedBase: c.facts.mergedBase ?? null, prNumber: c.facts.prNumber ?? null, bytes: 0,
      };
      if (c.result.verdict === REMOVE) { row.bytes = dirBytes(c.entry.path).bytes; removals.push(row); }
      else if (c.result.verdict === REFUSE) refusals.push(row);
      else ambiguous.push(row);
    }
    removals.sort((a, b) => b.bytes - a.bytes);
  }

  /* ---- apply ---- */
  const actions = [];
  if (opts.apply) {
    if (opts.nodeModules) {
      for (const r of reclaim) {
        try {
          assertRemovableNodeModules(r.path, allPaths);
          rmSync(r.path, { recursive: true, force: true });
          actions.push({ action: 'rm node_modules', path: r.path, ok: true, bytes: r.bytes, error: '' });
        } catch (err) {
          actions.push({ action: 'rm node_modules', path: r.path, ok: false, bytes: 0, error: err.message });
        }
      }
    }
    for (const r of removals) {
      const args = ['worktree', 'remove'];
      if (opts.force) args.push('--force');
      args.push(r.path);
      const res = git(args, repo);
      actions.push({
        action: `git worktree remove${opts.force ? ' --force' : ''}`,
        path: r.path, ok: res.ok, bytes: res.ok ? r.bytes : 0, error: res.stderr,
      });
    }
  }

  const reclaimBytes = reclaim.reduce((s, r) => s + r.bytes, 0);
  const removeBytes = removals.reduce((s, r) => s + r.bytes, 0);
  const summary = {
    repo, bases, dryRun: !opts.apply, worktreesConsidered: opts.worktrees,
    worktreeCount: entries.length,
    nodeModulesCount: reclaim.length, nodeModulesBytes: reclaimBytes,
    removeCount: removals.length, removeBytes,
    refuseCount: refusals.length, unverifiableCount: ambiguous.length,
    reclaimedBytes: actions.filter((a) => a.ok).reduce((s, a) => s + a.bytes, 0),
  };

  if (opts.json) {
    console.log(JSON.stringify({ summary, notes, reclaim, reclaimRefused, removals, refusals, ambiguous, actions }, null, 2));
    return 0;
  }
  report({ summary, notes, reclaim, reclaimRefused, removals, refusals, ambiguous, actions, opts });
  return 0;
}

function report(r) {
  const { summary: s, opts } = r;
  const line = (n = 74) => '-'.repeat(n);
  console.log(`\nworktree-cleanup  ${s.dryRun ? 'DRY RUN — nothing was deleted' : 'APPLIED'}`);
  console.log(line());
  console.log(`repo         ${s.repo}`);
  console.log(`worktrees    ${s.worktreeCount} (1 main checkout + ${s.worktreeCount - 1} linked)`);
  for (const n of r.notes) console.log(`note         ${n}`);

  if (opts.nodeModules) {
    console.log(`\nRECLAIM  node_modules  —  ${r.reclaim.length} dir(s), ${humanBytes(s.nodeModulesBytes)}`);
    console.log('reversible with one install; touches no tracked file, in any worktree, ever');
    console.log(line());
    for (const x of r.reclaim.slice(0, 40)) {
      console.log(`  ${humanBytes(x.bytes).padStart(8)}  ${x.branch ?? '(detached)'}`);
      console.log(`            ${x.path}${x.error ? `  [du: ${x.error}]` : ''}`);
    }
    if (r.reclaim.length > 40) console.log(`  ... and ${r.reclaim.length - 40} more`);
    if (r.reclaim.length === 0) console.log('  (none found)');
    for (const x of r.reclaimRefused) console.log(`  SKIP      ${x.reason} — ${x.path}`);
  }

  if (opts.worktrees) {
    console.log(`\nREMOVE  merged worktrees  —  ${r.removals.length}, ${humanBytes(s.removeBytes)}`);
    console.log('merged AND clean AND pushed AND unlocked. The branch ref is left alone.');
    console.log(line());
    for (const x of r.removals) {
      const via = x.mergedBy === 'pr' ? `PR #${x.prNumber}` : `${x.mergedBy} of origin/${x.mergedBase}`;
      console.log(`  ${humanBytes(x.bytes).padStart(8)}  ${x.branch}   [merged: ${via}]`);
      console.log(`            ${x.path}`);
    }
    if (r.removals.length === 0) console.log('  (none — every worktree failed at least one check)');

    console.log(`\nREFUSED  —  ${r.refusals.length}`);
    console.log('the useful half of this report: each one still holds something');
    console.log(line());
    for (const x of r.refusals) {
      console.log(`  ${x.branch}`);
      for (const f of x.findings) console.log(`      ${f.reason}: ${f.evidence}`);
    }
    if (r.refusals.length === 0) console.log('  (none)');

    console.log(`\nUNVERIFIABLE  —  ${r.ambiguous.length}`);
    console.log('state could not be measured. Not the same as safe, and never treated as such.');
    console.log(line());
    for (const x of r.ambiguous) {
      console.log(`  ${x.branch}`);
      for (const f of x.findings) console.log(`      ${f.reason}: ${f.evidence}`);
    }
    if (r.ambiguous.length === 0) console.log('  (none)');
  }

  if (r.actions.length) {
    console.log(`\nACTIONS  —  ${r.actions.length}, ${humanBytes(s.reclaimedBytes)} reclaimed`);
    console.log(line());
    for (const a of r.actions) console.log(`  ${a.ok ? 'ok  ' : 'FAIL'}  ${a.action}  ${a.path}${a.error ? `\n        ${a.error}` : ''}`);
  }

  // After --apply the per-section figures above describe what was PLANNED.
  // Reporting them as still-recoverable would be a lie about the current state,
  // so the applied run reports only what the actions actually freed.
  if (s.dryRun) {
    console.log(`\nTOTAL  ${humanBytes(s.nodeModulesBytes + s.removeBytes)} recoverable` +
      `  (node_modules ${humanBytes(s.nodeModulesBytes)}${opts.worktrees ? ` + worktrees ${humanBytes(s.removeBytes)}` : ''})`);
  } else {
    const failed = r.actions.filter((a) => !a.ok).length;
    console.log(`\nTOTAL  ${humanBytes(s.reclaimedBytes)} reclaimed across ${r.actions.length - failed} action(s)` +
      `${failed ? `, ${failed} FAILED — see above` : ''}`);
  }
  if (s.dryRun) {
    console.log('\nNothing was deleted. Re-run with --apply to act on the lines above.');
    if (!opts.worktrees) console.log('Worktree removal is opt-in: add --worktrees to classify them.');
  }
  console.log('');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}

export { main };
