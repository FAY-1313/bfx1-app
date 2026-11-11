# -*- coding: utf-8 -*-
"""v8 箱头: 按 _v8amp_data.json 生成五份替换块并拼接到
pedalData.ts (ampHead subModels) / parameterMap.ts (SUB_MODEL_FORMULAS + SUB_MODEL_PRE_EQ) /
presetData.ts (AMP_HEAD_HIDDEN + AMP_HEAD_KNOB_DEFAULTS).
仅提供函数, 不在 import 时写入 (由 __main__ 触发)."""
import json, re, io, sys

BASE = "C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/"

def hv(v): return f"0x{v:08X}"
def fmt_kn(v): return ("%.4f" % v).rstrip('0').rstrip('.') or '0'

TYPE_TS = {'PEAK': 'PEQ_TYPE.PEAK', 'LOW_SHELF': 'PEQ_TYPE.LOW_SHELF', 'HIGH_SHELF': 'PEQ_TYPE.HIGH_SHELF'}

def load():
    d = json.load(open(BASE + "_v8amp_data.json", encoding="utf-8"))
    return d['data'], d['models']

def sort_caps(caps):
    # 基础位置 (不带 _2) 排前, 便于 getDefaultSubModelName 取主位置
    return sorted(caps, key=lambda c: c['pos'].endswith('_2'))

def pedal_block(models):
    def one(m):
        caps = ", ".join('{ pos: "%s", label: "%s" }' % (c['pos'], c['label']) for c in sort_caps(m['captures']))
        kn = ", ".join('"%s"' % x for x in m['knobs'])
        return ('      { id: "%s", group: "箱头", name: "%s", display: "%s", '
                'knobs: [%s], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [\n'
                '        %s,\n'
                '      ] },\n') % (m['id'], m['name'], m['name'], kn, caps)
    out = "    guitar: [\n"
    out += "".join(one(m) for m in models if not m['bass'])
    out += "    ],\n    bass: [\n"
    out += "".join(one(m) for m in models if m['bass'])
    out += "    ],\n"
    return out

def formulas_block(data):
    out = ""
    for k, v in data.items():
        out += f"\"{k}\": {{\n"
        for kn in v['knobs']:
            fm = v['formulas'][kn]
            if fm['kind'] == 'gain':
                out += f"  {kn}: [{{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }}],\n"
            elif fm['kind'] == 'volume':
                out += f"  {kn}: [{{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }}],\n"
            elif fm['kind'] == 'master':
                out += f"  {kn}: [{{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }}],\n"
            else:
                out += (f"  {kn}: [{{ regAddr: {fm['reg']}, min: 0, max: 0xFFFFFFFF, "
                        f"compute: (n) => buildPEQData({TYPE_TS[fm['type']]}, freqToIndex({fm['freq']}), "
                        f"Math.max(0, Math.min(180, {fm['gi']} + Math.round((n - 0.5) * 120))), {fm['q']}, 10) }}],\n")
        out += "},\n"
    return out

def preeq_block(data):
    return "".join(f"\"{k}\": {{ regs: [74, 75, 76, 77], bypass: 73, values: [{', '.join(hv(v) for v in v['pre'])}] }},\n"
                   for k, v in data.items())

def hidden_block(data):
    out = ""
    for k, v in data.items():
        regs = ", ".join(f"{a}:{hv(v['hidden'][str(a)])}" for a in range(72, 99))
        out += f"\"{k}\": {{\n  {regs},\n}},\n"
    return out

def knobdef_block(data):
    out = ""
    for k, v in data.items():
        kv = ", ".join(f"{kn}: {fmt_kn(v['kn_vals'][kn])}" for kn in v['knobs'])
        out += f"\"{k}\": {{ {kv} }},\n"
    return out

def entry_key(line):
    m = re.match(r'^\s*"([^"]+)":', line)
    return m.group(1) if m else None

def object_close(lines, start):
    """从 start 行起返回对象深度归零的行号."""
    depth = 0
    for i in range(start, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if depth <= 0:
            return i
    raise SystemExit("object_close: 未找到对象结束")

def splice_amp_into_pm(data):
    """parameterMap.ts: FORMULAS amp 段 (末段, 至 'Analog Delay' 前) 与 PRE_EQ amp 段 (regs[74-77], 至对象末) 替换."""
    path = BASE + "parameterMap.ts"
    lines = open(path, encoding='utf-8').read().split('\n')

    # ---- 1) SUB_MODEL_FORMULAS: 定位 amp 段 (旧 amp key 起始 到 'Analog Delay' 前) ----
    def pm_regions():
        fstart = next(i for i, l in enumerate(lines) if 'const SUB_MODEL_FORMULAS:' in l)
        pstart = next(i for i, l in enumerate(lines) if 'const SUB_MODEL_PRE_EQ:' in l)
        # 旧 amp key 集合: PRE_EQ 中 regs [74,75,76,77] 的 key
        amp_keys = set()
        for i in range(pstart, len(lines)):
            if 'regs: [74, 75, 76, 77]' in lines[i]:
                k = entry_key(lines[i])
                if k: amp_keys.add(k)
        # FORMULAS 中首个旧 amp key
        f_amp = next(i for i in range(fstart, len(lines))
                     if (k := entry_key(lines[i])) in amp_keys)
        delay = next(i for i in range(f_amp, len(lines)) if entry_key(lines[i]) == 'Analog Delay')
        # PRE_EQ 首个旧 amp key 与对象末
        p_amp = next(i for i in range(pstart, len(lines)) if 'regs: [74, 75, 76, 77]' in lines[i])
        p_close = object_close(lines, pstart)
        return f_amp, delay, p_amp, p_close

    f_amp, delay, p_amp, p_close = pm_regions()
    newf = formulas_block(data).rstrip('\n')
    newp = preeq_block(data).rstrip('\n')
    out = lines[:f_amp] + newf.split('\n') + lines[delay:]
    open(path, 'w', encoding='utf-8').write('\n'.join(out))
    print(f"parameterMap.ts FORMULAS: 替换行 {f_amp+1}-{delay} -> 新增 {len(newf.splitlines())} 行 (旧 {delay-f_amp} 行)")

    # 行号已变, 重新读取 (避免偏移)
    lines = open(path, encoding='utf-8').read().split('\n')
    pstart = next(i for i, l in enumerate(lines) if 'const SUB_MODEL_PRE_EQ:' in l)
    p_amp = next(i for i in range(pstart, len(lines)) if 'regs: [74, 75, 76, 77]' in lines[i])
    p_close = object_close(lines, pstart)
    out = lines[:p_amp] + newp.split('\n') + lines[p_close:]
    open(path, 'w', encoding='utf-8').write('\n'.join(out))
    print(f"parameterMap.ts PRE_EQ: 替换行 {p_amp+1}-{p_close} -> 新增 {len(newp.splitlines())} 行 (旧 {p_close-p_amp} 行)")

def splice_preset(data):
    """presetData.ts: AMP_HEAD_HIDDEN 与 AMP_HEAD_KNOB_DEFAULTS 整段替换."""
    path = BASE + "presetData.ts"
    lines = open(path, encoding='utf-8').read().split('\n')
    for marker, block, label in [
        ('export const AMP_HEAD_HIDDEN:', hidden_block(data), 'AMP_HEAD_HIDDEN'),
        ('export const AMP_HEAD_KNOB_DEFAULTS:', knobdef_block(data), 'AMP_HEAD_KNOB_DEFAULTS'),
    ]:
        start = next(i for i, l in enumerate(lines) if marker in l)
        close = object_close(lines, start)
        nb = block.rstrip('\n').split('\n')
        lines = lines[:start + 1] + nb + lines[close:]
        print(f"presetData.ts {label}: 替换行 {start+2}-{close+1} -> 新增 {len(nb)} 行")
    open(path, 'w', encoding='utf-8').write('\n'.join(lines))

def splice_pedal(models):
    """pedalData.ts: ampHead subModels 整段替换 (guitar/bass 结构定位)."""
    path = BASE + "pedalData.ts"
    lines = open(path, encoding='utf-8').read().split('\n')
    astart = next(i for i, l in enumerate(lines) if 'const ampHead: ModuleConfig = {' in l)
    gidx = next(i for i in range(astart, len(lines)) if lines[i].strip() == 'guitar: [')
    bidx = next(i for i in range(gidx + 1, len(lines)) if lines[i].strip() == 'bass: [')
    cidx = next(i for i in range(bidx + 1, len(lines)) if lines[i].strip() == '],')
    nb = pedal_block(models).rstrip('\n').split('\n')
    out = lines[:gidx] + nb + lines[cidx + 1:]
    open(path, 'w', encoding='utf-8').write('\n'.join(out))
    print(f"pedalData.ts ampHead: subModels 行 {gidx+1}-{cidx+1} -> 新增 {len(nb)} 行")

if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    data, models = load()
    splice_pedal(models)
    splice_amp_into_pm(data)
    splice_preset(data)
    print(f"\n共 {len(data)} 捕获 / {len(models)} 型号已写入五份数据.")
