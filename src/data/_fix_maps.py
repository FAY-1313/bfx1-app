# -*- coding: utf-8 -*-
"""Rewrite legacy migration map VALUES in overdriveBoost.ts to valid V4 keys.
Keys (legacy names) stay; only the target values change to V4 captures that exist."""
import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

TS   = 'B&F NAM Tube Screamer/82 Ibanez Tube Screamer'
KLON = 'B&F NAM Klon Centaur/DRPS MXR ZW44 Zakk Wylde Overdrive All Knobs 12 o Clock'
PLUM = 'B&F NAM EQD Plumes/Keith B PlumesClone_maxG_t5_switch1'
SANS = 'B&F NAM Tech21 SansAmp/Jason Z Tech21 dUg DP3X bass preamp pedal all dimed no shift'
SD1  = 'B&F NAM Boss SD-1/Boss SD-1 - Level500 Tone1030 Drive500'
DS1  = 'B&F NAM DS-1 Mid/BOSS DISTORTION DS-1 All 12 o Clock'
HM2  = 'B&F NAM Boss HM-2/Boss HM-2 Lo=6, Hi=6, Gain=10'
MT2  = 'B&F NAM MT-2 Scoop/Boss Metal Zone Waza - Deftones (Custom Mode)'
RAT  = 'B&F NAM Proco RAT/Turbo RAT'
FORT = 'B&F NAM Fortin Dirty Tree/Peter N DirtyTree DT-33_V7_Std_ESR-0.0001'
VOX  = 'B&F NAM Vox Chime/Phillipe P VOXAC15-JonAr1'
TWIN = 'B&F NAM Fender Small/Tim R Fender Twin Reverb Ch1 BR G05'
EVH  = 'B&F NAM HiGain Tight/EVH 5153'
MARK = 'B&F NAM Mesa Mark/Roman A LT_MESA_MARKIV_1'
MAR  = 'B&F NAM Marshall/Marshall 1959SLP ALE'
MIG  = 'B&F NAM Marshall/Mikhail K Sovtek MIG50'

DIST_RULES = [
    ('Fortin Grind', FORT), ('Grind', FORT),
    ('HM-2', HM2), ('DS-1', DS1), ('OS-2', HM2),
    ('RAT2', RAT), ('MT-2', MT2), ('Shredmaster', DS1),
]
OD_RULES = [
    ('Klon+BB', KLON), ('Klon', KLON), ('Centaur', KLON),
    ('TS Mini', TS), ('TS9', TS), ('TS808', TS),
    ('dUg DP3X', SANS), ('DP3X', SANS),
    ('Plumes', PLUM), ('M77', KLON), ('Soldano', TS),
    ('SD-1', SD1), ('OCD', SD1),
    ('Sustain Fuzz', KLON), ('Fuzz Face', KLON), ('FZ-M', KLON), ('FY-2', KLON), ('Tone Bender', KLON),
    ('ODB-3', TS), ('M85', TS), ('Microtubes', TS), ('Scrambler', TS), ('Bass Driver', TS), ('Bass OverDrive', TS),
]
AMP_RULES = [
    ('VOX AC15', VOX), ('AC15', VOX),
    ('Fender Twin', TWIN), ('Twin', TWIN),
    ('5150', EVH), ('6505', EVH),
    ('Mesa Mark', MARK), ('Mark IV', MARK),
    ('JCM2000', MAR), ('JCM900', MAR),
    ('MIG50', MIG),
]

def target_for(old, rules):
    for pat, tgt in rules:
        if pat in old:
            return tgt
    return None

src = open('overdriveBoost.ts', encoding='utf-8').read()

for mapname, rules in [('LEGACY_DIST_MAP', DIST_RULES), ('LEGACY_OD_MAP', OD_RULES), ('LEGACY_AMP_MAP', AMP_RULES)]:
    m = re.search(r'(export const %s: Record<string, string> = \{)(.*?)(\n\};\n)' % mapname, src, re.S)
    body = m.group(2)
    entries = re.findall(r'\n\s*(\'[^\']*\'\s*:\s*\')[^\']*(\'\s*,)', body)
    missing = []
    new_entries = []
    for old, tail in entries:
        key = old.split("': ")[0].strip("'")
        tgt = target_for(key, rules)
        if tgt is None:
            missing.append(key)
            tgt = 'TODO'
        new_entries.append(f"\n  '{key}': '{tgt}',")
    new_body = ''.join(new_entries)
    src = src[:m.start(2)] + new_body + src[m.end(2):]
    print(f'{mapname}: {len(entries)} entries, unresolved={missing}')

open('overdriveBoost.ts', 'w', encoding='utf-8', newline='\n').write(src)
print('DONE')
