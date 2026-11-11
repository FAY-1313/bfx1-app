# -*- coding: utf-8 -*-
"""Per-model exclusive preEQ design (from aggregated fit.svg response + circuit analysis)."""
import sys, io, re
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
src=open(r"C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03\src\data\_peq_ref.py",encoding='utf-8').read()
PEQ=tuple(float(x) for x in re.findall(r'[\d.]+',re.search(r'PEQ_FREQ_TABLE = \[(.*?)\]',src,re.S).group(1)))
def fi(hz): return min(range(len(PEQ)),key=lambda i:abs(PEQ[i]-hz))
def enc(typ,freq,gain,q=16,s=10):
    gi=max(0,min(180,int(round((gain+24)/0.2))))
    return ((typ&0x7)|((freq&0x1ff)<<3)|((gi&0xff)<<12)|((q&0x7f)<<20)|((s&0x1f)<<27))&0xFFFFFFFF
def phys(band):
    t,f,g=band
    name={'LS':'Low','PK':'Pea','HS':'Hig'}[t]
    return f"{name} {PEQ[fi(f)]:.0f}Hz {g:+.1f}dB"
TYP={'LS':1,'PK':0,'HS':2}
# (model, 特点, [(type,freqHz,gaindB),...])
DESIGN=[
 ('Boss BD-2','透明过载,低频略丰,高频温和',
   [('LS',300,-2),('PK',500,+2),('PK',2500,0),('HS',8000,-2)]),
 ('Boss OD-3','厚暖,比SD-1低频多,高频明显滚降',
   [('LS',500,-2),('PK',300,+2),('PK',2500,0),('HS',5000,-4)]),
 ('Boss SD-1','明亮,低切,中频存在感',
   [('LS',794,-3),('PK',908,+2),('PK',2500,0),('HS',6000,-3)]),
 ('Fulltone OCD','全频,低频充足,中频平滑',
   [('LS',200,-1),('PK',700,+1.5),('PK',2500,0),('HS',7000,-2)]),
 ('Horizon Precision Drive','紧致现代,中高频清晰',
   [('LS',250,-3),('PK',1000,+3),('PK',3000,+1),('HS',7000,-2)]),
 ('Ibanez TS808','经典中频隆起+低切',
   [('LS',694,-4),('PK',721,+3),('PK',2000,0),('HS',5000,-4)]),
 ('Ibanez TS9','中频隆起,比808紧',
   [('LS',694,-3),('PK',721,+2.5),('PK',2000,0),('HS',5000,-3)]),
 ('JHS Morning Glory','透明,蓝调破碎者类',
   [('LS',297,-1),('PK',794,+1),('PK',2500,0),('HS',8000,-2)]),
 ('Klon Centaur','透明,轻微中频',
   [('LS',149,-1),('PK',1000,+2),('PK',3000,+1),('HS',8000,-2)]),
 ('ProCo RAT','低切,中频凹陷,粗糙',
   [('LS',595,-2),('PK',1000,-2),('PK',3000,0),('HS',4000,-3)]),
 ('Wampler Tumnus','Klon类透明',
   [('LS',149,-1),('PK',1000,+1.5),('PK',3000,+1),('HS',8000,-2)]),
 ('Aguilar Tone Hammer','低频增强,中频可选凹',
   [('LS',120,-1),('PK',400,-1),('PK',2500,+1),('HS',7000,-2)]),
 ('Darkglass B3K','紧致现代,中高频增益,低音切',
   [('LS',200,-3),('PK',2500,+3),('PK',4000,0),('HS',8000,-1)]),
 ('EHX Bass Soul Food','Klon类透明(贝斯)',
   [('LS',149,-1),('PK',1000,+2),('PK',3000,+1),('HS',8000,-2)]),
 ('MXR M80','中频凹陷失真',
   [('LS',300,-1),('PK',500,-2),('PK',2500,+1),('HS',5000,-2)]),
 ('Origin BASSRIG','变压器温暖,低频滚降+高频存在感',
   [('LS',200,-2),('PK',800,+1),('PK',3000,+3),('HS',8000,+2)]),
 ('Tech21 SansAmp','经典中频凹陷+高频峰',
   [('LS',120,-1),('PK',700,-3),('PK',2500,+2),('HS',7000,-2)]),
]
print(f"{'主型号':22s} {'电路特点':30s} 4段preEQ(物理)  →  hex")
for model,desc,bands in DESIGN:
    encs=[enc(TYP[t],fi(f),g) for t,f,g in bands]
    phys_s=' | '.join(phys(b) for b in bands)
    hex_s=' '.join(f'0x{v:08X}' for v in encs)
    print(f"{model:22s} {desc:28s}")
    print(f"    {phys_s}")
    print(f"    {hex_s}")
