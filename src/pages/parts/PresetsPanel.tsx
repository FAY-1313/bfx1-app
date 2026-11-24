import { useState, useEffect } from 'react';
import { AudioWaveformIcon, TimerIcon } from 'lucide-react';
import { notifyOk, notifyErr } from '../../services/feedback';
import { useI18n } from '../../i18n';
import { switchCostMs } from '../../data/switchCost';
import { presetEdgeCost } from '../../data/presetSwitchCost';
import { savePresetLocal, loadPresetsLocal, markChannelClean, getDirtyChannels, getLocalBankApplied, setLocalBankApplied, getPresetUserSlots } from '../../services/localPresets';
import { buildBuiltinPresets } from '../../data/builtinPresets';
import { beginBusy, endBusy, endBusyAfter, isBusy } from '../../services/switchBusy';
import { clearDrift } from '../../services/drift';
import type { LocalPreset } from '../../services/localPresets';
import { getPresetTemplate } from '../../services/toneTemplate';
import { AMP_MODELS as AMP_MODELS_V8 } from '../../data/ampParams';
import { ModalCard, ModalBody, ModalFooter } from '../../ui2/ModalCard';
import { PanelHeader } from '../../ui/PanelHeader';
import { localSlotRef, PRESET_GROUPS, CH_LETTER, deriveAllKnobValues, loadChannelSnapshot } from '../indexShared';

/* ★ 2026-11-24：从 Index.tsx 原样搬出（纯搬家，逻辑未改） */

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

export default PresetsPanel;
