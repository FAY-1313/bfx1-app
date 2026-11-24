import { useState, useEffect } from 'react';
import { GlobeIcon, BookOpenIcon, GraduationCapIcon } from 'lucide-react';
import { notifyOk } from '../../services/feedback';
import { useI18n } from '../../i18n';
import { LoginScreen } from '../../components/community/Gates';
import { resetSignInFlag } from '../../services/toneCommunity';
import { readLocalAccount, signOutAccount } from '../../services/account';
import { renameUser, validateName, NAME_MAX } from '../../services/authLogin';
import type { Account } from '../../services/account';
import { PanelHeader } from '../../ui/PanelHeader';
import { IS_WEB_PREVIEW } from '../indexShared';

/* ★ 2026-11-24：从 Index.tsx 原样搬出（纯搬家，逻辑未改） */

/* ★ v3.67：本机昵称索引与「发码 → 校验 → 建号」流程已抽到 services/authLogin.ts，
   社区锁屏与账号页共用一份，避免两处各写一遍再分叉（v3.65 就是这么分叉的）。 */

function UserPanel({ visible, onClose, onOpenManualFullScreen, onOpenTutorial, onOpenHwGuide, backRef, onAccountChange }: { visible: boolean; onClose: () => void; onOpenManualFullScreen?: (m: { name: string; file: string }) => void; onOpenTutorial?: () => void; onOpenHwGuide?: () => void; backRef?: { current: (() => void) | null }; onAccountChange?: () => void }) {
  const { t } = useI18n();
  /* ★ v3.67（2026-10-24 用户拍板）
     · 登录**一步完成** —— 未登录时这一页本身就是登录表单（与社区锁屏共用 LoginForm），
       不再「锁屏 → 跳到本页 → 再填一次」
     · **去掉头像** —— 不做上传、不取云存储，界面统一用昵称首字色块
     · **用户名可自行修改** —— 2–12 字，本机不重名，改完同步云端 users.name */
  const [acc, setAcc] = useState<Account | null>(() => readLocalAccount());
  const [showManuals, setShowManuals] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [saving, setSaving] = useState(false);

  // 每次打开都重新读一次：可能刚在社区锁屏里登录过
  useEffect(() => { if (visible) { setAcc(readLocalAccount()); setEditing(false); setNameErr(''); } }, [visible]);

  // 返回键：编辑态先退出编辑，再退出面板
  useEffect(() => {
    if (!backRef) return;
    backRef.current = editing ? () => setEditing(false) : null;
    return () => { backRef.current = null; };
  }, [backRef, editing]);

  const nameErrorText = (e?: string) => {
    if (e === 'empty') return t('user.nameEmpty');
    if (e === 'short' || e === 'long') return t('user.nameRule');
    if (e === 'chars') return t('user.nameChars');
    if (e === 'taken') return t('user.nameTaken');
    return t('user.nameErr');
  };

  const startEdit = () => { setDraft(acc?.name || ''); setNameErr(''); setEditing(true); };

  const commitName = async () => {
    if (saving) return;
    const check = validateName(draft);
    if (!check.ok) { setNameErr(nameErrorText(check.error)); return; }
    setSaving(true);
    const res = await renameUser(draft);
    setSaving(false);
    if (!res.ok) { setNameErr(nameErrorText(res.error)); return; }
    setAcc(readLocalAccount());
    setEditing(false);
    onAccountChange?.();   // 顶栏昵称立刻跟着变，不用等关面板
    notifyOk(t('user.nameSaved'));
  };

  const doLogout = () => {
    setAcc(null); setEditing(false); setNameErr('');
    (async () => {
      await signOutAccount();
      resetSignInFlag();
    })();
  };

  const manuals = [
    { name: 'BF2 说明书', file: 'BF2说明书.pdf' },
    { name: 'BF3G 说明书', file: 'BF3G说明书.pdf' },
    { name: 'GO 音箱 说明书', file: 'GO音箱说明书.pdf' },
    { name: 'POLY 耳机 说明书', file: 'POLY耳机说明书.pdf' },
    { name: 'mix 耳机 说明书', file: 'mix耳机说明书.pdf' },
  ];

  /* ★ 2026-11-19（真机报障）：原生端点击"浏览器"无反应或打开错误页。
     根因：'/docs/' + file 是**相对路径**，交给系统浏览器后解析成
     https://localhost/docs/... —— 本地资源在系统浏览器里根本不存在。
     App 内的"查看"（内置 PDF 阅读）是正常的，所以原生端直接不渲染该按钮，
     见下方 IS_WEB_PREVIEW 包裹。这里保留函数供网页预览使用。 */
  const openManualExternal = (file: string) => { window.open('/docs/' + file, '_system'); };

  if (!visible) return null;

  if (showManuals) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: '#31343b', zIndex: 51, display: 'flex', flexDirection: 'column', animation: 'panelFade 0.18s ease-out' }}>
        <PanelHeader
          title={t('panel.manual')}
          accent="rgb(180,160,255)"
          onClose={onClose}
          left={<button onClick={() => setShowManuals(false)} style={{ background: 'none', border: 'none', color: 'rgba(180,160,255,0.7)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>←</button>}
        />
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {manuals.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, marginBottom: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(220,60,60,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontSize: 15, fontWeight: 800, color: 'rgb(220,80,80)' }}>PDF</span></div>
              <span style={{ flex: 1, textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.8)', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{m.name}</span>
              <button onClick={() => onOpenManualFullScreen?.(m)} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(180,160,255,0.12)', border: '1px solid rgba(180,160,255,0.25)', color: 'rgba(180,160,255,0.85)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}><BookOpenIcon size={13} style={{ verticalAlign: '-2px' }} /> {t('manual.view')}</button>
              {/* 原生端不渲染：相对路径在系统浏览器里打不开，见 openManualExternal 注释 */}
              {IS_WEB_PREVIEW && (
                <button onClick={() => openManualExternal(m.file)} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(76,201,240,0.1)', border: '1px solid rgba(76,201,240,0.2)', color: 'rgba(76,201,240,0.8)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}><GlobeIcon size={13} style={{ verticalAlign: '-2px' }} /> {t('manual.browser')}</button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const card: React.CSSProperties = {
    background: '#2a2e37', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, padding: 16,
  };
  const rowBtn: React.CSSProperties = {
    height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.72)',
    fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: '"Barlow-Regular_2",sans-serif',
    display: 'flex', alignItems: 'center', gap: 9, padding: '0 14px', width: '100%', textAlign: 'left',
  };

  /* ★ 2026-11-16：未登录时不再用「面板内嵌表单」，直接复用社区那一套整屏登录页，
     保证两处入口观感、键盘行为、报错文案完全一致。 */
  if (!acc) {
    return (
      <LoginScreen
        title={t('panel.userProfile')}
        onSuccess={(a) => { setAcc(a); onAccountChange?.(); notifyOk(t('user.loginOk', { name: a.name })); }}
        onClose={onClose}
      />
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#31343b', zIndex: 51, display: 'flex', flexDirection: 'column', animation: 'panelFade 0.18s ease-out' }}>
      <PanelHeader title={t('panel.userProfile')} accent="#F06F21" onClose={onClose} />

      {/* ── 已登录 = 账号资料（无头像） ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }} className="no-scrollbar">
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.15em', color: '#7C8494', fontFamily: '"Barlow-Regular_2",sans-serif', marginBottom: 10 }}>
              {t('user.myAccount')}
            </div>

            {editing ? (
              <>
                <input
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value.slice(0, NAME_MAX)); setNameErr(''); }}
                  maxLength={NAME_MAX}
                  placeholder={t('user.namePlaceholder')}
                  style={{
                    width: '100%', height: 44, padding: '0 13px', boxSizing: 'border-box', borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)', border: `1px solid ${nameErr ? 'rgba(242,120,105,0.7)' : 'rgba(240,111,33,0.5)'}`,
                    color: '#F0F2F5', fontSize: 16, fontWeight: 700, outline: 'none',
                    fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                  <span style={{ fontSize: 11, color: nameErr ? 'rgba(242,120,105,0.95)' : '#7C8494', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                    {nameErr || t('user.nameRule')}
                  </span>
                  <span style={{ fontSize: 11, color: '#7C8494', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{draft.length}/{NAME_MAX}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => { setEditing(false); setNameErr(''); }} style={{
                    flex: 1, height: 42, borderRadius: 11, cursor: 'pointer',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.14)',
                    color: '#c2c9d6', fontSize: 12, fontWeight: 700, fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>{t('btn.cancel')}</button>
                  <button onClick={commitName} disabled={saving} style={{
                    flex: 1, height: 42, borderRadius: 11, border: 'none', cursor: saving ? 'default' : 'pointer',
                    background: saving ? 'rgba(240,111,33,0.35)' : '#F06F21',
                    color: '#3b281c', fontSize: 12, fontWeight: 800, fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>{saving ? t('user.saving') : t('user.saveName')}</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 19, fontWeight: 800, color: '#F0F2F5', fontFamily: '"Barlow-Regular_2",sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acc.name}
                  </span>
                  <button onClick={startEdit} style={{
                    height: 32, padding: '0 13px', borderRadius: 10, cursor: 'pointer', flexShrink: 0,
                    background: 'rgba(240,111,33,0.12)', border: '1px solid rgba(240,111,33,0.4)',
                    color: '#F06F21', fontSize: 11, fontWeight: 750, fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>{t('user.editName')}</button>
                </div>
                <div style={{ marginTop: 9, fontSize: 11, color: '#7C8494', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.04em' }}>
                  {acc.phone ? `${acc.phone.slice(0, 3)} **** ${acc.phone.slice(-4)}` : ''}
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>
            <button onClick={() => setShowManuals(true)} style={rowBtn}><BookOpenIcon size={15} strokeWidth={1.9} /> {t('panel.manual')}</button>
            {onOpenTutorial && (
              <button onClick={onOpenTutorial} style={rowBtn}><GraduationCapIcon size={15} strokeWidth={1.9} /> {t('panel.tutorial')}</button>
            )}
            {onOpenHwGuide && (
              <button onClick={onOpenHwGuide} style={rowBtn}>
                <GraduationCapIcon size={15} strokeWidth={1.9} />
                {t('panel.hwGuide')}
              </button>
            )}
            <button onClick={doLogout} style={{
              ...rowBtn, marginTop: 4, justifyContent: 'center',
              background: 'rgba(242,86,91,0.08)', border: '1px solid rgba(242,86,91,0.28)',
              color: 'rgba(255,130,130,0.95)',
            }}>{t('user.logout')}</button>
          </div>

          <div style={{ marginTop: 16, fontSize: 11, color: '#5C636E', fontFamily: '"Barlow-Regular_2",sans-serif', lineHeight: 1.8, textAlign: 'center' }}>
            {t('user.nameSyncHint')}
          </div>
      </div>
    </div>
  );
}

export default UserPanel;
