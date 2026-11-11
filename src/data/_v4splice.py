# -*- coding: utf-8 -*-
"""Splice generated V4 data bodies into the 4 target TS files at exact line ranges."""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def read_lines(p):
    return open(p, encoding='utf-8').read().split('\n')

def write_lines(p, lines):
    open(p, 'w', encoding='utf-8').write('\n'.join(lines))

def splice(path, start, end, new_lines, label):
    """Replace lines[start-1:end] (1-indexed inclusive) with new_lines."""
    lines = read_lines(path)
    head = lines[:start-1]
    tail = lines[end:]
    out = head + new_lines + tail
    write_lines(path, out)
    print(f'[{label}] {path}: replaced L{start}-{end} with {len(new_lines)} lines -> total {len(out)}')

def body_of(path):
    return read_lines(path)

# ── 1. presetData.ts ───────────────────────────────────────────────
# OVERDRIVE_DEFAULTS header L181, body L182-842, close L843
od_def = body_of('_gen/overdrive_defaults.ts')
splice('presetData.ts', 182, 842, od_def, 'OVERDRIVE_DEFAULTS')

# AMP_HEAD_HIDDEN header L862, body L863-7359, close L7360
amp_hid = body_of('_gen/amp_hidden.ts')
splice('presetData.ts', 863, 7359, amp_hid, 'AMP_HEAD_HIDDEN')

# AMP_HEAD_KNOB_DEFAULTS header L7362, body L7363-7587, close L7588
amp_knb = body_of('_gen/amp_knob_defaults.ts')
splice('presetData.ts', 7363, 7587, amp_knb, 'AMP_HEAD_KNOB_DEFAULTS')

# ── 2. cabinetPeqData.ts ───────────────────────────────────────────
cab = body_of('_gen/cabinet_peq.ts')
splice('cabinetPeqData.ts', 2, 153, cab, 'CABINET_PEQ')

print('DONE part 1')
