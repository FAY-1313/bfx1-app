/**
 * Bluetooth Panel — 真实 BLE 扫描/连接/写入
 *
 * ★ 2026-10-16 按《蓝牙页面UI审查报告》整改（14 条）：
 *   · 色彩/字号全部改走令牌 —— 原先散落的 #4cc9f0 / rgba(76,201,240,…) /
 *     两种绿 / 三种红 / 7.5–11px 八级字号，其实是 src/theme.ts 里已定义语义色的
 *     手写副本。这里统一从 theme.color / theme.fontSize 取，半透明变体用 alpha()。
 *   · 设备图按状态切换角色：未连接=64px 页脚小图（让位给设备列表），
 *     已连接=中等并常亮，刚连接=放大 + 单层绿呼吸（庆祝主角）。
 *     图片从可滚动列表里挪出来，作为面板固定页脚。
 *   · 触控：SCAN 主按钮 44px；列表内连接按钮视觉 32px、外扩命中区到 44px。
 *   · 扫描行整合：SCAN 原地变「停止扫描」（删掉独立 ×），设备计数归到列表首行。
 *   · 动效减法：只留一层 drop-shadow + 呼吸；文字去掉 textShadow；时长统一 250ms。
 *   · backdropFilter 修复：底色改半透明，毛玻璃才真正可见。
 *   · 锁定态加说明条；空态加图标 + 主/次文案。
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { notifyErr, notifyInfo } from '../services/feedback';
import { bleManager, BLEDevice, BLE_SERVICE } from '../services/bleService';
import { isBusy } from '../services/switchBusy';
import { wirelessMidi, isMidiDevice, MidiStatus } from '../services/wirelessMidi';
import { App } from '@capacitor/app';
import { useI18n } from '../i18n';
import { BluetoothIcon, BluetoothOffIcon, AlertTriangleIcon, XIcon } from 'lucide-react';
import { PanelHeader } from '../ui/PanelHeader';
import { theme } from '../theme';
import { RADIUS, MOTION } from '../ui2/tokens';

const C = theme.color;
const F = theme.fontSize;

/** #RRGGBB → rgba(r,g,b,a)：半透明变体仍以 theme 令牌为唯一色源，不再手写第二套写法 */
function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const EASE = `${MOTION.standard}ms ${MOTION.standardEase}`;

interface BluetoothPanelProps {
  visible: boolean;
  onClose: () => void;
  connectedDeviceId: string | null;
  onConnect: (id: string | null) => void;
  /** ★★ v3.68（F）：点下「连接」的瞬间通知上层 —— 让「正在连接」全屏立刻出现，
      而不是等 GATT 全部走完（服务发现 + MTU 协商）才有反应。 */
  onConnecting?: (deviceName?: string) => void;
  /** ★★ v3.68：连接失败 → 上层收掉「正在连接」全屏 */
  onConnectFail?: () => void;
  /** ★ 2026-10-16：锁定态 —— 未连接蓝牙时必须先完成连接，面板不可关闭（隐藏 × 按钮） */
  locked?: boolean;
}

/** 列表项：在 BLE 设备信息上标记"这是无线 MIDI 踏板"（走中转路径，不走 BFX1 协议） */
type PanelDevice = BLEDevice & { isMidi?: boolean };

export default function BluetoothPanel({
  visible, onClose, connectedDeviceId, onConnect, onConnecting, onConnectFail, locked = false,
}: BluetoothPanelProps) {
  const { t, lang } = useI18n();
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<PanelDevice[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  /* ★ 2026-11-04：无线 MIDI 踏板（第二条 BLE 链路，与 BFX1 音箱链路并存） */
  const [midiId, setMidiId] = useState<string | null>(null);
  const [midiName, setMidiName] = useState('');
  const [midiBusy, setMidiBusy] = useState<string | null>(null);
  const [btEnabled, setBtEnabled] = useState(true);
  const btEnabledRef = useRef(true);
  /* ★ 2026-11-09：演示模式（App Review 用）—— 不开蓝牙也能完整走一遍界面 */
  const [demoUi, setDemoUi] = useState(bleManager.demoMode);
  /** 当前是否处在扫描中（ref，避免闭包读到旧 state） */
  const scanningRef = useRef(false);
  /** 用户主动点了「停止扫描」→ 轮询不要自作聪明又给开起来 */
  const autoPausedRef = useRef(false);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * ★★★ 2026-11-02（用户要求「搜索到 BFX1 后自动连接」）：
   *   每轮扫描只自动连一次，失败不重试（避免连不上时无限重连把用户锁在扫描页）。
   *   连接函数用 ref 转一手，避开 startScan 与 handleConnect 的 useCallback 循环依赖。
   */
  const autoConnRef = useRef(false);
  /* ★ 2026-11-16（用户报障「有时连不上」）：自动连接以前每轮扫描只试一次，
     失败就静静等 20 秒扫描超时，用户只能手动再点。现在失败后在同一轮里补试 2 次。 */
  const autoRetryRef = useRef(0);
  /**
   * ★★ 2026-11-17（iOS TestFlight 无限重连根治 · 第三环）：
   *   自动连失败后的冷却时间戳。老逻辑每轮 startScan 都把 autoConnRef/autoRetryRef
   *   清零，而下方 2.5s 的 probe() 在自动连把 scanningRef 置 false 后又会立刻
   *   startScan(true) → 预算被重置 → 再自动连 → 再失败 …… 形成永不停止的循环，
   *   用户看到的就是「无限重连、一直连不上」。这里给自动连加 15s 冷却：
   *   一次设备自动连彻底失败后，15s 内任何扫描都不再自动连（列表照常显示，用户
   *   仍可手动点连接），彻底掐断自激；15s 后才允许下一轮自动连。
   */
  const autoConnectBlockedUntilRef = useRef(0);
  const AUTO_CONNECT_COOLDOWN_MS = 15000;
  const handleConnectRef = useRef<(id: string, name?: string) => Promise<boolean> | void>(() => {});
  /* ★ 2026-10-17（用户要求）：设备图点击动画 —— 每次点按自增，用作 key 让动画重播 */
  const [imgPop, setImgPop] = useState(0);

  const startScan = useCallback(async (keepList = false) => {
    if (!btEnabledRef.current) return;
    /* ★ 2026-11-17：只有冷却结束才重置自动连预算。冷却期内自动连保持"已用掉"，
       扫描照常进行、设备照常进列表，但不再自作主张发起 connect（可手动点）。 */
    const blocked = Date.now() < autoConnectBlockedUntilRef.current;
    if (!blocked) {
      autoConnRef.current = false;   // 新一轮扫描允许再自动连一次
      autoRetryRef.current = 0;
    } else {
      autoConnRef.current = true;    // 冷却期：本轮禁止自动连
    }
    // 先停旧扫描再开始新扫描
    if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
    await bleManager.stopScan().catch(() => {});
    setScanning(true);
    scanningRef.current = true;
    /* ★ 2026-10-20：重新扫描默认不清列表 —— 回到前台补扫时，
       已发现的设备还在，不用等它重新广播 */
    if (!keepList) setDevices([]);

    try {
      await bleManager.startScan((device) => {
        const nm = (device.name || '').toUpperCase();
        const uuids = device.uuids ?? [];
        /* ★ iOS 识别加固：iOS 的 CBPeripheral.name 在未连接前可能为空（名字只在广播里，
           系统不保证回传）。所以除了名字前缀，再认「广播里带 BFX1 的 F2 服务 UUID」，
           否则会出现“安卓能搜到、iPhone 搜不到”的假故障。 */
        const isSpeaker = nm.startsWith('BF') || uuids.includes(BLE_SERVICE);
        /* ★ 2026-11-04：无线 MIDI 踏板也进列表（原版 Chocolate 只会当外设，
           必须由手机当 BLE MIDI 主机中转）。自家音箱名字以 BF 开头，优先判为音箱。 */
        const isMidi = !isSpeaker && isMidiDevice(device);
        if (!isSpeaker && !isMidi) return;
        /* 名字为空时补一个可读标签，避免列表出现 “Unknown (0B1A…)” 让人以为不是自家设备 */
        const shownName = device.name || (isSpeaker ? 'BFX1' : 'MIDI Pedal');
        setDevices((prev) => {
          if (prev.some((d) => d.deviceId === device.deviceId)) return prev;
          return [...prev, { ...device, name: shownName, isMidi }];
        });
        /* ★ 2026-11-02：扫到 BFX 设备就直接连，不用用户再点一下。
         *   连上之后 Index 那边的 btConnected 上升沿会接着弹软件教程 → 硬件按键教程。
         *   ★ 2026-11-04：只对音箱自动连；MIDI 踏板必须用户手动点（避免误连）。 */
        if (isSpeaker && !autoConnRef.current && !bleManager.connected
            && (nm.includes('BFX') || uuids.includes(BLE_SERVICE))) {
          autoConnRef.current = true;
          void bleManager.stopScan().catch(() => {});
          setScanning(false);
          scanningRef.current = false;
          if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
          /* ★ 2026-11-16：自动连接失败后在同一轮里补试 2 次（间隔 1.5s）。
             设备刚上电时第一次 connect 常因"host 栈未就绪"失败，而旧实现要等
             20 秒扫描超时、再由用户手动点 —— 这就是"有时连不上、要连两次"。 */
          const attempt = async (): Promise<void> => {
            if (bleManager.connected) return;
            const r = handleConnectRef.current(device.deviceId, shownName) as unknown;
            const ok = (r && typeof (r as Promise<boolean>).then === 'function')
              ? await (r as Promise<boolean>).catch(() => false)
              : true;
            if (ok) return;
            if (autoRetryRef.current >= 2) {
              /* ★ 2026-11-17：自动连彻底失败 → 进入冷却，掐断「扫描→自动连→失败→
                 probe 又扫描→预算重置→再自动连」的自激循环。冷却期内用户仍可手动连。 */
              autoConnectBlockedUntilRef.current = Date.now() + AUTO_CONNECT_COOLDOWN_MS;
              return;
            }
            autoRetryRef.current++;
            window.setTimeout(() => { void attempt(); }, 1500);
          };
          void attempt();
        }
      });

      // 自动停止扫描 (20 秒后)
      scanTimeoutRef.current = setTimeout(async () => {
        await bleManager.stopScan();
        setScanning(false);
        scanningRef.current = false;
      }, 20000);
    } catch (e: any) {
      console.error("BLE scan error:", e);
      notifyErr(t('bt.scanFail') + (e.message || ''));
      setScanning(false);
      scanningRef.current = false;
    }
  }, [t]);

  const stopScan = useCallback(async () => {
    await bleManager.stopScan().catch(() => {});
    setScanning(false);
    scanningRef.current = false;
    autoPausedRef.current = true;          // 用户主动停的，别自动重启
    if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
  }, []);

  /**
   * ★ 2026-10-20（修「去系统设置开了蓝牙，切回 App 还是显示未连接」）
   *
   * 原实现只有一个 scannedRef：面板第一次打开时检测一次蓝牙状态，之后永不复查。
   * 用户点「打开蓝牙设置」→ 系统设置里开蓝牙 → 切回 App，面板仍停在关闭态，
   * 也不会重新扫描，只能杀进程重开。
   *
   * 现在：面板可见期间持续盯住
   *   ① appStateChange（Capacitor 原生，最可靠）
   *   ② visibilitychange（WebView 兜底）
   *   ③ 2.5 秒轮询（防止上面两个都没触发）
   * 关→开：自动开始扫描并提示；开→关：停扫描清列表；
   * 回到前台且未连接：补一轮扫描（后台被系统挂断的扫描也能救回来）。
   */
  useEffect(() => {
    if (!visible) {
      bleManager.stopScan().catch(() => {});
      setScanning(false);
      scanningRef.current = false;
      return;
    }
    autoPausedRef.current = false;   // 重新进面板 → 恢复自动补扫
    let alive = true;
    let lastWake = 0;
    let lastAliveProbe = 0;

    const probe = async (forceRescan = false) => {
      if (!alive) return;
      let enabled = btEnabledRef.current;
      try { enabled = await bleManager.isEnabled(); } catch { /* 读失败就沿用旧值 */ }
      if (!alive) return;

      if (enabled !== btEnabledRef.current) {
        btEnabledRef.current = enabled;
        setBtEnabled(enabled);
        if (enabled) {
          notifyInfo(lang === 'zh' ? '蓝牙已开启，正在搜索设备' : 'Bluetooth on, scanning…');
          void startScan();
          return;
        }
        await bleManager.stopScan().catch(() => {});
        setScanning(false);
        scanningRef.current = false;
        setDevices([]);
        return;
      }

      if (!enabled) return;

      /* ★ 2026-11-04（用户报障）：硬件关机/重启后 Android 常不发断线事件，
         App 仍以为连着 → 面板一直显示「已连接 + 无法连接」。这里在面板打开/回前台
         以及每 5 秒做一次 GATT 存活探测；死链就清掉残留并自动重新扫描+连接。 */
      if (connectedDeviceId) {
        const now = Date.now();
        /* ★ 2026-11-16：探测从「每 5s」放宽到「每 12s」，且上传/切换进行中直接跳过 ——
           GATT 读探测会与正在跑的 EB 帧抢链路，一次读超时就会把健康链路判死，
           表现正是「连接不稳定时特别容易卡住 / 蓝牙自己重启」。 */
        if ((forceRescan || now - lastAliveProbe > 12000) && !isBusy()) {
          lastAliveProbe = now;
          const linkOk = await bleManager.probeAlive();
          if (!alive) return;
          if (!linkOk) {
            onConnect(null);
            autoPausedRef.current = false;
            void startScan(true);
          }
        }
        return;
      }

      /* 回到前台 = 用户明确想继续找设备 → 解除「手动停止」 */
      if (forceRescan) autoPausedRef.current = false;
      if (autoPausedRef.current) return;
      /* ★ 2026-11-17：connect 正在飞（面板自动连 / Index 重连环）时不要重启扫描。
         旧逻辑在自动连把 scanningRef 置 false 后，2.5s 后又会 startScan，和正在
         进行的 connect 抢射频、并重置自动连预算 → 无限重连。让位给在飞的 connect。 */
      if (bleManager.connecting) return;
      /* 已开启但没在扫（超时停了 / 被系统挂断 / 刚从后台回来）→ 补一轮 */
      if (forceRescan || !scanningRef.current) void startScan(true);
    };

    const wake = (force: boolean) => {
      const now = Date.now();
      if (now - lastWake < 1200) return;      // 原生 + visibility 同时触发时去重
      lastWake = now;
      void probe(force);
    };

    void probe();

    const onVis = () => { if (document.visibilityState === 'visible') wake(true); };
    document.addEventListener('visibilitychange', onVis);

    let appHandle: { remove: () => Promise<void> } | null = null;
    App.addListener('appStateChange', ({ isActive }) => { if (isActive) wake(true); })
      .then((h) => { if (alive) appHandle = h; else void h.remove(); })
      .catch(() => { /* Web / 无原生插件时忽略 */ });

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void probe();
    }, 2500);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      if (appHandle) void appHandle.remove();
      bleManager.stopScan().catch(() => {});
      scanningRef.current = false;
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    };
  }, [visible, connectedDeviceId, startScan, lang, onConnect]);

  // SCAN 按钮: 重新检测蓝牙开关 (用户在系统设置开启后返回)
  const handleScanClick = async () => {
    if (scanning) { await stopScan(); return; }
    if (!btEnabledRef.current) {
      const enabled = await bleManager.isEnabled();
      btEnabledRef.current = enabled;
      setBtEnabled(enabled);
      /* ★ 2026-10-16：同上，未开启只走面板内警告条，不弹 toast */
      if (!enabled) return;
    }
    autoPausedRef.current = false;
    startScan();
  };

  const handleOpenBtSettings = async () => {
    await bleManager.openBluetoothSettings();
  };

  /* ★★★ 2026-11-09：演示模式开关。
     开启后 BLE 层返回一台虚拟 BFX1（1.2s 内自动连上），所有寄存器读写落在内存表里，
     不触发蓝牙权限弹窗，也不需要任何硬件 —— 审核员据此可完整体验 App。 */
  const handleToggleDemo = async () => {
    const next = !demoUi;
    bleManager.setDemoMode(next);
    setDemoUi(next);
    setDevices([]);
    setConnecting(null);
    if (next) {
      btEnabledRef.current = true;
      setBtEnabled(true);
      autoPausedRef.current = false;
      notifyInfo(lang === 'zh'
        ? '演示模式已开启 · 无需硬件，直接体验全部功能'
        : 'Demo mode on — explore the app without hardware');
      void startScan();
    } else {
      await bleManager.disconnect().catch(() => {});
      onConnect(null);
      notifyInfo(lang === 'zh' ? '演示模式已关闭' : 'Demo mode off');
    }
  };

  const handleConnect = async (deviceId: string, deviceName?: string, isMidi = false): Promise<boolean> => {
    /* ★ 2026-11-04：无线 MIDI 踏板走独立路径 —— 它是第二条 BLE 链路，
       不碰 connectedDeviceId（那是 BFX1 音箱的链路状态）。 */
    if (isMidi) {
      if (midiBusy) return false;
      if (midiId === deviceId) {
        await wirelessMidi.disconnect().catch(() => {});
        return true;
      }
      setMidiBusy(deviceId);
      await bleManager.stopScan().catch(() => {});
      if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
      setScanning(false);
      scanningRef.current = false;
      const ok = await wirelessMidi.connect(deviceId, deviceName);
      setMidiBusy(null);
      if (ok) notifyInfo(lang === 'zh' ? '无线踏板已接入，可踩钉切档' : 'Wireless pedal connected');
      else notifyErr(lang === 'zh' ? '踏板连接失败' : 'Pedal connect failed');
      return ok;
    }
    /* ★ 2026-11-17：用户手动点连接 = 明确意图，立即解除自动连冷却 */
    autoConnectBlockedUntilRef.current = 0;
    if (connectedDeviceId === deviceId) {
      await bleManager.disconnect();
      onConnect(null);
      /* ★ 2026-10-16（B1）：断开不再弹上方 toast —— 设备条目自动回到「连接」态，
         与"连接成功用图片亮起"同一套反馈语言。 */
      return true;
    }
    if (connecting) return false;
    setConnecting(deviceId);
    /* ★★ v3.68（F）：先出「正在连接」全屏 —— 首连要等 connectGatt → 服务发现 → MTU 协商，
       2–4 秒里旧实现只有按钮文字变化，用户体感就是「卡住了」。 */
    onConnecting?.(deviceName);

    // 连接前先停止扫描，释放射频资源
    await bleManager.stopScan().catch(() => {});
    if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
    setScanning(false);

    const ok = await bleManager.connect(deviceId, deviceName);
    setConnecting(null);

    if (ok) {
      /* ★★ v3.68（E）：**先通知上层（出「连接成功」画面），再订阅通知**。
         ★ 2026-11-16：订阅已并入 bleManager.connect()（自动重连也走那条路），
           这里保留调用是为了让 _onNotify 挂上业务回调；重复订阅是幂等的。 */
      onConnect(deviceId);
      /* ★ 2026-11-17（连接提速）：订阅已在 bleManager.connect() 内完成，
         这里原本再 startNotifications(()=>{}) 一次是多余的原生往返，去掉。 */
    } else {
      onConnectFail?.();
      notifyErr(t('bt.connectFail'));
    }
    return ok;
  };

  /* ★ 2026-10-17（用户要求「蓝牙图片和菜单的绿色调换为蓝色」）：
     连接态原来用绿色 C.ok，与全 App 的蓝青色（箱体 / 信息色）不一致。
     现在统一到一个蓝 #5bc8f5：菜单高亮、设备条目、设备图光晕、已连接文字全部同色。 */
  const btColor = '#5bc8f5';
  const connectedDevice = devices.find((d) => d.deviceId === connectedDeviceId);
  const connectedDeviceName = connectedDevice?.name || bleManager.deviceName || connectedDeviceId || '';
  const hasConnected = connectedDeviceId !== null;

  /* ★ 2026-10-16（用户要求）：连接成功后【不立刻跳转】。
   * ★ 2026-10-17 改：关闭面板这件事交给 Index —— 现在的顺序是
   *   「连上 → 全屏连接成功画面（闪烁→常亮 2.1s）→ 关面板 → 教程 / 首页」，
   *   面板这里只负责把设备图的光晕切到"常亮"，2.4s 后回归普通态，
   *   不再自己调 onClose（否则会在成功画面底下提前关掉，时序打架）。 */
  const [justConnected, setJustConnected] = useState(false);
  useEffect(() => {
    if (!hasConnected) { setJustConnected(false); return; }
    setJustConnected(true);
    const timer = setTimeout(() => setJustConnected(false), 2400);
    return () => clearTimeout(timer);
  }, [hasConnected]);

  /* ★ 2026-11-02：把最新的 handleConnect 交给扫描回调（自动连接用）。
     直接赋值即可 —— startScan 的闭包只需要"当前这一个函数"，
     不需要跟随渲染重跑扫描。 */
  handleConnectRef.current = handleConnect;

  /* ★ 2026-11-04：同步无线 MIDI 踏板状态（可能在别处已连上/断开，面板要保持一致） */
  useEffect(() => {
    const apply = (s: MidiStatus) => {
      setMidiId(s.connected ? s.deviceId : null);
      setMidiName(s.deviceName);
    };
    wirelessMidi.onStatus(apply);
    apply({
      connected: wirelessMidi.connected,
      deviceId: wirelessMidi.deviceId,
      deviceName: wirelessMidi.deviceName,
      lastChannel: null,
    });
    return () => { wirelessMidi.onStatus(null); };
  }, []);

  const getRssiBars = (rssi?: number): number => {
    if (!rssi) return 0;
    if (rssi >= -50) return 4;
    if (rssi >= -65) return 3;
    if (rssi >= -75) return 2;
    if (rssi >= -85) return 1;
    return 0;
  };

  /* ★ v73（用户要求）：
   *   1. 四态【统一高度】—— 原先前三档各不一样（340/320/150/300 起），切换状态时图会
   *      突然长高变矮，前后不一致；
   *   2. 整体比 v72 缩小约 30%；
   *   3. 状态差异改由光晕/呼吸表达（绿光 + 呼吸），不再靠尺寸区分。
   *   注：bfx1-device.png = 1256×1920（宽高比 0.654）。
   *
   * ★ v73 修正 A（用户 m03774 第 1 条「悬浮在表层，会遮挡底下文字」）：
   *   页脚原先 `flexShrink:0` + vh 定高，图放不下就溢出面板去压底部 tab 栏。
   *   改成「图片框可收缩 + 图片自身 maxWidth/maxHeight:100%」→ 永不溢出面板。
   *
   * ★ v73 修正 B（用户 m04259「蓝牙图片遮挡了蓝牙选项，我无法操作！」）—— 真因：
   *   列表用的是 `flex:1`，也就是 **flex-basis:0** —— 它只能吃【页脚之后】的剩余空间。
   *   而页脚 basis 是 434px，500px 面板减掉表头(44)+锁定条(34)后只剩 422px
   *   → 剩余为负 → **列表被压成 0 高**，整片区域由设备图占住，用户点不到任何设备。
   *   （这条从 v72 起就存在，v73 修正 A 让它更明显：页脚改成可收缩后正好缩到填满，
   *     列表就彻底没了。）
   *   现在：
   *     ① 列表改 `flex:1 1 auto` + `minHeight:132` —— 按内容占位、永不为 0；
   *     ② 页脚改成【面板高度的固定百分比】（flex-grow:0 / flex-shrink:1），
   *        各连接状态下高度都一样 → 尺寸一致，且不再挤压列表；
   *     ③ `pages/Index.tsx` 的浮层高度从写死 500 改成蓝牙页用 `calc(100% - 74px)`，
   *        把屏幕上原本闲置的 350px 还给蓝牙页 → 图更大、列表依然够用。 */
  /* ★ 2026-11-04（用户报障「多个设备时图片遮挡列表、点不到」）：
     有设备可选时，把设备图压成**一角缩略图**（26% / 最高 170px），
     列表拿回 >=70% 的高度；没有设备时才保留原来的 60% 大图展示。
     同时页脚整体 pointerEvents:none，永远不会拦截列表点击。 */
  const imgBandBasis = devices.length > 0 ? '26%' : '60%';
  const imgBandMax = devices.length > 0 ? 170 : undefined;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      overflow: 'hidden', // v73：兜底 —— 任何内容都不许溢出面板去盖住底部 tab 栏
      // ★ 底色改半透明，backdropFilter 才真正可见（原先是不透明 #2d2f34，blur 白写）
      background: alpha(C.bg, 0.94),
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      /* ★ 2026-10-19（重大修复）：面板关闭时原本只设了 opacity:0 + pointer-events:none，
         但子元素（设备图）自己写了 pointer-events:auto —— CSS 规定子元素可以覆盖父级的 none，
         于是**看不见的蓝牙面板仍然盖住屏幕中部**（实测 x56–333 / y360–784），
         把箱体左箭头、延迟/混响旋钮、预设库 C/D 槽位全部吃掉点击。
         改用 visibility:hidden —— 子元素不会重新声明 visibility，因此整棵子树彻底不可命中。 */
      visibility: visible ? 'visible' : 'hidden',
      // B4: visible 过渡上滑淡入 (root 自身 transform; 打开稳态 none, 不影响内部 fixed 弹层)
      transform: visible ? 'none' : 'translateY(6px)',
      transition: `opacity ${EASE}, transform ${EASE}`,
    }}>
      {/* Header —— ★ 2026-10-16：locked（或连接成功的庆祝瞬间）不渲染 × 关闭钮 */}
      <PanelHeader
        title={t('panel.bluetooth')}
        accent={btColor}
        onClose={locked || justConnected ? undefined : onClose}
        left={<div style={{ width: 6, height: 6, borderRadius: '50%', background: hasConnected ? btColor : btColor, boxShadow: `0 0 6px ${hasConnected ? btColor : btColor}` }} />}
      />

      {/* 锁定态说明：用户不知道为何关不掉（审查报告问题 13） */}
      {locked && !hasConnected && (
        <div style={{
          flexShrink: 0, padding: '8px 12px',
          fontSize: F.md, color: C.dim, fontFamily: '"Barlow-Regular_2",sans-serif',
          letterSpacing: '0.04em', textAlign: 'center',
          background: alpha(C.raised, 0.6), borderBottom: `1px solid ${C.border}`,
        }}>
          {t('bt.lockHint')}
        </div>
      )}

      {/* 蓝牙未开启警告条 —— 图标化 + pill 圆角，与全页按钮语言统一（问题 8） */}
      {!btEnabled && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '8px 12px', flexShrink: 0,
          background: alpha(C.danger, 0.10), borderBottom: `1px solid ${alpha(C.danger, 0.25)}`,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
            fontSize: F.lg, fontWeight: 600, color: C.text,
            fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.05em',
          }}>
            <AlertTriangleIcon size={15} color={C.danger} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('bt.off')}</span>
          </div>
          <button onClick={handleOpenBtSettings} style={{
            height: 32, padding: '0 14px', borderRadius: RADIUS.pill, flexShrink: 0,
            background: alpha(C.danger, 0.18), border: `1px solid ${alpha(C.danger, 0.45)}`,
            color: C.text, fontSize: F.lg, fontWeight: 700, letterSpacing: '0.08em',
            fontFamily: '"Barlow-Regular_2",sans-serif', cursor: 'pointer',
          }}>
            {t('bt.goEnable')}
          </button>
        </div>
      )}

      {/* ★ v73 修正 B（关键）：列表从 `flex:1`（basis 0 → 只能吃页脚剩饭 → 被压成 0 高）
          改成 `flex:1 1 auto` + `minHeight:132`：按内容占位，页脚挤它时它也保底 132px，
          而且整块 `overflowY:auto` 可滚动 —— 设备条目永远点得到。
          （v72 当年补的 `minHeight:0` 仍然保留：flex 列的 min-height 默认是 auto，
            不写 0 的话列表不会正确收缩滚动。） */}
      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: 12, position: 'relative', zIndex: 1, WebkitOverflowScrolling: 'touch' }}>
        {/* ★ 2026-10-16（用户要求）：原先此处是「当前连接」弹出卡片 —— 已取消，
            连接成功改为在面板【底部】用设备图片亮起表示（见下方设备图页脚）。
            断开操作仍在设备列表对应条目的按钮上。 */}

        {/* ★ 2026-11-09：演示模式（App Review / 无硬件体验）。
            开启后自动“发现”并连接一台虚拟 BFX1，全部界面与交互可走完。 */}
        <button
          onClick={() => void handleToggleDemo()}
          style={{
            width: '100%', height: 36, borderRadius: RADIUS.pill, marginBottom: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: demoUi ? alpha(btColor, 0.10) : 'transparent',
            border: `1px dashed ${demoUi ? alpha(btColor, 0.45) : C.border}`,
            color: demoUi ? btColor : C.faint,
            fontSize: F.md, fontWeight: 600, letterSpacing: '0.08em',
            fontFamily: '"Barlow-Regular_2",sans-serif', cursor: 'pointer',
            transition: `all ${MOTION.micro}ms`,
          }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: demoUi ? btColor : C.faint,
            boxShadow: demoUi ? `0 0 6px ${btColor}` : 'none',
          }} />
          {demoUi
            ? (lang === 'zh' ? '演示模式 · 已开启（点此关闭）' : 'DEMO MODE · ON (TAP TO STOP)')
            : (lang === 'zh' ? '演示模式 · 无需硬件体验' : 'DEMO MODE · NO HARDWARE NEEDED')}
        </button>

        {/* Scan button —— 单按钮双态（问题 9）：扫描中原地变「停止扫描」，不再另起一个 × */}
        <button
          onClick={handleScanClick}
          style={{
            width: '100%', height: 44, borderRadius: RADIUS.pill, marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: scanning ? alpha(btColor, 0.10) : btEnabled ? C.raised : alpha(C.danger, 0.06),
            border: `1px solid ${scanning ? alpha(btColor, 0.35) : btEnabled ? C.border : alpha(C.danger, 0.30)}`,
            color: scanning ? btColor : btEnabled ? C.dim : alpha(C.danger, 0.6),
            fontSize: F.lg, fontWeight: 700, letterSpacing: '0.12em',
            fontFamily: '"Barlow-Regular_2",sans-serif',
            cursor: 'pointer',
            transition: `all ${MOTION.micro}ms`,
          }}>
          {scanning
            ? <><XIcon size={15} style={{ flexShrink: 0 }} />{t('bt.stopScan')}</>
            : <><BluetoothIcon size={15} style={{ flexShrink: 0 }} />{btEnabled ? t('bt.scan') : t('bt.off')}</>}
        </button>

        {/* ★ 2026-11-04：无线 MIDI 踏板状态条。
            连上后即使关掉本面板，中转仍在后台运行（第二条 BLE 链路独立于 BFX1）。 */}
        {(midiId || midiBusy) && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            marginBottom: 12, padding: '8px 12px', borderRadius: RADIUS.md,
            background: alpha(btColor, 0.08), border: `1px solid ${alpha(btColor, 0.28)}`,
          }}>
            <span style={{
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontSize: F.md, color: C.text, letterSpacing: '0.04em',
              fontFamily: '"Barlow-Regular_2",sans-serif',
            }}>
              {(lang === 'zh' ? '无线 MIDI 踏板' : 'WIRELESS MIDI')} · {midiName || (lang === 'zh' ? '连接中…' : 'Connecting…')}
            </span>
            {midiId && (
              <button
                onClick={() => { void wirelessMidi.disconnect(); }}
                style={{
                  flexShrink: 0, height: 26, padding: '0 12px', borderRadius: RADIUS.pill,
                  background: alpha(C.danger, 0.10), border: `1px solid ${alpha(C.danger, 0.4)}`,
                  color: C.danger, fontSize: F.md, fontWeight: 700, letterSpacing: '0.08em',
                  fontFamily: '"Barlow-Regular_2",sans-serif', cursor: 'pointer',
                }}>
                {lang === 'zh' ? '断开' : 'OFF'}
              </button>
            )}
          </div>
        )}

        {/* 设备计数 —— 从扫描行移到列表首行右对齐（问题 9） */}
        {(scanning || devices.length > 0) && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', marginBottom: 8, paddingRight: 2,
            fontSize: F.md, color: C.faint,
            fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.08em',
          }}>
            {devices.length} {t('bt.found')}
          </div>
        )}

        {/* Device list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {devices.map((dev) => {
            const isMidiDev = !!dev.isMidi;
            const isConnected = isMidiDev ? dev.deviceId === midiId : dev.deviceId === connectedDeviceId;
            const isConnecting = isMidiDev ? midiBusy === dev.deviceId : connecting === dev.deviceId;
            const bars = getRssiBars(dev.rssi);
            const accent = isConnected ? btColor : btColor;
            const borderColor = isConnected
              ? alpha(btColor, 0.5)
              : isConnecting ? alpha(btColor, 0.45) : alpha(btColor, 0.14);
            const label = isConnected ? t('bt.disconnect') : isConnecting ? t('bt.connecting') : t('io.connectBt1');

            return (
              <div
                key={dev.deviceId}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: RADIUS.md,
                  border: `1px solid ${borderColor}`,
                  background: isConnected
                    ? alpha(btColor, 0.07)
                    : isConnecting ? alpha(btColor, 0.07) : C.panel,
                  transition: `all ${MOTION.micro}ms`,
                }}>
                {/* 设备图标 */}
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isConnected ? alpha(btColor, 0.14) : isConnecting ? alpha(btColor, 0.12) : alpha(btColor, 0.06),
                  border: `1px solid ${borderColor}`,
                }}>
                  <BluetoothIcon size={16} color={accent} />
                </div>

                {/* 设备名 + 信号强度（MAC 已移出列表 —— 原先 7.5px、对比度≈1.5:1，不可读） */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{
                      // 连接态不再染成绿色：状态由左侧绿点 + 描边表达（问题 14）
                      fontSize: F.xl, fontWeight: 700, color: C.text,
                      fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.04em',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {dev.name}
                    </span>
                    {isConnected && (
                      <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: '50%', background: btColor, boxShadow: `0 0 6px ${btColor}` }} />
                    )}
                    {isMidiDev && (
                      <span style={{
                        flexShrink: 0, fontSize: F.md, fontWeight: 800, letterSpacing: '0.08em',
                        color: btColor, border: `1px solid ${alpha(btColor, 0.4)}`,
                        borderRadius: 4, padding: '0 4px', lineHeight: '14px',
                        fontFamily: '"Barlow-Regular_2",sans-serif',
                      }}>MIDI</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 12, flexShrink: 0 }}>
                      {[1, 2, 3, 4].map((b) => (
                        <div key={b} style={{
                          width: 3, height: b * 2 + 2, borderRadius: 1,
                          background: b <= bars ? accent : C.border,
                          transition: `all ${MOTION.micro}ms`,
                        }} />
                      ))}
                    </div>
                    <span style={{
                      fontSize: F.md, color: C.dim,
                      fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.04em', flexShrink: 0,
                    }}>
                      {dev.rssi ?? '-'} dBm
                    </span>
                  </div>
                </div>

                {/* 动作按钮: 连接 / 连接中 / 断开
                    视觉 32px，外层 button 44px 补足命中区（Apple HIG / Material 3） */}
                <button
                  onClick={() => handleConnect(dev.deviceId, dev.name, dev.isMidi)}
                  disabled={isConnecting}
                  aria-label={label}
                  style={{
                    height: 44, padding: 0, border: 'none', background: 'none', flexShrink: 0,
                    cursor: isConnecting ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <span style={{
                    height: 32, minWidth: 64, padding: '0 14px', borderRadius: RADIUS.pill,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    whiteSpace: 'nowrap',
                    background: isConnected
                      ? alpha(C.danger, 0.08)
                      : isConnecting ? alpha(btColor, 0.08) : alpha(btColor, 0.14),
                    border: isConnected
                      ? `1px solid ${alpha(C.danger, 0.45)}`
                      : isConnecting ? `1px solid ${alpha(btColor, 0.35)}` : `1px solid ${alpha(btColor, 0.4)}`,
                    color: isConnected ? C.danger : isConnecting ? alpha(btColor, 0.6) : btColor,
                    fontSize: F.lg, fontWeight: 800, letterSpacing: '0.08em',
                    fontFamily: '"Barlow-Regular_2",sans-serif',
                    transition: `all ${MOTION.micro}ms`,
                  }}>
                    {label}
                  </span>
                </button>
              </div>
            );
          })}

          {/* 空态：图标 + 主/次文案（问题 10） */}
          {devices.length === 0 && !scanning && (
            <div style={{ textAlign: 'center', padding: '36px 16px' }}>
              <BluetoothOffIcon size={40} color={C.faint} style={{ opacity: 0.55 }} />
              <div style={{
                marginTop: 12, fontSize: F.xl, color: C.dim,
                fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.06em',
              }}>
                {btEnabled ? t('bt.noDevices') : t('bt.enableFirst')}
              </div>
              {!btEnabled && (
                <div style={{
                  marginTop: 6, fontSize: F.md, color: C.faint,
                  fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.06em',
                }}>
                  {t('bt.emptyHint')}
                </div>
              )}
            </div>
          )}

          {scanning && devices.length === 0 && (
            <div style={{ textAlign: 'center', padding: '36px 16px' }}>
              <div style={{
                width: 32, height: 32, margin: '0 auto 12px',
                border: `2px solid ${alpha(btColor, 0.2)}`,
                borderTopColor: btColor,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <div style={{
                color: C.dim, fontSize: F.lg,
                fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.08em',
              }}>
                {t('bt.scanningLabel')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ★ 2026-10-16：设备图作为面板【固定页脚】（原先在可滚动列表里，会被列表推走）。
           · 无矩形底色 / 无描边（避免被看成"图片边框"）
           · 未连接 / 已连接 / 刚连接 → **同一高度、同一尺寸**（用户 m03774：切换不能变大小）
           · 状态差异只用一层绿光表达，不再靠尺寸区分
           · v73 修正 B：高度改成 **面板高度的固定百分比**（grow 0 / shrink 1）。
             原先 basis 434px 固定不变，在只有几百 px 高的面板里会把列表挤成 0 高；
             现在它按比例占位、空间不够时先被压缩，列表因此永远有位置。 */}
      <div style={{
        /* ★ 2026-10-17（用户要求）：图片放大 30% —— 46% → 60%（约 ×1.30），
           列表区仍是 flex:1 + minHeight:132 + overflowY:auto，放大后依然点得到设备。
           padding 改为上下对称（原 4px/6px），否则图片在框里看起来偏下。 */
        flexGrow: 0, flexShrink: 1, flexBasis: imgBandBasis, maxHeight: imgBandMax,
        minHeight: 0, position: 'relative', zIndex: 0, pointerEvents: 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '4px 8px',
      }}>
        {/* 图片框：flex 居中（原先是 absolute + margin:auto，实测在部分机型上
            受父级 line-height / 图片透明边距影响，视觉上不居中）*/}
        <div style={{
          flex: '1 1 auto', minHeight: 0,
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}>
          {/* ★ 2026-10-17（用户要求）：未连接时设备图背后加**蓝色 2 秒慢呼吸光**。
              实现用 drop-shadow 而不是铺一层径向光斑 —— 光斑是矩形画布里的椭圆，
              跟这台横卧设备的轮廓对不上（第一版就是一团灰雾）。
              drop-shadow 沿透明 PNG 的真实边缘发散，才是"产品在发光"。
              性能：filter 的像素成本按**显示尺寸**（约 330px 宽）算，不是原始 1256px，
              这条 2s 循环在低端机也扛得住。 */}
          <img
            key={imgPop}
            className={[
              imgPop > 0 ? 'img-pop' : '',
              !hasConnected ? 'dev-breathe' : '',
            ].filter(Boolean).join(' ') || undefined}
            src="/assets/bfx1-device.png"
            alt="BFX-1"
            draggable={false}
            /* ★ 2026-10-19（用户要求）：未连接（扫描页）时设备图不可点 ——
               原先点击会播回弹动画，手指在列表上方滑动时容易误触。连上后恢复点击动画。 */
            onPointerUp={hasConnected ? () => setImgPop((n) => n + 1) : undefined}
            role={hasConnected ? 'button' : undefined}
            aria-label={hasConnected ? (lang === 'zh' ? 'BFX1 设备图' : 'BFX1 device') : 'BFX1'}
            style={{
              display: 'block',
              cursor: hasConnected ? 'pointer' : 'default',
              pointerEvents: visible && hasConnected ? 'auto' : 'none',
              width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '100%',
              objectFit: 'contain', objectPosition: 'center center',
              opacity: 1,
              // 单层绿光（原先叠两层 drop-shadow + 两层 textShadow + 两段 keyframes）
              filter: hasConnected && !justConnected
                ? `drop-shadow(0 0 14px ${alpha(btColor, 0.55)})`
                : 'none',
              transition: `filter ${EASE}`,
              /* ★ 2026-10-17（用户反馈「产品图还是没有点击动画」）——真因：
                 inline 写死了 `animation: 'none'`，它的优先级高于 .img-pop 类上的动画，
                 把点击回弹整个覆盖掉了。改成「不呼吸时干脆不写这个属性」，
                 CSS 类里的 imgPop 才生效；呼吸期间仍以呼吸为准（同一元素只能跑一条）。 */
              animation: justConnected ? 'bfxDevGlow 2.4s ease-in-out infinite' : undefined,
            }}
          />
        </div>
        {/* 连接成功 → 图片下方浮动一行居中文字（绝对定位，不挤压图片 → 连接瞬间图不变大小） */}
        {justConnected && (
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 4,
            fontSize: F.h, fontWeight: 800, letterSpacing: '0.14em',
            fontFamily: '"Barlow-Regular_2",sans-serif',
            color: btColor, textAlign: 'center',
            animation: 'panelFade .22s ease-out',
            pointerEvents: 'none',
          }}>
            {lang === 'zh' ? 'BFX1 已连接' : 'BFX1 CONNECTED'}
          </div>
        )}
      </div>
    </div>
  );
}
