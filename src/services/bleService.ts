/**
 * BLE 服务 — UI002 协议实现
 *
 * 服务 UUID:    000000FE-0000-1000-8000-003c7490af21
 * 写特征值:     000000F1-0000-1000-8000-003c7490af21
 * 读/通知特征值: 000000F2-0000-1000-8000-003c7490af21
 *
 * 12 字节帧格式:
 *   [0]    包头1   0xEA(写请求)/0xEB(保存蓝牙本地)/0xEC(读响应)
 *   [1]    包头2   0x00(保留)
 *   [2-3]  RegAddr 16位小端
 *   [4-7]  RegValue 32位小端
 *   [8-11] Checksum BE32([header,0,regAddr_lo,regAddr_hi]) ^ BE32(LE_bytes(regValue))
 *          校验值以大端序放入[8..11]
 */

import { getParamDef, normalizedToRegValue, buildPEQData, MODULE_BYPASS_ADDR, getLinkedParamDefs, getLegacyLinkedDefs } from "../data/parameterMap";
import { Capacitor } from "@capacitor/core";
import { ampLinkedDefsByName } from "../data/ampKnobResolve";
import { noteSwitchWrite, resetSwitchShadow } from "../data/passThrough";
/* ★ 2026-10-17：写入节奏统一从 config 取（5ms 提速版 / 可一键回退 20ms） */
import { EA_WRITE_MS, EB_WRITE_MS } from "../config/writeTiming";

// ─── BLE Service & Characteristic UUIDs ─────────────────────────────
export const BLE_SERVICE = "000000fe-0000-1000-8000-003c7490af21";
export const BLE_WRITE_CHAR = "000000f1-0000-1000-8000-003c7490af21";
export const BLE_READ_CHAR = "000000f2-0000-1000-8000-003c7490af21";

/* ★ 2026-11-09：演示模式的虚拟设备标识与持久化键 */
const DEMO_DEVICE_ID = 'demo-bfx1';
const DEMO_STORAGE_KEY = 'bfx1_demo_mode';

// ─── Command Headers ────────────────────────────────────────────────
export const CMD_WRITE = 0xea;   // 写请求 (实时调整)
export const CMD_SAVE = 0xeb;   // 保存蓝牙本地 (SAVE 保存到硬件)
export const CMD_READ_RESP = 0xec; // 读响应 (硬件→App)

// ─── Channel Commands (裸 2 字节短帧, 无校验) ────────────────────────
// EE <ch>  跳转频道   (ch = 0x01~0x10 = 频道 1~16)  APP → 7018
// EE FF    查询当前频道                              APP → 7018
// EE <ch>  返回当前频道 (ch = 0x01~0x10)             7018 → APP
export const CMD_CHANNEL = 0xee;   // 频道命令头 (裸 2 字节)
export const CHANNEL_QUERY = 0xff; // 查询当前频道
export const CHANNEL_MIN = 1;
export const CHANNEL_MAX = 16;

// ─── 写节奏闸门 (2026-10-07) ─────────────────────────────────────────
// 背景: 新 UI 的 sendAll() 会把整模块(如箱体 35 段)一次性零延迟压入 BLE,
//       固件 GATT 队列来不及消化 → 拥塞 → 某一帧写失败 → 被误判为断连,
//       表现为「第一次加载正常, 连续第二次加载就失效」。
// 设计文档 T1 条已定案: 批量写间隔固定 20 ms, 不可缩短。
// 这里的闸门是【全工程唯一的节奏来源】: 任意两次 BLE 写之间强制 ≥ 间隔,
//       且按调用顺序 FIFO 串行化（保证 orderBypassSplit 排好的「关=前置 / 开=后置」语义）。
//       原本已自带 sleep(20ms) 的旧路径不会变慢 —— 闸门只在「来得太快」时补足差值。
/** 普通写(0xEA/0xEC/0xED/0xEE)的最小间隔
 *  ★ 2026-10-17：原 T1 定案 20ms，按用户要求改为与 EB 一致的 5ms（提速实验版）。
 *    数值来自 src/config/writeTiming.ts —— 改那里即可整版回退。 */
export const MIN_WRITE_GAP_MS = EA_WRITE_MS;
/** EB(保存到硬件)路径按 K9 决策保持 5 ms, 不随 A3 的 20 ms 统一 */
export const EB_WRITE_GAP_MS = EB_WRITE_MS;

/**
 * ★★★ 2026-11-19（用户报障「安卓上传音色、恢复出厂远慢于 iOS」的核心修复）：
 *   Android 连接后**主动**协商的 MTU。
 *
 *   背景：本文件曾有三处注释写着「插件 connect 内部会 requestMtu(512)」，
 *   但 Capacitor BLE 的 connect() 并**不会**自动协商 MTU —— `requestMtu`
 *   在整个工程里只出现在注释中，代码从未调用过。后果：
 *     · Android 一直停留在 BLE 规范默认 MTU 23
 *     · framesPerPacket = floor((23-3)/12) = **1 帧/包**
 *     · 而 iOS 由 CoreBluetooth 自动协商到约 185（**15 帧/包**）
 *   同样数据量，Android 要多发 15~20 倍的包，再叠加「每包等 GATT 写回调」，
 *   恢复出厂就从一个屏幕级操作变成了几十秒。
 *
 *   取值：185 —— 与 iOS 自动协商的量级一致，固件已经在 iOS 侧长期验证过，
 *   先拿到 iOS 的水准最稳。等固件确认单包接收上限后可再调 512。
 */
export const ANDROID_MTU_REQUEST = 185;
/** 连续写失败达到此次数才判定断连(原实现 1 次即断, GATT 拥塞会误判) */
export const WRITE_FAIL_DISCONNECT_THRESHOLD = 3;

/**
 * ★★ v3.75（H5）：插件调用的硬超时。
 *
 * Android BLE 插件在链路抖动 / 固件忙时，`writeWithoutResponse` 的 promise
 * **可能永远不 settle**。await 永挂的直接后果不是"慢"，而是：
 *   `applyLoadedTone` 的 finally 永不执行 → `duckOff()` 不跑 → 硬件 reg2 停在 1
 *   → **整机输入静音**，同时 `switchBusy` 的全局锁永久锁死（所有写入口早退）。
 * 用户唯一的出路是重启 App，而且找不到原因。
 */
export const WRITE_SLOT_TIMEOUT_MS = 3000;
/** 单次插件写调用的超时（比时隙短：一次写不该超过 1.2s，超了就当失败重试） */
export const WRITE_CALL_TIMEOUT_MS = 1200;

/** 给任意 promise 套一个超时；超时后以 Error 拒绝，让调用方走正常的失败分支 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: timeout after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/* ══════════════ ★★★ v4.27：iOS 写入失败的真正根因修复 ══════════════
 *
 * 一、为什么以前改写入方式全无效
 *   iOS 原生 `Device.write()` 在 writeType == .withoutResponse 时是**发出即 resolve**
 *   （Device.swift:304-309），根本不等 didWriteValueFor。也就是说 v4.21 之后
 *   iOS 上的"写入"这个动作不可能失败 —— `writeRegister` 返回 false 只有三种来源：
 *     ① 插件**全局串行队列**被别的调用堵住 → JS 侧超时；
 *     ② 原生前置校验 reject（Not connected / Device not found / Characteristic not found）；
 *     ③ JS 的 `_connectedDeviceId` 已被清空。
 *   所以 v4.21~v4.25 在 withResponse / withoutResponse / 超时 / 重试上来回改，
 *   改的全是"写"这一层，而故障在它上面一层（队列）和下面一层（连接）。
 *
 * 二、两个真正的杀手
 *   ① `BleClient.initialize()` 在 iOS 原生上是**非幂等**的：Plugin.swift:62-72 每次都
 *      无条件 `new DeviceManager(...)` → 内部 `new CBCentralManager`。旧 manager 是唯一
 *      强引用，被替换即释放 → 它名下已建立的连接被系统拆掉，且**不触发 didDisconnect**。
 *      App 却在 5 处反复调 initialize：启动预热、面板 isEnabled（**每 2.5 秒**）、
 *      startScan、每次 connect 前。于是"连着的时候连接每 2.5 秒被自己拆一次"，
 *      JS 仍认为已连接 → 之后每次写都 reject "Not connected to device."。
 *      安卓的 initialize 只是申请权限、幂等，所以 Android 从来没事。
 *   ② 插件的所有 BLE 调用共用**一条**串行 Promise 链（dist/esm/queue.js），
 *      而 `withTimeout` 只 reject JS 的 promise，**不会把原生调用出队**。
 *      原生侧 DEFAULT_TIMEOUT=5s、CONNECTION_TIMEOUT=10s，JS 侧只等 1.2s/1.5s，
 *      时间差里所有写都排在队头后面 → 成片"写入失败"。
 *      更狠的是 iOS 的 `centralManagerDidUpdateState` 在 .unknown / .resetting 时
 *      **只 emit 不 resolve** "initialize"（DeviceManager.swift:48-70）→ 那条调用
 *      永久悬挂 → 队列永久堵死 → 只能重启 App。
 *
 * 三、本版对策（只改这个文件，不动原生、不 patch 插件）
 *   A. `ensureNativeReady()`：进程内只 initialize 一次，并发共享同一 Promise，
 *      并把 JS 侧超时罩在上面 —— 再也不会因为重复 initialize 拆掉连接。
 *   B. iOS 上初始化成功后立刻 `BleClient.disableQueue()`：项目自己已有
 *      `_acquireWriteSlot` + 全 await 串行，插件那条队列是冗余的第二把锁，
 *      却是全局单点故障。关掉它 = 任何一次调用卡住都只影响它自己，
 *      **已经堵死的队列也会立刻恢复**（不用重启 App）。
 *   C. 所有会卡住的原生调用都显式传 `timeout`，且**原生超时 < JS 超时**：
 *      谁也不会先被 JS 放弃后仍占着链路。
 *   D. iOS 连续 3 次写失败直接判死重连（队列已关，写超时只可能是链路/native 卡死）——
 *      补回 iOS 缺失的自愈闭环。
 * ═══════════════════════════════════════════════════════════════════ */
const IS_IOS = Capacitor.getPlatform() === 'ios';
/** initialize 的 JS 侧硬超时（原生层这个调用**没有**超时，见上面 ②） */
const INIT_TIMEOUT_MS = 4000;
/** 原生侧超时：必须小于对应的 JS 超时，否则 JS 先放弃、原生仍占着链路 */
const NATIVE_TIMEOUT_MS = 1200;
/** JS 侧超时：比 NATIVE_TIMEOUT_MS 长，保证"先由原生给结论" */
const CALL_TIMEOUT_MS = 2000;

let _nativeInit: Promise<boolean> | null = null;
let _queueDisabled = false;
/** 诊断用：插件全局队列是否已被我们关掉（iOS 应为 true） */
export function isPluginQueueDisabled(): boolean { return _queueDisabled; }

/**
 * 原生层初始化：**全工程唯一入口**，成功后永不再调。
 * 并发调用共享同一个 Promise（不会出现第二个 CBCentralManager）。
 * 只有"原生明确 reject"（权限被拒等，说明调用已 settle）才允许下次重试；
 * 超时（悬挂）不复位 —— 否则重试会再造一个 central，把仅有的连接也拆掉。
 */
export function ensureNativeReady(): Promise<boolean> {
  if (_nativeInit) return _nativeInit;
  _nativeInit = (async () => {
    const { BleClient } = await importBlePlugin();
    if (!BleClient) return false;
    try {
      await withTimeout(BleClient.initialize(), INIT_TIMEOUT_MS, 'ble initialize');
    } catch (e) {
      _nativeInit = null;          // 交给下一次调用重试（原生已 settle，不会产生孤儿）
      throw e;
    }
    if (IS_IOS) {
      /* ★ 关键：关掉插件全局串行队列。必须在 initialize 之后、任何业务调用之前。 */
      try {
        BleClient.disableQueue?.();
        _queueDisabled = true;
        console.log('[BLE] iOS: 已关闭插件全局队列（改用 App 自己的写闸门串行）');
      } catch (e) {
        console.warn('[BLE] disableQueue 失败（继续用插件队列）', e);
      }
    }
    return true;
  })();
  return _nativeInit;
}

/* ── EA 多帧打包（BFRT10.187 / M77-eapack）：见 writeEaBatch ── */
/** 设备侧每包帧数硬上限（规则 5） */
export const EA_MAX_FRAMES_PER_PKT = 20;
/** 单包写失败重试次数（Android「上一操作未完成」返回 busy 时靠它兜住） */
const EA_PKT_RETRY = 3;
/** 重试间隔（ms） */
const EA_PKT_RETRY_DELAY_MS = 6;

// ─── PGA I2C Commands ──────────────────────────────────────────────
// PGA Gain via I2C: header=0xED00, device=0x30, register=0x14
// PGA levels: 0=0dB, 1=3dB, 2=6dB, 3=9dB, 4=12dB, 5=15dB, 6=18dB, 7=21dB, 8=24dB, 9=27dB, 10=30dB
const I2C_HEADER = 0xED;
const I2C_DEVICE = 0x30;
const I2C_REG_PGA = 0x14; // Register 0x14, bits[3:0] = PGA gain

/** Build 12-byte I2C frame for PGA control */
export function buildI2CFrame(deviceAddr: number, regAddr: number, value: number): number[] {
  const f = new Array<number>(12).fill(0);
  f[0] = I2C_HEADER; f[1] = 0x00;
  f[2] = deviceAddr & 0xff;
  f[3] = regAddr & 0xff;
  f[4] = value & 0xff; f[5] = (value>>8)&0xff;
  f[6] = (value>>16)&0xff; f[7] = (value>>24)&0xff;
  const headerBE = (I2C_HEADER<<24) | ((deviceAddr&0xff)<<8) | (regAddr&0xff);
  const valBE = ((value&0xff)<<24) | (((value>>8)&0xff)<<16) | (((value>>16)&0xff)<<8) | ((value>>>24)&0xff);
  const cs = (headerBE ^ valBE) >>> 0;
  f[8] = (cs>>>24)&0xff; f[9] = (cs>>>16)&0xff;
  f[10] = (cs>>>8)&0xff; f[11] = cs&0xff;
  return f;
}

/** PGA gain lookup: level 0-10 → register value */
export function pgaLevelToValue(level: number): number {
  return 0x10 | (Math.max(0, Math.min(10, Math.round(level))) & 0x0F);
}

// ─── Device info ────────────────────────────────────────────────────
export interface BLEDevice {
  deviceId: string;
  name: string;
  rssi?: number;
  /** ★ 2026-11-04：广播里的服务 UUID 列表（无线 MIDI 踏板据此识别）。
   *  纯新增字段，不影响原有按名字过滤的逻辑。 */
  uuids?: string[];
}

// ─── Checksum ───────────────────────────────────────────────────────
// CheckSum = BE32([header, 0x00, regAddr_lo, regAddr_hi]) ^ BE32(LE_bytes(regValue))
// 校验值以大端序放入 [8..11] (参见协议 §1.2)
export function calcChecksum(header: number, regAddr: number, regValue: number): number {
  // BE32: header as MSB, then 0x00, then regAddr_lo, regAddr_hi as LSB
  const headerRegBE = (header << 24) | ((regAddr & 0xff) << 8) | ((regAddr >> 8) & 0xff);
  // The 4 regValue LE-bytes interpreted as BE32 (byte-swapped regValue)
  const regValBE = ((regValue & 0xff) << 24) | (((regValue >> 8) & 0xff) << 16) |
                   (((regValue >> 16) & 0xff) << 8) | ((regValue >>> 24) & 0xff);
  return (headerRegBE ^ regValBE) >>> 0;
}

export function buildFrame(header: number, regAddr: number, regValue: number): number[] {
  const frame = new Array<number>(12).fill(0);
  frame[0] = header;
  frame[1] = 0x00;
  frame[2] = regAddr & 0xff;
  frame[3] = (regAddr >> 8) & 0xff;
  frame[4] = regValue & 0xff;
  frame[5] = (regValue >> 8) & 0xff;
  frame[6] = (regValue >> 16) & 0xff;
  frame[7] = (regValue >> 24) & 0xff;
  const cs = calcChecksum(header, regAddr, regValue);
  // 校验值以大端序存储 (MSB first)
  frame[8] = (cs >>> 24) & 0xff;
  frame[9] = (cs >>> 16) & 0xff;
  frame[10] = (cs >>> 8) & 0xff;
  frame[11] = cs & 0xff;
  return frame;
}

/* ★S2c：EB/E8/E9 用的帧（带 sub 字节：表类型+频道）
 * 校验公式不变：hdrBE 多了 sub<<16（对应帧[1]） */
export function buildFrameSub(header: number, sub: number, regAddr: number, regValue: number): number[] {
  const frame = new Array<number>(12).fill(0);
  frame[0] = header & 0xff;
  frame[1] = sub & 0xff;
  frame[2] = regAddr & 0xff;
  frame[3] = (regAddr >> 8) & 0xff;
  frame[4] = regValue & 0xff;
  frame[5] = (regValue >> 8) & 0xff;
  frame[6] = (regValue >> 16) & 0xff;
  frame[7] = (regValue >> 24) & 0xff;
  const hdrBE = (((header & 0xff) << 24) | ((sub & 0xff) << 16) |
                 ((regAddr & 0xff) << 8) | ((regAddr >> 8) & 0xff)) >>> 0;
  const valBE = (((regValue & 0xff) << 24) | (((regValue >> 8) & 0xff) << 16) |
                 (((regValue >> 16) & 0xff) << 8) | ((regValue >>> 24) & 0xff)) >>> 0;
  const cs = (hdrBE ^ valBE) >>> 0;
  frame[8] = (cs >>> 24) & 0xff;
  frame[9] = (cs >>> 16) & 0xff;
  frame[10] = (cs >>> 8) & 0xff;
  frame[11] = cs & 0xff;
  return frame;
}

export function parseFrame(data: number[]): {
  header: number; regAddr: number; regValue: number; checksum: number;
} | null {
  if (data.length < 12) return null;
  const header = data[0];
  const regAddr = data[2] | (data[3] << 8);
  /* ★ 2026-10-17 修复：必须 >>> 0 转无符号。
     JS 的 `<<` 产出的是 int32，第 31 位置 1 时结果是负数（如 0xF8000000 → -134217728），
     而 calcChecksum 返回的是 >>> 0 的无符号值 —— 用 === 直接比较会永远不相等，
     导致 parseFrame 在本该成功的帧上返回 null（实测 62% 的 PEQ 帧被误判为校验失败）。
     PEQ 的 S 字段占 bit27…31，S≥16 时必触发；校验值的 bit31 = 1 ^ (value.bit7)。 */
  const regValue = (data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24)) >>> 0;
  // checksum is big-endian stored (MSB first)
  const checksum = ((data[8] << 24) | (data[9] << 16) | (data[10] << 8) | data[11]) >>> 0;
  if (checksum !== calcChecksum(header, regAddr, regValue)) return null;
  return { header, regAddr, regValue, checksum };
}

// ─── BLE Manager ────────────────────────────────────────────────────
class BLEManager {
  private _connectedDeviceId: string | null = null;
  private _connectedDeviceName: string = "";
  private _disconnectCallback: ((deviceId: string) => void) | null = null;
  private _onNotify: ((data: number[]) => void) | null = null;
  /** Short-frame (裸 2 字节 EE) response handler, used by queryChannel */
  private _onChannelFrame: ((data: number[]) => void) | null = null;
  /** ★ v3.59（F10）：常驻频道推送监听 —— 固件踩钉换档时主动推 [0xEE, ch] */
  private _onChannelPush: ((ch: number) => void) | null = null;
  /* ★S2c：设备→App 3 字节事件帧 [0xEF, evt, ch] */
  private _onDeviceEvent: ((evt: number, ch: number) => void) | null = null;
  private _commitWaiters: Map<number, (ok: boolean) => void> = new Map();
  /* ★★★ 2026-11-03（上传校验闭环）：整表回读的暂存。
   *   固件收到 `EF EE ED <ch>` 后，用 `EC` 帧把该频道 117 条逐条回传（帧里不带频道号，
   *   所以同一时刻只允许一轮回读）；回读完补一帧 `EF 06 <ch>` = 本轮结束。
   *   App 收到 0x06 或超时即收尾，把 addr→val 交给调用方比对。 */
  private _readMap: Map<number, number> | null = null;
  private _readDone: ((m: Map<number, number>) => void) | null = null;
  private _readTimer: ReturnType<typeof setTimeout> | null = null;
  /** External handler called when the device disconnects unexpectedly */
  private _onDisconnectHandler: ((deviceId: string) => void) | null = null;
  /** Set to true during voluntary disconnect() to avoid double-triggering */
  private _disconnecting: boolean = false;
  /**
   * User-initiated disconnect counter (v3.77 / P4).
   * Incremented on EVERY disconnect() call, including the early-return branch.
   * The auto-reconnect chain in Index.tsx snapshots this value before backing off
   * and aborts as soon as it changes — otherwise a pending retry would reconnect
   * the device right after the user explicitly asked to disconnect.
   */
  private _manualDiscCount: number = 0;
  get manualDiscCount(): number { return this._manualDiscCount; }

  /**
   * ★★ 2026-11-17（iOS TestFlight「无限重连、一直连不上」根治）：
   * 同一时刻只允许一条 connect() 在原生层执行。
   *
   * 现场机制：App 有两条独立的重连驱动 —— Index 的断线重连环 与 蓝牙面板
   * startScan 的自动连。两者会同时调 BleClient.connect(同一 deviceId)。插件内部
   * 用队列串行化，且每个 connect 都会先 remove 旧的 disconnected 监听再注册新的；
   * 更糟的是失败的那一方在 cleanup 里调 disconnect()，把另一方刚建立/正在建的
   * 链路拆掉 —— 两边互相拆台，谁也连不上，各自再退避重试 → 无限重连。
   *
   * 这里把并发调用收敛成同一个 Promise：后来者直接复用在飞的这一次，不再发起
   * 第二条原生 connect，也就不会互相 disconnect。
   */
  private _connectInFlight: Promise<boolean> | null = null;
  /** 是否已有 connect() 在飞（面板/重连环据此避让，不再另起一条） */
  get connecting(): boolean { return this._connectInFlight !== null; }

  // ─── 写节奏闸门状态 (2026-10-07) ───────────────────────────────────
  /** 上一次 BLE 写【结束】的时间戳(ms)。闸门据此补足最小间隔。 */
  private _lastWriteEndAt: number = 0;
  /** 串行化锁尾: 每个写请求接到链尾, 保证 FIFO 且同一时刻只有一个写在飞。 */
  private _writeLock: Promise<void> = Promise.resolve();
  /** 协商后的 ATT MTU（未读到前按 23 保守估计） */
  private _mtu = 23;
  /** 是否已成功读到过 MTU（读到后不再重复请求） */
  private _mtuKnown = false;
  /** 连续写失败计数; 成功即清零, 达 WRITE_FAIL_DISCONNECT_THRESHOLD 才判掉线。 */
  private _consecutiveWriteFailures: number = 0;
  /** 会话级重置 */
  private _resetWriteChain(): void {
    this._writeLock = Promise.resolve();
    this._lastWriteEndAt = 0;
    this._consecutiveWriteFailures = 0;
  }

  /**
   * ★★ v4.21（iOS 写入失败根治）：统一 GATT 写调用。
   * 官方 issue #661：iOS 上 BleClient.write（withResponse）在设备**已成功写入**后，
   * didWriteValueFor 回调不触发 → promise 超时 → 误报「写入失败」；加大超时无效，
   * 而同一固件 Android 正常。固件 F1 属性 0x0c 含 WRITE_NO_RSP，且本项目 EA 批量写
   * 一直用 writeWithoutResponse 且工作正常。
   * 故 iOS 单帧写也改用 writeWithoutResponse（发出即 resolve，不等回调），
   * Android 保持 withResponse（其回调可靠）。noResponse 调用方显式要求时也走无响应。
   */
  private async writeOnGatt(dv: DataView, label: string): Promise<void> {
    const id = this._connectedDeviceId;
    if (!id) throw new Error('not connected');
    const { BleClient } = await importBlePlugin();
    if (!BleClient) throw new Error('BleClient not available');
    const isIOS = Capacitor.getPlatform() === 'ios';
    /* ★★ v4.22（iOS 写入失败再修）：
       iOS 上一律用 writeWithoutResponse —— 插件原生层在 CoreBluetooth 发出帧后
       立即 resolve（不等 didWriteValueFor 回调），彻底绕开 #661/#809 那类
       "写成功了但回调不来→超时误报失败"。它本身同步返回，**不套 withTimeout**
       （外层 1.2s 超时在慢机上反而会误杀一次成功的发出）。
       带一次重试：首次失败常是 GATT 忙（buffered），隔 60ms 重发即可。
       Android 继续用 write（withResponse），其回调可靠。 */
    if (isIOS) {
      let lastErr: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          /* ★ v4.25：必须给插件调用套超时。
             ★ v4.27：插件全局队列已在 iOS 上关掉（ensureNativeReady），
               这条写不会再被别的调用堵住；这里的超时只兜"原生 bridge 本身卡住"。
               writeWithoutResponse 正常路径是同步 resolve，超时值不必再压到 1.2s。 */
          await withTimeout(
            BleClient.writeWithoutResponse(id, BLE_SERVICE, BLE_WRITE_CHAR, dv),
            WRITE_CALL_TIMEOUT_MS, 'ios write');
          return;
        } catch (e) {
          lastErr = e;
          if (attempt === 0) await new Promise((r) => setTimeout(r, 60));
        }
      }
      console.error(`[BLE] ${label} iOS writeWithoutResponse 失败:`, lastErr);
      throw lastErr;
    }
    /* ★★★ v4.27（别让 JS 先"弃单"）：显式传原生 timeout。
       旧实现只靠外层 withTimeout(1.2s) 放弃 —— 原生那边仍在跑（默认 5s），
       这 3.8s 里这条调用一直占着插件队列，后面所有写全部超时。
       现在让原生 1.2s 先 reject（队列立刻前进），JS 2s 兜底。 */
    await withTimeout(
      BleClient.write(id, BLE_SERVICE, BLE_WRITE_CHAR, dv, { timeout: NATIVE_TIMEOUT_MS }),
      CALL_TIMEOUT_MS, label);
  }

  /** 写时隙：排队 + 最小间隔（见 _acquireWriteSlot） */
  private async _acquireWriteSlot(command: number): Promise<() => void> {
    const gap = command === CMD_SAVE ? EB_WRITE_GAP_MS : MIN_WRITE_GAP_MS;
    let release!: () => void;
    const mine = new Promise<void>((res) => { release = res; });
    const prev = this._writeLock;
    this._writeLock = prev.then(() => mine);

    /* ★★ v3.75（H5）：排队等待加**硬上限**。
       若上一个持有者因插件 promise 永不 settle 而没 release，这里原本会永远挂着 →
       整条写链路死锁（连 duckOff 都发不出去）。超时后重建锁，让本次直接拿到时隙，
       代价是可能和"失联的上一次写"重叠一次，比永久静音好得多。 */
    const stuck = await new Promise<boolean>((res) => {
      const t = setTimeout(() => res(true), WRITE_SLOT_TIMEOUT_MS);
      prev.then(() => { clearTimeout(t); res(false); });
    });
    if (stuck) {
      console.warn('[BLE] 写时隙等待超时 3s —— 重建锁继续（上一次写已失联）');
      this._writeLock = mine;
    }

    const wait = this._lastWriteEndAt + gap - Date.now();
    if (wait > 0) await new Promise((res) => setTimeout(res, wait)); // ② 补足最小间隔
    let done = false;
    return () => {
      if (done) return;                            // 防重复 release
      done = true;
      this._lastWriteEndAt = Date.now();
      release();
    };
  }

  // Web Bluetooth API 适配 (前端 + Capacitor 通用)
  private _bleServer: BluetoothRemoteGATTServer | null = null;
  private _writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private _readChar: BluetoothRemoteGATTCharacteristic | null = null;
  // In Capacitor environment, force native BLE plugin.
  // Chromium WebView exposes navigator.bluetooth but it does not work
  // reliably for GATT operations — the Capacitor plugin must be used instead.
  private _useWebBluetooth: boolean = (() => {
    if (typeof navigator === 'undefined') return false;
    // Detect Capacitor runtime (window.Capacitor is injected by the framework)
    const isCapacitor = typeof window !== 'undefined' && 'Capacitor' in window;
    if (isCapacitor) {
      console.log('[BLE] Capacitor detected — using native BLE plugin, not Web Bluetooth');
      return false;
    }
    return 'bluetooth' in navigator;
  })();

  /* ★★★ 2026-11-09：演示模式（App Review / 无硬件）——
     开启后完全不触碰真实蓝牙：扫描返回一台虚拟 BFX1，连接、读写、回读
     全部走本地寄存器表。审核员没有硬件也能把界面与交互走完。 */
  private _demoMode = false;
  private _demoRegs = new Map<number, number>();
  private _demoChannel = 1;
  get demoMode(): boolean { return this._demoMode; }
  setDemoMode(on: boolean): void {
    if (on === this._demoMode && this._connectedDeviceId === null) return;
    this._demoMode = on;
    this._demoRegs.clear();
    this._demoChannel = 1;
    this._connectedDeviceId = null;
    this._connectedDeviceName = '';
    this._consecutiveWriteFailures = 0;
    try { localStorage.setItem(DEMO_STORAGE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  }
  /** 启动时恢复上次选择（审核员会反复冷启动 App，演示模式必须能留住） */
  restoreDemoMode(): void {
    try { if (localStorage.getItem(DEMO_STORAGE_KEY) === '1') this._demoMode = true; } catch { /* ignore */ }
  }

  get connected(): boolean { return this._connectedDeviceId !== null; }
  get deviceId(): string | null { return this._connectedDeviceId; }
  get deviceName(): string { return this._connectedDeviceName; }

  /** Register a handler that fires when the device disconnects unexpectedly */
  setOnDisconnectHandler(handler: ((deviceId: string) => void) | null): void {
    this._onDisconnectHandler = handler;
  }

  async init(): Promise<boolean> {
    return true;
  }

  /** Check whether Bluetooth is currently enabled. Web fallback always returns true. */
  async isEnabled(): Promise<boolean> {
    if (this._demoMode) return true;
    if (this._useWebBluetooth) return true;
    try {
      const { BleClient } = await importBlePlugin();
      if (!BleClient) return true;
      /* ★★★ v4.27（iOS 写入失败根治）：**不再调用 BleClient.initialize()**。
         旧实现在这里每次都 initialize —— 而 iOS 原生的 initialize 非幂等
         （无条件新建 DeviceManager + CBCentralManager），旧 central 一释放，
         它名下那条连接就被系统拆掉，且不触发 didDisconnect：
           JS 仍显示"已连接" → 之后每次写都被原生 reject "Not connected to device."
           → 命中 linkLost → 拆链路重连 → 重连里又 initialize → 死循环。
         蓝牙面板可见时这里被 **每 2.5 秒** 调一次（BluetoothPanel 的 probe 轮询），
         等于连着的时候连接每 2.5 秒被自己拆一次 —— Android 的 initialize 是幂等的，
         所以这个坑只在 iOS 上出现。改成走 ensureNativeReady()（进程内只一次）。 */
      await withTimeout(ensureNativeReady(), INIT_TIMEOUT_MS, 'ble ready').catch(() => {});
      return await withTimeout(BleClient.isEnabled(), CALL_TIMEOUT_MS, 'ble isEnabled');
    } catch (e) {
      console.warn('[BLE] isEnabled check failed:', e);
      return true;
    }
  }

  /** Open the system Bluetooth settings page (native only). */
  async openBluetoothSettings(): Promise<void> {
    if (this._useWebBluetooth) return;
    try {
      const { BleClient } = await importBlePlugin();
      /* ★ iOS：插件没有 openBluetoothSettings（调用会 reject），蓝牙开关也不在设置页，
         真正要用户改的是「本 App 的蓝牙权限」→ 直接打开 App 设置页。 */
      const platform = Capacitor.getPlatform();
      if (platform === 'ios') {
        await BleClient?.openAppSettings();
      } else {
        await BleClient?.openBluetoothSettings();
      }
    } catch (e) {
      console.warn('[BLE] openBluetoothSettings failed:', e);
    }
  }

  async startScan(onDeviceFound: (device: BLEDevice) => void): Promise<void> {
    if (this._demoMode) {
      /* 演示模式：延迟 1.2 秒“发现”虚拟设备，模拟真实扫描节奏（面板会据此自动连接） */
      setTimeout(() => {
        if (!this._demoMode) return;      // 期间用户已关闭演示模式 → 不再投递虚拟设备
        onDeviceFound({
          deviceId: DEMO_DEVICE_ID,
          name: 'BFX1 演示设备',
          rssi: -46,
          uuids: [BLE_SERVICE],
        });
      }, 1200);
      return;
    }
    if (this._useWebBluetooth) {
      // Web Bluetooth: requestDevice shows a system dialog for user to pick a device
      // It does NOT do continuous scanning - just one device at a time
      try {
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [BLE_SERVICE],
        });
        onDeviceFound({
          deviceId: device.id,
          name: device.name || `Unknown (${device.id.slice(0, 8)})`,
        });
      } catch (e: any) {
        if (e?.name !== 'NotFoundError') throw e;
      }
    } else {
      // Capacitor native BLE plugin path
      const { BleClient } = await importBlePlugin();
      if (!BleClient) {
        console.warn("No BLE plugin available");
        return;
      }
      // Ensure Bluetooth is enabled
      try {
        /* ★★★ v4.27：走 ensureNativeReady（进程内只初始化一次）。
           旧实现每次扫描都 initialize —— iOS 上会重建 CBCentralManager，
           把已建立的连接拆掉（详见文件头）。 */
        await ensureNativeReady();
      } catch (e: any) {
        /* ★ iOS：权限被拒 / 蓝牙不可用时 initialize 会 reject。
           旧实现一律吞掉 → 界面永远停在“搜索中”却搜不到任何设备（用户以为 App 识别坏了）。
           这里只把「真错误」抛出，让面板给出可操作的提示；
           其它情况（重复初始化等）继续静默。 */
        const msg = String(e?.message || e || '');
        if (/permission|denied|unsupported|unauthorized/i.test(msg)) {
          throw new Error(Capacitor.getPlatform() === 'ios'
            ? '蓝牙权限未开启，请到「设置 → BFX1」允许蓝牙'
            : msg);
        }
      }
      /* ★ 2026-11-16：stopLEScan 之后立刻 requestLEScan 在部分 Android 机型上会
         返回 "Scan already started" / "busy" —— 隔 260ms 重试一次即可，
         否则面板会停在"搜索中"却永远收不到设备（用户以为连不上）。 */
      const onResult = (result: any) => {
        const dev = result.device;
        onDeviceFound({
          deviceId: dev.deviceId,
          /* ★ iOS 识别加固：device.name 在未连接前可能为空（名字取自广播 localName）。
             优先用 name，回落到 localName，最后才用 UUID 前 8 位。 */
          name: dev.name || result.localName || `Unknown (${dev.deviceId.slice(0, 8)})`,
          rssi: result.rssi ?? undefined,
          /* ★ 2026-11-04：透传广播服务 UUID，供无线 MIDI 踏板识别（空数组也透传）。
             ★ 统一小写：iOS 回传的是大写 UUID，比较时会漏判。 */
          uuids: (dev.uuids ?? []).map((u) => u.toLowerCase()),
        });
      };
      try {
        await BleClient.requestLEScan({ allowDuplicates: true }, onResult);
      } catch (e) {
        console.warn('[BLE] requestLEScan failed, retry once:', e);
        await new Promise((r) => setTimeout(r, 260));
        await BleClient.stopLEScan().catch(() => {});
        await BleClient.requestLEScan({ allowDuplicates: true }, onResult);
      }
    }
  }

  async stopScan(): Promise<void> {
    if (this._demoMode) return;        // 演示模式没有真实扫描，别去调插件（否则会白弹权限框）
    if (this._useWebBluetooth) return;
    try {
      const { BleClient } = await importBlePlugin();
      await BleClient?.stopLEScan();
    } catch { /* ignore */ }
  }

  async connect(deviceId: string, deviceName?: string): Promise<boolean> {
    /* ★★ 2026-11-17：单飞守卫 —— 并发的第二次调用直接复用在飞的 Promise。
       面板自动连 + Index 重连环同时到时，只有第一条真正打到原生层；
       其余共享同一结果，杜绝「两条 connect 互相 disconnect」的死循环。 */
    if (this._connectInFlight) return this._connectInFlight;
    const p = this._connectInternal(deviceId, deviceName).finally(() => {
      this._connectInFlight = null;
    });
    this._connectInFlight = p;
    return p;
  }

  private async _connectInternal(deviceId: string, deviceName?: string): Promise<boolean> {
    if (this._demoMode) {
      /* 演示模式：直接建立虚拟连接，不做 GATT 发现/MTU 协商 */
      this._connectedDeviceId = deviceId || DEMO_DEVICE_ID;
      this._connectedDeviceName = deviceName || 'BFX1 演示设备';
      this._demoRegs.clear();
      this._demoChannel = 1;
      this._mtu = 512;
      this._mtuKnown = true;
      this._consecutiveWriteFailures = 0;
      return true;
    }
    /* ★ 新连接 → MTU 需要重新协商读取（插件 connect 内部会 requestMtu(512)） */
    this._mtu = 23;
    this._mtuKnown = false;
    /* ★ 2026-11-16：上一会话残留的写队列 / 未完成的整表回读一律作废，
       否则重连后的第一帧要排在挂住的旧 Promise 后面（= 连上却像卡死）。 */
    this._resetWriteChain();
    this._finishRead();
    try {
      if (this._useWebBluetooth) {
        const device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [BLE_SERVICE] }],
        });
        this._bleServer = device.gatt ? await device.gatt.connect() : null;
        if (!this._bleServer) return false;
        const service = await this._bleServer.getPrimaryService(BLE_SERVICE);
        this._writeChar = await service.getCharacteristic(BLE_WRITE_CHAR);
        this._readChar = await service.getCharacteristic(BLE_READ_CHAR);
        this._connectedDeviceId = device.id;
        this._connectedDeviceName = device.name || device.id;
        // 订阅通知
        if (this._readChar && this._readChar.properties.notify) {
          await this._readChar.startNotifications();
          this._readChar.addEventListener('characteristicvaluechanged', (ev: Event) => {
            const target = ev.target as BluetoothRemoteGATTCharacteristic;
            if (target.value) {
              this._dispatchNotify(Array.from(new Uint8Array(target.value.buffer)));
            }
          });
        }
      } else {
        const { BleClient } = await importBlePlugin();
        if (!BleClient) return false;
        this._disconnectCallback = (id: string) => {
          if (id === this._connectedDeviceId) {
            this._connectedDeviceId = null;
            this._connectedDeviceName = "";
            /* ★ 2026-11-16：掉线时立刻收尾「正在做的事」——
               挂住的写队列 / 未完成的整表回读 / 等 E9 回执的 waiter
               以前会各自死等到 3s 超时；重连后第一批帧就排在这些死等后面。 */
            this._resetWriteChain();
            this._finishRead();
            this._commitWaiters.clear();
            /* ★ 2026-10-20（C3）：断线 = 硬件开关状态未知 → 清空影子表，
               重连后第一次 applySwitchState 必定全量写 9 条，不会再留错位。 */
            resetSwitchShadow();
            if (!this._disconnecting) {
              this._onDisconnectHandler?.(id);
            }
          }
        };
        /* ★★★ 2026-10-30：首连重试从 2 次加到 3 次，退避 350 / 800ms。
         *
         * 现场现象：「开机偶发提示连接失败，手动重连一次就稳定」。
         * 根因（固件侧已同步修）：广播间隔原来被留在 **400ms**（BFRT10.86 诊断实验的遗留值），
         * Android 低功耗扫描窗口撞上的概率低、连接请求也容易等超时。
         *
         * App 这边再兜两层：
         *   ① 梯度退避换广播事件（350 → 800ms），比固定 350ms 更容易撞上新窗口；
         *   ② 每次失败先 disconnect 清掉 Android 的 GATT 残留（133 GATT_ERROR
         *      多半是上一次连接资源没释放），否则重连会一直失败。
         *
         * 另外开机 8s 内还有个天然空窗：bt_comm 注释记载 BT_STATUS_INIT_OK ~3.5s、
         * **host 栈 ~8.7s 才完全就绪**，这期间 connect 可能成功但服务发现失败。
         * 梯度退避正好跨过这段。 */
        /* ★ 2026-11-16：自动重连链里不经过 startScan，插件可能还没 initialize
           （首次连接后 App 被系统回收、或用户从后台回来）—— 这里补一次，幂等。
           失败不阻塞：真正的权限问题会在 connect 时给出明确错误。
           ★ v4.27：改走 ensureNativeReady —— 旧实现在这里裸调 initialize，
             自动重连每次都重建 CBCentralManager，等于"重连前先把上一次的连接拆掉"，
             是 iOS 无限重连的一环。 */
        try { await ensureNativeReady(); } catch { /* 已初始化 / 无权限：继续交给 connect */ }
        /* ★★★ 2026-11-17（官方文档要求 · iOS 自动重连关键）：
           官方 README「getDevices」章节明确：iOS 上要用 deviceId 连接一个
           「之前连过、但本次没有先扫描」的设备，必须先 getDevices()——
           它底层走 retrievePeripherals，把已知 UUID 重新登记进插件的 deviceMap；
           否则 connect 直接 reject "Device not found. Call 'requestDevice',
           'requestLEScan' or 'getDevices' first."（见 Plugin.swift getDevice）。
           自动重连环 / 冷启动后没有扫描，正是在这种状态 → 连接失败。
           这里在 iOS 上幂等补一次登记，失败不阻塞（后面还有短扫描兜底）。 */
        if (Capacitor.getPlatform() === 'ios') {
          try { await BleClient.getDevices?.([deviceId]); } catch { /* 登记失败交给 connect / 重扫 */ }
        }
        /* ★★★ 2026-11-17（iOS TestFlight「卡住/连接失败/无响应」根因）：
           官方 `@capacitor-community/bluetooth-le` connect() 默认超时 **10s**，
           且 iOS 上 connect 分两段：didConnect 物理连上 → 再发现所有服务+特征，
           全部完成才 resolve（见 Device.swift didDiscoverCharacteristicsFor →
           resolve("connect")）。因此 connect 的真实耗时天然含服务发现。
           旧代码把超时压到 4s —— iPhone 冷启动 / 服务发现常 >4s → 被判超时失败，
           3 次重试叠加把连接拖到 13s+，超过 ConnectionFlash 的 12s UI 上限，
           于是用户看到「正在连接卡住 → 未收到设备响应 → 连接失败」。
           改为**遵循官方默认 10s**（Android 同样受益，其插件本就在发现完成后才 resolve），
           一次 connect 就能走完两段，不再靠缩短超时+重试来赌。 */
        const CONN_TIMEOUT_MS = 10000;
        const CONN_BACKOFF_MS = [400, 900];
        let lastErr: unknown = null;
        for (let attempt = 0; attempt <= CONN_BACKOFF_MS.length; attempt++) {
          try {
            await BleClient.connect(deviceId, this._disconnectCallback, {
              /* 官方默认 10s：iOS 需覆盖「物理连接 + 服务/特征发现」全过程 */
              timeout: CONN_TIMEOUT_MS,
              /* ★ 2026-11-17（撤回提速参数·写入失败根因）：
                 之前为提速加了 skipDescriptorDiscovery:true，但官方 issue #809 确认
                 iOS 上该标志存在线程竞态——重连时读回 stale false，去等永远不会来的
                 descriptor 发现 → connect 超时/得到半连接，表现为「连上了但旋钮写不进去」。
                 改回官方默认 false（完整发现服务+特征+描述符），稳定性优先。
                 代价：每次 iOS 连接多约 0.5~1s，但写入可靠。 */
              skipDescriptorDiscovery: false,
            });
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            const emsg = String((err as any)?.message || err || '');
            /* ★ iOS 专有坑：插件每次 startLEScan 都会清空「已发现设备表」，
               而面板回到前台补扫时是保留旧列表的 → 用户点旧条目时 UUID 已不在表里，
               connect 直接 reject “Device not found.”（安卓按 MAC 直连不受影响）。
               这里发现该错误就先补一轮短扫描把设备重新登记，再进下一次重试。 */
            if (Capacitor.getPlatform() === 'ios' && /not found|not discovered|unknown device/i.test(emsg)) {
              await this.rescanForDevice(deviceId);
            }
            /* 清理残留：不 catch 会让原始错误被覆盖。
               ★ 2026-11-16：加 900ms 硬上限 —— Android 上 disconnect 一个半死句柄
               本身可能挂住，以前会把整条重试链拖成十几秒。 */
            await withTimeout(BleClient.disconnect(deviceId), 900, 'conn cleanup').catch(() => {});
            if (attempt < CONN_BACKOFF_MS.length) {
              await new Promise((r) => setTimeout(r, CONN_BACKOFF_MS[attempt]));
            }
          }
        }
        if (lastErr) throw lastErr;
        /* ★★ iOS 专有坑（“连上了但什么都不生效”）：插件在 didConnect 时就 resolve 了
           connect，此时服务/特征值还没发现完（discoverServices 是异步接着跑的）。
           紧接着的 startNotifications / 首包写入会拿到 “Characteristic not found”，
           表现就是「显示已连接，但旋钮不同步、回读收不到」。
           这里在 iOS 上等 F1/F2 两个特征值真正出现再返回成功。 */
        await this.ensureIOSReady(deviceId);
        /* ★★★ 2026-11-19（安卓慢于 iOS 的根因修复）：
           连接完成、服务已发现之后，Android 主动协商 MTU。
           旧版本一直以为插件 connect 会自动 requestMtu(512)，实际从未发生 →
           MTU 停在 23 → 每包只能装 1 帧（而 iOS 是 15 帧/包）。
           放在订阅之前：SDK 的 onMtuChanged 会在订阅前落定，后续所有写都用新值。
           失败静默（保持 23），行为与旧版完全一致，不会让连接失败。 */
        if (Capacitor.getPlatform() === 'android') {
          try {
            const { BleClient: BC } = await importBlePlugin();
            if (BC) {
              await withTimeout(
                BC.requestMtu(deviceId, ANDROID_MTU_REQUEST), 2500, 'requestMtu',
              ).catch(() => { /* 协商失败不阻塞连接 */ });
              const rawMtu = await withTimeout(BC.getMtu(deviceId), 1200, 'getMtu').catch(() => 0);
              const m = Number(rawMtu);
              if (Number.isFinite(m) && m > 23) {
                this._mtu = m;
                this._mtuKnown = true;
                console.log('[BLE] Android MTU =', m, '→ framesPerPacket =', this.framesPerPacket);
              } else {
                console.warn('[BLE] Android MTU 仍是默认值，上传会偏慢（framesPerPacket=1）');
              }
            }
          } catch { /* 插件缺失 / 平台不支持：保持旧行为 */ }
        }
        /* ★★★ v4.27：**先订阅，再置"已连接"**（顺序反转）。
         *   旧顺序：先置 `_connectedDeviceId`（UI 立刻显示已连接）→ 再 await 订阅。
         *   订阅的原生超时 5s、这里 JS 只等 1.5s —— 那 3.5s 空窗里用户拧第一下旋钮，
         *   写就排在订阅后面 → 1.2s 超时 → 弹"刚连上就写入失败"。
         *   现在订阅完成（或明确超时）之后才把 connected 置起来，这个窗口自然消失。 */
        await this._subscribeNotifications(deviceId);
        this._connectedDeviceId = deviceId;
        this._connectedDeviceName = deviceName || deviceId;
        /* ★★★ 2026-11-16（用户报障「断联后特别容易卡住」的根因之一）：
         *   通知订阅（CCCD）原来**只在蓝牙面板的手动连接路径**里做一次。
         *   断线自动重连走的是 Index 的 connect() → 不订阅 ⇒ 之后的
         *     · EE 频道推送收不到（踩钉换档不同步）
         *     · 整表回读（EC 帧）收不到 → 每次上传校验死等 3s
         *     · E9 提交回执收不到
         *   用户看到的就是「连上了，但切档/上传像卡住」。
         *   现在把订阅并入 connect()：任何连接路径（手动 / 自动 / 补连）都自带。
         *   ★ v4.27：订阅已上移到置"已连接"之前（见上），这里不再重复调用。
         */
      }
      // ★ 2026-10-07: 新连接 = 干净状态, 复位写节奏闸门
      this._resetWriteChain();
      this._lastWriteEndAt = 0;
      /* ★ 2026-10-20（C3）：新连接 = 硬件开关状态未知 → 清影子，保证首次对齐为全量写 */
      resetSwitchShadow();
      return true;
    } catch (e) {
      console.error("BLE connect failed:", e);
      /* ★★ 2026-11-17：connect 失败（含 iOS 服务发现超时）时必须把可能残留的
         半连接真正断开。否则原生层仍认为连着，下一次 connect 直接拿到这条
         没发现服务的死链 → 再超时 → 再失败，表现为「一直连不上」。 */
      try {
        const { BleClient } = await importBlePlugin();
        if (BleClient) await withTimeout(BleClient.disconnect(deviceId), 900, 'final cleanup').catch(() => {});
      } catch { /* 清理失败不影响返回 */ }
      this._connectedDeviceId = null;
      this._connectedDeviceName = "";
      return false;
    }
  }

  /**
   * iOS：等 F1 / F2 特征值真正被发现完再返回。
   * 安卓的 connect 在服务发现完成后才 resolve，iOS 的插件不是 —— 必须自己等。
   */
  private async ensureIOSReady(deviceId: string, timeoutMs = 5000): Promise<void> {
    if (Capacitor.getPlatform() !== 'ios') return;
    const { BleClient } = await importBlePlugin();
    if (!BleClient) return;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try {
        const res = await BleClient.getServices(deviceId);
        const svc = (res?.services || []).find(
          (s: any) => String(s?.uuid || '').toLowerCase() === BLE_SERVICE,
        );
        if (svc) {
          const chars = (svc.characteristics || []).map((c: any) => String(c?.uuid || '').toLowerCase());
          if (chars.includes(BLE_READ_CHAR) && chars.includes(BLE_WRITE_CHAR)) return;
        }
      } catch { /* 服务尚未发现，继续轮询 */ }
      await new Promise((r) => setTimeout(r, 120));
    }
    /* ★★ 2026-11-17（按官方文档修正）：插件 v8 的 connect() 已经在
       didDiscoverServices + didDiscoverCharacteristicsFor 全部完成后才 resolve，
       即 connect 返回成功时 F1/F2 **必然已发现**（见 Device.swift / setOnConnected）。
       所以这里只是「二次确认」，超时不能当成连接失败 —— 上一版改成 throw 是错的：
       一旦 getServices 回包形态与预期不一致（iOS 大小写/短 UUID 等），会把本来
       健康的连接判死，触发「连接失败 + 重连」。降级为非致命告警，信任插件结果。 */
    console.warn('[BLE] iOS 服务发现二次确认超时（不判失败，插件 connect 已完成发现）');
  }

  /**
   * 只为「一台已知设备」补一轮短扫描（最多 ~1.5s）。
   * iOS 插件在每次 requestLEScan 时清空内部设备表，重扫后旧列表项会失效；
   * 这里扫到目标 UUID 就立刻停，用来把设备重新登记进插件。
   */
  private async rescanForDevice(deviceId: string, waitMs = 1500): Promise<void> {
    if (this._useWebBluetooth) return;
    const { BleClient } = await importBlePlugin();
    if (!BleClient) return;
    let found = false;
    try {
      await BleClient.requestLEScan({ allowDuplicates: true }, (r: any) => {
        if (r?.device?.deviceId === deviceId) found = true;
      });
    } catch { return; }
    const t0 = Date.now();
    while (!found && Date.now() - t0 < waitMs) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await BleClient.stopLEScan().catch(() => {});
  }

  async disconnect(): Promise<void> {
    /* ★★ v3.77（P4）：**必须在早退之前自增**。
       意外断线后自动重连链在退避中等待，此时用户点「断开」，`_connectedDeviceId`
       已经是 null → 旧实现直接 return，谁也不知道用户要求过断开 → 退避到点后照样
       把设备连回来（用户看到「断了又自己连上」）。 */
    this._manualDiscCount++;
    /* ★ 2026-11-16：主动断开也要清队列 / 收尾回读 —— 否则挂住的写会把下次连接拖死 */
    this._resetWriteChain();
    this._finishRead();
    if (this._demoMode) {
      this._connectedDeviceId = null;
      this._connectedDeviceName = '';
      this._demoRegs.clear();
      return;
    }
    if (!this._connectedDeviceId) return;
    this._disconnecting = true;
    if (this._useWebBluetooth) {
      this._bleServer?.disconnect();
      this._bleServer = null;
      this._writeChar = null;
      this._readChar = null;
    } else {
      try {
        const { BleClient } = await importBlePlugin();
        await BleClient?.disconnect(this._connectedDeviceId);
      } catch { /* ignore */ }
    }
    this._connectedDeviceId = null;
    this._connectedDeviceName = "";
    /* ★ 2026-10-20（C3）：主动断开同样清影子（下次连接按全量重建开关状态） */
    resetSwitchShadow();
    this._disconnecting = false;
  }

  /* ★★★ 2026-11-04（用户报障：硬件关机再开机后 App 仍显示"已连接/无法连接"，
     必须手动点断开再连）：
     Android 在设备掉电时经常**不发** GATT 断线事件，`_connectedDeviceId` 一直留着，
     上层看到"已连接"就不去扫描/不重连。这里做一次真实 GATT 读探测；
     读失败就清掉残留连接 + 触发断线回调，让上层自动重连链/扫描接管。 */
  async probeAlive(timeoutMs = 1200): Promise<boolean> {
    if (this._demoMode) return this._connectedDeviceId !== null;
    const id = this._connectedDeviceId;
    if (!id) return false;
    if (this._useWebBluetooth) {
      const alive = !!this._bleServer?.connected;
      if (!alive) await this.hardResetLink(id);
      return alive;
    }
    /* ★★ v4.25（iOS 写入失败真正根治 · 撤回 v4.24 的错误探活）：
       v4.24 这里用 BleClient.getConnectedDevices 做核验，但它**走插件全局 queue**——
       withTimeout 只是让 JS 放弃等待，队列里那个调用若因原生不回调而永不 settle，
       会把整条 queue 永久堵住，之后**每一次 write 都排在它后面全部超时**
       → 表现正是「显示已连接、一拧旋钮就写入失败、改写入方式全无效、iOS-only」。
       彻底移除：iOS 不做任何走插件 API 的主动探活，信任原生 didDisconnect 回调；
       链路真断时由 writeRegister catch 里的错误文本识别（不进 queue）触发重连。 */
    if (Capacitor.getPlatform() === 'ios') return true;
    /* ★ 2026-11-16（用户报障「连接不稳定时特别容易卡住」）：
       一次读超时**不代表链路死了** —— 上传/切换时 GATT 正忙，读探测经常撞上拥塞。
       旧实现一次失败就 hardResetLink → 把健康链路拆掉 → 触发重连 → 用户看到"卡住/重启"。
       现在必须**连续两次**（间隔 220ms）都读不到才判死。 */
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { BleClient } = await importBlePlugin();
        await Promise.race([
          BleClient.read(id, BLE_SERVICE, BLE_READ_CHAR),
          new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), timeoutMs)),
        ]);
        return true;
      } catch {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 220));
      }
    }
    await this.hardResetLink(id);
    return false;
  }

  /**
   * ★★ 2026-11-11（用户报障「切换参数就会重启蓝牙」）：
   * 写/读超时**不等于**掉线 —— GATT 拥塞、硬件忙、一次性调度抖动都会让单次调用超时。
   * 旧实现在连续 3 次写失败后立刻判死 → 触发上层自动重连（用户看到的就是「蓝牙重启」）。
   * 现在先做一次真实读探测，只有链路确实断了才清状态并通知上层重连。
   */
  private async confirmDeadLink(): Promise<void> {
    if (!this._connectedDeviceId) return;
    /* ★★★ v4.27（iOS 自愈闭环）：
       v4.25 为了避开"插件队列被探活堵死"，iOS 上直接 `probeAlive → true`，
       结果 iOS 失去了唯一的自愈路径 —— 失同步后永远不重连，只能重启 App。
       现在插件全局队列已经关掉（见 ensureNativeReady），"写超时"不再可能是排队，
       只可能是链路/native 卡死 → 直接判死，交给上层自动重连。 */
    if (IS_IOS) {
      console.warn('[BLE] iOS 连续写失败 → 判定链路失同步，重建连接');
      await this.hardResetLink(this._connectedDeviceId);
      return;
    }
    if (await this.probeAlive()) {
      this._consecutiveWriteFailures = 0;   // 链路还活着：只清计数，不重连
      return;
    }
    /* probeAlive 内部失败时已 hardResetLink：清状态 + 通知上层重连 */
  }

  /** 死链清理：断开 Android 侧 GATT 残留、清内部状态，并通知上层（触发自动重连） */
  private async hardResetLink(id: string): Promise<void> {
    this._disconnecting = true;
    /* ★ 2026-11-16：死链 → 队列 / 回读 / 提交等待全部作废，重连后从干净状态开始 */
    this._resetWriteChain();
    this._finishRead();
    this._commitWaiters.clear();
    try {
      const { BleClient } = await importBlePlugin();
      if (BleClient) await withTimeout(BleClient.disconnect(id), 900, 'reset link').catch(() => {});
    } catch { /* ignore */ }
    this._connectedDeviceId = null;
    this._connectedDeviceName = "";
    resetSwitchShadow();
    this._disconnecting = false;
    this._onDisconnectHandler?.(id);
  }

  async writeRegister(regAddr: number, regValue: number, command: number = CMD_WRITE, noResponse: boolean = false): Promise<boolean> {
    if (!this._connectedDeviceId) return false;
    if (this._demoMode) {
      /* 演示模式：写入落到内存表，供回读验证；不再走 GATT */
      this._demoRegs.set(regAddr, regValue);
      return true;
    }
    // ★ 2026-10-07: 全工程唯一的写节奏来源 —— 排队 + 最小间隔(0xEB 5ms, 其余 20ms)。
    //   整模块一次压入(如箱体 35 段)时, 这里会自然摊成 35×20ms, 不再冲垮 GATT 队列。
    const release = await this._acquireWriteSlot(command);
    try {
      if (!this._connectedDeviceId) return false;   // 排队期间可能已掉线
      const frame = buildFrame(command, regAddr, regValue);
      const hex = frame.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
      const path = (this._useWebBluetooth && this._writeChar) ? 'WebBLE' : 'Capacitor';
      console.log(`[BLE WRITE] reg=${regAddr} val=${regValue} cmd=0x${command.toString(16).toUpperCase()} path=${path} frame=${hex}`);
      if (this._useWebBluetooth && this._writeChar) {
        await withTimeout(this._writeChar.writeValue(new Uint8Array(frame)), WRITE_CALL_TIMEOUT_MS, 'webble write');
      } else {
        const { BleClient, numbersToDataView } = await importBlePlugin();
        if (!BleClient) { console.warn('[BLE] BleClient not available'); return false; }
        const dv = numbersToDataView(frame);
        /* ★★ v4.21：iOS 走 writeWithoutResponse 绕开 didWriteValueFor 不回调的缺陷；
           显式 noResponse（整表/批处理调用方）也尊重；Android 保持 withResponse。
           writeOnGatt 内部已含超时与 BleClient 获取。 */
        if (noResponse) {
          await withTimeout(
            BleClient.writeWithoutResponse(this._connectedDeviceId, BLE_SERVICE, BLE_WRITE_CHAR, dv),
            WRITE_CALL_TIMEOUT_MS, 'ble write');
        } else {
          await this.writeOnGatt(dv, 'ble write');
        }
      }
      this._consecutiveWriteFailures = 0;
      /* ★ 2026-10-20：开关地址写成功后记账（影子表）—— 状态检测不依赖固件读回 */
      noteSwitchWrite(regAddr, regValue);
      return true;
    } catch (e) {
      const emsg = String((e as any)?.message || e || '');
      this._consecutiveWriteFailures++;
      /* ★ v4.27：失败日志带上"队列是否已关 / 连续失败次数"，测试员一看就知道
         是"链路断"还是"队列堵"（队列已关的情况下不可能再是排队问题）。 */
      console.error(
        `BLE write failed: ${emsg} | platform=${Capacitor.getPlatform()}` +
        ` queueDisabled=${_queueDisabled} consecutive=${this._consecutiveWriteFailures}`);
      /* ★★ v4.24：识别「JS 标志已连、原生实际断开」的失同步错误。
         原生 getDevice 在每次写前检查 peripheral.state，设备实际断开时 reject
         "Not connected to device." / "Device not found"；这类错误不是 GATT 忙，
         重试无用，必须立刻清标志 + 触发上层自动重连，否则永久"连着写不进"。 */
      const linkLost = /not connected|device not found|not discovered|characteristic not found/i.test(emsg);
      if (linkLost && this._connectedDeviceId) {
        console.warn('[BLE] 写入时发现链路失同步，触发重连:', emsg);
        await this.hardResetLink(this._connectedDeviceId);
        return false;
      }
      // 其余（超时/拥塞）：连续 3 次才探活，避免单次抖动误判
      if (this._consecutiveWriteFailures >= WRITE_FAIL_DISCONNECT_THRESHOLD && this._connectedDeviceId) {
        console.warn(`[BLE] 连续 ${this._consecutiveWriteFailures} 次写失败 → 探测链路是否存活`);
        await this.confirmDeadLink();
      }
      return false;
    } finally {
      release();
    }
  }

  async writeModuleParam(moduleId: string, knobLabel: string, normalizedValue: number, subModelName?: string): Promise<boolean> {
    // ★ 2026-10-16 箱头专项：v3 参数表（data/_def/ampHeadDef.ts）是唯一权威。
    //   parameterMap 里那两张 amp-head 公式表是 v13 旧布局（GAIN→reg79 / VOLUME→reg81 /
    //   BASS→83 PEAK），继续走会把 GAIN 旋钮写成 DRIVE。命中不到 = 该型号没有这个
    //   旋钮 → 直接跳过，绝不回退旧表。
    if (moduleId === 'amp-head') {
      const ampDefs = ampLinkedDefsByName(subModelName ?? '', knobLabel);
      if (!ampDefs || ampDefs.length === 0) return false;
      let ampOk = true;
      for (const linked of ampDefs) {
        if (linked.regAddr === -1) continue;
        const val = typeof linked.compute === 'function'
          ? linked.compute(normalizedValue)
          : normalizedToRegValue(normalizedValue, linked);
        const ok = await this.writeRegister(linked.regAddr, val, CMD_WRITE);
        if (!ok) ampOk = false;
      }
      return ampOk;
    }

    // Try sub-model-specific formulas first, then legacy, then single-register fallback
    const linkedDefs = (subModelName ? getLinkedParamDefs(subModelName, knobLabel) : null)
      ?? getLegacyLinkedDefs(moduleId, knobLabel);
    if (linkedDefs && linkedDefs.length > 0) {
      let allOk = true;
      for (const linked of linkedDefs) {
        const val = typeof linked.compute === 'function'
          ? linked.compute(normalizedValue)
          : normalizedToRegValue(normalizedValue, linked);
        // regAddr=-1 means PGA I2C write (boost module)
        if (linked.regAddr === -1) {
          const ok = await this.writePGA(val);
          if (!ok) allOk = false;
        } else {
          const ok = await this.writeRegister(linked.regAddr, val, CMD_WRITE);
          if (!ok) allOk = false;
        }
      }
      return allOk;
    }

    const def = getParamDef(moduleId, knobLabel);
    if (!def) return false;
    let regValue: number;
    if (def.isPEQ) {
      const freqIndex = normalizedToRegValue(normalizedValue, def);
      const gainIndex = 120;
      regValue = buildPEQData(def.peqType ?? 0, freqIndex, gainIndex, def.fixedQ ?? 16, def.fixedS ?? 10);
    } else {
      regValue = normalizedToRegValue(normalizedValue, def);
    }
    return this.writeRegister(def.regAddr, regValue, CMD_WRITE);
  }

  /** Write PGA gain via I2C (level 0-10, 0-30dB, 3dB step) */
  async writePGA(level: number): Promise<boolean> {
    if (!this._connectedDeviceId) return false;
    if (this._demoMode) { this._demoRegs.set(0x30, level); return true; }
    // ★ 2026-10-07: PGA 与寄存器共用同一条 BLE 写特征, 同样过闸门
    const release = await this._acquireWriteSlot(CMD_WRITE);
    try {
      if (!this._connectedDeviceId) return false;
      const val = pgaLevelToValue(level);
      const frame = buildI2CFrame(I2C_DEVICE, I2C_REG_PGA, val);
      const hex = frame.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
      console.log('[PGA I2C] level=' + level + 'dB=' + (level*3) + ' frame=' + hex);
      const { BleClient, numbersToDataView } = await importBlePlugin();
      if (!BleClient) { console.warn('[PGA] BleClient not available'); return false; }
      /* ★★ v3.80（P1-7）：插件 promise 必须加超时。原来这里是裸 await ——
         永不 settle 时本次 writePGA 永远 pending，调用方（首页 sendAll 里的
         `await onParam('PGA', lv)`）也就永远不返回，try/finally 的 endBusy
         执行不到 = LOADING 遮罩永久停留。排队锁虽然 3s 会重建，
         但救不了「已挂住的这一个 promise」。 */
      await this.writeOnGatt(numbersToDataView(frame), 'pga write');
      this._consecutiveWriteFailures = 0;
      return true;
    } catch (e) {
      console.error('[PGA] write failed:', e);
      this._consecutiveWriteFailures++;
      return false;
    } finally {
      release();
    }
  }

  /**
   * ★ 2026-11-05（用户拍板）：产品型号 → 经典蓝牙（A2DP）EQ 配置文件切换。
   *   帧：ED 00 31 <index>（dev=0x31 是固件约定的"EQ 文件"通道，与 PGA 0x30 并列）
   *     index 0 = B&F GO 音箱（eq_cfg_hw.bin，固件默认）
   *     index 1 = B&F MIX 耳机（eq_cfg_hw1.bin）
   *   只影响手机放歌的音乐 EQ，不影响吉他 DSP 效果链。
   */
  async writeEqProfile(index: number): Promise<boolean> {
    if (!this._connectedDeviceId) return false;
    if (this._demoMode) { this._demoRegs.set(0x31, index); return true; }
    const release = await this._acquireWriteSlot(CMD_WRITE);
    try {
      if (!this._connectedDeviceId) return false;
      const idx = Math.max(0, Math.min(2, Math.round(index)));
      const frame = buildI2CFrame(0x31, idx, 0);
      const hex = frame.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      console.log(`[EQ FILE] index=${idx} frame=${hex}`);
      const { BleClient, numbersToDataView } = await importBlePlugin();
      if (!BleClient) return false;
      await this.writeOnGatt(numbersToDataView(frame), 'eq file write');
      this._consecutiveWriteFailures = 0;
      return true;
    } catch (e) {
      console.error('[EQ FILE] write failed:', e);
      this._consecutiveWriteFailures++;
      return false;
    } finally {
      release();
    }
  }

  async writeModuleEnabled(moduleId: string, enabled: boolean): Promise<boolean> {
    const addr = MODULE_BYPASS_ADDR[moduleId];
    if (addr === undefined) { console.warn('[BYPASS] no addr for ' + moduleId); return false; }
    console.log('[BYPASS] module=' + moduleId + ' enable=' + enabled + ' addr=' + addr);
    return this.writeRegister(addr, enabled ? 0 : 1, CMD_WRITE);
  }

  async readRegister(regAddr: number): Promise<number | null> {
    if (!this._connectedDeviceId) return null;
    if (this._demoMode) {
      /* 演示模式：返回刚才写入值，未写过则返回 0（模拟“读回一致”） */
      return this._demoRegs.has(regAddr) ? (this._demoRegs.get(regAddr) as number) : 0;
    }
    try {
      if (this._useWebBluetooth && this._readChar) {
        const value = await withTimeout(this._readChar.readValue(), WRITE_CALL_TIMEOUT_MS, 'webble read');
        const data = Array.from(new Uint8Array(value.buffer));
        const parsed = parseFrame(data);
        return parsed ? parsed.regValue : null;
      } else {
        const { BleClient, dataViewToNumbers } = await importBlePlugin();
        if (!BleClient) return null;
        /* ★★ v3.80（P1-7）：同 writePGA，读也要有超时（原为裸 await）
           ★★★ v4.27：原生 timeout(1.2s) < JS(2s) —— 读超时也必须由原生先给结论，
           否则 JS 放弃后原生仍占链路（默认 5s），期间所有写都"写入失败"。 */
        const dv = await withTimeout<DataView>(
          BleClient.read(this._connectedDeviceId, BLE_SERVICE, BLE_READ_CHAR, { timeout: NATIVE_TIMEOUT_MS }) as Promise<DataView>,
          CALL_TIMEOUT_MS, 'ble read');
        const parsed = parseFrame(dataViewToNumbers(dv));
        return parsed ? parsed.regValue : null;
      }
    } catch (e) {
      console.error("BLE read failed:", e);
      /* ★ 2026-11-11：单次读失败不再直接断连（回读抖动会把整条链路拆掉） */
      await this.confirmDeadLink();
      return null;
    }
  }

  // D7 (2026-09-22) 死代码清理: loadPreset / savePreset 已删除 (全工程无调用者)

  /**
   * Batch-write registers with configurable interval.
   * ★ 2026-10-17：默认节奏改为 EA_WRITE_MS（5ms 提速版），不再硬编码 20。
   */
  async writeRegistersBatch(registers: Array<{ regAddr: number; value: number }>, intervalMs: number = EA_WRITE_MS): Promise<{ written: number; total: number }> {
    if (!this._connectedDeviceId) return { written: 0, total: registers.length };
    let written = 0;
    for (const r of registers) {
      const ok = await this.writeRegister(r.regAddr, r.value, CMD_WRITE);
      if (ok) written++;
      if (intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs));
    }
    return { written, total: registers.length };
  }

  /**
   * ★★ 2026-10-17：EA 多帧打包发送（对应《App 侧 EA 打包规则_BFRT10.187》）
   *
   * 规则落地：
   *   1. 一包里只放 EA 帧（buildFrame(CMD_WRITE, …) 生成的 12 字节帧）；
   *   2. 字节数 = n×12，首尾相接，无包头/无长度/无序号/不补位；
   *   3. 帧顺序 = 传入顺序（调用方已用 orderBypassSplit 排好执行顺序）；
   *   4. 每帧的 check 由 buildFrame 按单帧算法独立算出（不是整包校验）；
   *   5. n ≤ min((MTU-3)/12, 20)；MTU 由 getMtu 实测（插件 connect 时已自动 requestMtu(512)）；
   *   6. 最后一包按剩余帧数发，不凑满。
   *
   * 节拍：用 writeWithoutResponse，**等一次写回调再发下一包**（插件的 promise 在
   * `onCharacteristicWrite` 里才 resolve，正好当节拍器）。不再逐帧 5ms、也不等 notify。
   *
   * 失败处理：写失败（含 Android「上一个操作未完成」返回 busy）→ 退回本包重试，
   * 绝不跳过（规则 6.5）。重试仍失败则按连续失败计数，交给既有掉线判定。
   */
  async writeEaBatch(
    list: Array<{ regAddr: number; value: number }>,
    onProgress?: (done: number, total: number, packets: number) => void,
  ): Promise<{ ok: boolean; sent: number; packets: number; perPacket: number; mtu: number }> {
    const per0 = this.framesPerPacket;
    if (!list.length) return { ok: true, sent: 0, packets: 0, perPacket: per0, mtu: this._mtu };
    if (!this._connectedDeviceId) return { ok: false, sent: 0, packets: 0, perPacket: per0, mtu: this._mtu };
    if (this._demoMode) {
      /* 演示模式：整批写入内存表，并按 20 帧/包推进进度条 */
      for (let i = 0; i < list.length; i++) {
        this._demoRegs.set(list[i].regAddr, list[i].value);
        if (i % 20 === 19) onProgress?.(i + 1, list.length, Math.ceil((i + 1) / 20));
      }
      const packets = Math.ceil(list.length / 20);
      onProgress?.(list.length, list.length, packets);
      return { ok: true, sent: list.length, packets, perPacket: per0, mtu: 512 };
    }
    /* WebBLE 路径没有 getMtu/无响应写的统一语义 —— 直接报不支持，让调用方回退逐帧 */
    if (this._useWebBluetooth) return { ok: false, sent: 0, packets: 0, perPacket: per0, mtu: this._mtu };

    await this._ensureMtu();
    const per = this.framesPerPacket;

    const { BleClient, numbersToDataView } = await importBlePlugin();
    if (!BleClient) return { ok: false, sent: 0, packets: 0, perPacket: per, mtu: this._mtu };

    const total = list.length;
    let idx = 0;
    let packets = 0;

    while (idx < total) {
      const n = Math.min(per, total - idx);
      const buf: number[] = [];
      for (let k = 0; k < n; k++) {
        const it = list[idx + k];
        const f = buildFrame(CMD_WRITE, it.regAddr, it.value);   // 12 字节，首尾相接
        for (let b = 0; b < 12; b++) buf.push(f[b]);
      }

      /* 仍走全局闸门：保证与其它写 FIFO 排队；包间那 5ms 相对回调延迟可忽略 */
      const release = await this._acquireWriteSlot(CMD_WRITE);
      let ok = false;
      try {
        if (!this._connectedDeviceId) return { ok: false, sent: idx, packets, perPacket: per, mtu: this._mtu };
        for (let attempt = 0; attempt < EA_PKT_RETRY && !ok; attempt++) {
          try {
            /* ★★ v3.75（H5）：单包写也要超时（见文件头的 WRITE_CALL_TIMEOUT_MS 说明） */
            await withTimeout(
              BleClient.writeWithoutResponse(
                this._connectedDeviceId, BLE_SERVICE, BLE_WRITE_CHAR, numbersToDataView(buf)),
              WRITE_CALL_TIMEOUT_MS, 'ea packet');
            ok = true;
          } catch (e) {
            /* 这包根本没发出去 → 退回去重试（不能丢） */
            if (attempt < EA_PKT_RETRY - 1) await new Promise((r) => setTimeout(r, EA_PKT_RETRY_DELAY_MS));
          }
        }
      } finally {
        release();
      }

      if (!ok) {
        this._consecutiveWriteFailures++;
        if (this._consecutiveWriteFailures >= WRITE_FAIL_DISCONNECT_THRESHOLD && this._connectedDeviceId) {
          await this.confirmDeadLink();
        }
        console.warn(`[EA PACK] 第 ${packets + 1} 包发送失败，已发 ${idx}/${total} 帧`);
        return { ok: false, sent: idx, packets, perPacket: per, mtu: this._mtu };
      }

      idx += n;
      packets++;
      this._consecutiveWriteFailures = 0;
      /* ★ 2026-10-20：整包成功 → 把这 20 帧里的开关地址也记进影子表 */
      for (let k = 0; k < n; k++) {
        const it = list[idx - n + k];
        if (it) noteSwitchWrite(it.regAddr, it.value);
      }
      onProgress?.(idx, total, packets);
    }

    console.info(`[EA PACK] 完成：${idx} 帧 / ${packets} 包（每包 ${per} 帧，MTU ${this._mtu}）`);
    return { ok: true, sent: idx, packets, perPacket: per, mtu: this._mtu };
  }

  /**
   * ★★★ 2026-11-19（用户报障「安卓恢复出厂 30 秒+，iOS 只要 8-9 秒」）：
   *   EB 批量写 —— 固件已确认支持「一包多帧 EB」。
   *
   *   为什么需要它（实测数据反推）：
   *     恢复出厂 = 16 格 × 约 117 条 ≈ 1872 帧，原来是一帧一次 GATT 写。
   *     · iOS：CoreBluetooth 的 writeWithoutResponse **发出即返回**，每帧只花
   *            EB_WRITE_MS = 5ms → 1872 × 5ms ≈ 9.4 秒（与实测 8-9 秒吻合）。
   *     · Android：插件的 write() 必须等 onCharacteristicWrite（一个连接间隔
   *            约 12~15ms）→ 每帧 ≈ 17~20ms → 1872 帧 ≈ 32~37 秒（与实测 30 秒+ 吻合）。
   *
   *     差距的本质不是"写得慢"，而是「1872 次 GATT 往返 vs 125 次」。
   *
   *   本方法把 N 帧拼成一包（N = framesPerPacket，MTU 185 时 = 15 帧），
   *   Android 的往返次数降到 1/15，预计 30 秒 → 11 秒左右；iOS 基本不变（本来不等回调）。
   *
   *   ⚠️ 包间仍等 n × EB_WRITE_MS：GATT 回调只代表"数据已交给协议栈"，
   *      不代表固件已逐帧处理完，所以节奏不能省，否则固件的表项可能被冲掉。
   *
   *   失败处理与 writeEaBatch 一致：整包重试 3 次，仍失败则中止（绝不跳过）。
   *   调用方的"全表回读校验"是最后一道防线 —— 真丢帧会被比对出来并报错。
   */
  async writeToneEBBatch(
    ch: number,
    typ: number,
    list: Array<{ addr: number; value: number }>,
    onProgress?: (done: number, total: number, packets: number) => void,
  ): Promise<{ ok: boolean; sent: number; packets: number; perPacket: number; mtu: number }> {
    const per0 = this.framesPerPacket;
    const empty = { ok: true, sent: 0, packets: 0, perPacket: per0, mtu: this._mtu };
    if (!list.length) return empty;
    if (!this._connectedDeviceId) return { ...empty, ok: false };
    if (this._demoMode) {
      for (let i = 0; i < list.length; i++) this._demoRegs.set(list[i].addr, list[i].value);
      onProgress?.(list.length, list.length, 0);
      return { ok: true, sent: list.length, packets: 0, perPacket: per0, mtu: 512 };
    }
    /* WebBLE 路径没有统一的 getMtu / 无响应写语义 → 报不支持，由调用方回退逐帧 */
    if (this._useWebBluetooth) return { ...empty, ok: false };
    /* ★ iOS 故意不走批量：CoreBluetooth 的 writeWithoutResponse 发出即返回，
       逐帧本来就只有 5ms/帧（1872 帧 ≈ 9 秒），批量对它几乎没有收益，
       没必要把一条已经验证稳定的路径换掉。只优化 Android（每帧等 12~15ms 回调）。
       返回 ok:false → 调用方自动回退逐帧，行为与 v4.35 完全一致。 */
    if (Capacitor.getPlatform() !== 'android') return { ...empty, ok: false };

    await this._ensureMtu();
    const per = this.framesPerPacket;

    const { BleClient, numbersToDataView } = await importBlePlugin();
    if (!BleClient) return { ...empty, ok: false, perPacket: per };

    const sub = ((typ & 3) << 5) | (ch & 0x1f);
    const total = list.length;
    let idx = 0;
    let packets = 0;

    while (idx < total) {
      const n = Math.min(per, total - idx);
      const buf: number[] = [];
      for (let k = 0; k < n; k++) {
        const f = buildFrameSub(0xEB, sub, list[idx + k].addr, list[idx + k].value);
        for (let b = 0; b < 12; b++) buf.push(f[b]);
      }

      /* 仍走全局闸门，保证与其它写 FIFO 排队 */
      const release = await this._acquireWriteSlot(0xEB);
      let ok = false;
      try {
        if (!this._connectedDeviceId) {
          return { ok: false, sent: idx, packets, perPacket: per, mtu: this._mtu };
        }
        for (let attempt = 0; attempt < EA_PKT_RETRY && !ok; attempt++) {
          try {
            await withTimeout(
              BleClient.writeWithoutResponse(
                this._connectedDeviceId, BLE_SERVICE, BLE_WRITE_CHAR, numbersToDataView(buf)),
              WRITE_CALL_TIMEOUT_MS, 'eb packet');
            ok = true;
          } catch {
            /* 这包没发出去 → 退回重试（不能丢） */
            if (attempt < EA_PKT_RETRY - 1) {
              await new Promise((r) => setTimeout(r, EA_PKT_RETRY_DELAY_MS));
            }
          }
        }
      } finally {
        release();
      }

      if (!ok) {
        this._consecutiveWriteFailures++;
        if (this._consecutiveWriteFailures >= WRITE_FAIL_DISCONNECT_THRESHOLD && this._connectedDeviceId) {
          await this.confirmDeadLink();
        }
        console.warn(`[EB PACK] 第 ${packets + 1} 包发送失败，已发 ${idx}/${total} 帧`);
        return { ok: false, sent: idx, packets, perPacket: per, mtu: this._mtu };
      }

      idx += n;
      packets++;
      this._consecutiveWriteFailures = 0;
      /* 包间节拍 = 原来逐帧的 n × 5ms，保证固件逐帧处理的节奏不被撑爆 */
      await new Promise((r) => setTimeout(r, n * EB_WRITE_GAP_MS));
      onProgress?.(idx, total, packets);
    }

    console.info(`[EB PACK] 完成：${idx} 帧 / ${packets} 包（每包 ${per} 帧，MTU ${this._mtu}）`);
    return { ok: true, sent: idx, packets, perPacket: per, mtu: this._mtu };
  }

  /** 每包可装帧数：min((MTU-3)/12, 20)，至少 1 */
  get framesPerPacket(): number {
    return Math.max(1, Math.min(EA_MAX_FRAMES_PER_PKT, Math.floor((this._mtu - 3) / 12)));
  }

  /** 当前 MTU（未读到前按 23 保守估计） */
  get mtu(): number { return this._mtu; }

  /** 读一次协商后的 MTU（插件在 connect 时已 requestMtu(512)，这里只取实际值） */
  private async _ensureMtu(): Promise<void> {
    if (this._mtuKnown || !this._connectedDeviceId || this._useWebBluetooth) return;
    try {
      const { BleClient } = await importBlePlugin();
      if (BleClient && this._connectedDeviceId) {
        const m = await BleClient.getMtu(this._connectedDeviceId);
        if (Number.isFinite(m) && m >= 23) { this._mtu = m; this._mtuKnown = true; }
      }
    } catch { /* 保持保守值 */ }
  }

  async startNotifications(onData: (data: number[]) => void): Promise<void> {
    this._onNotify = onData;
    if (this._demoMode) return;
    if (!this._connectedDeviceId) return;
    await this._subscribeNotifications();
  }

  /**
   * ★ 2026-11-16：真正下发 CCCD 订阅（幂等，失败不抛）。
   *   connect() 与 startNotifications() 共用；重连后必须重新订阅，
   *   否则整表回读 / 频道推送 / 提交回执全部收不到（表现为"连上但卡住"）。
   *
   * ★★★ v4.27：
   *   ① 支持显式传 deviceId —— connect() 现在**先订阅再置 connected**，
   *      此时 `_connectedDeviceId` 还是 null。
   *   ② **必须给原生传 timeout**：iOS 的 setNotifications 默认超时 5s，
   *      而这里 JS 只等 1.5s → JS 放弃后原生仍占着链路 3.5s，期间所有写都超时。
   *      现在让原生 1.2s 先给结论，JS 2s 兜底，谁也不会先"弃单"再占位。
   */
  private async _subscribeNotifications(deviceId?: string): Promise<void> {
    const id = deviceId ?? this._connectedDeviceId;
    if (this._demoMode || !id) return;
    if (this._useWebBluetooth) return;   // WebBLE 在 connect 时已 startNotifications
    const opts = { timeout: NATIVE_TIMEOUT_MS };
    try {
      const { BleClient, dataViewToNumbers } = await importBlePlugin();
      if (!BleClient) return;
      await withTimeout(
        BleClient.startNotifications(
          id, BLE_SERVICE, BLE_READ_CHAR,
          (value: DataView) => this._dispatchNotify(dataViewToNumbers(value)),
          opts,
        ),
        CALL_TIMEOUT_MS, 'subscribe notify',
      );
    } catch (e) {
      /* 服务发现还没完全就绪时会抛 "Characteristic not found" —— 隔 180ms 再试一次 */
      try {
        const { BleClient, dataViewToNumbers } = await importBlePlugin();
        await new Promise((r) => setTimeout(r, 180));
        await withTimeout(
          BleClient?.startNotifications(
            id, BLE_SERVICE, BLE_READ_CHAR,
            (value: DataView) => this._dispatchNotify(dataViewToNumbers(value)),
            opts,
          ),
          CALL_TIMEOUT_MS, 'subscribe notify retry',
        );
      } catch (e2) {
        console.warn('[BLE] startNotifications failed:', e, e2);
      }
    }
  }

  /**
   * 通知分发: 2 字节裸 EE 短帧 → 频道回调; 其余 (12 字节 EC 帧等) → 常规回调。
   * 说明: 硬件 EE FF 响应为裸 2 字节, 不能被 12 字节 parseFrame 处理, 故在此分流。
   */
  private _dispatchNotify(data: number[]): void {
    /* ★★ v3.59（F10，用户 2026-10-24 拍板 C5）：固件踩钉换档会主动推 [0xEE, 0x01–0x10]，
       与 EE FF 查询响应格式完全相同。App 侧两件事分工：
         · _onChannelPush  = 常驻监听（每次推送都通知，用于同步档位高亮 + 刷 UI）
         · _onChannelFrame = queryChannel 的一次性等待回调（拿到就 resolve）
       两者互不影响；上层按「ch === activeSlot 直接忽略」做幂等。 */
    /* ★S2c：3 字节事件帧 {0xEF, evt, ch}
     *   evt: 01 开始 / 02 完成 / 03 保存成功 / 04 保存失败 */
    /* ★ 2026-11-03：EC 回读帧（12B）—— addr + val，仅用于整表校验，不进业务回调 */
    if (data.length >= 12 && data[0] === 0xEC) {
      const addr = ((data[2] | (data[3] << 8)) & 0xffff);
      const val = ((data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24)) >>> 0);
      if (this._readMap) {
        this._readMap.set(addr, val);
        /* 收满 117 条就立刻收尾 —— 不必等 `EF 06` 那一帧（它可能被 TX 缓冲吞掉，
         * 那会白等满 3s 超时，一次整组上传就多花 12 秒）。 */
        if (this._readMap.size >= 117) this._finishRead();
      }
      return;
    }
    if (data.length === 3 && data[0] === 0xEF) {
      const evt = data[1];
      const ch = data[2];
      /* ★ 2026-11-03：0x06 = 整表回读结束（固件在 report_poll 收尾时发） */
      if (evt === 0x06) {
        this._finishRead();
        return;
      }
      const w = this._commitWaiters.get(ch);
      if (w && (evt === 0x03 || evt === 0x04)) {
        this._commitWaiters.delete(ch);
        w(evt === 0x03);
      }
      this._onDeviceEvent?.(evt, ch);
      return;
    }
    if (data.length === 2 && data[0] === CMD_CHANNEL) {
      const ch = data[1];
      if (ch >= CHANNEL_MIN && ch <= CHANNEL_MAX) {
        this._onChannelPush?.(ch);
        this._onChannelFrame?.(data);
        return;
      }
    }
    // 单字节频道号 (兼容硬件只回 1 字节)
    if (data.length === 1 && data[0] >= CHANNEL_MIN && data[0] <= CHANNEL_MAX) {
      this._onChannelPush?.(data[0]);
      this._onChannelFrame?.(data);
      return;
    }
    if (this._onNotify) this._onNotify(data);
  }

  /**
   * ★ v3.59（F10）：注册/注销常驻频道推送监听。
   * 传入 null 即注销（断线时调用，避免悬空回调打到已卸载的组件）。
   */
  onChannelPush(cb: ((ch: number) => void) | null): void {
    this._onChannelPush = cb;
  }

  async stopNotifications(): Promise<void> {
    this._onNotify = null;
    if (!this._connectedDeviceId) return;
    if (this._demoMode) return;        // 演示模式没有真实订阅
    if (!this._useWebBluetooth) {
      try {
        const { BleClient } = await importBlePlugin();
        await BleClient?.stopNotifications(this._connectedDeviceId, BLE_SERVICE, BLE_READ_CHAR);
      } catch { /* ignore */ }
    }
  }

  // ─── 频道命令 (裸 2 字节短帧, 无校验) ─────────────────────────
  // 说明: EE n 让 APP 瞬间跳转频道(硬件控制端只能顺序切换, 跳转必须由 APP 发起);
  //       EE FF 查询硬件当前频道, 用于连接后让硬件频道灯与软件预设库同步。
  // 帧格式: [0xEE, <ch|0xFF>]  —— 仅 2 字节, 不带 12 字节帧头/校验。

  /** 发送裸 2 字节短帧 (EE 命令专用) */
  private async writeRawBytes(bytes: number[]): Promise<boolean> {
    if (!this._connectedDeviceId) return false;
    if (this._demoMode) {
      /* 演示模式：EE <ch> 直接更新虚拟频道，EE FF 查询交给 queryChannel 的模拟分支 */
      if (bytes.length >= 2 && bytes[0] === CMD_CHANNEL && bytes[1] >= CHANNEL_MIN && bytes[1] <= CHANNEL_MAX) {
        this._demoChannel = bytes[1];
      }
      return true;
    }
    // ★ 2026-10-07: EE 短帧也走同一闸门, 避免与寄存器写抢同一特征
    const release = await this._acquireWriteSlot(CMD_CHANNEL);
    try {
      if (!this._connectedDeviceId) return false;
      const hex = bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      console.log(`[BLE RAW] ${hex}`);
      if (this._useWebBluetooth && this._writeChar) {
        await this._writeChar.writeValue(new Uint8Array(bytes));
      } else {
        const { numbersToDataView } = await importBlePlugin();
        await this.writeOnGatt(numbersToDataView(bytes), 'ble raw');
      }
      this._consecutiveWriteFailures = 0;
      return true;
    } catch (e) {
      console.error('BLE raw write failed:', e);
      this._consecutiveWriteFailures++;
      return false;
    } finally {
      release();
    }
  }

  /**
   * 跳转硬件频道 (EE <ch>, 裸 2 字节)
   * @param channel 频道 1~16
   */
  async jumpChannel(channel: number): Promise<boolean> {
    const ch = Math.max(CHANNEL_MIN, Math.min(CHANNEL_MAX, Math.round(channel)));
    const ok = await this.writeRawBytes([CMD_CHANNEL, ch]);
    /* ★ 2026-10-20（C3/C6）：EE 跳档会让固件把 live 状态重置回「本频道已上传的表」——
       那张表可能和 App 影子表不一致（用户在首页关过开关、或该频道是很久以前上传的）。
       所以跳档后立刻清影子：接下来一次 applySwitchState 必定把 9 条开关全量写齐，
       杜绝"UI 显示开、硬件其实关着"的错位（用户口径：切换后状态必须对应）。 */
    if (ok) resetSwitchShadow();
    return ok;
  }

  /**
   * 查询硬件当前频道 (EE FF), 等待硬件返回 EE <ch> (裸 2 字节, 无校验)
   * @param timeoutMs 等待超时 (默认 1500ms)
   * @returns 频道 1~16; 失败/超时返回 null
   */
  async queryChannel(timeoutMs: number = 1500): Promise<number | null> {
    if (!this._connectedDeviceId) return null;
    if (this._demoMode) {
      /* 演示模式：80ms 后回报当前虚拟频道 */
      return new Promise<number | null>((resolve) => setTimeout(() => resolve(this._demoChannel), 80));
    }

    return new Promise<number | null>((resolve) => {
      let settled = false;
      const finish = (v: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // 恢复/清空短帧回调, 不影响后续 12 字节通知
        this._onChannelFrame = null;
        resolve(v);
      };
      const timer = setTimeout(() => {
        console.warn('[BLE] queryChannel timeout');
        finish(null);
      }, timeoutMs);

      // 注册短帧响应回调 (由 _notifyRouter 分发)
      this._onChannelFrame = (data: number[]) => {
        // 期望: [0xEE, ch]
        if (data.length >= 2 && data[0] === CMD_CHANNEL) {
          const ch = data[1];
          if (ch >= CHANNEL_MIN && ch <= CHANNEL_MAX) {
            console.log(`[BLE] current channel = ${ch}`);
            finish(ch);
          }
        }
        // 兼容: 若硬件只回单字节频道号
        else if (data.length === 1 && data[0] >= CHANNEL_MIN && data[0] <= CHANNEL_MAX) {
          console.log(`[BLE] current channel (1-byte) = ${data[0]}`);
          finish(data[0]);
        }
      };

      // 发送 EE FF
      this.writeRawBytes([CMD_CHANNEL, CHANNEL_QUERY]).catch(() => finish(null));
    });
  }

  /* ══════ S2c：16 频道三表协议 ══════
   *   EB <sub> addr val  写一条（只改设备 RAM，不写 DSP、不写 flash）
   *   E8 <sub>           清表（全量=回出厂默认）
   *   E9 <ch>            提交：落盘 + 重算快切 + 回 EF 03/04
   *   sub = (typ << 5) | ch，typ: 0 全量 / 1 前切 / 2 后切，ch: 1~16（0=当前） */
  onDeviceEvent(cb: ((evt: number, ch: number) => void) | null): void {
    this._onDeviceEvent = cb;
  }

  private async _writeToneFrame(cmd: number, sub: number, addr: number, val: number): Promise<boolean> {
    if (!this._connectedDeviceId) return false;
    if (this._demoMode) {
      /* 演示模式：频道三表写入同样落到内存表（E8 清表忽略） */
      if (cmd !== 0xE8) this._demoRegs.set(addr, val);
      return true;
    }
    const release = await this._acquireWriteSlot(0xEB);
    try {
      if (!this._connectedDeviceId) return false;
      const frame = buildFrameSub(cmd, sub, addr, val);
      if (this._useWebBluetooth && this._writeChar) {
        await withTimeout(this._writeChar.writeValue(new Uint8Array(frame)), WRITE_CALL_TIMEOUT_MS, 'webble tone');
      } else {
        const { numbersToDataView } = await importBlePlugin();
        await this.writeOnGatt(numbersToDataView(frame), 'ble tone');
      }
      this._consecutiveWriteFailures = 0;
      return true;
    } catch (e) {
      console.warn('[BLE] tone frame failed:', e);
      this._consecutiveWriteFailures++;
      return false;
    } finally {
      release();
    }
  }

  /** 结束当前回读（正常收尾 / 超时 / 发起新一轮前清理旧状态） */
  private _finishRead(): void {
    const cb = this._readDone;
    const map = this._readMap;
    this._readDone = null;
    this._readMap = null;
    if (this._readTimer) { clearTimeout(this._readTimer); this._readTimer = null; }
    if (cb) cb(map ?? new Map<number, number>());
  }

  /**
   * ★★★ 2026-11-03（上传校验闭环）：把某频道的**全量表**从设备读回来。
   *
   *   协议：App 发 `EF EE ED <ch>`（12 字节帧，addr 字段填 0xED | ch<<8），
   *        设备用 `EC 00 | addr(2B LE) | val(4B LE) | chk(4B)` 逐条回传 117 条，
   *        收尾再发 3 字节 `EF 06 <ch>`。
   *
   *   返回 null = 链路/超时导致一条都没读到（无法校验，不等于失败）。
   *   返回 Map 可能不全（中途丢帧）—— 调用方按"缺失"处理，这本身就是问题证据。
   */
  async readToneTable(ch: number, timeoutMs = 3000): Promise<Map<number, number> | null> {
    if (!this._connectedDeviceId) return null;
    if (this._demoMode) {
      /* 演示模式：直接回传内存表；空表时给一条占位，避免上层误判为“链路失败” */
      return this._demoRegs.size ? new Map(this._demoRegs) : new Map<number, number>([[0, 0]]);
    }
    this._finishRead();                         /* 清掉上一轮未完成的读 */
    const map = new Map<number, number>();
    this._readMap = map;
    const p = new Promise<Map<number, number>>((resolve) => {
      this._readDone = resolve;
      this._readTimer = setTimeout(() => { this._finishRead(); }, timeoutMs);
    });
    const sent = await this._writeToneFrame(0xEF, 0xEE, 0x00ED | ((ch & 0x1f) << 8), 0);
    if (!sent) { this._finishRead(); return null; }
    const got = await p;
    return got.size ? got : null;
  }

  /* ★★★ 2026-11-04：0xE6（EA 接管）已删除 —— 上传只写固件表，
     切档由固件按频道表 + 关键帧位图统一下发，App 不再直写 DSP。 */

  /** 写一条到频道表（typ: 0 全量 / 1 前切 / 2 后切） */
  writeToneEB(ch: number, typ: number, addr: number, val: number): Promise<boolean> {
    return this._writeToneFrame(0xEB, ((typ & 3) << 5) | (ch & 0x1f), addr, val);
  }

  /** 清空某张表（全量清空 = 回出厂默认） */
  clearToneTable(ch: number, typ: number): Promise<boolean> {
    return this._writeToneFrame(0xE8, ((typ & 3) << 5) | (ch & 0x1f), 0, 0);
  }

  /**
   * 单次等待提交结果：true/false = 设备给了明确结论；null = 超时（那一帧通知没到）
   *
   * ★★★ 2026-11-02：把"等通知"拆成可重试的一小步。
   *   设备回的是 `EF 03/04 ch` 这种一次性下行通知，BLE TX 缓冲忙时会被暂存，
   *   而 App 刚连发 117 条 EB，缓冲正好是忙的 ⇒ 通知经常到不了，
   *   于是"设备写成功了、App 报失败"。现在改成：先等 2 秒通知，没来就主动问。
   */
  private _awaitCommit(ch: number, ms: number): Promise<boolean | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._commitWaiters.delete(ch);
        resolve(null);
      }, ms);
      this._commitWaiters.set(ch, (ok: boolean) => {
        clearTimeout(timer);
        resolve(ok);
      });
    });
  }

  /**
   * 原样读一次 F2 特征值（不做 12 字节帧解析、失败不触发断线回调）。
   *
   * ★★★ 2026-11-02：上传回执的**兜底通道**。
   *   设备的通知是"推"：TX 缓冲忙时 `ble_op_att_send_data` 排队/被后续帧覆盖，
   *   App 只能等到超时 → 误报"写入失败"（而固件其实已经落盘）。
   *   固件侧已改成：发通知**之前**先把同一份字节写进 F2 的可读值，
   *   所以这里 GATT read 一定拿得到 `EF 03/04/05 ch`，与通知是否送达无关。
   */
  async readRaw(): Promise<number[] | null> {
    if (!this._connectedDeviceId) return null;
    if (this._demoMode) return null;   // 工程模式原始帧：演示模式没有真实回包
    try {
      if (this._useWebBluetooth && this._readChar) {
        const v = await withTimeout(this._readChar.readValue(), WRITE_CALL_TIMEOUT_MS, 'webble readraw');
        return Array.from(new Uint8Array(v.buffer));
      }
      const { BleClient, dataViewToNumbers } = await importBlePlugin();
      if (!BleClient) return null;
      const dv = await withTimeout<DataView>(
        BleClient.read(this._connectedDeviceId, BLE_SERVICE, BLE_READ_CHAR, { timeout: NATIVE_TIMEOUT_MS }) as Promise<DataView>,
        CALL_TIMEOUT_MS, 'ble readraw');
      return dataViewToNumbers(dv);
    } catch (e) {
      console.warn('[BLE] readRaw failed:', e);
      return null;
    }
  }

  /**
   * ★★★ 2026-11-03（用户拍板）：**提交只发不等**。
   *
   *   E9 是"落盘 + 重算快切表"的提交帧，设备收到就会执行；回执改由**设备闪灯**表达
   *   （单频道上传闪该灯位，整组上传闪该组 4 灯，失败红快闪），APK 不再等任何回包。
   *
   *   为什么彻底不等：回执通道（notify）在刚连发上百帧 EB 之后必然拥塞，历史上一路
   *   误报"写入失败"，而参数其实早就写好了 —— 用户已经明确要求去掉这条提示。
   *   代价：App 报的"已上传"是**乐观提示**，不代表设备一定落盘；
   *        真正的结果以设备灯为准（闪 5 秒 = 成功，红快闪 = 落盘失败）。
   *
   * @param grp 0 = 只闪该频道灯位；1 = 该组 4 个灯位一起闪（写进帧 data[2]）
   */
  sendCommit(ch: number, grp = 0): Promise<boolean> {
    return this._writeToneFrame(0xE9, ch & 0x1f, grp ? 1 : 0, 0);
  }

  // D7 (2026-09-22) 死代码清理: savePresetToHardware 已删除
  //   (唯一调用者 handleHardwareSave 无 UI 挂载, 同批删除)
  //   频道参数写硬件统一走 Index.tsx 的「上传」按键 / syncChannelToHardware (EB, 5ms)
}

/** 动态导入 Capacitor BLE 插件 (仅在 Capacitor 环境下可用) */
async function importBlePlugin(): Promise<{
  BleClient?: any;
  numbersToDataView?: (arr: number[]) => DataView;
  dataViewToNumbers?: (dv: DataView) => number[];
}> {
  try {
    return await import("@capacitor-community/bluetooth-le");
  } catch {
    console.warn("@capacitor-community/bluetooth-le not available, BLE writes disabled");
    return {};
  }
}

export const bleManager = new BLEManager();
/* ★ 2026-11-09：冷启动恢复演示模式（审核员反复冷启动 App 时设置不能丢） */
bleManager.restoreDemoMode();

/* ══════════════ ★★ v3.68（G）：插件预热 ══════════════
 * 首连慢的一大块是「冷启动成本」：`@capacitor-community/bluetooth-le` 是**动态 import**，
 * 第一次真正用到才加载 JS chunk + 初始化原生 bridge（几百 ms）。
 * 把它提前到 App 启动后空闲时做掉，用户点「连接」时这条路径已经是热的。
 * 幂等：并发调用共享同一个 Promise；失败静默（未授权/无插件不该影响启动）。
 */
let _warm: Promise<void> | null = null;
export function warmupBle(): Promise<void> {
  if (_warm) return _warm;
  _warm = (async () => {
    /* 演示模式不动真实蓝牙，也就没必要初始化原生插件（否则会白弹一次权限框） */
    if (bleManager.demoMode) return;
    try {
      /* ★ v4.27：统一走 ensureNativeReady（进程内只 initialize 一次 + iOS 关队列） */
      await ensureNativeReady();
    } catch { /* ignore */ }
  })();
  return _warm;
}

export default BLEManager;
