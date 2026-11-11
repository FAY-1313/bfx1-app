// src/data/pedalData.ts
var noiseGate = {
  id: "noise-gate",
  label: "Noise Gate",
  shortLabel: "GATE",
  hasSubModels: false,
  knobs: ["THRESHOLD"],
  bodyColor: "#2a4030",
  accentColor: "#50d080"
};
var compressor = {
  id: "compressor",
  label: "Compressor",
  shortLabel: "COMP",
  hasSubModels: true,
  subModels: {
    guitar: [
      { id: "mxr-dyna", name: "B&F Dyna Comp", knobs: ["SUSTAIN", "OUTPUT"], color: "#384860", accentColor: "#6098d8" },
      { id: "boss-cs2", name: "B&F CS-2", knobs: ["SUSTAIN", "LEVEL", "ATTACK"], color: "#3a4c62", accentColor: "#5c90d4" },
      { id: "la2a", name: "B&F LA-2A", knobs: ["PEAK REDUCTION", "GAIN"], color: "#385060", accentColor: "#6098d0" },
      { id: "urei-1176", name: "B&F 1176 Rev A", knobs: ["INPUT", "OUTPUT", "ATTACK", "RELEASE", "RATIO"], color: "#384a64", accentColor: "#5688d8" },
      { id: "neve-33609", name: "B&F 33609", knobs: ["THRESHOLD", "ATTACK", "RECOVERY", "RATIO", "MAKEUP"], color: "#384860", accentColor: "#5888cc" },
      { id: "distressor", name: "B&F Distressor", knobs: ["INPUT", "ATTACK", "RELEASE", "RATIO", "OUTPUT"], color: "#3a4660", accentColor: "#5a84cc" }
    ],
    bass: [
      { id: "dbx-163-b", name: "B&F 163", knobs: ["COMPRESSION", "GAIN"], color: "#384c62", accentColor: "#5a8cd4" },
      { id: "summit-tla", name: "B&F TLA-50", knobs: ["THRESHOLD", "ATTACK", "RELEASE", "RATIO", "GAIN"], color: "#3a4860", accentColor: "#5688d0" },
      { id: "keeley-bass", name: "B&F Bassist", knobs: ["THRESHOLD", "RATIO", "GAIN"], color: "#384460", accentColor: "#5884cc" },
      { id: "manley-vari", name: "B&F Vari-Mu", knobs: ["THRESHOLD", "ATTACK", "RELEASE", "RATIO", "GAIN"], color: "#3a4862", accentColor: "#5688d4" },
      { id: "ebs-multi", name: "B&F Multicomp", knobs: ["THRESHOLD", "RATIO", "GAIN"], color: "#384a64", accentColor: "#5890d8" }
    ]
  }
};
var boost = {
  id: "boost",
  label: "Boost",
  shortLabel: "BOOST",
  hasSubModels: false,
  knobs: ["BOOST"],
  bodyColor: "#2a4030",
  accentColor: "#f0a040"
};
var overdrive = {
  id: "overdrive",
  label: "Overdrive",
  shortLabel: "OD",
  hasSubModels: true,
  subModels: {
    guitar: [
      { id: "v26-od-mid-boost", group: "TS SERIES", name: "\u4E2D\u9891\u8FC7\u8F7D", display: "TS Series", knobs: ["DRIVE", "TONE", "LEVEL"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "TS808", label: "TS808" },
        { pos: "TS9", label: "TS9" },
        { pos: "SD-1", label: "SD-1" },
        { pos: "Precision Drive", label: "Precision Drive" },
        { pos: "OD808", label: "OD808" }
      ] },
      { id: "v26-od-transparent", group: "TRANSPARENT", name: "\u900F\u660E\u8FC7\u8F7D", display: "BD Series", knobs: ["GAIN", "TONE", "LEVEL"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "BD-2", label: "BD-2" },
        { pos: "OD-3", label: "OD-3" }
      ] },
      { id: "v26-od-light", group: "LIGHT OD", name: "\u8F7B\u8FC7\u8F7D", display: "Klon Series", knobs: ["GAIN", "TREBLE", "OUTPUT"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "Klon Centaur", label: "Klon Centaur" },
        { pos: "Tumnus", label: "Tumnus" }
      ] },
      { id: "v26-od-rat", group: "HEAVY OD", name: "\u5931\u771F\u6001\u8FC7\u8F7D", display: "RAT Series", knobs: ["DISTORTION", "FILTER", "VOLUME"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "RAT", label: "RAT" },
        { pos: "Turbo RAT", label: "Turbo RAT" }
      ] },
      { id: "v26-od-mosfet", group: "HEAVY OD", name: "MOSFET \u8FC7\u8F7D", display: "OCD Series", knobs: ["DRIVE", "TONE", "VOLUME"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "OCD", label: "OCD" }
      ] },
      { id: "v26-od-marshall", group: "TRANSPARENT", name: "Marshall \u900F\u660E", display: "MG Series", knobs: ["VOLUME", "DRIVE", "TONE"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "Morning Glory", label: "Morning Glory" }
      ] },
      { id: "v26-od-zw44-od", group: "HEAVY OD", name: "\u8F70\u9E23\u8FC7\u8F7D", display: "ZW Series", knobs: ["DISTORTION", "TONE", "LEVEL"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "ZW44", label: "ZW44" }
      ] },
      { id: "v26-od-805-od", group: "TRANSPARENT", name: "\u9AD8\u89E3\u6790\u8FC7\u8F7D", display: "805 Series", knobs: ["DRIVE", "TONE", "LEVEL"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "805", label: "805" }
      ] },
      { id: "v26-od-dirtytree-od", group: "HEAVY OD", name: "\u7D27\u81F4\u8FC7\u8F7D", display: "DT Series", knobs: ["DRIVE", "TONE", "LEVEL"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "Dirty Tree", label: "Dirty Tree" }
      ] },
      { id: "v26-od-mxr77-od", group: "TRANSPARENT", name: "\u82F1\u5F0F\u8FC7\u8F7D", display: "MGX Series", knobs: ["GAIN", "TONE", "LEVEL"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "M77", label: "M77" }
      ] },
      { id: "v26-od-gladio-od", group: "LIGHT OD", name: "\u53CC\u7EA7\u8FC7\u8F7D", display: "4K Series", knobs: ["DRIVE", "TONE", "LEVEL"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "Gladio", label: "Gladio" },
        { pos: "Protein", label: "Protein" },
        { pos: "King of Tone", label: "King of Tone" }
      ] },
      { id: "v26-od-plumes-od", group: "MID BOOST", name: "\u53CC\u6A21\u8FC7\u8F7D", display: "Plumes Series", knobs: ["DRIVE", "TONE", "LEVEL"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "Plumes", label: "Plumes" }
      ] }
    ],
    bass: [
      { id: "v26-od-bass-di", group: "BASS PRE", name: "\u524D\u7EA7 DI", display: "TH Series", knobs: ["DRIVE", "BASS", "TREBLE", "LEVEL"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "Tone Hammer", label: "Tone Hammer" },
        { pos: "SansAmp", label: "SansAmp" },
        { pos: "BASSRIG", label: "BASSRIG" }
      ] },
      { id: "v26-od-bass-drive", group: "BASS OD", name: "\u8D1D\u65AF\u8FC7\u8F7D", display: "B3K Series", knobs: ["DRIVE", "LEVEL", "TREBLE", "BASS"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "B3K", label: "B3K" },
        { pos: "Bass Soul Food", label: "Bass Soul Food" },
        { pos: "Pork & Pickle", label: "Pork & Pickle" }
      ] },
      { id: "v26-od-bass-retro", group: "BASS RETRO", name: "\u8D1D\u65AF\u590D\u53E4", display: "M80 Series", knobs: ["DRIVE", "LOW", "HIGH", "LEVEL"], color: "#3c5838", accentColor: "#f0a040", disabled: false, captures: [
        { pos: "M80", label: "M80" },
        { pos: "Brassmaster", label: "Brassmaster" }
      ] }
    ]
  }
};
var dist = {
  id: "dist",
  label: "Distortion",
  shortLabel: "DIST",
  hasSubModels: true,
  subModels: {
    guitar: [
      { id: "v26-dist-classic", group: "CLASSIC", name: "\u7ECF\u5178\u5931\u771F", display: "DS Series", knobs: ["DISTORTION", "TONE", "LEVEL"], color: "#40241a", accentColor: "#e87040", disabled: false, captures: [
        { pos: "DS-1", label: "DS-1" },
        { pos: "DS-2", label: "DS-2" },
        { pos: "OS-2", label: "OS-2" }
      ] },
      { id: "v26-dist-metal", group: "METAL", name: "\u73B0\u4EE3\u91D1\u5C5E", display: "MT Series", knobs: ["DISTORTION", "LOW", "HIGH", "MID", "MID FREQ", "LEVEL"], color: "#40241a", accentColor: "#e87040", disabled: false, captures: [
        { pos: "MT-2", label: "MT-2" }
      ] },
      { id: "v26-dist-saw", group: "METAL", name: "\u952F\u6761\u5931\u771F", display: "HM Series", knobs: ["DISTORTION", "HIGH", "LOW", "LEVEL"], color: "#40241a", accentColor: "#e87040", disabled: false, captures: [
        { pos: "HM-2", label: "HM-2" }
      ] },
      { id: "v26-dist-fuzz", group: "FUZZ", name: "\u6CD5\u5179", display: "Muff Series", knobs: ["DISTORTION", "SCOOP", "LEVEL"], color: "#40241a", accentColor: "#e87040", disabled: false, captures: [
        { pos: "Big Muff", label: "Big Muff" }
      ] },
      { id: "v26-dist-retro", group: "RETRO", name: "\u590D\u53E4\u5931\u771F", display: "D+ Series", knobs: ["DISTORTION", "VOLUME"], color: "#40241a", accentColor: "#e87040", disabled: false, captures: [
        { pos: "Distortion+", label: "Distortion+" }
      ] },
      { id: "v26-dist-fortin-dist", group: "METAL", name: "Fortin \u91D1\u5C5E", display: "Fortin Series", knobs: ["DISTORTION", "TONE", "LEVEL"], color: "#40241a", accentColor: "#e87040", disabled: false, captures: [
        { pos: "Grind", label: "Grind" },
        { pos: "Meshuggah", label: "Meshuggah" }
      ] },
      { id: "v26-dist-g3-dist", group: "METAL", name: "\u9AD8\u589E\u76CA\u91D1\u5C5E", display: "G3 Series", knobs: ["DISTORTION", "TONE", "LEVEL"], color: "#40241a", accentColor: "#e87040", disabled: false, captures: [
        { pos: "G3", label: "G3" }
      ] },
      { id: "v26-dist-am-dist", group: "METAL", name: "\u7F8E\u5F0F\u91D1\u5C5E", display: "AM Series", knobs: ["DISTORTION", "TONE", "LEVEL"], color: "#40241a", accentColor: "#e87040", disabled: false, captures: [
        { pos: "FX56", label: "FX56" },
        { pos: "Rockman X100", label: "Rockman X100" }
      ] },
      { id: "v26-dist-mm-dist", group: "METAL", name: "\u91CD\u578B\u91D1\u5C5E", display: "MM Series", knobs: ["DISTORTION", "BASS", "MID", "TREBLE", "LEVEL"], color: "#40241a", accentColor: "#e87040", disabled: false, captures: [
        { pos: "Metal Muff", label: "Metal Muff" }
      ] }
    ],
    bass: [
      { id: "v26-dist-bass-fuzz", group: "BASS FUZZ", name: "\u8D1D\u65AF\u5931\u771F\u6CD5\u5179", display: "X7 Series", knobs: ["DISTORTION", "TONE", "LEVEL"], color: "#40241a", accentColor: "#e87040", disabled: false, captures: [
        { pos: "X7", label: "X7" },
        { pos: "Bass Big Muff", label: "Bass Big Muff" },
        { pos: "Mastotron", label: "Mastotron" }
      ] },
      { id: "v26-dist-dg-dist", group: "BASS DIST", name: "\u8D1D\u65AF DG", display: "DG Series", knobs: ["DISTORTION", "BASS", "TREBLE", "LEVEL"], color: "#40241a", accentColor: "#e87040", disabled: false, captures: [
        { pos: "B7K Ultra", label: "B7K Ultra" },
        { pos: "Ultra V Bass", label: "Ultra V Bass" }
      ] }
    ]
  },
  bodyColor: "#3c4038",
  accentColor: "#e08040"
};
var ampHead = {
  id: "amp-head",
  label: "Amp Head",
  shortLabel: "AMP",
  hasSubModels: true,
  subModels: {
    guitar: [
      { id: "v8-amp-dumble-ods", group: "CLEAN \u6E05\u97F3", name: "B&F NAM Dumble ODS", display: "ODS", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Dumble ODS", label: "ODS" },
        { pos: "Dumble ODS_2", label: "ODS_2" }
      ] },
      { id: "v8-amp-fender-bassman", group: "CLEAN \u6E05\u97F3", name: "B&F NAM Fender Bassman", display: "Bassman", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Fender Bassman", label: "Bassman" },
        { pos: "Fender Bassman_2", label: "Bassman_2" }
      ] },
      { id: "v8-amp-fender-champ", group: "CLEAN \u6E05\u97F3", name: "B&F NAM Fender Champ", display: "Champ", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Fender Champ", label: "Champ" }
      ] },
      { id: "v8-amp-fender-deluxe-reverb", group: "CLEAN \u6E05\u97F3", name: "B&F NAM Fender Deluxe Reverb", display: "Deluxe Reverb", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Fender Deluxe Reverb", label: "Deluxe Reverb" },
        { pos: "Fender Deluxe Reverb_2", label: "Deluxe Reverb_2" }
      ] },
      { id: "v8-amp-fender-princeton", group: "CLEAN \u6E05\u97F3", name: "B&F NAM Fender Princeton", display: "Princeton", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Fender Princeton", label: "Princeton" },
        { pos: "Fender Princeton_2", label: "Princeton_2" }
      ] },
      { id: "v8-amp-fender-super-reverb", group: "CLEAN \u6E05\u97F3", name: "B&F NAM Fender Super Reverb", display: "Super Reverb", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Fender Super Reverb", label: "Super Reverb" },
        { pos: "Fender Super Reverb_2", label: "Super Reverb_2" }
      ] },
      { id: "v8-amp-fender-twin-reverb", group: "CLEAN \u6E05\u97F3", name: "B&F NAM Fender Twin Reverb", display: "Twin Reverb", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Fender Twin Reverb", label: "Twin Reverb" },
        { pos: "Fender Twin Reverb_2", label: "Twin Reverb_2" }
      ] },
      { id: "v8-amp-hiwatt", group: "CLEAN \u6E05\u97F3", name: "B&F NAM Hiwatt", display: "DR103", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Hiwatt", label: "DR103" },
        { pos: "Hiwatt_2", label: "DR103_2" }
      ] },
      { id: "v8-amp-roland-jc120", group: "CLEAN \u6E05\u97F3", name: "B&F NAM Roland JC120", display: "JC120", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Roland JC120", label: "JC120" }
      ] },
      { id: "v8-amp-fender-hot-rod", group: "CLEAN \u6E05\u97F3", name: "B&F NAM Fender Hot Rod", display: "Hot Rod", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Fender Hot Rod", label: "Hot Rod" },
        { pos: "Fender Hot Rod_2", label: "Hot Rod_2" }
      ] },
      { id: "v8-amp-friedman-be", group: "CRUNCH \u8FC7\u8F7D", name: "B&F NAM Friedman BE", display: "BE-100", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Friedman BE", label: "BE-100" },
        { pos: "Friedman BE_2", label: "BE-100_2" }
      ] },
      { id: "v8-amp-marshall-jcm800", group: "CRUNCH \u8FC7\u8F7D", name: "B&F NAM Marshall JCM800", display: "JCM800", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Marshall JCM800", label: "JCM800" },
        { pos: "Marshall JCM800_2", label: "JCM800_2" }
      ] },
      { id: "v8-amp-marshall-jcm900", group: "CRUNCH \u8FC7\u8F7D", name: "B&F NAM Marshall JCM900", display: "JCM900", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Marshall JCM900", label: "JCM900" },
        { pos: "Marshall JCM900_2", label: "JCM900_2" }
      ] },
      { id: "v8-amp-marshall-jtm45", group: "CRUNCH \u8FC7\u8F7D", name: "B&F NAM Marshall JTM45", display: "JTM45", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Marshall JTM45", label: "JTM45" },
        { pos: "Marshall JTM45_2", label: "JTM45_2" }
      ] },
      { id: "v8-amp-marshall-plexi", group: "CRUNCH \u8FC7\u8F7D", name: "B&F NAM Marshall Plexi", display: "Plexi", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Marshall Plexi", label: "Plexi" },
        { pos: "Marshall Plexi_2", label: "Plexi_2" }
      ] },
      { id: "v8-amp-orange-rockerverb", group: "CRUNCH \u8FC7\u8F7D", name: "B&F NAM Orange Rockerverb", display: "Rockerverb", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Orange Rockerverb", label: "Rockerverb" },
        { pos: "Orange Rockerverb_2", label: "Rockerverb_2" }
      ] },
      { id: "v8-amp-vox-ac15", group: "CRUNCH \u8FC7\u8F7D", name: "B&F NAM Vox AC15", display: "AC15", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "TREBLE", "CUT"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Vox AC15", label: "AC15" },
        { pos: "Vox AC15_2", label: "AC15_2" }
      ] },
      { id: "v8-amp-vox-ac30", group: "CRUNCH \u8FC7\u8F7D", name: "B&F NAM Vox AC30", display: "AC30", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "TREBLE", "CUT"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Vox AC30", label: "AC30" },
        { pos: "Vox AC30_2", label: "AC30_2" }
      ] },
      { id: "v8-amp-xotic-bb-preamp", group: "CRUNCH \u8FC7\u8F7D", name: "B&F NAM Xotic BB Preamp", display: "BB Preamp", knobs: ["GAIN", "VOLUME", "MASTER"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Xotic BB Preamp", label: "BB Preamp" }
      ] },
      { id: "v8-amp-bogner-ecstasy", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM Bogner Ecstasy", display: "Ecstasy", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Bogner Ecstasy", label: "Ecstasy" },
        { pos: "Bogner Ecstasy_2", label: "Ecstasy_2" }
      ] },
      { id: "v8-amp-bogner-uberschall", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM Bogner Uberschall", display: "Uberschall", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Bogner Uberschall", label: "Uberschall" },
        { pos: "Bogner Uberschall_2", label: "Uberschall_2" }
      ] },
      { id: "v8-amp-diezel-herbert", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM Diezel Herbert", display: "Herbert", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Diezel Herbert", label: "Herbert" }
      ] },
      { id: "v8-amp-diezel-vh4", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM Diezel VH4", display: "VH4", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Diezel VH4", label: "VH4" },
        { pos: "Diezel VH4_2", label: "VH4_2" }
      ] },
      { id: "v8-amp-engl-fireball", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM ENGL Fireball", display: "Fireball", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "ENGL Fireball", label: "Fireball" },
        { pos: "ENGL Fireball_2", label: "Fireball_2" }
      ] },
      { id: "v8-amp-engl-powerball", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM ENGL Powerball", display: "Powerball", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "ENGL Powerball", label: "Powerball" },
        { pos: "ENGL Powerball_2", label: "Powerball_2" }
      ] },
      { id: "v8-amp-engl-savage", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM ENGL Savage", display: "Savage", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "ENGL Savage", label: "Savage" },
        { pos: "ENGL Savage_2", label: "Savage_2" }
      ] },
      { id: "v8-amp-evh-5150iii", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM EVH 5150III", display: "5150III", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE", "RESONANCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "EVH 5150III", label: "5150III" },
        { pos: "EVH 5150III_2", label: "5150III_2" }
      ] },
      { id: "v8-amp-mesa-dual-rectifier", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM Mesa Dual Rectifier", display: "Dual Rectifier", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Mesa Dual Rectifier", label: "Dual Rectifier" },
        { pos: "Mesa Dual Rectifier_2", label: "Dual Rectifier_2" }
      ] },
      { id: "v8-amp-mesa-mark", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM Mesa Mark", display: "Mark", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Mesa Mark", label: "Mark" },
        { pos: "Mesa Mark_2", label: "Mark_2" }
      ] },
      { id: "v8-amp-soldano-slo", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM Soldano SLO", display: "SLO", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Soldano SLO", label: "SLO" },
        { pos: "Soldano SLO_2", label: "SLO_2" }
      ] },
      { id: "v8-amp-prs-archon", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM PRS Archon", display: "Archon", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "PRS Archon", label: "Archon" },
        { pos: "PRS Archon_2", label: "Archon_2" }
      ] },
      { id: "v8-amp-peavey-5150", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM Peavey 5150", display: "5150", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE", "RESONANCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Peavey 5150", label: "5150" },
        { pos: "Peavey 5150_2", label: "5150_2" }
      ] },
      { id: "v8-amp-peavey-6505", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM Peavey 6505", display: "6505", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE", "RESONANCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Peavey 6505", label: "6505" },
        { pos: "Peavey 6505_2", label: "6505_2" }
      ] },
      // 新箱头 pedalData subModels
      { id: "v8-amp-marshall-jvm", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM Marshall JVM", display: "JVM", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Marshall JVM", label: "A1vsA2 JVM OD1 OR A1" }, { pos: "Marshall JVM_2", label: "APP JVM CLEAN Red II" }, { pos: "Marshall JVM_3", label: "APP JVM CLEAN Red IV" }, { pos: "Marshall JVM_4", label: "APP JVM CLEAN Red VIII" }, { pos: "Marshall JVM_5", label: "APP JVM CRUNCH Green VI" }] },
      { id: "v8-amp-marshall-jcm2000-dsl", group: "CRUNCH \u8FC7\u8F7D", name: "B&F NAM Marshall JCM2000 DSL", display: "JCM2000 DSL", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Marshall JCM2000 DSL", label: "2KDSL100 CHA CLN DI" }, { pos: "Marshall JCM2000 DSL_2", label: "2KDSL100 CHA CRN DI" }, { pos: "Marshall JCM2000 DSL_3", label: "2KDSL100 CHB ULT DI" }] },
      { id: "v8-amp-revv-generator", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM Revv Generator", display: "Generator", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Revv Generator", label: "REVV G2 01" }, { pos: "Revv Generator_2", label: "REVV G20 CRUNCH 1" }, { pos: "Revv Generator_3", label: "REVV G20 CRUNCH 2" }, { pos: "Revv Generator_4", label: "REVV G20 RHYTHM GAIN 1" }, { pos: "Revv Generator_5", label: "REVV G20 RHYTHM GAIN 2 T9OD" }] },
      { id: "v8-amp-randall-diavlo", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM Randall Diavlo", display: "Randall Diavlo", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Randall Diavlo", label: "PEAVEY Thrasher 4" }, { pos: "Randall Diavlo_2", label: "PEAVEY Thrasher 5150" }, { pos: "Randall Diavlo_3", label: "RANDALL Diavlo RD100H CH Clean" }] }
    ],
    bass: [
      { id: "v8-amp-ampeg-b-18n", group: "\u7BB1\u5934", name: "B&F NAM Ampeg B-18N", display: "B-18N", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Ampeg B-18N", label: "B-18N" }
      ] },
      { id: "v8-amp-ampeg-svt-4", group: "\u7BB1\u5934", name: "B&F NAM Ampeg SVT-4", display: "SVT-4", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Ampeg SVT-4", label: "SVT-4" }
      ] },
      { id: "v8-amp-ampeg-svt-cl", group: "\u7BB1\u5934", name: "B&F NAM Ampeg SVT-CL", display: "SVT-CL", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Ampeg SVT-CL", label: "SVT-CL" }
      ] },
      { id: "v8-amp-ampeg-v2", group: "\u7BB1\u5934", name: "B&F NAM Ampeg V2", display: "V2", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Ampeg V2", label: "V2" }
      ] },
      { id: "v8-amp-ampeg-v4b", group: "\u7BB1\u5934", name: "B&F NAM Ampeg V4B", display: "V4B", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Ampeg V4B", label: "V4B" }
      ] },
      { id: "v8-amp-eden", group: "\u7BB1\u5934", name: "B&F NAM Eden", display: "WT800", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Eden", label: "WT800" }
      ] },
      { id: "v8-amp-gallien-krueger", group: "\u7BB1\u5934", name: "B&F NAM Gallien-Krueger", display: "800RB", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Gallien-Krueger", label: "800RB" },
        { pos: "Gallien-Krueger_2", label: "800RB_2" }
      ] },
      { id: "v8-amp-hartke", group: "\u7BB1\u5934", name: "B&F NAM Hartke", display: "LH500", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Hartke", label: "LH500" },
        { pos: "Hartke_2", label: "LH500_2" }
      ] },
      { id: "v8-amp-markbass-little-mark", group: "\u7BB1\u5934", name: "B&F NAM Markbass Little Mark", display: "Little Mark", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [
        { pos: "Markbass Little Mark", label: "Little Mark" },
        { pos: "Markbass Little Mark_2", label: "Little Mark_2" }
      ] },
      { id: "v8-amp-mesa-triple-rectifier", group: "HIGH GAIN \u9AD8\u589E\u76CA", name: "B&F NAM Mesa Triple Rectifier", display: "Triple Rectifier", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Mesa Triple Rectifier", label: "MESA BOOGIE TRIPLE RECTIFIER PLUMES EQD" }, { pos: "Mesa Triple Rectifier_2", label: "Mesa Boogie Triple Rectifier edited" }, { pos: "Mesa Triple Rectifier_3", label: "Mesa Boogie Triple Rectifier" }, { pos: "Mesa Triple Rectifier_4", label: "Mesa Triple Rec Red No Boost" }, { pos: "Mesa Triple Rectifier_5", label: "Mesa Triple Rectifier MD421 SM57 Sphere U4" }] },
      { id: "v8-amp-ampeg-v4", group: "\u7BB1\u5934", name: "B&F NAM Ampeg V4", display: "V4", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Ampeg V4", label: "64 Bandmaster Clean Norm, V4 T6 B6" }, { pos: "Ampeg V4_2", label: "66 DR Sweet Spot Norm V4 T5 B5" }, { pos: "Ampeg V4_3", label: "71 Twin Big Clean Norm V4 T6 M7 B5" }, { pos: "Ampeg V4_4", label: "Ampeg SS 140C Martyr V4 (REVyHI Architectu" }, { pos: "Ampeg V4_5", label: "Ampeg V4 T 3 30, M 11 o'clock, B 2 30 mid " }] },
      { id: "v8-amp-ampeg-b15", group: "\u7BB1\u5934", name: "B&F NAM Ampeg B15", display: "B15", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Ampeg B15", label: "Ampeg B15 U47" }, { pos: "Ampeg B15_2", label: "Ampeg B15 Sum U47 and M80" }, { pos: "Ampeg B15_3", label: "Ampeg B15N Head Only Vol Max B&T 12 Ultra " }, { pos: "Ampeg B15_4", label: "Ampeg B15N Head Vol B&T at 12 Ultra Lo OFF" }] },
      { id: "v8-amp-ampeg-svt", group: "\u7BB1\u5934", name: "B&F NAM Ampeg SVT", display: "SVT", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Ampeg SVT", label: "AAF AMPEG SVT 4 PRO" }, { pos: "Ampeg SVT_2", label: "Ampeg SGT SGT On@ 7 SVT Voicing Bass@2 Mid" }, { pos: "Ampeg SVT_3", label: "Ampeg SGT SGT On@ 8 SVT Voicing Bass@2 Mid" }, { pos: "Ampeg SVT_4", label: "Ampeg SGT SGT On @12 SVT Voice Bass@2 Mid@" }] },
      { id: "v8-amp-fender-rumble", group: "\u7BB1\u5934", name: "B&F NAM Fender Rumble", display: "Rumble", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Fender Rumble", label: "Fender Rumble 100 Low 5, Mid 5, High 5 Bri" }, { pos: "Fender Rumble_2", label: "Fender Rumble 100 Low 5, Mid 5, High 5 Def" }, { pos: "Fender Rumble_3", label: "Your Bass Preset Fender Rumble Stage 800" }] },
      { id: "v8-amp-gallien-krueger-mb150", group: "\u7BB1\u5934", name: "B&F NAM Gallien-Krueger MB150", display: "MB150", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Gallien-Krueger MB150", label: "GK MBS150 Gritty Max" }, { pos: "Gallien-Krueger MB150_2", label: "GK MBS150 Reggae" }] },
      { id: "v8-amp-orange-terror-bass", group: "\u7BB1\u5934", name: "B&F NAM Orange Terror Bass", display: "Terror Bass", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Orange Terror Bass", label: "ORANGE TERROR BASS (DRIVEN)" }] },
      { id: "v8-amp-darkglass-microtubes-900", group: "\u7BB1\u5934", name: "B&F NAM Darkglass Microtubes 900", display: "M900", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Darkglass Microtubes 900", label: "Darkglass Microtubes 900" }] },
      { id: "v8-amp-mesa-bass-800d", group: "\u7BB1\u5934", name: "B&F NAM Mesa Bass 800D", display: "Bass 800D", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Mesa Bass 800D", label: "MESA BASS 800D SEND FAT CLASSIC ROCK" }, { pos: "Mesa Bass 800D_2", label: "MESA BASS 800D SEND MODERN ROCK METAL" }, { pos: "Mesa Bass 800D_3", label: "MESA BASS 800D SEND REGGAE" }, { pos: "Mesa Bass 800D_4", label: "MESA BASS 800D SEND ROUND R AND B" }, { pos: "Mesa Bass 800D_5", label: "MESA BASS 800D SEND SLAP FUNK FINGERSTYLE" }] },
      { id: "v8-amp-mesa-subway-d800", group: "\u7BB1\u5934", name: "B&F NAM Mesa Subway D800", display: "Subway D800", knobs: ["GAIN", "VOLUME", "MASTER", "BASS", "MIDDLE", "TREBLE", "PRESENCE"], color: "#303030", accentColor: "#e0a040", disabled: false, captures: [{ pos: "Mesa Subway D800", label: "Mesa Subway D800+ Deep Off Voicing 50%" }, { pos: "Mesa Subway D800_2", label: "Mesa Subway D800+ Deep Off Voicing 75%" }, { pos: "Mesa Subway D800_3", label: "Mesa Subway D800+ Deep On Voicing 25%" }, { pos: "Mesa Subway D800_4", label: "Mesa Subway D800+ Deep On Voicing 50%" }, { pos: "Mesa Subway D800_5", label: "Mesa Subway D800+ Deep On Voicing 75%" }] }
    ]
  }
};
var cabinet = {
  id: "cabinet",
  label: "Cabinet",
  shortLabel: "CAB",
  hasSubModels: true,
  subModels: {
    guitar: [
      // ── T3K 重构（2026-09-26）：64 型号 / 8 品牌；参数见 cabinetPeqData.ts B 区 ──
      { id: "v14-cab-dr-z-maz-38-sr-2x12", group: "Dr. Z", name: "B&F NAM DR Z Maz 38 Sr 2x12", display: "DR Z Maz 38 Sr 2x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "DR Z Maz 38 Sr 2x12", disabled: false, captures: [
        { pos: "G12H anniversary + V30 UK -Airsong", label: "G12H anniversary + V30 UK -Airsong" }
      ] },
      { id: "v14-cab-5150-iconic-4x12", group: "EVH", name: "B&F NAM 5150 ICONIC 4X12", display: "5150 ICONIC 4X12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "5150 ICONIC 4X12", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-5150-iconic-x-fender-hm-4x12", group: "EVH", name: "B&F NAM 5150 ICONIC X FENDER HM 4X12", display: "5150 ICONIC X FENDER HM 4X12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "5150 ICONIC X FENDER HM 4X12", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-carvin-4x12", group: "EVH", name: "B&F NAM Carvin 4x12", display: "Carvin 4x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Carvin 4x12", disabled: false, captures: [
        { pos: "Eminence Carvin British 100", label: "Eminence Carvin British 100" }
      ] },
      { id: "v14-cab-evh-5150-iii", group: "EVH", name: "B&F NAM EVH 5150 iii", display: "EVH 5150 iii", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "EVH 5150 iii", disabled: false, captures: [
        { pos: "Airsong", label: "Airsong" }
      ] },
      { id: "v14-cab-g12-evh-ur-5150iii-4x12", group: "EVH", name: "B&F NAM G12-EVH UR 5150III 4x12", display: "G12-EVH UR 5150III 4x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "G12-EVH UR 5150III 4x12", disabled: false, captures: [
        { pos: "SM57 2.25in 0.0in VP28", label: "SM57 2.25in 0.0in VP28" },
        { pos: "SM57 1.75in 0.0in CL7603", label: "SM57 1.75in 0.0in CL7603" },
        { pos: "SM57 2.00in 0.0in OA30 CL7603", label: "SM57 2.00in 0.0in OA30 CL7603" }
      ] },
      { id: "v14-cab-1966-bassman-with-jensen-c12n", group: "Fender", name: "B&F NAM 1966 Bassman with Jensen C12N", display: "1966 Bassman with Jensen C12N", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "1966 Bassman with Jensen C12N", disabled: false, captures: [
        { pos: "Cone", label: "Cone" }
      ] },
      { id: "v14-cab-1966-bassman-with-jensen-c12na", group: "Fender", name: "B&F NAM 1966 Bassman with Jensen C12NA", display: "1966 Bassman with Jensen C12NA", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "1966 Bassman with Jensen C12NA", disabled: false, captures: [
        { pos: "Cap", label: "Cap" },
        { pos: "Cone", label: "Cone" },
        { pos: "Cap Edge", label: "Cap Edge" },
        { pos: "Distant 12In", label: "Distant 12In" },
        { pos: "Distant 24In", label: "Distant 24In" },
        { pos: "Cap Edge #2", label: "Cap Edge" },
        { pos: "Cone Edge", label: "Cone Edge" }
      ] },
      { id: "v14-cab-1970-bassman-cts-sm57-lower", group: "Fender", name: "B&F NAM 1970 Bassman CTS (SM57 Lower)", display: "1970 Bassman CTS (SM57 Lower)", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "1970 Bassman CTS (SM57 Lower)", disabled: false, captures: [
        { pos: "Cone Edge", label: "Cone Edge" },
        { pos: "Cap", label: "Cap" },
        { pos: "Cap Edge", label: "Cap Edge" },
        { pos: "Cone", label: "Cone" }
      ] },
      { id: "v14-cab-1970-bassman-cts-sm57-upper", group: "Fender", name: "B&F NAM 1970 Bassman CTS (SM57 Upper)", display: "1970 Bassman CTS (SM57 Upper)", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "1970 Bassman CTS (SM57 Upper)", disabled: false, captures: [
        { pos: "Cap", label: "Cap" },
        { pos: "Cone", label: "Cone" },
        { pos: "Cone Edge", label: "Cone Edge" },
        { pos: "Cap Edge", label: "Cap Edge" }
      ] },
      { id: "v14-cab-1971-fender-twin-reverb-2x12-oxford-12t6-10", group: "Fender", name: "B&F NAM 1971 Fender Twin Reverb 2x12 Oxford 12T6-10", display: "1971 Fender Twin Reverb 2x12 Oxford 12T6-10", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "1971 Fender Twin Reverb 2x12 Oxford 12T6-10", disabled: false, captures: [
        { pos: "Distant 24In", label: "Distant 24In" },
        { pos: "Cap", label: "Cap" },
        { pos: "Cap #2", label: "Cap" },
        { pos: "Cone", label: "Cone" },
        { pos: "Cap Edge", label: "Cap Edge" },
        { pos: "Rear 12In", label: "Rear 12In" },
        { pos: "Cap Edge #2", label: "Cap Edge" },
        { pos: "Rear 24In", label: "Rear 24In" }
      ] },
      { id: "v14-cab-blfr-lr-4x10", group: "Fender", name: "B&F NAM BLFR LR 4x10", display: "BLFR LR 4x10", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "BLFR LR 4x10", disabled: false, captures: [
        { pos: "ST170 3.00in 3.0in", label: "ST170 3.00in 3.0in" },
        { pos: "ST170 2.00in 3.0in", label: "ST170 2.00in 3.0in" },
        { pos: "SM57 3.25in 0.0in", label: "SM57 3.25in 0.0in" },
        { pos: "ST170 1.00in 3.0in", label: "ST170 1.00in 3.0in" }
      ] },
      { id: "v14-cab-db-fender-jenp10r", group: "Fender", name: "B&F NAM DB FENDER JENP10R", display: "DB FENDER JENP10R", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "DB FENDER JENP10R", disabled: false, captures: [
        { pos: "Clean", label: "Clean" }
      ] },
      { id: "v14-cab-deluxe-reverb-oxford", group: "Fender", name: "B&F NAM DELUXE REVERB OXFORD", display: "DELUXE REVERB OXFORD", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "DELUXE REVERB OXFORD", disabled: false, captures: [
        { pos: "BIG", label: "BIG" },
        { pos: "LEAN", label: "LEAN" }
      ] },
      { id: "v14-cab-fender-hm-4x12", group: "Fender", name: "B&F NAM FENDER HM 4X12", display: "FENDER HM 4X12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "FENDER HM 4X12", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-fender-bassman-410", group: "Fender", name: "B&F NAM Fender Bassman 410", display: "Fender Bassman 410", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Fender Bassman 410", disabled: false, captures: [
        { pos: "MD421 + R121", label: "MD421 + R121" }
      ] },
      { id: "v14-cab-fender-bassman-neo-115", group: "Fender", name: "B&F NAM Fender Bassman Neo 115", display: "Fender Bassman Neo 115", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Fender Bassman Neo 115", disabled: false, captures: [
        { pos: "SM57_Close_OnAxis", label: "SM57_Close_OnAxis" }
      ] },
      { id: "v14-cab-fender-bassman-neo-410", group: "Fender", name: "B&F NAM Fender Bassman Neo 410", display: "Fender Bassman Neo 410", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Fender Bassman Neo 410", disabled: false, captures: [
        { pos: "SM57_Close_OnAxis", label: "SM57_Close_OnAxis" }
      ] },
      { id: "v14-cab-p10r-ur-4x10", group: "Fender", name: "B&F NAM P10R UR 4x10", display: "P10R UR 4x10", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "P10R UR 4x10", disabled: false, captures: [
        { pos: "M160 2.50in 2.0in", label: "M160 2.50in 2.0in" },
        { pos: "SM57 2.25in 0.0in", label: "SM57 2.25in 0.0in" }
      ] },
      { id: "v14-cab-tf-56-tweed-pro-1x15-c15n", group: "Fender", name: "B&F NAM TF '56 TWEED PRO 1X15 C15N", display: "TF '56 TWEED PRO 1X15 C15N", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "TF '56 TWEED PRO 1X15 C15N", disabled: false, captures: [
        { pos: "Enhanced", label: "Enhanced" }
      ] },
      { id: "v14-cab-tf-66-dr-1x12-jensn-c12na", group: "Fender", name: "B&F NAM TF 66 DR 1X12 JENSN C12NA", display: "TF 66 DR 1X12 JENSN C12NA", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "TF 66 DR 1X12 JENSN C12NA", disabled: false, captures: [
        { pos: "545 2", label: "545 2" },
        { pos: "Enhanced", label: "Enhanced" },
        { pos: "57 R121 70-30", label: "57 R121 70-30" }
      ] },
      { id: "v14-cab-db-framus-4x12-g12m", group: "Framus", name: "B&F NAM DB FRAMUS 4X12 G12M", display: "DB FRAMUS 4X12 G12M", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "DB FRAMUS 4X12 G12M", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-db-marshall-4x12-t75", group: "Marshall", name: "B&F NAM DB MARSHALL 4X12 T75", display: "DB MARSHALL 4X12 T75", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "DB MARSHALL 4X12 T75", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-marshall-1960", group: "Marshall", name: "B&F NAM Marshall 1960", display: "Marshall 1960", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Marshall 1960", disabled: false, captures: [
        { pos: "421", label: "421" }
      ] },
      { id: "v14-cab-marshall-1972-1960a-4x12-custom", group: "Marshall", name: "B&F NAM Marshall 1972 1960a 4x12 custom", display: "Marshall 1972 1960a 4x12 custom", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Marshall 1972 1960a 4x12 custom", disabled: false, captures: [
        { pos: "Celestian Greenbacks -Airsong", label: "Celestian Greenbacks -Airsong" }
      ] },
      { id: "v14-cab-marshall-4x12-mix-ready", group: "Marshall", name: "B&F NAM Marshall 4x12 Mix-Ready", display: "Marshall 4x12 Mix-Ready", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Marshall 4x12 Mix-Ready", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-marshall-box", group: "Marshall", name: "B&F NAM Marshall Box", display: "Marshall Box", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Marshall Box", disabled: false, captures: [
        { pos: "906-B", label: "906-B" },
        { pos: "SM57-C", label: "SM57-C" },
        { pos: "906-E", label: "906-E" },
        { pos: "SM57-E", label: "SM57-E" },
        { pos: "SM57-D", label: "SM57-D" }
      ] },
      { id: "v14-cab-marshall-jcm900-lead-1960", group: "Marshall", name: "B&F NAM Marshall JCM900 LEAD-1960", display: "Marshall JCM900 LEAD-1960", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Marshall JCM900 LEAD-1960", disabled: false, captures: [
        { pos: "SM57", label: "SM57" }
      ] },
      { id: "v14-cab-marshall-jcm900-lead-1960-blended-3", group: "Marshall", name: "B&F NAM Marshall JCM900 LEAD-1960 BLENDED 3", display: "Marshall JCM900 LEAD-1960 BLENDED 3", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Marshall JCM900 LEAD-1960 BLENDED 3", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-marshall-jcm900-lead-1960-sehnneiser", group: "Marshall", name: "B&F NAM Marshall JCM900 LEAD-1960 SEHNNEISER", display: "Marshall JCM900 LEAD-1960 SEHNNEISER", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Marshall JCM900 LEAD-1960 SEHNNEISER", disabled: false, captures: [
        { pos: "e609", label: "e609" }
      ] },
      { id: "v14-cab-tj3-69mars412-grn", group: "Marshall", name: "B&F NAM TJ3 69Mars412 GRN", display: "TJ3 69Mars412 GRN", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "TJ3 69Mars412 GRN", disabled: false, captures: [
        { pos: "121-545", label: "121-545" }
      ] },
      { id: "v14-cab-db-mesa-4x12-v30", group: "Mesa", name: "B&F NAM DB MESA 4X12 V30", display: "DB MESA 4X12 V30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "DB MESA 4X12 V30", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-darkdays-mesa2x12-v30", group: "Mesa", name: "B&F NAM DarkDays-Mesa2x12-V30", display: "DarkDays-Mesa2x12-V30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "DarkDays-Mesa2x12-V30", disabled: false, captures: [
        { pos: "edge_1in", label: "edge_1in" },
        { pos: "cone_grille", label: "cone_grille" }
      ] },
      { id: "v14-cab-darkdays-mesa2x12-v30-mix-balanced", group: "Mesa", name: "B&F NAM DarkDays-Mesa2x12-V30 MIX Balanced", display: "DarkDays-Mesa2x12-V30 MIX Balanced", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "DarkDays-Mesa2x12-V30 MIX Balanced", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-darkdays-mesa2x12-v30-mix-deep", group: "Mesa", name: "B&F NAM DarkDays-Mesa2x12-V30 MIX Deep", display: "DarkDays-Mesa2x12-V30 MIX Deep", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "DarkDays-Mesa2x12-V30 MIX Deep", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-darkdays-mesa2x12-v30-mix-tight", group: "Mesa", name: "B&F NAM DarkDays-Mesa2x12-V30 MIX Tight", display: "DarkDays-Mesa2x12-V30 MIX Tight", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "DarkDays-Mesa2x12-V30 MIX Tight", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-mesa-412-os-v30", group: "Mesa", name: "B&F NAM Mesa 412 OS v30", display: "Mesa 412 OS v30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Mesa 412 OS v30", disabled: false, captures: [
        { pos: "sm57 top right 2002", label: "sm57 top right 2002" },
        { pos: "sm57 top right 2025", label: "sm57 top right 2025" }
      ] },
      { id: "v14-cab-mesa-boogie-rectifier-os-4x12-v30", group: "Mesa", name: "B&F NAM Mesa Boogie Rectifier OS 4x12 V30", display: "Mesa Boogie Rectifier OS 4x12 V30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Mesa Boogie Rectifier OS 4x12 V30", disabled: false, captures: [
        { pos: "R121/57", label: "R121/57" }
      ] },
      { id: "v14-cab-mesa-boogie-rectifier-os-v30", group: "Mesa", name: "B&F NAM Mesa Boogie Rectifier OS V30", display: "Mesa Boogie Rectifier OS V30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Mesa Boogie Rectifier OS V30", disabled: false, captures: [
        { pos: "R121/SM57 EQ 2", label: "R121/SM57 EQ 2" }
      ] },
      { id: "v14-cab-mesa-os-4x12", group: "Mesa", name: "B&F NAM Mesa OS 4x12", display: "Mesa OS 4x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Mesa OS 4x12", disabled: false, captures: [
        { pos: "57_m160", label: "57_m160" }
      ] },
      { id: "v14-cab-mesa-oversized-sm57-vr2-5150-power", group: "Mesa", name: "B&F NAM Mesa Oversized SM57 VR2 5150 Power", display: "Mesa Oversized SM57 VR2 5150 Power", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Mesa Oversized SM57 VR2 5150 Power", disabled: false, captures: [
        { pos: "jp_is_out_of_tune", label: "jp_is_out_of_tune" }
      ] },
      { id: "v14-cab-mesa-recto-212-karnivore", group: "Mesa", name: "B&F NAM Mesa Recto 212 Karnivore", display: "Mesa Recto 212 Karnivore", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Mesa Recto 212 Karnivore", disabled: false, captures: [
        { pos: "SM57 (vivahatex)", label: "SM57 (vivahatex)" }
      ] },
      { id: "v14-cab-mesa-recto-212-karnivore-dv77", group: "Mesa", name: "B&F NAM Mesa Recto 212 Karnivore/DV77", display: "Mesa Recto 212 Karnivore/DV77", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Mesa Recto 212 Karnivore/DV77", disabled: false, captures: [
        { pos: "SM57 (vivahatex)", label: "SM57 (vivahatex)" }
      ] },
      { id: "v14-cab-mesa-recto-212-karnivore-swamp-thang", group: "Mesa", name: "B&F NAM Mesa Recto 212 Karnivore/Swamp Thang", display: "Mesa Recto 212 Karnivore/Swamp Thang", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Mesa Recto 212 Karnivore/Swamp Thang", disabled: false, captures: [
        { pos: "SM57 (vivahatex)", label: "SM57 (vivahatex)" }
      ] },
      { id: "v14-cab-mesa-recto-212-karnivore-v30", group: "Mesa", name: "B&F NAM Mesa Recto 212 Karnivore/V30", display: "Mesa Recto 212 Karnivore/V30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Mesa Recto 212 Karnivore/V30", disabled: false, captures: [
        { pos: "SM57 (vivahatex)", label: "SM57 (vivahatex)" }
      ] },
      { id: "v14-cab-pj-mesa-rectifier-4x12-pg-27-pos-3", group: "Mesa", name: "B&F NAM PJ Mesa Rectifier 4x12 pg 27 pos 3", display: "PJ Mesa Rectifier 4x12 pg 27 pos 3", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "PJ Mesa Rectifier 4x12 pg 27 pos 3", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-pj-mesa-rectifier-4x12-sm", group: "Mesa", name: "B&F NAM PJ Mesa Rectifier 4x12 sm", display: "PJ Mesa Rectifier 4x12 sm", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "PJ Mesa Rectifier 4x12 sm", disabled: false, captures: [
        { pos: "57 pos 1L", label: "57 pos 1L" },
        { pos: "57 pos 3", label: "57 pos 3" },
        { pos: "57 pos 1LO", label: "57 pos 1LO" },
        { pos: "57 pos 2", label: "57 pos 2" }
      ] },
      { id: "v14-cab-room-left-mesa-oversized-at2020", group: "Mesa", name: "B&F NAM Room Left Mesa Oversized AT2020", display: "Room Left Mesa Oversized AT2020", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Room Left Mesa Oversized AT2020", disabled: false, captures: [
        { pos: "jp_is_out_of_tune", label: "jp_is_out_of_tune" }
      ] },
      { id: "v14-cab-room-right-mesa-oversized-at2020", group: "Mesa", name: "B&F NAM Room Right Mesa Oversized AT2020", display: "Room Right Mesa Oversized AT2020", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Room Right Mesa Oversized AT2020", disabled: false, captures: [
        { pos: "jp_is_out_of_tune", label: "jp_is_out_of_tune" }
      ] },
      { id: "v14-cab-tf-mesa-st-4x12a-v30", group: "Mesa", name: "B&F NAM TF MESA ST 4X12A V30", display: "TF MESA ST 4X12A V30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "TF MESA ST 4X12A V30", disabled: false, captures: [
        { pos: "421 U5 3", label: "421 U5 3" },
        { pos: "Enhanced", label: "Enhanced" },
        { pos: "Top Boost", label: "Top Boost" }
      ] },
      { id: "v14-cab-db-orange-ppc-4x12-v30", group: "Orange", name: "B&F NAM DB ORANGE PPC 4X12 V30", display: "DB ORANGE PPC 4X12 V30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "DB ORANGE PPC 4X12 V30", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-o412st-v30-03", group: "Orange", name: "B&F NAM O412st - V30-03", display: "O412st - V30-03", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "O412st - V30-03", disabled: false, captures: [
        { pos: "05 (eoc-)_dc", label: "05 (eoc-)_dc" },
        { pos: "01 (c)_dc", label: "01 (c)_dc" },
        { pos: "05 (eoc-)_dc #2", label: "05 (eoc-)_dc" },
        { pos: "01 (c)_dc #2", label: "01 (c)_dc" }
      ] },
      { id: "v14-cab-o412st-v30-03-v7x", group: "Orange", name: "B&F NAM O412st - V30-03 - V7X", display: "O412st - V30-03 - V7X", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "O412st - V30-03 - V7X", disabled: false, captures: [
        { pos: "03 (eoc+)_dc", label: "03 (eoc+)_dc" }
      ] },
      { id: "v14-cab-orange-2x12-v30", group: "Orange", name: "B&F NAM Orange 2x12 V30", display: "Orange 2x12 V30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Orange 2x12 V30", disabled: false, captures: [
        { pos: "SM57 A", label: "SM57 A" },
        { pos: "e906 D", label: "e906 D" },
        { pos: "SM57 D", label: "SM57 D" }
      ] },
      { id: "v14-cab-orange-2x12-v30-rm700-d", group: "Orange", name: "B&F NAM Orange 2x12 V30 RM700 D", display: "Orange 2x12 V30 RM700 D", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Orange 2x12 V30 RM700 D", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-orange-2x12-v30-rm700-e", group: "Orange", name: "B&F NAM Orange 2x12 V30 RM700 E", display: "Orange 2x12 V30 RM700 E", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Orange 2x12 V30 RM700 E", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-orange-4x12-v30-shure57-cn", group: "Orange", name: "B&F NAM Orange 4x12 V30 shure57 cn", display: "Orange 4x12 V30 shure57 cn", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Orange 4x12 V30 shure57 cn", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-orange-ppc212-2x12-vintage-30-s-early-uk-airsong", group: "Orange", name: "B&F NAM Orange ppc212 2x12 -vintage 30's early UK- AIrsong", display: "Orange ppc212 2x12 -vintage 30's early UK- AIrsong", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Orange ppc212 2x12 -vintage 30's early UK- AIrsong", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] },
      { id: "v14-cab-tf-orange-4x12-v30", group: "Orange", name: "B&F NAM TF ORANGE 4X12 V30", display: "TF ORANGE 4X12 V30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "TF ORANGE 4X12 V30", disabled: false, captures: [
        { pos: "BETA", label: "BETA" },
        { pos: "017 TUBE 3", label: "017 TUBE 3" },
        { pos: "421 U5 M160 70-30", label: "421 U5 M160 70-30" },
        { pos: "Enhanced", label: "Enhanced" }
      ] },
      { id: "v14-cab-tj3-70orng412-h30", group: "Orange", name: "B&F NAM TJ3 70ORNG412 H30", display: "TJ3 70ORNG412 H30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "TJ3 70ORNG412 H30", disabled: false, captures: [
        { pos: "121-545", label: "121-545" }
      ] },
      { id: "v14-cab-tf-64-ac30-2x12-blue", group: "Vox", name: "B&F NAM TF 64 AC30 2X12 BLUE", display: "TF 64 AC30 2X12 BLUE", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "TF 64 AC30 2X12 BLUE", disabled: false, captures: [
        { pos: "57 R121 70-30", label: "57 R121 70-30" }
      ] },
      { id: "v14-cab-tj3-66ac30-slvr", group: "Vox", name: "B&F NAM TJ3 66AC30 SLVR", display: "TJ3 66AC30 SLVR", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "TJ3 66AC30 SLVR", disabled: false, captures: [
        { pos: "121-545", label: "121-545" }
      ] },
      { id: "v14-cab-vox-ac50-2x12-with-goodmans-241", group: "Vox", name: "B&F NAM VOX AC50 2x12 With Goodmans 241", display: "VOX AC50 2x12 With Goodmans 241", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "VOX AC50 2x12 With Goodmans 241", disabled: false, captures: [
        { pos: "(\u65E0\u8BDD\u7B52)", label: "(\u65E0\u8BDD\u7B52)" }
      ] }
    ],
    bass: [
      // ── T3K 重构（2026-09-26）：17 型号 / 8 品牌 ──
      { id: "v14-cab-ampeg-8x10", group: "Ampeg", name: "B&F NAM Ampeg 8x10", display: "Ampeg 8x10", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ampeg 8x10", disabled: false, captures: [
        { pos: "4033 AH", label: "4033 AH" },
        { pos: "57 AH", label: "57 AH" },
        { pos: "D6 AH", label: "D6 AH" },
        { pos: "e602 A107", label: "e602 A107" }
      ] },
      { id: "v14-cab-ampeg-b15n", group: "Ampeg", name: "B&F NAM Ampeg B15N", display: "Ampeg B15N", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ampeg B15N", disabled: false, captures: [
        { pos: "SM57 + R121", label: "SM57 + R121" }
      ] },
      { id: "v14-cab-ampeg-svt410hlf", group: "Ampeg", name: "B&F NAM Ampeg SVT410HLF", display: "Ampeg SVT410HLF", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ampeg SVT410HLF", disabled: false, captures: [
        { pos: "MD421 + F47", label: "MD421 + F47" }
      ] },
      { id: "v14-cab-ampeg-v9", group: "Ampeg", name: "B&F NAM Ampeg V9", display: "Ampeg V9", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ampeg V9", disabled: false, captures: [
        { pos: "SM57 1 + R121 3", label: "SM57 1 + R121 3" }
      ] },
      { id: "v14-cab-dean-svt-crossover", group: "Ampeg", name: "B&F NAM Dean SVT Crossover", display: "Dean SVT Crossover", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Dean SVT Crossover", disabled: false, captures: [
        { pos: "4x10 Subkick + P10", label: "4x10 Subkick + P10" }
      ] },
      { id: "v14-cab-ashdown-abm-bp1510", group: "Ashdown", name: "B&F NAM Ashdown ABM BP1510", display: "Ashdown ABM BP1510", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ashdown ABM BP1510", disabled: false, captures: [
        { pos: "Se4400a + BD300", label: "Se4400a + BD300" }
      ] },
      { id: "v14-cab-darkglass-dg410c", group: "Darkglass", name: "B&F NAM Darkglass DG410C", display: "Darkglass DG410C", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Darkglass DG410C", disabled: false, captures: [
        { pos: "Beta52 A8 + U87 B5", label: "Beta52 A8 + U87 B5" }
      ] },
      { id: "v14-cab-eden-nemesis-410", group: "Eden", name: "B&F NAM Eden Nemesis 410", display: "Eden Nemesis 410", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Eden Nemesis 410", disabled: false, captures: [
        { pos: "SM57 + SE441", label: "SM57 + SE441" }
      ] },
      { id: "v14-cab-gk-rbh-410", group: "Gallien-Krueger", name: "B&F NAM GK RBH 410", display: "GK RBH 410", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "GK RBH 410", disabled: false, captures: [
        { pos: "SM57 + MD421", label: "SM57 + MD421" }
      ] },
      { id: "v14-cab-mesa-powerhouse-215", group: "Mesa", name: "B&F NAM Mesa Powerhouse 215", display: "Mesa Powerhouse 215", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Mesa Powerhouse 215", disabled: false, captures: [
        { pos: "SM57 + MD421", label: "SM57 + MD421" }
      ] },
      { id: "v14-cab-mesa-powerhouse-410", group: "Mesa", name: "B&F NAM Mesa Powerhouse 410", display: "Mesa Powerhouse 410", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Mesa Powerhouse 410", disabled: false, captures: [
        { pos: "SM57 + MD421", label: "SM57 + MD421" }
      ] },
      { id: "v14-cab-mesa-powerhouse-410-215", group: "Mesa", name: "B&F NAM Mesa Powerhouse 410+215", display: "Mesa Powerhouse 410+215", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Mesa Powerhouse 410+215", disabled: false, captures: [
        { pos: "SM57 + RE20", label: "SM57 + RE20" }
      ] },
      { id: "v14-cab-peavey-115bx", group: "Peavey", name: "B&F NAM Peavey 115BX", display: "Peavey 115BX", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Peavey 115BX", disabled: false, captures: [
        { pos: "BD300 + D11L", label: "BD300 + D11L" }
      ] },
      { id: "v14-cab-peavey-215-bw", group: "Peavey", name: "B&F NAM Peavey 215 BW", display: "Peavey 215 BW", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Peavey 215 BW", disabled: false, captures: [
        { pos: "Se4400a", label: "Se4400a" }
      ] },
      { id: "v14-cab-science-215-kappalite-3015", group: "Science", name: "B&F NAM Science 215 Kappalite 3015", display: "Science 215 Kappalite 3015", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Science 215 Kappalite 3015", disabled: false, captures: [
        { pos: "SM57 + RE20", label: "SM57 + RE20" }
      ] },
      { id: "v14-cab-science-610", group: "Science", name: "B&F NAM Science 610", display: "Science 610", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Science 610", disabled: false, captures: [
        { pos: "SM57 + MD421", label: "SM57 + MD421" }
      ] },
      { id: "v14-cab-science-610-215-pr400", group: "Science", name: "B&F NAM Science 610+215 PR400", display: "Science 610+215 PR400", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Science 610+215 PR400", disabled: false, captures: [
        { pos: "RE20 + U87", label: "RE20 + U87" }
      ] },
      { id: "v14-cab-swr-goliath", group: "SWR", name: "B&F NAM SWR Goliath", display: "SWR Goliath", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "SWR Goliath", disabled: false, captures: [
        { pos: "SM57 + RE20", label: "SM57 + RE20" }
      ] }
    ]
  }
};
var chorus = {
  id: "chorus",
  label: "Chorus",
  shortLabel: "CHOR",
  hasSubModels: true,
  subModels: {
    guitar: [
      { id: "ce-2", name: "CE-2 Standard", knobs: ["RATE", "DEPTH", "LEVEL"], color: "#2a3a38", accentColor: "#40c0c0" },
      { id: "ce-1", name: "CE-1 Vintage", knobs: ["RATE", "DEPTH", "LEVEL"], color: "#2a3e38", accentColor: "#50d0d0" },
      { id: "dim-c", name: "Dimension", knobs: ["RATE", "WIDTH", "DEPTH", "LEVEL"], color: "#2e3a3c", accentColor: "#60b8d0" },
      { id: "leslie", name: "Leslie Sim", knobs: ["SPEED", "DEPTH", "LEVEL"], color: "#3a3428", accentColor: "#d0b858" }
    ],
    bass: [
      { id: "bass-chorus", name: "Bass Chorus", knobs: ["RATE", "DEPTH", "LEVEL"], color: "#2a3638", accentColor: "#4098b0" },
      { id: "bass-vibrato", name: "Bass Vibrato", knobs: ["RATE", "DEPTH", "LEVEL"], color: "#362e3a", accentColor: "#a070c0" }
    ]
  },
  bodyColor: "#2a3a38",
  accentColor: "#40c0c0"
};
var delay = {
  id: "delay",
  label: "Delay",
  shortLabel: "DLY",
  hasSubModels: true,
  subModels: {
    guitar: [
      { id: "delay-analog", name: "Analog Delay", knobs: ["TIME", "REPEAT"], color: "#3a3028", accentColor: "#d8b04a" },
      { id: "delay-digital", name: "Digital Delay", knobs: ["TIME", "REPEAT"], color: "#2a3640", accentColor: "#48b0e0" }
    ],
    bass: [
      { id: "delay-analog-b", name: "Analog Delay", knobs: ["TIME", "REPEAT"], color: "#3a3028", accentColor: "#d8b04a" },
      { id: "delay-digital-b", name: "Digital Delay", knobs: ["TIME", "REPEAT"], color: "#2a3640", accentColor: "#48b0e0" }
    ]
  },
  bodyColor: "#2a3640",
  accentColor: "#48b0e0"
};
var reverb = {
  id: "reverb",
  label: "Reverb",
  shortLabel: "VERB",
  hasSubModels: true,
  subModels: {
    guitar: [
      { id: "spring", name: "Spring", knobs: ["DWELL", "MIX"], color: "#3a3028", accentColor: "#d8b858" },
      { id: "hall", name: "Hall", knobs: ["DECAY", "MIX", "PRE", "TONE"], color: "#2e3440", accentColor: "#6890c8" },
      { id: "plate", name: "Plate", knobs: ["DECAY", "MIX", "TONE"], color: "#3a3038", accentColor: "#c0a0c8" },
      { id: "room", name: "Room", knobs: ["SIZE", "MIX"], color: "#30383a", accentColor: "#60a0a8" },
      { id: "ambient", name: "Ambient", knobs: ["DECAY", "MIX", "SPREAD"], color: "#2e2840", accentColor: "#8068d0" },
      { id: "cathedral", name: "Cathedral", knobs: ["DECAY", "MIX", "PRE"], color: "#342e3a", accentColor: "#9078b8" }
    ],
    bass: [
      { id: "bass-room", name: "Bass Room", knobs: ["SIZE", "MIX"], color: "#2e383a", accentColor: "#50a0a8" },
      { id: "bass-hall", name: "Bass Hall", knobs: ["DECAY", "MIX", "PRE", "TONE"], color: "#2e3040", accentColor: "#6088c0" }
    ]
  },
  bodyColor: "#362e44",
  accentColor: "#8060d0"
};
var MODULES = [
  noiseGate,
  boost,
  compressor,
  overdrive,
  dist,
  ampHead,
  cabinet,
  chorus,
  delay,
  reverb
];
function splitSubModelName(composed) {
  const i = composed.lastIndexOf("/");
  if (i <= 0) return { hardware: composed };
  return { hardware: composed.slice(0, i), pos: composed.slice(i + 1) };
}

// src/data/uiTrim.ts
var UI_TRIM_ON = true;
var KEEP = {};
KEEP["amp-head"] = {
  // ── CLEAN 清音 ──
  "B&F NAM Dumble ODS": ["Dumble ODS"],
  "B&F NAM Fender Bassman": ["Fender Bassman"],
  "B&F NAM Fender Twin Reverb": ["Fender Twin Reverb"],
  "B&F NAM Hiwatt": ["Hiwatt"],
  "B&F NAM Roland JC120": ["Roland JC120"],
  // ── CRUNCH 过载 ──
  "B&F NAM Vox AC30": ["Vox AC30"],
  "B&F NAM Friedman BE": ["Friedman BE"],
  "B&F NAM Marshall JCM800": ["Marshall JCM800"],
  "B&F NAM Marshall Plexi": ["Marshall Plexi"],
  "B&F NAM Orange Rockerverb": ["Orange Rockerverb"],
  // ── HIGH GAIN 高增益 ──
  "B&F NAM Bogner Ecstasy": ["Bogner Ecstasy"],
  "B&F NAM Diezel VH4": ["Diezel VH4"],
  "B&F NAM ENGL Savage": ["ENGL Savage"],
  "B&F NAM Mesa Dual Rectifier": ["Mesa Dual Rectifier"],
  "B&F NAM Mesa Mark": ["Mesa Mark"],
  "B&F NAM Peavey 5150": ["Peavey 5150"],
  "B&F NAM EVH 5150III": ["EVH 5150III"],
  "B&F NAM Revv Generator": ["Revv Generator"],
  "B&F NAM Soldano SLO": ["Soldano SLO"],
  // ── 贝斯箱头 ──
  "B&F NAM Ampeg SVT-CL": ["Ampeg SVT-CL"],
  "B&F NAM Ampeg B15": ["Ampeg B15"],
  "B&F NAM Ampeg SVT-4": ["Ampeg SVT-4"],
  "B&F NAM Gallien-Krueger": ["Gallien-Krueger"],
  "B&F NAM Hartke": ["Hartke"],
  "B&F NAM Markbass Little Mark": ["Markbass Little Mark"],
  "B&F NAM Darkglass Microtubes 900": ["Darkglass Microtubes 900"],
  "B&F NAM Fender Rumble": ["Fender Rumble"],
  "B&F NAM Mesa Subway D800": ["Mesa Subway D800"]
};
KEEP.cabinet = {
  // Fender 系（Jensen / Oxford / Tweed 15" / 4x10）
  "B&F NAM 1966 Bassman with Jensen C12N": ["Cone"],
  "B&F NAM 1971 Fender Twin Reverb 2x12 Oxford 12T6-10": ["Distant 24In"],
  "B&F NAM TF '56 TWEED PRO 1X15 C15N": ["Enhanced"],
  "B&F NAM BLFR LR 4x10": ["ST170 3.00in 3.0in"],
  // Marshall 系（G12T-75 / Greenback）
  "B&F NAM Marshall 1960": ["421"],
  "B&F NAM Marshall 1972 1960a 4x12 custom": ["Celestian Greenbacks -Airsong"],
  // 现代高增益 / 其他品牌
  "B&F NAM DB FRAMUS 4X12 G12M": ["(\u65E0\u8BDD\u7B52)"],
  "B&F NAM Mesa Boogie Rectifier OS 4x12 V30": ["R121/57"],
  "B&F NAM Carvin 4x12": ["Eminence Carvin British 100"],
  "B&F NAM Orange 4x12 V30 shure57 cn": ["(\u65E0\u8BDD\u7B52)"],
  "B&F NAM TJ3 66AC30 SLVR": ["121-545"],
  "B&F NAM EVH 5150 iii": ["Airsong"],
  "B&F NAM DR Z Maz 38 Sr 2x12": ["G12H anniversary + V30 UK -Airsong"],
  "B&F NAM Mesa Recto 212 Karnivore/V30": ["SM57 (vivahatex)"],
  // 贝斯箱体
  "B&F NAM Ampeg 8x10": ["4033 AH"],
  "B&F NAM Ampeg B15N": ["SM57 + R121"],
  "B&F NAM Ampeg SVT410HLF": ["MD421 + F47"],
  "B&F NAM Mesa Powerhouse 410": ["SM57 + MD421"],
  "B&F NAM Darkglass DG410C": ["Beta52 A8 + U87 B5"],
  "B&F NAM GK RBH 410": ["SM57 + MD421"],
  "B&F NAM SWR Goliath": ["SM57 + RE20"]
};
KEEP.overdrive = {
  // 吉他
  "\u4E2D\u9891\u8FC7\u8F7D": ["TS808", "SD-1"],
  "\u900F\u660E\u8FC7\u8F7D": ["BD-2"],
  "\u8F7B\u8FC7\u8F7D": ["Klon Centaur"],
  "\u5931\u771F\u6001\u8FC7\u8F7D": ["RAT"],
  "MOSFET \u8FC7\u8F7D": ["OCD"],
  "\u53CC\u6A21\u8FC7\u8F7D": ["Plumes"],
  // 贝斯
  "\u524D\u7EA7 DI": ["SansAmp"],
  "\u8D1D\u65AF\u8FC7\u8F7D": ["B3K"],
  "\u8D1D\u65AF\u590D\u53E4": ["M80"]
};
KEEP.dist = {
  // 吉他
  "\u7ECF\u5178\u5931\u771F": ["DS-1"],
  "\u73B0\u4EE3\u91D1\u5C5E": ["MT-2"],
  "\u952F\u6761\u5931\u771F": ["HM-2"],
  "\u6CD5\u5179": ["Big Muff"],
  "\u590D\u53E4\u5931\u771F": ["Distortion+"],
  // 贝斯
  "\u8D1D\u65AF\u5931\u771F\u6CD5\u5179": ["Bass Big Muff"],
  "\u8D1D\u65AF DG": ["B7K Ultra"]
};
function applyUiTrim(module2, pinnedKey) {
  const guitarSrc = module2.subModels?.guitar ?? [];
  const bassSrc = module2.subModels?.bass ?? [];
  const spec = UI_TRIM_ON ? KEEP[module2.id] : void 0;
  if (!spec) return { list: [...guitarSrc, ...bassSrc], bassStart: guitarSrc.length };
  const pick = (arr) => {
    const out = [];
    for (const m of arr) {
      const keep = spec[m.name];
      if (!keep) continue;
      if (!m.captures?.length) {
        out.push(m);
        continue;
      }
      const caps = m.captures.filter((c) => keep.includes(c.pos));
      out.push(caps.length === m.captures.length ? m : { ...m, captures: caps });
    }
    return out;
  };
  let guitar = pick(guitarSrc);
  let bass = pick(bassSrc);
  if (pinnedKey) {
    const { hardware, pos } = splitSubModelName(pinnedKey);
    const srcGuitar = guitarSrc.find((m) => m.name === hardware);
    const srcBass = srcGuitar ? void 0 : bassSrc.find((m) => m.name === hardware);
    const src = srcGuitar ?? srcBass;
    if (src) {
      const inGuitar = !!srcGuitar;
      const holders = inGuitar ? guitar : bass;
      const idx = holders.findIndex((m) => m.name === hardware);
      if (idx < 0) {
        const item = { ...src, captures: src.captures ? [...src.captures] : void 0 };
        if (inGuitar) guitar = [...guitar, item];
        else bass = [...bass, item];
      } else if (pos && src.captures && !holders[idx].captures?.some((c) => c.pos === pos)) {
        const cap = src.captures.find((c) => c.pos === pos);
        if (cap) {
          const patched = { ...holders[idx], captures: [...holders[idx].captures ?? [], cap] };
          if (inGuitar) guitar = guitar.map((m, i) => i === idx ? patched : m);
          else bass = bass.map((m, i) => i === idx ? patched : m);
        }
      }
    }
  }
  return { list: [...guitar, ...bass], bassStart: guitar.length };
}

// scripts/_ui_trim_audit.ts
var pass = 0;
var fails = [];
var ok = (cond, msg) => {
  if (cond) pass++;
  else fails.push(msg);
};
var findMod = (id) => MODULES.find((m) => m.id === id);
var srcOf = (m) => [...m.subModels?.guitar ?? [], ...m.subModels?.bass ?? []];
var EXPECT = {
  "amp-head": { g: 19, b: 9 },
  cabinet: { g: 14, b: 7 },
  overdrive: { g: 6, b: 3 },
  dist: { g: 5, b: 2 }
};
var DEPS = [
  // 箱头：内置 16 预设 + 官方音色库 8 个箱头底座（AMP_TWIN/PLEXI/MESA/VOX/ORANGE/BOGNER/SVT/HARTKE）
  { mod: "amp-head", name: "B&F NAM Fender Twin Reverb", pos: "Fender Twin Reverb", kind: "must", why: "\u5185\u7F6EA + AMP_TWIN" },
  { mod: "amp-head", name: "B&F NAM Marshall Plexi", pos: "Marshall Plexi", kind: "must", why: "\u5185\u7F6EB + AMP_PLEXI" },
  { mod: "amp-head", name: "B&F NAM Mesa Dual Rectifier", pos: "Mesa Dual Rectifier", kind: "must", why: "\u5185\u7F6EC + AMP_MESA" },
  { mod: "amp-head", name: "B&F NAM Vox AC30", pos: "Vox AC30", kind: "must", why: "AMP_VOX" },
  { mod: "amp-head", name: "B&F NAM Orange Rockerverb", pos: "Orange Rockerverb", kind: "must", why: "AMP_ORANGE" },
  { mod: "amp-head", name: "B&F NAM Bogner Ecstasy", pos: "Bogner Ecstasy", kind: "must", why: "AMP_BOGNER" },
  { mod: "amp-head", name: "B&F NAM EVH 5150III", pos: "EVH 5150III", kind: "must", why: "AMP_EVH" },
  { mod: "amp-head", name: "B&F NAM Ampeg SVT-CL", pos: "Ampeg SVT-CL", kind: "must", why: "\u5185\u7F6ED + AMP_SVT" },
  { mod: "amp-head", name: "B&F NAM Hartke", pos: "Hartke", kind: "must", why: "\u5185\u7F6EE + AMP_HARTKE" },
  // 内置 16 预设 + 官方音色库 箱体底座
  { mod: "cabinet", name: "B&F NAM 1971 Fender Twin Reverb 2x12 Oxford 12T6-10", pos: "Distant 24In", kind: "must", why: "\u5185\u7F6EA + CAB_TWIN" },
  { mod: "cabinet", name: "B&F NAM Marshall 1960", pos: "421", kind: "must", why: "\u5185\u7F6EB + CAB_MARSHALL" },
  { mod: "cabinet", name: "B&F NAM Mesa Boogie Rectifier OS 4x12 V30", pos: "R121/57", kind: "must", why: "\u5185\u7F6EC + CAB_MESA" },
  { mod: "cabinet", name: "B&F NAM Ampeg 8x10", pos: "4033 AH", kind: "must", why: "\u5185\u7F6ED + CAB_SVT" },
  { mod: "cabinet", name: "B&F NAM GK RBH 410", pos: "SM57 + MD421", kind: "must", why: "\u5185\u7F6EE + CAB_HARTKE" },
  { mod: "cabinet", name: "B&F NAM TJ3 66AC30 SLVR", pos: "121-545", kind: "must", why: "CAB_VOX" },
  { mod: "cabinet", name: "B&F NAM Orange 4x12 V30 shure57 cn", pos: "(\u65E0\u8BDD\u7B52)", kind: "must", why: "CAB_ORANGE" },
  { mod: "cabinet", name: "B&F NAM EVH 5150 iii", pos: "Airsong", kind: "must", why: "CAB_EVH" },
  // 官方音色库使用的近似款 → 走 pinned 兜底
  { mod: "cabinet", name: "B&F NAM Orange 2x12 V30", pos: "SM57 A", kind: "fallback", why: "CAB_BOGNER" },
  // 单块：内置 16 预设依赖
  { mod: "overdrive", name: "\u4E2D\u9891\u8FC7\u8F7D", pos: "TS808", kind: "must", why: "\u5185\u7F6EA" },
  { mod: "overdrive", name: "\u4E2D\u9891\u8FC7\u8F7D", pos: "SD-1", kind: "must", why: "\u5185\u7F6EC" },
  { mod: "overdrive", name: "\u900F\u660E\u8FC7\u8F7D", pos: "BD-2", kind: "must", why: "\u5185\u7F6EB" },
  { mod: "overdrive", name: "\u8D1D\u65AF\u8FC7\u8F7D", pos: "B3K", kind: "must", why: "\u5185\u7F6ED/E" },
  { mod: "dist", name: "\u7ECF\u5178\u5931\u771F", pos: "DS-1", kind: "must", why: "\u5185\u7F6EA" },
  { mod: "dist", name: "\u73B0\u4EE3\u91D1\u5C5E", pos: "MT-2", kind: "must", why: "\u5185\u7F6EC" },
  { mod: "dist", name: "\u590D\u53E4\u5931\u771F", pos: "Distortion+", kind: "must", why: "\u5185\u7F6EB" },
  // 官方音色库使用的近似款（同型号下的变体）→ 走 pinned 兜底
  { mod: "overdrive", name: "\u4E2D\u9891\u8FC7\u8F7D", pos: "OD808", kind: "fallback", why: "officialTones\uFF08\u540C TS \u7CFB\u53D8\u4F53\uFF09" },
  { mod: "overdrive", name: "\u4E2D\u9891\u8FC7\u8F7D", pos: "Precision Drive", kind: "fallback", why: "officialTones x3" },
  { mod: "dist", name: "\u7ECF\u5178\u5931\u771F", pos: "DS-2", kind: "fallback", why: "officialTones x3" }
];
console.log("=== UI \u5C42\u7CBE\u7B80\u5BA1\u8BA1 ===");
console.log("UI_TRIM_ON =", UI_TRIM_ON);
console.log("");
for (const id of Object.keys(EXPECT)) {
  const m = findMod(id);
  if (!m) {
    fails.push(`\u6A21\u5757\u4E0D\u5B58\u5728: ${id}`);
    continue;
  }
  const before = JSON.stringify(m.subModels);
  applyUiTrim(m);
  const pin = DEPS.find((d) => d.mod === id && d.kind === "fallback");
  if (pin) applyUiTrim(m, `${pin.name}/${pin.pos}`);
  ok(JSON.stringify(m.subModels) === before, `${id}: applyUiTrim \u4FEE\u6539\u4E86\u539F subModels\uFF08\u4E0D\u53EF mutation\uFF09`);
}
console.log("\u6A21\u5757          \u5409\u4ED6         \u8D1D\u65AF");
for (const [id, exp] of Object.entries(EXPECT)) {
  const m = findMod(id);
  if (!m) continue;
  const { list, bassStart } = applyUiTrim(m);
  const g = list.slice(0, bassStart);
  const b = list.slice(bassStart);
  console.log(`${id.padEnd(12)} ${String(g.length).padStart(3)}/${String(exp.g).padEnd(3)}      ${String(b.length).padStart(3)}/${String(exp.b).padEnd(3)}`);
  ok(g.length === exp.g, `${id}: \u5409\u4ED6\u6570\u91CF ${g.length} != \u671F\u671B ${exp.g}`);
  ok(b.length === exp.b, `${id}: \u8D1D\u65AF\u6570\u91CF ${b.length} != \u671F\u671B ${exp.b}`);
  ok(bassStart === g.length, `${id}: bassStart ${bassStart} != \u5B9E\u9645\u5409\u4ED6\u6570 ${g.length}`);
  const srcGuitarLen = (m.subModels?.guitar ?? []).length;
  if (g.length < srcGuitarLen) {
    ok(bassStart < srcGuitarLen, `${id}: bassStart \u4ECD\u7528\u672A\u8FC7\u6EE4\u7684\u5409\u4ED6\u6570\uFF08${bassStart} >= ${srcGuitarLen}\uFF0C\u5206\u7EC4\u8868\u5934\u4F1A\u9519\u4F4D\uFF09`);
  }
  const src = /* @__PURE__ */ new Map();
  srcOf(m).forEach((s) => src.set(s.name, s));
  for (const s of list) {
    const o = src.get(s.name);
    ok(!!o, `${id}: \u8F93\u51FA\u578B\u53F7\u4E0D\u5728\u539F\u59CB\u6570\u636E\u4E2D \u2192 ${s.name}`);
    if (s.captures) {
      ok(s.captures.length >= 1, `${id}/${s.name}: \u6355\u83B7\u88AB\u6E05\u7A7A\uFF08\u5FC5\u987B\u4FDD\u7559\u81F3\u5C11 1 \u4E2A\uFF09`);
      for (const c of s.captures) {
        ok(!!o?.captures?.some((x) => x.pos === c.pos), `${id}/${s.name}: \u8F93\u51FA\u6355\u83B7\u4E0D\u5728\u539F\u59CB\u6570\u636E\u4E2D \u2192 ${c.pos}`);
      }
    }
  }
}
console.log("");
for (const d of DEPS) {
  const m = findMod(d.mod);
  if (!m) {
    fails.push(`\u4F9D\u8D56\u6A21\u5757\u4E0D\u5B58\u5728: ${d.mod}`);
    continue;
  }
  const { list } = applyUiTrim(m);
  const hit = list.find((s) => s.name === d.name);
  if (d.kind === "must") {
    ok(!!hit, `[must] ${d.mod}: \u4F9D\u8D56\u578B\u53F7\u88AB\u7CBE\u7B80 \u2192 ${d.name}\uFF08${d.why}\uFF09`);
    if (hit && d.pos) ok(!!hit.captures?.some((c) => c.pos === d.pos), `[must] ${d.mod}/${d.name}: \u4F9D\u8D56\u6355\u83B7\u88AB\u7CBE\u7B80 \u2192 ${d.pos}\uFF08${d.why}\uFF09`);
  } else {
    const key = d.pos ? `${d.name}/${d.pos}` : d.name;
    const visible = hit ? !d.pos || !!hit.captures?.some((c) => c.pos === d.pos) : false;
    ok(!visible, `[fallback] ${d.mod}: ${key} \u9884\u671F\u88AB\u7CBE\u7B80\uFF0C\u4F46\u9ED8\u8BA4\u5217\u8868\u4E2D\u4ECD\u53EF\u89C1\uFF08${d.why}\uFF09`);
    const pinned = applyUiTrim(m, key);
    const idx = pinned.list.findIndex((s) => s.name === d.name);
    ok(idx >= 0, `[fallback] ${d.mod}: pinned \u515C\u5E95\u627E\u4E0D\u5230\u578B\u53F7 \u2192 ${key}\uFF08${d.why}\uFF09`);
    if (idx >= 0 && d.pos) {
      const pi = pinned.list[idx].captures?.findIndex((c) => c.pos === d.pos) ?? -1;
      ok(pi >= 0, `[fallback] ${d.mod}: pinned \u515C\u5E95\u627E\u4E0D\u5230\u6355\u83B7\u7D22\u5F15\uFF08-1\uFF09\u2192 ${key}\uFF08${d.why}\uFF09`);
    }
  }
}
for (const m of MODULES) {
  if (EXPECT[m.id]) continue;
  const srcG = (m.subModels?.guitar ?? []).length;
  const srcB = (m.subModels?.bass ?? []).length;
  const { list, bassStart } = applyUiTrim(m);
  ok(list.length === srcG + srcB, `${m.id}: \u672A\u5217\u5165\u7CBE\u7B80\u6E05\u5355\u5374\u88AB\u8FC7\u6EE4\uFF08${list.length} != ${srcG + srcB}\uFF09`);
  ok(bassStart === srcG, `${m.id}: bassStart \u5F02\u5E38\uFF08${bassStart} != ${srcG}\uFF09`);
}
console.log("");
console.log(`PASS ${pass}   FAIL ${fails.length}`);
if (fails.length) {
  fails.slice(0, 40).forEach((f) => console.log("  FAIL " + f));
  console.log("\n\u5BA1\u8BA1\u672A\u901A\u8FC7");
  process.exit(1);
}
console.log("ALL PASS");
