/**
 * 四类模块「型号/位置 → 参数数据」覆盖审计（只读）
 *
 * 检查 pedalData 的 MODULES 里每个 subModel 的每个 capture(pos)
 * 是否都有对应寄存器数据（组合键 `${name}/${pos}`），即 v50 文案所说的「位置空缺」。
 * 另做反向孤儿键检查与 OD/DIST 段完整性检查。
 */
import { MODULES, getMergedSubModels } from '../src/data/pedalData';
import { OVERDRIVE_DEFAULTS, AMP_HEAD_HIDDEN, AMP_HEAD_HIDDEN_DEFAULT } from '../src/data/presetData';
import { AMP_DEFAULTS2 } from '../src/data/_gen/amp_params2';
import { CABINET_PEQ } from '../src/data/cabinetPeqData';
import { SERIES_REGISTRY } from '../src/data/seriesData';

const OD_ADDrs = [42, 44, 45, 46, 47, 49, 50, 51, 53, 54, 55, 56];
const DIST_ADDRS = [57, 59, 60, 61, 62, 64, 65, 66, 68, 69, 70, 71];
const AMP_ADDRS = [74, 75, 76, 77, 79, 80, 81, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 239];

interface Res {
  moduleId: string; nModel: number; nPos: number; missing: string[]; orphans: string[]; segBad: string[];
}

function audit(moduleId: string, tbl: any, segAddrs?: number[]): Res {
  const mod = MODULES.find((m: any) => m.id === moduleId);
  const subs: any[] = mod ? (getMergedSubModels(mod as any) as any[]) : [];
  const seen = new Set<string>();
  const missing: string[] = [];
  const segBad: string[] = [];
  let nPos = 0;
  for (const sm of subs) {
    for (const cap of (sm.captures ?? [])) {
      nPos++;
      const key = `${sm.name}/${cap.pos}`;
      seen.add(key);
      const rec = tbl[key];
      if (!rec) { missing.push(`${sm.display || sm.name} · ${cap.pos}  →  ${key}`); continue; }
      if (segAddrs) {
        const regs: Record<number, number> = rec.allRegs ?? rec;
        const absent = segAddrs.filter((a) => regs[a] === undefined);
        if (absent.length) segBad.push(`${key} 缺段 ${absent.join(',')}`);
      } else if (Array.isArray(rec) && rec.length !== 35) {
        segBad.push(`${key} 段数=${rec.length}(应 35)`);
      }
    }
  }
  const orphans = Object.keys(tbl).filter((k) => !seen.has(k));
  return { moduleId, nModel: subs.length, nPos, missing, orphans, segBad };
}

const results: Res[] = [
  audit('overdrive', OVERDRIVE_DEFAULTS, OD_ADDrs),
  audit('dist', OVERDRIVE_DEFAULTS, DIST_ADDRS),
  audit('amp-head', AMP_DEFAULTS2, AMP_ADDRS),
  audit('cabinet', CABINET_PEQ),
];

for (const r of results) {
  console.log(`\n═══ ${r.moduleId} ═══`);
  console.log(`型号 ${r.nModel} / 位置 ${r.nPos} | 位置空缺 ${r.missing.length} | 孤儿键 ${r.orphans.length} | 段异常 ${r.segBad.length}`);
  if (r.missing.length) console.log('  空缺:\n    ' + r.missing.slice(0, 12).join('\n    ') + (r.missing.length > 12 ? `\n    ...+${r.missing.length - 12}` : ''));
  if (r.segBad.length) console.log('  段异常:\n    ' + r.segBad.slice(0, 8).join('\n    ') + (r.segBad.length > 8 ? `\n    ...+${r.segBad.length - 8}` : ''));
  if (r.orphans.length) console.log('  孤儿键(前10): ' + r.orphans.slice(0, 10).join(' | ') + (r.orphans.length > 10 ? ` ...+${r.orphans.length - 10}` : ''));
}

// 系列注册表型号 → 数据表
console.log('\n═══ SERIES_REGISTRY 型号键 ═══');
let serMissing = 0;
const serOrphanModel: string[] = [];
for (const fam of SERIES_REGISTRY) {
  for (const mm of fam.models) {
    if (!OVERDRIVE_DEFAULTS[mm.key]) { serMissing++; console.log(`  缺失: ${fam.moduleId}/${fam.uiName}/${mm.label} → ${mm.key}`); }
  }
}
const allModelKeys = new Set(SERIES_REGISTRY.flatMap((f) => f.models.map((m) => m.key)));
for (const k of Object.keys(OVERDRIVE_DEFAULTS)) {
  // 仅看能否被某个系列的型号键解释（位置级键 = 型号键 + 位置后缀的情况较少，宽松处理）
  if (!allModelKeys.has(k)) serOrphanModel.push(k);
}
console.log(`型号键缺失 ${serMissing} | 数据表中非型号键 ${serOrphanModel.length}`);
console.log('  非型号键样例(前8): ' + serOrphanModel.slice(0, 8).join(' | '));

// 箱体键格式确认
console.log('\n═══ 键格式抽样 ═══');
console.log('  CABINET_PEQ 键数', Object.keys(CABINET_PEQ).length, '样例:', Object.keys(CABINET_PEQ)[0]);
console.log('  AMP_DEFAULTS2 键数', Object.keys(AMP_DEFAULTS2).length, '样例:', Object.keys(AMP_DEFAULTS2)[0]);
console.log('  AMP_HEAD_HIDDEN 键数', Object.keys(AMP_HEAD_HIDDEN).length, ' DEFAULTS2 兜底:', !!AMP_HEAD_HIDDEN_DEFAULT);
