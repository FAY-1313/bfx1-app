# -*- coding: utf-8 -*-
"""PRE EQ 孤儿核对: pedalData 各模块 subModel 捕获 key ↔ SUB_MODEL_PRE_EQ key 双向比对.
- PRE_EQ 有但无任何 subModel 引用 = 遗留孤儿 (建议清除)
- subModel 捕获 key 但 PRE_EQ 缺失 = 模型选了但无 PRE EQ 写入 (重大 bug)
同时统计 PRE_EQ 各 reg 段数量."""
import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
BASE = "C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/"

pm = open(BASE + "parameterMap.ts", encoding='utf-8').read()
pd = open(BASE + "pedalData.ts", encoding='utf-8').read()

# SUB_MODEL_PRE_EQ keys
blk = pm[pm.index("const SUB_MODEL_PRE_EQ"):]
preq = {}
for mm in re.finditer(r'"([^"]+/[^"]+)":\s*\{', blk):
    key = mm.group(1); j = mm.end()-1; depth=1; k=j+1
    while depth > 0 and k < len(blk):
        if blk[k] == '{': depth += 1
        elif blk[k] == '}': depth -= 1
        k += 1
    body = blk[j:k]
    regs = re.findall(r'regs:\s*\[([0-9,\s]+)\]', body)
    preq[key] = [int(x) for x in regs[0].split(',')]

# 各模块 subModel 捕获 key (name/capture)
mods = {}
for mod in ['overdrive', 'dist', 'ampHead']:
    i = pd.find('const %s: ModuleConfig' % mod)
    j = pd.find('\nconst ', i + 10)
    seg = pd[i:j]
    keys = set()
    for m in re.finditer(r'name: "([^"]+)"[\s\S]*?captures: \[\s*([\s\S]*?)\]', seg):
        name = m.group(1)
        for cap in re.findall(r'pos: "([^"]+)"', m.group(2)):
            keys.add(f"{name}/{cap}")
    mods[mod] = keys

# 每个模块 PRE_EQ key 属于哪个 reg 段
def seg_of(key):
    r = preq[key][0]
    return {44: 'OD', 59: 'DIST', 74: 'AMP'}.get(r, f'reg{r}')

print("=" * 100)
print("一、PRE_EQ 条目归属统计")
print("=" * 100)
from collections import Counter
c = Counter(seg_of(k) for k in preq)
for s, n in sorted(c.items()):
    print(f"  reg段 {s}: {n} 条")

print("\n" + "=" * 100)
print("二、孤儿 PRE_EQ (app 数据有, 但没有任何 subModel 引用)")
print("=" * 100)
all_sub = set()
for mod, keys in mods.items():
    all_sub |= keys
orphans = sorted(k for k in preq if k not in all_sub)
print(f"  孤儿共 {len(orphans)} 条:")
for k in orphans:
    print(f"    [{seg_of(k)}] {k}")

print("\n" + "=" * 100)
print("三、subModel 捕获 key 但 PRE_EQ 缺失 (模型可选但无 PRE EQ 写入!)")
print("=" * 100)
missing = 0
for mod, keys in mods.items():
    miss = sorted(k for k in keys if k not in preq)
    if miss:
        missing += len(miss)
        print(f"  [{mod}] {len(miss)} 个缺失:")
        for k in miss:
            print(f"    {k}")
print(f"  缺失总数: {missing}")

print("\n" + "=" * 100)
print("四、subModel 总数")
print("=" * 100)
for mod, keys in mods.items():
    print(f"  {mod}: {len(keys)} 捕获 key")
