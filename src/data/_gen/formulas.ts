"B&F NAM BB Preamp/BB preamp": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM BB Preamp/Bb Preamp all at 12 o'clock": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM BB Preamp/King of Drive Blues Breaker": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Klon Centaur/DRPS MXR ZW44 Zakk Wylde Overdrive All Knobs 12 o Clock": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Klon Centaur/DRPS MXR ZW44 Zakk Wylde Overdrive Gain 0  Tone 10 Output 10": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Klon Centaur/DRPS MXR ZW44 Zakk Wylde Overdrive Gain 0  Tone 3 Output 10": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Klon Centaur/DRPS MXR ZW44 Zakk Wylde Overdrive Gain 1 Tone 5 Output 5": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Klon Centaur/DRPS MXR ZW44 Zakk Wylde Overdrive Gain 10  Tone 10 Output 10": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Klon Centaur/Keith B klone_g6_t6_o5": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Klon Centaur/Keith B klone_maxG_t6_o5": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Klon Centaur/LY-Pedals Gladio Clone Overdrive Ch OD": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Klon Centaur/MZERO-OVERDRIVE": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Klon Centaur/Mezzabarba Mzero Overdrive": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Klon Centaur/Mezzabarba Mzero Overdrive higain": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Fortin Dirty Tree/Peter N DirtyTree DT-33_V7_Feather_ESR-0.0001": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Fortin Dirty Tree/Peter N DirtyTree DT-33_V7_Lite_ESR-0.0001": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Fortin Dirty Tree/Peter N DirtyTree DT-33_V7_Std_ESR-0.0001": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM EQD Plumes/Keith B PlumesClone_maxG_t5_switch1": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM EQD Plumes/Keith B PlumesClone_maxG_t5_switch3": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Precision Drive/Phillipe P Precision-Drive-Feather-ESR0,001": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Proco RAT/Donner Giant Metal Turbo Rat": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Proco RAT/Turbo RAT": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Tech21 SansAmp/Jason Z Tech21 dUg DP3X bass preamp pedal all dimed no shift": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss SD-1/Boss SD-1 - Level500 Tone1030 Drive300": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss SD-1/Boss SD-1 - Level500 Tone1030 Drive500": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss SD-1/Boss SD-1 - Level500 Tone1030 Drive900": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss SD-1/Boss SD-1 - Level500 Tone1200 Drive1200": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss SD-1/Protein V3 Browne Amplification (Green)": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Tube Screamer/82 Ibanez Tube Screamer": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Tube Screamer/AMP TS9": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Tube Screamer/AMP TS9 LOW": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Tube Screamer/Concert Clean Bright TS9": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Tube Screamer/IBA 808 OVERDRIVE": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Tube Screamer/Ibanez TS9 Tube Screamer Drive 0 Tone 6 Level 6": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Tube Screamer/Ibanez TS9 Tube Screamer Drive 0 Tone 7 Level 7": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Tube Screamer/Ibanez TS9 Tube Screamer Drive 0 Tone 9 Level 9": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Tube Screamer/Maxon OD9": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Tube Screamer/Maxon OD9Pro+": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Tube Screamer/Maxon ST9Pro+": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 45, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(1000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Bass Distortion/B7K Distortion": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Bass Distortion/DarkGlass Ultra V BASS for metal": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss HM-2/Boss HM-2 Lo=6, Hi=6, Gain=10": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss HM-2/Boss HM-2 Lv-10 L-10 H-10 D-0": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss HM-2/Boss HM-2 Lv-10 L-5 H-8 D-5": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss HM-2/Boss HM-2 Lv-10 L-7 H-5 D-0": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss HM-2/Boss HM-2 Lv-10 L-7 H-5 D-10": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss HM-2/Fortin Meshuggah  2": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss HM-2/Fortin Meshuggah 1": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss HM-2/Fortin Meshuggah High Gain_ Open settings": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss HM-2/Fortin Meshuggah Low Gain_ Modern settings": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Boss HM-2/Fortin Meshuggah Low Gain_ Vintage settings": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/BOSS DISTORTION DS-1 All 12 o Clock": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/BOSS DISTORTION DS-1 T10 L5 D4": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/BOSS DISTORTION DS-1 T4 L10 D8": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/BOSS DISTORTION DS-1 T5 L10 D10": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/BOSS DISTORTION DS-1 T5 L10 D3": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/BOSS MICRO BR  GRINDER": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/Boss Turbodistorsion DS-2 I": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/Boss Turbodistorsion DS-2 II": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/DISTO (G2+G3+MV-50)#02": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/DRPS BOSS OS-2  Everything at 4 o clock": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/DRPS BOSS OS-2  Everything at 6 o clock": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/DRPS BOSS OS-2  Tone5 Drive0 Color5": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/DRPS BOSS OS-2  Tone5 Drive3 Color0": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/DRPS BOSS OS-2  Tone5 Drive5 Color10": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/DRPS BOSS PW-10 GUV Dist Drive 7": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/Grind": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/Grind sweetspot": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/Tudor N Fortin Grind Mini Knob @ 5 ESR_0.0012_lite": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/Tudor N Fortin Grind Mini Knob @ 5 ESR_0.0017_standard": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM DS-1 Mid/nasty deathgrind tone": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/Boss Metal Zone Waza - Deftones (Custom Mode)": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/Boss Metal Zone Waza - Deftones (Standard Mode)": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/DOD FX56 American Metal - 100%0%50%": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/DOD FX56 American Metal - 100%1000%100%(all Out!)": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/DOD FX56 American Metal - 100%50%50%": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/DOD FX56 American Metal - 50%0%100%": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/DOD FX56 American Metal - 50%0%50%": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/DRPS BOSS Metal Zone MT-2 Everything 12 0 clock": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/DRPS BOSS Metal Zone MT-2 L5 H5 M5 MF5 DIST 10": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/DRPS BOSS Metal Zone MT-2 L5 H5 M5 MF5 DIST 3": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/MXR M-204 Distortion 1982 - 1984 - drive 25%": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/Metal Muff Swedish Chainsaw-ish": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/Nano Metal Muff - Alice in Chainsaw": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/RR MXR Rockman X100 DIST": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/Rockman Sustainor Distortion Channel - Pre gain 4, Comp 15": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/SLAMMIN_MXR_X100_DISTORTION_FULL_C": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/SLAMMIN_MXR_X100_DISTORTION_FULL_XS": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM MT-2 Scoop/SLAMMIN_MXR_X100_DISTORTION_HALF_S": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(4000), Math.round(60 + n * 120), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
},
"B&F NAM Bass Drive/EBS Billy Sheehan Ultimate Drive": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass Drive/EBS-Ultimate-Drive-02": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass Drive/Simplifier B7K": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass Drive/Simplifier B7K Comp": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass Flat/AMPEG CLEAN": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass Flat/Hartke HA 3500 ALL FLAT Tube and Solid State at 5": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass Flat/Hartke HA 3500 Tube 0 Solid State 5 All Flat": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass Flat/SWR INTERSTELLAR": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass Flat/SWR OD": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass Flat/TraceElliot-Velocette-v12-t0-V30": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass Flat/TraceElliot-Velocette-v12-t12-V30": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass Flat/ampegv4--bass--battlehammer": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass Flat/eden-glowplug-w12-c100-m13-v12": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass Flat/eden-glowplug-w13-c100-mfull-v12": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass HIFI/AGUILAR": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass HIFI/Aguilar Tone Hammer 500": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass HIFI/GK Backline 600 (Normal Channel Clean L4 T7 HM7 LM4 B5 B6 M6)": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Bass HIFI/Markbass Marcus Miller 500": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/71 Bassman - 80's Clean - V5 T8 B5": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/71 Bassman - All on 10 - Bright - V10 T10 B10": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/Carvin Belaire 212 C2H CLN V3 B3_M4_T7_P5_R3": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/Carvin Belaire 212 C2H CLN V3 B3_M4_T7_P7_R0": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/Dumble® Steel String Singer® #002 (OVER 2)": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/Fender Deluxe Reverb - Drive": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/Fender_Hot_Rod_Deluxe_III_Normal_Ch_Input1_V2_Bright_Off_HD": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/Peace Hill Two Rock John Mayer 2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/Spitfine-Dumble_Clean-EPOCHS-300-ESR-0_0_0-": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/Tim R Fender Twin Reverb Ch1 BR G05": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/Tim R Fender Twin Reverb Ch1 BR G07": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/Tim R Magnatone Super 59 Mkii Ch1 Br": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/Tim R Magnatone Super 59 Mkii Ch1 Norm": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/Tim R Magnatone Super 59 Mkii Ch2 Br": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Scoop/TwoRock": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Small/64 Princeton Clean - Vol 4, Tone 7": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Small/64 Princeton Sweet Spot - Vol 7, Tone 7": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Small/CHAMP V8 T9 B6": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Fender Small/Champ V7 T7 B5": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Full/Hiwatt - Fane UEM Starfinder 412 Custom": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Full/Hiwatt 103": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/20260215 Suhr PT15IR Channel 2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Bogner GF SL  Clean Drive": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Bogner Shiva Cranked": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/DIEZEL": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Diezel Herbert VH4 2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/EVH 5153": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/EVH 5153 2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Engl Savage": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Engl Savage 2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/George B Ceriatone King Kong  KK Ch2 60s solo 80s": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/George B Ceriatone King Kong  chan2 60s br sw2 L": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/George B Ceriatone King Kong chan2 70s both br sw L": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/George B V4 Countess 300eps": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Helga B GCI Jugendstil": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Helga B PP Wendigo": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Helga B XXX-6L6-Wendigo-ESR0,016": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Jason Z KSR CERES - light blue channel - all noon EQ": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Jason Z KSR CERES - purple channel - all noon EQ": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Jason Z KSR VESTA - light blue channel - all noon EQ": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/PRS Archon 25 Combo - Clean Bright V05": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/PRS Archon 25 Combo - Clean Bright V08": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Phillipe P Bug1990-Lead-NoDrive-ESR0,004": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/REVV_G120MKIII_EL34_BLUE_BRIGHT_CLARITY #02": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/REVV_G120MKIII_EL34_PURP_AG_1 _FAT_CUT": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Roman A YERASOV_MESHUGGAH": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Suhr SE Mod SLP": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Tudor N Driftwood Nightmare High Gain   HM2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Tudor N Driftwood Nightmare Low Gain": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM HiGain Tight/Tudor N Driftwood Nightmare Low Gain   TS": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/03 Block red - od808 bal": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/04 Block red - od808 drk": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/05 Block red - od808x brt": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/23 Block grnHG - SD-1": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Blackstar Studio 10 EL34 G10 Greenback": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Blackstar Studio 10 EL34 G10 V30": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Marshall 1959SLP ALE": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Marshall Super Bass": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Mikhail K Sovtek MIG50": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Peavey VTM GV G10": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Phillipe P LaneyGH100S-Hi-HiNoon-ESR0,024": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Phillipe P LaneyGH100S-Hi-MidGain-ESR0,003": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Phillipe P LaneyGH100S-Lo-AfterBreakUp-ESR0,001": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Sascha S DirtyShirleyMini_Clean_B1_M6_T7_MV10_G4": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Sascha S DirtyShirleyMini_crunch_B4_M5.5_T6_MV6_G4_GS_high": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Sascha S DirtyShirleyMini_crunch_G6": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Tim R Splawn Pro Mod 1st Gear - G12": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Tim R Splawn Pro Mod 2nd Gear - G12": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/Tim R Splawn Pro Mod 3rd Gear - G12": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/[ReactIR2] Friedman BE-DLX 50W GroundZero mod": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Marshall/[ReactIR2] Friedman BE-DLX 50W GroundZero mod - xSTD": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Mesa Mark/Roman A LT_MESA_MARKIV_1": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Mesa Recto/Rectifier Green": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Mesa Recto/Rectifier Red": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Orange/Orange_560_SM57": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Orange/Orange_560_e906": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Orange/Randall RH200SC (deep chorus)": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Orange/Randall RH200SC (drive)": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Soldano SLO/Phillipe P JVM-CL-GR-NoDrive-ESR0,005": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Soldano SLO/Phillipe P JVM-CR-OR-NoDrive-ESR0,017": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Soldano SLO/SLO100_lead": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Soldano SLO/Tim R Jet City G2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Soldano SLO/Tim R Jet City G4": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Soldano SLO/Tim R Jet City G5": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Soldano SLO/[AMP] SLO100-NRM-CLN Journeyvan - DI": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Vox Chime/Laney VC30 Clean (Celestion 1x12 SM57)": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Vox Chime/Laney VC30 Clean Bright On (Celestion 1x12 SM57)": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Vox Chime/Phillipe P VOXAC15-JonAr1": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Vox Chime/Phillipe P VOXAC15-JonAr2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Vox Chime/Phillipe P VOXAC15-JonAr3": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Vox Chime/RR AC30 NRM 160": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM Vox Chime/RR AC30 NRM 57": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM pedal_hard/Jason Z Line 6 UBERMETAL INSANE droom metal at its best": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM 通用高增益/[AMP] CHUPA50W NORMAL Instant gratification #01 (Factory)": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM 通用高增益/[AMP] Lynx50-CL Ch2-Hi Stratus - STD": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM 通用高增益/[AMP] TREC-150BLD-DIO-CLN Instant gratification - DI": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"B&F NAM 通用高增益/[AMP] TREC-150BLD-DIO-CLN Instant gratification - DI [REVyHI]": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => Math.round(n * 288) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},