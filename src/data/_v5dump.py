# -*- coding: utf-8 -*-
"""Parse a BFX-1 _bfx1.xml and dump module tree compactly."""
import sys, io, xml.etree.ElementTree as ET
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def _params(node):
    return {ch.attrib.get('name', '?'): ch.text for ch in node if ch.tag.split('}')[-1] == 'param'}

def _eqs(node):
    out = []
    for ch in node:
        if ch.tag.split('}')[-1] == 'eq':
            p = _params(ch)
            out.append(f"EQ{ch.attrib.get('index','?')}(t{p.get('type')} f{p.get('freq')} g{p.get('gain')} q{p.get('q')})")
    return out

def walk(node, depth, out):
    tag = node.tag.split('}')[-1]
    ind = '  ' * depth
    if tag == 'module':
        out.append(f"{ind}MOD {node.attrib.get('name','')} {_params(node)}")
    elif tag == 'eqList':
        eqs = _eqs(node)
        if eqs:
            out.append(f"{ind}  eqList: {' | '.join(eqs)}")
    else:
        out.append(f"{ind}  {node.attrib.get('name', tag)}={node.text}")
    for ch in node:
        walk(ch, depth + 1, out)

def dump(path, limit=400):
    tree = ET.parse(path)
    out = []
    walk(tree.getroot(), 0, out)
    print(f"### {path} ({len(out)} lines)")
    for line in out[:limit]:
        print(line)
    if len(out) > limit:
        print(f"... ({len(out)-limit} more)")

def summary(path):
    """Compact: modules with direct params; eq bands inlined."""
    tree = ET.parse(path)
    out = []
    walk(tree.getroot(), 0, out)
    print(f"### {path}")
    for line in out:
        # drop compressor sub-modes & full eqList to keep it short
        if 'gtr_comp' in line or 'guitar_volume' in line or 'noise_gate' in line:
            continue
        print(line)

if __name__ == '__main__':
    mode = 'summary'
    if len(sys.argv) > 1 and sys.argv[1] == '--full':
        mode = 'full'
        del sys.argv[1]
    for p in sys.argv[1:]:
        if mode == 'full':
            dump(p)
        else:
            summary(p)
