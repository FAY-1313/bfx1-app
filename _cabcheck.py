import re
pedal = open('src/data/pedalData.ts', encoding='utf-8').read()
peq = open('src/data/cabinetPeqData.ts', encoding='utf-8').read()
peq_keys = set(re.findall(r'"([^"]+)":', peq))

start = pedal.index('const cabinet: ModuleConfig')
end = pedal.index('const chorus: ModuleConfig')
body = pedal[start:end]

# 以子模型条目开头切分, 每条到下一个 "      { id: \"v8-cab-" 为止
parts = body.split('{ id: "v8-cab-')[1:]
entries = []
for part in parts:
    pid = 'v8-cab-' + part.split('",')[0]
    # 该条内容到下一个条目开头或数组结束
    seg = part[part.index('",') + 2:]
    nxt = seg.find('{ id: "v8-cab-')
    if nxt >= 0:
        seg = seg[:nxt]
    seg = seg.rsplit('}', 1)[0]  # 去掉尾部关闭括号
    nm = re.search(r'name: "([^"]+)"', seg)
    caps = re.findall(r'pos: "([^"]+)"', seg)
    if nm:
        entries.append((pid, nm.group(1), caps))

print('subModels:', len(entries))
missing = []
for pid, name, poss in entries:
    for pos in poss:
        if f'{name}/{pos}' not in peq_keys:
            missing.append((name, pos))
print('missing PEQ:', len(missing))
for n, p in missing:
    print('  MISS:', n, '/', p)
