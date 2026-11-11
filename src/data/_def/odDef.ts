/**
 * BFX1 过载定义 · v3.78 重做（2026-10-26 用户拍板）
 *
 * ★★★ 本次口径（用户 2026-10-26 原话）★★★
 *   「将所有过载效果器修改参数，无需要过载效果器符合真机」
 *   → 目标从「还原真机电路」改为「8 个型号听感必须分得开」。
 *   电路出处不再作为数值依据，只在 circuit 文案里保留说明。
 *
 * 硬件真实自由度（reg 42–56，五维）：
 *   49 Drive        0–92（0.5 dB/LSB）  削波深度 / 压缩量
 *   50 DC_OFFSET    0–100，50=对称      ★ 偶次谐波：唯一的削波性格自由度（旧注释「保留」是错的）
 *   44–47 PRE       4 段 PEQ            决定削波器看到什么频谱 → 决定产生什么谐波（不可逆）
 *   53–56 POST      4 段 PEQ            只能加减，不可逆
 *   51 Level        248–288             推箱头的力度
 *
 * 8 型号人格分配（旧版 8 个里 5 个 reg50 = 50 默认值 → 谐波结构完全一样，这是
 * 「8 个型号听起来都差不多」的根因；本版 8 个 DC 值互不相同）：
 *   Timmy  26/50/284  绝对透明：频响全平 ±1.5 dB
 *   TS-808 48/50/284  薄、中频咬：721 Hz 输入高通，底端 −26 dB
 *   OCD    68/46/284  平衡高增益：中频平，两端对称收
 *   SD-1   56/42/284  亮、强非对称：521 Hz 高通 + 891 Hz 高搁架 +7.5
 *   Centaur 34/32/284 清音混合：强负偏（偶次丰富），低频保留 +2.5/+4
 *   RAT    80/50/280  硬、糊、深压缩：900 Hz +5，3 kHz 低通（一阶）
 *   B3K    60/61/284  贝斯 GRUNT：最强正偏，500 Hz +4，超低保留
 *   BD-1   40/58/284  贝斯厚暖：250 Hz +3，4 kHz 以上陡降，低搁架 +6
 *
 * ★ SD-1 专项（用户 2026-10-26 指定）：44 由 857 Hz 改为 **521 Hz**（频表最近点 520 Hz）。
 *   45 段 HS 891 +7.5 保持不变（那是「紧」的另一半）。
 * ★ TS-808 的 54 段保留 LPF 8000 而不是静态方案表的 PEAK 2 k ——
 *   TONE 旋钮（700–8000 Hz）扫的是 54 的**低通频点**，换成 PEAK 会让旋钮语义变成「中频扫描」。
 *
 * 寄存器：1st OverDrive = ID 42–56
 *   42 整块旁通 | 43 PreOD库(禁写) | 44-47 PreOD 4段PEQ | 48 OD级(禁写)
 *   49 Drive | 50 OD1_DC_OFFSET | 51 Level | 52 PostOD库(禁写) | 53-56 PostOD 4段PEQ
 *
 * ★ 编码口径：peqCodec.buildPEQData（type|freq|gain|q|s），全表 rawS=10（0.71）。
 *   生成器：`_verify/od_v3.ts`；备档：`04_开发文档/07-命名与参数备档_v3.78.csv`
 * ⚠️ 旧生成器 tools/_apply_tone_groups.py 会覆盖本文件，重跑前须先同步本版数值。
 */

export interface OdKnob {
  name: string;               // DRIVE / TONE / LEVEL / BASS / TREBLE / FILTER / GAIN / VOLUME / SUSTAIN
  addr: number;               // 寄存器地址
  unit: 'reg' | 'db' | 'hz';  // reg = 直接寄存器值；db = PEQ 段增益；hz = PEQ 段频点
  lo: number; hi: number; step: number;
  /** false = 文档标「未找到」，范围取自外部资料 */
  found: boolean;
}

export interface OdModel {
  /** ★ 不可变主键（纯 ASCII）—— 存档 / 云端 / 预设只认它 */
  key: string;
  /** 内部 id（历史遗留，仅供 v8Amp 与旧代码换算，不得进存档） */
  id: string;
  /** 英文显示名（★ v3.78 全英文 + 精简，用户 2026-10-26 拍板） */
  name: string;
  /** 历史名（中文旧名 / 旧 id / 第三方写法）—— 只用于老存档反查 */
  aliases: string[];
  group: string;
  groupEn?: string;
  /** 短显示名（窄位用） */
  sn?: string;
  category: 'guitar' | 'bass';
  circuit: string;
  circuitEn?: string;
  /** ★ v3.79：弹窗底部一句话英文描述（精简，去掉电路细节） */
  descEn?: string;
  knobs: OdKnob[];
  /** 15 个寄存器 42–56（PEQ 已按 APK 口径重编码） */
  regs: Record<number, number>;
}

/** 属于 32 位 PEQ 字的寄存器 —— UI 必须走 PEQ gain 子旋钮 */
export const OD_PEQ_ADDRS = [44, 45, 46, 47, 53, 54, 55, 56] as const;

export const OD_MODELS: OdModel[] = [
  {
    key: 'timmy', id: 'timmy_g', name: 'Timmy',
    aliases: ['Timmy V2（透明 boost）', 'Timmy V2', 'timmy_g', '透明过载/BD-2'],
    sn: 'Timmy', group: 'Overdrive', groupEn: 'Overdrive', category: 'guitar',
    circuit: 'LM1458N x1，反馈环内 1N914 x5（可切换）', circuitEn: 'LM1458N · 5× 1N914 in feedback (switchable)',
    descEn: 'Transparent, flat EQ',
    knobs: [
      { name: 'GAIN', addr: 49, unit: 'reg', lo: 0, hi: 92, step: 1, found: true },
      /* BASS = 高通拐点扫描 80.5…6001 Hz；TREBLE = 低通拐点扫描 312…15915 Hz */
      { name: 'BASS', addr: 53, unit: 'hz', lo: 80.5, hi: 6001, step: 0.2, found: true },
      { name: 'TREBLE', addr: 55, unit: 'hz', lo: 312, hi: 16000, step: 0.2, found: true },
      { name: 'VOLUME', addr: 51, unit: 'reg', lo: 248, hi: 288, step: 1, found: true },
    ],
    regs: {42: 0, 44: 1353154662, 45: 1353155904, 46: 1353156480, 47: 1353157351, 49: 26, 50: 50, 51: 284, 53: 1353155233, 54: 1362625584, 55: 1353136874, 56: 1353156192},
  },
  {
    key: 'ts808', id: 'ts808_g', name: 'TS',
    aliases: ['Ibanez TS-808（中频系）', 'Ibanez TS-808', 'TS808', 'TS-808', 'ts808_g', '中频过载/TS808'],
    sn: 'TS', group: 'Overdrive', groupEn: 'Overdrive', category: 'guitar',
    circuit: 'JRC4558D x1，反馈环内对称硅 1N914 x2', circuitEn: 'JRC4558D · 2× symmetric 1N914',
    descEn: 'Mid hump, tight low end',
    knobs: [
      { name: 'DRIVE', addr: 49, unit: 'reg', lo: 0, hi: 92, step: 1, found: true },
      /* TONE = 削波后低通频点 700…8000 Hz（暗端 ≈ 原机 721 Hz，亮端全开） */
      { name: 'TONE', addr: 54, unit: 'hz', lo: 700, hi: 8000, step: 0.2, found: true },
      { name: 'LEVEL', addr: 51, unit: 'reg', lo: 248, hi: 288, step: 1, found: true },
    ],
    regs: {42: 0, 44: 1353156062, 45: 1369994848, 46: 1353157063, 47: 1353156480, 49: 48, 50: 50, 51: 284, 53: 1362633776, 54: 1342671301, 55: 1353116394, 56: 1353156192},
  },
  {
    key: 'ocd', id: 'ocd_g', name: 'OCD',
    aliases: ['Fulltone OCD（高增益系）', 'Fulltone OCD', 'ocd_g', '现代金属/MT-2'],
    sn: 'OCD', group: 'Overdrive', groupEn: 'Overdrive', category: 'guitar',
    circuit: 'TL082 x1；D2/D3 锗 || Q1/Q2 2N7000 || D4/D5 LED 同节点', circuitEn: 'TL082 · Ge ∥ MOSFET ∥ LED at one node',
    descEn: 'Balanced high gain',
    knobs: [
      { name: 'DRIVE', addr: 49, unit: 'reg', lo: 0, hi: 92, step: 1, found: true },
      /* TONE = 56 段 PEAK 900 Hz 的增益扫描（0 = 全开，−22 = 最深） */
      { name: 'TONE', addr: 56, unit: 'db', lo: -22, hi: 0, step: 0.2, found: true },
      { name: 'VOLUME', addr: 51, unit: 'reg', lo: 248, hi: 288, step: 1, found: true },
    ],
    regs: {42: 0, 44: 1353155526, 45: 1367897544, 46: 1366849576, 47: 1353157063, 49: 68, 50: 46, 51: 284, 53: 1362633776, 54: 1353156480, 55: 1353116394, 56: 1353156152},
  },
  {
    key: 'sd1', id: 'sd1', name: 'SD',
    aliases: ['Boss SD-1', 'SD-1', 'SD1', 'sd1', '中频过载/SD-1', '经典失真/DS-1'],
    sn: 'SD', group: 'Overdrive', groupEn: 'Overdrive', category: 'guitar',
    circuit: 'uPC4558C x1，反馈环内 1S2473 x6（1 串 + 2 反串 = 2:1 阈值比非对称）', circuitEn: 'uPC4558C · 6× 1S2473 (2:1 asymmetric)',
    descEn: 'Bright, asymmetric clip',
    knobs: [
      { name: 'DRIVE', addr: 49, unit: 'reg', lo: 0, hi: 92, step: 1, found: true },
      { name: 'TONE', addr: 56, unit: 'db', lo: -20, hi: 0, step: 0.2, found: true },
      { name: 'LEVEL', addr: 51, unit: 'reg', lo: 248, hi: 288, step: 1, found: true },
    ],
    /* ★ 44 = 1342670166（HPF1 520 Hz，用户指定 521）—— 旧值 1353156134 是 857 Hz */
    regs: {42: 0, 44: 1342670166, 45: 1353311794, 46: 1353157351, 47: 1353156480, 49: 56, 50: 42, 51: 284, 53: 1362633776, 54: 1353156480, 55: 1353136874, 56: 1353156360},
  },
  {
    key: 'klon', id: 'klon', name: 'Centaur',
    aliases: ['Klon Centaur', 'KLON', 'klon', '轻过载/Klon Centaur'],
    sn: 'Centaur', group: 'Overdrive', groupEn: 'Overdrive', category: 'guitar',
    circuit: 'TL072 x3 + LT1054 电荷泵；锗对 D2/D3 1N34A 无源对地（环外）；IC2A 清音/削波并行求和', circuitEn: 'TL072 ×3 + LT1054 · Ge 1N34A, parallel clean/crunch',
    descEn: 'Clean blend, warm',
    knobs: [
      { name: 'GAIN', addr: 49, unit: 'reg', lo: 0, hi: 92, step: 1, found: true },
      { name: 'TREBLE', addr: 56, unit: 'db', lo: -24, hi: 0, step: 0.2, found: true },
      { name: 'OUTPUT', addr: 51, unit: 'reg', lo: 248, hi: 288, step: 1, found: true },
    ],
    regs: {42: 0, 44: 1353154806, 45: 1353208593, 46: 1369994848, 47: 1353157231, 49: 34, 50: 32, 51: 284, 53: 1353237153, 54: 1362633776, 55: 1353136874, 56: 1353156480},
  },
  {
    key: 'rat', id: 'rat', name: 'RAT',
    aliases: ['ProCo RAT', 'rat', '复古失真/Distortion+'],
    sn: 'RAT', group: 'Distortion', groupEn: 'Distortion', category: 'guitar',
    circuit: 'LM308 x1 + 2N5458 缓冲；Si x2 运放外对地硬削波，单处', circuitEn: 'LM308 · 2× Si hard clip',
    descEn: 'Hard clip, deep squash',
    knobs: [
      { name: 'DISTORTION', addr: 49, unit: 'reg', lo: 0, hi: 92, step: 1, found: true },
      /* FILTER = 53 段一阶低通频点 472…20600 Hz，顺时针变暗 */
      { name: 'FILTER', addr: 53, unit: 'hz', lo: 472, hi: 20600, step: 0.2, found: true },
      { name: 'LEVEL', addr: 51, unit: 'reg', lo: 248, hi: 288, step: 1, found: true },
    ],
    regs: {42: 0, 44: 1353155798, 45: 1367938616, 46: 1353157351, 47: 1353156480, 49: 80, 50: 50, 51: 280, 53: 1353156655, 54: 1362633776, 55: 1353116394, 56: 1353156040},
  },
  {
    key: 'b3k', id: 'b3k', name: 'B3K',
    aliases: ['Darkglass B3K（贝斯）', 'Darkglass B3K', 'b3k', '贝斯过载/B3K'],
    sn: 'B3K', group: 'Bass', groupEn: 'Bass', category: 'bass',
    circuit: 'IC3A 单只 CD4049UBE 反相器 + Q1/Q2 J201 cascode', circuitEn: 'CD4049UBE + J201 cascode',
    descEn: 'Bass grunt',
    knobs: [
      { name: 'DRIVE', addr: 49, unit: 'reg', lo: 0, hi: 92, step: 1, found: true },
      /* BASS ← GRUNT 3 档（53 段低搁架频点 19.7–71 Hz）；TREBLE ← ATTACK 3 档（56 段增益 −18…+6） */
      { name: 'BASS', addr: 53, unit: 'hz', lo: 19.7, hi: 71.0, step: 1, found: true },
      { name: 'TREBLE', addr: 56, unit: 'db', lo: -18, hi: 6, step: 0.2, found: true },
      { name: 'LEVEL', addr: 51, unit: 'reg', lo: 248, hi: 288, step: 1, found: true },
    ],
    regs: {42: 0, 44: 1353154806, 45: 1367917888, 46: 1353156943, 47: 1353156480, 49: 60, 50: 61, 51: 284, 53: 1353216465, 54: 1362633776, 55: 1353116394, 56: 1353217800},
  },
  {
    key: 'bd1', id: 'bd1', name: 'BD-1',
    aliases: ['Cornish BD-1（贝斯）', 'Cornish BD-1', 'bd1'],
    sn: 'BD-1', group: 'Bass', groupEn: 'Bass', category: 'bass',
    circuit: 'IC1 TL071 后 D2/D3 1N34A 锗反并联单处削波；IC2 TL071 反相级；Q1/Q2 BC549C', circuitEn: 'TL071 · Ge 1N34A · BC549C',
    descEn: 'Bass, thick and warm',
    knobs: [
      { name: 'SUSTAIN', addr: 49, unit: 'reg', lo: 0, hi: 92, step: 1, found: true },
      /* ★ v3.78：53 段设计值 +6 dB（低搁架 41 Hz），BASS 旋钮行程相应改为 0…+6 —— 旧 −7…−2.5 够不到设计值 */
      { name: 'BASS', addr: 53, unit: 'db', lo: 0, hi: 6, step: 0.2, found: true },
      { name: 'TREBLE', addr: 54, unit: 'db', lo: -6, hi: 6, step: 0.2, found: true },
      { name: 'VOLUME', addr: 51, unit: 'reg', lo: 248, hi: 288, step: 1, found: true },
    ],
    regs: {42: 0, 44: 1353155150, 45: 1367897120, 46: 1353156775, 47: 1353156480, 49: 40, 50: 58, 51: 284, 53: 1353277745, 54: 1362633776, 55: 1353075434, 56: 1353156192},
  },
];
