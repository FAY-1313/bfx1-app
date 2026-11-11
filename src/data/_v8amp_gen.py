# -*- coding: utf-8 -*-
"""v8 箱头模块生成器: 扫描 knob/箱头 捕获 (_amp_bfx1.json + _amp_knobs.json),
按型号分组 (同名 _2 作为第二位置), 生成:
  - preEQ reg74-77 (吉他=捕获; 贝斯=Pre_EQ电路表_贝斯.md 贝斯箱头设计表)
  - POST EQ 音调旋钮公式 (BASS/MIDDLE/TREBLE/PRESENCE[/RESONANCE/CUT] -> reg83-87)
  - GAIN/VOLUME/MASTER 公式与默认
  - hidden regs 72-98
输出 _v8amp_data.json 供 _v8amp_apply.py 拼接四份文件.
本模块无 import 副作用, 仅提供函数 (写入由 __main__ 触发)."""
import os, sys, io, glob, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = 'D:/NAMmodel/knob/箱头'
BOOST = 'D:/NAMmodel/knob/BOOST'
BASE = "C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/"

# ── PEQ 频率表 (与 parameterMap.ts PEQ_FREQ_TABLE 一致) ──
pm = open(BASE + "parameterMap.ts", encoding='utf-8').read()
_m = re.search(r'PEQ_FREQ_TABLE: number\[\] = \[(.*?)\];', pm, re.S)
TBL = [float(x) for x in re.findall(r'\d+\.?\d*', _m.group(1))]

def freq_to_index(hz):
    return min(range(len(TBL)), key=lambda i: abs(TBL[i] - hz))

def enc(typ, fi, gi, qi, si):
    return (typ | (fi << 3) | (gi << 12) | (qi << 20) | (si << 27)) & 0xFFFFFFFF

def dec(v):
    return {'typ': v & 0x7, 'fi': (v >> 3) & 0x1ff, 'gi': (v >> 12) & 0xff,
            'qi': (v >> 20) & 0x7f, 'si': (v >> 27) & 0x1f}

TYPE_NAME = {0: 'PEAK', 1: 'LOW_SHELF', 2: 'HIGH_SHELF'}
FALLBACK_TYPE = {'BASS': 1, 'MIDDLE': 0, 'TREBLE': 0, 'PRESENCE': 2,
                 'RESONANCE': 1, 'CUT': 2}   # 捕获 type 无效(非0/1/2)时的语义兜底

# ── 贝斯箱头 preEQ 设计表 (Pre_EQ电路表_贝斯.md) ──
def LS(gi): return enc(1, freq_to_index(30), gi, 16, 10)   # 段1 低切 LS30 (贝斯保留低频)
def PK(fi, gi): return enc(0, fi, gi, 10, 10)
def HS(gi): return enc(2, freq_to_index(5000), gi, 16, 10)  # 段4 高架 HS5000 (不 bright)
F400 = freq_to_index(400); F500 = freq_to_index(500); F2000 = freq_to_index(2000)
BASS_AMP_PRE = {
    'Ampeg':            [LS(115), PK(F400, 125), PK(F2000, 120), HS(120)],  # -1,+1,0,0
    'Eden':             [LS(115), PK(F400, 125), PK(F2000, 120), HS(125)],  # -1,+1,0,+1
    'GallienKrueger':   [LS(115), PK(F500, 125), PK(F2000, 120), HS(125)],  # -1,+1(P500),0,+1
    'Hartke':           [LS(115), PK(F400, 120), PK(F2000, 120), HS(125)],  # -1,0,0,+1
    'Markbass':         [LS(115), PK(F400, 125), PK(F2000, 120), HS(120)],  # -1,+1,0,0
}

def bass_brand(base):
    b = re.sub(r'[^a-z0-9]', '', base.lower())   # 去连字符/下划线等再子串匹配
    for br in BASS_AMP_PRE:
        if re.sub(r'[^a-z0-9]', '', br.lower()) in b:
            return br
    raise SystemExit(f"贝斯箱头 {base!r} 无法匹配设计表品牌 (Ampeg/Eden/GallienKrueger/Hartke/Markbass)")

def scan_captures():
    caps = []
    # 箱头: 递归扫描 (含 Mesa/Boogie 嵌套目录), bass_amp 子目录判贝斯
    for root, dirs, files in os.walk(ROOT):
        dirs.sort(); files.sort()
        d = root.replace('\\', '/')
        isbass = 'bass_amp' in d
        for j in files:
            if not j.endswith('_amp_bfx1.json'):
                continue
            base = j.replace('_amp_bfx1.json', '')
            caps.append({'base': base, 'dir': d, 'bass': isbass, 'suffix': '_amp_bfx1'})
    # BOOST: *_boost_bfx1.json 同为 AMP 块捕获 (Xotic BB Preamp)
    for root, dirs, files in os.walk(BOOST):
        dirs.sort(); files.sort()
        d = root.replace('\\', '/')
        for j in files:
            if not j.endswith('_boost_bfx1.json'):
                continue
            base = j.replace('_boost_bfx1.json', '')
            caps.append({'base': base, 'dir': d, 'bass': False, 'suffix': '_boost_bfx1'})
    return caps

def base_name(base):
    return base[:-2] if base.endswith('_2') else base

NEUTRAL_BAND = None  # 延迟计算 (需 TBL)

def load_regs(d, base, suffix):
    global NEUTRAL_BAND
    if NEUTRAL_BAND is None:
        # 未捕获的隐藏 POST EQ 尾段: 0dB 平坦 PEAK@1kHz (gi=120 -> 0.0dB, 惰性不染色)
        NEUTRAL_BAND = enc(0, freq_to_index(1000), 120, 16, 10)
    j = os.path.join(d, base + suffix + '.json')
    d1 = json.load(open(j, encoding='utf-8'))
    r = {int(a): d1[str(a)] for a in range(72, 99) if str(a) in d1}
    for a in range(72, 99):
        r.setdefault(a, NEUTRAL_BAND)
    return r

def load_knobs(d, base, suffix):
    kp = os.path.join(d, base + suffix.replace('_bfx1', '_knobs.json'))
    if not os.path.exists(kp):
        return []
    return json.load(open(kp, encoding='utf-8')).get('knobs', [])

def build():
    data = {}      # key -> per-capture data
    models = []    # (id, name, knobs, captures[(pos,label)], bass)
    seen = {}
    print("=" * 112)
    for c in scan_captures():
        base, d, isbass = c['base'], c['dir'], c['bass']
        bn = base_name(base)
        r = load_regs(d, base, c['suffix'])
        kbs = load_knobs(d, base, c['suffix'])
        key = f"B&F NAM {bn}/{base}"

        # preEQ 74-77: 吉他=捕获; 贝斯=设计表
        if isbass:
            pre = BASS_AMP_PRE[bass_brand(base)]
        else:
            pre = [r[74], r[75], r[76], r[77]]

        drive, vol = r[79], r[81]
        # 音调旋钮 (post EQ reg 83+seg_index), 公式 type/gi/q 从捕获默认寄存器解码
        formulas, kn_vals = {}, {}
        for kn in ['GAIN', 'VOLUME', 'MASTER']:
            formulas[kn] = {'kind': kn.lower()}
        kn_vals['GAIN'] = round(drive / 92.0, 4)
        kn_vals['VOLUME'] = round(vol / 288.0, 4)
        kn_vals['MASTER'] = 0.5
        tone = []
        for k in kbs:
            name = k['name']
            seg = k['seg_index']
            reg = 83 + seg
            dreg = dec(r[reg])
            typ = dreg['typ'] if dreg['typ'] in TYPE_NAME else FALLBACK_TYPE.get(name.upper())
            if typ is None:
                raise SystemExit(f"{key}: 旋钮 {name} 捕获 reg{reg} type={dreg['typ']} 无语义兜底")
            formulas[name.upper()] = {'kind': 'peq', 'reg': reg, 'type': TYPE_NAME[typ],
                                      'freq': k['matched_freq'], 'gi': dreg['gi'], 'q': dreg['qi']}
            kn_vals[name.upper()] = 0.5
            tone.append(name.upper())

        knobs = ['GAIN', 'VOLUME', 'MASTER'] + tone
        data[key] = {'model': f"B&F NAM {bn}", 'pos': base, 'bass': isbass,
                     'pre': pre, 'drive': drive, 'vol': vol,
                     'knobs': knobs, 'formulas': formulas, 'kn_vals': kn_vals,
                     'hidden': r}

        # 分组模型注册 (同一 base 多次出现 -> 追加位置)
        if bn not in seen:
            slug = re.sub(r'[^a-z0-9]+', '-', bn.lower()).strip('-')
            mid = f"v8-amp-{slug}"
            seen[bn] = mid
            models.append({'id': mid, 'name': f"B&F NAM {bn}", 'knobs': knobs,
                           'bass': isbass, 'captures': []})
        m = next(x for x in models if x['name'] == f"B&F NAM {bn}")
        assert m['knobs'] == knobs, f"{bn}: 同型号捕获旋钮不一致 {m['knobs']} vs {knobs}"
        m['captures'].append({'pos': base, 'label': base})

        dec_pre = " | ".join(f"{TYPE_NAME.get(dec(v)['typ'], dec(v)['typ'])}@{TBL[dec(v)['fi']]:.0f}Hz {dec(v)['gi']*0.2-24:+.1f}dB" for v in pre)
        print(f"[{'贝斯' if isbass else '吉他'}] {key}  d{drive} v{vol}")
        print(f"  pre : {dec_pre}")
        for kn, fm in formulas.items():
            if fm['kind'] == 'peq':
                print(f"  {kn}: reg{fm['reg']} {fm['type']}@{fm['freq']}Hz gi{fm['gi']} q{fm['q']} dflt={kn_vals[kn]}")
            else:
                print(f"  {kn}: dflt={kn_vals[kn]}")

    json.dump({'data': data, 'models': models},
              open(BASE + "_v8amp_data.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    n_g = sum(1 for m in models if not m['bass'])
    n_b = sum(1 for m in models if m['bass'])
    print(f"\n{len(data)} 捕获 -> {len(models)} 型号 (吉他 {n_g} + 贝斯 {n_b}) -> _v8amp_data.json")

if __name__ == '__main__':
    build()
