# -*- coding: utf-8 -*-
"""Verify: dump all 3 drive blocks for the 6 'od2-active' overdrive files."""
import os, sys, io, glob, csv, xml.etree.ElementTree as ET
from collections import defaultdict
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT='D:/NAMmodel/精选合集5'
def params(n): return {c.attrib.get('name',''):c.text for c in n if c.tag.split('}')[-1]=='param'}
def find_mods(el,name):
    out=[]
    if el.tag.split('}')[-1]=='module' and el.get('name')==name: out.append(el)
    for c in el: out.extend(find_mods(c,name))
    return out
# map base -> 型号 from manifest to find which picks are in od2
manifest={}
with open(os.path.join(ROOT,'精选合集5_清单.csv'),encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        if r['模块']=='pedal_soft': manifest[r['文件名'][:-4]]=r
# scan ALL pedal_soft xmls, report active block
DRIVE=('guitar_1st_overdrive','guitar_distortion','guitar_2nd_overdrive')
xmls=sorted(glob.glob(os.path.join(ROOT,'pedal_soft','*_bfx1.xml')))
print("=== 全部 pedal_soft XML: 活动块分布 ===")
for x in xmls:
    base=os.path.basename(x)[:-9]
    root=ET.parse(x).getroot()
    act=[]
    for name in DRIVE:
        b=find_mods(root,name)
        if not b: continue
        bp=params(b[0])
        od=find_mods(b[0],'guitar_od'); op=params(od[0]) if od else {}
        if bp.get('bypass')=='0':
            act.append(f"{name[8:]} (drive={op.get('drive')} dc={op.get('dc_offset')} vol={op.get('volume')})")
    m=manifest.get(base,{})
    print(f"  {base:34s} [{m.get('型号','?')}] pick={m.get('pick','?')} -> {' | '.join(act) if act else '全旁通/无效'}")
