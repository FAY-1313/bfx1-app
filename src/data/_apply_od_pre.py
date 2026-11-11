# -*- coding: utf-8 -*-
"""按 _od_newpre.json 将过载 preEQ(reg44-47) 替换到 parameterMap.ts SUB_MODEL_PRE_EQ 与 presetData.ts OVERDRIVE_DEFAULTS."""
import json, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = "C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/"
newvals = json.load(open(BASE + "_od_newpre.json", encoding="utf-8"))

# ---------- 1. parameterMap.ts SUB_MODEL_PRE_EQ ----------
pm_path = BASE + "parameterMap.ts"
lines = open(pm_path, encoding="utf-8").read().split("\n")
count_pm = 0
for i, ln in enumerate(lines):
    for key, vals in newvals.items():
        if ln.startswith('"' + key + '"'):
            newarr = "[" + ", ".join(vals) + "]"
            lines[i] = re.sub(r"values:\s*\[[^\]]*\]", "values: " + newarr, ln)
            count_pm += 1
            break
open(pm_path, "w", encoding="utf-8").write("\n".join(lines))
print(f"parameterMap.ts: 更新 {count_pm} 行")

# ---------- 2. presetData.ts OVERDRIVE_DEFAULTS ----------
pd_path = BASE + "presetData.ts"
text = open(pd_path, encoding="utf-8").read()
blocks = re.split(r'(?=^"B&F NAM [^"]+": \{)', text, flags=re.M)
count_pd = 0
for bi in range(len(blocks)):
    blk = blocks[bi]
    key = None
    m = re.match(r'^"([^"]+)": \{', blk)
    if m:
        key = m.group(1)
    if key in newvals:
        vals = newvals[key]
        pat = re.compile(
            r"44:0x[0-9A-F]{8}, 45:0x[0-9A-F]{8}, 46:0x[0-9A-F]{8}, 47:0x[0-9A-F]{8}")
        rep = f"44:{vals[0]}, 45:{vals[1]}, 46:{vals[2]}, 47:{vals[3]}"
        blk2, n = pat.subn(rep, blk)
        blocks[bi] = blk2
        count_pd += n
open(pd_path, "w", encoding="utf-8").write("".join(blocks))
print(f"presetData.ts: 更新 {count_pd} 处(应为 29 模型 * 2 行 = 58)")
