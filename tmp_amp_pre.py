import re

src = open('src/data/peqCodec.ts', encoding='utf-8').read()
m = re.search(r'PEQ_FREQ_TABLE: number\[\] = \[(.*?)\];', src, re.S)
FREQ = [float(x) for x in re.findall(r'-?\d+\.?\d*', m.group(1))]
TYPES = {0: 'PEAK', 1: 'LSHELF', 2: 'HSHELF', 3: 'ALLPASS',
         4: 'HPF', 5: 'LPF', 6: 'HPF1', 7: 'LPF1'}


def dec(v):
    v = int(v)
    t = v & 7
    fi = (v >> 3) & 0x1ff
    gi = (v >> 12) & 0xff
    return '%s@%.0f%+.0f' % (TYPES.get(t, '?'), FREQ[fi], -24 + gi * 0.2)


def dump(path, label, is_v19):
    s = open(path, encoding='utf-8').read()
    # split objects by "id:"
    objs = re.split(r'\n  \{\n', s)
    print('#' * 96)
    print('##', label)
    print('%-3s %-26s %-8s %-16s %-16s %-16s %-16s' %
          ('idx', 'name', 'cls', '59 N1in-HPF', '60 N1out-LPF', '74 N5in', '75 N5out'))
    print('-' * 96)
    idx = 0
    for ob in objs:
        if 'regs: {' not in ob:
            continue
        nm = re.search(r'name:\s*"([^"]+)"', ob)
        cl = re.search(r'cls:\s*[\'"]([^\'"]+)', ob)
        rg = re.search(r'regs:\s*\{([^}]*)\}', ob)
        if not (nm and rg):
            continue
        d = {int(a): int(v) for a, v in re.findall(r'(\d+):\s*(\d+)', rg.group(1))}
        print('%-3d %-26s %-8s %-16s %-16s %-16s %-16s' %
              (idx, nm.group(1)[:26], (cl.group(1) if cl else '?')[:8],
               dec(d.get(59, 0)), dec(d.get(60, 0)),
               dec(d.get(74, 0)), dec(d.get(75, 0))))
        idx += 1


dump('src/data/_def/ampHeadDef.ts', 'v10 (builtin 20)', False)
dump('src/data/_def/ampHeadDefV19.ts', 'v19 (new group 20)', True)
