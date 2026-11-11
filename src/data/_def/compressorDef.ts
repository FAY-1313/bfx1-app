/**
 * ⚠️ 自动生成 —— 请勿手改
 * 生成脚本 : bfx1app/tools/_import_comp.py
 * 来源     : presetData.ts 的 COMPRESSOR_DEFAULTS.allRegs（保留旧数值）
 * 对齐     : 2026-10-03 用户要求的 6 个目标型号
 */
export interface CompModel {
  /** ★ v3.78：不可变主键（纯 ASCII）—— 存档 / 云端只认它 */
  key: string;
  id: string;
  /** 英文显示名（★ v3.78 全英文 + 精简） */
  name: string;
  /** 历史名 —— 只用于老存档反查 */
  aliases?: string[];
  desc: string;
  /** ★ 2026-10-17：英文描述（用户要求压缩器全部文字双语）；缺省回退 desc */
  descEn?: string;
  /** 短显示名（卡内副行/型号框等窄位用） */
  sn?: string;
  /** ★ 该型号真实存在的旋钮 —— UI 只渲染这些，不灰显别的 */
  knobs: string[];
  /** ★ 完整寄存器集（切换型号时逐个下发） */
  regs: Record<number, number>;
}

export const COMP_MODELS: CompModel[] = [
  { key:"teletronix-la2a", id:"la2a", name:"LA-2A",
    sn: "LA-2A",
    desc:"光耦 · 慢压缩", descEn:"Opto, slow",
    knobs:["THRESHOLD", "GAIN"],
    regs:{7:0,8:30,9:99,10:499,11:10,12:6,13:6} },
  { key:"urei-1176", id:"1176", name:"1176",
    sn: "1176",
    desc:"FET · 快压缩", descEn:"FET, fast",
    knobs:["THRESHOLD", "ATTACK", "RELEASE", "RATIO", "GAIN"],
    regs:{7:0,8:30,9:10,10:312,11:20,12:0,13:6} },
  { key:"manley-vari-mu", id:"varimu", name:"Vari-Mu",
    sn: "Vari-Mu",
    desc:"变μ 管 · 音乐性", descEn:"Vari-mu, musical",
    knobs:["THRESHOLD", "ATTACK", "RELEASE", "RATIO", "GAIN"],
    regs:{7:0,8:30,9:100,10:537,11:10,12:6,13:6} },
  { key:"empirical-distressor", id:"distressor", name:"Distressor",
    sn: "Distressor",
    desc:"VCA · 全能", descEn:"VCA, all-round",
    knobs:["THRESHOLD", "ATTACK", "RELEASE", "RATIO", "GAIN"],
    regs:{7:0,8:30,9:51,10:537,11:15,12:0,13:6} },
  { key:"boss-cs2", id:"cs2", name:"CS-2", aliases:["Boss CS-2","B&F Dyna Comp"],
    sn: "CS-2",
    desc:"吉他经典踏板", descEn:"Classic guitar",
    knobs:["THRESHOLD", "RATIO", "GAIN"],
    regs:{7:0,8:25,9:150,10:399,11:15,12:0,13:6} },
  { key:"keeley-bassist", id:"bassist", name:"Bassist",
    sn: "Bassist",
    desc:"贝斯专用", descEn:"Bass-specific",
    knobs:["THRESHOLD", "RATIO", "GAIN"],
    regs:{7:0,8:30,9:149,10:79,11:12,12:0,13:6} },
];

/** 参数位 → 寄存器 */
export const COMP_KNOB_REG: Record<string, number> = {
  THRESHOLD: 8, ATTACK: 9, RELEASE: 10, RATIO: 11, KNEE: 12, GAIN: 13,
};

/** 压缩器 bypass —— 白名单已开放 reg 7 */
export const COMP_BYPASS_ADDR = 7;