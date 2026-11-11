# -*- coding: utf-8 -*-
"""在 PRE_EQ 的 29 条过载 OD 条目后插入 bundle 中缺失的 20 条 OD1 类模型 (Marshall/Orange/Bass Flat/HIFI/Simplifier)."""
import io, sys, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
BASE = "C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/"
pm = BASE + "parameterMap.ts"
bundle = json.load(open(BASE + "_preq_from_bundle.json", encoding='utf-8'))

lines = open(pm, encoding='utf-8').read().split('\n')
peidx = next(i for i, ln in enumerate(lines) if 'const SUB_MODEL_PRE_EQ:' in ln)

# 当前文件已有的 key
present = set()
for ln in lines[peidx+1:]:
    m = re.match(r'^"([^"]+)": \{ regs: \[', ln.strip())
    if m:
        present.add(m.group(1))

# bundle 中 regs 44-47 且不在文件中的条目 (保持 bundle 顺序)
missing = [(k, v) for k, v in bundle.items()
           if v['regs'] == [44, 45, 46, 47] and k not in present]
print(f"缺失 OD1 条目: {len(missing)}")
for k, _ in missing:
    print("  ", k)

def hv(v): return f"0x{v:08X}"
new_lines = []
for k, v in missing:
    vals = ", ".join(hv(x) for x in v['values'])
    new_lines.append(f"\"{k}\": {{ regs: [44, 45, 46, 47], bypass: 43, values: [{vals}] }},")

# 插入到最后一个现有 OD 条目之后 (Tech21 SansAmp_2 行), 即 dist 块首行之前
last_od = next(i for i, ln in enumerate(lines[peidx+1:], start=peidx+1)
               if ln.startswith('"B&F NAM Tech21 SansAmp/Tech21 SansAmp_2": { regs: [44, 45, 46, 47]'))
ins = last_od + 1
out = lines[:ins] + new_lines + lines[ins:]
open(pm, 'w', encoding='utf-8').write('\n'.join(out))
print(f"已插入 {len(new_lines)} 条 (行 {ins+1} 前).")
