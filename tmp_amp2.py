import re

src = open('src/data/peqCodec.ts', encoding='utf-8').read()
m = re.search(r'PEQ_FREQ_TABLE: number\[\] = \[(.*?)\];', src, re.S)
FREQ = [float(x) for x in re.findall(r'-?\d+\.?\d*', m.group(1))]
TYPES = {0: 'PEAK', 1: 'LSHELF', 2: 'HSHELF', 3: 'ALLPASS',
         4: 'HPF', 5: 'LPF', 6: 'HPF1', 7: 'LPF1'}


def dec(v):
    v = int(v)
    return '%-6s @%6.0f %+5.1f' % (TYPES.get(v & 7, '?'), FREQ[(v >> 3) & 0x1ff],
                                   -24 + ((v >> 12) & 0xff) * 0.2)


s = open('src/data/_def/ampHeadDef.ts', encoding='utf-8').read()
objs = re.split(r'\n  \{\n', s)
amps = []
for ob in objs:
    if 'regs: {' not in ob:
        continue
    nm = re.search(r'^\s*name:\s*"([^"]+)"', ob, re.M)
    rg = re.search(r'regs:\s*\{([^}]*)\}', ob)
    if not (nm and rg):
        continue
    d = {int(a): int(v) for a, v in re.findall(r'(\d+):\s*(\d+)', rg.group(1))}
    amps.append((nm.group(1), d))

print('v10 amps parsed:', len(amps))
for i, (n, _) in enumerate(amps):
    print('  %2d  %s' % (i, n))

TARGET = ['Fender Twin Reverb AB763', 'Marshall JTM45']
for n, d in amps:
    if n not in TARGET:
        continue
    print()
    print('=' * 70)
    print(n)
    print('  N1 59/60/61/62:')
    for a in (59, 60, 61, 62):
        print('     %d: %s' % (a, dec(d[a])))
    print('  N4 68-71 (user tone knobs):')
    for a in (68, 69, 70, 71):
        print('     %d: %s' % (a, dec(d[a])))
    print('  N5 74-77:')
    for a in (74, 75, 76, 77):
        print('     %d: %s' % (a, dec(d[a])))
    print('  N8 83-98 (16-seg character):')
    for a in range(83, 99):
        if a in d:
            print('     %d: %s' % (a, dec(d[a])))
    print('  drive 64/66/79/81 + DC 65/80:')
    for a in (64, 65, 66, 79, 80, 81):
        if a in d:
            print('     %d: %d' % (a, d[a]))
