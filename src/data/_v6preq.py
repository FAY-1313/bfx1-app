# -*- coding: utf-8 -*-
"""Decode preEQ templates + check v2 CSV bass archetypes."""
import sys, io, csv, json
from collections import defaultdict
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
def dec(v):
    v=v&0xFFFFFFFF
    typ=v&0x7; freq=(v>>3)&0x1FF; gain=(v>>12)&0xFF; q=(v>>20)&0x7F; s=(v>>27)&0x1F
    gdb=-24+gain*0.2
    return f"type{typ} f{freq}Hz g{gain}({gdb:+.1f}dB) q{q} s{s}"
templates={
 (1353093873,1353155808,1353156480,1353156938):'A',
 (1353155313,1353155808,1353156480,1353156938):'B',
 (1353093873,1353155808,1353156480,1353197898):'C',
 (1353032433,1353155808,1353156480,1353197898):'D',
}
print("=== 转换器 preEQ 4 套模板 (uint32 解码) ===")
for pre,name in templates.items():
    print(f"  [{name}]")
    for v in pre: print(f"      {v} -> {dec(v)}")
print()
print("=== v2 CSV 目录分组 ===")
cats=defaultdict(int)
with open('D:/NAMmodel/精选合集5/PreEQ_电路特征表_v2.csv',encoding='utf-8-sig') as f:
    for r in csv.DictReader(f): cats[r['目录']]+=1
for k,v in sorted(cats.items()): print(f"  {k}: {v} 行")
print()
print("=== v2 CSV bass 原型 (目录=bass_pedal_soft) ===")
archs=defaultdict(set)
with open('D:/NAMmodel/精选合集5/PreEQ_电路特征表_v2.csv',encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        if r['目录']=='bass_pedal_soft': archs[r['原型']].add(r['参考方案'])
for a,vs in sorted(archs.items()): print(f"  {a}: 方案 {sorted(vs)}")
