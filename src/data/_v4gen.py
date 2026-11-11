# -*- coding: utf-8 -*-
"""Master V4 generator: build subModels, defaults, formulas, preEq, cabinet PEQ.

Emits TS data files into ./_gen/ for later splicing into the app data files.
Routing rules:
  module = physical dir (pedal_soft→overdrive, pedal_hard→dist, amp→amp-head, cab→cabinet)
  EXCEPT: cab-active files (no preamp active) → cabinet (they are cab IRs)
          pedal_hard file that is od2-active → amp-head (UBERMETAL)
  archetype = 分类目录.txt (section matches module), else brand subdir fallback
  registers  = file's actual block data (active block carries the preamp curve)
"""
import xml.etree.ElementTree as ET, io, sys, glob, os, collections, json, csv, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r'D:/NAMmodel/精选合集V4'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_gen')
os.makedirs(OUT, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────
# 1. Parse 分类目录.txt → { section: { archetype: [base_filenames] } }
# ─────────────────────────────────────────────────────────────────────
def parse_classification():
    sections = collections.OrderedDict()
    cur_sec = None
    cur_arch = None
    lines = open(os.path.join(ROOT, '分类目录.txt'), encoding='utf-8-sig').read().splitlines()
    for raw in lines:
        s = raw.strip()
        if s.startswith('【') and s.endswith('】'):
            cur_sec = s[1:-1]
            sections[cur_sec] = collections.OrderedDict()
            cur_arch = None
            continue
        m = re.match(r'^(.*?)\((\d+)个\):', s)
        if m:
            cur_arch = m.group(1).strip()
            sections[cur_sec][cur_arch] = []
            continue
        if s.endswith('.nam') and cur_sec and cur_arch:
            sections[cur_sec][cur_arch].append(s[:-4])
    return sections

# ─────────────────────────────────────────────────────────────────────
# 2. XML helpers
# ─────────────────────────────────────────────────────────────────────
def find_all_modules(el, name):
    out = []
    if el.tag == 'module' and el.get('name') == name:
        out.append(el)
    for c in el:
        out.extend(find_all_modules(c, name))
    return out

def find_module(root, path):
    for first in find_all_modules(root, path[0]):
        cand = first; ok = True
        for name in path[1:]:
            nxt = None
            for c in cand:
                if c.tag == 'module' and c.get('name') == name:
                    nxt = c; break
            if nxt is None:
                ok = False; break
            cand = nxt
        if ok:
            return cand
    return None

def get_param(el, name, default=None):
    if el is None: return default
    for p in el:
        if p.tag == 'param' and p.get('name') == name:
            return p.text
    return default

def enc(type_, freq, gain, q, s):
    return ((int(type_) & 0x7) | ((int(freq) & 0x1ff) << 3) | ((int(gain) & 0xff) << 12)
            | ((int(q) & 0x7f) << 20) | ((int(s) & 0x1f) << 27)) & 0xFFFFFFFF

def get_eqs(el):
    """list of encoded uint32 from eqList (sorted by index)."""
    if el is None: return []
    for p in el:
        if p.tag == 'eqList':
            out = []
            for eq in sorted(p, key=lambda x: int(x.get('index') or 0)):
                d = {}
                for pp in eq:
                    if pp.tag == 'param':
                        d[pp.get('name')] = pp.text
                out.append(enc(d.get('type',0), d.get('freq',0), d.get('gain',0), d.get('q',0), d.get('s',0)))
            return out
    return []

def block_regs(root, bpath, bypass_addr, pre_addrs, od_bypass_addr, drive_addr, dc_addr, vol_addr,
               post_bypass_addr, post_addrs):
    """Extract full register dict for an overdrive-style block."""
    b = find_module(root, bpath)
    regs = {}
    regs[bypass_addr] = int(get_param(b, 'bypass', 0))
    pre = find_module(root, bpath + ['guitar_pre_od_peq'])
    regs[pre_addrs[0]] = int(get_param(pre, 'bypass', 0))
    eqs = get_eqs(pre)
    for i, a in enumerate(pre_addrs[1:]):
        regs[a] = eqs[i] if i < len(eqs) else 0
    od = find_module(root, bpath + ['guitar_od'])
    regs[od_bypass_addr] = int(get_param(od, 'bypass', 0))
    regs[drive_addr] = int(get_param(od, 'drive', 0))
    regs[dc_addr] = int(get_param(od, 'dc_offset', 0))
    regs[vol_addr] = int(get_param(od, 'volume', 0))
    post = find_module(root, bpath + ['guitar_post_od_peq'])
    regs[post_bypass_addr] = int(get_param(post, 'bypass', 0))
    peqs = get_eqs(post)
    for i, a in enumerate(post_addrs):
        regs[a] = peqs[i] if i < len(peqs) else 0
    return regs

def od1_regs(root):
    return block_regs(root, ['guitar_1st_overdrive'], 42, [43,44,45,46,47], 48, 49, 50, 51, 52, [53,54,55,56])

def dist_regs(root):
    return block_regs(root, ['guitar_distortion'], 57, [58,59,60,61,62], 63, 64, 65, 66, 67, [68,69,70,71])

def od2_regs(root):
    return block_regs(root, ['guitar_2nd_overdrive'], 72, [73,74,75,76,77], 78, 79, 80, 81, 82, list(range(83,99)))

def cab35_regs(root):
    cab = find_module(root, ['guitar_35band_peq', 'guitar_35band_peq_mode1'])
    if cab is None:
        cab = find_module(root, ['guitar_35band_peq'])
    regs = {}
    if cab is None:
        return regs
    regs[107] = int(get_param(cab, 'bypass', 0))
    eqs = get_eqs(cab)
    for i in range(35):
        regs[108+i] = eqs[i] if i < len(eqs) else 0
    return regs

# ─────────────────────────────────────────────────────────────────────
# 3. Scan all XMLs + classify
# ─────────────────────────────────────────────────────────────────────
xml_files = sorted(glob.glob(os.path.join(ROOT, '**', '*_bfx1.xml'), recursive=True))

def active_block(root):
    b1 = get_param(find_module(root, ['guitar_1st_overdrive']), 'bypass', '1')
    bd = get_param(find_module(root, ['guitar_distortion']), 'bypass', '1')
    b2 = get_param(find_module(root, ['guitar_2nd_overdrive']), 'bypass', '1')
    if b1 == '0': return 'od1'
    if bd == '0': return 'dist'
    if b2 == '0': return 'od2'
    return 'cab'

# ─────────────────────────────────────────────────────────────────────
# 4. PRE EQ CSV → per (目录, 原型) mode combo of 4 hex
# ─────────────────────────────────────────────────────────────────────
def parse_preq_csv():
    rows = list(csv.reader(open(os.path.join(ROOT, 'PreEQ_电路特征表.csv'), encoding='utf-8-sig')))
    data = rows[1:]
    combos = collections.defaultdict(collections.Counter)
    for r in data:
        key = (r[0], r[1])
        hexes = (r[9], r[15], r[21], r[27])
        combos[key][hexes] += 1
    preq = {}
    for key, cnt in combos.items():
        preq[key] = [int(h, 16) for h in cnt.most_common(1)[0][0]]
    return preq

PREQ = parse_preq_csv()

# ─────────────────────────────────────────────────────────────────────
# 5. Archetype display names + bass detection
# ─────────────────────────────────────────────────────────────────────
ARCH_DISPLAY = {
    'O-TS': 'Tube Screamer', 'O-SD': 'Boss SD-1', 'O-CENTAUR': 'Klon Centaur',
    'O-BB': 'BB Preamp', 'O-FORTIN': 'Fortin Dirty Tree', 'O-PLUMES': 'EQD Plumes',
    'O-PRECISION': 'Precision Drive', 'O-RAT': 'Proco RAT', 'O-SANSA': 'Tech21 SansAmp',
    'D-HM2': 'Boss HM-2', 'D-MID': 'DS-1 Mid', 'D-SCOOP': 'MT-2 Scoop', 'D-BASS': 'Bass Distortion',
    'A-HIGAIN-TIGHT': 'HiGain Tight', 'A-MARSHALL': 'Marshall', 'A-FENDER-SCOOP': 'Fender Scoop',
    'A-BASS-FLAT': 'Bass Flat', 'A-SLO': 'Soldano SLO', 'A-VOX': 'Vox Chime',
    'A-BASS-HIFI': 'Bass HIFI', 'A-FENDER-SMALL': 'Fender Small', 'A-BASS-DRIVE': 'Bass Drive',
    'A-ORANGE': 'Orange', 'A-HIGAIN-FULL': 'HiGain Full', 'A-MESA-RECTO': 'Mesa Recto',
    'A-MESA-MARK': 'Mesa Mark', '未分类': '通用高增益',
}

# bass amp brands (fallback archetype → bass play-mode)
BASS_AMP_BRANDS = {'Aguilar','Ampeg','Darkglass','Eden','GallienKrueger','Hartke','Markbass','SWR'}
# bass cab groups
BASS_CAB_GROUPS = {'Ampeg 410','Ampeg 810','Ampeg 8x10','Darkglass 212','Darkglass 410',
                   'Eden 410','Eden 4x10','GallienKrueger 410','Hartke 410'}

def arch_display(arch):
    return ARCH_DISPLAY.get(arch, arch)

def is_bass_arch(module, arch):
    if module == 'overdrive': return False          # V4 无贝斯过载
    if module == 'dist': return arch == 'D-BASS'
    if module == 'amp-head':
        if arch.startswith('A-BASS'): return True
        return arch in BASS_AMP_BRANDS
    if module == 'cabinet':
        return arch in BASS_CAB_GROUPS
    return False

# ─────────────────────────────────────────────────────────────────────
# 6. Build records
# ─────────────────────────────────────────────────────────────────────
classification = parse_classification()

base_arch = {}
for sec, archs in classification.items():
    for arch, bases in archs.items():
        for b in bases:
            if b not in base_arch:
                base_arch[b] = (sec, arch)

MOD_MODULE = {'overdrive': 'overdrive', 'dist': 'dist', 'amp-head': 'amp-head', 'cabinet': 'cabinet'}
SEC_TO_MOD = {'pedal_soft': 'overdrive', 'pedal_hard': 'dist', 'amp': 'amp-head', 'cab': 'cabinet'}

def brand_of(rel):
    parts = rel.split(os.sep)
    if len(parts) >= 3:
        return parts[1]
    return parts[0]

records = []
for f in xml_files:
    rel = os.path.relpath(f, ROOT)
    top = rel.split(os.sep)[0]
    base = os.path.basename(f)[:-9]
    root = ET.parse(f).getroot()
    active = active_block(root)
    sec, arch = base_arch.get(base, (top, None))
    # module routing
    module = SEC_TO_MOD[top]
    if active == 'cab':
        module = 'cabinet'
    elif top == 'pedal_hard' and active == 'od2':
        module = 'amp-head'
    # archetype: section must match module's section; else brand fallback
    exp_sec = {m: s for s, m in SEC_TO_MOD.items()}[module]
    if sec == exp_sec and arch:
        pass
    else:
        arch = brand_of(rel)
    if module == 'cabinet':
        arch = arch.replace('箱体:', '').strip()
    rec = {
        'file': f, 'base': base, 'rel': rel, 'top': top, 'active': active,
        'module': module, 'arch': arch, 'display': arch_display(arch),
        'sec': sec,
    }
    # registers
    rec['od1'] = od1_regs(root)
    rec['dist'] = dist_regs(root)
    rec['od2'] = od2_regs(root)
    rec['cab'] = cab35_regs(root)
    records.append(rec)

# group by module → archetype
mod_archs = collections.defaultdict(lambda: collections.defaultdict(list))
for rec in records:
    mod_archs[rec['module']][rec['arch']].append(rec)

# summary
print('=== MODULE → ARCHETYPE → FILE COUNTS ===')
for m in ['overdrive', 'dist', 'amp-head', 'cabinet']:
    print(f'\n[{m}]')
    for arch in sorted(mod_archs[m]):
        recs = mod_archs[m][arch]
        print(f'  {arch}: {len(recs)} files')

total = sum(len(recs) for m in mod_archs for recs in mod_archs[m].values())
print('\ntotal records:', total)

# ─────────────────────────────────────────────────────────────────────
# 7. Helpers for TS output
# ─────────────────────────────────────────────────────────────────────
def hx(v):
    return f'0x{v:08X}'

def hx32arr(vals):
    return ', '.join(hx(v) for v in vals)

def ts_str(s):
    return s.replace('\\', '\\\\').replace('"', '\\"')

def sort_recs(recs):
    return sorted(recs, key=lambda r: r['base'])

# preEq register mapping per capture
def preeq_for(rec):
    """return {regs:[], bypass:int, values:[]} or None."""
    module, active = rec['module'], rec['active']
    if module == 'overdrive' and active == 'od1':
        regs, bypass = [44,45,46,47], 43
    elif module == 'dist' and active == 'dist':
        regs, bypass = [59,60,61,62], 58
    elif module == 'amp-head' and active == 'od2':
        regs, bypass = [74,75,76,77], 73
    elif module == 'amp-head' and active == 'od1':
        regs, bypass = [44,45,46,47], 43
    else:
        return None
    # CSV per (sec, arch) else per-file active pre EQ values
    if rec['sec'] in PREQ and rec['arch'] in PREQ.get(rec['sec'], {}):
        values = PREQ[rec['sec']][rec['arch']]
    else:
        src = rec['od1'] if active == 'od1' else rec['dist'] if active == 'dist' else rec['od2']
        values = [src[r] for r in regs]
    return {'regs': regs, 'bypass': bypass, 'values': values}

# ─────────────────────────────────────────────────────────────────────
# 8. Emit data files
# ─────────────────────────────────────────────────────────────────────
MODULE_UI = {
    'overdrive': ('overdrive', '过载', ['DRIVE','TONE','LEVEL'], '#3c5838', '#f0a040'),
    'dist': ('dist', '失真', ['DISTORTION','TONE','LEVEL'], '#40241a', '#e87040'),
    'amp-head': ('amp-head', '箱头', ['GAIN','VOLUME','MASTER'], '#303030', '#e0a040'),
    'cabinet': ('cabinet', '箱体', [], '#3a2818', '#c8a060'),
}

def emit_submodels():
    lines = []
    for module in ['overdrive', 'dist', 'amp-head', 'cabinet']:
        mid, group, knobs, color, accent = MODULE_UI[module]
        guit_archs = sorted(a for a in mod_archs[module] if not is_bass_arch(module, a))
        bass_archs = sorted(a for a in mod_archs[module] if is_bass_arch(module, a))
        for label, archs in (('guitar', guit_archs), ('bass', bass_archs)):
            lines.append(f'    {label}: [')
            for arch in archs:
                recs = sort_recs(mod_archs[module][arch])
                disp = arch_display(arch)
                name = f'B&F NAM {disp}'
                sid = f'v4-{mid}-{arch.lower().replace(" ", "-").replace("/", "-")}'
                disabled = 'true' if (module in ('dist','overdrive') and is_bass_arch(module, arch)) else 'false'
                caps = ',\n        '.join(
                    f'{{ pos: "{ts_str(r["base"])}", label: "{ts_str(short_label(r["base"]))}" }}'
                    for r in recs)
                line = f'      {{ id: "{sid}", group: "{group}", name: "{name}", display: "{name}",'
                if module == 'cabinet':
                    line += f' knobs: [], color: "{color}", accentColor: "{accent}", speakerLabel: "{disp}", disabled: {disabled}, captures: [\n        {caps}\n      ] }},'
                else:
                    line += f' knobs: {json.dumps(knobs)}, color: "{color}", accentColor: "{accent}", disabled: {disabled}, captures: [\n        {caps}\n      ] }},'
                lines.append(line)
            lines.append('    ],')
        lines.append('')
    with open(os.path.join(OUT, 'submodels.ts'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))
    print('wrote submodels.ts', sum(len(mod_archs[m]) for m in mod_archs))

def short_label(base, limit=38):
    if len(base) <= limit:
        return base
    return base[:limit-1] + '…'

def emit_overdrive_defaults():
    lines = []
    for module in ['overdrive', 'dist']:
        for arch in sorted(mod_archs[module]):
            for rec in sort_recs(mod_archs[module][arch]):
                key = f'B&F NAM {rec["display"]}/{rec["base"]}'
                allregs = {}
                allregs.update(rec['od1'])
                allregs.update(rec['dist'])
                allregs = dict(sorted(allregs.items()))
                hidden = {k: v for k, v in allregs.items() if k not in (42, 57)}
                drive = rec['od1'].get(49, 0) if module == 'overdrive' else rec['dist'].get(64, 0)
                vol = rec['od1'].get(51, 0) if module == 'overdrive' else rec['dist'].get(66, 0)
                drive_max = 92; vol_max = 288
                knob_name = 'DRIVE' if module == 'overdrive' else 'DISTORTION'
                lines.append(f'"{ts_str(key)}": {{')
                lines.append(f'  knobs: {{ \'{knob_name}\': {min(1.0, drive / drive_max):.3f}, \'TONE\': 0.5, \'LEVEL\': {min(1.0, vol / vol_max):.3f} }},')
                lines.append(f'  hidden: {{ {hx32arr(v for _k, v in hidden.items()) if False else ", ".join(f"{k}:{hx(v)}" for k, v in hidden.items())} }},')
                lines.append(f'  allRegs: {{ {", ".join(f"{k}:{hx(v)}" for k, v in allregs.items())} }},')
                lines.append('},')
    with open(os.path.join(OUT, 'overdrive_defaults.ts'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))
    n = sum(len(mod_archs[m]) for m in ['overdrive', 'dist'])
    print(f'wrote overdrive_defaults.ts ({n} captures)')

def emit_amp_hidden():
    hidden_lines = []
    knob_lines = []
    for arch in sorted(mod_archs['amp-head']):
        for rec in sort_recs(mod_archs['amp-head'][arch]):
            key = f'B&F NAM {rec["display"]}/{rec["base"]}'
            if rec['active'] == 'od1':
                regs = {}
                regs.update(rec['od1'])
                regs.update(rec['dist'])
                regs.update(rec['od2'])
                drive_addr, vol_addr = 49, 51
            else:
                regs = rec['od2']
                drive_addr, vol_addr = 79, 81
            regs = dict(sorted(regs.items()))
            # 73/78/82 保留在 hidden (引擎/切换时按需处理), 42/57 也保留
            hidden_lines.append(f'"{ts_str(key)}": {{')
            hidden_lines.append(f'  {", ".join(f"{k}: {v}" for k, v in regs.items())},')
            hidden_lines.append('},')
            gain = regs.get(drive_addr, 0); vol = regs.get(vol_addr, 0)
            knob_lines.append(f'"{ts_str(key)}": {{ GAIN: {min(1.0, gain / 92):.3f}, VOLUME: {min(1.0, vol / 288):.3f}, MASTER: 0.5 }},')
    with open(os.path.join(OUT, 'amp_hidden.ts'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(hidden_lines))
    with open(os.path.join(OUT, 'amp_knob_defaults.ts'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(knob_lines))
    print(f'wrote amp_hidden.ts + amp_knob_defaults.ts ({len(mod_archs["amp-head"])} captures)')

def emit_formulas():
    lines = []
    for module, knobname in (('overdrive', 'DRIVE'), ('dist', 'DISTORTION')):
        drive_addr = 49 if module == 'overdrive' else 64
        tone_addr = 45 if module == 'overdrive' else 60
        vol_addr = 51 if module == 'overdrive' else 66
        for arch in sorted(mod_archs[module]):
            for rec in sort_recs(mod_archs[module][arch]):
                key = f'B&F NAM {rec["display"]}/{rec["base"]}'
                lines.append(f'"{ts_str(key)}": {{')
                lines.append(f'  {knobname}: [{{ regAddr: {drive_addr}, min: 0, max: 92, compute: (n) => Math.round(n * 92) }}],')
                if module == 'overdrive':
                    lines.append(f'  TONE: [{{ regAddr: {tone_addr}, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }}],')
                else:
                    lines.append(f'  TONE: [{{ regAddr: {tone_addr}, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }}],')
                lines.append(f'  LEVEL: [{{ regAddr: {vol_addr}, min: 0, max: 288, compute: (n) => Math.round(n * 288) }}],')
                lines.append('},')
    for arch in sorted(mod_archs['amp-head']):
        for rec in sort_recs(mod_archs['amp-head'][arch]):
            key = f'B&F NAM {rec["display"]}/{rec["base"]}'
            drive_addr = 49 if rec['active'] == 'od1' else 79
            vol_addr = 51 if rec['active'] == 'od1' else 81
            lines.append(f'"{ts_str(key)}": {{')
            lines.append(f'  GAIN: [{{ regAddr: {drive_addr}, min: 0, max: 92, compute: (n) => Math.round(n * 92) }}],')
            lines.append(f'  VOLUME: [{{ regAddr: {vol_addr}, min: 0, max: 288, compute: (n) => Math.round(n * 288) }}],')
            lines.append(f'  MASTER: [{{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }}],')
            lines.append('},')
    with open(os.path.join(OUT, 'formulas.ts'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))
    print(f'wrote formulas.ts')

def emit_cabinet_peq():
    lines = []
    for arch in sorted(mod_archs['cabinet']):
        for rec in sort_recs(mod_archs['cabinet'][arch]):
            key = f'B&F NAM {rec["display"]}/{rec["base"]}'
            bands = [rec['cab'].get(108+i, 0) for i in range(35)]
            lines.append(f'"{ts_str(key)}": [\n  {",\n  ".join(hx32arr(bands[i:i+6]) for i in range(0, 35, 6))},\n],')
    with open(os.path.join(OUT, 'cabinet_peq.ts'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))
    print(f'wrote cabinet_peq.ts ({len(mod_archs["cabinet"])} captures)')

def emit_preeq():
    lines = []
    for module in ['overdrive', 'dist', 'amp-head']:
        for arch in sorted(mod_archs[module]):
            for rec in sort_recs(mod_archs[module][arch]):
                pe = preeq_for(rec)
                if pe is None:
                    continue
                key = f'B&F NAM {rec["display"]}/{rec["base"]}'
                regs = ', '.join(str(r) for r in pe['regs'])
                vals = ', '.join(hx(v) for v in pe['values'])
                lines.append(f'"{ts_str(key)}": {{ regs: [{regs}], bypass: {pe["bypass"]}, values: [{vals}] }},')
    with open(os.path.join(OUT, 'preeq.ts'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))
    print('wrote preeq.ts')

emit_submodels()
emit_overdrive_defaults()
emit_amp_hidden()
emit_formulas()
emit_cabinet_peq()
emit_preeq()
