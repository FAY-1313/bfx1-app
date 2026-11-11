# -*- coding: utf-8 -*-
"""全量校验修复后的 parameterMap.ts / presetData.ts:
PRE_EQ 的 OD(44-47)+amp(74-77) 与 bundle 一致; dist(59-62) 与生成器一致.
检查文件无旧 v4 失真 key 残留."""
import io, sys, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
BASE = "C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/"
bundle = json.load(open(BASE + "_preq_from_bundle.json", encoding='utf-8'))
v7 = json.load(open(BASE + "_v7dist_data.json", encoding='utf-8'))
data, GUIT, BASS = (lambda d: (d, [k for k in d if not d[k]['bass']], [k for k in d if d[k]['bass']]))(v7)

def hv(v): return f"0x{v:08X}"
def parse_preeq(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    pe = next(i for i, ln in enumerate(lines) if 'const SUB_MODEL_PRE_EQ:' in ln)
    out = {}
    for ln in lines[pe+1:]:
        m = re.match(r'^"([^"]+)": \{ regs: \[([0-9, ]+)\], bypass: (\d+), values: \[([^\]]+)\] \},$', ln.strip())
        if m:
            key, regs, byp, vals = m.groups()
            out[key] = {'regs': [int(x) for x in regs.split(',')], 'bypass': int(byp),
                        'values': [int(x.strip(), 16) for x in vals.split(',')]}
    return out

cur = parse_preeq(BASE + "parameterMap.ts")
print(f"PRE_EQ 总条目: {len(cur)}")

# 1) OD 与 bundle 比对
od_bundle = {k: v['values'] for k, v in bundle.items() if v['regs'] == [44, 45, 46, 47]}
od_cur = {k: v['values'] for k, v in cur.items() if v['regs'] == [44, 45, 46, 47]}
miss = [k for k in od_bundle if k not in od_cur]
diff = [k for k in od_cur if k in od_bundle and od_cur[k] != od_bundle[k]]
extra = [k for k in od_cur if k not in od_bundle]
print(f"OD(44-47): bundle={len(od_bundle)} cur={len(od_cur)} 缺失={len(miss)} 不一致={len(diff)} 多余={len(extra)}")
for k in (miss+diff+extra)[:10]: print("   ", k)

# 2) amp 与 bundle 比对
amp_bundle = {k: v['values'] for k, v in bundle.items() if v['regs'] == [74, 75, 76, 77]}
amp_cur = {k: v['values'] for k, v in cur.items() if v['regs'] == [74, 75, 76, 77]}
miss = [k for k in amp_bundle if k not in amp_cur]
diff = [k for k in amp_cur if k in amp_bundle and amp_cur[k] != amp_bundle[k]]
extra = [k for k in amp_cur if k not in amp_bundle]
print(f"amp(74-77): bundle={len(amp_bundle)} cur={len(amp_cur)} 缺失={len(miss)} 不一致={len(diff)} 多余={len(extra)}")

# 3) dist 与生成器比对
dist_cur = {k: v['values'] for k, v in cur.items() if v['regs'] == [59, 60, 61, 62]}
dkeys = GUIT + BASS
dist_gen = {k: v7[k]['pre'] for k in dkeys}
miss = [k for k in dist_gen if k not in dist_cur]
diff = [k for k in dist_cur if k in dist_gen and dist_cur[k] != dist_gen[k]]
extra = [k for k in dist_cur if k not in dist_gen]
print(f"dist(59-62): gen={len(dist_gen)} cur={len(dist_cur)} 缺失={len(miss)} 不一致={len(diff)} 多余={len(extra)}")
for k in (miss+diff+extra)[:10]: print("   ", k)

# 4) 旧 v4 失真 key 残留检查
OLD_RE = re.compile(r'^"B&F NAM (?:Bass Distortion|Boss HM-2|DS-1 Mid|MT-2 Scoop)/')
for path, name in [(BASE+'parameterMap.ts','parameterMap'), (BASE+'presetData.ts','presetData')]:
    src = open(path, encoding='utf-8').read()
    old = [ln for ln in src.split('\n') if OLD_RE.match(ln.strip())]
    print(f"{name}: 旧 v4 失真 key 残留 {len(old)}")
    for ln in old[:5]: print("   ", ln.strip()[:80])

print("DONE")
