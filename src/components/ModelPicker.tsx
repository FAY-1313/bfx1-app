import { XIcon } from 'lucide-react';

export interface ModelItem {
  name: string;
  group?: string;
}

interface ModelPickerProps {
  visible: boolean;
  title: string;
  models: ModelItem[];
  selectedIndex: number;
  accentColor?: string;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export default function ModelPicker({
  visible, title, models, selectedIndex, accentColor = '#4cc9f0',
  onSelect, onClose,
}: ModelPickerProps) {
  if (!visible || models.length === 0) return null;

  // Group models for section headers
  const groups: string[] = [];
  const grouped: Record<string, ModelItem[]> = {};
  models.forEach(m => {
    const g = m.group || '';
    if (!grouped[g]) { grouped[g] = []; groups.push(g); }
    grouped[g].push(m);
  });
  const hasGroups = groups.length > 1 && groups[0] !== '';

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 8000,
      background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '90%', maxWidth: 380, maxHeight: '80vh',
        background: '#232428', borderRadius: 16,
        border: '1px solid #3f4045',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid #2f3035',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor }} />
            <span style={{
              fontSize: 13, fontWeight: 700, color: '#ececec',
              fontFamily: '"Barlow-Regular_2",sans-serif',
            }}>{title}</span>
          </div>
          <div onClick={onClose} style={{
            width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          }}>
            <XIcon size={14} color="rgba(236,236,236,0.6)" />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
          {hasGroups ? (
            groups.map(g => (
              <div key={g}>
                <div style={{
                  padding: '8px 16px 4px', fontSize: 11, fontWeight: 700,
                  color: '#6b6e76', letterSpacing: '0.14em',
                  fontFamily: '"Barlow-Regular_2",sans-serif',
                }}>GROUP {g}</div>
                {(grouped[g] || []).map((m, i) => {
                  const fullIdx = models.indexOf(m);
                  const isSel = fullIdx === selectedIndex;
                  return (
                    <div key={i} onClick={() => { onSelect(fullIdx); onClose(); }} style={{
                      padding: '10px 16px', cursor: 'pointer', fontSize: 13,
                      color: isSel ? accentColor : '#b0b3bb',
                      background: isSel ? `${accentColor}1a` : 'transparent',
                      borderLeft: isSel ? `2px solid ${accentColor}` : '2px solid transparent',
                      fontFamily: '"Barlow-Regular_2",sans-serif',
                      transition: 'all 0.1s',
                    }}>
                      {m.name}
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            models.map((m, i) => {
              const isSel = i === selectedIndex;
              return (
                <div key={i} onClick={() => { onSelect(i); onClose(); }} style={{
                  padding: '10px 16px', cursor: 'pointer', fontSize: 13,
                  color: isSel ? accentColor : '#b0b3bb',
                  background: isSel ? `${accentColor}1a` : 'transparent',
                  borderLeft: isSel ? `2px solid ${accentColor}` : '2px solid transparent',
                  fontFamily: '"Barlow-Regular_2",sans-serif',
                  transition: 'all 0.1s',
                }}>
                  {m.name}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
