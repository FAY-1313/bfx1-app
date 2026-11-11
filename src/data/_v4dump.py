# -*- coding: utf-8 -*-
"""Dump the raw module tree for one XML to understand register param names."""
import xml.etree.ElementTree as ET, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
path = r'D:/NAMmodel/精选合集V4/pedal_soft/82 Ibanez Tube Screamer_bfx1.xml'
root = ET.parse(path).getroot()

def walk(el, depth=0, limit=999):
    if depth > limit: return
    tag = el.tag
    name = el.get('name', '')
    print('  '*depth + f'{tag} name={name!r} ' + (f'index={el.get("index")}' if el.get('index') is not None else ''))
    for c in list(el):
        walk(c, depth+1, limit)

# print only the input → guitar_1st_overdrive subtree fully, then other top blocks shallowly
def find_first(el, name):
    if el.tag == 'module' and el.get('name') == name:
        return el
    for c in el:
        r = find_first(c, name)
        if r is not None: return r
    return None

for block in ['guitar_1st_overdrive', 'guitar_distortion', 'guitar_2nd_overdrive', 'guitar_35band_peq']:
    el = find_first(root, block)
    print(f'===== {block} =====')
    walk(el, 0, 3)

# speaker dynamics + master volume
for mname in ['speaker_out_limiter', 'guitar_send_volume', 'guitar_return_volume', 'mx_out_limiter']:
    el = find_first(root, mname)
    if el is not None:
        print(f'===== {mname} =====')
        walk(el, 0, 2)
