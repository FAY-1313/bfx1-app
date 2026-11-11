# -*- coding: utf-8 -*-
"""失真模块: 捕获 reg42-71 vs app OVERDRIVE_DEFAULTS allRegs 全量比对 (v7 失真)."""
import json, io, sys, os, glob, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = 'D:/NAMmodel/knob/硬单块'
T = None
src = open(r"C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03\src\data\_peq_ref.py", encoding='utf-8').read()
m = re.search(r'PEQ_FREQ_TABLE = \[(.*?)\]', src, re.S)
TBL = [float(x) for x in re.findall(r'[\d.]+', m.group(1))]
def dec(v):
    typ = v & 0x7; fi = (v >> 3) & 0x1ff; gi = (v >> 12) & 0xff
    f = TBL[fi] if fi < len(TBL) else fi
    return f"{['P','L','H'][typ]}{f:.0f}/{-24+gi*0.2:+.1f}"

# app allRegs
src = open(r"C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03\src\data\presetData.ts", encoding='utf-8').read()
blk = src[src.index("export const OVERDRIVE_DEFAULTS"):src.index("export const AMP_HEAD_KNOB_DEFAULTS")]
app = {}
for mm in re.finditer(r'"([^"]+/[^"]+)":\s*\{', blk):
    key = mm.group(1); j = mm.end()-1; depth=1; k=j+1
    while depth>0 and k<len(blk):
        if blk[k]=='{': depth+=1
        elif blk[k]=='}': depth-=1
        k+=1
    body = blk[j:k]
    am = re.search(r'allRegs:\s*\{(.*?)\}', body, re.S)
    if am:
        app[key] = {int(x[0]): int(x[1],16) for x in re.findall(r'(\d+):0x([0-9A-Fa-f]+)', am.group(1))}

def cap_regs(d, base):
    j = json.load(open(os.path.join(d, base + '_pedal_hard_bfx1.json'), encoding='utf-8'))
    return {int(a): j[str(a)] for a in range(42,72) if str(a) in j}

# 捕获→app key 映射 (与 _v7dist_gen.py MODELS 同构: B&F NAM <model>/<pos>)
MODELS = [
    ("B&F NAM Boss DS-1","Boss DS-1"), ("B&F NAM Boss DS-2","Boss DS-2"),
    ("B&F NAM Boss HM-2","Boss HM-2"), ("B&F NAM Boss MT-2","Boss MT-2"),
    ("B&F NAM Boss OS-2","Boss OS-2"), ("B&F NAM EHX Big Muff","EHX Big Muff"),
    ("B&F NAM MXR Distortion+","MXR Distortion+"), ("B&F NAM Behringer Brassmaster","Behringer Brassmaster"),
    ("B&F NAM Darkglass X7","Darkglass X7"), ("B&F NAM EHX Bass Big Muff","EHX Bass Big Muff"),
    ("B&F NAM Way Huge Pork & Pickle","Way Huge Pork & Pickle"), ("B&F NAM ZVEX Mastotron","ZVEX Mastotron"),
]

n_match = n_diff = n_noapp = 0
for cat in ['Boss/pedal_hard', 'MXR/pedal_hard', 'Other/pedal_hard', 'Other/bass_pedal_hard']:
    d = os.path.join(ROOT, cat)
    if not os.path.isdir(d): continue
    label = '贝斯失真' if 'bass' in cat else '吉他失真'
    print(f"\n=== {label} [{cat}] ===")
    for jpath in sorted(glob.glob(os.path.join(d, '*_bfx1.json'))):
        base = os.path.basename(jpath).replace('_pedal_hard_bfx1.json', '')
        base0 = base[:-2] if base.endswith('_2') else base
        model = next((nm for nm, pos in MODELS if pos == base0), None)
        key = f"{model}/{base}" if model else None
        if not key or key not in app:
            print(f"  {base:28s} NO-APP key={key}")
            n_noapp += 1
            continue
        cap = cap_regs(d, base)
        ap = app[key]
        diffs = [a for a in range(42,72) if cap.get(a) is not None and ap.get(a) is not None and cap[a] != ap[a]]
        if not diffs:
            print(f"  {base:28s} MATCH")
            n_match += 1
        else:
            n_diff += 1
            desc = []
            for a in diffs:
                if 44 <= a <= 47:
                    desc.append(f"r{a}={dec(cap[a])}(cap)/{dec(ap[a])}(app)")
                else:
                    desc.append(f"r{a}=0x{cap[a]:08X}/0x{ap[a]:08X}")
            print(f"  {base:28s} DIFF[{len(diffs)}]: {', '.join(desc)}")
print(f"\nMATCH={n_match} DIFF={n_diff} NO-APP={n_noapp}")
