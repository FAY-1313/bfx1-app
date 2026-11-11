# -*- coding: utf-8 -*-
"""Rebuild presetData.ts cleanly from intact head + generated AMP sections.

The corrupted file (from the bad line-number splice) still has intact:
  L1-180   head (imports, interface, RATIO_TABLE, COMPRESSOR_DEFAULTS, CHORUS_DEFAULTS)
  L181-627 OVERDRIVE_DEFAULTS with the NEW generated body (verified == _gen/overdrive_defaults.ts)
  L628-645 comments + AMP_HEAD_HIDDEN_DEFAULT

AMP_HEAD_HIDDEN and AMP_HEAD_KNOB_DEFAULTS (last two sections, EOF after)
are rebuilt from the generated bodies.
"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def read_lines(p):
    return open(p, encoding='utf-8').read().split('\n')

def write_lines(p, lines):
    open(p, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))

cur = read_lines('presetData.ts')
assert cur[180].startswith('export const OVERDRIVE_DEFAULTS'), f"L181 unexpected: {cur[180]!r}"
assert cur[626].strip() == '};', f"L627 unexpected: {cur[626]!r}"
assert cur[637].startswith('export const AMP_HEAD_HIDDEN_DEFAULT'), f"L638 unexpected: {cur[637]!r}"
assert cur[643].strip() == '};', f"L644 unexpected: {cur[643]!r}"

head = cur[:645]  # L1-645, ends after blank line following AMP_HEAD_HIDDEN_DEFAULT close
assert head[-1].strip() == '', f"L645 should be blank, got {head[-1]!r}"

amp_hidden = read_lines('_gen/amp_hidden.ts')
amp_knob = read_lines('_gen/amp_knob_defaults.ts')

out = head + [
    'export const AMP_HEAD_HIDDEN: Record<string, Record<number, number>> = {',
] + amp_hidden + [
    '};',
    '',
    'export const AMP_HEAD_KNOB_DEFAULTS: Record<string, Record<string, number>> = {',
] + amp_knob + [
    '};',
]

write_lines('presetData.ts', out)
print(f'REBUILT presetData.ts: {len(out)} lines '
      f'(head {len(head)} + hidden {len(amp_hidden)} + knob {len(amp_knob)})')
