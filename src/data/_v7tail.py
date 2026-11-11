# -*- coding: utf-8 -*-
"""从 v4 备份提取参数映射文件尾部辅助函数 (applyMicDistance/getLinkedParamDefs/getParamDef/ratioToIndex/getLegacyLinkedDefs),
追加到修复后的 parameterMap.ts, 并补齐导出 (含 SUB_MODEL_PRE_EQ)."""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
B = "backup-20260812-无NAMV2版本1/src/data/parameterMap.ts"
pm = "src/data/parameterMap.ts"

blines = open(B, encoding='utf-8').read().split('\n')
# 从 'export function applyMicDistance' 行 (v4 中 1266) 到文件尾
aidx = next(i for i, ln in enumerate(blines) if ln.startswith('export function applyMicDistance'))
tail = blines[aidx:]
print("v4 tail:", len(tail), "行")

# 补导出: 在尾部函数前插入 export { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ };
tail.insert(0, 'export { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ };')
tail.insert(1, '')

cur = open(pm, encoding='utf-8').read().rstrip('\n') + '\n\n'
open(pm, 'w', encoding='utf-8').write(cur + '\n'.join(tail) + '\n')
print(f"已追加 {len(tail)} 行到 parameterMap.ts")
