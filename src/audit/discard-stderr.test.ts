/**
 * Tests for `scripts/check-discard-stderr.mjs`.
 *
 * The checker applies the SHARED `discard-stderr` rule from
 * `hooks/rules/rules.yaml` (via its generated `rules.json`) to FILES rather
 * than to a single command string. So the suite covers two different things,
 * and keeping them apart is the point:
 *
 *   SHARED     the pattern itself. Not owned here, and the tests assert that
 *              it is not owned here — a second copy would drift, and it would
 *              drift silently, which is the exact defect the checker exists to
 *              catch.
 *
 *   OWNED      which lines of a document are commands. The rule cannot answer
 *              that: a hook receives one command, this receives a file.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { commandLines, loadRule, posixToJs, scan } from '../../scripts/check-discard-stderr.mjs';

const rule = loadRule();
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'discard-'));
  mkdirSync(path.join(dir, 'commands'), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A markdown file whose body is a single fenced command block. */
function fenced(name: string, command: string): string {
  const p = path.join(dir, 'commands', name);
  writeFileSync(p, `# doc\n\nSome prose.\n\n\`\`\`bash\n${command}\n\`\`\`\n`);
  return p;
}

describe('the pattern is NOT owned here', () => {
  it('loads the rule from the shared rules.json', () => {
    expect(rule.source).toBe('hooks/rules/rules.json#discard-stderr');
    expect(rule.refuse).toBeInstanceOf(RegExp);
  });

  it('uses the SAME expression the hook uses, modulo the POSIX translation', () => {
    // The one assertion that makes drift impossible. If someone tightens the
    // rule, this checker tightens with it; if someone reintroduces a private
    // copy here, this fails.
    const raw = JSON.parse(
      execFileSync('cat', ['hooks/rules/rules.json'], { encoding: 'utf8' }),
    );
    const rules = Array.isArray(raw) ? raw : raw.rules;
    const shared = rules.find((r: { id: string }) => r.id === 'discard-stderr');
    const pattern = shared.match.find((m: { pattern?: string }) => m.pattern).pattern;
    expect(rule.refuse.source).toBe(new RegExp(posixToJs(pattern)).source);
  });

  it('translates the only POSIX class the rule uses, and nothing else', () => {
    expect(posixToJs('a[[:space:]]b')).toBe('a\\sb');
    expect(posixToJs('a\\s+b')).toBe('a\\s+b');
  });

  it('THROWS when the rule is missing rather than falling back to a private copy', () => {
    // A checker that substituted its own pattern would report PASS while
    // checking something nobody approved.
    expect(() => loadRule(dir)).toThrow();
  });
});

describe('ORDER is the whole distinction', () => {
  it('refuses stderr-only discard', () => {
    expect(scan([fenced('a.md', 'gh pr list 2>/dev/null')], rule)).toHaveLength(1);
  });

  it('refuses the ampersand form', () => {
    expect(scan([fenced('b.md', 'gh pr list &>/dev/null')], rule)).toHaveLength(1);
  });

  it('refuses stdout-then-both, which is the WRONG order', () => {
    expect(scan([fenced('c.md', 'command -v jq >/dev/null 2>&1')], rule)).toHaveLength(1);
  });

  it('ALLOWS the reverse order, where stderr survives', () => {
    expect(scan([fenced('d.md', 'git merge-tree a b 2>&1 >/dev/null')], rule)).toHaveLength(0);
  });

  it('separates the two spellings that share a token set', () => {
    // Same tokens, opposite verdicts. If these ever agree, the rule is matching
    // text and not semantics.
    expect(scan([fenced('e.md', 'cmd 2>&1 >/dev/null')], rule)).toHaveLength(0);
    expect(scan([fenced('f.md', 'cmd >/dev/null 2>&1')], rule)).toHaveLength(1);
  });

  it('documents that bare stdout discard is NOT in this toolkit rule', () => {
    // A consuming repo may refuse `cmd >/dev/null` locally; this rule does not.
    // The divergence is asserted rather than papered over, so adopting it becomes
    // a deliberate edit to rules.yaml (which changes the hook too) instead of a
    // silent difference between the two consumers.
    expect(scan([fenced('g.md', 'grep -c x f >/dev/null')], rule)).toHaveLength(0);
  });
});

describe('which lines are commands — the part this file DOES own', () => {
  it('reads only fenced blocks in markdown, so prose can state the rule', () => {
    const p = path.join(dir, 'commands', 'h.md');
    writeFileSync(p, '# doc\n\nNever append `2>/dev/null`. It hides failures.\n');
    expect(scan([p], rule)).toHaveLength(0);
  });

  it('does not treat the fence markers themselves as commands', () => {
    const p = path.join(dir, 'commands', 'i.md');
    writeFileSync(p, '# doc\n\n```bash\necho ok\n```\n');
    expect(scan([p], rule)).toHaveLength(0);
  });

  it('treats EVERY line of a shell file as a command, comments included', () => {
    const p = path.join(dir, 'commands', 'j.sh');
    writeFileSync(p, '#!/bin/sh\n# example: foo 2>/dev/null\n');
    expect(scan([p], rule)).toHaveLength(1);
  });

  it('reports line numbers against the original document, not the block', () => {
    const p = fenced('k.md', 'cmd 2>/dev/null');
    // "# doc"(1) ""(2) "Some prose."(3) ""(4) fence(5) command(6)
    expect(scan([p], rule)[0].line).toBe(6);
  });

  it('closes an unterminated fence rather than scanning the rest as prose', () => {
    const p = path.join(dir, 'commands', 'l.md');
    writeFileSync(p, '# doc\n\n```bash\ncmd 2>/dev/null\n');
    expect(commandLines(p, '# doc\n\n```bash\ncmd 2>/dev/null\n')).toHaveLength(2);
  });
});

describe('unreadable is unverifiable, never clean', () => {
  it('reports a missing file as a finding rather than passing it', () => {
    const found = scan([path.join(dir, 'commands', 'nope.md')], rule);
    expect(found).toHaveLength(1);
    expect(found[0].why).toMatch(/could not read/);
  });
});

describe('the real tree', () => {
  it('finds nothing in the shipped instructing surface', () => {
    // The positive control for the sweep. If this goes red, a command started
    // teaching the shape again.
    const out = execFileSync('node', ['scripts/check-discard-stderr.mjs'], { encoding: 'utf8' });
    expect(out).toMatch(/gate\s+commands skills agents -> 0 finding/);
  });
});
