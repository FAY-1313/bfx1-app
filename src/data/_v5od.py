# -*- coding: utf-8 -*-
"""V5 overdrive review table: models + picks + drive/dc/vol + v2 PRE EQ."""
import os, sys, io, glob, csv, json, xml.etree.ElementTree as ET
from collections import defaultdict
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT='D:/NAMmodel/精选合集5'
DRIVE=('guitar_1st_overdrive','guitar_distortion','guitar_2nd_overdrive')
BLK={'guitar_1st_overdrive':'od1','guitar_distortion':'dist','guitar_2nd_overdrive':'od2'}

def params(n): return {ch.attrib.get('name',''):ch.text for ch in n if ch.tag.split('}')[-1]=='param'}
def find_mods(el,name):
    out=[]
    if el.tag.split('}')[-1]=='module' and el.get('name')==name: out.append(el)
    for c in el: out.extend(find_mods(c,name))
    return out
def get_eqs(el):
    if el is None: return []
    for p in el:
        if p.tag.split('}')[-1]=='eqList':
            out=[]
            for eq in sorted(p, key=lambda x:int(x.get('index') or 0)):
                d=params(eq)
                out.append((int(d.get('freq',0)),int(d.get('gain',0)),int(d.get('q',0))))
            return out
    return []
def od_block(root):
    """Return data of the ACTIVE drive block (od1 first) or None."""
    for name in DRIVE:
        b=find_mods(root,name)
        if not b or params(b[0]).get('bypass')!='0': continue
        od=find_mods(b[0],'guitar_od'); op=params(od[0]) if od else {}
        pre=find_mods(b[0],'guitar_pre_od_peq')
        post=find_mods(b[0],'guitar_post_od_peq')
        return {
            'blk': BLK[name], 'drive': op.get('drive'), 'dc': op.get('dc_offset'), 'vol': op.get('volume'),
            'pre_byp': params(pre[0]).get('bypass') if pre else None,
            'own_pre': get_eqs(pre[0]) if pre else [],
            'post_byp': params(post[0]).get('bypass') if post else None,
            'own_post': get_eqs(post[0]) if post else [],
        }
    return None
def nam_meta(base, cat):
    p=os.path.join(ROOT, cat, base+'.nam')
    try:
        with open(p, encoding='utf-8') as f:
            first=f.readline()
        md=json.loads(first).get('metadata',{})
        return md.get('name',''), md.get('modeled_by',''), md.get('tone_type','')
    except Exception:
        return '','',''

# manifest + v2 PRE EQ (标准 variant per 原型)
manifest={}
with open(os.path.join(ROOT,'精选合集5_清单.csv'),encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        if r['模块']=='pedal_soft': manifest[r['文件名'][:-4]]=r
# v2: per 原型 collect 标准 hexes
v2rows=[]
with open(os.path.join(ROOT,'PreEQ_电路特征表_v2.csv'),encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        if r['目录']=='pedal_soft': v2rows.append(r)
def preq_of(arch):
    for r in v2rows:
        if r['原型']==arch and r['参考方案']=='标准':
            return [int(r[f'PEQ{i}_Hex'],16) for i in (1,2,3,4)], r['物理值说明']
    return None, None

# V5 model → archetype mapping (待审核)
MODEL_ARCH={
 'Boss BD-2':'O-SD','Boss OD-3':'O-SD','Boss SD-1':'O-SD',
 'Fulltone OCD':'O-TS','Horizon Precision Drive':'O-PRECISION',
 'Ibanez TS808':'O-TS','Ibanez TS9':'O-TS','JHS Morning Glory':'O-BB',
 'Klon Centaur':'O-CENTAUR','ProCo RAT':'O-RAT','Wampler Tumnus':'O-CENTAUR',
 'Xotic BB Preamp':'O-BB',
}
ARCH_DISP={'O-TS':'Tube Screamer','O-SD':'Boss SD-1','O-CENTAUR':'Klon Centaur','O-BB':'BB Preamp',
 'O-PRECISION':'Precision Drive','O-RAT':'Proco RAT','O-FORTIN':'Fortin Dirty Tree',
 'O-PLUMES':'EQD Plumes','O-SANSA':'Tech21 SansAmp'}

# group manifest picks by model
by_model=defaultdict(list)
for base,r in manifest.items(): by_model[r['型号']].append((base,r))

print("="*100)
print("吉他过载模块 (pedal_soft) — 主型号 + 音色快照 + v2 PRE EQ 审核表")
print("寄存器约定: 全部映射到 OD1 (regs 42-56); 驱动drive=49 dc=50 vol=51 preEQ=44-47 preByp=43 postEQ=53-56 postByp=52")
print("="*100)
for model in sorted(by_model):
    picks=sorted(by_model[model], key=lambda x:(x[1]['pick'],))
    arch=MODEL_ARCH.get(model,'?')
    hexes,phys=preq_of(arch) if arch!='?' else (None,None)
    print(f"\n▍主型号: {model}   [v2原型: {arch} → {ARCH_DISP.get(arch,arch)}]")
    if hexes:
        print(f"   PRE EQ (v2标准): {', '.join(f'0x{h:08X}' for h in hexes)}")
        print(f"   {phys}")
    else:
        print(f"   PRE EQ: 无 v2 原型映射 (需确认)")
    for base,r in picks:
        xp=os.path.join(ROOT,'pedal_soft',base+'_bfx1.xml')
        if not os.path.exists(xp):
            print(f"   └ [无XML] Pick{r['pick']} {base} (清单有, 无转换文件)")
            continue
        root=ET.parse(xp).getroot()
        od=od_block(root)
        nam,nby,tone=nam_meta(base,'pedal_soft')
        if od is None:
            print(f"   └ [无效] Pick{r['pick']} {base} (全旁通, dl={r['下载量']} fav={r['收藏数']})")
            continue
        ownpre=f"{od['own_pre'][0] if od['own_pre'] else None}..." if od['own_pre'] else "-"
        print(f"   └ Pick{r['pick']}: 源块={od['blk']}(→OD1) drive={od['drive']} dc={od['dc']} vol={od['vol']}"
              f" preByp={od['pre_byp']} postByp={od['post_byp']} | dl={r['下载量']} fav={r['收藏数']} by={r['创作者']}")
        if nam: print(f"        NAM快照: {nam}")