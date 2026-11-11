# -*- coding: utf-8 -*-
"""v8 箱体: 按 _v8cab_data.json 生成两块替换并拼接
pedalData.ts (cabinet subModels) / cabinetPeqData.ts (CABINET_PEQ).
仅提供函数, 不在 import 时写入 (由 __main__ 触发)."""
import json, io, sys

BASE = "C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/"

def hv(v): return f"0x{v:08X}"

def load():
    d = json.load(open(BASE + "_v8cab_data.json", encoding="utf-8"))
    return d['data'], d['models']

def sort_caps(caps):
    # 基础位置 (不带 _2) 排前, 便于默认取主麦克风位置
    return sorted(caps, key=lambda c: c['pos'].endswith('_2'))

def pedal_block(models):
    def one(m):
        caps = ", ".join('{ pos: "%s", label: "%s" }' % (c['pos'], c['pos']) for c in sort_caps(m['captures']))
        return ('      { id: "%s", group: "箱体", name: "%s", display: "%s", '
                'knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "%s", disabled: false, captures: [\n'
                '        %s,\n'
                '      ] },\n') % (m['id'], m['name'], m['name'], m['name'].replace('B&F NAM ', ''), caps)
    out = "    guitar: [\n"
    out += "".join(one(m) for m in models if not m['bass'])
    out += "    ],\n    bass: [\n"
    out += "".join(one(m) for m in models if m['bass'])
    out += "    ],\n"
    return out

def peq_block(data):
    out = ""
    for k, v in data.items():
        vals = ", ".join(hv(x) for x in v['peq'])
        # 每行 6 个十六进制值, 与现有 CABINET_PEQ 格式一致
        lines = []
        arr = vals.split(', ')
        for i in range(0, len(arr), 6):
            lines.append("  " + ", ".join(arr[i:i+6]) + ("," if i + 6 < len(arr) else ""))
        out += f'"{k}": [\n' + "\n".join(lines) + ",\n],\n"
    return out

def splice_cabinet(models):
    """pedalData.ts: cabinet 模块 subModels 整段替换 (guitar/bass 结构定位)."""
    path = BASE + "pedalData.ts"
    lines = open(path, encoding='utf-8').read().split('\n')
    cstart = next(i for i, l in enumerate(lines) if 'const cabinet: ModuleConfig = {' in l)
    gidx = next(i for i in range(cstart, len(lines)) if lines[i].strip() == 'guitar: [')
    bidx = next(i for i in range(gidx + 1, len(lines)) if lines[i].strip() == 'bass: [')
    cidx = next(i for i in range(bidx + 1, len(lines)) if lines[i].strip() == '],')
    nb = pedal_block(models).rstrip('\n').split('\n')
    out = lines[:gidx] + nb + lines[cidx + 1:]
    open(path, 'w', encoding='utf-8').write('\n'.join(out))
    print(f"pedalData.ts cabinet: subModels 行 {gidx+1}-{cidx+1} -> 新增 {len(nb)} 行")

def splice_peq(data):
    """cabinetPeqData.ts: CABINET_PEQ 整段替换."""
    path = BASE + "cabinetPeqData.ts"
    lines = open(path, encoding='utf-8').read().split('\n')
    start = next(i for i, l in enumerate(lines) if 'export const CABINET_PEQ:' in l)
    depth = 0
    for i in range(start, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if depth <= 0:
            close = i
            break
    nb = peq_block(data).rstrip('\n').split('\n')
    out = lines[:start + 1] + nb + ['};'] + lines[close + 1:]
    open(path, 'w', encoding='utf-8').write('\n'.join(out))
    print(f"cabinetPeqData.ts CABINET_PEQ: 替换行 {start+2}-{close+1} -> 新增 {len(nb)} 行")

if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    data, models = load()
    splice_cabinet(models)
    splice_peq(data)
    print(f"\n共 {len(data)} 捕获 / {len(models)} 型号已写入两份数据.")
