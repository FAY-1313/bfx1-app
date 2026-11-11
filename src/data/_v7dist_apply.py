# -*- coding: utf-8 -*-
"""v7 失真: 按 _v7dist_data.json 生成四份替换块并拼接到 pedalData.ts / parameterMap.ts / presetData.ts.
按节区域锚定拼接 (旧 key 前缀与新型号名有重叠: Boss HM-2/MT-2, 必须限定在对应 const 节内).
本模块仅提供块生成与拼接函数, 不在 import 时执行任何写入 (由 __main__ 触发)."""
import json, re, sys, io

BASE = "C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/"

def hv(v): return f"0x{v:08X}"
def fmt_kn(v): return ("%.3f" % v).rstrip('0').rstrip('.') or '0'

OD_BASE = {42: 0x00000001, 43: 0x00000001, 44: 0x510785DC, 45: 0x51082708, 46: 0x510789C5,
           47: 0x510782A0, 48: 0x00000001, 49: 0x00000038, 50: 0x00000032, 51: 0x000000F6,
           52: 0x00000001, 53: 0x580AF3B1, 54: 0x5105B6A8, 55: 0x1004F70A, 56: 0x50036978}

TYPE_TS = {'PEAK': 'PEQ_TYPE.PEAK', 'LOW_SHELF': 'PEQ_TYPE.LOW_SHELF', 'HIGH_SHELF': 'PEQ_TYPE.HIGH_SHELF'}

def load_data():
    data = json.load(open(BASE + "_v7dist_data.json", encoding="utf-8"))
    KEYS = list(data.keys())
    return data, [k for k in KEYS if not data[k]['bass']], [k for k in KEYS if data[k]['bass']]

def pedal_block(data, GUIT, BASS):
    out = "    guitar: [\n"
    for k in GUIT:
        d = data[k]
        out += (f"      {{ id: \"{d['id']}\", group: \"失真\", name: \"{d['model']}\", display: \"{d['model']}\", "
                f"knobs: [{', '.join('\"%s\"' % x for x in d['knobs'])}], color: \"#40241a\", accentColor: \"#e87040\", disabled: false, captures: [\n"
                f"        {{ pos: \"{d['pos']}\", label: \"{d['pos']}\" }},\n"
                f"      ] }},\n")
    out += "    ],\n    bass: [\n"
    for k in BASS:
        d = data[k]
        out += (f"      {{ id: \"{d['id']}\", group: \"失真\", name: \"{d['model']}\", display: \"{d['model']}\", "
                f"knobs: [{', '.join('\"%s\"' % x for x in d['knobs'])}], color: \"#40241a\", accentColor: \"#e87040\", disabled: false, captures: [\n"
                f"        {{ pos: \"{d['pos']}\", label: \"{d['pos']}\" }},\n"
                f"      ] }},\n")
    out += "    ],\n"
    return out

def preeq_block(data, KEYS):
    return "".join(f"\"{k}\": {{ regs: [59, 60, 61, 62], bypass: 58, values: [{', '.join(hv(v) for v in data[k]['pre'])}] }},\n" for k in KEYS)

def formulas_block(data, KEYS):
    out = ""
    for k in KEYS:
        d = data[k]
        out += f"\"{k}\": {{\n"
        for kn in d['knobs']:
            fm = d['formulas'][kn]
            if fm['kind'] == 'drive':
                out += f"  {kn}: [{{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }}],\n"
            elif fm['kind'] == 'level':
                out += f"  {kn}: [{{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }}],\n"
            else:
                out += (f"  {kn}: [{{ regAddr: {fm['reg']}, min: 0, max: 0xFFFFFFFF, "
                        f"compute: (n) => buildPEQData({TYPE_TS[fm['type']]}, freqToIndex({fm['freq']}), "
                        f"Math.max(0, Math.min(180, {fm['gi']} + Math.round((n - 0.5) * 120))), {fm['q']}, 10) }}],\n")
        out += "},\n"
    return out

def preset_block(data, KEYS):
    out = ""
    for k in KEYS:
        d = data[k]
        regs = dict(OD_BASE)
        regs.update({57: 0x00000000, 58: 0x00000000})
        for i, v in enumerate(d['pre']):
            regs[59 + i] = v
        regs.update({63: 0x00000000, 64: d['drive'], 65: d['dc'], 66: d['vol'], 67: 0x00000000})
        for i, v in enumerate(d['post']):
            regs[68 + i] = v
        kv = ", ".join(f"'{kn}': {fmt_kn(d['kn_vals'][kn])}" for kn in d['knobs'])
        allr = ", ".join(f"{a}:{hv(regs[a])}" for a in range(42, 72))
        hidr = ", ".join(f"{a}:{hv(regs[a])}" for a in range(43, 72))
        out += (f"\"{k}\": {{\n"
                f"  knobs: {{ {kv} }},\n"
                f"  hidden: {{ {hidr} }},\n"
                f"  allRegs: {{ {allr} }},\n"
                f"}},\n")
    return out

def gen_blocks():
    data, GUIT, BASS = load_data()
    KEYS = GUIT + BASS
    return {'pedal': pedal_block(data, GUIT, BASS),
            'formulas': formulas_block(data, KEYS),
            'preeq': preeq_block(data, KEYS),
            'preset': preset_block(data, KEYS)}, KEYS, data

# ---- 旧失真 key 判定: 分组前缀 + 排除新 v7 key (Boss HM-2/MT-2 前缀重叠) ----
OLD_RE = re.compile(r'^"B&F NAM (?:Bass Distortion|Boss HM-2|DS-1 Mid|MT-2 Scoop)/')

def old_key(line, new_keys):
    if not OLD_RE.match(line):
        return False
    key = line.split(':', 1)[0].strip('" ')
    return key not in new_keys

def entry_end(lines, start):
    """从旧 key 行开始, 返回该条目深度归零的行号 (单行/多行均适用)."""
    depth = 0
    j = start
    while j < len(lines):
        depth += lines[j].count('{') - lines[j].count('}')
        if depth <= 0:
            return j
        j += 1
    return j

def splice_after_marker(path, marker, new_block, label, new_keys):
    lines = open(path, encoding='utf-8').read().split('\n')
    sidx = next(i for i, ln in enumerate(lines) if marker in ln)
    starts = [i for i in range(sidx + 1, len(lines)) if old_key(lines[i], new_keys)]
    assert starts, f"{label}: 未在 {marker} 节后找到旧失真 key"
    i = starts[0]
    j = i
    while True:
        e = entry_end(lines, j)
        nxt = e + 1
        if nxt < len(lines) and old_key(lines[nxt], new_keys):
            j = nxt
            continue
        j = e
        break
    out = lines[:i] + new_block.rstrip('\n').split('\n') + lines[j + 1:]
    open(path, 'w', encoding='utf-8').write('\n'.join(out))
    print(f"{label}: 替换行 {i+1}-{j+1} -> 新增 {len(new_block.splitlines())} 行 (旧 {j-i+1} 行)")

if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    blocks, KEYS, data = gen_blocks()
    # pedalData.ts: 失真 subModels 用结构定位 (guitar:[ ... bass:[ ... ]), 覆盖 v4 旧模型
    pd = BASE + "pedalData.ts"
    plines = open(pd, encoding='utf-8').read().split('\n')
    pstart = next(i for i, ln in enumerate(plines) if ln.startswith('const dist: ModuleConfig = {'))
    gidx = next(i for i in range(pstart, len(plines)) if plines[i].strip() == 'guitar: [')
    bidx = next(i for i in range(gidx + 1, len(plines)) if plines[i].strip() == 'bass: [')
    cidx = next(i for i in range(bidx + 1, len(plines)) if plines[i].strip() == '],')
    new = blocks['pedal'].rstrip('\n').split('\n')
    out = plines[:gidx] + new + plines[cidx + 1:]
    open(pd, 'w', encoding='utf-8').write('\n'.join(out))
    print(f"pedalData.ts: 失真 subModels 行 {gidx+1}-{cidx+1} -> 新增 {len(new)} 行")

    splice_after_marker(BASE + "parameterMap.ts", "const SUB_MODEL_FORMULAS:", blocks['formulas'], "parameterMap.ts SUB_MODEL_FORMULAS", KEYS)
    splice_after_marker(BASE + "parameterMap.ts", "const SUB_MODEL_PRE_EQ:", blocks['preeq'], "parameterMap.ts SUB_MODEL_PRE_EQ", KEYS)
    splice_after_marker(BASE + "presetData.ts", "export const OVERDRIVE_DEFAULTS:", blocks['preset'], "presetData.ts OVERDRIVE_DEFAULTS", KEYS)
    print(f"\n共 {len(data)} 个失真捕获已写入四份数据.")
