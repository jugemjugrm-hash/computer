/* ==========================================================================
   「表を覚える」画面
   ========================================================================== */
'use strict';

(function () {

const TBL_KEY = 'pcQuiz.tables.v1';

const T = {
  filter: 'all',
  table: null,
  mode: 'view',
  queue: [],      // 穴埋めの出題キュー [{r, c}]
  qi: 0,
  ok: 0,
  answered: false,
  revealed: 0     // 全消し暗唱で表示済みのマス数
};

/* ------------------------------ 成績の保存 ------------------------------ */
function loadTS() {
  try { return JSON.parse(localStorage.getItem(TBL_KEY)) || {}; } catch (e) { return {}; }
}
function saveTS() {
  try { localStorage.setItem(TBL_KEY, JSON.stringify(tstats)); } catch (e) { /* 続行 */ }
}
let tstats = loadTS();

/* -------------------------------- 小道具 -------------------------------- */
function cellCount(t) {
  return t.rows.length * (t.cols.length - 1);
}
function tblCatName(id) {
  const c = (window.App ? window.App.CATS : CATEGORIES).find((x) => x.id === id);
  return c ? c.icon + ' ' + c.name : id;
}
function rate(id) {
  const s = tstats[id];
  if (!s || !s.n) return null;
  return Math.round((s.ok / s.n) * 100);
}

/* ------------------------------- 一覧画面 ------------------------------- */
function renderFilter() {
  const cats = [];
  TABLES.forEach((t) => { if (!cats.includes(t.cat)) cats.push(t.cat); });
  const box = $('#tableCatFilter');
  box.innerHTML =
    '<button type="button" class="chip is-on" data-tfilter="all">すべて（' + TABLES.length + '）</button>' +
    cats.map((c) => {
      const n = TABLES.filter((t) => t.cat === c).length;
      return '<button type="button" class="chip" data-tfilter="' + c + '">' + tblCatName(c) + '（' + n + '）</button>';
    }).join('');
}

function renderList() {
  const box = $('#tableList');
  const list = TABLES.filter((t) => T.filter === 'all' || t.cat === T.filter);
  box.innerHTML = '';
  list.forEach((t) => {
    const r = rate(t.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'table-card';
    card.innerHTML =
      '<div class="tc-head">' +
        '<span class="badge">' + tblCatName(t.cat) + '</span>' +
        '<span class="page-ref">p.' + t.page + '</span>' +
      '</div>' +
      '<p class="tc-title"></p>' +
      '<div class="tc-foot">' +
        '<span class="tc-size">' + t.rows.length + '行 × ' + t.cols.length + '列（' + cellCount(t) + 'マス）</span>' +
        (r === null ? '<span class="tc-rate none">未挑戦</span>'
                    : '<span class="tc-rate' + (r >= 80 ? ' good' : '') + '">正答率 ' + r + '%</span>') +
      '</div>';
    $('.tc-title', card).textContent = t.title;
    card.addEventListener('click', () => openTable(t.id));
    box.appendChild(card);
  });
  if (!list.length) box.innerHTML = '<p class="review-empty">該当する表がありません。</p>';
}

/* ------------------------------ 個別の表 ------------------------------ */
function openTable(id) {
  T.table = TABLES.find((t) => t.id === id);
  if (!T.table) return;
  T.mode = 'view';
  $$('#tblModes .chip').forEach((c) => c.classList.toggle('is-on', c.dataset.tmode === 'view'));

  $('#tblCat').textContent = tblCatName(T.table.cat);
  $('#tblPage').textContent = '『自作PC完全マスター2026』p.' + T.table.page;
  $('#tblTitle').textContent = T.table.title;
  const note = $('#tblNote');
  note.textContent = T.table.note || '';
  note.hidden = !T.table.note;

  applyMode();
  window.App.showScreen('screenTable');
}

function applyMode() {
  const isFill = T.mode === 'fill';
  $('#tblWrap').hidden = isFill;
  $('#fillArea').hidden = !isFill;
  $('#reciteBtns').hidden = T.mode !== 'recite';

  if (T.mode === 'view') drawTable(false);
  else if (T.mode === 'recite') { T.revealed = 0; drawTable(true); updateReciteCount(); }
  else startFill();
}

/** hide=true なら key 列以外を伏せる（全消し暗唱） */
function drawTable(hide) {
  const t = T.table;
  const tbl = $('#tblView');
  let html = '<thead><tr>' + t.cols.map((c) => '<th></th>').join('') + '</tr></thead><tbody>';
  t.rows.forEach((row, ri) => {
    html += '<tr>' + row.map((cell, ci) =>
      ci === t.key ? '<th scope="row"></th>'
                   : '<td data-r="' + ri + '" data-c="' + ci + '"></td>').join('') + '</tr>';
  });
  html += '</tbody>';
  tbl.innerHTML = html;

  // textContent で流し込む（記号をそのまま表示するため）
  $$('#tblView thead th').forEach((th, i) => { th.textContent = t.cols[i]; });
  $$('#tblView tbody tr').forEach((tr, ri) => {
    Array.from(tr.children).forEach((cell, ci) => {
      if (ci === t.key) { cell.textContent = t.rows[ri][ci]; return; }
      if (hide) {
        cell.classList.add('is-hidden-cell');
        cell.textContent = '？';
        cell.addEventListener('click', () => {
          if (!cell.classList.contains('is-hidden-cell')) return;
          cell.classList.remove('is-hidden-cell');
          cell.classList.add('is-revealed');
          cell.textContent = t.rows[ri][ci];
          T.revealed++;
          updateReciteCount();
        });
      } else {
        cell.textContent = t.rows[ri][ci];
      }
    });
  });
}

function updateReciteCount() {
  $('#reciteCount').textContent = T.revealed + ' / ' + cellCount(T.table) + ' マス表示中';
}

/* ------------------------------ 穴埋めクイズ ------------------------------ */
function startFill() {
  const t = T.table;
  const cells = [];
  t.rows.forEach((row, r) => row.forEach((_, c) => { if (c !== t.key) cells.push({ r: r, c: c }); }));
  T.queue = window.App.shuffle(cells);
  T.qi = 0;
  T.ok = 0;
  T.finished = false;
  drawFill();
}

function distractors(t, cell, answer) {
  const seen = {};
  const pool = [];
  const push = (v) => {
    if (v === answer || seen[v]) return;
    seen[v] = 1;
    pool.push(v);
  };
  // まず同じ列の他の値から
  t.rows.forEach((row) => push(row[cell.c]));
  // 足りなければ表全体から
  if (pool.length < 3) t.rows.forEach((row) => row.forEach((v, ci) => { if (ci !== t.key) push(v); }));
  return window.App.shuffle(pool).slice(0, 3);
}

function drawFill() {
  const t = T.table;
  const cell = T.queue[T.qi];
  const answer = t.rows[cell.r][cell.c];
  T.answered = false;

  $('#fillProgress').style.width = (T.qi / T.queue.length * 100) + '%';
  $('#fillCounter').textContent = (T.qi + 1) + ' / ' + T.queue.length;
  $('#fillScore').textContent = '正解 ' + T.ok;
  $('#fillLabel').textContent = t.title;
  $('#fillQuestion').textContent =
    '「' + t.rows[cell.r][t.key] + '」×「' + t.cols[cell.c] + '」のマスに入るのは？';

  const opts = window.App.shuffle(distractors(t, cell, answer).concat([answer]));
  const box = $('#fillChoices');
  box.innerHTML = '';
  opts.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    btn.innerHTML = '<span class="key">' + 'ABCD'[i] + '</span><span class="txt"></span>';
    $('.txt', btn).textContent = text;
    btn.addEventListener('click', () => answerFill(btn, text === answer, opts.indexOf(answer)));
    box.appendChild(btn);
  });

  $('#fillFeedback').hidden = true;
  $('#fillFeedback').className = 'feedback';
  $('#btnFillNext').disabled = true;
  $('#btnFillNext').textContent = T.qi === T.queue.length - 1 ? '結果を見る' : '次へ';
}

function answerFill(btn, correct, answerIdx) {
  if (T.answered) return;
  T.answered = true;

  const btns = $$('#fillChoices .choice');
  btns.forEach((b) => { b.disabled = true; });
  btns[answerIdx].classList.add('is-correct');
  if (!correct) btn.classList.add('is-wrong');
  if (correct) T.ok++;

  const fb = $('#fillFeedback');
  fb.hidden = false;
  fb.className = 'feedback ' + (correct ? 'ok' : 'ng');
  $('#fillFbTitle').textContent = correct
    ? '正解！'
    : '不正解… 正解は「' + $('.txt', btns[answerIdx]).textContent + '」';

  const s = tstats[T.table.id] || (tstats[T.table.id] = { n: 0, ok: 0 });
  s.n++;
  if (correct) s.ok++;
  saveTS();

  $('#fillScore').textContent = '正解 ' + T.ok;
  $('#btnFillNext').disabled = false;
}

function nextFill() {
  if (T.finished) { startFill(); return; }   // 終了画面では「もう一周する」として働く
  if (!T.answered) return;
  if (T.qi < T.queue.length - 1) { T.qi++; drawFill(); return; }
  T.finished = true;

  const pct = Math.round((T.ok / T.queue.length) * 100);
  $('#fillProgress').style.width = '100%';
  const fb = $('#fillFeedback');
  fb.hidden = false;
  fb.className = 'feedback ' + (pct >= 80 ? 'ok' : '');
  $('#fillFbTitle').textContent =
    'この表の穴埋め終了：' + T.ok + ' / ' + T.queue.length + '（' + pct + '%）';
  $('#fillChoices').innerHTML = '';
  $('#fillQuestion').textContent = pct === 100
    ? '全マス正解です。完璧に覚えられています 🏆'
    : (pct >= 80 ? 'あと少しで完璧です。もう一周してみましょう 💪'
                 : 'まずは「表を見る」で全体を眺めてから、もう一度挑戦しましょう 📘');
  $('#btnFillNext').textContent = 'もう一周する';
  $('#btnFillNext').disabled = false;
  renderList();
}

/* ============================== 初期化 ============================== */
window.initTables = function () {
  $('#tableCount').textContent = TABLES.length;
  $('#tableCellCount').textContent = TABLES.reduce((s, t) => s + cellCount(t), 0);

  renderFilter();
  renderList();

  $('#tableCatFilter').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    $$('#tableCatFilter .chip').forEach((c) => c.classList.toggle('is-on', c === chip));
    T.filter = chip.dataset.tfilter;
    renderList();
  });

  $('#tblModes').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    $$('#tblModes .chip').forEach((c) => c.classList.toggle('is-on', c === chip));
    T.mode = chip.dataset.tmode;
    applyMode();
  });

  $('#btnReciteAll').addEventListener('click', () => {
    $$('#tblView td.is-hidden-cell').forEach((cell) => cell.click());
  });
  $('#btnReciteHide').addEventListener('click', () => {
    T.revealed = 0;
    drawTable(true);
    updateReciteCount();
  });

  $('#btnFillNext').addEventListener('click', nextFill);
  $('#btnFillQuit').addEventListener('click', () => {
    T.mode = 'view';
    $$('#tblModes .chip').forEach((c) => c.classList.toggle('is-on', c.dataset.tmode === 'view'));
    applyMode();
  });

  $('#btnTableViewPage').addEventListener('click', () => {
    if (T.table) window.App.openPage(T.table.page);
  });
  $('#btnTableBack').addEventListener('click', () => {
    renderList();
    window.App.showScreen('screenTables');
  });

  document.addEventListener('keydown', (ev) => {
    if (!$('#modal').hidden) return;
    if (!$('#screenTable').classList.contains('is-active') || T.mode !== 'fill') return;
    if (ev.key >= '1' && ev.key <= '4') {
      const b = $$('#fillChoices .choice')[Number(ev.key) - 1];
      if (b && !b.disabled) b.click();
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      if (!$('#btnFillNext').disabled) { ev.preventDefault(); $('#btnFillNext').click(); }
    }
  });
};

})();
