/**
 * BFX1 新 UI · 首页（v6.1 · 2026-10-14）
 *
 * v6.1 变更（用户拍板）：
 *   · 四区高度比例 26 / 24 / 25 / 25（①动态 ②箱头 ③箱体 ④空间）
 *   · ① 动态区 4 卡 = 噪声门 · 压缩器 · 激励 · 过载；④ 空间区 = 合唱 · 延迟 · 混响 · 总音量
 *   · ★ 所有旋钮都在首页可直接拖动（松手写 1 帧 BLE）；按住旋钮放大 1.18~1.3× 便于精确操作
 *   · ★ 单旋钮卡（噪声门 / 激励 / 总音量）旋钮加大到 52px，与总音量同尺寸；
 *     噪声门 / 激励 无子选项 → 不再弹出二级窗口（型号框为空的历史问题一并去掉）
 *   · ★ 删除「长按旋钮 → 浮动旋钮面板」二级窗口（与点文字弹出的浮窗重复）
 *   · 多旋钮卡：点文字 → 模块浮窗（切型号/预设 + 全部旋钮）；拖动中数值显示在卡片第二行
 *   · 箱头：按 CLEAN / CRUNCH / HI-GAIN / BASS 分组（贝斯型号按「(贝斯)」识别）
 *   · 箱体：CLEAN / CRUNCH(2×12、4×12) / HI-GAIN / BASS 分组，28 项分 5 段
 *   · 蓝牙入口在 App 顶栏；一屏无滚动
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import KnobRing from './KnobRing';
import { moduleKnobs, ampKnobs, masterKnob, knobRows, type KnobDesc } from './moduleKnobs';
import { THEMES, MODEL_ITEMS } from './panels';
import type { ModelItem } from './dialogs';
import { SPECS, MODULE_ON_OFF } from './registers';
import { orderBypassSplit, switchWindowMs } from '../data/passThrough';
/* ★★ v3.69（2026-10-24 用户报障）：首页换箱头 / 箱体 / 过载整批下发期间挂全局 LOADING 遮罩。
   之前只有卡片里的「下发中 x/y」小字，用户以为没生效 —— 那条路径走的是本文件的 sendAll，
   根本不经过 Index 的 handleSubModelChange，所以 v3.68 加的加载窗在首页完全没生效。 */
import { beginBusy, endBusy, endBusyAfter, isBusy } from '../services/switchBusy';
import { notifyErr } from '../services/feedback';
import { PRE_BYPASS_FX } from '../services/switchPacks';
/* ★ 2026-10-31：首页换箱头/箱体要单独做「输出静音」（reg260），需要直接写寄存器 */
import { bleManager } from '../services/bleService';
import { setUiSnapshot } from '../services/uiSnapshot';
import { loadSession, saveSession, type SessionState } from '../services/sessionState';
import {
  BG_ID, bgTint, getAccents, rollAccent as rollAccentStore, subscribeAccents, type AccentMap,
} from '../services/accentTheme';
import { cabNameEn, micNameEn, micPosLabel } from './cabinetDisplayEn';
/* ★ 2026-10-26：箱体四类分组（纯函数，_verify 可直接断言） */
import { cabGroupOf, CAB_GROUP_LABEL } from './cabGroups';
/* ★ v3.78：型号主键解析（存档 / 云端只认 key） */
import { resolveModelKey, displayNameOf } from '../data/modelKey';
/* ★ 2026-10-17：写入节奏统一从 config 取（当前 5ms 提速版，改一处即可回退 20ms） */
import { EA_WRITE_MS } from '../config/writeTiming';
import { useI18n } from '../i18n';
import { customOdModels, customAmpModels } from './customModules';
import {
  AMP_MODELS, COMP_MODELS, OD_MODELS,
  CAB_NAMES, CAB_SETS, AMP_MASTER_ADDR,
  CHORUS_PRESETS, DELAY_PRESETS, REVERB_PRESETS,
} from '../data/_def';

/* ★ v6.2 单旋钮卡（噪声门 / 激励 / 总音量）旋钮直径 —— 三张卡必须完全一致 */
const SINGLE_KNOB_D = 'clamp(38px, 13vw, 52px)';

/* ★ v6.1 箱头分组：CLEAN / CRUNCH / HI-GAIN / BASS（贝斯型号按「(贝斯)」标注识别）
   ★ 2026-10-20：新增一组「NEW · 新箱头 v19」放箱头重做总表 v19 的 20 台新设计，
     与原有 20 台**完全分开**（不混进 CLEAN/CRUNCH/HG/BASS 四组），方便新旧 A/B。
     位置放在 BASS 之后、自定义之前 → 编号仍是 01–20（原有）
     + 21–40（新版），与测量工具的 B 组清单逐项对应不乱。 */
const AMP_GROUP_ORDER = ['CLEAN', 'CRUNCH', 'HIGH-GAIN', 'BASS', 'NEW', 'CUSTOM'];
const AMP_GROUP_LABEL: Record<string, string> = {
  CLEAN: 'CLEAN · 清音',
  CRUNCH: 'CRUNCH · 摇滚',
  'HIGH-GAIN': 'HI-GAIN · 高增益',
  BASS: 'BASS · 贝斯',
  NEW: 'NEW · 新箱头 v19',
  CUSTOM: '自定义 · CUSTOM',
};
/* ★ 2026-10-17（S7）：箱头分类徽标（2 字缩写 + 分类色）—— 型号列表的辨识度锚点 */
const AMP_BADGE: Record<string, string> = {
  CLEAN: 'CL', CRUNCH: 'CR', 'HIGH-GAIN': 'HG', BASS: 'BS', NEW: 'NW', CUSTOM: 'CU',
};
const AMP_BADGE_COLOR: Record<string, string> = {
  CLEAN: '#5bc8f5', CRUNCH: '#e8b860', 'HIGH-GAIN': '#f0604a', BASS: '#7ad6a0',
  NEW: '#b8e05a', CUSTOM: '#c0a8ff',
};
const ampGroupKey = (m: { name: string; cls: string; gen?: 'v19' }): string =>
  /* ★ v3.78：v19 组已移除、型号名全英文 —— 不再有 NEW 分组，也不再看名字里的「(贝斯)」 */
  m.cls;
/** 分组后的展示顺序（列表渲染与选中态定位共用，保持组内原始顺序） */
/** 按分组排序列出型号下标（内置 + 自定义，自定义排最后） */
function ampDisplayOrder(models: typeof AMP_MODELS): number[] {
  return models.map((_, i) => i).sort((a, b) =>
    AMP_GROUP_ORDER.indexOf(ampGroupKey(models[a]))
    - AMP_GROUP_ORDER.indexOf(ampGroupKey(models[b])));
}

export interface ModDef { id: string; sh: string; nm: string; /** ★ 2026-10-15：英文缩写（窄卡片用，务必短） */ en: string; }
export const MODULES: ModDef[] = [
  { id: 'noise-gate', sh: '门',   nm: '噪声门', en: 'GATE' },
  { id: 'compressor', sh: '压',   nm: '压缩器', en: 'COMP' },
  { id: 'boost',      sh: '激励', nm: '激励',   en: 'BOOST' },
  { id: 'amp-head',   sh: '箱头', nm: '箱头',   en: 'AMP' },
  { id: 'cabinet',    sh: '箱体', nm: '箱体',   en: 'CAB' },
  { id: 'chorus',     sh: '合唱', nm: '合唱',   en: 'CHORUS' },
  { id: 'delay',      sh: '延迟', nm: '延迟',   en: 'DELAY' },
  { id: 'reverb',     sh: '混响', nm: '混响',   en: 'REVERB' },
];

const PEDALS = ['noise-gate', 'compressor', 'boost'] as const;
const FXS = ['chorus', 'delay', 'reverb'] as const;
type FxId = typeof FXS[number];

/* ★ 2026-10-17（用户要求「过载/子选框全部双语，参考压缩器」）：
   FX 预设的名字与描述在 fxPresets.ts 里只有中文（那份文件是自动生成的，不动它），
   英文模式在这里查表；查不到就原样显示，不会出现空字符串。 */
const FX_NAME_EN: Record<string, string> = {
  'CE-2 标准': 'CE-2 Standard',
  'CE-1 复古': 'CE-1 Vintage',
  'Dimension 宽': 'Dimension Wide',
  'Bass 合唱': 'Bass Chorus',
};
const FX_DESC_EN: Record<string, string> = {
  'CE-2 标准': 'Boss CE-2 classic · gentle dual LFO',
  'CE-1 复古': 'Boss CE-1 · slow deep modulation',
  'Dimension 宽': 'Roland Dimension · two LFO rates widen the image',
  'Bass 合唱': 'Bass · low depth to stay tight',
  'Analog': 'Analog · warm short delay',
  'Digital': 'Digital · clean and clear',
  'Slapback': 'Slapback · very short single repeat',
  'Spring': 'Spring · midrange-forward',
  'Hall': 'Hall · wide and open',
  'Plate': 'Plate · bright and dense',
  'Room': 'Room · natural small space',
  'Ambient': 'Ambient · long tail, wet blend',
};

/* ★ 2026-10-17：FX 弹窗标题的英文版（中文标题在 FX[].title 里） */
const FX_TITLE_EN: Record<'chorus' | 'delay' | 'reverb', string> = {
  chorus: 'Select chorus preset',
  delay: 'Select delay preset',
  reverb: 'Select reverb preset',
};

const FX = {
  chorus: { presets: CHORUS_PRESETS, accent: '#40c0c0', title: '选择合唱预设' },
  delay:  { presets: DELAY_PRESETS,  accent: '#48b0e0', title: '选择延迟预设' },
  reverb: { presets: REVERB_PRESETS, accent: '#8060d0', title: '选择混响预设' },
} as const;
/* ★ 2026-10-17（S7）：预设列表的分类徽标缩写（FX.title 是整句标题，不能拿来截字） */
const FX_BADGE: Record<FxId, string> = { chorus: 'CH', delay: 'DL', reverb: 'RV' };

interface Props {
  /** 写入一个寄存器；返回是否成功（WO-01 用于失败可见化），modId 用于定位到模块
   *  ★ v3.69：第 4 参 keepBusy —— 整批下发（sendAll）自己持有 LOADING 遮罩，
   *    期间的单帧写入必须放行，否则会被 Index 的 `isBusy()` 守卫全部拦掉。 */
  onParam: (reg: number | 'PGA', value: number, modId?: string, keepBusy?: boolean) => Promise<boolean>;
  onBypass: (modId: string, on: boolean) => void;
  onAmpModel?: (idx: number) => void;
  extSync?: { tick: number; module: string; addr: number; value: number } | null;
  /** ★ v6.2 频道快照：连接蓝牙/切台后，把该频道音色恢复到首页（寄存器 + 模块开关）
   *  ★ 2026-10-19：带 subModels —— 加载预设/切台时把型号卡也切到对应型号 */
  sync?: {
    tick: number; regs: Record<number, number>; modules?: Record<string, boolean>;
    subModels?: Record<string, string>;
    /** ★★ v3.89：激励 BOOST 的**归一值**（0…1，非寄存器）—— 预设库切档时让首页旋钮跟着换档。
     *  只同步 UI，不发 PGA：预设库「一个寄存器都不写」的铁律不变。 */
    boost?: number;
  } | null;
  /** ★ C6 静音开关：当前是否静音 + 切换回调（写 260） */
  muted?: boolean;
  onMuteToggle?: () => void;
  /** ★ v73：首页 ④ 区「总音量」= reg 261（M1OutVolume），由 Index 的 outputVol 状态驱动 */
  outVol?: number;
  onOutVol?: (norm: number) => void;
  /** ★ 2026-10-17：蓝牙连接状态 —— 用于「断线保存 / 重连后把当前参数写回硬件」 */
  btConnected?: boolean;
  /** ★★ v3.70（用户报障「本地库存的新文件一切换就中断」）：
   *  首页换箱头 / 箱体 / 过载后，把当前型号集合回传给 Index。
   *  旧版首页只把型号写进 uiSnapshot，Index 的 subModelNames 永远停在旧值，
   *  于是「保存的音色」与「当前型号」对不上 → needSwitchMute 误判换型 → 静音 + 全量。
   *  口径统一为 **name**（不是 id）。 */
  onSubModelsChange?: (sm: Record<string, string>) => void;
  /**
   * ★★ v3.75（H1）：静音保护开关 —— Index 侧复用同一套 `duckOn / duckOff` 时序。
   * 首页不自己写 reg2：那会绕开 `duckOnRef` / `volBeforeSwitchRef` 的记账，
   * 导致 reg2 被写成 1 之后没人负责还原（正是 H6 那类「永久静音」的成因）。
   */
  onMuteGuard?: (on: boolean) => Promise<void>;
}

/**
 * ★★ v3.75（H1）：第 4 参 `muteHint` —— 本批是否要包一层静音保护。
 * 首页换箱头/箱体 = 与本地库「换型号」完全相同的语义（重建 NAM 模型 → 会爆音），
 * 而 v3.69 只补了 LOADING、没补静音 —— 这正是「两条路径要同步改」铁律的漏项。
 * 只有【型号名真的变了】才传 true；点同一台箱头看参数不静音。
 */
type Sender = (regs: Record<number, number>, label: string, modId: string, muteHint?: boolean) => Promise<void>;

/* ★ v6.2 首页模块的寄存器段（权威口径 = passThrough.MODULE_PARAM_RANGES + FX 215–229）
   ★ 2026-10-15：箱头段由 72–104 修正为 57–98（原失真段已并入）；噪声门去掉已取消的 2/3 */
const HOME_REG_SEGS: Record<string, Array<readonly [number, number]>> = {
  'noise-gate': [[0, 1]],
  'compressor': [[4, 13]],
  'amp-head': [[42, 98], [239, 239]],
  'cabinet': [[107, 142]],
  'chorus': [[215, 220]],
  'delay': [[221, 223]],
  'reverb': [[224, 229]],
};

/* ══════════ 常显双行文字（名字 + 型号/预设，同屏可见 —— WO-09） ══════════ */
function AltText({ name, alt }: { name: string; alt: string }) {
  const line: React.CSSProperties = {
    display: 'block', width: '100%', maxWidth: '100%',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  };
  return (
    <div style={{
      width: '100%', minWidth: 0, overflow: 'hidden', fontSize: 11, lineHeight: 1.15,
      letterSpacing: .2,
    }}>
      <span style={{ ...line, fontWeight: 750, color: '#F2F4F8' }}>{name}</span>
      {/* ★ 2026-10-17（用户反馈「字符消失后旋钮会跳动」）：
          第二行原来在 alt 为空时**不渲染** —— 拖动结束、实时数值清空后，
          文字区从两行变一行，卡片内剩余高度变化，旋钮跟着上下位移。
          现在第二行恒定占位（空时用不换行空格 + 透明），高度永远不变。 */}
      <span style={{
        ...line, fontWeight: 500, color: '#9BA3B2',
        height: '1.15em', opacity: alt ? 1 : 0,
        transition: 'opacity .12s ease',
      }}>{alt || '\u00A0'}</span>
    </div>
  );
}

/* ══════════ 效果器卡（首页态 · v6.1：全部旋钮可直接拖动 + 按住放大） ══════════ */
function FxCard({
  name, altTx, on, accent, thumbRows, thumbD, onText, onLed, onKnobCommit, hint, fail, single, noSwitch, blank, lang, onBlank, tourId,
}: {
  name: string; altTx: string; on: boolean; accent: string; lang: 'zh' | 'en';
  /** ★ 2026-10-17：教程锚点（data-tour），让教程能把挖洞对准真实卡片 */
  tourId?: string;
  /** ★ 2026-10-17：点底板空白处 → 换一个随机柔和色（用户要求） */
  onBlank?: () => void;
  /** 分行旋钮 + 各自在模块内的全局索引 */
  thumbRows: { d: KnobDesc; i: number }[][]; thumbD: number | string;
  /** 点文字 → 模块浮窗；null = 单旋钮卡（无子选项，不弹窗） */
  onText: ((e: React.PointerEvent) => void) | null; onLed: () => void;
  onKnobCommit: (d: KnobDesc, n: number) => void;
  /** WO-03 首次可发现提示 */
  hint?: boolean;
  /** WO-01 写入失败计数（>0 显示红点） */
  fail?: number;
  /** ★ v6.1 单旋钮卡（噪声门 / 激励）：大旋钮、垂直居中、点文字不弹窗 */
  single?: boolean;
  /** ★ 2026-10-15：箱头 / 箱体常开 —— 不渲染开关热区，只留一条静态指示 */
  noSwitch?: boolean;
  /** ★ 2026-11-02：本档没有这个模块（线材四档的箱头/箱体）——
   *   整张卡压暗并禁止交互，避免"模块其实是关的、卡片却看着像开着"。 */
  blank?: boolean;
}) {
  /* ★ v6.1 拖动中：卡片第二行显示实时数值（标签 + 数值 + 单位）；★ v6.2 松手后保留 1.2s 便于回看 */
  const [live, setLive] = useState<string | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashLive = (text: string) => {
    setLive(text);
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => setLive(null), 1200);
  };
  useEffect(() => () => { if (liveTimer.current) clearTimeout(liveTimer.current); }, []);
  /** ★ 2026-10-16（用户拍板 A1）：长按灯 = 还原该模块 的手势已【整体移除】——
   *   原设计是隐藏手势 + 静默覆盖参数 + 无确认，误触即丢用户调好的音色。
   *   还原能力改由浮窗内的显式「↺ 还原」按钮承担（见 FloatCard.onRestore）。 */
  const ledTap = () => onLed();
  return (
    <div data-fx-card aria-label={name} data-tour={tourId} style={{
      position: 'relative',
      flex: '1 1 0', minWidth: 0, width: 0, height: '100%', borderRadius: 12, padding: '4px 4px 4px',
      background: `linear-gradient(165deg, ${accent}1c, #14171D)`,
      border: `1.3px solid ${on ? accent + '88' : '#2E3440'}`,
      /* ★ 2026-11-02：线材档没有箱头/箱体 —— 卡片不可点（压暗在下面 filter/opacity 里） */
      pointerEvents: blank ? 'none' : undefined,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      boxSizing: 'border-box', userSelect: 'none', touchAction: 'none',
      /* ★ 2026-10-17（用户要求）：旁路（关闭）时整块模块暗下去 —— 旋钮、文字、边框一起暗，
         只留底部开关热区可点。用 brightness/saturate 而不是纯 opacity，
         这样暗下去仍有轮廓，能看出"这里有个模块、只是关着"。 */
      filter: blank ? 'brightness(0.45) saturate(0.25)' : (on ? 'none' : 'brightness(0.5) saturate(0.45)'),
      opacity: blank ? 0.55 : (on ? 1 : 0.82),
      transition: 'filter .22s ease, opacity .22s ease, border-color .22s ease',
    }}>
      {/* ★ 2026-10-19（用户反馈「延迟 / 混响关不掉、也操作不了」）：
          上一版把「点击开启」做成整卡热区，结果**盖住了底部灯条** —— 开着的时候点灯没反应、
          关掉之后又被热区接管，两种状态互相打架。
          现在改成：提示只是**贴纸**（pointer-events:none），不再拦截任何点击；
          真正能重开模块的入口有三个 —— 底部灯条、拖任意旋钮、点模块名。 */}
      {!on && !noSwitch && (
        <div aria-hidden style={{
          /* ★ 2026-10-19（用户要求「提示要靠近开关」）：贴纸贴到开关灯条正上方，
             而不是飘在卡片中间 —— 用户一眼能把"点击"和"哪个开关"对上。 */
          position: 'absolute', left: 0, right: 0, bottom: 24, zIndex: 4,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <span style={{
            padding: '2px 7px', borderRadius: 6,
            background: 'rgba(16,19,24,.88)', border: `1px solid ${accent}88`,
            color: accent, fontSize: 10.5, fontWeight: 700, letterSpacing: .5, whiteSpace: 'nowrap',
            boxShadow: `0 0 12px ${accent}33`, lineHeight: 1.5,
          }}>{lang === 'zh' ? '点击开启' : 'TAP TO ON'}</span>
        </div>
      )}
      {/* ▲ WO-01：写入失败红点（挂在卡片上） */}
      {!!fail && (
        <span title="参数未写入硬件" style={{
          position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%',
          background: '#F2565B', boxShadow: '0 0 6px rgba(242,86,91,0.9)', zIndex: 3,
        }} />
      )}
      {/* 双行文字（名字 + 型号/预设，常显）· 有子选项时点击弹浮窗
          ★ 2026-10-17（用户要求）：去掉文字底板。改为「把高度让给文字」——
             箱体区缩 8px、上下效果器行拉长（见四区 flex），从布局上根治遮挡。 */}
      <div onPointerUp={on ? onText ?? undefined : undefined} style={{
        position: 'relative', zIndex: 2,
        width: '100%', minWidth: 0, overflow: 'hidden', padding: '4px 4px 4px', borderRadius: 8,
        cursor: on && onText ? 'pointer' : 'default', flexShrink: 0,
        /* ★ 2026-10-19（用户要求）：关闭态整块不响应 —— 唯一入口是底部灯条开关 */
        pointerEvents: on ? undefined : 'none',
      }}>
        {/* ★ 2026-10-15：单旋钮卡（噪声门 / 激励器）不再常显英文名与档位；拖动时才显示数值 */}
        <AltText name={name} alt={live ?? (single ? '' : altTx)} />
        {hint && (
          <div style={{ fontSize: 11, color: '#F06F21', textAlign: 'center', marginTop: 1 }}>
            {lang === 'zh'
              ? (onText ? '拖动旋钮 · 点文字展开' : '拖动旋钮调节')
              : (onText ? 'Drag knob · tap text to open' : 'Drag to adjust')}
          </div>
        )}
      </div>
      {/* ★ v6.1：所有旋钮都可直接拖动（松手写 1 帧）；按住放大 1.3×（单旋钮卡 1.18×） */}
      <div style={{
        flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: single ? 0 : 'clamp(2px, .8vw, 4px)',
        overflow: 'visible', zIndex: 1,
        /* ★ 2026-10-19（用户要求）：关闭态旋钮不响应，只能点灯条开关重新开启 */
        pointerEvents: on ? undefined : 'none',
      }}
        /* ★ 2026-10-17（用户要求「点底板空白处换模块颜色」）：
           只在点到**容器本身**（= 旋钮之外的留白）时换色，点旋钮不会误触。 */
        onPointerUp={(e) => { if (e.target === e.currentTarget) onBlank?.(); }}>
        {thumbRows.map((r, ri) => (
          <div key={ri}
            onPointerUp={(e) => { if (e.target === e.currentTarget) onBlank?.(); }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: single ? 0 : 4, width: '100%',
            }}>
            {r.map(({ d }) => (
              <div key={d.key} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                flex: single ? '1 1 0' : '0 0 auto', minWidth: 0,
              }}>
                <KnobRing norm={d.norm} size={thumbD} mode="full" bubble={false} snap={d.snapNorm}
                  zoom={single ? 1.18 : 1.3} hit={8}
                  fmt={d.fmtAt}
                  ariaLabel={`${name} ${d.full}`} hintPulse={hint}
                  onDrag={(n) => flashLive(`${lang === 'zh' ? d.short : (d.shortEn ?? d.short)} ${d.fmtAt(n)}`)}
                  onCommit={(n) => { onKnobCommit(d, n); }} />
                {!single && (
                  <span style={{
                    maxWidth: thumbD, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center',
                    fontSize: 11, color: '#9BA3B2', letterSpacing: .2, whiteSpace: 'nowrap',
                  }}>{lang === 'zh' ? d.short : (d.shortEn ?? d.short)}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* 灯开关（点击 = 旁路）—— WO-19 热区撑满卡片底部
          ★ 2026-10-15：箱头 / 箱体常开，不提供开关（noSwitch）
          ★ 2026-10-16（A1）：长按还原已移除，改到浮窗内做显式按钮 */}
      {noSwitch ? (
        <div title="常开（不参与开关）" aria-label={`${name} 常开`}
          style={{
            width: '100%', height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
          <div style={{
            width: single ? '72%' : '62%', height: 3, borderRadius: 8,
            background: 'rgba(255,255,255,0.10)',
          }} />
        </div>
      ) : (
        <div onPointerUp={ledTap} title="旁路开关"
          role="switch" aria-checked={on} aria-label={`${name} 旁路`}
          style={{
            /* ★ 2026-10-19（用户反馈「开关灯特别不好点击选中」）：
               热区 24 → 34px、灯条 8 → 9px，并铺满卡片全宽（原来只有 62% 宽的灯本身可点）。 */
            width: '100%', height: 34, marginBottom: -4, display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
          }}>
          {/* ★ 2026-10-17（用户要求）：关闭状态改为「主色低亮度 + 2s 呼吸」——
              整卡被 brightness(.5) 压暗后，深灰灯条几乎看不见，用它才能一眼找到开关。 */}
          <div className={on ? undefined : 'led-off'} style={{
            width: single ? '80%' : '72%', height: 9, borderRadius: 8,
            background: on ? accent : accent,
            opacity: on ? 1 : undefined,
            boxShadow: on ? `0 0 8px ${accent}` : `0 0 5px ${accent}66`,
          }} />
        </div>
      )}
    </div>
  );
}

/* ══════════ 浮窗右侧的纯图标按钮（★ 2026-10-17 用户要求：不要文字）══════════ */
function IconPower({ size = 18, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v9" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </svg>
  );
}
function IconRestore({ size = 18, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 4 3 10 9 10" />
    </svg>
  );
}

/* ══════════ 箱体设备切换箭头（★ 2026-10-17 取代「切换适配设备」二级菜单）══════════
   44px 高、30px 宽，够手指点；用 ‹ › 而不是图标 —— 字形本身带「翻页」语义，且不引额外依赖。 */
function CabArrow({ dir, onClick, lang, accent = '#5bc8f5' }: {
  dir: -1 | 1; onClick: () => void; lang: 'zh' | 'en'; accent?: string;
}) {
  const label = dir < 0
    ? (lang === 'zh' ? '上一个设备' : 'Previous device')
    : (lang === 'zh' ? '下一个设备' : 'Next device');
  return (
    <div
      onPointerUp={onClick}
      role="button"
      aria-label={label}
      title={label}
      style={{
        width: 30, height: 44, flexShrink: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 9, userSelect: 'none',
        background: `${accent}14`, border: `1px solid ${accent}4d`,
        color: accent, fontSize: 19, fontWeight: 800, lineHeight: 1,
        paddingBottom: 2,
      }}>{dir < 0 ? '‹' : '›'}</div>
  );
}

/* ══════════ 竖放灯条开关（箱头 / 箱体 · 右下角）══════════
 * ★ 2026-10-17（用户要求）：与效果器底部灯条**同一视觉语言**，只是竖放。
 *   为什么选竖条而不是圆形电源键：
 *     ① 灯条在本页已经承担「旁路开关」的语义，再来一个圆形电源键会变成第四种开关形态；
 *     ② 箱头 / 箱体是横向条带区，右下角放一根 6×18 的竖条，比直径 26 的圆更贴边、更不抢视线；
 *     ③ 竖条宽度与横条一致（6px），切换时"灯亮/灯灭"的读法完全统一。
 *   热区 26×36（视觉 6×18），比效果器那条 24 高的横条热区更大。 */
function VSwitch({ on, accent, onToggle, title, style, hint = '', hintSide = 'left' }: {
  on: boolean; accent: string; onToggle: () => void; title: string;
  style?: React.CSSProperties;
  /** ★ 2026-10-19（用户要求「所有带开关的模块都要有点击开启提示」）：关闭时显示的贴纸 */
  hint?: string;
  hintSide?: 'left' | 'bottom' | 'above';
}) {
  return (
    <div role="switch" aria-checked={on} aria-label={title} title={title}
      onPointerUp={(e) => { e.stopPropagation(); onToggle(); }}
      style={{
        width: 26, height: 36, flexShrink: 0, cursor: 'pointer', zIndex: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        WebkitTapHighlightColor: 'transparent',
        /* ★ 2026-10-19（用户反馈「箱体关掉后打不开」）：
           箱体关闭时整块内容被设成 pointer-events:none（本意是禁用箱体/麦克风选择），
           但开关也在这个容器里 → 连自己都点不了，永远开不回来。
           子元素显式 auto 可以重新恢复命中测试。 */
        pointerEvents: 'auto',
        ...style,
      }}>
      <div className={on ? undefined : 'led-off'} style={{
        width: 6, height: 18, borderRadius: 8,
        background: accent,
        boxShadow: on ? `0 0 8px ${accent}` : `0 0 5px ${accent}66`,
      }} />
      {!on && hint && (
        <span aria-hidden style={hintSide === 'above' ? {
          /* ★ 2026-10-19（用户要求）：和其他开关一致 —— **横排**，放在开关**正上方**，
             右边缘与开关右对齐。 */
          position: 'absolute', bottom: '100%', right: 0, marginBottom: 3,
          padding: '1px 6px', borderRadius: 5, whiteSpace: 'nowrap',
          background: 'rgba(16,19,24,.9)', border: `1px solid ${accent}88`,
          color: accent, fontSize: 10.5, fontWeight: 700, letterSpacing: .5, lineHeight: 1.6,
          pointerEvents: 'none',
        } : hintSide === 'left' ? {
          /* 窄竖条（22px 两行）—— 仅在开关左侧空间够窄时使用 */
          position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)',
          marginRight: 4, padding: '2px 2px', borderRadius: 5, width: 22, boxSizing: 'border-box',
          whiteSpace: 'pre-line', lineBreak: 'anywhere' as const, textAlign: 'center',
          background: 'rgba(16,19,24,.9)', border: `1px solid ${accent}88`,
          color: accent, fontSize: 10.5, fontWeight: 700, letterSpacing: 0, lineHeight: 1.4,
          pointerEvents: 'none',
        } : {
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: 2, padding: '1px 5px', borderRadius: 5, whiteSpace: 'nowrap',
          background: 'rgba(16,19,24,.9)', border: `1px solid ${accent}88`,
          color: accent, fontSize: 10.5, fontWeight: 700, letterSpacing: .4, lineHeight: 1.6,
          pointerEvents: 'none',
        }}>{hint}</span>
      )}
    </div>
  );
}

/* ══════════ 总音量卡（④区最右 · 与单旋钮卡同构 · v6.1 首页直接拖动） ══════════ */
function MasterCard({
  desc, thumbD, onKnobCommit, hint, fail, muted, onMuteToggle, lang, accent = '#e8b860', onBlank,
}: {
  desc: KnobDesc; thumbD: number | string; lang: 'zh' | 'en';
  /** ★ 2026-10-17：可换的强调色 + 空白色回调 */
  accent?: string; onBlank?: () => void;
  onKnobCommit: (d: KnobDesc, n: number) => void;
  hint?: boolean; fail?: number;
  /** ★ C6：静音开关状态（写 260） */
  muted?: boolean;
  onMuteToggle?: () => void;
}) {
  /* ★ v6.1 拖动中显示实时数值；★ v6.2 松手后保留 1.2s */
  const [live, setLive] = useState<string | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashLive = (text: string) => {
    setLive(text);
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => setLive(null), 1200);
  };
  useEffect(() => () => { if (liveTimer.current) clearTimeout(liveTimer.current); }, []);
  return (
    <div data-fx-card aria-label="总音量" data-tour="master-card" style={{
      position: 'relative',
      flex: '1 1 0', minWidth: 0, width: 0, height: '100%', borderRadius: 12, padding: '4px 4px 4px',
      background: `linear-gradient(165deg, ${accent}1c, #14171D)`,
      border: `1.3px solid ${accent}88`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      boxSizing: 'border-box', userSelect: 'none', touchAction: 'none',
      /* ★ 2026-10-17：静音（开关关闭）时整卡暗下去 */
      filter: muted ? 'brightness(0.5) saturate(0.45)' : 'none',
      opacity: muted ? 0.82 : 1,
      transition: 'filter .22s ease, opacity .22s ease',
    }}>
      {!!fail && (
        <span title="参数未写入硬件" style={{
          position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%',
          background: '#F2565B', boxShadow: '0 0 6px rgba(242,86,91,0.9)', zIndex: 3,
        }} />
      )}
      {/* ★ 2026-10-19（用户反馈「总音量没有点击开启文字」）：静音时同样给提示，
          贴纸不拦截点击，点卡片任意处 / 拖旋钮即可恢复输出。 */}
      {muted && (
        <div aria-hidden style={{
          position: 'absolute', left: 0, right: 0, bottom: 24, zIndex: 4,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <span style={{
            padding: '2px 7px', borderRadius: 6,
            background: 'rgba(16,19,24,.88)', border: `1px solid ${accent}88`,
            color: accent, fontSize: 10.5, fontWeight: 700, letterSpacing: .5, whiteSpace: 'nowrap',
            boxShadow: `0 0 12px ${accent}33`, lineHeight: 1.5,
          }}>{lang === 'zh' ? '点击开启' : 'TAP TO ON'}</span>
        </div>
      )}
      <div style={{ width: '100%', minWidth: 0, overflow: 'hidden', padding: '4px 4px 4px', flexShrink: 0 }}>
        {/* ★ 2026-10-15：总音量卡不再常显「MASTER xx dB」；拖动时显示实时数值 */}
        <AltText name={lang === 'zh' ? '总音量' : 'MAS'} alt={live ?? ''} />
        {hint && (
          <div style={{ fontSize: 11, color: '#F06F21', textAlign: 'center', marginTop: 1 }}>
            {lang === 'zh' ? '拖动旋钮调节' : 'Drag to adjust'}
          </div>
        )}
      </div>
      <div
        onPointerUp={(e) => { if (e.target === e.currentTarget && !muted) onBlank?.(); }}
        style={{
          flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', overflow: 'visible',
          /* ★ 2026-10-19：静音态只能点底部灯条恢复 */
          pointerEvents: muted ? 'none' : undefined,
        }}>
        <KnobRing norm={desc.norm} size={thumbD} mode="full" bubble={false} snap={desc.snapNorm} zoom={1.18} hit={8}
          fmt={desc.fmtAt} ariaLabel={lang === 'zh' ? '总音量 MAS' : 'MAS'} hintPulse={hint}
          onDrag={(n) => flashLive(`${lang === 'zh' ? '总量' : 'VOL'} ${desc.fmtAt(n)}`)}
          onCommit={(n) => { onKnobCommit(desc, n); }} />
      </div>
      {/* ★ 2026-10-17（用户要求）：
          ① 去掉「主输出」文字；
          ② 开关换成与其它效果器**完全一致**的底部灯条（同高度 24、灯条 8px、同发光）。
          语义：灯亮 = 有输出（未静音），灯灭 = 静音。 */}
      <div
        onPointerUp={() => onMuteToggle?.()}
        role="switch"
        aria-checked={!muted}
        aria-label={muted ? '静音中，点击恢复输出' : '点击静音'}
        title={muted ? '取消静音' : '静音'}
        style={{
          width: '100%', height: 34, marginBottom: -4, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0,
          cursor: onMuteToggle ? 'pointer' : 'default',
        }}>
        <div className={muted ? 'led-off' : undefined} style={{
          width: '78%', height: 9, borderRadius: 8,
          background: accent,
          boxShadow: muted ? `0 0 5px ${accent}66` : `0 0 8px ${accent}`,
          transition: 'background .15s ease, box-shadow .15s ease',
        }} />
      </div>
    </div>
  );
}

/* ══════════ 浮窗内容卡（贴原卡片弹出） ══════════ */
function FloatCard({
  mod, modelTx, on, accent, descs, onPick, onLed, onKnobDrag, onKnobCommit, onClose, noSwitch,
  canRestore, onRestore, lang, pickLabel,
}: {
  mod: string; modelTx: string; on: boolean; accent: string; descs: KnobDesc[]; lang: 'zh' | 'en';
  onPick: ((e: React.PointerEvent) => void) | null; onLed: () => void; onClose: () => void;
  onKnobDrag: (d: KnobDesc, n: number) => void;
  onKnobCommit: (d: KnobDesc, n: number) => void;
  /** ★ 2026-10-15：箱头 / 箱体常开 —— 浮窗内也不显示开关 */
  noSwitch?: boolean;
  /** ★ 2026-10-16（A1）：显式「还原」—— 取代原先隐藏的长按灯手势 */
  canRestore?: boolean; onRestore?: () => void;
  /** ★ 2026-10-19：二级选框的标签 —— 合唱/延迟/混响是「预设」不是「型号」 */
  pickLabel?: string;
}) {
  const rows = knobRows(descs);
  const cols = Math.max(...rows.map((r) => r.length));
  /* 单行可更大；多行时同时受「宽度/列数」与「可用高/行数」约束，保证小屏不裁切 */
  const cap = rows.length === 1 ? 74 : 62;
  /* ★ 2026-10-17：头部多了一行「型号」选框（约 32px），矮屏上要把它从可用高度里扣掉，
     否则两行旋钮会顶到底部提示文字。 */
  const knobD = `clamp(30px, min(calc(76vw / ${cols}), calc((26vh - 96px) / ${rows.length})), ${cap}px)`;
  return (
    <div style={{
      flex: 1, minHeight: 0, width: '100%', borderRadius: 16, padding: '8px 12px 8px',
      background: `linear-gradient(165deg, ${accent}22, rgba(16,19,26,.99))`,
      border: `1.4px solid ${accent}`,
      boxShadow: `0 18px 50px rgba(0,0,0,.7), 0 0 22px ${accent}2e`,
      display: 'flex', flexDirection: 'column', gap: 6, boxSizing: 'border-box',
      userSelect: 'none', touchAction: 'none',
    }}>
      {/* ① 名字 + 三个图标（位置固定，与语言无关）
          ② 型号/预设选择框独占一行
          ★ 2026-10-17（用户要求「切中英文时选框不要移动，需要锁定位置」）：
             原来名字和选框挤在一行，名字/标签的中英文长度不同 → 选框的左右边界
             跟着漂。现在选框单独占一整行，宽度恒等于面板内容宽，
             中英文切换只换字，选框纹丝不动。 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{
          flex: 1, minWidth: 0,
          fontSize: 'clamp(11px, 3vw, 13px)', fontWeight: 800, color: '#F2F4F8',
          letterSpacing: .3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{mod}</div>
        {!noSwitch && (
          <div onPointerUp={onLed} role="switch" aria-checked={on}
            title={lang === 'zh' ? (on ? '关闭' : '开启') : (on ? 'Turn off' : 'Turn on')}
            aria-label={`${mod} power`}
            style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: on ? `${accent}22` : 'rgba(255,255,255,.05)',
              border: `1px solid ${on ? accent : '#2E3440'}`,
            }}>
            <IconPower color={on ? accent : '#5A6270'} />
          </div>
        )}
        {canRestore && onRestore && (
          <div onPointerUp={onRestore}
            title={lang === 'zh' ? '还原到本型号默认值' : 'Reset to model default'}
            aria-label={`restore ${mod}`}
            style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(240,111,33,.10)', border: '1px solid rgba(240,111,33,.45)',
            }}>
            <IconRestore color="#FF8D4D" />
          </div>
        )}
        <div onPointerUp={onClose} title={lang === 'zh' ? '收起' : 'Close'} style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,.06)', border: '1px solid #2E3440',
          color: '#9BA3B2', fontSize: 14, lineHeight: 1,
        }}>✕</div>
      </div>
      {onPick && (
        <div onPointerUp={onPick} style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 9px', borderRadius: 8, cursor: 'pointer',
          background: '#13161c', border: `1px solid ${accent}aa`,
        }}>
          {/* ★ 2026-10-17（用户要求）：标签也双语；固定宽度 30px，切换语言不改变布局 */}
          <span style={{
            fontSize: 11, color: '#9BA3B2', flexShrink: 0, width: 30,
            letterSpacing: 0, whiteSpace: 'nowrap', overflow: 'hidden',
          }}>{pickLabel ?? (lang === 'zh' ? '型号' : 'MDL')}</span>
          <span style={{
            flex: 1, minWidth: 0, fontSize: 'clamp(10px, 2.6vw, 11px)', fontWeight: 700,
            color: accent, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{modelTx}</span>
          <span style={{ fontSize: 11, color: '#9BA3B2', flexShrink: 0 }}>▾</span>
        </div>
      )}
      {/* 全部旋钮（分行排列 · 可直接拖动；数值显示在浮窗上方模糊区）
          ★ v73：overflow 由 hidden 改 visible —— 按住放大 1.2× 的旋钮原先会被本容器
          顶边切掉一截，位置恰在「型号」选框正下方，看起来就像被上方选框遮挡。 */}
      <div style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 'clamp(4px, 1.4vw, 8px)',
        overflow: 'visible',
        /* ★ 2026-10-17（用户反馈「旋钮放大后和上方开关/还原重叠」）：
           放大是 1.2×，向上溢出 10% 直径 —— 顶部留出这段余量，旋钮永远压不到图标行。
           ★ 同时：模块关闭时旋钮区不响应拖动。 */
        padding: '10px 0 3px',
        pointerEvents: on ? undefined : 'none',
      }}>
        {knobRows(descs).map((r, ri) => (
          <div key={ri} style={{
            flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 'clamp(4px, 2vw, 16px)',
          }}>
            {r.map((d) => {
              return (
                <div key={d.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <KnobRing norm={d.norm} size={knobD} mode="full" bubble={false} snap={d.snapNorm} zoom={1.2}
                    fmt={d.fmtAt}
                    onDrag={(n) => onKnobDrag(d, n)}
                    onCommit={(n) => onKnobCommit(d, n)} />
                  <span style={{
                    maxWidth: knobD, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center',
                    fontSize: 11, color: '#9BA3B2', letterSpacing: .2, whiteSpace: 'nowrap',
                  }}>{lang === 'zh' ? d.short : (d.shortEn ?? d.short)}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#7C8494', textAlign: 'center', flexShrink: 0 }}>
        {lang === 'zh' ? '拖动调节 · 松手即写入硬件 · 点空白处返回' : 'Drag to adjust · release to write · tap outside to close'}
      </div>
    </div>
  );
}

/* ══════════ 动态弹出（锚定被点选项 · spring 弹出 · 背景虚化） ══════════ */
/* ★ v6.4 ③区可切换的「设备图形」（纯显示，不写寄存器、不改声音）。
   新增设备只需在此加一条：key 唯一、model 是型号备注（显示在图下方）、img 是透明 PNG。 */
export const CAB_VIEWS = [
  { key: 'spk', label: '音箱', labelEn: 'Speaker', model: 'GO', img: '/assets/bfx-speaker.png' },
  { key: 'hp', label: '耳机', labelEn: 'Headphones', model: 'POLY', img: '/assets/bfx-headphone.png' },
  /* ★ 2026-11-04（用户要求）：新增 MIX 耳机型号 —— 与 POLY 并列，只在 ③ 区做设备图形展示。
     ★ 2026-11-05（用户反馈）：图下方名称格式必须与 POLY 一致 ——
     原来是「Headphones MIX · MIX」，POLY 是「Headphones · POLY」。
     现在 label 与 POLY 相同，只靠 model 区分，显示为「Headphones · MIX」。 */
  { key: 'hpmix', label: '耳机', labelEn: 'Headphones', model: 'MIX', img: '/assets/bfx-headphone-mix.png' },
] as const;
export type CabViewKey = (typeof CAB_VIEWS)[number]['key'];

/* ★ 2026-11-05（用户拍板）：产品型号 → 经典蓝牙音乐 EQ 配置文件。
 *   spk(GO) = 0（固件默认 eq_cfg_hw.bin）
 *   hp(POLY) / hpmix(MIX) = 1（eq_cfg_hw1.bin，耳机配置）
 *   若以后 POLY 要单独一套曲线，只需在这里拆开映射并多放一份 eq_cfg_hw2.bin。 */
export const EQ_PROFILE_BY_VIEW: Record<CabViewKey, number> = {
  spk: 0,
  hp: 1,
  hpmix: 1,
};

export type PopupSpec =
  | { kind: 'model' | 'preset'; mod: string }
  | { kind: 'cab' }
  | { kind: 'mic' }
  | { kind: 'cabview' };
export interface PopupItem {
  key: string; title: string; sub?: string; right?: string; group?: string;
  /** ★ 2026-10-20：真实条目标识。列表被「全部 / 分类」复制成两遍后，
      按下标 i 已经对不上原始数组了，必须靠 id 反查。 */
  id?: string;
  /** ★ v72：选项缩略图（箱体区「音箱 / 耳机」设备选择用）——有图则替代左侧圆圈 radio */
  img?: string;
  /** ★ 2026-10-17（S7）：无图选项的分类徽标 —— 2 字缩写 + 分类色，替代纯圆圈占位，
      让型号列表有辨识度（CLEAN/CRUNCH/HI-GAIN 一眼可分） */
  badge?: string;
  badgeColor?: string;
}

function AnchoredPopup({ title, rect, in: inFlag, items, selIdx, selId, accent, onPick, onClose, busy, lang }: {
  title: string; rect: { l: number; t: number; w: number; h: number; ch: number };
  in: boolean; items: PopupItem[]; selIdx: number; selId?: string; accent: string;
  onPick: (i: number, id?: string) => void; onClose: () => void;
  /** WO-02：下发中则禁用列表（防队列叠加） */
  busy?: string | null;
  lang: 'zh' | 'en';
}) {
  /**
   * ★ v6.2 去掉搜索/筛选 → 改为「分组切换菜单」
   *   · 打开时默认落在「当前选中项」所在分组 → 一眼看到自己现在用的那个，不用一直下拉
   *   · 点分组标签即可整组切换；无分组数据（麦克风/预设等）时自动隐藏标签行
   */
  const groups = useMemo(() => {
    const seen: string[] = [];
    items.forEach((it) => { if (it.group && !seen.includes(it.group)) seen.push(it.group); });
    /* ★ 2026-10-19：自定义组提到最前 —— 它排在分组末尾时会被横向滚出屏幕，
       用户根本发现不了自己导出的模块。 */
    const ci = seen.findIndex((g) => /自定义|CUSTOM/i.test(g));
    if (ci > 0) seen.unshift(seen.splice(ci, 1)[0]);
    return seen;
  }, [items]);
  const [activeGroup, setActiveGroup] = useState<string | null>(() => {
    /* ★ v3.79：「ALL · 全部」分类已取消 → 默认落在当前项所属分组 */
    const g = items[selIdx]?.group;
    if (g) return g;
    const first = items.find((it) => it.group)?.group;
    return first ?? null;
  });
  /** ★ 2026-10-19：分组页签横向可滚，选中项要自动滚进视野 */
  const groupTabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    if (!activeGroup) return;
    groupTabRefs.current[activeGroup]?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [activeGroup]);
  const shown = useMemo(
    () => items.map((it, i) => ({ it, i })).filter(({ it }) => !activeGroup || it.group === activeGroup),
    [items, activeGroup],
  );
  /* ★ 2026-10-17：切换语言会让分组标签改字（如「CLEAN · 清音」→「CLEAN」），
     若已选分组不在新列表里，列表会变成空的。这里自动落回第一个分组。 */
  useEffect(() => {
    if (activeGroup && groups.length > 0 && !groups.includes(activeGroup)) {
      setActiveGroup(groups[0] ?? null);
    }
  }, [groups, activeGroup]);
  /* ★ 2026-10-17（用户要求）：
     · 位置统一固定 —— 不再"贴着被点元素"弹出，改为**底部固定面板**，
       所有子选框（型号/预设/箱体/话筒/设备）位置一致，手指记忆稳定；
     · 高度拉高 —— 原来最高 264px、行高 8px 上下留白，条目挤在一起容易点错；
     · 去掉 scale 缩放动画 —— 缩放期间命中区会跟着变，快速连点容易"错位"。
     rect 仍保留在 props 里（调用点不动），但不再参与定位。 */
  const pH = 'min(62vh, 460px)';
  return (
    <div onPointerUp={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(5,6,8,.45)',
      backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
      opacity: inFlag ? 1 : 0, transition: 'opacity .2s ease',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onPointerUp={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, height: pH,
        transform: inFlag ? 'translateY(0)' : 'translateY(16px)',
        opacity: inFlag ? 1 : 0,
        transition: 'transform .24s cubic-bezier(.22,.9,.26,1), opacity .16s ease',
        background: 'rgba(20,23,29,.985)', border: `1.4px solid ${accent}`,
        borderBottom: 'none',
        borderRadius: '16px 16px 0 0', boxShadow: '0 -14px 34px rgba(0,0,0,.55)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px',
          borderBottom: '1px solid #2E3440', flexShrink: 0,
        }}>
          <span style={{ flex: 1, fontSize: 11, fontWeight: 750, color: '#F2F4F8' }}>{title}</span>
          <span style={{ fontSize: 11, color: '#9BA3B2' }}>
            {lang === 'zh'
              ? (activeGroup ? `${shown.length} / ${items.length} 项` : `${items.length} 项`)
              : (activeGroup ? `${shown.length} / ${items.length} items` : `${items.length} items`)}
          </span>
          <div onPointerUp={onClose} title="关闭" style={{
            width: 30, height: 30, borderRadius: 8, cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,.06)', border: '1px solid #2E3440',
            color: '#9BA3B2', fontSize: 11, lineHeight: 1,
          }}>✕</div>
        </div>
        {/* ★ v6.2 分组切换标签（替代原搜索/筛选框） */}
        {groups.length > 1 && (
          <div className="bfx-scroll" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
            overflowX: 'auto', overflowY: 'hidden', borderBottom: '1px solid #2E3440', flexShrink: 0,
          }}>
            {groups.map((g) => {
              const act = g === activeGroup;
              const cnt = items.filter((it) => it.group === g).length;
              return (
                <button key={g} className="bfx-tap"
                  ref={(el) => { groupTabRefs.current[g] = el; }}
                  onPointerUp={(e) => { e.stopPropagation(); setActiveGroup(g); }}
                  style={{
                    flexShrink: 0, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                    background: act ? accent : 'rgba(255,255,255,.05)',
                    border: `1px solid ${act ? accent : '#2E3440'}`,
                    color: act ? '#0F1319' : '#9BA3B2',
                    fontSize: 11, fontWeight: 750, letterSpacing: .3,
                    whiteSpace: 'nowrap', fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>{g} · {cnt}</button>
              );
            })}
          </div>
        )}
        {busy && (
          <div style={{
            padding: '8px 12px', fontSize: 11, fontWeight: 700, color: accent, flexShrink: 0,
            borderBottom: '1px solid #2E3440',
          }}>{busy}</div>
        )}
        <div className="bfx-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0 8px' }}>
          {shown.map(({ it, i }) => {
            const sel = selId ? it.id === selId : i === selIdx;
            return (
              <button key={it.key} className="bfx-tap bfx-scroll" onPointerUp={() => onPick(i, it.id)} style={{
                width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 9,
                /* ★ 2026-10-17：行高 8→13px（条目 52px 起），手机上不再点错行 */
                padding: '13px 14px', cursor: 'pointer', textAlign: 'left', border: 'none',
                background: sel ? `${accent}1f` : 'transparent',
                borderLeft: `3px solid ${sel ? accent : 'transparent'}`,
                borderBottom: '1px solid #2E3440',
              }}>
                {/* ★ v72：带图的选项（设备选择）—— 用缩略图当 radio，没有图时退回原圆圈 */}
                {it.img ? (
                  <img src={it.img} alt="" draggable={false} style={{
                    width: 32, height: 32, flexShrink: 0, objectFit: 'contain',
                    opacity: sel ? 1 : 0.5,
                    filter: sel ? `drop-shadow(0 0 5px ${accent}66)` : 'none',
                    transition: 'opacity .2s ease, filter .2s ease',
                  }} />
                ) : it.badge ? (
                  /* ★ 2026-10-17（S7）：分类徽标 —— 型号缩写 + 分类色，选中时描边转主色 */
                  <span style={{
                    width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${it.badgeColor ?? accent}22`,
                    border: `1.4px solid ${sel ? accent : `${it.badgeColor ?? accent}66`}`,
                    color: sel ? accent : (it.badgeColor ?? accent),
                    fontSize: 11, fontWeight: 800, letterSpacing: .2,
                    boxShadow: sel ? `0 0 8px ${accent}55` : 'none',
                    transition: 'border-color .2s ease, box-shadow .2s ease',
                  }}>{it.badge}</span>
                ) : (
                  <span style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${sel ? accent : '#454D5C'}`,
                    background: sel ? accent : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{sel && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#0F1319' }} />}</span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontSize: 12.5, fontWeight: sel ? 700 : 500,
                    color: sel ? accent : '#F2F4F8',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{it.title}</span>
                  {it.sub && <span style={{
                    display: 'block', fontSize: 11, color: '#9BA3B2', marginTop: 2,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{it.sub}</span>}
                </span>
                {it.right && <span style={{ fontSize: 11, color: '#9BA3B2', flexShrink: 0 }}>{it.right}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ══════════ 主组件 ══════════ */
export default function HomePanel({ onParam, onBypass, onAmpModel, extSync, sync, muted, onMuteToggle, outVol, onOutVol, btConnected, onSubModelsChange, onMuteGuard }: Props) {
  /* ★ 2026-10-15：跟随全局语言（LOGO 单击切换） */
  const { lang } = useI18n();
  /* ★ 2026-10-17（用户要求「开启软件后恢复之前的参数」）：
     首次渲染就读上次会话 —— 用 ref 保证只读一次，后面的 setState 不会反复覆盖用户操作。 */
  const bootRef = useRef<SessionState | null | undefined>(undefined);
  if (bootRef.current === undefined) bootRef.current = loadSession();
  const boot = bootRef.current;

  const [on, setOn] = useState<Record<string, boolean>>(() => ({
    'noise-gate': true, compressor: true, boost: false,
    /* ★ 2026-10-15：箱头 / 箱体常开，恒为 true 且不提供开关 */
    'amp-head': true, cabinet: true, chorus: true, delay: true, reverb: true,
    ...(boot?.on ?? {}),
  }));
  const [compIdx, setCompIdx] = useState(boot?.compIdx ?? 0);
  const [odIdx, setOdIdx] = useState(boot?.odIdx ?? 0);
  const [ampIdx, setAmpIdx] = useState(boot?.ampIdx ?? 0);
  const [cabIdx, setCabIdx] = useState(boot?.cabIdx ?? 0);
  const [micIdx, setMicIdx] = useState(boot?.micIdx ?? 0);
  /* ★ 2026-10-19：自定义型号表（调试页导出后会发 bfx-custom-changed 事件） */
  const [customVer, setCustomVer] = useState(0);
  useEffect(() => {
    const bump = () => setCustomVer((v) => v + 1);
    window.addEventListener('bfx-custom-changed', bump);
    document.addEventListener('visibilitychange', bump);
    return () => {
      window.removeEventListener('bfx-custom-changed', bump);
      document.removeEventListener('visibilitychange', bump);
    };
  }, []);
  const odAll = useMemo(() => [...OD_MODELS, ...customOdModels()], [customVer]);
  const ampAll = useMemo(() => [...AMP_MODELS, ...customAmpModels()], [customVer]);
  const ampDisplayIdx = useMemo(() => ampDisplayOrder(ampAll), [ampAll]);
  /* ★ 2026-10-19：FX 预设数量收敛（合唱/延迟 3、混响 5）→ 旧会话里存的下标可能越界，
     启动时夹回范围，避免卡片型号名显示「—」、弹窗没有选中项。 */
  useEffect(() => {
    setFxIdx((p) => {
      const n = { ...p };
      (Object.keys(FX) as FxId[]).forEach((k) => {
        const max = FX[k].presets.length - 1;
        if (n[k] > max) n[k] = Math.max(0, max);
      });
      return n;
    });
  }, []);
  /* 自定义模块被删除后，原下标可能越界 → 回退到最后一个可用型号 */
  useEffect(() => {
    setOdIdx((i) => Math.min(i, odAll.length - 1));
    setAmpIdx((i) => Math.min(i, ampAll.length - 1));
  }, [odAll.length, ampAll.length]);
  /* 调试页「加载」自定义模块 → 首页同步切换当前型号 */
  useEffect(() => {
    const onApply = (e: Event) => {
      const d = (e as CustomEvent<{ kind: 'od' | 'amp'; id: string }>).detail;
      if (!d) return;
      const list = d.kind === 'od' ? odAll : ampAll;
      const i = list.findIndex((m) => m.id === `custom-${d.id}`);
      if (i >= 0) {
        if (d.kind === 'od') setOdIdx(i); else setAmpIdx(i);
        setOn((p) => ({ ...p, [d.kind === 'od' ? 'overdrive' : 'amp-head']: true }));
      }
    };
    window.addEventListener('bfx-custom-apply', onApply);
    return () => window.removeEventListener('bfx-custom-apply', onApply);
  }, [odAll, ampAll]);
  const [fxIdx, setFxIdx] = useState<Record<FxId, number>>(() => ({
    chorus: 0, delay: 0, reverb: 1, ...(boot?.fxIdx ?? {}),
  }) as Record<FxId, number>);

  const [values, setValues] = useState<Record<string, Record<number, number>>>(() => {
    const init: Record<string, Record<number, number>> = {
      'noise-gate': { 1: SPECS.GATE_THRESHOLD.def },
      boost: { [-1]: SPECS.BOOST_LEVEL.def },
    };
    init.compressor = { ...(COMP_MODELS[0]?.regs ?? {}) };
    init['amp-head'] = { ...(AMP_MODELS[0]?.regs ?? {}), [AMP_MASTER_ADDR]: SPECS.AMP_MASTER.def };
    init.cabinet = {};
    init.chorus = { ...CHORUS_PRESETS[0].regs };
    init.delay  = { ...DELAY_PRESETS[0].regs };
    init.reverb = { ...REVERB_PRESETS[1].regs };
    /* ★ 上次会话里有值的模块直接覆盖（型号默认 → 用户上次调完的状态） */
    const saved = boot?.values;
    if (saved) {
      for (const k of Object.keys(saved)) {
        if (saved[k] && typeof saved[k] === 'object') init[k] = { ...saved[k] };
      }
    }
    return init;
  });

  /* ★ WO-02：逐条下发 + 进度上报（与 BLE 20ms 闸门同节奏） */
  /* ★★ v3.69（2026-10-24 用户报障「首页切换箱头箱体没有浮窗，只有箱头里面有一个下发显示」）：
     首页 v5 的型号切换全部走这里，不经 Index 的 handleSubModelChange（那条是旧 PedalPanel 的路径），
     所以 v3.68 的加载窗在首页没生效。现在整批下发期间：
       ① 挂全局 LOADING 遮罩并吃掉所有点击（切换期间禁止其他操作）
       ② 时长按用户口径（v3.70 已切到 **B 口径**：全部 15ms/条 + 尾 150ms，
          不再给旁路位额外 50ms —— 见 passThrough.switchWindowMs），
          写完按实际耗时补足剩余；不足则立即撤。
     卡片里的「下发中 x/y」保留 —— 那是真实进度，遮罩里也能看到副标题。 */
  const sendAll: Sender = useCallback(async (regs, label, modId, muteHint) => {
    /* ★★ v3.71 起 · **延迟**「先旁路 → 写参数 → 恢复开关」（v3.74 收紧口径）
     *
     * 用户原话：「切换延迟效果器直接在当前频道写参数，会有一个很长时间的延迟尾音
     *   出来，但是如果写好参数，直接开启 BYPASS 开关，就没有这个问题。」
     *
     * 首页换效果器预设（applyFx）就是「直接写参数」的典型场景：延迟正开着，
     * 222/223 一改，旧缓冲整段播出来 = 长尾音。
     *
     * ★★ v3.74（2026-10-24 用户拍板）：「延迟需要在前一个和后一个频道预加载」
     *   → **不再要求起始是开着**：只要本批要写 222/223、且能确定目标开关值，
     *     就先把 221=1 再写参数。起始本来就关着时这一帧是重复写，硬件无感知。
     *     目标值完全未知（regs 与值仓都没这一位）→ 不动开关，避免关掉后没人开。
     *   ⛔ 合唱已从 PRE_BYPASS_FX 移除 —— 用户明确要求合唱不再预加载。 */
    const pre: Array<[number, number]> = [];
    const post: Array<[number, number]> = [];
    const pulled = new Set<number>();
    for (const fx of PRE_BYPASS_FX) {
      if (!fx.params.some((a) => regs[a] !== undefined)) continue;   // 本批不写它的参数
      const cur = (valuesRef.current as Record<string, Record<number, number> | undefined>)[fx.name]?.[fx.sw];
      const tv = regs[fx.sw] ?? cur;
      if (tv === undefined) continue;                                // 目标未知 → 不碰开关
      pre.push([fx.sw, 1]);
      if (tv !== 1) post.push([fx.sw, tv]);
      pulled.add(fx.sw);
    }
    const midKeys = orderBypassSplit(
      Object.keys(regs).map(Number).filter((n) => Number.isFinite(n) && !pulled.has(n)),
      (a) => a,
      (a) => (regs as Record<number, number>)[a],
    );
    const plan: Array<[number, number]> = [
      ...pre,
      ...midKeys.map((a) => [a, regs[a]] as [number, number]),
      ...post,
    ];
    const keys = plan.map(([a]) => a);
    if (!keys.length) return;
    const t0 = Date.now();
    /* ★★ 2026-10-26（P0/P1 修复，本轮三件事都在这几行）
     *
     * ① **未连接不得下发**。旧实现完全不判 `btConnected`：`onParam` 在未连接时
     *    一律 `return false`，而本函数从不检查返回值 —— 于是照样全屏 LOADING、
     *    进度跑满 35~80 格、卡片亮"未写入硬件"红点、再给一个必失败的重试按钮，
     *    而**本地型号与参数已经被改写**。重启后 UI 与硬件完全对不上。
     *
     * ② **并发守卫必须用同步单例 `isBusy()`**。旧实现是 `busyGuard = () => !!prog`，
     *    而 `prog` 是异步渲染的 state —— 连点两个型号时两次调用都读到 null，
     *    两批 EA 帧交错写入、`prog` 互相覆盖、先结束那批提前撤遮罩，
     *    静音开/关也会交错（爆音或永久静音的来源之一）。
     *
     * ③ **先把锁拿到手，再做任何 await**。旧实现 `beginBusy` 在 `await onMuteGuard(true)`
     *    之后，中间 50~200ms 是空窗期，第二次点击正好能挤进来。 */
    if (!btConnected) {
      notifyErr(lang === 'zh' ? '未连接设备，无法下发' : 'Not connected — nothing was sent');
      return;
    }
    if (isBusy()) return;
    /* ★★ v3.75（H1）：换箱头/箱体 = 重建 NAM 模型，必须静音，否则爆音。
       时序与 Index 完全一致：拿锁 → duckOn → 写批 → 等窗口 → endBusy → duckOff。 */
    const guard = !!(muteHint && onMuteGuard);
    beginBusy(lang === 'zh' ? '加载中…' : 'LOADING…', label);
    try {
      if (guard) { try { await onMuteGuard!(true); } catch { /* ignore */ } }
      setProg({ done: 0, total: plan.length, modId: modId ?? '' });
      for (let i = 0; i < plan.length; i++) {
        const [addr, val] = plan[i];
        try { await onParam(addr, val, modId, true); } catch { /* 由 onParam 内部上报 */ }
        setProg({ done: i + 1, total: plan.length, modId: modId ?? '' });
        await new Promise((r) => setTimeout(r, EA_WRITE_MS));   // 与写闸门同节奏，进度即真实进度
      }
    } finally {
      setProg(null);
      const need = switchWindowMs(keys.length);
      const left = need - (Date.now() - t0);
      if (left > 30) {
        endBusyAfter(left);
        /* 用户口径：「切换前先开启 MUTE，LOADING 结束后再关闭」→ 撑到遮罩撤掉 */
        if (guard) await new Promise((r) => setTimeout(r, left));
      } else {
        endBusy();
      }
      /* ★★ v3.75（H1）：解除静音放 finally —— 异常/提前返回也必须复位，否则整机静音 */
      if (guard) { try { await onMuteGuard!(false); } catch { /* ignore */ } }
    }
    setFlashMod(modId);
    window.setTimeout(() => setFlashMod((m) => (m === modId ? null : m)), 700);
    console.info(`[BFX1] ${label}: 下发 ${keys.length} 个寄存器（延迟先旁路→写参数→按目标恢复开关，其余按目标值分段）`);
  }, [onParam, lang, onMuteGuard, btConnected]);

  /* ★ v6.2 频道快照到达 → 恢复首页各模块旋钮值与开关（不写硬件） */
  useEffect(() => {
    if (!sync || !sync.regs) return;
    const regs = sync.regs;
    setValues((prev) => {
      const next: Record<string, Record<number, number>> = { ...prev };
      for (const modId of Object.keys(HOME_REG_SEGS)) {
        const cur = { ...(next[modId] ?? {}) };
        for (const [lo, hi] of HOME_REG_SEGS[modId]) {
          for (const k of Object.keys(regs)) {
            const addr = Number(k);
            if (addr >= lo && addr <= hi) cur[addr] = regs[addr];
          }
        }
        next[modId] = cur;
      }
      return next;
    });
    if (sync.modules) setOn((prev) => ({
      ...prev,
      ...sync.modules,
      /* ★★ v3.59（F6，2026-10-24 用户报障）：**删掉 'amp-head': true / cabinet: true 两行硬覆盖**。
         2026-10-15 加这两行是怕「频道快照把箱头关掉」，代价是 A1「线材直出」这种全旁路档
         明明数据侧 amp-head/cabinet 都是 false（reg 57/72/107 = 1），界面却永远显示「开」，
         用户看到「线材直通模式下箱头箱体开关还是常开」。现在真实跟随快照的 modules。 */
    }));
    /* ★ 2026-10-19（用户要求「预设要能直接换成对应音色」）：
       预设/频道带过来的子型号名 → 把型号卡也切过去，
       否则寄存器是新音色、界面还挂着旧型号名。 */
    /* ★★ v3.89（用户 2026-10-27「预设库只要 UI 跟随，UI 跟随同步即可」）：
       激励 BOOST 不在寄存器表里，regs 循环覆盖不到它 → 单独把归一值换算成 0…10 档位写进 values。
       **只动 UI**：不发 PGA 帧（预设库切档依旧不写硬件）。
       存档里没这个字段时保持当前档位不跳变（老音色不带 boost = 未知，不猜 0）。 */
    if (typeof sync.boost === 'number' && Number.isFinite(sync.boost)) {
      const lv = Math.max(0, Math.min(10, Math.round(sync.boost * 10)));
      setValues((prev) => {
        const cur = prev.boost?.[-1];
        if (cur === lv) return prev;
        return { ...prev, boost: { ...(prev.boost ?? {}), [-1]: lv } };
      });
    }
    const sm = sync.subModels;
    if (sm) {
      /* ★ 本档是否「没有任何型号」：subModels 为空，或所有值都是空串。
         线材四档（DIRECT / DI-PASSIVE / CABLE-*）就是这种。 */
      setModelsBlank(Object.values(sm).every((v) => !v));
      /* ★★ v3.78：subModels 现在存 **key**（老存档里的旧中文名 / 旧 id 走反查链补成 key）。
         自定义模块（custom-xxx）不在注册表里 → resolveModelKey 返回 null，直接拿原值比 id。 */
      const kOf = (mod: string, v?: string) => (v ? (resolveModelKey(mod, v) ?? v) : '');
      const ai = ampAll.findIndex((m) => m.key === kOf('amp-head', sm['amp-head']) || m.id === sm['amp-head']);
      if (ai >= 0) setAmpIdx(ai);
      const oi = odAll.findIndex((m) => m.key === kOf('overdrive', sm['overdrive']) || m.id === sm['overdrive']);
      if (oi >= 0) setOdIdx(oi);
      const ci = COMP_MODELS.findIndex((m) => m.key === kOf('compressor', sm['compressor']) || m.id === sm['compressor']);
      if (ci >= 0) setCompIdx(ci);
      /* ★ 2026-10-20 修复：箱体原来漏了同步。
         后果①界面箱体名一直停在上次的值（用户看到「所有箱体都一样」）；
         后果②保存音色时 cabRegsFallback 用旧 cabIdx 兜底 → 把 108–142 覆盖成错的箱体。 */
      const cabi = sm['cabinet'] ? CAB_NAMES.indexOf(displayNameOf('cabinet', kOf('cabinet', sm['cabinet']))) : -1;
      if (cabi >= 0) { setCabIdx(cabi); setMicIdx(0); }
      const fxPick = (id: FxId) => {
        const k = kOf(id, sm[id]);
        return FX[id].presets.findIndex((p) => p.key === k || p.name === sm[id]);
      };
      const fc = fxPick('chorus'); const fd = fxPick('delay'); const fr = fxPick('reverb');
      if (fc >= 0 || fd >= 0 || fr >= 0) {
        setFxIdx((p) => ({
          chorus: fc >= 0 ? fc : p.chorus,
          delay: fd >= 0 ? fd : p.delay,
          reverb: fr >= 0 ? fr : p.reverb,
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync?.tick]);

  /* 调试面板回写同步 */
  useEffect(() => {
    const s = extSync;
    if (!s || !s.tick || !s.module) return;
    setValues((prev) => {
      const cur = prev[s.module];
      if (!cur || cur[s.addr] === s.value) return prev;
      return { ...prev, [s.module]: { ...cur, [s.addr]: s.value } };
    });
  }, [extSync]);

  /* ── v5.3 交互状态 ── */
  const rootRef = useRef<HTMLDivElement | null>(null);              // 量锚点 rect 用（容器坐标系）
  const [floatMod, setFloatMod] = useState<string | null>(null);    // 贴卡片浮窗的模块
  const [floatRect, setFloatRect] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  const [floatIn, setFloatIn] = useState(false);                     // 进场动画开关（贴卡 → 弹出）
  /* ★ v5.3 动态弹出（贴选项）：型号 / 预设 / 箱体 / 麦克风，全部锚定到被点选项 */
  const [popup, setPopup] = useState<{ spec: PopupSpec; rect: { l: number; t: number; w: number; h: number; ch: number } } | null>(null);
  const [popupIn, setPopupIn] = useState(false);
  /* ★ v5.3 调节数值：显示在浮窗上方模糊区（只数字+单位，无框） */
  const [readout, setReadout] = useState<string>('');
  /* ★ v6.1 首次可发现提示（只播一次，localStorage 记住）：所有旋钮可直接拖动 · 按住放大 */
  const [knobHint, setKnobHint] = useState(() => {
    try { return !localStorage.getItem('bfx_knobHintV2'); } catch { return false; }
  });
  useEffect(() => {
    if (!knobHint) return;
    const t = window.setTimeout(() => {
      setKnobHint(false);
      try { localStorage.setItem('bfx_knobHintV2', '1'); } catch { /* ignore */ }
    }, 4200);
    return () => clearTimeout(t);
  }, [knobHint]);
  /* ★ WO-01 写入失败（按模块计数，>0 显示红点） */
  const [failMap, setFailMap] = useState<Record<string, number>>({});
  /* ★ v6.2 关闭告警条时记住「当时的失败模块数」；后续失败更多时会再次提示（不再永久静默） */
  const [failClosedCount, setFailClosedCount] = useState(0);
  /* ★ WO-02 下发进度 / 完成闪示 */
  /* ★ 2026-10-26（P2 修复）：进度带上模块归属。
     旧实现 `prog` 是个全局单值，而「下发中 x/y」只画在**箱头卡**上 ——
     换箱体 / 过载 / 混响时进度出现在箱头卡里，箱体卡毫无反馈，用户以为串了。 */
  const [prog, setProg] = useState<{ done: number; total: number; modId: string } | null>(null);
  const [flashMod, setFlashMod] = useState<string | null>(null);
  /* ★ WO-06 箱头读数（显示在②区上方，替代旋钮气泡） */
  const [ampRead, setAmpRead] = useState('');
  /* ★ v6.3/v6.4 ③区图形：音箱网罩图 / 耳机头戴图 —— 纯显示切换，不写任何寄存器、不影响声音 */
  const [cabView, setCabView] = useState<CabViewKey>(() => {
    /* ★ 2026-11-04：新增 MIX 后，记忆值必须是 CAB_VIEWS 里的合法 key（否则回落 spk） */
    try {
      const saved = localStorage.getItem('bfx_cabView');
      return (CAB_VIEWS.find((v) => v.key === saved)?.key ?? 'spk') as CabViewKey;
    } catch { return 'spk'; }
  });
  const pickCabView = useCallback((v: CabViewKey) => {
    setCabView(v);
    try { localStorage.setItem('bfx_cabView', v); } catch { /* ignore */ }
    /* ★ 2026-11-05（用户拍板）：切产品型号 = 切经典蓝牙音乐 EQ。
       bleManager 已在文件顶部 import（L30），这里只做一次 fire-and-forget 写。
       未连接时静默失败；连接后由 btConnected effect 补发一次，保证硬件与 UI 一致。 */
    void bleManager.writeEqProfile(EQ_PROFILE_BY_VIEW[v]).catch(() => { /* ignore */ });
  }, []);
  /* ★ 2026-10-17（用户要求）：设备切换改为左右箭头，循环切换（当前 2 个：音箱 / 耳机） */
  const cycleCabView = useCallback((step: number) => {
    const i = CAB_VIEWS.findIndex((v) => v.key === cabView);
    const n = CAB_VIEWS.length || 1;
    pickCabView(CAB_VIEWS[(((i < 0 ? 0 : i) + step) % n + n) % n].key as CabViewKey);
  }, [cabView, pickCabView]);
  /* ★ 2026-10-17：设备图点击反馈 —— 每次点按自增，用作 key 让动画重播 */
  const [cabImgPop, setCabImgPop] = useState(0);

  /* ★★★ 2026-10-31（用户要求）：**首页换箱头 / 箱体时才做「总音量 MUTE」**。
   *
   *   为什么只在这条路径做：箱头、箱体的参数是 35 段 PEQ + 一整条 NAM 模型，
   *   逐帧写入时 DSP 内部会重建滤波器，那段过程本身会吐出扫频/自激声 ——
   *   与有没有输入信号无关，只关输入（reg2）挡不住，必须把 DSP 输出也闭掉（reg260）。
   *
   *   ⛔ 其它路径一律不做：本地库载入、预设库切档、保存、上传 —— 用户明确要求不要。
   *   ⚠ reg260 是 **latch**：写 1 就一直静音，固件切档/开机都不重置。
   *     所以这里恢复时**无条件写 0**（不是"进入前值"），并有 4 秒兜底定时器；
   *     任何异常、提前 return、断线都不会把它留在 1。
   */
  const withOutputMute = useCallback(async (run: () => Promise<unknown>) => {
    const reg = (v: number) => bleManager.writeRegister(260, v, 0xEA).catch(() => {});
    await reg(1);
    const guard = window.setTimeout(() => { void reg(0); }, 4000);
    try {
      await run();
    } finally {
      window.clearTimeout(guard);
      await new Promise((r) => setTimeout(r, 80));   // 等最后几帧落定再开输出
      await reg(0);
    }
  }, []);

  /* ★★★ 2026-10-31（用户要求「所有预设的 UI 显示都要和固件对得上」）：
     「本档没有任何型号」的标记。线材四档（1a–1d）就是这种：modules 全关、subModels 是空对象。
     旧实现只在 `findIndex >= 0` 时才 setAmpIdx/setCabIdx/...，所以切到线材档时
     箱头/箱体/压缩/过载/合唱/延迟/混响的型号名**全部残留上一档**——
     开关是关的、名字却是别人的，最容易让人以为「切过去没生效」。
     现在用一个布尔把副标题统一显示成「—」，不动各个 idx（避免负索引传到解析链里）。 */
  const [modelsBlank, setModelsBlank] = useState(false);

  /* ★ 2026-10-17（用户要求「点底板空白处换模块颜色」）：
     配色集中在 services/accentTheme.ts —— 因为顶栏空白处（换底板色）和底部 TONE 键
     （双击复位 / 长按锁定）都定义在 Index 里，需要跨组件共享同一份状态。 */
  const [accents, setAccents] = useState<AccentMap>(() => getAccents());
  useEffect(() => subscribeAccents(() => setAccents(getAccents())), []);
  const acOf = useCallback(
    (id: string): string => accents[id] ?? THEMES[id]?.ac ?? '#e8b860',
    [accents],
  );
  const rollAccent = useCallback((id: string) => { rollAccentStore(id, THEMES[id]?.ac); }, []);
  /** 箱头 / 箱体是自绘区域（不走 FxCard），单独取色 */
  const ampAc = acOf('amp-head');
  const cabAc = acOf('cabinet');
  /** 当前设备定义（型号备注 + 图片）—— 新增设备只在 CAB_VIEWS 加一条 */
  const cabViewDef = CAB_VIEWS.find((v) => v.key === cabView) ?? CAB_VIEWS[0];
  /* ★ WO-18 撤销快照（每模块保留一组上一值） */
  const undoRef = useRef<Record<string, Record<number, number>>>({});
  const failCount = Object.values(failMap).filter((n) => n > 0).length;

  /* ══════════ 会话持久化（★ 2026-10-17 用户要求）══════════
     ① 任何参数/开关/型号变化 → 350ms 防抖落盘；
     ② 退到后台（切应用 / 锁屏 / 被系统回收前）→ 立刻落盘；
     ③ 蓝牙断开 → 立刻落盘（其实②①已经保证有值，这里只是兜底）；
     ④ 重新连上 → 把当前 UI 参数整机写回硬件（= 恢复之前的参数）。
     这样「断开后重连」「关掉 App 再打开」两种场景都不会丢调好的音色。 */
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const snapRef = useRef<SessionState | null>(null);
  snapRef.current = {
    v: 1, savedAt: Date.now(),
    on, compIdx, odIdx, ampIdx, cabIdx, micIdx, cabView, fxIdx, values,
  };

  useEffect(() => {
    const t = window.setTimeout(() => { if (snapRef.current) saveSession(snapRef.current); }, 350);
    return () => window.clearTimeout(t);
  }, [values, on, compIdx, odIdx, ampIdx, cabIdx, micIdx, cabView, fxIdx]);

  useEffect(() => {
    const flush = () => { if (snapRef.current) saveSession(snapRef.current); };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  /** 把当前 UI 的所有模块参数整机写回硬件（手动恢复用）。
   *  ★ v3.57：连接后不再自动调用（见下方 btConnected effect）。 */
  const pushAllCurrent = useCallback(async () => {
    const ORDER = ['noise-gate', 'compressor', 'boost', 'amp-head', 'cabinet', 'chorus', 'delay', 'reverb'];
    for (const m of ORDER) {
      const v = valuesRef.current[m];
      if (!v) continue;
      if (m === 'boost') {
        /* 激励走 PGA，档位记在 key -1（不是真寄存器，不能进 sendAll） */
        const lv = v[-1];
        if (typeof lv === 'number') { try { await onParam('PGA', lv, 'boost'); } catch { /* 忽略单条失败 */ } }
        continue;
      }
      const regs: Record<number, number> = {};
      for (const [a, val] of Object.entries(v)) {
        const n = Number(a);
        if (Number.isFinite(n) && n >= 0) regs[n] = val;
      }
      if (!Object.keys(regs).length) continue;
      await sendAll(regs, `restore ${m}`, m);
    }
  }, [onParam, sendAll]);

  const prevBtRef = useRef(!!btConnected);
  useEffect(() => {
    const was = prevBtRef.current;
    prevBtRef.current = !!btConnected;
    if (!btConnected) {
      /* 断开 → 立刻落盘（兜底，前面几层已经存过） */
      if (was && snapRef.current) saveSession(snapRef.current);
      return;
    }
    if (was) return;
    /* ★★ v3.57（2026-10-23 用户拍板 K2）：**连接后不再整机重写当前频道**。
       原先刚连上 +1400ms 会调 pushAllCurrent()，用 EA 把当前频道的全部模块参数写一遍 ——
       硬件该频道本来就有自己的参数，这属于重复下发；而且在合唱/延迟正开着的格上
       重写 216–223 还会有 1–3 秒声音不正常的风险。
       现在连接后只做「查频道号 + UI 对齐」（Index.handleBleConnect），一个参数都不发。
       pushAllCurrent 保留：手动恢复场景仍可用，只是不再自动触发。 */
    /* ★ 2026-11-05：唯一例外 —— 连接成功后同步一次「当前产品型号 → EQ 配置文件」。
       固件开机默认是 GO（index 0），用户上次停在 MIX 时若不补发，音乐 EQ 会与 UI 不符。 */
    void bleManager.writeEqProfile(EQ_PROFILE_BY_VIEW[cabView]).catch(() => { /* ignore */ });
  }, [btConnected]);  // eslint-disable-line react-hooks/exhaustive-deps
  /** 主滚动区（四分区容器）：矮屏可纵向滚动 */
  const mainRef = useRef<HTMLDivElement | null>(null);

  /* ── 应用：型号 / 预设 / 箱体 ── */
  /**
   * ★★ 2026-10-26（P0 修复）：守卫改读**同步单例** `isBusy()`。
   *   旧实现 `!!prog`：`prog` 是异步渲染的 state，连点两个型号时两次调用都读到 null
   *   → 两次 `sendAll` 并发 → 寄存器帧交错写入（详见 sendAll 内的说明）。
   *   `isBusy()` 在 `beginBusy()` 那一行就同步置位，没有渲染延迟。
   */
  const busyGuard = () => isBusy() || !!prog;
  /** ★ 2026-10-26（P1 修复）：未连接时任何"选型号"动作都不该执行 ——
   *  否则会走完整批 UI（LOADING + 进度 + 未写入红点）却一个字节都没发。 */
  const notConnected = () => {
    if (btConnected) return false;
    notifyErr(lang === 'zh' ? '未连接设备，无法下发' : 'Not connected — nothing was sent');
    return true;
  };
  const applyComp = (i: number) => {
    if (busyGuard() || notConnected()) return;
    undoRef.current.compressor = { ...(values.compressor ?? {}) };
    setCompIdx(i);
    const regs = COMP_MODELS[i]?.regs ?? {};
    setValues((p) => ({ ...p, compressor: { ...regs } }));
    void sendAll(regs, `压缩器 → ${COMP_MODELS[i]?.name}`, 'compressor');
  };
  const applyOd = (i: number) => {
    if (busyGuard() || notConnected()) return;
    undoRef.current.overdrive = { ...(values.overdrive ?? {}) };
    setOdIdx(i);
    const regs = odAll[i]?.regs ?? {};
    setValues((p) => ({ ...p, overdrive: { ...regs } }));
    void sendAll(regs, `过载 → ${odAll[i]?.name}`, 'overdrive');
  };
  const applyAmp = (i: number) => {
    if (busyGuard() || notConnected()) return;
    /* ★ 2026-10-26：换箱头后必须清掉上一台的旋钮读数，
       否则新箱头上方仍挂着上一台某个旋钮的旧值（橙色高亮，看着像当前值）。 */
    setAmpRead('');
    undoRef.current['amp-head'] = { ...(values['amp-head'] ?? {}) };
    setAmpIdx(i);
    onAmpModel?.(i);
    const base = { ...(ampAll[i]?.regs ?? {}) };
    /* ★★ 2026-10-21（用户实测：预设加载的箱头音色，与在首页点一次同一台箱头，差 14–20 dB）：
       根因是「应用型号」会把 64 GAIN / 79 DRIVE / 66 VOL1 / 81 VOL2 无条件写回型号出厂值，
       而预设是按音色设计过这四个值的。
       修法：点的是【当前已经是的那台箱头】时，保留当前这四个值（其余固定段/音调照常刷新）；
       只有换到【不同型号】才写出厂值 —— 这样「换箱头 = 拿到该型号出厂音色」的直觉不变，
       而「点一下看当前型号」不会破坏正在听的音色。 */
    if (i === ampIdx) {
      const keep = values['amp-head'] ?? {};
      for (const a of [64, 79, 66, 81]) {
        if (keep[a] !== undefined) base[a] = keep[a];
      }
    }
    /* ★★ 2026-10-26（P1 修复）：MASTER(239) 只对**内置型号**写回 0 dB 出厂值。
       自定义箱头已把 MASTER 从 UI 上摘掉（用户要求「去掉 MASTER」），
       若这里仍无条件写 500，就等于把导出时那个可能的 −15 dB 直接顶到 0 dB
       —— 输出突增 10~20 dB 造成爆音，而用户在界面上没有任何入口能改回来。 */
    const isCustomAmp = (ampAll[i] as { cls?: string } | undefined)?.cls === 'CUSTOM';
    const regs = isCustomAmp
      ? { ...base }
      : { ...base, [AMP_MASTER_ADDR]: SPECS.AMP_MASTER.def };
    setValues((p) => ({ ...p, 'amp-head': { ...regs } }));
    /* ★★ v3.75（H1）：只有真的换了一台箱头才静音（同型号再点一次不静音）
       ★ 2026-10-31：换型号时额外包一层「输出静音」（reg260），专治 NAM 重建的扫频声。
         只包这一条路径 —— 本地库/预设库载入不走这里。 */
    const ampChanged = (ampAll[i]?.name ?? '') !== (ampAll[ampIdx]?.name ?? '');
    const label = `箱头 → ${ampAll[i]?.name}`;
    if (ampChanged) {
      void withOutputMute(() => sendAll(regs, label, 'amp-head', true));
    } else {
      void sendAll(regs, label, 'amp-head', false);
    }
  };
  const applyFx = (id: FxId, i: number) => {
    if (busyGuard() || notConnected()) return;
    undoRef.current[id] = { ...(values[id] ?? {}) };
    setFxIdx((p) => ({ ...p, [id]: i }));
    const regs = FX[id].presets[i]?.regs ?? {};
    setValues((p) => ({ ...p, [id]: { ...regs } }));
    void sendAll(regs, `${FX[id].title} → ${FX[id].presets[i]?.name}`, id);
  };
  const applyCab = (ci: number, mi: number) => {
    if (busyGuard() || notConnected()) return;
    /* ★ 2026-10-26：先判空再改 state —— 旧实现先 setCabIdx/setMicIdx、后 `if (!s) return`，
       箱体在 CAB_SETS 里查不到时会留下"UI 已换、values 没换、undo 快照脏"的半截状态。 */
    const sets = CAB_SETS.filter((s) => s.cab === CAB_NAMES[ci]);
    const s = sets[Math.min(mi, sets.length - 1)];
    if (!s) { notifyErr(lang === 'zh' ? '该箱体没有可用数据' : 'No data for this cabinet'); return; }
    undoRef.current.cabinet = { ...(values.cabinet ?? {}) };
    setCabIdx(ci); setMicIdx(mi);
    const regs: Record<number, number> = {};
    s.bands.forEach((v, k) => { regs[108 + k] = v; });
    setValues((p) => ({ ...p, cabinet: regs }));
    /* ★★ v3.75（H1）：换箱体名才静音；只换麦克风（108+ 的 EQ 段）不静音
       ★ 2026-10-31：换箱体名时额外包一层「输出静音」，同样是治 35 段 PEQ 重建的扫频。 */
    const cabChanged = (CAB_NAMES[ci] ?? '') !== (CAB_NAMES[cabIdx] ?? '');
    const label = `箱体 → ${s.display}`;
    if (cabChanged) {
      void withOutputMute(() => sendAll(regs, label, 'cabinet', true));
    } else {
      void sendAll(regs, label, 'cabinet', false);
    }
  };

  /** ★ WO-18 还原该模块（长按灯开关触发） */
  const doUndo = (modId: string) => {
    const snap = undoRef.current[modId];
    if (!snap || !Object.keys(snap).length || busyGuard()) return;
    delete undoRef.current[modId];
    setValues((p) => ({ ...p, [modId]: { ...snap } }));
    void sendAll(snap, `还原 ${nameOf(modId)}`, modId);
  };

  /** ★ 2026-10-16（A1）：是否有可还原快照（驱动浮窗内「↺ 还原」按钮的显隐） */
  const hasUndo = (modId: string): boolean => {
    const snap = undoRef.current[modId];
    return !!snap && Object.keys(snap).length > 0;
  };

  /* ══════════ 型号默认「甜点值」（★ 2026-10-17 用户要求）══════════
   * 每个型号在 `_def/*Def.ts` 的 regs 里自带一整套设计值（出厂音色）。
   * 「还原」按钮 = 回到当前型号这一套值；切换型号时也是加载同一套 → 行为一致。
   * 没有型号概念的模块（噪声门 / BOOST / 合唱…）退回原来的「撤销快照」。 */
  const modelDefaultsOf = (modId: string): Record<number, number> | null => {
    if (modId === 'compressor') return COMP_MODELS[compIdx]?.regs ?? null;
    if (modId === 'overdrive') return odAll[odIdx]?.regs ?? null;
    if (modId === 'amp-head') return ampAll[ampIdx]?.regs ?? null;
    /* ★ 2026-10-17（用户要求「继续修改剩下的三个效果器」）：合唱 / 延迟 / 混响
       也接上「还原到本预设默认值」—— 之前它们只能依赖撤销快照，
       一旦关掉浮窗就再也回不到预设的出厂参数。 */
    if (modId in FX) return FX[modId as FxId].presets[fxIdx[modId as FxId]]?.regs ?? null;
    return null;
  };
  const restoreToModelDefault = (modId: string) => {
    const regs = modelDefaultsOf(modId);
    if (!regs) { doUndo(modId); return; }          // 无型号数据 → 退回撤销快照
    if (busyGuard()) return;
    undoRef.current[modId] = { ...(values[modId] ?? {}) };   // 仍留一次撤销
    setValues((p) => ({ ...p, [modId]: { ...p[modId], ...regs } }));
    void sendAll(regs, lang === 'zh' ? `还原 ${nameOf(modId)}` : `reset ${nameOf(modId)}`, modId);
  };

  /* ★ 2026-10-17（H2）：写入失败重试 —— 原设计只给红点/告警条，用户知道"没写进去"却
   *   无事可做（只能反复手动拧旋钮）。这里一键把失败的模块按当前值重发一遍：
   *   · 逐条 onParam 并按寄存器计入失败数 → 成功则红点自动清零，仍失败则保留计数；
   *   · 顺序与 setV 一致：统一走 orderBypassSplit（关=前置 / 开=后置）。 */
  const retryFailed = useCallback(async () => {
    const bad = Object.keys(failMap).filter((k) => (failMap[k] ?? 0) > 0);
    if (!bad.length || prog) return;
    for (const modId of bad) {
      if (modId === 'master') {
        try { onOutVol?.(outVol ?? 1); setFailMap((p) => ({ ...p, master: 0 })); } catch { /* 保留计数 */ }
        continue;
      }
      const regs = values[modId] ?? {};
      const keys = orderBypassSplit(
        Object.keys(regs).map(Number).filter((n) => Number.isFinite(n)),
        (a) => a,
        (a) => regs[a],
      );
      if (!keys.length) { setFailMap((p) => ({ ...p, [modId]: 0 })); continue; }
      setProg({ done: 0, total: keys.length, modId });
      let still = 0;
      for (let i = 0; i < keys.length; i++) {
        try { const ok = await onParam(keys[i], regs[keys[i]], modId); if (!ok) still++; }
        catch { still++; }
        setProg({ done: i + 1, total: keys.length, modId });
        await new Promise((r) => setTimeout(r, EA_WRITE_MS));   // 与写闸门同节奏
      }
      setProg(null);
      setFailMap((p) => ({ ...p, [modId]: still }));
      setFlashMod(modId);
      window.setTimeout(() => setFlashMod((m) => (m === modId ? null : m)), 700);
    }
  }, [failMap, values, prog, onParam, onOutVol, outVol]);  // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback((id: string) => {
    setOn((prev) => {
      const nv = !prev[id];
      onBypass(id, nv);
      /* ★★ v3.75（H2）：旁路位必须**同步回写 values** —— 否则 sendAll 的目标开关值
         （`regs[fx.sw] ?? values[fx.name][fx.sw]`）拿到的是过时值：
           ① 用户先关掉延迟（硬件 221=1），values 里还是 0 → 切延迟预设时
              post 段推入 [221,0]，**把已经关掉的延迟重新开起来**，卡片却还显示「关」；
           ② 首次启动 values 里根本没有这一位 → 目标未知 → 跳过 pre → 长尾音复现。
         这里写「按新状态该写的值」（on → spec.on，off → spec.off），与硬件完全一致。 */
      const spec = MODULE_ON_OFF[id];
      if (spec && spec.reg >= 0) {
        setValues((p) => ({ ...p, [id]: { ...(p[id] ?? {}), [spec.reg]: nv ? spec.on : spec.off } }));
      }
      return { ...prev, [id]: nv };
    });
  }, [onBypass]);

  /* ── 旋钮改动（本地 values + BLE） ── */
  /**
   * 写入一个寄存器（拖动松手调用）
   * ★ v6.2：撤销快照每次改动都覆盖 → 长按灯开关「还原该模块」= 回到上一步（与切型号路径语义一致）
   * ★ v6.2：failAs 指定失败归属（总音量走 amp-head 的值仓，但失败应记在 master 名下）
   */
  const setV = (modId: string, reg: number | 'PGA', v: number, failAs?: string) => {
    const key = typeof reg === 'number' ? reg : -1;
    const fk = failAs ?? modId;
    undoRef.current[modId] = { ...(values[modId] ?? {}) };
    setValues((p) => ({ ...p, [modId]: { ...p[modId], [key]: v } }));
    onParam(reg, v, modId).then((ok) => {                       // WO-01 失败可见化
      setFailMap((p) => (ok ? (p[fk] ? { ...p, [fk]: 0 } : p) : { ...p, [fk]: (p[fk] ?? 0) + 1 }));
    }).catch(() => {
      setFailMap((p) => ({ ...p, [fk]: (p[fk] ?? 0) + 1 }));
    });
  };

  /* ── 描述符 ── */
  const master = useMemo(
    () => masterKnob(outVol ?? 1, onOutVol),
    [outVol, onOutVol],  // eslint-disable-line react-hooks/exhaustive-deps
  );
  /* ★★ v3.77（P3）：同一次渲染内，每个模块的描述符最多算一次。
   *
   * 旧实现是个 useCallback（依赖 values）：每次拖动旋钮 values 变 → 新函数，
   * 而它在**同一次渲染里被调用多次** —— 卡片行先 `altTxOf(id)` 取第一项文案，
   * 同一张卡紧接着又 `descsOf(id)` 拿整组旋钮（门 / 激励这种单旋钮卡就是 2 次），
   * ②③ 矩阵、浮窗再来一次；`moduleKnobs()` 每次都要重建整组描述符并做字符串格式化。
   *
   * 这里用「渲染内缓存」：Map 就是本次渲染作用域的变量，渲染结束自然丢弃 ——
   * 永远持有当前闭包，不存在 useMemo/useCallback 那种「回调过期」风险。 */
  const descsCache = new Map<string, ReturnType<typeof moduleKnobs>>();
  const descsOf = (modId: string): ReturnType<typeof moduleKnobs> => {
    const hit = descsCache.get(modId);
    if (hit) return hit;
    const d = modId === 'master'
      ? [master]                                                     // ④区总音量（reg 261 M1OutVolume）
      : moduleKnobs(modId, { comp: compIdx, od: odIdx, amp: ampIdx }, values, (r, v) => setV(modId, r, v), odAll);
    descsCache.set(modId, d);
    return d;
  };
  const ampDescs = useMemo(
    () => ampKnobs(ampIdx, values['amp-head'] ?? {}, (r, v) => setV('amp-head', r, v), ampAll),
    [ampIdx, values, ampAll],  // eslint-disable-line react-hooks/exhaustive-deps
  );

  const amp = ampAll[ampIdx] ?? ampAll[0];
  /* ★★★ 2026-10-30：原 isCustomAmpView（判断是不是自定义箱头，用来决定显示段位/收高度）
   *   已随「1段/2段」文字一起删除 —— 现在自定义箱头与内置箱头走完全相同的渲染路径。 */
  /** ★ 2026-10-26：只有「本批就是箱头」时，箱头卡才显示进度 */
  const ampProg = prog && prog.modId === 'amp-head' ? prog : null;
  const comp = COMP_MODELS[compIdx] ?? COMP_MODELS[0];
  const od = odAll[odIdx] ?? odAll[0];

  /* ★ 2026-10-17（修复「保存的音色加载后是空的」）：
     把首页当前参数 / 模块开关 / 型号登记到全局快照。
     保存音色时若只读 registerStore，会漏掉"连上后没拖动过"的旋钮 ——
     那些值只活在 HomePanel 的 state 里，于是存下来的快照只有开关位，加载即空。 */
  /* 箱体 PEQ 段（108–142）在"用户从没手动选过箱体"时不会出现在 values.cabinet 里，
     但它是音色的一部分（箱体直接决定音色厚度）→ 保存前按当前 cabIdx/micIdx 兜底补齐。 */
  const cabRegsFallback = useMemo(() => {
    const sets = CAB_SETS.filter((s) => s.cab === CAB_NAMES[cabIdx]);
    const s = sets[Math.min(micIdx, sets.length - 1)];
    const r: Record<number, number> = {};
    s?.bands.forEach((v, k) => { r[108 + k] = v; });
    return r;
  }, [cabIdx, micIdx]);

  /* ★★ v3.70：型号回传回调存 ref —— 避免父组件每次渲染换函数引用导致本 effect 反复触发 */
  const smCbRef = useRef(onSubModelsChange);
  smCbRef.current = onSubModelsChange;

  /* ★★ v3.77（P3）：型号快照单独 memo —— 四个名字都没变就保持同一个对象引用。
   *
   * 旧实现把这段塞在下面那个 effect 里，依赖含 `values`：用户拖动任意旋钮时
   * `values` 每个 pointermove 都变 → 每次新建一个 smSnap 对象 →
   * `onSubModelsChange` 收到新引用 → 父组件 setState 换对象 → 整棵首页树重渲染。
   * ⚠ 这里登记的是 **name** 不是 id（v3.70 定死）：全链路（内置预设 subModels、
   *   sync 匹配 `m.name`、`SUB_MODEL_FORMULAS` 键、ampKnobResolve 反查）用的都是 name。
   *   写成 id（"twin"）→ 载入时与 name 永不相等 → 误判换箱头 → 静音 + 全量 1.6s。
   * 一次拖动几百个 pointermove = 几百次全树渲染，这才是首页发涩的真凶。 */
  const smSnap = useMemo<Record<string, string>>(() => ({
    compressor: COMP_MODELS[compIdx]?.name ?? '',
    overdrive: odAll[odIdx]?.name ?? '',
    'amp-head': ampAll[ampIdx]?.name ?? '',
    cabinet: CAB_NAMES[cabIdx] ?? '',
  }), [compIdx, odIdx, ampIdx, cabIdx, odAll, ampAll]);

  useEffect(() => {
    const cabinet = Object.keys(values.cabinet ?? {}).length > 0
      ? values.cabinet
      : cabRegsFallback;
    setUiSnapshot({ ...values, cabinet }, on, smSnap);
  }, [values, on, smSnap, cabRegsFallback]);

  /* 型号变了才回传父组件（名字不变 → 引用不变 → 不触发） */
  useEffect(() => { smCbRef.current?.(smSnap); }, [smSnap]);
  const cabSet = useMemo(() => {
    const sets = CAB_SETS.filter((s) => s.cab === CAB_NAMES[cabIdx]);
    return sets[Math.min(micIdx, sets.length - 1)] ?? CAB_SETS[0];
  }, [cabIdx, micIdx]);

  /* ── 卡片文案（单行交替） ── */
  const altTxOf = (modId: string): string => {
    if (modId === 'master') return lang === 'zh' ? `总音量 ${master.fmt}` : `MAS ${master.fmt}`;
    /* ★ 2026-10-31：线材档没有型号 —— 别拿上一档的名字冒充。
       noise-gate / boost 不依赖型号，照常显示它们的值。 */
    if (modelsBlank && modId !== 'noise-gate' && modId !== 'boost') return '—';
    if (modId === 'compressor') return comp.sn ?? comp.name;
    if (modId === 'overdrive') return od.sn ?? od.name;
    /* ★ 2026-10-17：箱头 / 箱体原来没有分支 → 浮窗「型号」框是空的 */
    if (modId === 'amp-head') return `${amp.sn ?? amp.name} · ${amp.cls}`;
    if (modId === 'cabinet') return cabSet ? `${cabNameEn(cabSet.cab)} · ${micPosLabel(cabSet.mic, cabSet.pos)}` : '—';
    if (modId === 'noise-gate') { const d = descsOf(modId)[0]; return d ? `${d.full} ${d.fmt}` : modId; }
    if (modId === 'boost') { const d = descsOf(modId)[0]; return d ? `BOOST ${d.fmt}` : modId; }
    if (modId in FX) {
      const pn = FX[modId as FxId].presets[fxIdx[modId as FxId]]?.name ?? '—';
      return FX_NAME_EN[pn] ?? pn;
    }
    return '';
  };
  /* ★ 2026-10-15：卡片名跟随语言；英文一律用缩写，避免窄卡片溢出 */
  const nameOf = (modId: string) => {
    if (modId === 'master') return lang === 'zh' ? '总音量' : 'MAS';
    const m = MODULES.find((x) => x.id === modId);
    if (!m) return modId;
    return lang === 'zh' ? m.nm : m.en;
  };

  /* ── 点浮窗外 → 关闭浮窗与弹出（回首页） ── */
  const closeAll = () => {
    setFloatMod(null); setFloatIn(false); setFloatRect(null);
    setPopup(null); setPopupIn(false); setReadout('');
  };

  /* ── 打开贴锚点浮窗（先量锚点 rect → 再弹出） ── */
  const openFloat = (modId: string, e: React.PointerEvent) => {
    const host = (e.currentTarget as HTMLElement | null)?.closest('[data-fx-card]') as HTMLElement | null;
    const root = rootRef.current;
    if (host && root) {
      const r = host.getBoundingClientRect();
      const cr = root.getBoundingClientRect();
      setFloatRect({ l: r.left - cr.left, t: r.top - cr.top, w: r.width, h: r.height });
    } else setFloatRect(null);
    setReadout('');
    setFloatMod(modId);
    setFloatIn(false);                                  // 先落在卡片位置
    requestAnimationFrame(() => requestAnimationFrame(() => setFloatIn(true)));  // 下一帧弹出
  };

  /* ── 打开动态弹出（型号 / 预设 / 箱体 / 麦克风，锚定被点选项） ── */
  const openPopup = (spec: PopupSpec, e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement | null;
    const root = rootRef.current;
    if (!el || !root) return;
    const r = el.getBoundingClientRect();
    const cr = root.getBoundingClientRect();
    setReadout('');
    setPopup({ spec, rect: { l: r.left - cr.left, t: r.top - cr.top, w: r.width, h: r.height, ch: cr.height } });
    setPopupIn(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setPopupIn(true)));
  };

  /* ★ WO-16：锚点高亮（弹出打开时给被点选项描边） */
  const popupOpenAmps = () => !!popup && popup.spec.kind === 'model' && popup.spec.mod === 'amp-head';
  const popupOpenCab = () => !!popup && popup.spec.kind === 'cab';
  const popupOpenMic = () => !!popup && popup.spec.kind === 'mic';
  const popupOpenCabView = () => !!popup && popup.spec.kind === 'cabview';
  const popupOpenFx = (mod?: string) =>
    !!popup && popup.spec.kind === 'preset' && (!mod || popup.spec.mod === mod);

  /* ── 动态弹出的数据源（箱体只列箱体 / 麦克风只列麦克风） ── */
  /* ★ 2026-10-17（用户要求「弹出子选框没有全部双语」）：标题/计数/副标题统一按 lang */
  const popupTitle = (spec: PopupSpec): string => {
    const zh = lang === 'zh';
    if (spec.kind === 'cab') return zh ? '选择箱体' : 'Select cabinet';
    /* ★ 2026-10-17：标题里的箱体名也走英文（型号名不允许出现中文） */
    if (spec.kind === 'mic') return zh ? `麦克风 · ${cabNameEn(CAB_NAMES[cabIdx])}` : `Microphone · ${cabNameEn(CAB_NAMES[cabIdx])}`;
    if (spec.kind === 'cabview') return zh ? '选择适配设备' : 'Select device';
    if (spec.kind === 'model') {
      if (spec.mod === 'compressor') return zh ? '选择压缩器型号' : 'Select compressor';
      if (spec.mod === 'overdrive') return zh ? '选择过载型号' : 'Select overdrive';
      if (spec.mod === 'amp-head') return zh ? '箱头型号' : 'Amp model';
    }
    if (spec.kind === 'preset' && spec.mod in FX) {
      return zh ? FX[spec.mod as FxId].title : FX_TITLE_EN[spec.mod as FxId];
    }
    return zh ? '选择' : 'Select';
  };
  const popupItems = (spec: PopupSpec): PopupItem[] => {
    if (spec.kind === 'cabview') {
      /* ★ v6.4 设备图形选择：型号备注为主标题，音箱/耳机为副标题，后续设备在此自动出现 */
      /* ★ v72：带上 img —— 弹窗列表用设备图当选项，光看文字不容易分辨 */
      return CAB_VIEWS.map((v) => ({
        key: v.key,
        title: v.model,
        sub: v.labelEn ?? v.label,
        img: v.img,
        right: v.key === cabView ? (lang === 'zh' ? '当前' : 'Current') : undefined,
      }));
    }
    if (spec.kind === 'cab') {
      /* ★★ 2026-10-26（用户拍板）：箱体固定四类，与箱头共用同一套命名。
         映射表已抽到 `ui2/cabGroups.ts`（纯函数，可被 _verify 断言），
         见那里的注释：v3.79 用中文键查英文 group，导致 CRUNCH / HI-GAIN 永远为空。 */
      return CAB_NAMES.map((cn, i) => {
        const sets = CAB_SETS.filter((ss) => ss.cab === cn);
        const g = cabGroupOf(sets);
        /* 主标题 = 序号 + 型号名（v3.78 起型号名本身已是英文） */
        const title = `${String(i + 1).padStart(2, '0')}  ${cn}`;
        const en = cabNameEn(cn);
        const sub = en && en !== cn ? en : undefined;
        return {
          key: `grp|${cn}`, title, sub, id: cn,
          group: lang === 'zh' ? (CAB_GROUP_LABEL[g] ?? g) : g,
        };
      });
    }
    if (spec.kind === 'mic') {
      return CAB_SETS.filter((s) => s.cab === CAB_NAMES[cabIdx]).map((s) => ({
        key: s.id, title: micNameEn(s.mic),
        sub: `${s.pos && s.pos !== '默认' ? `${micPosLabel('', s.pos)} · ` : ''}COMP ${s.makeup >= 0 ? '+' : ''}${s.makeup.toFixed(2)} dB`,
      }));
    }
    if (spec.kind === 'model' && spec.mod === 'amp-head') {
      /* ★ v3.79（用户 2026-10-26）：
         ① 「ALL · 全部」分类取消 —— 只留 CLEAN / CRUNCH / HI-GAIN / BASS / CUSTOM；
         ② 右侧「N knobs」取消；
         ③ 底部描述精简为「分类 · 一句话」，去掉 (≤xx dB) 与旋钮数。 */
      return ampDisplayIdx.map((mi) => {
        const m = ampAll[mi];
        const g = ampGroupKey(m);
        /* ★ 描述本身就是「地区 / 性格」，再加 cls 会重复（CLEAN · American clean） */
        const sub = m.cls === 'CUSTOM' ? 'Custom preset' : (m.familyEn ?? m.family);
        const badge = AMP_BADGE[g] ?? g.slice(0, 2);
        const badgeColor = AMP_BADGE_COLOR[g] ?? '#e8b860';
        return {
          key: `grp|${m.id}`, title: m.name, sub, id: m.id, badge, badgeColor,
          group: lang === 'zh' ? (AMP_GROUP_LABEL[g] ?? g) : g,
        };
      });
    }
    if (spec.kind === 'model' && spec.mod === 'overdrive') {
      /* ★ 2026-10-17：过载型号描述双语（group / circuit 各有英文版） */
      /* ★ 2026-10-19（用户要求）：过载只按「吉他 / 贝斯」分类，自定义单独一组 ——
         原来按 平直系/中频系/高增益系/清音混合系 分四类，标签栏太挤也不好找。 */
      return odAll.map((m) => {
        const isCustom = m.id.startsWith('custom-');
        const grp = isCustom
          ? (lang === 'zh' ? '自定义' : 'CUSTOM')
          : m.category === 'bass'
            ? (lang === 'zh' ? '贝斯' : 'BASS')
            : (lang === 'zh' ? '吉他' : 'GUITAR');
        return {
          key: m.sn ?? m.name, title: m.sn ?? m.name,
          sub: m.descEn ?? m.circuitEn ?? m.groupEn ?? m.group,
          group: grp,
          badge: 'OD', badgeColor: popupAccent(spec),
        };
      });
    }
    if (spec.kind === 'model' && spec.mod === 'compressor') {
      /* ★ 2026-10-17：压缩器型号描述走双语（MODEL_ITEMS 里只有中文） */
      return COMP_MODELS.map((m) => ({
        key: m.sn ?? m.name, title: m.sn ?? m.name,
        /* ★ 2026-10-17：型号/预设/子型号一律英文（用户要求，避免中英混排歧义） */
        sub: m.descEn ?? m.desc,
        badge: 'CP', badgeColor: popupAccent(spec),
      }));
    }
    if (spec.kind === 'model') {
      const items = (MODEL_ITEMS[spec.mod as keyof typeof MODEL_ITEMS] ?? []) as ModelItem[];
      const ac = popupAccent(spec);
      return items.map((m) => ({
        key: m.name, title: m.name,
        sub: [m.desc, m.tag].filter(Boolean).join(' · '),
        badge: spec.mod === 'overdrive' ? 'OD' : 'CP',
        badgeColor: ac,
      }));
    }
    if (spec.kind === 'preset' && spec.mod in FX) {
      const key = spec.mod as FxId;
      const ac = FX[key].accent;
      const code = FX_BADGE[key];
      return FX[key].presets.map((p) => ({
        key: p.name,
        title: FX_NAME_EN[p.name] ?? p.name,
        sub: FX_DESC_EN[p.name] ?? p.desc,
        badge: code, badgeColor: ac,
      }));
    }
    return [];
  };
  const popupSelIdx = (spec: PopupSpec): number => {
    if (spec.kind === 'cabview') return Math.max(0, CAB_VIEWS.findIndex((v) => v.key === cabView));
    if (spec.kind === 'cab') return cabIdx;
    if (spec.kind === 'mic') return micIdx;
    if (spec.kind === 'model') {
      if (spec.mod === 'compressor') return compIdx;
      if (spec.mod === 'overdrive') return odIdx;
      if (spec.mod === 'amp-head') return Math.max(0, ampDisplayIdx.indexOf(ampIdx));
    }
    if (spec.kind === 'preset' && spec.mod in FX) return fxIdx[spec.mod as FxId];
    return 0;
  };
  /** ★ 2026-10-20：列表项真实 id（复制成「全部/分类」两行后靠它判断高亮） */
  const popupSelId = (spec: PopupSpec): string | undefined => {
    if (spec.kind === 'cab') return CAB_NAMES[cabIdx];
    if (spec.kind === 'mic') return CAB_SETS.filter((s) => s.cab === CAB_NAMES[cabIdx])[micIdx]?.id;
    if (spec.kind === 'model') {
      if (spec.mod === 'compressor') return COMP_MODELS[compIdx]?.id;
      if (spec.mod === 'overdrive') return odAll[odIdx]?.id;
      if (spec.mod === 'amp-head') return ampAll[ampIdx]?.id;
    }
    return undefined;
  };

  const popupAccent = (spec: PopupSpec): string => {
    if (spec.kind === 'cab' || spec.kind === 'mic' || spec.kind === 'cabview') return '#5bc8f5';
    if (spec.kind === 'model') {
      if (spec.mod === 'compressor') return '#6098d8';
      if (spec.mod === 'overdrive') return '#f0a040';
      return '#e8b860';
    }
    if (spec.kind === 'preset' && spec.mod in FX) return FX[spec.mod as FxId].accent;
    return '#e8b860';
  };
  /* ── ★ 2026-10-17（用户要求）：去掉二级确认 —— 点型号/预设直接加载 ──
   *   原 S3 的「切换会覆盖当前调整」确认弹窗会打断操作，用户明确要求点击即生效。
   *   退路仍在：浮窗内「↺ 还原」可回到切换前（undoRef 快照照旧保存）。 */
  const requestApply = (_label: string, _modId: string, _target: Record<number, number>, run: () => void) => {
    run();
  };

  const popupApply = (spec: PopupSpec, i: number, id?: string) => {
    if (spec.kind === 'cabview') { const v = CAB_VIEWS[i]; if (v) pickCabView(v.key); return; }
    if (spec.kind === 'cab') {
      /* ★ 2026-10-20：列表里每个箱体有「全部 / 分类」两行，下标 i 不再等于 CAB_NAMES 下标 */
      const ci = id ? CAB_NAMES.indexOf(id) : i;
      if (ci < 0) return;
      const sets = CAB_SETS.filter((s) => s.cab === CAB_NAMES[ci]);
      const s = sets[0];
      if (!s) return;
      const target: Record<number, number> = {};
      s.bands.forEach((v2, k) => { target[108 + k] = v2; });
      requestApply(s.cab, 'cabinet', target, () => applyCab(ci, 0));
      return;
    }
    if (spec.kind === 'mic') {
      const sets = CAB_SETS.filter((s) => s.cab === CAB_NAMES[cabIdx]);
      const s = sets[i];
      if (!s) return;
      const target: Record<number, number> = {};
      s.bands.forEach((v2, k) => { target[108 + k] = v2; });
      requestApply(s.display, 'cabinet', target, () => applyCab(cabIdx, i));
      return;
    }
    if (spec.kind === 'model') {
      if (spec.mod === 'compressor') {
        const m = COMP_MODELS[i]; if (!m) return;
        requestApply(m.name, 'compressor', m.regs, () => applyComp(i));
      } else if (spec.mod === 'overdrive') {
        const m = odAll[i]; if (!m) return;
        requestApply(m.name, 'overdrive', m.regs, () => applyOd(i));
      } else if (spec.mod === 'amp-head') {
        /* ★ 2026-10-20：同上，靠 id 反查，避免「全部」行的下标错位 */
        const byId = id ? ampAll.findIndex((x) => x.id === id) : -1;
        const idx = byId >= 0 ? byId : (ampDisplayIdx[i] ?? i);
        const m = ampAll[idx]; if (!m) return;
        /* MASTER 跟着切到最大（用户要求：箱头默认 master 拉满） */
        const target = { ...(m.regs ?? {}), [AMP_MASTER_ADDR]: SPECS.AMP_MASTER.def };
        requestApply(m.name, 'amp-head', target, () => applyAmp(idx));
      }
      return;
    }
    if (spec.kind === 'preset' && spec.mod in FX) {
      const id = spec.mod as FxId;
      const p = FX[id].presets[i]; if (!p) return;
      requestApply(p.name, id, p.regs, () => applyFx(id, i));
    }
  };

  /* 点浮窗外 → 关闭浮窗（回首页）；弹出面板有独立遮罩，点它自身关闭 */
  const stepBack = (e: React.PointerEvent) => {
    const el = e.target as Element;
    if (el.closest('[data-float-panel]')) return;       // 点在模块浮窗内不关
    closeAll();
  };

  /* ── 渲染：一行效果器卡（①4 踏板 / ④3 FX + 总音量） ── */
  const renderRow = (ids: readonly string[], withMaster = false) => {
    const cards = ids.length + (withMaster ? 1 : 0);
    const vwShare = 94 / Math.max(1, cards);
    return (
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', gap: 'clamp(4px, 1vw, 8px)' }}>
        {ids.map((id) => {
          const ds = descsOf(id);
          const rawRows = knobRows(ds);
          const rows = rawRows.map((r) => r.map((d) => ({ d, i: ds.indexOf(d) })));
          const cols = Math.max(...rawRows.map((r) => r.length), 1);
          /* ★ v6.1 旋钮直径统一规则：
             单旋钮卡（门/激励）与总音量同尺寸 52px；多旋钮卡按「卡内容宽 ÷ 列数」反算，
             ★ 2026-10-17：两行卡（4 旋钮的过载等）上限收到 22px —— 两行叠起来本来就高，
               再放 28px 会溢出到文字区（用户反馈"过载的字符被旋钮遮挡"）。 */
          const single = ds.length === 1;
          const cap = rows.length > 1 ? 22 : 28;
          const thumbD = single
            ? SINGLE_KNOB_D
            : `clamp(12px, calc((${vwShare}vw - 15px - ${(cols - 1) * 4}px) / ${cols}), ${cap}px)`;
          return (
            <FxCard key={id}
              blank={modelsBlank && (id === 'amp-head' || id === 'cabinet')}
              name={nameOf(id)}
              altTx={modelsBlank && (id === 'amp-head' || id === 'cabinet') ? '—' : altTxOf(id)}
              on={on[id]} accent={acOf(id)} lang={lang}
              tourId={`fx-${id}`}
              onBlank={() => rollAccent(id)}
              thumbRows={rows} thumbD={thumbD} single={single}
              /* ★ 2026-10-15：箱头 / 箱体常开 → 不渲染开关热区 */
              noSwitch={id === 'amp-head' || id === 'cabinet'}
              hint={knobHint} fail={failMap[id]}
              /* ★ 单旋钮卡无子选项 → 不弹浮窗；其余卡点文字展开全部旋钮 */
              onText={single ? null : (e) => openFloat(id, e)}
              onLed={() => toggle(id)}
              onKnobCommit={(d, n2) => d.setNorm(n2)} />
          );
        })}
        {withMaster && (
          <MasterCard desc={master} thumbD={SINGLE_KNOB_D} lang={lang}
            accent={acOf('master')} onBlank={() => rollAccent('master')}
            hint={knobHint} fail={failMap.master}
            muted={!!muted} onMuteToggle={onMuteToggle}
            onKnobCommit={(d, n2) => d.setNorm(n2)} />
        )}
      </div>
    );
  };

  return (
    <div ref={rootRef} style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
      /* ★ 2026-10-17：整页底板色可由「顶栏 LOGO 与蓝牙图标之间的空白处」点击更换 */
      background: accents[BG_ID] ?? bgTint(),
      position: 'relative', overflowX: 'hidden',
    }}>

      {/* ★ WO-01：写入失败告警条（仅失败时出现）
          ★ 2026-10-17（H2）：补上「重试」—— 原设计只有红点 + 关闭，用户无处可去。
          重试中显示进度；重试后仍失败的模块保留计数，成功则自动清空。 */}
      {failCount > 0 && failCount > failClosedCount && (
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
          margin: 'clamp(4px, 1vh, 8px) clamp(4px, 1vh, 8px) 0',
          padding: '6px 8px 6px 12px', borderRadius: 12,
          background: 'rgba(242,86,91,0.12)', border: '1px solid rgba(242,86,91,0.55)',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F2565B', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 650, color: '#FFAFB3' }}>
            {prog
              ? (lang === 'zh' ? `重试中 ${prog.done}/${prog.total}…` : `RETRYING ${prog.done}/${prog.total}…`)
              : (lang === 'zh' ? `${failCount} 个模块参数未写入硬件` : `${failCount} module(s) not written to hardware`)}
          </span>
          <button className="bfx-tap" onPointerUp={retryFailed} disabled={!!prog}
            aria-label="重试写入失败的模块" style={{
              height: 30, padding: '0 12px', borderRadius: 8, flexShrink: 0,
              cursor: prog ? 'default' : 'pointer',
              background: prog ? 'rgba(255,255,255,.05)' : 'rgba(242,86,91,0.20)',
              border: '1px solid rgba(242,86,91,0.55)',
              color: prog ? '#9BA3B2' : '#FFD9DB',
              fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
              fontFamily: '"Barlow-Regular_2",sans-serif',
            }}>{lang === 'zh' ? '重试' : 'RETRY'}</button>
          <div onPointerUp={() => setFailClosedCount(failCount)} title="忽略" aria-label="忽略本次告警" style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(242,86,91,0.4)',
            color: '#FFAFB3', fontSize: 11, lineHeight: 1,
          }}>✕</div>
        </div>
      )}

      {/* ★ 2026-10-17（用户要求）：删除首页顶部的「9 段信号链」横条。
          原 H3 的导航条整块移除，主区直接顶到上方。 */}

      {/* ── 主区：四分区一屏（M4；v72 起矮屏允许纵向滚动） ── */}
      <div ref={mainRef} style={{
        flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column',
        gap: 'clamp(4px, 1vh, 8px)', padding: 'clamp(4px, 1vh, 8px)',
        /* ★ v72：③ 区加高后，矮屏上四区 minHeight 之和可能超过可视高度 ——
           由「裁掉内容」改为「可滚动」，保证任何机型都够得着。 */
        overflowY: 'auto', overflowX: 'hidden',
      }}>

        {/* ① 动态区（v5.3 比例 25）· v72 让 2 份给③ */}
        <div style={{
          /* ★ 2026-10-17（用户要求）：③ 箱体区 −8px，让给上下两个效果器行 →
             ①②④ 重新分配，① 与 ④ 等高等比（效果器行一致），各自 +4px */
          flex: '25 1 0', minHeight: 92, minWidth: 0, display: 'flex', borderRadius: 12, overflow: 'visible',
          boxShadow: flashMod && PEDALS.includes(flashMod as never) ? 'inset 0 0 0 1.5px #F06F21' : 'none',
          transition: 'box-shadow .3s',
        }}>
          {renderRow(PEDALS)}
        </div>

        {/* ② 箱头（v5.4：上下结构 —— 型号框 35% 高 / 旋钮 65% 高；旋钮不做长按）· v72 让 1 份给③ */}
        <div style={{
          flex: '23 1 0', minHeight: 84, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4,
          position: 'relative',
          borderRadius: 12, background: `linear-gradient(165deg, ${ampAc}1a, #14171D)`,
          border: '1.3px solid #2E3440', padding: '8px 8px', overflow: 'visible',
          boxShadow: flashMod === 'amp-head' ? 'inset 0 0 0 1.5px #F06F21' : 'none',
          /* ★ 2026-10-17：箱头关闭 → 整区暗下去（右下角开关仍可点） */
          filter: on['amp-head'] === true ? 'none' : 'brightness(0.5) saturate(0.45)',
          opacity: on['amp-head'] === true ? 1 : 0.82,
          transition: 'box-shadow .3s, filter .22s ease, opacity .22s ease',
        }}>
          {/* 型号框（上 · 35% 高 · 全宽） */}
          <div className="bfx-tap" onPointerUp={(e) => openPopup({ kind: 'model', mod: 'amp-head' }, e)} style={{
            flex: '0 0 35%', minHeight: 32, display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 8px', borderRadius: 12, cursor: 'pointer', boxSizing: 'border-box',
            background: '#13161c',
            border: `1px solid ${popupOpenAmps() ? ampAc : '#454d5c'}`,
            /* ★ 2026-10-17：箱头关闭 → 型号框不可点（旋钮行已单独锁） */
            pointerEvents: on['amp-head'] === true ? undefined : 'none',
          }}>
            <span style={{ fontSize: 11, color: '#9BA3B2', letterSpacing: .6, flexShrink: 0 }}>
              {lang === 'zh' ? '箱头型号 ▾' : 'AMP MODEL ▾'}
            </span>
            <span style={{
              flex: 1, minWidth: 0, fontSize: 'clamp(11px, 2.8vw, 13px)', fontWeight: 800, color: ampAc,
              lineHeight: 1.15, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
            }}>{amp.sn ?? amp.name}</span>
            <span style={{
              fontSize: 11,
              color: ampProg ? '#F06F21' : failMap['amp-head'] ? '#F2565B' : '#9BA3B2',
              flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap',
              fontWeight: ampProg || failMap['amp-head'] ? 750 : 400,
            }}>
              {/* ★ 2026-10-17（用户要求）：去掉「N 音调段」这类技术计数，只留 CLEAN / CRUNCH 类型说明 */}
              {ampProg ? (lang === 'zh' ? `下发中 ${ampProg.done}/${ampProg.total}` : `SENDING ${ampProg.done}/${ampProg.total}`)
                : failMap['amp-head'] ? (lang === 'zh' ? '未写入硬件' : 'NOT WRITTEN')
                : amp.cls}
            </span>
          </div>
          {/* 旋钮（下 · 65% 高）：上方读数 + 单排真实旋钮（可拖动，不做长按） */}
          <div
            onPointerUp={(e) => { if (e.target === e.currentTarget) rollAccent('amp-head'); }}
            style={{
              flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
            }}>
            {/* ★ WO-06：数值显示在旋钮上方（替代旋钮气泡） */}
            <div style={{
              height: 13, fontSize: 'clamp(10px, 2.1vw, 11px)', fontWeight: 800, lineHeight: 1,
              color: ampRead ? '#F06F21' : 'transparent', whiteSpace: 'nowrap',
            }}>{ampRead || '-'}</div>
            <div
              onPointerUp={(e) => { if (e.target === e.currentTarget) rollAccent('amp-head'); }}
              style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              gap: 'clamp(4px, .8vw, 8px)',
              paddingRight: 24,   // 让出右下角的竖开关
              /* ★ 2026-10-19（用户要求）：关闭态旋钮不响应，只能点右下角开关 */
              pointerEvents: on['amp-head'] === true ? undefined : 'none',
            }}>
              {ampDescs.map((d) => (
                <div key={d.key} style={{
                  flex: '1 1 0', minWidth: 0, maxWidth: 48,
                  /* ★ 2026-10-30：段位那一行已删 ⇒ 所有机型统一 44，
                     自定义箱头不再比其他箱头矮 6px（9 钮布局也因此更整齐）。 */
                  height: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                }}>
                  <KnobRing norm={d.norm} mode="full" bubble={false} snap={d.snapNorm} ariaLabel={d.full} hintPulse={knobHint}
                    zoom={1.3}
                    /* ★ 2026-10-26：9 钮机型每格只有 ~37px，透明热区取 6px（26+12=38）
                       —— 再大会跨到邻钮上，反而更容易拧错。 */
                    hit={6}
                    /* ★ 2026-10-26（用户要求）：dB 类旋钮支持双击复位 0 dB */
                    onReset={d.zeroNorm !== undefined
                      ? () => { d.setNorm(d.zeroNorm as number); setAmpRead(d.fmtAt(d.zeroNorm as number)); }
                      : undefined}
                    /* ★ R1：仅 1 个音调段（如 Champ）→ 单旋钮放大到单旋钮卡规格，避免留白显得空 */
                    size={ampDescs.length <= 1
                      ? 'clamp(38px, 13vw, 52px)'
                      : `clamp(26px, calc(64vw / ${Math.max(1, ampDescs.length)}), 40px)`}
                    fmt={d.fmtAt}
                    onDrag={(n) => setAmpRead(d.fmtAt(n))}
                    onCommit={(n) => { d.setNorm(n); setAmpRead(d.fmtAt(n)); }} />
                  <span style={{
                    /* ★★ v3.85（用户「有些文字已经超出了外框」）：
                       原来是 left:50% + translateX(-50%) + nowrap —— 文字宽度不受格子约束，
                       9 钮机型（CRUNCH / HIGH-GAIN / BASS）每格仅 ~31px，
                       「音量1 / 总音量」这类 3 字标签会横向压到邻格文字上。
                       改为 left:0; right:0 撑满本格 + 内层 ellipsis，
                       文字永远落在自己格内（正常机型仍完整显示，不出现省略号）。 */
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                    /* ★ 2026-10-26：字号统一走 10.5 下限（原 8/9/10 低于全 App 字号铁律，
                       9 钮机型靠缩小字号防粘连，代价是小到看不清） */
                    fontSize: 10.5, lineHeight: 1.12,
                    color: '#9BA3B2',
                    pointerEvents: 'none', marginTop: 2,
                  }}>
                    <span style={{
                      display: 'block', maxWidth: '100%', whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{lang === 'zh' ? d.short : (d.shortEn ?? d.short)}</span>
                    {/* ★★★ 2026-10-30（用户要求）：**音色旋钮下面的「1段/2段」文字去掉**。
                        段位对用户没有意义 —— 他要看到的是"低频/中频/高频/临场"直接对应
                        箱头面板上的四个音色旋钮，多一行 SEG 只会挤占标签空间、让 9 钮机型
                        的文字更容易被截断。段位信息仍保留在数据层（customModules.ts 的
                        CUSTOM_AMP_TONE.seg），工程模式导出文件时用得到。 */}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {/* ★ 2026-10-17（用户要求）：箱头开关 · 右下角竖放灯条（写 reg 57 + 72） */}
          <VSwitch on={on['amp-head'] === true} accent={ampAc} title="箱头开关（整块旁路）"
            onToggle={() => toggle('amp-head')}
            hint={lang === 'zh' ? '点击开启' : 'TAP TO ON'} hintSide="above"
            style={{ position: 'absolute', right: 2, bottom: 2 }} />
        </div>

        {/* ③ 箱体 —— ★ 2026-10-17（用户要求）：
            · 去掉「适配 B&F 设备」说明
            · 切换键居中、文案改为「⇄ 切换适配设备」
            · 图下方恢复一行型号文字
            · 右列三等分：切换键 / 产品图 / 型号，各自在格内上下居中
            · 左列「箱体 / 麦克风」两卡上下等分、内容居中
            · 本区高度 −8px，让给上下的效果器行 */}
        <div style={{
          flex: '27 1 0', minHeight: 124, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4,
          position: 'relative',
          borderRadius: 12, background: `linear-gradient(165deg, ${cabAc}1a, #14171D)`,
          border: '1.3px solid #2E3440', padding: '4px 8px', overflow: 'hidden',
          boxShadow: flashMod === 'cabinet' ? `inset 0 0 0 1.5px ${cabAc}` : 'none',
          /* ★ 2026-10-17：箱体关闭 → 整区暗下去 */
          filter: on.cabinet === true ? 'none' : 'brightness(0.5) saturate(0.45)',
          opacity: on.cabinet === true ? 1 : 0.82,
          transition: 'box-shadow .3s, filter .22s ease, opacity .22s ease',
        }}>
          <div style={{
            flex: 1, minHeight: 0, display: 'flex', gap: 8, alignItems: 'stretch',
            /* ★ 2026-10-17：箱体关闭 → 箱体/麦克风选择、设备切换、图全部不可点 */
            pointerEvents: on.cabinet === true ? undefined : 'none',
          }}>
            {/* ── 左：箱体 / 麦克风（上下等分 · 各自垂直居中）── */}
            <div className="cab-sel" style={{ flex: '0 0 42%' }}>
              <div className="bfx-tap" onPointerUp={(e) => openPopup({ kind: 'cab' }, e)} style={{
                flex: '1 1 0', minHeight: 0, boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                padding: '2px 8px', borderRadius: 8, background: '#13161c', cursor: 'pointer',
                border: `1px solid ${popupOpenCab() ? cabAc : '#454d5c'}`,
              }}>
                <div style={{ fontSize: 11, color: '#9BA3B2', letterSpacing: .8, lineHeight: 1.1 }}>
              {lang === 'zh' ? '箱体 ▾' : 'CAB ▾'}
            </div>
                <div style={{
                  fontSize: 'clamp(10px, 2.3vw, 11px)', fontWeight: 700, color: cabAc, marginTop: 2, lineHeight: 1.15,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                }}>{cabSet ? cabNameEn(cabSet.cab) : (lang === 'zh' ? '选择箱体' : 'Select cab')}</div>
              </div>
              <div className="bfx-tap" onPointerUp={(e) => openPopup({ kind: 'mic' }, e)} style={{
                flex: '1 1 0', minHeight: 0, boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                padding: '2px 8px', borderRadius: 8, background: '#13161c', cursor: 'pointer',
                border: `1px solid ${popupOpenMic() ? cabAc : '#454d5c'}`,
              }}>
                <div style={{ fontSize: 11, color: '#9BA3B2', letterSpacing: .8, lineHeight: 1.1 }}>
              {lang === 'zh' ? '麦克风 ▾' : 'MIC ▾'}
            </div>
                <div style={{
                  fontSize: 'clamp(10px, 2.3vw, 11px)', fontWeight: 700, color: cabAc, marginTop: 2, lineHeight: 1.15,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                }}>{cabSet ? micPosLabel(cabSet.mic, cabSet.pos) : (lang === 'zh' ? '选择麦克风' : 'Select mic')}</div>
              </div>
            </div>

            {/* ── 右：产品图（左右箭头直接切换 · 无二级菜单）+ 型号 ──
                ★ 2026-10-17（用户要求）：
                  · 去掉「⇄ 切换适配设备」按钮与它的二级弹窗；
                  · 左右各加一个箭头，点一下就直接切换设备；
                  · 图片放大 20%，并在本格内**真正居中**；
                  · 底部型号文字居中（原来右侧留了 24px 给竖开关 → 视觉偏左）。 */}
            <div
              onPointerUp={(e) => { if (e.target === e.currentTarget) rollAccent('cabinet'); }}
              style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div
                onPointerUp={(e) => { if (e.target === e.currentTarget) rollAccent('cabinet'); }}
                style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                <CabArrow dir={-1} lang={lang} accent={cabAc} onClick={() => cycleCabView(-1)} />
                <div
                  onPointerUp={(e) => { if (e.target === e.currentTarget) rollAccent('cabinet'); }}
                  style={{
                    flex: 1, minWidth: 0, height: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <img
                    key={cabImgPop}
                    className={cabImgPop > 0 ? 'img-pop' : undefined}
                    src={cabViewDef.img}
                    alt={lang === 'zh' ? cabViewDef.label : cabViewDef.labelEn}
                    draggable={false}
                    onPointerUp={() => setCabImgPop((n) => n + 1)}
                    style={{
                      /* ★ 原高度 ≈ 本区 1/3（915 屏约 66px）；这里给 ~+20%（79px）的上限，
                         小屏也跟着缩，不会出现「大屏突然变巨大」 */
                      maxHeight: 'clamp(52px, 8.6vh, 80px)',
                      maxWidth: '100%', width: 'auto', height: 'auto',
                      display: 'block', objectFit: 'contain', objectPosition: 'center',
                      opacity: on.cabinet ? 1 : 0.4,
                      filter: on.cabinet ? `drop-shadow(0 0 6px ${cabAc}73)` : 'none',
                      transition: 'opacity .3s ease, filter .3s ease',
                      cursor: 'pointer',
                    }}
                  />
                </div>
                <CabArrow dir={1} lang={lang} accent={cabAc} onClick={() => cycleCabView(1)} />
              </div>
              {/* ★ 2026-10-17（用户要求「产品名字和开关上下居中对齐」）：
                  型号行与开关放进**同一行**，开关用 top:50% + translateY(-50%) 绝对居中，
                  这样两者中心线永远重合；文字用左右对称留白，视觉上仍在本区正中。 */}
              <div
                onPointerUp={(e) => { if (e.target === e.currentTarget) rollAccent('cabinet'); }}
                style={{
                  position: 'relative', flexShrink: 0, height: 30, minWidth: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 30px',
                }}
              >
                <span style={{
                  fontSize: 11, fontWeight: 800, color: cabAc, letterSpacing: .5, lineHeight: 1.1,
                  fontFamily: '"Barlow-Regular_2",sans-serif',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  textAlign: 'center',
                }}>{cabViewDef.labelEn} · {cabViewDef.model}</span>
                {/* ★ 2026-10-17（用户要求）：箱体开关 · 与型号同一行、垂直居中（写 reg 107） */}
                <VSwitch on={on.cabinet === true} accent={cabAc} title="箱体开关（PEQ 库旁路）"
                  onToggle={() => toggle('cabinet')}
                  hint={lang === 'zh' ? '点击开启' : 'TAP TO ON'} hintSide="above"
                  style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* ④ 空间区（v5.2 比例 25；3 FX + 总音量 = 4 模块，与①对称）· v72 让 3 份给③ */}
        <div style={{
          flex: '25 1 0', minHeight: 92, minWidth: 0, display: 'flex', borderRadius: 12, overflow: 'visible',
          boxShadow: flashMod && FXS.includes(flashMod as never) ? 'inset 0 0 0 1.5px #F06F21' : 'none',
          transition: 'box-shadow .3s',
        }}>
          {renderRow(FXS, true)}
        </div>
      </div>

      {/* ── 模块浮窗（贴原卡片位置弹出 · 背景虚化 · 数值在上方模糊区） ── */}
      {floatMod && (
        <div onPointerUp={stepBack} style={{
          position: 'absolute', inset: 0, zIndex: 30,
          background: 'rgba(5,6,8,.58)',
          backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)',
          opacity: floatIn ? 1 : 0, transition: 'opacity .26s ease',
          overflow: 'hidden',
        }}>
          {/* 调节数值：上方空白区居中，只数字+单位，无框 */}
          {readout && (
            <div style={{
              position: 'absolute', top: '13%', left: '50%', transform: 'translateX(-50%)',
              pointerEvents: 'none', whiteSpace: 'nowrap',
              fontSize: 'clamp(24px, 7.5vw, 38px)', fontWeight: 800, lineHeight: 1,
              color: '#F06F21', textShadow: '0 2px 14px rgba(0,0,0,.8)',
              letterSpacing: .5,
            }}>{readout}</div>
          )}
          <div data-float-panel style={{
            position: 'absolute',
            left: floatIn ? '50%' : (floatRect ? `${floatRect.l}px` : '50%'),
            top: floatIn ? '50%' : (floatRect ? `${floatRect.t}px` : '50%'),
            transform: floatIn ? 'translate(-50%, -50%)' : 'translate(0, 0)',
            width: floatIn ? 'min(94%, 430px)' : (floatRect ? `${floatRect.w}px` : 'min(94%, 430px)'),
            height: floatIn ? 'clamp(190px, 33vh, 272px)' : (floatRect ? `${floatRect.h}px` : '180px'),
            opacity: floatIn ? 1 : 0.4,
            transition: [
              'left .36s cubic-bezier(.22,.9,.26,1.06)',
              'top .36s cubic-bezier(.22,.9,.26,1.06)',
              'width .36s cubic-bezier(.22,.9,.26,1.06)',
              'height .36s cubic-bezier(.22,.9,.26,1.06)',
              'opacity .2s ease',
            ].join(', '),
          }}>
            <FloatCard
              mod={nameOf(floatMod)} modelTx={altTxOf(floatMod)} on={on[floatMod] ?? true}
              accent={acOf(floatMod)} descs={descsOf(floatMod)}
              noSwitch={floatMod === 'master' || floatMod === 'amp-head' || floatMod === 'cabinet'}
              onPick={floatMod === 'master' ? null : (e) => openPopup({ kind: floatMod in FX ? 'preset' : 'model', mod: floatMod }, e)}
              pickLabel={floatMod in FX ? (lang === 'zh' ? '预设' : 'PRESET') : undefined}
              onLed={floatMod === 'master' ? () => {} : () => toggle(floatMod)}
              onClose={closeAll}
              /* ★ 2026-10-17：还原 = 回到当前型号默认甜点值（有型号数据时始终可用） */
              canRestore={!!modelDefaultsOf(floatMod) || hasUndo(floatMod)}
              onRestore={() => restoreToModelDefault(floatMod)}
        lang={lang}
              onKnobDrag={(d, n) => setReadout(d.fmtAt(n))}
              /* ★ 2026-10-17（用户反馈「旋钮放大缩小后显示的数值不一致」）：
                 这里原来写的是 `setReadout(d.fmt)` —— d 是**本次渲染时**的描述符，
                 它的 fmt 还是拖动前的旧值。于是松手那一刻大字号读数会跳回上一个值，
                 要等下一次渲染才恢复。改为用同一个 n 现算，读数与旋钮位置永远一致。 */
              onKnobCommit={(d, n) => { d.setNorm(n); setReadout(d.fmtAt(n)); }} />
          </div>
        </div>
      )}

      {/* ── 动态弹出（型号 / 预设 / 箱体 / 麦克风 · 锚定被点选项） ── */}
      {popup && <AnchoredPopup
        lang={lang}
        title={popupTitle(popup.spec)} rect={popup.rect} in={popupIn}
        items={popupItems(popup.spec)}
        selIdx={popupSelIdx(popup.spec)}
        selId={popupSelId(popup.spec)}
        accent={popupAccent(popup.spec)}
        busy={prog ? `下发中 ${prog.done}/${prog.total}…` : null}
        onPick={(i, id) => { if (prog) return; popupApply(popup.spec, i, id); setPopup(null); setPopupIn(false); }}
        onClose={() => { setPopup(null); setPopupIn(false); }} />}

      {/* ★ 2026-10-17（用户要求）：二级确认模态已删除 —— 现在点型号/预设直接加载 */}
    </div>
  );
}
