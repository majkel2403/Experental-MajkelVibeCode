#!/usr/bin/env node
// validate-scenario.mjs <scenario.json...>  — runs the same contract validator the workflow used
import fs from 'node:fs';
const SCRIPT = '/root/.claude/projects/-home-user-Agentspace/5111ae7b-9086-5f9a-8567-4c1d7564bd1f/workflows/scripts/hermes-content-and-boards-wf_5f5187c6-f5e.js';
const src = fs.readFileSync(SCRIPT, 'utf8');
const a = src.indexOf('// ---------- code validator');
const b = src.indexOf('// ---------- prompts');
const validate = new Function(src.slice(a, b) + '\nreturn validate;')();
let bad = 0;
for (const f of process.argv.slice(2)) {
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  const errs = validate(s);
  console.log(f + ': ' + (errs.length ? errs.length + ' error(s)' : 'valid'));
  errs.forEach((e) => console.log('  - ' + e));
  bad += errs.length;
}
process.exit(bad ? 1 : 0);
