#!/usr/bin/env node
/**
 * Refuse a discarded stream in the toolkit's INSTRUCTING surface.
 *
 *   node scripts/check-discard-stderr.mjs            # gate + ratchet report
 *   node scripts/check-discard-stderr.mjs --all      # include the ratchet dirs
 *
 * ## Why this exists
 *
 * The toolkit already ships a `discard-stderr` hook that refuses a command an
 * agent RUNS. It has no reach at all over the same shape written into a command
 * or a skill — and those files exist to be copied and executed. So the toolkit
 * was blocking what its own commands taught: 34 sites across `commands/`,
 * `skills/` and `agents/` instructed the reader to write the exact redirect the
 * hook refuses.
 *
 * A discarded stream makes a FAILING command indistinguishable from a
 * SUCCEEDING one that printed nothing, and the empty result then reads as
 * "none found" rather than "it errored".
 *
 * ## Mention is not execution, and this check must not confuse them
 *
 * That distinction is the hard part, and getting it wrong is not hypothetical:
 * building this, a sibling guard blocked the command that was *counting the
 * violations* and, separately, a PR body that merely QUOTED a redirect while
 * explaining why its order is the safe one. A guard that refuses ordinary work
 * gets bypassed, and a bypassed guard carries no information at all.
 *
 * So in markdown, only FENCED CODE BLOCKS are read as commands. Inline
 * backticks are prose — that is where a rule states what not to write, and
 * stating the rule must never trip the rule.
 *
 * ## Order is the whole distinction
 *
 * Two identical token sets, opposite outcomes:
 *
 *   cmd >/dev/null 2>&1   stdout is retargeted FIRST, then stderr is pointed at
 *                         the same place. Both are gone.  REFUSED.
 *   cmd 2>&1 >/dev/null   stderr is duplicated to the ORIGINAL stdout first,
 *                         then stdout moves. Diagnostics survive.  ALLOWED.
 *
 * Bare `cmd >/dev/null` is refused too. Its stderr does survive, and that is
 * not the whole harm: it throws away the ANSWER along with the noise, so
 * `grep -c x f >/dev/null` cannot tell "zero matches" from "many". If only the
 * exit code is wanted, `out=$(cmd)` costs one variable.
 *
 * ## Scope, and why it is split
 *
 * GATE (must be zero)   commands/ skills/ agents/ — the instructing surface.
 * RATCHET (reported)    hooks/ scripts/ — real shell, ~126 sites. A gate that
 *                       reds the repo it guards is one that gets deleted, so
 *                       this half is counted and not enforced yet.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** Directories whose files must contain ZERO discards. */
const GATE_DIRS = ['commands', 'skills', 'agents'];
/** Real shell, counted but not enforced. See the header. */
const RATCHET_DIRS = ['hooks', 'scripts'];

const NULL_SINK = String.raw`/dev/null`;

/**
 * The allowed form, checked FIRST so it can claim a line before any refusal
 * pattern sees it. `2>&1` must come BEFORE the stdout redirect.
 */
const ALLOWED = new RegExp(String.raw`2>&1\s+>\s*${NULL_SINK}`);

const REFUSED = [
  { re: new RegExp(String.raw`2>\s*${NULL_SINK}`), why: 'stderr discarded' },
  { re: new RegExp(String.raw`&>\s*${NULL_SINK}`), why: 'both streams discarded' },
  {
    re: new RegExp(String.raw`>\s*${NULL_SINK}\s+2>&1`),
    why: 'both discarded (wrong order: stdout moves before stderr is duplicated)',
  },
  {
    re: new RegExp(String.raw`(^|[^&12])>\s*${NULL_SINK}`),
    why: 'stdout discarded, so the ANSWER is thrown away with the noise',
  },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // a scope dir that does not exist is not a violation
  }
  for (const e of entries) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(md|sh|mjs|js|ts|yaml|yml|json)$/.test(e)) out.push(p);
  }
  return out;
}

/**
 * Lines that are COMMANDS rather than prose.
 *
 * Markdown: only inside fenced blocks. Everything else is prose, and a rule
 * that says "never write X" has to be able to write X.
 *
 * Everything else: every line is code. A comment demonstrating the bad form in
 * a shell script is still the thing a reader copies.
 */
function commandLines(file, text) {
  const lines = text.split('\n');
  if (!file.endsWith('.md')) return lines.map((l, i) => [i + 1, l]);

  const out = [];
  let fenced = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      fenced = !fenced;
      continue; // the fence itself is never a command
    }
    if (fenced) out.push([i + 1, lines[i]]);
  }
  return out;
}

export function scan(files) {
  const findings = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch (err) {
      // Unreadable is UNVERIFIABLE, never clean. Surface it as a finding so a
      // permissions problem cannot read as a passing scan.
      findings.push({ file, line: 0, why: `could not read: ${err.message}`, text: '' });
      continue;
    }
    for (const [line, content] of commandLines(file, text)) {
      if (ALLOWED.test(content)) continue;
      const hit = REFUSED.find((r) => r.re.test(content));
      if (hit) findings.push({ file, line, why: hit.why, text: content.trim().slice(0, 100) });
    }
  }
  return findings;
}

function main() {
  const all = process.argv.includes('--all');

  const gate = scan(GATE_DIRS.flatMap((d) => walk(d)));
  const ratchet = scan(RATCHET_DIRS.flatMap((d) => walk(d)));

  console.log(`discard-stderr check`);
  console.log(`  gate    ${GATE_DIRS.join(' ')} -> ${gate.length} finding(s)`);
  console.log(`  ratchet ${RATCHET_DIRS.join(' ')} -> ${ratchet.length} finding(s), not enforced`);

  for (const f of gate) console.log(`\n  ${f.file}:${f.line}  ${f.why}\n      ${f.text}`);
  if (all) for (const f of ratchet) console.log(`\n  [ratchet] ${f.file}:${f.line}  ${f.why}`);

  if (gate.length) {
    console.log(`\nFAIL — ${gate.length} discard(s) in the instructing surface.`);
    console.log(`These files are copied and executed, so the shape ships to every user.`);
    console.log(`\n  keep stderr:   cmd 2>>"\${MNM_LOG:-/tmp/make-no-mistakes.log}"`);
    console.log(`  stdout noisy:  cmd 2>&1 > ${NULL_SINK}     (this order ONLY)`);
    console.log(`  exit code:     out=$(cmd); rc=$?`);
    process.exit(1);
  }

  console.log(`\nPASS — the instructing surface discards nothing.`);
  if (ratchet.length) {
    console.log(`${ratchet.length} site(s) remain in ${RATCHET_DIRS.join('/')} — run with --all to list.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
