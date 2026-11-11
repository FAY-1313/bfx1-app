# -*- coding: utf-8 -*-
"""Parse fit.svg curves + decode converter postEQ. Verify postEQ == red fit curve."""
import os, sys, io, glob, re, json, math
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
ROOT='D:/NAMmodel/精选合集5'

def dec_peq(v):
    v=v&0xFFFFFFFF
    typ=v&0x7; freq=(v>>3)&0x1FF; gain=(v>>12)&0xFF; q=(v>>20)&0x7F; s=(v>>27)&0x1F
    gdb=-24+gain*0.2
    return dict(type=typ,freq=freq,gain=gain,gdb=gdb,q=q,s=s)

def svg_curves(path):
    """Return (blue, red) point lists [(x,y)]. blue=Original, red=PEQ Fitted."""
    src=open(path,encoding='utf-8').read()
    curves=[]
    for m in re.finditer(r'<path d="([^"]+)" fill="none" stroke="([^"]+)"',src):
        d=m.group(1); stroke=m.group(2)
        pts=[]
        for pair in re.findall(r'([ML])([\d.]+),([\d.]+)',d):
            pts.append((float(pair[1]),float(pair[2])))
        curves.append((stroke,pts))
    return curves

def x_to_freq(x):  # log x: 70->20Hz, 1175->20kHz
    import math
    x0,x1=70.0,1175.0
    log0,log1=math.log10(20),math.log10(20000)
    t=(x-x0)/(x1-x0)
    return 10**(log0+t*(log1-log0))
def y_to_db(y):
    return (198.5-y)/21.82

# verify decode vs red curve for OD-3
for base,cat in [('Boss OD-3','pedal_soft')]:
    d=json.load(open(os.path.join(ROOT,cat,base+'_bfx1.json'),encoding='utf-8'))
    post=[dec_peq(d[str(k)]) for k in (53,54,55,56)]
    print(f"=== {base} postEQ 解码 ===")
    for p in post: print(f"  type{p['type']} f{p['freq']}Hz g{p['gdb']:+.1f}dB q{p['q']} s{p['s']}")
    curves=svg_curves(os.path.join(ROOT,cat,base+'_fit.svg'))
    print(f"  fit.svg curves: {[(c,len(p)) for c,p in curves]}")
    # check title RMSE
    src=open(os.path.join(ROOT,cat,base+'_fit.svg'),encoding='utf-8').read()
    m=re.search(r'\[RMSE=([\d.]+) dB\]',src)
    print(f"  RMSE={m.group(1)} dB")
