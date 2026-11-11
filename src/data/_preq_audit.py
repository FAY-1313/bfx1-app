# -*- coding: utf-8 -*-
"""PRE EQ 曲线审计: 解码 app SUB_MODEL_PRE_EQ 全部条目成曲线, 与设计表 (Pre_EQ电路表.md / 贝斯) 核对.
输出: 每模块逐条 "曲线行", 供人工比对."""
import json, io, sys, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
BASE = "C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/"

# ── 频率表 (来自 parameterMap.ts) ──
pm = open(BASE + "parameterMap.ts", encoding='utf-8').read()
_m = re.search(r'PEQ_FREQ_TABLE: number\[\] = \[(.*?)\];', pm, re.S)
TBL = [float(x) for x in re.findall(r'\d+\.?\d*', _m.group(1))]

TNAME = {0: 'P', 1: 'LS', 2: 'HS', 3: 'LP', 4: 'HP', 5: 'LPF', 6: 'HP1', 7: 'LP1'}

def dec(v):
    typ = v & 0x7; fi = (v >> 3) & 0x1ff; gi = (v >> 12) & 0xff; qi = (v >> 20) & 0x7f; si = (v >> 27) & 0x1f
    f = TBL[fi] if fi < len(TBL) else fi
    return f"{TNAME.get(typ, typ)}@{f:.0f}Hz {gi*0.2-24:+.1f}dB(q{qi}/s{si})"

# ── 解析 SUB_MODEL_PRE_EQ ──
blk = pm[pm.index("const SUB_MODEL_PRE_EQ"):]
preq = {}
for mm in re.finditer(r'"([^"]+/[^"]+)":\s*\{', blk):
    key = mm.group(1); j = mm.end()-1; depth=1; k=j+1
    while depth > 0 and k < len(blk):
        if blk[k] == '{': depth += 1
        elif blk[k] == '}': depth -= 1
        k += 1
    body = blk[j:k]
    regs = [int(x) for x in re.findall(r'regs:\s*\[([0-9,\s]+)\]', body)[0].split(',')]
    vals = [int(x, 16) for x in re.findall(r'values:\s*\[([0-9xX,\sA-Fa-f]+)\]', body)[0].replace(' ', '').split(',')]
    preq[key] = (regs, vals)

print(f"SUB_MODEL_PRE_EQ 共 {len(preq)} 条\n")

# 逐条打印曲线 (按模块前缀分组)
def section(title, keys):
    print("=" * 100)
    print(title)
    print("=" * 100)
    for k in keys:
        regs, vals = preq[k]
        line = " | ".join(f"{dec(v)}" for v in vals)
        print(f"{k}")
        print(f"    {line}")

allkeys = sorted(preq)
od = [k for k in allkeys if k not in [x for x in allkeys]]
# 按捕获来源标注: 文件名含 _2 的是第二位置; 其余是主位置
guitar_od = [k for k in allkeys if any(b in k for b in ['Boss','Ibanez','Klon','MXR','Proco','Wampler','JHS','Fulltone','Tech21','Other','DOD','Behringer','EHX','ZVEX','Fuzz','Electro','Bi','Digi','Analog','Tube','Way','Rockett','Nobels','Wampler','BB Preamp','Xotic','Overdrive','Distortion'])]
# 更稳妥: 直接用模块名分组打印
print("##### 过载 (regs 44-47, 含贝斯过载) #####")
for k in allkeys:
    if preq[k][0][0] == 44:
        print(f"  {k}\n      {' | '.join(dec(v) for v in preq[k][1])}")
print("\n##### 失真 (regs 59-62) #####")
for k in allkeys:
    if preq[k][0][0] == 59:
        print(f"  {k}\n      {' | '.join(dec(v) for v in preq[k][1])}")
print("\n##### 箱头 (regs 74-77) #####")
for k in allkeys:
    if preq[k][0][0] == 74:
        print(f"  {k}\n      {' | '.join(dec(v) for v in preq[k][1])}")
