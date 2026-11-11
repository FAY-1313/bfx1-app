# -*- coding: utf-8 -*-
"""Fit 4-band PEQ (LowShelf + 2Peak + HighShelf) to model response curve via RBJ biquads."""
import os, sys, io, re, math, cmath
from collections import defaultdict
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
FS=48000.0
def biquad_mag(freq, coeffs):
    w=2*math.pi*freq/FS
    b0,b1,b2,a0,a1,a2=coeffs
    z1=cmath.exp(-1j*w); z2=cmath.exp(-2j*w)
    return abs((b0+b1*z1+b2*z2)/(a0+a1*z1+a2*z2))
def rbj_peak(f0,g_db,Q):
    A=10**(g_db/40); w0=2*math.pi*f0/FS; al=math.sin(w0)/(2*Q)
    return (1+al*A, -2*math.cos(w0), 1-al*A, 1+al/A, -2*math.cos(w0), 1-al/A)
def rbj_lowshelf(f0,g_db,S=1.0):
    A=10**(g_db/40); w0=2*math.pi*f0/FS; al=math.sin(w0)/2*math.sqrt((A+1/A)*(1/S-1)+2)
    b0=A*((A+1)-(A-1)*math.cos(w0)+2*math.sqrt(A)*al); b1=2*A*((A-1)-(A+1)*math.cos(w0)); b2=A*((A+1)-(A-1)*math.cos(w0)-2*math.sqrt(A)*al)
    a0=(A+1)+(A-1)*math.cos(w0)+2*math.sqrt(A)*al; a1=-2*((A-1)+(A+1)*math.cos(w0)); a2=(A+1)+(A-1)*math.cos(w0)-2*math.sqrt(A)*al
    return (b0,b1,b2,a0,a1,a2)
def rbj_highshelf(f0,g_db,S=1.0):
    A=10**(g_db/40); w0=2*math.pi*f0/FS; al=math.sin(w0)/2*math.sqrt((A+1/A)*(1/S-1)+2)
    b0=A*((A+1)+(A-1)*math.cos(w0)+2*math.sqrt(A)*al); b1=-2*A*((A-1)+(A+1)*math.cos(w0)); b2=A*((A+1)+(A-1)*math.cos(w0)-2*math.sqrt(A)*al)
    a0=(A+1)-(A-1)*math.cos(w0)+2*math.sqrt(A)*al; a1=2*((A-1)-(A+1)*math.cos(w0)); a2=(A+1)-(A-1)*math.cos(w0)-2*math.sqrt(A)*al
    return (b0,b1,b2,a0,a1,a2)
def peq_response(bands, freqs):
    """bands: [(type, f0, gdb, Q)] type 0=peak 1=ls 2=hs"""
    out=[]
    for f in freqs:
        db=0.0
        for typ,f0,g,Q in bands:
            c = rbj_peak(f0,g,Q) if typ==0 else (rbj_lowshelf(f0,g) if typ==1 else rbj_highshelf(f0,g))
            db += 20*math.log10(biquad_mag(f,c))
        out.append(db)
    return out
def rmse(a,b): return math.sqrt(sum((x-y)**2 for x,y in zip(a,b))/len(a))
def fit_model(freqs, curve):
    """freqs,curve: lists. Coordinate-descent fit. Returns bands list."""
    import random
    # normalize curve to 0dB @1kHz
    def cdb(f): return curve[min(range(len(freqs)),key=lambda i:abs(freqs[i]-f))]
    ref=cdb(1000.0)
    tgt=[c-ref for c in curve]
    # initial guess from features
    lo=[f for f in freqs if f<=300]; pk=[f for f in freqs if 150<=f<=2500]
    lo_cut=next((f for f in freqs if tgt[min(range(len(freqs)),key=lambda i:abs(freqs[i]-f))]>=-6),20.0)
    pkf=max(pk,key=lambda f: cdb(f)); pkdb=cdb(pkf)-ref
    hi=[f for f in freqs if f>=3000]; hif=min(hi,key=lambda f:abs(cdb(f)-cdb(max(hi,key=lambda x:cdb(x)))+3)) if hi else 6000.0
    hmax=max(cdb(f) for f in hi) if hi else 0
    # bands: LS @ lo_cut, g=lowend-level below ref; peaks; HS
    low_g = cdb(40.0)-ref if freqs[0]<60 else 0
    bands=[(1, max(20,min(800,lo_cut)), max(-12,min(6,low_g)), 0.8),
           (0, pkf, max(-6,min(6,pkdb)), 1.0),
           (0, 1800, 0.0, 1.0),
           (2, hif if hif>3000 else 6000, max(-12,min(6,hmax-ref)), 0.8)]
    # coordinate descent
    best=bands[:]; besterr=rmse(peq_response(best,freqs),tgt)
    param_spec=[(1,[25,40,63,100,160,250,400],[12,8,6,5,4,3,2.5],[-12,-9,-6,-3,0,3],[]),
                (0,[f for f in freqs if 120<=f<=2500],[2.5,2,1.5,1,0.8,0.6],[ -8,-6,-4,-2,0,2,4],[]),
                (0,[f for f in freqs if 800<=f<=6000],[2.5,2,1.5,1,0.8,0.6],[-8,-6,-4,-2,0,2,4],[]),
                (2,[3000,4000,6000,8000,10000],[12,8,6,5,4],[ -12,-9,-6,-3,0,3,6],[])]
    import itertools
    for _ in range(3):
        for bi,spec in enumerate(param_spec):
            typ,fopts,qq,gg,_=spec
            cur=list(best)
            for fo in fopts:
                for qo in qq:
                    for go in gg:
                        cand=list(best); cand[bi]=(typ,fo,go,qo)
                        e=rmse(peq_response(cand,freqs),tgt)
                        if e<besterr: besterr=e; best=cand
    return best, besterr

# quick test on a synthetic curve
freqs=[20,25,32,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500,16000]
# OD-3 blue curve from features snapshot
od3=[-3,3,4,4,3,2,1,1,0,0,-1,-1,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-10,-9,-9]
# wait, snapshots used f:30,60,120,250,500,800,1000,1500,2000,3000,4000,6000,10000,16000
# rebuild rough full curve via interpolation is messy; just test fit on these 30 log points
curve=[-3,3,4,4,3,2,1,1,0,0,-1,-1,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-10,-9,-9]
bands,err=fit_model(freqs,curve)
print("fitted bands:",[( 'LS' if t==1 else ('HS' if t==2 else 'PK'),round(f,0),round(g,1),q) for t,f,g,q in bands])
print("RMSE:",round(err,2))
resp=peq_response(bands,freqs)
print("fit vs target (every 5th):")
for i in range(0,len(freqs),5):
    print(f"  {freqs[i]:>5}Hz: fit={resp[i]:+.1f} tgt={curve[i]:+.1f}")
