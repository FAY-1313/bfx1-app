# -*- coding: utf-8 -*-
"""PRE EQ v3 全面应用 (Part A+B+E):
权威表 D:\\NAMmodel\\精选合集5\\Pre_EQ电路表_v3.csv → 写入:
  1. parameterMap.ts  SUB_MODEL_PRE_EQ (吉他 过载/失真/箱头 values 替换为 v3; 贝斯原样保留)
  2. presetData.ts    OVERDRIVE_DEFAULTS 吉他过载 44-47+50, 吉他失真 59-62+65
  3. presetData.ts    AMP_HEAD_HIDDEN 吉他箱头 74-77+80
编码规则: HPF(4)/LPF(5) 2阶, q=10, s=0, gain=120;
  LowShelf(1)/HighShelf(2) q=16, s=10; Peak(0) q=最近邻, s=10.
  gainIdx = 120 ± N*5; DC: 对称=50, 非对称=32, 实测(N)=N.
运行: python _preq_v3_apply.py   (仅 __main__ 下执行)
"""
import io, sys, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__)) + os.sep
PM_PATH = BASE + "parameterMap.ts"
PD_PATH = BASE + "presetData.ts"
V3_CSV = r"D:\NAMmodel\精选合集5\Pre_EQ电路表_v3.csv"

# ── 1. 提取 PEQ 表 ────────────────────────────────────────────────
pm_src = open(PM_PATH, encoding='utf-8').read()

def extract_num_list(name):
    m = re.search(r'export const %s: number\[\] = \[([^\]]+)\]' % name, pm_src)
    return [float(x) for x in re.findall(r'[\d.]+', m.group(1))]

PEQ_FREQ = extract_num_list('PEQ_FREQ_TABLE')
PEQ_Q    = extract_num_list('PEQ_Q_TABLE')
PEQ_S    = extract_num_list('PEQ_S_TABLE')

def nearest_idx(table, target):
    best, bd = 0, float('inf')
    for i, v in enumerate(table):
        d = abs(v - target)
        if d < bd:
            bd, best = d, i
    return best

def freq_idx(hz): return nearest_idx(PEQ_FREQ, hz)
def q_idx(q):     return nearest_idx(PEQ_Q, q)

def build_peq(ptype, fhz, gain_db, q=None, s=None):
    """ptype: 'HPF'/'LPF'/'Peak'/'LowShelf'/'HighShelf'"""
    t = {'HPF': 4, 'LPF': 5, 'Peak': 0, 'LowShelf': 1, 'HighShelf': 2}[ptype]
    f = freq_idx(fhz)
    g = max(0, min(255, 120 + round(gain_db / 0.2)))
    if ptype in ('HPF', 'LPF'):
        qi, si = 10, 0
    elif ptype in ('LowShelf', 'HighShelf'):
        qi, si = 16, 10
    else:  # Peak
        qi, si = q_idx(q), 10
    return (t & 0x7) | ((f & 0x1ff) << 3) | ((g & 0xff) << 12) | ((qi & 0x7f) << 20) | ((si & 0x1f) << 27)

# ── 2. 解析 v3 CSV ────────────────────────────────────────────────
SEG_RE = re.compile(
    r'^(HPF|LPF|LowShelf|HighShelf|Peak)@(\d+)Hz'
    r'(?:\s*([+-]\d+)\s*dB)?(?:\s*\(([QS])([\d.]+)\))?$')

def parse_seg(txt):
    m = SEG_RE.match(txt.strip())
    assert m, "段解析失败: %r" % txt
    kind, fhz, gain_db, skey, sval = m.group(1), float(m.group(2)), m.group(3), m.group(4), m.group(5)
    g = float(gain_db) if gain_db is not None else 0.0
    qv = float(sval) if (skey == 'Q' and sval) else None
    sv = float(sval) if (skey == 'S' and sval) else None
    if kind == 'Peak':
        assert qv is not None
        return build_peq(kind, fhz, g, q=qv)
    if kind in ('LowShelf', 'HighShelf'):
        assert sv is not None
        return build_peq(kind, fhz, g)
    return build_peq(kind, fhz, g)

def parse_dc(txt):
    txt = txt.strip()
    m = re.search(r'实测\(?(\d+)\)?', txt)
    if m:
        return int(m.group(1))
    if '非对称' in txt:
        return 32
    return 50  # 对称

v3 = {}   # 型号名 → (values[4], dc)
def read_any_enc(path):
    for enc in ('utf-8-sig', 'gbk', 'gb18030'):
        try:
            return open(path, encoding=enc).read()
        except (UnicodeDecodeError, LookupError):
            continue
    return open(path, encoding='utf-8', errors='replace').read()
rows = [l.rstrip('\n') for l in read_any_enc(V3_CSV).splitlines()]
header = None
for ln in rows:
    if not ln.strip():
        continue
    parts = [p.strip() for p in ln.split(',')]
    if parts[0] == '类别' or (len(parts) < 6):
        if parts and parts[0] == '类别':
            header = parts
        continue
    cat, name = parts[0], parts[1]
    s1, s2, s3, s4, dc = parts[2], parts[3], parts[4], parts[5], parts[6]
    vals = [parse_seg(s1), parse_seg(s2), parse_seg(s3), parse_seg(s4)]
    v3[name] = (vals, parse_dc(dc))
print("v3 行解析: %d 条" % len(v3))

# ── 3. Part E 未覆盖模型设计 ──────────────────────────────────────
v3['JC120'] = ([build_peq('HPF', 50, 0),
                build_peq('Peak', 500, -1, q=0.8),
                build_peq('Peak', 2000, +1, q=1.0),
                build_peq('HighShelf', 5000, +2)], 50)
v3['BBPreamp'] = ([build_peq('HPF', 60, 0),
                   build_peq('Peak', 500, +3, q=0.8),
                   build_peq('Peak', 2000, -1, q=1.0),
                   build_peq('HighShelf', 6000, +1)], 50)

# ── 4. 型号映射 (key → v3 行名) ───────────────────────────────────
OD_MAP = {
    "B&F NAM Boss BD-2/Boss BD-2": "BD-2", "B&F NAM Boss BD-2/Boss BD-2_2": "BD-2",
    "B&F NAM Boss OD-3/Boss OD-3": "OD-3",
    "B&F NAM Boss SD-1/Boss SD-1": "SD-1", "B&F NAM Boss SD-1/Boss SD-1_2": "SD-1",
    "B&F NAM Fulltone OCD/Fulltone OCD": "OCD", "B&F NAM Fulltone OCD/Fulltone OCD_2": "OCD",
    "B&F NAM Horizon Precision Drive/Horizon Precision Drive": "PrecisionDrive",
    "B&F NAM Horizon Precision Drive/Horizon Precision Drive_2": "PrecisionDrive",
    "B&F NAM Ibanez TS808/Ibanez TS808": "TS808", "B&F NAM Ibanez TS808/Ibanez TS808_2": "TS808",
    "B&F NAM Ibanez TS9/Ibanez TS9": "TS9", "B&F NAM Ibanez TS9/Ibanez TS9_2": "TS9",
    "B&F NAM JHS Morning Glory/JHS Morning Glory": "MorningGlory",
    "B&F NAM JHS Morning Glory/JHS Morning Glory_2": "MorningGlory",
    "B&F NAM Klon Centaur/Klon Centaur": "Klon", "B&F NAM Klon Centaur/Klon Centaur_2": "Klon",
    "B&F NAM ProCo RAT/ProCo RAT": "RAT", "B&F NAM ProCo RAT/ProCo RAT_2": "RAT",
    "B&F NAM Wampler Tumnus/Wampler Tumnus": "Tumnus",
}
DIST_MAP = {
    "B&F NAM Boss DS-1/Boss DS-1": "DS-1", "B&F NAM Boss DS-1/Boss DS-1_2": "DS-1",
    "B&F NAM Boss DS-2/Boss DS-2": "DS-2",
    "B&F NAM Boss HM-2/Boss HM-2": "HM-2", "B&F NAM Boss HM-2/Boss HM-2_2": "HM-2",
    "B&F NAM Boss MT-2/Boss MT-2": "MT-2", "B&F NAM Boss MT-2/Boss MT-2_2": "MT-2",
    "B&F NAM Boss OS-2/Boss OS-2": "OS-2",
    "B&F NAM MXR Distortion+/MXR Distortion+": "MXRDist",
    "B&F NAM MXR Distortion+/MXR Distortion+_2": "MXRDist",
    "B&F NAM EHX Big Muff/EHX Big Muff": "BigMuff", "B&F NAM EHX Big Muff/EHX Big Muff_2": "BigMuff",
}
AMP_FAMILY = [
    ("Marshall", "Marshall"), ("Fender", "Fender"), ("Mesa", "Mesa/Boogie"), ("Vox", "Vox"),
    ("Peavey", "Peavey"), ("EVH", "EVH"), ("Orange", "Orange"), ("ENGL", "ENGL"),
    ("Friedman", "Friedman"), ("Soldano", "Soldano"), ("Diezel", "Diezel"), ("Bogner", "Bogner"),
    ("PRS", "PRS"), ("Dumble", "Dumble"), ("Hiwatt", "Hiwatt"),
    ("JC120", "JC120"), ("BB Preamp", "BBPreamp"),
]
def amp_row(key):
    for sub, row in AMP_FAMILY:
        if sub in key:
            return row
    return None

def hex8(v): return '0x%08X' % (v & 0xFFFFFFFF)

# ── 5. 重写 parameterMap.ts SUB_MODEL_PRE_EQ ──────────────────────
start = pm_src.index('const SUB_MODEL_PRE_EQ')
end = pm_src.index('};', pm_src.index('values:', start)) + 2
block = pm_src[start:end]
out_lines = []
changed = 0
for ln in block.splitlines():
    m = re.match(r'^\s*"([^"]+)":\s*\{.*$', ln)
    if not m:
        out_lines.append(ln)
        continue
    key, row = m.group(1), None
    if key in OD_MAP:
        row = OD_MAP[key]
    elif key in DIST_MAP:
        row = DIST_MAP[key]
    else:
        row = amp_row(key)
    if row is None or row not in v3:
        out_lines.append(ln)   # 贝斯条目原样保留
        continue
    vals = v3[row][0]
    newvals = ', '.join(hex8(x) for x in vals)
    out_lines.append(re.sub(r'values: \[[0-9A-Fa-fxX, ]+\]', 'values: [' + newvals + ']', ln))
    changed += 1
new_block = '\n'.join(out_lines)
pm_new = pm_src[:start] + new_block + pm_src[end:]
open(PM_PATH, 'w', encoding='utf-8').write(pm_new)
print("SUB_MODEL_PRE_EQ 更新 %d 条吉他条目 (贝斯保留)" % changed)

# ── 6. 重写 presetData.ts OVERDRIVE_DEFAULTS ──────────────────────
pd_src = open(PD_PATH, encoding='utf-8').read()

def replace_addrs_in_entry(pd_src, key, addr_vals):
    """在 key 条目块内替换 addr:0xXXXX 全部出现 (hidden + allRegs)"""
    ki = pd_src.find('"%s": {' % key)
    if ki < 0:
        return pd_src, False
    j = pd_src.index('{', ki) + 1
    depth, k = 1, j
    while depth > 0 and k < len(pd_src):
        if pd_src[k] == '{': depth += 1
        elif pd_src[k] == '}': depth -= 1
        k += 1
    body = pd_src[j:k - 1]
    for addr, newv in addr_vals.items():
        body = re.sub(r'\b%d:0x[0-9A-Fa-f]{8}\b' % addr, '%d:%s' % (addr, hex8(newv)), body)
    return pd_src[:ki] + pd_src[ki:j] + body + pd_src[k - 1:], True

od_changed = dist_changed = 0
for key, row in OD_MAP.items():
    vals, dc = v3[row]
    pd_src, ok = replace_addrs_in_entry(pd_src, key, {44: vals[0], 45: vals[1], 46: vals[2], 47: vals[3], 50: dc})
    if ok: od_changed += 1
for key, row in DIST_MAP.items():
    vals, dc = v3[row]
    pd_src, ok = replace_addrs_in_entry(pd_src, key, {59: vals[0], 60: vals[1], 61: vals[2], 62: vals[3], 65: dc})
    if ok: dist_changed += 1
print("OVERDRIVE_DEFAULTS: 过载 %d 条, 失真 %d 条" % (od_changed, dist_changed))

# ── 7. 重写 presetData.ts AMP_HEAD_HIDDEN ─────────────────────────
ah_start = pd_src.index('export const AMP_HEAD_HIDDEN:')
ah_end = pd_src.index('};', ah_start) + 2
ah_block = pd_src[ah_start:ah_end]
amp_changed = 0
for mm in re.finditer(r'"([^"]+/[^"]+)":\s*\{', ah_block):
    key = mm.group(1)
    row = amp_row(key)
    if row is None or row not in v3:
        continue
    vals, dc = v3[row]
    ah_block, ok = replace_addrs_in_entry(ah_block, key,
        {74: vals[0], 75: vals[1], 76: vals[2], 77: vals[3], 80: dc})
    if ok:
        amp_changed += 1
pd_new = pd_src[:ah_start] + ah_block + pd_src[ah_end:]
open(PD_PATH, 'w', encoding='utf-8').write(pd_new)
print("AMP_HEAD_HIDDEN 更新 %d 条吉他箱头 (贝斯保留)" % amp_changed)

# ── 8. 校验: 重读 app 值 vs v3 重算 ───────────────────────────────
def read_preq_after():
    src = open(PM_PATH, encoding='utf-8').read()
    blk = src[src.index('const SUB_MODEL_PRE_EQ'):]
    out = {}
    for mm in re.finditer(r'"([^"]+/[^"]+)":\s*\{', blk):
        key = mm.group(1); j = mm.end() - 1; depth = 1; k = j + 1
        while depth > 0 and k < len(blk):
            if blk[k] == '{': depth += 1
            elif blk[k] == '}': depth -= 1
            k += 1
        vals = [int(x, 16) for x in re.findall(r'values:\s*\[([0-9xX,\sA-Fa-f]+)\]', blk[j:k])[0].replace(' ', '').split(',')]
        out[key] = vals
    return out

ok = miss = bad = 0
for key in list(OD_MAP) + list(DIST_MAP):
    row = OD_MAP.get(key) or DIST_MAP.get(key)
    expect = v3[row][0]
    cur = read_preq_after().get(key)
    if cur is None: miss += 1; print("  MISS %s" % key); continue
    if cur == expect: ok += 1
    else: bad += 1; print("  BAD %s\n    exp %s\n    got %s" % (key, [hex8(x) for x in expect], [hex8(x) for x in cur]))
for key, row in [(k, amp_row(k)) for k in read_preq_after() if amp_row(k)]:
    if row not in v3: continue
    expect = v3[row][0]
    cur = read_preq_after().get(key)
    if cur == expect: ok += 1
    else: bad += 1; print("  BAD %s" % key)
print("=" * 70)
print("校验: 匹配 %d, 缺失 %d, 不符 %d" % (ok, miss, bad))
print("RESULT: %s" % ("PASS ✓" if bad == 0 and miss == 0 else "FAIL ✗"))
