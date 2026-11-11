# -*- coding: utf-8 -*-
"""Marker-based splice of parameterMap.ts (formulas + SUB_MODEL_PRE_EQ) and
pedalData.ts (SubModel.disabled + 4 subModels blocks) from _gen/ output."""
import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def read_lines(p):
    return open(p, encoding='utf-8').read().split('\n')

def write_lines(p, lines):
    open(p, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))

def strip_trailing_blank(lines):
    while lines and lines[-1].strip() == '':
        lines.pop()
    return lines

# ════════════════════════ 1. parameterMap.ts ════════════════════════
pm = read_lines('parameterMap.ts')

# (a) Replace B&F NAM block: from comment "─── B&F NAM 精选合集" to last B&F entry "}," just before "延迟两级"
start = next(i for i, l in enumerate(pm) if 'B&F NAM 精选合集' in l)
end   = next(i for i, l in enumerate(pm) if i > start and '延迟两级' in l)
assert pm[end].strip().startswith('//'), f'L{end+1} should be the 延迟两级 comment: {pm[end]!r}'
# entries are start+1 .. end-1 (L842 comment kept out: entries begin right after)
assert pm[start+1].startswith('"B&F NAM'), f'first entry unexpected: {pm[start+1]!r}'
assert pm[end-1].strip() == '},', f'last entry unexpected: {pm[end-1]!r}'

gen_form = strip_trailing_blank(read_lines('_gen/formulas.ts'))
new_pm = pm[:start] + gen_form + pm[end:]
# fix the section comment: keep a fresh one
new_pm.insert(start, '  // ─── B&F NAM V4 精选合集 (OD+DIST+箱头+箱体) 两级公式 ────────────────')
# sanity: formulas.ts covers the same key count as before? just verify balance later
write_lines('parameterMap.ts', new_pm)
print(f'[parameterMap] B&F block replaced: L{start+1}-{end} -> {len(gen_form)} lines, total {len(new_pm)}')

# (b) Append SUB_MODEL_PRE_EQ export
pm = read_lines('parameterMap.ts')  # re-read after edit
exp_idx = next(i for i, l in enumerate(pm) if l.strip() == 'export { SUB_MODEL_FORMULAS };')
gen_preeq = strip_trailing_blank(read_lines('_gen/preeq.ts'))
pre_eq_export = [
    '',
    '/** PRE EQ 电路特征寄存器 — ANALOG 全局开关开启时写入 (regs=PEQ频段, bypass=PRE EQ旁通, values=编码值) */',
    'export const SUB_MODEL_PRE_EQ: Record<string, { regs: number[]; bypass: number; values: number[] }> = {',
] + gen_preeq + [
    '};',
    '',
    'export { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ };',
]
pm = pm[:exp_idx] + pre_eq_export + pm[exp_idx+1:]
write_lines('parameterMap.ts', pm)
print(f'[parameterMap] SUB_MODEL_PRE_EQ added ({len(gen_preeq)} entries), total {len(pm)}')

# ════════════════════════ 2. pedalData.ts ════════════════════════
pd = read_lines('pedalData.ts')

# (a) add disabled?: boolean to SubModel interface (after accentColor?: string;)
ac_idx = next(i for i, l in enumerate(pd) if l.strip() == 'accentColor?: string;')
assert 'disabled' not in pd[ac_idx+1], 'disabled already present?'
pd.insert(ac_idx + 1, '  /** 禁用选项: 灰色不可选 (贝斯过载/失真) */')
pd.insert(ac_idx + 2, '  disabled?: boolean;')

# (b) split generated submodels into 4 blocks by "    guitar: [" anchors
sm = strip_trailing_blank(read_lines('_gen/submodels.ts'))
blocks = []
cur = None
for l in sm:
    if l.startswith('    guitar: ['):
        if cur is not None:
            blocks.append(cur)
        cur = [l]
    else:
        cur.append(l)
if cur is not None:
    blocks.append(cur)
assert len(blocks) == 4, f'expected 4 blocks, got {len(blocks)}'

targets = ['overdrive', 'dist', 'ampHead', 'cabinet']
for mod, block in zip(targets, blocks):
    decl = next(i for i, l in enumerate(pd) if l.strip() == f'const {mod}: ModuleConfig = {{')
    sm_open = next(i for i, l in enumerate(pd) if i > decl and l.strip() == 'subModels: {')
    # find the 2-space "  }," closing the subModels block
    sm_close = next(i for i, l in enumerate(pd) if i > sm_open and l.strip() == '},' and not l.startswith('   '))
    # preserve indentation conventions: block already 4-space indented
    pd = pd[:sm_open+1] + block + ['  },'] + pd[sm_close+1:]
    print(f'[pedalData] {mod} subModels block: L{sm_open+2}-{sm_close} -> {len(block)} lines, total {len(pd)}')

write_lines('pedalData.ts', pd)
print('DONE all')
