# -*- coding: utf-8 -*-
"""Probe: extract register values from a V4 _bfx1.xml and map to BFX-1 regs."""
import xml.etree.ElementTree as ET, io, sys, glob, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def enc(type, freq, gain, q, s):
    return ((type & 0x7) | ((freq & 0x1ff) << 3) | ((gain & 0xff) << 12)
            | ((q & 0x7f) << 20) | ((s & 0x1f) << 27)) & 0xFFFFFFFF

def find_all_modules(el, name):
    out = []
    if el.tag == 'module' and el.get('name') == name:
        out.append(el)
    for c in el:
        out.extend(find_all_modules(c, name))
    return out

def find_module(root, path):
    """Navigate by module names (recursive); return element or None."""
    # find the first element of path[0] anywhere, then descend children
    cur = None
    for first in find_all_modules(root, path[0]):
        # descend remaining path among children
        cand = first
        ok = True
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

def get_eqs(el):
    """Return list of (type,freq,gain,q,s) from el's eqList, or the direct params."""
    if el is None: return []
    # eqList form
    for p in el:
        if p.tag == 'eqList':
            out = []
            for eq in sorted(p, key=lambda x: int(x.get('index') or 0)):
                d = {}
                for pp in eq:
                    if pp.tag == 'param':
                        d[pp.get('name')] = pp.text
                out.append((int(d.get('type',0)), int(d.get('freq',0)), int(d.get('gain',0)),
                            int(d.get('q',0)), int(d.get('s',0))))
            return out
    # direct param form
    d = {}
    for p in el:
        if p.tag == 'param':
            d[p.get('name')] = p.text
    if 'type' in d:
        return [(int(d['type']), int(d['freq']), int(d['gain']), int(d.get('q',0)), int(d.get('s',0)))]
    return []

def probe(path):
    root = ET.parse(path).getroot()
    out = {}
    # --- 1st overdrive (OD 42-56) ---
    od = find_module(root, ['guitar_1st_overdrive'])
    pre = find_module(root, ['guitar_1st_overdrive', 'guitar_pre_od_peq'])
    gdo = find_module(root, ['guitar_1st_overdrive', 'guitar_od'])
    post = find_module(root, ['guitar_1st_overdrive', 'guitar_post_od_peq'])
    out['od_bypass'] = get_param(od, 'bypass')
    out['od_pre_bypass'] = get_param(pre, 'bypass')
    out['od_pre_eqs'] = get_eqs(pre)
    out['od_drive'] = get_param(gdo, 'drive')
    out['od_dc'] = get_param(gdo, 'dc_offset')
    out['od_vol'] = get_param(gdo, 'volume')
    out['od_post_bypass'] = get_param(post, 'bypass')
    out['od_post_eqs'] = get_eqs(post)
    # --- dist (57-71) ---
    ds = find_module(root, ['guitar_distortion'])
    dpre = find_module(root, ['guitar_distortion', 'guitar_pre_od_peq'])
    ddo = find_module(root, ['guitar_distortion', 'guitar_od'])
    dpost = find_module(root, ['guitar_distortion', 'guitar_post_od_peq'])
    out['dist_bypass'] = get_param(ds, 'bypass')
    out['dist_pre_bypass'] = get_param(dpre, 'bypass')
    out['dist_pre_eqs'] = get_eqs(dpre)
    out['dist_drive'] = get_param(ddo, 'drive')
    out['dist_dc'] = get_param(ddo, 'dc_offset')
    out['dist_vol'] = get_param(ddo, 'volume')
    out['dist_post_bypass'] = get_param(dpost, 'bypass')
    out['dist_post_eqs'] = get_eqs(dpost)
    # --- 2nd overdrive / amp (72-98) ---
    od2 = find_module(root, ['guitar_2nd_overdrive'])
    a2pre = find_module(root, ['guitar_2nd_overdrive', 'guitar_pre_od_peq'])
    a2od = find_module(root, ['guitar_2nd_overdrive', 'guitar_od'])
    a2post = find_module(root, ['guitar_2nd_overdrive', 'guitar_post_od_peq'])
    out['od2_bypass'] = get_param(od2, 'bypass')
    out['od2_pre_bypass'] = get_param(a2pre, 'bypass')
    out['od2_pre_eqs'] = get_eqs(a2pre)
    out['od2_drive'] = get_param(a2od, 'drive')
    out['od2_dc'] = get_param(a2od, 'dc_offset')
    out['od2_vol'] = get_param(a2od, 'volume')
    out['od2_post_bypass'] = get_param(a2post, 'bypass')
    out['od2_post_eqs'] = get_eqs(a2post)
    # --- 35-band (108-142) ---
    peq35 = find_module(root, ['guitar_35band_peq', 'guitar_35band_peq_mode1'])
    if peq35 is None:
        peq35 = find_module(root, ['guitar_35band_peq'])
    out['peq35'] = get_eqs(peq35)
    return out

if __name__ == '__main__':
    for f in sys.argv[1:]:
        print('=====', f)
        r = probe(f)
        for k, v in r.items():
            if isinstance(v, list):
                print(f'  {k}: {len(v)} bands', [enc(*x) for x in v][:40])
            else:
                print(f'  {k}: {v}')
