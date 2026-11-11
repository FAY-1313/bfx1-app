/**
 * 旧箱体型号（v8 库：KNOB4 / 精选合集5 血统）— 2026-09-26 被 T3K 重构（81 型号）替换，从 UI 摘除
 * 仅作归档/回滚用，未被任何模块 import（→ 不进 bundle）；对应参数仍在 cabinetPeqData.ts 的 A 区（旧 142 键）
 * 恢复方式：把 GUITAR/BASS 数组搬回 pedalData.ts 的 cabinet.subModels 即可
 */
import type { SubModel } from '../pedalData';

export const LEGACY_CABINET_SUBMODELS: { guitar: SubModel[]; bass: SubModel[] } = {
  guitar: [
      { id: "v8-cab-fender-deluxe-cab", group: "Fender", name: "B&F NAM Fender Deluxe Cab", display: "Fe-Deluxe Reverb", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Fe-Deluxe Reverb", disabled: false, captures: [
        { pos: "Fender Deluxe Cab", label: "Deluxe Cab" }, { pos: "Fender Deluxe Cab_2", label: "Deluxe Cab_2" },
      ] },
      { id: "v8-cab-fender-twin-cab", group: "Fender", name: "B&F NAM Fender Twin Cab", display: "Fe-Twin Reverb", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Fe-Twin Reverb", disabled: false, captures: [
        { pos: "Fender Twin Cab", label: "Twin Reverb" }, { pos: "Fender Twin Cab_2", label: "Twin Reverb_2" },
      ] },
      { id: "v8-cab-fender-bassman", group: "Fender", name: "B&F NAM Fender Bassman", display: "Fe-Bassman", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Fe-Bassman", disabled: false, captures: [
        { pos: "Fender Bassman", label: "Jensen C12N C414 Cap Edge" }, { pos: "Fender Bassman_2", label: "Jensen C12N R121 Cone" }, { pos: "Fender Bassman_3", label: "Jensen C12N SM57 Cap" }, { pos: "Fender Bassman_4", label: "Jensen C12N i5 Cap Edge" }, { pos: "Fender Bassman_5", label: "Jensen C12NA C414 Cone" },
      ] },
      { id: "v8-cab-vox-ac30-cab", group: "Vox", name: "B&F NAM Vox AC30 Cab", display: "Vo-AC30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Vo-AC30", disabled: false, captures: [
        { pos: "Vox AC30 Cab", label: "AC30" }, { pos: "Vox AC30 Cab_2", label: "AC30_2" },
      ] },
      { id: "v8-cab-marshall-4x12", group: "Marshall", name: "B&F NAM Marshall 4x12", display: "Ma-4x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ma-4x12", disabled: false, captures: [
        { pos: "Marshall 4x12", label: "4x12" }, { pos: "Marshall 4x12_2", label: "4x12_2" },
      ] },
      { id: "v8-cab-marshall-jcm800", group: "Marshall", name: "B&F NAM Marshall JCM800", display: "Ma-JCM800", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ma-JCM800", disabled: false, captures: [
        { pos: "Marshall JCM800", label: "Ampeg V-4B + JCM800 Bass" }, { pos: "Marshall JCM800_2", label: "JCM800 PA" }, { pos: "Marshall JCM800_3", label: "JCM800 PA G10" }, { pos: "Marshall JCM800_4", label: "JCM800 PR" }, { pos: "Marshall JCM800_5", label: "fat lead 80 JCM800 1936 2x GT75" },
      ] },
      { id: "v8-cab-marshall-jcm2000", group: "Marshall", name: "B&F NAM Marshall JCM2000", display: "Ma-JCM2000", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ma-JCM2000", disabled: false, captures: [
        { pos: "Marshall JCM2000", label: "R-IRR" }, { pos: "Marshall JCM2000_2", label: "R-IR" },
      ] },
      { id: "v8-cab-marshall-silver-jubilee", group: "Marshall", name: "B&F NAM Marshall Silver Jubilee", display: "Ma-Silver Jub", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ma-Silver Jub", disabled: false, captures: [
        { pos: "Marshall Silver Jubilee", label: "Big Muff + Fuzz" }, { pos: "Marshall Silver Jubilee_2", label: "Big Muff Metal" }, { pos: "Marshall Silver Jubilee_3", label: "Big Muff T75" }, { pos: "Marshall Silver Jubilee_4", label: "Big Muff less gain" }, { pos: "Marshall Silver Jubilee_5", label: "Fuzz Factory Greenbk" },
      ] },
      { id: "v8-cab-mesa-4x12", group: "Mesa", name: "B&F NAM Mesa 4x12", display: "Me-4x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Me-4x12", disabled: false, captures: [
        { pos: "Mesa 4x12", label: "4x12" }, { pos: "Mesa 4x12_2", label: "4x12_2" },
      ] },
      { id: "v8-cab-mesa-cabmatch", group: "Mesa", name: "B&F NAM Mesa Cabmatch", display: "Me-Cabmatch", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Me-Cabmatch", disabled: false, captures: [
        { pos: "Mesa Cabmatch", label: "100W BOLD 2x12" }, { pos: "Mesa Cabmatch_2", label: "100W VARC 4x12" }, { pos: "Mesa Cabmatch_3", label: "20W BOLD 2x12" },
      ] },
      { id: "v8-cab-mesa-lone-star", group: "Mesa", name: "B&F NAM Mesa Lone Star", display: "Me-Lone Star", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Me-Lone Star", disabled: false, captures: [
        { pos: "Mesa Lone Star", label: "Lonestar 4x12 SM58" },
      ] },
      { id: "v8-cab-mesa-mark-4x12", group: "Mesa", name: "B&F NAM Mesa Mark 4x12", display: "Me-Mark", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Me-Mark", disabled: false, captures: [
        { pos: "Mesa Mark 4x12", label: "Mark V MK IV LIVE" }, { pos: "Mesa Mark 4x12_2", label: "Mark V Rhythm IR" }, { pos: "Mesa Mark 4x12_3", label: "Mark IV Lead + Rivera" },
      ] },
      { id: "v8-cab-mesa-rectifier-4x12", group: "Mesa", name: "B&F NAM Mesa Rectifier 4x12", display: "Me-Rectifier", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Me-Rectifier", disabled: false, captures: [
        { pos: "Mesa Rectifier 4x12", label: "Dual Rect Rev G EVH" }, { pos: "Mesa Rectifier 4x12_2", label: "DualRect ENGL V30" }, { pos: "Mesa Rectifier 4x12_3", label: "OS Rect KSM313" }, { pos: "Mesa Rectifier 4x12_4", label: "OS Rect SM57" }, { pos: "Mesa Rectifier 4x12_5", label: "OS Rect SM58" },
      ] },
      { id: "v8-cab-celestion-greenback", group: "Celestion", name: "B&F NAM Celestion Greenback", display: "Ce-Greenback", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ce-Greenback", disabled: false, captures: [
        { pos: "Celestion Greenback", label: "Greenback" }, { pos: "Celestion Greenback_2", label: "Greenback_2" },
      ] },
      { id: "v8-cab-celestion-v30", group: "Celestion", name: "B&F NAM Celestion V30", display: "Ce-V30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ce-V30", disabled: false, captures: [
        { pos: "Celestion V30", label: "V30" }, { pos: "Celestion V30_2", label: "V30_2" },
      ] },
      { id: "v8-cab-evh-5150-cab", group: "EVH", name: "B&F NAM EVH 5150 Cab", display: "Ev-5150", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ev-5150", disabled: false, captures: [
        { pos: "EVH 5150 Cab", label: "5150" }, { pos: "EVH 5150 Cab_2", label: "5150_2" },
      ] },
      { id: "v8-cab-bogner-2x12", group: "Bogner", name: "B&F NAM Bogner 2x12", display: "Bo-2x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Bo-2x12", disabled: false, captures: [
        { pos: "Bogner 2x12", label: "EVM12L C414 12in" }, { pos: "Bogner 2x12_2", label: "EVM12L Fredman1 Off" }, { pos: "Bogner 2x12_3", label: "EVM12L Fredman2 Off" }, { pos: "Bogner 2x12_4", label: "EVM12L i5 Cone Edge" }, { pos: "Bogner 2x12_5", label: "EVM12L i5 Cone" },
      ] },
      { id: "v8-cab-diezel-4x12", group: "Diezel", name: "B&F NAM Diezel 4x12", display: "Di-4x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Di-4x12", disabled: false, captures: [
        { pos: "Diezel 4x12", label: "Hagen CH3 HEIL 312L" }, { pos: "Diezel 4x12_2", label: "Hagen CH3 312L 65" }, { pos: "Diezel 4x12_3", label: "Hagen CH3 PR20UT" }, { pos: "Diezel 4x12_4", label: "Hagen CH3 PR20UT 65" }, { pos: "Diezel 4x12_5", label: "Herbert CH2 Fredman" },
      ] },
      { id: "v8-cab-diezel-vh4", group: "Diezel", name: "B&F NAM Diezel VH4", display: "Di-VH4", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Di-VH4", disabled: false, captures: [
        { pos: "Diezel VH4", label: "Wes BORLAND CH4 2x12" },
      ] },
      { id: "v8-cab-seymour-duncan-hagen", group: "Seymour Duncan", name: "B&F NAM Seymour Duncan Hagen", display: "Se-Hagen", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Se-Hagen", disabled: false, captures: [
        { pos: "Seymour Duncan Hagen", label: "805 CH4 B431" }, { pos: "Seymour Duncan Hagen_2", label: "805 CH4 B431 2" }, { pos: "Seymour Duncan Hagen_3", label: "805 CH4 B431 3" }, { pos: "Seymour Duncan Hagen_4", label: "805 CH4 B431 4" },
      ] },
      { id: "v8-cab-engl-savage", group: "ENGL", name: "B&F NAM ENGL Savage", display: "En-Savage", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "En-Savage", disabled: false, captures: [
        { pos: "ENGL Savage", label: "Mid cut + mesa 4x12" },
      ] },
      { id: "v8-cab-engl-thunder", group: "ENGL", name: "B&F NAM ENGL Thunder", display: "En-Thunder", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "En-Thunder", disabled: false, captures: [
        { pos: "ENGL Thunder", label: "METALMASTER 2x12 V30" }, { pos: "ENGL Thunder_2", label: "50 4x12 Lead Cond" }, { pos: "ENGL Thunder_3", label: "50 4x12 Higain Dyn" }, { pos: "ENGL Thunder_4", label: "50 4x12 Crunch Cond" },
      ] },
      { id: "v8-cab-friedman-4x12", group: "Friedman", name: "B&F NAM Friedman 4x12", display: "Fr-4x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Fr-4x12", disabled: false, captures: [
        { pos: "Friedman 4x12", label: "JJ100 JBE + V30" },
      ] },
      { id: "v8-cab-orange-2x12", group: "Orange", name: "B&F NAM Orange 2x12", display: "Or-2x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Or-2x12", disabled: false, captures: [
        { pos: "Orange 2x12", label: "V30 C414 B" }, { pos: "Orange 2x12_2", label: "V30 C414 C" }, { pos: "Orange 2x12_3", label: "V30 C414 E" }, { pos: "Orange 2x12_4", label: "V30 RM700 A" }, { pos: "Orange 2x12_5", label: "V30 e906 C" },
      ] },
      { id: "v8-cab-orange-ppc-4x12", group: "Orange", name: "B&F NAM Orange PPC 4x12", display: "Or-PPC", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Or-PPC", disabled: false, captures: [
        { pos: "Orange PPC 4x12", label: "PPC 4x12 V30" }, { pos: "Orange PPC 4x12_2", label: "4x12 DYN421-57-121 PR" }, { pos: "Orange PPC 4x12_3", label: "4x12 DYN421-57-121" }, { pos: "Orange PPC 4x12_4", label: "4x12 DYN57" }, { pos: "Orange PPC 4x12_5", label: "4x12 DYN7B" },
      ] },
      { id: "v8-cab-orange-rockerverb", group: "Orange", name: "B&F NAM Orange Rockerverb", display: "Or-Rockerverb", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Or-Rockerverb", disabled: false, captures: [
        { pos: "Orange Rockerverb", label: "+5150 Cab" },
      ] },
      { id: "v8-cab-carvin-4x12", group: "Carvin", name: "B&F NAM Carvin 4x12", display: "Ca-4x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ca-4x12", disabled: false, captures: [
        { pos: "Carvin 4x12", label: "All Mic Blend 3" }, { pos: "Carvin 4x12_2", label: "Mackie EM89D" }, { pos: "Carvin 4x12_3", label: "Sennheiser e835" }, { pos: "Carvin 4x12_4", label: "Sennheiser e835 2" },
      ] },
      { id: "v8-cab-framus-4x12", group: "Framus", name: "B&F NAM Framus 4x12", display: "Fra-4x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Fra-4x12", disabled: false, captures: [
        { pos: "Framus 4x12", label: "DB 4x12 G12M" }, { pos: "Framus 4x12_2", label: "V30 SM57" },
      ] },
      { id: "v8-cab-sunn-4x12", group: "Sunn", name: "B&F NAM Sunn 4x12", display: "Sun-4x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Sun-4x12", disabled: false, captures: [
        { pos: "Sunn 4x12", label: "G12T-75 Fredman1 Off" }, { pos: "Sunn 4x12_2", label: "G12T-75 Fredman1 On" }, { pos: "Sunn 4x12_3", label: "G12T-75 Fredman2 On" }, { pos: "Sunn 4x12_4", label: "G12T-75 Fredman3 On" }, { pos: "Sunn 4x12_5", label: "G12T-75 i5 Cap Edge" },
      ] },
      { id: "v8-cab-vintage-30-4x12", group: "Vintage 30", name: "B&F NAM Vintage 30 4x12", display: "Vi-V30", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Vi-V30", disabled: false, captures: [
        { pos: "Vintage 30 4x12", label: "big" }, { pos: "Vintage 30 4x12_2", label: "Default" },
      ] },
      { id: "v8-cab-randall-satan", group: "Randall", name: "B&F NAM Randall Satan", display: "Ra-Satan", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ra-Satan", disabled: false, captures: [
        { pos: "Randall Satan", label: "Satan 50 + Fortin 4x12" }, { pos: "Randall Satan_2", label: "randallsatanwcab" },
      ] },
      { id: "v8-cab-revv-4x12", group: "Revv", name: "B&F NAM Revv 4x12", display: "Re-4x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Re-4x12", disabled: false, captures: [
        { pos: "Revv 4x12", label: "v30" },
      ] },
      { id: "v8-cab-soldano-slo", group: "Soldano", name: "B&F NAM Soldano SLO", display: "So-SLO", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "So-SLO", disabled: false, captures: [
        { pos: "Soldano SLO", label: "Classic Tube Comp 1030" }, { pos: "Soldano SLO_2", label: "Fat Fingerstyle" }, { pos: "Soldano SLO_3", label: "Funk and Slap" }, { pos: "Soldano SLO_4", label: "Motown Sound" }, { pos: "Soldano SLO_5", label: "Pick Attack" },
      ] },
      { id: "v8-cab-suhr-2x12", group: "Suhr", name: "B&F NAM Suhr 2x12", display: "Su-2x12", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Su-2x12", disabled: false, captures: [
        { pos: "Suhr 2x12", label: "CB 77 121 i" }, { pos: "Suhr 2x12_2", label: "CB 77 121 r" },
      ] },
      { id: "v8-cab-yerasov-bulldozer", group: "Yerasov", name: "B&F NAM Yerasov Bulldozer", display: "Ye-Bulldozer", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ye-Bulldozer", disabled: false, captures: [
        { pos: "Yerasov Bulldozer", label: "50 6L6 MODERN EL" }, { pos: "Yerasov Bulldozer_2", label: "50 6L6 MODERN EL TS1" }, { pos: "Yerasov Bulldozer_3", label: "50 6L6 MODERN V30 PST" }, { pos: "Yerasov Bulldozer_4", label: "50 6L6 MODERN V30 TS1" }, { pos: "Yerasov Bulldozer_5", label: "50 6L6 VINTAGE EL TS1" },
      ] },
  ],
  bass: [
      { id: "v8-cab-ampeg-svt-8x10", group: "Ampeg", name: "B&F NAM Ampeg SVT 8x10", display: "Am-SVT 8x10", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Am-SVT 8x10", disabled: false, captures: [
        { pos: "Ampeg SVT 8x10", label: "SVT 8x10" },
      ] },
      { id: "v8-cab-ampeg-b15", group: "Ampeg", name: "B&F NAM Ampeg B15", display: "Am-B15", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Am-B15", disabled: false, captures: [
        { pos: "Ampeg B15", label: "B15N SM57+R121" },
      ] },
      { id: "v8-cab-ampeg-svt", group: "Ampeg", name: "B&F NAM Ampeg SVT", display: "Am-SVT", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Am-SVT", disabled: false, captures: [
        { pos: "Ampeg SVT", label: "B15N+SVT410HLF" },
      ] },
      { id: "v8-cab-ampeg-8x10", group: "Ampeg", name: "B&F NAM Ampeg 8x10", display: "Am-8x10", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Am-8x10", disabled: false, captures: [
        { pos: "Ampeg 8x10", label: "8x10 Cap" }, { pos: "Ampeg 8x10_2", label: "8x10 Cone" }, { pos: "Ampeg 8x10_3", label: "8x10 4033 A107" }, { pos: "Ampeg 8x10_4", label: "8x10 4033 AH" }, { pos: "Ampeg 8x10_5", label: "8x10 57 A107" },
      ] },
      { id: "v8-cab-mesa-subway-1x15", group: "Mesa", name: "B&F NAM Mesa Subway 1x15", display: "Me-Subway", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Me-Subway", disabled: false, captures: [
        { pos: "Mesa Subway 1x15", label: "Subway" }, { pos: "Mesa Subway 1x15_2", label: "Subway_2" },
      ] },
      { id: "v8-cab-darkglass-adam", group: "Darkglass", name: "B&F NAM Darkglass ADAM", display: "Da-ADAM", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Da-ADAM", disabled: false, captures: [
        { pos: "Darkglass ADAM", label: "ADAM" }, { pos: "Darkglass ADAM_2", label: "ADAM_2" },
      ] },
      { id: "v8-cab-darkglass-b7k", group: "Darkglass", name: "B&F NAM Darkglass B7K", display: "Da-B7K", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Da-B7K", disabled: false, captures: [
        { pos: "Darkglass B7K", label: "B7K Ultra Cab" }, { pos: "Darkglass B7K_2", label: "B7K Ultra No Cab" },
      ] },
      { id: "v8-cab-darkglass-cab", group: "Darkglass", name: "B&F NAM Darkglass Cab", display: "Da-Cab", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Da-Cab", disabled: false, captures: [
        { pos: "Darkglass Cab", label: "Default" }, { pos: "Darkglass Cab_2", label: "Crunch Vintage Deluxe" }, { pos: "Darkglass Cab_3", label: "Distortion ALPHA" }, { pos: "Darkglass Cab_4", label: "Drive B7K Ultra" }, { pos: "Darkglass Cab_5", label: "Fuzz OMEGA" },
      ] },
      { id: "v8-cab-darkglass-x7", group: "Darkglass", name: "B&F NAM Darkglass X7", display: "Da-X7", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Da-X7", disabled: false, captures: [
        { pos: "Darkglass X7", label: "X7 Cab" },
      ] },
      { id: "v8-cab-eden-410", group: "Eden", name: "B&F NAM Eden 410", display: "Ed-410", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ed-410", disabled: false, captures: [
        { pos: "Eden 410", label: "410" },
      ] },
      { id: "v8-cab-hartke-410", group: "Hartke", name: "B&F NAM Hartke 410", display: "Ha-410", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ha-410", disabled: false, captures: [
        { pos: "Hartke 410", label: "410" }, { pos: "Hartke 410_2", label: "410_2" },
      ] },
      { id: "v8-cab-hartke-vxl", group: "Hartke", name: "B&F NAM Hartke VXL", display: "Ha-VXL", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ha-VXL", disabled: false, captures: [
        { pos: "Hartke VXL", label: "VXL" },
      ] },
      { id: "v8-cab-hartke-hydrive", group: "Hartke", name: "B&F NAM Hartke Hydrive", display: "Ha-Hydrive", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ha-Hydrive", disabled: false, captures: [
        { pos: "Hartke Hydrive", label: "410 Beta52+KSM44" }, { pos: "Hartke Hydrive_2", label: "410 Beta52+SM57+KSM44" }, { pos: "Hartke Hydrive_3", label: "410 Beta52+SM57" }, { pos: "Hartke Hydrive_4", label: "410 Beta52" }, { pos: "Hartke Hydrive_5", label: "410 KSM44" },
      ] },
      { id: "v8-cab-origin-bassrig", group: "Origin", name: "B&F NAM Origin BASSRIG", display: "Ori-BASSRIG", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ori-BASSRIG", disabled: false, captures: [
        { pos: "Origin BASSRIG_2", label: "BASSRIG_2" },
      ] },
      { id: "v8-cab-sunn", group: "Sunn", name: "B&F NAM Sunn", display: "Sun-Model T", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Sun-Model T", disabled: false, captures: [
        { pos: "Sunn", label: "Model T" },
      ] },
      { id: "v8-cab-fender-rumble", group: "Fender", name: "B&F NAM Fender Rumble", display: "Fe-Rumble", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Fe-Rumble", disabled: false, captures: [
        { pos: "Fender Rumble", label: "Rumble 800 2x10 contour" },
      ] },
      { id: "v8-cab-laney-bass-100", group: "Laney", name: "B&F NAM Laney Bass 100", display: "La-Bass 100", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "La-Bass 100", disabled: false, captures: [
        { pos: "Laney Bass 100", label: "4x12 Goodmans Back" }, { pos: "Laney Bass 100_2", label: "4x12 Goodmans" },
      ] },
      { id: "v8-cab-markbass-151hr", group: "Markbass", name: "B&F NAM Markbass 151HR", display: "Mk-151HR", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Mk-151HR", disabled: false, captures: [
        { pos: "Markbass 151HR", label: "TA501 151HR Beta52" },
      ] },
      { id: "v8-cab-aguilar", group: "Aguilar", name: "B&F NAM Aguilar", display: "Ag-Cab", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Ag-Cab", disabled: false, captures: [
        { pos: "Aguilar", label: "DB751 cab" },
      ] },
      { id: "v8-cab-tech21-sansamp", group: "Tech21", name: "B&F NAM Tech21 SansAmp", display: "Te-SansAmp", knobs: [], color: "#3a2818", accentColor: "#c8a060", speakerLabel: "Te-SansAmp", disabled: false, captures: [
        { pos: "Tech21 SansAmp", label: "BASS SansAmp Cab RE20" },
      ] },
  ],
};
