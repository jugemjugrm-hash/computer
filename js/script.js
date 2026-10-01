/* ==========================================================================
   自作PC・コンピュータ 学習アプリ  共通シェル＋クイズ
   ========================================================================== */
'use strict';

const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const STORE_KEY   = 'pcQuiz.v2';
const SESSION_KEY = 'pcQuiz.session.v1';
const THEME_KEY   = 'pcQuiz.theme';
const KEYS = ['A', 'B', 'C', 'D', 'E'];

/** 苦手リストから卒業するのに必要な連続正解数 */
const GRADUATE_STREAK = 2;

const DIFF = {
  1: { name: '基礎', icon: '🟢' },
  2: { name: '標準', icon: '🟡' },
  3: { name: '応用', icon: '🔴' }
};

const MODE_NOTE = {
  instant: '1問ごとに正誤と解説を表示します。ふだんの学習向け。',
  exam:    '解説は最後にまとめて表示します。力試し向け。',
  recall:  '選択肢を見ずに答えを思い出してから答え合わせします。記憶の定着にはこれが一番効きます。'
};

const HINT = {
  instant: 'キーボード： <kbd>1</kbd>〜<kbd>4</kbd> で解答 / <kbd>Enter</kbd> で次へ',
  exam:    'キーボード： <kbd>1</kbd>〜<kbd>4</kbd> で解答 / <kbd>Enter</kbd> で次へ',
  recall:  'キーボード： <kbd>Enter</kbd> で答えを表示 / <kbd>1</kbd> 思い出せた・<kbd>2</kbd> 思い出せなかった'
};

/* --------------------------------- 状態 --------------------------------- */
const state = {
  cats: [],
  diffs: [1, 2, 3],
  count: 10,
  mode: 'instant',
  shuffleChoices: true,
  quiz: [],
  index: 0,
  answers: [],
  answered: false,
  revealed: false,
  lastSource: 'normal'
};

/* ============================== 保存データ ============================== */
function loadStore() {
  let s = null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) s = JSON.parse(raw);
  } catch (e) { /* 読めなければ初期値で続行 */ }
  if (!s) s = { played: 0, totalQ: 0, totalOk: 0, wrong: {} };
  if (!s.wrong) s.wrong = {};
  Object.keys(s.wrong).forEach((id) => {
    const v = s.wrong[id];
    if (typeof v === 'number') s.wrong[id] = { miss: v, streak: 0 };
    else if (!v || typeof v !== 'object') delete s.wrong[id];
  });
  return s;
}
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* 保存できなくても続行 */ }
}
let store = loadStore();

function saveSession() {
  if (!state.quiz.length) { clearSession(); return; }
  const data = {
    quiz: state.quiz.map((it) => ({ id: it.ref.id, order: it.order })),
    index: state.answers.length,
    answers: state.answers,
    mode: state.mode,
    lastSource: state.lastSource,
    at: Date.now()
  };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch (e) { /* 続行 */ }
}
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.quiz) || !d.quiz.length) return null;
    for (const q of d.quiz) if (!byId(q.id)) return null;
    return d;
  } catch (e) { return null; }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* 続行 */ }
}

/* -------------------------------- 小道具 -------------------------------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function catName(id) {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? c.icon + ' ' + c.name : id;
}
function byId(id) { return QUESTIONS.find((q) => q.id === id); }
function pageFile(page) { return 'img/pages/p' + String(page).padStart(3, '0') + '.jpg'; }

function showScreen(id) {
  const target = $('#' + id);
  $$('.screen').forEach((s) => s.classList.toggle('is-active', s === target));
  const tab = target ? target.dataset.tab : null;
  $$('#tabs .tab').forEach((t) => t.classList.toggle('is-on', t.dataset.tab === tab));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================ 苦手リスト管理 ============================ */
function recordResult(qid, correct) {
  const cur = store.wrong[qid];
  if (correct) {
    if (!cur) return false;
    cur.streak = (cur.streak || 0) + 1;
    if (cur.streak >= GRADUATE_STREAK) { delete store.wrong[qid]; return true; }
  } else {
    if (cur) { cur.miss = (cur.miss || 0) + 1; cur.streak = 0; }
    else { store.wrong[qid] = { miss: 1, streak: 0 }; }
  }
  return false;
}
function weakIds() {
  return Object.keys(store.wrong).filter((id) => byId(id));
}
function weightedOrder(ids) {
  return ids
    .map((id) => {
      const w = 1 + Math.min(store.wrong[id] ? store.wrong[id].miss : 0, 4);
      return { id: id, key: Math.random() / w };
    })
    .sort((a, b) => a.key - b.key)
    .map((x) => x.id);
}

/* ============================== スタート画面 ============================== */
function matchFilter(q) {
  return state.cats.includes(q.cat) && state.diffs.includes(q.d);
}

function buildCatList() {
  const box = $('#catList');
  box.innerHTML = '';
  CATEGORIES.forEach((cat) => {
    const n = QUESTIONS.filter((q) => q.cat === cat.id).length;
    if (!n) return;
    const label = document.createElement('label');
    label.className = 'cat-item is-on';
    label.dataset.cat = cat.id;
    label.innerHTML =
      '<input type="checkbox" value="' + cat.id + '" checked>' +
      '<span>' + cat.icon + ' ' + cat.name + '</span>' +
      '<span class="cat-n">' + n + '</span>';
    label.querySelector('input').addEventListener('change', (ev) => {
      label.classList.toggle('is-on', ev.target.checked);
      syncCats();
    });
    box.appendChild(label);
  });
  syncCats();
}

function syncCats() {
  state.cats = $$('#catList input:checked').map((i) => i.value);
  // 各分野の表示件数を、選択中の難易度に合わせて更新する
  $$('#catList .cat-item').forEach((el) => {
    const n = QUESTIONS.filter((q) => q.cat === el.dataset.cat && state.diffs.includes(q.d)).length;
    $('.cat-n', el).textContent = n;
  });
  const pool = QUESTIONS.filter(matchFilter).length;
  $('#totalCount').textContent = pool;
  const none = pool === 0;
  $('#btnStart').disabled = none;
  $('#btnStart').textContent = none ? '条件に合う問題がありません' : 'クイズを始める';
}

function bindChipRow(sel, key, onPick) {
  $(sel).addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    $$(sel + ' .chip').forEach((c) => c.classList.toggle('is-on', c === chip));
    onPick(chip.dataset[key]);
  });
}

function renderStats() {
  const acc = store.totalQ ? Math.round((store.totalOk / store.totalQ) * 100) : 0;
  $('#statsBody').innerHTML =
    '<div class="stat"><b>' + store.played + '</b><span>挑戦回数</span></div>' +
    '<div class="stat"><b>' + store.totalQ + '</b><span>解いた問題</span></div>' +
    '<div class="stat"><b>' + acc + '%</b><span>通算正答率</span></div>';

  const weak = weakIds();
  $('#weakCount').textContent = weak.length;
  $('#btnStartWeak').disabled = weak.length === 0;
  const almost = weak.filter((id) => (store.wrong[id].streak || 0) >= GRADUATE_STREAK - 1).length;
  $('#weakNote').textContent = weak.length === 0
    ? '苦手リストは空です。間違えた問題が自動で登録され、' + GRADUATE_STREAK + '回連続で正解すると外れます。'
    : '苦手リスト ' + weak.length + '問（あと1回正解で卒業： ' + almost + '問）';
}

function renderResume() {
  const s = loadSession();
  const card = $('#resumeCard');
  if (!s) { card.hidden = true; return; }
  card.hidden = false;
  const label = { instant: '4択', exam: '4択（まとめて採点）', recall: '一問一答' }[s.mode] || '4択';
  const d = new Date(s.at);
  const stamp = (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
                String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  $('#resumeDetail').textContent = label + '・' + s.index + ' / ' + s.quiz.length + '問まで解答済み（' + stamp + '）';
}

/* ================================ 出題 ================================ */
function makeItem(q) {
  const idx = q.c.map((_, i) => i);
  const order = state.shuffleChoices ? shuffle(idx) : idx;
  return { ref: q, order: order, choices: order.map((i) => q.c[i]), answer: order.indexOf(q.a) };
}

function startQuiz(source) {
  let ids;
  if (source === 'weak') {
    ids = weightedOrder(weakIds());
  } else if (source === 'retry') {
    ids = shuffle(state.answers.filter((a) => !a.correct).map((a) => a.qid));
  } else {
    ids = shuffle(QUESTIONS.filter(matchFilter).map((q) => q.id));
  }
  if (!ids.length) return;

  const n = (state.count > 0 && source !== 'retry') ? Math.min(state.count, ids.length) : ids.length;
  state.lastSource = source;
  state.quiz = ids.slice(0, n).map((id) => makeItem(byId(id)));
  state.index = 0;
  state.answers = [];
  clearSession();
  showScreen('screenQuiz');
  renderQuestion();
}

function resumeQuiz() {
  const s = loadSession();
  if (!s) { renderResume(); return; }
  state.mode = s.mode;
  state.lastSource = s.lastSource || 'normal';
  state.quiz = s.quiz.map((it) => {
    const q = byId(it.id);
    const order = Array.isArray(it.order) ? it.order : q.c.map((_, i) => i);
    return { ref: q, order: order, choices: order.map((i) => q.c[i]), answer: order.indexOf(q.a) };
  });
  state.answers = Array.isArray(s.answers) ? s.answers : [];
  state.index = s.index || 0;
  $$('#modeChoices .chip').forEach((c) => c.classList.toggle('is-on', c.dataset.mode === state.mode));
  updateModeUI();
  if (state.index >= state.quiz.length) { finish(); return; }
  showScreen('screenQuiz');
  renderQuestion();
}

function renderQuestion() {
  const item = state.quiz[state.index];
  const q = item.ref;
  state.answered = false;
  state.revealed = false;

  $('#progressFill').style.width = (state.index / state.quiz.length * 100) + '%';
  $('#qCounter').textContent = (state.index + 1) + ' / ' + state.quiz.length;
  updateScoreLabel();

  $('#qCat').textContent = catName(q.cat);
  const d = DIFF[q.d] || DIFF[2];
  $('#qDiff').textContent = d.icon + ' ' + d.name;
  $('#qPage').textContent = q.page ? '『自作PC完全マスター2026』p.' + q.page : '';
  $('#qText').textContent = q.q;

  const fb = $('#feedback');
  fb.hidden = true;
  fb.className = 'feedback';
  $('#fbTitle').textContent = '';
  $('#btnViewPage').hidden = true;
  $('#selfGrade').hidden = true;
  $('#recallAnswer').hidden = true;

  if (state.mode === 'recall') {
    $('#choices').hidden = true;
    $('#recallArea').hidden = false;
    $('#btnReveal').hidden = false;
    $('#btnNext').hidden = true;
  } else {
    $('#recallArea').hidden = true;
    $('#choices').hidden = false;
    $('#btnNext').hidden = false;
    const box = $('#choices');
    box.innerHTML = '';
    item.choices.forEach((text, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice';
      btn.innerHTML = '<span class="key">' + KEYS[i] + '</span><span class="txt"></span>';
      $('.txt', btn).textContent = text;
      btn.addEventListener('click', () => pick(i));
      box.appendChild(btn);
    });
    $('#btnNext').disabled = true;
    $('#btnNext').textContent = state.index === state.quiz.length - 1 ? '結果を見る' : '次の問題へ';
  }
}

function updateScoreLabel() {
  const ok = state.answers.filter((a) => a.correct).length;
  $('#qScore').textContent = state.mode === 'exam'
    ? '解答済み ' + state.answers.length
    : '正解 ' + ok;
}

function showExplanation(q, cls, title) {
  const fb = $('#feedback');
  fb.hidden = false;
  fb.className = 'feedback' + (cls ? ' ' + cls : '');
  $('#fbTitle').textContent = title || '';
  $('#fbText').textContent = q.e || '';
  if (q.page) {
    const b = $('#btnViewPage');
    b.hidden = false;
    b.onclick = () => openPage(q.page);
  }
}

function commit(correct, picked) {
  const q = state.quiz[state.index].ref;
  const graduated = recordResult(q.id, correct);
  state.answers.push({ qid: q.id, picked: picked, correct: correct, graduated: graduated });
  state.answered = true;
  saveStore();
  saveSession();
  updateScoreLabel();
  renderStats();
}

function pick(i) {
  if (state.answered) return;
  const item = state.quiz[state.index];
  const correct = i === item.answer;
  commit(correct, i);

  const btns = $$('#choices .choice');
  btns.forEach((b) => { b.disabled = true; });

  if (state.mode === 'instant') {
    btns[item.answer].classList.add('is-correct');
    if (!correct) btns[i].classList.add('is-wrong');
    showExplanation(item.ref, correct ? 'ok' : 'ng',
      correct ? '正解！' : '不正解… 正解は ' + KEYS[item.answer] + '「' + item.choices[item.answer] + '」');
  } else {
    btns[i].classList.add('is-picked');
  }
  $('#btnNext').disabled = false;
}

function reveal() {
  if (state.revealed) return;
  state.revealed = true;
  const item = state.quiz[state.index];
  $('#btnReveal').hidden = true;
  $('#recallText').textContent = item.choices[item.answer];
  $('#recallAnswer').hidden = false;
  showExplanation(item.ref, '', '');
  $('#selfGrade').hidden = false;
}
function selfGrade(correct) {
  if (!state.revealed || state.answered) return;
  commit(correct, -1);
  next();
}

function next() {
  if (!state.answered) return;
  if (state.index < state.quiz.length - 1) {
    state.index++;
    saveSession();
    renderQuestion();
  } else {
    finish();
  }
}

/* ================================ 結果 ================================ */
function barRows(groups, labelFn) {
  return Object.keys(groups).map((k) => {
    const r = groups[k];
    const p = Math.round((r.ok / r.n) * 100);
    return '<div class="cat-row">' +
             '<div class="cat-row-head"><span>' + labelFn(k) + '</span>' +
             '<span>' + r.ok + '/' + r.n + '（' + p + '%）</span></div>' +
             '<div class="bar"><i style="width:' + p + '%"></i></div>' +
           '</div>';
  }).join('');
}

function finish() {
  clearSession();

  const total = state.quiz.length;
  const ok = state.answers.filter((a) => a.correct).length;
  const pct = Math.round((ok / total) * 100);

  store.played += 1;
  store.totalQ += total;
  store.totalOk += ok;
  saveStore();
  renderStats();
  renderResume();

  $('#scorePct').textContent = pct + '%';
  $('#scoreFrac').textContent = ok + ' / ' + total;
  $('#scoreRing').style.background =
    'conic-gradient(var(--accent) ' + (pct * 3.6) + 'deg, var(--surface-2) 0deg)';

  let msg;
  if (pct === 100) msg = '全問正解！ 完璧です 🏆';
  else if (pct >= 80) msg = 'すばらしい！ しっかり身についています 🎉';
  else if (pct >= 60) msg = 'あと少し。間違えた問題を復習しましょう 💪';
  else if (pct >= 40) msg = '基礎を固めるチャンスです 📘';
  else msg = 'まずは解説をじっくり読んでみましょう 🔰';
  $('#scoreComment').textContent = msg;

  const grad = state.answers.filter((a) => a.correct && a.graduated).length;
  const gn = $('#graduateNote');
  gn.hidden = grad === 0;
  if (grad) gn.textContent = '🎓 ' + grad + '問が苦手リストを卒業しました';

  const byCat = {}, byDiff = {};
  state.answers.forEach((a) => {
    const q = byId(a.qid);
    (byCat[q.cat] = byCat[q.cat] || { ok: 0, n: 0 }).n++;
    (byDiff[q.d] = byDiff[q.d] || { ok: 0, n: 0 }).n++;
    if (a.correct) { byCat[q.cat].ok++; byDiff[q.d].ok++; }
  });
  $('#catResult').innerHTML = barRows(byCat, catName);
  $('#diffResult').innerHTML = barRows(byDiff, (k) => (DIFF[k] || DIFF[2]).icon + ' ' + (DIFF[k] || DIFF[2]).name);

  const list = $('#reviewList');
  list.innerHTML = '';
  let wrongCount = 0;
  state.answers.forEach((a, i) => {
    if (a.correct) return;
    wrongCount++;
    const item = state.quiz[i];
    const q = item.ref;
    const div = document.createElement('div');
    div.className = 'review-item';
    div.innerHTML =
      '<p class="review-q"></p>' +
      (a.picked >= 0 ? '<p class="review-a ng"><span class="lbl">あなた</span><span class="val"></span></p>' : '') +
      '<p class="review-a ok"><span class="lbl">正解</span><span class="val"></span></p>' +
      '<p class="review-e"></p>';
    $('.review-q', div).textContent = q.q;
    const vals = div.querySelectorAll('.val');
    if (a.picked >= 0) {
      vals[0].textContent = item.choices[a.picked];
      vals[1].textContent = item.choices[item.answer];
    } else {
      vals[0].textContent = item.choices[item.answer];
    }
    $('.review-e', div).textContent = q.e || '';
    if (q.page) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-ghost btn-sm';
      b.textContent = '📖 p.' + q.page + ' の誌面を見る';
      b.onclick = () => openPage(q.page);
      div.appendChild(b);
    }
    list.appendChild(div);
  });
  if (!wrongCount) list.innerHTML = '<p class="review-empty">間違いはありませんでした。お見事！</p>';

  $('#btnRetryWrong').disabled = wrongCount === 0;
  $('#btnSameAgain').textContent = state.lastSource === 'normal' ? '同じ設定でもう一度' : 'もう一度挑戦する';

  showScreen('screenResult');
}

/* ============================== 誌面ビューア ============================== */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3];
const viewer = { fit: true, scale: 1 };

function applyZoom(anchor) {
  const img = $('#modalImg');
  const vp  = $('#modalViewport');
  if (!img.naturalWidth) return;

  let relX = 0.5, relY = 0.5;
  if (anchor) { relX = anchor.x; relY = anchor.y; }
  else if (img.offsetWidth) {
    relX = (vp.scrollLeft + vp.clientWidth / 2) / img.offsetWidth;
    relY = (vp.scrollTop + vp.clientHeight / 2) / img.offsetHeight;
  }

  if (viewer.fit) {
    img.style.width = '100%';
    vp.classList.remove('is-zoomed');
    $('#zoomLabel').textContent = 'フィット';
  } else {
    img.style.width = Math.round(img.naturalWidth * viewer.scale) + 'px';
    vp.classList.add('is-zoomed');
    $('#zoomLabel').textContent = Math.round(viewer.scale * 100) + '%';
    vp.scrollLeft = relX * img.offsetWidth - vp.clientWidth / 2;
    vp.scrollTop  = relY * img.offsetHeight - vp.clientHeight / 2;
  }
}
function fitScale() {
  const img = $('#modalImg');
  return img.naturalWidth ? img.clientWidth / img.naturalWidth : 1;
}
function zoomTo(scale, anchor) {
  viewer.fit = false;
  viewer.scale = Math.min(3, Math.max(0.25, scale));
  applyZoom(anchor);
}
function zoomStep(dir, anchor) {
  const cur = viewer.fit ? fitScale() : viewer.scale;
  if (dir > 0) {
    const nxt = ZOOM_STEPS.find((s) => s > cur + 0.01);
    if (nxt) zoomTo(nxt, anchor);
  } else {
    const lower = ZOOM_STEPS.filter((s) => s < cur - 0.01);
    if (lower.length) zoomTo(lower[lower.length - 1], anchor);
    else zoomFit();
  }
}
function zoomFit() { viewer.fit = true; applyZoom(); }

/** 誌面画像が同梱されているか一度だけ確かめる（公開版には画像を含めないため） */
function probePages() {
  const im = new Image();
  im.onerror = () => document.body.classList.add('no-pages');
  im.src = pageFile(12);
}

function openPage(page) {
  $('#modalTitle').textContent = '『自作PC完全マスター2026』 p.' + page;
  const img = $('#modalImg');
  const missing = $('#modalMissing');
  viewer.fit = true;
  viewer.scale = 1;
  img.style.width = '100%';
  img.hidden = false;
  missing.hidden = true;
  $('#zoomLabel').textContent = 'フィット';
  $('#modalViewport').classList.remove('is-zoomed');
  img.onload = () => { $('#modalViewport').scrollTop = 0; $('#modalViewport').scrollLeft = 0; };
  img.onerror = () => {
    // 画像を同梱していない公開版。壊れた画像を見せずに、どこを見ればよいか案内する
    document.body.classList.add('no-pages');
    img.hidden = true;
    missing.hidden = false;
    missing.textContent = 'この版には誌面画像を含めていません（著作物のため）。'
      + '『自作PC完全マスター2026』の p.' + page + ' をお手元の誌面でご確認ください。';
  };
  img.src = pageFile(page);
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#modal').hidden = true;
  $('#modalImg').src = '';
  document.body.style.overflow = '';
}

function initViewer() {
  const vp = $('#modalViewport');
  const img = $('#modalImg');

  img.addEventListener('click', (ev) => {
    if (vp.dataset.dragged === '1') { vp.dataset.dragged = '0'; return; }
    const r = img.getBoundingClientRect();
    const anchor = { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
    if (viewer.fit) zoomTo(1, anchor);
    else zoomFit();
  });

  $$('#modal [data-zoom]').forEach((b) => {
    b.addEventListener('click', () => {
      const k = b.dataset.zoom;
      if (k === 'in') zoomStep(1);
      else if (k === 'out') zoomStep(-1);
      else zoomFit();
    });
  });

  // ---- マウスでのドラッグ移動 ----
  // 指の場合はビューポート自身のスクロールがそのまま使えるので、マウスだけ相手にする
  let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
  vp.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType !== 'mouse' || viewer.fit) return;
    dragging = true;
    vp.dataset.dragged = '0';
    sx = ev.clientX; sy = ev.clientY; sl = vp.scrollLeft; st = vp.scrollTop;
    vp.classList.add('is-dragging');
    ev.preventDefault();
  });
  window.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) vp.dataset.dragged = '1';
    vp.scrollLeft = sl - dx;
    vp.scrollTop  = st - dy;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    vp.classList.remove('is-dragging');
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // ---- 二本指のピンチで拡大縮小 ----
  // スマホでは誌面の細かい表を読むのにこれが要る。
  // ブラウザのページ全体のピンチだと、モーダルの外まで一緒に伸びて使いものにならない
  const pts = new Map();
  let pinchFrom = 0, pinchScale = 1, pinchAnchor = null;

  const pinchDist = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const pinchMid = () => {
    const [a, b] = [...pts.values()];
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) return { x: 0.5, y: 0.5 };
    return {
      x: Math.min(1, Math.max(0, ((a.x + b.x) / 2 - r.left) / r.width)),
      y: Math.min(1, Math.max(0, ((a.y + b.y) / 2 - r.top) / r.height))
    };
  };

  vp.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse') return;
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pts.size === 2) {
      pinchFrom = pinchDist();
      pinchScale = viewer.fit ? fitScale() : viewer.scale;
      pinchAnchor = pinchMid();
      vp.dataset.dragged = '1';   // ピンチ直後のタップ判定を抑える
    }
  });
  vp.addEventListener('pointermove', (ev) => {
    if (!pts.has(ev.pointerId)) return;
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pts.size !== 2 || !pinchFrom) return;
    ev.preventDefault();
    const ratio = pinchDist() / pinchFrom;
    if (Math.abs(ratio - 1) < 0.02) return;
    const next = pinchScale * ratio;
    // 画面に収まる倍率より小さくしようとしたら「フィット」に戻す。
    // これが無いと、縮めきっても中途半端に画面からはみ出したままになる。
    // fitScale() は拡大中だと現在の倍率を返すので、ここでは枠の幅から直に求める
    const fitNow = img.naturalWidth ? vp.clientWidth / img.naturalWidth : 1;
    if (next <= fitNow + 0.005) zoomFit();
    else zoomTo(next, pinchAnchor);
  });
  const dropPoint = (ev) => {
    pts.delete(ev.pointerId);
    if (pts.size < 2) pinchFrom = 0;
  };
  vp.addEventListener('pointerup', dropPoint);
  vp.addEventListener('pointercancel', dropPoint);
}

/* ================================ テーマ ================================ */
function initTheme() {
  let t = null;
  try { t = localStorage.getItem(THEME_KEY); } catch (e) { /* 自動判定に任せる */ }
  if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  applyThemeColor(t);
}
function toggleTheme() {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* 表示は切り替わる */ }
  applyThemeColor(t);
}
/** スマホのアドレスバーの色を、アプリの背景色に合わせる。
    HTML 側の theme-color は OS の設定にしか従わないので、手動切り替えの分をここで上書きする */
function applyThemeColor(t) {
  const c = t === 'dark' ? '#11151d' : '#f4f6fb';
  let m = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!m) {
    m = document.createElement('meta');
    m.name = 'theme-color';
    document.head.appendChild(m);
  }
  m.content = c;
}

function updateModeUI() {
  $('#modeNote').textContent = MODE_NOTE[state.mode] || '';
  $('#quizHint').innerHTML = HINT[state.mode] || '';
  $('#shuffleField').hidden = state.mode === 'recall';
}

/* ============================== イベント登録 ============================== */
function init() {
  initTheme();
  initViewer();
  probePages();
  $('#allCount').textContent = QUESTIONS.length;
  buildCatList();
  renderStats();
  renderResume();
  updateModeUI();

  $('#themeToggle').addEventListener('click', toggleTheme);

  // タブ切り替え
  $('#tabs').addEventListener('click', (ev) => {
    const tab = ev.target.closest('.tab');
    if (!tab) return;
    const first = { quiz: 'screenHome', tables: 'screenTables', gloss: 'screenGloss', price: 'screenPrice' }[tab.dataset.tab];
    showScreen(first);
  });

  // 難易度（複数選択）
  $('#diffChoices').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    chip.classList.toggle('is-on');
    const picked = $$('#diffChoices .chip.is-on').map((c) => Number(c.dataset.diff));
    if (!picked.length) { chip.classList.add('is-on'); return; }  // 最低ひとつは残す
    state.diffs = picked;
    syncCats();
  });

  $$('[data-select]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const on = btn.dataset.select === 'all';
      $$('#catList input').forEach((i) => {
        i.checked = on;
        i.closest('.cat-item').classList.toggle('is-on', on);
      });
      syncCats();
    });
  });

  bindChipRow('#countChoices', 'count', (v) => { state.count = Number(v); });
  bindChipRow('#modeChoices', 'mode', (v) => { state.mode = v; updateModeUI(); });
  $('#optShuffleChoices').addEventListener('change', (ev) => { state.shuffleChoices = ev.target.checked; });

  $('#btnStart').addEventListener('click', () => startQuiz('normal'));
  $('#btnStartWeak').addEventListener('click', () => startQuiz('weak'));
  $('#btnNext').addEventListener('click', next);
  $('#btnReveal').addEventListener('click', reveal);
  $('#btnRecallOk').addEventListener('click', () => selfGrade(true));
  $('#btnRecallNg').addEventListener('click', () => selfGrade(false));

  $('#btnQuit').addEventListener('click', () => {
    if (state.index === 0 && !state.answered) { clearSession(); renderResume(); showScreen('screenHome'); return; }
    if (!confirm('ここまでの解答を保存して中断します。あとで「続きから」で再開できます。')) return;
    saveSession();
    renderResume();
    showScreen('screenHome');
  });

  $('#btnResume').addEventListener('click', resumeQuiz);
  $('#btnDiscard').addEventListener('click', () => {
    if (!confirm('中断したクイズを破棄します。よろしいですか？')) return;
    clearSession();
    renderResume();
  });

  $('#btnRetryWrong').addEventListener('click', () => startQuiz('retry'));
  $('#btnSameAgain').addEventListener('click', () => startQuiz(state.lastSource === 'retry' ? 'normal' : state.lastSource));
  $('#btnHome').addEventListener('click', () => showScreen('screenHome'));

  $('#btnResetStats').addEventListener('click', () => {
    if (!confirm('挑戦回数・正答率・苦手問題の記録をすべて消去します。よろしいですか？')) return;
    store = { played: 0, totalQ: 0, totalOk: 0, wrong: {} };
    saveStore();
    clearSession();
    renderStats();
    renderResume();
  });

  $$('#modal [data-close]').forEach((el) => el.addEventListener('click', closeModal));

  document.addEventListener('keydown', (ev) => {
    if (!$('#modal').hidden) {
      if (ev.key === 'Escape') closeModal();
      else if (ev.key === '+' || ev.key === ';' || ev.key === '=') { ev.preventDefault(); zoomStep(1); }
      else if (ev.key === '-') { ev.preventDefault(); zoomStep(-1); }
      else if (ev.key === '0') { ev.preventDefault(); zoomFit(); }
      return;
    }
    if (!$('#screenQuiz').classList.contains('is-active')) return;

    if (state.mode === 'recall') {
      if (!state.revealed) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); reveal(); }
      } else {
        if (ev.key === '1') selfGrade(true);
        else if (ev.key === '2') selfGrade(false);
      }
      return;
    }

    if (ev.key >= '1' && ev.key <= '4') {
      const btn = $$('#choices .choice')[Number(ev.key) - 1];
      if (btn && !btn.disabled) btn.click();
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      if (!$('#btnNext').disabled) { ev.preventDefault(); next(); }
    }
  });

  // 他のモジュールから使う共通機能
  window.App = { $, $$, shuffle, showScreen, openPage, catName, CATS: CATEGORIES };
  if (window.initTables) window.initTables();
  if (window.initGlossary) window.initGlossary();
  if (window.initPrice) window.initPrice();
  if (window.initTrend) window.initTrend();
}

document.addEventListener('DOMContentLoaded', init);
