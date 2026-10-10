/**
 * Types for `scripts/worktree-cleanup.mjs`.
 *
 * The script itself stays plain ESM — it is invoked as `node scripts/...` by a
 * slash command and must run with no build step, on whatever Node the user has.
 * This file exists so the one place that IMPORTS it, the Vitest suite under
 * `src/`, is type-checked rather than silently `any`.
 *
 * That is not cosmetic here. Every test in that suite hand-builds a facts
 * object and breaks exactly ONE field; under `any` a renamed or misspelled
 * field is not an error, it is a fact the classifier never reads — so the test
 * goes on passing while asserting nothing about the guard it names. The
 * `WorktreeFacts` shape below is what makes that a compile error.
 *
 * Kept beside the `.mjs` rather than under `src/` so the two move together;
 * `tsconfig.json` includes only `src/**\/*.ts`, and TypeScript still loads this
 * because it resolves `./worktree-cleanup.mjs` to `./worktree-cleanup.d.mts`.
 */

export type Verdict = 'remove' | 'refuse' | 'unverifiable';

export const REMOVE: 'remove';
export const REFUSE: 'refuse';
export const UNVERIFIABLE: 'unverifiable';

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

/** One record of `git worktree list --porcelain`, plus its position. */
export interface WorktreeEntry {
  path: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  lockReason: string;
  prunable: boolean;
  prunableReason: string;
  /** True for the FIRST record only — the main checkout. */
  isMain: boolean;
}

/** Everything `classify()` reads. Nothing else may influence a verdict. */
export interface WorktreeFacts {
  isMain: boolean;
  bare: boolean;
  locked: boolean;
  lockReason: string;
  missing: boolean;
  prunableReason: string;
  detached: boolean;
  recordedBranch: string | null;
  liveBranch: string | null;
  /** A stopped merge/rebase/cherry-pick/revert/bisect, or null for none. */
  midOperation: string | null;
  midOperationEvidence: string;
  /** True when the git dir could not be resolved — NOT the same as "none". */
  midOperationUnmeasurable: boolean;
  midOperationError: string;
  dirty: boolean;
  dirtyCount: number;
  statusFailed: boolean;
  statusError: string;
  hasUpstream: boolean;
  upstream: string | null;
  /** null when it could not be counted. A count not taken is never zero. */
  ahead: number | null;
  base: string;
  mergedBy: 'ancestor' | 'cherry' | 'pr' | null;
  mergedBase: string | null;
  prNumber: number | null;
  mergedAt: string | null;
  tipDate: string | null;
  tipAfterMerge: boolean;
  ghAvailable: boolean;
  ghError: string;
}

export interface Finding {
  verdict: Verdict;
  /** Stable machine name: `uncommitted`, `mid-operation`, `unpushed`, ... */
  reason: string;
  /** Human-readable proof, quoting the command that produced it. */
  evidence: string;
}

export interface Classification {
  verdict: Verdict;
  findings: Finding[];
}

export interface PrRow {
  number: number;
  headRefName: string;
  state: string;
  mergedAt: string | null;
}

export interface PrIndex {
  available: boolean;
  error: string;
  byHead: Map<string, PrRow>;
  scanned?: number;
}

/** `{ op }` on success; `{ unmeasurable: true, error }` when unreadable. */
export interface StoppedOperation {
  op?: string | null;
  evidence?: string;
  unmeasurable?: boolean;
  error?: string;
}

export function run(cmd: string, args: string[], cwd?: string): RunResult;
export function parseWorktreeList(text: string): WorktreeEntry[];
export function classify(f: Partial<WorktreeFacts>): Classification;
export function resolveBases(
  repo: string,
  explicit?: string | null,
): { bases: string[]; how: string };
export function detectStoppedOperation(worktreePath: string): StoppedOperation;
export function measure(
  repo: string,
  entry: WorktreeEntry,
  bases: string[],
  prIndex: PrIndex,
): WorktreeFacts;
export function dirBytes(dir: string): { bytes: number; error: string };
export function humanBytes(n: number): string;
export function findNodeModules(
  root: string,
  excludedPaths?: string[],
  maxDepth?: number,
): string[];
export function assertRemovableNodeModules(
  target: string,
  worktreePaths: string[],
): true;
export function parseArgs(argv: string[]): {
  repo: string | null;
  base: string | null;
  nodeModules: boolean;
  worktrees: boolean;
  apply: boolean;
  force: boolean;
  fetch: boolean;
  gh: boolean;
  json: boolean;
  help: boolean;
};
export function main(argv: string[]): number;
