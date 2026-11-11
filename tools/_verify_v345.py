import re, json

P = json.load(open('tools/_v345_patch.json', encoding='utf-8'))
src = open('src/data/peqCodec.ts', encoding='utf-8').read()
F = [float(x) for x in re.findall(r'-?\d+\.?\d*', re.search(r'PEQ_FREQ_TABLE: number\[\] = \[(.*?)\];', src, re.S).group(1))]
Q = [float(x) for x in re.findall(r'-?\d+\.?\d*', re.search(r'PEQ_Q_TABLE: number\[\] = \[(.*?)\]', src, re.S).group(1))]
TY = ['PEAK', 'LSHELF', 'HSHELF', 'ALLPASS', 'HPF', 'LPF', 'HPF1', 'LPF1']

RE_ID_REGS = re.compile(r'id:\s*"([a-z0-9_]+)"[\s\S]*?regs:\s*\{([\s\S]*?)\}')
RE_OD = re.compile(r'id:\s*"([a-z0-9_]+)"[\s\S]*?regs:\s*\{([^}]*)\}')


def blocks(path):
    s = open(path, encoding='utf-8').read()
    out = {}
    for m in RE_ID_REGS.finditer(s):
        out.setdefault(m.group(1), {int(a): int(v) for a, v in re.findall(r'(\d+):\s*(\d+)', m.group(2))})
    return out


def check(path, key):
    b = blocks(path)
    ok = bad = 0
    for ident, regs in P[key].items():
        if ident not in b:
            print('  MISSING BLOCK', ident); bad += 1; continue
        for a, v in regs.items():
            got = b[ident].get(int(a))
            if got != v:
                print('  MISMATCH', ident, a, 'want', v, 'got', got); bad += 1
            else:
                ok += 1
    print('%s: ok=%d bad=%d' % (key, ok, bad))
    return b


check('src/data/_def/ampHeadDef.ts', 'amp')
check('src/data/_def/odDef.ts', 'od')

s = open('src/data/_def/ampHeadDef.ts', encoding='utf-8').read()
order = []
cur = {}
for m in RE_ID_REGS.finditer(s):
    if m.group(1) in cur: continue
    cur[m.group(1)] = {int(a): int(v) for a, v in re.findall(r'(\d+):\s*(\d+)', m.group(2))}
    order.append(m.group(1))

names = dict((m.group(1), m.group(2)) for m in re.finditer(r'id:\s*"([a-z0-9_]+)",\s*name:\s*"([^"]+)"', s))

print()
print('=== FINAL AMP (20) ===')
for i, k in enumerate(order[:20]):
    d = cur[k]
    f = lambda a: '%s %.0f' % (TY[d[a] & 7], F[(d[a] >> 3) & 0x1ff])
    g = lambda a: '%+.1f' % (-24 + ((d[a] >> 12) & 0xff) * 0.2)
    q = lambda a: 'Q%.2f' % Q[(d[a] >> 20) & 0x7f]
    print('%2d %-24s 59 %-10s 60 %-10s | 61 %-10s %5s %-6s | 62 %-10s %5s %-6s | 84 %5s 85 %5s 88 %-10s' % (
        i, names.get(k, k)[:24], f(59), f(60), f(61), g(61), q(61), f(62), g(62), q(62), g(84), g(85), f(88)))

print()
print('=== FINAL OD (8) ===')
s2 = open('src/data/_def/odDef.ts', encoding='utf-8').read()
od = {}
for m in RE_OD.finditer(s2):
    od.setdefault(m.group(1), {int(a): int(v) for a, v in re.findall(r'(\d+):\s*(\d+)', m.group(2))})
for k, d in od.items():
    f = lambda a: '%s %.0f' % (TY[d[a] & 7], F[(d[a] >> 3) & 0x1ff])
    g = lambda a: '%+.1f' % (-24 + ((d[a] >> 12) & 0xff) * 0.2)
    print('  %-8s 44 %-10s 45 %-12s 46 %-12s 47 %-10s | 53 %-12s 54 %-12s 55 %-12s 56 %-12s | 51 %d (%.2f dB)' % (
        k, f(44), f(45) + g(45), f(46) + g(46), f(47), f(53) + g(53), f(54) + g(54), f(55) + g(55), f(56) + g(56),
        d[51], (d[51] - 288) * 0.25))
