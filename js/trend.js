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
const SPAN_KEY  = 'pcQuiz.trendSpan';   /* 'day'（日ごと）か 'month'（月ごと） */
/* 同じ日に複数の取得元があるときの優先順位（自分で測った値を優先する） */
const PRIO = { manual: 3, rakuten: 2, feed: 1, book: 0 };
/* 初回に自動でウォッチへ入れる代表パーツ（空の画面を見せないため）。
   自分で外した場合は seeded フラグが立っているので勝手に戻さない */
const SEED_WATCH = ['Ryzen 7 9800X3D', 'Core Ultra 7 265K', 'RTX 5070', 'RX 9070 XT'];
const MAX_WATCH = 4;   // 折れ線は4系列まで（それ以上は線が重なって読めなくなる）

let store = { log: {}, watch: [] };

/* -------------------------------- 保存 -------------------------------- */
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(LOG_KEY));
    if (d && d.log) store = { log: d.log, watch: Array.isArray(d.watch) ? d.watch : [], seeded: !!d.seeded };
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
function ts(d) {
  // 'YYYY-MM'（月ごとの点）は月初として扱う
  const v = String(d).length === 7 ? d + '-01' : d;
  return new Date(v + 'T00:00:00').getTime();
}
function fmtDate(d) {
  const p = String(d).split('-');
  // 'YYYY-MM' は月ごとの点。'YYYY-MM-DD' は日ごとの点
  if (p.length < 3) return Number(p[0]) + '/' + Number(p[1]);
  return Number(p[1]) + '/' + Number(p[2]);
}
/** ツールチップの見出し。月ごとの点は「2026年8月」と出す */
function fmtFull(d) {
  const p = String(d).split('-');
  return p.length < 3 ? Number(p[0]) + '年' + Number(p[1]) + '月' : d;
}
function yen(n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); }

function feedHist(name) {
  const f = window.PRICE_FEED;
  if (!f || !f.items || !f.items[name]) return [];
  // 相場として見るので中央値(mid)を採用する。最安値(lo)は補足としてツールチップに出す
  return (f.items[name].hist || []).map((h) => ({ d: h.d, p: h.mid != null ? h.mid : h.lo, s: 'feed', n: h.n, lo: h.lo }));
}

/** 月ごとにまとめた記録。取得スクリプトが2年ぶん作っている。
    d は 'YYYY-MM'、p はその月の中央値、lo/hi はその月の最安と最高、n は記録できた日数 */
function feedMon(name) {
  const f = window.PRICE_FEED;
  if (!f || !f.items || !f.items[name]) return [];
  return (f.items[name].mon || []).map((h) =>
    ({ d: h.d, p: h.mid != null ? h.mid : h.lo, s: 'feed', n: h.n, lo: h.lo, hi: h.hi }));
}

/** 自分で手入力した記録を月ごとにまとめる（フィードの月次と粒度をそろえる） */
function monthlyOwn(rec) {
  const by = {};
  rec.forEach((r) => {
    const m = String(r.d).slice(0, 7);
    (by[m] || (by[m] = [])).push(r);
  });
  return Object.keys(by).sort().map((m) => {
    const ps = by[m].map((r) => r.p).sort((a, b) => a - b);
    const mid = ps[Math.floor(ps.length / 2)];
    // 誌面価格しか無い月は、誌面価格の点として扱う（白抜きで描き分けるため）
    const src = by[m].every((r) => r.s === 'book') ? 'book' : by[m][by[m].length - 1].s;
    return { d: m, p: mid, s: src, n: by[m].length, lo: ps[0], hi: ps[ps.length - 1] };
  });
}

/** 自分の記録とフィードを突き合わせ、1目盛り1点にまとめる。
    span が 'month' のときは月ごと（2年ぶん）、'day' のときは日ごと（直近90日ぶん）*/
function combined(name, span) {
  const map = {};
  // 日ごと：同じ日に複数の取得元があれば、自分で測った値を優先する。
  // 月ごと：その月に何日ぶん記録できたかを優先する。
  //         手入力1件がフィードのひと月ぶんの統計を押しのけてしまうのを防ぐ
  const better = span === 'month'
    ? (a, b) => ((a.n || 0) - (b.n || 0)) || ((PRIO[a.s] || 0) - (PRIO[b.s] || 0))
    : (a, b) => (PRIO[a.s] || 0) - (PRIO[b.s] || 0);
  const put = (r) => {
    const cur = map[r.d];
    if (!cur || better(r, cur) > 0) map[r.d] = r;
  };
  const own = (store.log[name] || {}).rec || [];
  if (span === 'month') {
    monthlyOwn(own).forEach(put);
    feedMon(name).forEach(put);
  } else {
    own.forEach(put);
    feedHist(name).forEach(put);
  }
  return Object.keys(map).sort().map((d) => map[d]);
}

function allParts() {
  const out = [];
  Object.keys(PRICE_GROUPS).forEach((cat) => {
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

/** いま選ばれている表示の粒度 */
function spanMode() {
  try {
    return localStorage.getItem(SPAN_KEY) === 'month' ? 'month' : 'day';
  } catch (e) { return 'day'; }
}
function setSpanMode(v) {
  try { localStorage.setItem(SPAN_KEY, v); } catch (e) { /* 表示は切り替わる */ }
}

function series(span) {
  return store.watch.map((name, i) => {
    return {
      name: name,
      slot: (i % 8) + 1,
      rec: combined(name, span)
    };
  });
}

function renderTrend() {
  let span = spanMode();
  // 月ごとを選んでいても、まだ月次の記録が2点に満たないときは日ごとに戻す
  if (span === 'month' && !store.watch.some((n) => feedMon(n).length >= 2
      || monthlyOwn((store.log[n] || {}).rec || []).length >= 2)) {
    span = 'day';
  }
  const ss = series(span);
  const box = $('#trendChart');
  const cap = $('#trendCaption');
  const foot = $('#trendFoot');
  const legend = $('#trendLegend');

  // 記録が1件だけの製品はまだ線を引けないので、凡例では薄く表示して区別する
  legend.innerHTML = ss.map((s) =>
    '<span class="lg-item' + (s.rec.length < 2 ? ' is-pending' : '') + '">' +
    '<i class="lg-swatch" style="background:var(--series-' + s.slot + ')"></i>' +
    s.name + '<em class="lg-val">' +
    (s.rec.length >= 2 ? s.rec.length + (span === 'month' ? 'ヶ月' : '件')
      : (s.rec.length === 1 ? '1件・線はまだ' : '記録なし')) +
    '</em></span>').join('');
  renderSpanTabs(span, ss);

  if (!ss.length) {
    cap.textContent = '';
    box.innerHTML = '<p class="review-empty">上のメニューからパーツを選んで「ウォッチに追加」すると、ここに推移が表示されます。</p>';
    foot.textContent = '';
    return;
  }

  const plot = ss.filter((s) => s.rec.length >= 2);
  if (!plot.length) {
    // 点が1つでは線が引けない。代わりに現状を表で示し、次に何をすればよいかを出す
    cap.textContent = 'ウォッチ中 ' + ss.length + ' 製品（実測値がまだありません）';
    const feedReady = !!(window.PRICE_FEED && window.PRICE_FEED.items &&
                         Object.keys(window.PRICE_FEED.items).length);
    let html = '<table class="data-table start-table"><thead><tr>' +
      '<th>製品</th><th>誌面価格</th><th>実測値</th></tr></thead><tbody>';
    html += ss.map(() => '<tr><th scope="row"></th><td class="num"></td><td class="num pending"></td></tr>').join('');
    html += '</tbody></table>';
    html += '<p class="start-note"></p>';
    box.innerHTML = html;
    $$('#trendChart tbody tr').forEach((tr, i) => {
      const rec = ss[i].rec[0];
      tr.children[0].textContent = ss[i].name;
      tr.children[1].textContent = rec ? yen(rec.p) : '—';
      tr.children[2].textContent = 'まだなし';
    });
    $('.start-note', box).textContent = feedReady
      ? '価格フィードは読み込めていますが、この製品のデータがまだありません。'
      : '価格フィードがまだ空です。GitHub の Actions タブで「価格を毎日取得する」を一度実行すると、'
        + '翌日以降この表が折れ線グラフに変わります。';
    foot.textContent = '線を引くには同じ製品の価格が2日ぶん必要です。誌面価格が1点目、最初の取得が2点目になります。';
    return;
  }

  // 軸の範囲
  const allRec = plot.reduce((a, s) => a.concat(s.rec), []);
  const pLo = Math.min.apply(null, allRec.map((r) => r.p));
  const pHi = Math.max.apply(null, allRec.map((r) => r.p));
  const padY = Math.max((pHi - pLo) * 0.15, pHi * 0.02, 500);
  const yLo = Math.max(0, Math.floor((pLo - padY) / 1000) * 1000);
  const yHi = Math.ceil((pHi + padY) / 1000) * 1000;

  // 横軸は「記録1件＝1目盛り」の等間隔にする。
  // 時間に比例させると、1点目の誌面価格（数ヶ月前）から毎日の記録までが
  // 右端に潰れてしまい、隣り合う日が重なって触り分けられなくなる
  const dates = Array.from(new Set(allRec.map((r) => r.d))).sort((a, b) => ts(a) - ts(b));
  const slot = {};
  dates.forEach((d, i) => { slot[d] = i; });
  const stepW = VW - PAD.l - PAD.r;
  const X = (d) => dates.length < 2 ? PAD.l + stepW / 2 : PAD.l + (slot[d] / (dates.length - 1)) * stepW;
  const Y = (p) => PAD.t + (1 - (p - yLo) / (yHi - yLo)) * (VH - PAD.t - PAD.b);

  // 目盛り
  let svg = '<svg viewBox="0 0 ' + VW + ' ' + VH + '" class="trend-svg" role="img" aria-label="価格の推移">';
  for (let i = 0; i <= 4; i++) {
    const v = yLo + ((yHi - yLo) * i) / 4;
    const y = Y(v);
    svg += '<line class="tr-grid" x1="' + PAD.l + '" y1="' + y.toFixed(1) + '" x2="' + (VW - PAD.r) + '" y2="' + y.toFixed(1) + '"/>';
    svg += '<text class="tr-ytick" x="' + (PAD.l - 8) + '" y="' + (y + 4).toFixed(1) + '">' + Math.round(v).toLocaleString('ja-JP') + '</text>';
  }
  // 最初と最後は必ず出し、間は等間隔に拾う。
  // 近すぎるラベルは間引く（スマホだと日付同士がくっついて読めなくなる）
  const want = Math.min(dates.length, 5);
  const picked = [];
  for (let i = 0; i < want; i++) {
    const d = dates[want === 1 ? 0 : Math.round((i * (dates.length - 1)) / (want - 1))];
    if (picked.indexOf(d) < 0) picked.push(d);
  }
  const MIN_GAP = 92;   // ラベル同士の最小間隔（viewBox 座標）
  const lastDate = dates[dates.length - 1];
  const ticks = [];
  picked.forEach((d) => {
    if (d === lastDate) { ticks.push(d); return; }
    const prev = ticks[ticks.length - 1];
    if (prev && X(d) - X(prev) < MIN_GAP) return;          // 前のラベルに近すぎる
    if (X(lastDate) - X(d) < MIN_GAP) return;              // 右端のラベルに近すぎる
    ticks.push(d);
  });
  ticks.forEach((d) => {
    // 両端のラベルは内側に寄せる。はみ出して切れるのを防ぐ
    const anchor = d === dates[0] ? 'start' : (d === dates[dates.length - 1] ? 'end' : 'middle');
    svg += '<text class="tr-xtick" style="text-anchor:' + anchor + '" x="' + X(d).toFixed(1) +
           '" y="' + (VH - 12) + '">' + fmtDate(d) + '</text>';
  });

  // 線と点（誌面掲載の点は白抜きにして、実測値と区別する）
  const ends = [];
  plot.forEach((s) => {
    const xy = (r) => X(r.d).toFixed(1) + ',' + Y(r.p).toFixed(1);
    // 1点目が誌面価格のときは、そこから最初の実測値までを破線で結ぶ。
    // 横軸は等間隔なので、この区間だけ数ヶ月あいていることを線で示す
    const gap = s.rec.length >= 2 && s.rec[0].s === 'book';
    if (gap) {
      svg += '<polyline class="tr-line is-gap" points="' + xy(s.rec[0]) + ' ' + xy(s.rec[1]) +
             '" style="stroke:var(--series-' + s.slot + ')"/>';
    }
    const solid = gap ? s.rec.slice(1) : s.rec;
    if (solid.length >= 2) {
      svg += '<polyline class="tr-line" points="' + solid.map(xy).join(' ') +
             '" style="stroke:var(--series-' + s.slot + ')"/>';
    }
    // 記録が増えると丸同士が重なって団子になる。
    // 多いときは誌面価格の点と最新の点だけ残し、あとは線で見せる
    const showAll = dates.length <= 30;
    s.rec.forEach((r, i) => {
      const keep = showAll || r.s === 'book' || i === s.rec.length - 1;
      if (!keep) return;
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
  // 両端の点はグラフのふちにあるので、押せる範囲を左右に少しはみ出させる
  const hitX = Math.max(0, PAD.l - 24);
  const hitW = Math.min(VW, VW - PAD.r + 24) - hitX;
  svg += '<rect class="tr-hit" x="' + hitX + '" y="' + PAD.t + '" width="' + hitW +
         '" height="' + (VH - PAD.t - PAD.b) + '" fill="transparent"/>';
  svg += '</svg>';
  box.innerHTML = svg;

  cap.textContent = '記録した価格の推移（' + plot.length + '製品・'
    + (span === 'month' ? '月ごと' : '日ごと') + '・'
    + fmtDate(dates[0]) + '〜' + fmtDate(dates[dates.length - 1]) + '）';
  foot.textContent = (span === 'month'
      ? '1点がひと月です（その月に記録した日の中央値）。2年ぶん残ります。'
      : '1点が1日です（直近90日ぶん）。それより前は「月ごと」に切り替えると見られます。')
    + '横軸は記録した分を等間隔に並べています（日数には比例しません。破線の区間は間があいています）。'
    + '縦軸は0から始まっていません（値動きを見やすくするため）。最初の点は誌面掲載価格、以降は調べた日の中央値です（外れ値を除いた相場）。';

  bindCrosshair(box, plot, dates, X);
}

/** 「日ごと／月ごと」の切り替え。月ごとの記録がまだ無いうちは出さない */
function renderSpanTabs(span, ss) {
  const box = $('#trendSpan');
  if (!box) return;
  const hasMon = store.watch.some((n) => feedMon(n).length >= 2)
    || ss.some((s) => monthlyOwn((store.log[s.name] || {}).rec || []).length >= 2);
  if (!hasMon) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  const tab = (v, label) => '<button type="button" class="chip' + (span === v ? ' is-on' : '') +
    '" data-span="' + v + '">' + label + '</button>';
  box.innerHTML = tab('day', '日ごと（直近90日）') + tab('month', '月ごと（2年）');
  $$('[data-span]', box).forEach((b) => {
    b.addEventListener('click', () => {
      setSpanMode(b.dataset.span);
      renderTrend();
    });
  });
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

function bindCrosshair(box, plot, dates, X) {
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
    $('.tip-date', t).textContent = fmtFull(best);
    const found = plot.filter((s) => s.rec.some((x) => x.d === best));
    $$('.tip-nm', t).forEach((el, i) => { el.textContent = found[i].name; });
    $$('.tip-pv', t).forEach((el, i) => {
      const r = found[i].rec.find((x) => x.d === best);
      if (r.hi != null && r.lo != null && r.hi !== r.lo) {
        // 月ごとの点。その月の中央値と、月内でどこまで振れたかを出す
        el.textContent = yen(r.p) + '（' + yen(r.lo) + '〜' + yen(r.hi) + '・' + (r.n || 0) + '日ぶん）';
      } else {
        el.textContent = yen(r.p) + (r.lo != null && r.lo !== r.p ? '（最安 ' + yen(r.lo) + '）' : '');
      }
    });
    t.hidden = false;
    const touch = ev.pointerType && ev.pointerType !== 'mouse';
    const ox = touch ? -t.offsetWidth / 2 : 14;
    // 指の上に出す。上端で置けないときだけ下に回す
    let ty;
    if (touch) {
      const above = ev.clientY - t.offsetHeight - 24;
      ty = above >= 8 ? above : ev.clientY + 32;
    } else {
      ty = ev.clientY + 16;
    }
    const x = Math.min(ev.clientX + ox, window.innerWidth - t.offsetWidth - 10);
    const y = Math.min(ty, window.innerHeight - t.offsetHeight - 10);
    t.style.left = Math.max(8, x) + 'px';
    t.style.top = Math.max(8, y) + 'px';
  };

  const clear = () => {
    if (tipEl) tipEl.hidden = true;
    cross.classList.add('is-off');
  };

  // マウスは乗せるだけで読めるが、指は「押しながら横に滑らせる」操作になる。
  // 縦スクロールは殺したくないので touch-action は pan-y にしてある（CSS側）
  let scrubbing = false;
  hit.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType !== 'mouse') { scrubbing = true; move(ev); }
  });
  hit.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'mouse' || scrubbing) move(ev);
  });
  hit.addEventListener('pointerup', () => { scrubbing = false; });
  hit.addEventListener('pointercancel', () => { scrubbing = false; clear(); });
  hit.addEventListener('pointerleave', (ev) => {
    if (ev.pointerType === 'mouse') clear();
  });
  // 指で読んだあと、画面を動かしたら消す
  window.addEventListener('scroll', () => { if (scrubbing) return; clear(); }, { passive: true });
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

  // 初回だけ代表パーツを入れておく（何も表示されない画面を避けるため）
  if (!store.seeded && !store.watch.length) {
    SEED_WATCH.forEach((n) => { if (findPart(n)) addWatch(n); });
    store.seeded = true;
    save();
    refresh();
  }

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
    store = { log: {}, watch: [], seeded: true };
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
