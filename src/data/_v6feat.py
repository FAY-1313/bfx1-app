# -*- coding: utf-8 -*-
"""Extract circuit response features from fit.svg blue (Original) curves for all overdrives."""
import os, sys, io, glob, re, math, csv, json
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
ROOT='D:/NAMmodel/精选合集5'
# load PEQ_FREQ_TABLE literal from _peq_ref.py
src=open(r"C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03\src\data\_peq_ref.py",encoding='utf-8').read()
m=re.search(r'PEQ_FREQ_TABLE = \[(.*?)\]',src,re.S)
PEQ_FREQ_TABLE=[float(x) for x in re.findall(r'[\d.]+',m.group(1))]
def freqToIndex(hz): return min(range(len(PEQ_FREQ_TABLE)), key=lambda i: abs(PEQ_FREQ_TABLE[i]-hz))
def x_to_freq(x):
    x0,x1=70.0,1175.0
    t=(x-x0)/(x1-x0)
    return 10**(math.log10(20)+t*(math.log10(20000)-math.log10(20)))
def y_to_db(y): return (198.5-y)/21.82
def svg_blue(path):
    src=open(path,encoding='utf-8').read()
    for m in re.finditer(r'<path d="([^"]+)" fill="none" stroke="([^"]+)"',src):
        if m.group(2)=='#1f77b4':
            pts=[]
            for pair in re.findall(r'[ML]([\d.]+),([\d.]+)',m.group(1)):
                x,y=float(pair[0]),float(pair[1])
                pts.append((x_to_freq(x),y_to_db(y)))
            return pts
    return None
def features(freqs):
    d=dict(freqs); fs=[f for f,_ in freqs]
    def db(f): return d[min(d.keys(),key=lambda k:abs(k-f))]
    ref=db(1000)
    lo_cut=next((f for f in fs if db(f)>=ref-3),None)
    hi_region=[f for f in fs if f>=2000]
    hi_max=max(db(f) for f in hi_region)
    hi_cut=next((f for f in fs if f>=2000 and db(f)>=hi_max-3),None)
    mid=[f for f in fs if 150<=f<=2500]
    pk=max(mid,key=lambda f:db(f)); v_=min(mid,key=lambda f:db(f))
    pres=[f for f in fs if 2000<=f<=8000]
    p_f=max(pres,key=lambda f:db(f))
    return dict(ref=ref,lo_cut=lo_cut,hi_cut=hi_cut,pk_f=pk,pk_db=db(pk),val_f=v_,val_db=db(v_),pres_f=p_f,pres_db=db(p_f))
def nam_model(base,cat):
    try:
        with open(os.path.join(ROOT,cat,base+'.nam'),encoding='utf-8') as f: first=f.readline()
        return json.loads(first).get('metadata',{}).get('name','')
    except Exception: return ''
rep={}
with open(os.path.join(ROOT,'conversion_report.csv'),encoding='utf-8-sig') as f:
    for r in csv.DictReader(f): rep[r['file']]=r
for cat,label in [('pedal_soft','吉他'),('bass_pedal_soft','贝斯')]:
    print(f"\n{'='*110}\n{label}过载 — 电路响应特征 (fit.svg 蓝线)\n{'='*110}")
    for j in sorted(glob.glob(os.path.join(ROOT,cat,'*_bfx1.json'))):
        base=os.path.basename(j)[:-10]
        d=json.load(open(j,encoding='utf-8'))
        if d.get('49') is None:
            print(f"\n[{base}] IR/箱体 — 跳过"); continue
        dr=d.get('49'); vl=d.get('51')
        pts=svg_blue(os.path.join(ROOT,cat,base+'_fit.svg'))
        if not pts: print(f"\n[{base}] 无曲线"); continue
        fe=features(pts); nm=nam_model(base,cat)
        print(f"\n[{base}]  NAM: {nm}  drive={dr} vol={vl}")
        print(f"   ref@1k={fe['ref']:+.1f}dB 低切~{fe['lo_cut']:.0f}Hz 高滚降~{fe['hi_cut']:.0f}Hz | 中频峰={fe['pk_f']:.0f}Hz({fe['pk_db']:+.1f}dB) 谷={fe['val_f']:.0f}Hz({fe['val_db']:+.1f}dB) | presence={fe['pres_f']:.0f}Hz({fe['pres_db']:+.1f}dB)")
        def dbn(f):
            dd=dict(pts); return dd[min(dd.keys(),key=lambda k:abs(k-f))]
        snaps=[f for f in (30,60,120,250,500,800,1000,1500,2000,3000,4000,6000,10000,16000) if f<=max(x for x,_ in pts)]
        print("   "+" ".join(f"{f}:{dbn(f):+.0f}" for f in snaps))
