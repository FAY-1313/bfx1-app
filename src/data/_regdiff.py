# -*- coding: utf-8 -*-
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
def dec(v):
    typ = v & 0x7; fi = (v >> 3) & 0x1ff; gi = (v >> 12) & 0xff
    fhz = T[fi] if fi < len(T) else fi
    return f"{['P','L','H'][typ]}{int(fhz)}/{-24+gi*0.2:+.1f}"

src = open("C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/UI03/src/data/presetData.ts", encoding="utf-8").read()
blk = src[src.index("export const OVERDRIVE_DEFAULTS"):src.index("export const AMP_HEAD_KNOB_DEFAULTS")]
app = {}
for m in re.finditer(r'"([^"]+/[^"]+)":\s*\{', blk):
    key = m.group(1); j = m.end()-1; depth=1; k=j+1
    while depth>0 and k<len(blk):
        if blk[k]=='{': depth+=1
        elif blk[k]=='}': depth-=1
        k+=1
    body = blk[j:k]
    am = re.search(r'allRegs:\s*\{(.*?)\}', body, re.S)
    if am:
        app[key] = {int(x[0]): int(x[1],16) for x in re.findall(r'(\d+):0x([0-9A-Fa-f]+)', am.group(1))}

def cap_regs(root, strip):
    out = {}
    for f in glob.glob(os.path.join(root, "*_bfx1.json")):
        nm = os.path.basename(f).replace("_bfx1.json","").replace(strip,"")
        j = json.load(open(f, encoding="utf-8"))
        out[nm] = {int(k): v for k,v in j.items() if str(k).isdigit()}
    return out

def report(name, cap, appd):
    diffs = []
    for a in range(42, 72):
        if cap.get(a) is not None and appd.get(a) is not None and cap[a] != appd[a]: diffs.append(a)
    if not diffs:
        print(f"  {name:28s} MATCH")
    else:
        desc = []
        for a in diffs:
            desc.append(f"r{a}={dec(cap[a])}(cap)/{dec(appd[a])}(app)" if 44<=a<=47 else f"r{a}=0x{cap[a]:08X}/0x{appd[a]:08X}")
        print(f"  {name:28s} DIFF[{len(diffs)}]: {', '.join(desc)}")

print("=== 吉他过载 ===\n")
for sub in ["Boss","Fulltone","Ibanez","JHS","Klon","MXR","Other","Proco","Tech21","Wampler"]:
    root = f"D:/NAMmodel/knob/软单块/{sub}/pedal_soft"
    if not os.path.isdir(root): continue
    for name, cap in sorted(cap_regs(root, "_pedal_soft").items()):
        key = f"B&F NAM {name}/{name}"
        if key not in app:
            base = name[:-2] if name.endswith("_2") else None
            key2 = f"B&F NAM {base}/{name}" if base else None
            if key2 and key2 in app: key = key2
        if key not in app: print(f"  {name:28s} NO-APP"); continue
        report(name, cap, app[key])
print("\n=== 贝斯过载 ===\n")
for sub in ["MXR","Other","Tech21"]:
    root = f"D:/NAMmodel/knob/软单块/{sub}/bass_pedal_soft"
    if not os.path.isdir(root): continue
    for name, cap in sorted(cap_regs(root, "_pedal_soft").items()):
        key = f"B&F NAM {name}/{name}"
        if key not in app:
            base = name[:-2] if name.endswith("_2") else None
            key2 = f"B&F NAM {base}/{name}" if base else None
            if key2 and key2 in app: key = key2
        if key not in app: print(f"  {name:28s} NO-APP"); continue
        report(name, cap, app[key])
