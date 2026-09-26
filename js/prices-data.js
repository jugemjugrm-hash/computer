/* ==========================================================================
   誌面掲載の実売価格（『自作PC完全マスター2026』／2025年12月時点）
   min = 下限, max = 上限（単一価格の製品は min === max）
   page … 出典ページ。グラフのバーから誌面を開いて検算できる
   ========================================================================== */

const PRICE_ASOF = '2025年12月';

const PRICE_DATA = {

/* --------------------------------- CPU --------------------------------- */
cpu: [
  // --- AMD Ryzen 9000（現行） ---
  { n:'Ryzen 9 9950X3D', b:'AMD', min:110000, max:110000, g:'現行', cls:'フラッグシップ', socket:'AM5', mem:'DDR5', tdp:170, core:'16/32', cooler:false, page:17 },
  { n:'Ryzen 9 9950X',   b:'AMD', min:82000,  max:82000,  g:'現行', cls:'フラッグシップ', socket:'AM5', mem:'DDR5', tdp:170, core:'16/32', cooler:false, page:17 },
  { n:'Ryzen 9 9900X3D', b:'AMD', min:92000,  max:92000,  g:'現行', cls:'フラッグシップ', socket:'AM5', mem:'DDR5', tdp:120, core:'12/24', cooler:false, page:17 },
  { n:'Ryzen 9 9900X',   b:'AMD', min:68000,  max:68000,  g:'現行', cls:'フラッグシップ', socket:'AM5', mem:'DDR5', tdp:120, core:'12/24', cooler:false, page:17 },
  { n:'Ryzen 7 9800X3D', b:'AMD', min:88000,  max:88000,  g:'現行', cls:'ハイエンド',   socket:'AM5', mem:'DDR5', tdp:120, core:'8/16',  cooler:false, page:17 },
  { n:'Ryzen 7 9700X',   b:'AMD', min:50000,  max:50000,  g:'現行', cls:'ハイエンド',   socket:'AM5', mem:'DDR5', tdp:65,  core:'8/16',  cooler:false, page:17 },
  { n:'Ryzen 5 9600X',   b:'AMD', min:41000,  max:41000,  g:'現行', cls:'ミドルレンジ', socket:'AM5', mem:'DDR5', tdp:65,  core:'6/12',  cooler:false, page:18 },
  { n:'Ryzen 5 9600',    b:'AMD', min:39000,  max:39000,  g:'現行', cls:'ミドルレンジ', socket:'AM5', mem:'DDR5', tdp:65,  core:'6/12',  cooler:true,  page:18 },
  { n:'Ryzen 5 9500F',   b:'AMD', min:38000,  max:38000,  g:'現行', cls:'ミドルレンジ', socket:'AM5', mem:'DDR5', tdp:65,  core:'6/12',  cooler:true,  page:18 },
  // --- AMD Ryzen 8000G（APU） ---
  { n:'Ryzen 7 8700G',   b:'AMD', min:48000,  max:48000,  g:'現行', cls:'APU',        socket:'AM5', mem:'DDR5', tdp:65,  core:'8/16',  cooler:true,  page:18 },
  { n:'Ryzen 5 8600G',   b:'AMD', min:32000,  max:32000,  g:'現行', cls:'APU',        socket:'AM5', mem:'DDR5', tdp:65,  core:'6/12',  cooler:true,  page:18 },
  { n:'Ryzen 5 8500G',   b:'AMD', min:24000,  max:24000,  g:'現行', cls:'APU',        socket:'AM5', mem:'DDR5', tdp:65,  core:'6/12',  cooler:true,  page:18 },
  // --- AMD Ryzen 7000／5000（前世代） ---
  { n:'Ryzen 9 7950X3D', b:'AMD', min:130000, max:130000, g:'前世代', cls:'フラッグシップ', socket:'AM5', mem:'DDR5', tdp:120, core:'16/32', cooler:false, page:17 },
  { n:'Ryzen 9 7950X',   b:'AMD', min:90000,  max:90000,  g:'前世代', cls:'フラッグシップ', socket:'AM5', mem:'DDR5', tdp:170, core:'16/32', cooler:false, page:17 },
  { n:'Ryzen 9 7900X',   b:'AMD', min:60000,  max:60000,  g:'前世代', cls:'フラッグシップ', socket:'AM5', mem:'DDR5', tdp:170, core:'12/24', cooler:false, page:17 },
  { n:'Ryzen 9 7900',    b:'AMD', min:60000,  max:60000,  g:'前世代', cls:'フラッグシップ', socket:'AM5', mem:'DDR5', tdp:65,  core:'12/24', cooler:true,  page:17 },
  { n:'Ryzen 7 7800X3D', b:'AMD', min:58000,  max:58000,  g:'前世代', cls:'ハイエンド',   socket:'AM5', mem:'DDR5', tdp:120, core:'8/16',  cooler:false, page:17 },
  { n:'Ryzen 7 7700X',   b:'AMD', min:43000,  max:43000,  g:'前世代', cls:'ハイエンド',   socket:'AM5', mem:'DDR5', tdp:105, core:'8/16',  cooler:false, page:17 },
  { n:'Ryzen 7 7700',    b:'AMD', min:48000,  max:48000,  g:'前世代', cls:'ハイエンド',   socket:'AM5', mem:'DDR5', tdp:65,  core:'8/16',  cooler:true,  page:17 },
  { n:'Ryzen 5 7600X',   b:'AMD', min:42000,  max:42000,  g:'前世代', cls:'ミドルレンジ', socket:'AM5', mem:'DDR5', tdp:105, core:'6/12',  cooler:false, page:18 },
  { n:'Ryzen 5 7600',    b:'AMD', min:33000,  max:33000,  g:'前世代', cls:'ミドルレンジ', socket:'AM5', mem:'DDR5', tdp:65,  core:'6/12',  cooler:true,  page:18 },
  { n:'Ryzen 9 5900XT',  b:'AMD', min:62000,  max:62000,  g:'前世代', cls:'フラッグシップ', socket:'AM4', mem:'DDR4', tdp:105, core:'16/32', cooler:false, page:17 },
  { n:'Ryzen 7 5800XT',  b:'AMD', min:33000,  max:33000,  g:'前世代', cls:'ハイエンド',   socket:'AM4', mem:'DDR4', tdp:105, core:'8/16',  cooler:true,  page:17 },
  { n:'Ryzen 7 5700X',   b:'AMD', min:23000,  max:23000,  g:'前世代', cls:'ハイエンド',   socket:'AM4', mem:'DDR4', tdp:65,  core:'8/16',  cooler:false, page:17 },
  { n:'Ryzen 5 5600XT',  b:'AMD', min:28000,  max:28000,  g:'前世代', cls:'ミドルレンジ', socket:'AM4', mem:'DDR4', tdp:65,  core:'6/12',  cooler:true,  page:18 },
  { n:'Ryzen 5 5600',    b:'AMD', min:16000,  max:16000,  g:'前世代', cls:'ミドルレンジ', socket:'AM4', mem:'DDR4', tdp:65,  core:'6/12',  cooler:true,  page:18 },

  // --- Intel Core Ultra 200S（現行） ---
  { n:'Core Ultra 9 285K', b:'Intel', min:95000, max:95000, g:'現行', cls:'フラッグシップ', socket:'LGA1851', mem:'DDR5', tdp:253, core:'24/24', cooler:false, page:20 },
  { n:'Core Ultra 9 285',  b:'Intel', min:95000, max:95000, g:'現行', cls:'フラッグシップ', socket:'LGA1851', mem:'DDR5', tdp:182, core:'24/24', cooler:true,  page:20 },
  { n:'Core Ultra 7 265K', b:'Intel', min:52000, max:52000, g:'現行', cls:'ハイエンド',   socket:'LGA1851', mem:'DDR5', tdp:250, core:'20/20', cooler:false, page:20 },
  { n:'Core Ultra 7 265KF',b:'Intel', min:47000, max:47000, g:'現行', cls:'ハイエンド',   socket:'LGA1851', mem:'DDR5', tdp:250, core:'20/20', cooler:false, page:20 },
  { n:'Core Ultra 7 265',  b:'Intel', min:58000, max:58000, g:'現行', cls:'ハイエンド',   socket:'LGA1851', mem:'DDR5', tdp:182, core:'20/20', cooler:true,  page:20 },
  { n:'Core Ultra 7 265F', b:'Intel', min:56000, max:56000, g:'現行', cls:'ハイエンド',   socket:'LGA1851', mem:'DDR5', tdp:182, core:'20/20', cooler:true,  page:20 },
  { n:'Core Ultra 5 245K', b:'Intel', min:38000, max:38000, g:'現行', cls:'ミドルレンジ', socket:'LGA1851', mem:'DDR5', tdp:159, core:'14/14', cooler:false, page:21 },
  { n:'Core Ultra 5 245KF',b:'Intel', min:35000, max:35000, g:'現行', cls:'ミドルレンジ', socket:'LGA1851', mem:'DDR5', tdp:159, core:'14/14', cooler:false, page:21 },
  { n:'Core Ultra 5 235',  b:'Intel', min:44000, max:44000, g:'現行', cls:'ミドルレンジ', socket:'LGA1851', mem:'DDR5', tdp:121, core:'14/14', cooler:true,  page:21 },
  { n:'Core Ultra 5 225',  b:'Intel', min:30000, max:30000, g:'現行', cls:'ミドルレンジ', socket:'LGA1851', mem:'DDR5', tdp:121, core:'10/10', cooler:true,  page:21 },
  { n:'Core Ultra 5 225F', b:'Intel', min:27000, max:27000, g:'現行', cls:'ミドルレンジ', socket:'LGA1851', mem:'DDR5', tdp:121, core:'10/10', cooler:true,  page:21 },
  // --- Intel 第14世代（前世代） ---
  { n:'Core i9-14900KS', b:'Intel', min:130000, max:130000, g:'前世代', cls:'フラッグシップ', socket:'LGA1700', mem:'DDR5/DDR4', tdp:253, core:'24/32', cooler:false, page:20 },
  { n:'Core i9-14900K',  b:'Intel', min:80000,  max:80000,  g:'前世代', cls:'フラッグシップ', socket:'LGA1700', mem:'DDR5/DDR4', tdp:253, core:'24/32', cooler:false, page:20 },
  { n:'Core i9-14900KF', b:'Intel', min:74000,  max:74000,  g:'前世代', cls:'フラッグシップ', socket:'LGA1700', mem:'DDR5/DDR4', tdp:253, core:'24/32', cooler:false, page:20 },
  { n:'Core i9-14900',   b:'Intel', min:100000, max:100000, g:'前世代', cls:'フラッグシップ', socket:'LGA1700', mem:'DDR5/DDR4', tdp:219, core:'24/32', cooler:true,  page:20 },
  { n:'Core i7-14700K',  b:'Intel', min:55000,  max:55000,  g:'前世代', cls:'ハイエンド',   socket:'LGA1700', mem:'DDR5/DDR4', tdp:253, core:'20/28', cooler:false, page:20 },
  { n:'Core i7-14700KF', b:'Intel', min:50000,  max:50000,  g:'前世代', cls:'ハイエンド',   socket:'LGA1700', mem:'DDR5/DDR4', tdp:253, core:'20/28', cooler:false, page:20 },
  { n:'Core i7-14700',   b:'Intel', min:60000,  max:60000,  g:'前世代', cls:'ハイエンド',   socket:'LGA1700', mem:'DDR5/DDR4', tdp:219, core:'20/28', cooler:true,  page:20 },
  { n:'Core i7-14700F',  b:'Intel', min:50000,  max:50000,  g:'前世代', cls:'ハイエンド',   socket:'LGA1700', mem:'DDR5/DDR4', tdp:219, core:'20/28', cooler:true,  page:20 },
  { n:'Core i5-14600K',  b:'Intel', min:39000,  max:39000,  g:'前世代', cls:'ミドルレンジ', socket:'LGA1700', mem:'DDR5/DDR4', tdp:181, core:'14/20', cooler:false, page:21 },
  { n:'Core i5-14600KF', b:'Intel', min:35000,  max:35000,  g:'前世代', cls:'ミドルレンジ', socket:'LGA1700', mem:'DDR5/DDR4', tdp:181, core:'14/20', cooler:false, page:21 },
  { n:'Core i5-14500',   b:'Intel', min:44000,  max:44000,  g:'前世代', cls:'ミドルレンジ', socket:'LGA1700', mem:'DDR5/DDR4', tdp:154, core:'14/20', cooler:true,  page:21 },
  { n:'Core i5-14400',   b:'Intel', min:38000,  max:38000,  g:'前世代', cls:'ミドルレンジ', socket:'LGA1700', mem:'DDR5/DDR4', tdp:148, core:'10/16', cooler:true,  page:21 },
  { n:'Core i5-14400F',  b:'Intel', min:25000,  max:25000,  g:'前世代', cls:'ミドルレンジ', socket:'LGA1700', mem:'DDR5/DDR4', tdp:148, core:'10/16', cooler:true,  page:21 },
  { n:'Core i3-14100',   b:'Intel', min:25000,  max:25000,  g:'前世代', cls:'エントリー',   socket:'LGA1700', mem:'DDR5/DDR4', tdp:110, core:'4/8',   cooler:true,  page:21 },
  { n:'Core i3-14100F',  b:'Intel', min:14000,  max:14000,  g:'前世代', cls:'エントリー',   socket:'LGA1700', mem:'DDR5/DDR4', tdp:110, core:'4/8',   cooler:true,  page:21 },
  { n:'Intel Processor 300', b:'Intel', min:17000, max:17000, g:'前世代', cls:'エントリー', socket:'LGA1700', mem:'DDR5/DDR4', tdp:46, core:'2/4', cooler:true, page:21 }
],

/* ------------------------------ GPU ------------------------------ */
gpu: [
  // --- NVIDIA GeForce ---
  { n:'RTX 5090',        b:'GeForce', min:400000, max:600000, g:'現行', watt:575, psu:1000, vram:'GDDR7 32GB', page:33 },
  { n:'RTX 5080',        b:'GeForce', min:170000, max:300000, g:'現行', watt:360, psu:850,  vram:'GDDR7 16GB', page:33 },
  { n:'RTX 5070 Ti',     b:'GeForce', min:130000, max:190000, g:'現行', watt:300, psu:750,  vram:'GDDR7 16GB', page:33 },
  { n:'RTX 5070',        b:'GeForce', min:82000,  max:160000, g:'現行', watt:250, psu:650,  vram:'GDDR7 12GB', page:33 },
  { n:'RTX 5060 Ti 16GB',b:'GeForce', min:70000,  max:100000, g:'現行', watt:180, psu:600,  vram:'GDDR7 16GB', page:33 },
  { n:'RTX 5060 Ti 8GB', b:'GeForce', min:56000,  max:70000,  g:'現行', watt:180, psu:600,  vram:'GDDR7 8GB',  page:33 },
  { n:'RTX 5060',        b:'GeForce', min:44000,  max:60000,  g:'現行', watt:145, psu:550,  vram:'GDDR7 8GB',  page:33 },
  { n:'RTX 5050',        b:'GeForce', min:34000,  max:50000,  g:'現行', watt:130, psu:550,  vram:'GDDR6 8GB',  page:33 },
  { n:'RTX 4060 Ti 8GB', b:'GeForce', min:50000,  max:60000,  g:'前世代', watt:160, psu:550, vram:'GDDR6 8GB',  page:33 },
  { n:'RTX 4060',        b:'GeForce', min:45000,  max:65000,  g:'前世代', watt:115, psu:550, vram:'GDDR6 8GB',  page:33 },
  // --- AMD Radeon ---
  { n:'RX 9070 XT',      b:'Radeon', min:90000,  max:140000, g:'現行', watt:304, psu:750, vram:'GDDR6 16GB', page:34 },
  { n:'RX 9070',         b:'Radeon', min:85000,  max:135000, g:'現行', watt:220, psu:650, vram:'GDDR6 16GB', page:34 },
  { n:'RX 9060 XT 16GB', b:'Radeon', min:50000,  max:77000,  g:'現行', watt:160, psu:450, vram:'GDDR6 16GB', page:34 },
  { n:'RX 9060 XT 8GB',  b:'Radeon', min:42000,  max:52000,  g:'現行', watt:150, psu:450, vram:'GDDR6 8GB',  page:34 },
  { n:'RX 7900 XTX',     b:'Radeon', min:130000, max:180000, g:'前世代', watt:355, psu:800, vram:'GDDR6 24GB', page:34 },
  { n:'RX 7900 XT',      b:'Radeon', min:95000,  max:135000, g:'前世代', watt:300, psu:750, vram:'GDDR6 20GB', page:34 },
  { n:'RX 7800 XT',      b:'Radeon', min:70000,  max:88000,  g:'前世代', watt:263, psu:700, vram:'GDDR6 16GB', page:34 },
  { n:'RX 7700 XT',      b:'Radeon', min:54000,  max:68000,  g:'前世代', watt:245, psu:700, vram:'GDDR6 12GB', page:34 },
  { n:'RX 7600 XT',      b:'Radeon', min:65000,  max:65000,  g:'前世代', watt:190, psu:600, vram:'GDDR6 16GB', page:34 },
  { n:'RX 7600',         b:'Radeon', min:32000,  max:49000,  g:'前世代', watt:165, psu:550, vram:'GDDR6 8GB',  page:34 },
  // --- Intel Arc ---
  { n:'Arc B580',        b:'Arc', min:40000, max:46000, g:'現行', watt:190, psu:0, vram:'GDDR6 12GB', page:35 },
  { n:'Arc B570',        b:'Arc', min:30000, max:39000, g:'現行', watt:150, psu:0, vram:'GDDR6 10GB', page:35 },
  { n:'Arc A770 16GB',   b:'Arc', min:44000, max:53000, g:'前世代', watt:225, psu:0, vram:'GDDR6 16GB', page:35 },
  { n:'Arc A750',        b:'Arc', min:26000, max:54000, g:'前世代', watt:225, psu:0, vram:'GDDR6 8GB',  page:35 },
  { n:'Arc A580',        b:'Arc', min:23000, max:35000, g:'前世代', watt:175, psu:0, vram:'GDDR6 8GB',  page:35 },
  { n:'Arc A380',        b:'Arc', min:16000, max:19000, g:'前世代', watt:75,  psu:0, vram:'GDDR6 6GB',  page:35 },
  { n:'Arc A310',        b:'Arc', min:16000, max:18000, g:'前世代', watt:75,  psu:0, vram:'GDDR6 4GB',  page:35 }
],

/* --------------------------- マザーボード --------------------------- */
mb: [
  { n:'PRIME X870-P WIFI-CSM',   b:'AMD',   min:31000, max:31000, g:'現行', socket:'AM5',     chipset:'X870', mem:'DDR5', form:'ATX',      page:24 },
  { n:'PRIME B850-PLUS WIFI-CSM',b:'AMD',   min:30000, max:30000, g:'現行', socket:'AM5',     chipset:'B850', mem:'DDR5', form:'ATX',      page:24 },
  { n:'PRIME B840-PLUS WIFI-CSM',b:'AMD',   min:23000, max:23000, g:'現行', socket:'AM5',     chipset:'B840', mem:'DDR5', form:'ATX',      page:24 },
  { n:'PRIME Z890-P WIFI-CSM',   b:'Intel', min:31000, max:31000, g:'現行', socket:'LGA1851', chipset:'Z890', mem:'DDR5', form:'ATX',      page:24 },
  { n:'PRIME B860-PLUS-CSM',     b:'Intel', min:20000, max:20000, g:'現行', socket:'LGA1851', chipset:'B860', mem:'DDR5', form:'ATX',      page:24 },
  { n:'PRIME H810M-A-CSM',       b:'Intel', min:18000, max:18000, g:'現行', socket:'LGA1851', chipset:'H810', mem:'DDR5', form:'MicroATX', page:24 }
],

/* ------------------------------- OS ------------------------------- */
os: [
  { n:'Windows 11 Home パッケージ版', b:'Home', min:17000, max:17000, page:44 },
  { n:'Windows 11 Home ダウンロード版', b:'Home', min:18000, max:18000, page:44 },
  { n:'Windows 11 Home DSP版',        b:'Home', min:20000, max:20000, page:44 },
  { n:'Windows 11 Pro パッケージ版',  b:'Pro',  min:25000, max:25000, page:44 },
  { n:'Windows 11 Pro ダウンロード版',b:'Pro',  min:26000, max:26000, page:44 },
  { n:'Windows 11 Pro DSP版',         b:'Pro',  min:26000, max:26000, page:44 }
],

/* --------------------------- 光学ドライブ --------------------------- */
odd: [
  { n:'内蔵 DVDドライブ',       b:'内蔵', min:3000,  max:4000,  page:42 },
  { n:'内蔵 Blu-rayドライブ',   b:'内蔵', min:12000, max:23000, page:42 },
  { n:'外付け DVDドライブ',     b:'外付け', min:3000,  max:5000,  page:42 },
  { n:'外付け Blu-rayドライブ', b:'外付け', min:10000, max:20000, page:42 }
]

};

/* グラフのカテゴリ定義（凡例の色はこの順に slot1→slot2→slot3 が割り当てられる） */
const PRICE_GROUPS = {
  cpu: { label:'CPU',             brands:['AMD', 'Intel'],                unit:'円' },
  gpu: { label:'グラフィックボード', brands:['GeForce', 'Radeon', 'Arc'],   unit:'円' },
  mb:  { label:'マザーボード',      brands:['AMD', 'Intel'],                unit:'円' },
  os:  { label:'Windows 11',       brands:['Home', 'Pro'],                 unit:'円' },
  odd: { label:'光学ドライブ',      brands:['内蔵', '外付け'],               unit:'円' }
};

/* 構成見積もりで使う、誌面に価格表のないパーツ（初期値は 0 円。自分で入力する） */
/* hint … 入力欄の横に出す説明文（人間向け）
   query … 「調べる」で比較サイトに渡す検索語（説明文をそのまま渡すと「など」まで検索されるため分ける） */
const BUILD_EXTRA = [
  { id:'mem',   label:'メモリ',      hint:'DDR5 32GB（16GB×2）など', query:'DDR5 32GB メモリ',            watt:10 },
  { id:'ssd',   label:'SSD',        hint:'M.2 NVMe 1TB など',       query:'M.2 SSD 1TB NVMe',           watt:8 },
  { id:'cool',  label:'CPUクーラー', hint:'簡易水冷240mm など',       query:'CPUクーラー 簡易水冷 240mm',  watt:10 },
  { id:'case',  label:'PCケース',    hint:'ATX ミドルタワー など',    query:'PCケース ATX ミドルタワー',    watt:15 },
  { id:'psu',   label:'電源ユニット', hint:'850W GOLD など',          query:'電源ユニット 850W GOLD',      watt:0 }
];
