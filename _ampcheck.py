import re
base = 'src/data/'
pedal = open(base + 'pedalData.ts', encoding='utf-8').read()
pm = open(base + 'parameterMap.ts', encoding='utf-8').read()
pd = open(base + 'presetData.ts', encoding='utf-8').read()

# parse SUB_MODEL_PRE_EQ keys
peq_keys = set(re.findall(r'"((?:B&F NAM )[^"]+/[^"]+)":\s*\{ regs:', pm))
# parse SUB_MODEL_FORMULAS keys (multiline: "key": {\n  GAIN:...)
fm_keys = set(re.findall(r'"((?:B&F NAM )[^"]+/[^"]+)":\s*\{\n  GAIN:', pm))
# parse AMP_HEAD_HIDDEN keys
hid_keys = set(re.findall(r'"((?:B&F NAM )[^"]+/[^"]+)":\s*\{\n  72:', pd))
# parse AMP_HEAD_KNOB_DEFAULTS keys
dfl_keys = set(re.findall(r'"((?:B&F NAM )[^"]+/[^"]+)":\s*\{ GAIN:', pd))

start = pedal.index('const ampHead: ModuleConfig')
end = pedal.index('const cabinet: ModuleConfig')
body = pedal[start:end]

# split submodels by entry
entries = []
for m in re.finditer(r'\{\s*id: "v8-amp-[^"]+",', body):
    seg = body[m.end()-1:]
    # grab name and all pos
    name_m = re.search(r'name: "([^"]+)"', seg[:200])
    # capture pos list up to the closing " ] },"
    caps_m = re.search(r'captures:\s*\[\s*(.*?)\s*\]\s*\}', seg[:1200], re.S)
    name = name_m.group(1) if name_m else None
    poss = re.findall(r'pos: "([^"]+)"', caps_m.group(1)) if caps_m else []
    entries.append((name, poss))

total_caps = 0
for name, poss in entries:
    for pos in poss:
        total_caps += 1
        key = f'{name}/{pos}'
        tags = []
        if key not in peq_keys: tags.append('PRE_EQ')
        if key not in fm_keys: tags.append('FORMULAS')
        if key not in hid_keys: tags.append('HIDDEN')
        if key not in dfl_keys: tags.append('DEFAULTS')
        if tags:
            print(f'  MISS[{",".join(tags)}] {key}')

print(f'amp subModels: {len(entries)}, captures: {total_caps}')
print(f'PRE_EQ: {len(peq_keys)}  FORMULAS: {len(fm_keys)}  HIDDEN: {len(hid_keys)}  DEFAULTS: {len(dfl_keys)}')
