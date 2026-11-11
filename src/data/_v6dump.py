# -*- coding: utf-8 -*-
"""Dump raw registers 42-71 per capture (authoritative for OVERDRIVE_DEFAULTS)."""
import os, sys, io, glob, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT='D:/NAMmodel/精选合集5'
for cat,label in (('pedal_soft','吉他'),('bass_pedal_soft','贝斯')):
    print("="*100); print(f"{label} {cat}"); print("="*100)
    for j in sorted(glob.glob(os.path.join(ROOT,cat,'*_bfx1.json'))):
        base=os.path.basename(j)[:-10]
        d=json.load(open(j,encoding='utf-8'))
        # find which regs exist: 42-71 od1? use only those present
        keys=[k for k in ('42','43','44','45','46','47','48','49','50','51','52','53','54','55','56',
                          '57','58','59','60','61','62','63','64','65','66','67','68','69','70','71') if k in d]
        vals=[]
        for k in keys:
            v=int(d[k])
            vals.append(f"{k}:0x{v:08X}" if k in ('44','45','46','47','53','54','55','56','59','60','61','62','68','69','70','71') else f"{k}:{v}")
        print(f"{base}\n  "+" ".join(vals))
