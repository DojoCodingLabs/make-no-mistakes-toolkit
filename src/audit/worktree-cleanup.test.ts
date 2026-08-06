/**
 * Tests for `scripts/worktree-cleanup.mjs`.
 *
 * This tool deletes, so the suite is written the other way round from most:
 * the cases that MATTER are the ones where it must refuse. A cleanup tool
 * that has only ever been tested removing things has not been tested.
 *
 * Two layers, deliberately separate:
 *
 *   PURE          `classify()` over hand-built fact objects. Every refusal
 *                 gets a case, and every case names what it protects.
 *   INTEGRATION   real git repositories built in a temp dir, with a real
 *                 remote, a real merged branch, a real dirty worktree and a
 *                 real unpushed branch — because a fact object can be wrong
 *                 about what git actually reports.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  REFUSE,
  REMOVE,
  UNVERIFIABLE,
  assertRemovableNodeModules,
  classify,
  detectStoppedOperation,
  findNodeModules,
  humanBytes,
  measure,
  parseArgs,
  parseWorktreeList,
  resolveBases,
} from '../../scripts/worktree-cleanup.mjs';

/** Facts for a worktree with nothing wrong with it. Each test breaks ONE thing. */
const clean = {
  isMain: false, bare: false, locked: false, lockReason: '', missing: false,
  prunableReason: '', detached: false, recordedBranch: 'feat/x', liveBranch: 'feat/x',
  midOperation: null, midOperationEvidence: '', midOperationUnmeasurable: false, midOperationError: '',
  dirty: false, dirtyCount: 0, statusFailed: false, statusError: '',
  hasUpstream: true, upstream: 'origin/feat/x', ahead: 0,
  base: 'origin/develop', mergedBy: 'pr', mergedBase: null, prNumber: 7,
  mergedAt: '2026-07-01T00:00:00Z', tipDate: '2026-06-30T00:00:00Z', tipAfterMerge: false,
  ghAvailable: true, ghError: '',
};

const reasons = (r: { findings: { reason: string }[] }) => r.findings.map((f) => f.reason);

describe('classify — the baseline it is measured against', () => {
  it('removes a worktree that is merged, clean, pushed and unlocked', () => {
    const r = classify(clean);
    expect(r.verdict).toBe(REMOVE);
    expect(r.findings).toEqual([]);
  });
});

describe('classify — the refusals, one broken fact at a time', () => {
  it('never the main checkout', () => {
    const r = classify({ ...clean, isMain: true });
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toContain('main-checkout');
  });

  it('never a locked worktree — a lock means someone claimed it', () => {
    const r = classify({ ...clean, locked: true, lockReason: 'agent run in progress' });
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toContain('locked');
    expect(r.findings[0].evidence).toContain('agent run in progress');
  });

  it('never a worktree with uncommitted changes', () => {
    const r = classify({ ...clean, dirty: true, dirtyCount: 3 });
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toContain('uncommitted');
    expect(r.findings[0].evidence).toContain('3 line(s)');
  });

  it('never a branch AHEAD of its upstream — the likeliest way to lose work', () => {
    const r = classify({ ...clean, ahead: 2 });
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toContain('unpushed');
  });

  it('never an unmerged branch', () => {
    const r = classify({ ...clean, mergedBy: null });
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toContain('not-merged');
  });

  it('never a worktree with a merge stopped in it — even when nothing else is wrong', () => {
    // The single fact broken here is `midOperation`. Everything else says
    // remove: merged, pushed, unlocked, and `git status --porcelain` EMPTY.
    // That combination is not hypothetical; it is reproduced against real git
    // in the integration suite below.
    const r = classify({ ...clean, midOperation: 'merge', midOperationEvidence: 'MERGE_HEAD exists in /w/.git' });
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toContain('mid-operation');
    expect(r.findings[0].evidence).toContain('MERGE_HEAD');
  });

  it('never a worktree with a rebase stopped in it', () => {
    const r = classify({ ...clean, midOperation: 'rebase', midOperationEvidence: 'rebase-merge exists in /w/.git' });
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toContain('mid-operation');
  });

  it('POSITIVE CONTROL — a clean worktree produces no mid-operation finding', () => {
    // Constraint: a guard that fires on everything is not a guard. If this
    // starts failing, the detector has stopped discriminating and every
    // negative control above became meaningless at the same moment.
    expect(reasons(classify(clean))).not.toContain('mid-operation');
    expect(reasons(classify({ ...clean, dirty: true, dirtyCount: 2 }))).not.toContain('mid-operation');
    expect(reasons(classify({ ...clean, ahead: 3 }))).not.toContain('mid-operation');
  });

  it('reports the stopped operation ABOVE the dirty files it caused', () => {
    // A mid-merge conflict is dirty AND stopped, and the order decides which
    // command the reader reaches for. Leading with "uncommitted" sends them to
    // `git stash`; the answer is `git merge --abort` or finishing the merge.
    const r = classify({ ...clean, midOperation: 'merge', midOperationEvidence: 'MERGE_HEAD', dirty: true, dirtyCount: 17 });
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toEqual(['mid-operation', 'uncommitted']);
  });

  it('reports EVERY applicable reason, not just the first', () => {
    const r = classify({ ...clean, dirty: true, dirtyCount: 9, ahead: 4, mergedBy: null });
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toEqual(expect.arrayContaining(['uncommitted', 'unpushed', 'not-merged']));
  });
});

describe('classify — ambiguity is its own verdict and never collapses into remove', () => {
  it('a squash merge with no gh is unverifiable, NOT not-merged', () => {
    // The distinction the whole squash-merge case rests on. Reporting
    // `not-merged` here would be a false refusal; reporting `remove` would be
    // a guess. Neither is acceptable, so there is a third verdict.
    const r = classify({ ...clean, mergedBy: null, ghAvailable: false, ghError: 'gh not on PATH' });
    expect(r.verdict).toBe(UNVERIFIABLE);
    expect(reasons(r)).toContain('merge-unmeasurable');
    expect(r.verdict).not.toBe(REMOVE);
  });

  it('a branch re-checked-out by a sibling process is unverifiable', () => {
    const r = classify({ ...clean, recordedBranch: 'feat/x', liveBranch: 'feat/y' });
    expect(r.verdict).toBe(UNVERIFIABLE);
    expect(reasons(r)).toEqual(['branch-changed-under-us']);
  });

  it('commits added AFTER the PR merged are unverifiable', () => {
    const r = classify({ ...clean, tipDate: '2026-07-02T00:00:00Z', tipAfterMerge: true });
    expect(r.verdict).toBe(UNVERIFIABLE);
    expect(reasons(r)).toContain('commits-after-merge');
  });

  it('a detached HEAD has no branch whose merge state can be read', () => {
    const r = classify({ ...clean, detached: true, recordedBranch: null, liveBranch: null });
    expect(r.verdict).toBe(UNVERIFIABLE);
    expect(reasons(r)).toContain('detached-head');
  });

  it('an unreadable status is unverifiable — never assumed clean', () => {
    const r = classify({ ...clean, statusFailed: true, statusError: 'index.lock exists' });
    expect(r.verdict).toBe(UNVERIFIABLE);
    expect(reasons(r)).toContain('status-unreadable');
  });

  it('an unreadable git dir is unverifiable — six absent probes are not "nothing in progress"', () => {
    // Without this, a git dir that cannot be resolved makes every MERGE_HEAD /
    // rebase-merge probe return "absent", and absent-because-unknown reads
    // exactly like absent-because-clean. That is the answer that authorises
    // deletion, so it must not be reachable by failure.
    const r = classify({ ...clean, midOperationUnmeasurable: true, midOperationError: 'not a git repository' });
    expect(r.verdict).toBe(UNVERIFIABLE);
    expect(reasons(r)).toContain('mid-operation-unmeasurable');
    expect(r.verdict).not.toBe(REMOVE);
  });

  it('a stopped operation OUTRANKS an unreadable status — refuse beats unverifiable', () => {
    const r = classify({
      ...clean, midOperation: 'rebase', midOperationEvidence: 'rebase-merge',
      statusFailed: true, statusError: 'index.lock exists',
    });
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toEqual(['mid-operation', 'status-unreadable']);
  });

  it('a missing gitdir is unverifiable, and prune is left to the user', () => {
    const r = classify({ ...clean, missing: true });
    expect(r.verdict).toBe(UNVERIFIABLE);
    expect(r.findings[0].evidence).toContain('prune');
  });

  it('no upstream is unverifiable unless the commits are literally in the base', () => {
    expect(classify({ ...clean, hasUpstream: false, upstream: null, ahead: null }).verdict)
      .toBe(UNVERIFIABLE);
    // ...but an ancestor of the base IS on the remote, by definition.
    expect(classify({ ...clean, hasUpstream: false, upstream: null, ahead: null, mergedBy: 'ancestor' }).verdict)
      .toBe(REMOVE);
  });
});

describe('assertRemovableNodeModules — the guard that must be able to refuse', () => {
  const worktrees = ['/repo', '/repo/.claude/worktrees/a'];

  it('accepts a node_modules inside a known worktree', () => {
    expect(assertRemovableNodeModules('/repo/.claude/worktrees/a/node_modules', worktrees)).toBe(true);
  });

  it('refuses a path that is not named node_modules', () => {
    expect(() => assertRemovableNodeModules('/repo/src', worktrees)).toThrow(/not a node_modules/);
  });

  it('refuses a node_modules outside every known worktree', () => {
    expect(() => assertRemovableNodeModules('/elsewhere/node_modules', worktrees))
      .toThrow(/outside every known worktree/);
  });

  it('refuses a prefix collision — /repo-other is not inside /repo', () => {
    expect(() => assertRemovableNodeModules('/repo-other/node_modules', worktrees))
      .toThrow(/outside every known worktree/);
  });
});

describe('parseWorktreeList', () => {
  const porcelain = [
    'worktree /repo',
    'HEAD aaa',
    'branch refs/heads/develop',
    '',
    'worktree /repo/.claude/worktrees/a',
    'HEAD bbb',
    'branch refs/heads/feat/x',
    'locked agent holds this',
    '',
    'worktree /repo/.claude/worktrees/b',
    'HEAD ccc',
    'detached',
    'prunable gitdir file points to non-existent location',
    '',
  ].join('\n');

  it('marks the FIRST record as the main checkout — the only thing identifying it', () => {
    const e = parseWorktreeList(porcelain);
    expect(e[0].isMain).toBe(true);
    expect(e.slice(1).every((x) => x.isMain === false)).toBe(true);
  });

  it('strips refs/heads/ and keeps a branch name with a slash intact', () => {
    expect(parseWorktreeList(porcelain)[1].branch).toBe('feat/x');
  });

  it('captures lock reason, detached and prunable', () => {
    const e = parseWorktreeList(porcelain);
    expect(e[1].locked).toBe(true);
    expect(e[1].lockReason).toBe('agent holds this');
    expect(e[2].detached).toBe(true);
    expect(e[2].branch).toBeNull();
    expect(e[2].prunable).toBe(true);
  });
});

describe('parseArgs — deleting is opt-in and so is worktree removal', () => {
  it('defaults to a dry run over node_modules only', () => {
    const o = parseArgs([]);
    expect(o.apply).toBe(false);
    expect(o.worktrees).toBe(false);
    expect(o.nodeModules).toBe(true);
    expect(o.force).toBe(false);
  });

  it('needs --apply to delete and --worktrees to consider removal', () => {
    const o = parseArgs(['--worktrees', '--apply']);
    expect(o.apply).toBe(true);
    expect(o.worktrees).toBe(true);
  });

  it('rejects an unknown flag instead of ignoring it', () => {
    expect(() => parseArgs(['--aply'])).toThrow(/unknown flag/);
  });
});

describe('humanBytes', () => {
  it('formats without lying about zero', () => {
    expect(humanBytes(0)).toBe('0 B');
    expect(humanBytes(NaN)).toBe('0 B');
    expect(humanBytes(1024)).toBe('1.0 KB');
    expect(humanBytes(1.6 * 1024 ** 3)).toBe('1.6 GB');
  });
});

/* ------------------------------------------------------------------ */
/* Integration — real repositories                                     */
/* ------------------------------------------------------------------ */

let root: string;

const g = (args: string[], cwd: string) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function commit(repo: string, name: string, body = 'x') {
  writeFileSync(path.join(repo, name), body);
  g(['add', name], repo);
  g(['commit', '-m', `add ${name}`], repo);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'wtclean-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/**
 * A repo with a real `origin`, a `develop` base, and three linked worktrees:
 * one merged+clean, one dirty, one with an unpushed commit.
 */
function scenario() {
  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'repo');
  g(['init', '--bare', '-b', 'develop', remote], root);
  g(['init', '-b', 'develop', repo], root);
  g(['config', 'user.email', 't@example.com'], repo);
  g(['config', 'user.name', 'T'], repo);
  commit(repo, 'README.md');
  g(['remote', 'add', 'origin', remote], repo);
  g(['push', '-u', 'origin', 'develop'], repo);

  // merged: branched, committed, merged back into develop, pushed.
  g(['checkout', '-b', 'feat/merged'], repo);
  commit(repo, 'merged.txt');
  g(['push', '-u', 'origin', 'feat/merged'], repo);
  g(['checkout', 'develop'], repo);
  g(['merge', '--no-ff', '-m', 'merge feat/merged', 'feat/merged'], repo);
  g(['push', 'origin', 'develop'], repo);

  // dirty: merged the same way, but its worktree has an uncommitted file.
  g(['checkout', '-b', 'feat/dirty'], repo);
  commit(repo, 'dirty.txt');
  g(['push', '-u', 'origin', 'feat/dirty'], repo);
  g(['checkout', 'develop'], repo);
  g(['merge', '--no-ff', '-m', 'merge feat/dirty', 'feat/dirty'], repo);
  g(['push', 'origin', 'develop'], repo);

  // unpushed: pushed once, then given a local-only commit.
  g(['checkout', '-b', 'feat/unpushed'], repo);
  commit(repo, 'unpushed.txt');
  g(['push', '-u', 'origin', 'feat/unpushed'], repo);
  g(['checkout', 'develop'], repo);
  g(['merge', '--no-ff', '-m', 'merge feat/unpushed', 'feat/unpushed'], repo);
  g(['push', 'origin', 'develop'], repo);

  const wt = (name: string, branch: string) => {
    const p = path.join(root, 'wt', name);
    g(['worktree', 'add', p, branch], repo);
    return p;
  };
  const merged = wt('merged', 'feat/merged');
  const dirty = wt('dirty', 'feat/dirty');
  const unpushed = wt('unpushed', 'feat/unpushed');

  writeFileSync(path.join(dirty, 'scratch.txt'), 'work with no other copy');
  g(['config', 'user.email', 't@example.com'], unpushed);
  g(['config', 'user.name', 'T'], unpushed);
  commit(unpushed, 'later.txt');

  g(['fetch', 'origin', '--prune'], repo);
  return { repo, merged, dirty, unpushed };
}

/**
 * A repo whose worktree can be stopped mid-merge with a COMPLETELY CLEAN
 * `git status --porcelain`, plus a branch that conflicts with it on demand.
 *
 * The trick is that `feat/a` and `feat/b` add the SAME file with the SAME
 * content, so merging one into the other auto-merges with no conflict and
 * produces a tree byte-identical to HEAD's. `--no-commit` then leaves
 * `MERGE_HEAD` behind with nothing whatsoever in the file list.
 *
 * The two commits carry DIFFERENT MESSAGES on purpose. With identical content,
 * author, parent and message they hash to the SAME commit whenever both land
 * inside one second — and then `feat/b` IS `feat/a`, the merge reports "already
 * up to date", and the fixture silently stops testing anything. That is not
 * hypothetical: it is what this fixture did on its first run, passing one test
 * and failing three, entirely according to which side of a second boundary the
 * two commits fell on.
 *
 * `feat/c` writes the same path with different content and exists only to make
 * a rebase or a cherry-pick genuinely conflict.
 *
 * `feat/a` and `feat/b` are merged into `develop` and pushed, so every OTHER
 * check the classifier makes says "remove". Measured against the code before
 * the `mid-operation` guard existed: verdict `remove`, findings `[]`, and
 * `git worktree remove` then took the directory with exit 0 and no output.
 */
function midOperationScenario() {
  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'repo');
  g(['init', '--bare', '-b', 'develop', remote], root);
  g(['init', '-b', 'develop', repo], root);
  g(['config', 'user.email', 't@example.com'], repo);
  g(['config', 'user.name', 'T'], repo);
  commit(repo, 'README.md');
  g(['remote', 'add', 'origin', remote], repo);
  g(['push', '-u', 'origin', 'develop'], repo);

  const branchAdding = (branch: string, body: string, message: string) => {
    g(['checkout', 'develop'], repo);
    g(['checkout', '-b', branch], repo);
    writeFileSync(path.join(repo, 'shared.txt'), body);
    g(['add', 'shared.txt'], repo);
    g(['commit', '-m', message], repo);
  };

  branchAdding('feat/a', 'identical on a and b', 'side a adds shared.txt');
  g(['push', '-u', 'origin', 'feat/a'], repo);
  branchAdding('feat/b', 'identical on a and b', 'side b adds the very same file');
  g(['push', '-u', 'origin', 'feat/b'], repo);
  branchAdding('feat/c', 'DIFFERENT — this one conflicts', 'side c writes other content');

  g(['checkout', 'develop'], repo);
  g(['merge', '--no-ff', '-m', 'merge feat/a', 'feat/a'], repo);
  g(['merge', '--no-ff', '-m', 'merge feat/b', 'feat/b'], repo);
  g(['push', 'origin', 'develop'], repo);

  // The fixture asserts its own premise. If these ever collapse to one commit
  // again, every test built on it starts passing for the wrong reason.
  const sha = (ref: string) => g(['rev-parse', ref], repo).trim();
  expect(sha('feat/a')).not.toBe(sha('feat/b'));

  const wt = path.join(root, 'wt', 'stopped');
  g(['worktree', 'add', wt, 'feat/a'], repo);
  g(['config', 'user.email', 't@example.com'], wt);
  g(['config', 'user.name', 'T'], wt);
  g(['fetch', 'origin', '--prune'], repo);
  return { repo, wt };
}

const factsFor = (repo: string, target: string) => {
  const entries = parseWorktreeList(g(['worktree', 'list', '--porcelain'], repo));
  const e = entries.find((x: { path: string }) => path.resolve(x.path) === path.resolve(target))!;
  return measure(repo, e, ['develop'], noGh);
};

/** gh is never available in the suite, so PR evidence is always absent here. */
const noGh = { available: false, error: 'gh disabled in tests', byHead: new Map() };

describe('integration — against real git repositories', () => {
  it('resolves develop as a base without an origin/HEAD symbolic ref', () => {
    const { repo } = scenario();
    const { bases } = resolveBases(repo, null);
    expect(bases).toContain('develop');
  });

  it('REMOVES the merged, clean, pushed worktree', () => {
    const { repo, merged } = scenario();
    const entries = parseWorktreeList(g(['worktree', 'list', '--porcelain'], repo));
    const e = entries.find((x) => path.resolve(x.path) === path.resolve(merged))!;
    const r = classify(measure(repo, e, ['develop'], noGh));
    expect(r.verdict).toBe(REMOVE);
  });

  it('REFUSES the worktree with an uncommitted file, by name', () => {
    const { repo, dirty } = scenario();
    const entries = parseWorktreeList(g(['worktree', 'list', '--porcelain'], repo));
    const e = entries.find((x) => path.resolve(x.path) === path.resolve(dirty))!;
    const r = classify(measure(repo, e, ['develop'], noGh));
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toContain('uncommitted');
  });

  it('REFUSES the worktree whose branch is ahead of its remote', () => {
    const { repo, unpushed } = scenario();
    const entries = parseWorktreeList(g(['worktree', 'list', '--porcelain'], repo));
    const e = entries.find((x) => path.resolve(x.path) === path.resolve(unpushed))!;
    const facts = measure(repo, e, ['develop'], noGh);
    expect(facts.ahead).toBe(1);
    const r = classify(facts);
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toContain('unpushed');
  });

  it('REFUSES the main checkout even when it is clean and on the base', () => {
    const { repo } = scenario();
    const entries = parseWorktreeList(g(['worktree', 'list', '--porcelain'], repo));
    const r = classify(measure(repo, entries[0], ['develop'], noGh));
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toContain('main-checkout');
  });

  it('REFUSES a locked worktree that would otherwise be removed', () => {
    const { repo, merged } = scenario();
    g(['worktree', 'lock', '--reason', 'claimed by an agent', merged], repo);
    const entries = parseWorktreeList(g(['worktree', 'list', '--porcelain'], repo));
    const e = entries.find((x) => path.resolve(x.path) === path.resolve(merged))!;
    expect(e.locked).toBe(true);
    expect(classify(measure(repo, e, ['develop'], noGh)).verdict).toBe(REFUSE);
  });

  it('detects a sibling re-checkout as ambiguous rather than resolving it', () => {
    const { repo, merged } = scenario();
    const entries = parseWorktreeList(g(['worktree', 'list', '--porcelain'], repo));
    const e = entries.find((x) => path.resolve(x.path) === path.resolve(merged))!;
    g(['checkout', '-b', 'someone-elses-branch'], merged); // the sibling process
    const r = classify(measure(repo, e, ['develop'], noGh));
    expect(r.verdict).toBe(UNVERIFIABLE);
    expect(reasons(r)).toContain('branch-changed-under-us');
  });

  it('finds node_modules per worktree without charging one for another', () => {
    const { repo, merged, dirty } = scenario();
    for (const w of [merged, dirty]) mkdirSync(path.join(w, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(path.join(merged, 'node_modules', 'pkg', 'node_modules'), { recursive: true });
    const all = parseWorktreeList(g(['worktree', 'list', '--porcelain'], repo)).map((x) => x.path);

    const found = findNodeModules(merged, all);
    expect(found).toEqual([path.join(merged, 'node_modules')]); // NOT the nested copy
    expect(findNodeModules(dirty, all)).toHaveLength(1);
  });

  it('does not attribute a linked worktree\'s node_modules to the main checkout', () => {
    const { repo } = scenario();
    const inner = path.join(repo, '.claude', 'worktrees', 'inner');
    g(['worktree', 'add', inner, '-b', 'inner-branch'], repo);
    mkdirSync(path.join(inner, 'node_modules'), { recursive: true });
    const all = parseWorktreeList(g(['worktree', 'list', '--porcelain'], repo)).map((x) => x.path);
    expect(findNodeModules(repo, all)).toEqual([]);
  });

  it('REFUSES a worktree stopped mid-merge whose status is COMPLETELY CLEAN', () => {
    // The case that motivated the guard, end to end against real git. Remove
    // the `mid-operation` predicate from classify() and this returns `remove`
    // with an empty findings list.
    const { repo, wt } = midOperationScenario();
    g(['merge', '--no-commit', '--no-ff', 'feat/b'], wt);

    expect(g(['status', '--porcelain'], wt).trim()).toBe(''); // the whole point
    expect(existsSync(path.join(g(['rev-parse', '--absolute-git-dir'], wt).trim(), 'MERGE_HEAD'))).toBe(true);

    const facts = factsFor(repo, wt);
    expect(facts.dirty).toBe(false);
    expect(facts.midOperation).toBe('merge');
    const r = classify(facts);
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toContain('mid-operation');
  });

  it('POSITIVE CONTROL — the same worktree, merge aborted, goes back to REMOVE', () => {
    // Constraint 4's other half. Without this, a detector hard-wired to
    // "always stopped" would pass every test above and refuse the entire
    // estate, and nothing in the suite would notice.
    const { repo, wt } = midOperationScenario();
    g(['merge', '--no-commit', '--no-ff', 'feat/b'], wt);
    expect(classify(factsFor(repo, wt)).verdict).toBe(REFUSE);

    g(['merge', '--abort'], wt);
    const after = factsFor(repo, wt);
    expect(after.midOperation).toBeNull();
    expect(classify(after).verdict).toBe(REMOVE);
  });

  it('REFUSES a worktree stopped mid-rebase, and NAMES the rebase', () => {
    // A stopped rebase is also dirty and detached, so the worktree would be
    // kept either way — with the WRONG reason. "2 uncommitted changes" sends
    // the reader to `git stash` and "detached HEAD" tells them nothing; the
    // answer is `git rebase --abort` or `--continue`. This asserts the reason,
    // which is the part that fails when the guard is removed.
    const { repo, wt } = midOperationScenario();
    let rebaseFailed = false;
    try { g(['rebase', 'feat/c'], wt); } catch { rebaseFailed = true; }
    expect(rebaseFailed).toBe(true); // the rebase must actually have stopped

    const facts = factsFor(repo, wt);
    expect(facts.midOperation).toBe('rebase');
    const r = classify(facts);
    expect(r.verdict).toBe(REFUSE);
    expect(reasons(r)).toContain('mid-operation');
  });

  it('REFUSES a worktree stopped mid-cherry-pick', () => {
    const { repo, wt } = midOperationScenario();
    let pickFailed = false;
    try { g(['cherry-pick', 'feat/c'], wt); } catch { pickFailed = true; }
    expect(pickFailed).toBe(true);

    const facts = factsFor(repo, wt);
    expect(facts.midOperation).toBe('cherry-pick');
    expect(classify(facts).verdict).toBe(REFUSE);
  });

  it('detectStoppedOperation reports nothing for an ordinary worktree, and unmeasurable off-repo', () => {
    // Three variants, three DIFFERENT answers. Uniform results across variants
    // would mean the detector is broken rather than that the variants agree.
    const { wt } = midOperationScenario();
    expect(detectStoppedOperation(wt)).toEqual({ op: null });

    g(['merge', '--no-commit', '--no-ff', 'feat/b'], wt);
    expect(detectStoppedOperation(wt).op).toBe('merge');

    const outside = path.join(root, 'not-a-repo');
    mkdirSync(outside, { recursive: true });
    const off = detectStoppedOperation(outside);
    expect(off.unmeasurable).toBe(true);
    expect(off.op).toBeUndefined();
    expect(off.error).toBeTruthy(); // stderr survives; it is not swallowed
  });

  it('git worktree remove leaves the BRANCH alone', () => {
    // The conservative half of the removal: the directory goes, the ref stays,
    // so even a wrong removal is recoverable with `git worktree add`.
    const { repo, merged } = scenario();
    g(['worktree', 'remove', merged], repo);
    expect(existsSync(merged)).toBe(false);
    expect(g(['rev-parse', '--verify', 'feat/merged'], repo).trim()).toMatch(/^[0-9a-f]{40}$/);
  });
});
