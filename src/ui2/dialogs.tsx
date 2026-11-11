/**
 * BFX1 新 UI · 三个弹窗（依据 开发文档②_UI界面开发 §4）
 *
 *   ModelPicker   型号弹窗（压缩器 / 过载 / 箱头）
 *   PresetPicker  预设弹窗（合唱 / 延迟 / 混响）
 *   CabPicker     ★ 箱体两级弹窗（分组箱体 → 话筒/位置）
 *
 * 规格要点（§4.1 / §4.2 / §4.3）：
 *   · 每项显示：缩略图 + 名称 + 特点 + 旋钮数
 *   · 选中项 金框（#e8b860）
 *   · ⭐ 切换后自动载入该型号的默认甜点值
 *   · 箱体：第1级按分组列箱体（绿点=有真实 PEQ）；第2级列话筒/位置
 *   · ⭐ 箱体点话筒 → 自动载入 → 关弹窗 → 主页更新（无确认按钮）
 *   · PEQ 曲线已去掉
 */
import { useMemo, useState } from 'react';
import { CAB_SETS, CAB_NAMES, type CabSet } from '../data/_def';

/* ══════════════ 通用外壳 ══════════════ */
export function Sheet({ title, onClose, children, back, onBackdrop }: {
  title: string; onClose: () => void; children: React.ReactNode; back?: () => void;
  /** ★ 2026-10-16（S2）：点遮罩的行为。多级弹窗（箱体）在二级页传「返回一级」，
      避免"想返回结果整个弹窗被关掉"；不传则默认 = 整体关闭。 */
  onBackdrop?: () => void;
}) {
  const onDim = onBackdrop ?? onClose;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300, display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,.62)',
    }} onClick={onDim}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, maxHeight: '78vh', display: 'flex', flexDirection: 'column',
        background: '#14171d', borderTop: '1px solid #454d5c',
        borderRadius: '16px 16px 0 0', boxShadow: '0 -12px 40px rgba(0,0,0,.65)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '13px 14px',
          borderBottom: '1px solid #2c313a', flexShrink: 0,
        }}>
          {back && (
            <button onClick={back} aria-label="返回上一级" style={{
              /* ★ 2026-10-16（S1 / A6）：26×26 → 44×44 触控安全线 */
              width: 44, height: 44, borderRadius: 12, cursor: 'pointer', flexShrink: 0,
              border: '1px solid #454d5c', background: '#1b1f26', color: '#8b93a2', fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>‹</button>
          )}
          <span style={{ flex: 1, fontSize: 13, fontWeight: 650, color: '#e8eaee' }}>{title}</span>
          <button onClick={onClose} aria-label="关闭" style={{
            /* ★ 2026-10-16（S1 / A6）：26×26 → 44×44 触控安全线 */
            width: 44, height: 44, borderRadius: 12, cursor: 'pointer', flexShrink: 0,
            border: '1px solid #454d5c', background: '#1b1f26', color: '#8b93a2', fontSize: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0 14px' }}>{children}</div>
      </div>
    </div>
  );
}

/* ── 缩略图（型号/预设的示意方块；有真图时换成 img）── */
function Thumb({ accent, label }: { accent: string; label?: string }) {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 8, flexShrink: 0,
      background: `linear-gradient(150deg, ${accent}44, #0d1015)`,
      border: `1px solid ${accent}66`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700, color: accent, letterSpacing: .3,
    }}>{label ?? '▣'}</div>
  );
}

/* ── 列表项 ── */
function Row({ sel, accent, thumb, title, sub, right, onClick }: {
  sel: boolean; accent: string; thumb: React.ReactNode;
  title: string; sub?: string; right?: React.ReactNode; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 14px', cursor: 'pointer', textAlign: 'left',
      background: sel ? 'rgba(232,184,96,.10)' : 'transparent',
      border: 'none', borderLeft: `3px solid ${sel ? '#e8b860' : 'transparent'}`,
      borderBottom: '1px solid #21252c',
    }}>
      {thumb}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: sel ? 700 : 500,
          color: sel ? '#e8b860' : '#dfe3ea',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</div>
        {sub && <div style={{
          fontSize: 11, color: '#8b93a2', marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{sub}</div>}
      </div>
      {right && <div style={{ fontSize: 11, color: '#8b93a2', flexShrink: 0, textAlign: 'right' }}>{right}</div>}
    </button>
  );
}

/* ══════════════ 4.1 型号弹窗 ══════════════ */
export interface ModelItem { name: string; desc?: string; knobCount: number; tag?: string; }

export function ModelPicker({ title, items, selIdx, accent, onPick, onClose }: {
  title: string; items: ModelItem[]; selIdx: number; accent: string;
  onPick: (i: number) => void; onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      {items.map((m, i) => (
        <Row key={m.name + i} sel={i === selIdx} accent={accent}
          thumb={<Thumb accent={accent} label={String(i + 1)} />}
          title={m.name}
          sub={[m.desc, m.tag].filter(Boolean).join(' · ')}
          right={<>{m.knobCount} 旋钮</>}
          onClick={() => { onPick(i); onClose(); }} />
      ))}
    </Sheet>
  );
}

/* ══════════════ 4.2 预设弹窗 ══════════════ */
export function PresetPicker({ title, items, selIdx, accent, paramCount, onPick, onClose }: {
  title: string; items: { name: string; desc?: string }[]; selIdx: number;
  accent: string; paramCount: number;
  onPick: (i: number) => void; onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      {items.map((p, i) => (
        <Row key={p.name + i} sel={i === selIdx} accent={accent}
          thumb={<Thumb accent={accent} label={String(i + 1)} />}
          title={p.name}
          sub={p.desc}
          right={<>预设 {i + 1} / {items.length}<br />{paramCount} 参数</>}
          onClick={() => { onPick(i); onClose(); }} />
      ))}
    </Sheet>
  );
}

/* ══════════════ 4.3 ★★ 箱体两级弹窗 ══════════════ */
/** 按 category + group 归组 */
function groupCabs() {
  const byCab = new Map<string, CabSet[]>();
  for (const s of CAB_SETS) {
    if (!byCab.has(s.cab)) byCab.set(s.cab, []);
    byCab.get(s.cab)!.push(s);
  }
  const cats: { key: 'guitar' | 'bass'; label: string; groups: { name: string; cabs: CabSet[] }[] }[] = [
    { key: 'guitar', label: '吉他', groups: [] },
    { key: 'bass', label: '贝斯', groups: [] },
  ];
  for (const [cab, sets] of byCab) {
    const cat = cats.find((c) => c.key === sets[0].category) ?? cats[0];
    let g = cat.groups.find((x) => x.name === sets[0].group);
    if (!g) { g = { name: sets[0].group, cabs: [] }; cat.groups.push(g); }
    g.cabs.push(sets[0]);
  }
  return cats.filter((c) => c.groups.length > 0);
}

export function CabPicker({ cabIdx, micIdx, onPick, onClose }: {
  cabIdx: number; micIdx: number;
  onPick: (cabIdx: number, micIdx: number) => void; onClose: () => void;
}) {
  const [level2, setLevel2] = useState<string | null>(null);
  const cats = useMemo(groupCabs, []);
  const [catKey, setCatKey] = useState<'guitar' | 'bass'>(cats[0]?.key ?? 'guitar');

  /* ── 第 2 级：话筒 / 位置 ── */
  if (level2) {
    const sets = CAB_SETS.filter((s) => s.cab === level2);
    const curCabIdx = CAB_NAMES.indexOf(level2);
    return (
      <Sheet title={level2} onClose={onClose} back={() => setLevel2(null)} onBackdrop={() => setLevel2(null)}>
        <div style={{ padding: '9px 14px 5px', fontSize: 11, color: '#8b93a2', letterSpacing: .5 }}>
          话筒 / 位置（{sets.length} 选项）
        </div>
        {sets.map((s, i) => {
          const sel = curCabIdx === cabIdx && i === micIdx;
          return (
            <Row key={s.id} sel={sel} accent="#5bc8f5"
              thumb={
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${sel ? '#5bc8f5' : '#5a6270'}`,
                  background: sel ? '#5bc8f5' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{sel && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#101319' }} />}</div>
              }
              title={`${s.mic}${s.pos && s.pos !== '默认' ? ' · ' + s.pos : ''}`}
              sub={`补偿 ${s.makeup >= 0 ? '+' : ''}${s.makeup.toFixed(2)} dB · 拟合误差 ${s.mae.toFixed(3)} dB`}
              /* ★ 点话筒 → 自动载入 → 关弹窗 */
              onClick={() => { onPick(curCabIdx, i); onClose(); }} />
          );
        })}
      </Sheet>
    );
  }

  /* ── 第 1 级：分组箱体列表 ── */
  const cat = cats.find((c) => c.key === catKey) ?? cats[0];
  return (
    <Sheet title="选择箱体" onClose={onClose}>
      {/* 分组切换：吉他 / 贝斯 */}
      <div style={{ display: 'flex', gap: 7, padding: '9px 14px 11px' }}>
        {cats.map((c) => {
          const n = c.groups.reduce((a, g) => a + g.cabs.length, 0);
          const on = c.key === catKey;
          return (
            <button key={c.key} onClick={() => setCatKey(c.key)} style={{
              padding: '5px 13px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
              background: on ? 'rgba(232,184,96,.13)' : '#1b1f26',
              border: `1px solid ${on ? '#e8b860' : '#454d5c'}`,
              color: on ? '#e8b860' : '#8b93a2', fontWeight: on ? 650 : 400,
            }}>{c.label} {n}</button>
          );
        })}
      </div>
      {cat?.groups.map((g) => (
        <div key={g.name}>
          <div style={{
            padding: '8px 14px 5px', fontSize: 11, fontWeight: 650, color: '#8b93a2',
            letterSpacing: .8, borderLeft: '3px solid #e8b860', marginLeft: 0,
          }}>{g.name}</div>
          {g.cabs.map((s) => {
            const ci = CAB_NAMES.indexOf(s.cab);
            const n = CAB_SETS.filter((x) => x.cab === s.cab).length;
            const sel = ci === cabIdx;
            return (
              <Row key={s.cab} sel={sel} accent="#e8b860"
                thumb={
                  <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: n > 0 ? '#6ede8a' : '#41474f',
                      boxShadow: n > 0 ? '0 0 5px #6ede8acc' : 'none',
                    }} />
                  </div>
                }
                title={s.cab}
                sub={`${s.mic}${s.pos && s.pos !== '默认' ? ' · ' + s.pos : ''}`}
                right={<>{n} 选项</>}
                onClick={() => setLevel2(s.cab)} />
            );
          })}
        </div>
      ))}
      <div style={{
        padding: '11px 14px 2px', fontSize: 11, color: '#7c8494', lineHeight: 1.6,
      }}>
        ● 绿点 = 该箱体有真实 PEQ 数据（共 {CAB_SETS.length} 套 / {CAB_NAMES.length} 箱体）
      </div>
    </Sheet>
  );
}
