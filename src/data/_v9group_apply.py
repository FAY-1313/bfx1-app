# -*- coding: utf-8 -*-
"""Part D: 3+3+3 音色大类分组 (吉他数组重排 + 改 group, 贝斯数组不动)
运行: python _v9group_apply.py   (仅 __main__ 下执行)
"""
import io, sys, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__)) + os.sep
PD_PATH = BASE + "pedalData.ts"

# 每模块: 分组显示名 -> 匹配关键词 (组顺序即最终展示顺序; 关键词先长后短)
GROUPS = {
    'overdrive': [
        ("LIGHT 轻过载/透明", ["Boss BD-2", "JHS Morning Glory", "Klon Centaur", "Wampler Tumnus"]),
        ("MID 中频峰/TS式", ["Ibanez TS808", "Ibanez TS9", "Boss SD-1", "Horizon Precision Drive"]),
        ("HEAVY 重过载", ["Fulltone OCD", "ProCo RAT", "Boss OD-3"]),
    ],
    'dist': [
        ("CLASSIC 经典", ["Boss DS-1", "Boss DS-2", "Boss OS-2", "MXR Distortion+"]),
        ("METAL 金属", ["Boss HM-2", "Boss MT-2"]),
        ("FUZZ 法兹", ["EHX Big Muff"]),
    ],
    'amp-head': [
        ("CLEAN 清音", ["Fender", "Dumble ODS", "Roland JC120", "Hiwatt"]),
        ("CRUNCH 过载", ["Marshall", "Friedman BE", "Vox AC", "Orange Rockerverb", "Xotic BB Preamp"]),
        ("HIGH GAIN 高增益", ["Mesa", "EVH 5150III", "ENGL", "Diezel", "Bogner", "Soldano SLO", "Peavey", "PRS Archon"]),
    ],
}
# module_id -> const 名
CONST_NAME = {'overdrive': 'overdrive', 'dist': 'dist', 'amp-head': 'ampHead'}


def parse_array_entries(text):
    """text = `[` 与 `]` 之间内容. 返回 [(start,end,entry_text)] (顶层 {} 平衡)."""
    out = []
    i, n = 0, len(text)
    while i < n:
        while i < n and (text[i].isspace() or text[i] == ','):
            i += 1
        if i >= n:
            break
        if text[i] == '{':
            start = i
            depth = 0
            while i < n:
                if text[i] == '{':
                    depth += 1
                elif text[i] == '}':
                    depth -= 1
                    if depth == 0:
                        i += 1
                        break
                i += 1
            out.append((start, i, text[start:i]))
        else:
            i += 1
    return out


def find_guitar_array(src, const_name):
    mstart = src.index('const %s: ModuleConfig = {' % const_name)
    sm = src.index('subModels: {', mstart)
    g = src.index('guitar: [', sm)
    i = g + len('guitar: [')
    depth = 1
    while depth > 0:
        if src[i] == '[':
            depth += 1
        elif src[i] == ']':
            depth -= 1
        i += 1
    return g, i  # src[g:i] = `guitar: [ ... ]`


def process_module(src, module_id, const_name):
    g_start, g_end = find_guitar_array(src, const_name)
    content = src[g_start + len('guitar: ['):g_end - 1]
    entries = parse_array_entries(content)
    order = {label: idx for idx, (label, _) in enumerate(GROUPS[module_id])}

    mapped = []
    for (_s, _e, txt) in entries:
        pm = re.search(r'pos:\s*"([^"]+)"', txt)
        pos = re.sub(r'_2$', '', pm.group(1)) if pm else ''
        grp = None
        for (label, kws) in GROUPS[module_id]:
            for kw in kws:
                if pos.startswith(kw):
                    grp = label
                    break
            if grp:
                break
        if grp is None:
            raise SystemExit("FAIL: 未匹配分组 %s pos=%r" % (module_id, pos))
        txt2 = re.sub(r'group:\s*"[^"]*"', 'group: "%s"' % grp, txt, count=1)
        mapped.append((grp, txt2))

    mapped.sort(key=lambda x: order[x[0]])
    indent = '      '
    new_body = ',\n'.join(indent + t for (_g, t) in mapped)
    # 注意: 结尾逗号由 src[g_end:] 保留 (原 `],` 的 `,`), 这里只写到 `]`
    new_array = 'guitar: [' + '\n' + new_body + '\n    ]'
    return src[:g_start] + new_array + src[g_end:], len(mapped)


if __name__ == '__main__':
    src = open(PD_PATH, encoding='utf-8').read()
    total = 0
    for mid, cname in CONST_NAME.items():
        src, cnt = process_module(src, mid, cname)
        total += cnt
        print("%-9s %d 条 -> %s" % (mid, cnt, [l for l, _ in GROUPS[mid]]))
    open(PD_PATH, 'w', encoding='utf-8').write(src)
    print("重排完成, 共 %d 条吉他条目; 贝斯数组未改动" % total)
