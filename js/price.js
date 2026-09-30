/* ==========================================================================
   「パーツ価格」画面
   ・誌面の実売価格を横棒グラフにまとめる
   ・構成見積もり（合計金額・消費電力・推奨電源容量・互換性チェック）
   ・現在価格は比較サイトへ。任意で楽天APIによる一覧表示にも対応
   ========================================================================== */
'use strict';

(function () {

const KEY_STORE   = 'pcQuiz.rakutenKey';
const BUILD_STORE = 'pcQuiz.build.v1';
const ENDPOINT    = 'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601';

const G = { cat: 'cpu', brands: [], gen: '現行', sort: 'asc', view: 'chart' };
const B = {};   // 構成見積もりの選択内容

/* -------------------------------- 小道具 -------------------------------- */
function yen(n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); }
function man(n) {
  if (n >= 100000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万円';
  return Number(n).toLocaleString('ja-JP') + '円';
}
function priceLabel(it) {
  return it.max > it.min ? man(it.min) + '〜' + man(it.max) : man(it.min);
}
/** 目盛りが4等分でちょうど良い数になるように上限を決める */
const NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceMax(v) {
  if (!(v > 0)) return 1;
  const raw = v / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const m = NICE.find((x) => n <= x + 1e-9) || 10;
  return m * mag * 4;
}
/** 1本の軸の中では単位を揃える（上限10万円以上なら万円、それ未満は円） */
function axisLabel(v, top) {
  if (v === 0) return '0';
  if (top >= 100000) {
    const m = v / 10000;
    return (Number.isInteger(m) ? m : m.toFixed(1)) + '万';
  }
  return Number(v).toLocaleString('ja-JP');
}

/* ============================== 価格グラフ ============================== */
function items() {
  const list = (PRICE_DATA[G.cat] || []).filter((it) => {
    if (G.brands.length && !G.brands.includes(it.b)) return false;
    if (G.gen === '現行' && it.g && it.g !== '現行') return false;
    return it.min > 0;
  });
  return list.sort((a, b) => G.sort === 'asc' ? a.min - b.min : b.min - a.min);
}

function brandSlot(brand) {
  const all = PRICE_GROUPS[G.cat].brands;
  return (all.indexOf(brand) % 8) + 1;   // 色は「並び順」ではなくブランドに固定
}

/** 価格帯グラフに出せる区分＝誌面に価格表があるもの */
function bookCats() {
  return Object.keys(PRICE_GROUPS).filter((k) => !PRICE_GROUPS[k].noBook);
}
function renderCats() {
  $('#pgCats').innerHTML = bookCats().map((k) =>
    '<button type="button" class="chip' + (k === G.cat ? ' is-on' : '') + '" data-pgcat="' + k + '">' +
    PRICE_GROUPS[k].label + '</button>').join('');
}
function renderBrands() {
  const all = PRICE_GROUPS[G.cat].brands;
  $('#pgBrands').innerHTML = all.map((b) =>
    '<button type="button" class="chip ghost' + (G.brands.includes(b) ? ' is-on' : '') + '" data-pgbrand="' + b + '">' +
    b + '</button>').join('');
}

function renderLegend() {
  const all = PRICE_GROUPS[G.cat].brands;
  $('#pgLegend').innerHTML = all.map((b) =>
    '<span class="lg-item"><i class="lg-swatch" style="background:var(--series-' + brandSlot(b) + ')"></i>' + b + '</span>'
  ).join('');
}

function renderChart() {
  const list = items();
  const box = $('#pgChart');
  const cap = $('#pgCaption');
  const unitNote = list.length ? (niceMax(Math.max.apply(null, list.map((i) => i.max))) >= 100000 ? '単位：万円' : '単位：円') : '';
  cap.textContent = PRICE_GROUPS[G.cat].label + 'の価格帯（' + (G.gen === '現行' ? '現行モデル' : '前世代を含む') +
                    '・' + list.length + '製品／' + unitNote + '）';

  if (!list.length) {
    box.innerHTML = '<p class="review-empty">条件に合う製品がありません。</p>';
    $('#pgTable').innerHTML = '';
    return;
  }

  const top = niceMax(Math.max.apply(null, list.map((i) => i.max)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(top * r));

  let html = '<div class="viz-grid">' +
    ticks.map((t, i) => '<span class="viz-tick" style="left:' + (i * 25) + '%"><b></b><em>' +
      axisLabel(t, top) + '</em></span>').join('') + '</div>';

  html += list.map((it, idx) => {
    const slot = brandSlot(it.b);
    const w1 = (it.min / top) * 100;
    const w2 = ((it.max - it.min) / top) * 100;
    const solo = w2 <= 0.01;
    return '<div class="bar-row" data-i="' + idx + '" tabindex="0">' +
        '<span class="bar-label"></span>' +
        '<span class="bar-track">' +
          '<span class="bar-fill' + (solo ? ' is-end' : '') + '" style="width:' + w1.toFixed(2) + '%;background:var(--series-' + slot + ')"></span>' +
          (solo ? '' : '<span class="bar-ext is-end" style="left:' + w1.toFixed(2) + '%;width:' + w2.toFixed(2) + '%;background:var(--series-' + slot + ')"></span>') +
        '</span>' +
        '<span class="bar-value"></span>' +
      '</div>';
  }).join('');

  box.innerHTML = html;
  // テキストは textContent で入れる
  $$('#pgChart .bar-row').forEach((row, i) => {
    $('.bar-label', row).textContent = list[i].n;
    $('.bar-value', row).textContent = priceLabel(list[i]);
    row.addEventListener('click', () => { if (list[i].page) window.App.openPage(list[i].page); });
    row.addEventListener('keydown', (ev) => {
      if ((ev.key === 'Enter' || ev.key === ' ') && list[i].page) { ev.preventDefault(); window.App.openPage(list[i].page); }
    });
    // マウスは「乗せたら出る」、指は「触れたら出る」。
    // pointer イベントに寄せて、両方を一本で扱う
    row.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') showTip(ev, list[i]); });
    row.addEventListener('pointermove',  (ev) => { if (ev.pointerType === 'mouse') moveTip(ev); });
    row.addEventListener('pointerleave', hideTip);
    row.addEventListener('pointerdown',  (ev) => { if (ev.pointerType !== 'mouse') showTip(ev, list[i]); });
    row.addEventListener('focus', (ev) => showTip(ev, list[i]));
    row.addEventListener('blur', hideTip);
  });

  renderTable(list);
}

function specLine(it) {
  if (G.cat === 'cpu')  return it.core + 'コア/スレッド・' + it.socket + '・' + it.mem + '・最大' + it.tdp + 'W';
  if (G.cat === 'gpu')  return it.vram + '・最大' + it.watt + 'W' + (it.psu ? '（推奨電源' + it.psu + 'W）' : '');
  if (G.cat === 'mb')   return it.chipset + '・' + it.socket + '・' + it.mem + '・' + it.form;
  return it.b;
}

function renderTable(list) {
  let html = '<thead><tr><th>製品名</th><th>区分</th><th>価格（下限）</th><th>価格（上限）</th><th>主なスペック</th></tr></thead><tbody>';
  html += list.map(() => '<tr><th scope="row"></th><td></td><td class="num"></td><td class="num"></td><td></td></tr>').join('');
  html += '</tbody>';
  const tbl = $('#pgTable');
  tbl.innerHTML = html;
  $$('#pgTable tbody tr').forEach((tr, i) => {
    const c = tr.children;
    c[0].textContent = list[i].n;
    c[1].textContent = list[i].b;
    c[2].textContent = yen(list[i].min);
    c[3].textContent = list[i].max > list[i].min ? yen(list[i].max) : '—';
    c[4].textContent = specLine(list[i]);
  });
}

/* ------------------------------ ツールチップ ------------------------------ */
let tipEl = null;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'viz-tip';
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    bindTipDismiss();
  }
  return tipEl;
}
function showTip(ev, it) {
  const t = tip();
  t.innerHTML = '<b></b><span class="tip-price"></span><span class="tip-spec"></span><span class="tip-src"></span>';
  $('b', t).textContent = it.n;
  $('.tip-price', t).textContent = priceLabel(it);
  $('.tip-spec', t).textContent = specLine(it);
  $('.tip-src', t).textContent = it.page ? '押すと誌面 p.' + it.page + ' を表示' : '';
  t.hidden = false;
  moveTip(ev);
}
function moveTip(ev) {
  const t = tip();
  if (t.hidden) return;
  const touch = ev.pointerType && ev.pointerType !== 'mouse';
  // 指のときは吹き出しを指の上に出す。下に出すと指そのもので隠れてしまう。
  // ただし画面の上端に近くて上に置けないときは、下に回り込ませる
  let y;
  if (touch) {
    const above = ev.clientY - t.offsetHeight - 18;
    y = above >= 8 ? above : ev.clientY + 26;
  } else {
    y = ev.clientY + 16;
  }
  const x = Math.min(ev.clientX + (touch ? -t.offsetWidth / 2 : 14), window.innerWidth - t.offsetWidth - 10);
  y = Math.min(y, window.innerHeight - t.offsetHeight - 10);
  t.style.left = Math.max(8, x) + 'px';
  t.style.top  = Math.max(8, y) + 'px';
}
function hideTip() { if (tipEl) tipEl.hidden = true; }

// 指で出した吹き出しは pointerleave が来ないことがある。
// 画面を動かしたときと、他の場所を触ったときに必ず消す
let tipDismissBound = false;
function bindTipDismiss() {
  if (tipDismissBound) return;
  tipDismissBound = true;
  window.addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('pointerdown', (ev) => {
    if (!ev.target.closest || !ev.target.closest('.bar-row')) hideTip();
  }, true);
}

/* ============================== 構成見積もり ============================== */
const PSU_WATTS = [450, 550, 650, 750, 850, 1000, 1200];

function loadBuild() {
  try {
    const d = JSON.parse(localStorage.getItem(BUILD_STORE));
    if (d) Object.assign(B, d);
  } catch (e) { /* 初期状態で続行 */ }
}
function saveBuild() {
  try { localStorage.setItem(BUILD_STORE, JSON.stringify(B)); } catch (e) { /* 続行 */ }
}

function buildRows() {
  return [
    { id:'cpu', label:'CPU',            list:PRICE_DATA.cpu, none:false },
    { id:'mb',  label:'マザーボード',    list:PRICE_DATA.mb,  none:false },
    { id:'gpu', label:'グラフィックボード', list:PRICE_DATA.gpu, none:true, noneLabel:'搭載しない（CPU内蔵グラフィックスを使う）' },
    { id:'os',  label:'Windows 11',     list:PRICE_DATA.os,  none:true, noneLabel:'別途用意する' }
  ];
}

function renderBuild() {
  const grid = $('#buildGrid');
  grid.innerHTML = '';

  buildRows().forEach((row) => {
    const wrap = document.createElement('div');
    wrap.className = 'build-row';
    wrap.innerHTML =
      '<label class="build-label"></label>' +
      '<select class="build-select" data-bkey="' + row.id + '"></select>' +
      '<span class="build-price"></span>' +
      '<button type="button" class="btn btn-ghost btn-sm build-find" data-bfind="' + row.id + '">調べる</button>';
    $('.build-label', wrap).textContent = row.label;

    const sel = $('.build-select', wrap);
    const opts = (row.none ? [{ n: row.noneLabel, min: 0, max: 0, none: true }] : [{ n: '選択してください', min: 0, none: true }])
      .concat(row.list);
    opts.forEach((it, i) => {
      const o = document.createElement('option');
      o.value = it.none ? '' : it.n;
      o.textContent = it.none ? it.n : it.n + '　' + priceLabel(it);
      sel.appendChild(o);
    });
    if (B[row.id]) sel.value = B[row.id];
    sel.addEventListener('change', () => { B[row.id] = sel.value; saveBuild(); updateBuild(); });
    $('.build-find', wrap).addEventListener('click', () => {
      const kw = (B[row.id] || '').trim();
      if (!kw) { status('先に「' + row.label + '」を選んでから押してください。', 'warn'); return; }
      openCompare('kakaku', kw);
    });
    grid.appendChild(wrap);
  });

  BUILD_EXTRA.forEach((ex) => {
    const wrap = document.createElement('div');
    wrap.className = 'build-row';
    const isPsu = ex.id === 'psu';
    wrap.innerHTML =
      '<label class="build-label"></label>' +
      (isPsu ? '<select class="build-select" data-bwatt="1"></select>'
             : '<span class="build-hint"></span>') +
      '<span class="build-input"><input type="number" class="text-input num" min="0" step="1000" placeholder="0" data-bprice="' + ex.id + '"><em>円</em></span>' +
      '<button type="button" class="btn btn-ghost btn-sm build-find" data-bfind="' + ex.id + '">調べる</button>';
    $('.build-label', wrap).textContent = ex.label;
    if (isPsu) {
      const sel = $('.build-select', wrap);
      sel.appendChild(new Option('容量を選ぶ', ''));
      PSU_WATTS.forEach((w) => sel.appendChild(new Option(w + 'W', String(w))));
      if (B.psuWatt) sel.value = B.psuWatt;
      sel.addEventListener('change', () => { B.psuWatt = sel.value; saveBuild(); updateBuild(); });
    } else {
      $('.build-hint', wrap).textContent = ex.hint;
    }
    const inp = $('input', wrap);
    if (B['p_' + ex.id]) inp.value = B['p_' + ex.id];
    inp.addEventListener('input', () => { B['p_' + ex.id] = inp.value; saveBuild(); updateBuild(); });
    $('.build-find', wrap).addEventListener('click', () => {
      const kw = (isPsu && B.psuWatt) ? '電源ユニット ' + B.psuWatt + 'W' : ex.query;
      openCompare('kakaku', kw);
    });
    grid.appendChild(wrap);
  });

  updateBuild();
}

function findItem(cat, name) {
  return (PRICE_DATA[cat] || []).find((i) => i.n === name) || null;
}

function updateBuild() {
  const cpu = findItem('cpu', B.cpu);
  const mb  = findItem('mb',  B.mb);
  const gpu = findItem('gpu', B.gpu);
  const os  = findItem('os',  B.os);

  // 選択済みの価格を表示に反映
  $$('#buildGrid .build-row').forEach((row) => {
    const sel = $('.build-select[data-bkey]', row);
    if (!sel) return;
    const it = findItem(sel.dataset.bkey, sel.value);
    $('.build-price', row).textContent = it ? priceLabel(it) : '—';
  });

  const segs = [];
  if (cpu) segs.push({ label: 'CPU', v: cpu.min, slot: 1 });
  if (mb)  segs.push({ label: 'マザーボード', v: mb.min, slot: 2 });
  if (gpu) segs.push({ label: 'グラフィックボード', v: gpu.min, slot: 3 });
  BUILD_EXTRA.forEach((ex, i) => {
    const v = Number(B['p_' + ex.id]) || 0;
    if (v > 0) segs.push({ label: ex.label, v: v, slot: 4 + i });
  });
  if (os) segs.push({ label: 'Windows 11', v: os.min, slot: 8 });

  const total = segs.reduce((s, x) => s + x.v, 0);
  $('#buildTotal').textContent = yen(total);
  $('#buildParts').textContent = segs.length;

  // 消費電力
  let watt = 0;
  if (cpu) watt += cpu.tdp;
  if (gpu) watt += gpu.watt;
  BUILD_EXTRA.forEach((ex) => { watt += ex.watt; });
  const need = Math.ceil((watt * 2) / 50) * 50;
  const recommend = Math.max(need, gpu && gpu.psu ? gpu.psu : 0);
  $('#buildWatt').textContent = (cpu || gpu) ? watt + 'W' : '—';
  $('#buildPsu').textContent  = (cpu || gpu) ? recommend + 'W 以上' : '—';

  renderStack(segs, total);
  renderChecks(cpu, mb, gpu, recommend);
}

function renderStack(segs, total) {
  const stack = $('#buildStack');
  const legend = $('#buildLegend');
  if (!total) {
    stack.innerHTML = '<p class="review-empty">パーツを選ぶと内訳が表示されます。</p>';
    legend.innerHTML = '';
    return;
  }
  stack.innerHTML = segs.map((s) => {
    const pct = (s.v / total) * 100;
    return '<span class="stack-seg" style="width:' + pct.toFixed(2) + '%;background:var(--series-' + s.slot + ')" ' +
           'title="' + s.label + ' ' + yen(s.v) + '"></span>';
  }).join('');
  legend.innerHTML = segs.map((s) =>
    '<span class="lg-item"><i class="lg-swatch" style="background:var(--series-' + s.slot + ')"></i>' +
    s.label + '<em class="lg-val">' + yen(s.v) + '（' + Math.round((s.v / total) * 100) + '%）</em></span>').join('');
}

function renderChecks(cpu, mb, gpu, recommend) {
  const out = [];
  const add = (kind, text) => out.push({ kind: kind, text: text });

  if (cpu && mb) {
    if (cpu.socket !== mb.socket) {
      add('ng', 'ソケットが合いません。' + cpu.n + ' は ' + cpu.socket + '、' + mb.n + ' は ' + mb.socket + ' です。');
    } else {
      add('ok', 'ソケットは ' + cpu.socket + ' で一致しています。');
    }
    const cpuMem = cpu.mem.split('/');
    if (!cpuMem.includes(mb.mem)) {
      add('ng', 'メモリ規格が合いません。CPUは ' + cpu.mem + '、マザーボードは ' + mb.mem + ' 対応です。');
    }
  }
  if (cpu && !cpu.cooler) {
    const hasCooler = Number(B.p_cool) > 0;
    add(hasCooler ? 'ok' : 'warn',
      hasCooler ? 'CPUクーラーは別途用意する構成になっています。'
                : cpu.n + ' はリテールクーラーが付属しません。CPUクーラーを別途選んでください。');
  }
  if (cpu && !gpu && /F$/.test(cpu.n)) {
    add('ng', cpu.n + ' は内蔵グラフィックスを持たないため、グラフィックボードが必要です。');
  }
  if (recommend && B.psuWatt) {
    const w = Number(B.psuWatt);
    if (w < recommend) add('ng', '電源容量が不足しています。' + w + 'W を選んでいますが、' + recommend + 'W 以上が目安です。');
    else add('ok', '電源容量は ' + w + 'W で、目安の ' + recommend + 'W 以上を満たしています。');
  } else if (recommend) {
    add('warn', '電源ユニットの容量を選ぶと、足りているか判定します（目安は ' + recommend + 'W 以上）。');
  }
  if (cpu && mb && cpu.socket === mb.socket && mb.chipset && /^(B840|A620|H810|H610|B760)$/.test(mb.chipset) && /K$|X$|X3D$/.test(cpu.n)) {
    add('warn', mb.chipset + ' はCPUのオーバークロックに対応していません。定格での利用になります。');
  }

  const box = $('#buildChecks');
  if (!out.length) { box.innerHTML = '<p class="review-empty">CPUとマザーボードを選ぶと、組み合わせを確認します。</p>'; return; }
  box.innerHTML = out.map((c) =>
    '<p class="check ' + c.kind + '"><span class="check-icon">' +
    (c.kind === 'ok' ? '✔' : c.kind === 'warn' ? '！' : '✕') + '</span><span class="check-text"></span></p>').join('');
  $$('#buildChecks .check-text').forEach((el, i) => { el.textContent = out[i].text; });
}

/* ========================= 現在価格（比較サイト／API） ========================= */
function openCompare(site, keyword) {
  const kw = (keyword || $('#priceInput').value || livePickName() || '').trim();
  if (!kw) { status('先に製品名を入力するか、パーツを選んでください。', 'warn'); return; }
  const q = encodeURIComponent(kw);
  const url = {
    kakaku:  'https://search.kakaku.com/' + q + '/',   // kakaku.com/search_results/ は301で日本語が壊れる
    amazon:  'https://www.amazon.co.jp/s?k=' + q,
    rakuten: 'https://search.rakuten.co.jp/search/mall/' + q + '/'
  }[site];
  if (url) window.open(url, '_blank', 'noopener');
}

function getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
function setKey(v) { try { localStorage.setItem(KEY_STORE, v); } catch (e) { /* 続行 */ } }

function livePickName() { const el = $('#livePick'); return el ? el.value : ''; }

function renderKeyState(msg, kind) {
  const k = getKey();
  const el = $('#keyState');
  const panel = $('#setupPanel');
  if (msg) {
    el.textContent = msg;
    el.className = 'key-state' + (kind ? ' ' + kind : '');
  } else if (k) {
    el.textContent = 'アプリID 設定済み（…' + k.slice(-6) + '）。パーツを選んで「今の価格を調べる」を押してください。';
    el.className = 'key-state ok';
  } else {
    el.textContent = '未設定です。設定しない場合は、下の比較サイトのボタンをお使いください。';
    el.className = 'key-state';
  }
  panel.classList.toggle('is-done', !!k);
  $('#btnLive').disabled = !k;
  $('#btnPriceSearch').disabled = !k;
}

function status(msg, kind) {
  const el = $('#priceStatus');
  if (!msg) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = msg;
  el.className = 'price-status' + (kind ? ' ' + kind : '');
}

let jsonpSeq = 0;
function jsonp(baseUrl, params) {
  return new Promise((resolve, reject) => {
    const cb = '__rakutenCb' + (++jsonpSeq);
    const qs = Object.keys(params).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    const script = document.createElement('script');
    let done = false;
    const cleanup = () => {
      done = true;
      delete window[cb];
      if (script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      if (done) return;
      cleanup();
      reject(new Error('時間内に応答がありませんでした。通信環境を確認してください。'));
    }, 15000);
    window[cb] = (data) => { if (done) return; cleanup(); resolve(data); };
    script.onerror = () => {
      if (done) return;
      cleanup();
      reject(new Error('取得できませんでした。アプリIDが正しいか確認してください。'));
    };
    script.src = baseUrl + '?' + qs + '&callback=' + cb;
    document.head.appendChild(script);
  });
}

async function fetchItems(keyword, hits) {
  const key = getKey();
  if (!key) throw new Error('アプリIDが未設定です。');
  const data = await jsonp(ENDPOINT, {
    applicationId: key, keyword: keyword, hits: hits || 20, sort: '+itemPrice', format: 'json'
  });
  if (data && data.error) {
    throw new Error('APIがエラーを返しました（' + data.error + '）：' +
      (data.error_description || 'アプリIDを確認してください。'));
  }
  return ((data && data.Items) || []).map((x) => {
    const o = x.Item || x;
    return {
      name: o.itemName || '',
      price: Number(o.itemPrice) || 0,
      url: o.itemUrl || '#',
      shop: o.shopName || '',
      image: (o.mediumImageUrls && o.mediumImageUrls[0] &&
              (o.mediumImageUrls[0].imageUrl || o.mediumImageUrls[0])) || ''
    };
  }).filter((o) => o.price > 0);
}

/** name を渡すと、誌面価格との比較と推移への記録も行う */
async function runSearch(keyword, partName) {
  if (!keyword) { status('製品名を入力するか、パーツを選んでください。', 'warn'); return; }
  if (!getKey()) { status('アプリIDが未設定です。下の比較サイトのボタンはIDなしで使えます。', 'warn'); return; }

  $('#btnLive').disabled = true;
  $('#btnPriceSearch').disabled = true;
  status('「' + keyword + '」の価格を取得しています…');
  $('#liveSummary').hidden = true;
  $('#priceResults').innerHTML = '';

  try {
    const list = await fetchItems(keyword, 20);
    if (!list.length) {
      status('「' + keyword + '」に一致する商品が見つかりませんでした。キーワードを変えてみてください。', 'warn');
      return;
    }
    status('');

    const prices = list.map((i) => i.price).sort((a, b) => a - b);
    const lo = prices[0];
    const mid = prices[Math.floor(prices.length / 2)];

    // 推移に記録する（誌面に載っている製品を選んだときだけ）
    let book = null;
    if (partName) {
      const p = ['cpu', 'gpu', 'mb', 'os', 'odd']
        .map((c) => ({ c: c, it: findItem(c, partName) })).find((x) => x.it);
      if (p) {
        book = p.it;
        if (window.Trend) {
          window.Trend.ensureWatch(partName);
          window.Trend.record(partName, p.c, lo, 'rakuten');
          window.Trend.refresh();
        }
      }
    }

    const sum = $('#liveSummary');
    sum.hidden = false;
    sum.innerHTML =
      '<div class="stats-body">' +
        '<div class="stat"><b></b><span>最安値</span></div>' +
        '<div class="stat"><b></b><span>中央値</span></div>' +
        '<div class="stat"><b></b><span>誌面価格との差</span></div>' +
      '</div><p class="live-note"></p>';
    const bs = $$('.stat b', sum);
    bs[0].textContent = yen(lo);
    bs[1].textContent = yen(mid);
    if (book) {
      const diff = lo - book.min;
      const pct = Math.round((diff / book.min) * 100);
      bs[2].textContent = (diff === 0 ? '±0' : (diff > 0 ? '+' : '−') + Math.abs(pct) + '%');
      bs[2].className = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
      $('.live-note', sum).textContent =
        '誌面（' + PRICE_ASOF + '）の掲載価格は ' + priceLabel(book) + '。最安値を「相場の推移」に記録しました。';
    } else {
      bs[2].textContent = '—';
      $('.live-note', sum).textContent =
        '楽天市場の検索結果 ' + list.length + '件より。送料・ポイントは含みません。';
    }

    const box = $('#priceResults');
    list.forEach((it) => {
      const a = document.createElement('a');
      a.className = 'price-item';
      a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.innerHTML = '<div class="pi-thumb"></div><div class="pi-body"><p class="pi-name"></p>' +
                    '<p class="pi-shop"></p></div><div class="pi-price"></div>';
      if (it.image) {
        const img = document.createElement('img');
        img.src = it.image; img.alt = ''; img.loading = 'lazy';
        $('.pi-thumb', a).appendChild(img);
      }
      $('.pi-name', a).textContent = it.name;
      $('.pi-shop', a).textContent = it.shop;
      $('.pi-price', a).textContent = yen(it.price);
      box.appendChild(a);
    });
  } catch (err) {
    status(err.message || '取得に失敗しました。', 'error');
  } finally {
    renderKeyState();
  }
}

async function testKey() {
  const v = $('#rakutenKey').value.trim() || getKey();
  if (!v) { renderKeyState('アプリIDを貼り付けてから押してください。', 'warn'); return; }
  setKey(v);
  renderKeyState('接続を確認しています…');
  try {
    const list = await fetchItems('Ryzen', 1);
    renderKeyState('接続できました（' + list.length + '件取得）。パーツを選んで「今の価格を調べる」を押してください。', 'ok');
  } catch (err) {
    renderKeyState('接続できませんでした：' + (err.message || ''), 'error');
  }
}

/* ============================== 初期化 ============================== */
window.initPrice = function () {
  $('#priceAsOf').textContent = PRICE_ASOF;
  // 誌面掲載価格の件数。メモリ・SSD・HDDは誌面に価格表が無いので数に入れない
  $('#priceItemCount').textContent =
    bookCats().reduce((s, k) => s + (PRICE_DATA[k] || []).length, 0);

  renderCats();
  renderBrands();
  renderLegend();
  renderChart();

  loadBuild();
  renderBuild();

  $('#rakutenKey').value = getKey();
  renderKeyState();

  $('#pgCats').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    G.cat = chip.dataset.pgcat;
    G.brands = [];
    renderCats(); renderBrands(); renderLegend(); renderChart();
  });

  $('#pgBrands').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    const b = chip.dataset.pgbrand;
    const i = G.brands.indexOf(b);
    if (i >= 0) G.brands.splice(i, 1); else G.brands.push(b);
    renderBrands(); renderChart();
  });

  $('.viz-filters').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    if (chip.dataset.gen) {
      $$('.viz-filters [data-gen]').forEach((c) => c.classList.toggle('is-on', c === chip));
      G.gen = chip.dataset.gen;
      renderChart();
    } else if (chip.dataset.psort) {
      $$('.viz-filters [data-psort]').forEach((c) => c.classList.toggle('is-on', c === chip));
      G.sort = chip.dataset.psort;
      renderChart();
    } else if (chip.dataset.pview) {
      G.view = G.view === 'chart' ? 'table' : 'chart';
      chip.classList.toggle('is-on', G.view === 'table');
      chip.textContent = G.view === 'table' ? 'グラフで見る' : '表で見る';
      $('#pgTableWrap').hidden = G.view !== 'table';
      $('#pgChart').hidden = G.view === 'table';
    }
  });

  $('#btnBuildReset').addEventListener('click', () => {
    if (!confirm('構成見積もりの選択をすべて消去します。よろしいですか？')) return;
    Object.keys(B).forEach((k) => delete B[k]);
    saveBuild();
    renderBuild();
  });

  $$('[data-site]').forEach((b) => b.addEventListener('click', () => openCompare(b.dataset.site)));

  $('#btnSaveKey').addEventListener('click', () => {
    setKey($('#rakutenKey').value.trim());
    renderKeyState();
    testKey();
  });
  $('#btnTestKey').addEventListener('click', testKey);
  $('#btnClearKey').addEventListener('click', () => {
    if (!confirm('保存したアプリIDを消去します。よろしいですか？')) return;
    setKey('');
    $('#rakutenKey').value = '';
    renderKeyState();
  });

  $('#btnLive').addEventListener('click', () => {
    const name = livePickName();
    if (!name) { status('パーツを選んでください。', 'warn'); return; }
    runSearch(name, name);
  });
  $('#btnPriceSearch').addEventListener('click', () => runSearch($('#priceInput').value.trim(), null));
  $('#priceInput').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') runSearch($('#priceInput').value.trim(), null);
  });
  $('#livePick').addEventListener('change', () => {
    const n = livePickName();
    if (n) $('#priceInput').value = n;
  });

  window.addEventListener('scroll', hideTip, { passive: true });

  // 推移モジュールに公開する
  window.Price = {
    fillLivePicker: (optsHtml) => { $('#livePick').innerHTML = optsHtml; }
  };
};

})();
