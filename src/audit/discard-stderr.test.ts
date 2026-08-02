/**
 * Tests for `scripts/check-discard-stderr.mjs`.
 *
 * The suite is built around the two distinctions the checker must not get
 * wrong, because getting either wrong turns it into a guard that gets
 * bypassed — and a bypassed guard carries no information at all.
 *
 *   ORDER      `2>&1 >/dev/null` duplicates stderr to the ORIGINAL stdout
 *              before stdout is retargeted, so diagnostics survive. The
 *              reverse spelling discards both. Identical token sets.
 *
 *   MENTION    A rule that says "never write X" has to be able to write X.
 *              In markdown only FENCED blocks are commands; inline backticks
 *              are prose. Both failures were observed for real while building
 *              this: a sibling guard blocked the command COUNTING the
 *              violations, and a PR body that merely quoted a redirect.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scan } from '../../scripts/check-discard-stderr.mjs';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'discard-'));
  mkdirSync(path.join(dir, 'commands'), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Write a markdown file whose body is a single fenced command block. */
function fenced(name: string, command: string): string {
  const p = path.join(dir, 'commands', name);
  writeFileSync(p, `# doc\n\nSome prose.\n\n\`\`\`bash\n${command}\n\`\`\`\n`);
  return p;
}

/** Write a markdown file that only MENTIONS the shape, in inline backticks. */
function prose(name: string, mention: string): string {
  const p = path.join(dir, 'commands', name);
  writeFileSync(p, `# doc\n\nNever append \`${mention}\`. It hides failures.\n`);
  return p;
}

describe('refuses every discarding form', () => {
  it('flags stderr-only discard', () => {
    const f = fenced('a.md', 'gh pr list 2>/dev/null');
    expect(scan([f])).toHaveLength(1);
    expect(scan([f])[0].why).toMatch(/stderr discarded/);
  });

  it('flags the ampersand form', () => {
    expect(scan([fenced('b.md', 'gh pr list &>/dev/null')])).toHaveLength(1);
  });

  it('flags stdout-then-both, which is the WRONG order', () => {
    const f = fenced('c.md', 'command -v jq >/dev/null 2>&1');
    expect(scan([f])).toHaveLength(1);
    expect(scan([f])[0].why).toMatch(/wrong order/);
  });

  it('flags bare stdout discard, because it throws away the ANSWER', () => {
    const f = fenced('d.md', 'grep -c pattern file >/dev/null');
    expect(scan([f])).toHaveLength(1);
    expect(scan([f])[0].why).toMatch(/ANSWER/);
  });
});

describe('ORDER is the whole distinction', () => {
  it('ALLOWS the reverse order, where stderr survives', () => {
    expect(scan([fenced('e.md', 'git merge-tree a b 2>&1 >/dev/null')])).toHaveLength(0);
  });

  it('allows the existence probe in its correct spelling', () => {
    expect(scan([fenced('f.md', 'command -v jq 2>&1 >/dev/null')])).toHaveLength(0);
  });

  it('separates the two spellings that share a token set', () => {
    // The single assertion this whole file exists for. Same tokens, opposite
    // verdicts — if these ever agree, the checker is matching text and not
    // semantics.
    const good = scan([fenced('g.md', 'cmd 2>&1 >/dev/null')]);
    const bad = scan([fenced('h.md', 'cmd >/dev/null 2>&1')]);
    expect(good).toHaveLength(0);
    expect(bad).toHaveLength(1);
  });
});

describe('MENTION is not execution', () => {
  it('does not flag a rule stating what not to write', () => {
    expect(scan([prose('i.md', '2>/dev/null')])).toHaveLength(0);
  });

  it('does not flag the fence markers themselves', () => {
    const p = path.join(dir, 'commands', 'j.md');
    writeFileSync(p, '# doc\n\n```bash\necho ok\n```\n');
    expect(scan([p])).toHaveLength(0);
  });

  it('treats EVERY line of a shell script as a command, comments included', () => {
    // No prose/code split outside markdown: a comment demonstrating the bad
    // form is still the line a reader copies.
    const p = path.join(dir, 'commands', 'k.sh');
    writeFileSync(p, '#!/bin/sh\n# example: foo 2>/dev/null\n');
    expect(scan([p])).toHaveLength(1);
  });
});

describe('unreadable is unverifiable, never clean', () => {
  it('reports a missing file as a finding rather than passing it', () => {
    const found = scan([path.join(dir, 'commands', 'does-not-exist.md')]);
    expect(found).toHaveLength(1);
    expect(found[0].why).toMatch(/could not read/);
  });
});

describe('the real tree', () => {
  it('finds nothing in the shipped instructing surface', () => {
    // The positive control for the sweep itself. If this ever goes red, a
    // command started teaching the shape again.
    // execFileSync, not execSync: no shell, so the argument array is passed
    // straight to node and no metacharacter can be interpreted.
    const out = execFileSync('node', ['scripts/check-discard-stderr.mjs'], { encoding: 'utf8' });
    expect(out).toMatch(/gate\s+commands skills agents -> 0 finding/);
  });
});
