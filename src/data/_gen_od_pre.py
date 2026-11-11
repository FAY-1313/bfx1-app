# -*- coding: utf-8 -*-
"""生成过载 29 捕获的新 preEQ: 吉他=捕获 reg44-47, 贝斯=新贝斯设计表值. 输出 TS 键->新值 JSON."""
import json, io, sys, os, glob, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

T = [19.7,20.1,20.5,20.9,21.3,21.7,22.1,22.5,23.0,23.4,23.9,24.3,24.8,25.3,25.8,26.3,26.8,
27.3,27.8,28.4,28.9,29.5,30.1,30.7,31.3,31.9,32.5,33.1,33.8,34.4,35.1,35.8,36.5,37.2,
37.9,38.6,39.4,40.1,40.9,41.7,42.5,43.4,44.2,45.1,45.9,46.8,47.7,48.7,49.6,50.6,51.6,
52.6,53.6,54.6,55.7,56.8,57.9,59.0,60.1,61.3,62.5,63.7,65.0,66.2,67.5,68.8,70.2,71.5,
72.9,74.3,75.8,77.2,78.7,80.3,81.8,83.4,85.0,86.7,88.4,90.1,91.9,94.0,95.0,97.0,99.0,
101,103,105,107,109,111,114,116,118,120,123,125,127,130,132,135,138,140,143,146,
149,152,154,157,161,164,167,170,173,177,180,184,187,191,195,198,202,206,210,214,
218,223,227,231,236,241,245,250,255,260,265,270,275,281,286,292,297,303,309,315,
321,327,334,340,347,354,360,367,375,382,389,397,405,412,420,429,437,445,454,463,
472,481,490,500,510,520,530,540,551,561,572,583,595,606,618,630,642,655,667,680,
694,707,721,735,749,764,779,794,809,825,841,857,874,891,908,926,944,962,981,1000,
1020,1040,1060,1080,1100,1120,1140,1170,1190,1210,1240,1260,1280,1310,1330,1360,1390,
1410,1440,1470,1500,1530,1560,1590,1620,1650,1680,1710,1750,1780,1820,1850,1890,1920,
1960,2000,2040,2080,2120,2160,2200,2240,2290,2330,2380,2420,2470,2520,2570,2620,2670,
2720,2770,2830,2880,2940,3000,3050,3110,3170,3240,3300,3360,3430,3500,3560,3630,3700,
3780,3850,3920,4000,4080,4160,4240,4320,4400,4490,4580,4670,4760,4850,4940,5040,5140,
5240,5340,5440,5550,5660,5770,5880,5990,6110,6230,6350,6470,6600,6730,6860,6990,7130,
7270,7410,7550,7700,7850,8000,8160,8310,8480,8640,8810,8980,9150,9330,9510,9700,9890,
10100,10300,10500,10700,10900,11100,11300,11500,11800,12000,12200,12500,12700,
12900,13200,13500,13700,14000,14300,14500,14800,15100,15400,15700,16000,16300,
16600,17000,17300,17600,18000,18300,18700,19000,19400,19800,20200,20600]
def fi_of(f): return min(range(len(T)), key=lambda i: abs(T[i]-f))
def gi_of(g): return int(round((g+24)/0.2))
def build(typ, f, g):
    q = 10 if typ == 0 else 16
    s = 10
    fi = fi_of(f); gi = gi_of(g)
    return ((typ&0x7)|((fi&0x1ff)<<3)|((gi&0xff)<<12)|((q&0x7f)<<20)|((s&0x1f)<<27)) % 2**32

# 新贝斯设计表 (Pre_EQ电路表_贝斯.md) -> (type, freq, gain)
PEAK, LOW, HIGH = 0, 1, 2
BASS_TABLE = {
 "Aguilar Tone Hammer":[("LOW",30,-1),("PEAK",400,+1),("PEAK",2000,0),("HIGH",5000,-1)],
 "Darkglass B3K":      [("LOW",30,-1),("PEAK",500,+1),("PEAK",2000,+1),("HIGH",5000,-1)],
 "EHX Bass Soul Food": [("LOW",30,-1),("PEAK",600,+1),("PEAK",2000,0),("HIGH",5000,-1)],
 "MXR M80":            [("LOW",30,-1),("PEAK",500,+1),("PEAK",2000,0),("HIGH",5000,-1)],
 "Origin BASSRIG":     [("LOW",30,-1),("PEAK",400,+1),("PEAK",2000,0),("HIGH",5000,0)],
 "Tech21 SansAmp":     [("LOW",30,-1),("PEAK",400,+1),("PEAK",2000,0),("HIGH",5000,0)],
}

def cap_vals(root):
    out = {}
    for f in glob.glob(os.path.join(root, "*_bfx1.json")):
        pos = os.path.basename(f).replace("_bfx1.json","").replace("_pedal_soft","")
        j = json.load(open(f, encoding="utf-8"))
        def g(a): return j.get(str(a))
        out[pos] = [g(a) for a in (44,45,46,47)]
    return out

# 构建 app key -> 新值
newvals = {}   # "model/pos" -> [uint32...]
meta = {}      # pos -> decoded str for doc
guitar_dirs = ["Boss","Fulltone","Ibanez","JHS","Klon","MXR","Other","Proco","Tech21","Wampler"]
bass_dirs   = ["MXR","Other","Tech21"]

def add(key, vals, pos, src):
    newvals[key] = vals
    def dec(v):
        typ=v&0x7; fi=(v>>3)&0x1ff; gi=(v>>12)&0xff; fhz=T[fi] if fi<len(T) else fi
        return f"{['PEAK','LOW_SH','HIGH_SH'][typ]}@{int(fhz)}Hz{-24+gi*0.2:+.1f}dB"
    meta[pos] = f"[{', '.join(dec(v) for v in vals)}] ({src})"

for sub in guitar_dirs:
    root = f"D:/NAMmodel/knob/软单块/{sub}/pedal_soft"
    if not os.path.isdir(root): continue
    for pos, vals in sorted(cap_vals(root).items()):
        base = pos[:-2] if pos.endswith("_2") else pos
        if not all(isinstance(v,int) for v in vals):
            print(f"SKIP non-int {pos}", file=sys.stderr); continue
        key = f"B&F NAM {base}/{pos}"
        add(key, vals, pos, "捕获")

for sub in bass_dirs:
    root = f"D:/NAMmodel/knob/软单块/{sub}/bass_pedal_soft"
    if not os.path.isdir(root): continue
    for pos in sorted(cap_vals(root).keys()):
        base = pos[:-2] if pos.endswith("_2") else pos
        table = BASS_TABLE.get(base)
        if table is None:
            print(f"!! 贝斯设计表缺 {base}", file=sys.stderr); continue
        vals = [build({"LOW":LOW,"PEAK":PEAK,"HIGH":HIGH}[t], f, g) for (t,f,g) in table]
        key = f"B&F NAM {base}/{pos}"
        add(key, vals, pos, "新贝斯表")

# 输出为 TS 可读结构
out = {}
for k, vals in sorted(newvals.items()):
    out[k] = [f"0x{v:08X}" for v in vals]
json.dump(out, open("C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/_od_newpre.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"生成 {len(out)} 个捕获的新 preEQ:")
for k, v in sorted(out.items()):
    print(f"  {k:44s} {', '.join(v)}")
