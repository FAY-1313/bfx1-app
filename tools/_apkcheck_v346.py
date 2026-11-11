import zipfile, re

apk = r'C:\Users\FAY\Downloads\APK开发\BFX1-debug.apk'
z = zipfile.ZipFile(apk)
js = [n for n in z.namelist() if n.startswith('assets/public/assets/') and n.endswith('.js')]
blob = b''.join(z.read(n) for n in js).decode('utf-8', 'ignore')
print('js assets:', len(js), 'chars:', len(blob))

# numeric set (minifier may write 1e3 style)
nums = set()
for m in re.finditer(r'(?<![\d.])(\d+(?:\.\d+)?(?:e\d+)?)(?![\d.])', blob):
    try:
        f = float(m.group(1))
        if f <= 1e15:
            nums.add(int(round(f)))
    except (ValueError, OverflowError):
        pass

checks = {
    'twin#85  (-10.2 @397)': 1353995488,
    '6505#96  (-0.4 @4k)': 1353148576,
}
print('\n--- amp PEQ words ---')
for k, v in checks.items():
    print(('OK   ' if v in nums else 'MISS ') + k + '  ' + str(v))

print('\n--- chorus preset regs (must appear verbatim) ---')
for name, seq in [
    ('CE-2', '216:15,217:6,218:7,219:4,220:3'),
    ('CE-1', '216:14,217:2,218:3,219:5,220:4'),
    ('Dimension', '216:17,217:1,218:5,219:3,220:5'),
]:
    ok = seq in blob or seq.replace(',', ', ') in blob
    print(('OK   ' if ok else 'MISS ') + name + '  ' + seq)

print('\n--- preset names (zh / en) ---')
pairs = [
    ('流行清音', 'Pop Clean'), ('平滑清音', 'Smooth Clean'), ('放克清音', 'Funk Clean'),
    ('布鲁斯过载', 'Blues Overdrive'), ('英式摇滚', 'British Rock'), ('经典摇滚', 'Classic Rock'),
    ('硬摇滚', 'Hard Rock'), ('复古摇滚', 'Vintage Rock'), ("80年代金属", "'80s Metal"),
    ('现代金属', 'Modern Metal'), ('金属主音', 'Metal Lead'), ('后摇氛围', 'Post-Rock Ambient'),
    ('摇滚贝斯', 'Rock Bass'), ('击勾弦贝斯', 'Slap Bass'), ('高频激励贝斯', 'Bright Bass'),
]
miss = 0
for zh, en in pairs:
    a = zh in blob
    b = en in blob or en.replace("'", '') in blob
    if not (a and b):
        miss += 1
        print('MISS', zh, a, '|', en, b)
print(('ALL 15 preset names (zh+en) PRESENT' if miss == 0 else '%d pairs missing' % miss))

print('\n--- chorus UI ranges (min/max pairs) ---')
for label, pat in [('Level 0-20', 'min:0,max:20'), ('Rate 0-19', 'min:0,max:19'), ('Depth 0-5', 'min:0,max:5')]:
    print(('OK   ' if pat in blob else 'note ') + label + '  (' + pat + ')')

print('\n--- seed version guard ---')
print(('OK   ' if 'bfx_builtin_seed_ver' in blob else 'MISS ') + 'bfx_builtin_seed_ver')
