# -*- coding: utf-8 -*-
"""Compute PRE EQ reference design register values, replicating buildPEQData."""
import json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Freq table (19.7 ~ 20600), copied from parameterMap.ts
PEQ_FREQ_TABLE = [
19.7,20.1,20.5,20.9,21.3,21.7,22.1,22.5,23.0,23.4,23.9,24.3,24.8,25.3,25.8,26.3,26.8,
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
16600,17000,17300,17600,18000,18300,18700,19000,19400,19800,20200,20600,
]

def freqToIndex(hz):
    best, bestDiff = 0, 1e9
    for i, f in enumerate(PEQ_FREQ_TABLE):
        d = abs(f - hz)
        if d < bestDiff:
            bestDiff, best = d, i
    return best

def gainToIndex(db):
    # gain = (db + 24) / 0.2 ; clamp 0..180
    return max(0, min(180, int(round((db + 24) / 0.2))))

def dbOfIndex(g):
    return -24 + g * 0.2

TYPE = {"PEAK": 0, "LOW_SHELF": 1, "HIGH_SHELF": 2}

def buildPEQData(ptype, freqIndex, gainIndex, qIndex=16, sIndex=10):
    return ((TYPE[ptype] & 0x7) | ((freqIndex & 0x1ff) << 3)
            | ((gainIndex & 0xff) << 12) | ((qIndex & 0x7f) << 20)
            | ((sIndex & 0x1f) << 27)) & 0xFFFFFFFF

# Q / S indices used in existing code for NAM: qIndex=16 (Q=1.00), sIndex=10 (S=1.00)
QIDX = 16
SIDX = 10

# Reference freq points to pin
pins = [120, 800, 900, 1000, 1500, 2500, 3000, 4000, 5000, 5990, 12900, 13700, 15700]
for p in pins:
    i = freqToIndex(p)
    print(f"freqToIndex({p}) -> {i} ({PEQ_FREQ_TABLE[i]} Hz)")

print("\nGain dB mapping:")
for db in [-8, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4]:
    gi = gainToIndex(db)
    print(f"  {db:>+3.1f} dB -> gainIdx {gi} (re-encodes to {dbOfIndex(gi):+.1f} dB)")

# ---- Archetype table ----
# Each archetype: name, bands [type, freqHz, gainDb, q, s]
ARCH = {
 "O-TS":      [["LOW_SHELF",120,-6,QIDX,SIDX],["PEAK",800,4,QIDX,SIDX],["PEAK",2500,-1,QIDX,SIDX],["HIGH_SHELF",5990,-3,QIDX,SIDX]],
 "O-SD":      [["LOW_SHELF",120,-4,QIDX,SIDX],["PEAK",900,2,QIDX,SIDX],["PEAK",3000,1,QIDX,SIDX],["HIGH_SHELF",5990,0,QIDX,SIDX]],
 "O-CENTAUR": [["LOW_SHELF",120,-3,QIDX,SIDX],["PEAK",1000,2,QIDX,SIDX],["PEAK",3000,1,QIDX,SIDX],["HIGH_SHELF",5990,1,QIDX,SIDX]],
 "O-BB":      [["LOW_SHELF",120,-4,QIDX,SIDX],["PEAK",900,2,QIDX,SIDX],["PEAK",3000,1,QIDX,SIDX],["HIGH_SHELF",5990,0,QIDX,SIDX]],
 "O-RAT":     [["LOW_SHELF",120,-8,QIDX,SIDX],["PEAK",1500,3,QIDX,SIDX],["PEAK",4000,2,QIDX,SIDX],["HIGH_SHELF",5990,2,QIDX,SIDX]],
 "O-FORTIN":  [["LOW_SHELF",120,-5,QIDX,SIDX],["PEAK",1000,4,QIDX,SIDX],["PEAK",5000,1,QIDX,SIDX],["HIGH_SHELF",13700,2,QIDX,SIDX]],
 "O-SANSA":   [["LOW_SHELF",120,-3,QIDX,SIDX],["PEAK",1000,1,QIDX,SIDX],["PEAK",4000,0,QIDX,SIDX],["HIGH_SHELF",5990,1,QIDX,SIDX]],
 "O-PLUMES":  [["LOW_SHELF",120,-5,QIDX,SIDX],["PEAK",1000,3,QIDX,SIDX],["PEAK",3000,1,QIDX,SIDX],["HIGH_SHELF",5990,1,QIDX,SIDX]],
 "D-MID":     [["LOW_SHELF",120,-4,QIDX,SIDX],["PEAK",1000,3,QIDX,SIDX],["PEAK",3000,1,QIDX,SIDX],["HIGH_SHELF",5990,-1,QIDX,SIDX]],
 "D-SCOOP":   [["LOW_SHELF",120,3,QIDX,SIDX],["PEAK",1000,-4,QIDX,SIDX],["PEAK",4000,1,QIDX,SIDX],["HIGH_SHELF",5990,3,QIDX,SIDX]],
 "D-HM2":     [["LOW_SHELF",120,2,QIDX,SIDX],["PEAK",1000,-1,QIDX,SIDX],["PEAK",4000,3,QIDX,SIDX],["HIGH_SHELF",12900,4,QIDX,SIDX]],
 "D-FORTIN":  [["LOW_SHELF",120,-6,QIDX,SIDX],["PEAK",1000,4,QIDX,SIDX],["PEAK",4000,2,QIDX,SIDX],["HIGH_SHELF",13700,3,QIDX,SIDX]],
 "D-BASS":    [["LOW_SHELF",120,2,QIDX,SIDX],["PEAK",1000,1,QIDX,SIDX],["PEAK",4000,2,QIDX,SIDX],["HIGH_SHELF",12900,4,QIDX,SIDX]],
 "A-FENDER-SCOOP":  [["LOW_SHELF",120,3,QIDX,SIDX],["PEAK",1000,-3,QIDX,SIDX],["PEAK",4000,0,QIDX,SIDX],["HIGH_SHELF",5990,2,QIDX,SIDX]],
 "A-FENDER-SMALL":  [["LOW_SHELF",120,2,QIDX,SIDX],["PEAK",1000,-1,QIDX,SIDX],["PEAK",3000,0,QIDX,SIDX],["HIGH_SHELF",5990,1,QIDX,SIDX]],
 "A-VOX":     [["LOW_SHELF",120,-3,QIDX,SIDX],["PEAK",1000,3,QIDX,SIDX],["PEAK",3000,1,QIDX,SIDX],["HIGH_SHELF",5990,2,QIDX,SIDX]],
 "A-MARSHALL":      [["LOW_SHELF",120,-3,QIDX,SIDX],["PEAK",1000,3,QIDX,SIDX],["PEAK",4000,2,QIDX,SIDX],["HIGH_SHELF",5990,2,QIDX,SIDX]],
 "A-SLO":     [["LOW_SHELF",120,-2,QIDX,SIDX],["PEAK",1000,3,QIDX,SIDX],["PEAK",4000,2,QIDX,SIDX],["HIGH_SHELF",5990,2,QIDX,SIDX]],
 "A-HIGAIN-TIGHT":  [["LOW_SHELF",120,-4,QIDX,SIDX],["PEAK",1000,1,QIDX,SIDX],["PEAK",3000,2,QIDX,SIDX],["HIGH_SHELF",5990,3,QIDX,SIDX]],
 "A-HIGAIN-FULL":   [["LOW_SHELF",120,-2,QIDX,SIDX],["PEAK",1000,2,QIDX,SIDX],["PEAK",3000,2,QIDX,SIDX],["HIGH_SHELF",5990,3,QIDX,SIDX]],
 "A-MESA-RECTO":    [["LOW_SHELF",120,4,QIDX,SIDX],["PEAK",1000,-3,QIDX,SIDX],["PEAK",3000,1,QIDX,SIDX],["HIGH_SHELF",5990,3,QIDX,SIDX]],
 "A-MESA-MARK":     [["LOW_SHELF",120,-2,QIDX,SIDX],["PEAK",1000,3,QIDX,SIDX],["PEAK",4000,2,QIDX,SIDX],["HIGH_SHELF",5990,2,QIDX,SIDX]],
 "A-ORANGE": [["LOW_SHELF",120,2,QIDX,SIDX],["PEAK",1000,3,QIDX,SIDX],["PEAK",3000,-1,QIDX,SIDX],["HIGH_SHELF",5990,-2,QIDX,SIDX]],
 "A-BASS-FLAT":     [["LOW_SHELF",120,2,QIDX,SIDX],["PEAK",1000,-1,QIDX,SIDX],["PEAK",3000,0,QIDX,SIDX],["HIGH_SHELF",5990,1,QIDX,SIDX]],
 "A-BASS-DRIVE":    [["LOW_SHELF",120,3,QIDX,SIDX],["PEAK",1000,-2,QIDX,SIDX],["PEAK",4000,2,QIDX,SIDX],["HIGH_SHELF",12900,3,QIDX,SIDX]],
 "A-BASS-HIFI":     [["LOW_SHELF",120,1,QIDX,SIDX],["PEAK",1000,0,QIDX,SIDX],["PEAK",4000,1,QIDX,SIDX],["HIGH_SHELF",5990,2,QIDX,SIDX]],
}

BAND_NAMES = ["B1 LOW", "B2 MID", "B3 PRES", "B4 HIGH"]

print("\n==== ARCHETYPE REFERENCE DESIGN ====")
for name, bands in ARCH.items():
    print(f"\n[{name}]")
    for i, b in enumerate(bands):
        typ, fhz, db, q, s = b
        fi = freqToIndex(fhz)
        gi = gainToIndex(db)
        v = buildPEQData(typ, fi, gi, q, s)
        # round-trip decode to show actual
        atype = v & 0x7
        af = PEQ_FREQ_TABLE[(v >> 3) & 0x1ff]
        ag = dbOfIndex((v >> 12) & 0xff)
        print(f"  {BAND_NAMES[i]:>7} | type={TYPE[typ]} {typ:<10} | {fhz}Hz(->idx{fi:>3}={af}Hz) | {db:>+5.1f}dB(->gain{gi}={ag:+.1f}dB) | Qidx={q} Sidx={s} | uint32=0x{v:08X} = {v}")

# ---- Model -> archetype assignment (from pedalData.ts) ----
print("\n==== MODEL ASSIGNMENT ====")
OD = {
 "O-TS": ["nam-b-f-nam-ts808","nam-b-f-nam-ts9","nam-b-f-nam-tube-screamer","nam-b-f-nam-od808","nam-b-f-nam-od9","nam-b-f-nam-st9pro"],
 "O-SD": ["nam-b-f-nam-sd-1","nam-b-f-nam-browne-protein"],
 "O-CENTAUR": ["nam-b-f-nam-centaur","nam-b-f-nam-mxr-m77","nam-b-f-nam-zw44-wylde-overdrive","nam-b-f-nam-ly-pedals-gladio","nam-b-f-nam-mezzabarba-mzero-od","nam-b-f-nam-seymour-duncan-805"],
 "O-BB": ["nam-b-f-nam-king-of-tone-bluesbreaker","nam-b-f-nam-bb-preamp","nam-b-f-nam-od-3"],
 "O-RAT": ["nam-b-f-nam-proco-rat","nam-b-f-nam-turbo-rat"],
 "O-FORTIN": ["nam-b-f-nam-fortin-dirty-tree"],
 "O-SANSA": ["nam-b-f-nam-sansamp"],
 "O-PLUMES": ["nam-b-f-nam-plumes"],
}
DIST = {
 "D-MID": ["nam-b-f-nam-ds-1","nam-b-f-nam-ds-2","nam-b-f-nam-os-2","nam-b-f-nam-grind","nam-b-f-nam-marshall-guvnor","nam-b-f-nam-g3"],
 "D-SCOOP": ["nam-b-f-nam-mt-2","nam-b-f-nam-metal-muff","nam-b-f-nam-rockman-sustainor-dist","nam-b-f-nam-rockman-x100-dist","nam-b-f-nam-dod-fx56-american-metal","nam-b-f-nam-204-distortion","nam-b-f-nam-distortion"],
 "D-HM2": ["nam-b-f-nam-hm-2","nam-b-f-nam-meshuggah"],
 "D-FORTIN": ["nam-b-f-nam-grind-2"],
 "D-BASS": ["nam-b-f-nam-darkglass-b7k-ultra-2","nam-b-f-nam-darkglass-ultra-v-bass","nam-b-f-nam-mxr-m80-bass-di-2"],
}
AMP = {
 "A-FENDER-SCOOP": ["nam-b-f-nam-bassman","nam-b-f-nam-twin-reverb"],
 "A-FENDER-SMALL": ["nam-b-f-nam-champ","nam-b-f-nam-princeton"],
 "A-VOX": ["nam-b-f-nam-ac30"],
 "A-MARSHALL": ["nam-b-f-nam-plexi","nam-b-f-nam-jcm800","nam-b-f-nam-jcm900","nam-b-f-nam-friedman"],
 "A-SLO": ["nam-b-f-nam-slo-100","nam-b-f-nam-jvm"],
 "A-HIGAIN-TIGHT": ["nam-b-f-nam-5150","nam-b-f-nam-6505","nam-b-f-nam-5150-iii","nam-b-f-nam-archon","nam-b-f-nam-riot","nam-b-f-nam-generator","nam-b-f-nam-ecstasy","nam-b-f-nam-uberschall","nam-b-f-nam-savage","nam-b-f-nam-vh4","nam-b-f-nam-herbert","nam-b-f-nam-fireball","nam-b-f-nam-powerball","nam-b-f-nam-horizon-precision-drive"],
 "A-HIGAIN-FULL": ["nam-b-f-nam-jcm2000-dsl"],
 "A-MESA-RECTO": ["nam-b-f-nam-mesa-dual-rectifier","nam-b-f-nam-mesa-triple-rectifier"],
 "A-MESA-MARK": ["nam-b-f-nam-mesa-mark"],
 "A-ORANGE": ["nam-b-f-nam-rockerverb","nam-b-f-nam-randall"],
 "A-BASS-FLAT": ["nam-b-f-nam-b15","nam-b-f-nam-svt","nam-b-f-nam-v4","nam-b-f-nam-rumble"],
 "A-BASS-DRIVE": ["nam-b-f-nam-odb-3","nam-b-f-nam-darkglass-alpha-omega","nam-b-f-nam-darkglass-b3k","nam-b-f-nam-darkglass-b7k-ultra","nam-b-f-nam-darkglass-microtubes-900","nam-b-f-nam-darkglass-microtubes-infinity","nam-b-f-nam-darkglass-vmt-vintage-microtubes","nam-b-f-nam-scrambler","nam-b-f-nam-mxr-m80-bass-di","nam-b-f-nam-sansamp-bass-driver"],
 "A-BASS-HIFI": ["nam-b-f-nam-aguilar-tone-hammer-500","nam-b-f-nam-gallien-krueger-mb150","nam-b-f-nam-mesa-bass-800d","nam-b-f-nam-mesa-subway-d800","nam-b-f-nam-terror-bass"],
}
def counts(m):
    total = 0
    for k, v in m.items():
        total += len(v)
        print(f"  {k:<18} {len(v):>3} models")
    print(f"  TOTAL: {total}")
print("-- overdrive (22) --"); counts(OD)
print("-- dist (19) --"); counts(DIST)
print("-- amp (50) --"); counts(AMP)

# sanity: unique ids?
def dups(m):
    ids = [i for v in m.values() for i in v]
    return [i for i in set(ids) if ids.count(i) > 1]
print("\nDup check:", dups(OD), dups(DIST), dups(AMP))
