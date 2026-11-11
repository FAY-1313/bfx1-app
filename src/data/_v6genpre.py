# -*- coding: utf-8 -*-
"""Generate per-model exclusive preEQ from fit.svg aggregated response + circuit knowledge.
Style mirrors v2 CSV: LowShelf + 2×Peak + HighShelf, mild amplitudes."""
import os, sys, io, re, math, glob, json, csv
from collections import defaultdict
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
ROOT='D:/NAMmodel/精选合集5'
src=open(r"C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03\src\data\_peq_ref.py",encoding='utf-8').read()
PEQ=tuple(float(x) for x in re.findall(r'[\d.]+',re.search(r'PEQ_FREQ_TABLE = \[(.*?)\]',src,re.S).group(1)))
def fi(hz): return min(range(len(PEQ)),key=lambda i:abs(PEQ[i]-hz))
def x_to_freq(x):
    t=(x-70.0)/(1175.0-70.0); return 10**(math.log10(20)+t*(math.log10(20000)-math.log10(20)))
def y_to_db(y): return (198.5-y)/21.82
def blue(path):
    s=open(path,encoding='utf-8').read()
    for m in re.finditer(r'<path d="([^"]+)" fill="none" stroke="([^"]+)"',s):
        if m.group(2)=='#1f77b4':
            return [(x_to_freq(float(a)),y_to_db(float(b))) for a,b in re.findall(r'[ML]([\d.]+),([\d.]+)',m.group(1))]
    return None
def enc(typ,freq,gain,q=16,s=10):
    gain=max(0,min(180,int(round((gain+24)/0.2))))
    return ((typ&0x7)|((freq&0x1ff)<<3)|((gain&0xff)<<12)|((q&0x7f)<<20)|((s&0x1f)<<27))&0xFFFFFFFF
def db_at(fs,dbmap,f):
    return dbmap[min(dbmap.keys(),key=lambda k:abs(k-f))]

def aggregate(files):
    """Average blue curves across captures of one model."""
    curves=[]
    for base,cat in files:
        pts=blue(os.path.join(ROOT,cat,base+'_fit.svg'))
        if pts: curves.append(dict(pts))
    if not curves: return None
    freqs=tuple(sorted(set().union(*[set(c) for c in curves])))
    dbmap={}
    for f in freqs:
        vals=[c[f] if f in c else db_at(fs(c),c,f) for c in curves]
        dbmap[f]=sum(vals)/len(vals)
    # normalize at 1k
    ref=db_at(freqs,dbmap,1000.0)
    return freqs,{f:v-ref for f,v in dbmap.items()}

def features(freqs,db):
    def D(f): return db_at(freqs,db,f)
    lo_cut=next((f for f in freqs if f>30 and D(f)>=-3),30.0)
    lo_depth=D(30.0)
    # mid voice: max in 300-3000
    mid=[f for f in freqs if 300<=f<=3000]
    vf=max(mid,key=lambda f:D(f)); vg=D(vf)
    # mid dip in 300-3000
    df=min(mid,key=lambda f:D(f)); dg=D(df)
    # high region
    hi=[f for f in freqs if f>=3000]
    hmax=max(D(f) for f in hi)
    hc=next((f for f in hi if D(f)<=hmax-3),8000.0)
    h16=D(16000.0) if 16000<=max(freqs) else D(12000.0)
    return dict(lo_cut=lo_cut,lo_depth=lo_depth,vf=vf,vg=vg,df=df,dg=dg,hc=hc,h16=h16)

MODELS={  # main model -> captures (base, cat)
 'Boss BD-2':[('Boss BD-2','pedal_soft'),('Boss BD-2_2','pedal_soft')],
 'Boss OD-3':[('Boss OD-3','pedal_soft')],
 'Boss SD-1':[('Boss SD-1','pedal_soft'),('Boss SD-1_2','pedal_soft')],
 'Fulltone OCD':[('Fulltone OCD','pedal_soft'),('Fulltone OCD_2','pedal_soft')],
 'Horizon Precision Drive':[('Horizon Precision Drive','pedal_soft'),('Horizon Precision Drive_2','pedal_soft')],
 'Ibanez TS808':[('Ibanez TS808','pedal_soft'),('Ibanez TS808_2','pedal_soft')],
 'Ibanez TS9':[('Ibanez TS9','pedal_soft'),('Ibanez TS9_2','pedal_soft')],
 'JHS Morning Glory':[('JHS Morning Glory','pedal_soft'),('JHS Morning Glory_2','pedal_soft')],
 'Klon Centaur':[('Klon Centaur','pedal_soft'),('Klon Centaur_2','pedal_soft')],
 'ProCo RAT':[('ProCo RAT','pedal_soft'),('ProCo RAT_2','pedal_soft')],
 'Wampler Tumnus':[('Wampler Tumnus','pedal_soft')],
 'Aguilar Tone Hammer':[('Aguilar Tone Hammer','bass_pedal_soft'),('Aguilar Tone Hammer_2','bass_pedal_soft')],
 'Darkglass B3K':[('Darkglass B3K','bass_pedal_soft')],
 'EHX Bass Soul Food':[('EHX Bass Soul Food','bass_pedal_soft')],
 'MXR M80':[('MXR M80','bass_pedal_soft'),('MXR M80_2','bass_pedal_soft')],
 'Origin BASSRIG':[('Origin BASSRIG','bass_pedal_soft')],
 'Tech21 SansAmp':[('Tech21 SansAmp','bass_pedal_soft'),('Tech21 SansAmp_2','bass_pedal_soft')],
}
print("=== 主型号聚合响应特征 ===")
for model,files in MODELS.items():
    agg=aggregate(files)
    if not agg: print(f"{model}: 无数据"); continue
    freqs,db=agg
    fe=features(freqs,db)
    print(f"{model:24s} 低切~{fe['lo_cut']:>4.0f}Hz 低端{fe['lo_depth']:+.1f} | 中频峰 {fe['vf']:>4.0f}Hz({fe['vg']:+.1f}) 谷 {fe['df']:>4.0f}Hz({fe['dg']:+.1f}) | 高滚降~{fe['hc']:>4.0f}Hz 16k{fe['h16']:+.1f}")
