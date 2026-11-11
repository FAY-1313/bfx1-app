# -*- coding: utf-8 -*-
"""v7 失真模块生成器: 读取 20 个 pedal_hard 捕获 + knobs.json, 计算 preEQ/postEQ/drive/dc/vol/公式/旋钮默认.
输出 _v7dist_data.json (全量数据) 供 _v7dist_apply.py 拼接四份文件."""
import os, sys, io, glob, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = 'D:/NAMmodel/knob/硬单块'
BASE = "C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/"

src = open(BASE + "_peq_ref.py", encoding='utf-8').read()
m = re.search(r'PEQ_FREQ_TABLE = \[(.*?)\]', src, re.S)
TBL = [float(x) for x in re.findall(r'[\d.]+', m.group(1))]

def freq_to_index(hz):
    return min(range(len(TBL)), key=lambda i: abs(TBL[i] - hz))

def enc(typ, fi, gi, qi, si):
    return (typ | (fi << 3) | (gi << 12) | (qi << 20) | (si << 27)) & 0xFFFFFFFF

def hv(v): return f"0x{v:08X}"

def dec(v):
    return {'typ': v & 0x7, 'fi': (v >> 3) & 0x1ff, 'gi': (v >> 12) & 0xff,
            'qi': (v >> 20) & 0x7f, 'si': (v >> 27) & 0x1f}

TYPE_NAME = {0: 'PEAK', 1: 'LOW_SHELF', 2: 'HIGH_SHELF'}

# ---- 贝斯失真 preEQ (设计表, 不用捕获兜底值) ----
def LS(gi): return enc(1, freq_to_index(30), gi, 16, 10)          # 段1 低切 LS30
def PK(fi, gi): return enc(0, fi, gi, 10, 10)                      # 段2/3 PEAK
def HS(gi): return enc(2, freq_to_index(5000), gi, 16, 10)         # 段4 高架 HS5000
F400 = freq_to_index(400); F500 = freq_to_index(500); F2000 = freq_to_index(2000)
BASS_PRE = {
    'X7':            [LS(115), PK(F500, 125), PK(F2000, 125), HS(115)],   # -1, +1, +1, -1
    'Bass Big Muff': [LS(110), PK(F400, 120), PK(F2000, 120), HS(110)],   # -2, 0, 0, -2
    'Brassmaster':   [LS(115), PK(F400, 120), PK(F2000, 120), HS(115)],   # -1, 0, 0, -1
    'Pork & Pickle': [LS(115), PK(F400, 120), PK(F2000, 120), HS(115)],
    'Mastotron':     [LS(115), PK(F400, 120), PK(F2000, 120), HS(115)],
}
# 断言与已知值一致 (步1 验证过的编码)
assert BASS_PRE['X7'] == [0x510730B1, 0x50A7D540, 0x50A7D780, 0x51073902], [hv(x) for x in BASS_PRE['X7']]
assert BASS_PRE['Bass Big Muff'] == [0x5106E0B1, 0x50A784E0, 0x50A78780, 0x5106E902], [hv(x) for x in BASS_PRE['Bass Big Muff']]
assert BASS_PRE['Brassmaster'] == [0x510730B1, 0x50A784E0, 0x50A78780, 0x51073902]

# ---- 模型目录: (id, name, knobs, bass) ----
MODELS = [
    ("v7-dist-boss-ds-1",  "B&F NAM Boss DS-1",            ["DISTORTION", "TONE", "LEVEL"],          False),
    ("v7-dist-boss-ds-2",  "B&F NAM Boss DS-2",            ["DISTORTION", "TONE", "LEVEL"],          False),
    ("v7-dist-boss-hm-2",  "B&F NAM Boss HM-2",            ["DISTORTION", "HIGH", "LOW", "LEVEL"],   False),
    ("v7-dist-boss-mt-2",  "B&F NAM Boss MT-2",            ["DISTORTION", "LOW", "HIGH", "MID", "LEVEL"], False),
    ("v7-dist-boss-os-2",  "B&F NAM Boss OS-2",            ["DISTORTION", "TONE", "LEVEL"],          False),
    ("v7-dist-ehx-big-muff",   "B&F NAM EHX Big Muff",     ["DISTORTION", "SCOOP", "LEVEL"],         False),
    ("v7-dist-mxr-distortion-plus", "B&F NAM MXR Distortion+", ["DISTORTION", "VOLUME"],             False),
    ("v7-dist-behringer-brassmaster", "B&F NAM Behringer Brassmaster", ["DISTORTION", "TONE", "LEVEL"], True),
    ("v7-dist-darkglass-x7", "B&F NAM Darkglass X7",       ["DISTORTION", "TONE", "LEVEL"],          True),
    ("v7-dist-ehx-bass-big-muff", "B&F NAM EHX Bass Big Muff", ["DISTORTION", "SCOOP", "LEVEL"],     True),
    ("v7-dist-way-huge-pork-pickle", "B&F NAM Way Huge Pork & Pickle", ["DISTORTION", "TONE", "LEVEL"], True),
    ("v7-dist-zvex-mastotron", "B&F NAM ZVEX Mastotron",    ["DISTORTION", "TONE", "LEVEL"],          True),
]

def scan_captures():
    caps = []
    for cat in ['Boss/pedal_hard', 'MXR/pedal_hard', 'Other/pedal_hard', 'Other/bass_pedal_hard']:
        d = os.path.join(ROOT, cat)
        for j in sorted(glob.glob(os.path.join(d, '*_bfx1.json'))):
            base = os.path.basename(j).replace('_pedal_hard_bfx1.json', '')
            bass = 'bass' in cat
            caps.append((base, j, bass))
    return caps

def knobs_map(base, d):
    kp = os.path.join(d, base + '_pedal_hard_knobs.json')
    if not os.path.exists(kp):
        return []
    try:
        return json.load(open(kp, encoding='utf-8')).get('knobs', [])
    except Exception:
        return []

def model_for(base):
    base0 = base[:-2] if base.endswith('_2') else base
    for mid, name, knobs, bass in MODELS:
        if name == 'B&F NAM ' + base0:
            return mid, name, knobs, bass
    raise SystemExit(f"未在 MODELS 中找到模型: {base0!r}")

def cap_regs(d, base):
    d1 = json.load(open(os.path.join(d, base + '_pedal_hard_bfx1.json'), encoding='utf-8'))
    return {int(a): d1.get(str(a)) for a in range(42, 72) if str(a) in d1}

def main():
    data = {}
    print("=" * 110)
    for base, jpath, isbass in scan_captures():
        d = os.path.dirname(jpath)
        mid, name, knobs, bass = model_for(base)
        r = cap_regs(d, base)
        kbs = knobs_map(base, d)
        key = f"{name}/{base}"

        # preEQ 59-62 (吉他=捕获; 贝斯=设计表, 按短名子串匹配)
        if bass:
            bk = next(k for k in BASS_PRE if k.lower() in base.lower())
            pre = BASS_PRE[bk]
        else:
            pre = [r[59], r[60], r[61], r[62]]
        post = [r[68], r[69], r[70], r[71]]
        drive, dc, vol = r[64], r[65], r[66]

        # 公式与旋钮默认
        peq_by_name = {k['name'].upper(): k for k in kbs}
        formulas = {}   # knob -> {reg, type, freq, gi, qi}
        kn_vals = {}    # knob -> normalized default
        for kn in knobs:
            u = kn.upper()
            if u in ('DISTORTION', 'DRIVE', 'GAIN', 'SUSTAIN', 'FUZZ', 'ATTACK'):
                formulas[kn] = {'kind': 'drive', 'reg': 64}
                kn_vals[kn] = drive / 92.0
            elif u in ('LEVEL', 'VOLUME', 'OUTPUT'):
                formulas[kn] = {'kind': 'level', 'reg': 66}
                kn_vals[kn] = vol / 288.0
            elif u in peq_by_name:
                pk = peq_by_name[u]
                reg = 59 + pk['seg_index'] if pk['stage'] == 'pre' else 68 + pk['seg_index']
                dreg = dec(r[reg])
                formulas[kn] = {'kind': 'peq', 'reg': reg, 'type': TYPE_NAME[dreg['typ']],
                                'freq': pk['matched_freq'], 'gi': dreg['gi'], 'q': dreg['qi']}
                kn_vals[kn] = 0.5
            else:
                raise SystemExit(f"{key}: 旋钮 {kn} 在 knobs.json 中无对应 PEQ 项且非 drive/level")

        data[key] = {'id': mid, 'model': name, 'pos': base, 'bass': bass, 'pre': pre, 'post': post,
                     'drive': drive, 'dc': dc, 'vol': vol, 'knobs': knobs,
                     'formulas': formulas, 'kn_vals': kn_vals}

        dec_pre = " | ".join(f"{TYPE_NAME[dec(v)['typ']]}@{TBL[dec(v)['fi']]:.0f}Hz {dec(v)['gi']*0.2-24:+.1f}dB" for v in pre)
        print(f"[{base}] {'贝斯' if bass else '吉他'}  key={key}")
        print(f"  pre : {dec_pre}")
        print(f"  d{drive} dc{dc} v{vol}  post={' '.join(hv(x) for x in post)}")
        for kn, fm in formulas.items():
            if fm['kind'] == 'peq':
                print(f"  {kn}: reg{fm['reg']} {fm['type']}@{fm['freq']}Hz gi{fm['gi']} q{fm['q']} dflt={kn_vals[kn]}")
            else:
                print(f"  {kn}: reg{fm['reg']} dflt={kn_vals[kn]:.3f}")
    json.dump(data, open(BASE + "_v7dist_data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n{len(data)} 捕获 -> _v7dist_data.json")

if __name__ == '__main__':
    main()
