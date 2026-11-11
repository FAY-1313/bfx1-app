# -*- coding: utf-8 -*-
"""V6 (new converter) scan: register json + xml cross-check + preEQ template consistency."""
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
def od1_from_xml(root):
    b=find_mods(root,'guitar_1st_overdrive')
    if not b: return None
    bp=params(b[0])
    od=find_mods(b[0],'guitar_od'); op=params(od[0]) if od else {}
    pre=find_mods(b[0],'guitar_pre_od_peq')
    post=find_mods(b[0],'guitar_post_od_peq')
    return {'bypass':bp.get('bypass'),'drive':op.get('drive'),'dc':op.get('dc_offset'),'vol':op.get('volume'),
            'pre_byp':params(pre[0]).get('bypass') if pre else None,'pre':eqs_of(pre[0]) if pre else None,
            'post_byp':params(post[0]).get('bypass') if post else None,'post':eqs_of(post[0]) if post else None}
def nam_meta(base,cat):
    p=os.path.join(ROOT,cat,base+'.nam')
    try:
        with open(p,encoding='utf-8') as f: first=f.readline()
        md=json.loads(first).get('metadata',{})
        return md.get('name',''),md.get('modeled_by',''),md.get('tone_type','')
    except Exception: return '','',''
def load_report():
    rows={}
    with open(os.path.join(ROOT,'conversion_report.csv'),encoding='utf-8-sig') as f:
        for r in csv.DictReader(f): rows[r['file']]=r
    return rows

rep=load_report()
# 1) preEQ template consistency across ALL overdrive jsons
print("=== 过载 json preEQ(44-47) 模板一致性检查 ===")
seen=defaultdict(list)
for cat in ('pedal_soft','bass_pedal_soft'):
    for j in sorted(glob.glob(os.path.join(ROOT,cat,'*_bfx1.json'))):
        base=os.path.basename(j)[:-9]
        d=json.load(open(j,encoding='utf-8'))
        pre=tuple(d.get(str(k)) for k in (44,45,46,47))
        seen[pre].append(base)
for pre,files in seen.items():
    print(f"  preEQ={pre}: {len(files)} 个文件")
    print(f"      {', '.join(files[:8])}{' ...' if len(files)>8 else ''}")
print()
# 2) postEQ consistency
print("=== 过载 json postEQ(53-56) 模板一致性检查 ===")
seen2=defaultdict(list)
for cat in ('pedal_soft','bass_pedal_soft'):
    for j in sorted(glob.glob(os.path.join(ROOT,cat,'*_bfx1.json'))):
        base=os.path.basename(j)[:-9]
        d=json.load(open(j,encoding='utf-8'))
        post=tuple(d.get(str(k)) for k in (53,54,55,56))
        seen2[post].append(base)
for post,files in seen2.items():
    print(f"  postEQ={post}: {len(files)} 个文件")
    print(f"      {', '.join(files[:8])}{' ...' if len(files)>8 else ''}")
