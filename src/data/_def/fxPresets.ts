/**
 * ⚠️ 自动生成 —— 请勿手改
 * 生成脚本 : bfx1app/tools/_import_fx.py
 * 依据     : 2026-10-03 用户决定
 *
 * ★ 2026-10-19（用户要求）：合唱/延迟/混响的二级选框改为**预设**（不再是型号），
 *   数量收敛为 合唱 3 / 延迟 3 / 混响 5，且每个预设写满该模块的全部寄存器
 *   （全参数显示）。此段已按新口径手工维护，重跑 _import_fx.py 会覆盖，请先同步脚本。
 */

export interface FxPreset {
  /** ★ v3.78：不可变主键（纯 ASCII）—— 存档 / 云端只认它 */
  key: string;
  /** 英文显示名（★ v3.78 全英文 + 精简） */
  name: string;
  /** 历史名 —— 只用于老存档反查 */
  aliases?: string[];
  desc: string;
  regs: Record<number, number>;
}

/** ═══ 合唱 ═══  reg 215 bypass / 216 level / 217 rate1 / 218 rate2 / 219 depth1 / 220 depth2 */
export const CHORUS_PRESETS: FxPreset[] = [
  /* ★★★ 2026-10-31（用户拍板）：**LEVEL（reg 216）全部提到最大值 20**。
   *   实测 1–3 档（约 −17 dB）听起来"一直是小音量"，合唱几乎听不出来；
   *   216 的量程就是 0–20（UI 归一 ×20），最大 = 20。
   *   Depth 219/220 维持 2–3 —— 只提"湿声比例"，不动调制深度。 */
  { key:"chorus-ce2", name:"CE-2", aliases:["CE-2 标准"], desc:"Boss CE-2 · gentle dual LFO",
    regs:{ 216:20, 217:4, 218:5, 219:2, 220:2 } },
  { key:"chorus-ce1", name:"CE-1", aliases:["CE-1 复古"], desc:"Boss CE-1 · slow deep modulation",
    regs:{ 216:20, 217:4, 218:5, 219:3, 220:2 } },
  { key:"chorus-dimension", name:"Dimension", aliases:["Dimension 宽"], desc:"Roland Dimension · dual-rate widening",
    regs:{ 216:20, 217:4, 218:5, 219:3, 220:3 } },
];
export const CHORUS_KNOBS: [string, number][] = [['LEVEL',216],['RATE 1',217],['RATE 2',218],['DEPTH 1',219],['DEPTH 2',220]];
export const CHORUS_BYPASS_ADDR = 215;

/** ═══ 延迟 ═══  reg 221 bypass / 222 repeat / 223 time */
export const DELAY_PRESETS: FxPreset[] = [
  { key:"delay-analog", name:"Analog", desc:"Warm analog · short-mid delay",
    regs:{ 222:33, 223:230 } },
  { key:"delay-digital", name:"Digital", aliases:["Digital Delay"], desc:"Clean digital delay",
    regs:{ 222:30, 223:375 } },
  { key:"delay-slapback", name:"Slapback", desc:"Very short single tap",
    regs:{ 222:15, 223:90 } },
];
export const DELAY_KNOBS: [string, number][] = [['TIME',223],['REPEAT',222]];
export const DELAY_BYPASS_ADDR = 221;

/** ═══ 混响 ═══  reg 225 pre-delay / 226 time / 227 hpf / 228 lpf / 229 mix
 *  ⚠️ reg 224 已被固件 R4 取消 → 开关用 MIX 归零表达（不再写 224） */
/* ★ 2026-10-19：5 个预设，值按新量纲给（226 = 62.5 ms/LSB，227/228 = OFF+对数频率）
   Spring  20ms/1.25s/HPF 90Hz/LPF 5.7k/MIX30
   Hall    30ms/2.81s/HPF 42Hz/LPF 3.9k/MIX28
   Plate   10ms/2.19s/HPF 61Hz/LPF 8.3k/MIX25
   Room     5ms/0.75s/HPF 74Hz/LPF 6.2k/MIX20
   Ambient 50ms/4.69s/HPF 34Hz/LPF 3.2k/MIX40 */
export const REVERB_PRESETS: FxPreset[] = [
  { key:"reverb-spring", name:"Spring", desc:"Spring · forward mids",
    regs:{ 225:20, 226:20, 227:80, 228:90, 229:30 } },
  { key:"reverb-hall", name:"Hall", desc:"Hall · wide",
    regs:{ 225:30, 226:45, 227:40, 228:70, 229:28 } },
  { key:"reverb-plate", name:"Plate", desc:"Plate · bright dense",
    regs:{ 225:10, 226:35, 227:60, 228:110, 229:25 } },
  { key:"reverb-room", name:"Room", desc:"Small room · natural",
    regs:{ 225:5, 226:12, 227:70, 228:95, 229:20 } },
  { key:"reverb-ambient", name:"Ambient", desc:"Ambient · long tail big mix",
    regs:{ 225:50, 226:75, 227:30, 228:60, 229:40 } },
];
export const REVERB_KNOBS: [string, number][] = [['PRE-DLY',225],['TIME',226],['HPF',227],['LPF',228],['MIX',229]];
export const REVERB_MIX_ADDR = 229;   // 归零 = 关闭（代替已取消的 224）

/** 模块开关（0=开 / 1=关），混响特殊：MIX 归零 */
export const FX_ON_OFF: Record<string, { addr: number; on: number; off: number }> = {
  chorus: { addr: 215, on: 0, off: 1 },
  delay:  { addr: 221, on: 0, off: 1 },
  reverb: { addr: 229, on: 20, off: 0 },   // 开关 = MIX
};