# -*- coding: utf-8 -*-
"""Deep probe: dump full register values from a V4 _bfx1.xml for amp/cab types."""
import xml.etree.ElementTree as ET, io, sys, glob, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def find_all_modules(el, name):
    out = []
    if el.tag == 'module' and el.get('name') == name:
        out.append(el)
    for c in el:
        out.extend(find_all_modules(c, name))
    return out

def find_module(root, path):
    cur = None
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

def dump_params(el, label):
    if el is None:
        print(f'  [{label}] None')
        return
    for p in el:
        if p.tag == 'param':
            print(f'  [{label}] {p.get("name")} = {p.text}')
    # eqList
    for p in el:
        if p.tag == 'eqList':
            for eq in sorted(p, key=lambda x: int(x.get('index') or 0)):
                dd = {pp.get('name'): pp.text for pp in eq if pp.tag == 'param'}
                print(f'  [{label}] eq{dd.get("index")} type={dd.get("type")} freq={dd.get("freq")} gain={dd.get("gain")} q={dd.get("q")} s={dd.get("s")}')

if __name__ == '__main__':
    for f in sys.argv[1:]:
        print('=====', f)
        root = ET.parse(f).getroot()
        for path in (['guitar_2nd_overdrive'],
                     ['guitar_2nd_overdrive', 'guitar_pre_od_peq'],
                     ['guitar_2nd_overdrive', 'guitar_od'],
                     ['guitar_2nd_overdrive', 'guitar_post_od_peq'],
                     ['guitar_35band_peq', 'guitar_35band_peq_mode1'],
                     ['guitar_35band_peq']):
            el = find_module(root, path)
            dump_params(el, path[-1])
        # top-level module names
        names = []
        def collect(el):
            if el.tag == 'module':
                names.append(el.get('name'))
            for c in el: collect(c)
        collect(root)
        print('  all module names:', names[:40])
