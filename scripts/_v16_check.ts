/** v16 核对：OD/DIST 整图键数应 67 → 71，且 4 个新键的值来自 PEDAL_DEFAULTS2 */
import { OVERDRIVE_DEFAULTS } from '../src/data/presetData';
import { PEDAL_DEFAULTS2 } from '../src/data/_gen/pedal_params2';

const T = OVERDRIVE_DEFAULTS as Record<string, { allRegs?: Record<number, number> }>;
const hw = Object.keys(T).filter((k) => k.startsWith('B&F NAM '));
console.log('OVERDRIVE_DEFAULTS 硬件键 = ' + hw.length);

const NEWKEYS = [
  'B&F NAM Ibanez TS9/Ibanez TS9',
  'B&F NAM Boss BD-2/Boss BD-2',
  'B&F NAM Klon Centaur/Klon Centaur',
  'B&F NAM ProCo RAT/ProCo RAT',
];
for (const k of NEWKEYS) {
  const a = T[k]?.allRegs?.[56];
  const b = (PEDAL_DEFAULTS2 as Record<string, { allRegs?: Record<number, number> }>)[k]?.allRegs?.[56];
  const same = a !== undefined && a === b;
  console.log((same ? 'OK  ' : 'WARN') + ' ' + k + '  runtime=' + (a === undefined ? 'undef' : '0x' + a.toString(16)) + '  v16=' + (b === undefined ? 'undef' : '0x' + b.toString(16)));
}

// NAM 备份键应仍在（_2 档）
const bak = Object.keys(T).filter((k) => /(BD-2|Klon Centaur|ProCo RAT|Ibanez TS9)_2$/.test(k));
console.log('NAM 备份档键数 = ' + bak.length + ' -> ' + bak.join(' | '));
