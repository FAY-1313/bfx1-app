import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import { bleManager } from '../services/bleService';
import { registerStore } from '../services/registerStore';
import { useLatestHandlers } from './useLatestHandlers';

/** 与 Index 原 loadState 同口径：读 localStorage 的 `bfx_<key>`，坏值 / 缺省回落 fallback */
function loadState<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem('bfx_' + key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

export interface IoLevelsDeps {
  connectedDeviceId: string | null;
  regCacheRef: MutableRefObject<Record<number, number>>;
  /** 下面三个在 Index 里定义得比本 hook 晚 —— 传箭头函数进来，调用时才取（hook 内部做成引用稳定） */
  bumpDebugTick: () => void;
  addDebugLog: (reg: number, val: number) => void;
  showKnobText: (text: string) => void;
}

/**
 * ★ 2026-11-24：输入 / 输出音量与静音（reg 3 / 261 / 2 / 260）从 Index.tsx 抽出。
 * 状态初值、持久化键、四个处理函数的逻辑与原实现逐行一致。
 */
export function useIoLevels({ connectedDeviceId, regCacheRef, ...ext }: IoLevelsDeps) {
  const cb = useLatestHandlers(ext);

  /** ★ C6（2026-10-15）：静音开关状态 —— 写 reg260，1 = 静音 / 0 = 正常 */
  const [muted, setMuted] = useState(false);
  const [inputVol, setInputVol] = useState(() => loadState('inputVol', 1.0));
  const [outputVol, setOutputVol] = useState(() => loadState('outputVol', 1.0));
  const [inputMute, setInputMute] = useState(() => loadState('inputMute', false));
  const [outputMute, setOutputMute] = useState(() => loadState('outputMute', false));

  useEffect(() => { localStorage.setItem('bfx_inputVol', JSON.stringify(inputVol)); }, [inputVol]);
  useEffect(() => { localStorage.setItem('bfx_outputVol', JSON.stringify(outputVol)); }, [outputVol]);
  useEffect(() => { localStorage.setItem('bfx_inputMute', JSON.stringify(inputMute)); }, [inputMute]);
  useEffect(() => { localStorage.setItem('bfx_outputMute', JSON.stringify(outputMute)); }, [outputMute]);

  const handleInputVolChange = useCallback((norm: number) => {
    setInputVol(norm);
    const regVal = Math.round(norm * 50);
    registerStore.set(3, regVal);
    regCacheRef.current[3] = regVal;
    cb.bumpDebugTick();
    if (connectedDeviceId) {
      /* 拖动中每个 tick 都会进来：同地址只保留最新值，不堆过时帧 */
      bleManager.writeRegisterLatest(3, regVal, 0xea).catch(() => {});
    }
    cb.showKnobText(norm === 0 ? 'IN VOL  -∞ dB' : `IN VOL  ${regVal - 50} dB`);
  }, [connectedDeviceId, regCacheRef, cb]);

  const handleOutputVolChange = useCallback((norm: number) => {
    setOutputVol(norm);
    const regVal = Math.round(norm * 50);
    registerStore.set(261, regVal);
    regCacheRef.current[261] = regVal;
    cb.bumpDebugTick();
    if (connectedDeviceId) {
      /* 拖动中每个 tick 都会进来：同地址只保留最新值，不堆过时帧 */
      bleManager.writeRegisterLatest(261, regVal, 0xea).catch(() => {});
    }
    /* 总音量 0 = 关闭：与噪声门/激励同一逻辑，0 档同时落输出静音、指示灯熄灭。 */
    const shouldMute = norm <= 0.001;
    if (shouldMute !== muted) {
      setMuted(shouldMute);
      const muteReg = shouldMute ? 1 : 0;
      registerStore.set(260, muteReg);
      regCacheRef.current[260] = muteReg;
      if (connectedDeviceId) bleManager.writeRegister(260, muteReg, 0xea, false).catch(() => {});
      cb.addDebugLog(260, muteReg);
      cb.bumpDebugTick();
    }
  }, [connectedDeviceId, muted, regCacheRef, cb]);

  const toggleInputMute = useCallback(() => {
    const next = !inputMute;
    setInputMute(next);
    const regVal = next ? 1 : 0;
    registerStore.set(2, regVal);
    regCacheRef.current[2] = regVal;
    cb.bumpDebugTick();
    if (connectedDeviceId) {
      bleManager.writeRegister(2, regVal, 0xea, false).catch(() => {});
    }
    cb.showKnobText(`IN ${next ? 'MUTED' : 'UNMUTED'}`);
  }, [inputMute, connectedDeviceId, regCacheRef, cb]);

  const toggleOutputMute = useCallback(() => {
    const next = !outputMute;
    setOutputMute(next);
    const regVal = next ? 1 : 0;
    registerStore.set(260, regVal);
    regCacheRef.current[260] = regVal;
    cb.bumpDebugTick();
    if (connectedDeviceId) {
      bleManager.writeRegister(260, regVal, 0xea, false).catch(() => {});
    }
    cb.showKnobText(`OUT ${next ? 'MUTED' : 'UNMUTED'}`);
  }, [outputMute, connectedDeviceId, regCacheRef, cb]);

  return {
    muted, setMuted,
    inputVol, setInputVol, outputVol, setOutputVol,
    inputMute, setInputMute, outputMute, setOutputMute,
    handleInputVolChange, handleOutputVolChange, toggleInputMute, toggleOutputMute,
  };
}
