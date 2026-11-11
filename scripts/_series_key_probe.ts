/**
 * 探测：UI 传下去的组合键（如 "锯条失真/HM-2"）在三张表里是否存在
 */
import { SERIES_REGISTRY } from '../src/data/seriesData';
import { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';
import { OVERDRIVE_DEFAULTS } from '../src/data/presetData';

const F: any = SUB_MODEL_FORMULAS, P: any = SUB_MODEL_PRE_EQ, D: any = OVERDRIVE_DEFAULTS;

console.log('UI 组合键                                  | 公式 | PRE_EQ | defaults | baseKey(=组合键?)');
for (const s of SERIES_REGISTRY) {
  for (const m of s.models) {
    const key = `${s.uiName}/${m.label}`;
    const hasF = !!F[key], hasP = !!P[key], hasD = !!D[key];
    const baseF = !!F[m.key], baseD = !!D[m.key];
    const flag = (!hasF || !hasP || !hasD) ? '  ★缺' : '';
    console.log(`${key.padEnd(42)} | ${hasF ? '有' : '无'} | ${hasP ? '有' : '无'} | ${hasD ? '有' : '无'} | baseKey公式=${baseF ? '有' : '无'} baseKey默认=${baseD ? '有' : '无'}${flag}`);
  }
}
console.log('\n模块总数:', SERIES_REGISTRY.length, ' 型号总数:', SERIES_REGISTRY.reduce((n, s) => n + s.models.length, 0));
