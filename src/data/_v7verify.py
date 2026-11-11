# -*- coding: utf-8 -*-
"""验证 parameterMap.ts / presetData.ts 中的 v7 失真块与生成器输出一致."""
import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, '.')
from _v7dist_apply import gen_blocks, BASE

blocks, KEYS, data = gen_blocks()
pm = BASE + "parameterMap.ts"
ps = BASE + "presetData.ts"

def compare_found(path, block, key_prefix):
    lines = open(path, encoding='utf-8').read().split('\n')
    blk = block.rstrip('\n').split('\n')
    m = next((i for i, ln in enumerate(lines) if ln.startswith(key_prefix)), None)
    if m is None:
        print(f"MISS {key_prefix[:60]}... 未找到首行!")
        return False
    got = lines[m:m+len(blk)]
    if got == blk:
        print(f"OK   {key_prefix[:44]}... 完全一致 ({len(blk)} 行)")
        return True
    print(f"DIFF {key_prefix[:44]}... 不一致!")
    for a, b in zip(got, blk):
        if a != b:
            print(f"  file : {a!r}")
            print(f"  fresh: {b!r}")
            break
    return False

ok1 = compare_found(pm, blocks['formulas'], '"B&F NAM Boss DS-1/Boss DS-1_2": {')
ok2 = compare_found(pm, blocks['preeq'], '"B&F NAM Boss DS-1/Boss DS-1_2": { regs: [59, 60, 61, 62]')
ok3 = compare_found(ps, blocks['preset'], '"B&F NAM Boss DS-1/Boss DS-1_2": {')
print("ALL OK" if (ok1 and ok2 and ok3) else "HAS DIFF")
