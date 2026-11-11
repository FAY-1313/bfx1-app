/**
 * Cross-check cabinet sub-models in pedalData.ts vs CABINET_PEQ keys in
 * cabinetPeqData.ts. Expected PEQ key for each capture = `${name}/${pos}`.
 * Confirms: no sub-model capture is missing a PEQ entry, and no PEQ key is orphaned.
 * Usage: node scripts/verify-cabinet-peq.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const pedal = fs.readFileSync(path.join(ROOT, 'src', 'data', 'pedalData.ts'), 'utf8');
const cabSrc = fs.readFileSync(path.join(ROOT, 'src', 'data', 'cabinetPeqData.ts'), 'utf8');

// 1) Extract the cabinet module block: from "id: 'cabinet'" up to the next section divider
const start = pedal.indexOf("id: 'cabinet'");
const end = pedal.indexOf('// ─── 8.', start);
if (start < 0 || end < 0) throw new Error('cabinet block not found');
const block = pedal.slice(start, end);

// 2) Parse sub-models: each entry has name: "..." and captures: [{pos:"...",...},...]
const entries = [];
const entryRe = /\{ id: "[^"]+",[\s\S]*?captures: \[([\s\S]*?)\]\s*\}/g;
const nameRe = /name: "([^"]+)"/;
const posRe = /pos: "([^"]+)"/g;
let m;
while ((m = entryRe.exec(block)) !== null) {
  const nm = m[0].match(nameRe);
  if (!nm) continue;
  const poses = [];
  let p;
  posRe.lastIndex = 0;
  while ((p = posRe.exec(m[1])) !== null) poses.push(p[1]);
  entries.push({ name: nm[1], pos: poses });
}

// 3) Build expected key set
const expected = new Set();
for (const e of entries) for (const p of e.pos) expected.add(`${e.name}/${p}`);

// 4) Actual PEQ keys
const actual = new Set();
const keyRe = /"([^"]+)": \[/g;
let k;
while ((k = keyRe.exec(cabSrc)) !== null) actual.add(k[1]);

console.log(`pedalData cabinet sub-models: ${entries.length}`);
console.log(`  expected keys (name/pos): ${expected.size}`);
console.log(`  CABINET_PEQ keys:         ${actual.size}`);

const missing = [...expected].filter(x => !actual.has(x));
const extra = [...actual].filter(x => !expected.has(x));

console.log(`\nMISSING (in pedalData but no PEQ): ${missing.length}`);
for (const x of missing) console.log(`  ${x}`);
console.log(`\nEXTRA (PEQ but unused): ${extra.length}`);
for (const x of extra) console.log(`  ${x}`);

// Per-sub-model rollup for human review
console.log('\nSub-model capture counts:');
for (const e of entries) {
  const miss = e.pos.filter(p => !actual.has(`${e.name}/${p}`));
  console.log(`  ${e.name}  (${e.pos.length} caps)${miss.length ? '  MISSING: ' + miss.join(', ') : ''}`);
}
