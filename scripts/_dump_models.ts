/** 临时：导出 APP 侧 OD/DIST 系列与型号键（label / 真实键 / 系列组合键 / 旋钮）供生成器使用 */
import { MODULES } from '../src/data/pedalData';
import { SERIES_REGISTRY, seriesModelKey } from '../src/data/seriesData';

const out: unknown[] = [];
for (const s of SERIES_REGISTRY) {
  const mod: any = MODULES.find((m) => m.id === s.moduleId);
  const list: any[] = mod?.subModels?.[s.mode] ?? [];
  // pedalData 的系列 id 与 seriesData 的 id 命名不同（v26-od-mid-boost vs mid-boost-od）→ 以 uiName 匹配，再回退 id
  const series: any = list.find((x: any) => x.name === s.uiName) ?? list.find((x: any) => x.id === s.id);
  out.push({
    seriesId: s.id,
    moduleId: s.moduleId,
    mode: s.mode,
    uiName: s.uiName,
    uiNameEn: s.uiNameEn,
    group: s.group,
    knobs: series?.knobs ?? [],
    models: (s.models as any[]).map((m) => ({
      label: m.label,
      key: m.key,
      composed: seriesModelKey(s as any, m as any),
    })),
  });
}
import * as fs from 'fs';
const dest = process.argv[2] || 'D:/bfx1app/tools/_models.json';
fs.writeFileSync(dest, JSON.stringify(out), 'utf8');
console.log(`wrote ${dest}: ${JSON.stringify(out).length} bytes`);
