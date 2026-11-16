/**
 * 16 个内置预设音色 —— v3 重做（2026-10-16）
 *
 * 槽位: 1 = 线材直出(全 Bypass) + 2–16 = 15 个新音色。
 * 本地库为空时 (全新安装 / 清除应用数据) 自动写入。每个预设 =
 * generatePresetRegisters 基线 (箱头 42 寄存器 / 旁路 / PRE EQ / 箱体捕获) + 旋钮覆盖。
 *
 * ★ 本次重做要点
 *  1. 箱头表换成 v3 20 型号（data/_def/ampHeadDef.ts）。旧 v8Amp 索引（0–25）全部作废，
 *     本文件一律用 v3 索引（0 = bassman … 19 = ts50b）。
 *  2. 箱头旋钮改走 data/ampKnobResolve.ts（按型号 knobs[] + clip 现算），
 *     不再依赖 parameterMap.ts 里 v13 那两张旧布局公式表。
 *  3. ★ CLEAN 类箱头的两个驱动量（GAIN=reg64 / DRIVE=reg79）一律 ≤ 5 dB —— 见 CLEAN_MAX_DB。
 *     CLEAN 型号自身设计值高达 12–14 dB，不覆盖会过载。
 *  4. 命名改成「其他家效果器」的工厂音色风格（去掉 A2/B3/C4/D1 前缀）。
 *
 * 覆盖规则:
 *  - BOOST 全开 + 噪音门全开: CLEAN boost ≤ 0.4, 其他 ≤ 0.7;
 *  - 整体响度用各箱头 MASTER 逐箱配比;
 *  - 过载/失真吉他音色 = 过载/失真踏板 + 箱头 (各档搭配互不相同);
 *  - 其他参数匹配捕获值 (不覆盖基线).
 */
import { generatePresetRegisters } from '../services/presetEngine';
import { getLinkedParamDefs, getLegacyLinkedDefs, getParamDef } from '../data/parameterMap';
/* ★★ 2026-10-17：循环压测模式 —— 16 个预设会被整体替换成全寄存器扫描图 */
import { TEST_SWEEP_MODE } from '../config/testMode';
import { TEST_SWEEP_MAP } from './_def/testSweep';
import { ampLinkedDefs } from '../data/ampKnobResolve';
import { AMP_MODELS, AMP_MASTER_ADDR } from './_def/ampHeadDef';
import { PEQ_FREQ_TABLE, parsePEQData, buildPEQData } from './peqCodec';
import { COMP_MODELS, OD_MODELS, CHORUS_PRESETS, DELAY_PRESETS, REVERB_PRESETS } from './_def';
import { PASSTHROUGH_MODULES, MODULE_PARAM_RANGES, getModuleOffRegs, applyWhitelistPolicy, A1_BYPASS_ALL, ALWAYS_ON_REGS } from './passThrough';
import { CAB_SETS } from './_def/cabinetDef';
import { TONE25_CABS, TONE25_HEADS } from './_def/tone25';
import { PRESETS25, type Preset25Spec } from './_def/presets25';
import { buildLocalBank2026Seeds } from './localBank2026';
import { CABINET_PEQ } from '../data/cabinetPeqData';
/* ★★★ 2026-10-31（用户拍板·第二次修正）：预设库 16 格 = **固件出厂 16 档**，
 *   寄存器与模块开关逐条取自 data/firmwareBank.ts（= 固件 tone_channels_v1.c）。
 *   本地库（LOCAL_BANK_TONES）是另一套独立音色，⛔ 不要拿它覆盖预设库/固件。 */
import { FW_BANK } from './firmwareBank';
import type { FwChannel } from './firmwareBank';
import type { LocalPreset } from '../services/localPresets';
import { loadLocalBank, saveLocalBankItem, saveBankSlot, replaceLocalBankForSeeds, loadBankSlots, LOCAL_BANK_CLEARED_KEY } from '../services/localPresets';
import type { PlayMode } from '../data/pedalData';


export interface BuiltinPresetSpec {
  slot: number;
  name: string;
  mode: PlayMode;
  modules: Record<string, boolean>;
  subModels: Record<string, string>;
  knobs: Record<string, Record<string, number>>;
  /** BOOST norm (PGA): CLEAN≤0.4, 其他≤0.7 */
  boost?: number;
  /** ★ v8 箱头型号索引（AMP_MODELS 下标）；legacy 模式下忽略 */
  v8Amp?: number;   // 2026-10-12: 箱头表已换 3 组，v8Amp 取值 0=clean 1=crunch 2=highgain
}

/** ★ CLEAN 类箱头两个驱动量的硬上限（dB）—— 超过会过载（用户 2026-10-16 指示） */
export const CLEAN_MAX_DB = 5;

/**
 * 解析旋钮覆盖 → 覆盖 baseline 寄存器 (与 handleBleWrite 同一解析链)
 *
 * ★ 箱头（moduleId === 'amp-head'）单独走 ampKnobResolve.ts：按 v3 型号的
 *   knobs[]/clip 现算寄存器地址。parameterMap.ts 里那两张 amp-head 公式表是
 *   v13 旧布局（GAIN→79 / VOLUME→81 / BASS→83），继续回退会把 GAIN 写成 DRIVE。
 *   因此箱头命中不到就【跳过】，绝不回退旧表。
 */
function setKnobValue(
  regs: Map<number, number>, moduleId: string, composed: string,
  knob: string, norm: number, ampIdx?: number,
): void {
  if (moduleId === 'amp-head' && ampIdx !== undefined) {
    const ampDefs = ampLinkedDefs(ampIdx, knob);
    if (!ampDefs) return;                       // 该型号没有这个旋钮 → 保持型号设计值
    for (const linked of ampDefs) {
      if (linked.regAddr === -1) continue;
      regs.set(linked.regAddr, typeof linked.compute === 'function'
        ? linked.compute(norm)
        : Math.round(norm * (linked.max - linked.min)) + linked.min);
    }
    return;
  }
  /* ★★ v3.78：过载改走**型号定义本身**（OD_MODELS.knobs），不再查 parameterMap 的旧组合键。
     原因：v3.78 把 subModels 统一成 key，旧组合键（`中频过载/TS808`）查不到 →
     会回退到模块级公式，把 TONE 写到 reg55，直接盖掉新设计的 EQ 段。
     现在只允许 **reg 型旋钮**（DRIVE / LEVEL / GAIN / VOLUME）被预设覆盖；
     db / hz 型（型号的音色旋钮）一律保持型号设计值 —— 新参数就是按型号定死的。 */
  if (moduleId === 'overdrive') {
    const od = OD_MODELS.find((m) => m.key === composed || m.name === composed || m.id === composed);
    const kd = od?.knobs.find((k) => k.name === knob || k.name.split(' ')[0] === knob);
    if (od && kd && kd.unit === 'reg') {
      regs.set(kd.addr, Math.round(kd.lo + norm * (kd.hi - kd.lo)));
    }
    return;
  }
  const linkedDefs = (composed ? getLinkedParamDefs(composed, knob) : null) ?? getLegacyLinkedDefs(moduleId, knob);
  if (linkedDefs && linkedDefs.length > 0) {
    for (const linked of linkedDefs) {
      if (linked.regAddr === -1) continue;
      regs.set(linked.regAddr, typeof linked.compute === 'function'
        ? linked.compute(norm)
        : Math.round(norm * (linked.max - linked.min)) + linked.min);
    }
    return;
  }
  const def = getParamDef(moduleId, knob);
  if (def) regs.set(def.regAddr, Math.round(norm * (def.max - def.min)) + def.min);
}

export function buildBuiltinPreset(spec: BuiltinPresetSpec): LocalPreset {
  const engineModules: Record<string, boolean | string | number> = {
    ...spec.modules,
    'analog-delay': spec.modules['delay'] ?? false,
    compressorSubModel: spec.subModels['compressor'] ?? '',
    overdriveSubModel: spec.subModels['overdrive'] ?? '',
    distSubModel: spec.subModels['dist'] ?? '',
    ampHeadSubModel: spec.subModels['amp-head'] ?? '',
    ampHeadV8Index: spec.v8Amp ?? 0,   // ★ v8 箱头索引
    chorusSubModel: spec.subModels['chorus'] ?? '',
  };
  /* ★ v8.1 C1：箱体 PEQ 改用【新箱体表】CAB_SETS 的 35 段 bands（reg 108–142 空间不变）。
     ★★ 2026-10-21（v3.48）：取 `sets[0]` —— 与首页 `applyCab(ci, mi=0)` 完全同一套曲线。
     原实现「优先 IR 拟合，其次第一条」在三个设计版箱体上等价（它们只有一套），
     但对多麦克风的箱体（如 Deluxe Reverb '66）会与首页默认选中的不是同一条，
     造成「预设与首页箱体不一致」。现统一按首页口径取第 0 条。
     无匹配 → 平坦中性兜底。 */
  let cabPeq: number[] | undefined;
  const cabName = spec.subModels['cabinet'];
  if (cabName) {
    const sets = CAB_SETS.filter((s) => s.cab === cabName);
    const pick = sets[0];
    if (pick && pick.bands.length) cabPeq = pick.bands;
  }
  void CABINET_PEQ;   // 老 NAM 库保留文件但不再被预设引用（@deprecated）
  const baseline = generatePresetRegisters(String(spec.slot), spec.name, spec.mode, engineModules, cabPeq);
  const regs = new Map<number, number>();
  for (const r of baseline) regs.set(r.regAddr, r.value);
  for (const [moduleId, knobs] of Object.entries(spec.knobs)) {
    const composed = spec.subModels[moduleId] ?? '';
    for (const [knob, norm] of Object.entries(knobs)) {
      setKnobValue(regs, moduleId, composed, knob, norm, moduleId === 'amp-head' ? spec.v8Amp : undefined);
    }
  }
  const registers: Record<number, number> = {};
  for (const [addr, val] of regs) registers[addr] = val;
  return {
    slot: spec.slot,
    name: spec.name,
    playMode: spec.mode,
    modules: spec.modules,
    subModels: spec.subModels,
    // BOOST 无寄存器 (PGA): 存入 knobValues 供加载时 writePGA + 恢复旋钮显示
    knobValues: { boost: { BOOST: spec.boost ?? 0.4 } },
    registers,
    savedAt: Date.UTC(2026, 7, 22),
  };
}

/* ══════════════════════════════════════════════════════════════════
 *  v10 音色表（2026-10-19 重做 · 16 条 = 12 吉他 + 4 贝斯）
 *
 *  · 全部按「当前 UI 参数」生成：
 *      箱头 → ampHeadDef v10（驱动链 v3 / 20 台）
 *      压缩 → COMP_MODELS     过载 → OD_MODELS
 *      合唱 / 延迟 / 混响 → CHORUS_PRESETS / DELAY_PRESETS / REVERB_PRESETS
 *  · 命名按常用音乐风格（用户要求「便于理解」），一条就是一个能直接弹的风格
 *  · 箱头旋钮归一化口径（与 UI 一致）：
 *      GAIN / DRIVE  0…1 = 0…类别上限 dB（CLEAN/BASS 20 · CRUNCH 25 · HIGH-GAIN 40）
 *      VOL1 / VOL2   0…1 = reg 166…286（−30.5…−0.5 dB）
 *      MASTER        0…1 = reg 100…500（−40.0…0.0 dB）
 *      音色四旋钮    0.5 = 型号设计值（noon），±0.2 内微调
 * ══════════════════════════════════════════════════════════════════ */
export interface ToneDef {
  name: string;
  /** ★ 2026-10-21（用户要求中英可切换）：英文名；界面 lang==='en' 时显示，缺省回退 name */
  nameEn?: string;
  /** AMP_MODELS 下标 */
  amp: number;
  /** CAB_SETS.cab */
  cab: string;
  mode?: PlayMode;
  boost?: number;
  gate?: number;
  /** COMP_MODELS.id */
  comp?: string;
  /** OD_MODELS.id */
  od?: string;
  /** 覆盖过载驱动量 reg49（0.5 dB/LSB） */
  odDriveDb?: number;
  /** 覆盖过载电平 reg51（0.25 dB/LSB，288 = 0 dB） */
  odLevelDb?: number;
  /** ★ 2026-11-04（用户拍板）：把该档过载踏板的 **TONE（hz）旋钮放到居中档**。
   *  OD 型号表里的 TONE 默认值是暗端（如 TS 默认 260 Hz 已低于量程下限），
   *  预设里必须显式写"量程中位"，UI 的双击居中才会落在同一档。 */
  odToneCenter?: boolean;
  /** CHORUS_PRESETS.name */
  chorus?: string;
  /** DELAY_PRESETS.name */
  delay?: string;
  /** ★ v3.54 组首底图：组内延迟参数统一值 [repeat 222, time 223]。
   *  组内四格必须逐字一致，否则组内切换会在算法运行中改 222/223
   *  → 实测会有 1–3 秒声音不正常（B1→B4 / C1→C4 就是这种情况）。 */
  delaySafe?: [number, number];
  /** REVERB_PRESETS.name */
  reverb?: string;
  /** 覆盖混响干湿比 reg229 */
  reverbMix?: number;
  /** 归一化旋钮（GAIN/DRIVE/VOL1/VOL2/TREBLE/BASS/MID/PRESENCE/MASTER） */
  ampKnobs: Record<string, number>;
  /** ★ 2026-11-04（用户拍板）：**显式 VOL1/VOL2 目标（dB）**，按 2026-11-04 的音量规范：
   *   CLEAN/DRIVE = −3（两 VOL 合计 ≤ −6）；RHYTHM/LEAD = −6（合计 ≤ −12）。
   *   只写"几 dB"，buildTone 会换算成 reg66/81；不再用 volLiftDb 的相对抬升。 */
  vol1Db?: number;
  vol2Db?: number;
  /** ★ 2026-11-04（用户拍板）：该档 **239 箱头总音量的显式目标值（dB）**。
   *  给定时直接采用（夹 −40…0），不再走"净增益封顶 19 dB"的自动计算 ——
   *  用于少数需要单独校音的档（Twin Solo / IIC+ Rhythm/Lead / AC15 Lead …）。 */
  masterDb?: number;
}

/** dB → 箱头 GAIN / DRIVE 归一化（行程 = 类别上限） */
const gN = (db: number, ampIdx: number) => {
  const lim = AMP_MODELS[ampIdx]?.limit ?? 40;
  return Math.max(0, Math.min(1, db / lim));
};
/** dB → MASTER 归一化（reg 100…500 ↔ −40.0…0.0 dB） */
const mN = (db: number) => (Math.round(500 + db * 10) - 100) / 400;
/** dB → VOL1 / VOL2 归一化（reg 166…288 ↔ −30.5…0.0 dB）
 *  ★ 2026-10-21：上限从 286 修正为 288（固件 288 = 0 dB），预设改用 dB 直接指定，
 *    避免「归一化 → 寄存器 → 显示」三次取整带来的零点几 dB 漂移。 */
const vN = (db: number) => (Math.round(288 + db / 0.25) - 166) / 122;
/** ★ 2026-10-20 用户要求：16 条预设立库的 MASTER 统一拉到 0 dB（最大），
 *  避免不同箱头的出厂 master 差异污染响度对比与频响测量。
 *
 * ★★ 2026-10-21（v3.43）：9 条过载预设 odDriveDb / odLevelDb 各 +1 dB。
 *   原因：过载模块补齐高低通框架后（输入高通 + 削波前低通 + 16.3 kHz 输出收顶），
 *   削波器看到的低频谱与输出顶端的能量都比旧版少 —— 同样的 drive 打磨量变小、
 *   整链电平也比旧版低。+1 dB drive 补偿打磨量，+1 dB level 补偿能量损失，
 *   使 9 条过载预设与 7 条清音预设之间的响度关系保持不变。
 *   箱头仍全部用 v10（amp 下标 0–19）—— 用户拍板「v10 听感更好」。
 *   ⚠ 这是未试听前的统一补偿量，A/B 后如需微调只动这两列，勿动其余字段。 */

/** ★ v3.54 组首底图时代的「B/C 组延迟统一值」—— **v3.57 起停用**（用户拍板 K3）：
 *  改为每个频道表带自己的延迟参数，由固件加载该频道时整表写入。
 *  常量保留仅作记录，不再挂到任何 ToneDef 上。 */
const DELAY_SAFE_BC: [number, number] = [30, 375];

/* ══════════════════════════════════════════════════════════════════
 * ★★ v3.56（2026-10-23 用户拍板 J1–J4）：组内 FX 参数唯一化
 *   ⚠️ v3.57（同日 K3）**已停用自动转换**：不再强制统一，仅保留本函数供自检/诊断使用。
 *
 * 规则 R1：同组 4 格的 216–220（合唱）、222–223（延迟）逐条相同。
 * 取值 R2：以「组内第一个启用该效果器的格」为准；整组都没启用 → 取组内首格。
 * 开关 R3：215 / 221 **不统一** —— 每格按自己是否使用写 0（开）/ 1（旁路）。
 *           所以组首格自己用合唱（B1）、组内末格自己用延迟（B4）都合法：
 *           组首格不用 → 写 1 预置旁路；用 → 写 0 直接开。
 *
 * 为什么必须做：组内切换只翻 215 / 221 两个开关，参数一条都不写。若四格参数不同，
 * 切到目标格时那个不同的值就得在算法运行中被打进去 —— 实测会有 1–3 秒声音不正常。
 *
 * 现状：四组本来就一致（CH_SAFE 恰好等于 CE-2 模板值），所以本函数目前是**恒等变换**。
 * 它的作用是把「巧合」变成「机制」：换合唱型号、用户改过参数、社区载入音色之后仍然成立。
 * ══════════════════════════════════════════════════════════════════ */
export const GROUP_FX_CHORUS_ADDRS = [216, 217, 218, 219, 220];
export const GROUP_FX_DELAY_ADDRS = [222, 223];
export const GROUP_FX_ADDRS = [...GROUP_FX_CHORUS_ADDRS, ...GROUP_FX_DELAY_ADDRS];

/** 把任意 1–4 格的预设集合按「组内 FX 唯一」重算并返回副本（不落盘，调用方决定存不存） */
export function unifyGroupFx(presets: LocalPreset[]): LocalPreset[] {
  const out = presets.map((p) => ({ ...p, registers: { ...(p.registers ?? {}) } }));
  const slots = out.map((p) => p.slot);
  if (!slots.length) return out;
  const g = Math.floor((Math.min(...slots) - 1) / 4);
  const idx = [0, 1, 2, 3]
    .map((k) => out.findIndex((p) => p.slot === g * 4 + k + 1))
    .filter((i) => i >= 0);
  if (idx.length < 2) return out;

  const pick = (mod: string, addrs: number[]) => {
    const src = idx.find((i) => (out[i].modules ?? {})[mod]) ?? idx[0];
    for (const a of addrs) {
      const v = out[src].registers[a];
      if (v === undefined) continue;
      for (const i of idx) out[i].registers[a] = v;
    }
  };
  pick('chorus', GROUP_FX_CHORUS_ADDRS);
  pick('delay', GROUP_FX_DELAY_ADDRS);
  return out;
}

export const V10_TONES: ToneDef[] = [
  /* ════════════════════════════════════════════════════════
   * ★★ v3.52（2026-10-22）—— 16 格改为「编组 = 一套箱头平台」
   *
   *   组内四个格子共用同一台箱头 + 同一个箱体，只改 GAIN / DRIVE /
   *   VOL / 过载 / 空间类参数 —— 这是组内切换能快 3–8 倍的唯一来源
   *   （箱头箱体不变 = 硬件不重建模型）。
   *
   *   A 组  **线材直通四档**（DIRECT / DI-PASSIVE / CABLE-20FT / CABLE-10FT-SILVER）
   *         —— 不再是箱头音色；16 格的寄存器统一由 data/firmwareBank.ts 提供
   *            （= 固件 tone_channels_v1.c），V10_TONES 只负责槽 5–16 的界面骨架。
   *   B 组  Vox AC15   + Marshall 1960 4x12 英式   清音 / 蓝调 / 节奏 / 主音
   *   C 组  Mark IIC+  + Mesa ST 4x12   清音 / 过载 / 节奏 / 主音
   *   D 组  Ampeg SVT  + SVT 8x10       清音 / 过载 / 节奏 / 主音（贝斯）
   *
   * ★ 驱动口径（用户 2026-10-22 拍板）：**三级总驱动**
   *     D = 过载踏板 drive + 箱头 GAIN + 箱头 DRIVE
   *   削波标尺：≤10 单级临界 · ≤20 干净 · 30 轻过载 · 40 摇滚 ·
   *            50–60 较重失真 · 70 撕裂上限（超过就糊）
   *   A 组 D：5 / 6 / 30　B 组 D：6 / 18 / 23 / 62　
   *   C 组 D：12 / 32 / 48 / 70　D 组 D：4 / 11 / 16 / 18
   *
   * ★ 硬规则（从 v3.49 继承）：
   *   ① 音调四旋钮一律 0.5 = 型号设计值，与首页加载同一台箱头完全一致。
   *   ② 箱体取 CAB_SETS.filter(cab===name)[0]，与首页 applyCab(mi=0) 同一套曲线。
   *   ③ 结束处不写 DC1(65) / DC2(80) —— 隐藏参数，必须保持型号设计值。
   *   ④ VOL1 / VOL2 用 vN(dB) 直接指定，不用百分比。
   *   ⑤ 同组箱头箱体必须逐字一致（含 cab 字符串）—— 差一个字符就退化成全量加载。
   * ═══════════════════════════════════════════════════════ */

  /* ★★★ 2026-10-31（用户拍板）：**第 1 组不再是箱头音色，改为线材直通四档**
   *   （DIRECT / DI-PASSIVE / CABLE-20FT / CABLE-10FT-SILVER），寄存器由
   *   data/cableBank.ts 从固件频道表导出 —— 所以原来这里的 Twin Clean/Funk/Drive
   *   三条整块删除。V10_TONES 现在只描述槽 5–16（AC15 / IIC+ / SVT 三组），
   *   槽 1–4 的寄存器由 data/firmwareBank.ts 提供。
   *   ⛔ 不要把 Twin 三条加回来：预设库 1a–1d 必须与硬件 A1–A4 逐条一致，
   *      否则点一下 1b 就把硬件 A2 的线材曲线覆盖成 Twin 箱头，"直通"立刻失效。 */

  /* ★★★ 2026-10-31：IIC+ 的箱体名原先写 'Mesa ST 4x12'，但 cabinetDef 的 CAB_SETS
     里没有这个名字（库里叫 'ST 4x12'）→ 匹配不到 → 108–142 全走中性值，
     实测 35 段里 **0 段非零增益** = 等于没箱体。UI 卡片写着 Mesa ST，声音却没有箱体，
     与 AC15/SVT 明显不是一套。现改为库里真实存在的 'ST 4x12'。

  ── B 组 · Fender Twin Reverb（**与我的音色库 TWIN 组对调**，2026-11-04） ── */
  { name: 'Twin Natural', amp: 0, cab: "Twin '71", boost: 0.26, gate: 0.20, vol1Db: -3, masterDb: -3,
    comp: 'la2a', reverb: 'Spring', reverbMix: 12,
    ampKnobs: { GAIN: gN(4, 0), VOL1: vN(-3.0), TREBLE: 0.50, BASS: 0.50, MID: 0.50, PRESENCE: 0.50, MASTER: mN(0) } },

  { name: 'Twin Bright', amp: 0, cab: "Twin '71", boost: 0.30, gate: 0.22, vol1Db: -3, masterDb: -3,
    comp: 'cs2', chorus: 'CE-2', reverb: 'Plate', reverbMix: 11,
    ampKnobs: { GAIN: gN(6, 0), VOL1: vN(-3.4), TREBLE: 0.53, BASS: 0.50, MID: 0.50, PRESENCE: 0.53, MASTER: mN(0) } },

  { name: 'Twin Groove', amp: 0, cab: "Twin '71", boost: 0.30, gate: 0.25, vol1Db: -3, masterDb: -6,
    comp: 'cs2', od: 'timmy_g', odDriveDb: 20, odLevelDb: -3, reverb: 'Room', reverbMix: 10,
    ampKnobs: { GAIN: gN(15, 0), VOL1: vN(-3.8), TREBLE: 0.51, BASS: 0.50, MID: 0.50, PRESENCE: 0.51, MASTER: mN(0) } },

  { name: 'Twin Lead', amp: 0, cab: "Twin '71", boost: 0.5, gate: 0.28, vol1Db: -6, masterDb: -6,
    comp: 'la2a', od: 'ocd_g', odDriveDb: 30, odLevelDb: -3.5, delay: 'Digital', reverb: 'Hall', reverbMix: 16,
    ampKnobs: { GAIN: gN(18, 0), VOL1: vN(-4.4), TREBLE: 0.52, BASS: 0.50, MID: 0.52, PRESENCE: 0.52, MASTER: mN(0) } },

  /* ── C 组 · Mesa Mark IIC+（HIGH-GAIN，limit 40） ─────────────── */
  { name: 'IIC+ Clean', amp: 11, cab: 'ST 4x12', boost: 0.25, gate: 0.22, vol1Db: -3, vol2Db: -3, masterDb: -3,
    comp: 'la2a', reverb: 'Plate', reverbMix: 12,
    /* ★ C1 必须显式 DRIVE=0：Mark IIC+ 型号自带 DRIVE 设计值（≈32 dB），
       不覆盖会直接变重失真 */
    ampKnobs: { GAIN: gN(12, 11), DRIVE: gN(0, 11), VOL1: vN(-4.0), VOL2: vN(-8.0),
      TREBLE: 0.5, BASS: 0.5, MID: 0.5, PRESENCE: 0.5, MASTER: mN(0) } },

  { name: 'IIC+ Drive', amp: 11, cab: 'ST 4x12', boost: 0.32, gate: 0.30, vol1Db: -3, vol2Db: -3, masterDb: -6,
    od: 'ts808_g', odDriveDb: 10, odLevelDb: -2, odToneCenter: true,
    reverb: 'Spring', reverbMix: 12,
    ampKnobs: { GAIN: gN(18, 11), DRIVE: gN(10, 11), VOL1: vN(-5.5), VOL2: vN(-11.0),
      TREBLE: 0.5, BASS: 0.5, MID: 0.5, PRESENCE: 0.5, MASTER: mN(0) } },

  /* ★ v3.55：C3 节奏加失真量 → GAIN 26→28、DRIVE 22→24，总驱动 D = 52（原 48）。 */
  { name: 'IIC+ Rhythm', amp: 11, cab: 'ST 4x12', boost: 0.5, gate: 0.40, vol1Db: -6, vol2Db: -6, masterDb: -6,
    reverb: 'Room', reverbMix: 10,
    ampKnobs: { GAIN: gN(30, 11), DRIVE: gN(24, 11), VOL1: vN(-7.0), VOL2: vN(-14.0),
      TREBLE: 0.5, BASS: 0.52, MID: 0.48, PRESENCE: 0.52, MASTER: mN(0) } },

  /* ★ C4 总驱动 74 = GAIN 34 + DRIVE 30 + TS 10（v3.55：32/28 → 34/30）。
     HIGH-GAIN 量程 40 还没到顶；74 已高于记忆里的「撕裂上限 70」，留作听感上限试验值。 */
  { name: 'IIC+ Lead', amp: 11, cab: 'ST 4x12', boost: 0.45, gate: 0.45, vol1Db: -6, vol2Db: -6, masterDb: -8,
    od: 'ts808_g', odDriveDb: 10, odLevelDb: -2.5, odToneCenter: true,
    delay: 'Digital', reverb: 'Hall', reverbMix: 16,
    ampKnobs: { GAIN: gN(34, 11), DRIVE: gN(30, 11), VOL1: vN(-8.0), VOL2: vN(-16.0),
      TREBLE: 0.5, BASS: 0.52, MID: 0.48, PRESENCE: 0.52, MASTER: mN(0) } },

  /* ── D 组 · Ampeg SVT（BASS，limit 20） ────────────────────────
   * ★ v3.55（用户 2026-10-22）：D 组按**贝斯演奏方式**命名，不用吉他的
   *   「清音 / 过载 / 节奏 / 主音」；过载量整体压低，贝斯低频一糊就散了。
   *   指弹 4 → 击弦 6 → 拨片 10 → 失真 14（原 4 / 11 / 16 / 18）。 */
  { name: 'SVT Finger', amp: 15, cab: 'SVT 8x10', mode: 'bass', boost: 0.28, gate: 0.22, masterDb: -4,
    comp: 'bassist', reverb: 'Room', reverbMix: 6,
    ampKnobs: { GAIN: gN(4, 15), DRIVE: gN(0, 15), VOL1: vN(-1.8), VOL2: vN(-3.8),
      TREBLE: 0.5, BASS: 0.5, MID: 0.5, PRESENCE: 0.5, MASTER: mN(0) } },

  { name: 'SVT Slap', amp: 15, cab: 'SVT 8x10', mode: 'bass', boost: 0.30, gate: 0.24, masterDb: -4,
    comp: 'bassist', reverb: 'Room', reverbMix: 6,
    ampKnobs: { GAIN: gN(6, 15), DRIVE: gN(0, 15), VOL1: vN(-2.0), VOL2: vN(-4.0),
      TREBLE: 0.58, BASS: 0.5, MID: 0.46, PRESENCE: 0.54, MASTER: mN(0) } },

  { name: 'SVT Pick', amp: 15, cab: 'SVT 8x10', mode: 'bass', boost: 0.32, gate: 0.26, masterDb: -4,
    comp: 'bassist', od: 'b3k', odDriveDb: 4, odLevelDb: -3,
    reverb: 'Room', reverbMix: 8,
    ampKnobs: { GAIN: gN(6, 15), DRIVE: gN(0, 15), VOL1: vN(-2.2), VOL2: vN(-4.2),
      TREBLE: 0.54, BASS: 0.5, MID: 0.5, PRESENCE: 0.52, MASTER: mN(0) } },

  /* ★ D4 不加混响（用户 2026-10-23：D 组前三格加微量混响，最后一个不加）——
     失真叠混响在低频会糊成一片，这一档保持干声。 */
  { name: 'SVT Drive', amp: 15, cab: 'SVT 8x10', mode: 'bass', boost: 0.34, gate: 0.26, masterDb: -4,
    comp: 'bassist', od: 'b3k', odDriveDb: 8, odLevelDb: -3,
    chorus: 'chorus-ce2',
    ampKnobs: { GAIN: gN(6, 15), DRIVE: gN(0, 15), VOL1: vN(-2.4), VOL2: vN(-4.4),
      TREBLE: 0.54, BASS: 0.5, MID: 0.5, PRESENCE: 0.52, MASTER: mN(0) } },
];

/** 单条音色定义 → 预设（模块开关 / 子型号 / 寄存器全部按当前 UI 型号表生成） */
function buildTone(t: ToneDef, slot: number): LocalPreset {
  const mode: PlayMode = t.mode ?? 'guitar';
  const ampModel = AMP_MODELS[t.amp] ?? AMP_MODELS[0];
  const compModel = t.comp ? COMP_MODELS.find((m) => m.id === t.comp) : undefined;
  /* ★ 2026-11-09（用户拍板）：**取消过载模块** —— 42–56 已并入箱头型号的第 1 级，
     预设不再带 OD 踏板，也不再写 42（模块旁路位）。t.od / odDriveDb 等字段保留但不再生效。 */
  const odModel = undefined as (typeof OD_MODELS)[number] | undefined;
  /* ★ v3.78：预设引用统一按 key 查找，同时兼容旧 name 写法 */
  const pick = <T extends { key: string; name: string }>(list: T[], v?: string): T | undefined =>
    (v ? list.find((p) => p.key === v || p.name === v) : undefined);
  const chPreset = pick(CHORUS_PRESETS, t.chorus);
  const dlPreset = pick(DELAY_PRESETS, t.delay);
  const rvPreset = pick(REVERB_PRESETS, t.reverb);

  const modules: Record<string, boolean> = {
    'noise-gate': true, boost: true,
    compressor: !!compModel, overdrive: !!odModel,
    'amp-head': true, cabinet: true,
    chorus: !!chPreset, delay: !!dlPreset, reverb: !!rvPreset,
  };
  const subModels: Record<string, string> = {
    'amp-head': ampModel.name,
    compressor: compModel?.name ?? '',
    overdrive: odModel?.name ?? '',
    chorus: chPreset?.name ?? '',
    delay: dlPreset?.name ?? '',
    reverb: rvPreset?.name ?? '',
    cabinet: t.cab,
  };
  const base: GroupBase = {
    mode, boost: t.boost ?? (mode === 'bass' ? 0.5 : 0.35),
    modules, subModels, knobs: {}, v8Amp: t.amp,
  };
  const preset = buildGroupPreset(base, slot, t.name, modules, undefined, undefined, { v8Amp: t.amp, cab: t.cab });
  const regs: Record<number, number> = { ...preset.registers };

  /* ① 箱头：整段用当前型号表覆盖（含 GAIN/DC1/VOL1/DRIVE/DC2/VOL2 与全部 PEQ 段） */
  for (const [a, v] of Object.entries(ampModel.regs)) regs[Number(a)] = v;
  /* MASTER（reg 239）不在型号表里 —— 改由函数末尾的「统一音量规则」计算，
     见 ⑥ 音量规则。这里不再按 ampKnobs.MASTER 落位。 */

  /* ② 压缩器 / 过载：整段用当前型号表覆盖，再按需微调驱动量 */
  if (compModel) for (const [a, v] of Object.entries(compModel.regs)) regs[Number(a)] = v;
  if (odModel) {
    for (const [a, v] of Object.entries(odModel.regs)) regs[Number(a)] = v;
    if (t.odDriveDb !== undefined) regs[49] = Math.max(0, Math.min(92, Math.round(t.odDriveDb * 2)));
    if (t.odLevelDb !== undefined) regs[51] = Math.max(248, Math.min(288, Math.round(288 + t.odLevelDb * 4)));
    /* ★ 2026-11-04：TONE(hz) 旋钮放到量程中位（与 UI 双击居中的 0.5 完全同一档）。
       只改频点字段，type/gain/Q/S 原样保留。 */
    if (t.odToneCenter) {
      const tk = odModel.knobs.find((kk) => kk.name === 'TONE' && kk.unit === 'hz');
      if (tk) {
        const lo = Math.max(0, PEQ_FREQ_TABLE.findIndex((f) => f >= tk.lo));
        let hi = PEQ_FREQ_TABLE.findIndex((f) => f > tk.hi);
        hi = hi < 0 ? PEQ_FREQ_TABLE.length - 1 : Math.max(lo, hi - 1);
        const mid = Math.round(lo + (hi - lo) / 2);
        const p = parsePEQData(regs[tk.addr] ?? 0);
        regs[tk.addr] = buildPEQData(p.type, mid, p.gain, p.q, p.s);
      }
    }
  }

  /* ③ 空间类：合唱 216–220 / 延迟 222–223 / 混响 225–229
     ★ 2026-10-21（用户实测「载入预设后合唱都是最大值」）：
       presetEngine 的合唱默认值走 dflts 归一化（chLevel × 20 / × 39 / × 9），
       UI 侧一旦带出 1.0 就会写成量程顶格。预设层改为**无条件**先落一组安全值，
       再由所选模板覆盖 —— 这样任何预设载入后都不会出现顶满。 */
  const CH_SAFE: Record<number, number> = { 216: 20, 217: 4, 218: 5, 219: 2, 220: 2 };  /* ★ 2026-10-31：LEVEL 最大 20 */
  for (const [a, v] of Object.entries(CH_SAFE)) regs[Number(a)] = v;
  if (chPreset) for (const [a, v] of Object.entries(chPreset.regs)) regs[Number(a)] = v;
  if (dlPreset) for (const [a, v] of Object.entries(dlPreset.regs)) regs[Number(a)] = v;
  /* ★ v3.54（组首底图）：组内延迟参数统一。B/C 组四格一律 30/375（= Digital 模板值），
     这样组内切换只翻 221 开关、不动 222/223 —— 打开延迟时读到的是已稳定的参数。 */
  if (t.delaySafe) { regs[222] = t.delaySafe[0]; regs[223] = t.delaySafe[1]; }
  if (rvPreset) {
    for (const [a, v] of Object.entries(rvPreset.regs)) regs[Number(a)] = v;
    if (t.reverbMix !== undefined) regs[229] = Math.max(0, Math.round(t.reverbMix));
  }

  /* ④ 箱头旋钮覆盖（归一化口径与 UI 一致） */
  const twoStage = ampModel.cls === 'CRUNCH' || ampModel.cls === 'HIGH-GAIN' || ampModel.cls === 'BASS';
  for (const [knob, norm] of Object.entries(t.ampKnobs)) {
    if ((knob === 'DRIVE' || knob === 'VOL2') && !twoStage) continue;
    const defs = ampLinkedDefs(t.amp, knob);
    if (!defs) continue;
    for (const d of defs) {
      if (d.regAddr === -1) continue;
      regs[d.regAddr] = typeof d.compute === 'function'
        ? d.compute(norm)
        : Math.round(norm * (d.max - d.min)) + d.min;
    }
  }

  /* ④-b ★ 2026-11-04（用户拍板）：**显式 VOL 目标**（CLEAN/DRIVE −3、RHYTHM/LEAD −6）。
     口径：reg 288 = 0 dB，0.25 dB/LSB（reg 166…288 = −30.5…0 dB）。
     必须在 ⑥ 音量规则之前做 —— 改 VOL 会改变 totalD，239 要按新的 totalD 计算。 */
  if (t.vol1Db !== undefined) regs[66] = Math.round(288 + t.vol1Db * 4);
  if (twoStage && t.vol2Db !== undefined) regs[81] = Math.round(288 + t.vol2Db * 4);

  /* ⑤ 噪声门阈值（★ 2026-10-20 用户要求「预设要含噪声门/压缩/激励」）
     —— 此前 `ToneDef.gate` 定义了却从没使用，16 条预设的 reg1 全是 3。
     寄存器量纲 0…100（UI 显示 0…10，步进 10），所以按 10 对齐。 */
  const gateNorm = Math.max(0, Math.min(1, t.gate ?? 0.2));
  const gateReg = Math.round((gateNorm * 100) / 10) * 10;
  regs[1] = Math.max(0, Math.min(100, gateReg));

  /* ★★★ 2026-10-31（用户拍板）：**统一音量规则 —— 增益先算总和，再在箱头总音量上衰减**
   *
   *   口径（用户原话："过载+箱头的所有增益核算到音量衰减之后，再看增益值，
   *   在箱头总音量做相应的衰减，大约衰减 80%"）：
   *     D = 过载 drive + GAIN + DRIVE **− VOL1 − VOL2**（全部换成 dB，VOLUME 是负值）
   *        · reg49（OD drive）0.5 dB/LSB，且过载模块开着（42=0）才算；
   *        · reg64（GAIN）0.5 dB/LSB；
   *        · reg79（DRIVE）0.5 dB/LSB，只有两级箱头才有；
   *        · reg66（VOL1）/ reg81（VOL2）：dB = (reg−288)/4，范围 −30.5…0 dB。
   *     超出基准 30 dB 的部分（30 dB = 轻过载，再往上都是靠压缩换响度）
   *       → MASTER 衰减 **80%**：masterDb = −0.8 × (D − 30)，夹在 −40…0 dB。
   *
   *   为什么放最后算：GAIN / DRIVE / OD 都是前面各段写进去的，必须等它们全部落位
   *   才能得到真实的总增益。这样「预设切过去」和「手动拧旋钮」用的是同一把尺子。
   *
   *   ⚠️ reg 239 的下发顺序在固件侧被提前（tone_addr_seq 第 2 位）——先衰减再加增益，
   *      中间不会出现"增益已经顶上去、音量还没降"的爆音瞬间。 */
  {
    /* 增益三级（正） */
    const gainDb = Math.max(0, (regs[64] ?? 0) / 2);                       /* GAIN 0.5 dB/LSB */
    const driveDb = twoStage ? Math.max(0, (regs[79] ?? 0) / 2) : 0;       /* DRIVE 0.5 dB/LSB */
    /* ★ 2026-11-09：原「过载踏板 reg49」改为**箱头第 1 级固定驱动**（型号自带，0.5 dB/LSB），
       与第 1 级音量 reg51 一起并入净增益，否则 239 会少算这一级的增益。 */
    const odDb = Math.max(0, (regs[49] ?? 0) / 2);
    const lvl1Db = ((regs[51] ?? 288) - 288) / 4;
    /* ★★★ 2026-10-31（用户指出）：**必须把三级 VOLUME 的衰减一起算进去**，
     *   只加不减会把总增益算高，MASTER 就衰减过头（听起来音量偏小）。
     *   VOL1(66) / VOL2(81)：reg 166…288 = −30.5…0 dB，步进 0.25 dB
     *   → dB = (reg − 288) / 4（负值）。单级箱头只有 VOL1。 */
    const vol1Db = ((regs[66] ?? 288) - 288) / 4;
    const vol2Db = twoStage ? ((regs[81] ?? 288) - 288) / 4 : 0;
    /* 净增益 = 所有增益 + 所有音量衰减（VOL 是负的） */
    const totalD = gainDb + driveDb + odDb + lvl1Db + vol1Db + vol2Db;
    /* ★★★ 2026-11-04（用户拍板）：**净增益封顶 19 dB**（Twin 主奏实测标定）。
     *
     *   用户实测：Twin 主奏（总增益 34 dB）把箱头总音量调到 **−15 dB** 时声音正常。
     *   ⇒ 目标净增益上限 = 34 − 15 = **19 dB**，规则统一为：
     *       masterDb = clamp(19 − totalD, −40, 0)
     *     · totalD ≤ 19（清音/轻过载）：master 0 dB，**不额外压音量**；
     *     · totalD > 19（重过载/高增益）：只把超出 19 dB 的部分在 239 上衰减。
     *   这样既复现 Twin 主奏 −15 的听感，又不会把清音档一起压小。
     *   本地库与预设库共用这一条规则，固件出厂表也按它重新生成。 */
    const autoDb = Math.max(-40, Math.min(0, 19 - totalD));
    const masterDb = t.masterDb !== undefined
      ? Math.max(-40, Math.min(0, t.masterDb))     /* 人工指定优先（用户逐档校音） */
      : autoDb;
    regs[AMP_MASTER_ADDR] = Math.round(500 + masterDb * 10);   /* reg = 500 + dB×10 */
  }

  return {
    ...preset,
    registers: regs,
    /* ★ 2026-10-21（用户要求中英可切换）：英文名随预设一起落库 */
    ...(t.nameEn ? { nameEn: t.nameEn } : {}),
    /* 门阈值同时进 knobValues —— `MODULE_PARAM_MAP['noise-gate']` 的反解口径与 UI 不同，
       光靠寄存器反解会让旋钮位置顶满，这里显式给归一值。 */
    knobValues: { ...preset.knobValues, 'noise-gate': { THRESHOLD: gateNorm } },
  };
}

/**
 * ★★ v3.54（2026-10-22 用户拍板）组首底图：A1 = 组首格（A2）全图 + 全旁路 + 系统中性值。
 *
 * 为什么：A1 原本只有 18 个寄存器，从 A1 切到 A2 等于把箱头 34 段 + 箱体 35 段整段重写
 * （实测 95 条 / ≈2060ms）。改成"先把 A2 的参数全部预置好、但全部旁路"之后，
 * A1→A2 只剩 6 条开关，≈280ms，而且型号没变 → 不需要静音。
 *
 * 用户实测依据（C1 已关闭）：所有模块开 bypass 时是直通、无音染，常驻参数没问题；
 * 合唱/延迟必须这样预置 —— 否则在算法运行中写 216–223 会有 1–3 秒声音不正常。
 *
 * 口径：
 *   · modules 仍是全 false（开关只由 modules 决定，见 switchPlan）
 *   · subModels 取 A2 的 —— 供 needSwitchMute 判定，A1⇄A2 不算换型号
 *   · 239（箱头 MASTER）**写 0 dB（reg 500）**：v3.55 起直出档也锁输出电平基准
 *     （v3.54 是完全不写，代价是 A1→A2 多 1 条差异、电平跟硬件残留走）
 */
export function makeBypassPreset(first: LocalPreset | undefined): LocalPreset {
  const registers: Record<number, number> = {
    ...(first?.registers ?? {}),
    ...NEUTRAL_SYSTEM_REGS,
    ...A1_BYPASS_ALL,
  };
  delete registers[AMP_MASTER_ADDR];   // 先剔掉，下面显式落 0 dB
  /* ★ v3.55（用户 2026-10-22 拍板 E1）：A1 写 MASTER = 0 dB（reg 500）。
     上一版沿用「箱头关就不写箱头参数」的口径完全不写 239，代价是 A1→A2 多 1 条差异，
     而且直出档输出电平跟着硬件残留的 master 走。现在写死 0 dB，A1⇄A2 电平基准一致。 */
  registers[AMP_MASTER_ADDR] = 500;
  /* ★ v3.55（用户 2026-10-23 拍板 F1）：噪声门阈值跟随组首格（A2）。
     NEUTRAL_SYSTEM_REGS 写的是中性 3，A2 是 20 —— 差这一条会让 A1→A2 多写 20 ms。
     门本身是关的，取 A2 的值听感不变，但「A1 参数完全等于 A2」这条语义成立。 */
  if (first?.registers?.[1] !== undefined) registers[1] = first.registers[1];
  applyWhitelistPolicy(registers);
  return {
    ...BYPASS_PRESET,
    subModels: { ...(first?.subModels ?? {}) },
    registers,
  };
}

/**
 * ★★★ 2026-10-31（用户拍板·第二次修正）：**预设库 16 格 = 固件出厂 16 档**。
 *
 *   1a–1d 线材直通四档 / 2a–2d AC15 / 3a–3d IIC+ / 4a–4d SVT
 *   —— 寄存器与模块开关逐条取自 data/firmwareBank.ts（= 固件 tone_channels_v1.c），
 *   所以「App 点一格」与「设备开机落在该频道」是同一个音色。
 *
 *   骨架（子型号名 / 旋钮归一值）仍由 buildTone(V10_TONES) 提供，只负责界面显示；
 *   真正下发的是 FW_BANK 的 117 条寄存器。界面旋钮位置与固件参数的细微差异不影响发声。
 *
 *   ⛔ 本地库是另一套 16 个音色（Twin / JTM45 / 6505 / L4），不要拿它覆盖这里，
 *      也不要拿这里去覆盖本地库 —— 两边独立（用户 2026-10-31 明确要求）。
 */
function buildFwPreset(ch: FwChannel, slot: number, skeleton?: LocalPreset): LocalPreset {
  const registers: Record<number, number> = { ...ch.registers };
  applyWhitelistPolicy(registers);
  /* ★ 2026-11-16：253（限幅旁路）不在白名单里，会被上面的策略删掉 ——
     A 组必须写 1、其余组写 0，所以这里按固件表把 253 补回来。 */
  if (ch.registers[253] !== undefined) registers[253] = ch.registers[253];
  if (skeleton) {
    /* 2a–4d：沿用骨架的 subModels / knobValues（界面显示型号与旋钮位置），
       但 modules 与 registers 一律用固件值 —— 声音以固件为准。 */
    return {
      ...skeleton,
      slot,
      name: ch.name,
      nameEn: ch.name,
      modules: { ...ch.modules },
      registers,
    };
  }
  /* 1a–1d：线材档没有箱头/箱体型号，subModels 留空 */
  return {
    slot,
    name: ch.name,
    nameEn: ch.name,
    playMode: 'guitar' as PlayMode,
    modules: { ...ch.modules },
    subModels: {},
    knobValues: {},
    registers,
    savedAt: Date.UTC(2026, 9, 31),
  };
}

/**
 * 25+25 过渡预设：直接使用新数据层的 baseRegs，不经过旧 ampHeadDef / CAB_SETS。
 *
 * 只有 amp / cab 两个模块开启；空间类全旁路，避免旧预设的 FX 参数残留。
 * 用户提供新预设文件后，替换 `presets25.ts` 即可，不改本构建函数。
 */
function buildPreset25(spec: Preset25Spec): LocalPreset {
  const amp = TONE25_HEADS.find((h) => h.key === spec.ampKey) ?? TONE25_HEADS[0];
  const cab = TONE25_CABS.find((c) => c.key === spec.cabKey) ?? TONE25_CABS[0];
  const cabRegs: Record<number, number> = { 107: 0, 254: 47, 255: 1, 256: 150, 257: 40, 258: 12, 259: 0 };
  for (let i = 0; i < Math.min(35, cab.bands.length); i++) cabRegs[108 + i] = cab.bands[i];
  const registers: Record<number, number> = {
    0: 1, 7: 1, 42: 1, 215: 1, 221: 1, 224: 1,
    ...amp.baseRegs,
    ...cabRegs,
    /* ★ 2026-11-16：253 与组号绑定 —— 2a–4d 属于第 2/3/4 组，必须写 0
       （A 组 1a–1d 才写 1，见 firmwareBank 的 A 组补丁）。 */
    253: 0,
  };
  /* ★ 2026-11-16：25+25 骨架补上箱头总音量与激励器。
     reg239 = 500 + dB×10；boost 走 PGA（无寄存器），由 modules.boost 门控。 */
  if (spec.masterDb !== undefined) {
    registers[239] = Math.max(100, Math.min(500, Math.round(500 + spec.masterDb * 10)));
  }
  const boostNorm = spec.boost !== undefined && Number.isFinite(spec.boost)
    ? Math.max(0, Math.min(1, spec.boost))
    : undefined;
  return {
    slot: spec.slot,
    name: spec.name,
    nameEn: spec.name,
    playMode: spec.mode,
    modules: {
      'noise-gate': false,
      boost: boostNorm !== undefined && boostNorm > 0,
      compressor: false,
      overdrive: false,
      'amp-head': true,
      cabinet: true,
      chorus: false,
      delay: false,
      reverb: false,
    },
    subModels: {
      'amp-head': amp.key,
      cabinet: cab.key,
      compressor: '',
      overdrive: '',
      chorus: '',
      delay: '',
      reverb: '',
    },
    knobValues: boostNorm !== undefined ? { boost: { BOOST: boostNorm } } : {},
    registers,
    savedAt: Date.UTC(2026, 10, 15),
  };
}

export function buildBuiltinPresets(): LocalPreset[] {
  /* ★★★ 2026-10-31（用户拍板·第二次调整）：**2a–4d 重新由箱头定义实时生成**。
   *
   *   原因：这一轮改了箱头（N8 第 9 段 130 Hz 提厚、JTM45 去闷、统一音量规则），
   *   若预设仍读固定表 FW_BANK，新箱头永远进不到预设里 —— 用户听到的还是旧参数。
   *
   *   现在：
   *     1a–1d = 线材直通四档，仍取 FW_BANK 前 4 条（固定寄存器，与箱头无关）；
   *     2a–4d = buildTone(V10_TONES) 实时生成 → 自动带上新箱头 + 音量规则。
   *   固件频道表由这次导出的结果重新生成（_verify/gen_channels_from_bank.py），
   *   所以「App 预设库」与「固件 16 档」仍然逐条同源。 */
  const cable = FW_BANK.slice(0, 4).map((ch, i) => buildFwPreset(ch, i + 1));
  /* ★ 2026-11-15：2a–4d 改为 25+25 新数据层的过渡预设，不再走旧 V10_TONES。 */
  const base = PRESETS25.map(buildPreset25);                            /* 2a–4d */
  const list = [...cable, ...base];
  /* ★★ 2026-10-17（用户要求 · 循环压测）：
     16 个预设的寄存器图全部替换为同一张「全寄存器扫描图」，
     模块开关全开（保证旁路位写 0 = 启用），这样无论切到哪一档，
     加载/上传发出去的都是同一套寄存器 —— 方便蓝牙端逐条核对。 */
  if (TEST_SWEEP_MODE) {
    return list.map((p) => ({
      ...p,
      modules: Object.keys(p.modules ?? {}).length
        ? Object.fromEntries(Object.keys(p.modules).map((k) => [k, true]))
        : { 'noise-gate': true, compressor: true, boost: true, overdrive: true, 'amp-head': true, cabinet: true, chorus: true, delay: true, reverb: true },
      registers: { ...TEST_SWEEP_MAP },
    }));
  }
  return list;
}

// ─── 固定搭配分组 (A6 2026-09-23 修订) ───
// 每组共用同一主寄存器图; 档位差异不再靠"模块旁路位"(固件 R4 已取消 7 个),
// 而是: ① 不启用的直通类模块 → 写入该模块直通参数 ② 档位级旋钮覆盖(箱头 GAIN / OD drive 等)。
// 仍真实有效的旁路位只有 0(噪声门) / 215(合唱) / 221(延迟)。
export interface GroupBase {
  mode: PlayMode;
  boost: number;
  /** 主图模块: 全模块开启生成完整参数 (delay/reverb 按组需要) */
  modules: Record<string, boolean>;
  subModels: Record<string, string>;
  knobs: Record<string, Record<string, number>>;
  /** ★ v8 箱头型号索引（AMP_MODELS 下标）；缺省 = 0（Twin） */
  v8Amp?: number;
}

// BYPASS 寄存器 → 模块键 (值: 0=开启 1=旁路)
// 2026-09-25 白名单口径: 7/42/57/72/107/224/253 已不可写 → 配置里不再出现；
//   直通类模块的开关改由内部旁路位 48/63/78 + PASSTHROUGH_REGS 承担（见 ① / applyWhitelistPolicy）。
//   此处仅保留仍真实有效的 3 个旁路位。
const LEGACY_BYPASS_ROWS: Array<[number, string]> = [
  [0, 'noise-gate'], [215, 'chorus'], [221, 'delay'],
];

/** 从共享主寄存器图构建固定搭配预设: 覆盖旁路位 + "关模块写直通参数" + 取消位归零. boost 可选覆盖底座默认值; knobsOverride 覆盖底座旋钮 (如同组不同档的箱头 GAIN) */
export function buildGroupPreset(
  base: GroupBase, slot: number, name: string, modules: Record<string, boolean>,
  boost?: number, knobsOverride?: Record<string, Record<string, number>>,
  /** ★ v8.1：本档覆盖（换箱头型号 / 换箱体 / 追加子型号），实现"每组 4 档用不同箱头" */
  over?: { v8Amp?: number; cab?: string; subModels?: Record<string, string> },
): LocalPreset {
  const subModels = { ...base.subModels, ...(over?.subModels ?? {}) };
  if (over?.cab) subModels['cabinet'] = over.cab;
  const full = buildBuiltinPreset({
    slot: 0, name: `${name} Base`, mode: base.mode, boost: boost ?? base.boost,
    modules: base.modules, subModels, knobs: base.knobs, v8Amp: over?.v8Amp ?? base.v8Amp ?? 0,
  });
  const registers: Record<number, number> = { ...full.registers };

  // ① 本档"不启用"的模块 → 只写该模块的模块级旁路位（★ v5：不再做参数复位）
  //    参数原样保留，模块重新开启即恢复该档音色 —— 这是「整段 BYPASS」口径的核心。
  //    箱头 / 箱体不在此处理：它们恒常开，见 ①-b。
  for (const mid of PASSTHROUGH_MODULES) {
    if (mid === 'amp-head' || mid === 'cabinet') continue;
    if (modules[mid]) continue;
    Object.assign(registers, getModuleOffRegs(mid));
  }

  // ①-b 箱头 / 箱体【常开常量集】（A2–D4 共 15 档恒写）：
  //      57 / 72 块级 + 58 / 67 / 73 / 82 库级 + 78 分支 + 107 箱体，一律 0。
  //      固件上电默认为 1，必须写 0，否则箱头丢段 PEQ 与音量。
  Object.assign(registers, ALWAYS_ON_REGS);

  // ② 白名单口径: 白名单外的地址一律从写入集中删除(不再"恒写 0")
  applyWhitelistPolicy(registers);

  // ④ 档位级旋钮覆盖 (如箱头 GAIN 按音色区分): 走同一 setKnobValue 解析链写寄存器
  if (knobsOverride) {
    const ampIdx = over?.v8Amp ?? base.v8Amp;    // undefined → 箱头回退旧链（仅官方音色会走到）
    const regs = new Map<number, number>();
    for (const [k, v] of Object.entries(registers)) regs.set(parseInt(k), v);
    for (const [moduleId, knobs] of Object.entries(knobsOverride)) {
      const composed = subModels[moduleId] ?? '';
      for (const [knob, norm] of Object.entries(knobs)) {
        setKnobValue(regs, moduleId, composed, knob, norm, moduleId === 'amp-head' ? ampIdx : undefined);
      }
    }
    for (const [k, v] of regs) registers[k] = v;
  }
  return { ...full, slot, name, modules, registers };
}

// ─── A组 (v27 已交付): Fender Twin Reverb 底座, A2 清音/A3 过载/A4 失真SOLO ───
const A_BASE_MODULES: Record<string, boolean> = {
  'noise-gate': true, boost: true, compressor: true, overdrive: true, dist: true,
  'amp-head': true, cabinet: true, chorus: false, delay: true, reverb: true,
};
const A_BASE_SUBMODELS = {
  compressor: 'boss-cs2',
  overdrive: 'ts808',
  dist: 'sd1',
  'amp-head': 'fender-twin-reverb',
  cabinet: 'fender-twin-71',
  delay: 'delay-digital',
  reverb: 'reverb-spring',
};
const A_BASE_KNOBS = {
  'noise-gate': { THRESHOLD: 0.2 },
  compressor: { SUSTAIN: 0.35, OUTPUT: 0.4 },
  overdrive: { DRIVE: 0.6, TONE: 0.6, LEVEL: 0.9333 },
  dist: { DISTORTION: 0.45, TONE: 0.5, LEVEL: 0.85 },
  'amp-head': { GAIN: 0.25, VOLUME: 1.0, MASTER: 0.6875, BASS: 0.6, MIDDLE: 0.45, TREBLE: 0.5, PRESENCE: 0.4 },
  delay: { TIME: 0.35, REPEAT: 0.3 },
  reverb: { 'PRE-DELAY': 0.1, DECAY: 0.35, MIX: 0.2, 'LOW CUT': 0.05, 'HIGH CUT': 0.6 },
};
const A_BASE: GroupBase = { mode: 'guitar', boost: 0.3, modules: A_BASE_MODULES, subModels: A_BASE_SUBMODELS, knobs: A_BASE_KNOBS };

// A2 清音: 压缩/箱头/箱体/混响 开, 过载/失真/延迟 关
const A2_MODULES: Record<string, boolean> = {
  'noise-gate': true, boost: true, compressor: true, overdrive: false, dist: false,
  'amp-head': true, cabinet: true, chorus: false, delay: false, reverb: true,
};
// A3 过载: + 过载开, 失真关
const A3_MODULES: Record<string, boolean> = {
  'noise-gate': true, boost: true, compressor: true, overdrive: true, dist: false,
  'amp-head': true, cabinet: true, chorus: false, delay: true, reverb: true,
};
// A4 失真SOLO: 过载+失真 全开
const A4_MODULES: Record<string, boolean> = {
  'noise-gate': true, boost: true, compressor: true, overdrive: true, dist: true,
  'amp-head': true, cabinet: true, chorus: false, delay: true, reverb: true,
};

// ─── B/C/D 组 (v28 新增): 共用底座, 4 档 = 清音/过载/失真/失真SOLO ───
// 吉他组共用 4 档模块表 (reverb 常开; 仅 SOLO 开 delay)
const GT_COMMON = {
  'noise-gate': true, boost: true, compressor: true, overdrive: false, dist: false,
  'amp-head': true, cabinet: true, chorus: false, delay: false, reverb: true,
};
export const GT_CLEAN_GUITAR = GT_COMMON;
export const GT_OD_GUITAR = { ...GT_COMMON, overdrive: true };
export const GT_DIST_GUITAR = { ...GT_COMMON, dist: true };
export const GT_SOLO_GUITAR = { ...GT_COMMON, overdrive: true, dist: true, delay: true };
// 贝斯组 (reverb/delay 关)
const GT_COMMON_BASS = {
  'noise-gate': true, boost: true, compressor: true, overdrive: false, dist: false,
  'amp-head': true, cabinet: true, chorus: false, delay: false, reverb: false,
};
export const GT_CLEAN_BASS = GT_COMMON_BASS;
export const GT_OD_BASS = { ...GT_COMMON_BASS, overdrive: true };

// B组: Marshall Plexi 底座 (BD-2 透明过载 + Distortion+ 复古失真)
export const B_BASE: GroupBase = {
  mode: 'guitar', boost: 0.4,
  modules: {
    'noise-gate': true, boost: true, compressor: true, overdrive: true, dist: true,
    'amp-head': true, cabinet: true, chorus: false, delay: true, reverb: true,
  },
  subModels: {
    compressor: 'boss-cs2',
    overdrive: 'timmy',
    dist: 'rat',
    'amp-head': 'orange-ad30',
    cabinet: 'marshall-1960-4x12-british',
    delay: 'delay-digital',
    reverb: 'reverb-spring',
  },
  v8Amp: 6,             // ★ v3 索引（0–19）：6 = Marshall Plexi 1959（旧 v8 表里 10 才是 Plexi）
  knobs: {
    'noise-gate': { THRESHOLD: 0.3 },
    compressor: { SUSTAIN: 0.4, OUTPUT: 0.6 },
    overdrive: { GAIN: 0.45, TONE: 0.55, LEVEL: 0.93 },
    dist: { DISTORTION: 0.6, VOLUME: 0.85 },
    'amp-head': { GAIN: 0.2, VOLUME: 1.0, MASTER: 0.6875, BASS: 0.5, MIDDLE: 0.7, TREBLE: 0.5, PRESENCE: 0.55 },
    delay: { TIME: 0.4, REPEAT: 0.3 },
    reverb: { 'PRE-DELAY': 0.1, DECAY: 0.3, MIX: 0.15, 'LOW CUT': 0.05 },
  },
};

// C组: Mesa Dual Rectifier 底座 (SD-1 过载 + MT-2 金属失真)
const C_BASE: GroupBase = {
  mode: 'guitar', boost: 0.5,
  modules: {
    'noise-gate': true, boost: true, compressor: true, overdrive: true, dist: true,
    'amp-head': true, cabinet: true, chorus: false, delay: true, reverb: true,
  },
  subModels: {
    compressor: 'boss-cs2',
    overdrive: 'sd1',
    dist: 'ocd',
    'amp-head': 'peavey-6505',
    cabinet: 'mesa-os-4x12',
    delay: 'delay-digital',
    reverb: 'reverb-hall',
  },
  v8Amp: 12,            // ★ v3 索引：12 = Mesa Dual Rectifier（旧 v8 表里 7 才是 Mesa）
  knobs: {
    'noise-gate': { THRESHOLD: 0.5 },
    compressor: { SUSTAIN: 0.35, OUTPUT: 0.6 },
    overdrive: { DRIVE: 0.5, TONE: 0.55, LEVEL: 0.9 },
    dist: { DISTORTION: 0.55, MID: 0.45, LEVEL: 0.9 },
    'amp-head': { GAIN: 0.125, VOLUME: 1.0, MASTER: 0.6875, BASS: 0.5, MIDDLE: 0.45, TREBLE: 0.6, PRESENCE: 0.65 },
    delay: { TIME: 0.35, REPEAT: 0.3 },
    reverb: { 'PRE-DELAY': 0.1, DECAY: 0.2, MIX: 0.08 },
  },
};

// D组 (v28 修订2): 两组不同箱头箱体, 无失真; 箱头 GAIN ≤5dB; 各档 BOOST 不同
// D_BASE_VINTAGE (D1/D2): Ampeg SVT-CL 复古管箱 + B3K 过载
const D_BASE_VINTAGE: GroupBase = {
  mode: 'bass', boost: 0.5,
  modules: {
    'noise-gate': true, boost: true, compressor: true, overdrive: true, dist: false,
    'amp-head': true, cabinet: true, chorus: false, delay: false, reverb: false,
  },
  subModels: {
    compressor: '1176',
    overdrive: 'b3k',
    'amp-head': 'ampeg-svt',
    cabinet: 'ampeg-svt-8x10',
  },
  v8Amp: 15,            // ★ v3 索引：15 = Ampeg SVT（旧 v8 表里 21 才是 SVT；v3 只有 20 个型号，21 越界会静默落回 bassman）
  knobs: {
    'noise-gate': { THRESHOLD: 0.3 },
    compressor: { COMPRESSION: 0.4, GAIN: 0.5 },
    overdrive: { DRIVE: 0.5, BASS: 0.55, TREBLE: 0.55, LEVEL: 0.9 },
    'amp-head': { GAIN: 0.25, VOLUME: 1.0, MASTER: 0.7, BASS: 0.6, MIDDLE: 0.55, TREBLE: 0.5, PRESENCE: 0.45 },
  },
};

// D_BASE_MODERN (D3/D4): Hartke LH500 现代晶体管 + B3K 微量过载 (slap 味)
const D_BASE_MODERN: GroupBase = {
  mode: 'bass', boost: 0.6,
  modules: {
    'noise-gate': true, boost: true, compressor: true, overdrive: true, dist: false,
    'amp-head': true, cabinet: true, chorus: false, delay: false, reverb: false,
  },
  subModels: {
    compressor: '1176',
    overdrive: 'b3k',
    'amp-head': 'gibson-lab-series-l4',
    cabinet: 'ampeg-svt-410-810',
  },
  v8Amp: 16,            // ★ v3 索引：16 = Lab Series L4 Bass（旧 v8 表里 23 是 Hartke，v3 未收录）
  knobs: {
    'noise-gate': { THRESHOLD: 0.3 },
    compressor: { COMPRESSION: 0.4, GAIN: 0.5 },
    overdrive: { DRIVE: 0.25, BASS: 0.6, TREBLE: 0.6, LEVEL: 0.9 },
    'amp-head': { GAIN: 0.25, VOLUME: 1.0, MASTER: 0.7, BASS: 0.55, MIDDLE: 0.55, TREBLE: 0.6, PRESENCE: 0.55 },
  },
};

// 全模块关闭 (仅用于 预设1 线材直出)
export const G_MODULES_ALL_OFF: Record<string, boolean> = {
  'noise-gate': false, boost: false, compressor: false, overdrive: false, dist: false,
  'amp-head': false, cabinet: false, chorus: false, delay: false, reverb: false,
};

/**
 * 预设1「线材直出」所需的中性系统寄存器（A6 2026-09-23 补全）
 *   保证该档是一台"完整、确定"的中性直通链，而不是只写一半、其余留在硬件旧值上。
 */
const NEUTRAL_SYSTEM_REGS: Record<number, number> = {
  1: 3,        // 噪声门阈值默认
  2: 0,        // 吉他静音关
  3: 50,       // 输入音量 0dB
  // 239 (箱头 MASTER/PreMixer) 【不在本表】: 它属箱头模块参数 → 本档箱头关闭, 不写。
  //   2026-09-25 用户口径「239 算箱头模块参数（关闭即不写）」。
  254: 47, 255: 1, 256: 150, 257: 40, 258: 12, 259: 0,   // 限幅器 Off 档
  260: 0,      // 输出静音关
  261: 50,     // 输出音量 0dB
};

/**
 * 预设1: 线材直出（★ 2026-10-20 重新启用：槽 1 = 直出档，音色从槽 2 起；
 *   ★ 2026-10-21 由「默认空音色」改名 —— "直出"表达"什么都不处理"，比"空音色"准确）
 *
 * 口径（用户 2026-10-20 拍板）：
 *   · 9 个模块**全部旁路**，且噪声门(0) / 压缩器(7) 也**显式写 1** ——
 *     这样无论固件上电是什么状态，这一档都必然是"全通"。
 *   · 箱头只写块级 57 + 72；箱体 107；混响用 224（不再用 MIX 归零）。
 *   · 系统 / 主输出 / 限幅器写中性值（NEUTRAL_SYSTEM_REGS）。
 *   · BOOST 由 knobValues 归零（走 PGA）。
 *   · 级/库旁路 58/63/67/73/78/82 与过载 43/48/52 **一律不写**（见 FORBIDDEN_REGS）。
 */
export const BYPASS_PRESET: LocalPreset = (() => {
  const registers: Record<number, number> = { ...NEUTRAL_SYSTEM_REGS, ...A1_BYPASS_ALL };
  applyWhitelistPolicy(registers);
  return {
    slot: 1,
    /* ★★ v3.62（2026-10-24 用户拍板）：A1 名称改英文 —— 它不是音色而是「直通档」，
       其余预设名保留各自语言，名称不再随界面语言切换。 */
    name: 'BYPASS',
    nameEn: 'BYPASS',
    playMode: 'guitar' as PlayMode,
    modules: G_MODULES_ALL_OFF,
    subModels: {},
    knobValues: { boost: { BOOST: 0 } },
    registers,
    savedAt: Date.UTC(2026, 7, 22),
  };
})();

/* ══════════════════════════════════════════════════════════════════════
 * ★ v7.5 本地库预置种子（用户拍板：新增 10 条，其中 2 条贝斯）
 *   位置：本地库（bfx_localBank20，与硬件 16 档完全隔离；上限 20）
 *   生成：与内置档同一链路（buildBuiltinPreset → 寄存器 + 旋钮 + 子型号）
 *   播种：仅当本地库为空时写入一次（不覆盖用户已有数据），见 seedLocalBankOnce
 * ══════════════════════════════════════════════════════════════════════ */
interface LocalSeedSpec {
  name: string;
  mode: PlayMode;
  v8Amp: number;          // AMP_MODELS 下标
  cab: string;            // CAB_SETS 的 cab 显示名
  modules: Record<string, boolean>;
  subModels: Record<string, string>;
  knobs: Record<string, Record<string, number>>;
  boost?: number;
}

/** 10 条本地预设（前 8 吉他 + 后 2 贝斯） */
const LOCAL_SEEDS: LocalSeedSpec[] = [
  { name: 'Twin Clean', mode: 'guitar', v8Amp: 3, cab: 'Deluxe 1x12 Open',
    modules: GT_CLEAN_GUITAR, subModels: A_BASE_SUBMODELS, boost: 0.30,
    knobs: { 'noise-gate': { THRESHOLD: 0.20 }, compressor: { SUSTAIN: 0.35, OUTPUT: 0.45 },
      'amp-head': { GAIN: 0.1087, VOLUME: 1.0, MASTER: 0.75, BASS: 0.6, MIDDLE: 0.45, TREBLE: 0.5, PRESENCE: 0.4 },
      reverb: { 'PRE-DELAY': 0.1, DECAY: 0.35, MIX: 0.2 } } },
  { name: 'Vox Chime', mode: 'guitar', v8Amp: 5, cab: 'Orange 2x12',
    modules: GT_CLEAN_GUITAR, subModels: A_BASE_SUBMODELS, boost: 0.35,
    knobs: { 'noise-gate': { THRESHOLD: 0.2 }, compressor: { SUSTAIN: 0.35, OUTPUT: 0.5 },
      'amp-head': { GAIN: 0.2, VOLUME: 1.0, MASTER: 0.72, BASS: 0.5, MIDDLE: 0.6, TREBLE: 0.62, PRESENCE: 0.5 },
      reverb: { 'PRE-DELAY': 0.1, DECAY: 0.3, MIX: 0.22 } } },
  { name: 'Plexi Crunch', mode: 'guitar', v8Amp: 10, cab: '1960 Fane',
    modules: GT_OD_GUITAR, subModels: B_BASE.subModels, boost: 0.4,
    knobs: { 'noise-gate': { THRESHOLD: 0.3 }, compressor: { SUSTAIN: 0.4, OUTPUT: 0.6 },
      overdrive: { GAIN: 0.45, TONE: 0.55, LEVEL: 0.93 },
      'amp-head': { GAIN: 0.35, VOLUME: 1.0, MASTER: 0.75, BASS: 0.5, MIDDLE: 0.7, TREBLE: 0.5, PRESENCE: 0.55 },
      delay: { TIME: 0.35, REPEAT: 0.25 }, reverb: { 'PRE-DELAY': 0.1, DECAY: 0.3, MIX: 0.15 } } },
  { name: 'TS808 Blues', mode: 'guitar', v8Amp: 3, cab: 'Deluxe 1x12 Open',
    modules: GT_OD_GUITAR, subModels: A_BASE_SUBMODELS, boost: 0.4,
    knobs: { 'noise-gate': { THRESHOLD: 0.25 }, compressor: { SUSTAIN: 0.35, OUTPUT: 0.5 },
      overdrive: { DRIVE: 0.55, TONE: 0.6, LEVEL: 0.92 },
      'amp-head': { GAIN: 0.2, VOLUME: 1.0, MASTER: 0.72, BASS: 0.55, MIDDLE: 0.55, TREBLE: 0.53, PRESENCE: 0.4 },
      delay: { TIME: 0.3, REPEAT: 0.25 }, reverb: { 'PRE-DELAY': 0.1, DECAY: 0.3, MIX: 0.18 } } },
  { name: 'Klon Boost', mode: 'guitar', v8Amp: 10, cab: '1960 G12M',
    modules: GT_OD_GUITAR, subModels: B_BASE.subModels, boost: 0.5,
    knobs: { 'noise-gate': { THRESHOLD: 0.3 }, compressor: { SUSTAIN: 0.35, OUTPUT: 0.6 },
      overdrive: { GAIN: 0.35, TONE: 0.6, LEVEL: 0.95 },
      'amp-head': { GAIN: 0.3, VOLUME: 1.0, MASTER: 0.75, BASS: 0.5, MIDDLE: 0.65, TREBLE: 0.55, PRESENCE: 0.5 },
      delay: { TIME: 0.35, REPEAT: 0.28 }, reverb: { 'PRE-DELAY': 0.1, DECAY: 0.3, MIX: 0.16 } } },
  { name: 'RAT Distortion', mode: 'guitar', v8Amp: 6, cab: '1960A G12-65',
    modules: GT_DIST_GUITAR, subModels: B_BASE.subModels, boost: 0.45,
    knobs: { 'noise-gate': { THRESHOLD: 0.4 }, compressor: { SUSTAIN: 0.4, OUTPUT: 0.6 },
      overdrive: { GAIN: 0.4, TONE: 0.55, LEVEL: 0.9 }, dist: { DISTORTION: 0.6, VOLUME: 0.8 },
      'amp-head': { GAIN: 0.45, VOLUME: 1.0, MASTER: 0.75, BASS: 0.5, MIDDLE: 0.65, TREBLE: 0.55, PRESENCE: 0.55 },
      delay: { TIME: 0.35, REPEAT: 0.3 }, reverb: { 'PRE-DELAY': 0.1, DECAY: 0.3, MIX: 0.16 } } },
  { name: 'Modern Metal', mode: 'guitar', v8Amp: 8, cab: 'OS 4x12',
    modules: GT_SOLO_GUITAR, subModels: C_BASE.subModels, boost: 0.7,
    knobs: { 'noise-gate': { THRESHOLD: 0.5 }, compressor: { SUSTAIN: 0.45, OUTPUT: 0.65 },
      overdrive: { GAIN: 0.5, TONE: 0.5, LEVEL: 0.88 }, dist: { DISTORTION: 0.7, VOLUME: 0.78 },
      'amp-head': { GAIN: 0.6, VOLUME: 1.0, MASTER: 0.72, BASS: 0.62, MIDDLE: 0.4, TREBLE: 0.6, PRESENCE: 0.6 },
      delay: { TIME: 0.3, REPEAT: 0.3 }, reverb: { 'PRE-DELAY': 0.1, DECAY: 0.3, MIX: 0.14 } } },
  { name: 'Ambient Shimmer', mode: 'guitar', v8Amp: 3, cab: 'Deluxe 1x12 Open',
    modules: { ...GT_CLEAN_GUITAR, delay: true, reverb: true, chorus: true }, subModels: A_BASE_SUBMODELS, boost: 0.25,
    knobs: { 'noise-gate': { THRESHOLD: 0.2 }, compressor: { SUSTAIN: 0.35, OUTPUT: 0.5 },
      'amp-head': { GAIN: 0.1087, VOLUME: 1.0, MASTER: 0.7, BASS: 0.5, MIDDLE: 0.45, TREBLE: 0.55, PRESENCE: 0.45 },
      chorus: { LEVEL: 0.5, 'RATE 1': 0.25, 'DEPTH 1': 0.4 },
      delay: { TIME: 0.55, REPEAT: 0.5 }, reverb: { 'PRE-DELAY': 0.25, DECAY: 0.7, MIX: 0.45 } } },
  { name: 'Bass SVT Clean', mode: 'bass', v8Amp: 15, cab: 'SVT 8x10',
    modules: GT_CLEAN_BASS, subModels: D_BASE_VINTAGE.subModels, boost: 0.35,
    knobs: { 'noise-gate': { THRESHOLD: 0.25 }, compressor: { SUSTAIN: 0.4, OUTPUT: 0.6 },
      'amp-head': { GAIN: 0.15, VOLUME: 1.0, MASTER: 0.7, BASS: 0.6, MIDDLE: 0.5, TREBLE: 0.5 } } },
  { name: 'Bass B3K Drive', mode: 'bass', v8Amp: 15, cab: 'SVT 4x10+8x10',
    modules: GT_OD_BASS, subModels: D_BASE_VINTAGE.subModels, boost: 0.55,
    knobs: { 'noise-gate': { THRESHOLD: 0.35 }, compressor: { SUSTAIN: 0.45, OUTPUT: 0.62 },
      overdrive: { DRIVE: 0.5, BASS: 0.55, TREBLE: 0.6, LEVEL: 0.9 },
      'amp-head': { GAIN: 0.25, VOLUME: 1.0, MASTER: 0.68, BASS: 0.6, MIDDLE: 0.45, TREBLE: 0.55 } } },
];

/**
 * ★★ v3.71（2026-10-24 用户要求）：从寄存器里的 8 条开关位反推 modules。
 *
 * 为什么必须反推：`buildUploadPayload` / `switchPacks.cleanRegs` 都会用
 * `switchPlan(modules)` **覆盖**这 8 条开关位。如果种子里的 modules 还是老的
 * （内置预设的公式结果），而寄存器换成了用户现场的，两者就会打架 ——
 * 载入时开关被 modules 改回去，用户听到的音色和导出文件不一致。
 *
 * 反推口径与 `SWITCH_TABLE` 完全一致：0 = 开启，1 = 旁路。
 * 表里没有的模块（boost 走 PGA、dist 等）保留 fallback 原值 —— 寄存器里没有它们的开关位。
 */
function modulesFromRegs(
  regs: Record<number, number>,
  fallback: Record<string, boolean> | undefined,
): Record<string, boolean> {
  const out: Record<string, boolean> = { ...(fallback ?? {}) };
  const on = (a: number) => regs[a] === 0;
  if (regs[0] !== undefined) out['noise-gate'] = on(0);
  if (regs[7] !== undefined) out.compressor = on(7);
  if (regs[42] !== undefined) out.overdrive = on(42);
  if (regs[57] !== undefined && regs[72] !== undefined) out['amp-head'] = on(57) && on(72);
  if (regs[107] !== undefined) out.cabinet = on(107);
  if (regs[215] !== undefined) out.chorus = on(215);
  if (regs[221] !== undefined) out.delay = on(221);
  if (regs[224] !== undefined) out.reverb = on(224);
  return out;
}

/**
 * ★ 2026-10-15（用户要求）：本地库 16 条预置 = 预设库 16 档，**顺序完全一致**。
 *   第 1 条 = A1「线材直出」（全直通），其后 A2 / A3 / A4 / B1…B4 / C1…C4 / D1…D4。
 *   slot 用 100+ 编号，避免与硬件 1–16 频道冲突。
 *
 * ★★ v3.71（2026-10-24 用户要求）：**寄存器改为用户现场的 16 格快照**
 *   （旧的 10-24 快照文件 `userSnapshot20261024.ts` 已在 2026-10-31 删除 —— 本地库改成
 *   骨架仍取 `buildBuiltinPresets()` —— 子型号名、旋钮、boost 档位这些
 *   导出文件里没有的字段必须靠它，不能凭空造。
 *   只有 `registers` 和由寄存器反推的 `modules` 用现场值。
 *
 *   注意：**不改 `LOCAL_SEED_KEY`**。改版本号会触发「先清空再播种」，
 *   把用户已经存好的音色全部冲掉；保持 v20 才能做到「只影响新装 / 清空后的库」。
 */
/* ══════════════════════════════════════════════════════════════════════
 * ★★★ 2026-10-30（用户要求）：**本地库与预设库彻底脱钩，改为独立 16 档**
 *
 * 之前 buildLocalBankSeeds() 是「预设库骨架 + 用户 10-28 现场快照」派生的，
 * 结果是本地库 = 预设库的复制品 —— 用户想在本地库做另一套音色毫无意义。
 * 现在本地库有自己的 16 条 ToneDef，与预设库**互不影响**：
 *
 *   A 组  Fender Twin Reverb ×4   净声 / 亮丽 / 律动 / 主奏
 *                                  （四格都是 Twin，靠**箱体 + 效果器**拉开差异，
 *                                    不再靠换箱头 —— 组内切换时箱头不变，快切更省帧）
 *   B 组  英式复古四台             JTM45 / AC30 / Hiwatt DR103 / Orange AD30
 *                                  （**避开**预设库 B 组的 AC15）
 *   C 组  高增益四台               Engl Savage / 6505 / Mark IV / Lonestar
 *                                  （**避开**预设库 C 组的 Mark IIC+）
 *   D 组  贝斯四台                 SVT / L4 / Acoustic 360 / Beta Bass
 *                                  （预设库 D 组全是 SVT，这里换三台）
 *
 * 与预设库的关系：**不要求一致**。用户明确「本地库音色和预设库不需要同步」，
 * 所以这里刻意换箱体、换效果器组合，避免两边听起来是同一套。
 *
 * ⚠ 改这份表必须同步升 LOCAL_SEED_KEY（见下方注释），否则老用户看不到新音色。
 * ══════════════════════════════════════════════════════════════════════ */
export const LOCAL_BANK_TONES: ToneDef[] = [
  /* ══════════════════════════════════════════════════════════════════
   * ★★★ 2026-10-30（用户要求）：**组内箱头箱体固定，只有参数在动**
   *
   * 这是组内快切的唯一前提：固件切档时若箱头/箱体变了，硬件要重建整个箱头
   * 模型 + 35 段箱体 PEQ（9 个旁路位 × 500ms 窗口）；箱头箱体不变时，
   * 组内只剩 GAIN / DRIVE / 过载 / 空间类几十条参数，2~30 帧就完事。
   *
   * 所以每组 = **一台箱头 + 一个箱体**，四格只改驱动链与效果器组合：
   *   A  Vox AC15            + 1960 4x12 British （**与预设库 B 组对调**，2026-11-04）
   *   B  Marshall JTM45      + 1960TV Greenback   （CLEAN 20dB，无 DRIVE 旋钮）
   *   C  Peavey 6505         + Rectifier 4x12     （HIGH-GAIN 40dB，两级驱动）
   *   D  Gibson Lab Series L4+ Bass Mixed         （BASS 20dB，两级驱动）
   *
   * ★ 2026-11-04（用户拍板）：原来这里的 A 组是 Twin 四档，已与**预设库 B 组
   *   （AC15）对调** —— 预设库 2 组现在是 Twin，我的音色库 1 组现在是 AC15。
   * ══════════════════════════════════════════════════════════════════ */

  /* ── A 组 · Vox AC15 + 1960 4x12 British（原预设库 B 组，四格只改驱动与空间） ── */
  { name: 'AC30 Clean', amp: 2, cab: 'AC30 2x12', boost: 0.25, gate: 0.20, vol1Db: -3, vol2Db: -3, masterDb: -3,
    comp: 'la2a', chorus: 'chorus-ce2', reverb: 'Room', reverbMix: 10,
    ampKnobs: { GAIN: gN(6, 9), DRIVE: gN(0, 9), VOL1: vN(-3.0), VOL2: vN(-6.0),
      TREBLE: 0.52, BASS: 0.5, MID: 0.5, PRESENCE: 0.5, MASTER: mN(0) } },

  { name: 'AC30 Blues', amp: 2, cab: 'AC30 2x12', boost: 0.30, gate: 0.22, vol1Db: -3, vol2Db: -3, masterDb: -6,
    comp: 'la2a', od: 'timmy_g', odDriveDb: 6, odLevelDb: -3,
    reverb: 'Spring', reverbMix: 14,
    ampKnobs: { GAIN: gN(12, 9), DRIVE: gN(0, 9), VOL1: vN(-4.0), VOL2: vN(-7.0),
      TREBLE: 0.52, BASS: 0.5, MID: 0.5, PRESENCE: 0.5, MASTER: mN(0) } },

  { name: 'AC30 Rhythm', amp: 2, cab: 'AC30 2x12', boost: 0.35, gate: 0.30, vol1Db: -6, vol2Db: -6, masterDb: -6,
    od: 'rat', odDriveDb: 12, odLevelDb: -2.5,
    reverb: 'Room', reverbMix: 12,
    ampKnobs: { GAIN: gN(16, 9), DRIVE: gN(0, 9), VOL1: vN(-5.0), VOL2: vN(-9.0),
      TREBLE: 0.52, BASS: 0.5, MID: 0.5, PRESENCE: 0.5, MASTER: mN(0) } },

  { name: 'AC30 Lead', amp: 2, cab: 'AC30 2x12', boost: 0.40, gate: 0.35, vol1Db: -6, vol2Db: -6, masterDb: -6,
    od: 'rat', odDriveDb: 16, odLevelDb: -3,
    delay: 'Digital', reverb: 'Hall', reverbMix: 18,
    ampKnobs: { GAIN: gN(25, 9), DRIVE: gN(25, 9), VOL1: vN(-7.0), VOL2: vN(-12.0),
      TREBLE: 0.52, BASS: 0.5, MID: 0.5, PRESENCE: 0.5, MASTER: mN(0) } },

  /* ── B 组 · JTM45 + 1960TV Greenback（CLEAN 类，只有 GAIN，没有 DRIVE/VOL2） ── */
  { name: 'JTM45 Clean', amp: 1, cab: '1960 4x12 British', boost: 0.32, gate: 0.22, vol1Db: -3, masterDb: -3,
    comp: 'la2a', reverb: 'Room', reverbMix: 10,
    ampKnobs: { GAIN: gN(5, 1), VOL1: vN(-3.2), TREBLE: 0.52, BASS: 0.50, MID: 0.50, PRESENCE: 0.50, MASTER: mN(0) } },

  { name: 'JTM45 Blues', amp: 1, cab: '1960 4x12 British', boost: 0.36, gate: 0.26, vol1Db: -3, masterDb: -6,
    comp: 'la2a', reverb: 'Spring', reverbMix: 12,
    ampKnobs: { GAIN: gN(9, 1), VOL1: vN(-3.8), TREBLE: 0.53, BASS: 0.52, MID: 0.52, PRESENCE: 0.51, MASTER: mN(0) } },

  { name: 'JTM45 Overdrive', amp: 1, cab: '1960 4x12 British', boost: 0.38, gate: 0.30, vol1Db: -3, masterDb: -6,
    comp: 'cs2', od: 'bd1', odDriveDb: 14, odLevelDb: -3, reverb: 'Room', reverbMix: 10,
    ampKnobs: { GAIN: gN(13, 1), VOL1: vN(-4.6), TREBLE: 0.52, BASS: 0.50, MID: 0.54, PRESENCE: 0.52, MASTER: mN(0) } },

  { name: 'JTM45 Rock', amp: 1, cab: '1960 4x12 British', boost: 0.42, gate: 0.34, vol1Db: -6, masterDb: -6,
    od: 'rat', odDriveDb: 27, odLevelDb: -3.5, delay: 'Digital', reverb: 'Hall', reverbMix: 14,
    ampKnobs: { GAIN: gN(16, 1), VOL1: vN(-5.4), TREBLE: 0.52, BASS: 0.50, MID: 0.54, PRESENCE: 0.53, MASTER: mN(0) } },

  /* ── C 组 · 6505 + JCM800 1960（HIGH-GAIN，两级驱动：GAIN + DRIVE） ── */
  { name: '6505 Clean', amp: 12, cab: 'Rectifier 4x12', boost: 0.38, gate: 0.28, vol1Db: -3, vol2Db: -3, masterDb: -3,
    comp: 'la2a', reverb: 'Room', reverbMix: 8,
    ampKnobs: { GAIN: gN(10, 12), DRIVE: gN(0, 12), VOL1: vN(-5.5), VOL2: vN(-9.0),
      TREBLE: 0.50, BASS: 0.50, MID: 0.52, PRESENCE: 0.50, MASTER: mN(0) } },

  { name: '6505 Drive', amp: 12, cab: 'Rectifier 4x12', boost: 0.42, gate: 0.35, vol1Db: -3, vol2Db: -3, masterDb: -6,
    od: 'ts808_g', odDriveDb: 4, odLevelDb: -2, reverb: 'Room', reverbMix: 10,
    ampKnobs: { GAIN: gN(20, 12), DRIVE: gN(18, 12), VOL1: vN(-8.5), VOL2: vN(-13.5),
      TREBLE: 0.51, BASS: 0.52, MID: 0.50, PRESENCE: 0.52, MASTER: mN(0) } },

  /* ★ 节奏档不加混响：会和低频抢空间，闷音连击容易糊 */
  { name: '6505 Rhythm', amp: 12, cab: 'Rectifier 4x12', boost: 0.48, gate: 0.42, vol1Db: -6, vol2Db: -6, masterDb: -6,
    ampKnobs: { GAIN: gN(28, 12), DRIVE: gN(28, 12), VOL1: vN(-10.0), VOL2: vN(-15.5),
      TREBLE: 0.52, BASS: 0.54, MID: 0.46, PRESENCE: 0.56, MASTER: mN(0) } },

  { name: '6505 Lead', amp: 12, cab: 'Rectifier 4x12', boost: 0.52, gate: 0.45, vol1Db: -6, vol2Db: -6, masterDb: -6,
    od: 'ts808_g', odDriveDb: 8, odLevelDb: -3, delay: 'Digital', reverb: 'Hall', reverbMix: 16,
    ampKnobs: { GAIN: gN(34, 12), DRIVE: gN(34, 12), VOL1: vN(-11.5), VOL2: vN(-17.0),
      TREBLE: 0.52, BASS: 0.54, MID: 0.46, PRESENCE: 0.56, MASTER: mN(0) } },

  /* ── D 组 · Gibson Lab Series L4 + Bass Mixed（BASS 类，按演奏方式分档） ── */
  { name: 'Bass Clean', mode: 'bass', amp: 15, cab: 'SVT 8x10', boost: 0.30, gate: 0.22, masterDb: -4,
    comp: 'bassist', reverb: 'Room', reverbMix: 4,
    ampKnobs: { GAIN: gN(5, 16), DRIVE: gN(0, 16), VOL1: vN(-2.4), VOL2: vN(-4.0),
      TREBLE: 0.50, BASS: 0.50, MID: 0.50, PRESENCE: 0.50, MASTER: mN(0) } },

  { name: 'Bass Fingerstyle', mode: 'bass', amp: 15, cab: 'SVT 8x10', boost: 0.34, gate: 0.24, masterDb: -4,
    comp: 'bassist', reverb: 'Room', reverbMix: 6,
    ampKnobs: { GAIN: gN(8, 16), DRIVE: gN(5, 16), VOL1: vN(-3.0), VOL2: vN(-5.0),
      TREBLE: 0.51, BASS: 0.52, MID: 0.52, PRESENCE: 0.51, MASTER: mN(0) } },

  { name: 'Bass Pick', mode: 'bass', amp: 15, cab: 'SVT 8x10', boost: 0.38, gate: 0.28, masterDb: -4,
    comp: 'bassist', od: 'b3k', odDriveDb: 8, odLevelDb: -3,
    ampKnobs: { GAIN: gN(11, 16), DRIVE: gN(9, 16), VOL1: vN(-3.8), VOL2: vN(-6.0),
      TREBLE: 0.54, BASS: 0.52, MID: 0.48, PRESENCE: 0.53, MASTER: mN(0) } },

  /* ★ 贝斯失真不加混响（低频叠加会糊） */
  { name: 'Bass Distortion', mode: 'bass', amp: 15, cab: 'SVT 8x10', boost: 0.42, gate: 0.34, masterDb: -4,
    comp: 'bassist', od: 'b3k', odDriveDb: 14, odLevelDb: -3,
    ampKnobs: { GAIN: gN(14, 16), DRIVE: gN(14, 16), VOL1: vN(-4.6), VOL2: vN(-7.0),
      TREBLE: 0.54, BASS: 0.52, MID: 0.46, PRESENCE: 0.53, MASTER: mN(0) } },
];

export function buildLocalBankSeeds(): LocalPreset[] {
  /* 2026-11-16：我的音色库改为四组新音色，直接使用最新 25+25、OD10 与 FX
     参数；B/C 参考型号不再进入本地库。 */
  return buildLocalBank2026Seeds();
}

/**
 * ★★★ 2026-10-31（用户拍板·第二次修正）：**撤销上一版对本地库 1–4 格的线材覆盖**。
 *
 *   背景：13:30 那版曾把本地库 1–4 格写成 DIRECT / DI-PASSIVE / CABLE-*，
 *   与"本地库是独立 16 音色"相冲突。这里把被写成线材名的格子恢复回
 *   出厂 Twin 四档（Twin 净声 / 亮丽 / 律动 / 主奏）。
 *
 *   · 只碰 1–4 格，且**只改名字是线材名的那几格** —— 用户自己改名的格子不动；
 *   · 不清空整库、不动 5–16 格、不动用户另存的音色；
 *   · 幂等：跑一次即写标记。
 *
 * 返回实际恢复的格数（0 = 无事可做）。
 */
export function restoreLocalBankTwinSlotsOnce(): number {
  const KEY = 'bfx_localCableRevert_v1';
  try { if (localStorage.getItem(KEY) === '1') return 0; } catch { /* 隐私模式：仍然尝试 */ }
  let n = 0;
  try {
    const slots = loadBankSlots();
    for (let i = 0; i < 4; i++) {
      const slot = i + 1;
      const cur = slots.find((x) => x.slot === slot);
      if (!cur) continue;
      const shown = `${cur.name ?? ''} ${cur.data?.name ?? ''}`;
      /* 只恢复被上一版误写成线材名的格子 */
      if (!/DIRECT|DI-PASSIVE|CABLE-/i.test(shown)) continue;
      const tone = LOCAL_BANK_TONES[i];
      if (!tone) continue;
      const p = { ...buildTone(tone, 100 + i), slot, name: tone.name, nameEn: tone.nameEn };
      if (saveBankSlot(slot, tone.name, p)) n++;
    }
  } catch { /* 任何异常都不阻塞本地库打开 */ }
  try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
  return n;
}

/**
 * ★ 种子版本标记 = 「清空重来」的开关（用户 2026-10-16 指示）。
 *   改变量名/值 → seedLocalBankOnce() 会先清空本地库，再按新 16 档整体写入一次。
 *   v16: 「16 条 = 预设库顺序」首次广播
 *   v17: v3 箱头表重做 + 15 条新命名音色（A2/B3/C4/D1 旧命名全部作废）
 */
const LOCAL_SEED_KEY = 'bfx_localBankSeeds_v31';

/* ★★★ 2026-11-04 升到 v29：**全新音量规范 + 全英文命名** ——
   所有预设按 CLEAN/DRIVE/RHYTHM/LEAD 的 VOL/239 目标重算，6505 组箱体改 JCM800 1960。 */

/* ★★★ 2026-11-04 升到 v27：**我的音色库 16 格重新生成** ——
   ① 音量规则改为「净增益封顶 19 dB」（Twin 主奏 −15 dB 标定）；
   ② 1–4 格由 Twin 换成 AC15（与预设库 B 组对调）。
   寄存器与名字都变了，必须重播一次；老用户库里仍是旧 239 与旧 Twin 四档。 */

/* ★★★ 2026-10-31 升到 v25：音量规则补上三级 VOLUME 衰减 → 本地库 16 格重算。

/* ★★★ 2026-10-31 升到 v24：箱头 N8 第 9 段（130 Hz）提厚 + 统一音量规则 → 本地库 16 格全部重算。

/* ★★★ 2026-10-31 升到 v23：JTM45 默认箱体 1960 G12M → **1960TV Greenback**
   + 箱头后级补偿段 5 条重调（去闷）。箱头/箱体一换，B 组四格的 108–142 全变，
   不重播老用户就听不到修正 → 16 格整体替换一次（与此前 v21/v22 同一既定代价）。 */

/* ★ 2026-10-30 升到 v22：A/B 组过载驱动量上调（律动 15 dB / 主奏 28 dB / 过载 14 dB /
   摇滚 27 dB）+ A2「Twin 亮丽」加 CE-2 合唱 + 合唱/延迟参数全域预置（关闭时也写安全值）。
   老用户升级后本地库 16 格会被新种子整体替换一次，这是「全部换新」的既定代价。 */

/* ★ 2026-10-30 升到 v21：本地库改成**独立 16 档**（不再派生自预设库）。
   代价说清楚：老用户升级后第一次打开本地库，16 格会被新种子整体替换一次
   —— 这是他要求的「全部更换为新的」。用户自己另存的音色（其他槽位）不受影响。 */

/**
 * 播种 16 条本地预置（一次性、幂等）。
 *   · 首次（未写过版本标记）→ 先清空本地库，再按预设库顺序整体写入 16 条，
 *     保证「第 1 条在最上、顺序与预设库一致」。
 *   · 之后不再重复播种，用户自己的增删改不会被覆盖。
 *   返回写入条数（已播种过则返回 0）。
 */
/** ★ 2026-11-16：本地库「工厂 16 格」内容版本。
 *  与 LOCAL_SEED_KEY 分开：不改「播过就永不重播」的规则，也不整体清库；
 *  只把仍叫出厂名字的格子刷新为新参数（音量 239 + 激励器 PGA）。
 *  用户改过名 / 另存的音色不动。 */
const LOCAL_SEED_CONTENT_KEY = 'bfx_localBank2026_content';
const LOCAL_SEED_CONTENT_VER = '2026-11-16-plexi-drive2';
/* ★ 2026-11-16（用户拍板）：四组重构 —— 1 组线材直通、2 组 US CLEAN、
   3 组马歇尔 PLEXI、4 组贝斯（后两档带 ≤5 dB 过载）。
   下表同时保留**上一版**的出厂名（CRUNCH/SOLO/FINGER…），
   这样老用户库里那些仍是出厂名的格子也会被换成新内容；改过名的格子不动。 */
const LOCAL_FACTORY_NAMES = new Set([
  /* 新版 */
  'DIRECT', 'DI-PASSIVE', 'CABLE-20FT', 'CABLE-10FT-SILVER',
  'US CLEAN', 'US CHORUS', 'US RHYTHM', 'US LEAD',
  'PLEXI CLEAN', 'PLEXI CHORUS', 'PLEXI RHYTHM', 'PLEXI LEAD',
  'CHIME CLEAN', 'CHIME CHORUS', 'CHIME RHYTHM', 'CHIME LEAD',
  'BASS CLEAN', 'BASS ROUND', 'BASS BRIGHT', 'BASS DEEP', 'BASS DRIVE',
  /* 旧版（仅用于识别"这格还是出厂音色"，会被刷新掉） */
  'US CRUNCH', 'US SOLO', 'US DRIVE',
  'PLEXI CRUNCH',
  'TIGHT CLEAN', 'TIGHT CRUNCH', 'TIGHT RHYTHM', 'TIGHT LEAD',
  'CHIME CRUNCH', 'CHIME SOLO',
  'BASS FINGER', 'BASS PICK',
]);

function refreshLocalBank2026FactoryTones(): number {
  try {
    if (localStorage.getItem(LOCAL_BANK_CLEARED_KEY) === '1') return 0;
    if (localStorage.getItem(LOCAL_SEED_CONTENT_KEY) === LOCAL_SEED_CONTENT_VER) return 0;
  } catch { /* 隐私模式：仍然尝试 */ }
  let n = 0;
  try {
    const seeds = buildLocalBank2026Seeds();
    const slots = loadBankSlots();
    for (const seed of seeds) {
      const cur = slots.find((x) => x.slot === seed.slot);
      /* 只刷新「仍存在且仍是出厂名」的格子：空槽不复活（遵守 v3.76 的删除语义），
         用户改名或另存的自定义音色也不动。 */
      if (!cur || !cur.data || !LOCAL_FACTORY_NAMES.has(cur.name)) continue;
      if (saveBankSlot(seed.slot, seed.name, seed)) n++;
    }
  } catch { /* 任何异常都不阻塞本地库打开 */ }
  try { localStorage.setItem(LOCAL_SEED_CONTENT_KEY, LOCAL_SEED_CONTENT_VER); } catch { /* ignore */ }
  return n;
}

export function seedLocalBankOnce(): number {
  let seeded = false;
  try {
    seeded = localStorage.getItem(LOCAL_SEED_KEY) === '1';
  } catch { /* ignore */ }
  if (seeded) return refreshLocalBank2026FactoryTones();
  try {
    /* ★★★ v3.76（D1）：**只要播过就永不重播** —— 与「库里有没有数据」彻底解耦。
     *
     * v3.50 那段「已播过但库为空 → 再补一次」看似体贴，实际制造了一个用户可复现的
     * 数据错觉：用户用 CLEAR 把 16 格全部清空（这是合法操作，他想从零开始），
     * 下次打开本地库时 16 条种子全部写回 —— 用户以为删掉的音色「复活」了，
     * 而且他无法判断剩下的是自己存的还是 App 又塞进来的。
     *
     * 现在两条独立的判据：
     *   ① 播过（seedKey === '1'）      → 不再播；
     *   ② 用户主动清空过（clearedKey） → 不再播（覆盖「种子标记恰好丢失」的边缘情况）。
     * 两者都只影响**播种**，不影响用户自己的保存 / 导入。 */
    if (localStorage.getItem(LOCAL_BANK_CLEARED_KEY) === '1') return 0;
  } catch { /* ignore */ }
  const seeds = buildLocalBankSeeds().map(p => ({ name: p.name, data: p }));
  const n = replaceLocalBankForSeeds(seeds);
  try {
    localStorage.setItem(LOCAL_SEED_KEY, '1');
    localStorage.setItem(LOCAL_SEED_CONTENT_KEY, LOCAL_SEED_CONTENT_VER);
  } catch { /* ignore */ }
  return n;
}
