import json, re, sys

PATCH = json.load(open('tools/_v345_patch.json', encoding='utf-8'))

def patch_file(path, mapping):
    s = open(path, encoding='utf-8').read()
    total = 0
    for ident, regs in mapping.items():
        m = re.search(r'id:\s*"%s"' % re.escape(ident), s)
        if not m:
            print('  MISS ID', ident); continue
        start = m.end()
        rm = re.search(r'regs:\s*\{', s[start:])
        if not rm:
            print('  NO REGS', ident); continue
        b0 = start + rm.end()
        b1 = s.index('}', b0)
        block = s[b0:b1]
        for addr, val in regs.items():
            block, n = re.subn(
                r'(?<![\d])%d(\s*:\s*)\d+' % int(addr),
                lambda mm, a=int(addr), v=int(val): '%d%s%d' % (a, mm.group(1), v),
                block, count=1)
            if n == 0:
                print('  MISS REG', ident, addr)
            else:
                total += 1
        s = s[:b0] + block + s[b1:]
    open(path, 'w', encoding='utf-8', newline='').write(s)
    return total

a = patch_file('src/data/_def/ampHeadDef.ts', PATCH['amp'])
b = patch_file('src/data/_def/odDef.ts', PATCH['od'])
print('written amp=%d od=%d' % (a, b))
