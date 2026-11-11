/**
 * 型号显示名去 "B&F NAM " 前缀（2026-09-25 用户口径）
 *
 * 背景：UI 的 Slot A 下拉与踏板图形文字走 `display`（PedalPanel.tsx:817/862/773），
 *       而 `name` 是寄存器数据键（OVERDRIVE_DEFAULTS / SUB_MODEL_FORMULAS /
 *       AMP_HEAD_KNOB_DEFAULTS / CABINET_PEQ 等表的 key）→ **只能改 display**。
 *
 * 只做一件事：pedalData.ts 中 `display: "B&F NAM xxx"` → `display: "xxx"`。
 * 同时报告：仍含 "B&F NAM" 的字段分类（name 属数据键，按设计保留）。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'D:/bfx1app/01_app/src/data/pedalData.ts';
const src = readFileSync(FILE, 'utf8');

const before = (src.match(/B&F NAM/g) ?? []).length;
const beforeName = (src.match(/name:\s*"B&F NAM/g) ?? []).length;
const beforeDisplay = (src.match(/display:\s*"B&F NAM/g) ?? []).length;

let n = 0;
// `\s` 在 JS 里包含 NBSP(\u00A0) —— 源文件字段名后用的是非常规空白
let out = src.replace(/(display:\s*")(?:B&F NAM\s+)/g, (_m, p1: string) => { n++; return p1; });

// ── 第二步: 给「有 name 但没 display」的型号补 display(= 去前缀名) ──
// 原因: UI 用 `display ?? name` 渲染 Slot A 与踏板图形文字 → 缺 display 就会露出 "B&F NAM ..."
let added = 0;
out = out.split('\n').map((ln) => {
  if (!/name:\s*"B&F NAM/.test(ln) || /display:/.test(ln)) return ln;
  return ln.replace(/(name:\s*"B&F NAM\s+([^"]+)")/, (_m: string, whole: string, short: string) => {
    added++;
    return `${whole}, display: "${short}"`;
  });
}).join('\n');

const after = (out.match(/B&F NAM/g) ?? []).length;
const afterName = (out.match(/name:\s*"B&F NAM/g) ?? []).length;
const afterDisplayNam = (out.match(/display:\s*"B&F NAM/g) ?? []).length;
const missingDisplay = out.split('\n').filter(ln => /name:\s*"B&F NAM/.test(ln) && !/display:/.test(ln)).length;

writeFileSync(FILE, out, 'utf8');

console.log('════ pedalData.ts 型号显示名去 "B&F NAM " 前缀 ════');
console.log(`替换前: 含 "B&F NAM" ${before} 处  |  name 字段 ${beforeName}  |  display 字段 ${beforeDisplay}`);
console.log(`本次替换: display 去前缀 ${n} 处  +  补齐缺失 display ${added} 处`);
console.log(`替换后: 含 "B&F NAM" ${after} 处（全部为 name 数据键 ${afterName}）  |  display 仍含 NAM ${afterDisplayNam} 处  |  缺 display 的型号 ${missingDisplay} 个`);
console.log(`结论: UI（display ?? name）${afterDisplayNam === 0 && missingDisplay === 0 ? '不再显示任何 "B&F NAM"' : '仍会露出 "B&F NAM"'}`);

if (afterName !== beforeName) console.log(`⚠ name 字段数量发生变化: ${beforeName} → ${afterName}`);
if (afterDisplayNam !== 0 || missingDisplay !== 0) console.log('⚠ 需检查 display 补齐结果');
