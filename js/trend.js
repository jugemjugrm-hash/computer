/* ==========================================================================
   相場の推移（折れ線グラフ）と価格の記録
   価格を調べるたびに記録が1点ずつ増え、2点以上でグラフになる。
   最初の1点は誌面掲載価格。過去の値動きのデータは持っていないため、
   記録していない期間は描かない。
   ========================================================================== */
'use strict';

(function () {

const LOG_KEY   = 'pcQuiz.priceLog.v1';
const FEED_KEY  = 'pcQuiz.feedUrl';
/* 同じ日に複数の取得元があるときの優先順位（自分で測った値を優先する） */
const PRIO = { manual: 3, rakuten: 2, feed: 1, book: 0 };
const MAX_WATCH = 4;   // 折れ線は4系列まで（それ以上は線が重なって読めなくなる）

let store = { log: {}, watch: [] };

/* -------------------------------- 保存 -------------------------------- */
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(LOG_KEY));
    if (d && d.log) store = { log: d.log, watch: Array.isArray(d.watch) ? d.watch : [] };
  } catch (e) { /* 初期状態で続行 */ }
}
function save() {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(store)); } catch (e) { /* 続行 */ }
}

/* -------------------------------- 小道具 -------------------------------- */
function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function bookDate() {
  // PRICE_ASOF は「2025年12月」形式
  const m = /(\d{4})年(\d{1,2})月/.exec(PRICE_ASOF);
  return m ? m[1] + '-' + String(m[2]).padStart(2, '0') + '-01' : '2025-12-01';
}
function ts(d) { return new Date(d + 'T00:00:00').getTime(); }
function fmtDate(d) {
  const p = d.split('-');
  return Number(p[1]) + '/' + Number(p[2]);
}
function yen(n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); }

function feedHist(name) {
  const f = window.PRICE_FEED;
  if (!f || !f.items || !f.items[name]) return [];
  return (f.items[name].hist || []).map((h) => ({ d: h.d, p: h.lo, s: 'feed', n: h.n }));
}

/** 自分の記録とフィードを日付で突き合わせ、1日1点にまとめる */
function combined(name) {
  const map = {};
  const put = (r) => {
    const cur = map[r.d];
    if (!cur || (PRIO[r.s] || 0) > (PRIO[cur.s] || 0)) map[r.d] = r;
  };
  const e = store.log[name];
  if (e) e.rec.forEach(put);
  feedHist(name).forEach(put);
  return Object.keys(map).sort((a, b) => ts(a) - ts(b)).map((d) => map[d]);
}

function allParts() {
  const out = [];
  ['cpu', 'gpu', 'mb', 'os', 'odd'].forEach((cat) => {
    (PRICE_DATA[cat] || []).forEach((it) => out.push({ n: it.n, cat: cat, item: it }));
  });
  return out;
}
function findPart(name) { return allParts().find((p) => p.n === name) || null; }

/* ------------------------------ 記録の操作 ------------------------------ */
/** 同じ日・同じ取得元の記録は上書きする */
function record(name, cat, date, price, src) {
  if (!name || !(price > 0)) return;
  const e = store.log[name] || (store.log[name] = { cat: cat || '', rec: [] });
  const i = e.rec.findIndex((r) => r.d === date && r.s === src);
  if (i >= 0) e.rec[i].p = price;
  else e.rec.push({ d: date, p: price, s: src });
  e.rec.sort((a, b) => ts(a.d) - ts(b.d));
  save();
}

/** ウォッチに追加すると、誌面価格を最初の1点として入れる */
function addWatch(name) {
  if (!name || store.watch.includes(name)) return false;
  if (store.watch.length >= MAX_WATCH) return 'full';
  store.watch.push(name);
  const p = findPart(name);
  if (p && p.item.min > 0) record(name, p.cat, bookDate(), p.item.min, 'book');
  save();
  return true;
}
function removeWatch(name) {
  const i = store.watch.indexOf(name);
  if (i >= 0) store.watch.splice(i, 1);
  save();
}

/* ============================== 折れ線グラフ ============================== */
const PAD = { l: 66, r: 84, t: 16, b: 34 };
const VW = 820, VH = 300;

function series() {
  return store.watch.map((name, i) => {
    return {
      name: name,
      slot: (i % 8) + 1,
      rec: combined(name)
    };
  });
}

function renderTrend() {
  const ss = series();
  const box = $('#trendChart');
  const cap = $('#trendCaption');
  const foot = $('#trendFoot');
  const legend = $('#trendLegend');

  legend.innerHTML = ss.map((s) =>
    '<span class="lg-item"><i class="lg-swatch" style="background:var(--series-' + s.slot + ')"></i>' +
    s.name + '<em class="lg-val">' + (s.rec.length ? s.rec.length + '件' : '記録なし') + '</em></span>').join('');

  if (!ss.length) {
    cap.textContent = '';
    box.innerHTML = '<p class="review-empty">上のメニューからパーツを選んで「ウォッチに追加」すると、ここに推移が表示されます。</p>';
    foot.textContent = '';
    return;
  }

  const plot = ss.filter((s) => s.rec.length >= 2);
  if (!plot.length) {
    cap.textContent = 'ウォッチ中 ' + ss.length + ' 製品';
    box.innerHTML = '<p class="review-empty">まだ記録が1件ずつしかありません。' +
      '「いまの価格を調べる」を実行するか、下の「価格を手で記録する」から2件目を入れるとグラフになります。</p>';
    foot.textContent = '';
    return;
  }

  // 軸の範囲
  const allRec = plot.reduce((a, s) => a.concat(s.rec), []);
  const t0 = Math.min.apply(null, allRec.map((r) => ts(r.d)));
  const t1 = Math.max.apply(null, allRec.map((r) => ts(r.d)));
  const span = Math.max(t1 - t0, 86400000);
  const pLo = Math.min.apply(null, allRec.map((r) => r.p));
  const pHi = Math.max.apply(null, allRec.map((r) => r.p));
  const padY = Math.max((pHi - pLo) * 0.15, pHi * 0.02, 500);
  const yLo = Math.max(0, Math.floor((pLo - padY) / 1000) * 1000);
  const yHi = Math.ceil((pHi + padY) / 1000) * 1000;

  const X = (d) => PAD.l + ((ts(d) - t0) / span) * (VW - PAD.l - PAD.r);
  const Y = (p) => PAD.t + (1 - (p - yLo) / (yHi - yLo)) * (VH - PAD.t - PAD.b);

  // 目盛り
  let svg = '<svg viewBox="0 0 ' + VW + ' ' + VH + '" class="trend-svg" role="img" aria-label="価格の推移">';
  for (let i = 0; i <= 4; i++) {
    const v = yLo + ((yHi - yLo) * i) / 4;
    const y = Y(v);
    svg += '<line class="tr-grid" x1="' + PAD.l + '" y1="' + y.toFixed(1) + '" x2="' + (VW - PAD.r) + '" y2="' + y.toFixed(1) + '"/>';
    svg += '<text class="tr-ytick" x="' + (PAD.l - 8) + '" y="' + (y + 4).toFixed(1) + '">' + Math.round(v).toLocaleString('ja-JP') + '</text>';
  }
  const dates = Array.from(new Set(allRec.map((r) => r.d))).sort((a, b) => ts(a) - ts(b));
  const xTicks = dates.length <= 5 ? dates : [dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]];
  xTicks.forEach((d) => {
    svg += '<text class="tr-xtick" x="' + X(d).toFixed(1) + '" y="' + (VH - 12) + '">' + fmtDate(d) + '</text>';
  });

  // 線と点（誌面掲載の点は白抜きにして、実測値と区別する）
  const ends = [];
  plot.forEach((s) => {
    const pts = s.rec.map((r) => X(r.d).toFixed(1) + ',' + Y(r.p).toFixed(1)).join(' ');
    svg += '<polyline class="tr-line" points="' + pts + '" style="stroke:var(--series-' + s.slot + ')"/>';
    s.rec.forEach((r) => {
      const style = r.s === 'book'
        ? 'fill:var(--surface);stroke:var(--series-' + s.slot + ')'
        : 'fill:var(--series-' + s.slot + ')';
      svg += '<circle class="tr-dot' + (r.s === 'book' ? ' is-book' : '') + '" cx="' + X(r.d).toFixed(1) +
             '" cy="' + Y(r.p).toFixed(1) + '" r="4.5" style="' + style + '"/>';
    });
    const last = s.rec[s.rec.length - 1];
    ends.push({ x: X(last.d) + 10, y: Y(last.p) + 4, t: Math.round(last.p).toLocaleString('ja-JP') });
  });

  // 終端ラベルが重なるときは縦にずらす（重ねて潰さない）
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  }
  ends.forEach((e) => {
    svg += '<text class="tr-endlabel" x="' + e.x.toFixed(1) + '" y="' + e.y.toFixed(1) + '">' + e.t + '</text>';
  });

  svg += '<line class="tr-cross is-off" x1="0" y1="' + PAD.t + '" x2="0" y2="' + (VH - PAD.b) + '"/>';
  svg += '<rect class="tr-hit" x="' + PAD.l + '" y="' + PAD.t + '" width="' + (VW - PAD.l - PAD.r) +
         '" height="' + (VH - PAD.t - PAD.b) + '" fill="transparent"/>';
  svg += '</svg>';
  box.innerHTML = svg;

  cap.textContent = '記録した価格の推移（' + plot.length + '製品・' + fmtDate(dates[0]) + '〜' + fmtDate(dates[dates.length - 1]) + '）';
  foot.textContent = '縦軸は0から始まっていません（値動きを見やすくするため）。最初の点は誌面掲載価格、以降は調べた日の最安値です。';

  bindCrosshair(box, plot, dates, X, t0, span);
}

/* ------------------------- クロスヘア＋ツールチップ ------------------------- */
let tipEl = null;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'viz-tip';
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function bindCrosshair(box, plot, dates, X, t0, span) {
  const svg = $('.trend-svg', box);
  const hit = $('.tr-hit', box);
  const cross = $('.tr-cross', box);
  if (!svg || !hit) return;

  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const vx = ((ev.clientX - r.left) / r.width) * VW;
    // 一番近い日付を選ぶ
    let best = dates[0], bd = Infinity;
    dates.forEach((d) => {
      const dist = Math.abs(X(d) - vx);
      if (dist < bd) { bd = dist; best = d; }
    });
    cross.setAttribute('x1', X(best).toFixed(1));
    cross.setAttribute('x2', X(best).toFixed(1));
    cross.classList.remove('is-off');

    const rows = plot.map((s) => {
      const rec = s.rec.find((x) => x.d === best);
      if (!rec) return '';
      return '<span class="tip-row"><i class="lg-swatch" style="background:var(--series-' + s.slot + ')"></i>' +
             '<span class="tip-nm"></span><b class="tip-pv"></b></span>';
    }).filter(Boolean);
    if (!rows.length) return;

    const t = tip();
    t.innerHTML = '<b class="tip-date"></b>' + rows.join('');
    $('.tip-date', t).textContent = best;
    const found = plot.filter((s) => s.rec.some((x) => x.d === best));
    $$('.tip-nm', t).forEach((el, i) => { el.textContent = found[i].name; });
    $$('.tip-pv', t).forEach((el, i) => {
      el.textContent = yen(found[i].rec.find((x) => x.d === best).p);
    });
    t.hidden = false;
    const x = Math.min(ev.clientX + 14, window.innerWidth - t.offsetWidth - 10);
    const y = Math.min(ev.clientY + 16, window.innerHeight - t.offsetHeight - 10);
    t.style.left = Math.max(8, x) + 'px';
    t.style.top = Math.max(8, y) + 'px';
  };

  hit.addEventListener('mousemove', move);
  hit.addEventListener('mouseleave', () => {
    if (tipEl) tipEl.hidden = true;
    cross.classList.add('is-off');
  });
}

/* ------------------------------ ウォッチ一覧 ------------------------------ */
function renderWatch() {
  const box = $('#watchList');
  if (!store.watch.length) {
    box.innerHTML = '<span class="field-note">ウォッチ中のパーツはありません（最大' + MAX_WATCH + '件）</span>';
    return;
  }
  box.innerHTML = store.watch.map((n) =>
    '<button type="button" class="chip watch-chip" data-unwatch="' + n.replace(/"/g, '&quot;') + '">' +
    n + ' <span class="watch-x">✕</span></button>').join('');
}

function renderPickers() {
  const opts = '<option value="">パーツを選ぶ…</option>' +
    Object.keys(PRICE_GROUPS).map((cat) => {
      const list = PRICE_DATA[cat] || [];
      return '<optgroup label="' + PRICE_GROUPS[cat].label + '">' +
        list.map((it) => '<option value="' + it.n.replace(/"/g, '&quot;') + '">' + it.n + '</option>').join('') +
        '</optgroup>';
    }).join('');
  $('#watchPick').innerHTML = opts;
  $('#logPart').innerHTML = opts;
  if (window.Price && window.Price.fillLivePicker) window.Price.fillLivePicker(opts);
}

/* ------------------------------ 記録の表 ------------------------------ */
function renderLogTable() {
  const rows = [];
  Object.keys(store.log).forEach((name) => {
    store.log[name].rec.forEach((r) => rows.push({ name: name, d: r.d, p: r.p, s: r.s }));
  });
  rows.sort((a, b) => ts(b.d) - ts(a.d) || a.name.localeCompare(b.name));

  const tbl = $('#logTable');
  if (!rows.length) {
    tbl.innerHTML = '<tbody><tr><td class="log-empty">まだ記録がありません。</td></tr></tbody>';
    return;
  }
  const srcName = { book: '誌面', rakuten: '楽天', manual: '手入力' };
  tbl.innerHTML = '<thead><tr><th>日付</th><th>製品名</th><th>価格</th><th>取得元</th><th></th></tr></thead><tbody>' +
    rows.map(() => '<tr><td></td><th scope="row"></th><td class="num"></td><td></td>' +
      '<td><button type="button" class="btn btn-ghost btn-sm log-del">削除</button></td></tr>').join('') + '</tbody>';
  $$('#logTable tbody tr').forEach((tr, i) => {
    const c = tr.children;
    c[0].textContent = rows[i].d;
    c[1].textContent = rows[i].name;
    c[2].textContent = yen(rows[i].p);
    c[3].textContent = srcName[rows[i].s] || rows[i].s;
    $('.log-del', tr).addEventListener('click', () => {
      const e = store.log[rows[i].name];
      if (!e) return;
      const k = e.rec.findIndex((r) => r.d === rows[i].d && r.s === rows[i].s);
      if (k >= 0) e.rec.splice(k, 1);
      if (!e.rec.length) delete store.log[rows[i].name];
      save();
      refresh();
    });
  });
}

function refresh() {
  renderWatch();
  renderTrend();
  renderLogTable();
}

/* ============================== 価格フィード ============================== */
function getFeedUrl() { try { return localStorage.getItem(FEED_KEY) || ''; } catch (e) { return ''; } }
function setFeedUrl(v) { try { localStorage.setItem(FEED_KEY, v); } catch (e) { /* 続行 */ } }

function renderFeedState(msg, kind) {
  const el = $('#feedState');
  if (!el) return;
  if (msg) { el.textContent = msg; el.className = 'feed-state ' + (kind || ''); return; }
  const f = window.PRICE_FEED;
  if (!getFeedUrl()) { el.textContent = '未設定'; el.className = 'feed-state'; return; }
  if (f && f.items && Object.keys(f.items).length) {
    el.textContent = Object.keys(f.items).length + '製品・最終更新 ' + (f.updated || '不明');
    el.className = 'feed-state ok';
  } else {
    el.textContent = '読み込み済み（データなし）';
    el.className = 'feed-state warn';
  }
}

/** フィードは <script> で読み込む。file:// から開いてもCORSに引っかからない */
function loadFeed(url) {
  return new Promise((resolve, reject) => {
    if (!url) { resolve(false); return; }
    const sc = document.createElement('script');
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      sc.remove();
      reject(new Error('読み込みに時間がかかりすぎました。URLを確認してください。'));
    }, 15000);
    sc.onload = () => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolve(true);
    };
    sc.onerror = () => {
      if (done) return;
      done = true; clearTimeout(timer); sc.remove();
      reject(new Error('読み込めませんでした。URLが正しいか、Pagesが公開済みか確認してください。'));
    };
    // 毎回取り直したいのでキャッシュ回避のパラメータを付ける
    sc.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
    document.head.appendChild(sc);
  });
}

async function applyFeed(url, announce) {
  if (announce) renderFeedState('読み込んでいます…');
  try {
    await loadFeed(url);
    renderFeedState();
    refresh();
  } catch (err) {
    renderFeedState(err.message || '読み込めませんでした。', 'error');
  }
}

/* ============================== 初期化 ============================== */
window.initTrend = function () {
  load();
  $$('.asof-inline').forEach((el) => { el.textContent = PRICE_ASOF; });
  renderPickers();
  $('#logDate').value = today();
  refresh();

  const feedUrl = getFeedUrl();
  $('#feedUrl').value = feedUrl;
  renderFeedState();
  if (feedUrl) applyFeed(feedUrl, false);

  $('#btnFeedSave').addEventListener('click', () => {
    const v = $('#feedUrl').value.trim();
    setFeedUrl(v);
    if (!v) { renderFeedState(); refresh(); return; }
    applyFeed(v, true);
  });

  $('#btnWatchAdd').addEventListener('click', () => {
    const v = $('#watchPick').value;
    if (!v) return;
    const r = addWatch(v);
    if (r === 'full') { alert('ウォッチできるのは' + MAX_WATCH + '件までです。折れ線が重なって読めなくなるため制限しています。'); return; }
    $('#watchPick').value = '';
    refresh();
  });

  $('#watchList').addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-unwatch]');
    if (!chip) return;
    removeWatch(chip.dataset.unwatch);
    refresh();
  });

  $('#btnLogAdd').addEventListener('click', () => {
    const name = $('#logPart').value;
    const date = $('#logDate').value || today();
    const price = Number($('#logPrice').value);
    if (!name) { alert('パーツを選んでください。'); return; }
    if (!(price > 0)) { alert('価格を入力してください。'); return; }
    const p = findPart(name);
    record(name, p ? p.cat : '', date, price, 'manual');
    if (!store.watch.includes(name)) addWatch(name);
    $('#logPrice').value = '';
    refresh();
  });

  $('#btnLogReset').addEventListener('click', () => {
    if (!confirm('記録した価格をすべて消去します。よろしいですか？')) return;
    store = { log: {}, watch: [] };
    save();
    refresh();
  });

  window.addEventListener('scroll', () => { if (tipEl) tipEl.hidden = true; }, { passive: true });

  // 価格取得モジュールから記録できるように公開する
  window.Trend = {
    record: (name, cat, price, src) => { record(name, cat, today(), price, src || 'rakuten'); },
    ensureWatch: (name) => { if (!store.watch.includes(name)) addWatch(name); },
    refresh: refresh,
    has: (name) => !!store.log[name]
  };
};

})();
