# -*- coding: utf-8 -*-
import io, sys, collections, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r'D:/NAMmodel/精选合集V4'

def parse_classification():
    sections = collections.OrderedDict()
    cur_sec = None
    cur_arch = None
    lines = open(ROOT + '/分类目录.txt', encoding='utf-8-sig').read().splitlines()
    for raw in lines:
        s = raw.strip()
        if s.startswith('【') and s.endswith('】'):
            cur_sec = s[1:-1]
            sections[cur_sec] = collections.OrderedDict()
            cur_arch = None
            continue
        m = re.match(r'^(.*?)\((\d+)个\):', s)
        if m:
            cur_arch = m.group(1).strip()
            sections[cur_sec][cur_arch] = []
            continue
        if s.endswith('.nam') and cur_sec and cur_arch:
            sections[cur_sec][cur_arch].append(s[:-4])
    return sections

secs = parse_classification()
print('sections:', {k: len(v) for k, v in secs.items()})
print('pedal_soft O-TS:', secs['pedal_soft'].get('O-TS'))
print('total bases:', sum(len(v) for a in secs.values() for v in a.values()))
