/**
 * BFX1 本地预设库（LIBRARY · v9 · 2026-10-22）
 *
 * ★★★ 2026-10-30（用户要求）：本地库是**独立音色库**，标号一律 1–16，
 *   不再冒充硬件的 A/B/C/D 分组（A 组 1–4 是锁定基准、不可覆盖）。
 *   上传时才用硬件频道名：**只能整组**选 B/C/D 其中一组（2026-11-03 起取消单频道上传）。
 *
 * ★★ v3.52 用户拍板（与预设库完全同构，方便对照调试）：
 *   · 每屏 4 格，组头色点 + 选中金色，不可达置灰
 *   · 可点范围（定死）：本屏 4 格任意切（本地库只发参数、不发 EE）
 *   · 可点格子右下角显示切换延迟
 *   · 底部固定两键：「保存本地」「上传硬件」
 *   · 长按格子 0.5 s → 顶部出现重命名输入行
 *   · 本地库是草稿箱：点格子只发 EA 参数，**不发 EE**，硬件频道号不变
 *
 * 存储：services/localPresets.ts 的 bfx_localBank16
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useI18n } from '../i18n';
import { seedLocalBankOnce, restoreLocalBankTwinSlotsOnce } from '../data/builtinPresets';
import { PanelHeader } from '../ui/PanelHeader';
/* ★ 2026-11-05（用户拍板「统一整改」）：通用弹窗容器 —— 卡片限高 + 中间可滚动 +
   底部固定，解决小屏/大字体下"上传确认框显示不全"。 */
import { ModalCard, ModalBody, ModalFooter } from './ModalCard';
import {
  loadBankSlots, saveBankSlot, clearBankSlot, renameBankSlot,
  getLocalBankApplied, setLocalBankApplied,
  diffRegisterCount, restoreLocalBankItem,
  type BankItem, type LocalPreset, LOCAL_BANK_MAX,
} from '../services/localPresets';
/* ★★★ 2026-10-30（用户要求：本地库与预设库的频道延迟时间要对应真实值）：
   两个库现在共用 data/switchCost.ts 的**固件真实模型**
     cost = 250ms 固定 + 参数帧 × 10ms + 旁路帧 × 300ms
   旧口径 `n × 15 + 150` 不区分旁路帧，而固件对旁路/重建帧要等 500ms 窗口 ——
   组内一条 33 帧含 4 旁路的边，旧算法 645ms、实际 1.8s。 */
import { BYPASS_ADDRS } from '../data/passThrough';
import { switchCostMs } from '../data/switchCost';

const BYPASS_ADDR_SET = new Set<number>(BYPASS_ADDRS);
/* ★ 2026-11-04（用户拍板）：导出预设 与 JSON 导入按键都已移除 ——
   底部只保留「保存本地」「整组上传」两个动作。 */
import { notifyOk, notifyErr } from '../services/feedback';
/* ★★ v3.70：预存切换包 —— 保存 / 导入 / 清空后立刻重建，切换时零判定直发 */
import { getPack, rebuildPacks } from '../services/switchPacks';
/* ★★★ 2026-11-03（用户拍板）：整组上传闸门 —— 4 格必须非空、且同箱头同箱体 */
import { checkGroupModels, groupCheckReason } from '../services/uploadGuard';
import { LOCAL_BANK_ZH, LOCAL_BANK_EN } from '../config/bankLabels';

const GOLD = '#f0b429';
const APPLIED = '#F06F21';
const LINE = '#454b55';
/** 组色只用来区分「每屏 4 格」，不再代表硬件的 A/B/C/D 组 */
const GROUP_COLORS = ['#F2F4F8', '#3ddc84', '#e2c044', '#4cc9f0'];

/* ★★★ 2026-10-30（用户要求）：本地库是**独立音色库**，不再按硬件 A/B/C/D 分组标注 ——
   硬件 A 组（1–4）是直通基准、不可覆盖，本地库却沿用同一套 ABCD 会让人以为
   「本地库 A 组 = 硬件 A 组」。现在本地库一律按 **1–16** 标号，上传时再让用户选目标。 */
const slotLabel = (s: number) => String(s);
/** 硬件频道号 —— 与预设库同一套写法：组号 1–4 + 组内 a–d（如 2a / 3c / 4d）。
 *  只用于「上传到哪个频道」这种必须与机器对号的地方；本地库自己的 16 格仍显示 1–16。 */
const hwLabel = (s: number) => `${Math.floor((s - 1) / 4) + 1}${['a', 'b', 'c', 'd'][(s - 1) % 4]}`;
/** 每屏 4 格的区间标题，如 "1–4" */
const bankName = (g: number) => `${g * 4 + 1}–${g * 4 + 4}`;
const UPLOAD_GROUPS = [1, 2, 3];       // 组下标 1/2/3 = 第 5–8 / 9–12 / 13–16 格

/* ★ 2026-11-04（用户拍板）：按键上的切换延迟角标已全部移除，fmtMs 一并删除。 */

/** 回退分支（没有预存包时）：按差异地址里有多少旁路帧估算
 *  ★ 2026-10-30：固件快切表尾部固定带 7 条「合唱/延迟参数预置帧」（216–220/222/223），
 *    即使值相同也会写 —— 这里必须算进去，否则角标比实际少 70ms。 */
const PRELOAD_PARAMS = [216, 217, 218, 219, 220, 222, 223];
function diffCostMs(fromRegs: Record<number, number>, toRegs: Record<number, number>): number {
  const keys = new Set<number>([...Object.keys(fromRegs), ...Object.keys(toRegs)].map(Number));
  let frames = 0;
  let bypass = 0;
  keys.forEach((k) => {
    if (fromRegs[k] === toRegs[k]) return;
    frames++;
    if (BYPASS_ADDR_SET.has(k)) bypass++;
  });
  for (const a of PRELOAD_PARAMS) {
    if (fromRegs[a] === toRegs[a]) frames++;   // 差异里没有 → 固件仍会补这一帧
  }
  return switchCostMs(frames, bypass);
}

interface Props {
  visible: boolean;
  onClose: () => void;
  getCurrentTone: () => LocalPreset | null;
  /* ★★ v3.75（H7）：返回 boolean（或 void 视为成功）—— 见 pickSlot 的落定逻辑 */
  onApply: (data: LocalPreset) => Promise<boolean> | void;
  /** 上传覆盖到预设库目标槽（Index 负责写 bfx_presets + EB 落盘）
   *  ★ 2026-10-26：改回 Promise<boolean> —— 旧实现返回 void，本页在调用后
   *  立刻 flash('已上传到硬件 A1')，未连接 / 忙碌时硬件 0 字节却报成功，
   *  而且这条成功胶囊会按同一 OP_ID 覆盖掉 Index 那条真实的「请先连蓝牙」。
   *  ★★ 2026-10-30（用户要求）：新增 dst —— 目标硬件频道（5–16，A 组锁定）。
   *   mode='one' 时 dst 是单个频道；mode='group' 时 dst 是目标组的第 1 格。 */
  onUploadToPreset?: (slot: number, mode?: 'one' | 'group', dst?: number) => Promise<boolean> | void;
}

export default function LocalBankPage({ visible, onClose, getCurrentTone, onApply, onUploadToPreset }: Props) {
  const { lang } = useI18n();
  const [slots, setSlots] = useState<BankItem[]>(() => {
    try { seedLocalBankOnce(); } catch { /* ignore */ }
    /* ★★★ 2026-10-31：撤销上一版对 1–4 格的线材覆盖，恢复本地库自己的 Twin 四档 */
    try { restoreLocalBankTwinSlotsOnce(); } catch { /* ignore */ }
    return loadBankSlots();
  });
  const [cur, setCur] = useState<number>(() => {
    const applied = getLocalBankApplied();
    if (applied) return applied;
    const it = loadBankSlots().find((x) => x.data !== null);
    return it ? it.slot : 1;
  });
  /* ★ v3.59（F9，2026-10-24 用户拍板）：只显示当前编组，用 BANK 键循环切换 A→B→C→D→A */
  const [bank, setBank] = useState(0);
  /* ★★ v3.68（用户拍板 ABCD）：本地库不再自绘提示条 —— 统一走底部胶囊。
     notice state 与自绘节点都已删除，flash 直接转发到 services/feedback.ts。 */
  const flash = (text: string, ok = true) => { if (ok) notifyOk(text); else notifyErr(text); };
  const [renamingSlot, setRenamingSlot] = useState<number | null>(null);
  const [renameText, setRenameText] = useState('');
  /* ★★ v3.62（2026-10-24 用户拍板）：保存 / 上传都要有确认提示框 ——
       保存：告知保存位置 + 重命名方式（长按格子 0.5 秒）
       上传：告知这是把当前频道参数以 EB 发给硬件，并整组同步 4 格 */
  const [dlg, setDlg] = useState<'save' | 'upload' | null>(null);
  /* ★★★ 2026-11-03（用户拍板）：**取消单频道上传，只保留整组上传**。
       原因：单格写入会让目标组内 4 格箱头/箱体型号不一致，
       固件切档就得重建箱头 + 35 段箱体，组内快切直接失效。
       现在弹框只有一步：选 B/C/D 哪一组（A 组 1–4 是直通基准，不可覆盖）。 */
  const [upDst, setUpDst] = useState<number | null>(null);
  /** 保存框里编辑中的名称（默认取当前格名字，用户可改） */
  const [saveName, setSaveName] = useState('');
  const holdTimer = useRef<number | null>(null);
  const heldRef = useRef(false);

  const reload = () => setSlots(loadBankSlots());

  /* 当前槽位变化（载入/切格）→ BANK 自动跟到所在组，避免面板停在别的组 */
  useEffect(() => { setBank(Math.floor((cur - 1) / 4)); }, [cur]);

  /* ★★ v3.77（P4）：长按定时器必须随卸载清掉 —— 旧实现只在下一次
     startHold / endHold 里 clearTimeout，面板关闭那一刻若正好按着格子，
     定时器会在已卸载组件上跑 setRenamingSlot / setRenameText。 */
  useEffect(() => () => {
    if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
  }, []);

  /* ★★★ v3.77（P1）：延迟角标一次算好，别再放进渲染体里
   *
   * 旧实现：4 个格子各自的渲染分支里直接调 `delayOf(s)` → `getPack(cur, s)`
   * → `ensurePacks()` → `loadBankSlots()`（整库 JSON 反序列化）+ `bankSig()`
   * （16 格逐个求寄存器指纹，每格还要对约 110 个 key 排序）→ **一次渲染跑 4 遍**。
   * 而本地库里有长按计时、确认弹框、导出进度等一堆 state，任何一次变化都重渲染。
   *
   * 现在：只依赖 `cur / bank / slots`，其余 state 变化一律命中缓存。
   * ⚠ 必须放在 `if (!visible) return null` 之前 —— 否则违反 hooks 调用顺序。 */
  /* ★ 2026-11-04（用户拍板）：**按键不再显示切换延迟角标**，这段逐格计算一并移除。 */

  if (!visible) return null;

  const curItem = slots.find((x) => x.slot === cur) ?? slots[0];
  const hasData = !!curItem?.data;

  /* ── 可点范围（与预设库同一套规则，v3.52 定死）──
     组内前 / 组内后 / **下一组第 1 格**（换组入口，必须亮起可切） */
  const gCur = Math.floor((cur - 1) / 4);

  /* ★★★ 2026-11-03（用户拍板）：整组上传闸门。
     三条硬条件：4 格都有音色 + 都有型号 + 同箱头同箱体。
     参数（GAIN/EQ/效果器）不同没关系 —— 那正是组内 4 档的意义；
     只有型号变了才会让固件重建箱头/箱体、快切失效。
     ⚠ 源组取 **当前显示的这一屏（bank）**，不是"当前格所在的组"：
       用户可能用 BANK 翻到下一屏再上传，弹框里列的就是那一屏的 4 格，
       必须所见即所传。 */
  const srcFirst = bank * 4 + 1;
  const upCheck = checkGroupModels(
    [0, 1, 2, 3].map((k) => slots.find((x) => x.slot === srcFirst + k) ?? null),
    srcFirst,
  );
  const upReason = groupCheckReason(upCheck, lang === 'en');
  const idxCur = (cur - 1) % 4;
  const prevS = gCur * 4 + ((idxCur + 3) % 4) + 1;
  const nextS = gCur * 4 + ((idxCur + 1) % 4) + 1;
  const nextGroupS = ((gCur + 1) % 4) * 4 + 1;
  /* ★S3：新增「上一组第 1 格」入口（与方向键上翻对应） */
  const prevGroupS = ((gCur + 3) % 4) * 4 + 1;
  /* ★★★ 2026-10-30（用户要求）：**本地库四格任意可切**。
   *   本地库是草稿箱：点格子只发 EA 差异包、**不发 EE**，硬件频道号不变，
   *   所以不存在"硬件只能顺序前后切"这个约束 —— 那个限制只对预设库成立。
   *   （上一组 / 下一组两个按钮仍保留，用来翻组浏览另外 12 格。）
   *   代价：跨得越远差异帧越多（A1→D4 可能接近全量），角标已按真实帧数显示。 */
  const reachable = (s: number) => s !== cur;

  /* ★★★ BANK 键 = 【双向切换】（v3.71 用户拍板）
   *
   * 用户原话：「修改本地库和预设库的下一组音色切换按键，只能切换到下一组显示，
   *            再次点击按键就切换回原编组，这样就不会出现切换到无法选择的组的问题了。」
   *
   * ★ 它存在的**唯一理由**：下一组的第 1 格是换组入口、必须可切，但面板只显示本组
   *   4 格 → 不翻过去就点不到它。所以「下一组」= 把 B1 亮出来给你点，
   *   「返回」= 点完回去继续弹。⛔ 它绝不是"纯浏览"：翻过去 B1 一定可点。 */
  const nextHomeBank = (gCur + 1) % 4;
  const prevHomeBank = (gCur + 3) % 4;
  /** true = 面板停在任何**非当前组**的编组上（此时上下两键都变成「返回」） */
  const browsing = bank !== gCur;
  /** 下一组键的目标（浏览中 = 返回当前组） */
  const bankTarget = browsing ? gCur : nextHomeBank;
  /** ★ 2026-11-04：上一组键的目标 —— 浏览中同样返回当前组，与下键对称 */
  const prevBankTarget = browsing ? gCur : prevHomeBank;

  /* 延迟角标已上移到 `delays`（v3.77 / P1）—— 这里不再做逐格计算。 */

  /* ── 操作 ── */
  /** 「保存本地」→ 先弹提示框（告知位置 + 重命名方式），确认后才落盘 */
  const openSave = () => {
    setSaveName(curItem?.name || `音色 ${cur}`);
    setDlg('save');
  };

  const doSave = () => {
    const tone = getCurrentTone();
    if (!tone) { flash('读取当前音色失败', false); return; }
    const name = saveName.trim() || curItem?.name || `音色 ${cur}`;
    saveBankSlot(cur, name, tone);
    /* ★★ v3.70：保存时把所有「前后切换要改哪些参数 + 要不要静音」算好并存起来
       （用户要求：保存后切换不做任何判定）。重建 48 条边是毫秒级，放这里最合适。 */
    rebuildPacks();
    reload();
    setDlg(null);
    flash(`已保存到 ${slotLabel(cur)}`);
  };

  /** 「上传硬件」→ 直接选 B/C/D 目标（只有整组上传；不合格时框内直接说明原因） */
  const openUpload = () => {
    if (!onUploadToPreset) { flash('上传通道未就绪', false); return; }
    setUpDst(null);
    setDlg('upload');
  };

  const doUpload = () => {
    if (!upDst) return;
    if (!onUploadToPreset) { setDlg(null); flash('上传通道未就绪', false); return; }
    /* ★ 2026-11-03：上传前最后一道闸 —— 空槽 / 缺型号 / 型号不一致一律不发一帧 */
    if (!upCheck.ok) { flash(upReason, false); return; }
    const dst = upDst;
    setDlg(null);
    setUpDst(null);
    /* ★ 2026-10-26（P1 修复）：先等结果再报成功。
       旧实现 `onUploadToPreset(cur); flash('已上传到硬件 A1')` —— 未连接时
       Index 先 notifyInfo(请先连蓝牙) 再 return，紧接着被这条成功胶囊按
       同一 OP_ID 覆盖掉；isBusy() 时 Index 静默 return，界面照样说成功。
       成功提示统一由 Index 的 notifyOk（带"整组已上传 N 格"）负责，这里不再自报。 */
    const r = onUploadToPreset(upCheck.first, 'group', dst) as unknown;
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      void (r as Promise<boolean | void>);
    }
  };

  /* ★★ v3.68：清空确认改为**自绘弹框**（原先 window.confirm 是系统原生框，
     样式与应用完全两套，也是用户说的「提示不统一」的一部分）。 */
  const [clearOpen, setClearOpen] = useState(false);
  /* ★★ v3.81（P2-8）：清空后的撤销快照，5 秒自动消失 */
  const [undoClear, setUndoClear] = useState<{ item: BankItem } | null>(null);
  useEffect(() => {
    if (!undoClear) return;
    const t = setTimeout(() => setUndoClear(null), 5000);
    return () => clearTimeout(t);
  }, [undoClear]);
  const doClear = () => {
    if (!hasData) return;
    setClearOpen(true);
  };
  const doClearConfirmed = () => {
    /* ★★ v3.81（P2-8）：清空前留一份快照，5 秒内可撤销。
       原来只有二次确认、没有撤销 —— `restoreLocalBankItem` 早就写好了却全项目零调用，
       用户误删一个手调两小时的音色只能重做。 */
    const before = slots.find((x) => x.slot === cur) ?? null;
    clearBankSlot(cur);
    rebuildPacks();          // ★ v3.70：空格不再有出边/入边，重建一次
    reload();
    setClearOpen(false);
    if (before?.data) setUndoClear({ item: before });
    flash(`${slotLabel(cur)} 已清空`);
  };

  const doUndoClear = () => {
    const u = undoClear;
    setUndoClear(null);
    if (!u) return;
    /* 该槽此刻必须仍为空 —— 若用户清空后又存了新音色，restore 会拒绝 */
    if (restoreLocalBankItem(u.item)) {
      rebuildPacks();
      reload();
      notifyOk(`${slotLabel(u.item.slot)} 已恢复`, 2000);
    } else {
      notifyErr('无法恢复：该槽已被占用', 2600);
    }
  };

  const commitRename = () => {
    if (renamingSlot === null) return;
    renameBankSlot(renamingSlot, renameText);
    setRenamingSlot(null);
    reload();
    flash('已重命名');
  };

  /* ★ 2026-11-04（用户拍板）：导出预设（三格式 / JSON 备份）与 JSON 导入整条链路已移除，
     底部只保留「保存本地」「整组上传」—— 回到"这两个动作之外不写文件"的简单口径。 */

  /* ── 长按 0.5s 重命名 ── */
  const startHold = (s: number, hasTone: boolean) => {
    if (!hasTone) return;
    heldRef.current = false;
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      const it = slots.find((x) => x.slot === s);
      setRenamingSlot(s);
      setRenameText(it?.name ?? '');
    }, 500);
  };
  const endHold = () => {
    if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
  };

  const pickSlot = async (s: number) => {
    if (heldRef.current) { heldRef.current = false; return; }   // 长按已触发重命名，吞掉这次点击
    /* ★★ v3.81（P2-10）：点当前格静默返回（原来会弹「只能组内前后切换…」） */
    if (s === cur) return;
    const it = slots.find((x) => x.slot === s);
    if (!it?.data) { flash(`${slotLabel(s)} 是空格`, false); return; }
    /* ★★ v3.75（H7）：**先下发、成功后才落定高亮**。
       旧实现先 setCur + setLocalBankApplied 再调 onApply，而 applyLoadedTone 在
       「未连接 / 正在写（isBusy，切档后 1.7s 窗口内是常态）」时静默 return
       → 界面高亮已切、`已加载`标记已打、下次 getPack(cur,…) 的起点也前移到目标格，
       而硬件一个字节都没变，后面每次切换都基于错误起点。
       `onApply` 现在返回 boolean；undefined（老调用方）按成功处理，保持兼容。 */
    const ok = await onApply({ ...it.data, slot: it.slot });
    if (ok === false) {
      flash('下发失败，未切换（请检查连接后重试）', false);
      return;
    }
    setCur(s);
    setLocalBankApplied(s);
  };

  return (
    /* ★ v3.61（2026-10-24 用户拍板）：面板收缩为「内容高度卡片」，不再全屏铺满留一大片空。
       ★ 2026-11-05（统一整改）：卡片改用 ModalCard —— 中间内容超长时在 ModalBody 内滚动，
       底部「保存本地 / 整组上传」永远可见；弹窗遮罩同时带安全区 padding。 */
    <ModalCard zIndex={60} maxWidth={520} background="#242933" borderColor={LINE}>
      <PanelHeader title={lang === 'en' ? LOCAL_BANK_EN : LOCAL_BANK_ZH} accent={GOLD} onClose={onClose} />

      {/* 长按重命名：顶部临时输入行（不挤占格子） */}
      {renamingSlot !== null && (
        <div style={{ padding: '6px 10px', display: 'flex', gap: 6, alignItems: 'center', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: GOLD, fontFamily: '"Barlow-Regular_2",sans-serif' }}>
            {slotLabel(renamingSlot)}
          </span>
          <input
            autoFocus value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingSlot(null); }}
            maxLength={16}
            style={{
              flex: 1, height: 32, padding: '0 8px', borderRadius: 8,
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${GOLD}`,
              color: '#F2F4F8', fontSize: 13, outline: 'none', boxSizing: 'border-box',
            }} />
          <button onClick={commitRename} style={{
            height: 32, padding: '0 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'rgba(240,180,41,0.18)', color: GOLD, fontSize: 11, fontWeight: 800,
          }}>确定</button>
        </div>
      )}

      {/* ★ v3.61：频道键竖矩形（固定高 104），下面 BANK 大键拉长成整行一条（同高）。
          ★ 2026-11-05：内容区改为 ModalBody（唯一可滚动区），小屏不再裁切。 */}
      <ModalBody style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 12px 0' }}>
        {/* ★★★ 2026-10-30（用户要求）：**「上一组」上移到频道格之上** ——
            与下方「下一组」大键一上一下对称，翻组方向一目了然。
            （原来挂在频道格下面，和"下一组"挤在一起，看不出是往回翻。） */}
        <button
          onClick={() => setBank(prevBankTarget)}
          title={browsing
            ? (lang === 'en' ? `Back to ${bankName(prevBankTarget)}` : `返回 ${bankName(prevBankTarget)}`)
            : (lang === 'en' ? 'Previous bank' : '上一组')}
          style={{
            width: '100%', height: 44, borderRadius: 10, cursor: 'pointer',
            background: browsing ? `${GROUP_COLORS[prevBankTarget]}12` : 'rgba(255,255,255,0.02)',
            border: `1px dashed ${GROUP_COLORS[prevBankTarget]}66`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.12s',
          }}>
          <span style={{ fontSize: 20, lineHeight: 1, color: `${GROUP_COLORS[prevBankTarget]}99`, marginRight: 2 }}>{browsing ? '›' : '‹'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#6E7686',
            fontFamily: '"Barlow-Regular_2",sans-serif' }}>{browsing ? (lang === 'en' ? 'BACK' : '返回') : (lang === 'en' ? 'PREV' : '上一组')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: GROUP_COLORS[prevBankTarget], flexShrink: 0 }} />
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.04em',
              color: GROUP_COLORS[prevBankTarget], fontFamily: '"Barlow-Regular_2",sans-serif' }}>
              {bankName(prevBankTarget)}
            </span>
          </span>
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[0, 1, 2, 3].map((i) => {
              const s = bank * 4 + i + 1;
              const it = slots.find((x) => x.slot === s);
              const on = s === cur;
              const ok = reachable(s);
              /* ★★ v3.81（P2-10）：不可达格禁用，与预设库口径一致。
                 ⚠ 不能用 `disabled={!ok}` —— `reachable(cur)` 恒为 false（它要求 s !== cur），
                 那样会把**当前格的长按重命名**一起废掉。当前格保留可交互，点击由 pickSlot 静默吞掉。 */
              const locked = !ok && !on;
              return (
                <button key={s}
                  disabled={locked}
                  onClick={() => { void pickSlot(s); }}
                  onPointerDown={() => startHold(s, !!it?.data)}
                  onPointerUp={endHold}
                  onPointerLeave={endHold}
                  style={{
                    position: 'relative', width: '100%', height: 104, borderRadius: 12,
                    cursor: ok ? 'pointer' : 'default',
                    background: on ? 'rgba(240,180,41,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${on ? GOLD : LINE}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                    transition: 'all 0.12s', overflow: 'hidden', padding: '0 4px',
                    opacity: ok || on ? 1 : 0.3,
                    filter: ok || on ? 'none' : 'grayscale(1)',
                  }}>
                  <span style={{
                    fontSize: 15, fontWeight: 800, color: on ? GOLD : '#c2c9d6',
                    fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>{slotLabel(s)}</span>
                  <span style={{
                    fontSize: 11, color: on ? GOLD : '#7C8494',
                    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 3px',
                  }}>{it?.data ? it.name : (lang === 'en' ? 'EMPTY' : '空')}</span>
                </button>
              );
            })}
        </div>

        {/* ★ v3.61：BANK 大键拉长成一条 —— 宽度 = 四键合计（整行），高度与频道键相同（104）
            ★★ v3.71：改成双向切换 —— 停在原组时显示「下一组」，停在下组时显示「返回」 */}
        <button
          onClick={() => setBank(bankTarget)}
          title={browsing
            ? (lang === 'en' ? `Back to ${bankName(bankTarget)}` : `返回 ${bankName(bankTarget)}`)
            : (lang === 'en' ? `Switch to ${bankName(bankTarget)}` : `切换到 ${bankName(bankTarget)}`)}
          style={{
            width: '100%', height: 104, borderRadius: 12, cursor: 'pointer',
            background: browsing ? `${GROUP_COLORS[bankTarget]}12` : 'rgba(255,255,255,0.02)',
            border: `1px dashed ${GROUP_COLORS[bankTarget]}88`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '0 14px', overflow: 'hidden', transition: 'all 0.12s',
          }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#6E7686',
            fontFamily: '"Barlow-Regular_2",sans-serif',
          }}>{browsing
            ? (lang === 'en' ? 'BACK' : '返回')
            : (lang === 'en' ? 'NEXT' : '下一组')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: GROUP_COLORS[bankTarget], flexShrink: 0 }} />
            <span style={{
              fontSize: 18, fontWeight: 800, letterSpacing: '0.04em', color: GROUP_COLORS[bankTarget],
              fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap',
            }}>{bankName(bankTarget)}</span>
          </span>
          <span style={{ fontSize: 20, lineHeight: 1, color: `${GROUP_COLORS[bankTarget]}99`, marginLeft: 2 }}>{browsing ? '‹' : '›'}</span>
        </button>
      </ModalBody>

      {/* 底部固定操作位：只有「保存本地 / 整组上传」两键（导出/JSON 导入已移除） */}
      <ModalFooter style={{ padding: '10px 12px 12px', borderTop: `1px solid ${LINE}` }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={openSave} style={{
            flex: 1, height: 44, borderRadius: 10, cursor: 'pointer',
            background: 'rgba(240,180,41,0.14)', border: `1px solid ${GOLD}`, color: GOLD,
            fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
            fontFamily: '"Barlow-Regular_2",sans-serif',
          }}>{lang === 'en' ? 'SAVE LOCAL' : '保存本地'}</button>
          {/* ★ 2026-11-03：上传 = 整组上传。只要本屏有一格有音色就能点开，
              弹框里会逐条说明为什么不能传（空槽 / 缺型号 / 型号不一致）。
              不合格时按钮描边转红，提前给出信号。 */}
          <button onClick={openUpload} disabled={!upCheck.rows.some((r) => r.filled)} style={{
            flex: 1, height: 44, borderRadius: 10,
            cursor: upCheck.rows.some((r) => r.filled) ? 'pointer' : 'default',
            background: 'rgba(240,111,33,0.12)',
            border: `1px solid ${upCheck.ok ? APPLIED : 'rgba(240,80,80,0.62)'}`,
            color: upCheck.ok ? APPLIED : '#E08A8A',
            fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
            fontFamily: '"Barlow-Regular_2",sans-serif',
          }}>{lang === 'en' ? 'UPLOAD GROUP' : '整组上传'}</button>
        </div>

      </ModalFooter>

      {/* ══ ★★ v3.68：清空确认（自绘，替换 window.confirm） ══ */}
      {clearOpen && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 6, background: 'rgba(4,6,9,0.74)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 320, borderRadius: 14, overflow: 'hidden',
            background: '#292e37', border: '1px solid rgba(242,86,91,0.45)',
            boxShadow: '0 14px 34px rgba(0,0,0,0.62)', padding: '14px 14px 12px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#F2F4F8', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
              {lang === 'en' ? `Clear ${slotLabel(cur)}?` : `清空 ${slotLabel(cur)}？`}
            </div>
            <div style={{ marginTop: 7, fontSize: 11, lineHeight: 1.6, color: '#c2c9d6' }}>
              {lang === 'en'
                ? `“${curItem?.name || ''}” will be removed. The slot itself is kept.`
                : `「${curItem?.name || ''}」的音色数据会被清除，槽位保留。`}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => setClearOpen(false)} style={{
                flex: 1, height: 38, borderRadius: 9, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${LINE}`, color: '#c2c9d6',
                fontSize: 12, fontWeight: 800, fontFamily: '"Barlow-Regular_2",sans-serif',
              }}>{lang === 'en' ? 'CANCEL' : '取消'}</button>
              <button onClick={doClearConfirmed} style={{
                flex: 1, height: 38, borderRadius: 9, cursor: 'pointer',
                background: 'rgba(242,86,91,0.16)', border: '1px solid rgba(242,86,91,0.6)', color: '#F2565B',
                fontSize: 12, fontWeight: 800, fontFamily: '"Barlow-Regular_2",sans-serif',
              }}>{lang === 'en' ? 'CLEAR' : '清空'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ★★ v3.81（P2-8）：清空撤销条 —— 5 秒内可一键放回 ══ */}
      {undoClear && (
        <div style={{
          position: 'absolute', left: 14, right: 14, bottom: 14, zIndex: 7,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 12,
          background: '#2a2f37', border: `1px solid ${LINE}`,
          boxShadow: '0 10px 26px rgba(0,0,0,0.55)',
        }}>
          <span style={{
            flex: 1, minWidth: 0, fontSize: 11.5, color: '#c2c9d6',
            fontFamily: '"Barlow-Regular_2",sans-serif',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {lang === 'en'
              ? `${slotLabel(undoClear.item.slot)} cleared`
              : `${slotLabel(undoClear.item.slot)} 已清空`}
          </span>
          <button onClick={doUndoClear} style={{
            flexShrink: 0, height: 34, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(240,180,41,0.16)', border: `1px solid ${GOLD}`, color: GOLD,
            fontSize: 12, fontWeight: 800, fontFamily: '"Barlow-Regular_2",sans-serif',
          }}>{lang === 'en' ? 'UNDO' : '撤销'}</button>
        </div>
      )}

      {/* ══ ★★ v3.62（2026-10-24 用户拍板）：保存 / 上传的确认提示框 ══
          保存 → 说明保存位置（哪一组的哪一格）+ 重命名方式（长按 0.5s）
          上传 → 说明这是「当前频道参数」以 EB 参数发硬件，并整组 4 格同步 */}
      {dlg && (
        /* ★ 2026-11-05（统一整改）：上传/保存确认框改为 fixed + 遮罩可滚动。
           旧实现 absolute + 父卡片 overflow:hidden + 无 maxHeight —— 小屏上
           "上传到 X 组"按钮会被裁到屏幕外且滚不到。 */
        <div style={{
          position: 'fixed', inset: 0, zIndex: 90,
          background: 'rgba(4,6,9,0.74)',
          overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          <div style={{
            minHeight: '100%', boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            paddingTop: 'max(16px, env(safe-area-inset-top))',
            paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
            paddingLeft: 16, paddingRight: 16,
          }}>
          <div style={{
            width: '100%', maxWidth: 340, borderRadius: 14, overflow: 'hidden',
            background: '#292e37', border: `1px solid ${dlg === 'upload' ? 'rgba(240,111,33,0.45)' : 'rgba(240,180,41,0.45)'}`,
            boxShadow: '0 14px 34px rgba(0,0,0,0.62)',
          }}>
            {/* 标题 */}
            <div style={{ padding: '13px 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 13, fontWeight: 800, color: '#F2F4F8',
                fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.02em',
              }}>
                {dlg === 'save'
                  ? (lang === 'en' ? `Save to ${LOCAL_BANK_EN.toLowerCase()}` : `保存到${LOCAL_BANK_ZH}`)
                  : (lang === 'en' ? 'Upload to hardware' : '上传到硬件')}
              </span>
            </div>

            <div style={{ padding: '10px 14px 0' }}>
              {/* 位置行（两种框都要显示「存在哪儿 / 传到哪儿」） */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 9,
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${LINE}`,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: GROUP_COLORS[Math.floor((cur - 1) / 4)], flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7C8494', letterSpacing: '0.08em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                  {dlg === 'save' ? (lang === 'en' ? 'LOCATION' : '保存位置') : (lang === 'en' ? 'TARGET' : '目标频道')}
                </span>
                <span style={{
                  marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: dlg === 'upload' ? APPLIED : GOLD,
                  fontFamily: '"Barlow-Regular_2",sans-serif',
                }}>
                  {dlg === 'save'
                    ? (lang === 'en' ? `LOCAL ${cur}` : `本地第 ${cur} 格`)
                    : (upDst
                      ? `${hwLabel(upDst)}–${hwLabel(upDst + 3)}`
                      : (lang === 'en' ? 'not selected' : '未选择'))}
                </span>
              </div>

              {dlg === 'save' ? (
                <>
                  {/* 名称输入 —— 不改就沿用当前格名字 */}
                  <div style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: '#7C8494', letterSpacing: '0.08em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                    {lang === 'en' ? 'NAME' : '名称'}
                  </div>
                  <input
                    autoFocus
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') setDlg(null); }}
                    maxLength={16}
                    style={{
                      marginTop: 5, width: '100%', height: 36, padding: '0 10px', borderRadius: 9,
                      background: 'rgba(255,255,255,0.06)', border: `1px solid ${GOLD}`,
                      color: '#F2F4F8', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                    }} />
                  {/* 重命名方式 */}
                  <div style={{
                    marginTop: 10, fontSize: 11, lineHeight: 1.5, color: '#8A93A3',
                    fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>
                    {lang === 'en'
                      ? 'Rename later: long-press the slot for 0.5s.'
                      : '重命名方式：保存后长按格子 0.5 秒，格子顶部会出现输入行。'}
                  </div>
                  <div style={{
                    marginTop: 4, fontSize: 11, lineHeight: 1.5, color: '#6E7686',
                    fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>
                    {lang === 'en' ? 'Saved on this phone only · hardware is not touched.' : `只写入${LOCAL_BANK_ZH}，不动硬件。`}
                  </div>
                </>
              ) : (
                <>
                  {/* ══ 本组型号一览：4 格必须同箱头同箱体 ══ */}
                  <div style={{
                    marginTop: 10, fontSize: 10.5, fontWeight: 700, color: '#7C8494',
                    letterSpacing: '0.08em', fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>
                    {lang === 'en' ? 'THIS GROUP · AMP / CAB' : '本组型号 · 箱头 / 箱体'}
                  </div>
                  <div style={{
                    marginTop: 5, borderRadius: 9, overflow: 'hidden',
                    border: `1px solid ${upCheck.ok ? LINE : 'rgba(240,80,80,0.55)'}`,
                  }}>
                    {upCheck.rows.map((r, i) => {
                      const bad = !r.filled || !r.ampOk || !r.cabOk;
                      return (
                        <div key={r.slot} style={{
                          display: 'flex', alignItems: 'center', gap: 7, padding: '6px 9px',
                          background: i % 2 ? 'rgba(255,255,255,0.025)' : 'transparent',
                          borderTop: i ? `1px solid ${LINE}` : 'none',
                        }}>
                          <span style={{
                            width: 16, flexShrink: 0, fontSize: 10, fontWeight: 800,
                            color: bad ? '#F05050' : '#7C8494',
                            fontFamily: '"Barlow-Regular_2",sans-serif',
                          }}>{slotLabel(r.slot)}</span>
                          <span style={{
                            flex: 1, minWidth: 0, fontSize: 10.5, color: bad ? '#F08A8A' : '#C8D0DC',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {r.filled ? (r.name || (lang === 'en' ? 'untitled' : '未命名')) : (lang === 'en' ? 'EMPTY' : '空槽')}
                          </span>
                          <span style={{
                            flexShrink: 0, maxWidth: 148, fontSize: 9.5,
                            color: bad ? '#F05050' : '#6FBF95',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontFamily: '"Barlow-Regular_2",sans-serif',
                          }}>
                            {r.filled
                              ? `${r.ampLabel || '?'} / ${r.cabLabel || '?'}`
                              : (lang === 'en' ? 'empty slot' : '空槽')}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* 不合格原因 / 合格提示 */}
                  <div style={{
                    marginTop: 7, padding: '6px 9px', borderRadius: 8, fontSize: 10.5, lineHeight: 1.5,
                    fontFamily: '"Barlow-Regular_2",sans-serif',
                    background: upCheck.ok ? 'rgba(91,200,143,0.10)' : 'rgba(240,80,80,0.12)',
                    border: `1px solid ${upCheck.ok ? 'rgba(91,200,143,0.38)' : 'rgba(240,80,80,0.5)'}`,
                    color: upCheck.ok ? '#7FD3A8' : '#F08A8A',
                  }}>
                    {upCheck.ok
                      ? (lang === 'en'
                        ? 'Same amp + same cabinet. Parameters may differ — that is what the 4 slots are for.'
                        : '型号一致，可以整组上传。GAIN / EQ / 效果器参数可以不同，只有型号不能换。')
                      : upReason}
                  </div>

                  {/* ══ 选目标组（只有整组，A 组锁定）══ */}
                  <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6, color: '#8A93A3' }}>
                    {lang === 'en' ? 'Overwrite which group?' : '整组上传到哪一组？（会覆盖该组 4 格）'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                    {UPLOAD_GROUPS.map((g) => {
                      const first = g * 4 + 1;
                      const sel = upDst === first;
                      const c = GROUP_COLORS[g];
                      const disabled = !upCheck.ok;
                      return (
                        <button key={g} onClick={() => { if (!disabled) setUpDst(first); }} style={{
                          height: 54, borderRadius: 10,
                          cursor: disabled ? 'default' : 'pointer',
                          opacity: disabled ? 0.4 : 1,
                          background: sel ? `${c}1F` : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${sel ? c : LINE}`,
                          color: sel ? c : '#c2c9d6',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                          fontFamily: '"Barlow-Regular_2",sans-serif',
                        }}>
                          <span style={{ fontSize: 14, fontWeight: 800 }}>{`${g + 1}`}</span>
                          <span style={{ fontSize: 10, opacity: 0.75 }}>{`${hwLabel(first)}–${hwLabel(first + 3)}`}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{
                    marginTop: 8, padding: '7px 9px', borderRadius: 8,
                    background: 'rgba(240,111,33,0.10)', border: '1px solid rgba(240,111,33,0.32)',
                    fontSize: 10.5, lineHeight: 1.5, color: '#E6A57E',
                    fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>
                    {lang === 'en'
                      ? 'Group upload only — A group (1–4) is the straight-through reference and cannot be overwritten.'
                      : '只支持整组上传；A 组（1–4）是直通基准，不可覆盖。'}
                  </div>
                </>
              )}
            </div>

            {/* 按钮 */}
            <div style={{ display: 'flex', gap: 8, padding: '12px 14px 14px' }}>
              <button
                onClick={() => { setDlg(null); setUpDst(null); }}
                style={{
                  flex: 1, height: 40, borderRadius: 9, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.04)', border: `1px solid ${LINE}`, color: '#c2c9d6',
                  fontSize: 12, fontWeight: 800, fontFamily: '"Barlow-Regular_2",sans-serif',
                }}>{lang === 'en' ? 'CANCEL' : '取消'}</button>
              <button
                disabled={dlg === 'upload' && (!upDst || !upCheck.ok)}
                onClick={() => {
                  if (dlg === 'save') { doSave(); return; }
                  doUpload();
                }}
                style={{
                  flex: 1.4, height: 40, borderRadius: 9,
                  cursor: dlg === 'upload' && (!upDst || !upCheck.ok) ? 'default' : 'pointer',
                  opacity: dlg === 'upload' && (!upDst || !upCheck.ok) ? 0.42 : 1,
                  background: dlg === 'upload' ? 'rgba(240,111,33,0.18)' : 'rgba(240,180,41,0.18)',
                  border: `1px solid ${dlg === 'upload' ? APPLIED : GOLD}`,
                  color: dlg === 'upload' ? APPLIED : GOLD,
                  fontSize: 12, fontWeight: 800, fontFamily: '"Barlow-Regular_2",sans-serif',
                }}>
                {dlg === 'save'
                  ? (lang === 'en' ? 'SAVE' : '保存')
                  : (upDst
                    ? (lang === 'en' ? `UPLOAD TO GROUP ${(upDst - 5) / 4 + 2}` : `上传到 ${(upDst - 5) / 4 + 2} 组`)
                    : (lang === 'en' ? 'UPLOAD' : '上传'))}
              </button>
            </div>
          </div>
          </div>
        </div>
      )}
    </ModalCard>
  );
}
