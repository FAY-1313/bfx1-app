import json, zipfile, re

P = json.load(open('tools/_v345_patch.json', encoding='utf-8'))
apk = r'C:\Users\FAY\Downloads\APK开发\BFX1-debug.apk'

want = {}
for group in ('amp', 'od'):
    for ident, regs in P[group].items():
        for addr, val in regs.items():
            want['%s#%s' % (ident, addr)] = int(val)

z = zipfile.ZipFile(apk)
js = [n for n in z.namelist() if n.startswith('assets/public/assets/') and n.endswith('.js')]
blob = b''.join(z.read(n) for n in js).decode('utf-8', 'ignore')
print('js assets:', len(js))

# minifier rewrites big literals as scientific notation (1367844000 -> 1367844e3),
# so compare numerically instead of by substring.
nums = set()
for m in re.finditer(r'(?<![\d.])(\d+(?:\.\d+)?(?:e\d+)?)(?![\d.])', blob):
    try:
        f = float(m.group(1))
        if f <= 1e15:
            nums.add(int(round(f)))
    except (ValueError, OverflowError):
        pass

hit, miss = [], []
for k, v in want.items():
    (hit if v in nums else miss).append((k, v))

print('found %d/%d' % (len(hit), len(want)))
if miss:
    print('MISSING (%d):' % len(miss))
    for k, v in miss[:30]:
        print('   ', k, v)
else:
    print('ALL NEW PEQ WORDS PRESENT IN APK (numeric match)')
