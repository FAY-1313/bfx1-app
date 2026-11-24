import { useState, useRef, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { BluetoothIcon, BluetoothOffIcon, AudioWaveformIcon, UserCircleIcon, GlobeIcon, BugIcon, SlidersHorizontalIcon, LayoutGridIcon, HardDriveIcon, TimerIcon, BookOpenIcon, GraduationCapIcon, SmartphoneIcon, RotateCcwIcon } from 'lucide-react';
/* ★★ v3.68：全 App 统一反馈入口（唯一位置 + 覆盖式单条），见 services/feedback.ts */
import { notifyOk, notifyErr, notifyInfo, notifyDebug, setNotifyDebugMode } from '../services/feedback';
import { useI18n } from '../i18n';
import Knob from '../components/Knob';
import BluetoothPanel from '../components/BluetoothPanel';
import { MODULES, PlayMode } from '../data/pedalData';
import { MODULE_PARAM_MAP, MODULE_BYPASS_ADDR, SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ, buildPEQData, PEQ_TYPE } from '../data/parameterMap';
import { CABINET_PEQ } from '../data/cabinetPeqData';
import { COMPRESSOR_DEFAULTS, OVERDRIVE_DEFAULTS, CHORUS_DEFAULTS, AMP_HEAD_HIDDEN, AMP_HEAD_HIDDEN_DEFAULT, AMP_HEAD_KNOB_DEFAULTS } from '../data/presetData';
import { SERIES_BY_COMPOSED } from '../data/seriesData';
import { bleManager, buildFrame, warmupBle } from '../services/bleService';
import { switchCostMs, fmtCost } from '../data/switchCost';
import { presetEdgeCost } from '../data/presetSwitchCost';
import StudioPanel from '../components/StudioPanel';
import { registerStore } from '../services/registerStore';
import { getUiSnapshot } from '../services/uiSnapshot';
/* ★★ 2026-10-17：循环压测模式（仅测试包，正式版 TEST_SWEEP_MODE = false） */
import { TEST_SWEEP_MODE } from '../config/testMode';
import { APP_VERSION } from '../config/appVersion';
/* ★ v4.30：明暗主题（LOGO 单击切换）。回滚见 config/theme.ts 头部说明 */
import { THEME_SWITCH, applyTheme, readTheme, saveTheme, type ThemeMode } from '../config/theme';
import { BG_ID, bgTint, getAccents, rollAccent, resetAccents, toggleAccentLock, subscribeAccents } from '../services/accentTheme';
import { TEST_SWEEP_MAP } from '../data/_def/testSweep';
import { savePresetLocal, loadPresetsLocal, getPresetLocal, markChannelDirty, markChannelClean, getDirtyChannels, getLocalBankApplied, setLocalBankApplied, getBankSlot, markBankSlotUploaded, markPresetUserSlot, getPresetUserSlots, saveBankSlot } from '../services/localPresets';
import { buildBuiltinPresets } from '../data/builtinPresets';
/* ★ v3.58：跨组件的「切换/写入中」全局锁（PresetsPanel 与 Index 共用） */
import { beginBusy, endBusy, endBusyAfter, isBusy, subscribeBusy, getBusy } from '../services/switchBusy';
/* ★★ v3.70（用户拍板）：本地库「预存切换包」——保存时算好「前后切换要改哪些参数 + 要不要静音」，
   切换时零判定直发；detectDrift 只记「App 改过哪些地址」用于补丁，成本 O(1)。 */
import { getPack, rebuildPacks, PRE_BYPASS_FX, muteFor } from '../services/switchPacks';
import type { ToneShape } from '../services/switchPacks';
import { markDrift, takeDrift, clearDrift, restoreDrift } from '../services/drift';
import { normalizeSubModels } from '../data/subModelNames';
import { checkGroupModels, groupCheckReason } from '../services/uploadGuard';   /* ★ 2026-11-03 整组上传闸门 */
import { LOCAL_BANK_ZH, LOCAL_BANK_EN } from '../config/bankLabels';
/* ★ 2026-11-03（方案 A）：上传表合成 + 回读比对 */
import { buildUploadTable, diffTable, describeDiff, comparableAddrs, pgaValueForUpload, isToneTableAddr, type RegDiff } from '../services/toneUpload';
import { AMP_MODELS } from '../data/_def';
import { TONE25_HEADS } from '../data/_def/tone25';
import { resolveModelKey, hasKeyRegistry } from '../data/modelKey';
import { PASSTHROUGH_MODULES, MODULE_PARAM_RANGES, getModuleOffRegs, REVERB_ON_DEFAULTS, isWritableAddr, FORBIDDEN_REGS, stripForbidden, INTERNAL_BYPASS_ADDRS, INTERNAL_BYPASS_BY_MODULE, orderBypassSplit, bypassDelayMs, REG_WRITE_MS, EB_WRITE_MS, switchPlan, switchDiffs, BYPASS_ADDRS, resetSwitchShadow } from '../data/passThrough';
import CommunityPanel from '../components/community/CommunityPanel';
/* ★ 2026-11-16：顶栏账号入口与社区锁屏共用同一个登录页（LoginScreen） */
import { LoginScreen } from '../components/community/Gates';
import { resetSignInFlag } from '../services/toneCommunity';
/* ★ 2026-10-26：社区 → 本地库必须过同一套净化（白名单 + 禁写位 + 值域） */
import { sanitizeRegisters } from '../services/presetSanitize';
import { readLocalAccount, signOutAccount, isLoggedIn } from '../services/account';
import { renameUser, validateName, NAME_MAX } from '../services/authLogin';
import type { Account } from '../services/account';
import type { LocalPreset } from '../services/localPresets';
import DebugPanel from '../ui2/DebugPanelV2';
import TonePage from '../ui3/tone/TonePage';
import CenterHint from '../ui2/CenterHint';
import type { HintPayload, HintKind } from '../ui2/CenterHint';
import ConnectionFlash from '../ui2/ConnectionFlash';
import { MODULE_ON_OFF, MUTE_ON_OFF } from '../ui2/registers';
import LocalBankPage from '../ui2/LocalBankPage';
/* ★★ v3.62：预设库模板（bfx_presets = 硬件频道表内容）独立读取 + 补全，
   与本地库（bfx_localBank16 草稿箱）彻底分开，见 services/toneTemplate.ts */
import { getPresetTemplate } from '../services/toneTemplate';
// ★ 箱头参数来源（可切换模块）—— AMP_PARAM_SOURCE 决定用 v8 还是 legacy
import {
  AMP_PARAM_SOURCE, AMP_MODELS as AMP_MODELS_V8,
  AMP_MASTER_ADDR, AMP_MASTER_DEF,
} from '../data/ampParams';
import TutorialOverlay, { TourStep } from '../components/TutorialOverlay';
import HwGuidePanel from '../ui2/HwGuidePanel';
import { FULLSCREEN_SAFE_STYLE } from '../utils/safeArea';
import { buildFactoryBank2026 } from '../data/factoryBank2026';
/* ★ 2026-11-05（统一整改）：预设库弹窗改用通用 ModalCard —— 中间可滚动、底部固定。 */
import { ModalCard, ModalBody, ModalFooter } from '../ui2/ModalCard';
import { PanelHeader } from '../ui/PanelHeader';

/* ══════════════════════════════════════════════════════════════════════
 * ★★ v3.70（2026-10-24 用户拍板）：本地库切换的「当前格」状态
 *
 * 为什么放模块级：`handleSlotSelect`（预设库切档）属于 PresetsPanel 组件，
 * `applyLoadedTone`（本地库载入）属于 Index 组件 —— 两边都要读写同一个状态，
 * 用 prop 穿透太啰嗦。App 里 Index 常驻，不存在卸载残留的问题。
 * ══════════════════════════════════════════════════════════════════════ */
/** 硬件当前对应的**本地库槽位**。本地库载入走 EA 直接写参数（不发 EE），
 *  硬件频道号不变，所以本地库自己的格位只能单独记。
 *  null = 硬件状态不对应本地库任何格（刚连接 / 刚切过预设库档 / 刚断线）
 *         → 取不到预存包，自动回退实时 diff。 */
const localSlotRef: { current: number | null } = { current: null };
/** 连接后的第一次切换必须走全量 —— App 不知道硬件里现在是什么。切完即置 false。 */
const firstSwitchRef: { current: boolean } = { current: true };
/** ★★★ 2026-11-03：**下一次切换强制全量**。
 *   触发点：① 设备自己换了档（收到 EE 推送）② 上传成功（频道表变了）。
 *   这两件事都会让 App 手里"硬件当前值"的镜像失真；而切档帧集是"和目标值不同才发"，
 *   失真就会漏发 —— 典型现象就是「上传后切到 4D，合唱还在」：
 *   D4 出厂 215=0（合唱开），DSP 里是开，App 以为已经是 1（关），于是永远不写这一帧。 */
const forceFullNextRef: { current: boolean } = { current: true };
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars

// ─── 开机教程步骤定义 (首次启动自动播放; 用户面板可随时重播) ────────────────
const TOUR_STEP_DEFS: Array<{
  target?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  action?: string;
  lang?: boolean;
  en: { title: string; body: string };
  zh: { title: string; body: string };
}> = [
  {
    lang: true,
    en: { title: 'Welcome to BFX1', body: 'This quick tour walks through every operation of the BFX1 guitar effect processor — modules, knobs, footswitch, presets and gestures.\n\nTap NEXT to begin.' },
    zh: { title: '欢迎使用 BFX1', body: '本教程按实际操作顺序，带你走一遍 BFX1 的每一项功能：效果器模块、旋钮、踩钉、预设与手势操作。\n\n点击“下一步”开始。' },
  },
  /* ★ 2026-10-17：教程锚点全面切到【新 UI 真实存在的元素】。
     原 module-tabs / submodel / capture / knobs / footswitch 属于旧 UI（useNewToneUI=false 才渲染），
     在新首页根本查不到 → 挖洞永远定位失败、全部退化成居中卡片。
     现在用 HomePanel 里新加的 data-tour：fx-<模块id> / master-card。 */
  {
    target: 'fx-overdrive', placement: 'top',
    en: { title: 'Pedal Cards', body: 'The top row holds Gate, Boost, Compressor and Overdrive; the row below holds Chorus, Delay, Reverb and Master. Tap the small lamp at the bottom of a card to bypass / enable that effect.' },
    zh: { title: '效果器卡片', body: '上排是噪音门、激励、压缩、过载；下排是合唱、延迟、混响与总音量。点卡片底部的小灯即可旁路 / 开启该效果器。' },
  },
  {
    target: 'fx-compressor', placement: 'top',
    en: { title: 'Knobs', body: 'Drag a knob to change the parameter. The value appears above while dragging and is written to the hardware immediately. Tap the card title to open the full panel — all knobs, model list and reset.' },
    zh: { title: '旋钮', body: '拖动旋钮即可改参数，拖动时上方显示数值并实时写入硬件。点卡片标题可展开完整面板：全部旋钮、型号列表、还原。' },
  },
  {
    target: 'master-card', placement: 'top',
    en: { title: 'Master Volume', body: 'Master output level. The switch below mutes the whole output without losing your settings.' },
    zh: { title: '总音量', body: '总输出电平。下方开关可整段静音，不会丢失当前设置。' },
  },
  {
    target: 'btn-presets', placement: 'top',
    en: { title: 'Presets', body: 'Save and load your tone presets. Connect the device over Bluetooth to use the preset library.' },
    zh: { title: '预设', body: '保存 / 加载音色预设。连接蓝牙后即可正常使用预设库。' },
  },
  /* ★ 2026-10-17（用户要求「教程提示每个操作的流程」）：补齐三段真实操作流程 ——
     本地库（存/取/导出）、教程入口本身、以及 TONE / LOGO 的手势。
     原「‹ › 两侧箭头」与上一页「左右滑动」讲的是同一件事，删掉腾出位置。 */
  {
    target: 'btn-favorites', placement: 'top',
    en: { title: LOCAL_BANK_EN, body: 'Save the current tone as a new slot, or overwrite an existing one. Each slot can be loaded back, exported to a file, or deleted. Stored on this phone only.' },
    zh: { title: LOCAL_BANK_ZH, body: '把当前音色存为新档位，或覆盖已有档位。每档可加载、导出成文件、删除。只存在本机，不上传硬件。' },
  },
  /* ★ 2026-11-16：工程模式图标已隐藏，这一版教程不再有「? 按钮」那一步
     （保留注释以免后来的人再去锚 btn-tour）。 */
  {
    target: 'btn-tone', placement: 'top',
    en: { title: 'TONE Key & Colour', body: 'Tap a module panel\'s blank area to randomise its colour. Double-tap TONE to reset all colours; hold TONE for 0.6s to lock them. All colours are saved automatically.' },
    zh: { title: '音色键与配色', body: '点模块底板的空白处可随机换色。双击「音色」键＝全部复位为默认配色；长按 0.6 秒＝锁定当前配色。配色自动保存。' },
  },
  {
    target: 'btn-bt', placement: 'top',
    en: { title: 'Bluetooth', body: 'Connect the BFX1 hardware here. Once connected, every knob and switch writes to the device in real time.' },
    zh: { title: '蓝牙连接', body: '在此连接 BFX1 硬件。连接后，所有旋钮、开关实时写入设备。' },
  },
  {
    en: { title: 'All Set!', body: 'Tutorial complete. Replay it anytime from the ? icon next to Bluetooth, or User → Manuals → Tutorial.\n\nEnjoy your BFX1!' },
    zh: { title: '教程结束', body: '恭喜你掌握了基本操作！以后点蓝牙旁的「?」图标，或从 用户 → 说明书 → 使用教程 随时重播。\n\n尽情享受 BFX1 吧！' },
  },
];

// ─── Guitar string definitions ────────────────────────────────────────────────

// ─── PresetsPanel (16-slot, 4 groups) ────────────────────────────────────────

/* ★★★ 2026-10-31（用户要求）：预设库命名统一为「组 1–4 + 组内 a–d」。
 *   组标签 = 数字 1/2/3/4，组内四格 = a/b/c/d，组合显示成 1a / 2c / 4d。
 *   （原 A/B/C/D + 1~4 的写法与本地库的 1–16 冲突，且用户要求全英文名。） */
const PRESET_GROUPS = [
  { label: '1', color: '#F2F4F8', slots: [1,2,3,4], bg: 'rgba(255,255,255,0.03)' },
  { label: '2', color: '#3ddc84', slots: [5,6,7,8], bg: 'rgba(255,255,255,0.03)' },
  { label: '3', color: '#e2c044', slots: [9,10,11,12], bg: 'rgba(255,255,255,0.03)' },
  { label: '4', color: '#4cc9f0', slots: [13,14,15,16], bg: 'rgba(255,255,255,0.03)' },
];

/** 组内序号 0~3 → a/b/c/d */
const CH_LETTER = ['a', 'b', 'c', 'd'];

/** 槽位号 → 组标签（如 3 → "A3"）—— 预设库仍在用 */
function slotLabelOf(slot: number): string {
  const g = PRESET_GROUPS.find((x) => x.slots.includes(slot));
  return g ? `${g.label}${slot - g.slots[0] + 1}` : String(slot);
}

// SAVE 时按模块开关过滤寄存器范围: 关闭模块只保留旁路寄存器 + MODULE_EXTRA_BYPASS 兜底
// OD/DIST 完全独立: overdrive 只过滤 OD1 块 42-56, dist 只过滤 57-71, 互不越界删除
const MODULE_REG_RANGES: Record<string, [number, number]> = {
  'noise-gate': [0, 3],
  compressor: [4, 13],
  /* ★ 2026-11-09：过载模块取消，42–98 全部归箱头（级1 42–56 / 级2 57–71 / 级3 72–98），
     不再按「过载关」把 42–56 删掉，否则箱头第 1 级会被打回旁路。 */
  'amp-head': [42, 104],
  cabinet: [107, 142],
  chorus: [215, 220],
  delay: [221, 223],
  reverb: [224, 229],
};
// 关闭时保留的兜底寄存器（dist 已并入箱头，无独立模块）
const MODULE_EXTRA_BYPASS: Record<string, number[]> = {};

// A3 (2026-09-22): 所有寄存器写入节奏统一固定 20ms (与固件一致), 不再区分旁路/数据。
// 例外: EB 存本地路径保持 5ms (K9); 防爆音/落定类 settle 延时(30/50/60ms)不属于寄存器节奏, 保持不动。
// ★ 2026-10-17：数值改由 src/config/writeTiming.ts 统一提供（当前 5ms 提速版，改一处即可回退），
//   原先这里还有一份本地 const REG_WRITE_MS = 20 / EB_WRITE_MS = 5 —— 已删除，避免两处口径打架。

/**
 * ★★ v3.70：型号名归一化 `normalizeSubModels()` 已抽到 `data/subModelNames.ts`
 * —— 载入路径（本文件）与保存时预计算（services/switchPacks.ts）必须用**同一份**，
 * 否则两处各写一份，早晚会不一致。这里只做 re-import（见文件头 import 区）。
 */

/** 从 registerStore 当前寄存器(EA关键帧) 反解所有模块旋钮归一化值 (旋钮永远跟随寄存器状态) */
const deriveAllKnobValues = (sm: Record<string, string>): Record<string, Record<string, number>> => {
  const knobs: Record<string, Record<string, number>> = {};
  for (const mid of Object.keys(MODULE_PARAM_MAP)) {
    const vals = registerStore.getModuleKnobValues(mid, sm[mid]);
    if (Object.keys(vals).length > 0) knobs[mid] = vals;
  }
  return knobs;
};

/**
 * A1 (2026-09-22) 频道快照 → 本地镜像（覆盖式装入）
 *
 * 语义（用户决议）: 切台时"当前 UI 参数不保存, 直接跟随频道参数切换 UI" →
 *   用目标频道的完整寄存器参数【覆盖】本地镜像, 保证 UI/调试面板与硬件一致。
 *   registerStore → 供旋钮反解(deriveAllKnobValues)与上传快照(collectAll)
 *   regCacheRef   → 调试面板 PRE/POST EQ 曲线数据源
 */
const loadChannelSnapshot = (
  registers: Record<number, number> | undefined,
  regCacheRef?: React.MutableRefObject<Record<number, number>>,
): void => {
  registerStore.clear();
  const cache = regCacheRef?.current;
  if (cache) for (const k of Object.keys(cache)) delete cache[Number(k)];
  if (!registers) return;
  /* ★ 2026-10-20（用户拍板）：禁写寄存器不进本地镜像 —— 首页 sendAll / pushAllCurrent /
     上传快照都以镜像为源，从这里剔掉，任何后续路径都不会再发出 43/48/52/58/63/67/73/78/82。 */
  const src = stripForbidden({ ...registers });
  for (const [k, v] of Object.entries(src)) {
    const addr = Number(k);
    registerStore.set(addr, v);
    if (cache) cache[addr] = v;
  }
};

/**
 * ★ 2026-10-20（用户拍板）：开关状态统一入口（切档 / 本地库载入 / 重连对齐 三条路径共用）
 *   · 目标值只由 `modules` 决定（switchPlan 的 9 条开关表），**不再从寄存器镜像反推** ——
 *     旧实现拿 regCache（切档前刚被目标预设覆盖）做差分，比的是"目标值 vs 目标值"，一条都不写；
 *   · 与影子表比对 → 只补发不一致的那几条（稳态几乎不写；首次/断线重连后影子为空 → 全量写）；
 *   · 顺序：**统一走 orderBypassSplit**（关=前置 / 数据居中 / 开=后置），保持"参数先、开关后"（C6=A）；
 *   · 43/48/52/58/63/67/73/78/82 是禁写寄存器，不在开关表内，任何路径都不会写。
 * @returns 实际补写的条数
 */

/**
 * ★ 2026-10-20（C5）：把 9 条开关位按 modules 补齐进寄存器表（返回新对象，不改原表）。
 *   用于所有"数据 → 硬件频道表 / 保存"的入口：老数据缺 224/107 这类开关位时，
 *   频道表里也永远是完整的，断电重连、固件重载频道都不会丢开关状态。
 */
const withSwitchPlan = (
  regs: Record<number, number>, modules?: Record<string, boolean>,
): Record<number, number> => {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(stripForbidden({ ...regs }))) {
    const a = Number(k);
    /* ★★ v3.75（H9）：EB 上传路径原来只做 stripForbidden，不剔「硬件状态位」——
       导入的 JSON / 旧存档带 260=1 时，一旦上传硬件就把硬件静音位写死；
       带 2=1 则输入静音。两者都不属于音色，一律拦掉。
       ⚠ 261（总音量）**故意保留**：它是音色的一部分，且切换路径里单独写，
         这里若剔掉，固件该频道的总音量会停在旧值（切档后音量不对）。 */
    if (a === 2 || a === 260) continue;
    out[a] = v;
  }
  for (const [a, v] of Object.entries(switchPlan(modules))) out[Number(a)] = v;
  return out;
};

/* ══════════════════════════════════════════════════════════════════
 * ★★ v3.56（2026-10-23 用户拍板 J1–J4）：整组上传
 *   ★ v3.57（用户拍板 K3）：**不再统一组内 FX 参数** —— 每个频道表带自己的值，
 *   由固件加载该频道时整表写入。
 *   仍然整组上传的理由：一次换组往往连带改了同组的音色/开关，
 *   只写单格会让「同组四格」处于新旧两版数据混杂的状态，排查困难。
 * ══════════════════════════════════════════════════════════════════ */
/** ★★★ 2026-10-31（用户要求）：频道命名统一为「组号 1–4 + 组内 a–d」，如 1a / 2c / 4d。
 *  本地库自己的 16 格仍显示 1–16（那是音色库编号，不是硬件频道号）；
 *  一旦涉及"上传到哪个硬件频道"，一律走这里。 */
export const hwSlotName = (s: number): string =>
  `${Math.floor((s - 1) / 4) + 1}${CH_LETTER[(s - 1) % 4]}`;

/* ★★ v3.78：型号记忆改成 key 口径。
   旧实现用「旧组合键表」当白名单（COMPRESSOR_DEFAULTS / SERIES_BY_COMPOSED / …），
   v3.78 全英文精简后这些键一个都对不上 → 用户存好的型号记忆会被整片清空。
   现在：能解析成 key 的一律转 key 保留；解析不出的（历史坏值）才丢弃。 */
const sanitizeSubModelNames = (sm: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  const norm = normalizeSubModels(sm) ?? {};
  for (const [k, v] of Object.entries(norm)) {
    if (!v) continue;
    if (hasKeyRegistry(k)) {
      /* key 命中 / 旧名反查成功 / 用户自定义（custom-xxx）→ 保留 */
      if (resolveModelKey(k, v) || v.startsWith('custom-')) out[k] = v;
    } else if (COMPRESSOR_DEFAULTS[v] || SERIES_BY_COMPOSED[v] || CHORUS_DEFAULTS[v]) {
      out[k] = v;
    }
  }
  return out;
};

function PresetsPanel({ visible, onClose, presetRev, connectedDeviceId, registerStore, bleManager, buildFrame, ampIdxV8, setAmpIdxV8, moduleEnabled, subModelNames, playMode, setPlayMode, setModuleEnabled, setSubModelNames, setLoadedKnobValues, getBoostKnob, onRestoreBoostKnob, inputVol, outputVol, inputMute, outputMute, setInputVol, setOutputVol, setInputMute, setOutputMute, setCleanResetTick, activeSlot, setActiveSlot, regCacheRef, bumpDebugRegTick, onSyncChannel, onOpenMetronome, onOpenTuner }: {
  visible: boolean; onClose: () => void;
  connectedDeviceId: string | null;
  registerStore: any; bleManager: any; buildFrame: any;
  moduleEnabled: Record<string, boolean>; subModelNames: Record<string, string>; playMode: string;
  setPlayMode: any; setModuleEnabled: any; setSubModelNames: any; setLoadedKnobValues: any;
  getBoostKnob: () => number | undefined; onRestoreBoostKnob: (v: number) => void;
  /** ★ v8：当前选中的箱头型号索引（由 TonePage 回传） */
  ampIdxV8: number;
  setAmpIdxV8?: (i: number) => void;
  inputVol: number; outputVol: number; inputMute: boolean; outputMute: boolean;
  setInputVol: any; setOutputVol: any; setInputMute: any; setOutputMute: any;
  setCleanResetTick: (fn: (t: number) => number) => void;
  activeSlot: number; setActiveSlot: (v: number) => void;
  /** ★★ v3.77（P2）：预设库寄存器保存版本号 —— 变化时「切换延迟角标」重算 */
  presetRev: number;
  regCacheRef?: React.MutableRefObject<Record<number, number>>; bumpDebugRegTick?: () => void;
  /** ★ 2026-10-21：把某音色快照（寄存器+开关+子型号）推给首页 HomePanel 的 sync 通道 */
  onSyncChannel?: (item: LocalPreset) => void;
  /** ★ v3.52：打开工作室的节拍器面板（预设库底部第二个键） */
  onOpenMetronome?: () => void;
  /** ★ v3.60：打开独立的调音器页面（取代原来的「演奏模式」键） */
  onOpenTuner?: () => void;
}) {
  /* ★ v5.3 本地↔硬件未同步槽位（槽位状态指示用；随 presets / activeSlot 重算） */
  const dirtySet = new Set(getDirtyChannels());
  /* ★ v5.3 上传/连接状态：内联显示在操作行（不再用右上角 toast） */
  /* ★★ v3.68（用户拍板 ABCD「所有反馈弹窗统一一个位置」）：
     预设库原先在底部操作行上方自绘一条 upNotice —— 与底部 sonner 胶囊是两套。
     现在统一走 services/feedback.ts（底部居中胶囊，覆盖式单条），此处只留一个薄封装。 */
  const flashUp = (text: string, ok = true) => {
    if (ok) notifyOk(text); else notifyErr(text);
  };
  const { t, lang } = useI18n();
  /* ★ 2026-11-17 v4.24：预设库顶部「TONE3000 · NAM A2 升级公告」弹窗开关 */
  const [showNamNotice, setShowNamNotice] = useState(false);
  /* ★ v3.59（F8，2026-10-24 用户拍板）：只显示当前编组（4 格），用 BANK 键循环切换。
     切档 / 踩钉换档后自动跟随到目标档位所在组，避免"档位在 B 组、面板停在 A 组"。 */
  const [bankGroup, setBankGroup] = useState(() => Math.floor((activeSlot - 1) / 4));
  useEffect(() => { setBankGroup(Math.floor((activeSlot - 1) / 4)); }, [activeSlot]);
  const [presets, setPresets] = useState<Record<number, { name: string; nameEn?: string }>>({});
  /* ★★ v3.77（P2）：预设库寄存器「保存版本号」（由 Index 持有并作为 prop 传入）。
     `reachDelays` 的真实数据源是 `getPresetLocal()`（直接读 localStorage 的 bfx_presets），
     而依赖却写成 `[activeSlot, presets]` —— `presets` 只保存名字，且只在面板 visible
     变化时才刷新。于是「本地库上传硬件」改写了某格寄存器后，角标一直显示旧的毫秒数
     （新格明明差异很大却显示与旧格相同的值）。
     现在 Index 在写 preset 的入口 bump 一次，通过 prop `presetRev` 传进来参与依赖。 */
  /* ★★ v3.52（用户要求）：只在可点的三格上显示「点下去要等多久」。
     数值 = 差异寄存器数 × 20ms（EA 间隔），换组格与同组格都用同一口径。
     ★★★ 三格 = 组内上一个 / 组内下一个 / **下一组第 1 格**（v3.52 定死，v3.73 恢复）。 */
  /* ★ 2026-11-04（用户拍板）：**预设库按键不再显示切换延迟角标**。
     内部 `presetEdgeCost` 仍保留给 `slotBusyMs`（切档忙碌遮罩的时长）使用。 */
  /* ★ 加载遮罩：setLoading 目前无调用点（切档走全局 switchBusy 遮罩），只保留读端 */
  const [loading] = useState(false);
  const [, setSlotName] = useState('');
  // 快速切换防交错: 每次点击 bump seq, 旧循环在每步 await 后检测到 seq 变化即中断; 写失败寄存器收集重试
  // A1/A2/K7 (2026-09-22) 切台解耦后, 以下机制已删除:
  //   · duckToneSwitch  — 切台防爆音 (K7: 切台 mute 由固件负责, APK 不再插入 mute/弱音写)
  //   · switchSeqRef    — EA 写循环的防交错序列守卫 (切台已无 BLE 写循环)
  //   · pendingRetryRef — EA 写失败重试队列 (同上)

  /**
   * ★ 2026-10-20（用户拍板）：开关状态统一入口
   *   · 目标值只由 `modules` 决定（switchPlan），**不再从寄存器镜像反推**
   *   · 与影子表比对 → 只补发不一致的那几条（稳态几乎不写；首次/重连全量）
   *   · 顺序：统一走 orderBypassSplit（关=前置 / 数据居中 / 开=后置）
   *   实现见模块级 writeSwitchPlan（本地库载入 / 重连对齐共用）。
   */


  /** 切台: 只发 EE <ch>, UI/寄存器镜像完全跟随本地库该频道参数
   *  ★ 2026-10-15（C5）：硬件只能顺序前后切换 → 软件同步限制，禁止跨频道 */
  const handleSlotSelect = async (slot: number, p?: { name: string }) => {
    /* ★ 2026-10-16（用户要求）：不连接蓝牙不得切档 —— 档位必须与硬件保持一致 */
    if (!connectedDeviceId) { flashUp(t('toast.connectBtFirst'), false); return; }
    /* ★★ v3.58：写入/切换期间的操作锁 —— 上一次还没结束就忽略新点击 */
    if (isBusy()) return;
    if (slot === activeSlot) { setSlotName(p?.name || ''); return; }
    /* ★★ v3.70：切预设库档 = 固件整表重载，硬件状态不再对应本地库任何格
       → 清掉本地库「当前格」与漂移记录，之后载入会走实时 diff（正确优先）。 */
    localSlotRef.current = null;
    clearDrift();
    /* ★★★ 频道导航口径（2026-10-22 v3.52 定死，2026-10-24 用户再次确认）：
       ① 组内四格循环（组首↔组尾也算相邻）
       ② **下一组的第 1 格**：A→B1 / B→C1 / C→D1 / D→A1 —— 换组入口，必须亮起可切
       跨组跳中间的格子（如 A3 → C2）才拒绝。
       ⛔ 别再把它理解成「只许同组」：用户原话「下一组的B1要是亮起可以切换的啊」。 */
    const gCur = Math.floor((activeSlot - 1) / 4);
    const gNext = Math.floor((slot - 1) / 4);
    const dIn = Math.abs(slot - activeSlot);
    const okSameGroup = gCur === gNext && (dIn === 1 || dIn === 3);
    const okNextGroupFirst = slot === ((gCur + 1) % 4) * 4 + 1;
    const okPrevGroupFirst = slot === ((gCur + 3) % 4) * 4 + 1;   /* ★S3：上一组第 1 格 */
    if (!okSameGroup && !okNextGroupFirst && !okPrevGroupFirst) {
      /* ★ 2026-10-16（P1）：跨档点击不再弹 toast（原先每点一次弹一次，很烦）——
         改为操作行内的行内提示，与「未同步」等状态同一套反馈。 */
      flashUp(t('preset.needAdjacent'), false);
      return;
    }
    setActiveSlot(slot);
    setSlotName(p?.name || '');
    /* ══════════════════════════════════════════════════════════════════
     * ★★ v3.58（2026-10-24 用户拍板）：**删掉合唱 / 延迟预加载**
     *
     * 这两帧（215=1 / 221=1）在 EE 之后就立刻被硬件的整表加载覆盖，
     * 等于白写；顺带还多两次 20ms 等待。用户确认「硬件用自己的频道表切，
     * App 不参与参数」后，这条路径彻底不碰寄存器。
     * ══════════════════════════════════════════════════════════════════ */
    /* ★★ v3.62（用户拍板）：切档读的是**预设库模板**（bfx_presets = 硬件频道表内容），
       和本地库（bfx_localBank16）是两套独立数据。本地库换过模板但没上传，
       这里也只会拿到预设库那份，不会把草稿箱的值混进频道 UI。 */
    const preItem = p ? getPresetTemplate(slot) : null;
    /* ★★ v3.68（用户拍板）：loading 时长改用统一口径 ——
       **旁路/开关地址 50 ms/条 + 其余参数 15 ms/条**（estimateLoadMs），
       再加 150 ms 余量、下限 400 ms。旧的「14.4ms × 帧数 + 200」已废弃。
       （14.4 是固件 EA 队列吞吐，不含开关落定时间；新口径按用户给的 50/15 算窗口。） */
    /* ★★★ 2026-10-30：遮罩时长与角标同源 —— 预设库走固件快切表成本（组内几帧、跨组全量），
       不再用"该格寄存器总条数 × 15ms"。跨组/开机才是 117 帧全量。 */
    const edge = presetEdgeCost(activeSlot, slot);
    const slotFrames = edge ? edge[0] : 0;
    const slotBusyMs = edge && edge[0] ? switchCostMs(edge[0], edge[1]) : 1800;
    beginBusy(t('switch.loading') || '切换中…',
      `${p?.name ?? ''} · ${slotFrames} · ${(slotBusyMs / 1000).toFixed(1)}s`);
    /* ★★ v3.75（H8）：从 beginBusy 到这里结束之间**必须**有 try/finally。
       中间有 `await loadChannelSnapshot` / `onSyncChannel`，任一处抛异常 → 遮罩与全局锁
       永久不撤 → App 所有写入口从此 `isBusy()` 早退，只能重启。
       `handedOff` 标记「已交给 endBusyAfter 定时器」，避免 finally 把延时撤销掉。 */
    let handedOff = false;
    try {
    // 1. 硬件: 仅发 EE <ch> (裸 2 字节) — 固件自行加载本频道已上传的 EA 表 (固件已测试通过)
    //    ★ 2026-10-16（P5）：空槽位也发 EE —— 否则界面已选中该档、硬件频道却没跟着变，软硬件分叉
    if (connectedDeviceId) {
      /* ★★★ 2026-11-19（真机 + 代码审查共同确认的 BUG）：
         `jumpChannel` 失败时返回 **false（不抛异常）**。旧写法
         `await bleManager.jumpChannel(slot).catch(() => {})` 既接不住 false，
         也没人检查返回值 —— 于是继续往下把该档的音色名、全部旋钮参数灌进 UI：
         界面看起来切到了新档，硬件还停在上一个频道，听到的声音和看到的参数对不上。
         这里必须判返回值：失败就提示并 return（finally 会撤掉 busy 锁）。 */
      const jumped = await bleManager.jumpChannel(slot).catch(() => false);
      if (!jumped) {
        flashUp(t('toast.loadFail') || '切换失败，请重试', false);
        return;
      }
    }
    if (!p) { endBusyAfter(slotBusyMs); handedOff = true; return; } // 空槽位: 仅选择, 不加载参数

    const item = preItem;
    if (!item) { endBusy(); handedOff = true; flashUp(t('toast.slotNoData'), false); return; }
    /* ★ v69（L5）：从硬件预设档位加载音色 → 清掉本地库的「已加载」标识。
       否则本地库仍高亮显示旧条目"已加载"，界面状态说谎。
       底栏 tab 状态点由外层 effect（activePanel 变化时）刷新，这里只清存储。 */
    if (getLocalBankApplied() !== null) setLocalBankApplied(null);

    // 2. 本地镜像: 用该频道全部寄存器参数覆盖 (丢弃当前未上传的 UI 调整)
    loadChannelSnapshot(item.registers, regCacheRef);

    // 3. UI 跟随频道: 模式 / 模块开关 / 子型号 / IO
    if (item.playMode) setPlayMode(item.playMode as any);
    if (item.modules) setModuleEnabled(item.modules);
    if (item.subModels) setSubModelNames(item.subModels);
    /* ★ 2026-10-21（用户实测：切到「放克清音」箱头仍显示 Twin）
       ampIdxV8 此前只在手动选箱头时更新，切档从不设置 → 永远停在上一次的型号。
       这里按 subModels['amp-head'] 的名字反查下标，与 __def/ampHeadDef 的 name 一一对应。 */
    /* ★ v3.78：subModels 现在存 key；老存档可能是旧中文名 / 旧 id / 旧全名 → 一起兜住 */
    const ampRaw = item.subModels?.['amp-head'];
    if (ampRaw) {
      const idx = AMP_MODELS_V8.findIndex((m) => m.key === ampRaw || m.name === ampRaw
        || (m.aliases ?? []).includes(ampRaw) || m.id === ampRaw);
      if (idx >= 0) setAmpIdxV8?.(idx);
    }
    /* ★★★ 2026-11-02（用户报障「总音量旋钮调整后切档不变」）：
     *   旧实现取的是模板里的 `item.io`（大多没存 / 存的是旧值），所以硬件切档后
     *   UI 的总音量、输入音量都不跟随；静音还会被模板改写（与"静音不记忆"冲突）。
     *   现在：音量**以寄存器为准**（每档记自己的 261 / 3），`io` 只作兜底；
     *   静音两项**不碰** —— 静音不随音色记忆，切档必须保持用户当前的状态。 */
    {
      const r3 = item.registers?.[3];
      const r261 = item.registers?.[261];
      setInputVol(r3 !== undefined ? r3 / 50 : (item.io?.inputVol ?? 1.0));
      setOutputVol(r261 !== undefined ? r261 / 50 : (item.io?.outputVol ?? 1.0));
    }

    // 4. 旋钮位置: 以刚装入的寄存器反解 (与硬件一致), 快照值作 boost 等无寄存器旋钮兜底
    /* ★★ v3.62：**整体替换**，不再 `...prev` —— 上一套模板残留的旋钮值必须清掉，
       否则本地库换模板后切回预设库，旋钮会停在两套模板的混合物上。 */
    const effSm = { ...(item.subModels || {}) };
    setLoadedKnobValues({ ...(item.knobValues || {}), ...deriveAllKnobValues(effSm) });
    const bv = item.knobValues?.['boost']?.['BOOST'];
    if (bv !== undefined) onRestoreBoostKnob(bv);

    /* ★★ v3.58（2026-10-24 用户拍板）：**切档不再发 PGA，也不再补写开关**
       硬件自己保存 PGA（用户确认「硬件有保存 pga 参数，并对应」），
       开关位也已经在频道表里 —— 这条路径现在只发一帧 EE。 */
    // 5.（已删）Boost PGA 还原
    // 6.（已删）syncBypassAfterSwitch 补写 BYPASS

    /* ★ 2026-10-21（用户要求）：切档后把该频道的 寄存器 + 开关 + 子型号 推给首页。
       旧实现只 setModuleEnabled（Index 侧状态），首页 HomePanel 的开关灯读的是自己的
       on state，只认 sync 通道 → 切档后灯还停在上一档，出现"UI 与硬件不一致"。
       这里补推一次（禁写过滤 + 开关位补齐，与本地库载入路径同一口径）。 */
    onSyncChannel?.(item);

    bumpDebugRegTick?.(); // 调试面板曲线立即跟随

    /* ★ v3.58：遮罩按该频道条数定时撤（硬件加载完成的时刻 App 拿不到，只能按条数估） */
    endBusyAfter(slotBusyMs);
    handedOff = true;
    /* ★ v5.3：不再用右上角 toast 提示；「未同步 / 已载入」改为槽位上的状态指示（见槽位渲染） */
    void connectedDeviceId;
    } catch (e: any) {
      notifyErr(String(e?.message || e), { duration: 3200 });
    } finally {
      /* 兜底：任何提前 return / 抛异常都必须撤锁（handedOff 时不打扰定时器） */
      if (!handedOff) endBusy();
    }
  };

  // Load preset bank (本地库) on mount / panel open; 首次空库自动写入 16 内置预设
  useEffect(() => {
    let list = loadPresetsLocal();
    // ── 播种策略变更 (v49, 2026-09-25): 不再按版本标记强制重灌出厂预设 ──
    // 旧机制 (bfx_builtinSeeded_v10…v15) 每次升级 APK 都会重灌, 覆盖用户已保存的
    // 1-16 频道数据。现改为**仅在本地库为空时**播种一次 (全新安装 / 清除应用数据),
    // 已装用户升级后本地库保持原样, 不再弹重灌提示。需重建出厂音色时清除应用数据即可。
    // 下列历次重灌记录已废弃, 仅作历史留存:
    // v30 EQ 修复 (2026-09-22): v10 强制重灌 — 旧快照缺 DIST 块数据
    //   (Drive/DCOffset/Volume/POST EQ 64-66,68-71) 且 OD POST EQ 错成 BD-2,
    //   修复 OVERDRIVE_DEFAULTS 系列键物化后需重灌才能补回 (不保留旧预设)
    // A7 (2026-09-23): v11 强制重灌 — ① 固件 R4 取消的 7 个模块旁路位不再用于区分档位(恒写 0)
    //   ② 同组 4 档改为"参数化区分"(不启用的模块写直通参数) ③ D3/D4 补真实差异;
    //   重灌同时标记全部 16 频道待同步, 连接后自动 EB 补传, 保证软硬件一致 (决策4)
    // v12 (2026-09-23): 单块参数替换（41 型号 OD/DIST 表按 apk_model_params 标注值重建，
    //   音色旋钮改落 Post4、修正 4 处 HPF 类型、Drive/Volume 基准重标定）
    // v13 (2026-09-23): 箱头参数替换（37 款箱头：Pre4 取真实电路设计表、Post16 用逐型号真实
    //   tone stack 拐点、旋钮改非对称扫描、DC_ADJ 用实测非对称值）
    // v14 (2026-09-25): P1 箱头参数移植（37 款箱头 Pre4+Post16 全套改用 amp_head_design.md
    //   真实电路推导；CLEAN 头 GAIN=0 且 REG78=1 常闭 OD；旋钮量程按设计值居中重算）
    // v15 (2026-09-25): 箱头 VOLUME 默认值改用 UI 旋钮中间档（reg81 248→268，knobs VOLUME 0→0.5；
    //   文档建议值 190/200 低于 UI 量程下限 248 不可达，故不采用）
    // v16 (2026-09-26): 单块参数补齐（OD/DIST 41 → 45 型号：新增 TS9 / BD-2 / Klon Centaur / RAT，
    //   按《单块效果器参数总表_整理版》Batch 11 电路推导值；历史 NAM 整图保留在各自的 _2 档键）
    /* ★ 2026-10-21（v3.46）：内置预设改版后的重新播种
       原先只在「本地库为空」时播种 → 已装过 App 的机器升级后看不到新预设。
       于是 v3.46 改成「按版本号重播」；v3.87 又改为「按内置预设内容版本重播」（见下）。
       ⚠️ 这 16 槽是「工作区」，会被覆盖；用户存在「本地库 / 收藏」里的自定义音色不受影响。 */
    const SEED_VER_KEY = 'bfx_builtin_seed_ver';
    const seededVer = (() => { try { return localStorage.getItem(SEED_VER_KEY); } catch { return null; } })();
    /* ★★ v3.87（2026-10-27 用户拍板）：判据从 **APP_VERSION** 改为**内置预设内容版本**。
     *
     * 旧逻辑 `seededVer !== APP_VERSION` → 每发一个版本（3.84→3.85→3.86…）就重播一次，
     * 于是用户每次装新包、第一次点「预设库」都会弹一条「出厂音色已写入本地 1–16 档」，
     * 而内置预设的内容其实一个字都没变 —— 纯属无谓打扰 + 16 次 localStorage 写。
     *
     * 现在只有**真的改了内置预设**（`data/builtinPresets.ts`）才把这里 +1，
     * 播一次即止，且**不再弹任何提示**（播种是纯本地毫秒级动作，不碰硬件，无需告知）。
     * ⚠ 不要改回 APP_VERSION。 */
    /* c6（2026-10-31 晚 3，与固件 ver 6 对齐）：
       · IIC+ 四档的箱体名 'Mesa ST 4x12' → 'ST 4x12'（原先库里查不到 → 35 段全中性 = 没箱体）
       · 线材四档（1a–1d）合唱 LEVEL 3 → 20、去掉 260
       · 激励器 PGA 纳入频道表（固件侧每档自带 pga，与本表 boost 同源）
       → 16 格全部重播一次。 */
    const PRESET_SEED_CONTENT_VER = 'c12';
    /* ★★ v3.81（P2-17②）：必须 `visible` 才播种。
       旧实现 effect 挂在 `[visible]` 上但没判 visible —— 组件首帧（visible=false）就执行：
       最多 16 次 localStorage 写 + 弹一条「已恢复出厂预设」，用户从未打开预设库也会跑。
       visible 变 true 时本 effect 会重跑，播种不会漏。 */
    if (visible && (list.length === 0 || seededVer !== PRESET_SEED_CONTENT_VER)) {
      const built = buildBuiltinPresets();
      /* ★★ v3.62（用户拍板）：「预设库模板只有本地库上传能改」→ 播种跳过用户改过的槽。
         否则装一次新 APK 就把上传的音色换回出厂值，而硬件频道表没变（硬件只由本地上传写），
         App 显示与听感立刻岔开。 */
      const userSlots = new Set(getPresetUserSlots());
      for (const p of built) {
        if (userSlots.has(p.slot)) continue;
        savePresetLocal(p);
        /* ★★ v3.59（F11，2026-10-24 用户拍板）：**播种不再标脏**。
         新模型下预设库不写硬件，App 的 16 格与硬件频道表同源（内置预设 = 出厂基准），
         默认就是「已同步」。旧版每升级一次就把 16 格全刷成黄色「未同步」，
         而唯一的清黄入口是「写入硬件」—— 那个动作已经不需要了。
         现在只有「本地库上传硬件失败」才会把某一格标脏。 */
        markChannelClean(p.slot);
      }
      try { localStorage.setItem(SEED_VER_KEY, PRESET_SEED_CONTENT_VER); } catch { /* 隐私模式忽略 */ }
      list = loadPresetsLocal();
      /* ★★ v3.87（用户 2026-10-27「下方弹出一个对话框，这个取消掉吧」）：
         原来这里有一条 `notifyInfo('出厂音色已写入本地 1–16 档 · 需要时点写入同步')`。
         删掉的理由：这不是「载入」—— 只是把内置预设模板写进 localStorage 占位，
         毫秒级完成、**不读也不写硬件**（不碰蓝牙、不发寄存器）。用户看不到任何等待，
         却被一条底部提示告知「需要点时间载入」，纯属误导。 */
    }
    const map: Record<number, { name: string; nameEn?: string }> = {};
    for (const d of list) map[d.slot] = { name: d.name, nameEn: d.nameEn };
    setPresets(map);
    /* ★ 2026-11-05：加 presetRev 依赖 —— 整组上传写回模板后，即使预设库面板一直开着，
       名字/内容也会立即刷新（旧实现只依赖 visible，必须关掉再打开才看得到新名字）。 */
  }, [visible, presetRev]);

  /* ★★ v3.75（C1）：**客户端不再预置官方音色**。
   *
   * 旧实现每次冷启动都调 `seedOfficialTones()` 写 45 条固定 _id 的文档，
   * 但 `tones` 的规则要求 `doc.uid == auth.uid`，而种子里的 uid 是 `official`
   * （不是当前登录用户）→ **必然被拒**，catch 又静默吞掉。
   * 连带的死循环：失败返回 false → `OFFICIAL_SEED_KEY` 永不置位 → 每次冷启动重试一次注定失败的写。
   *
   * 现在官方音色由管理端一次性灌进云库（云函数 `seedOfficial`，uid 固定 `official`），
   * 客户端只读不写。好处：官方音色有真实 `_id` → 收藏、试听计数全部正常；
   * 内容要更新时重跑一次云函数即可，不需要发版。 */


  /* ★★ v3.63（2026-10-24 用户拍板 K5）：**预设库不提供任何写入硬件的入口**。
     这里原本有一个 `handleUpload()`（EE 切频道 + 逐条 EB 落盘）以及底部的「写入硬件 N」按钮，
     两者都已删除。理由（用户原话）：预设库只负责「切频道 + 跟硬件同步 UI」，
     一旦它也能写硬件，App 侧模板与固件频道表就有第二条写入路径 → 必然出现逻辑偏差。
     现在唯一能改硬件的动作是「本地库 → 上传」，它写完同时更新预设库同槽模板。 */
  /* 说明：`saving` / `buildSnapshot` 仍保留（供别处/调试复用），但已无 UI 入口调用。 */

  if (!visible) return null;

  /* ★ v3.59（F8）：当前只渲染这一组 */
  const curGroup = PRESET_GROUPS[bankGroup] ?? PRESET_GROUPS[0];
  /* ★★★ BANK 键 = 【双向切换】（v3.71 用户拍板，v3.73 保留）
   *
   * 用户原话：「修改本地库和预设库的下一组音色切换按键，只能切换到下一组显示，
   *            再次点击按键就切换回原编组，这样就不会出现切换到无法选择的组的问题了。」
   *
   * ★ 它存在的**唯一理由**：下一组的第 1 格（B1 / C1 / D1 / A1）是换组入口、必须可切，
   *   但当前只显示本组 4 格 → 不翻过去就点不到它。
   *   所以「下一组」= 把 B1 亮出来给你点，「返回」= 点完回来继续弹。
   *   ⛔ 它不是"纯浏览"：翻过去之后 B1 一定是可点的（见下面 reachable 的第 ② 条）。 */
  const homeGroup = Math.floor((activeSlot - 1) / 4);
  const nextHomeGroup = (homeGroup + 1) % 4;
  const prevHomeGroup = (homeGroup + 3) % 4;
  /** true = 面板停在任何**非当前组**的编组上（此时上下两键都变成「返回」） */
  const browsing = bankGroup !== homeGroup;
  /** 下一组键的目标（浏览中 = 返回当前组） */
  const bankTargetGroup = PRESET_GROUPS[browsing ? homeGroup : nextHomeGroup] ?? PRESET_GROUPS[0];
  /** ★★★ 2026-10-30（用户要求）：**上一组** —— 与下方「下一组」大键一上一下对称。
   *   ★ 2026-11-04：浏览中（翻到上一组/下一组）时，上键也变成「返回当前组」，
   *   与下键对称，不会出现"翻过去回不来、只能绕圈"的问题。 */
  const prevTargetGroup = PRESET_GROUPS[browsing ? homeGroup : prevHomeGroup] ?? PRESET_GROUPS[0];

  // B4: 条件挂载 → 每次打开重播 panelFade (index.css:196 已定义 180ms 上滑淡入)
  // ★ v3.61：面板收缩为「内容高度卡片」，外层半透明遮罩；v3.67 卡片改用 ModalCard。
  return (
    <>
    <ModalCard zIndex={51} maxWidth={520} background="#31343b" borderColor="#454b55" overlayStyle={{ animation: 'panelFade 0.18s ease-out' }}>
      {/* 加载档位: 全屏遮罩 */}
      {loading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(15,16,18,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <div style={{ width: 22, height: 22, border: '2px solid rgba(76,201,240,0.25)', borderTopColor: '#4cc9f0', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#c2c9d6', letterSpacing: '0.1em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{t('preset.loading')}</span>
        </div>
      )}
      {/* Header */}
      <PanelHeader title={t('panel.presets')} accent="#4cc9f0" onClose={onClose} />

      {/* ★ v3.60（2026-10-24 用户拍板）：外框随内容适配，按键保持比例、不被纵向拉长。
          ★ v3.61：频道键改竖矩形（固定高度 104，宽度吃满 1/4 行）——
          固定高度让下面那整行「下一组」大键天然与频道键等高，不依赖 aspectRatio 反算。 */}
      {/* ★ 2026-11-05：内容区改为 ModalBody —— 小屏 / 大字体时在这里滚动，不再裁切。 */}
      <ModalBody style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 12px 0' }}>
        {/* ★★★ 2026-10-30（用户要求）：**上方新增「上一组」行**，与下方「下一组」大键对称。
            预设库原来只有向下的单键（还要先点一次「下一组」再点「返回」才能回去），
            现在一上一下，直接点就能来回翻。 */}
        <button
          onClick={() => setBankGroup(browsing ? homeGroup : prevHomeGroup)}
          title={browsing
            ? (lang === 'en' ? `Back to bank ${prevTargetGroup.label}` : `返回音色库${prevTargetGroup.label}`)
            : (lang === 'en' ? `Switch to bank ${prevTargetGroup.label}` : `切换到音色库${prevTargetGroup.label}`)}
          style={{
            width: '100%', height: 44, borderRadius: 10, cursor: 'pointer',
            background: browsing ? `${prevTargetGroup.color}12` : 'rgba(255,255,255,0.02)',
            border: `1px dashed ${prevTargetGroup.color}66`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.12s',
          }}>
          <span style={{ fontSize: 20, lineHeight: 1, color: `${prevTargetGroup.color}99`, marginRight: 2 }}>{'‹'}</span>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#6E7686',
            fontFamily: '"Barlow-Regular_2",sans-serif',
          }}>{browsing ? (lang === 'en' ? 'BACK' : '返回') : (lang === 'en' ? 'PREV' : '上一组')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: prevTargetGroup.color, flexShrink: 0 }} />
            <span style={{
              fontSize: 15, fontWeight: 800, letterSpacing: '0.04em', color: prevTargetGroup.color,
              fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap',
            }}>{lang === 'en' ? `GROUP ${prevTargetGroup.label}` : `组 ${prevTargetGroup.label}`}</span>
          </span>
        </button>

        <div key={curGroup.label} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {curGroup.slots.map(slot => {
                const p = presets[slot];
                const isActive = activeSlot === slot;
                /* ★★★ 可点范围（v3.52 定死，v3.73 恢复 —— 别再删）：
                   ① 组内四格循环：A1↔A2↔A3↔A4↔A1（组首的左是组尾、组尾的右是组首）
                   ② **下一组第 1 格**：A→B1 / B→C1 / C→D1 / D→A1（换组入口，必须亮起）
                   其余一律不可点。 */
                const gCur = Math.floor((activeSlot - 1) / 4);
                const gSlot = Math.floor((slot - 1) / 4);
                const dIn = Math.abs(slot - activeSlot);
                const reachable = isActive ? false
                  : (gCur === gSlot && (dIn === 1 || dIn === 3))
                    || slot === ((gCur + 1) % 4) * 4 + 1
                    /* ★ 2026-11-04：上一组第 1 格同样是换组入口（D→A1 / A→D1 …）。
                       只补下一组时，翻到「上一组」后它的第 1 格永远是灰的、点不动。 */
                    || slot === ((gCur + 3) % 4) * 4 + 1;
                /* ★ v3.59（F4）：reachable 只管「能不能点」，视觉淡化另算 ——
                   旧版两者混用同一个变量，当前格（必然不可点）被一起压到 0.28 灰度，
                   橙框橙字全被盖掉，用户看到的就是「当前频道整格发灰」。 */
                const dimmed = !reachable && !isActive;
                const isDirty = dirtySet.has(slot);
                return (
                  <button key={slot} onClick={() => handleSlotSelect(slot, p)}
                    disabled={!reachable}
                    title={reachable || isActive ? undefined : (lang === 'en' ? 'Only adjacent channels can be switched (±1)' : '只能切换到相邻频道（±1）')}
                    style={{
                      position: 'relative',
                      /* ★ v3.61：竖矩形 —— 宽度吃满 1 列，高度固定 104（不再用 flex 撑满整列） */
                      width: '100%', height: 104, borderRadius: 12,
                      cursor: reachable ? 'pointer' : 'default',
                      background: isActive ? 'rgba(240,111,33,0.12)' : 'rgba(255,255,255,0.04)',
                      border: isActive ? '1px solid #F06F21' : '1px solid #454b55',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                      transition: 'all 0.12s', overflow: 'hidden', padding: '0 4px',
                      opacity: dimmed ? 0.3 : 1,
                      filter: dimmed ? 'grayscale(1)' : 'none',
                    }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: isActive ? '#F06F21' : '#c2c9d6', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{curGroup.label}{CH_LETTER[slot - curGroup.slots[0]]}</span>
                    {/* ★★ v3.62（用户拍板）：预设名**不随语言切换** —— 存的是什么语言就显示什么语言 */}
                    {p?.name && <span style={{ fontSize: 11, color: isActive ? '#F06F21' : '#7C8494', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 3px' }}>{p.name}</span>}
                    {/* ★ v3.59（F5）：双向同步状态 —— 绿点 = 已同步，黄点 = 未同步。
                        新模型下预设库不写硬件，默认就是已同步；只有本地库上传失败才会变黄。 */}
                    <span style={{
                      position: 'absolute', top: 5, right: 5, width: 5, height: 5, borderRadius: '50%',
                      background: isDirty ? '#f0b429' : '#3ddc84',
                      boxShadow: isDirty ? '0 0 5px rgba(240,180,41,0.8)' : '0 0 5px rgba(61,220,132,0.55)',
                    }} />
                    {isActive && (
                      <span style={{
                        marginTop: 1, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
                        color: isDirty ? '#f0b429' : '#3ddc84', lineHeight: 1,
                        fontFamily: '"Barlow-Regular_2",sans-serif',
                      }}>{isDirty ? (lang === 'en' ? 'NOT SYNCED' : '未同步') : (lang === 'en' ? 'SYNCED' : '已同步')}</span>
                    )}
                  </button>
                );
              })}
        </div>

        {/* ★ v3.61（2026-10-24 用户拍板）：BANK 大键拉长成一条 ——
            宽度 = 四个频道键合计（整行），高度与频道键相同（104）；
            ★★ v3.71：双向切换 —— 停在原组显示「下一组」，停在下组显示「返回」。 */}
        <button
          onClick={() => setBankGroup(browsing ? homeGroup : nextHomeGroup)}
          title={browsing
            ? (lang === 'en' ? `Back to bank ${bankTargetGroup.label}` : `返回音色库${bankTargetGroup.label}`)
            : (lang === 'en' ? `Switch to bank ${bankTargetGroup.label}` : `切换到音色库${bankTargetGroup.label}`)}
          style={{
            width: '100%', height: 104, borderRadius: 12, cursor: 'pointer',
            background: browsing ? `${bankTargetGroup.color}12` : 'rgba(255,255,255,0.02)',
            border: `1px dashed ${bankTargetGroup.color}88`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '0 14px', overflow: 'hidden', transition: 'all 0.12s',
          }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#6E7686',
            fontFamily: '"Barlow-Regular_2",sans-serif',
          }}>{browsing ? (lang === 'en' ? 'BACK' : '返回') : (lang === 'en' ? 'NEXT' : '下一组')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: bankTargetGroup.color, flexShrink: 0 }} />
            <span style={{
              fontSize: 18, fontWeight: 800, letterSpacing: '0.04em', color: bankTargetGroup.color,
              fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap',
            }}>{lang === 'en' ? `GROUP ${bankTargetGroup.label}` : `组 ${bankTargetGroup.label}`}</span>
          </span>
          <span style={{ fontSize: 20, lineHeight: 1, color: `${bankTargetGroup.color}99`, marginLeft: 2 }}>{'›'}</span>
        </button>
      </ModalBody>

      {/* ══ Bottom actions ══════════════════════════════════════════════
          ★★ v3.52（2026-10-22 用户拍板）：预设库不再有「上传 / 名称 / 静音 / 弱音」——
             它是硬件状态的只读映射，落盘只能从本地库走（本地库两键：保存本地 / 上传硬件）。
             这里放两个跟弹琴直接相关的入口：演奏模式、节拍器。 */}
      <ModalFooter style={{ padding: '10px 12px 12px', borderTop: '1px solid rgba(76,201,240,0.12)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* ★ v3.60（2026-10-24 用户拍板）：演奏模式键移除，换成调音器。
              调音器 / 节拍器各一个独立按键，点进去是只含该工具的独立页面（不再有 tab 菜单）。 */}
          <button
            onClick={() => onOpenTuner?.()}
            style={{
              flex: 1, height: 46, borderRadius: 10, cursor: 'pointer',
              background: 'rgba(61,220,132,0.10)', border: '1px solid rgba(61,220,132,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              fontFamily: '"Barlow-Regular_2",sans-serif',
              color: '#3ddc84', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em',
            }}>
            <AudioWaveformIcon size={16} color="#3ddc84" />
            {lang === 'en' ? 'TUNER' : '调音器'}
          </button>
          <button
            onClick={() => onOpenMetronome?.()}
            style={{
              flex: 1, height: 46, borderRadius: 10, cursor: 'pointer',
              background: 'rgba(226,192,68,0.10)', border: '1px solid rgba(226,192,68,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              fontFamily: '"Barlow-Regular_2",sans-serif',
              color: '#e2c044', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em',
            }}>
            <TimerIcon size={16} color="#e2c044" />
            {lang === 'en' ? 'METRONOME' : '节拍器'}
          </button>
        </div>
      </ModalFooter>
    </ModalCard>

    {/* ★ 2026-11-18 v4.26：TONE3000 入口 —— 移到预设库面板「外面、上方半透明区」。
        zIndex 52 高于 ModalCard 遮罩(51)、低于公告(70)，absolute 定位在面板上方。 */}
    <button onClick={() => setShowNamNotice(true)} title="TONE3000 · NAM A2"
      style={{
        /* ★ 2026-11-19（真机报障：TONE3000 入口浮在屏幕 1/4 处，遮住压缩机/过载卡片）：
           原来用 absolute + top: calc(safe-top + 10px)。但 absolute 的定位参考系是
           最近的 positioned 祖先（这里是内容区容器），不是视口 —— 于是它跟着内容
           落在了屏幕中上部，还压住了卡片。
           改成 fixed：相对视口定位，才是"浮在页面顶部"的本意。 */
        position: 'fixed', zIndex: 52,
        top: 'calc(var(--sa-top, 0px) + 10px)', left: '50%', transform: 'translateX(-50%)',
        height: 40, padding: '0 12px', borderRadius: 10, cursor: 'pointer',
        background: 'rgba(12,14,20,0.88)', border: '1px solid rgba(255,235,80,0.42)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
      <img src="/brand/tone3000-logo.svg" alt="TONE3000" draggable={false}
        style={{ height: 18, width: 'auto', display: 'block' }} />
      <img src="/brand/logo-bf@2x.png" alt="BFX1" draggable={false}
        style={{ height: 20, width: 'auto', display: 'block', borderLeft: '1px solid rgba(255,255,255,0.22)', paddingLeft: 8 }} />
    </button>

    {/* ★ NAM A2 升级公告 —— 点任意处关闭（全屏层，zIndex 70） */}
    {showNamNotice && (
      <div onClick={() => setShowNamNotice(false)} style={{
        position: 'absolute', inset: 0, zIndex: 70, cursor: 'pointer',
        background: 'rgba(8,9,13,0.82)', backdropFilter: 'blur(4px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '28px 24px', textAlign: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <img src="/brand/tone3000-logo.svg" alt="TONE3000" draggable={false} style={{ height: 30, width: 'auto' }} />
          <img src="/brand/logo-bf@2x.png" alt="BFX1" draggable={false} style={{ height: 30, width: 'auto' }} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#F0F2F5', fontFamily: '"Barlow-Regular_2",sans-serif', marginBottom: 16, letterSpacing: '0.02em' }}>
          {lang === 'en' ? 'NAM A2 Upgrade Announcement' : 'NAM A2 升级公告'}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.9, color: '#c2c9d6', fontFamily: '"Barlow-Regular_2",sans-serif', maxWidth: 400 }}>
          {lang === 'en'
            ? 'Dear BFX1 users, we have reached a cooperation agreement with TONE3000 and will soon support NAM (Neural Amp Modeler) A2 format tones. We will provide free NAM A2 upgrade service for the first batch of users in China. Stay tuned for more NAM tones on BFX1.'
            : '尊敬的BFX1用户，我们已与 TONE3000 达成合作协议，即将支持 NAM（Neural Amp Modeler）A2格式音色。我们将为中国区首批用户提供免费NAM A2升级服务，届时可在 BFX1 上加载更多NAM音色，敬请期待。'}
        </div>
        <div style={{ marginTop: 28, fontSize: 11, color: '#7C8494', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.06em' }}>
          {lang === 'en' ? 'Tap anywhere to close' : '点击任意处关闭'}
        </div>
      </div>
    )}
    </>
  );
}


// ─── Main Index Page ──────────────────────────────────────────────────────────
/* ══════════ 本地库 EA 下发的等待窗口（2026-10-30 重写） ══════════
 *
 * 本地库不走 EE-only（它有未上传的编辑），仍是 App 逐帧发 EA。硬件收到后照 dsp_send_regs
 * 的逻辑处理：普通帧 10ms、旁路/重建帧要等 500ms 窗口。旧代码只按 `条数 × 15ms` 算，
 * 把 9 个旁路位的全量算成 1.9s，实际要 4s —— 遮罩提前消失、用户以为切完了。
 *
 * 这里只算**硬件消化时间**（App 侧的发包耗时通常更短，尤其旁路帧只发 20ms 就要等 500ms）。
 */
const BYPASS_SET = new Set<number>(BYPASS_ADDRS);

type EaFrame = { regAddr: number; value: number };
function eaWindowMs(frames: EaFrame[], pre: EaFrame[], post: EaFrame[]): number {
  const all = [...pre, ...frames, ...post];
  return switchCostMs(all.length, all.filter((f) => BYPASS_SET.has(f.regAddr)).length);
}

/* ══════════ 单频道上传后的「同组 FX 不一致」提示（2026-10-30 用户要求） ══════════
 *
 * 为什么只提示、不阻止：单格上传是用户主动选择（他就是要改一格）。
 *
 * 但组内踩钉换格时，固件只发两个频道之间的**差异地址**；而合唱 216–220、延迟 222–223、
 * 混响 225–229 这些参数在同组各格之间通常逐条相同（产品规则 R1），所以差异表里根本
 * 不会出现它们 —— 于是"某格改了混响参数"不会在换格时被同步，用户切过去的听感和
 * 他刚才调的不一样，现场一定当 bug 报。
 *
 * 因此：单格上传成功后，隔 1.6s 再给一条非阻塞提示（不抢"已上传"那条胶囊的位置）。
 */
const FX_CMP_ADDRS: readonly number[] = [
  215, 216, 217, 218, 219, 220,   /* 合唱 bypass + 参数 */
  221, 222, 223,                  /* 延迟 bypass + 参数 */
  224, 225, 226, 227, 228, 229,   /* 混响 bypass + 参数 */
];

/** 返回同组里 FX 参数与本格不同的槽位号（不含本格） */
function fxDiffInGroup(slot: number, getRegs: (s: number) => Record<number, number> | undefined): number[] {
  const mine = getRegs(slot);
  if (!mine) return [];
  const g = Math.floor((slot - 1) / 4);
  const diff: number[] = [];
  for (let i = 0; i < 4; i++) {
    const s = g * 4 + i + 1;
    if (s === slot) continue;
    const other = getRegs(s);
    if (!other) continue;
    if (FX_CMP_ADDRS.some((a) => (mine[a] ?? -1) !== (other[a] ?? -1))) diff.push(s);
  }
  return diff;
}

/* ★ 2026-11-16：网页预览（iPhone/iPad Safari、桌面浏览器）没有 Web Bluetooth，
   不能再用「未连设备」的锁屏把整个界面挡死，否则没法检查 iOS/iPad 的画面兼容。
   原生 App（Android/iOS Capacitor）行为不变。 */
const IS_WEB_PREVIEW = (() => {
  try {
    const cap = (window as any).Capacitor;
    return !cap?.isNativePlatform?.();
  } catch { return false; }
})();

export default function Index() {
  const { t, lang, setLang } = useI18n();
  /* ★★ v3.77（P2）：预设库寄存器保存版本号 —— 见 PresetsPanel 里 presetRev 的说明。
     「本地库上传硬件」写完 preset 就 bump，让预设库面板的切换延迟角标重算。 */
  const [presetRev, setPresetRev] = useState(0);
  // Load persisted state from localStorage
  const loadState = <T,>(key: string, fallback: T): T => {
    try { const v = localStorage.getItem('bfx_' + key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  };

  // Pre-init AudioContext on first user touch (required by Android WebView)
  useEffect(() => {
    const initAudio = () => {
      try {
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') ctx.resume();
        setTimeout(() => ctx.close(), 100);
      } catch {}
      document.removeEventListener('touchstart', initAudio);
      document.removeEventListener('click', initAudio);
    };
    document.addEventListener('touchstart', initAudio, { once: true });
    document.addEventListener('click', initAudio, { once: true });
    return () => { document.removeEventListener('touchstart', initAudio); document.removeEventListener('click', initAudio); };
  }, []);

  const [playMode, setPlayMode] = useState<PlayMode>(() => loadState('playMode', 'guitar'));
  const [activeSlot, setActiveSlot] = useState(1); // 提升自 PresetsPanel: 预设组上传需知道当前激活槽位所在硬件组
  /* ★ 2026-10-17：`curSlotName`（v69 H6 的首页档位名）已随顶部胶囊一起删除 */
  const [activeModuleIdx, setActiveModuleIdx] = useState(0);
  const [moduleEnabled, setModuleEnabled] = useState<Record<string, boolean>>(() =>
    loadState('moduleEnabled', Object.fromEntries(MODULES.map((m) => [m.id, true])))
  );
  const [btConnected, setBtConnected] = useState(false);
  /* ★ 2026-11-16：网页预览（iPhone/iPad Safari）没有 BLE，但顶栏账号、本地库、
     预设库、社区这些入口的"必须先连设备"守卫会把整页点死，看不到也测不了 UI。
     这里只在网页预览时把守卫放开（原生 App 仍然严格要求先连设备）。 */
  const uiConnected = btConnected || IS_WEB_PREVIEW;
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
  /* ══════════════════════════════════════════════════════════════════
   * ★★ v3.58（2026-10-24 用户拍板 K3）：切换 / 写入期间的【操作锁 + loading 遮罩】
   *
   * 为什么必须有：EA 多帧打包是一次连续写入（最多 6 包），中途若用户拧旋钮或
   * 点另一个格子，单帧会插进批次中间 → 参数顺序错、硬件停在半新半旧的状态；
   * 而 applySeq 中断只能阻止"后续再发"，已发出的包回滚不了。
   *
   * 约定：状态放在 services/switchBusy（模块级单例）——
   *       PresetsPanel 的 handleSlotSelect 与本组件的 applyLoadedTone 都要用，
   *       而遮罩渲染在顶层，跨组件用单例最省事，且 isBusy() 是同步读，不会被连点穿透。
   * ══════════════════════════════════════════════════════════════════ */
  const busy = useSyncExternalStore(subscribeBusy, getBusy, getBusy);

  /* ★ v5.3 未连接蓝牙提示：锚定在「被点的选项」上（不再用屏幕居中的外部提示） */
  const [connectHint, setConnectHint] = useState<{ x: number; y: number } | null>(null);
  const connectHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showConnectHint = useCallback((ev?: { clientX?: number; clientY?: number }) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 844;
    const x = Math.max(70, Math.min(vw - 70, ev?.clientX ?? vw / 2));
    const y = Math.max(70, Math.min(vh - 40, ev?.clientY ?? vh * 0.7));
    setConnectHint({ x, y });
    if (connectHintTimerRef.current) clearTimeout(connectHintTimerRef.current);
    connectHintTimerRef.current = setTimeout(() => setConnectHint(null), 1400);
  }, []);
  const [subModelNames, setSubModelNames] = useState<Record<string, string>>(() =>
    sanitizeSubModelNames(loadState<Record<string, string>>('subModelNames', {}))
  );
  /** ★ v8 箱头型号索引（新 UI TonePage 选中的那个，回传到这里）
   *  用途：defaults 构建器要知道当前箱头是哪个，才能写正确的 57-98 */
  const [ampIdxV8, setAmpIdxV8] = useState(0);
  /** ★ C6（2026-10-15）：静音开关状态 —— 写 reg260，1 = 静音 / 0 = 正常 */
  const [muted, setMuted] = useState(false);
  /** ★ 2026-10-16：未连接蓝牙的统一拦截提示（节流 2.5s，避免拖动旋钮时刷屏） */
  const notConnWarnRef = useRef(0);
  const warnNotConnected = () => {
    const now = Date.now();
    if (now - notConnWarnRef.current < 2500) return;
    notConnWarnRef.current = now;
    notifyErr(t('toast.connectBtFirst'), { duration: 3200 });
  };
  /** 未连接即拦截：所有写硬件 / 切档 / 载入入口统一调用 */
  const guardConnected = (): boolean => {
    if (bleManager.connected) return true;
    warnNotConnected();
    return false;
  };
  const [inputVol, setInputVol] = useState(() => loadState('inputVol', 1.0));
  const [outputVol, setOutputVol] = useState(() => loadState('outputVol', 1.0));
  const [inputMute, setInputMute] = useState(() => loadState('inputMute', false));
  const [outputMute, setOutputMute] = useState(() => loadState('outputMute', false));
  /* ★ v3.53（2026-10-22 用户拍板）：切换弱音 / 切换静音两个开关【删除】。
     改为自动判定 —— 只有箱头/箱体换型（整组切换）才静音，同组切换不静音。
     见 needSwitchMute()。旧 state（tsAtten / tsMute）已无消费方，连持久化一起移除。 */

  // Advanced engineering mode（原「调试模式」，v3.68 更名）—— 顶栏工程图标 / 长按 LOGO 进入
  const [debugMode, setDebugMode] = useState(false);
  /* ★★ v3.68：诊断类提示（「硬件切换到 X」「未能读取频道」）只在工程模式下显示 */
  useEffect(() => { setNotifyDebugMode(debugMode); }, [debugMode]);
  /* ★ 2026-10-19 / ★ v4.30：LOGO 手势
       · 单击 = **切换深色 / 暖色（浅色）主题**（弹跳动画保留当切换反馈）
       · 双击 = 已取消（原「中 / 英切换」，语言入口挪到顶栏的「中·EN」按钮）
       · 长按 900ms = 进入 / 退出调试模式
       · logoHoldRef.timer：长按计时；fired = 本次长按已处理（用于吞掉随后的 click）
       · logoPopKey：每次点击自增 → 作为 key 让 CSS 动画重播 */
  const logoHoldRef = useRef({ timer: null as ReturnType<typeof setTimeout> | null, fired: false });
  /* ★ v4.30：主题状态（默认深色；浅色是可选方案，切换后记忆） */
  const [themeMode, setThemeMode] = useState<ThemeMode>(readTheme);
  useEffect(() => { applyTheme(themeMode); }, [themeMode]);
  /* ★ 2026-10-17（用户要求）：配色 —— 顶栏空白处换底板色；TONE 键双击复位、长按锁定。
     配色存在 services/accentTheme.ts（跨组件共享），这里只订阅用于给整页底色上色。 */
  const [accMap, setAccMap] = useState(() => getAccents());
  useEffect(() => subscribeAccents(() => setAccMap(getAccents())), []);
  const pageBg = accMap[BG_ID] ?? bgTint();
  const tonePress = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean; last: number }>({
    timer: null, fired: false, last: 0,
  });
  /* ★ 2026-10-17（用户反馈）：TONE 键双击/长按的提示原来走底部 sonner，手指正压在
     键上完全挡住、字也太小 → 改用屏幕中部的大号提示卡（CenterHint）。 */
  const [centerHint, setCenterHint] = useState<HintPayload | null>(null);
  const hintSeq = useRef(0);
  const showHint = useCallback((kind: HintKind, text: string) => {
    hintSeq.current += 1;
    setCenterHint({ seq: hintSeq.current, kind, text });
  }, []);
  /* ★ 2026-10-19：LOGO 手势（定义见上方 logoClickRef / logoHoldRef） */
  const [logoPopKey, setLogoPopKey] = useState(0);
  const regCacheRef = useRef<Record<number, number>>({});
  // ★ 2026-10-15：踩钉改用「整段 BYPASS」后，旧的「整组复位前参数缓存」已整体删除
  //   （moduleResetCacheRef / 其切台清空 effect）—— 参数从不被改写，无需缓存。
  // A6 (2026-09-23): 踩钉"重新开启某模块"的默认参数恢复函数（定义在组件后段 → 用 ref 保持最新引用,
  //   同时避开 useCallback 依赖数组的前向引用/陈旧闭包问题）

  const [debugLogEntries, setDebugLogEntries] = useState<{ time: string; reg: number; val: number }[]>([]);
  const [debugRegTick, setDebugRegTick] = useState(0);
  /** ★ 2026-10-12: 调试面板 → 新 UI 的单寄存器回写同步（tick 变化触发 TonePage 合并） */
  const [extSync, setExtSync] = useState<{ tick: number; module: string; addr: number; value: number } | null>(null);
  const [, setCleanResetTick] = useState(0);

  // Persist key UI state to localStorage on changes
  useEffect(() => { localStorage.setItem('bfx_playMode', JSON.stringify(playMode)); }, [playMode]);
  useEffect(() => { localStorage.setItem('bfx_moduleEnabled', JSON.stringify(moduleEnabled)); }, [moduleEnabled]);
  useEffect(() => { localStorage.setItem('bfx_subModelNames', JSON.stringify(subModelNames)); }, [subModelNames]);
  useEffect(() => { localStorage.setItem('bfx_inputVol', JSON.stringify(inputVol)); }, [inputVol]);
  useEffect(() => { localStorage.setItem('bfx_outputVol', JSON.stringify(outputVol)); }, [outputVol]);
  useEffect(() => { localStorage.setItem('bfx_inputMute', JSON.stringify(inputMute)); }, [inputMute]);
  useEffect(() => { localStorage.setItem('bfx_outputMute', JSON.stringify(outputMute)); }, [outputMute]);

  // Android back button: 有面板先关面板 (注册/忘记密码页先回登录), 无面板才弹退出框
  const [showExitDialog, setShowExitDialog] = useState(false);
  const panelBackRef = useRef<(() => void) | null>(null);
  const activePanelRef = useRef<null | 'studio' | 'bluetooth' | 'presets' | 'user' | 'library' | 'community'>(null);
  /**
   * ★★ 2026-10-26（P1 修复）：返回键要认识「当前最上层是什么」。
   *   旧实现只认 `panelBackRef` 与 `activePanel` 两级，而根级浮层其实有五种：
   *   教程(z500) / 退出框(z300) / PDF 阅读器(z200) / 工程面板(z320) / 忙碌遮罩(z9000)。
   *   于是：教程播放中按返回 → 退出框被教程盖住（用户以为返回键坏了），
   *   关掉教程那一瞬退出框凭空冒出，再误触就是退出；
   *   PDF 按返回 → 底下的用户面板被关，PDF 还盖在首页上。
   *   这里用 ref 保存这三个状态，避免 effect 闭包读到旧值。
   */
  const pdfRef = useRef<{ name: string; file: string } | null>(null);
  const debugRef = useRef(false);
  const tourRef = useRef(false);
  /** ★ 2026-11-02：硬件按键教程是根级全屏层，返回键要优先吃掉 */
  const hwGuideRef = useRef(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cleanup: (() => void) | undefined;
    const onBack = () => {
      /* ★ 2026-10-26（P0）：写入 / 切档期间禁止任何「关面板 / 退出」。
         退出会直接 bleManager.disconnect()，把正在写的 EA 批次腰斩 ——
         硬件留在半张频道表上，而 restoreDrift 只回滚 App 侧基准，硬件不会回滚。 */
      if (isBusy()) return;
      /* 按「当前最上层」逐层吃掉返回键：教程 → PDF → 工程模式 → 面板二级层 → 面板 → 退出框 */
      if (hwGuideRef.current) { setHwGuideOpen(false); setHwGuideTutorial(false); return; }
      if (tourRef.current) { window.dispatchEvent(new Event('bfx-tour-close-req')); return; }
      if (pdfRef.current) { setFullScreenPdf(null); return; }
      if (debugRef.current) { setDebugMode(false); return; }
      if (panelBackRef.current) { panelBackRef.current(); return; }
      if (activePanelRef.current) { setActivePanel(null); return; }
      /* ★ 只给「真正要退出」这一步做防误退节流 ——
         旧实现每处理一次都计时，导致连续两次返回（关面板→想退到上一级）第二下被静默吞掉。 */
      if (timer) return;
      timer = setTimeout(() => { timer = null; }, 1000);
      setShowExitDialog(true);
    };
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('backButton', onBack);
        cleanup = () => listener.remove();
      } catch {
        // Fallback: try DOM backbutton event
        document.addEventListener('backbutton', onBack, false);
        cleanup = () => document.removeEventListener('backbutton', onBack);
      }
    })();
    return () => { if (cleanup) cleanup(); };
  }, []);

  // Track exact knob values (normalized 0-1) from user adjustments
  const userKnobValuesRef = useRef<Record<string, Record<string, number>>>({});
  // 快速切换防交错 (社区/收藏应用): 每次应用 bump seq, 旧循环中断, 避免两循环并发交错写寄存器
  const applySeqRef = useRef(0);
  /* ★★ v3.70：本地库的「当前格」与「连接后第一次切换」定义在**模块级**
     （见文件顶部 localSlotRef / firstSwitchRef）—— 因为 `handleSlotSelect` 属于
     PresetsPanel、`applyLoadedTone` 属于 Index，两个组件都要读写同一个状态，
     放组件内就得再加 prop 穿透，模块级单例更省事（与 currentCabSubModelIdRef 同一套路）。 */

  /* ══════════════════════════════════════════════════════════════════════
   * ★★ v3.53（2026-10-22 用户拍板）· 切换静音策略 —— APK 通用铁律
   *
   * 用户原话：「现在只有箱头和箱体模块切换，整组切换时，才需要加静音，
   *   防止爆音。这个你登记一下。作为 APK 的切换逻辑使用。」
   *
   * 判定规则 needSwitchMute()：
   *   ① 箱头型号 或 箱体型号 变化 → 静音（= 整组切换）
   *   ② 差异寄存器 > 60 条        → 静音（兜底：实际已是整组级换血）
   *   ③ 其余（同组只改 GAIN / 过载 / 效果器）→ 【不静音】
   *
   * ★ v3.54（组首底图）：A1 已带 A2 的 subModels → A1⇄A2 型号"没变"，不再静音。
   *
   * 为什么同组必须不静音：同组切换不重建箱头箱体模型，DSP 相位/工艺链不变，
   *   本来就不会爆音。旧实现无条件 reg261=26（−24 dB），导致 A2→A3 这种
   *   只差 17 条的切换也要塌 0.74 秒音量 —— 用户实测听到的"中断"就是它。
   *
   * 注：预设库（发 EE <ch>）由固件负责静音（K7 决议），本函数只服务
   *     APK 自己逐条写 EA 的路径（本地库载入 / 社区试听）。
   * ══════════════════════════════════════════════════════════════════════ */
  const duckOnRef = useRef(false);                          // 当前是否处于静音保护
  const volBeforeSwitchRef = useRef<number | null>(null);   // 进入切换前的 reg261 真值
  const mute2BeforeRef = useRef<number>(0);                 // 进入切换前的 reg2 真值（用户手动静音要还原）

  /**
   * 本次切换要不要静音 —— **只由箱头/箱体型号决定**（用户拍板铁律）。
   *
   * ★★ v3.75（结构性收口）：这里原来是**第二份**实现（型号缺失时退回 diff>60），
   *   与 `switchPacks.muteFor()` 行为不同 → 「同一对音色，命中预存包会静音、
   *   走回退不静音」，用户听到什么取决于有没有命中包。现在统一调 `muteFor()`：
   *   判据只有一份，两条路径（预存包 / 实时 diff）结果必然一致。
   */
  const needSwitchMute = (target: ToneShape): boolean => {
    if (!target) return true;                             // 没有型号信息 → 保守静音
    /* 起始侧 = 首页真实状态（v3.70：`subModelNames` 只在切台/载入时更新，是陈旧值） */
    const ui = getUiSnapshot();
    const baseSm = normalizeSubModels({ ...subModelNames, ...ui.subModels }) ?? {};
    const tgtSm = normalizeSubModels(target.subModels) ?? {};
    const baseRegs: Record<number, number> = {};
    for (const [a, v] of registerStore.collectAll()) baseRegs[a] = v;

    const mute = muteFor(
      { registers: baseRegs, subModels: baseSm },
      { registers: target.registers, subModels: tgtSm },
    );
    /* 判定依据进「高级工程模式」日志 —— 用户说"这里断了一下"时可直接定位 */
    if (mute) {
      const curAmp = baseSm['amp-head'] || '';
      const tgtAmp = tgtSm['amp-head'] || '';
      const curCab = baseSm['cabinet'] || '';
      const tgtCab = tgtSm['cabinet'] || '';
      notifyDebug(
        `静音: 箱头[${curAmp}≠${tgtAmp}]${curCab !== tgtCab ? ` 箱体[${curCab}≠${tgtCab}]` : ''}`,
      );
    }
    return mute;
  };

  /** 进入静音保护：reg2=1 输入静音（整组重建期间不该听到任何半成品声音）
   *
   * ★★★ 2026-10-31 修正（重要）：**这里绝不能写 reg260（DSP 输出静音）**。
   *   260 是 latch 型：写 1 就一直静音，必须显式写 0 才恢复，而固件切档/开机
   *   都不会重置它。之前为了"防扫频"把它加进 duckOn/duckOff，结果一旦 duckOff
   *   走了任何一条早退分支（断线、被新点击挤掉、闭包里的 connectedDeviceId 过期），
   *   260 就永久停在 1 —— 表现为"整机彻底没声音，连按键切档也没声"。
   *   而且 registerStore 里也被写成 1，下一次 duckOn 会把"1"当成用户本来的状态记住，
   *   从此每次恢复都恢复成静音，自我固化。
   *
   *   现在：静音保护这条通用链路只碰 reg2（输入静音，用户本来就有、也有手动开关）。
   *   首页换箱头/箱体需要的「输出静音」由 HomePanel 单独做，且**无条件恢复成 0**，
   *   见 HomePanel 的 withOutputMute()。 */
  const duckOn = async () => {
    if (!connectedDeviceId || duckOnRef.current) return;
    duckOnRef.current = true;
    volBeforeSwitchRef.current = registerStore.get(261) ?? Math.round(outputVol * 50);
    mute2BeforeRef.current = registerStore.get(2) ?? 0;
    await bleManager.writeRegister(2, 1, 0xEA).catch(() => {});
    registerStore.set(2, 1);
    await new Promise(r => setTimeout(r, 30));            // 等 DSP 真正静下来再写参数
  };

  /** 解除静音保护（必须在 finally 里调；重复调用无副作用）
   *  ★★ v3.58（2026-10-24，修 P1-1）：顺序改为【先总音量、后解除静音】。
   *  旧实现先写 reg2 再写 261 —— 开声那一瞬间用的是旧音量，会听到一个短暂的电平跳变。
   *  另外 reg2 这一帧会被固件排在整批参数之后执行，所以「切换真正结束才开声」是天然的，
   *  不需要在这里估算时间。 */
  const duckOff = async (restore261?: number, skip261 = false) => {
    if (!duckOnRef.current) return;
    /* ★★ v3.75（H6）：**断线时不能先把 ref 置 false 再 return**。
       旧写法在中途掉线时把 `duckOnRef` 清掉了，但硬件 reg2 其实还停在 1 ——
       之后所有「不静音」的切换都不会写 reg2，重连后输入静音常驻，
       唯一的手动恢复入口（IO 弹窗）还只在工程模式里，用户根本找不到。
       现在保持 ref = true（语义：静音尚未解除）。★ v3.92 起连接不再补写复位，
       改为重连时只清 ref（本地状态），硬件 reg2 由用户下一次切换的 duckOff 自动还原。 */
    /* ★ 2026-10-31：用 bleManager.connected（实时）而不是闭包里的 connectedDeviceId ——
       后者在 useCallback 里可能是旧值，会在这里提前 return，把 reg2 永久留在 1。 */
    if (!bleManager.connected) return;
    duckOnRef.current = false;
    /* ① 总音量：恢复成目标音色的 261（每档自带总音量），没有则回落到进入前的值 */
    const v = restore261 ?? volBeforeSwitchRef.current;
    if (!skip261 && v !== undefined) {
      await bleManager.writeRegister(261, v, 0xEA).catch(() => {});
      registerStore.set(261, v);
      setOutputVol(v / 50);
    }
    /* ② 还原输入静音 —— **以 UI 的 inputMute 为准**，而不是"进入前从 registerStore 读到的值"。
     *   旧写法有自我固化的坑：某次恢复走了早退分支 → reg2 停在 1 → registerStore 也是 1 →
     *   下一次 duckOn 把 1 当成"用户本来状态"记住 → 之后每次都恢复成 1，永久没声音。
     *   现在只认用户的手动开关状态，切换过程永远不会把静音"学"下来。 */
    const m2 = inputMute ? 1 : 0;
    await bleManager.writeRegister(2, m2, 0xEA).catch(() => {});
    registerStore.set(2, m2);
    volBeforeSwitchRef.current = null;
  };

  // 音色社区下载应用 (v22): 试听语义 —— 不切 EE 频道 / 不写本地库 / 不占槽位
  // A1 (2026-09-22): 本路径【不属于】"切换预设库", 按 #2「其他发送的关键帧不变」保留 EA 实时写,
  //                  仅把节奏统一为 REG_WRITE_MS=20ms
  // ★ v3.53（2026-10-22）：防爆音从「无条件弱音」改为「按型号判定」（见 needSwitchMute）
  // ★★ v3.75（H7）：返回 boolean —— 本地库据此决定「高亮 / 已加载标记」何时落定。
  //   旧实现是 void：LocalBankPage 先 setCur 再调 onApply，而这里未连接 / isBusy() 时
  //   静默 return → 界面已高亮切换、硬件一个字节都没动，下次 getPack 的起点也跟着错。
  const applyLoadedTone = async (item: LocalPreset, trialName?: string): Promise<boolean> => {
    /* ★ 2026-10-16（用户要求）：不连接蓝牙不得使用任何功能，禁止离线操作。
     *   加载本地库必须先连接，否则只提示、不动作（防止误操作）。 */
    if (!guardConnected()) return false;
    /* ★ v3.58：写入期锁 —— 上一批还在发就别开新的（否则两批交错，硬件半新半旧） */
    if (isBusy()) return false;
    /* ★ 2026-10-24：「试用」浮条 —— 只有社区音色（带 trialName）才挂浮条；
       本地库 / 预设库载入一律清掉，避免浮条与实际状态错位。 */
    setTrialTone(trialName ?? null);
    const mySeq = ++applySeqRef.current;

    /* ★ 2026-10-20（用户拍板）：禁写寄存器一律不下发 —— 旧预设 / 社区音色里可能还存着
       43/48/52/58/63/67/73/78/82，载入时先剔掉再进入写入链路（浅拷贝，不动原对象）。
       （放在 try 之前：静音判定要先用它算差异条数） */
    const srcRegs: Record<number, number> = stripForbidden(
      TEST_SWEEP_MODE ? { ...TEST_SWEEP_MAP } : { ...(item.registers || { }) });
    /* ★★ v3.70：260 是硬件 mute（不是音色参数）。导出的 A1/A2/A3 存档里都带着它 ——
       若保存那一刻正处于静音，切过去会把硬件静音掉。所有进入写入链路的表一律先剔掉。 */
    delete srcRegs[260];
    /* ★★★ 2026-11-04（一致性）：**本地试听写进 DSP 的地址集 = 固件的 117 条音色表**。
       存档里可能带 240/251/252 这类"协议合法但不在音色表"的地址 —— 固件既不会存
       也不会在切档时下发，留着它们会让"App 试听"和"固件切档"不是同一套数据。 */
    for (const k of Object.keys(srcRegs)) {
      const a = Number(k);
      if (!isToneTableAddr(a)) delete srcRegs[a];
    }

    /* ★★ v3.70：目标型号先归一 —— 旧版本存下来的音色 `amp-head` 可能是 id（"twin"），
       不转成 name 的话既会误判换型静音，也会让后续按 name 反查的路径全部失效。 */
    const tgtSubModels = normalizeSubModels(item.subModels as Record<string, string> | undefined);

    /* ══════════════════════════════════════════════════════════════════
     * ★★ v3.70（用户拍板）：切换时【不做任何判定】
     *   用户原话：「保存好之后，就不要再做任何判定工作，只发送参数切换即可。」
     *
     * ★★ v3.75（Q1=A · 兑现这条铁律）：命中预存包时**直发 `pack.pre / frames / post`**。
     *   旧实现只取了 `pack.frames`，三段式在下面又算了一遍 —— 也就是说「保存时算死」
     *   只在帧清单上落地了，静音、时长、延迟三段全部还是运行时判定。
     *   现在：三段 + 时长全部照包发，只有「补丁 / 全量」才重算。
     * ══════════════════════════════════════════════════════════════════ */
    const pack = TEST_SWEEP_MODE ? null : getPack(localSlotRef.current, item.slot);
    let muteThisSwitch = false;
    /* ★★★ 2026-11-02（用户要求「本地库组内 1–4 格切换不能有静音」）：
     *   本地库 16 格 = 4 组 × 4 档（Twin / JTM45 / 6505 / L4），与预设库 2/3/4 组同构。
     *   同组 = 同一个箱头家族，切换只是参数变化，不该压静音。
     *   旧实现按"箱体型号是否变化"判定，同组换了箱体就会断 1–2 秒 —— 用户明确不要。 */
    const sameGroupLoad = Math.floor((localSlotRef.current - 1) / 4) === Math.floor((item.slot - 1) / 4);
    let windowMs = 0;
    let frames: Array<{ regAddr: number; value: number }> = [];
    let fxPre: Array<{ regAddr: number; value: number }> = [];
    let fxPost: Array<{ regAddr: number; value: number }> = [];

    /* 漂移补丁：App 在首页手拧过的地址，必须按【目标格】的取值重写一遍，
       否则切走后它们会停在手拧值上（预存包里不含这些地址）。成本 O(drift)。 */
    const drift = takeDrift();
    /* ★ 2026-11-03：镜像一旦失真（设备自己换档 / 刚上传过），必须走全量重灌。 */
    const forceFull = firstSwitchRef.current || forceFullNextRef.current || drift.length > 20;
    if (forceFullNextRef.current) forceFullNextRef.current = false;
    const mods = item.modules as Record<string, boolean> | undefined;

    /* 9 条开关兜底：影子表可能为空（刚连接 / 断线重连 / 刚切过预设库档）
       → 目标开关位不在帧里就补进来。先算好，两条路径共用。 */
    const switchExtra: Array<{ regAddr: number; value: number }> = [];
    for (const d of switchDiffs(switchPlan(mods))) {
      switchExtra.push({ regAddr: d.addr, value: d.value });
    }

    if (pack && !forceFull) {
      /* ── ① 直发预存包：零判定 ── */
      muteThisSwitch = pack.mute && !sameGroupLoad;   /* ★ 同组不静音 */
      windowMs = pack.ms;
      fxPre = pack.pre.map(([a, v]) => ({ regAddr: a, value: v }));
      fxPost = pack.post.map(([a, v]) => ({ regAddr: a, value: v }));
      frames = pack.frames.map(([a, v]) => ({ regAddr: a, value: v }));

      /* 补丁（drift 手拧 + 开关兜底）。开关位若已被 pre/post 接管（延迟 221），
         一律跳过 —— 否则会打乱「先旁路 → 写参数 → 再开」的三段时序。 */
      const guard = new Set<number>();
      for (const f of fxPre) guard.add(f.regAddr);
      for (const f of fxPost) guard.add(f.regAddr);
      const have = new Set<number>(frames.map((f) => f.regAddr));
      const extra: Array<{ regAddr: number; value: number }> = [];
      for (const a of drift) {
        if (have.has(a) || guard.has(a)) continue;
        if (srcRegs[a] === undefined) continue;
        extra.push({ regAddr: a, value: srcRegs[a] });
      }
      for (const e of switchExtra) {
        if (have.has(e.regAddr) || guard.has(e.regAddr)) continue;
        extra.push(e);
      }
      if (extra.length) {
        /* ★★ v3.75（H3）：补丁**合并进主批后统一重排**。
           旧写法 `[...frames, ...orderBypassSplit(extra)]` 只让 extra 在自己内部有序，
           整体仍拼在整批末尾 → 目标=1 的旁路位（57=1 箱头旁路）跑到最后，
           先改箱头参数、后关箱头 = v3.74 想消灭的噪音又回来了。
           （只要预设库切过档、影子表被清空，这条路径必现。） */
        frames = orderBypassSplit(
          [...frames, ...extra],
          (x) => x.regAddr,
          (x) => x.value,
        );
        windowMs = eaWindowMs(frames, fxPre, fxPost);
      }
      notifyDebug(
        `包 ${pack.from}→${pack.to} · ${pack.frames.length} 帧 · ${muteThisSwitch ? '静音' : '不静音'}` +
        `${extra.length ? ` · 补丁 ${extra.length}` : ''}`,
      );
    } else {
      /* ── ② 回退：实时 diff（社区试听 / 首次切换 / 空槽 / 刚切过预设库档 / 全量）── */
      muteThisSwitch = sameGroupLoad ? false : needSwitchMute({ registers: srcRegs, subModels: tgtSubModels });
      const fullSend = muteThisSwitch || forceFull;
      /* ★★ v3.74：按目标值分段 —— 「要关的旁路位」必须排在参数前面 */
      const ordered = orderBypassSplit(
        Object.keys(srcRegs).map(Number),
        (a) => a,
        (a) => srcRegs[a],
      );
      for (const a of ordered) {
        /* ★★★ 2026-11-02（用户拍板）：**260（DSP 输出静音）不进批** —— 静音不随音色记忆。
         *   它是 latch，写 1 就永久静音；表里若带 260=0，切档会把用户手动的静音解除。
         *   261（总音量）**保留在批次外单独写**（见 finally）：那是"每档自己的音量"，要记忆。 */
        if (a === 2 || a === 260 || a === 261) continue;
        const val = srcRegs[a];
        if (!fullSend && !TEST_SWEEP_MODE && registerStore.get(a) === val) continue;
        frames.push({ regAddr: a, value: val });
      }
      /* 开关兜底：同样「合并后统一重排」，不 append（H3） */
      {
        const have = new Set(frames.map((f) => f.regAddr));
        const extra = switchExtra.filter((e) => !have.has(e.regAddr));
        if (extra.length) {
          frames = orderBypassSplit([...frames, ...extra], (x) => x.regAddr, (x) => x.value);
        }
      }

      /* ══════════════════════════════════════════════════════════════════
       * 延迟的「三段式」（回退路径在这里重算；命中包时用包里存好的）
       *
       * 成因：222/223（延迟时间/反馈）写进**正在运行**的延迟算法，会把旧缓冲
       * 一路播出来 = 那段长尾音。先把 221 置 1（旁路）再写，就完全安静。
       *
       * ★★ v3.74：pre 改成**无条件**（只要本批写 222/223 就先 221=1）——
       *   「延迟需要在前一个和后一个频道预加载」；起始格本来就关着时这一帧
       *   只是重复写 1，硬件无感知；靠判定反而会漏。
       *   ⛔ 合唱不做预加载（用户明确要求）。
       * ══════════════════════════════════════════════════════════════════ */
      /* ★★★ 2026-11-03（用户拍板）：**跨「1 组」边界必须先写 253**。
       *   固件默认规则是 1 组=1（线材直通要旁路限幅）、其余组=0，
       *   但只在"值变了"时才追加；本地库切档（EA）以前从不写它，
       *   于是设备停在上一格的状态 → 本地听感与固件切档分叉。
       *   这里在 pre 段最前面补一帧，与预存包（switchPacks.buildPack）同一口径。 */
      if (localSlotRef.current && localSlotRef.current >= 1 && localSlotRef.current <= 16) {
        const gFrom = Math.floor((localSlotRef.current - 1) / 4);
        const gTo = item.slot ? Math.floor((item.slot - 1) / 4) : gFrom;
        /* ★★★ 2026-11-16（用户拍板）：253 与组号绑定 —— **1 组=1，其余组=0**。
           旧版只写「离开 1 组」（1→2/3/4 写 0），进 1 组靠固件；用户实测本地库
           进 1 组时限幅状态不对，现在**跨组双向都写**：进 1 组写 1，离开写 0。
           组内切换不动（两边同值）。 */
        if (gFrom !== gTo) fxPre.unshift({ regAddr: 253, value: gTo === 0 ? 1 : 0 });
      }

      for (const fx of PRE_BYPASS_FX) {
        if (!frames.some((f) => fx.params.includes(f.regAddr))) continue;
        /* 目标开关值以 modules 为权威；老音色没有 modules 时才看寄存器。
           反过来会把「模块关闭、存档里残留 221=0」的旧音色误开。 */
        const tv = mods?.[fx.name] !== undefined
          ? (mods[fx.name] ? 0 : 1)
          : srcRegs[fx.sw];
        if (tv === undefined) continue;
        fxPre.push({ regAddr: fx.sw, value: 1 });
        frames = frames.filter((f) => f.regAddr !== fx.sw);
        if (tv !== 1) fxPost.push({ regAddr: fx.sw, value: tv });
      }
      windowMs = eaWindowMs(frames, fxPre, fxPost);
    }

    /* 记录「硬件现在对应哪一格」—— 只认 1..16 的合法槽位。
       ★★ v3.75（H4）：先留旧值，写入失败时回滚（见下面失败分支）。 */
    const prevFirstSwitch = firstSwitchRef.current;
    const prevLocalSlot = localSlotRef.current;
    let committed = false;
    firstSwitchRef.current = false;
    localSlotRef.current =
      item.slot && item.slot >= 1 && item.slot <= 16 ? item.slot : null;

    const startedAt = Date.now();
    let busyStarted = false;
    let failed = false;

    try {
      // 1b. 整组切换防爆音：输入静音（用户拍板：只有箱头/箱体换型才静音）
      if (muteThisSwitch) await duckOn();

      // 1. 软件: 恢复 UI (模式 / 模块开关 / 子型号)
      if (item.playMode) setPlayMode(item.playMode as any);
      if (item.modules) setModuleEnabled(item.modules);
      if (tgtSubModels) setSubModelNames(tgtSubModels);

      /* ══════════════════════════════════════════════════════════════════
       * 2. 硬件：EA 多帧打包（BFRT10.187）—— 20 帧/包、writeWithoutResponse
       *
       * · **删掉逐条 20ms / 50ms / 150ms 的分级等待** —— 节奏交给固件队列
       *   （设备侧 69 帧/s，App 再睡只会重复限速）
       * · reg 2（输入静音）与 261（总音量）不进批：duckOn / duckOff 单独负责，
       *   这样 duckOff 写回的 reg2 会被固件排在整批之后 →「切换结束才开声」
       * · 写入顺序在**保存时**就排好了（数据类在前、旁路类在后、末两位 72 → 107）
       * ══════════════════════════════════════════════════════════════════ */
      const totalFrames = fxPre.length + frames.length + fxPost.length;
      if (totalFrames) {
        beginBusy(t('switch.loading') || '切换中…', `${item.name ?? ''} · ${totalFrames}`);
        busyStarted = true;
        /* ★★ v3.71：三段严格串行 —— 先旁路 → 写参数 → 恢复开关。
           每段都等写回调；`writeWithoutResponse` 的 FIFO 保证固件侧按序处理。 */
        const segs = [fxPre, frames, fxPost].filter((s) => s.length > 0);
        let sent = 0;
        for (const seg of segs) {
          const res = await bleManager.writeEaBatch(seg);
          if (!res.ok) {
            failed = true;
            /* ★★ v3.75（H4）：失败必须**回滚基准**。
               旧实现只 return —— 但 `localSlotRef` / `firstSwitchRef` 已经前移到目标格、
               `takeDrift()` 也已经清空。一次失败之后，App 认为「硬件 == 目标格」，
               后续所有差异都基于错误基准，残留参数长期错位且用户完全无感。 */
            firstSwitchRef.current = prevFirstSwitch;
            localSlotRef.current = prevLocalSlot;
            restoreDrift(drift);
            notifyErr(`写入中断：已发 ${sent + res.sent}/${totalFrames} 帧，请重试`, { duration: 3200 });
            return false;                             // finally 兜底 duckOff / endBusy
          }
          sent += seg.length;
          for (const it of seg) {
            registerStore.set(it.regAddr, it.value);
            regCacheRef.current[it.regAddr] = it.value;
          }
        }
        committed = true;                             // 帧全部落盘 → 基准可以前移
      } else {
        committed = true;                             // 无帧可发 = 硬件本来就是目标态
        setDebugRegTick(t => t + 1);
      }

      // 2a. ★ 2026-10-15（C4 口径）：不再硬写分支位 78。
      //     箱头分支级旁路由型号数据决定，开关逻辑一律不碰；此处原先强制写 0
      //     会覆盖 CLEAN 类型号「REG78=1 常闭 OD」的定义。
      if (mySeq !== applySeqRef.current) return committed;   // 被新点击挤掉：已发部分算成功
      setDebugRegTick(t => t + 1);

      // 2a-2. ★★ v3.70：**不再单独调 writeSwitchPlan**。
      //   9 条开关位已在上面合并进同一批次（`switchDiffs(switchPlan(modules))` 的兜底），
      //   而 `writeEaBatch` 成功后会自动 `noteSwitchWrite` 更新影子表 —— 再逐条写一遍
      //   只会多花 100–300ms（每次 20/50/150ms 的落定等待），纯属浪费。
      //   这也正是用户「预设是直接发包，不需要加延迟间隔」的落地点。

      // 2b. 软件: 恢复 IO 状态 (总音量/静音) 与硬件写入一致 (reg3/261: 0~50 = -50~0dB)
      if (mySeq !== applySeqRef.current) return committed;   // 被新点击挤掉：已发部分算成功
      const r3 = item.registers?.[3];
      const r261 = item.registers?.[261];
      if (r3 !== undefined) setInputVol(r3 / 50);
      if (r261 !== undefined) setOutputVol(r261 / 50);

      // 3. 软件: 还原旋钮位置 (EA 关键帧为准反解, 快照仅作 boost 兜底)
      /* ★★ v3.62：整体替换（不叠加 prev）—— 换模板必须连旋钮一起换干净 */
      const effSm = { ...(item.subModels || {}) };
      setLoadedKnobValues({ ...(item.knobValues || {}), ...deriveAllKnobValues(effSm) });

      // 4. Boost PGA 还原 (独立 boost 模块, 无寄存器)
      const bv = item.knobValues?.['boost']?.['BOOST'];
      if (bv !== undefined) {
        if (!userKnobValuesRef.current['boost']) userKnobValuesRef.current['boost'] = {};
        userKnobValuesRef.current['boost']['BOOST'] = bv;
      }
      const boostOn = item.modules?.['boost'] ?? false;
      bleManager.writePGA(boostOn && bv !== undefined ? Math.round(bv * 10) : 0).catch(() => {});

      /* 4b. ★ v3.53：解除静音统一放到 finally —— 原先在这里写一次，
         但只要中途被新点击挤掉（8 处 mySeq 早退）就恢复不了，音量永久卡在
         −24 dB / 静音状态（用户实测「切一次就没声音」的根因）。 */

      // 4c. ★ 2026-10-15 修复：本地库加载后首页 / 模块 UI 未跟随 —— 补推一次频道快照
      if (mySeq === applySeqRef.current) {
        /* ★ 2026-10-20（C5）：快照带开关位补齐 —— 首页 sendAll 以这份为源，值必须与
           刚对齐过的 9 条开关一致（老音色缺 224/107 时这里补上）。 */
        pushChannelSync({ ...item, registers: srcRegs });
      }

      /* ★★ v3.69（用户报障「音色切换成功后都会有底部弹框」）：
         载入成功**不再弹底部提示** —— 全过程已经有全屏 LOADING 遮罩，
         结束后遮罩消失本身就是「已完成」的信号；再弹一条只是噪音。
         失败仍然必须报（下面的 catch → notifyErr）。压测模式留一条诊断提示。 */
      if (TEST_SWEEP_MODE) {
        notifyDebug(`压测图已发送 ${frames.filter((f) => f.regAddr !== 2 && f.regAddr !== 261).length} 条寄存器`);
      }
    } catch (e: any) {
      failed = true;
      /* ★★ v3.75（H4）：抛异常同样回滚（帧可能只发了一半，基准绝不能前移） */
      if (!committed) {
        firstSwitchRef.current = prevFirstSwitch;
        localSlotRef.current = prevLocalSlot;
        restoreDrift(drift);
      }
      notifyErr(t('toast.loadFail') + (e.message || ''));
      return false;
    } finally {
      /* ★★ v3.53：静音解除的兜底 —— 无论正常结束、抛异常，还是被新点击挤掉
         （内部 return 也会走 finally），这里一定恢复总音量与 reg2。
         ★★ v3.70（用户拍板时序）：「切换前先开启 MUTE，**LOADING 结束后**再关闭」。
         所以这里先等够 B 口径的窗口（超过就立即走），再 endBusy，最后才解除静音。
         写入失败时不等（失败要立刻让用户知道）。 */
      if (busyStarted) {
        if (!failed) {
          const left = windowMs - (Date.now() - startedAt);
          if (left > 0) await new Promise((r) => setTimeout(r, left));
        }
        endBusy();
      }
      /* ★★ v3.70（修 261 同组切换永远不写）：
         批次里排除了 261，唯一写它的地方是 duckOff，而 duckOff 开头就是
         `if (!duckOnRef.current) return` —— 不静音的切换直接返回，总音量永不更新。
         现有 16 格 261 全是 50，所以一直没暴露；只要某格音量不同就会出错。
         这里分成两支：静音过 → duckOff（内部先 261 后 reg2）；没静音 → 独立补 261。 */
      const v261 = srcRegs[261];
      if (duckOnRef.current) {
        await duckOff(v261);
      } else if (v261 !== undefined && registerStore.get(261) !== v261) {
        await bleManager.writeRegister(261, v261, 0xEA).catch(() => {});
        registerStore.set(261, v261);
        setOutputVol(v261 / 50);
      }
    }
    /* ★★ v3.75（H7）：走到这里说明帧已发完（committed）—— 本地库据此落定高亮/已加载标记 */
    return committed;
  };

  // 打包当前音色快照 (音色社区上传): 当前寄存器 + 模块开关/子型号/旋钮 + IO
  const buildUploadPayload = (): LocalPreset | null => {
    const ui = getUiSnapshot();
    const allRegs = new Map<number, number>();
    for (const [addr, val] of registerStore.collectAll()) allRegs.set(addr, val);
    /* ★ 2026-10-17（修复「保存的音色加载后是空的」）：
       registerStore 只有【被拖动过】的寄存器；刚连接且本地 16 档没有该频道数据时它基本是空的。
       首页的旋钮值活在 ui2/HomePanel 自己的 state 里，所以这里把 UI 快照叠加进来（UI 优先）。
       否则保存下来只剩几个模块开关位，加载时什么都恢复不出来。 */
    for (const regs of Object.values(ui.values)) {
      for (const [a, v] of Object.entries(regs)) {
        const addr = Number(a);
        if (Number.isFinite(addr) && typeof v === 'number') allRegs.set(addr, v);
      }
    }
    /* 总音量（reg 261）由 Index 的 outputVol 驱动，不在模块快照里 → 单独补 */
    allRegs.set(261, Math.max(0, Math.min(50, Math.round((outputVol ?? 1) * 50))));
    /* 模块开关 / 子型号：UI 优先（新首页的开关只维护在自己的 state，不写 moduleEnabled） */
    const modules: Record<string, boolean> = { ...moduleEnabled, ...ui.modules };
    /* ★★ v3.70：型号名统一成 **name** 口径再存。
       旧版 HomePanel 往 uiSnapshot 里塞的是 id（"twin"），存出来的音色拿回硬件/UI 都对不上；
       现在 HomePanel 已改传 name，这里再套一层 normalize 兜住「本次会话前就已存在的旧快照」。 */
    const subModels: Record<string, string> = normalizeSubModels({ ...subModelNames })
      ?? { ...subModelNames };
    const uiSm = normalizeSubModels(ui.subModels);
    if (uiSm) for (const [k, v] of Object.entries(uiSm)) if (v) subModels[k] = v;

    // 2026-09-25 白名单口径: 关闭模块 → **先删该模块自身参数(MODULE_PARAM_RANGES, 箱头含 239)**
    //   再写入该模块的关闭直通集(getModuleOffRegs); 保留旁路位的模块 → 维持原逻辑只留旁路位
    //   本函数无 defaults 打底(只有 live), 不删就会把用户关模块前的残留整组上传
    for (const [mid, [lo, hi]] of Object.entries(MODULE_REG_RANGES)) {
      if (modules[mid] ?? false) continue;
      if ((PASSTHROUGH_MODULES as readonly string[]).includes(mid)) {
        for (const [plo, phi] of MODULE_PARAM_RANGES[mid] ?? []) {
          for (const addr of [...allRegs.keys()]) {
            if (addr >= plo && addr <= phi) allRegs.delete(addr);
          }
        }
        for (const [a, v] of Object.entries(getModuleOffRegs(mid))) allRegs.set(Number(a), v);
        continue;
      }
      const keep = new Set<number>([MODULE_BYPASS_ADDR[mid], ...(MODULE_EXTRA_BYPASS[mid] ?? [])]);
      for (const addr of [...allRegs.keys()]) {
        if (addr >= lo && addr <= hi && !keep.has(addr)) allRegs.delete(addr);
      }
    }
    // 内部旁路位（白名单内，0=启用 / 1=旁路）: 整图权威, 开启模块必须显式写 0
    for (const [mid, by] of Object.entries(INTERNAL_BYPASS_BY_MODULE)) {
      allRegs.set(by, (modules[mid] ?? false) ? 0 : 1);
    }
    // 白名单归一化：白名单外的地址一律不写入(不再恒写 0)
    for (const addr of [...allRegs.keys()]) {
      /* ★ 2026-10-20（用户拍板）：禁写寄存器一律不写（43/48/52/58/63/67/73/78/82） */
      if (!isWritableAddr(addr) || FORBIDDEN_REGS.has(addr)) allRegs.delete(addr);
      /* ★★ v3.70：260 是硬件 mute，不属于音色。导出的 A1/A2/A3 存档里都带着它
         （那三格是在静音状态保存的）→ 切过去会把硬件静音掉。存档一律不留。 */
      else if (addr === 260) allRegs.delete(addr);
    }
    /* ★ 2026-10-20（C5）：9 条开关位以 modules（UI 快照优先）为权威补齐，与上传路径同一口径 */
    for (const [a, v] of Object.entries(switchPlan(modules))) allRegs.set(Number(a), v);
    const registers: Record<number, number> = {};
    for (const [addr, val] of allRegs) registers[addr] = val;
    const knobValues: Record<string, Record<string, number>> = {};
    for (const mid of Object.keys(MODULE_PARAM_MAP)) {
      const vals = registerStore.getModuleKnobValues(mid, subModels[mid]);
      if (Object.keys(vals).length > 0) knobValues[mid] = vals;
    }
    /* ★★ v3.88（用户 2026-10-27「ED 开头的激励器参数可以直接保存到本地库」）：
       激励走 PGA（`ED 00 30 14 xx`），**没有寄存器**（reg = 'PGA' 哨兵），
       所以它永远不会出现在 registers 里，只能靠 knobValues 这一条路保存。

       旧实现只从 `userKnobValuesRef` 取，而那个 ref **只在「载入音色」时被写过**
       （applyLoadedTone 的 4. Boost PGA 还原）——
       用户在首页把激励拧到第 N 档时根本不更新它。后果是：
         · 从没载入过音色 → 保存出来的音色**没有 boost** → 切回去 writePGA(0)，激励归零；
         · 载入过音色 → 存的是**上一首**的档位，与当时听到的完全不是一个音色。
       现在改为以 **UI 实时档位**（`ui.values['boost']['-1']`，0…10 档）为第一来源，
       ref 仅作兜底（首页尚未登记快照的极端情况）。 */
    const boostLv = ui.values['boost']?.['-1'];
    const boostVal = typeof boostLv === 'number' && Number.isFinite(boostLv)
      ? Math.max(0, Math.min(10, Math.round(boostLv))) / 10
      : userKnobValuesRef.current['boost']?.['BOOST'];
    if (boostVal !== undefined) knobValues['boost'] = { BOOST: boostVal };
    return {
      slot: 0, name: 'community', playMode,
      modules, subModels, knobValues, registers,
      io: { inputVol, outputVol, inputMute, outputMute }, savedAt: Date.now(),
    };
  };



  /**
   * A1 (2026-09-22) 频道切换的本地侧动作 (供替换槽位/整组替换复用)
   * 只发 EE <ch> + UI/寄存器镜像跟随本地库快照; 不推送任何 EA 寄存器
   */


  // ── 预设音色组合包: 单音色替换槽位 / 整组替换 ───────────────────────────


  /* ★ v3.66（用户拍板 C3）：社区的「存入本地库」**只写本地库 16 格**，不碰硬件 ——
     不切频道、不发 EA/EB。想让硬件也跟着变，由用户在本地库里自己按上传。
     （旧路径 handleReplaceSlot 会 syncChannelToHardware + 切频道，属于「替换频道」的语义，不能复用） */
  const handleCommunityStoreToBank = (data: LocalPreset, slot: number, name: string) => {
    /* ★★ 2026-10-26（审查 P1-10）：社区音色进本地库前必须过同一套净化。
       此前"净化"只接在**文件导入/导出**两端（presetFile / presetExport），
       社区 → 本地库 → 下发这条最需要它的链路完全裸奔：只过 stripForbidden（9 个地址，
       无白名单、无值域）→ 云端一条含 `999: x` 或 `261: 4294967295` 的音色
       会被原样存盘、并在切换时真发给硬件（261 越界 = 总音量瞬间归零/爆音）。
       净化统计只记不弹，避免用户每天看到一条提示。 */
    const cleanRegs = sanitizeRegisters(data.registers ?? {});
    saveBankSlot(slot, name, { ...data, registers: cleanRegs, slot, name, savedAt: Date.now() });
    notifyOk(t('community.storedToBank', { slot }));
  };

  /* ★ 2026-11-04（用户拍板）：社区**整组音色包**一次写入我的音色库 4 格。
     仍然只写本机、不碰硬件；写完重建切换包，之后由用户走「整组上传」。
     每格同样过 sanitizeRegisters（社区来的一律不信任）。 */
  const handleCommunityStoreGroupToBank = (tones: LocalPreset[], startSlot: number) => {
    let ok = 0;
    tones.slice(0, 4).forEach((tone, k) => {
      const slot = startSlot + k;
      const cleanRegs = sanitizeRegisters(tone.registers ?? {});
      const name = tone.name || `音色 ${slot}`;
      if (saveBankSlot(slot, name, { ...tone, registers: cleanRegs, slot, name, savedAt: Date.now() })) ok++;
    });
    if (ok) rebuildPacks();
    notifyOk(ok === 4
      ? `整组已存入${LOCAL_BANK_ZH} ${startSlot}–${startSlot + 3}`
      : `整组存入：${ok}/4 格成功`, ok === 4 ? undefined : 3200);
  };


  /* ★★ v3.77（P5）：**删掉「寄存器表 500ms 防抖写盘」**
   *
   * 旧实现订阅 registerStore，每次参数变化就 debounce 500ms 把
   * `bfx_registers` / `bfx_hiddenRegs` / `bfx_knobValues` 整表 JSON.stringify 写进
   * localStorage。而这三个键在 v3.77 之前的全工程**唯一读取方**是
   * `restoreAllSavedState()` —— 它早就没有任何调用点，本轮已按死代码删除。
   * 也就是说：这些写盘没有读者，纯粹是主线程上的无用序列化（拖完旋钮停手那一下
   * 会卡一帧，且 visibilitychange / pause 两个监听也白挂着）。
   *
   * 保留**唯一的写盘点**在 `handleExit`（退出时一次，1 次/会话，代价可忽略），
   * 将来若要做「冷启动恢复上一次参数」，从那里接回去即可，不必再恢复这条热路径。 */

  // Disconnect BLE on startup to clear any stale connection
  useEffect(() => { bleManager.disconnect().catch(() => {}); }, []);

  const handleExit = () => {
    setShowExitDialog(false);
    // Save state + disconnect BLE + exit
    const all = registerStore.collectAll();
    const regObj: Record<number, number> = {};
    for (const [k, v] of all) regObj[k] = v;
    localStorage.setItem('bfx_registers', JSON.stringify(regObj));
    localStorage.setItem('bfx_hiddenRegs', JSON.stringify(Object.fromEntries(registerStore.getAllHidden())));
    bleManager.disconnect().catch(() => {});
    import('@capacitor/app').then(({ App }) => App.exitApp()).catch(() => {
      (navigator as any).app?.exitApp?.();
    });
  };


  const [, setLoadedKnobValues] = useState<Record<string, Record<string, number>>>({});
  const [fullScreenPdf, setFullScreenPdf] = useState<{ name: string; file: string } | null>(null);

  // Active panel state
  const [activePanel, setActivePanel] = useState<null | 'studio' | 'bluetooth' | 'presets' | 'user' | 'library' | 'community'>(null);
  /* ★ v3.66：社区里点「登录」→ 打开账号页；登录成功后关掉账号页要自动回到社区，
     否则用户得自己再点一次底栏，会被误以为「登录了但社区还是打不开」。 */
  const pendingCommunityRef = useRef(false);
  /* ★★ v3.76（E10）：社区「未连接」门 → 点「连接设备」跳到蓝牙页。
     旧实现连上后**停在蓝牙页**，用户得自己再点一次底栏回社区，
     与「登录后自动回社区」的体验不一致。这里同样记一个待返回标记。 */
  const pendingCommunityConnectRef = useRef(false);
  /* ★ 2026-10-24（用户要求）：顶栏右侧加头像入口 → 账号中心（UserPanel）。
     头像显示账号名首字母；面板开/关时重读，登录 / 登出后立刻反映。 */
  const [accountName, setAccountName] = useState<string>(() => readAccountName());
  useEffect(() => { setAccountName(readAccountName()); }, [activePanel]);
  /* ★ 2026-10-24（用户拍板）：「试用」= 一次参数调节。
     社区音色发完整 EA 全表写进当前频道 RAM，首页 UI 与隐藏参数跟随；
     **不保存就不影响已保存参数** —— 本地库槽位与硬件频道表都不动，
     切频道（EE 让硬件按表重载）或重开 App 即回到存档值。浮条只做提示 + 快捷入口。 */
  const [trialTone, setTrialTone] = useState<string | null>(null);
  /* 切频道 = 硬件按频道表重载，试用状态自然结束 → 浮条一并收掉 */
  useEffect(() => { setTrialTone(null); }, [activeSlot]);
  /* ★ v3.52：预设库底部「节拍器」键 → 打开工作室并落到 metro tab。
     用递增序号做「一次性」语义（StudioPanel 常驻挂载，不能只看 visible）。 */
  /* ★ v3.60（2026-10-24 用户拍板）：调音器 / 节拍器各自独立页面 ——
     进 studio 时用 onlyTab 指定要显示哪一块，页面里不再出现 6 个 tab 菜单。 */
  const [studioOnly, setStudioOnly] = useState<'tuner' | 'metro' | null>(null);
  /* ★ WO-17：本地预设「已加载」状态（底栏 tab 状态点） */
  const [bankApplied, setBankApplied] = useState<boolean>(() => getLocalBankApplied() !== null);
  useEffect(() => {
    if (activePanel !== 'library') setBankApplied(getLocalBankApplied() !== null);
  }, [activePanel]);
  activePanelRef.current = activePanel;

  const [ioOpen] = useState(false);  // IO bar collapse toggle (默认隐藏, 避免影响视觉空间)

  // ─── 开机教程 ───
  /* ★★★ 2026-11-03（方案 A）：上传回读校验的"不一致明细"。null = 不显示。
     条数不多（正常 0 条），只在真的对不上时弹，用来告诉用户具体是哪几个寄存器。 */
  const [verifyIssues, setVerifyIssues] = useState<Array<{ slot: number; readFailed: boolean; diff: RegDiff[] }> | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourActive, setTourActive] = useState(0);
  /* ★★★ 2026-11-02（用户要求）：软件教程结束后接一段「硬件按键教程」，首次连接时自动弹、可跳过。
   *   tutorial=true 表示首次引导（带进度与跳过）；从用户面板重看时 tutorial=false。 */
  const [hwGuideOpen, setHwGuideOpen] = useState(false);
  const [hwGuideTutorial, setHwGuideTutorial] = useState(false);
  /* ★ 2026-10-17（用户要求）：连上蓝牙后先播「闪烁 → 常亮」的连接成功画面，
     停留 2 秒左右，再进入首页或教程。 */
  /* ★★ v3.68（F）：全屏连接层现在是两段 —— 'connecting'（点下按钮立刻出）→ 'connected'（成功后 2.1s） */
  const [connFlash, setConnFlash] = useState<{ name?: string; phase: 'connecting' | 'connected' } | null>(null);
  /* 是否已看过教程 —— 顶栏「?」入口用它决定要不要亮未读小点 */
  const [tourSeen, setTourSeen] = useState(() => {
    try { return localStorage.getItem('bfx_tour_done') === '1'; } catch { return false; }
  });

  /* ★★★ v4.29（用户拍板下线）：旧的「屏幕中部 18px 橙字」旋钮浮层已删除。
     它和 ui3 的 `.t3k-bubble` 干的是同一件事，却是两套完全不同的样式
     （一个 12px 圆角橙字、一个 8px 圆角深底带标签），同一个 App 出现两种"旋钮数值"。
     现在统一走全局浮层（顶栏下方居中，与旋钮浮框同款皮肤），文案与停留时长保持原样。 */
  const handleKnobDisplay = useCallback((text: string | null) => {
    if (!text) return;
    notifyInfo(text, { duration: 1500 });
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const scrollSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    // 左右翻页: 交给原生 scroll-snap + 惯性 (手感与上下滚动一致), 不再劫持 touch;
    // 滚动完全停止后 (防抖) 再更新 activeModuleIdx, 避免拖动/惯性期间整页重渲染晃动
    const handleScroll = () => {
      if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current);
      scrollSettleTimer.current = setTimeout(() => {
        const { scrollLeft, clientWidth } = container;
        if (clientWidth === 0) return;
        const idx = Math.round(scrollLeft / clientWidth);
        if (idx >= 0 && idx < MODULES.length) setActiveModuleIdx(idx);
      }, 120);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current);
    };
  }, []);

  useEffect(() => {
    if (tabScrollRef.current && tabScrollRef.current.scrollWidth > tabScrollRef.current.clientWidth) {
      const el = tabScrollRef.current.children[activeModuleIdx] as HTMLElement;
      if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeModuleIdx]);

  const handleTabClick = (idx: number) => {
    setActiveModuleIdx(idx);
    const c = scrollContainerRef.current;
    if (c) c.scrollTo({ left: idx * c.clientWidth, behavior: 'smooth' });
  };

  // ─── 教程: 本地化步骤 + 动作 + 开关 ───
  const tourSteps = useMemo<TourStep[]>(() => {
    const l = lang === 'en' ? 'en' : 'zh';
    return TOUR_STEP_DEFS.map((d) => ({
      target: d.target,
      placement: d.placement,
      action: d.action,
      lang: d.lang,
      title: d[l].title,
      body: d[l].body,
    }));
  }, [lang]);

  const handleTourAction = useCallback((action: string) => {
    if (action === 'goto-overdrive') {
      const idx = MODULES.findIndex((m) => m.id === 'overdrive');
      if (idx >= 0) handleTabClick(idx);
    }
  }, []);

  const openTutorial = useCallback(() => {
    setActivePanel(null);
    setTourActive(0);
    setTourOpen(true);
  }, []);

  const closeTutorial = useCallback(() => {
    try { localStorage.setItem('bfx_tour_done', '1'); } catch { /* ignore */ }
    setTourSeen(true);
    setTourOpen(false);
    setTourActive(0);
    /* ★★★ 2026-11-02（用户要求「软件教程完毕，做一个硬件首次连接的教程提示」）：
     *   软件教程关掉之后紧接着弹硬件按键教程 —— 此刻设备刚连上，正好对上"首次连接"。
     *   只看一次（bfx_hw_tour_done），跳过也算看过；之后可从 用户 → 设备按键教程 重看。 */
    try {
      if (localStorage.getItem('bfx_hw_tour_done') !== '1') {
        setHwGuideTutorial(true);
        setHwGuideOpen(true);
      }
    } catch { /* 隐私模式：不弹，不影响使用 */ }
  }, []);

  const closeHwGuide = useCallback(() => {
    setHwGuideOpen(false);
    setHwGuideTutorial(false);
    try { localStorage.setItem('bfx_hw_tour_done', '1'); } catch { /* ignore */ }
  }, []);

  /* ★ 2026-10-26：返回键 → 先关教程（教程是 z500 的根级浮层，排在返回键优先级第一位）。
     Android 实体返回键在 Index 的 onBack 里派发这个事件，避免跨组件耦合。 */
  useEffect(() => {
    const h = () => closeTutorial();
    window.addEventListener('bfx-tour-close-req', h);
    return () => window.removeEventListener('bfx-tour-close-req', h);
  }, [closeTutorial]);

  /* ★ 2026-10-26：把三个根级浮层的状态同步给 onBack 用的 ref（避免闭包读到旧值） */
  useEffect(() => { tourRef.current = tourOpen; }, [tourOpen]);
  useEffect(() => { hwGuideRef.current = hwGuideOpen; }, [hwGuideOpen]);
  useEffect(() => { debugRef.current = debugMode; }, [debugMode]);
  useEffect(() => { pdfRef.current = fullScreenPdf; }, [fullScreenPdf]);

  // ★ 2026-10-17（用户要求）：教程不再一进 App 就弹，改成**首次连上蓝牙后**自动弹出。
  //   顺序现在是：连上 → 连接成功动画（闪烁→常亮 2.1s）→ 关面板 → 教程 / 首页。
  //   只自动弹一次（关闭时写 bfx_tour_done），之后从顶栏「?」或 用户→说明书 重看。
  const tourAutoFiredRef = useRef(false);
  const prevConnRef = useRef(false);
  /* ★ v3.80（P1-13）：「正在连接」被用户主动取消 → 若设备其实连上了，别再弹成功画面。
     每次重新发起连接（handleBleConnecting）时复位，所以只抑制「被取消的这一轮」。 */
  const connCancelledRef = useRef(false);
  /* ★★ v3.81（P2-17①）：区分「用户点了连接」与「后台自动重连」。
     自动重连（锁屏唤醒 / 断线恢复）也走 btConnected 上升沿，旧实现会弹 2.1s 全屏，
     结束后 `setActivePanel(null)` 把用户从他正在看的页面踢回首页，浏览位置全丢。 */
  const userConnectRef = useRef(false);

  // 蓝牙 false → true：拉起连接成功画面
  useEffect(() => {
    const was = prevConnRef.current;
    prevConnRef.current = btConnected;
    if (!btConnected || was) return;
    const userInitiated = userConnectRef.current;
    userConnectRef.current = false;
    if (connCancelledRef.current) { connCancelledRef.current = false; return; }
    if (!userInitiated) return;      // 自动重连：静默，不改面板、不弹全屏
    let name = '';
    try { name = bleManager.deviceName || ''; } catch { /* ignore */ }
    setConnFlash({ name, phase: 'connected' });
  }, [btConnected]);

  /* ★★ v3.68（F/G）：点下「连接」→ 立刻出「正在连接」；连不上 → 收掉。
     另外在启动后空闲时预热 BLE 插件（动态 import + 原生 bridge 初始化），
     把首连的冷启动成本从"用户点按钮那一刻"挪到"App 刚起来那会儿"。 */
  const handleBleConnecting = useCallback((name?: string) => {
    connCancelledRef.current = false;
    userConnectRef.current = true;      // ★ v3.81（P2-17①）：标记为用户主动连接
    setConnFlash({ name, phase: 'connecting' });
  }, []);
  /* ★ v3.80（P1-13）：取消 / 超时关闭。必须真的断一次 —— 否则后台 GATT 仍在重试，
     用户会看到「明明关掉了却又自己连上」。断开失败不影响界面收口。 */
  const handleConnCancel = useCallback(() => {
    connCancelledRef.current = true;
    pendingCommunityConnectRef.current = false;
    setConnFlash(null);
    try { void bleManager.disconnect().catch(() => { /* 未连上时断开必然抛错，忽略 */ }); } catch { /* ignore */ }
  }, []);
  const handleBleConnectFail = useCallback(() => {
    /* ★★ v3.76（E10）：连不上就作废「连上后回社区」的待办，避免下次从首页连接时莫名跳社区 */
    pendingCommunityConnectRef.current = false;
    setConnFlash(null);
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => { void warmupBle(); }, 1200);
    return () => window.clearTimeout(id);
  }, []);

  // 连接成功画面播完 → 关蓝牙面板 → （没看过教程就）弹教程
  const handleConnFlashDone = useCallback(() => {
    setConnFlash(null);
    /* ★★ v3.76（E10）：从社区「未连接」门点进来的 → 播完连接成功画面后回社区，
       与「登录后自动回社区」同一口径。其它入口照旧回首页。 */
    const backToCommunity = pendingCommunityConnectRef.current;
    pendingCommunityConnectRef.current = false;
    setActivePanel(backToCommunity ? 'community' : null);
    let done = false;
    try { done = localStorage.getItem('bfx_tour_done') === '1'; } catch { /* ignore */ }
    if (!done && !tourAutoFiredRef.current) {
      tourAutoFiredRef.current = true;
      setTourActive(0);
      setTourOpen(true);
    }
  }, []);

  /**
   * ★ 2026-10-15（v5 定案）：踩钉统一走「整段 BYPASS」
   *   · 只写该模块的【模块级旁路位】(MODULE_ON_OFF)，不再做任何参数复位
   *   · 旧「整组复位 + 复位前缓存」整体删除 —— 参数从不被改写，无需缓存
   *   · 箱头 / 箱体已移出开关表 → 常开，不参与踩钉
   *   · BOOST 走 PGA（无寄存器），旁路 = 归零
   *   · 写后延时：42 → 50 ms，其余 → 20 ms
   */
  /** ★ 2026-10-20：混响开关改回 reg 224 后，开启时若 MIX(229) 还是 0 就补一个默认值，
   *  否则「开关打开了但听不到混响」。预设里带了 MIX 的情况不受影响（MIX>0 直接返回）。 */
  const ensureReverbMix = useCallback(() => {
    const cur = registerStore.get(229) ?? regCacheRef.current[229] ?? 0;
    if (cur > 0) return;
    const d = REVERB_ON_DEFAULTS[229] ?? 20;
    registerStore.set(229, d);
    regCacheRef.current[229] = d;
    bleManager.writeRegister(229, d, 0xEA).catch(() => {});
    setDebugRegTick(t => t + 1);
  }, []);

  // ─── Debug panel callbacks ────────────────────────────────────────────
  const addDebugLog = useCallback((reg: number, val: number) => {
    const now = new Date();
    const ts = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    setDebugLogEntries(prev => [...prev.slice(-499), { time: ts, reg, val }]);
  }, []);

  const handleDebugWrite = useCallback((reg: number, val: number) => {
    addDebugLog(reg, val);
    registerStore.set(reg, val);
    regCacheRef.current[reg] = val;
    bleManager.writeRegister(reg, val, 0xea).catch(() => {});
    // ★ 2026-10-12: 调试面板的写入必须同步回新 UI 显示，
    //   否则 TonePage 旋钮位置与实际寄存器值不一致（软硬件显示分叉）。
    const mod = reg <= 3 ? 'noise-gate'
      : reg <= 41 ? 'compressor'
      : (reg <= 98 || reg === 239) ? 'amp-head'
      : (reg <= 142 || (reg >= 253 && reg <= 259)) ? 'cabinet'
      : reg <= 220 ? 'chorus'
      : reg <= 223 ? 'delay'
      : reg <= 229 ? 'reverb'
      : null;
    if (mod) setExtSync({ tick: Date.now(), module: mod, addr: reg, value: val });
  }, [addDebugLog]);

  const handleDebugApplyModule = useCallback(async (_modId: string, values: Record<number, number>) => {
    if (!bleManager.connected) return;
    const entries = Object.entries(values)
      .filter(([a]) => Number(a) > 0)
      .map(([a, v]) => ({ regAddr: Number(a), value: v }));
    await bleManager.writeRegistersBatch(entries, REG_WRITE_MS);
    for (const [a, v] of Object.entries(values)) {
      const addr = Number(a);
      if (addr > 0) {
        registerStore.set(addr, v);
        regCacheRef.current[addr] = v;
        addDebugLog(addr, v);
      }
    }
    setDebugRegTick(t => t + 1);
  }, [addDebugLog]);

  // D7 (2026-09-22) 死代码清理: handleHardwareSave / syncToHardware 已删除
  //   · handleHardwareSave — 无任何 UI 挂载 (DebugPanel 的 onSavePreset prop 从未传入)
  //   · syncToHardware    — 无任何调用者
  //   写硬件的唯一入口 = 预设库「上传」按键 (EB 存本地)

  /**
   * A8 一致性保障 (2026-09-22): 把某频道的寄存器参数用 EB 写入硬件
   * 目的: A1 之后切台只发 EE XX, 硬件按"本频道已上传数据"重建;
   *       故本地库任何写入都必须同步到硬件, 否则软硬件参数不一致。
   */
  const syncChannelToHardware = useCallback(async (
    slot: number, registers: Record<number, number>, boost?: number, flashGroup = false,
    modules?: Record<string, boolean>,
    /* ★ 2026-11-04（用户拍板「减少非必要步骤」）：整组上传时只对第 1 格做全表回读校验，
       后 3 格跳过回读（EB 写失败仍会中止；省掉 3 次整表 EF 往返）。 */
    verify = true,
  ): Promise<{ ok: boolean; diff: RegDiff[]; readFailed: boolean }> => {
    const FAIL = { ok: false, diff: [] as RegDiff[], readFailed: false };
    if (!bleManager.connected) { markChannelDirty(slot); return FAIL; }
    /* ★ 2026-11-02：**260（DSP 输出静音）永不上传** —— 静音是运行时状态，不属于音色。
     *   老本地库存档里可能还带着 260（早期版本把它当音色参数存过），这里统一剔掉；
     *   261（总音量）保留，用户要求"每档记自己的音量"并能上传到硬件。 */
    if (registers[260] !== undefined) {
      const copy = { ...registers };
      delete copy[260];
      registers = copy;
    }
    /* ★★ v3.75（结构性收口）：排序口径全 App 只留 orderBypassSplit ——
       关（目标=1）前置 / 数据居中 / 开（目标=0）后置，末两位 72 → 107。
       旧的 orderAddrsBypassLast「旁路一律最后」在 A4→A1 这类全旁路目标上
       会先改参数、后关箱头 = v3.74 想消灭的噪音又回来。 */
    /* ★★★ 2026-11-03（用户要求「上传时用 EA 参数」）：
     *   上传的表改成 **EA 口径** —— 与本地试听（EA 路径）**同一套地址集、同一套值**。
     *
     *   为什么不再用「1a 基线垫底补满 116 条」：
     *     EA 路径只写**存档里真实存在**的那些参数（Twin 净声 = 105 条），
     *     而垫底版是 116 条 —— 多出的 11 条是 1a（线材直通）的值，
     *     与本地试听**根本不是同一套数据**。既然要"上传 = EA"，这里必须对齐。
     *   固件侧 `tone_build_full()` 会把整张 117 条表都下发（含表里没写的那些，
     *   它们在 E8 之后是 1a 基线），而 DSP 里那些地址在 EA 路径下**根本没被写过**
     *   ⇒ 两边天然一致。
     *
     *   合成逻辑在 services/toneUpload.ts —— 上传与"回读校验"必须用**同一份**表，
     *   否则比对基准会漂（"按 EA 值核准"）。 */
    const uploadFull = buildUploadTable(registers, slot, boost, modules);
    const sorted = orderBypassSplit(Object.keys(uploadFull).map(Number), (a) => a, (a) => uploadFull[a]);
    /* ★★ v3.56（2026-10-23）：写失败必须中止并保留「未同步」标记。
       旧版 `writeRegister(...).catch(() => {})` 吞掉了失败 —— 而 writeRegister 失败时
       返回的是 false（不是抛异常），于是「半张表写进去」也会走到 markChannelClean，
       App 以为已同步、硬件却是残缺表，切档时就是音色错乱。 */
    /* ★★S2c：上传 = 三表事务，一次性覆盖设备该频道
     *   ① E8 清全量（设备侧回到出厂默认，避免"少传的部分变 0"）
     *   ② EB <ch> 逐条写（只改设备 RAM，不写 DSP、不写 flash）
     *   ③ E9 提交（落盘一次 + 设备按 16 张全量表重算快切 + 回 EF 03）
     * 快切表由设备在提交时重算，App 不必上传；要手工定制时再发 EB typ=1/2。 */
    if (!(await bleManager.clearToneTable(slot, 0))) {
      notifyDebug(`E8 清表失败 ch=${slot}`);
      markChannelDirty(slot);
      return FAIL;
    }
    /* ★★★ 2026-11-19（用户报障「安卓恢复出厂 30 秒+，iOS 只要 8-9 秒」）：
       原来是逐帧写 —— 一帧一次 GATT 往返。
         · iOS：CoreBluetooth 发出即返回，每帧只花 EB_WRITE_MS(5ms) → 1872 帧 ≈ 9 秒
         · Android：每帧要等 onCharacteristicWrite（连接间隔 12~15ms）→ ≈ 30 秒+
       改为「一包多帧」（固件已确认支持），Android 往返次数降到 1/15，预计 30s → 11s。
       批量不可用（WebBLE / MTU 未协商 / 中途失败）时自动回退逐帧，
       并从 batch.sent 处继续，已成功的不重复写。 */
    const ebList = sorted.map((addr) => ({ addr, value: uploadFull[addr] }));
    const batch = await bleManager.writeToneEBBatch(slot, 0, ebList);
    let ebSent = batch.sent;
    if (!batch.ok) {
      for (let i = batch.sent; i < ebList.length; i++) {
        const { addr, value } = ebList[i];
        let ok = await bleManager.writeToneEB(slot, 0, addr, value).catch(() => false);
        if (!ok) {
          await new Promise(r => setTimeout(r, 40));           // GATT 拥塞重试一次
          ok = await bleManager.writeToneEB(slot, 0, addr, value).catch(() => false);
        }
        if (!ok) {
          notifyDebug(`EB 写失败 ch=${slot} addr=${addr}（已发 ${ebSent}/${ebList.length}）`);
          markChannelDirty(slot);
          return FAIL;
        }
        ebSent++;
        await new Promise(r => setTimeout(r, EB_WRITE_MS));
      }
    }
    /* ★★★ 2026-10-31（用户报障「UI 音色和固件音色不一致，特别是激励器」）：
     *   激励器（BOOST）不在 117 条寄存器里 —— 它是 ES8311 的模拟输入 PGA（Reg0x14），
     *   只能走 I2C。以前上传**不带这一帧**，硬件该频道保留的是固件出厂表里的旧 pga，
     *   于是同一个频道「App 显示 9 dB、硬件是 18 dB」。
     *   现在跟 117 条参数进同一个事务：E8 清 → EB 逐条 → **EB PGA(typ=3)** → E9 提交，
     *   固件把 pga 存在频道槽位里，切档时由 es8311_set_pga_gain() 写入。
     *   值口径与 App 的 writePGA 完全一致：0x10 + round(boost×10)。
     *   ★★★ 2026-11-03：**补上 modules.boost 门控** —— EA（本地试听）路径是
     *   `boostOn ? round(bv*10) : 0`，即 boost 模块关时写 0 dB；
     *   旧上传口径不看模块开关 ⇒ boost 关但旋钮有值时固件会比本地试听多 3~30 dB
     *   的激励。这是两边口径不一致的**真实听感差**，本版统一。 */
    {
      const pga = pgaValueForUpload(boost, modules);
      let ok = await bleManager.writeToneEB(slot, 3, 0, pga).catch(() => false);
      if (!ok) {
        await new Promise(r => setTimeout(r, 40));
        ok = await bleManager.writeToneEB(slot, 3, 0, pga).catch(() => false);
      }
      if (!ok) { markChannelDirty(slot); return FAIL; }
      await new Promise(r => setTimeout(r, EB_WRITE_MS));
    }
    /* ★★★ 2026-11-03（用户拍板）：**提交只发不等**，回执改由设备闪灯表达。
     *   · 单频道上传 → 该频道灯闪 5 秒；整组上传 → 该组 4 灯一起闪 5 秒
     *   · 落盘失败 → 红色快闪 3 秒（设备自己说真话，比 BLE 回传可靠）
     *   因此这里**不再弹"写入失败（组内一致性未完成）"** —— 那条提示的根因是
     *   回执通知在连发上百帧 EB 之后必然拥塞，属于误报，用户已要求去掉。
     *   真正的写失败（E8/EB 的 GATT 写失败）仍会返回 false 并提示。 */
    if (!(await bleManager.sendCommit(slot, flashGroup ? 1 : 0))) {
      notifyDebug(`E9 提交帧发送失败 ch=${slot}`);
      markChannelDirty(slot);
      return FAIL;
    }
    /* ★★★ 2026-11-16（用户拍板）：253（限幅旁路）与组号绑定 —— **1 组=1，其余组=0**。
       它不在固件 117 条表里（EB 上传带不上），所以表写完后补一帧 EA 到 live DSP，
       保证「上传完听到的」与目标组的限幅状态一致。 */
    await bleManager.writeRegister(253, slot <= 4 ? 1 : 0, 0xEA).catch(() => {});
    /* ★ 2026-11-03：频道表变了 ⇒ App 手里"硬件当前值"的镜像不再可信
     *   （DSP 还没重下发，但目标数据已经变了）。清掉镜像并让下一次切档走全量，
     *   否则"值相同就跳过"会把 215 这类开关位漏发（D4 出厂就是合唱开）。 */
    registerStore.clear();
    resetSwitchShadow();
    forceFullNextRef.current = true;
    markChannelClean(slot);

    /* ★ 2026-11-04：整组上传后 3 格不做回读（见入口注释），直接按成功返回。 */
    if (!verify) return { ok: true, diff: [], readFailed: false };

    /* ══════════════════════════════════════════════════════════════════
     * ★★★ 2026-11-03（用户拍板 · 方案 A）：**上传闭环校验**
     *
     *   为什么必须做：EB 是 writeWithoutResponse 语义，`ok=true` 只代表协议栈
     *   接受了这一包，**不代表设备收到并写进表里**；固件侧 `tone_set_full` 对表外
     *   地址也是静默拒收。所以"少了一些参数"只能靠回读证明。
     *
     *   流程：回读整表 → 与 buildUploadTable() 的 116 条逐条比 → 有差异就只重发
     *   那几条 + 重新 E9 落盘 → 再读一次；最多 2 轮。仍有差异就原样带回给调用方，
     *   由 UI 弹框列出**具体地址和两边的值**。
     * ══════════════════════════════════════════════════════════════════ */
    let vDiff: RegDiff[] = [];
    let vReadFail = false;
    {
      const hw = await bleManager.readToneTable(slot, 3000);
      if (!hw) {
        vReadFail = true;
        notifyDebug(`校验回读失败 ch=${slot}（设备无应答）`);
      } else {
        vDiff = diffTable(uploadFull, hw);
      }
      for (let round = 0; round < 2 && !vReadFail && vDiff.length; round++) {
        notifyDebug(`校验不一致 ch=${slot}: ${vDiff.length} 条，重发第 ${round + 1} 轮`);
        for (const d of vDiff) {
          let ok2 = await bleManager.writeToneEB(slot, 0, d.addr, d.app).catch(() => false);
          if (!ok2) {
            await new Promise(r => setTimeout(r, 40));
            ok2 = await bleManager.writeToneEB(slot, 0, d.addr, d.app).catch(() => false);
          }
          await new Promise(r => setTimeout(r, EB_WRITE_MS));
        }
        await bleManager.sendCommit(slot, flashGroup ? 1 : 0);
        const hw2 = await bleManager.readToneTable(slot, 3000);
        if (!hw2) { vReadFail = true; break; }
        vDiff = diffTable(uploadFull, hw2);
      }
    }
    /* ★★★ 2026-11-04（用户拍板）：**上传不再直写 DSP，也不再发 0xE6 接管**。
     *
     *   旧流程在上传后逐格用 EA 把参数写进 DSP、再让固件"这一格别下发"。
     *   EA 是全局 DSP 状态，整组 4 格逐个写只会留下最后一格的内容，
     *   但 4 格都被标记成"已就位" ⇒ 上传后切哪一格都没变化（听起来都是最后一格），
     *   重启后标记消失、固件按表下发 ⇒ 用户感觉"重启后切档声音变化很大"。
     *
     *   现在：上传只写固件表（E8/EB/PGA/E9），切档由固件按频道表 + 关键帧位图
     *   统一下发；上传后的第一次切换走全量（内容代次不一致），之后同组相邻走快切。
     *   `forceFullNextRef` 已经在下面置位，保证 App 侧下一次切换也按全量算。 */
    /* 校验没通过 → 这一格仍算"未同步"，黄点保留，提示用户重传 */
    if (vDiff.length || vReadFail) markChannelDirty(slot);
    return { ok: true, diff: vDiff, readFailed: vReadFail };
  }, []);


  /**
   * ★★ 2026-10-22（v3.50）：本地库某一格 → 覆盖预设库同槽 + EB 落盘。
   *   本地库是草稿箱，只有这个动作会动硬件；槽位一一对应，不跨槽。
   */
  /* ★★ v3.63（K5）：`handleSyncAllDirty()`（把未同步频道批量 EB 写入硬件）已删除。
     它是 v3.54 组首底图方案的配套入口，按钮在 v3.60 移除后成为死代码；
     按「预设库不写硬件」的拍板，一并清掉，避免被误接线。
     `handleBleConnect` 里那条「硬件频道表为旧版，请点写入硬件」的提示同样删除 ——
     它指向的按钮已不存在，留着只会误导用户。 */

  /* ★ 2026-10-30：FX 不一致提示的延迟定时器（连续上传时只保留最后一条） */
  const fxNoticeTimer = useRef<number | null>(null);

  /* ★★★ 2026-11-03（用户拍板）：**只允许整组上传**。
   *
   *   为什么砍掉单频道上传：固件切档时若同组内箱头/箱体型号不同，会重建整个
   *   箱头模型 + 箱体 PEQ（9 个旁路位 × 500ms 窗口），组内快切直接失效。
   *   单格写入必然制造"组内混杂"，所以从根上只留整组。
   *
   *   闸门（任一不满足，一帧都不发）：
   *     ① 4 格都有音色（空槽不再"跳过"—— 跳过会让目标格保留旧型号）
   *     ② 4 格都有箱头/箱体型号 —— **或**整组 4 格都是线材直通（两者都旁路）
   *     ③ 4 格型号一致（参数可以不同）
   *   `_mode` 仅为兼容旧调用点保留，实际一律按整组执行。
   *   ★ 2026-11-16：目标不再排除 A 组（1–4），且新增「四组上传」一次覆盖 1a–4d。 */
  /** 把本地库某一组（4 格）写进硬件某组 —— 只搬运数据，不弹提示、不管 busy 遮罩 */
  const writeLocalGroupToHardware = useCallback(async (
    srcStart: number,
    dstStart: number,
  ): Promise<{
    ok: boolean; done: number; failSlot: number;
    issues: Array<{ slot: number; readFailed: boolean; diff: RegDiff[] }>;
  }> => {
    const issues: Array<{ slot: number; readFailed: boolean; diff: RegDiff[] }> = [];
    let done = 0;
    for (let k = 0; k < 4; k++) {
      const src = srcStart + k;
      const dst = dstStart + k;
      const item = getBankSlot(src);
      if (!item?.data) return { ok: false, done, failSlot: dst, issues };
      const res = await syncChannelToHardware(
        dst,
        withSwitchPlan(item.data.registers ?? {}, item.data.modules as Record<string, boolean> | undefined),
        /* ★ 激励器：该格存档里的 boost 归一值（0~1）→ 硬件的 0…10 档 */
        (item.data.knobValues as Record<string, Record<string, number>> | undefined)?.['boost']?.['BOOST'],
        /* 整组上传标记（仅失败时设备红闪用；成功已不闪灯） */
        true,
        /* ★★★ 2026-11-03：模块开关 —— 决定 PGA 口径（boost 关 → 0 dB）与 253。 */
        item.data.modules as Record<string, boolean> | undefined,
        /* ★ 2026-11-04：只有整组第 1 格做全表回读校验 */
        k === 0,
      );
      if (!res.ok) return { ok: false, done, failSlot: dst, issues };
      if (res.readFailed || res.diff.length) {
        issues.push({ slot: dst, readFailed: res.readFailed, diff: res.diff });
      }
      done++;
    }
    return { ok: true, done, failSlot: 0, issues };
  }, [syncChannelToHardware]);

  /**
   * 硬件某组 4 格全部写成功后的收尾：模板 + 名字同步到预设库、记已上传指纹、清脏标记。
   * ★ 2026-11-05（用户拍板「上传名字必须跟着我的音色库走」）：必须等硬件 4 格全部成功
   *   才同步 —— 蓝牙失败时两边都不动，避免「App 显示新音色、硬件还是旧声音」。
   */
  const commitLocalGroupToPresets = useCallback((srcStart: number, dstStart: number) => {
    for (let k = 0; k < 4; k++) {
      const item = getBankSlot(srcStart + k);
      if (!item?.data) continue;
      const dst = dstStart + k;
      savePresetLocal({
        ...item.data,
        slot: dst,
        name: item.name,
        nameEn: item.nameEn,
        savedAt: Date.now(),
      });
      /* ★★ v3.62：这是预设库模板**唯一的常规修改入口** → 记一笔，随后的版本播种会跳过它 */
      markPresetUserSlot(dst);
      /* ★ 2026-11-03：4 格各自记一份「已上传指纹」 */
      markBankSlotUploaded(item.slot, withSwitchPlan(
        item.data.registers ?? {},
        item.data.modules as Record<string, boolean> | undefined,
      ));
      /* ★★ v3.62：上传成功 = 硬件频道表已更新 → 清掉「未同步」标记 */
      markChannelClean(dst);
    }
    /* ★★ v3.77（P2）：寄存器已改 → 让「切换延迟角标」重算，并让预设库名字立即刷新 */
    setPresetRev((v) => v + 1);
  }, []);

  const handleUploadLocalToPreset = useCallback(async (
    slot: number, _mode: 'one' | 'group' = 'group', dst?: number,
  ): Promise<boolean> => {
    const item = getBankSlot(slot);
    if (!item?.data) return false;
    if (isBusy()) return false;

    /* ★ 2026-11-16（用户拍板「放开第 1 组的上传限制」）：
       目标频道不再排除 A 组（1–4）—— 第 1 组本身就是线材直通四档，
       它就是要覆盖硬件 1a–1d。 */
    const target = (dst && dst >= 1 && dst <= 16) ? dst : slot;
    const srcStart = Math.floor((slot - 1) / 4) * 4 + 1;
    const dstStart = Math.floor((target - 1) / 4) * 4 + 1;

    const srcItems = [0, 1, 2, 3].map((k) => getBankSlot(srcStart + k));
    const guard = checkGroupModels(srcItems, srcStart);
    if (!guard.ok) {
      notifyErr(groupCheckReason(guard, false), { duration: 3800 });
      return false;
    }

    if (!bleManager.connected) {
      notifyInfo(t('toast.connectBtFirst'), { duration: 3000 });
      return false;
    }
    const gName = `组 ${(dstStart - 1) / 4 + 1}`;   /* 目标组号 1/2/3/4 */
    beginBusy(
      t('switch.loading') || '写入中…',
      `${gName} 整组上传 · 4 格`,
    );
    const r = await writeLocalGroupToHardware(srcStart, dstStart);
    endBusy();
    if (!r.ok) {
      /* ★ 2026-11-03：只有**真的没发出去**（GATT 写失败/断线）才走到这里。
         回执丢失不再判失败 —— 那是设备灯负责表达的事。 */
      notifyErr(`${hwSlotName(r.failSlot)} 蓝牙写入中断，请重试`, { duration: 3200 });
      return false;
    }
    commitLocalGroupToPresets(srcStart, dstStart);
    /* ★ v3.85：这是用户「底部提示一闪而过」的实际来源 —— 给到 3.6s 并保持单一位置。 */
    if (r.issues.length) {
      const total = r.issues.reduce((n, x) => n + x.diff.length, 0);
      setVerifyIssues(r.issues);
      notifyErr(
        r.issues.some((x) => x.readFailed)
          ? `${gName} 已写入，但设备回读无应答，无法校验`
          : `${gName} 有 ${total} 条参数与 App 不一致（已自动重发 2 轮）`,
        { duration: 4200 },
      );
    } else {
      notifyOk(`${gName} 已上传 ${r.done} 格 · 已校验`, { duration: 3600 });
    }
    return true;
  }, [commitLocalGroupToPresets, t, writeLocalGroupToHardware]);

  /**
   * ★★★ 2026-11-16（用户要求）：**四组上传** —— 一键把本地库 16 格整表覆盖硬件 1a–4d。
   *   · 四组先全部过闸门（任一不合格一帧都不发）；
   *   · 逐组写：每组第 1 格做全表回读校验，其余 3 格跳过（省往返）；
   *   · 每写完一组立刻同步预设库模板 / 名字 / 指纹，中途断线也不会留下
   *     「App 已改名、硬件没变」的半成品。
   */
  const handleUploadAllLocalGroups = useCallback(async (): Promise<boolean> => {
    if (isBusy()) return false;
    for (let g = 0; g < 4; g++) {
      const first = g * 4 + 1;
      const items = [0, 1, 2, 3].map((k) => getBankSlot(first + k));
      const guard = checkGroupModels(items, first);
      if (!guard.ok) {
        notifyErr(`第 ${g + 1} 组：${groupCheckReason(guard, false)}`, { duration: 4400 });
        return false;
      }
    }
    if (!bleManager.connected) {
      notifyInfo(t('toast.connectBtFirst'), { duration: 3000 });
      return false;
    }
    beginBusy(
      t('switch.loading') || '写入中…',
      '四组上传 · 共 16 格（1a–4d）',
    );
    let done = 0;
    const issues: Array<{ slot: number; readFailed: boolean; diff: RegDiff[] }> = [];
    for (let g = 0; g < 4; g++) {
      const first = g * 4 + 1;
      const r = await writeLocalGroupToHardware(first, first);
      done += r.done;
      issues.push(...r.issues);
      if (!r.ok) {
        endBusy();
        /* 已写完的组照常落模板；从失败那一格起保持原样（脏标记由 syncChannelToHardware 记） */
        for (let gg = 0; gg < g; gg++) commitLocalGroupToPresets(gg * 4 + 1, gg * 4 + 1);
        notifyErr(
          `${hwSlotName(r.failSlot)} 蓝牙写入中断（已完成 ${done}/16 格），请重试`,
          { duration: 4000 },
        );
        return false;
      }
      commitLocalGroupToPresets(first, first);
    }
    endBusy();
    if (issues.length) {
      const total = issues.reduce((n, x) => n + x.diff.length, 0);
      setVerifyIssues(issues);
      notifyErr(
        issues.some((x) => x.readFailed)
          ? '四组已写入，但设备回读无应答，无法校验'
          : `四组已写入，有 ${total} 条参数与 App 不一致（已自动重发 2 轮）`,
        { duration: 4600 },
      );
    } else {
      notifyOk(`四组已上传 ${done} 格 · 已校验`, { duration: 4000 });
    }
    return true;
  }, [commitLocalGroupToPresets, t, writeLocalGroupToHardware]);

  /**
   * ★★ v4.24（用户拍板）：恢复出厂音色 —— 把冻结的出厂 16 档（1–16）
   *   直接下发到硬件 1a–4d。**不读「我的音色库」当前内容**，用户把库改成什么样
   *   都不影响恢复结果。数据源是 factoryBank2026.ts 的冻结快照。
   */
  const handleRestoreFactory = useCallback(async (): Promise<boolean> => {
    if (isBusy()) return false;
    if (!bleManager.connected) {
      notifyInfo(t('toast.connectBtFirst'), { duration: 3000 });
      return false;
    }
    const factory = buildFactoryBank2026();
    /* ★ 2026-11-19：诊断用 —— 记录总耗时，结束时连同 MTU / 每包帧数一起显示，
       用来区分「MTU 没协商上（批量退化成逐帧）」和「批量生效但仍慢」。 */
    const t0 = Date.now();
    beginBusy(
      t('switch.loading') || '写入中…',
      '恢复出厂音色 · 共 16 格（1a–4d）',
    );
    let done = 0;
    for (let g = 0; g < 4; g++) {
      for (let k = 0; k < 4; k++) {
        const idx = g * 4 + k;
        const dst = idx + 1;
        const p = factory[idx];
        if (!p) { endBusy(); notifyErr('出厂数据缺失，恢复中止', { duration: 3600 }); return false; }
        const boost = (p.knobValues as Record<string, Record<string, number>> | undefined)?.['boost']?.['BOOST'];
        const res = await syncChannelToHardware(
          dst,
          withSwitchPlan(p.registers ?? {}, p.modules as Record<string, boolean> | undefined),
          boost,
          true,
          p.modules as Record<string, boolean> | undefined,
          k === 0,   // 每组第 1 格做全表回读校验
        );
        if (!res.ok) {
          endBusy();
          notifyErr(`${hwSlotName(dst)} 写入中断（已完成 ${done}/16 格），请重试`, { duration: 3800 });
          return false;
        }
        done++;
      }
    }
    endBusy();
    /* ★ 2026-11-19：把「耗时 / MTU / 每包帧数」直接显示出来 ——
       framesPerPacket 为 1 就说明 MTU 还停在 23，批量写等于没生效。 */
    /* ★ 2026-11-20：显示**实际**生效的每包帧数。
       framesPerPacket 只是 MTU 算出来的理论值（20），批量若被 GATT 拒绝会自适应
       降级甚至回退逐帧 —— 只显示理论值会让人误以为"已经在批量了"。 */
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const eb = bleManager.lastEbBatch;
    const mode = eb.per > 1 ? `批量${eb.per}帧/包` : '逐帧';
    const perf = `MTU${bleManager.mtu} · ${mode}`;
    notifyOk(`已恢复出厂音色 ${done} 格 · 已校验（${secs}s · ${perf}）`, { duration: 8000 });
    return true;
  }, [syncChannelToHardware, t]);

  /**
   * ★ v6.2 连接后完整恢复 UI 到硬件当前频道的音色（本地镜像 → UI，不写硬件）：
   * 寄存器镜像 + 播放模式 / 模块开关 / 子型号 / IO / 旋钮位置（与切台 handleSlotSelect 的 2/3/4 步一致）。
   * 硬件此时已处于该频道音色状态，因此不写任何 BLE（PGA 也不写）。
   */
  /* ★ v6.2 频道快照通道：恢复 UI 时把该频道寄存器 + 开关推给首页 HomePanel */
  /* ★★ v3.89：快照多带一个 `boost`（0…1 归一值，PGA 非寄存器）—— 预设库切档时首页激励旋钮跟着换档。
   类型与 HomePanel 的 `Props['sync']` 保持一致。 */
  const [channelSync, setChannelSync] = useState<{
    tick: number; regs: Record<number, number>;
    modules?: Record<string, boolean>; subModels?: Record<string, string>;
    boost?: number;
  } | null>(null);

  /**
   * ★ 2026-10-21：把某音色推给首页（寄存器 + 开关 + 子型号）—— 切档 / 本地库载入 /
   *   替换槽位 / 重连恢复 四条路径共用。禁写过滤 + 9 条开关位补齐（C5），
   *   首页的开关灯、旋钮、型号卡都只认这一个通道，状态由此保证一致。
   */
  const pushChannelSync = useCallback((item: LocalPreset) => {
    setChannelSync({
      tick: Date.now(),
      regs: withSwitchPlan(item.registers ?? {}, item.modules as Record<string, boolean> | undefined),
      modules: item.modules ? { ...item.modules } : undefined,
      subModels: item.subModels ? { ...item.subModels } : undefined,
      /* ★★ v3.89（用户 2026-10-27）：「预设库只要 UI 跟随，上传的音色会包含 ED 参数，UI 跟随同步即可」。
         激励 BOOST 不在寄存器里（PGA I2C），所以它必须搭这个快照单独带过去 ——
         否则切档后首页激励旋钮还停在上一个音色的档位，而界面上的其余参数已经全换了。
         口径：存档里是 **0…1 归一值**，首页 `values['boost'][-1]` 要的是 **0…10 档位**。 */
      boost: typeof item.knobValues?.['boost']?.['BOOST'] === 'number'
        ? item.knobValues['boost']['BOOST']
        : undefined,
    });
  }, []);

  /**
   * ★★ v3.62（用户拍板）：预设库模板 → UI 的**唯一恢复路径**。
   *   逐层整体替换（模板 10 个模块键齐全 / 旋钮不叠加 prev / 子型号不合并），
   *   所以「本地库换模板但没上传」不会留下任何痕迹：切档、连接同步、踩钉跟随
   *   三条路径都从这里过，读到的永远是 bfx_presets（= 硬件频道表）。
   */
  const restoreUiFromSlot = (slot: number) => {
    const item = getPresetTemplate(slot);
    if (!item) return;
    loadChannelSnapshot(item.registers, regCacheRef);
    if (item.playMode) setPlayMode(item.playMode as PlayMode);
    /* modules 已补全 10 键 → 直接整体替换，缺键不会再沿用上一套模板 */
    setModuleEnabled({ ...item.modules });
    setSubModelNames({ ...item.subModels });
    /* ★★★ 2026-11-02（用户报障「总音量旋钮调整后切档不变」）：
     *   旧实现取的是模板里的 `item.io`（大多没存 / 存的是旧值），所以硬件切档后
     *   UI 的总音量、输入音量都不跟随；静音还会被模板改写（与"静音不记忆"冲突）。
     *   现在：音量**以寄存器为准**（每档记自己的 261 / 3），`io` 只作兜底；
     *   静音两项**不碰** —— 静音不随音色记忆，切档必须保持用户当前的状态。 */
    {
      const r3 = item.registers?.[3];
      const r261 = item.registers?.[261];
      setInputVol(r3 !== undefined ? r3 / 50 : (item.io?.inputVol ?? 1.0));
      setOutputVol(r261 !== undefined ? r261 / 50 : (item.io?.outputVol ?? 1.0));
    }
    /* 只有模板完全没带子型号（极端情况）才沿用当前的，避免型号卡被清空；
       其余一律以模板为准，不合并 —— 合并就是「两套模板混合」的来源。 */
    const effSm = Object.keys(item.subModels).length ? { ...item.subModels } : subModelNames;
    setLoadedKnobValues({ ...(item.knobValues || {}), ...deriveAllKnobValues(effSm) });
    const bv = item.knobValues?.['boost']?.['BOOST'];
    if (bv !== undefined) {
      if (!userKnobValuesRef.current['boost']) userKnobValuesRef.current['boost'] = {};
      userKnobValuesRef.current['boost']['BOOST'] = bv;
    }
    setDebugRegTick(t => t + 1);
    /* ★ 2026-10-20：推给首页的寄存器过禁写过滤 + 开关位补齐（首页 sendAll 以这份为源） */
    pushChannelSync(item);
  };

  /* ★★ v3.59（2026-10-24 用户拍板 F11/F12）：连接 = 读频道 + 刷 UI，一个寄存器都不写。
     ★★ v3.91（2026-10-28 用户拍板）：连 `EE <ch>` 回发也去掉 —— 收到频道号只做 UI 响应，
        不再向硬件发任何字节（详见下方 queryChannel 分支注释）。 */
  const activeSlotRef = useRef(activeSlot);
  activeSlotRef.current = activeSlot;
  /* ★ 2026-11-16：自动重连链令牌 —— 同一时刻只允许一条链在跑。
     多个断线事件（系统 GATT 回调 + 探测判死 + 用户重连）以前会各自起一条链，
     并发 connect 在 Android 上直接 133 / 超时，用户看到的就是「断联后卡住」。 */
  const reconnectTokenRef = useRef(0);
  const restoreUiRef = useRef(restoreUiFromSlot);
  restoreUiRef.current = restoreUiFromSlot;
  // 蓝牙连接: 仅建立连接 + 同步频道与 UI, 不写任何寄存器
  const handleBleConnect = (id: string | null) => {
    /* 任何一次成功连接（手动 / 自动）都作废在跑的旧重连链 */
    reconnectTokenRef.current++;
    setConnectedDeviceId(id);
    setBtConnected(id !== null);
    /* ★★ v3.70：连接状态一变，本地库的「当前格」与手拧漂移记录全部作废；
       连上后的第一次切换必须走全量（App 不知道硬件里现在是什么）。 */
    localSlotRef.current = null;
    clearDrift();
    firstSwitchRef.current = true;
    if (!id) { bleManager.onChannelPush(null); setConnFlash(null); return; }
    /* ★★ v3.59（F10）：常驻监听固件推送的 [0xEE, ch]（踩钉换档 / 硬件自身切档）。
       收到就同步档位高亮 + 用本地 16 格数据刷 UI，不写任何寄存器。
       幂等：与当前档位相同直接忽略（v3.91 起 App 不再回发 EE，只有硬件自报才会走到这里）。 */
    bleManager.onChannelPush((ch) => {
      if (ch === activeSlotRef.current) return;
      activeSlotRef.current = ch;
      setActiveSlot(ch);
      /* ★★ v3.70：硬件自己换了档（踩钉 / 面板）→ 硬件状态变成固件频道表内容，
         本地库的「当前格」与手拧漂移记录全部失效。 */
      localSlotRef.current = null;
      clearDrift();
      /* ★★★ 2026-11-03（根治「上传后切过去某个模块还是旧的」）：
       *   **设备自己换档 = DSP 里的参数已经变成固件频道表的内容**，App 手里
       *   `registerStore`（"硬件当前值"镜像）和开关影子表**全部失真**。
       *   切档帧集是"和目标值不同才发"，镜像失真 ⇒ 漏发（跟合唱那个 bug 同型）。
       *   所以这里必须清镜像 + 让下一次切换走全量。 */
      registerStore.clear();
      resetSwitchShadow();
      forceFullNextRef.current = true;
      restoreUiRef.current(ch);
      /* ★★ v3.68（用户拍板 ABCD）：这条是**诊断信息**，不是用户动作的结果。
         原来用普通 toast 弹「硬件切换到 A2」，于是 App 自己发 EE 被固件回推时
         也会弹一条（handleSlotSelectByLocal / 连接补发 EE 两条路径）——
         用户在「下载 → 下发」时感受到的「莫名多一个提示框」就是它。
         现在降级为 notifyDebug：只有高级工程模式下才显示。 */
      notifyDebug(
        lang === 'en' ? `Hardware switched to ${slotLabelOf(ch)}` : `硬件切换到 ${slotLabelOf(ch)}`,
      );
    });
    // 重连清空寄存器库: 避免上次会话失败/残留的陈旧值让 diff-skip 永久跳过, 重连后全量重灌
    if (id) registerStore.clear();
    /* ★★ v3.92（2026-10-28 用户拍板）：「静音复位可以去掉」——
       删除 v3.75(H6) 的 +900ms `writeRegister(2, restore2)` 兜底。
       至此**连接路径对硬件零写入**：连接 = 只读频道号 + 对齐 UI，写硬件一律等用户动作。
       只保留纯本地状态清理（不发任何字节）：
         · duckOnRef 若残留 true（上次切换中途掉线），不清掉会让下一次 duckOn() 早退
           —— 既不静音也不重记 mute2BeforeRef，duckOff 反而会拿旧值去写 reg2；
         · volBeforeSwitchRef 同理属于上一轮切换的残留。
       ⚠ 已知代价（用户接受）：那种极端场景下硬件 reg2 可能停在 1，重连后暂时无声；
         用户下一次切换会走正常 duckOn→duckOff 流程（registerStore 已 clear，
         mute2BeforeRef 取到 0）自动解静音。 */
    if (duckOnRef.current) {
      duckOnRef.current = false;
      volBeforeSwitchRef.current = null;
    }
    // 频道同步: 连接成功后延时 500ms 查询硬件当前频道 (EE FF), 收到 EE n 后预设库跳转到该频道
    // 目的: 让硬件频道灯与软件预设库保持一致 (硬件端只能顺序切换, 无法主动上报)
    if (id) {
      setTimeout(async () => {
        /* ★★★ 2026-10-31：**一次性解除"整机静音"卡死**。
           上一版 APK 把 reg260（DSP 输出静音）写进 duckOn/duckOff，一旦恢复那次
           走了早退分支，260 就永久停在 1 —— 表现是"换固件后彻底没声音，连按键切档也没声"。
           260 是 latch、固件切档/开机都不重置，只能显式写 0。
           这里在升级后的**第一次连接**补写一次 0，然后置标记，之后不再写
           （v3.92「连接 = 零硬件写」的约定照旧）。 */
        try {
          if (localStorage.getItem('bfx_mute260_rescue_v1') !== '1') {
            /* 260（DSP 输出静音）与 2（输入静音）都是 latch，固件切档/开机都不复位。
               上一版把它们写进通用静音链路后，只要恢复那次走了早退分支就会永久静音。 */
            await bleManager.writeRegister(260, 0, 0xEA).catch(() => {});
            registerStore.set(260, 0);
            addDebugLog(260, 0);
            await bleManager.writeRegister(2, 0, 0xEA).catch(() => {});
            registerStore.set(2, 0);
            addDebugLog(2, 0);
            localStorage.setItem('bfx_mute260_rescue_v1', '1');
          }
        } catch { /* 隐私模式 / 存储不可用：跳过，不影响连接 */ }

        const ch = await bleManager.queryChannel();
        if (ch !== null) {
          /* ★★ v3.91（2026-10-28 用户拍板）：「收到频道数，我们 UI 响应频道就可以，
             不要回发参数给硬件」。旧实现（v3.57 F12）在这里补发 `EE <ch>` 让固件
             把该频道表整表重载进 RAM —— **已删除**。理由：
               · 频道是硬件自己上报的，它的 RAM 本来就是这一档，重载没有任何收益；
               · 重载会多一次写 + 一次 `[EE, ch]` 回推，只是白白多两个 GATT 往返；
               · 本路径此后**零硬件写**：连接 = 只读频道号，写硬件一律等用户动作。
             ★ 顺序保留：先同步 ref / 档位 / UI 再判断，避免回推被误判成踩钉换档。 */
          activeSlotRef.current = ch;
          setActiveSlot(ch);
          // ★ v6.2: 连接后 UI 完整恢复到该频道音色（镜像 + 模式/开关/子型号/IO/旋钮），不写硬件
          restoreUiFromSlot(ch);
          /* ★★ v3.57（2026-10-23 用户拍板 K2）：**连接后不再补写 9 条开关**。
             原先这里会在 +1800ms 写一次 switchPlan（怕"UI 开着、硬件关着"）。
             用户明确要求：连接只是「确认频道 + 同步 UI 显示」，一个参数都不发 ——
             硬件该频道本来就有自己的开关状态，重复下发只会制造不同步窗口。
             （影子表在重连时已由 registerStore.clear() 清空，后续用户操作正常记账。） */
        }
        // 2026-09-25 取消「连接后自动补传」: 连接蓝牙只建立连接 + 对齐当前频道,
        // 不再把"待同步"频道批量写入硬件。写硬件只能由用户动作触发:
        //   · 预设库底部「上传」按键 (EB 5ms)
        //   · 保存/替换频道 (用户明确指定了某槽位)
        // 注: 原本 A8/A7 的脏频道补传会在重灌出厂预设后把 1-16 全量推给硬件, 已移除。
        /* ★★ v3.63（K5）：删除「硬件频道表为旧版，请在预设库点写入硬件」的提示。
           预设库已经没有写入口，这条提示指向一个不存在的按钮；
           而且新模型下「App 16 格 == 硬件频道表」只由「本地库上传」维护，
           两边不一致的唯一后果由上传动作本身消除，不需要连接时再催一次。 */
        if (ch === null) {
          /* 查询失败时 UI 会停在本机上次的档位，与硬件实际频道可能错位 —— 诊断信息，仅工程模式可见 */
          window.setTimeout(() => notifyDebug(
            lang === 'en' ? 'Could not read the current channel from the device'
                          : '未能读取硬件当前频道，界面档位可能与硬件不一致',
          ), 900);
        }
      }, 500);
    }
  };

  // 监听 BLE 意外断开 — 硬件静默断开时同步 React 状态并提示用户
  /* ★ 2026-10-17（用户要求「蓝牙连接状态下保持后台可运行」）：
     真机上"进后台 / 锁屏 / 走远两步"经常表现为一次静默断链（固件侧超时或链路丢失）。
     之前断了就只能手动再点一次连接 —— 用户会觉得"后台跑不了"。
     现在：意外断线后自动重连 3 次（1.2s / 2.4s / 4.8s 退避），
     成功后走 handleBleConnect 恢复频道与 UI；失败才保持断开状态。
     用户主动断开不会走到这里（bleManager.disconnect() 会置 _disconnecting 抑制回调）。 */
  useEffect(() => {
    /* ★★ v3.77（P4）：两条硬约束 ——
       ① 退避定时器必须能随卸载取消：旧实现 `window.setTimeout` 不记账，组件卸载后
          仍在跑的链会继续 connect 并回调 `handleBleConnect`。
       ② 用户手动断开必须终止重连链：旧实现只判 `bleManager.connected`，而用户点
          「断开」时 `connected` 本来就是 false → 退避到点照样把设备连回来。
          改用 `bleManager.manualDiscCount` 计数比对（disconnect() 每次都自增，
          含「本来就没连」的早退分支）。 */
    const timers: number[] = [];
    const retry = (deviceId: string, attempt: number, discMark: number, token: number) => {
      /* ★ 2026-11-04：硬件关机→再开机通常 8–15s。
         ★ 2026-11-16：改成 8 次、上限 5s（1.2/1.9/3.0/4.8/5/5/5/5 ≈ 32s）——
           旧的 1.2/2.4/4.8/9.6/19.2 总窗口虽长，但硬件 10s 回来时经常正好卡在
           19.2s 那一档里等，用户体感就是「开好机了 App 还不连」。 */
      if (attempt >= 8) return;
      if (token !== reconnectTokenRef.current) return;
      const delay = Math.min(5000, Math.round(1200 * Math.pow(1.6, attempt)));
      timers.push(window.setTimeout(async () => {
        if (token !== reconnectTokenRef.current) return;      // 已被更新的链 / 成功连接取代
        if (bleManager.connected) return;                    // 已经自己恢复了 / 用户手动连上了
        if (bleManager.manualDiscCount !== discMark) return;  // 用户已明确要求断开
        const ok = await bleManager.connect(deviceId).catch(() => false);
        if (ok) {
          /* 连上的瞬间用户才点的断开 → 立刻回滚，别让重连赢了这场竞速 */
          if (bleManager.manualDiscCount !== discMark) { void bleManager.disconnect(); return; }
          reconnectTokenRef.current++;   // 成功 → 终止本链
          handleBleConnect(deviceId);
          /* ★★ v3.69（用户报障）：自动重连成功**不弹底部提示** —— 后台自愈属于静默行为，
             画面已经由 ConnectionFlash 表达「已连接」，再弹一条只是噪音。
             （真正需要用户知道的「已断开」仍走下面的 notifyErr。） */
        } else {
          retry(deviceId, attempt + 1, discMark, token);
        }
      }, delay));
    };
    bleManager.setOnDisconnectHandler((deviceId: string) => {
      /* ★ v3.59：断线必须注销频道推送监听，否则回调会打到已断开/已卸载的界面 */
      bleManager.onChannelPush(null);
      setConnectedDeviceId((prev) => prev === deviceId ? null : prev);
      setBtConnected(false);
      setConnFlash(null);
      notifyErr(t('toast.btDisconnected'), { duration: 3200 });
      const token = ++reconnectTokenRef.current;   // 新链生效，旧链自动作废
      retry(deviceId, 0, bleManager.manualDiscCount, token);
    });
    return () => {
      for (const id of timers) window.clearTimeout(id);
      bleManager.setOnDisconnectHandler(null);
    };
  }, [t]);

  /**
   * A6 (2026-09-23) 载入某模块【子型号默认参数】：公式寄存器 + 隐藏寄存器 + NAM 主旁路回写 + PRE EQ。
   * 抽自 handleSubModelChange，供两处复用：
   *   ① 用户切换子型号（handleSubModelChange）
   *   ② 踩钉把「预设直通档」的模块重新开启（无复位前缓存时）
   * 返回是否真正写出了寄存器（无公式的模块返回 false）。
   */
  /** ★ v3.68：上一次「加载子型号」实际写入的地址表 —— 供加载窗按 50/15 口径算停留时长 */
  const lastSubModelAddrsRef = useRef<number[]>([]);

  // When sub-model switches, write ALL default register values for that sub-model
  /* ══ ★★ v3.68（用户拍板 LOADING）：切换箱头 / 箱体 / 过载等子型号 → 出加载窗并锁操作 ══
     时长口径：旁路地址 50ms/条 + 其余参数 15ms/条（estimateLoadMs），加 150ms 余量、下限 400ms。

  /**
   * A6 (2026-09-23) 把某模块"开启"所需的可听参数写回硬件（踩钉在"无复位前缓存"时调用）。
   *   · 压缩/过载/失真/箱头 → 该子型号默认参数（writeSubModelRegisters）
   *   · 箱体               → 当前箱体捕获曲线 35 段 + 限幅器 Off（无子型号公式）
   *   · 混响               → REVERB_ON_DEFAULTS（无子型号公式）
   * 写入统一 REG_WRITE_MS 节奏，并同步 registerStore / regCacheRef。
   * 返回 false = 无法恢复可听参数（调用方应回滚 UI 开关，避免 UI 与硬件不一致）。
   */

  // 供先声明的 toggleModule 使用（每次渲染刷新引用 → 永不陈旧, 且避开 deps 前向引用）

  // ─── Cabinet BLE handlers ──────────────────────────────────────────



  // 写 35-band PEQ + 复位 SPEAKER dynamics (两级: 硬件切换或 Room 切换共用)

  /* ══ ★★ v3.68（用户拍板 LOADING）：换箱体 / 换拾音位 → 出加载窗并锁操作 ══
     写 35 段 PEQ(108–142)；换箱体额外复位 SPEAKER dynamics(254–259)。
     时长口径同箱头：50ms/旁路条 + 15ms/参数条（loadWindowMs），加 150ms 余量、下限 400ms。 */

  const handleInputVolChange = useCallback((norm: number) => {
    setInputVol(norm);
    const regVal = Math.round(norm * 50);
    registerStore.set(3, regVal);
    regCacheRef.current[3] = regVal;
    setDebugRegTick(t => t + 1);
    if (connectedDeviceId) {
      bleManager.writeRegister(3, regVal, 0xea, false).catch(() => {});
    }
    handleKnobDisplay(norm === 0 ? 'IN VOL  -∞ dB' : `IN VOL  ${regVal - 50} dB`);
  }, [connectedDeviceId]);

  const handleOutputVolChange = useCallback((norm: number) => {
    setOutputVol(norm);
    const regVal = Math.round(norm * 50);
    registerStore.set(261, regVal);
    regCacheRef.current[261] = regVal;
    setDebugRegTick(t => t + 1);
    if (connectedDeviceId) {
      bleManager.writeRegister(261, regVal, 0xea, false).catch(() => {});
    }
    /* 总音量 0 = 关闭：与噪声门/激励同一逻辑，0 档同时落输出静音、指示灯熄灭。 */
    const shouldMute = norm <= 0.001;
    if (shouldMute !== muted) {
      setMuted(shouldMute);
      const muteReg = shouldMute ? 1 : 0;
      registerStore.set(260, muteReg);
      regCacheRef.current[260] = muteReg;
      if (connectedDeviceId) bleManager.writeRegister(260, muteReg, 0xea, false).catch(() => {});
      addDebugLog(260, muteReg);
      setDebugRegTick(t => t + 1);
    }
  }, [addDebugLog, connectedDeviceId, muted]);

  const toggleInputMute = useCallback(() => {
    const next = !inputMute;
    setInputMute(next);
    const regVal = next ? 1 : 0;
    registerStore.set(2, regVal);
    regCacheRef.current[2] = regVal;
    setDebugRegTick(t => t + 1);
    if (connectedDeviceId) {
      bleManager.writeRegister(2, regVal, 0xea, false).catch(() => {});
    }
    handleKnobDisplay(`IN ${next ? 'MUTED' : 'UNMUTED'}`);
  }, [inputMute, connectedDeviceId]);

  const toggleOutputMute = useCallback(() => {
    const next = !outputMute;
    setOutputMute(next);
    const regVal = next ? 1 : 0;
    registerStore.set(260, regVal);
    regCacheRef.current[260] = regVal;
    setDebugRegTick(t => t + 1);
    if (connectedDeviceId) {
      bleManager.writeRegister(260, regVal, 0xea, false).catch(() => {});
    }
    handleKnobDisplay(`OUT ${next ? 'MUTED' : 'UNMUTED'}`);
  }, [outputMute, connectedDeviceId]);

  // D7 (2026-09-22) 死代码清理: handleApplyPreset 已删除 — 全工程无任何调用者
  //   (原功能 = 按 PresetConfig 生成整图并 EA 全量写硬件; 切台解耦后该职责由
  //    「预设库频道切换(EE) + 上传(EB)」承担)

  /**
   * ★ 2026-10-26（审查 A4）：工程模式的 GAIN/DRIVE 量程要跟着**当前箱头型号**走。
   *   型号上限（ampHeadDef.limit）：CLEAN/BASS 20 · CRUNCH 25 · HIGH-GAIN 40 dB。
   *   旧实现写死 0…80（=40 dB），CLEAN 箱头能被推到设计上限的 2 倍。
   *   这里按 subModelNames['amp-head'] 反查型号；查不到按 40（HIGH-GAIN）兜底。
   */
  const debugAmpLimit = useMemo(() => {
    const raw = subModelNames['amp-head'];
    if (!raw) return 40;
    const n25 = TONE25_HEADS.find((x) => x.key === raw || x.code === raw || x.display === raw);
    if (n25) return n25.gainLimit;
    const k = resolveModelKey('amp-head', raw);
    const m = AMP_MODELS.find((x) => x.key === k) ?? AMP_MODELS.find((x) => x.name === raw);
    return m?.limit ?? 40;
  }, [subModelNames]);

  return (
    <div
      data-cmp="Index"
      style={{
        /* ★ 2026-11-05：100dvh → 100%（安全区 padding 已上移到 #root，
           这样 absolute 面板不会盖住系统状态栏/导航栏）。 */
        width: '100%', maxWidth: 480, height: '100%', margin: '0 auto',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative',
        /* ★ 2026-10-17：整页底板色可换（默认 #24262b，由顶栏空白处点击更换） */
        background: pageBg,
        transition: 'background .22s ease',
      }}
    >
      {/* ★★ v3.68：两段式全屏 —— 点下连接立刻出「正在连接」（慢呼吸），
          连上后原地切成「闪烁 → 常亮 2.1s」，再关面板进首页/教程。 */}
      <ConnectionFlash
        active={!!connFlash}
        mode={connFlash?.phase ?? 'connected'}
        deviceName={connFlash?.name}
        lang={lang}
        onDone={handleConnFlashDone}
        onCancel={handleConnCancel}
      />

      {/* ★ 2026-10-17：TONE 键双击/长按 → 屏幕中部大号提示（portal 到 body，不受容器裁切） */}
      <CenterHint hint={centerHint} />

      {/* Content wrapper */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* ── HEADER ── */}
        <header style={{
          /* ★ v4.31：灰模式下底色/分隔线走变量（--bfx-bar 由 config/theme.ts 写入），
             深色模式变量不存在 → 回落原来的 #2c2f36 / #454b55，观感不变。 */
          height: 48, background: 'var(--bfx-bar, #2c2f36)',
          borderBottom: '1px solid var(--bfx-bar-line, #454b55)',
          // flex 行: BFX1 — 频谱(居中于 BFX1 与胶囊之间) — GUITAR/BASS胶囊 — 语言
          // 两侧弹性空档吸收语言切换宽度变化 → 切换零位移
          display: 'flex', alignItems: 'center',
          padding: '0 4px 0 12px', flexShrink: 0,
        }}>
          {/* B&F Logo
              ★ 2026-10-17（用户要求）：中英文切换改为【长按 LOGO】；单击只播放点击动画。
                 · 单击 → logo-pop 缩放动画（无副作用）
                 · 长按 600ms → 中/英切换
                 · 连点 5 次 → 调试模式（原隐藏入口保留）
              原实现单击就切语言，和"点一下看反应"的直觉冲突，容易误切。 */}
          {/* ★ 2026-10-19（用户要求）：未连接蓝牙时 LOGO 不响应任何手势 ——
              原先单击播动画、长按切语言、连点 5 进调试，在扫描页上极易误触（尤其中英切换和调试入口），
              连接成功后恢复。
              ★ 2026-10-19（用户要求）：**长按 LOGO 进入调试模式**（原「连点 5 次」取消）。
                 · 单击 → logo-pop 缩放动画（无副作用）
                 · 长按 900ms → 进入 / 退出调试模式（轻震一次）
                 · 双击 → 中 / 英切换（长按改作调试后，语言入口挪到双击，避免功能丢失） */}
          <div
            key={logoPopKey}
            className={logoPopKey ? 'logo-pop' : undefined}
            onClick={() => {
              if (!btConnected) return;
              setLogoPopKey((k) => k + 1);                 // 每次点击都重播动画
              if (logoHoldRef.current.fired) {             // 长按已处理 → 吞掉这次点击
                logoHoldRef.current.fired = false;
                return;
              }
              /* ★★★ v4.30（用户拍板）：单击 = 深 / 浅主题切换。
                 · 双击切语言已取消 → 语言入口挪到顶栏「中·EN」按钮
                 · 不再需要 320ms 双击等待，点下即切
                 · 回滚：THEME_SWITCH=false 时这里直接 return，只剩弹跳动画 */
              if (!THEME_SWITCH) return;
              const next: ThemeMode = themeMode === 'grey' ? 'dark' : 'grey';
              setThemeMode(next);
              saveTheme(next);
              notifyInfo(
                next === 'grey'
                  ? (lang === 'zh' ? '灰色底板' : 'Grey panels')
                  : (lang === 'zh' ? '深色底板' : 'Dark panels'),
                { duration: 1200 },
              );
            }}
            onPointerDown={() => {
              if (!btConnected) return;
              const h = logoHoldRef.current;
              h.fired = false;
              if (h.timer) clearTimeout(h.timer);
              h.timer = setTimeout(() => {
                h.fired = true;
                h.timer = null;
                setDebugMode((d) => !d);
              }, 900);
            }}
            onPointerUp={() => {
              const h = logoHoldRef.current;
              if (h.timer) { clearTimeout(h.timer); h.timer = null; }
            }}
            onPointerLeave={() => {
              const h = logoHoldRef.current;
              if (h.timer) { clearTimeout(h.timer); h.timer = null; }
            }}
            role={btConnected ? 'button' : undefined}
            aria-label={btConnected ? (lang === 'zh' ? 'BFX1（长按进入高级工程模式）' : 'BFX1 (hold for engineering)') : 'BFX1'}
            title={btConnected ? (lang === 'zh' ? '长按进入高级工程模式 · 双击切换语言' : 'Hold for engineering · double-tap for language') : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 8,
              cursor: btConnected ? 'pointer' : 'default', flexShrink: 0,
              pointerEvents: btConnected ? 'auto' : 'none',
              userSelect: 'none', touchAction: 'manipulation' }}
          >
            <img
              src="/brand/logo-bf@2x.png"
              alt="B&F"
              draggable={false}
              style={{ height: 28, width: 'auto', display: 'block', flexShrink: 0 }}
            />
            <div style={{ lineHeight: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', fontFamily: '"Barlow-Regular_2", sans-serif', color: '#e8eaed', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                BFX1
              </div>
              {/* ★ 2026-10-17：版本号常显 —— 一眼确认「装的是哪一版」，
                  排查「装了新包界面没变」时不用进系统设置看。 */}
              <div style={{
                marginTop: 3, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em',
                fontFamily: '"Barlow-Regular_2", sans-serif',
                color: '#a4adbd', lineHeight: 1, whiteSpace: 'nowrap',
              }}>v{APP_VERSION}</div>
            </div>
          </div>

          {/* 弹性空档 —— ★ 2026-10-17（用户要求）：点这里换整页底板颜色 */}
          <div
            onPointerUp={() => rollAccent(BG_ID, pageBg)}
            role="button"
            aria-label={lang === 'zh' ? '更换底板颜色' : 'Change background color'}
            title={lang === 'zh' ? '点这里换底板颜色' : 'Tap to change background'}
            style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', cursor: 'pointer' }}
          />

          {/* ★ v4.30（用户要求）：语言切换入口 ——
              原来挂在 LOGO 双击上，双击被改成"切主题"后挪到这里。
              44 高热区、视觉 22 高小胶囊，和右侧图标按钮同一套语言。 */}
          <button
            type="button"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            aria-label={lang === 'zh' ? 'Switch to English' : '切换到中文'}
            title={lang === 'zh' ? '中 · EN' : 'EN · 中'}
            style={{
              flexShrink: 0, marginRight: 6, height: 40, padding: '0 9px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'none', cursor: 'pointer',
            }}
          >
            <span style={{
              display: 'flex', alignItems: 'center', height: 22, padding: '0 7px',
              borderRadius: 6, border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
              color: '#cfd5dd', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
              fontFamily: '"Barlow-Regular_2", sans-serif', lineHeight: 1,
            }}>{lang === 'zh' ? '中 / EN' : 'EN / 中'}</span>
          </button>

          {/* ★ 2026-10-17（用户要求）：删除首页顶部的「档位 + 音色名」常显胶囊。
              原先这里是 v69 的 H6 改动，用户确认不需要在首页顶部显示当前音色。 */}

          {/* ★ v5.2 右侧：蓝牙指示按钮（点击进蓝牙连接页）
              ★ 2026-10-17（用户要求）：不显示文字，只留图标
              ★ 2026-10-17（用户反馈「点击不准确」）：
                 · 外层做成 44×44 的透明热区（Apple HIG 最小触控尺寸），视觉仍是 34×34 胶囊；
                 · 去掉 .bfx-tap 的 :active scale(.97) —— 按下瞬间元素会缩小 3%，
                   手指贴在边缘时 pointerup 已经落在元素外，于是"点了没反应"；
                 · onPointerUp → onClick（点击判定更稳，不受指针捕获/缩放影响）。 */}
          {/* ★ 2026-10-17（用户要求）：蓝牙图标旁加「教程」入口，随时可重看操作流程。
              规格与蓝牙按钮完全一致（44×44 热区 + 34×34 视觉胶囊），两个按钮并排不打架。
              没看过时右上角亮一个橙点，看过之后变静默灰。 */}
          {/* ★ 2026-10-19（用户要求）：未连接蓝牙时（蓝牙扫描页在顶部），
              教程「?」按钮不可点 —— 此时点开教程会盖在扫描页上，属于误操作。 */}
          {/* ★★ v3.68（2026-10-24 用户要求）：顶栏「使用教程 ?」改为**高级工程模式**入口
              （原「调试模式」更名）。教程入口保留在 我的账号 → 使用教程 / 说明书，不再占顶栏。
              未连接蓝牙时置灰 —— 工程模式里的读/写/曲线全部依赖硬件，未连接进去只会是空面板。 */}
          {/* ★ 2026-11-16（用户要求）：**隐藏工程模式图标** —— 顶栏不再有虫子按钮。
              工程模式仍可用「长按左上角 BFX1 LOGO 0.9 秒」进入（内部/售后用）。 */}
          {false && (
            <button
              type="button"
              data-tour="btn-tour"
              onClick={() => { if (!btConnected) return; setDebugMode((v) => !v); }}
              disabled={!btConnected}
              title={lang === 'zh' ? '高级工程模式' : 'Advanced engineering'}
              aria-label={lang === 'zh' ? '高级工程模式' : 'Advanced engineering'}
            >
              <BugIcon size={16} color={debugMode ? '#F06F21' : '#c2c9d6'} />
            </button>
          )}

          <button
            type="button"
            data-tour="btn-bt"
            onClick={() => setActivePanel(p => p === 'bluetooth' ? null : 'bluetooth')}
            title={lang === 'zh' ? '蓝牙连接' : 'Bluetooth'}
            aria-label={btConnected ? '蓝牙已连接' : '蓝牙未连接'}
            style={{
              width: 44, height: 44, padding: 0, border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0, marginLeft: 2,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              width: 34, height: 34, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              /* ★ 2026-10-17（用户要求）：蓝牙连接态统一改为蓝色 —— 与蓝牙面板内的
                 设备图光晕 / 菜单高亮同色，不再出现"面板蓝、顶栏绿"的两套语义 */
              background: btConnected ? 'rgba(91,200,245,0.14)' : '#2c2f36',
              border: `1px solid ${btConnected ? 'rgba(91,200,245,0.55)' : '#454b55'}`,
              transition: 'all 0.15s ease',
            }}>
              {btConnected
                ? <BluetoothIcon size={16} color="#5bc8f5" />
                : <BluetoothOffIcon size={16} color="#c2c9d6" />}
            </span>
          </button>

          {/* ★★ v3.68（2026-10-24 用户要求）：账号入口改为**固定方形 + 用户图标**。
              之前显示昵称文字，长用户名会把顶栏撑开、按钮宽度不定（用户原话「会拉长图标」）。
              现在一律 34×34 方块，内部只有 UserCircle 图标；已登录用品牌橙，未登录灰。 */}
          <button
            type="button"
            data-tour="btn-account"
            /* ★ 2026-10-26：去掉 disabled —— disabled 的 button 不派发 click，
               未连接时点下去零反馈（用户判定"App 卡了"）。改为守卫 + 提示气泡。 */
            onClick={(e) => { if (!uiConnected) { showConnectHint(e); return; } setActivePanel(p => p === 'user' ? null : 'user'); }}
            title={accountName ? accountName : (lang === 'zh' ? '我的账号' : 'My account')}
            aria-label={lang === 'zh' ? '我的账号' : 'My account'}
            style={{
              width: 44, height: 44, padding: 0, border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: uiConnected ? 'pointer' : 'not-allowed', flexShrink: 0, marginLeft: 2,
              opacity: uiConnected ? 1 : 0.35,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              width: 34, height: 34, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: accountName ? 'rgba(240,111,33,0.14)' : '#2c2f36',
              border: `1px solid ${accountName ? 'rgba(240,111,33,0.55)' : '#454b55'}`,
              transition: 'all 0.15s ease',
            }}>
              <UserCircleIcon size={17} color={accountName ? '#F06F21' : '#c2c9d6'} />
            </span>
          </button>
        </header>

        {/* ── 试用浮条（社区音色） ★ 2026-10-24 ──
            「试用」只把 EA 全表写进当前频道 RAM = 一次参数调节；
            不保存就不影响已保存参数，所以「结束」不发任何帧，只收浮条。 */}
        {trialTone && (
          <div style={{
            /* ★★ v3.81（P2-16）：原来 `top: 62` 正好等于面板容器顶边，
               而浮条 zIndex 70 > 面板 50 → 直接压住库面板的标题栏和右上「×」，
               用户在社区里试用后关不掉面板。面板打开时下移到标题栏（52）之下。 */
            position: 'fixed', left: 8, right: 8, top: activePanel ? 116 : 62, zIndex: 70,
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
            borderRadius: 12, background: 'rgba(16,18,22,0.96)',
            border: '1px solid rgba(240,111,33,0.55)',
            boxShadow: '0 8px 26px rgba(0,0,0,0.6)',
            animation: 'langFadeIn 0.15s ease',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F06F21', boxShadow: '0 0 8px rgba(240,111,33,0.9)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#F2F4F8', letterSpacing: '0.04em', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t('community.trialOn', { name: trialTone })}
              </div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginTop: 2, fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t('community.trialHint')}
              </div>
            </div>
            <button
              onClick={() => { setTrialTone(null); setActivePanel('library'); notifyInfo(t('community.trialStoreHint')); }}
              style={{ flexShrink: 0, height: 26, padding: '0 10px', borderRadius: 7, cursor: 'pointer', background: 'rgba(240,111,33,0.18)', border: '1px solid rgba(240,111,33,0.6)', color: '#F06F21', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
              {t('community.trialStore')}
            </button>
            <button
              onClick={() => { setTrialTone(null); notifyInfo(t('community.trialEnded')); }}
              style={{ flexShrink: 0, height: 26, padding: '0 10px', borderRadius: 7, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
              {t('community.trialEnd')}
            </button>
          </div>
        )}


        {/* ── Horizontal page-swipe module area (每模块一页, 左右滑动) + 两侧点击切换区 ── */}
        <div data-tour="module-area" style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {/* ★★ 2026-10-03 修复：新 UI（ui2）自带底部链路 Dock，必须【只渲染一次】。
              原先它被放在 MODULES.map() 里 → 同时存在 8 个 TonePage 实例，
              每个实例有独立的 state；可见的那个 ≠ 被操作的那个，
              导致「弹窗点不开」「参数没生效」。旧 UI 仍按 8 页横向滚动渲染。 */}
          {/* ★★ v3.77：旧 PedalPanel / 模块标签页分支已整段删除，只剩新 UI（ui2 TonePage） */}
          {(
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', opacity: uiConnected ? 1 : 0.4, transition: 'opacity 0.2s' }}>
              {!uiConnected && <div onClick={(e) => showConnectHint(e)} style={{ position: 'absolute', inset: 0, zIndex: 3, cursor: 'pointer' }} />}
              <TonePage
                onParam={async (reg, value, modId, keepBusy) => {
                  /* ★ 2026-10-16：未连接蓝牙一律不写（禁止离线使用，防误操作） */
                  if (!guardConnected()) return false;
                  /* ★★ v3.58：批次写入期间禁止单帧插入 —— 否则会打断包顺序。
                     ★ v3.69：`keepBusy` = 首页 sendAll 自己发的整批下发，它已经持有
                     LOADING 遮罩，必须放行；只有「遮罩期间用户另起的单帧写入」才拦。 */
                  if (isBusy() && !keepBusy) return false;
                  /* ★★ v3.77：非有限值一律丢弃（NaN / Infinity）。
                     一个 NaN 写进 registerStore 就等于把这个地址永久写坏 ——
                     后续所有整表导出、上传、切换包都会带着它，且 UI 显示为空。
                     旧版这条警告挂在 v3.77 已删的批量写函数里（那是死代码），
                     活路径反而没守卫，这里补上。 */
                  if (typeof value !== 'number' || !Number.isFinite(value)) {
                    console.warn('[BFX1] 丢弃非有限值寄存器写入', modId, reg, value);
                    return false;
                  }
                  if (typeof reg === 'number') {
                    // ★★ 2026-10-03 修复 P2：必须同步 registerStore + regCacheRef，
                    //    否则调试模式的 PEQ 图示读不到新值（重绘了但缓存没变）。
                    registerStore.set(reg, value);
                    regCacheRef.current[reg] = value;
                    /* ★★ v3.70：记一笔「App 改过这个地址」—— 本地库切换时按目标格补写一遍，
                       否则预存的差异包里没有它，切走后会停在这个手拧值上。成本 O(1)。 */
                    markDrift(reg);
                  }
                  /* ★ WO-01：把写入结果回传给首页（失败 → 卡片红点 + 告警条），不再静默吞掉 */
                  let ok = false;
                  try {
                    if (reg === 'PGA') {
                      ok = await bleManager.writePGA(value);
                      /* ★★ v3.88（同 v3.88 的保存口径）：写入成功就把档位记进 ref。
                         ref 是三条链路共用的「当前激励档位」：
                           ① 关闭激励后再开启（onBypass 读它算 lv）；
                           ② 预设库切档（getBoostKnob）；
                           ③ 保存音色时的兜底值。
                         旧实现只发帧不记账 → 用户在首页拧完激励，App 自己不知道新档位，
                         「关掉再打开」就跳回上一次载入音色的档位。 */
                      if (ok) {
                        if (!userKnobValuesRef.current['boost']) userKnobValuesRef.current['boost'] = {};
                        userKnobValuesRef.current['boost']['BOOST'] =
                          Math.max(0, Math.min(10, Math.round(value))) / 10;
                      }
                    } else {
                      ok = await bleManager.writeRegister(reg, value, 0xEA);
                    }
                  } catch (e) {
                    console.warn('[BFX1] 参数写入失败', modId, reg, value, e);
                    ok = false;
                  }
                  addDebugLog(typeof reg === 'number' ? reg : -1, value);
                  setDebugRegTick(t => t + 1);
                  return !!ok;
                }}
                sync={channelSync}
                /* ★ 2026-10-17：断线保存 / 重连后把当前参数写回硬件 */
                btConnected={btConnected}
                /* ★★ v3.70（用户报障「本地库存的新文件，切换会中断」）：
                   首页换箱头 / 箱体 / 过载后把真实型号回传给 Index。
                   不回传的后果：Index 的 subModelNames 停在旧值 → 保存出来的音色与当前型号
                   被判定成「换型」→ 静音 + 全量发送 → 用户听到中断。
                   这里做等值短路，型号没变就不 setState（HomePanel 每次参数变动都会回调）。 */
                onSubModelsChange={(sm) => {
                  setSubModelNames((prev) => {
                    let same = true;
                    for (const k of Object.keys(sm)) { if (prev[k] !== sm[k]) { same = false; break; } }
                    return same ? prev : { ...prev, ...sm };
                  });
                }}
                /* ★★ v3.75（H1）：首页换箱头/箱体的静音保护。
                   复用这里的 duckOn / duckOff —— 它们负责 duckOnRef、恢复 261、还原 reg2，
                   首页自己写 reg2 会绕开这套记账（正是 H6 那类「永久静音」）。 */
                onMuteGuard={async (on) => {
                  if (on) { await duckOn(); } else { await duckOff(); }
                }}
                onBypass={(modId, on) => {
                  /* ★★ v3.58：批次写入期间禁止开关写入 */
                  if (isBusy()) return;
                  /* ★★ 2026-10-26（P2 修复）：**先判连接，再改状态**。
                     旧实现先 `setModuleEnabled`（会写 localStorage）再 `guardConnected()`，
                     断线时点灯条 → UI 与持久化都改成 ON，硬件一个字节没写；
                     重连后首页灯是亮的、固件其实还旁路，而且这个错误状态已经存盘。
                     2026-10-20 那条注释要回写的 moduleEnabled 逻辑保留，只是挪到守卫之后。 */
                  if (!guardConnected()) return;
                  setModuleEnabled((prev) => (prev[modId] === on ? prev : { ...prev, [modId]: on }));
                  // ★ boost 走 PGA（无寄存器）：开启 = 当前档位，关闭 = 归零
                  if (modId === 'boost') {
                    const lv = Math.round((userKnobValuesRef.current['boost']?.['BOOST'] ?? 0.5) * 10);
                    bleManager.writePGA(on ? lv : 0).catch(() => {});
                    return;
                  }
                  /* ★ 2026-10-17（用户要求）：箱头 / 箱体新增开关。
                     它们不在 MODULE_ON_OFF 里（原设计为常开），此处单独处理，
                     不改 MODULE_ON_OFF —— 那张表被预设上传时的模块裁剪逻辑依赖。
                     箱头 = 整块旁通 A(57) + 整块旁通 B(72) 两处一起写（缺一个仍会出声）；
                     箱体 = M1 库旁路(107)（105 落在保留区 99–106，不可写）。 */
                  if (modId === 'amp-head' || modId === 'cabinet') {
                    const regs = modId === 'amp-head' ? [57, 72] : [107];
                    const v = on ? 0 : 1;
                    for (const r of regs) {
                      registerStore.set(r, v);
                      regCacheRef.current[r] = v;
                      bleManager.writeRegister(r, v, 0xEA).catch(() => {});
                      addDebugLog(r, v);
                    }
                    setDebugRegTick(t => t + 1);
                    return;
                  }
                  /* ★ 2026-10-20（用户拍板）：混响开关改回 reg 224（0 开 / 1 旁路），
                     与其他模块走同一条 MODULE_ON_OFF 路径 —— MIX(229) 归预设自己管，
                     切档不再被强制改成 20。开启时若 MIX 仍为 0，补一个默认值。 */
                  if (modId === 'reverb' && on) ensureReverbMix();
                  const spec = MODULE_ON_OFF[modId];
                  if (!spec || spec.reg < 0) return;   // ★ 箱头 / 箱体已移出开关表 → 常开，不写
                  registerStore.set(spec.reg, on ? spec.on : spec.off);
                  regCacheRef.current[spec.reg] = on ? spec.on : spec.off;
                  bleManager.writeRegister(spec.reg, on ? spec.on : spec.off, 0xEA).catch(() => {});
                  addDebugLog(spec.reg, on ? spec.on : spec.off);
                  setDebugRegTick(t => t + 1);
                }}
                /* ★ C6（2026-10-15）：MASTER 模块静音开关 → 写 reg260 */
                /* ★ v73（核定表）：首页 ④ 区「总音量」= reg 261（M1OutVolume），
                   与箱头模块自己的 MASTER（reg 239）是两个寄存器 */
                outVol={outputVol}
                onOutVol={handleOutputVolChange}
                muted={muted}
                onMuteToggle={() => {
                  /* ★ 2026-10-16：未连接蓝牙不写（禁止离线使用） */
                  if (!guardConnected()) return;
                  const nv = !muted;
                  const val = nv ? MUTE_ON_OFF.on : MUTE_ON_OFF.off;
                  setMuted(nv);
                  registerStore.set(MUTE_ON_OFF.reg, val);
                  regCacheRef.current[MUTE_ON_OFF.reg] = val;
                  bleManager.writeRegister(MUTE_ON_OFF.reg, val, 0xEA).catch(() => {});
                  addDebugLog(MUTE_ON_OFF.reg, val);
                  setDebugRegTick(t => t + 1);
                }}
              />
            </div>
          )}

          {/* ── IO VOLUME 浮动窗口 (不占布局, 右下角浮动, 展开向上) ── */}
          {ioOpen && (
            <div style={{
              position: 'absolute', right: 8, bottom: 46, zIndex: 7,
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 16,
              background: 'rgba(28,29,33,0.97)', border: '1px solid #454b55',
              boxShadow: '0 16px 48px rgba(0,0,0,0.65)',
              opacity: btConnected ? 1 : 0.4, transition: 'opacity 0.2s',
              pointerEvents: btConnected ? 'auto' : 'none',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#4cc9f0', fontFamily: '"Barlow-Regular_2",sans-serif' }}>IN VOL</span>
                <Knob label="IN VOL" value={inputVol} size={46} accentColor="#4cc9f0" onChange={handleInputVolChange} />
                <button onClick={toggleInputMute} title="Input Mute" style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: inputMute ? 'rgba(242,86,91,0.22)' : 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${inputMute ? 'rgba(242,86,91,0.7)' : '#454b55'}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: inputMute ? 'rgb(255,255,255)' : '#c2c9d6',
                  fontSize: 11, fontWeight: 800,
                  fontFamily: '"Barlow-Regular_2",sans-serif', flexShrink: 0,
                  transition: 'all 0.12s',
                }}>M</button>
              </div>
              <div style={{ width: 1, height: 58, background: '#454b55', flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#F06F21', fontFamily: '"Barlow-Regular_2",sans-serif' }}>OUT VOL</span>
                <Knob label="OUT VOL" value={outputVol} size={46} accentColor="#F06F21" onChange={handleOutputVolChange} />
                <button onClick={toggleOutputMute} title="Output Mute" style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: outputMute ? 'rgba(242,86,91,0.22)' : 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${outputMute ? 'rgba(242,86,91,0.7)' : '#454b55'}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: outputMute ? 'rgb(255,255,255)' : '#c2c9d6',
                  fontSize: 11, fontWeight: 800,
                  fontFamily: '"Barlow-Regular_2",sans-serif', flexShrink: 0,
                  transition: 'all 0.12s',
                }}>M</button>
              </div>
            </div>
          )}
        </div>

        {/* ── PANELS OVERLAY ── */}
        {/* ★ v73 修正（用户 m04259「蓝牙图片遮挡了蓝牙选项，我无法操作！」）：
            原先三块面板共用写死的 height:500。屏幕高 915 时上方白空 350px，
            而蓝牙页要在这个 500px 里塞下「表头 44 + 锁定条 34 + 设备列表 + 设备大图」，
            列表被压成 0 高、整片被设备图占住 → 点不到设备。
            ★ 2026-10-17（用户反馈「切换时跳帧闪动」）：
              原实现让高度在「蓝牙=calc(100%-74px) / 其它=500」之间跳变 —— 切换瞬间整块
              面板高度突变 200px 以上，这就是最明显的跳帧源。现统一为同一高度并加 height 过渡；
              另加一层 keyed 遮罩快速淡出，掩盖「内容瞬间替换」的生硬感。 */}
        <div style={{
          /* ★ v3.67：底栏真实高度 = padding 上3+下5 + 按钮 50 + borderTop 1 = 59，
             原来写 62 会在底栏上方留 3px 缝（社区面板把缝放大到 67px 才被发现）。
             与 .bottom-bar 的高度保持一致，面板底边正好压到栏顶。 */
          position: 'absolute', bottom: 59, left: 0, right: 0,
          /* ★ 2026-10-17（用户反馈「蓝牙选框遮挡住顶部」）：
             原高度 calc(100% - 74px) 让面板顶边落在距屏幕顶 12px 处 —— 正好盖住
             48px 的 App 顶栏（LOGO / 蓝牙图标）。改为 -124px：顶边落到 62px，
             在顶栏下方留出 14px，四个面板（蓝牙/预设/Studio/其它）一起下移。 */
          height: 'calc(100% - 121px)',
          transition: 'height 220ms cubic-bezier(.2,0,0,1)',
          zIndex: 50,
          borderTop: activePanel ? '1px solid #454b55' : 'none',
          pointerEvents: activePanel ? 'auto' : 'none',
        }}>
          <StudioPanel visible={activePanel === 'studio'} onlyTab={studioOnly ?? undefined} onClose={() => { setStudioOnly(null); setActivePanel(null); }} />
          {/* ★ 2026-10-16（用户要求）：开机即进蓝牙连接框 —— 未连接时强制显示且不可关闭 */}
          <BluetoothPanel
            visible={activePanel === 'bluetooth' || (!btConnected && !IS_WEB_PREVIEW)}
            onClose={() => { pendingCommunityConnectRef.current = false; setActivePanel(null); }}
            connectedDeviceId={connectedDeviceId}
            onConnect={handleBleConnect}
            onConnecting={handleBleConnecting}
            onConnectFail={handleBleConnectFail}
            locked={!btConnected && !IS_WEB_PREVIEW}
          />
          <PresetsPanel visible={activePanel === 'presets'} onClose={() => setActivePanel(null)} presetRev={presetRev} connectedDeviceId={connectedDeviceId} registerStore={registerStore} bleManager={bleManager} buildFrame={buildFrame} moduleEnabled={moduleEnabled} subModelNames={subModelNames} playMode={playMode} setPlayMode={setPlayMode} setModuleEnabled={setModuleEnabled} setSubModelNames={setSubModelNames} setLoadedKnobValues={setLoadedKnobValues} getBoostKnob={() => userKnobValuesRef.current['boost']?.['BOOST']} onRestoreBoostKnob={(v) => { if (!userKnobValuesRef.current['boost']) userKnobValuesRef.current['boost'] = {}; userKnobValuesRef.current['boost']['BOOST'] = v; }} ampIdxV8={ampIdxV8} setAmpIdxV8={setAmpIdxV8} inputVol={inputVol} outputVol={outputVol} inputMute={inputMute} outputMute={outputMute} setInputVol={setInputVol} setOutputVol={setOutputVol} setInputMute={setInputMute} setOutputMute={setOutputMute} setCleanResetTick={setCleanResetTick} activeSlot={activeSlot} setActiveSlot={setActiveSlot} regCacheRef={regCacheRef} bumpDebugRegTick={() => setDebugRegTick(t => t + 1)} onSyncChannel={pushChannelSync} onOpenMetronome={() => { setStudioOnly('metro'); setActivePanel('studio'); }} onOpenTuner={() => { setStudioOnly('tuner'); setActivePanel('studio'); }} />
          {/* User profile panel (new) */}
          {activePanel === 'user' && (
            <div className="panel-enter" style={{ position: 'absolute', inset: 0 }}>
              <UserPanel visible={true} onClose={() => {
                const backToCommunity = pendingCommunityRef.current && isLoggedIn();
                pendingCommunityRef.current = false;
                setActivePanel(backToCommunity ? 'community' : null);
              }} onOpenManualFullScreen={(m) => setFullScreenPdf(m)} onOpenTutorial={openTutorial} onOpenHwGuide={() => { setActivePanel(null); setHwGuideTutorial(false); setHwGuideOpen(true); }} backRef={panelBackRef}
                onAccountChange={() => setAccountName(readAccountName())} />
            </div>
          )}
          {/* 音色社区（v3.66）：连接门 → 登录门 → 推荐/关注/收藏 三页签 */}
          {activePanel === 'community' && (
            <div className="panel-enter" style={{ position: 'absolute', inset: 0 }}>
              <CommunityPanel
                visible
                onClose={() => setActivePanel(null)}
                connectedDeviceId={connectedDeviceId}
                onConnect={() => { pendingCommunityConnectRef.current = true; setActivePanel('bluetooth'); }}
                onApply={applyLoadedTone}
                onStoreToBank={handleCommunityStoreToBank}
                onStoreGroupToBank={handleCommunityStoreGroupToBank}
                onGoLogin={() => { pendingCommunityRef.current = true; setActivePanel('user'); }}
                lang={lang}
              />
            </div>
          )}
          {/* ★ v5 · LIBRARY = 本地预设库（20 个 · 只存本地 · 不上传硬件） */}
          {activePanel === 'library' && (
            <div className="panel-enter" style={{ position: 'absolute', inset: 0 }}>
              <LocalBankPage
                visible={true}
                onClose={() => setActivePanel(null)}
                getCurrentTone={buildUploadPayload}
                onApply={applyLoadedTone}
                onUploadToPreset={handleUploadLocalToPreset}
                /* ★ 2026-11-16：四组上传 —— 一次覆盖硬件 1a–4d 全部 16 档 */
                onUploadAllGroups={handleUploadAllLocalGroups}
                /* ★ 2026-11-17 v4.24：恢复出厂音色（下发冻结的出厂16档，不读当前库） */
                onRestoreFactory={handleRestoreFactory}
              />
            </div>
          )}
          {/* 切换遮罩：随 activePanel 变化重建，深色快速淡出 → 掩盖内容替换的硬切 */}
          {activePanel && <div key={activePanel} className="panel-flash" />}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            ★★ v3.58：切换 / 写入期间的 loading 遮罩（用户拍板 K3）
            盖住整个界面并吃掉所有点击 —— 打包写入是一次连续动作，
            中途插进来的旋钮写入会破坏帧顺序，切档也会打断队列。
            时长由发起方决定（切档按该频道条数、本地库按实际帧数）。
           ══════════════════════════════════════════════════════════════ */}
        {/* ★★ 2026-10-26（P0 修复）：遮罩必须挂到 **document.body**。
            旧实现是 `position:absolute` 挂在内容包装层（zIndex:1）里，
            而根级的退出框是 `fixed z300`、教程是 `fixed z500` —— 遮罩的 9000
            被父层叠上下文困住，实际上压不住它们（写入中能点到"退出"）。
            改走 portal + fixed，才是真正的顶层。 */}
        {busy && createPortal(
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(10,11,13,0.55)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'wait',
          }}>
            <div style={{
              minWidth: 168, padding: '16px 22px', borderRadius: 14,
              background: 'rgba(28,29,33,0.98)', border: '1px solid #454b55',
              boxShadow: '0 18px 52px rgba(0,0,0,0.7)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              fontFamily: '"Barlow-Regular_2",sans-serif',
            }}>
              <span style={{
                width: 26, height: 26, borderRadius: '50%',
                border: '2.5px solid rgba(76,201,240,0.22)',
                borderTopColor: '#4cc9f0',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#E5E9F0', letterSpacing: '0.04em' }}>
                {busy.label}
              </span>
              {busy.sub && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#7C8494' }}>{busy.sub}</span>
              )}
            </div>
          </div>,
          document.body,
        )}

        {/* ══ ★ 2026-11-03（方案 A）：上传校验不一致明细 ══
            列出具体寄存器 + 两边的值，用户可以直接把这几条发给开发定位。 */}
        {verifyIssues && createPortal(
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9200,
            background: 'rgba(6,8,11,0.78)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
          }}>
            <div style={{
              width: '100%', maxWidth: 384, maxHeight: '78vh',
              display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden',
              background: 'rgba(22,24,29,0.99)', border: '1px solid rgba(240,80,80,0.55)',
              boxShadow: '0 20px 56px rgba(0,0,0,0.75)',
              fontFamily: '"Barlow-Regular_2",sans-serif',
            }}>
              <div style={{ padding: '14px 16px 8px' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#F08A8A', letterSpacing: '0.02em' }}>
                  {lang === 'zh' ? '上传校验未通过' : 'Upload check failed'}
                </div>
                <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.55, color: '#c2c9d6' }}>
                  {lang === 'zh'
                    ? '已自动重发 2 轮，仍有以下参数与 App 保存的值不一致。请重试上传；若每次都一样，把这几条发我。'
                    : 'Retried twice. These registers still differ from the values saved in the app.'}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 8px' }}>
                {verifyIssues.map((it) => (
                  <div key={it.slot} style={{
                    marginTop: 8, padding: '8px 10px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid #454b55',
                  }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#C8D0DC' }}>
                      {hwSlotName(it.slot)}
                    </div>
                    {it.readFailed ? (
                      <div style={{ marginTop: 4, fontSize: 10.5, color: '#F0B429', lineHeight: 1.5 }}>
                        {lang === 'zh'
                          ? '设备回读无应答，无法校验（请确认固件是 1103 之后带「回读结束」事件的版本）'
                          : 'Device did not answer the read-back.'}
                      </div>
                    ) : (
                      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {it.diff.slice(0, 40).map((d) => (
                          <div key={d.addr} style={{ fontSize: 10.5, color: '#F08A8A', fontFamily: 'monospace' }}>
                            {describeDiff(d)}
                          </div>
                        ))}
                        {it.diff.length > 40 && (
                          <div style={{ fontSize: 10, color: '#7C8494' }}>
                            {lang === 'zh' ? `… 还有 ${it.diff.length - 40} 条` : `… and ${it.diff.length - 40} more`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ padding: '10px 16px 14px' }}>
                <button onClick={() => setVerifyIssues(null)} style={{
                  width: '100%', height: 40, borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(240,80,80,0.16)', border: '1px solid rgba(240,80,80,0.6)',
                  color: '#F08A8A', fontSize: 12.5, fontWeight: 800,
                }}>{lang === 'zh' ? '知道了' : 'OK'}</button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {/* ── 未连接蓝牙：锚定在选项上方的状态气泡（1.4s 消失） ── */}
        {connectHint && (
          <div style={{
            position: 'fixed', left: connectHint.x, top: connectHint.y,
            transform: 'translate(-50%, calc(-100% - 10px))',
            zIndex: 999, pointerEvents: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '7px 12px', borderRadius: 12,
            background: 'rgba(16,18,22,0.96)', border: '1px solid rgba(76,201,240,0.5)',
            boxShadow: '0 8px 26px rgba(0,0,0,0.7)',
            animation: 'langFadeIn 0.15s ease',
          }}>
            <span style={{ color: '#ffffff', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap' }}>{t('io.connectBt1')}</span>
            <span style={{ color: 'rgba(76,201,240,0.95)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap' }}>{t('io.connectBt2')}</span>
          </div>
        )}

        {/* ── BOTTOM MENU BAR · v5.2 三 tab（TONE / LIBRARY / PRESET · 原型样式） ── */}
        {/* ★★ 2026-11-17（全机型适配 · 底栏贴底）：#root 有 padding-bottom:--sa-bottom，
            以前底栏停在该 padding 上沿，真机（Home 指示条 34px）下方就露出一条
            页面底色的空白带，看着像"菜单没到底"。这里让底栏背景用负 margin 向下
            延伸穿过这段 padding 到物理屏底，同时用等量的 padding-bottom 把按钮
            内容顶回安全区上方 —— 既贴底又不被 Home 指示条挡住。
            sa-bottom=0 的机型（浏览器/Android 无手势条）计算后仍是原样，无副作用。 */}
        <div style={{
          /* ★ v4.31：底栏与顶栏、底板同色（--bfx-bar） */
          flexShrink: 0, background: 'var(--bfx-bar, #2c2f36)',
          borderTop: '1px solid var(--bfx-bar-line, #454b55)',
          display: 'flex', alignItems: 'stretch', gap: 4,
          padding: '3px 6px 5px',
          marginBottom: 'calc(-1 * var(--sa-bottom, 0px))',
          paddingBottom: 'calc(5px + var(--sa-bottom, 0px))',
        }}>
          {/* 1. TONE — 四分区音色链路首页 */}
          {/* ★ 2026-10-17（用户要求）：双击 = 复位默认配色，长按 600ms = 锁定/解锁配色。
              注意这里**不能再用 disabled** —— 禁用按钮不派发事件，手势会收不到；
              未连接蓝牙时仍然只是把单击忽略掉（外观保留 0.35 透明度）。 */}
          <button data-tour="btn-tone" className="bfx-tap"
            onPointerDown={() => {
              const r = tonePress.current;
              r.fired = false;
              if (r.timer) clearTimeout(r.timer);
              r.timer = setTimeout(() => {
                r.timer = null;
                r.fired = true;
                const locked = toggleAccentLock();
                showHint(locked ? 'lock' : 'unlock', t(locked ? 'theme.locked' : 'theme.unlocked'));
              }, 600);
            }}
            onPointerUp={() => {
              const r = tonePress.current;
              if (r.timer) { clearTimeout(r.timer); r.timer = null; }
            }}
            onPointerLeave={() => {
              const r = tonePress.current;
              if (r.timer) { clearTimeout(r.timer); r.timer = null; }
            }}
            onClick={() => {
              const r = tonePress.current;
              if (r.fired) { r.fired = false; return; }        // 长按已处理 → 吞掉这次点击
              const now = Date.now();
              if (now - r.last < 320) {                        // 双击 → 复位配色
                r.last = 0;
                resetAccents();
                showHint('reset', t('theme.reset'));
                return;
              }
              r.last = now;
              if (!uiConnected) return;
              setActivePanel(null);
            }}
            style={{ ...tabBtnStyle(activePanel === null && uiConnected), opacity: uiConnected ? 1 : 0.35, cursor: 'pointer' }}>
            <SlidersHorizontalIcon size={21} color={uiConnected && activePanel === null ? '#F06F21' : 'rgba(154,160,166,0.75)'} />
            <span style={tabLabelStyle(activePanel === null && uiConnected)}>{lang === 'zh' ? '音色' : 'TONE'}</span>
          </button>
          {/* 2. LOCAL — 本地库（最多 20 个 · 只存本地 · 与硬件完全隔离） */}
          {/* ★ 2026-10-26：底栏三个硬件键取消 `disabled`。
              disabled 的 button 根本不派发 click —— 里面那些 `showConnectHint(e)`
              全是死代码，未连接时点下去只有 0.35 透明度的"死键"，没有任何解释。 */}
          <button data-tour="btn-favorites" className="bfx-tap"
            onClick={(e) => { if (!uiConnected) { showConnectHint(e); return; } setActivePanel(p => p === 'library' ? null : 'library'); }}
            style={{ ...tabBtnStyle(activePanel === 'library' && uiConnected), opacity: uiConnected ? 1 : 0.35, cursor: uiConnected ? 'pointer' : 'not-allowed' }}>
            <LayoutGridIcon size={21} color={uiConnected && activePanel === 'library' ? '#F06F21' : 'rgba(154,160,166,0.75)'} />
            <span style={tabLabelStyle(activePanel === 'library' && uiConnected)}>{lang === 'zh' ? LOCAL_BANK_ZH : LOCAL_BANK_EN}</span>
            {/* ★ WO-17：已加载本地预设时在 tab 上显示状态点（不用外部提示） */}
            {bankApplied && (
              <span style={{
                position: 'absolute', top: 5, right: '22%', width: 6, height: 6, borderRadius: '50%',
                background: '#F06F21', boxShadow: '0 0 6px rgba(240,111,33,0.9)',
              }} />
            )}
          </button>
          {/* 3. PRESETS — 预设库 = 硬件 16 档位（★必须连接蓝牙：档位数据须与硬件一致，否则无法音色同步） */}
          <button
            data-tour="btn-presets"
            className="bfx-tap"
            onClick={(e) => {
              if (!uiConnected) { showConnectHint(e); return; }
              setActivePanel(p => p === 'presets' ? null : 'presets');
            }}
            style={{ ...tabBtnStyle(activePanel === 'presets' && uiConnected), opacity: uiConnected ? 1 : 0.35, cursor: uiConnected ? 'pointer' : 'not-allowed' }}>
            <HardDriveIcon size={21} color={uiConnected ? (activePanel === 'presets' ? '#F06F21' : 'rgba(154,160,166,0.75)') : 'rgba(154,160,166,0.45)'} />
            <span style={tabLabelStyle(activePanel === 'presets', uiConnected)}>{lang === 'zh' ? '预设库' : 'PRESETS'}</span>
            {/* ★ 2026-10-19（用户要求）：取消未连接时在右下角菜单显示「需连接 / NO BT」文字，
                置灰 + 点击弹连接提示已足够表达状态，多一行小字反而拥挤。 */}
          </button>
          {/* 4. COMMUNITY — 音色社区（★必须连接蓝牙：浏览 / 登录 / 试用 / 存入全部要连） */}
          <button
            data-tour="btn-community"
            className="bfx-tap"
            onClick={(e) => {
              if (!uiConnected) { showConnectHint(e); return; }
              setActivePanel(p => p === 'community' ? null : 'community');
            }}
            style={{ ...tabBtnStyle(activePanel === 'community' && uiConnected), opacity: uiConnected ? 1 : 0.35, cursor: uiConnected ? 'pointer' : 'not-allowed' }}>
            <GlobeIcon size={21} color={uiConnected ? (activePanel === 'community' ? '#F06F21' : 'rgba(154,160,166,0.75)') : 'rgba(154,160,166,0.45)'} />
            <span style={tabLabelStyle(activePanel === 'community', uiConnected)}>{lang === 'zh' ? '社区' : 'SOCIAL'}</span>
          </button>
        </div>
      </div>

    {/* ── DEBUG MODE PANEL ── */}
    {debugMode && (
      <DebugPanel
        visible={debugMode}
        onClose={() => setDebugMode(false)}
        onWrite={handleDebugWrite}
        logEntries={debugLogEntries}
        regCacheRef={regCacheRef}
        onApplyModule={handleDebugApplyModule}
        regTick={debugRegTick}
        ampLimit={debugAmpLimit}
        ampKey={subModelNames['amp-head']}
        cabKey={subModelNames['cabinet']}
      />
    )}

    {/* ── Exit confirmation dialog ── */}
    {showExitDialog && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#2c2f36', borderRadius: 16, border: '1px solid #454b55', padding: '26px 28px', textAlign: 'center', maxWidth: 300, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#F2F4F8', marginBottom: 8, fontFamily: '"Barlow-Regular_2",sans-serif' }}>{t('exit.title')}</div>
          <div style={{ fontSize: 13, color: '#c2c9d6', marginBottom: 20 }}>{t('exit.msg')}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => setShowExitDialog(false)} style={{ flex: 1, padding: '10px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid #454b55', color: '#F2F4F8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('exit.cancel')}</button>
            <button onClick={handleExit} style={{ flex: 1, padding: '10px 16px', borderRadius: 12, background: 'rgba(242,86,91,0.15)', border: '1px solid rgba(242,86,91,0.5)', color: '#FFAFB3', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('exit.confirm')}</button>
          </div>
        </div>
      </div>
    )}

    {/* ── Full-screen PDF viewer ── */}
    {fullScreenPdf && (
      <div style={{
        ...FULLSCREEN_SAFE_STYLE, zIndex: 200,
        background: '#525659', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(0,0,0,0.7)', flexShrink: 0 }}>
          <button onClick={() => setFullScreenPdf(null)} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 15, padding: '4px 8px' }}>← {t('btn.back')}</button>
          <span style={{ fontSize: 11, color: '#aaa' }}>{fullScreenPdf.name}</span>
          <div style={{ width: 28 }} />
        </div>
        <PdfViewer file={fullScreenPdf.file} />
      </div>
    )}

    {/* ── 开机教程浮层 (first-launch 自动播放 / 用户面板可重播) ── */}
    {tourOpen && (
      <TutorialOverlay
        steps={tourSteps}
        active={tourActive}
        onChange={setTourActive}
        onClose={closeTutorial}
        onAction={handleTourAction}
        lang={lang}
        onSetLang={setLang}
        labels={{ prev: t('tour.prev'), next: t('tour.next'), done: t('tour.done') }}
      />
    )}
    {/* ★ 2026-11-02：硬件按键教程（软件教程之后、首次连接时自动弹；可从用户面板重看） */}
    <HwGuidePanel
      open={hwGuideOpen}
      tutorial={hwGuideTutorial}
      onClose={closeHwGuide}
      lang={lang}
    />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

// ─── Bottom menu helpers ──────────────────────────────────────────────

/** v5.2 底栏 tab（3 项 · 原型样式：图标 + 小号大写字距标签 + 品牌橙选中态） */
/** ★ 2026-10-24：读取本地账号用户名（顶栏头像用）；未登录返回空串 */
function readAccountName(): string {
  // ★ v3.66：只认「本地有账号且有 uid」的登录态，避免旧版本残留的半截数据把顶栏点亮
  const acc = readLocalAccount();
  return acc ? acc.name : '';
}

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, height: 50, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 3, borderRadius: 12, cursor: 'pointer', border: 'none',
    background: active ? 'rgba(240,111,33,0.10)' : 'transparent',
    position: 'relative' as const, transition: 'all 0.12s',
  };
}
function tabLabelStyle(active: boolean, enabled = true): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.13em',
    fontFamily: '"Barlow-Regular_2", sans-serif', whiteSpace: 'nowrap',
    color: active ? 'rgb(240,111,33)' : enabled ? '#7C8494' : 'rgba(154,160,166,0.5)',
  };
}

/* ★ v3.67：本机昵称索引与「发码 → 校验 → 建号」流程已抽到 services/authLogin.ts，
   社区锁屏与账号页共用一份，避免两处各写一遍再分叉（v3.65 就是这么分叉的）。 */

// ─── User Profile Panel ────────────────────────────────────────────────

function UserPanel({ visible, onClose, onOpenManualFullScreen, onOpenTutorial, onOpenHwGuide, backRef, onAccountChange }: { visible: boolean; onClose: () => void; onOpenManualFullScreen?: (m: { name: string; file: string }) => void; onOpenTutorial?: () => void; onOpenHwGuide?: () => void; backRef?: { current: (() => void) | null }; onAccountChange?: () => void }) {
  const { t } = useI18n();
  /* ★ v3.67（2026-10-24 用户拍板）
     · 登录**一步完成** —— 未登录时这一页本身就是登录表单（与社区锁屏共用 LoginForm），
       不再「锁屏 → 跳到本页 → 再填一次」
     · **去掉头像** —— 不做上传、不取云存储，界面统一用昵称首字色块
     · **用户名可自行修改** —— 2–12 字，本机不重名，改完同步云端 users.name */
  const [acc, setAcc] = useState<Account | null>(() => readLocalAccount());
  const [showManuals, setShowManuals] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [saving, setSaving] = useState(false);

  // 每次打开都重新读一次：可能刚在社区锁屏里登录过
  useEffect(() => { if (visible) { setAcc(readLocalAccount()); setEditing(false); setNameErr(''); } }, [visible]);

  // 返回键：编辑态先退出编辑，再退出面板
  useEffect(() => {
    if (!backRef) return;
    backRef.current = editing ? () => setEditing(false) : null;
    return () => { backRef.current = null; };
  }, [backRef, editing]);

  const nameErrorText = (e?: string) => {
    if (e === 'empty') return t('user.nameEmpty');
    if (e === 'short' || e === 'long') return t('user.nameRule');
    if (e === 'chars') return t('user.nameChars');
    if (e === 'taken') return t('user.nameTaken');
    return t('user.nameErr');
  };

  const startEdit = () => { setDraft(acc?.name || ''); setNameErr(''); setEditing(true); };

  const commitName = async () => {
    if (saving) return;
    const check = validateName(draft);
    if (!check.ok) { setNameErr(nameErrorText(check.error)); return; }
    setSaving(true);
    const res = await renameUser(draft);
    setSaving(false);
    if (!res.ok) { setNameErr(nameErrorText(res.error)); return; }
    setAcc(readLocalAccount());
    setEditing(false);
    onAccountChange?.();   // 顶栏昵称立刻跟着变，不用等关面板
    notifyOk(t('user.nameSaved'));
  };

  const doLogout = () => {
    setAcc(null); setEditing(false); setNameErr('');
    (async () => {
      await signOutAccount();
      resetSignInFlag();
    })();
  };

  const manuals = [
    { name: 'BF2 说明书', file: 'BF2说明书.pdf' },
    { name: 'BF3G 说明书', file: 'BF3G说明书.pdf' },
    { name: 'GO 音箱 说明书', file: 'GO音箱说明书.pdf' },
    { name: 'POLY 耳机 说明书', file: 'POLY耳机说明书.pdf' },
    { name: 'mix 耳机 说明书', file: 'mix耳机说明书.pdf' },
  ];

  /* ★ 2026-11-19（真机报障）：原生端点击"浏览器"无反应或打开错误页。
     根因：'/docs/' + file 是**相对路径**，交给系统浏览器后解析成
     https://localhost/docs/... —— 本地资源在系统浏览器里根本不存在。
     App 内的"查看"（内置 PDF 阅读）是正常的，所以原生端直接不渲染该按钮，
     见下方 IS_WEB_PREVIEW 包裹。这里保留函数供网页预览使用。 */
  const openManualExternal = (file: string) => { window.open('/docs/' + file, '_system'); };

  if (!visible) return null;

  if (showManuals) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: '#31343b', zIndex: 51, display: 'flex', flexDirection: 'column', animation: 'panelFade 0.18s ease-out' }}>
        <PanelHeader
          title={t('panel.manual')}
          accent="rgb(180,160,255)"
          onClose={onClose}
          left={<button onClick={() => setShowManuals(false)} style={{ background: 'none', border: 'none', color: 'rgba(180,160,255,0.7)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>←</button>}
        />
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {manuals.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, marginBottom: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(220,60,60,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontSize: 15, fontWeight: 800, color: 'rgb(220,80,80)' }}>PDF</span></div>
              <span style={{ flex: 1, textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.8)', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{m.name}</span>
              <button onClick={() => onOpenManualFullScreen?.(m)} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(180,160,255,0.12)', border: '1px solid rgba(180,160,255,0.25)', color: 'rgba(180,160,255,0.85)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}><BookOpenIcon size={13} style={{ verticalAlign: '-2px' }} /> {t('manual.view')}</button>
              {/* 原生端不渲染：相对路径在系统浏览器里打不开，见 openManualExternal 注释 */}
              {IS_WEB_PREVIEW && (
                <button onClick={() => openManualExternal(m.file)} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(76,201,240,0.1)', border: '1px solid rgba(76,201,240,0.2)', color: 'rgba(76,201,240,0.8)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}><GlobeIcon size={13} style={{ verticalAlign: '-2px' }} /> {t('manual.browser')}</button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const card: React.CSSProperties = {
    background: '#2a2e37', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, padding: 16,
  };
  const rowBtn: React.CSSProperties = {
    height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.72)',
    fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: '"Barlow-Regular_2",sans-serif',
    display: 'flex', alignItems: 'center', gap: 9, padding: '0 14px', width: '100%', textAlign: 'left',
  };

  /* ★ 2026-11-16：未登录时不再用「面板内嵌表单」，直接复用社区那一套整屏登录页，
     保证两处入口观感、键盘行为、报错文案完全一致。 */
  if (!acc) {
    return (
      <LoginScreen
        title={t('panel.userProfile')}
        onSuccess={(a) => { setAcc(a); onAccountChange?.(); notifyOk(t('user.loginOk', { name: a.name })); }}
        onClose={onClose}
      />
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#31343b', zIndex: 51, display: 'flex', flexDirection: 'column', animation: 'panelFade 0.18s ease-out' }}>
      <PanelHeader title={t('panel.userProfile')} accent="#F06F21" onClose={onClose} />

      {/* ── 已登录 = 账号资料（无头像） ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }} className="no-scrollbar">
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.15em', color: '#7C8494', fontFamily: '"Barlow-Regular_2",sans-serif', marginBottom: 10 }}>
              {t('user.myAccount')}
            </div>

            {editing ? (
              <>
                <input
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value.slice(0, NAME_MAX)); setNameErr(''); }}
                  maxLength={NAME_MAX}
                  placeholder={t('user.namePlaceholder')}
                  style={{
                    width: '100%', height: 44, padding: '0 13px', boxSizing: 'border-box', borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)', border: `1px solid ${nameErr ? 'rgba(242,120,105,0.7)' : 'rgba(240,111,33,0.5)'}`,
                    color: '#F0F2F5', fontSize: 16, fontWeight: 700, outline: 'none',
                    fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                  <span style={{ fontSize: 11, color: nameErr ? 'rgba(242,120,105,0.95)' : '#7C8494', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                    {nameErr || t('user.nameRule')}
                  </span>
                  <span style={{ fontSize: 11, color: '#7C8494', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{draft.length}/{NAME_MAX}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => { setEditing(false); setNameErr(''); }} style={{
                    flex: 1, height: 42, borderRadius: 11, cursor: 'pointer',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.14)',
                    color: '#c2c9d6', fontSize: 12, fontWeight: 700, fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>{t('btn.cancel')}</button>
                  <button onClick={commitName} disabled={saving} style={{
                    flex: 1, height: 42, borderRadius: 11, border: 'none', cursor: saving ? 'default' : 'pointer',
                    background: saving ? 'rgba(240,111,33,0.35)' : '#F06F21',
                    color: '#3b281c', fontSize: 12, fontWeight: 800, fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>{saving ? t('user.saving') : t('user.saveName')}</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 19, fontWeight: 800, color: '#F0F2F5', fontFamily: '"Barlow-Regular_2",sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acc.name}
                  </span>
                  <button onClick={startEdit} style={{
                    height: 32, padding: '0 13px', borderRadius: 10, cursor: 'pointer', flexShrink: 0,
                    background: 'rgba(240,111,33,0.12)', border: '1px solid rgba(240,111,33,0.4)',
                    color: '#F06F21', fontSize: 11, fontWeight: 750, fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>{t('user.editName')}</button>
                </div>
                <div style={{ marginTop: 9, fontSize: 11, color: '#7C8494', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.04em' }}>
                  {acc.phone ? `${acc.phone.slice(0, 3)} **** ${acc.phone.slice(-4)}` : ''}
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>
            <button onClick={() => setShowManuals(true)} style={rowBtn}><BookOpenIcon size={15} strokeWidth={1.9} /> {t('panel.manual')}</button>
            {onOpenTutorial && (
              <button onClick={onOpenTutorial} style={rowBtn}><GraduationCapIcon size={15} strokeWidth={1.9} /> {t('panel.tutorial')}</button>
            )}
            {onOpenHwGuide && (
              <button onClick={onOpenHwGuide} style={rowBtn}>
                <GraduationCapIcon size={15} strokeWidth={1.9} />
                {t('panel.hwGuide')}
              </button>
            )}
            <button onClick={doLogout} style={{
              ...rowBtn, marginTop: 4, justifyContent: 'center',
              background: 'rgba(242,86,91,0.08)', border: '1px solid rgba(242,86,91,0.28)',
              color: 'rgba(255,130,130,0.95)',
            }}>{t('user.logout')}</button>
          </div>

          <div style={{ marginTop: 16, fontSize: 11, color: '#5C636E', fontFamily: '"Barlow-Regular_2",sans-serif', lineHeight: 1.8, textAlign: 'center' }}>
            {t('user.nameSyncHint')}
          </div>
      </div>
    </div>
  );
}

// ─── PDF Viewer (pdf.js CDN) ────────────────────────────────────────

function PdfViewer({ file }: { file: string }) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(100);
  const [landscape, setLandscape] = useState(false);
  const [canvasCssW, setCanvasCssW] = useState(0);
  const [canvasCssH, setCanvasCssH] = useState(0);
  const pdfDocRef = useRef<any>(null);
  const [, setRerender] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const scriptId = 'pdfjs-script';
    const existing = document.getElementById(scriptId);
    const loadPdf = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) { if (!cancelled) setError(t('pdf.engineFail')); setLoading(false); return; }
      pdfjsLib.getDocument('/docs/' + file).promise.then((doc: any) => {
        if (cancelled) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setPageNum(1);
        renderPage(1, doc, canvasRef, zoom, landscape, window.innerWidth, window.innerHeight, (cssW, cssH) => { setCanvasCssW(cssW); setCanvasCssH(cssH); setLoading(false); });
      }).catch(() => { if (!cancelled) { setError(t('pdf.loadFail')); setLoading(false); } });
    };

    if (existing) {
      if ((window as any).pdfjsLib) loadPdf();
      else existing.addEventListener('load', loadPdf);
    } else {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = loadPdf;
      script.onerror = () => { if (!cancelled) { setError(t('pdf.downloadFail')); setLoading(false); } };
      document.head.appendChild(script);
    }

    return () => { cancelled = true; };
  }, [file]);

  const goPage = (delta: number) => {
    const next = Math.max(1, Math.min(numPages, pageNum + delta));
    setPageNum(next);
    if (pdfDocRef.current) renderPage(next, pdfDocRef.current, canvasRef, zoom, landscape, window.innerWidth, window.innerHeight, (cssW, cssH) => { setCanvasCssW(cssW); setCanvasCssH(cssH); });
  };

  // Re-render on zoom/landscape change immediately
  useEffect(() => {
    if (pdfDocRef.current) {
      const w = landscape ? window.innerHeight : window.innerWidth;
      const h = landscape ? window.innerWidth : window.innerHeight;
      renderPage(pageNum, pdfDocRef.current, canvasRef, zoom, landscape, w, h,
        (cssW, cssH) => { setCanvasCssW(cssW); setCanvasCssH(cssH); });
    }
  }, [zoom, landscape, pageNum]);

  // Re-render on window resize
  useEffect(() => {
    const onResize = () => {
      setRerender(n => n + 1);
      if (pdfDocRef.current) {
        const w = landscape ? window.innerHeight : window.innerWidth;
        const h = landscape ? window.innerWidth : window.innerHeight;
        renderPage(pageNum, pdfDocRef.current, canvasRef, zoom, landscape, w, h,
          (cssW, cssH) => { setCanvasCssW(cssW); setCanvasCssH(cssH); });
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); };
  }, [pageNum, zoom, landscape]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#525659', position: 'relative' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', flexShrink: 0 }}>
        {numPages > 1 && !loading && !error && (
          <>
            <button onClick={() => goPage(-1)} style={pdfBtnStyle}>◀</button>
            <span style={{ color: '#ccc', fontSize: 11, minWidth: 44, textAlign: 'center' }}>{pageNum}/{numPages}</span>
            <button onClick={() => goPage(1)} style={pdfBtnStyle}>▶</button>
          </>
        )}
        <div style={{ flex: 1 }} />
        {!loading && !error && (
          <>
            <button onClick={() => setZoom(z => Math.max(50, z - 25))} style={pdfBtnStyle}>−</button>
            <span style={{ color: '#ccc', fontSize: 11, minWidth: 36, textAlign: 'center' }}>{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(400, z + 25))} style={pdfBtnStyle}>+</button>
            <button onClick={() => setLandscape(v => !v)} style={{ ...pdfBtnStyle, fontSize: 11, padding: '4px 10px' }}>
              {landscape ? <SmartphoneIcon size={14} /> : <RotateCcwIcon size={14} />}
            </button>
          </>
        )}
      </div>
      {/* Canvas area — scrollable with full bidirectional access, landscape sizes wrapper to rotated dims */}
      <div ref={containerRef} style={{
        flex: 1, overflow: 'auto', padding: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {loading && <div style={{ color: '#ccc', padding: 40, fontSize: 13 }}>{t('preset.loading')}</div>}
        {error && <div style={{ color: '#f88', padding: 40, fontSize: 13, textAlign: 'center' }}>{error}</div>}
        <div style={{
          // In landscape: wrapper sized to contain rotated canvas
          width: landscape && canvasCssH ? canvasCssH + 16 : 'auto',
          height: landscape && canvasCssW ? canvasCssW + 16 : 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          minWidth: landscape ? undefined : '100%',
        }}>
          <canvas ref={canvasRef} style={{
            display: loading || error ? 'none' : 'block',
            transform: landscape ? 'rotate(90deg)' : 'none',
            transformOrigin: 'center center',
          }} />
        </div>
      </div>
    </div>
  );
}

const pdfBtnStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.1)',
  border: 'none', color: '#F2F4F8', cursor: 'pointer', fontSize: 13,
};

function renderPage(
  num: number, doc: any, canvasRef: React.RefObject<HTMLCanvasElement | null>,
  zoomPercent: number, landscape: boolean, containerW: number, containerH: number,
  onDone?: (cssW: number, cssH: number) => void,
) {
  doc.getPage(num).then((page: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const vp = page.getViewport({ scale: 1.0 });
    const availW = landscape ? (containerH - 16) : (containerW - 16);
    const fitScale = availW / vp.width;
    const scale = fitScale * (zoomPercent / 100) * dpr;
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const cssW = viewport.width / dpr;
    const cssH = viewport.height / dpr;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    page.render({ canvasContext: ctx, viewport }).promise.then(() => onDone?.(cssW, cssH));
  }).catch(() => onDone?.(0, 0));
}