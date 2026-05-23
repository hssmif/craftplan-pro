#!/usr/bin/env node
import sharp from "sharp";
import fs from "fs";

// ── Minimal DMC Colors (top 90 most used) ──
const DMC_COLORS = [
  ["310","Black","#000000"],["White","White","#FFFFFF"],["Ecru","Ecru","#F0E6D0"],
  ["150","Dusty Rose Vy Dk","#AB3472"],["151","Dusty Rose Vy Lt","#F0CED4"],
  ["154","Grape Vy Dk","#572643"],["155","Blue Violet Med Dk","#9891B6"],
  ["208","Lavender Vy Dk","#835E9F"],["209","Lavender Dk","#A47FC3"],
  ["210","Lavender Med","#C3A5D9"],["211","Lavender Lt","#E3CFF0"],
  ["221","Shell Pink Vy Dk","#883533"],["223","Shell Pink Lt","#CC8E8A"],
  ["225","Shell Pink Vy Lt","#FDD6D4"],["300","Mahogany Vy Dk","#6F3210"],
  ["301","Mahogany Med","#B85D28"],["304","Christmas Red Med","#B71628"],
  ["307","Lemon","#FDED54"],["309","Rose Dk","#B83855"],
  ["311","Navy Blue Med","#1C4361"],["312","Navy Blue Lt","#2E587E"],
  ["315","Antique Mauve Med Dk","#814953"],["316","Antique Mauve Med","#B87E8A"],
  ["317","Pewter Gray","#6C6C6C"],["318","Steel Gray Lt","#A3A3A3"],
  ["319","Pistachio Green Vy Dk","#205526"],["320","Pistachio Green Med","#6B9B6B"],
  ["321","Christmas Red","#C73032"],["322","Navy Blue Vy Lt","#5A8DB1"],
  ["326","Rose Vy Dk","#B33B4B"],["327","Violet Dk","#633469"],
  ["333","Blue Violet Vy Dk","#5C5478"],["334","Baby Blue Med","#739BC1"],
  ["335","Rose","#EE546D"],["336","Navy Blue","#1B3A52"],
  ["340","Blue Violet Med","#ADA4D0"],["341","Blue Violet Lt","#C7C0E0"],
  ["347","Salmon Vy Dk","#BD1730"],["349","Coral Dk","#DC3638"],
  ["350","Coral Med","#E04747"],["351","Coral","#E96A6A"],
  ["352","Coral Lt","#FD9075"],["353","Peach","#FEA896"],
  ["355","Terra Cotta Dk","#984632"],["356","Terra Cotta Med","#C67862"],
  ["367","Pistachio Green Dk","#617B4B"],["368","Pistachio Green Lt","#A6C59A"],
  ["369","Pistachio Green Vy Lt","#D2EAC8"],["370","Mustard Med","#B89C66"],
  ["371","Mustard","#BDA46C"],["372","Mustard Lt","#CDB87A"],
  ["400","Mahogany Dk","#8F3F0A"],["402","Mahogany Vy Lt","#F7A563"],
  ["407","Desert Sand Med","#BE7B64"],["413","Pewter Gray Dk","#454545"],
  ["414","Steel Gray Dk","#8C8C8C"],["415","Pearl Gray","#C5C5C5"],
  ["420","Hazelnut Brown Dk","#9E7040"],["422","Hazelnut Brown Lt","#C69E5E"],
  ["433","Brown Med","#7A4E2D"],["434","Brown Lt","#9B6737"],
  ["435","Brown Vy Lt","#BA8B56"],["436","Tan","#CCA266"],
  ["437","Tan Lt","#E0C08E"],["444","Lemon Dk","#FFD600"],
  ["445","Lemon Lt","#FFFF7C"],["469","Avocado Green","#728B3A"],
  ["470","Avocado Green Lt","#94B84C"],["471","Avocado Green Vy Lt","#AEC964"],
  ["472","Avocado Green Ult Lt","#D8E880"],["498","Christmas Red Dk","#A41726"],
  ["500","Blue Green Vy Dk","#044E33"],["501","Blue Green Dk","#3B7252"],
  ["502","Blue Green","#5B916C"],["503","Blue Green Med","#7BB08C"],
  ["504","Blue Green Vy Lt","#99C9AA"],["517","Wedgwood Dk","#3B7A9C"],
  ["518","Wedgwood Lt","#4D99B8"],["519","Sky Blue","#7EBDD5"],
  ["520","Fern Green Dk","#666B47"],["522","Fern Green","#939E76"],
  ["523","Fern Green Lt","#AAB48A"],["524","Fern Green Vy Lt","#C4CBB0"],
  ["535","Ash Gray Vy Lt","#636363"],["543","Beige Brown Ult Vy Lt","#F2DBC8"],
  ["550","Violet Vy Dk","#5B1A56"],["552","Violet Med","#8036A0"],
  ["553","Violet","#A861C2"],["554","Violet Lt","#D8ADE3"],
  ["561","Jade Vy Dk","#2C6E4F"],["562","Jade Med","#539E70"],
  ["563","Jade Lt","#8FC6A0"],["564","Jade Vy Lt","#A6D6B4"],
  ["580","Moss Green Dk","#888820"],["581","Moss Green","#A7A730"],
  ["597","Turquoise","#5BB1B4"],["598","Turquoise Lt","#90D0D0"],
  ["600","Cranberry Vy Dk","#CD2C6C"],["601","Cranberry Dk","#D43878"],
  ["602","Cranberry Med","#E2608E"],["603","Cranberry","#FF7DA0"],
  ["604","Cranberry Lt","#FF9EB4"],["605","Cranberry Vy Lt","#FFBCC8"],
  ["606","Bright Orange-Red","#FA2B05"],["608","Bright Orange","#FD6C20"],
  ["610","Drab Brown Dk","#796340"],["611","Drab Brown","#967A4C"],
  ["612","Drab Brown Lt","#BCA46C"],["613","Drab Brown Vy Lt","#DCC494"],
  ["632","Desert Sand Ult Vy Dk","#8B5E4B"],["640","Beige Gray Vy Dk","#7C756D"],
  ["642","Beige Gray Dk","#A8A094"],["644","Beige Gray Med","#D0C8BC"],
  ["666","Christmas Red Br","#E31D42"],["676","Old Gold Lt","#E4C772"],
  ["677","Old Gold Vy Lt","#F0DCA0"],["680","Dark Old Gold","#BC8E2C"],
  ["699","Christmas Green","#056E00"],["700","Christmas Green Br","#087D03"],
  ["701","Christmas Green Lt","#3F9B35"],["702","Kelly Green","#47AA42"],
  ["703","Chartreuse","#66BB4E"],["704","Chartreuse Br Lt","#8CCB60"],
  ["712","Cream","#FFFCE8"],["718","Plum","#C64884"],
  ["720","Orange Spice Dk","#E05A14"],["721","Orange Spice Med","#F27A30"],
  ["722","Orange Spice Lt","#F79D5C"],["725","Topaz","#FFC840"],
  ["726","Topaz Lt","#FCD85E"],["727","Topaz Vy Lt","#FFF1A8"],
  ["729","Old Gold Med","#D2AA36"],["733","Olive Green Med","#BCA838"],
  ["734","Olive Green Lt","#CCC068"],["738","Tan Vy Lt","#ECCC98"],
  ["739","Tan Ult Vy Lt","#F4DEB0"],["740","Tangerine","#FF8313"],
  ["741","Tangerine Med","#FF9224"],["742","Tangerine Lt","#FFBF5A"],
  ["743","Yellow Med","#FED340"],["744","Yellow Pale","#FFE17A"],
  ["745","Yellow Lt Pale","#FFF1A0"],["746","Off White","#FFFDE8"],
  ["754","Peach Lt","#F7C4AC"],["758","Terra Cotta Vy Lt","#EEB69C"],
  ["760","Salmon","#F5908C"],["761","Salmon Lt","#FBB4B0"],
  ["762","Pearl Gray Vy Lt","#E0E0E0"],["772","Yellow Green Vy Lt","#D8EC88"],
  ["775","Baby Blue Vy Lt","#D1E5F0"],["776","Pink Med","#FCAEB2"],
  ["783","Topaz Med","#CE9630"],["793","Cornflower Blue Med","#7093BA"],
  ["797","Royal Blue","#1D5FAC"],["798","Delft Blue Dk","#4674AC"],
  ["799","Delft Blue Med","#748EC6"],["800","Delft Blue Pale","#C0D4E8"],
  ["801","Coffee Brown Dk","#5B3620"],["813","Blue Lt","#A1C1DA"],
  ["814","Garnet Dk","#7B0028"],["816","Garnet","#970033"],
  ["817","Coral Red Vy Dk","#B81C3C"],["818","Baby Pink","#FFDCE0"],
  ["819","Baby Pink Lt","#FFE8EB"],["822","Beige Gray Lt","#E8DED0"],
  ["824","Blue Vy Dk","#215586"],["825","Blue Dk","#2D6895"],
  ["826","Blue Med","#3B86AD"],["827","Blue Vy Lt","#BDDCE5"],
  ["838","Beige Brown Vy Dk","#5C3D24"],["839","Beige Brown Dk","#7A5938"],
  ["840","Beige Brown Med","#9C7C5E"],["841","Beige Brown Lt","#BC9E82"],
  ["842","Beige Brown Vy Lt","#D6BE9E"],["844","Beaver Gray Ult Dk","#545454"],
  ["869","Hazelnut Brown Vy Dk","#836028"],["890","Pistachio Green Ult Dk","#184020"],
  ["895","Hunter Green Vy Dk","#1B5C28"],["898","Coffee Brown Vy Dk","#4B2C18"],
  ["899","Rose Med","#F05A7A"],["900","Burnt Orange Dk","#D65008"],
  ["904","Parrot Green Vy Dk","#557B20"],["905","Parrot Green Dk","#6B8E2B"],
  ["906","Parrot Green Med","#7FA030"],["907","Parrot Green Lt","#98B838"],
  ["909","Emerald Green Vy Dk","#158040"],["910","Emerald Green Dk","#1A9848"],
  ["911","Emerald Green Med","#30A858"],["912","Emerald Green Lt","#49B86A"],
  ["913","Nile Green Med","#6EC888"],["918","Red Copper Dk","#823016"],
  ["920","Copper Med","#AC5A28"],["921","Copper","#C07036"],
  ["922","Copper Lt","#D08648"],["924","Gray Green Vy Dk","#394F48"],
  ["926","Gray Green Med","#6D8A80"],["927","Gray Green Lt","#97AEA4"],
  ["928","Gray Green Vy Lt","#C0D0C8"],["930","Antique Blue Dk","#455C72"],
  ["934","Black Avocado Green","#303C20"],["935","Avocado Green Dk","#3E4E2A"],
  ["936","Avocado Green Vy Dk","#475830"],["937","Avocado Green Med","#617A3A"],
  ["938","Coffee Brown Ult Dk","#3C2414"],["945","Tawny","#FBD0A8"],
  ["948","Peach Vy Lt","#FEE0CC"],["950","Desert Sand Lt","#EDB8A2"],
  ["951","Tawny Lt","#FFE0C0"],["954","Nile Green","#88D8A0"],
  ["955","Nile Green Lt","#A0E0B0"],["961","Dusty Rose Dk","#CF6876"],
  ["962","Dusty Rose Med","#E88490"],["963","Dusty Rose Ult Vy Lt","#FFD8DC"],
  ["966","Baby Green Med","#B0E0B8"],["970","Pumpkin Lt","#F78A10"],
  ["975","Golden Brown Dk","#9A5E1C"],["976","Golden Brown Med","#C08030"],
  ["977","Golden Brown Lt","#DC9A38"],["986","Forest Green Vy Dk","#406840"],
  ["987","Forest Green Dk","#588858"],["988","Forest Green Med","#73A473"],
  ["989","Forest Green","#8FBE8F"],["3011","Khaki Green Dk","#897850"],
  ["3012","Khaki Green Med","#A8985C"],["3013","Khaki Green Lt","#B8AE78"],
  ["3021","Brown Gray Vy Dk","#4E3A30"],["3022","Brown Gray Med","#8A8074"],
  ["3023","Brown Gray Lt","#A89E90"],["3024","Brown Gray Vy Lt","#C0B8AC"],
  ["3031","Mocha Brown Vy Dk","#4E3418"],["3033","Mocha Brown Vy Lt","#E4D0B4"],
  ["3045","Yellow Beige Dk","#BC946A"],["3046","Yellow Beige Med","#D8B888"],
  ["3047","Yellow Beige Lt","#E8D8AC"],["3051","Green Gray Dk","#5E6838"],
  ["3052","Green Gray Med","#80884C"],["3053","Green Gray","#9CA870"],
  ["3064","Desert Sand","#C48A70"],["3072","Beaver Gray Vy Lt","#D8D8D8"],
  ["3325","Baby Blue Lt","#B0D0E8"],["3326","Rose Lt","#FCA0A8"],
  ["3328","Salmon Dk","#E36B6B"],["3340","Apricot Med","#FF8060"],
  ["3341","Apricot","#FCA08A"],["3345","Hunter Green Dk","#1B5028"],
  ["3346","Hunter Green","#406C3C"],["3347","Yellow Green Med","#71883E"],
  ["3348","Yellow Green Lt","#CCE08C"],["3362","Pine Green Dk","#506030"],
  ["3363","Pine Green Med","#728648"],["3364","Pine Green","#83985C"],
  ["3371","Black Brown","#1C1008"],["3685","Mauve Vy Dk","#882042"],
  ["3687","Mauve","#C86078"],["3688","Mauve Med","#E8889C"],
  ["3689","Mauve Lt","#FBB0C0"],["3712","Salmon Med","#F08888"],
  ["3713","Salmon Vy Lt","#FFE0D8"],["3716","Dusty Rose Med Lt","#FFBCC0"],
  ["3721","Shell Pink Dk","#A04040"],["3722","Shell Pink Med","#BC6060"],
  ["3726","Antique Mauve Dk","#9C5465"],["3727","Antique Mauve Lt","#D8A0B0"],
  ["3731","Dusty Rose Vy Dk","#DA6882"],["3733","Dusty Rose","#E89098"],
  ["3743","Antique Violet Vy Lt","#D8C8DC"],["3747","Blue Violet Vy Lt","#D0CCE8"],
  ["3752","Antique Blue Vy Lt","#A8BCC8"],["3753","Antique Blue Ult Vy Lt","#D0DCE8"],
  ["3755","Baby Blue","#92B4D8"],["3768","Gray Green Dk","#657878"],
  ["3770","Tawny Vy Lt","#FFF0D8"],["3771","Terra Cotta Ult Vy Lt","#F4BCA0"],
  ["3774","Desert Sand Vy Lt","#F0D0B8"],["3776","Mahogany Lt","#C87840"],
  ["3778","Terra Cotta Lt","#D89880"],["3779","Rosewood Ult Vy Lt","#F8C8B4"],
  ["3782","Mocha Brown Lt","#C8A880"],["3787","Brown Gray Dk","#6A5C4E"],
  ["3790","Beige Gray Ult Dk","#655850"],["3799","Pewter Gray Vy Dk","#3C3C3C"],
  ["3820","Straw Dk","#DFB040"],["3821","Straw","#F0C850"],
  ["3822","Straw Lt","#F8E070"],["3823","Yellow Ult Pale","#FFFCD8"],
  ["3824","Apricot Lt","#FEACA8"],["3827","Golden Brown Pale","#F8C468"],
  ["3828","Hazelnut Brown","#B89060"],["3829","Old Gold Vy Dk","#AA7818"],
  ["3853","Autumn Gold Dk","#F49048"],["3854","Autumn Gold Med","#F8B070"],
  ["3855","Autumn Gold Lt","#F8D098"],["3862","Mocha Beige Dk","#8A7058"],
  ["3863","Mocha Beige Med","#A89070"],["3864","Mocha Beige Lt","#C8B098"],
  ["3865","Winter White","#FFFCF8"],["3866","Mocha Brn Ult Vy Lt","#FAF0E0"],
];

const PATTERN_SYMBOLS = [
  "X","O","+","#","*","V","Z","S","N","T","A","B","C","D","E","F","G","H","I","J",
  "K","L","M","P","Q","R","U","W","Y","@","1","2","3","4","5","6","7","8","9","a",
  "b","c","d","e","f","g","h","k","m","n",
];

function findNearestDMC(r, g, b) {
  let best = { dmc: "310", name: "Black", hex: "#000000", distance: Infinity };
  for (const [dmc, name, hex] of DMC_COLORS) {
    const dr = parseInt(hex.slice(1, 3), 16);
    const dg = parseInt(hex.slice(3, 5), 16);
    const db = parseInt(hex.slice(5, 7), 16);
    const dist = Math.sqrt(2 * (r - dr) ** 2 + 4 * (g - dg) ** 2 + 3 * (b - db) ** 2);
    if (dist < best.distance) best = { dmc, name, hex, distance: dist };
  }
  return best;
}

function medianCut(pixels, targetColors) {
  if (pixels.length === 0) return [];
  if (targetColors <= 1) {
    let r=0,g=0,b=0;
    for (const p of pixels) { r+=p[0]; g+=p[1]; b+=p[2]; }
    const n = pixels.length;
    return [[Math.round(r/n), Math.round(g/n), Math.round(b/n)]];
  }
  function makeBucket(pxs) {
    let rMin=255,rMax=0,gMin=255,gMax=0,bMin=255,bMax=0;
    for (const p of pxs) {
      if(p[0]<rMin)rMin=p[0]; if(p[0]>rMax)rMax=p[0];
      if(p[1]<gMin)gMin=p[1]; if(p[1]>gMax)gMax=p[1];
      if(p[2]<bMin)bMin=p[2]; if(p[2]>bMax)bMax=p[2];
    }
    return { pixels: pxs, rRange: rMax-rMin, gRange: gMax-gMin, bRange: bMax-bMin };
  }
  const buckets = [makeBucket(pixels)];
  while (buckets.length < targetColors) {
    let bestIdx=-1, bestScore=-1;
    for (let i=0;i<buckets.length;i++) {
      const b=buckets[i];
      if(b.pixels.length<2) continue;
      const score=Math.max(b.rRange*2,b.gRange*4,b.bRange*3);
      if(score>bestScore){bestScore=score;bestIdx=i;}
    }
    if(bestIdx<0) break;
    const bucket=buckets[bestIdx];
    const wR=bucket.rRange*2, wG=bucket.gRange*4, wB=bucket.bRange*3;
    const sortCh = wG>=wR&&wG>=wB ? 1 : wR>=wB ? 0 : 2;
    bucket.pixels.sort((a,b) => a[sortCh]-b[sortCh]);
    const mid = Math.floor(bucket.pixels.length/2);
    buckets.splice(bestIdx, 1, makeBucket(bucket.pixels.slice(0,mid)), makeBucket(bucket.pixels.slice(mid)));
  }
  return buckets.map(b => {
    let r=0,g=0,bl=0;
    for(const p of b.pixels){r+=p[0];g+=p[1];bl+=p[2];}
    const n=b.pixels.length;
    return [Math.round(r/n),Math.round(g/n),Math.round(bl/n)];
  });
}

// ── Main ──
const imagePath = process.argv[2] || "/Users/houssam/Documents/MJ-IMAGES/cottagecore_garden_2.png";
const gridSize = parseInt(process.argv[3]) || 120;
const maxColors = parseInt(process.argv[4]) || 20;

const imgBuffer = fs.readFileSync(imagePath);
const metadata = await sharp(imgBuffer).metadata();
const fullW = metadata.width;
const fullH = metadata.height;

const { data: rawPixels } = await sharp(imgBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

const ar = fullW / fullH;
const gw = gridSize;
const gh = Math.round(gw / ar);
const blockW = fullW / gw;
const blockH = fullH / gh;

console.error(`Image: ${fullW}x${fullH} → Grid: ${gw}x${gh}`);

const gridPixels = [];
for (let gy = 0; gy < gh; gy++) {
  const row = [];
  for (let gx = 0; gx < gw; gx++) {
    const sx = Math.floor(gx * blockW);
    const sy = Math.floor(gy * blockH);
    const ex = Math.min(Math.floor((gx + 1) * blockW), fullW);
    const ey = Math.min(Math.floor((gy + 1) * blockH), fullH);
    let rSum=0,gSum=0,bSum=0,count=0;
    for (let py=sy; py<ey; py++) {
      for (let px=sx; px<ex; px++) {
        const i = (py * fullW + px) * 4;
        rSum += rawPixels[i]; gSum += rawPixels[i+1]; bSum += rawPixels[i+2];
        count++;
      }
    }
    row.push([Math.round(rSum/count), Math.round(gSum/count), Math.round(bSum/count)]);
  }
  gridPixels.push(row);
}

console.error("Running median cut quantization...");
const allPixels = [];
for (const row of gridPixels) for (const px of row) allPixels.push(px);
const palette = medianCut(allPixels, maxColors);

const paletteDmc = palette.map(([r,g,b]) => findNearestDMC(r,g,b));
const dmcInfoMap = new Map();
for (const d of paletteDmc) dmcInfoMap.set(d.dmc, d);

const grid = [];
const colorCounts = new Map();
for (let y=0; y<gh; y++) {
  const row = [];
  for (let x=0; x<gw; x++) {
    const [pr,pg,pb] = gridPixels[y][x];
    let bestIdx=0, bestDist=Infinity;
    for (let i=0; i<palette.length; i++) {
      const [cr,cg,cb] = palette[i];
      const dist = 2*(pr-cr)**2 + 4*(pg-cg)**2 + 3*(pb-cb)**2;
      if(dist<bestDist){bestDist=dist;bestIdx=i;}
    }
    const dmcCode = paletteDmc[bestIdx].dmc;
    row.push(dmcCode);
    colorCounts.set(dmcCode, (colorCounts.get(dmcCode)||0)+1);
  }
  grid.push(row);
}

const colors = [];
let symbolIdx = 0;
const sortedEntries = [...colorCounts.entries()].sort((a,b) => b[1]-a[1]);
for (const [dmcCode, count] of sortedEntries) {
  const info = dmcInfoMap.get(dmcCode);
  colors.push({
    dmc: dmcCode, name: info.name, hex: info.hex,
    symbol: PATTERN_SYMBOLS[symbolIdx % PATTERN_SYMBOLS.length],
    count,
  });
  symbolIdx++;
}

const pattern = { grid, colors, width: gw, height: gh, totalStitches: gw * gh };

console.error(`Done! ${colors.length} colors, ${pattern.totalStitches} stitches`);

// Output JSON to stdout
const outPath = "/tmp/cross-stitch-pattern.json";
fs.writeFileSync(outPath, JSON.stringify(pattern));
console.log(outPath);
