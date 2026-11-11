# -*- coding: utf-8 -*-
"""转储 knob/硬单块 全部失真捕获: _bfx1.json 寄存器 + _knobs.json + 解码."""
import os, sys, io, glob, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = 'D:/NAMmodel/knob/硬单块'

# freq table from _peq_ref.py
src = open(r"C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03\src\data\_peq_ref.py", encoding='utf-8').read()
m = re.search(r'PEQ_FREQ_TABLE = \[(.*?)\]', src, re.S)
TBL = [float(x) for x in re.findall(r'[\d.]+', m.group(1))]

def decode(v):
    typ = v & 0x7; fi = (v >> 3) & 0x1ff; gi = (v >> 12) & 0xff
    qi = (v >> 20) & 0x7f; si = (v >> 27) & 0x1f
    f = TBL[fi] if fi < len(TBL) else fi
    db = -24 + gi * 0.2
    t = {0:'PEAK', 1:'LOW_SHELF', 2:'HIGH_SHELF'}.get(typ, typ)
    return f"{t} {f:>6}Hz {db:>+5.1f}dB q{qi} s{si}"

def hv(v): return f"0x{v:08X}" if isinstance(v, int) else f"{v}"

for cat in ['Boss/pedal_hard', 'MXR/pedal_hard', 'Other/pedal_hard', 'Other/bass_pedal_hard']:
    d = os.path.join(ROOT, cat)
    jsons = sorted(glob.glob(os.path.join(d, '*_bfx1.json')))
    if not jsons: continue
    label = '吉他失真' if 'bass' not in cat else '贝斯失真'
    print(f"\n{'='*100}\n{label} [{cat}] {len(jsons)} 捕获\n{'='*100}")
    for j in jsons:
        base = os.path.basename(j).replace('_pedal_hard_bfx1.json', '')
        d1 = json.load(open(j, encoding='utf-8'))
        kn = os.path.join(d, base + '_pedal_hard_knobs.json')
        knobs = json.load(open(kn, encoding='utf-8')) if os.path.exists(kn) else None
        r = {a: d1.get(str(a)) for a in range(42, 72)}
        pre = [r[59], r[60], r[61], r[62]]
        post = [r[68], r[69], r[70], r[71]]
        print(f"\n  [ {base} ]")
        print(f"    58={hv(r[58])}  59={hv(pre[0])}  60={hv(pre[1])}  61={hv(pre[2])}  62={hv(pre[3])}   63={hv(r[63])}")
        print(f"    59-62: " + " | ".join(decode(v) for v in pre))
        print(f"    64={hv(r[64])} drive  65={hv(r[65])} dc  66={hv(r[66])} vol  67={hv(r[67])}")
        print(f"    68-71: " + " | ".join(hv(v) for v in post))
        if knobs:
            for k in knobs.get('knobs', []):
                print(f"    knob[{k.get('name')}] stage={k.get('stage')} target={k.get('target_freq')} matched={k.get('matched_freq')} seg={k.get('seg_index')}")
        # 42-71 all present?
        missing = [a for a in range(42,72) if a not in d1]
        if missing: print(f"    !! 缺寄存器: {missing}")
