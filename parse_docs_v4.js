// Robust parser v4 — uses table headers to detect PEQ sections
// Reads all 5 FULL documents and directly updates pedalData.ts
const fs = require('fs');

const F=[19.7,20.1,20.5,20.9,21.3,21.7,22.1,22.5,23.0,23.4,23.9,24.3,24.8,25.3,25.8,26.3,26.8,27.3,27.8,28.4,28.9,29.5,30.1,30.7,31.3,31.9,32.5,33.1,33.8,34.4,35.1,35.8,36.5,37.2,37.9,38.6,39.4,40.1,40.9,41.7,42.5,43.4,44.2,45.1,45.9,46.8,47.7,48.7,49.6,50.6,51.6,52.6,53.6,54.6,55.7,56.8,57.9,59.0,60.1,61.3,62.5,63.7,65.0,66.2,67.5,68.8,70.2,71.5,72.9,74.3,75.8,77.2,78.7,80.3,81.8,83.4,85.0,86.7,88.4,90.1,91.9,94.0,95.0,97.0,99.0,101,103,105,107,109,111,114,116,118,120,123,125,127,130,132,135,138,140,143,146,149,152,154,157,161,164,167,170,173,177,180,184,187,191,195,198,202,206,210,214,218,223,227,231,236,241,245,250,255,260,265,270,275,281,286,292,297,303,309,315,321,327,334,340,347,354,360,367,375,382,389,397,405,412,420,429,437,445,454,463,472,481,490,500,510,520,530,540,551,561,572,583,595,606,618,630,642,655,667,680,694,707,721,735,749,764,779,794,809,825,841,857,874,891,908,926,944,962,981,1000,1020,1040,1060,1080,1100,1120,1140,1170,1190,1210,1240,1260,1280,1310,1330,1360,1390,1410,1440,1470,1500,1530,1560,1590,1620,1650,1680,1710,1750,1780,1820,1850,1890,1920,1960,2000,2040,2080,2120,2160,2200,2240,2290,2330,2380,2420,2470,2520,2570,2620,2670,2720,2770,2830,2880,2940,3000,3050,3110,3170,3240,3300,3360,3430,3500,3560,3630,3700,3780,3850,3920,4000,4080,4160,4240,4320,4400,4490,4580,4670,4760,4850,4940,5040,5140,5240,5340,5440,5550,5660,5770,5880,5990,6110,6230,6350,6470,6600,6730,6860,6990,7130,7270,7410,7550,7700,7850,8000,8160,8310,8480,8640,8810,8980,9150,9330,9510,9700,9890,10100,10300,10500,10700,10900,11100,11300,11500,11800,12000,12200,12500,12700,12900,13200,13500,13700,14000,14300,14500,14800,15100,15400,15700,16000,16300,16600,17000,17300,17600,18000,18300,18700,19000,19400,19800,20200,20600];
const Q=[0.40,0.42,0.45,0.47,0.50,0.53,0.56,0.59,0.63,0.67,0.71,0.75,0.79,0.84,0.89,0.94,1.00,1.06,1.12,1.19,1.26,1.3,1.4,1.5,1.6,1.7,1.8,1.9,2.0,2.1,2.2,2.4,2.5,2.7,2.8,3.0,3.2,3.4,3.6,3.8,4.0,4.2,4.5,4.8,5.0,5.3,5.7,6.0,6.3,6.7,7.1,7.6,8.0,8.5,9.0,9.5,10.1,10.7,11.3,12.0,12.7,13.5,14,15,16,17,18,19,20,21,23,24,25,27,29,30,32,34,36,38,40,43,45,48,51,54,57,60,64,68,72,76,81,85,91,96,102,108,114,121,128];
const S=[0.40,0.42,0.45,0.47,0.50,0.53,0.56,0.59,0.63,0.67,0.71,0.75,0.79,0.84,0.89,0.94,1.00,1.06,1.12,1.19,1.26,1.3,1.4,1.5,1.6];
function ff(h){let b=0,d=1e9;for(let i=0;i<F.length;i++){if(Math.abs(F[i]-h)<d){d=Math.abs(F[i]-h);b=i;}}return b}
function fq(q){let b=0;for(let i=0;i<Q.length;i++){if(Math.abs(Q[i]-q)<Math.abs(Q[b]-q))b=i;}return b}
function fS(s){let b=0;for(let i=0;i<S.length;i++){if(Math.abs(S[i]-s)<Math.abs(S[b]-s))b=i;}return b}
const T={Peak:0,LSF:1,HSF:2,HPF:4,LPF:5,LS:1,HS:2};
function enc(t,f,db,qv,sv){return(((fS(sv>0?sv:0)&0x1F)<<27)|((fq(qv>0?qv:0)&0x7F)<<20)|((Math.round((db+24)/0.2)&0xFF)<<12)|((ff(f)&0x1FF)<<3)|((T[t]||0)&0x7))>>>0}
function pad8(v){return'0x'+v.toString(16).padStart(8,'0').toUpperCase();}
function clean(v){if(!v)return'';v=v.trim().replace(/\*\*/g,'').replace(/−/g,'-').replace(/[−−]/g,'-');return v.replace(/\([^)]*\)/g,'').trim();}
function parseCells(line){if(!line.startsWith('|'))return null;return line.split('|').slice(1,-1).map(c=>clean(c));}

// Detect PEQ table: header row has "地址" or "PEQ#" AND "Type" AND "Freq" AND "Gain"
function isPEQHeader(cells) {
  const line = cells.join(' ').toLowerCase();
  return (line.includes('type') && line.includes('freq') && line.includes('gain')) ||
         (line.includes('地址') && line.includes('名称') && line.includes('type'));
}
function isNonPEQ(cells) {
  // Skip rows that are not PEQ bands
  const c0 = cells[0] || '';
  const c2 = cells[2] || '';
  if (c0.includes('地址') || c0.includes('PEQ#') || c0.includes('---')) return true;
  if (c0.includes('旋钮') || c0.includes('面板')) return true;
  if (c2 === '—' || c2 === '' || c2 === '-') return true;
  return false;
}

function extractPEQ(lines, startIdx) {
  const bands = [];
  let i = startIdx;
  // Skip to table header
  while (i < lines.length) {
    const row = parseCells(lines[i]);
    if (row && isPEQHeader(row)) { i++; break; }
    i++;
  }
  // Parse data rows
  while (i < lines.length) {
    const row = parseCells(lines[i]);
    if (!row) { i++; continue; }
    if (isNonPEQ(row)) { i++; continue; }

    // Detect column layout
    // Layout 1: | reg | name | Type | Freq | Gain | Q | S |
    // Layout 2: | PEQ# | Type | Freq | Gain | Q | S |
    const c0 = clean(row[0]); // addr or PEQ#
    const c1 = clean(row[1]); // name or Type
    const c2 = clean(row[2]); // Type or Freq

    let addr, type, freqCol, gainCol, qCol, sCol;

    // Check if column 1 is "Type" (layout 2: PEQ# | Type | Freq | Gain)
    if (['HPF','LPF','Peak','LSF','HSF','LS','HS'].includes(c1)) {
      // Layout 2: | PEQ# | Type | Freq | Gain | Q | S |
      const peqNum = parseInt(c0);
      if (isNaN(peqNum)) { i++; continue; }
      addr = 108 + peqNum - 1; // Cab: PEQ# → register
      type = c1;
      freqCol = 2; gainCol = 3; qCol = 4; sCol = 5;
    } else if (['HPF','LPF','Peak','LSF','HSF','LS','HS'].includes(c2)) {
      // Layout 1: | reg | name | Type | Freq | Gain | Q | S |
      addr = parseInt(c0);
      if (isNaN(addr)) { i++; continue; }
      type = c2;
      freqCol = 3; gainCol = 4; qCol = 5; sCol = 6;
    } else {
      // Unknown layout, skip
      i++; continue;
    }

    const freq = parseFloat(clean(row[freqCol]));
    const gain = parseFloat(clean(row[gainCol]));
    const q = row[qCol] ? parseFloat(clean(row[qCol])) : 0;
    const s = row[sCol] ? parseFloat(clean(row[sCol])) : 0;

    if (isNaN(freq) || isNaN(gain)) { i++; continue; }

    bands.push({ reg: addr, type, freq, gain, q: isNaN(q)?0:q, s: isNaN(s)?0:s });
    i++;
  }
  return bands;
}

// Extract DC offset by scanning rows near the model
function extractDC(lines, startIdx, dcReg, nameContains) {
  for (let i = startIdx; i < Math.min(startIdx + 50, lines.length); i++) {
    const row = parseCells(lines[i]);
    if (!row) continue;
    const c0 = clean(row[0]);
    if (parseInt(c0) === dcReg) {
      // Extract DC value: look for number pattern like "52(+0.02)" or "50(0.00)"
      const vals = row.map(clean).join(' ');
      const m = vals.match(/(\d+)\s*\(/);
      if (m) return parseInt(m[1]);
      // Try just the number from first value cell after name
      const c2 = clean(row[2] || '');
      const n = parseInt(c2);
      if (!isNaN(n) && n >= 0 && n <= 100) return n;
    }
  }
  return 50;
}

// ID mapping
const IDMAP = {
  'OD01':'ts808','OD02':'ts9','OD03':'sd1','OD04':'bd2','OD05':'od3',
  'OD06':'ocd','OD07':'klon','OD08':'timmy','OD09':'jhs-mg','OD10':'nobels-odr1',
  'OD11':'eqd-plumes','OD12':'maxon-od808','OD13':'tumnus','OD14':'archer',
  'OD15':'bb-preamp','OD16':'green-rhino','OD17':'mxr-zw','OD18':'kot',
  'OD19':'eqd-westwood','OD20':'greer-ls',
  'OD21':'darkglass-vmt','OD22':'darkglass-b3k','OD23':'sansamp-bass',
  'OD24':'ehx-bass-soul','OD25':'mxr-m89','OD26':'aguilar-agro',
  'OD27':'pork-loin','OD28':'solidgold-beta','OD29':'jhs-lowdrive','OD30':'ampeg-scrambler',
  'DS01':'ds1','DS02':'proco-rat','DS03':'mxr-dist-plus','DS04':'mt2',
  'DS05':'big-muff','DS06':'shredmaster','DS07':'suhr-riot','DS08':'wampler-pinnacle',
  'DS09':'mi-crunch','DS10':'hm2','DS11':'mxr-fullbore','DS12':'amptweaker-tm',
  'DS13':'jhs-angry','DS14':'friedman-beod','DS15':'revv-g3','DS16':'diezel-vh4',
  'DS17':'mesa-throttle','DS18':'bogner-ecstasy','DS19':'wampler-dracarys','DS20':'empress-heavy',
  'DS21':'soldano-slo','DS22':'evh-5150','DS23':'triple-wreck','DS24':'keeley-filaments',
  'DS25':'fuzz-face-ge','DS26':'tone-bender','DS27':'eqd-hoof','DS28':'fuzz-factory',
  'DS29':'elements','DS30':'stone-deaf-pdf2',
  'DS31':'darkglass-ao','DS32':'darkglass-x','DS33':'mxr-bass-fuzz','DS34':'ehx-bass-bigmuff',
  'DS35':'tech21-xxl','DS36':'aguilar-fuzzistor','DS37':'aftershock','DS38':'swollen-pickle',
  'DS39':'idiotbox-blower','DS40':'woolly-mammoth',
  'A01':'fender-twin','A02':'fender-deluxe','A03':'fender-princeton','A04':'fender-champ',
  'A05':'roland-jc120','A06':'vox-ac30','A07':'vox-ac15','A08':'hiwatt-dr103',
  'A09':'matchless-dc30','A10':'drz-maz18','A11':'fender-bassman','A12':'marshall-jtm45',
  'A13':'marshall-plexi','A14':'marshall-jcm800','A15':'marshall-jcm900',
  'A16':'marshall-jubilee','A17':'marshall-bb','A18':'orange-or120','A19':'orange-rockerverb',
  'A20':'supro-thunder','A21':'dumble-ods','A22':'two-rock','A23':'morgan-ac20',
  'A24':'carr-rambler','A25':'tone-king','A26':'trainwreck','A27':'div13-jrt',
  'A28':'badcat-hotcat','A29':'bogner-ecstasy-amp','A30':'cornford-mk50',
  'A31':'mesa-rectifier','A32':'mesa-mark4','A33':'mesa-mark-iic',
  'A34':'peavey-5150','A35':'peavey-6505','A36':'soldano-slo-amp',
  'A37':'diezel-vh4-amp','A38':'bogner-uber-amp','A39':'engl-powerball','A40':'friedman-be100',
  'B01':'ampeg-svt','B02':'ampeg-b15','B03':'ampeg-v4b','B04':'fender-bassman-amp','B05':'mesa-bass400'
};

function processDoc(docPath, modelPattern, isAmpOrCab) {
  const doc = fs.readFileSync(docPath, 'utf8');
  const lines = doc.split('\n');
  const models = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(modelPattern);
    if (!m) continue;
    const docId = m[1];
    const pid = IDMAP[docId] || docId.toLowerCase();

    // For OD/DS: extract PEQ from the "完整寄存器参数表" near this model
    // For Amp: same
    // For Cab: PEQ from "完整35段PEQ参数表"
    const bands = extractPEQ(lines, i + 1);

    if (bands.length === 0) { console.log('  WARNING: No PEQ found for', docId); continue; }

    // Separate pre and post bands by register number
    let preBands = [], postBands = [];
    for (const b of bands) {
      if (b.reg >= 44 && b.reg <= 47) preBands.push(b);
      else if (b.reg >= 53 && b.reg <= 56) postBands.push(b);
      else if (b.reg >= 59 && b.reg <= 62) preBands.push(b);
      else if (b.reg >= 68 && b.reg <= 71) postBands.push(b);
      else if (b.reg >= 74 && b.reg <= 77) preBands.push(b);
      else if (b.reg >= 83 && b.reg <= 98) postBands.push(b);
    }

    // For cab: all bands start at 108
    if (bands.length >= 30 && bands[0].reg >= 108) {
      models.push({ pid, bands, isCab: true });
    } else {
      const dcReg = bands.some(b => b.reg >= 59) ? 65 : (bands.some(b => b.reg >= 74) ? 80 : 50);
      const dc = extractDC(lines, i + 1, dcReg);
      models.push({ pid, pre: preBands, post: postBands, dc, dcReg, bands });
    }
  }
  return models;
}

// ═══ PARSE ALL DOCS ═══
console.log('=== Parsing documents ===');

// OD
const odModels = processDoc('过载v3.0_FULL.md', /^## (OD\d+) —/, false);
console.log('OD:', odModels.length, 'models');

// DS
const dsModels = processDoc('失真v3.0_FULL.md', /^## (DS\d+) —/, false);
console.log('DS:', dsModels.length, 'models');

// Amp
const ampModels = processDoc('箱头v8.0_FULL.md', /^## ([AB]\d+) —/, false);
console.log('Amp:', ampModels.length, 'models');

// Cab v9.0 (Close Mic)
const cab90 = processDoc('箱体v9.0_FULL.md', /^## (CB\d+) —/, true);
console.log('Cab v9.0:', cab90.length, 'models');

// Cab v9.1 (Far Mic)
const cab91 = processDoc('箱体v9.1_FULL.md', /^## (CB\d+) —/, true);
console.log('Cab v9.1:', cab91.length, 'models');

// Build lookup for cabs
const cab90Map = {}; cab90.forEach(c => cab90Map[c.pid] = c);
const cab91Map = {}; cab91.forEach(c => cab91Map[c.pid] = c);

// Print sample diagnostics
console.log('\n=== Sample verification ===');
const sampleOD = odModels.find(m => m.pid === 'ts808');
if (sampleOD) console.log('OD01 TS-808: pre=' + sampleOD.pre.length + ' bands, post=' + sampleOD.post.length + ' bands, dc=' + sampleOD.dc);
const sampleDS = dsModels.find(m => m.pid === 'ds1');
if (sampleDS) console.log('DS01 DS-1: pre=' + sampleDS.pre.length + ' bands, post=' + sampleDS.post.length + ' bands, dc=' + sampleDS.dc);
const sampleAmp = ampModels.find(m => m.pid === 'fender-twin');
if (sampleAmp) console.log('A01 Twin: pre=' + sampleAmp.pre.length + ' bands, post=' + sampleAmp.post.length + ' bands, dc=' + sampleAmp.dc);
const sampleCab = cab90.find(c => c.pid === 'cb01');
if (sampleCab) console.log('CB01 v9.0: ' + sampleCab.bands.length + ' bands');

// Show first band of each
if (sampleDS && sampleDS.pre[0]) console.log('DS01 Pre[0]: R' + sampleDS.pre[0].reg + ' ' + sampleDS.pre[0].type + '@' + sampleDS.pre[0].freq + 'Hz ' + sampleDS.pre[0].gain + 'dB');
if (sampleAmp && sampleAmp.pre[0]) console.log('A01 Pre[0]: R' + sampleAmp.pre[0].reg + ' ' + sampleAmp.pre[0].type + '@' + sampleAmp.pre[0].freq + 'Hz ' + sampleAmp.pre[0].gain + 'dB Q=' + sampleAmp.pre[0].q);
if (sampleCab && sampleCab.bands[0]) console.log('CB01[0]: R' + sampleCab.bands[0].reg + ' ' + sampleCab.bands[0].type + '@' + sampleCab.bands[0].freq + 'Hz ' + sampleCab.bands[0].gain + 'dB');
