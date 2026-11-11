# -*- coding: utf-8 -*-
"""V5 definitive scan: per-file validity, active block placement, cross-ref with manifest."""
import os, sys, io, glob, csv, xml.etree.ElementTree as ET
from collections import defaultdict
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = 'D:/NAMmodel/精选合集5'
DRIVE = ('guitar_1st_overdrive', 'guitar_distortion', 'guitar_2nd_overdrive')
BLK = {'guitar_1st_overdrive': 'od1', 'guitar_distortion': 'dist', 'guitar_2nd_overdrive': 'od2'}

def params(node):
    return {ch.attrib.get('name', ''): ch.text for ch in node if ch.tag.split('}')[-1] == 'param'}

def find_mods(el, name):
    out = []
    if el.tag.split('}')[-1] == 'module' and el.get('name') == name:
        out.append(el)
    for c in el:
        out.extend(find_mods(c, name))
    return out

def drive_blocks(root):
    out = {}
    for name in DRIVE:
        b = find_mods(root, name)
        if not b:
            continue
        p = params(b[0])
        out[name] = {'bypass': p.get('bypass'), 'drive': None, 'dc': None, 'volume': None, 'pre_byp': None}
        od = find_mods(b[0], 'guitar_od')
        if od:
            op = params(od[0])
            out[name].update({'drive': op.get('drive'), 'dc': op.get('dc_offset'), 'volume': op.get('volume')})
        pre = find_mods(b[0], 'guitar_pre_od_peq')
        if pre:
            out[name]['pre_byp'] = params(pre[0]).get('bypass')
    return out

def cab_35(root):
    """Return 35-band values or None."""
    cab = None
    for n in ('guitar_35band_peq_mode1', 'guitar_35band_peq'):
        f = find_mods(root, n)
        if f:
            cab = f[0]
            break
    if cab is None:
        return None
    for p in cab:
        if p.tag.split('}')[-1] == 'eqList':
            vals = []
            for eq in sorted(p, key=lambda x: int(x.get('index') or 0)):
                d = params(eq)
                vals.append((int(d.get('freq', 0)), int(d.get('gain', 0)), int(d.get('q', 0))))
            return vals
    return None

def load_manifest():
    m = {}
    with open(os.path.join(ROOT, '精选合集5_清单.csv'), encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            base = r['文件名'][:-4]
            m[base] = r
    return m

def main():
    manifest = load_manifest()
    cats = ['amp', 'pedal_soft', 'pedal_hard', 'cab', 'bass_amp', 'bass_cab', 'bass_pedal_hard', 'bass_pedal_soft']
    summary = defaultdict(lambda: {'total': 0, 'valid': 0, 'invalid': []})
    for cat in cats:
        xmls = sorted(glob.glob(os.path.join(ROOT, cat, '*_bfx1.xml')))
        s = summary[cat]
        s['total'] = len(xmls)
        for x in xmls:
            base = os.path.basename(x)[:-9]
            try:
                root = ET.parse(x).getroot()
            except Exception as e:
                s['invalid'].append((base, 'UNPARSEABLE', e))
                continue
            db = drive_blocks(root)
            active = [BLK[k] for k, v in db.items() if v['bypass'] == '0']
            cab = cab_35(root)
            if cat in ('cab', 'bass_cab'):
                if cab is None or not cab or all(g == 120 and q == 0 for _f, g, q in cab):
                    s['invalid'].append((base, 'CAB-EMPTY/NEUTRAL', f"bands={len(cab or [])}"))
                else:
                    s['valid'] += 1
            else:
                if not active:
                    real = {BLK[k]: v for k, v in db.items() if v['drive'] not in (None, '0')}
                    s['invalid'].append((base, 'NO-ACTIVE-BLOCK', str(real)))
                else:
                    s['valid'] += 1
                    if cat == 'amp' and 'od1' in active:
                        s.setdefault('od1_active', []).append(base)
        # manifest cross-ref
        in_man = [b for b, *_ in s['invalid'] if b in manifest]
        print(f"\n### {cat}: total={s['total']} valid={s['valid']} invalid={len(s['invalid'])} (in-manifest invalid: {len(in_man)})")
        if 'od1_active' in s:
            print(f"  amp files active in od1 block (use OD1 regs 42-56): {len(s['od1_active'])}")
        for base, why, extra in s['invalid']:
            tag = ' [IN-MANIFEST]' if base in manifest else ' [folder-only]'
            print(f"  INVALID {base}{tag}: {why} {extra}")
    # print manifest picks not in folder XMLs
    found = set()
    for cat in cats:
        found |= {os.path.basename(p)[:-9] for p in glob.glob(os.path.join(ROOT, cat, '*_bfx1.xml'))}
    missing = [b for b in manifest if b not in found]
    print(f"\nManifest picks missing XML: {len(missing)} {missing}")

if __name__ == '__main__':
    main()
