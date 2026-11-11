# -*- coding: utf-8 -*-
"""PRE EQ 终极交叉核对: app SUB_MODEL_PRE_EQ ↔ D:/NAMmodel/knob 捕获 JSON 寄存器.
吉他模型 preEQ 必须 == 捕获 regs (44-47/59-62/74-77); 贝斯模型用新贝斯设计表, 允许差异."""
import io, sys, os, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
BASE = "C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/"
KNOB = "D:/NAMmodel/knob"

pm = open(BASE + "parameterMap.ts", encoding='utf-8').read()
pd = open(BASE + "pedalData.ts", encoding='utf-8').read()

# ── 解析 SUB_MODEL_PRE_EQ ──
blk = pm[pm.index("const SUB_MODEL_PRE_EQ"):]
preq = {}
for mm in re.finditer(r'"([^"]+/[^"]+)":\s*\{', blk):
    key = mm.group(1); j = mm.end()-1; depth=1; k=j+1
    while depth > 0 and k < len(blk):
        if blk[k] == '{': depth += 1
        elif blk[k] == '}': depth -= 1
        k += 1
    body = blk[j:k]
    regs = [int(x) for x in re.findall(r'regs:\s*\[([0-9,\s]+)\]', body)[0].split(',')]
    vals = [int(x, 16) for x in re.findall(r'values:\s*\[([0-9xX,\sA-Fa-f]+)\]', body)[0].replace(' ', '').split(',')]
    preq[key] = (regs, vals)

# ── 索引全部捕获文件: base → [(path, isbass)] ──
SUFFIXES = ['_pedal_soft_bfx1', '_pedal_hard_bfx1', '_bass_amp_bfx1', '_amp_bfx1', '_boost_bfx1']
idx = {}
for root, dirs, files in os.walk(KNOB):
    for f in files:
        base = None
        for s in SUFFIXES:
            if f.endswith(s + '.json'):
                base = f[:-len(s) - 5]
                break
        if base is None: continue
        d = root.replace('\\', '/')
        isbass = 'bass' in d
        idx.setdefault(base, []).append({'path': os.path.join(root, f), 'dir': d, 'bass': isbass})

# ── 遍历 subModels ──
def module_seg(mod):
    return {'overdrive': [44, 43], 'dist': [59, 58], 'ampHead': [74, 73]}[mod]

print("=" * 110)
print("app PRE_EQ 捕获 key ↔ 捕获 JSON 寄存器交叉核对")
print("=" * 110)
problems = []
ok = 0
for mod, (seg0, _byp) in [('overdrive', (44, 43)), ('dist', (59, 58)), ('ampHead', (74, 73))]:
    i = pd.find('const %s: ModuleConfig' % mod)
    j = pd.find('\nconst ', i + 10)
    seg = pd[i:j]
    print("\n##### %s (preEQ regs %d-%d) #####" % (mod, seg0, seg0 + 3))
    for m in re.finditer(r'name: "([^"]+)"[\s\S]*?captures: \[\s*([\s\S]*?)\]', seg):
        name = m.group(1)
        disabled = 'disabled: true' in m.group(0)
        for cap in re.findall(r'pos: "([^"]+)"', m.group(2)):
            key = "%s/%s" % (name, cap)
            if key not in preq:
                problems.append(("NO PRE_EQ", key))
                print("  !! %s : 无 PRE_EQ 条目!" % key)
                continue
            regs, vals = preq[key]
            # 找捕获
            cands = idx.get(cap, [])
            if not cands:
                problems.append(("NO CAPTURE FILE", key))
                print("  ?? %s : 找不到捕获文件 (base=%s)" % (key, cap))
                continue
            c = cands[0]
            capdata = json.load(open(c['path'], encoding='utf-8'))
            capvals = [int(capdata[str(r)]) for r in (seg0, seg0 + 1, seg0 + 2, seg0 + 3)]
            match = (list(vals) == capvals)
            tag = 'OK ' if match else 'DIFF'
            if not match:
                problems.append(("PRE_EQ != CAPTURE", key))
            # 贝斯设计表允许差异 → 标注
            btag = ' BASS(设计表)' if c['bass'] or disabled else ''
            print("  [%s%s] %s" % (tag, btag, key))
            if not match:
                print("      app  : %s" % ['0x%08X' % v for v in vals])
                print("      捕获 : %s   [%s]" % (['0x%08X' % v for v in capvals], c['dir'].replace(KNOB, '')))
            else:
                ok += 1

print("\n" + "=" * 110)
print("汇总: 匹配 %d 条" % ok)
print("=" * 110)
if problems:
    print("发现问题 %d 类 (NO CAPTURE / NO PRE_EQ / DIFF):" % len(problems))
    for t, k in problems:
        print("  [%s] %s" % (t, k))
else:
    print("  全部一致 ✓")
