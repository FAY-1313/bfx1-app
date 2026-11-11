// 社区种子生成 (task #123): 被移除的 14 个硬件型号 → 静态种子音色 src/data/seedTones.ts
// 每个种子 = 单块音色 (pedal 直通): 保留该硬件 capture 的 NAM 寄存器 (音色特征),
//   subModel 用吸收系列键 (v26 UI/公式一致), 应用后旋钮微调走系列公式.
// 运行: npx esbuild tools/seedCommunityTones.ts --bundle --platform=node --format=esm --outfile=tools/.seed.mjs && node tools/.seed.mjs
import * as fs from 'fs';
import { OVERDRIVE_DEFAULTS } from '../src/data/presetData';
import { generatePresetRegisters } from '../src/services/presetEngine';
import { SERIES_REGISTRY, seriesComposedKey } from '../src/data/seriesData';
import type { LocalPreset } from '../src/services/localPresets';
import type { CommunityTone } from '../src/services/toneCommunity';

const SEED_DATE = '2026-08-22T00:00:00.000Z';
const modelDisplay = (key: string): string => key.split('/')[0].replace('B&F NAM ', '').trim();
const modelShort = (key: string): string => {
  const d = modelDisplay(key);
  const m = d.match(/\S+\s+(.+)$/); // brand + rest → 保留型号主体
  return m ? m[1] : d;
};

const tones: CommunityTone[] = [];
let idx = 0;

for (const s of SERIES_REGISTRY) {
  for (const absorbed of s.absorbs) {
    const captures = [absorbed, `${absorbed}_2`].filter((k) => !!OVERDRIVE_DEFAULTS[k]);
    if (captures.length === 0) {
      console.warn(`!! 无 OVERDRIVE_DEFAULTS: ${absorbed}`);
      continue;
    }
    for (const cap of captures) {
      idx++;
      const isOd = s.moduleId === 'overdrive';
      const isDist = s.moduleId === 'dist';
      const seriesKey = seriesComposedKey(s, s.subOptions[0]); // 原味
      const display = modelDisplay(cap);
      const suffix = cap.endsWith('_2') ? ' 2' : '';
      const name = `${display}${suffix} · ${s.uiName}`;
      const def = OVERDRIVE_DEFAULTS[cap];
      const modules = {
        'noise-gate': true, boost: false, compressor: false,
        overdrive: isOd, dist: isDist,
        'amp-head': false, cabinet: false, chorus: false, delay: false, reverb: false,
      };
      const engine = {
        ...modules,
        overdriveSubModel: isOd ? cap : '',
        distSubModel: isDist ? cap : '',
        compressorSubModel: '',
        ampHeadSubModel: '',
        chorusSubModel: '',
      };
      const regs = generatePresetRegisters('0', name, s.mode, engine, undefined);
      const registers: Record<number, number> = {};
      for (const r of regs) registers[r.regAddr] = r.value;
      const data: LocalPreset = {
        slot: 0, name, playMode: s.mode, modules,
        subModels: { [s.moduleId]: seriesKey },
        knobValues: { [s.moduleId]: { ...def.knobs } },
        registers,
        io: { inputVol: 1, outputVol: 1, inputMute: false, outputMute: false },
        savedAt: Date.parse(SEED_DATE),
      };
      tones.push({
        _id: `seed-${s.id}-${idx}`,
        author: 'seed',
        name,
        description: `经典 ${display} 硬件 NAM 拟合单块音色，已并入「${s.uiName}」系列，作社区种子保留。`,
        tags: [s.uiName, modelShort(cap), s.mode === 'bass' ? '贝斯' : '吉他', '社区种子'],
        category: s.mode,
        data,
        downloads: 0,
        createdAt: SEED_DATE,
        updatedAt: SEED_DATE,
      });
    }
  }
}

console.log(`共 ${tones.length} 个种子音色`);
for (const t of tones) {
  const regCount = Object.keys(t.data.registers).length;
  console.log(`  ${t._id}  ${t.name}  (${t.category}, ${regsCountLabel(regCount)})  sub=${t.data.subModels[t.category === 'bass' ? (t.data.subModels.dist ? 'dist' : 'overdrive') : (t.data.subModels.dist ? 'dist' : 'overdrive')]}`);
}
function regsCountLabel(n: number): string { return `${n} regs`; }

const lines = tones.map((t) => {
  const regs = Object.entries(t.data.registers).sort(([a], [b]) => Number(a) - Number(b));
  const regObj = regs.map(([a, v]) => `${a}:${v}`).join(',');
  return `  {
    _id: ${JSON.stringify(t._id)},
    author: 'seed',
    name: ${JSON.stringify(t.name)},
    description: ${JSON.stringify(t.description)},
    tags: ${JSON.stringify(t.tags)},
    category: '${t.category}',
    data: { slot: 0, name: ${JSON.stringify(t.name)}, playMode: '${t.category}',
      modules: ${JSON.stringify(t.data.modules)},
      subModels: ${JSON.stringify(t.data.subModels)},
      knobValues: ${JSON.stringify(t.data.knobValues)},
      registers: { ${regObj} },
      io: { inputVol: 1, outputVol: 1, inputMute: false, outputMute: false },
      savedAt: ${t.data.savedAt} },
    downloads: 0,
    createdAt: ${JSON.stringify(t.createdAt)},
    updatedAt: ${JSON.stringify(t.updatedAt)},
  },`;
}).join('\n');

const out = `/**
 * 社区种子音色 (task #123, 生成: tools/seedCommunityTones.ts).
 * 被移除的 14 个硬件型号 → 单块种子; registers 保留硬件 capture NAM 值, subModels 用吸收系列键.
 * 由 toneCommunity.fetchTones 与云端结果按 name 去重合并进探索列表 (离线可见).
 */
import type { CommunityTone } from '../services/toneCommunity';

export const SEED_TONES: CommunityTone[] = [
${lines}
];
`;
fs.writeFileSync('src/data/seedTones.ts', out, 'utf8');
console.log(`\n已写入 src/data/seedTones.ts`);
