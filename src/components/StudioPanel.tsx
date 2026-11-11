// ─── 工作室外壳: 单头栏 + 底部 6 Tab 导航 ──────────────────────────
// 6 面板全部保持挂载 (切 Tab 只隐藏, 不卸载) → Looper 4 轨 / 录音列表 /
// 播放状态跨 Tab 保留; 切走时各面板自行决定是否停麦/停录 (active prop),
// 关闭工作室时全部停止 (visible prop).
// BPM 提升到此层统一: 节拍器/鼓机/循环共用同一 bpm (各自界面仍可调),
// 持久化到 localStorage `bfx_bpm`.

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { PanelHeader } from '../ui/PanelHeader';
import TunerPanel from './TunerPanel';
import MetronomePanel from './MetronomePanel';
import DrumPanel from './DrumPanel';
import LooperPanel from './LooperPanel';
import RecorderPanel from './RecorderPanel';
import StemSplitter from './StemSplitter';

interface StudioPanelProps {
  visible: boolean;
  onClose: () => void;
  /**
   * ★ v3.52（2026-10-22）：外部指定要打开哪个 tab。
   *   预设库底部「节拍器」键需要直接落到 metro，而本组件是常驻挂载的，
   *   只在首次挂载时读 localStorage → 必须由外部显式驱动。
   *   用 seq 做「一次性」语义：只有 seq 变了才切 tab，用户手动切走不会被抢回。
   */
  openTab?: TabId;
  openTabSeq?: number;
  /**
   * ★ v3.60（2026-10-24 用户拍板）：单工具模式。
   *   预设库底部的「调音器 / 节拍器」各开一个独立页面 —— 只渲染指定面板，
   *   并且隐藏顶部的 6 tab 菜单（页面里不再出现其他菜单选项）。
   */
  onlyTab?: TabId;
}

type TabId = 'tuner' | 'metro' | 'drum' | 'looper' | 'rec' | 'stem';

const TABS: Array<{ id: TabId; labelKey: string; panelKey: string; accent: string }> = [
  { id: 'tuner', labelKey: 'studio.tuner',   panelKey: 'panel.tuner',     accent: '#3ddc84' },
  { id: 'metro', labelKey: 'studio.metronome', panelKey: 'panel.metronome', accent: '#e2c044' },
  { id: 'drum',  labelKey: 'studio.drum',    panelKey: 'panel.drum',      accent: '#e2c044' },
  { id: 'looper',labelKey: 'studio.looper',  panelKey: 'panel.looper',    accent: '#ff5f9e' },
  { id: 'rec',   labelKey: 'studio.recorder',panelKey: 'panel.recorder',  accent: '#ff5078' },
  { id: 'stem',  labelKey: 'studio.stem',    panelKey: 'panel.stem',      accent: '#b450ff' },
];

export default function StudioPanel({ visible, onClose, openTab, openTabSeq, onlyTab }: StudioPanelProps) {
  const { t } = useI18n();
  // C2 (2026-09-02): 记住上次所在面板 — 会话内常驻挂载本就不丢, 这里补跨会话 (localStorage)
  const [tab, setTab] = useState<TabId>(() => {
    const s = localStorage.getItem('bfx_studio_tab');
    return s && TABS.some(x => x.id === s) ? (s as TabId) : 'tuner';
  });
  /* ★ v3.52：外部请求切 tab（预设库「节拍器」键）。seq 变化才执行一次，
     之后用户手动切 tab 不会被这条 effect 抢回去。 */
  const lastOpenSeq = useRef<number>(-1);
  useEffect(() => {
    if (!visible) return;
    if (openTabSeq === undefined || openTab === undefined) return;
    if (lastOpenSeq.current === openTabSeq) return;
    lastOpenSeq.current = openTabSeq;
    setTab(openTab);
  }, [visible, openTab, openTabSeq]);
  useEffect(() => { localStorage.setItem('bfx_studio_tab', tab); }, [tab]);
  const [bpm, setBpm] = useState<number>(() =>
    Number(localStorage.getItem('bfx_bpm')) ||
    Number(localStorage.getItem('bfx_metro_bpm')) ||
    120);
  useEffect(() => { localStorage.setItem('bfx_bpm', String(bpm)); }, [bpm]);

  /* ★ v3.60：单工具模式 —— 用 onlyTab 覆盖当前 tab，并隐藏 tab 菜单行 */
  const effTab: TabId = onlyTab ?? tab;
  const active = TABS.find(x => x.id === effTab)!;

  return (
    <div style={{
      /* ★★ v3.81（P2-15）：原来 `fixed; inset:'0 0 64px 0'` —— 绕开了面板宿主容器
         （宿主是 `absolute; bottom:59; height:calc(100% - 121px); zIndex:50`）：
         顶边从屏幕 0 起 → 盖住 48px App 顶栏；底边留 64px → 比底栏 59 多 5px，露一条缝。
         与其它面板一致改成 absolute; inset:0，由宿主约束。 */
      position: 'absolute', inset: 0, zIndex: 51,
      background: '#1a1b1f',
      display: 'flex', flexDirection: 'column',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      /* ★ 2026-10-19：同 BluetoothPanel —— 隐藏时彻底退出命中测试，避免子元素覆盖 pointer-events */
      visibility: visible ? 'visible' : 'hidden',
      // B4: visible 过渡上滑淡入 (root 自身 transform; 打开稳态 none, 不影响内部 fixed 弹层)
      transform: visible ? 'none' : 'translateY(6px)',
      transition: 'opacity 0.18s, transform 0.18s',
    }}>
      {/* Header */}
      <PanelHeader title={t(active.panelKey)} accent={active.accent} onClose={onClose} />

      {/* C3 (2026-09-02): 6 子 tab 从底部 icon 行改为 Header 下方文字胶囊 —
          避免与全局底部 5 菜单形成双层底栏混淆; 面板内容延伸到 overlay 底部
          ★ v3.60：单工具模式（onlyTab）下整行不渲染 */}
      {!onlyTab && (
      <div style={{
        flexShrink: 0, display: 'flex', gap: 5, padding: '8px 10px 9px',
        background: '#1d1e22', borderBottom: '1px solid #2b2c30',
      }}>
        {TABS.map(x => {
          const on = tab === x.id;
          return (
            <button key={x.id} onClick={() => setTab(x.id)} style={{
              flex: 1, height: 28, borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: on ? `${x.accent}1f` : 'transparent',
              border: `1px solid ${on ? `${x.accent}66` : 'rgba(255,255,255,0.07)'}`,
              color: on ? x.accent : 'rgba(150,150,160,0.6)',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              fontFamily: '"Barlow-Regular_2",sans-serif',
              textShadow: on ? `0 0 8px ${x.accent}55` : 'none',
              transition: 'background 0.12s, border-color 0.12s, color 0.12s',
            }}>
              {t(x.labelKey)}
            </button>
          );
        })}
      </div>
      )}

      {/* Content — 全部保持挂载, 只切换可见 */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <PanelSlot show={visible && effTab === 'tuner'}>
          <TunerPanel active={visible && effTab === 'tuner'} />
        </PanelSlot>
        <PanelSlot show={visible && effTab === 'metro'}>
          <MetronomePanel bpm={bpm} setBpm={setBpm} visible={visible} accentColor={active.accent} />
        </PanelSlot>
        <PanelSlot show={visible && effTab === 'drum'}>
          <DrumPanel bpm={bpm} setBpm={setBpm} visible={visible} accentColor={active.accent} />
        </PanelSlot>
        <PanelSlot show={visible && effTab === 'looper'}>
          <LooperPanel bpm={bpm} setBpm={setBpm} active={visible && effTab === 'looper'} visible={visible} />
        </PanelSlot>
        <PanelSlot show={visible && effTab === 'rec'}>
          <RecorderPanel active={visible && effTab === 'rec'} visible={visible} />
        </PanelSlot>
        <PanelSlot show={visible && effTab === 'stem'}>
          <StemSplitter accentColor={active.accent} active={visible && effTab === 'stem'} />
        </PanelSlot>
      </div>
    </div>
  );
}

/** 隐藏时 display:none 占零空间, 显示时独占滚动区. */
function PanelSlot({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      display: show ? 'flex' : 'none',
      flexDirection: 'column',
      flex: 1, minHeight: 0, overflowY: 'auto',
    }}>
      {children}
    </div>
  );
}
