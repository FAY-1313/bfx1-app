# -*- coding: utf-8 -*-
import csv, sys, io, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

path = r'D:/NAMmodel/精选合集V4/PreEQ_电路特征表.csv'
with open(path, encoding='utf-8-sig') as f:
    rows = list(csv.reader(f))
header = rows[0]
data = rows[1:]

print("total data rows:", len(data))

# Distribution by 目录
dirs = collections.Counter(r[0] for r in data)
print("\n=== 目录分布 ===")
for k, v in dirs.items():
    print(f"  {k}: {v}")

# Distribution by 原型 within each 目录
proto_by_dir = collections.defaultdict(collections.Counter)
for r in data:
    proto_by_dir[r[0]][r[1]] += 1
print("\n=== 原型分布 ===")
for d in sorted(proto_by_dir):
    print(f"\n[{d}]")
    for p, c in proto_by_dir[d].most_common():
        print(f"  {p}: {c}")

# Unique (电路特点, 4xPEQ) patterns -> archetype grouping
print("\n=== 每原型唯一 PEQ 组合数 ===")
for d in sorted(proto_by_dir):
    print(f"\n[{d}]")
    for p, c in proto_by_dir[d].most_common():
        combos = set()
        for r in data:
            if r[0] == d and r[1] == p:
                combos.add(tuple(r[4:]))
        print(f"  {p}: {c} rows, {len(combos)} unique PEQ combos")

# Show a sample row per prototype
print("\n=== 每个原型首行 ===")
seen = set()
for r in data:
    key = (r[0], r[1])
    if key in seen: continue
    seen.add(key)
    print(f"\n[{r[0]}] {r[1]} | {r[3]}")
    print(f"  PEQ1: {r[4]} {r[5]}Hz {r[6]}dB Q={r[7]} S={r[8]} -> {r[9]}")
    print(f"  PEQ2: {r[10]} {r[11]}Hz {r[12]}dB Q={r[13]} S={r[14]} -> {r[15]}")
    print(f"  PEQ3: {r[16]} {r[17]}Hz {r[18]}dB Q={r[19]} S={r[20]} -> {r[21]}")
    print(f"  PEQ4: {r[22]} {r[23]}Hz {r[24]}dB Q={r[25]} S={r[26]} -> {r[27]}")
