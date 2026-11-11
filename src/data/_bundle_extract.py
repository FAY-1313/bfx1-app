# -*- coding: utf-8 -*-
"""从 dist/assets/index-BVmdN2fN.js (过载步骤产物) 提取 f2={SUB_MODEL_PRE_EQ} 数据."""
import re, json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
src = open('dist/assets/index-BVmdN2fN.js', encoding='utf-8').read()

m = re.search(r'f2=(\{)', src)
start = m.start(1)
# brace match
depth = 0
end = None
for i in range(start, len(src)):
    c = src[i]
    if c == '{': depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            end = i
            break
obj = src[start:end+1]
print('object length:', len(obj))
# ensure it parses as JSON
data = json.loads(obj)
print('total keys:', len(data))
from collections import Counter
regs_pat = Counter(tuple(v['regs']) for v in data.values())
print('regs patterns:', dict(regs_pat))
json.dump(data, open('src/data/_preq_from_bundle.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('saved to _preq_from_bundle.json')
