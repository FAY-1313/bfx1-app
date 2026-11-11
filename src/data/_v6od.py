# -*- coding: utf-8 -*-
"""V6 (new converter) overdrive review table: guitar + bass, register json authoritative."""
import os, sys, io, glob, csv, json, xml.etree.ElementTree as ET
from collections import defaultdict
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT='D:/NAMmodel/精选合集5'

def params(n): return {c.attrib.get('name',''):c.text for c in n if c.tag.split('}')[-1]=='param'}
def find_mods(el,name):
    out=[]
    if el.tag.split('}')[-1]=='module' and el.get('name')==name: out.append(el)
    for c in el: out.extend(find_mods(c,name))
    return out
def eqs_of(el):
    if el is None: return None
    for p in el:
        if p.tag.split('}')[-1]=='eqList':
            out=[]
            for eq in sorted(p,key=lambda x:int(x.get('index') or 0)):
                d=params(eq); out.append((int(d.get('freq',0)),int(d.get('gain',0)),int(d.get('q',0))))
            return out
    return None
def nam_meta(base,cat):
    try:
        with open(os.path.join(ROOT,cat,base+'.nam'),encoding='utf-8') as f: first=f.readline()
        md=json.loads(first).get('metadata',{})
        return md.get('name',''),md.get('modeled_by',''),md.get('tone_type','')
    except Exception: return '','',''
def load_report():
    rows={}
    with open(os.path.join(ROOT,'conversion_report.csv'),encoding='utf-8-sig') as f:
        for r in csv.DictReader(f): rows[r['file']]=r
    return rows
def load_manifest():
    m={}
    with open(os.path.join(ROOT,'精选合集5_清单.csv'),encoding='utf-8-sig') as f:
        for r in csv.DictReader(f): m[r['文件名'][:-4]]=r
    return m
def load_v2():
    rows=[]
    with open(os.path.join(ROOT,'PreEQ_电路特征表_v2.csv'),encoding='utf-8-sig') as f:
        for r in csv.DictReader(f): rows.append(r)
    return rows

rep=load_report(); man=load_manifest(); v2=load_v2()
# v2 原型 preEQ: 目录+原型 -> 方案 -> hexes
v2map=defaultdict(dict)
for r in v2:
    v2map[(r['目录'],r['原型'])][r['参考方案']]=(tuple(int(r[f'PEQ{i}_Hex'],16) for i in (1,2,3,4)),r['物理值说明'])
# 吉他 MODEL_ARCH (待审核)
MODEL_ARCH={'Boss BD-2':'O-SD','Boss OD-3':'O-SD','Boss SD-1':'O-SD','Fulltone OCD':'O-TS',
 'Horizon Precision Drive':'O-PRECISION','Ibanez TS808':'O-TS','Ibanez TS9':'O-TS',
 'JHS Morning Glory':'O-BB','Klon Centaur':'O-CENTAUR','ProCo RAT':'O-RAT','Wampler Tumnus':'O-CENTAUR'}

def show_cat(cat, label, is_guitar):
    jsons=sorted(glob.glob(os.path.join(ROOT,cat,'*_bfx1.json')))
    print("="*100)
    print(f"{label} ({len(jsons)} 个快照)")
    print("="*100)
    by_model=defaultdict(list)
    for j in jsons:
        base=os.path.basename(j)[:-10]
        d=json.load(open(j,encoding='utf-8'))
        dr=int(d.get('49',0)); dc=int(d.get('50',0)); vl=int(d.get('51',0))
        pre_byp=d.get('43'); post_byp=d.get('52'); od_byp=d.get('48'); blk_byp=d.get('42')
        root=ET.parse(os.path.join(ROOT,cat,base+'_bfx1.xml')).getroot()
        b=find_mods(root,'guitar_1st_overdrive')
        post=eqs_of(find_mods(b[0],'guitar_post_od_peq')[0]) if b else None
        pre=eqs_of(find_mods(b[0],'guitar_pre_od_peq')[0]) if b else None
        m=man.get(base,{}); rp=rep.get(base,{})
        nam,nby,tone=nam_meta(base,cat)
        by_model[(m.get('型号',rp.get('brand','?')),m.get('pick','?'),base)].append(dict(drive=dr,dc=dc,vol=vl,post=post,pre=pre,
            dl=m.get('下载量','-'),fav=m.get('收藏数','-'),by=m.get('创作者',rp.get('brand','?')),
            status=rp.get('status','?'),detail=rp.get('detail',''),nam=nam,cat=cat))
    # group by main model (型号 if in manifest, else brand)
    groups=defaultdict(list)
    for (model,pick,base),data in by_model.items():
        groups[model].append((pick,base,data[0]))
    for model in sorted(groups):
        picks=sorted(groups[model],key=lambda x:(int(x[0]) if str(x[0]).isdigit() else 99,))
        arch=MODEL_ARCH.get(model) if is_guitar else None
        print(f"\n▍主型号: {model}   [{len(picks)} 快照]"+(f"  v2原型: {arch}" if arch else "  无 v2 原型(贝斯)"))
        if arch:
            for variant in ('标准','温暖','明亮'):
                e=v2map.get((cat if is_guitar else 'pedal_soft',arch),{})
                if variant in e:
                    hexes,phys=e[variant]
                    print(f"     ANALOG {variant}: {' '.join(f'0x{h:08X}' for h in hexes)}  {phys}")
        for pick,base,data in picks:
            poststr=" · ".join(f"{f}/{g}" for f,g,_ in data['post']) if data['post'] else "-"
            flag=''
            if data['status']!='OK': flag=f" ⚠️{data['status']}"
            print(f"   └ Pick{pick}: drive={data['drive']} dc={data['dc']} vol={data['vol']} | postEQ(f/g): {poststr}"
                  f" | dl={data['dl']} fav={data['fav']} by={data['by']}{flag}")
            if data['nam']: print(f"        NAM: {data['nam']}")

show_cat('pedal_soft','吉他过载 (pedal_soft)', is_guitar=True)
print()
show_cat('bass_pedal_soft','贝斯过载 (bass_pedal_soft)', is_guitar=False)
