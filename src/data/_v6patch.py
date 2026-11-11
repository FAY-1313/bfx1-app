# -*- coding: utf-8 -*-
"""V6 overdrive 补丁生成器: 由 JSON 快照 + v2 preEQ CSV + 贝斯推导 生成 4 段 TS 并拼接.
输出: pedalData.ts overdrive subModels; parameterMap.ts SUB_MODEL_FORMULAS + SUB_MODEL_PRE_EQ;
presetData.ts OVERDRIVE_DEFAULTS. 同时打印校验表.
"""
import os, sys, io, re, glob, json, csv, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = 'D:/NAMmodel/精选合集5'
HERE = os.path.dirname(os.path.abspath(__file__))

# ---------- PEQ encode ----------
src = open(os.path.join(HERE, '_peq_ref.py'), encoding='utf-8').read()
PEQ = tuple(float(x) for x in re.findall(r'[\d.]+', re.search(r'PEQ_FREQ_TABLE = \[(.*?)\]', src, re.S).group(1)))
def freq_to_index(hz):
    return min(range(len(PEQ)), key=lambda i: abs(PEQ[i] - hz))
def gain_to_index(db):
    return max(0, min(180, int(round((db + 24) / 0.2))))
def enc(typ, hz, db, q=16, s=10):
    t = {'LOW_SHELF': 1, 'PEAK': 0, 'HIGH_SHELF': 2}[typ]
    return ((t & 0x7) | ((freq_to_index(hz) & 0x1ff) << 3) | ((gain_to_index(db) & 0xff) << 12)
            | ((q & 0x7f) << 20) | ((s & 0x1f) << 27)) & 0xFFFFFFFF

# ---------- v2 CSV archetype 标准 hexes ----------
ARCH_HEX = {}
for r in csv.DictReader(open(os.path.join(ROOT, 'PreEQ_电路特征表_v2.csv'), encoding='utf-8-sig')):
    if r['参考方案'] == '标准':
        ARCH_HEX.setdefault(r['原型'], [int(r['PEQ%d_Hex' % i], 16) for i in (1, 2, 3, 4)])
# O-PRECISION 不在 v2 CSV, 按设计频点编码
ARCH_HEX['O-PRECISION'] = [enc('LOW_SHELF', 250, -2), enc('PEAK', 1000, 3), enc('PEAK', 3000, 1), enc('HIGH_SHELF', 6990, -2)]

# ---------- 模型元数据 ----------
def g(name, knobs, arch, caps, invert=None):
    return dict(cat='pedal_soft', name=name, knobs=knobs, caps=caps, preeq=ARCH_HEX[arch], invert=set(invert or []))
def b(name, knobs, bands, caps):
    return dict(cat='bass_pedal_soft', name=name, knobs=knobs, caps=caps,
                preeq=[enc(t, hz, db) for t, hz, db in bands])

GUITAR = [
    g('Boss BD-2',              ['GAIN', 'TONE', 'LEVEL'], 'O-SD', ['Boss BD-2', 'Boss BD-2_2']),
    g('Boss OD-3',              ['GAIN', 'TONE', 'LEVEL'], 'O-SD', ['Boss OD-3']),
    g('Boss SD-1',              ['DRIVE', 'TONE', 'LEVEL'], 'O-SD', ['Boss SD-1', 'Boss SD-1_2']),
    g('Fulltone OCD',           ['DRIVE', 'TONE', 'VOLUME'], 'O-TS', ['Fulltone OCD', 'Fulltone OCD_2']),
    g('Horizon Precision Drive',['DRIVE', 'TREBLE', 'VOLUME'], 'O-PRECISION', ['Horizon Precision Drive', 'Horizon Precision Drive_2']),
    g('Ibanez TS808',           ['DRIVE', 'TONE', 'LEVEL'], 'O-TS', ['Ibanez TS808', 'Ibanez TS808_2']),
    g('Ibanez TS9',             ['DRIVE', 'TONE', 'LEVEL'], 'O-TS', ['Ibanez TS9', 'Ibanez TS9_2']),
    g('JHS Morning Glory',      ['VOLUME', 'DRIVE', 'TONE'], 'O-BB', ['JHS Morning Glory', 'JHS Morning Glory_2']),
    g('Klon Centaur',           ['GAIN', 'TREBLE', 'OUTPUT'], 'O-CENTAUR', ['Klon Centaur', 'Klon Centaur_2']),
    g('ProCo RAT',              ['DISTORTION', 'FILTER', 'VOLUME'], 'O-RAT', ['ProCo RAT', 'ProCo RAT_2'], invert=['FILTER']),
    g('Wampler Tumnus',         ['GAIN', 'LEVEL', 'TREBLE'], 'O-CENTAUR', ['Wampler Tumnus']),
]
BASS = [
    b('Aguilar Tone Hammer', ['DRIVE', 'BASS', 'TREBLE', 'LEVEL'],
      [('LOW_SHELF', 100, -2), ('PEAK', 700, 1), ('PEAK', 2000, 0), ('HIGH_SHELF', 5000, -1)],
      ['Aguilar Tone Hammer', 'Aguilar Tone Hammer_2']),
    b('Darkglass B3K', ['DRIVE', 'LEVEL', 'TREBLE', 'BASS'],
      [('LOW_SHELF', 120, -3), ('PEAK', 1000, 1), ('PEAK', 2500, 2), ('HIGH_SHELF', 5000, -1)],
      ['Darkglass B3K']),
    b('EHX Bass Soul Food', ['VOLUME', 'TREBLE', 'DRIVE'],
      [('LOW_SHELF', 150, -3), ('PEAK', 500, 1), ('PEAK', 2000, 0), ('HIGH_SHELF', 5990, -2)],
      ['EHX Bass Soul Food']),
    b('MXR M80', ['DRIVE', 'LOW', 'HIGH', 'LEVEL'],
      [('LOW_SHELF', 120, -2), ('PEAK', 300, 1), ('PEAK', 2000, 0), ('HIGH_SHELF', 5000, -1)],
      ['MXR M80', 'MXR M80_2']),
    b('Origin BASSRIG', ['DRIVE', 'BASS', 'TREBLE', 'MASTER'],
      [('LOW_SHELF', 120, -1), ('PEAK', 350, -1), ('PEAK', 2800, 3), ('HIGH_SHELF', 4000, 1)],
      ['Origin BASSRIG']),
    b('Tech21 SansAmp', ['DRIVE', 'PRESENCE', 'DEEP', 'LEVEL'],
      [('LOW_SHELF', 120, 0), ('PEAK', 750, -4), ('PEAK', 2200, 4), ('HIGH_SHELF', 5000, 0)],
      ['Tech21 SansAmp', 'Tech21 SansAmp_2']),
]

DRIVE_LABELS = {'DRIVE', 'GAIN', 'DISTORTION'}
LEVEL_LABELS = {'LEVEL', 'VOLUME', 'OUTPUT', 'MASTER'}
TONE_LABELS = {'TONE', 'TREBLE', 'FILTER', 'PRESENCE', 'HIGH'}
BASS_LABELS = {'BASS', 'LOW', 'DEEP'}

DIST_NEUTRAL = {58: 1, 59: 0x510782BC, 60: 0x510AF660, 61: 0x50078785, 62: 0x510782A0,
                63: 1, 64: 0, 65: 0x32, 66: 0x120, 67: 1, 68: 0xB00AA5E1, 69: 0x510AF660,
                70: 0xC00A8942, 71: 0x51E36908}
REG6 = lambda v: '0x%08X' % (v & 0xFFFFFFFF)

def f3(x): return ('%.3f' % x).rstrip('0').rstrip('.') if '.' in ('%.3f' % x) else str(x)

def read_capture(cat, base):
    d = json.load(open(os.path.join(ROOT, cat, base + '_bfx1.json'), encoding='utf-8'))
    def g(k): return int(d[k])
    return dict(drive=g('49'), dc=g('50'), vol=g('51'),
                pre=[int(d[str(44 + i)]) for i in range(4)],
                post=[int(d[str(53 + i)]) for i in range(4)])

def band_meta(hexv):
    return dict(gi=(hexv >> 12) & 0xff, q=(hexv >> 20) & 0x7f, s=(hexv >> 27) & 0x1f)

def collect(models):
    out = []
    for m in models:
        for base in m['caps']:
            j = os.path.join(ROOT, m['cat'], base + '_bfx1.json')
            if not os.path.exists(j):
                print(f"[WARN] 缺少捕获 {j}")
                continue
            d = json.load(open(j, encoding='utf-8'))
            if '44' not in d or '55' not in d:
                continue
            c = read_capture(m['cat'], base)
            m54, m55 = band_meta(c['post'][1]), band_meta(c['post'][2])
            out.append(dict(model=m, base=base, key=f"B&F NAM {m['name']}/{base}",
                            drive=c['drive'], dc=c['dc'], vol=c['vol'],
                            post=c['post'], pre=c['pre'],
                            bass=dict(gi=m54['gi'], q=m54['q'], s=m54['s']),
                            tone=dict(gi=m55['gi'], q=m55['q'], s=m55['s'])))
    return out

ALL = collect(GUITAR) + collect(BASS)

# ---------- 校验表 ----------
print("=" * 100)
print("V6 过载补丁校验表")
print("=" * 100)
for r in ALL:
    m = r['model']
    print(f"{r['key']:58s} drive={r['drive']:3d} vol={r['vol']:3d} | "
          f"BASS reg54 gi={r['bass']['gi']:3d} q={r['bass']['q']:2d} | "
          f"TONE reg55 gi={r['tone']['gi']:3d} q={r['tone']['q']:2d} | "
          f"post53={REG6(r['post'][0])} 56={REG6(r['post'][3])}")
print()
print("=== 专属 preEQ (44-47) ===")
for m in GUITAR + BASS:
    print(f"  B&F NAM {m['name']:24s} " + ' '.join(REG6(v) for v in m['preeq']))

# ---------- 生成 TS 片段 ----------
def slug(name):
    return name.lower().replace(' ', '-')

def gen_submodels():
    def cap_items(m):
        caps = [r for r in ALL if r['model'] is m]
        return [f'{{ pos: "{r["base"]}", label: "{r["base"]}" }}' for r in caps]
    lines = []
    for m in GUITAR:
        lines.append(f'      {{ id: "v6-od-{slug(m["name"])}", group: "过载", name: "B&F NAM {m["name"]}", display: "B&F NAM {m["name"]}", knobs: {json.dumps(m["knobs"], ensure_ascii=False)}, color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [')
        lines.append('        ' + ',\n        '.join(cap_items(m)))
        lines.append('      ] },' if m is not GUITAR[-1] else '      ] },')
    lines.append('    ],')
    lines.append('    bass: [')
    for m in BASS:
        lines.append(f'      {{ id: "v6-od-{slug(m["name"])}", group: "过载", name: "B&F NAM {m["name"]}", display: "B&F NAM {m["name"]}", knobs: {json.dumps(m["knobs"], ensure_ascii=False)}, color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [')
        lines.append('        ' + ',\n        '.join(cap_items(m)))
        lines.append('      ] },' if m is not BASS[-1] else '      ] },')
    lines.append('    ],')
    return '\n'.join(lines)

def knobs_norm(r):
    m = r['model']
    k = {}
    for lbl in m['knobs']:
        if lbl in DRIVE_LABELS: k[lbl] = f3(r['drive'] / 92)
        elif lbl in LEVEL_LABELS: k[lbl] = f3(r['vol'] / 288)
        else: k[lbl] = 0.5
    return k

def compute_for(m, lbl):
    if lbl in DRIVE_LABELS:
        return 'Math.round(n * 92)', 49
    if lbl in LEVEL_LABELS:
        return 'Math.round(n * 288)', 51
    if lbl in TONE_LABELS:
        return None, 55  # handled below
    if lbl in BASS_LABELS:
        return None, 54
    raise ValueError(lbl)

def peq_expr(reg, band, r, m, lbl):
    c = band['gi']
    q = band['q']
    inv = 'Math.round((0.5 - n) * 120)' if lbl in m.get('invert', set()) else 'Math.round((n - 0.5) * 120)'
    fhz = '2080' if reg == 55 else '260'
    return (f'Math.max(0, Math.min(180, {c} + {inv}))', reg, fhz, q)

def gen_formulas():
    out = []
    for r in ALL:
        m = r['model']
        out.append(f'"B&F NAM {m["name"]}/{r["base"]}": {{')
        for lbl in m['knobs']:
            if lbl in DRIVE_LABELS or lbl in LEVEL_LABELS:
                comp, reg = compute_for(m, lbl)
                out.append(f'  {lbl}: [{{ regAddr: {reg}, min: 0, max: {92 if reg == 49 else 288}, compute: (n) => {comp} }}],')
            elif lbl in TONE_LABELS:
                comp, reg, fhz, q = peq_expr(55, r['tone'], r, m, lbl)
                out.append(f'  {lbl}: [{{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex({fhz}), {comp}, {q}, 10) }}],')
            elif lbl in BASS_LABELS:
                comp, reg, fhz, q = peq_expr(54, r['bass'], r, m, lbl)
                out.append(f'  {lbl}: [{{ regAddr: 54, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex({fhz}), {comp}, {q}, 10) }}],')
        out.append('},')
    return '\n'.join(out)

def gen_preeq():
    out = []
    for r in ALL:
        m = r['model']
        vals = ', '.join(REG6(v) for v in m['preeq'])
        out.append(f'"B&F NAM {m["name"]}/{r["base"]}": {{ regs: [44, 45, 46, 47], bypass: 43, values: [{vals}] }},')
    return '\n'.join(out)

def gen_defaults():
    out = []
    for r in ALL:
        m = r['model']
        kns = ', '.join(f"'{lbl}': {knobs_norm(r)[lbl]}" for lbl in m['knobs'])
        hidden_regs = {}
        for addr in range(43, 72):
            if addr == 57: continue
            if addr in (43, 48, 52):
                hidden_regs[addr] = 0
            elif addr in (44, 45, 46, 47):
                hidden_regs[addr] = m['preeq'][addr - 44]
            elif addr in (53, 54, 55, 56):
                hidden_regs[addr] = r['post'][addr - 53]
            elif addr == 49: hidden_regs[addr] = r['drive']
            elif addr == 50: hidden_regs[addr] = r['dc']
            elif addr == 51: hidden_regs[addr] = r['vol']
            else: hidden_regs[addr] = DIST_NEUTRAL[addr]
        all_regs = dict(hidden_regs)
        all_regs[42] = 0
        all_regs[57] = 1
        def regmap(d, skip=()):
            return ', '.join(f'{a}:0x{v:08X}' for a, v in sorted(d.items()) if a not in skip)
        hid = regmap(hidden_regs)
        al = regmap(all_regs)
        out.append(f'"B&F NAM {m["name"]}/{r["base"]}": {{')
        out.append(f'  knobs: {{ {kns} }},')
        out.append(f'  hidden: {{ {hid} }},')
        out.append(f'  allRegs: {{ {al} }},')
        out.append('},')
    return '\n'.join(out)

frag = {
    'submodels': gen_submodels(),
    'formulas': gen_formulas(),
    'preeq': gen_preeq(),
    'defaults': gen_defaults(),
}
for k, v in frag.items():
    open(os.path.join(HERE, f'_gen_v6_{k}.ts'), 'w', encoding='utf-8').write(v)
    print(f"\n[written] _gen_v6_{k}.ts ({len(v.splitlines())} lines)")

# ---------- 拼接 ----------
def splice(path, start_anchor, end_anchor, new_text, keep_start=True):
    s = open(path, encoding='utf-8').read()
    i = s.index(start_anchor)
    j = s.index(end_anchor)
    assert i < j, f'{path} anchors reversed'
    if keep_start:
        head = s[:i]
    else:
        head = s[:s.index('\n', i) + 1]
    tail = s[j:]
    new = head + new_text + '\n' + tail
    shutil.copy(path, path + '.bak')
    open(path, 'w', encoding='utf-8').write(new)

def insert_before(path, anchor, new_text):
    s = open(path, encoding='utf-8').read()
    j = s.index(anchor)
    new = s[:j] + new_text + '\n' + s[j:]
    shutil.copy(path, path + '.bak')
    open(path, 'w', encoding='utf-8').write(new)

# pedalData.ts
sub = frag['submodels']
block = ('const overdrive: ModuleConfig = {\n'
         "  id: 'overdrive', label: 'Overdrive', shortLabel: 'OD',\n"
         '  hasSubModels: true,\n'
         '  subModels: {\n'
         '    guitar: [\n' + sub + '\n'
         '  },\n'
         '};\n')
splice(os.path.join(HERE, 'pedalData.ts'),
       'const overdrive: ModuleConfig = {',
       '// ─── 5. Distortion',
       block)

# parameterMap.ts formulas (OD 公式原本不存在, 插入到 DIST 块之前)
insert_before(os.path.join(HERE, 'parameterMap.ts'),
              '"B&F NAM Bass Distortion/B7K Distortion": {',
              frag['formulas'])

# parameterMap.ts preeq
splice(os.path.join(HERE, 'parameterMap.ts'),
       '"B&F NAM BB Preamp/BB preamp": { regs: [44, 45, 46, 47]',
       '"B&F NAM Bass Distortion/B7K Distortion": { regs: [59, 60, 61, 62]',
       frag['preeq'])

# presetData.ts defaults
splice(os.path.join(HERE, 'presetData.ts'),
       '"B&F NAM BB Preamp/BB preamp": {',
       '"B&F NAM Bass Distortion/B7K Distortion": {',
       frag['defaults'])

# 注释 25→29
p = os.path.join(HERE, 'presetData.ts')
s = open(p, encoding='utf-8').read()
s = s.replace('过载预设 (25个: 20吉他 + 5贝斯)', '过载预设 (29个: 20吉他 + 9贝斯)')
open(p, 'w', encoding='utf-8').write(s)

print("\n[OK] 已拼接 4 处. 备份 *.bak")
