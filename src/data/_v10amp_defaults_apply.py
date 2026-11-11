# -*- coding: utf-8 -*-
"""Part (req1): AMP_HEAD_KNOB_DEFAULTS 的 GAIN/VOLUME/MASTER 改为分组甜点 (dB)
CLEAN(吉他+贝斯)=5/-3/-10; CRUNCH=20/-6/-11; HIGH GAIN=30/-9/-12.
音调四颗(BASS/MIDDLE/TREBLE/PRESENCE)与 RESONANCE/CUT 保持不变.
运行: python _v10amp_defaults_apply.py   (仅 __main__ 下执行)
"""
import io, sys, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__)) + os.sep
PD_PATH = BASE + "presetData.ts"

# 分组: 关键词 (pos 前缀, 去 _2 后缀) -> (GAIN_norm, VOLUME_norm, MASTER_norm)
# 换算: GAIN display=linearMeta(0,46,0.5,'dB') reg=n*92 ; VOLUME=infVolumeMeta(-30,0.25) reg=n*288
#       MASTER=infVolumeMeta(-40,0.1) reg=n*500
GROUPS = {
    'CLEAN':   ([
        # 贝斯
        "Ampeg", "Eden", "Gallien-Krueger", "Hartke", "Markbass",
        # 吉他清音
        "Dumble ODS", "Fender", "Hiwatt", "Roland JC120",
    ], (0.1087, 0.9, 0.75)),       # 5dB/-3dB/-10dB
    'CRUNCH': ([
        "Friedman", "Marshall", "Orange", "Vox AC", "Xotic BB",
    ], (0.4348, 0.8, 0.725)),      # 20dB/-6dB/-11dB
    'HIGH': ([
        "Bogner", "Diezel", "ENGL", "EVH 5150III", "Mesa", "Soldano", "PRS", "Peavey",
    ], (0.6522, 0.7, 0.7)),        # 30dB/-9dB/-12dB
}


def find_block(src):
    m = src.index('export const AMP_HEAD_KNOB_DEFAULTS: Record<string, Record<string, number>> = {')
    i = src.index('{', m)
    depth = 1
    j = i + 1
    while depth > 0:
        if src[j] == '{':
            depth += 1
        elif src[j] == '}':
            depth -= 1
        j += 1
    return i, j  # src[i:j] = `{ ... }`


def match_group(pos):
    pos = re.sub(r'_2$', '', pos)
    for label, (kws, _vals) in GROUPS.items():
        for kw in kws:
            if pos.startswith(kw):
                return label
    return None


ENTRY_RE = re.compile(r'^(\s*)"([^"]+)"\s*:\s*\{\s*(.*?)\s*\},?$')


def process():
    src = open(PD_PATH, encoding='utf-8').read()
    start, end = find_block(src)
    block = src[start:end]
    out_lines = []
    n = 0
    for line in block.split('\n'):
        mm = ENTRY_RE.match(line)
        if not mm:
            out_lines.append(line)
            continue
        indent, key, body = mm.group(1), mm.group(2), mm.group(3)
        pos = key.split('/')[-1]
        grp = match_group(pos)
        if grp is None:
            raise SystemExit("FAIL: 未匹配分组 %s" % key)
        gain, vol, mast = GROUPS[grp][1]
        def setv(s, name, val):
            return re.sub(r'%s:\s*[\d.]+' % name, '%s: %s' % (name, val), s, count=1)
        body = setv(body, 'GAIN', gain)
        body = setv(body, 'VOLUME', vol)
        body = setv(body, 'MASTER', mast)
        out_lines.append('%s"%s": { %s },' % (indent, key, body))
        n += 1
    new_block = '\n'.join(out_lines)
    open(PD_PATH, 'w', encoding='utf-8').write(src[:start] + new_block + src[end:])
    print("重写 %d 条 AMP_HEAD_KNOB_DEFAULTS 的 GAIN/VOLUME/MASTER 为分组甜点" % n)
    # 校验
    src2 = open(PD_PATH, encoding='utf-8').read()
    s2, e2 = find_block(src2)
    b2 = src2[s2:e2]
    checked = 0
    for line in b2.split('\n'):
        mm = ENTRY_RE.match(line)
        if not mm:
            continue
        pos = mm.group(2).split('/')[-1]
        grp = match_group(pos)
        gain, vol, mast = GROUPS[grp][1]
        body = mm.group(3)
        if 'GAIN: %s' % gain not in body or 'VOLUME: %s' % vol not in body or 'MASTER: %s' % mast not in body:
            raise SystemExit("FAIL 校验: %s" % mm.group(2))
        checked += 1
    print("校验通过 %d 条 (CLEAN/CRUNCH/HIGH 计数: %s)" % (
        checked, {g: sum(1 for line in b2.split('\n') if (lambda m: m and match_group(m.group(2).split('/')[-1]) == g)(ENTRY_RE.match(line))) for g in GROUPS}))


if __name__ == '__main__':
    process()
