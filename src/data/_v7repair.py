# -*- coding: utf-8 -*-
"""修复被干跑损坏的 parameterMap.ts / presetData.ts:
1) FORMULAS/OVERDRIVE_DEFAULTS 删除旧 v4 失真条目 (v7 块已验证一致, 保留)
2) PRE_EQ 追回 95 条箱头 preEQ (regs 74-77, 来自过载步骤 bundle) + 收尾 };
校验: 过载 preEQ(regs 44-47) 与 bundle 一致."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, '.')
from _v7dist_apply import gen_blocks, old_key, entry_end, BASE, hv

pm = BASE + "parameterMap.ts"
ps = BASE + "presetData.ts"
blocks, KEYS, data = gen_blocks()
NEW_KEYS = set(KEYS)

# ---------- 1. FORMULAS 删旧 v4 失真 ----------
lines = open(pm, encoding='utf-8').read().split('\n')
sidx = next(i for i, ln in enumerate(lines) if 'const SUB_MODEL_FORMULAS:' in ln)
starts = [i for i in range(sidx + 1, len(lines)) if old_key(lines[i], NEW_KEYS)]
assert starts, "FORMULAS 未找到旧 v4 失真"
i = starts[0]; j = i
while True:
    e = entry_end(lines, j)
    if e + 1 < len(lines) and old_key(lines[e + 1], NEW_KEYS):
        j = e + 1
        continue
    j = e
    break
print(f"FORMULAS 删除旧 v4 失真: 行 {i+1}-{j+1} ({j-i+1} 行, {len(starts)} 条目)")
lines = lines[:i] + lines[j + 1:]

# ---------- 2. PRE_EQ 追回箱头 preEQ ----------
bundle = json.load(open(BASE + "_preq_from_bundle.json", encoding='utf-8'))
peidx = next(i for i, ln in enumerate(lines) if 'const SUB_MODEL_PRE_EQ:' in ln)
# 2a. 校验当前文件 OD 条目 (regs 44-47) 与 bundle 一致
cur_od = {}
for k, v in bundle.items():
    if v['regs'] == [44, 45, 46, 47]:
        cur_od[k] = v['values']
# 从文件中抽取现有 OD 条目做比对
import re
cur_lines = lines[peidx + 1:]
found_od = {}
for ln in cur_lines:
    m = re.match(r'^"([^"]+)": \{ regs: \[44, 45, 46, 47\], bypass: 43, values: \[([^\]]+)\] \},$', ln.strip())
    if m:
        vals = [int(x.strip(), 16) for x in m.group(2).split(',')]
        found_od[m.group(1)] = vals
mismatch = [k for k in found_od if found_od[k] != cur_od.get(k)]
print(f"OD preEQ 检查: 文件 {len(found_od)} 条 / bundle {len(cur_od)} 条, 不一致 {len(mismatch)}")
for k in mismatch[:5]:
    print(f"   {k}\n     file={[hex(x) for x in found_od[k]]}\n     bndl={[hex(x) for x in cur_od[k]]}")
assert not mismatch, "OD preEQ 与 bundle 不一致, 停止!"

# 2b. 追加 95 条箱头 preEQ + 收尾
amp_entries = [(k, v) for k, v in bundle.items() if v['regs'] == [74, 75, 76, 77]]
amp_lines = []
for k, v in amp_entries:
    vals = ", ".join(hv(x) for x in v['values'])
    amp_lines.append(f"\"{k}\": {{ regs: [74, 75, 76, 77], bypass: 73, values: [{vals}] }},")
# 插入到 v7 失真 preeq (最后一行 ZVEX) 之后
last_dist = next(i for i, ln in enumerate(lines[peidx + 1:], start=peidx + 1) if ln.startswith('"B&F NAM ZVEX Mastotron/ZVEX Mastotron":'))
ins = last_dist + 1
out = lines[:ins] + amp_lines + ['};'] + lines[ins:]
open(pm, 'w', encoding='utf-8').write('\n'.join(out))
print(f"PRE_EQ 追加箱头 preEQ: {len(amp_lines)} 条 + 收尾 '}};'")

# ---------- 3. OVERDRIVE_DEFAULTS 删旧 v4 失真 ----------
plines = open(ps, encoding='utf-8').read().split('\n')
sidx = next(i for i, ln in enumerate(plines) if 'export const OVERDRIVE_DEFAULTS:' in ln)
starts = [i for i in range(sidx + 1, len(plines)) if old_key(plines[i], NEW_KEYS)]
assert starts, "OVERDRIVE_DEFAULTS 未找到旧 v4 失真"
i = starts[0]; j = i
while True:
    e = entry_end(plines, j)
    if e + 1 < len(plines) and old_key(plines[e + 1], NEW_KEYS):
        j = e + 1
        continue
    j = e
    break
print(f"OVERDRIVE_DEFAULTS 删除旧 v4 失真: 行 {i+1}-{j+1} ({j-i+1} 行, {len(starts)} 条目)")
plines = plines[:i] + plines[j + 1:]
open(ps, 'w', encoding='utf-8').write('\n'.join(plines))

print("修复完成.")
