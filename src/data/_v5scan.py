# -*- coding: utf-8 -*-
"""Scan all BFX-1 XMLs in 精选合集5, extract active drive blocks, flag invalid captures."""
import os, sys, io, glob, xml.etree.ElementTree as ET
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = 'D:/NAMmodel/精选合集5'
DRIVE_BLOCKS = ('guitar_1st_overdrive', 'guitar_distortion', 'guitar_2nd_overdrive')
CAB_BLOCK = 'guitar_35band_peq_mode1'

def params(node):
    return {ch.attrib.get('name', '?'): ch.text for ch in node if ch.tag.split('}')[-1] == 'param'}

def block_state(node):
    """Return dict of active blocks for one drive module tree."""
    out = {}
    for b in node.findall('.//{*}module'):
        name = b.attrib.get('name', '')
        if name in DRIVE_BLOCKS:
            p = params(b)
            byp = p.get('bypass')
            state = 'ACTIVE' if byp == '0' else ('BYP' if byp == '1' else '?')
            out[name] = state
            # capture drive submodule params too
            for sub in b:
                subn = sub.attrib.get('name', '')
                if subn in ('guitar_od', 'guitar_pre_od_peq', 'guitar_post_od_peq'):
                    sp = params(sub)
                    keep = {}
                    for k in ('bypass', 'drive', 'dc', 'volume', 'mode', 'threshold'):
                        if k in sp:
                            keep[k] = sp[k]
                    if subn == 'guitar_od':
                        keep['_active'] = sp.get('bypass') == '0'
                    out[f"{name}:{subn}"] = keep
    return out

def cab_info(node):
    """Extract 35-band cab presence + active mode."""
    for b in node.findall('.//{*}module'):
        name = b.attrib.get('name', '')
        if name == 'guitar_35band_peq':
            p = params(b)
            return {'bypass': p.get('bypass')}
        if name == CAB_BLOCK:
            p = params(b)
            bands = [int(p.get(f'band{i}', 0)) for i in range(1, 36)]
            return {'bypass': p.get('bypass'), 'bands_min': min(bands), 'bands_max': max(bands), 'n_nonzero': sum(1 for v in bands if v != 120)}
    return {}

def scan_file(path):
    try:
        tree = ET.parse(path)
    except Exception as e:
        return {'error': str(e)}
    root = tree.getroot()
    bs = block_state(root)
    cab = cab_info(root)
    active = [k for k, v in bs.items() if k in DRIVE_BLOCKS and v == 'ACTIVE']
    return {'blocks': bs, 'active': active, 'cab': cab}

def main():
    cats = ['amp', 'bass_amp', 'cab', 'bass_cab', 'pedal_hard', 'pedal_soft', 'bass_pedal_hard', 'bass_pedal_soft']
    mode = sys.argv[1] if len(sys.argv) > 1 else 'summary'
    total = 0
    for cat in cats:
        xmls = sorted(glob.glob(os.path.join(ROOT, cat, '*_bfx1.xml')))
        if not xmls:
            continue
        print(f"\n{'='*70}\n### {cat} ({len(xmls)} XMLs)\n{'='*70}")
        invalids = []
        for x in xmls:
            r = scan_file(x)
            if 'error' in r:
                invalids.append((os.path.basename(x), r['error']))
                continue
            total += 1
            if not r['active']:
                # find any block with non-neutral drive
                nonneutral = []
                for k, v in r['blocks'].items():
                    if k.endswith(':guitar_od'):
                        d = v.get('drive')
                        if d not in (None, '0'):
                            nonneutral.append(f"{k.split(':')[0]}=d{d}")
                invalids.append((os.path.basename(x), f"NO-ACTIVE-BLOCK {nonneutral}"))
                if mode == 'detail':
                    print(f"  [INVALID] {os.path.basename(x)}: no active block, {nonneutral}")
            elif mode == 'detail':
                print(f"  [OK] {os.path.basename(x):36s} active={r['active']} od={r['blocks'].get('guitar_1st_overdrive:guitar_od')}")
        print(f"  -> invalid: {len(invalids)}")
        for name, why in invalids:
            print(f"     {name}: {why}")
    print(f"\nTOTAL scanned OK (parseable): {total}")

if __name__ == '__main__':
    main()
