#!/usr/bin/env node
// =============================================================================
// build-rules.mjs — Convert hooks/rules/rules.yaml → hooks/rules/rules.json
//
// rules.yaml is the SSoT humans edit. rules.json is the runtime artifact
// hooks load via jq (no yaml parser needed at runtime).
//
// CI runs this script and fails if `git diff hooks/rules/rules.json` is
// non-empty — this guarantees rules.json never drifts from rules.yaml.
//
// Usage:  node scripts/build-rules.mjs
// =============================================================================
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const yamlPath = join(repoRoot, 'hooks', 'rules', 'rules.yaml');
const jsonPath = join(repoRoot, 'hooks', 'rules', 'rules.json');

// IP-leak guard. The plugin is BSL-1.1 public-source, so we cannot hardcode
// client / org names anywhere in committed code (that itself would be a leak).
// Instead, each dev maintains a gitignored .private/forbidden-names.txt with
// one regex per line. If the file exists, the build fails when any of those
// names appear in rules.yaml. If the file doesn't exist, the check is skipped.
// The check is opt-in and reusable for any user of this toolkit who works
// with private clients. See hooks/rules/README.md.
const forbiddenFile = join(repoRoot, '.private', 'forbidden-names.txt');
let FORBIDDEN_PATTERNS = [];
if (existsSync(forbiddenFile)) {
  FORBIDDEN_PATTERNS = readFileSync(forbiddenFile, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map((l) => new RegExp(l, 'i'));
  console.log(
    `IP-leak guard active (${FORBIDDEN_PATTERNS.length} pattern(s) loaded from .private/forbidden-names.txt)`,
  );
}

const source = readFileSync(yamlPath, 'utf8');
const rules = yaml.load(source);

if (!Array.isArray(rules)) {
  console.error('rules.yaml must be an array of rule objects');
  process.exit(1);
}

const ids = new Set();
for (const rule of rules) {
  if (!rule.id) {
    console.error('rule missing id field:', rule);
    process.exit(1);
  }
  if (ids.has(rule.id)) {
    console.error(`duplicate rule id: ${rule.id}`);
    process.exit(1);
  }
  ids.add(rule.id);

  if (!rule.applies_to || !Array.isArray(rule.applies_to) || rule.applies_to.length === 0) {
    console.error(`rule ${rule.id} missing applies_to (non-empty array required)`);
    process.exit(1);
  }
  if (!rule.match || !Array.isArray(rule.match) || rule.match.length === 0) {
    console.error(`rule ${rule.id} missing match (non-empty array required)`);
    process.exit(1);
  }
  if (!['block', 'warn'].includes(rule.action)) {
    console.error(`rule ${rule.id} action must be block or warn, got: ${rule.action}`);
    process.exit(1);
  }
  if (!rule.tests || !Array.isArray(rule.tests) || rule.tests.length === 0) {
    console.error(`rule ${rule.id} missing tests (non-empty array required)`);
    process.exit(1);
  }
  if (typeof rule.message !== 'string' || rule.message.trim().length === 0) {
    console.error(`rule ${rule.id} missing required message (non-empty string)`);
    process.exit(1);
  }
  // bypass_marker is optional, but when present must be kebab-case.
  // Without this constraint, an author could pick a marker containing
  // ERE-special characters (., +, (, [, etc.), which eval-rule.sh would
  // interpolate verbatim into a grep pattern — leading to silent
  // mismatches or grep errors that escalate to unintended blocks.
  if (rule.bypass_marker !== undefined && rule.bypass_marker !== null) {
    if (
      typeof rule.bypass_marker !== 'string' ||
      !/^[a-z0-9-]+$/.test(rule.bypass_marker)
    ) {
      console.error(
        `rule ${rule.id} has invalid bypass_marker: must be kebab-case (^[a-z0-9-]+$) or null, got: ${JSON.stringify(rule.bypass_marker)}`,
      );
      process.exit(1);
    }
  }

  // IP-leak guard: scan the entire rule (serialized) for forbidden patterns.
  // This catches leaks in references, messages, test fixtures, anywhere.
  const serialized = JSON.stringify(rule);
  for (const forbidden of FORBIDDEN_PATTERNS) {
    if (forbidden.test(serialized)) {
      console.error(
        `rule ${rule.id} contains a forbidden client/org name (pattern: ${forbidden}).`,
      );
      console.error(
        '  Public toolkit rules must be agnostic. Use generic placeholders like',
      );
      console.error('  acme-prod, myproject-dev, example.com, etc.');
      process.exit(1);
    }
  }
}

writeFileSync(jsonPath, JSON.stringify(rules, null, 2) + '\n');
console.log(`Generated ${jsonPath} (${rules.length} rules)`);
