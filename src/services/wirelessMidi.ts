/**
 * 无线 MIDI 踏板中转（BLE MIDI Host）
 *
 * 背景：原版 Chocolate 这类踏板只能当 BLE 外设（Peripheral），自己不会主动连设备，
 *   所以没法直连音箱。本模块让 **手机当 BLE MIDI 主机**：
 *     踏板 --(BLE MIDI)--> 手机 App --(BFX1 的 EE 命令)--> 音箱
 *   固件侧完全不用改，链路仍是"音箱只连手机"的单链路。
 *
 * 协议（与固件 bt_comm.c 的 bfrt10_midi_rx 保持同一套语义，改这里要两边同步）：
 *   PC  0–15     → 绝对频道 1–16
 *   CC  0x10 n   → 组内第 n 格（0–3），组不变（4 钉直选）
 *   CC  0x12 v   → 组内步进：0=上一格 1=下一格（组内循环）
 *   CC  0x11 v   → 换组：0=上一组 1=下一组（4 组循环，落组首）
 *   Note 60–75   → 频道 1–16（兼容备用）
 *
 * 设计原则：**只读不写**音箱以外的东西；所有切档最终都走 bleManager.jumpChannel()，
 * 与预设库/App 切档完全同一条路径，因此不会引入第二条写协议。
 */

import { bleManager } from './bleService';

// ─── 标准 BLE MIDI UUID（Capacitor 插件统一用小写） ──────────────────
export const MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const MIDI_CHAR = '7772e5db-3868-4112-a1a9-f2669d106bf3';

/** 名字兜底：部分踏板广播里不带服务 UUID（或 Android 没解析出来） */
const MIDI_NAME_HINTS = ['CHOCOLATE', 'PEDAL', 'FOOT', 'MIDI'];

/**
 * 判断扫描到的是不是无线 MIDI 踏板。
 * ★ 必须先由调用方排除自家音箱（名字以 BF 开头）——我们的音箱广播里也带 MIDI UUID。
 */
export function isMidiDevice(dev: { name?: string; uuids?: string[] }): boolean {
  const uuids = (dev.uuids || []).map((u) => u.toLowerCase());
  if (uuids.includes(MIDI_SERVICE)) return true;
  const name = (dev.name || '').toUpperCase();
  return MIDI_NAME_HINTS.some((h) => name.includes(h));
}

export interface MidiMsg {
  type: 'pc' | 'cc' | 'note';
  /** MIDI 通道 1–16（本协议不区分通道，仅日志用） */
  ch: number;
  d0: number;
  d1: number;
}

/**
 * 解析一个 BLE MIDI 包。
 *
 * 格式：Byte0/1 = timestamp 头（bit7=1），其后是 1 条或多条 MIDI 消息；
 * 消息之间可能插 timestamp 字节（同样 bit7=1），按 running status 处理。
 * 与固件侧状态机保持一致：遇到 bit7=1 的字节当作 status（下一字节若是真 status
 * 会把它覆盖掉，因为此时 data 计数为 0，属于自愈行为）。
 */
export function parseMidiPacket(bytes: number[]): MidiMsg[] {
  const out: MidiMsg[] = [];
  if (bytes.length < 3) return out;

  let st = 0;
  let cnt = 0;
  let d0 = 0;
  let d1 = 0;

  for (let i = 2; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0xf0) { st = 0; cnt = 0; continue; }        // 系统消息：不支持
    if (b >= 0x80) { if (cnt) cnt = 0; st = b; continue; } // status / running status
    if (!st) continue;                                   // 无 status 的数据字节：丢弃

    if (cnt === 0) d0 = b; else d1 = b;
    cnt++;
    const need = ((st & 0xf0) === 0xc0 || (st & 0xf0) === 0xd0) ? 1 : 2;
    if (cnt < need) continue;

    switch (st & 0xf0) {
      case 0xc0:
        out.push({ type: 'pc', ch: (st & 0x0f) + 1, d0, d1: 0 });
        break;
      case 0xb0:
        out.push({ type: 'cc', ch: (st & 0x0f) + 1, d0, d1 });
        break;
      case 0x90:
        if (d1) out.push({ type: 'note', ch: (st & 0x0f) + 1, d0, d1 }); // velocity 0 = Note Off
        break;
      default:
        break;
    }
    cnt = 0;   // running status：st 保留
  }
  return out;
}

/** 动态导入 Capacitor BLE 插件（与 bleService 同一策略，Web 端自动降级） */
async function importBlePlugin(): Promise<{ BleClient?: any }> {
  try {
    return await import('@capacitor-community/bluetooth-le');
  } catch {
    console.warn('@capacitor-community/bluetooth-le not available, wireless MIDI disabled');
    return {};
  }
}

export interface MidiStatus {
  connected: boolean;
  deviceId: string | null;
  deviceName: string;
  /** 最近一次中转的频道（1–16），UI 展示用 */
  lastChannel: number | null;
}

/** CC 号（与固件 MIDI_CC_* 一致） */
const CC_SLOT_ABS = 0x10;
const CC_BANK = 0x11;
const CC_SLOT_STEP = 0x12;

class WirelessMidiManager {
  private _deviceId: string | null = null;
  private _deviceName = '';
  private _lastChannel: number | null = null;
  /** 当前频道缓存：CC 是相对命令，必须先知道"现在在第几档" */
  private _chCache: { ch: number; at: number } | null = null;
  private _onStatus: ((s: MidiStatus) => void) | null = null;

  get connected(): boolean { return this._deviceId !== null; }
  get deviceId(): string | null { return this._deviceId; }
  get deviceName(): string { return this._deviceName; }

  /** 订阅状态变化（面板用它刷新"已连接/未连接"） */
  onStatus(cb: ((s: MidiStatus) => void) | null): void {
    this._onStatus = cb;
  }

  private _emit(): void {
    this._onStatus?.({
      connected: this._deviceId !== null,
      deviceId: this._deviceId,
      deviceName: this._deviceName,
      lastChannel: this._lastChannel,
    });
  }

  /**
   * 连接踏板并订阅 MIDI 通知。
   * 失败时返回 false（并已清理半连接状态），调用方按普通连接失败处理。
   */
  async connect(deviceId: string, name?: string): Promise<boolean> {
    if (this._deviceId === deviceId) return true;
    if (this._deviceId) await this.disconnect().catch(() => {});

    const { BleClient } = await importBlePlugin();
    if (!BleClient) return false;
    try { await BleClient.initialize(); } catch { /* 已初始化 */ }

    try {
      await BleClient.connect(deviceId, () => {
        /* 远端断开：只清本地状态，不触发音箱侧任何动作 */
        if (this._deviceId === deviceId) {
          this._deviceId = null;
          this._deviceName = '';
          this._chCache = null;
          this._emit();
        }
      }, { timeout: 8000 });

      await BleClient.startNotifications(deviceId, MIDI_SERVICE, MIDI_CHAR, (dv: DataView) => {
        const raw = Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength));
        void this._handleMessages(parseMidiPacket(raw));
      });

      this._deviceId = deviceId;
      this._deviceName = name || deviceId;
      this._emit();
      return true;
    } catch (e) {
      console.warn('[MIDI] connect failed:', e);
      try { await BleClient.disconnect(deviceId); } catch { /* ignore */ }
      this._deviceId = null;
      this._deviceName = '';
      this._emit();
      return false;
    }
  }

  async disconnect(): Promise<void> {
    const id = this._deviceId;
    this._deviceId = null;
    this._deviceName = '';
    this._chCache = null;
    this._emit();
    if (!id) return;
    const { BleClient } = await importBlePlugin();
    if (!BleClient) return;
    try { await BleClient.stopNotifications(id, MIDI_SERVICE, MIDI_CHAR); } catch { /* ignore */ }
    try { await BleClient.disconnect(id); } catch { /* ignore */ }
  }

  /** 读当前频道：优先用 1s 内的缓存，过期就向音箱查一次（EE FF） */
  private async _getChannel(): Promise<number> {
    const now = Date.now();
    if (this._chCache && now - this._chCache.at < 1000) return this._chCache.ch;
    const q = await bleManager.queryChannel(800).catch(() => null);
    const ch = q ?? this._chCache?.ch ?? 1;
    this._chCache = { ch, at: now };
    return ch;
  }

  private async _jump(target: number): Promise<void> {
    const ch = Math.max(1, Math.min(16, Math.round(target)));
    if (!bleManager.connected) return;      // 音箱没连上：静默丢弃，不弹错
    const ok = await bleManager.jumpChannel(ch).catch(() => false);
    if (ok) {
      this._chCache = { ch, at: Date.now() };
      this._lastChannel = ch;
      this._emit();
    }
  }

  private async _handleMessages(msgs: MidiMsg[]): Promise<void> {
    for (const m of msgs) {
      if (m.type === 'pc') {
        await this._jump(m.d0 + 1);
        continue;
      }
      if (m.type === 'note') {
        if (m.d0 >= 60 && m.d0 < 76) await this._jump(m.d0 - 59);
        continue;
      }
      // CC：相对命令，先换算成绝对频道
      if (m.d0 === CC_SLOT_ABS && m.d1 < 4) {
        const cur = await this._getChannel();
        const g = Math.floor((cur - 1) / 4);
        await this._jump(g * 4 + m.d1 + 1);
      } else if (m.d0 === CC_SLOT_STEP) {
        const cur = await this._getChannel();
        const g = Math.floor((cur - 1) / 4);
        const s = (((cur - 1) % 4) + (m.d1 ? 1 : 3)) % 4;
        await this._jump(g * 4 + s + 1);
      } else if (m.d0 === CC_BANK) {
        const cur = await this._getChannel();
        const g = (Math.floor((cur - 1) / 4) + (m.d1 ? 1 : 3)) % 4;
        await this._jump(g * 4 + 1);
      }
    }
  }
}

export const wirelessMidi = new WirelessMidiManager();
export default WirelessMidiManager;
