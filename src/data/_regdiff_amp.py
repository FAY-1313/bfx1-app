# -*- coding: utf-8 -*-
"""箱头模块: 捕获 reg72-98 vs app AMP_HEAD_HIDDEN 全量比对 (v8 箱头).
吉他 preEQ=捕获; 贝斯 preEQ=新贝斯设计表 (有意 DIFF); 未捕获尾段=0dB 中性兜底 (跳过)."""
import json, io, sys, os, glob, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = 'D:/NAMmodel/knob/箱头'

# PEQ 解码参考 (频率表来自 _peq_ref.py)
src = open(r"C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03\src\data\_peq_ref.py", encoding='utf-8').read()
m = re.search(r'PEQ_FREQ_TABLE = \[(.*?)\]', src, re.S)
TBL = [float(x) for x in re.findall(r'[\d.]+', m.group(1))]
def dec(v):
    typ = v & 0x7; fi = (v >> 3) & 0x1ff; gi = (v >> 12) & 0xff
    f = TBL[fi] if fi < len(TBL) else fi
    return f"{['P','L','H'][typ]}{f:.0f}/{-24+gi*0.2:+.1f}"

# app AMP_HEAD_HIDDEN
src = open(r"C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03\src\data\presetData.ts", encoding='utf-8').read()
blk = src[src.index("export const AMP_HEAD_HIDDEN"):src.index("export const AMP_HEAD_KNOB_DEFAULTS")]
app = {}
for mm in re.finditer(r'"([^"]+/[^"]+)":\s*\{', blk):
    key = mm.group(1); j = mm.end()-1; depth=1; k=j+1
    while depth>0 and k<len(blk):
        if blk[k]=='{': depth+=1
        elif blk[k]=='}': depth-=1
        k+=1
    app[key] = {int(x[0]): int(x[1],16) for x in re.findall(r'(\d+):0x([0-9A-Fa-f]+)', blk[j:k])}

# app SUB_MODEL_PRE_EQ (regs 74-77, bypass 73)
pm = open(r"C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03\src\data\parameterMap.ts", encoding='utf-8').read()
pblk = pm[pm.index("const SUB_MODEL_PRE_EQ"):]
preq = {}
for mm in re.finditer(r'"([^"]+/[^"]+)":\s*\{', pblk):
    key = mm.group(1); j = mm.end()-1; depth=1; k=j+1
    while depth>0 and k<len(pblk):
        if pblk[k]=='{': depth+=1
        elif pblk[k]=='}': depth-=1
        k+=1
    body = pblk[j:k]
    vals = re.findall(r'values:\s*\[([0-9xX,\sA-Fa-f]+)\]', body)
    if vals:
        preq[key] = [int(x,16) for x in re.findall(r'0x([0-9A-Fa-f]+)', vals[0])]

# 预期 preEQ (吉他=捕获 regs74-77, 贝斯=新设计表) 来自 _v8amp_data.json
exp = json.load(open(r"C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03\src\data\_v8amp_data.json", encoding='utf-8'))['data']

def cap_regs(d, base, suffix='_amp_bfx1'):
    j = json.load(open(os.path.join(d, base + suffix + '.json'), encoding='utf-8'))
    return {int(a): j[str(a)] for a in range(72,99) if str(a) in j}

# 递归扫描 箱头 (含 Mesa/Boogie 嵌套) + BOOST (*_boost_bfx1 同为 AMP 块)
caps = []
for root, dirs, files in os.walk(ROOT):
    dirs.sort(); files.sort()
    d = root.replace('\\', '/')
    isbass = 'bass_amp' in d
    for j in files:
        if not j.endswith('_amp_bfx1.json'): continue
        caps.append((d, j.replace('_amp_bfx1.json', ''), isbass, '_amp_bfx1'))
for root, dirs, files in os.walk('D:/NAMmodel/knob/BOOST'):
    dirs.sort(); files.sort()
    d = root.replace('\\', '/')
    for j in files:
        if not j.endswith('_boost_bfx1.json'): continue
        caps.append((d, j.replace('_boost_bfx1.json', ''), False, '_boost_bfx1'))

n_match = n_diff = n_noapp = 0
last_label = None
for d, base, isbass, suffix in caps:
    label = '贝斯箱头' if isbass else '吉他箱头'
    if last_label != label:
        print(f"\n=== {label} ===")
        last_label = label
    bn = base[:-2] if base.endswith('_2') else base
    key = f"B&F NAM {bn}/{base}"
    if key not in app or key not in preq or key not in exp:
        print(f"  {base:28s} NO-APP key={key}")
        n_noapp += 1
        continue
    cap = cap_regs(d, base, suffix)
    ap = app[key]
    ok = True
    # ① hidden 72-98: 仅比对捕获中存在 (未捕获尾段为 0dB 中性兜底)
    hd = [a for a in range(72,99) if a in cap and ap.get(a) is not None and cap[a] != ap[a]]
    # ② SUB_MODEL_PRE_EQ 74-77 vs 预期 (贝斯=设计表 -> 有意 DIFF 捕获)
    pd = [a for a in range(74,78) if preq[key][a-74] != exp[key]['pre'][a-74]]
    if hd or pd:
        n_diff += 1
        desc = [f"h{a}=0x{cap[a]:08X}/0x{ap[a]:08X}" for a in hd]
        for a in pd:
            ev = exp[key]['pre'][a-74]
            desc.append(f"pre74-77 r{a}: expect={dec(ev)} app={dec(preq[key][a-74])}")
        print(f"  {base:28s} DIFF[{len(hd)+len(pd)}]: {', '.join(desc)}")
    if ok:
        n_match += 1
        print(f"  {base:28s} MATCH")
print(f"\nMATCH={n_match} DIFF={n_diff} NO-APP={n_noapp}")