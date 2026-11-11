# -*- coding: utf-8 -*-
"""箱体模块: 捕获 regs108-142 vs app CABINET_PEQ 全量比对 (v8 箱体).
验证: ① 每捕获 PEQ 35 段与捕获一致 (Marshall 4x12 缺失尾段=中性兜底); ② pedalData cabinet 捕获 key 全在 CABINET_PEQ."""
import json, io, sys, os, glob, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = 'D:/NAMmodel/knob/箱体'
BASE = "C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/"

# app CABINET_PEQ
src = open(BASE + "cabinetPeqData.ts", encoding='utf-8').read()
blk = src[src.index("export const CABINET_PEQ"):]
app = {}
for mm in re.finditer(r'"([^"]+/[^"]+)":\s*\[', blk):
    key = mm.group(1); j = mm.end()-1; depth=1; k=j+1
    while depth>0 and k<len(blk):
        if blk[k]=='[': depth+=1
        elif blk[k]==']': depth-=1
        k+=1
    app[key] = [int(x,16) for x in re.findall(r'0x([0-9A-Fa-f]+)', blk[j:k])]

# 捕获 PEQ
def cap_peq(d, base):
    j = json.load(open(os.path.join(d, base + '_cab_bfx1.json'), encoding='utf-8'))
    return [int(j[str(a)]) if str(a) in j else None for a in range(108, 143)]

n_match = n_diff = n_noapp = 0
len_bad = 0
for key, vals in app.items():
    if len(vals) != 35:
        print(f"  {key}: 段数 {len(vals)} != 35")
        len_bad += 1

for br in sorted(os.listdir(ROOT)):
    bd = os.path.join(ROOT, br)
    if not os.path.isdir(bd): continue
    for root, dirs, files in os.walk(bd):
        for f in sorted(files):
            if not f.endswith('_cab_bfx1.json'): continue
            base = f.replace('_cab_bfx1.json', '')
            bn = base[:-2] if base.endswith('_2') else base
            key = f"B&F NAM {bn}/{base}"
            if key not in app:
                print(f"  {base:28s} NO-APP key={key}")
                n_noapp += 1
                continue
            cap = cap_peq(root, base)
            ap = app[key]
            diffs = [i for i in range(35) if cap[i] is not None and cap[i] != ap[i]]
            if not diffs:
                print(f"  {base:28s} MATCH")
                n_match += 1
            else:
                n_diff += 1
                print(f"  {base:28s} DIFF[{len(diffs)}]: " + ", ".join(f"band{i+1}=0x{cap[i]:08X}/0x{ap[i]:08X}" for i in diffs[:3]))
print(f"\nMATCH={n_match} DIFF={n_diff} NO-APP={n_noapp} 段数异常={len_bad} CABINET_PEQ={len(app)}")