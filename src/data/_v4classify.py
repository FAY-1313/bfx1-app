# -*- coding: utf-8 -*-
"""Classify every V4 XML by which DSP block is active (bypass=0)."""
import xml.etree.ElementTree as ET, io, sys, glob, os, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r'D:/NAMmodel/精选合集V4'

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

def classify(path):
    root = ET.parse(path).getroot()
    od1 = find_module(root, ['guitar_1st_overdrive'])
    dist = find_module(root, ['guitar_distortion'])
    od2 = find_module(root, ['guitar_2nd_overdrive'])
    cab = find_module(root, ['guitar_35band_peq', 'guitar_35band_peq_mode1'])
    if cab is None:
        cab = find_module(root, ['guitar_35band_peq'])
    od1b = get_param(od1, 'bypass', '?')
    distb = get_param(dist, 'bypass', '?')
    od2b = get_param(od2, 'bypass', '?')
    cabb = get_param(cab, 'bypass', '?')
    return od1b, distb, od2b, cabb

files = sorted(glob.glob(os.path.join(ROOT, '**', '*_bfx1.xml'), recursive=True))
print('total xml:', len(files))
counts = collections.Counter()
bydir = collections.defaultdict(collections.Counter)
for f in files:
    rel = os.path.relpath(f, ROOT)
    top = rel.split(os.sep)[0]
    try:
        od1b, distb, od2b, cabb = classify(f)
    except Exception as e:
        print('ERR', rel, e); continue
    key = f'od1={od1b} dist={distb} od2={od2b} cab={cabb}'
    counts[key] += 1
    bydir[top][key] += 1
print('\n=== global patterns ===')
for k, v in counts.most_common():
    print(f'  {k}: {v}')
print('\n=== by directory ===')
for d in sorted(bydir):
    print(f'[{d}]')
    for k, v in bydir[d].most_common():
        print(f'  {k}: {v}')

print('\n=== files where active block != dir expectation ===')
for f in files:
    rel = os.path.relpath(f, ROOT)
    top = rel.split(os.sep)[0]
    od1b, distb, od2b, cabb = classify(f)
    if top == 'pedal_soft' and od2b == '0' and od1b == '1' and distb == '1':
        print('  [soft->amp]', rel)
    elif top == 'pedal_hard' and od2b == '0' and distb == '1' and od1b == '1':
        print('  [hard->amp]', rel)
    elif top == 'amp' and od1b == '0' and od2b == '1':
        print('  [amp->od1]', rel)
    elif top == 'amp' and od1b == '1' and distb == '1' and od2b == '1':
        print('  [amp->cab]', rel)
    elif top == 'cab' and od2b == '0' and od1b == '1' and distb == '1':
        print('  [cab->amp]', rel)
    elif top == 'cab' and od1b == '0' and od2b == '1':
        print('  [cab->od1]', rel)
    elif top == 'pedal_soft' and distb == '0' and od1b == '0':
        print('  [soft->dual]', rel)
