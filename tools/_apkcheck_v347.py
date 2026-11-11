import zipfile, re

apk = r'C:\Users\FAY\Downloads\APK开发\BFX1-debug.apk'
z = zipfile.ZipFile(apk)
js = [n for n in z.namelist() if n.startswith('assets/public/assets/') and n.endswith('.js')]
blob = b''.join(z.read(n) for n in js).decode('utf-8', 'ignore')
print('js assets:', len(js))

print('\n--- v3.47 preset assignment ---')
checks = [
    ('Metal Lead = Lonestar(14) + Mesa Recto', 'amp:14,cab:"Mesa Recto 2x12"'),
    ('Heavy Metal = Engl(10) + Mesa OS', 'amp:10,cab:"Mesa OS 4x12"'),
    ('Round Bass = Acoustic360(17)', 'amp:17,cab:"SVT 4x10+8x10"'),
    ('Bright Bass = Traynor(19)', "amp:19,cab:\"Bassman '70 2x15\""),
    ('Funk Clean = JC-120(4)', 'amp:4,cab:"Super Reverb 4x10"'),
    ('Slap Bass = L4(16) + chorus', 'amp:16,cab:"Eden DT410"'),
]
for label, pat in checks:
    print(('OK   ' if pat in blob else 'MISS ') + label)

print('\n--- names ---')
for zh, en in [('金属主音', 'Metal Lead'), ('撕裂金属', 'Heavy Metal'),
               ('正常贝斯', 'Round Bass'), ('高频激励贝斯', 'Bright Bass'), ('击勾弦贝斯', 'Slap Bass')]:
    a = zh in blob
    b = en in blob
    print(('OK   ' if a and b else 'MISS ') + zh + ' / ' + en + ('  (%s,%s)' % (a, b) if not (a and b) else ''))

print('\n--- chorus safe values (1-3 band) ---')
# CH_SAFE and CE-2 share the same tuple
pat = '216:3,217:4,218:5,219:2,220:2'
print(('OK   ' if pat in blob else 'MISS ') + 'CH_SAFE / CE-2  ' + pat)
for label, seq in [('CE-1', '216:2,217:4,218:5,219:3,220:2'),
                   ('Dimension', '216:3,217:4,218:5,219:3,220:3')]:
    print(('OK   ' if seq in blob else 'MISS ') + label + '  ' + seq)

print('\n--- amp index fix present ---')
# the resolver looks up AMP_MODELS_V8 by model name
print(('OK   ' if 'findIndex' in blob else '?    ') + 'findIndex present')
print(('OK   ' if 'amp-head' in blob else 'MISS ') + "subModels['amp-head'] usage")

print('\n--- seed guard ---')
print(('OK   ' if 'bfx_builtin_seed_ver' in blob else 'MISS ') + 'bfx_builtin_seed_ver')
