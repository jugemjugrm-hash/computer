/* ==========================================================================
   「用語辞典」画面と、用語クイズ
   クイズは「用語→意味（t2m）」と「意味→用語（m2t）」の2方向を別の問題として扱い、
   どちらの向きで覚えたかを語ごとに記録する
   ========================================================================== */
'use strict';

(function () {

const GL_KEY = 'pcQuiz.gloss.v1';

/** 向きの表示名。クイズの見出しと成績表で共通に使う */
const DIRS = {
  t2m: { label: '用語 → 意味', icon: '📖' },
  m2t: { label: '意味 → 用語', icon: '💡' }
};

const G = {
  search: '',
  cat: 'all',
  sort: 'cat',
  dir: 'both',
  scope: 'all',
  count: 10,
  mode: 'choice',
  term: null,       // 詳細表示中の用語
  back: 'list',     // 詳細から戻る先（一覧／クイズ／結果）
  list: [],         // いま一覧に出ている語（前後移動に使う）
  quiz: [],         // [{ term, dir, choices, answer }]
  qi: 0,
  ok: 0,
  answers: [],      // [{ term, dir, correct, picked }]
  answered: false,
  revealed: false,
  lastWrong: []
};

/* ------------------------------ 記録の保存 ------------------------------ */
function loadGS() {
  try {
    const s = JSON.parse(localStorage.getItem(GL_KEY));
    return s && typeof s === 'object' ? s : {};
  } catch (e) { return {}; }
}
function saveGS() {
  try { localStorage.setItem(GL_KEY, JSON.stringify(gstats)); } catch (e) { /* 続行 */ }
}
let gstats = loadGS();

/** その語・その向きの記録。無ければ作る */
function rec(term, dir) {
  const e = gstats[term] || (gstats[term] = {});
  return e[dir] || (e[dir] = { n: 0, ok: 0, miss: 0, streak: 0 });
}
/** 記録を読むだけ（空の記録を作らない） */
function peek(term, dir) {
  const e = gstats[term];
  return (e && e[dir]) || null;
}
function isLearned(term, dir) {
  const r = peek(term, dir);
  return !!(r && r.ok > 0);
}
function isWeak(term, dir) {
  const r = peek(term, dir);
  return !!(r && r.miss > 0 && r.streak === 0);
}

/* -------------------------------- 小道具 -------------------------------- */
function byTerm(t) { return GLOSSARY.find((g) => g.t === t); }

function gcat(id) {
  const c = GLOSSARY_CATS.find((x) => x.id === id);
  return c ? c.icon + ' ' + c.name : id;
}
function catOrder(id) {
  const i = GLOSSARY_CATS.findIndex((x) => x.id === id);
  return i < 0 ? 99 : i;
}
/** 検索語に当てはまるか。用語・よみ・英語・一行定義・解説のどこでも拾う */
function hits(g, q) {
  if (!q) return true;
  const hay = (g.t + ' ' + g.y + ' ' + (g.e || '') + ' ' + g.s + ' ' + g.d).toLowerCase();
  return q.split(/\s+/).every((w) => hay.indexOf(w) >= 0);
}

function filtered() {
  const q = G.search.trim().toLowerCase();
  const list = GLOSSARY.filter((g) => (G.cat === 'all' || g.cat === G.cat) && hits(g, q));
  const kana = (a, b) => a.y.localeCompare(b.y, 'ja');
  if (G.sort === 'kana') return list.slice().sort(kana);
  return list.slice().sort((a, b) => (catOrder(a.cat) - catOrder(b.cat)) || kana(a, b));
}

/* ============================== 一覧画面 ============================== */
function renderCatFilter() {
  const box = $('#glossCatFilter');
  box.innerHTML =
    '<button type="button" class="chip is-on" data-gcat="all">すべて（' + GLOSSARY.length + '）</button>' +
    GLOSSARY_CATS.map((c) => {
      const n = GLOSSARY.filter((g) => g.cat === c.id).length;
      return '<button type="button" class="chip" data-gcat="' + c.id + '">' + c.icon + ' ' + c.name + '（' + n + '）</button>';
    }).join('');
}

function renderList() {
  const list = filtered();
  G.list = list;
  const box = $('#glossList');
  box.innerHTML = '';

  $('#glossHit').textContent = list.length === GLOSSARY.length
    ? GLOSSARY.length + ' 語すべてを表示しています'
    : '該当 ' + list.length + ' 語 ／ 全 ' + GLOSSARY.length + ' 語';

  if (!list.length) {
    box.innerHTML = '<p class="review-empty">該当する用語がありません。別の言葉で探してみてください。</p>';
    return;
  }

  let lastCat = null;
  list.forEach((g) => {
    if (G.sort === 'cat' && g.cat !== lastCat) {
      lastCat = g.cat;
      const h = document.createElement('h3');
      h.className = 'gloss-group';
      h.textContent = gcat(g.cat);
      box.appendChild(h);
    }
    const both = isLearned(g.t, 't2m') && isLearned(g.t, 'm2t');
    const half = isLearned(g.t, 't2m') || isLearned(g.t, 'm2t');
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'gloss-card' + (both ? ' is-done' : (half ? ' is-half' : ''));
    card.innerHTML =
      '<span class="gc-head">' +
        '<span class="gc-term"></span>' +
        '<span class="gc-mark">' + (both ? '◎' : (half ? '○' : '')) + '</span>' +
      '</span>' +
      '<span class="gc-read"></span>' +
      '<span class="gc-sum"></span>';
    $('.gc-term', card).textContent = g.t;
    $('.gc-read', card).textContent = g.e ? g.y + '／' + g.e : g.y;
    $('.gc-sum', card).textContent = g.s;
    card.addEventListener('click', () => openTerm(g.t, 'list'));
    box.appendChild(card);
  });
}

function renderProgress() {
  const total = GLOSSARY.length;
  const rows = [
    { key: 't2m', n: GLOSSARY.filter((g) => isLearned(g.t, 't2m')).length },
    { key: 'm2t', n: GLOSSARY.filter((g) => isLearned(g.t, 'm2t')).length }
  ];
  const done = GLOSSARY.filter((g) => isLearned(g.t, 't2m') && isLearned(g.t, 'm2t')).length;

  $('#glossProgress').innerHTML = rows.map((r) => {
    const pct = Math.round((r.n / total) * 100);
    return '<div class="gp-row">' +
      '<span class="gp-label">' + DIRS[r.key].icon + ' ' + DIRS[r.key].label + '</span>' +
      '<span class="gp-bar"><i style="width:' + pct + '%"></i></span>' +
      '<span class="gp-num">' + r.n + ' / ' + total + '</span>' +
    '</div>';
  }).join('') +
  '<p class="field-note">両方の向きで正解できた用語： <b>' + done + '</b> / ' + total + ' 語' +
    (done === total ? '（全語制覇です 🏆）' : '') + '</p>';

  // 出題範囲の見出しに、いま何問ぶんあるかを出す
  const n = pool().length;
  const empty = { all: '出題できる問題がありません（分野の絞り込みを見直してください）',
                  new: 'まだ正解していないものはありません。すべて正解済みです 🏆',
                  weak: '間違えたまま残っているものはありません' }[G.scope];
  $('#glossScopeNote').textContent = n ? 'いまの条件で ' + n + ' 問を出題できます' : empty;
  $('#btnGlossStart').disabled = n === 0;
}

/* ============================== 語の詳細 ============================== */
function openTerm(t, from) {
  const g = byTerm(t);
  if (!g) return;
  G.term = t;
  if (from) G.back = from;

  $('#gtCat').textContent = gcat(g.cat);
  const pg = $('#gtPage');
  pg.textContent = g.page ? '『自作PC完全マスター2026』p.' + g.page : '';
  pg.hidden = !g.page;
  $('#btnGtPage').hidden = !g.page;

  $('#gtTerm').textContent = g.t;
  $('#gtRead').textContent = g.e ? g.y + '／' + g.e : g.y;
  $('#gtSum').textContent = g.s;
  $('#gtDesc').textContent = g.d;

  const rel = (g.rel || []).filter(byTerm);
  $('#gtRelHead').hidden = rel.length === 0;
  const box = $('#gtRel');
  box.innerHTML = '';
  rel.forEach((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = r;
    b.addEventListener('click', () => openTerm(r));
    box.appendChild(b);
  });

  const a = peek(g.t, 't2m');
  const b = peek(g.t, 'm2t');
  const one = (r) => (r && r.n ? r.ok + '/' + r.n + '回正解' : '未挑戦');
  $('#gtStat').textContent = 'クイズの記録： 用語→意味 ' + one(a) + ' ／ 意味→用語 ' + one(b);

  // 関連語をたどって一覧の外に出た場合は、辞典全体を並べ直して前後移動を続けられるようにする
  if (!G.list.some((x) => x.t === t)) {
    G.list = filtered();
    if (!G.list.some((x) => x.t === t)) {
      G.list = GLOSSARY.slice().sort((a, b) =>
        (catOrder(a.cat) - catOrder(b.cat)) || a.y.localeCompare(b.y, 'ja'));
    }
  }
  const i = G.list.findIndex((x) => x.t === t);
  $('#btnGtPrev').disabled = i <= 0;
  $('#btnGtNext').disabled = i < 0 || i >= G.list.length - 1;

  const back = { quiz: '← クイズに戻る', result: '← 結果に戻る' }[G.back] || '← 辞典の一覧へ戻る';
  $('#btnGtBack').textContent = back;

  window.App.showScreen('screenGlossTerm');
}

function stepTerm(d) {
  const i = G.list.findIndex((x) => x.t === G.term);
  const next = G.list[i + d];
  if (next) openTerm(next.t);
}

/* ============================== 用語クイズ ============================== */
/** いまの設定で出題できる問題の一覧 */
function pool() {
  const base = GLOSSARY.filter((g) => G.cat === 'all' || g.cat === G.cat);
  const dirs = G.dir === 'both' ? ['t2m', 'm2t'] : [G.dir];
  const out = [];
  base.forEach((g) => {
    dirs.forEach((d) => {
      if (G.scope === 'new' && isLearned(g.t, d)) return;
      if (G.scope === 'weak' && !isWeak(g.t, d)) return;
      out.push({ term: g.t, dir: d });
    });
  });
  return out;
}

/** 誤答の候補。まず同じ分野から、足りなければ全体から集める */
function distract(g, dir) {
  const pick = (x) => (dir === 't2m' ? x.s : x.t);
  const answer = pick(g);
  const seen = {};
  seen[answer] = 1;
  const take = (src) => {
    const out = [];
    window.App.shuffle(src).forEach((x) => {
      const v = pick(x);
      if (seen[v]) return;
      seen[v] = 1;
      out.push(v);
    });
    return out;
  };
  const same = take(GLOSSARY.filter((x) => x.cat === g.cat && x.t !== g.t));
  const rest = same.length >= 3 ? [] : take(GLOSSARY.filter((x) => x.cat !== g.cat));
  return same.concat(rest).slice(0, 3);
}

function buildQuiz(src) {
  const items = window.App.shuffle(src);
  const n = G.count > 0 ? Math.min(G.count, items.length) : items.length;
  G.quiz = items.slice(0, n).map((it) => {
    const g = byTerm(it.term);
    const answer = it.dir === 't2m' ? g.s : g.t;
    const opts = window.App.shuffle(distract(g, it.dir).concat([answer]));
    return { term: it.term, dir: it.dir, choices: opts, answer: opts.indexOf(answer) };
  });
  G.qi = 0;
  G.ok = 0;
  G.answers = [];
  drawQ();
  window.App.showScreen('screenGlossQuiz');
}

function startQuiz() {
  const src = pool();
  if (!src.length) return;
  G.back = 'quiz';
  buildQuiz(src);
}

function drawQ() {
  const item = G.quiz[G.qi];
  const g = byTerm(item.term);
  G.answered = false;
  G.revealed = false;

  $('#gqProgress').style.width = (G.qi / G.quiz.length * 100) + '%';
  $('#gqCounter').textContent = (G.qi + 1) + ' / ' + G.quiz.length;
  $('#gqScore').textContent = '正解 ' + G.ok;
  $('#gqCat').textContent = gcat(g.cat);
  $('#gqDir').textContent = DIRS[item.dir].icon + ' ' + DIRS[item.dir].label;
  const pg = $('#gqPage');
  pg.textContent = g.page ? 'p.' + g.page : '';
  pg.hidden = !g.page;

  const isRecall = G.mode === 'recall';
  // 一問一答は選択肢から選ぶわけではないので、設問の言い方を変える
  $('#gqText').textContent = item.dir === 't2m'
    ? '「' + g.t + '」の意味は？' + (isRecall ? '' : '（もっとも適切なもの）')
    : '次の説明にあてはまる用語は？　「' + g.s + '」';

  $('#gqChoices').hidden = isRecall;
  $('#gqRecall').hidden = !isRecall;
  $('#gqRecallAnswer').hidden = true;
  $('#btnGqReveal').hidden = false;
  $('#gqGrade').hidden = true;
  $('#gqFeedback').hidden = true;
  $('#gqFeedback').className = 'feedback';
  $('#btnGqNext').disabled = true;
  $('#btnGqNext').textContent = G.qi === G.quiz.length - 1 ? '結果を見る' : '次へ';
  $('#gqHint').innerHTML = isRecall
    ? 'キーボード： <kbd>Enter</kbd> で答えを表示 / <kbd>1</kbd> 思い出せた・<kbd>2</kbd> 思い出せなかった'
    : 'キーボード： <kbd>1</kbd>〜<kbd>4</kbd> で解答 / <kbd>Enter</kbd> で次へ';

  if (isRecall) {
    $('#gqChoices').innerHTML = '';
    $('#gqRecallText').textContent = item.dir === 't2m' ? g.s : g.t;
    return;
  }

  const box = $('#gqChoices');
  box.innerHTML = '';
  item.choices.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    btn.innerHTML = '<span class="key">' + 'ABCD'[i] + '</span><span class="txt"></span>';
    $('.txt', btn).textContent = text;
    btn.addEventListener('click', () => answer(i));
    box.appendChild(btn);
  });
}

function reveal() {
  if (G.revealed) return;
  G.revealed = true;
  $('#btnGqReveal').hidden = true;
  $('#gqRecallAnswer').hidden = false;
  $('#gqGrade').hidden = false;
}

/** 記録を更新し、この向きを初めて正解したかを返す */
function mark(term, dir, correct) {
  const r = rec(term, dir);
  const first = correct && r.ok === 0;
  r.n++;
  if (correct) { r.ok++; r.streak++; }
  else { r.miss++; r.streak = 0; }
  saveGS();
  return first;
}

function finishOne(correct, picked) {
  const item = G.quiz[G.qi];
  const g = byTerm(item.term);
  G.answered = true;
  if (correct) G.ok++;
  const first = mark(item.term, item.dir, correct);
  G.answers.push({ term: item.term, dir: item.dir, correct: correct, picked: picked, first: first });

  const fb = $('#gqFeedback');
  fb.hidden = false;
  fb.className = 'feedback ' + (correct ? 'ok' : 'ng');
  $('#gqFbTitle').textContent = correct
    ? (first ? '正解！ この向きで初めて正解しました 🎉' : '正解！')
    : '不正解… 正解は「' + (item.dir === 't2m' ? g.s : g.t) + '」';
  // 4択でもここで詳しい解説まで読める
  $('#gqFbText').textContent = (item.dir === 'm2t' ? g.t + '（' + g.y + '）… ' : '') + g.d;
  $('#gqScore').textContent = '正解 ' + G.ok;
  $('#btnGqNext').disabled = false;
  renderProgress();
}

function answer(i) {
  if (G.answered) return;
  const item = G.quiz[G.qi];
  const btns = $$('#gqChoices .choice');
  btns.forEach((b) => { b.disabled = true; });
  btns[item.answer].classList.add('is-correct');
  if (i !== item.answer) btns[i].classList.add('is-wrong');
  finishOne(i === item.answer, i);
}

function selfGrade(okFlag) {
  if (!G.revealed || G.answered) return;
  $('#gqGrade').hidden = true;
  finishOne(okFlag, -1);
}

function next() {
  if (!G.answered) return;
  if (G.qi < G.quiz.length - 1) { G.qi++; drawQ(); return; }
  showResult();
}

/* ============================== 結果画面 ============================== */
/** 分野別・向き別の成績バー。クイズ画面の cat-row と同じ見た目にそろえる */
function barRows(map, label) {
  return Object.keys(map).map((k) => {
    const v = map[k];
    const p = Math.round((v.ok / v.n) * 100);
    return '<div class="cat-row">' +
             '<div class="cat-row-head"><span>' + label(k) + '</span>' +
             '<span>' + v.ok + '/' + v.n + '（' + p + '%）</span></div>' +
             '<div class="bar"><i style="width:' + p + '%"></i></div>' +
           '</div>';
  }).join('');
}

function showResult() {
  const total = G.quiz.length;
  const pct = total ? Math.round((G.ok / total) * 100) : 0;

  $('#gqPct').textContent = pct + '%';
  $('#gqFrac').textContent = G.ok + ' / ' + total;
  $('#gqRing').style.background =
    'conic-gradient(var(--accent) ' + (pct * 3.6) + 'deg, var(--surface-2) 0deg)';

  let msg;
  if (pct === 100) msg = '全問正解！ 意味と言葉が完全に結びついています 🏆';
  else if (pct >= 80) msg = 'すばらしい。しっかり身についています 🎉';
  else if (pct >= 60) msg = 'あと少し。間違えた用語を辞典で読み直しましょう 💪';
  else if (pct >= 40) msg = '解説を読んでから、もう一周してみましょう 📘';
  else msg = 'まずは辞典を眺めて、全体の見当をつけましょう 🔰';
  $('#gqComment').textContent = msg;

  const firsts = G.answers.filter((a) => a.first).length;
  const gn = $('#gqGrowth');
  gn.hidden = firsts === 0;
  if (firsts) gn.textContent = '🌱 ' + firsts + ' 件を初めて正解しました（網羅状況が進みました）';

  const byDir = {}, byCat = {};
  G.answers.forEach((a) => {
    const g = byTerm(a.term);
    (byDir[a.dir] = byDir[a.dir] || { ok: 0, n: 0 }).n++;
    (byCat[g.cat] = byCat[g.cat] || { ok: 0, n: 0 }).n++;
    if (a.correct) { byDir[a.dir].ok++; byCat[g.cat].ok++; }
  });
  $('#gqDirResult').innerHTML = barRows(byDir, (k) => DIRS[k].icon + ' ' + DIRS[k].label);
  $('#gqCatResult').innerHTML = barRows(byCat, gcat);

  const list = $('#gqReview');
  list.innerHTML = '';
  G.lastWrong = [];
  G.answers.forEach((a, i) => {
    if (a.correct) return;
    const item = G.quiz[i];
    const g = byTerm(a.term);
    G.lastWrong.push({ term: a.term, dir: a.dir });

    const div = document.createElement('div');
    div.className = 'review-item';
    div.innerHTML =
      '<p class="review-q"></p>' +
      (a.picked >= 0 ? '<p class="review-a ng"><span class="lbl">あなた</span><span class="val"></span></p>' : '') +
      '<p class="review-a ok"><span class="lbl">正解</span><span class="val"></span></p>' +
      '<p class="review-e"></p>';
    $('.review-q', div).textContent = DIRS[a.dir].label + '： ' +
      (a.dir === 't2m' ? '「' + g.t + '」の意味は？' : '「' + g.s + '」にあたる用語は？');
    const vals = div.querySelectorAll('.val');
    if (a.picked >= 0) {
      vals[0].textContent = item.choices[a.picked];
      vals[1].textContent = item.choices[item.answer];
    } else {
      vals[0].textContent = item.choices[item.answer];
    }
    $('.review-e', div).textContent = g.d;

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-ghost btn-sm';
    b.textContent = '📚 辞典で読む';
    b.onclick = () => openTerm(g.t, 'result');
    div.appendChild(b);
    list.appendChild(div);
  });
  if (!G.lastWrong.length) list.innerHTML = '<p class="review-empty">間違いはありませんでした。お見事！</p>';

  $('#btnGqRetryWrong').disabled = G.lastWrong.length === 0;
  renderProgress();
  renderList();
  window.App.showScreen('screenGlossResult');
}

/* ============================== 初期化 ============================== */
function bindChips(sel, key, apply) {
  $(sel).addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    $$(sel + ' .chip').forEach((c) => c.classList.toggle('is-on', c === chip));
    apply(chip.dataset[key]);
  });
}

window.initGlossary = function () {
  $('#glossCount').textContent = GLOSSARY.length;
  $('#glossCatCount').textContent = GLOSSARY_CATS.length;
  $('#glossRelCount').textContent = GLOSSARY.reduce((s, g) => s + (g.rel || []).length, 0);
  $('#glossQTotal').textContent = GLOSSARY.length;
  $('#glossQPairs').textContent = GLOSSARY.length * 2;

  renderCatFilter();
  renderList();
  renderProgress();

  $('#glossSearch').addEventListener('input', (ev) => {
    G.search = ev.target.value;
    renderList();
  });
  $('#btnGlossClear').addEventListener('click', () => {
    G.search = '';
    $('#glossSearch').value = '';
    renderList();
  });

  bindChips('#glossSort', 'gsort', (v) => { G.sort = v; renderList(); });
  bindChips('#glossCatFilter', 'gcat', (v) => { G.cat = v; renderList(); renderProgress(); });
  bindChips('#glossDir', 'gdir', (v) => { G.dir = v; renderProgress(); });
  bindChips('#glossScope', 'gscope', (v) => { G.scope = v; renderProgress(); });
  bindChips('#glossCountPick', 'gcount', (v) => { G.count = Number(v); });
  bindChips('#glossMode', 'gmode', (v) => { G.mode = v; });

  $('#btnGlossStart').addEventListener('click', startQuiz);
  $('#btnGlossReset').addEventListener('click', () => {
    if (!confirm('辞典のクイズの記録（網羅状況）をすべて消去します。よろしいですか？')) return;
    gstats = {};
    saveGS();
    renderProgress();
    renderList();
  });

  // 語の詳細
  $('#btnGtBack').addEventListener('click', () => {
    if (G.back === 'quiz') { window.App.showScreen('screenGlossQuiz'); return; }
    if (G.back === 'result') { window.App.showScreen('screenGlossResult'); return; }
    renderList();
    window.App.showScreen('screenGloss');
  });
  $('#btnGtPage').addEventListener('click', () => {
    const g = byTerm(G.term);
    if (g && g.page) window.App.openPage(g.page);
  });
  $('#btnGtPrev').addEventListener('click', () => stepTerm(-1));
  $('#btnGtNext').addEventListener('click', () => stepTerm(1));

  // クイズ
  $('#btnGqReveal').addEventListener('click', reveal);
  $('#btnGqOk').addEventListener('click', () => selfGrade(true));
  $('#btnGqNg').addEventListener('click', () => selfGrade(false));
  $('#btnGqNext').addEventListener('click', next);
  $('#btnGqTerm').addEventListener('click', () => {
    const item = G.quiz[G.qi];
    if (item) openTerm(item.term, 'quiz');
  });
  $('#btnGqQuit').addEventListener('click', () => {
    if (G.answers.length && !confirm('ここまでの解答は記録されます。クイズをやめますか？')) return;
    renderProgress();
    renderList();
    window.App.showScreen('screenGloss');
  });

  // 結果
  $('#btnGqRetryWrong').addEventListener('click', () => {
    if (G.lastWrong.length) buildQuiz(G.lastWrong);
  });
  $('#btnGqAgain').addEventListener('click', startQuiz);
  $('#btnGqHome').addEventListener('click', () => {
    renderProgress();
    renderList();
    window.App.showScreen('screenGloss');
  });

  document.addEventListener('keydown', (ev) => {
    if (!$('#modal').hidden) return;
    if (!$('#screenGlossQuiz').classList.contains('is-active')) return;

    if (G.mode === 'recall') {
      if (!G.revealed) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); reveal(); }
      } else if (!G.answered) {
        if (ev.key === '1') selfGrade(true);
        else if (ev.key === '2') selfGrade(false);
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        next();
      }
      return;
    }

    if (ev.key >= '1' && ev.key <= '4') {
      const b = $$('#gqChoices .choice')[Number(ev.key) - 1];
      if (b && !b.disabled) b.click();
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      if (!$('#btnGqNext').disabled) { ev.preventDefault(); next(); }
    }
  });
};

})();
