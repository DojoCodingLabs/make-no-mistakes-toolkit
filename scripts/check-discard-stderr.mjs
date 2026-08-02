#!/usr/bin/env node
/**
 * Refuse a discarded stream in the toolkit's INSTRUCTING surface.
 *
 *   node scripts/check-discard-stderr.mjs            # gate + ratchet report
 *   node scripts/check-discard-stderr.mjs --all      # list the ratchet dirs too
 *
 * ## Why this exists
 *
 * The toolkit already ships a `discard-stderr` rule that refuses a command an
 * agent RUNS. It has no reach at all over the same shape written INTO a command
 * or a skill — and those files exist to be copied and executed. So the toolkit
 * was blocking what its own commands taught: 34 sites across `commands/`,
 * `skills/` and `agents/` instructed the reader to write the exact redirect the
 * hook refuses.
 *
 * A discarded stream makes a FAILING command indistinguishable from a
 * SUCCEEDING one that printed nothing, and the empty result then reads as
 * "none found" rather than "it errored".
 *
 * ## THE PATTERN IS NOT DEFINED HERE. It is read from the rule.
 *
 * `hooks/rules/rules.yaml` is the SSoT for what counts as a discard, and
 * `hooks/rules/rules.json` is the runtime artifact generated from it (CI fails
 * if they drift). This file reads that rule and applies it to FILES.
 *
 * The first draft of this checker carried its own copy of the regex. That is a
 * second implementation of a measurement, and a second implementation drifts —
 * the rule would tighten in one place and the other would keep passing what it
 * had started refusing, silently, which is the exact class of defect this
 * checker exists to catch. If a form is missing, add it to `rules.yaml`; both
 * consumers inherit it and neither can disagree with the other.
 *
 * ## What this file DOES own: which lines are commands
 *
 * That is genuinely not the rule's job. The rule is applied by a hook to a
 * single command string; here the input is a document, so something has to
 * decide which of its lines are commands at all.
 *
 * In markdown, only FENCED code blocks are. Inline backticks are prose, because
 * a rule that says "never write X" has to be able to write X. Not hypothetical:
 * while this was being built, a sibling guard blocked the command that was
 * COUNTING the violations, and separately blocked a PR body that merely QUOTED
 * a redirect while explaining why its order is the safe one. A guard that
 * refuses ordinary work gets bypassed, and a bypassed guard carries no
 * information at all.
 *
 * Outside markdown every line is a command, comments included: a comment
 * demonstrating the bad form is still the line a reader copies.
 *
 * ## Order is the whole distinction, and the rule already encodes it
 *
 *   cmd >/dev/null 2>&1   stdout retargeted FIRST, stderr follows it. Both
 *                         gone. Matched by the rule.  REFUSED.
 *   cmd 2>&1 >/dev/null   stderr duplicated to the ORIGINAL stdout before
 *                         stdout moves, so it survives. Deliberately NOT
 *                         matched by the rule.  ALLOWED.
 *
 * Bare `cmd >/dev/null` is NOT in this rule today. A consuming repo may hold a
 * stricter local policy, and that divergence is reported rather than resolved
 * here: adopting it means editing `rules.yaml`, which changes the hook too, and
 * that is a decision for the rule's owner, not a side effect of a file scan.
 *
 * ## Scope, and why it is split
 *
 * GATE (must be zero)   commands/ skills/ agents/ — the instructing surface.
 * RATCHET (reported)    hooks/ scripts/ — real shell. A gate that reds the repo
 *                       it guards is one that gets deleted, so this half is
 *                       counted and not enforced yet.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const RULE_ID = 'discard-stderr';
const RULES_JSON = 'hooks/rules/rules.json';

/** Directories whose files must contain ZERO discards. */
const GATE_DIRS = ['commands', 'skills', 'agents'];
/** Real shell, counted but not enforced. See the header. */
const RATCHET_DIRS = ['hooks', 'scripts'];

/**
 * Translate POSIX ERE to JavaScript RegExp.
 *
 * This is the ONLY transformation applied to the rule's pattern, and it is
 * spelled out rather than hidden because every character of divergence between
 * what the hook matches and what this matches is a place they can disagree.
 * JavaScript has no POSIX bracket expressions; `[[:space:]]` is the only one
 * the rule uses.
 */
export function posixToJs(pattern) {
  return pattern.replaceAll('[[:space:]]', '\\s');
}

/**
 * Load the shared rule.
 *
 * Throws rather than falling back to a built-in pattern. A checker that
 * silently substituted its own copy when the rule went missing would report
 * PASS while checking something nobody approved — the found-nothing-versus-
 * errored collapse, one level up from the thing being checked.
 */
export function loadRule(root = process.cwd()) {
  const raw = JSON.parse(readFileSync(path.join(root, RULES_JSON), 'utf8'));
  const rules = Array.isArray(raw) ? raw : (raw.rules ?? []);
  const rule = rules.find((r) => r.id === RULE_ID);
  if (!rule) throw new Error(`${RULES_JSON} has no rule "${RULE_ID}" — cannot check what is not defined`);

  const match = rule.match ?? [];
  const positive = match.find((m) => m.pattern)?.pattern;
  const negative = match.find((m) => m.not_pattern)?.not_pattern;
  if (!positive) throw new Error(`rule "${RULE_ID}" declares no pattern`);

  return {
    refuse: new RegExp(posixToJs(positive)),
    // The rule's own mention exemption (a quoted occurrence performs no
    // redirect). Kept even though the fenced-block selector already removes
    // most prose, so the two consumers stay aligned on every clause.
    exempt: negative ? new RegExp(posixToJs(negative)) : null,
    source: `${RULES_JSON}#${RULE_ID}`,
  };
}

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

/** Lines that are COMMANDS rather than prose. See the header. */
export function commandLines(file, text) {
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

export function scan(files, rule = loadRule()) {
  const findings = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch (err) {
      // Unreadable is UNVERIFIABLE, never clean. Surface it so a permissions
      // problem cannot read as a passing scan.
      findings.push({ file, line: 0, why: `could not read: ${err.message}`, text: '' });
      continue;
    }
    for (const [line, content] of commandLines(file, text)) {
      if (rule.exempt?.test(content)) continue;
      if (rule.refuse.test(content)) {
        findings.push({ file, line, why: 'stderr discarded', text: content.trim().slice(0, 100) });
      }
    }
  }
  return findings;
}

function main() {
  const all = process.argv.includes('--all');
  let rule;
  try {
    rule = loadRule();
  } catch (err) {
    console.error(`discard-stderr check could not load its rule: ${err.message}`);
    process.exit(2); // not 1: this is "could not determine", not "found violations"
  }

  const gate = scan(GATE_DIRS.flatMap((d) => walk(d)), rule);
  const ratchet = scan(RATCHET_DIRS.flatMap((d) => walk(d)), rule);

  console.log(`discard-stderr check  (pattern from ${rule.source})`);
  console.log(`  gate    ${GATE_DIRS.join(' ')} -> ${gate.length} finding(s)`);
  console.log(`  ratchet ${RATCHET_DIRS.join(' ')} -> ${ratchet.length} finding(s), not enforced`);

  for (const f of gate) console.log(`\n  ${f.file}:${f.line}  ${f.why}\n      ${f.text}`);
  if (all) for (const f of ratchet) console.log(`\n  [ratchet] ${f.file}:${f.line}  ${f.why}`);

  if (gate.length) {
    console.log(`\nFAIL — ${gate.length} discard(s) in the instructing surface.`);
    console.log(`These files are copied and executed, so the shape ships to every user.`);
    console.log(`\n  keep stderr:   cmd 2>>"\${MNM_LOG:-/tmp/make-no-mistakes.log}"`);
    console.log(`  stdout noisy:  cmd 2>&1 > /dev/null     (this order ONLY)`);
    console.log(`  exit code:     out=$(cmd); rc=$?`);
    process.exit(1);
  }

  console.log(`\nPASS — the instructing surface discards nothing.`);
  if (ratchet.length) {
    console.log(`${ratchet.length} site(s) remain in ${RATCHET_DIRS.join('/')} — run with --all to list.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
