/**
 * 上传音色（v3.66）
 *
 * 用户拍板：**取消「单个 / 预设组」类型选择**，点「＋」直接进本地库 16 格选一格，
 * 选定后填名称 / 风格 / 标签 / 简介发布。**没有整组上传**，一次只发一个预设。
 *
 * ★ 守 K5：上传只读本地库那格的寄存器快照，**不碰硬件**（不切频道、不发 EA/EB）。
 * ★ 用户拍板 H：不审核，发布即进推荐流。
 * ★ 用户拍板 F：风格是 8 个封闭枚举单选；标签是自写，≤5 个、每个 ≤10 字。
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LOCAL_BANK_ZH } from '../../config/bankLabels';
import { C, StyleChip, TagChip, IconBack, IconPlus } from './parts';
import { TONE_STYLES, TONE_STYLE_EN, MAX_TAGS, MAX_TAG_LEN } from '../../data/toneStyles';
import { loadLocalBank } from '../../services/localPresets';
import type { BankItem } from '../../services/localPresets';
import { uploadTone, uploadImage, compressImageToJPEG } from '../../services/toneCommunity';
/* ★ 2026-11-04（用户拍板）：社区分享支持**整组 4 格**，与"我的音色库 · 整组上传"同一套闸门。 */
import { checkGroupModels, groupCheckReason } from '../../services/uploadGuard';

const GROUP_COLORS: Record<string, string> = { A: '#ECECEC', B: '#3DDC84', C: '#E2C044', D: '#4CC9F0' };
const SUGGEST_TAGS = ['Vox', 'Marshall', 'Mesa', 'Fender', '延迟', '混响', '低切', 'Solo', '扫弦'];

export default function UploadSheet({
  open, onClose, uid, author, avatar, lang, onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  uid: string;
  author: string;
  avatar?: string;
  lang: string;
  onUploaded: () => void;
}) {
  const zh = lang !== 'en';
  const [step, setStep] = useState<1 | 2>(1);
  /** ★ 2026-11-04：社区只允许**整组 4 格分享**（单格分享已取消）。 */
  const [group, setGroup] = useState(0);
  const [slot, setSlot] = useState(0);
  const [bank, setBank] = useState<BankItem[]>([]);
  const [name, setName] = useState('');
  const [style, setStyle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [desc, setDesc] = useState('');
  const [coverId, setCoverId] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1); setGroup(0); setSlot(1); setName(''); setStyle(''); setTags([]); setTagInput('');
    setDesc(''); setCoverId(''); setCoverPreview(''); setBusy(false); setNotice('');
    setBank(loadLocalBank());
  }, [open]);

  const picked = useMemo(() => bank.find((b) => b.slot === slot && b.data) || null, [bank, slot]);

  /* ★ 2026-11-04：整组分享 —— 取目标组 4 格，闸门与"整组上传"完全一致 */
  const groupItems = useMemo(
    () => [0, 1, 2, 3].map((k) => bank.find((b) => b.slot === group * 4 + k + 1) ?? null),
    [bank, group],
  );
  const groupCheck = useMemo(
    () => checkGroupModels(groupItems, group * 4 + 1),
    [groupItems, group],
  );
  const groupTones = useMemo(
    () => (groupCheck.ok
      ? groupItems.map((it) => ({ ...it!.data!, slot: 0, name: it!.name }))
      : []),
    [groupCheck.ok, groupItems],
  );

  // 选中槽位后，默认用该格名称当音色名（用户可改）
  useEffect(() => {
    if (picked?.data && !name) setName(picked.name || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  if (!open) return null;

  const addTag = () => {
    const v = tagInput.trim().replace(/^#/, '');
    if (!v) return;
    if (v.length > MAX_TAG_LEN) { setNotice(zh ? `单个标签最多 ${MAX_TAG_LEN} 个字` : `Max ${MAX_TAG_LEN} chars`); return; }
    if (tags.includes(v)) { setTagInput(''); return; }
    if (tags.length >= MAX_TAGS) { setNotice(zh ? `最多 ${MAX_TAGS} 个标签` : `Max ${MAX_TAGS} tags`); return; }
    setTags([...tags, v]); setTagInput(''); setNotice('');
  };

  const toggleTag = (v: string) => {
    if (tags.includes(v)) { setTags(tags.filter((x) => x !== v)); return; }
    if (tags.length >= MAX_TAGS) { setNotice(zh ? `最多 ${MAX_TAGS} 个标签` : `Max ${MAX_TAGS} tags`); return; }
    setTags([...tags, v]); setNotice('');
  };

  const pickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const blob = await compressImageToJPEG(f, 512, 0.85);
    if (!blob) { setNotice(zh ? '封面处理失败' : 'Cover failed'); return; }
    const id = await uploadImage(blob, `tones/${Date.now()}.jpg`);
    if (!id) { setNotice(zh ? '封面上传失败' : 'Cover upload failed'); return; }
    setCoverId(id); setCoverPreview(URL.createObjectURL(blob));
  };

  const submit = async () => {
    if (!groupCheck.ok) {
      setNotice(groupCheckReason(groupCheck, false));
      return;
    }
    if (!name.trim()) { setNotice(zh ? '音色名称必填' : 'Name required'); return; }
    if (!style) { setNotice(zh ? '请选一个风格' : 'Pick a style'); return; }
    setBusy(true); setNotice('');
    const firstTone = groupTones[0];
    const ok = await uploadTone({
      uid, author, avatar,
      name: name.trim(),
      description: desc.trim() || undefined,
      style,
      tags,
      category: style === '贝斯' ? 'bass' : 'guitar',
      cover: coverId || undefined,
      kind: 'group',
      data: { ...firstTone, slot: 0 },
      tones: groupTones,
    });
    setBusy(false);
    if (ok) { onUploaded(); onClose(); }
    else setNotice(zh ? '发布失败，检查网络后重试' : 'Publish failed, check network');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.045)', border: `1px solid ${C.line2}`,
    color: C.text, fontSize: 12.5, outline: 'none', fontFamily: C.font,
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(4,5,7,0.72)', display: 'flex', alignItems: 'flex-end' }}>
      <div style={{
        width: '100%', maxHeight: '93%', background: C.surface,
        borderRadius: '20px 20px 0 0', border: `1px solid ${C.line2}`, borderBottom: 'none',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* 头部 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 12px 10px', flexShrink: 0, borderBottom: `1px solid ${C.line}` }}>
          {step === 2 && (
            <button onClick={() => { setStep(1); setNotice(''); }} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconBack size={18} />
            </button>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text, fontFamily: C.font }}>
              {step === 1
                ? (zh ? '选一整组上传（4 格）' : 'Pick a group (4)')
                : (zh ? '填写音色信息' : 'Tone info')}
            </div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, marginTop: 2 }}>
              {step === 1
                ? (zh ? `从${LOCAL_BANK_ZH}选一整组（4 格，同箱头同箱体）` : 'One 4-slot group, same amp & cab')
                : (zh ? '发布后立即出现在推荐里，不需要审核' : 'Published instantly, no review')}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, color: C.brand, fontFamily: C.font }}>{step}/2</span>
          <button onClick={onClose} style={{ height: 30, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.line2}`, background: 'transparent', color: C.text3, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: C.font }}>
            {zh ? '取消' : 'Cancel'}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }} className="no-scrollbar">
          {step === 1 && (
            <>
              {/* ★ 2026-11-04（用户拍板）：社区**只保留整组 4 格分享**，单格分享已取消 */}
              {['A', 'B', 'C', 'D'].map((g) => {
                const gIndex = ['A', 'B', 'C', 'D'].indexOf(g);
                const slots = [1, 2, 3, 4].map((i) => gIndex * 4 + i);
                const gItems = slots.map((sn) => bank.find((b) => b.slot === sn) ?? null);
                const gc = checkGroupModels(gItems, gIndex * 4 + 1);
                const groupOn = group === gIndex;
                return (
                  <div key={g} style={{ marginBottom: 10 }}>
                    <button
                      onClick={() => { setGroup(gIndex); setSlot(gIndex * 4 + 1); setName(''); setNotice(''); }}
                      style={{
                        width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 11, cursor: 'pointer',
                        background: groupOn ? 'rgba(240,111,33,0.14)' : 'rgba(255,255,255,0.035)',
                        border: `1px solid ${groupOn ? C.brand : C.line}`,
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 16, height: 16, borderRadius: 5, background: `${GROUP_COLORS[g]}22`, border: `1px solid ${GROUP_COLORS[g]}66`, color: GROUP_COLORS[g], fontSize: 11, fontWeight: 800, fontFamily: C.font, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{g}</span>
                        <span style={{ fontSize: 11, color: C.text3, fontFamily: C.font, letterSpacing: '0.08em' }}>{zh ? '音色库' : 'BANK'} {g} · 4 {zh ? '格' : 'slots'}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: gc.ok ? '#3DDC84' : '#E08A8A', fontFamily: C.font }}>
                          {gc.ok ? (zh ? '可整组分享' : 'READY') : (zh ? '不满足整组条件' : 'NOT READY')}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 8 }}>
                        {slots.map((sn, k) => (
                          <div key={sn} style={{
                            fontSize: 10.5, color: gItems[k]?.data ? C.text2 : C.text3, fontFamily: C.font,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{gItems[k]?.data ? (gItems[k]!.name || '未命名') : (zh ? '空' : 'EMPTY')}</div>
                        ))}
                      </div>
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {step === 2 && picked?.data && (
            <>
              {/* 预览 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: `1px solid ${C.line}`, marginBottom: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: C.brandSoft, border: `1px solid ${C.brandLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.brand, fontFamily: C.font }}>{['A', 'B', 'C', 'D'][Math.floor((slot - 1) / 4)]}{slot}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text, fontFamily: C.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{picked.name || '未命名'}</div>
                  <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, marginTop: 2 }}>
                    {zh ? `来自${LOCAL_BANK_ZH}` : 'From my saved tones'} · {zh ? '整组 4 格音色包' : '4-slot group pack'}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 800, color: C.text3, fontFamily: C.font, letterSpacing: '0.1em', marginBottom: 6 }}>
                {zh ? '音色名称' : 'NAME'} <span style={{ color: C.brand }}>*</span>
              </div>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder={zh ? '例如：AC30 甜清音 · 轻扫' : 'e.g. AC30 sweet clean'} style={{ ...inputStyle, marginBottom: 14 }} />

              <div style={{ fontSize: 11, fontWeight: 800, color: C.text3, fontFamily: C.font, letterSpacing: '0.1em', marginBottom: 7 }}>
                {zh ? '风格' : 'STYLE'} <span style={{ color: C.brand }}>*</span>
                <span style={{ color: C.text3, fontWeight: 600, letterSpacing: 0, marginLeft: 6 }}>{zh ? '单选' : 'single'}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {TONE_STYLES.map((s) => (
                  <StyleChip key={s} label={zh ? s : (TONE_STYLE_EN[s] || s)} active={style === s} onClick={() => setStyle(style === s ? '' : s)} />
                ))}
              </div>

              <div style={{ fontSize: 11, fontWeight: 800, color: C.text3, fontFamily: C.font, letterSpacing: '0.1em', marginBottom: 7 }}>
                {zh ? '标签' : 'TAGS'} <span style={{ color: C.text3, fontWeight: 600, letterSpacing: 0, marginLeft: 4 }}>{tags.length}/{MAX_TAGS} · {zh ? '自定义' : 'custom'}</span>
              </div>
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {tags.map((tg) => (
                    <button key={tg} onClick={() => toggleTag(tg)} style={{
                      height: 26, padding: '0 10px', borderRadius: 999, cursor: 'pointer',
                      background: C.brandSoft, border: `1px solid ${C.brandLine}`, color: C.brand,
                      fontSize: 11, fontWeight: 700, fontFamily: C.font, display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}>#{tg}<span style={{ opacity: 0.7 }}>×</span></button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  maxLength={MAX_TAG_LEN}
                  placeholder={zh ? '输入标签，回车添加' : 'Type a tag, press enter'}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={addTag} style={{
                  width: 42, height: 40, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
                  background: C.brandSoft, border: `1px solid ${C.brandLine}`, color: C.brand,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}><IconPlus size={16} color={C.brand} /></button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
                {SUGGEST_TAGS.filter((s) => !tags.includes(s)).slice(0, 6).map((s) => (
                  <TagChip key={s} label={s} onClick={() => toggleTag(s)} />
                ))}
              </div>

              <div style={{ fontSize: 11, fontWeight: 800, color: C.text3, fontFamily: C.font, letterSpacing: '0.1em', marginBottom: 6 }}>{zh ? '简介（可选）' : 'DESCRIPTION'}</div>
              <textarea
                value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={80} rows={2}
                placeholder={zh ? '一句话说清怎么用：箱头、增益量、适合的段落' : 'How to use it in one line'}
                style={{ ...inputStyle, resize: 'none', lineHeight: 1.6, marginBottom: 14 }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                {coverPreview ? (
                  <img src={coverPreview} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', border: `1px solid ${C.brandLine}` }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: 10, border: `1px dashed ${C.line2}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, color: C.text3, fontFamily: C.font }}>{zh ? '封面' : 'COVER'}</span>
                  </div>
                )}
                <input ref={coverRef} type="file" accept="image/*" onChange={pickCover} style={{ display: 'none' }} />
                <button onClick={() => coverRef.current?.click()} style={{
                  height: 34, padding: '0 14px', borderRadius: 9, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.line2}`, color: C.text2,
                  fontSize: 11, fontWeight: 700, fontFamily: C.font,
                }}>{zh ? '选封面图' : 'Choose cover'}</button>
              </div>
            </>
          )}
        </div>

        {/* 底部 */}
        <div style={{ padding: '10px 12px 14px', borderTop: `1px solid ${C.line}`, flexShrink: 0 }}>
          {notice && (
            <div style={{ fontSize: 11, color: '#F0A93C', fontFamily: C.font, textAlign: 'center', marginBottom: 8 }}>{notice}</div>
          )}
          {step === 1 ? (() => {
            const canNext = groupCheck.ok;
            return (
              <button
                disabled={!canNext}
                onClick={() => {
                  if (!groupCheck.ok) { setNotice(groupCheckReason(groupCheck, false)); return; }
                  setNotice(''); setStep(2);
                }}
                style={{
                  width: '100%', height: 46, borderRadius: 13, border: 'none',
                  cursor: canNext ? 'pointer' : 'default',
                  background: canNext ? C.brand : 'rgba(255,255,255,0.06)',
                  color: canNext ? '#3b281c' : C.text3, fontSize: 13, fontWeight: 800, fontFamily: C.font,
                }}
              >{canNext
                ? (zh ? '下一步' : 'Next')
                : (zh ? '整组条件不满足' : 'Group not ready')}</button>
            );
          })() : (
            <button
              disabled={busy}
              onClick={submit}
              style={{
                width: '100%', height: 46, borderRadius: 13, border: 'none',
                cursor: busy ? 'default' : 'pointer',
                background: busy ? 'rgba(240,111,33,0.25)' : C.brand,
                color: busy ? C.brand : '#3b281c', fontSize: 13, fontWeight: 800, fontFamily: C.font,
              }}
            >{busy ? (zh ? '发布中…' : 'Publishing…') : (zh ? '发布' : 'Publish')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
