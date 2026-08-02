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

  it('git worktree remove leaves the BRANCH alone', () => {
    // The conservative half of the removal: the directory goes, the ref stays,
    // so even a wrong removal is recoverable with `git worktree add`.
    const { repo, merged } = scenario();
    g(['worktree', 'remove', merged], repo);
    expect(existsSync(merged)).toBe(false);
    expect(g(['rev-parse', '--verify', 'feat/merged'], repo).trim()).toMatch(/^[0-9a-f]{40}$/);
  });
});
