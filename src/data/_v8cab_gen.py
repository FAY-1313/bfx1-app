# -*- coding: utf-8 -*-
"""v8 箱体生成器: 扫描 箱体/_cab_bfx1.json (regs108-142 = 35 段 CAB PEQ),
按型号分组 (同名 _2 作为第二麦克风位置), 生成 _v8cab_data.json 供 _v8cab_apply.py 拼接.
本模块无 import 副作用, 写入由 __main__ 触发."""
import os, sys, io, glob, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = 'D:/NAMmodel/knob/箱体'
BASE = "C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/"

# ── PEQ 频率表 (与 parameterMap.ts PEQ_FREQ_TABLE 一致) ──
pm = open(BASE + "parameterMap.ts", encoding='utf-8').read()
_m = re.search(r'PEQ_FREQ_TABLE: number\[\] = \[(.*?)\];', pm, re.S)
TBL = [float(x) for x in re.findall(r'\d+\.?\d*', _m.group(1))]

def freq_to_index(hz):
    return min(range(len(TBL)), key=lambda i: abs(TBL[i] - hz))

def enc(typ, fi, gi, qi, si):
    return (typ | (fi << 3) | (gi << 12) | (qi << 20) | (si << 27)) & 0xFFFFFFFF

# 未捕获尾段: 0dB 平坦 PEAK@1kHz (gi=120 -> 0.0dB, 不染色)
NEUTRAL = enc(0, freq_to_index(1000), 120, 16, 10)

def scan_captures():
    caps = []
    for br in sorted(os.listdir(ROOT)):
        bd = os.path.join(ROOT, br)
        if not os.path.isdir(bd):
            continue
        for root, dirs, files in os.walk(bd):
            for f in sorted(files):
                if not f.endswith('_cab_bfx1.json'):
                    continue
                d = root.replace('\\', '/')
                isbass = 'bass_cab' in d.replace('\\', '/')
                base = f.replace('_cab_bfx1.json', '')
                caps.append({'base': base, 'dir': d, 'bass': isbass})
    return caps

def base_name(base):
    return base[:-2] if base.endswith('_2') else base

def load_peq(d, base):
    j = json.load(open(os.path.join(d, base + '_cab_bfx1.json'), encoding='utf-8'))
    return [int(j[str(a)]) if str(a) in j else NEUTRAL for a in range(108, 143)]

def build():
    data = {}
    models = []
    seen = {}
    print("=" * 112)
    for c in scan_captures():
        base, d, isbass = c['base'], c['dir'], c['bass']
        bn = base_name(base)
        key = f"B&F NAM {bn}/{base}"
        jd = json.load(open(os.path.join(d, base + '_cab_bfx1.json'), encoding='utf-8'))
        peq = [int(jd[str(a)]) if str(a) in jd else NEUTRAL for a in range(108, 143)]
        filled = sum(1 for a in range(108, 143) if str(a) not in jd)
        data[key] = {'model': f"B&F NAM {bn}", 'pos': base, 'bass': isbass, 'peq': peq}

        if bn not in seen:
            slug = re.sub(r'[^a-z0-9]+', '-', bn.lower()).strip('-')
            seen[bn] = f"v8-cab-{slug}"
            models.append({'id': seen[bn], 'name': f"B&F NAM {bn}", 'knobs': [],
                           'bass': isbass, 'captures': []})
        m = next(x for x in models if x['name'] == f"B&F NAM {bn}")
        m['captures'].append({'pos': base, 'label': base})
        print(f"[{'贝斯' if isbass else '吉他'}] {key}  35段{' (含'+str(filled)+' 中性兜底)' if filled else ''}")

    json.dump({'data': data, 'models': models},
              open(BASE + "_v8cab_data.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    n_g = sum(1 for m in models if not m['bass'])
    n_b = sum(1 for m in models if m['bass'])
    n_c = sum(len(m['captures']) for m in models)
    print(f"\n{n_c} 捕获 -> {len(models)} 型号 (吉他 {n_g} + 贝斯 {n_b}) -> _v8cab_data.json")

if __name__ == '__main__':
    build()
