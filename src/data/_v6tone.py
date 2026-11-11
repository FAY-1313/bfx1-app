# -*- coding: utf-8 -*-
"""Decode preEQ(44-47)/postEQ(53-56) hex from V6 jsons → type/freqHz/gaindB.
Goal: confirm postEQ band freqs (which band = TONE anchor) + per-model knob data."""
import os, sys, io, glob, csv, json, re
from collections import defaultdict
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT='D:/NAMmodel/精选合集5'

SRC=open(os.path.join(os.path.dirname(__file__),'_peq_ref.py'),encoding='utf-8').read()
PEQ=eval(re.search(r'PEQ_FREQ_TABLE\s*=\s*(\[[^\]]*\])',SRC,re.S).group(1))
T={'0':'PEAK','1':'LOW_SHELF','2':'HIGH_SHELF'}
def dec(v):
    typ=(v>>0)&0x7; fi=(v>>3)&0x1ff; gi=(v>>12)&0xff; q=(v>>20)&0x7f; s=(v>>27)&0x1f
    return T[str(typ)], PEQ[fi], -24+gi*0.2, q, s
def fmt(v):
    t,f,g,q,s=dec(v); return f"{t} {f:>6.0f}Hz {g:+5.1f}dB"

def load_manifest():
    m={}
    with open(os.path.join(ROOT,'精选合集5_清单.csv'),encoding='utf-8-sig') as f:
        for r in csv.DictReader(f): m[r['文件名'][:-4]]=r
    return m
man=load_manifest()

def show(cat,label):
    jsons=sorted(glob.glob(os.path.join(ROOT,cat,'*_bfx1.json')))
    print("="*110); print(f"{label} ({len(jsons)} 快照)"); print("="*110)
    for j in jsons:
        base=os.path.basename(j)[:-10]
        d=json.load(open(j,encoding='utf-8'))
        try:
            dr=int(d.get('49',0)); dc=int(d.get('50',0)); vl=int(d.get('51',0))
            pre=[fmt(int(d[str(44+i)])) for i in range(4)]
            post=[fmt(int(d[str(53+i)])) for i in range(4)]
        except Exception as e:
            print(f"{base}: ERR {e}"); continue
        m=man.get(base,{})
        model=m.get('型号','?'); pick=m.get('pick','?')
        print(f"\n▍{model} Pick{pick} {base}")
        print(f"   drive={dr} dc={dc} vol={vl}")
        print(f"   preEQ : "+" | ".join(pre))
        print(f"   postEQ: "+" | ".join(post))
show('pedal_soft','吉他过载 pedal_soft')
show('bass_pedal_soft','贝斯过载 bass_pedal_soft')
