#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const markers = [
  /^<<<<<<<\s/m,
  /^=======\s*$/m,
  /^>>>>>>>\s/m,
];

function getTrackedFiles() {
  const output = execSync('git ls-files', { encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
}

const offenders = [];
for (const file of getTrackedFiles()) {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  if (markers.some((pattern) => pattern.test(text))) {
    offenders.push(file);
  }
}

if (offenders.length > 0) {
  console.error('❌ Unresolved merge conflict markers found in tracked files:');
  for (const file of offenders) {
    console.error(` - ${file}`);
  }
  process.exit(1);
}

console.log('✅ No merge conflict markers found in tracked files.');
