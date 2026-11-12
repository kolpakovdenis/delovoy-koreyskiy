/* ═══════════════════════════════════════════════════════════════════
   Деловой корейский · За столом переговоров — app.js
   Vanilla JS, без внешних зависимостей. Данные — из data.js (window.APP_DATA).

   Разделы:
     1. Утилиты            5. Главный экран        9. Справочник
     2. Состояние          6. Режим изучения      10. Статистика
     3. Озвучка (Web API)  7. Практика диалога    11. Печать / экспорт
     4. Роутер             8. Тест и сопоставление 12. Клавиатура / init
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* ─────────────── 1. Утилиты ─────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* Экранирование HTML — все пользовательские данные проходят через него */
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

/* Перемешивание Фишера–Йетса (не мутирует исходник) */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Конфигурация языков: чтобы добавить третий язык — дополните LANGS и data.js */
const LANGS = {
  ko: { code: 'KO', title: 'Корейский', speech: 'ko-KR', field: 'ko' },
  en: { code: 'EN', title: 'Английский', speech: 'en-US', field: 'en' },
};

/* ─────────────── 2. Состояние (localStorage) ─────────────── */
const STATE_KEY = 'negot-state-v1';
const state = {
  lang: 'ko',        // целевой язык карточек: 'ko' | 'en'
  fscale: 1,         // масштаб шрифта
  learned: {},       // { cardId: timestamp отметки «изучено» }
  fav: [],           // [cardId] — избранное
  quiz: {},          // { cardId: { ok: n, bad: n } } — ответы в тестах
  dialogueDone: 0,   // сколько диалогов завершено
};

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    Object.assign(state, raw && typeof raw === 'object' ? raw : {});
  } catch (e) { /* повреждённое состояние — начинаем с чистого */ }
}
function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); }
  catch (e) { /* приватный режим — прогресс не сохранится */ }
  if (DATA) updateFoot();   // держим счётчик в подвале актуальным
}

/* ─────────────── 3. Данные и озвучка ─────────────── */
let DATA = null;        // содержимое data.js (window.APP_DATA)
let byId = {};          // индекс карточек по id
let speechAvailable = 'speechSynthesis' in window;

const Speech = {
  voices: [],
  refresh() {
    if (speechAvailable) this.voices = speechSynthesis.getVoices();
  },
  pick(prefix) {
    this.refresh();
    return this.voices.find(v => v.lang && v.lang.toLowerCase().startsWith(prefix))
        || null;
  },
  speak(text, prefix, btn) {
    if (!speechAvailable || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = prefix === 'ko' ? 'ko-KR' : prefix === 'en' ? 'en-US' : 'ru-RU';
    const v = this.pick(prefix);
    if (v) u.voice = v;
    u.rate = 0.92;
    if (btn) {
      btn.classList.add('speaking');
      u.onend = u.onerror = () => btn.classList.remove('speaking');
    }
    speechSynthesis.speak(u);
  },
  stop() { if (speechAvailable) speechSynthesis.cancel(); },
};
if (speechAvailable) {
  speechSynthesis.onvoiceschanged = () => Speech.refresh();
  Speech.refresh();
}

/* Озвучить поле карточки или термин глоссария:
   kind = target | en | koAlt | enAlt | resp:<idx> | resp-en:<idx> | gloss
   (русская озвучка убрана по запросу — карточки озвучиваются на KO/EN) */
let glossById = {};
function speakCard(cardId, kind, btn) {
  if (kind === 'gloss') {
    const g = glossById[cardId];
    if (g) Speech.speak(g.ko, 'ko', btn);
    return;
  }
  const c = byId[cardId];
  if (!c) return;
  const L = LANGS[state.lang];
  if (kind === 'target') Speech.speak(c.speak || c[L.field], state.lang, btn);
  else if (kind === 'en' && c.en) Speech.speak(c.en, 'en', btn);
  else if (kind === 'koAlt' && c.koAlt) Speech.speak(c.koAlt, 'ko', btn);
  else if (kind === 'enAlt' && c.enAlt) Speech.speak(c.enAlt, 'en', btn);
  else if (kind.startsWith('resp:')) {
    const r = c.responses[+kind.slice(5)];
    if (r) Speech.speak(state.lang === 'ko' ? r.ko : r.en, state.lang, btn);
  }
  else if (kind.startsWith('resp-en:')) {
    const r = c.responses[+kind.slice(8)];
    if (r) Speech.speak(r.en, 'en', btn);
  }
}

/* Иконки (инлайн-SVG, без внешних библиотек) */
const ICONS = {
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5 1-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.5l6.5-1z"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
};

/* Кнопка озвучки */
function speakBtn(cardId, kind, title, extra = '') {
  if (!speechAvailable) return '';
  return `<button type="button" class="speak-btn ${extra}" data-action="speak"
    data-card="${esc(cardId)}" data-kind="${esc(kind)}" title="${esc(title)}" aria-label="${esc(title)}">${ICONS.speaker}</button>`;
}

/* ─────────────── 4. Роутер ─────────────── */
function route() {
  if (!DATA) return;
  Speech.stop();
  const hash = location.hash.replace(/^#\/?/, '');
  const [view, arg] = hash.split('/');
  const scr = $('#screen');
  scr.classList.remove('screen'); void scr.offsetWidth; scr.classList.add('screen');
  if (view === 'learn') renderLearn('learn', arg || 'all');
  else if (view === 'random') renderLearn('random', 'all');
  else if (view === 'favorites') renderLearn('favorites');
  else if (view === 'dialogue') renderDialogue(arg || '');
  else if (view === 'quiz') renderQuiz(arg || '');
  else if (view === 'reference') renderReference(arg || 'glossary');
  else if (view === 'stats') renderStats();
  else renderHome();
  window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', route);

/* Сессии экранов (не сохраняются между перезагрузками) */
let study = { queue: [], i: 0, revealed: false, mode: 'learn', title: '' };
let dlg = null, quiz = null, pairsG = null, refTab = 'glossary', refQuery = '', refLang = null;

/* Прогресс по теме: изучено/всего/процент */
function topicProgress(topicId) {
  const cards = topicId === 'all' ? DATA.cards : DATA.cards.filter(c => c.topic === topicId);
  const learned = cards.filter(c => state.learned[c.id]).length;
  const pct = cards.length ? Math.round(learned / cards.length * 100) : 0;
  return { total: cards.length, learned, pct };
}

/* Общий процент освоения */
function overallPct() {
  const total = DATA.cards.length;
  const learned = Object.keys(state.learned).filter(id => byId[id]).length;
  return { total, learned, pct: total ? Math.round(learned / total * 100) : 0 };
}

/* ─────────────── 5. Главный экран ─────────────── */
function renderHome() {
  const o = overallPct();
  const modes = [
    { emoji: '📚', title: 'Обучение', desc: 'Карточки по темам: перевод, озвучка, примеры', to: '#/learn/all' },
    { emoji: '🗣️', title: 'Практика диалога', desc: 'Партнёр говорит — вы отвечаете', to: '#/dialogue' },
    { emoji: '✅', title: 'Тест', desc: 'Перевод, аудирование, выбор фразы', to: '#/quiz' },
    { emoji: '🎲', title: 'Случайный режим', desc: 'Микс из всех тем для закрепления', to: '#/random' },
    { emoji: '⭐', title: `Избранное (${state.fav.length})`, desc: 'Отмеченные карточки для повторения', to: '#/favorites' },
    { emoji: '📖', title: 'Справочник', desc: 'Глоссарий · график отгрузок · классификация · сроки', to: '#/reference' },
    { emoji: '📊', title: 'Статистика', desc: 'Освоение по темам, экспорт и импорт', to: '#/stats' },
  ];
  $('#screen').innerHTML = `
    <section class="hero">
      <h2>Деловые переговоры без переводчика</h2>
      <p>Один тренажёр вместо трёх: ${DATA.cards.length} карточек · ${DATA.topics.length} тем · русский → ${LANGS[state.lang].code === 'KO' ? '한국어' : 'English'}</p>
      <div class="stat-row">
        <span class="stat-chip">Изучено <b>${o.learned}</b> из ${o.total} (${o.pct}%)</span>
        <span class="stat-chip">В избранном <b>${state.fav.length}</b></span>
        <span class="stat-chip">Диалогов проведено <b>${state.dialogueDone}</b></span>
      </div>
      <div class="stat-row" style="max-width:26rem;margin-left:auto;margin-right:auto">
        <div class="progress" style="flex:1"><i style="width:${o.pct}%"></i></div>
      </div>
    </section>
    <h3 class="home-sec-title">Режимы</h3>
    <div class="home-grid">
      ${modes.map(m => `
        <button type="button" class="mode-card" data-action="go" data-to="${m.to}">
          <span class="mode-emoji" aria-hidden="true">${m.emoji}</span>
          <span class="home-main"><span class="home-title">${m.title}</span>
          <span class="home-desc">${m.desc}</span></span>
        </button>`).join('')}
    </div>
    <h3 class="home-sec-title">Темы</h3>
    <div class="home-grid">
      ${DATA.topics.map(t => {
        const p = topicProgress(t.id);
        return `
        <button type="button" class="topic-card" data-action="go" data-to="#/learn/${t.id}">
          <span class="mode-emoji" aria-hidden="true">${t.emoji}</span>
          <span class="home-main">
            <span class="home-title">${esc(t.title)}</span>
            <span class="home-desc kr">${esc(t.kr)}</span>
            <span class="progress topic-progress"><i style="width:${p.pct}%"></i></span>
            <span class="home-desc">${p.learned} из ${p.total} изучено · ${p.pct}%</span>
          </span>
        </button>`;
      }).join('')}
    </div>`;
}

/* ─────────────── 6. Режим изучения (обучение / избранное / случайный) ─────────────── */
function buildQueue(mode, topicId) {
  if (mode === 'random') return shuffle(DATA.cards).map(c => c.id);
  if (mode === 'favorites') return DATA.cards.filter(c => state.fav.includes(c.id)).map(c => c.id);
  if (topicId === 'all') return DATA.cards.map(c => c.id);
  return DATA.cards.filter(c => c.topic === topicId).map(c => c.id);
}

function renderLearn(mode, topicId) {
  const L = LANGS[state.lang];
  let title = 'Обучение · все темы';
  if (mode === 'random') title = 'Случайный режим';
  else if (mode === 'favorites') title = '⭐ Избранное';
  else if (topicId !== 'all') {
    const t = DATA.topics.find(x => x.id === topicId);
    title = t ? `${t.emoji} ${t.title}` : 'Обучение';
  }
  study = {
    queue: buildQueue(mode, topicId),
    i: 0, revealed: false,
    mode, topicId: topicId || 'all', title,
  };
  if (!study.queue.length) {
    $('#screen').innerHTML = `
      <div class="view-head">
        <button type="button" class="back-btn" data-action="back">← На главную</button>
        <h2>${esc(title)}</h2>
      </div>
      <div class="empty-box">
        <div class="t">Здесь пока пусто</div>
        <div class="d">${mode === 'favorites'
          ? 'Нажмите звезду на карточке в режиме обучения — и она появится здесь.'
          : 'В этой теме пока нет карточек. Добавьте их в data.js (см. README.md).'}</div>
        <button type="button" class="btn outline" data-action="go" data-to="#/">Перейти к темам</button>
      </div>`;
    return;
  }
  drawStudy();
}

/* Отрисовка текущей карточки режима изучения */
function drawStudy() {
  const L = LANGS[state.lang];
  const c = byId[study.queue[study.i]];
  const p = topicProgress(study.mode === 'learn' ? study.topicId : 'all');
  const done = !!state.learned[c.id];
  const fav = state.fav.includes(c.id);
  const revealed = study.revealed;
  const t = DATA.topics.find(x => x.id === c.topic);
  const srcTitle = (DATA.meta.sources.find(s => s.id === c.source) || {}).title || c.source;

  /* Строка под фразой: вместо корейской транскрипции — английский вариант
     той же фразы (запрос «Talk in ENG»). В EN-режиме строка не нужна:
     английская фраза там и так основная.

     Блок «Вариант 2» — более формальная формулировка фразы на двух языках
     (запрос «на двух языках: корейский, а под ним английский»):
       • сверху корейский вариант koAlt (с озвучкой),
       • под ним тот же смысл на английском enAlt. */
  const altHtml = (c.koAlt || c.enAlt) ? `
    <div class="alt-box">
      ${c.koAlt ? `
        <div class="lang-row">
          <span class="lang-label ko"><span class="lang-code ko">KO</span> Вариант 2 · Корейский</span>
          ${speakBtn(c.id, 'koAlt', 'Озвучить вариант 2')}
        </div>
        <p class="alt-ko kr">${esc(c.koAlt)}</p>` : ''}
      ${c.enAlt ? `
        <div class="lang-row">
          <span class="lang-label en"><span class="lang-code en">EN</span> Вариант 2 · English</span>
          ${speakBtn(c.id, 'enAlt', 'Озвучить вариант 2 по-английски')}
        </div>
        <p class="alt-en">${esc(c.enAlt)}</p>` : ''}
    </div>` : '';
  const revealHtml = revealed ? `
    <div class="reveal-section reveal">
      <div class="lang-row">
        <span class="lang-label ${state.lang}"><span class="lang-code ${state.lang}">${L.code}</span> ${L.title}</span>
        ${speakBtn(c.id, 'target', 'Озвучить (' + L.title + ')')}
      </div>
      <p class="target-phrase kr">${esc(c[L.field])}</p>
      ${state.lang === 'en' && c.topic === 'words' ? `<p class="target-phrase kr" style="font-size:1.02em;color:var(--ko)">${esc(c.ko)}</p>` : ''}
      ${state.lang === 'ko' && c.en ? `
        <p class="en-line">${esc(c.en)}</p>
        <div class="line-speak">${speakBtn(c.id, 'en', 'Озвучить по-английски')}</div>` : ''}
      ${altHtml}
      <div class="context-box">${esc(c.context)}</div>
      <p class="q-label" style="margin-top:0.9rem;text-align:left">Примеры ответов партнёра</p>
      <ul class="responses">
        ${c.responses.map((r, i) => `
          <li><span>${esc(r.ru)}
            <span class="r-ko kr">${esc(r.ko)}</span>
            <span class="r-en">${esc(r.en)}</span>
            ${speakBtn(c.id, 'resp:' + i, state.lang === 'ko' ? 'Озвучить по-корейски' : 'Озвучить ответ', 'inline')}${state.lang === 'ko' ? speakBtn(c.id, 'resp-en:' + i, 'Озвучить по-английски', 'inline') : ''}</span></li>`).join('')}
      </ul>
    </div>` : `
    <button type="button" class="btn outline" style="align-self:center" data-action="reveal">
      Показать перевод &nbsp;<span class="mut">Space</span>
    </button>`;

  $('#screen').innerHTML = `
    <div class="view-head">
      <button type="button" class="back-btn" data-action="back">← На главную</button>
      <h2>${esc(study.title)}</h2>
      <span class="badge outline">${study.i + 1} / ${study.queue.length}</span>
      <span class="spacer"></span>
      ${study.mode === 'learn' ? `<button type="button" class="btn small outline" data-action="print-topic">Печать темы</button>` : ''}
    </div>
    <p class="progress-num" style="text-align:left;margin:0 0 0.4rem">Освоение: ${p.learned} из ${p.total} · ${p.pct}%</p>
    <div class="card-zone">
      <button type="button" class="arrow-btn left" data-action="prev" ${study.i === 0 ? 'disabled' : ''} aria-label="Предыдущая карточка">${ICONS.left}</button>
      <div class="card-box card-swap" id="cardBox">
        <div class="card-top">
          <div class="card-badges">
            <span class="badge">${t ? t.emoji + ' ' + esc(t.title) : ''}</span>
            <span class="badge outline">${esc(srcTitle)}</span>
            <span class="badge lv-${esc(c.level)}">${esc(DATA.levels[c.level])}</span>
            <span class="badge outline">${esc(DATA.freqs[c.freq])} встречаемость</span>
            ${done ? '<span class="badge lv-basic">изучено</span>' : ''}
          </div>
          <button type="button" class="fav-btn ${fav ? 'on' : ''}" data-action="fav" data-id="${esc(c.id)}"
            title="В избранное" aria-label="В избранное">${ICONS.star}</button>
        </div>
        <div class="ru-phrase">
          <span class="label">Русская фраза</span>
          <p class="phrase">${esc(c.ru)}</p>
        </div>
        ${revealHtml}
        <div class="card-actions">
          <button type="button" class="btn ${done ? 'outline' : ''}" data-action="learned" data-id="${esc(c.id)}">
            ${done ? '✓ Изучено — снять' : 'Отметить «изучено»'}
          </button>
          ${done ? '<span class="learned-chip">Плюс к прогрессу темы</span>' : ''}
        </div>
        <p class="kbd-hint">← → листать · Space — перевод · S — озвучка · F — избранное · L — изучено · Esc — выход</p>
      </div>
      <button type="button" class="arrow-btn right" data-action="next" ${study.i === study.queue.length - 1 ? 'disabled' : ''} aria-label="Следующая карточка">${ICONS.right}</button>
    </div>`;
}

function studyNav(step) {
  const ni = study.i + step;
  if (ni < 0 || ni >= study.queue.length) return;
  study.i = ni;
  study.revealed = false;
  drawStudy();
}

/* ─────────────── 7. Практика диалога ─────────────── */
function renderDialogue(topicId) {
  if (!topicId) { drawDialogueSetup(); return; }
  const pool = topicId === 'all' ? DATA.cards : DATA.cards.filter(c => c.topic === topicId);
  if (!pool.length) { drawDialogueSetup(); return; }
  const t = DATA.topics.find(x => x.id === topicId);
  dlg = {
    topicId: topicId || 'all',
    title: topicId === 'all' ? 'Смешанная встреча' : (t ? `${t.emoji} ${t.title}` : 'Диалог'),
    ids: shuffle(pool).slice(0, Math.min(7, pool.length)).map(c => c.id),
    i: 0, stage: 'partner', picked: -1, free: '', showRu: false,
  };
  drawDialogue();
}

function drawDialogueSetup() {
  $('#screen').innerHTML = `
    <div class="view-head">
      <button type="button" class="back-btn" data-action="back">← На главную</button>
      <h2>🗣️ Практика диалога</h2>
    </div>
    <div class="setup-box">
      <p style="margin:0;font-size:0.92rem" class="mut">Партнёр «говорит» фразу на ${LANGS[state.lang].title.toLowerCase()}
      (с озвучкой и подсказкой произношения). Ваша задача — понять и ответить: выберите готовый вариант
      или сформулируйте свой. Реплики взяты из реальных переговоров.</p>
      <div class="setup-row">
        <span class="lbl">Тема диалога</span>
        <div class="select-wrap">
          <select id="dlgTopic">
            <option value="all">Все темы (смешанная встреча)</option>
            ${DATA.topics.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join('')}
          </select>
        </div>
      </div>
      <button type="button" class="btn" data-action="dlg-start">Начать диалог</button>
    </div>`;
}

function drawDialogue() {
  const L = LANGS[state.lang];
  const c = byId[dlg.ids[dlg.i]];
  const t = DATA.topics.find(x => x.id === c.topic);

  let body = '';
  if (dlg.stage === 'partner') {
    body = `
      <div class="reply-list" style="margin-top:0.9rem">
        <button type="button" class="btn outline" data-action="dlg-show-ru">Показать перевод фразы</button>
        <button type="button" class="btn" data-action="dlg-show-replies">Показать варианты ответа</button>
        <button type="button" class="btn outline" data-action="dlg-free">Ответить своими словами</button>
      </div>`;
  } else if (dlg.stage === 'replies') {
    body = `
      <p class="q-label" style="margin-top:0.9rem;text-align:left">Выберите ответ (или сформулируйте свой):</p>
      <div class="reply-list">
        ${c.responses.map((r, i) => `
          <button type="button" class="reply-btn" data-action="dlg-pick" data-idx="${i}">
            <span><b>${esc(r.ru)}</b>
            <span class="r-ko kr">${esc(r.ko)}</span>
            <span class="r-en">${esc(r.en)}</span></span>
          </button>`).join('')}
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:0.7rem;flex-wrap:wrap">
        <button type="button" class="btn small outline" data-action="dlg-free">Свой вариант</button>
        <button type="button" class="btn small outline" data-action="dlg-next">Пропустить →</button>
      </div>`;
  } else if (dlg.stage === 'free') {
    body = `
      <p class="q-label" style="margin-top:0.9rem;text-align:left">Ваш ответ (по-${LANGS[state.lang].code === 'KO' ? 'корейски' : 'английски'} или по-русски — как удобно):</p>
      <textarea class="free-input" id="freeText" placeholder="Введите ответ…">${esc(dlg.free)}</textarea>
      <div style="display:flex;gap:0.5rem;margin-top:0.7rem;flex-wrap:wrap">
        <button type="button" class="btn" data-action="dlg-free-done">Готово</button>
        <button type="button" class="btn small outline" data-action="dlg-next">Пропустить →</button>
      </div>`;
  } else if (dlg.stage === 'answered') {
    const r = dlg.picked >= 0 ? c.responses[dlg.picked] : null;
    body = `
      <div class="bubble you reveal">
        <span class="who">Вы</span>
        ${r
          ? `<p class="phrase">${esc(r.ru)}<br><span class="kr koc">${esc(r.ko)}</span><br><span class="enc">${esc(r.en)}</span></p>
             ${speakBtn(c.id, 'resp:' + dlg.picked, 'Озвучить ваш ответ')}
             ${state.lang === 'ko' ? speakBtn(c.id, 'resp-en:' + dlg.picked, 'Озвучить по-английски', 'inline') : ''}`
          : `<p class="phrase">${esc(dlg.free)}</p>
             <span class="mut" style="font-size:0.8rem">Сравните с вариантами ниже — они звучат естественно в деловом контексте.</span>`}
      </div>
      ${r ? '' : `
      <div class="reply-list reveal" style="margin-top:0.4rem">
        ${c.responses.map((rr, i) => `
          <button type="button" class="reply-btn" data-action="dlg-pick" data-idx="${i}">
            <span><b>${esc(rr.ru)}</b>
            <span class="r-ko kr">${esc(rr.ko)}</span>
            <span class="r-en">${esc(rr.en)}</span></span>
          </button>`).join('')}
      </div>`}
      <div style="margin-top:0.9rem">
        <button type="button" class="btn" data-action="dlg-next">
          ${dlg.i === dlg.ids.length - 1 ? 'Завершить диалог' : 'Следующая фраза →'}
        </button>
      </div>`;
  }

  $('#screen').innerHTML = `
    <div class="view-head">
      <button type="button" class="back-btn" data-action="go" data-to="#/dialogue">← К настройкам</button>
      <h2>${esc(dlg.title)}</h2>
      <span class="badge outline">Фраза ${dlg.i + 1} из ${dlg.ids.length}</span>
    </div>
    <div class="chat">
      <div class="bubble partner card-swap">
        <span class="who">Партнёр · ${t ? esc(t.title) : ''}</span>
        <p class="phrase kr">${esc(c[L.field])}</p>
        ${state.lang === 'ko' && c.en ? `
          <p class="en-line">${esc(c.en)}</p>
          <div class="line-speak">${speakBtn(c.id, 'en', 'Озвучить по-английски')}</div>` : ''}
        <div class="bubble-actions">
          ${speakBtn(c.id, 'target', 'Озвучить фразу партнёра')}
          ${state.lang === 'ko' && c.en ? speakBtn(c.id, 'en', 'Озвучить по-английски', 'inline') : ''}
          ${dlg.showRu ? `<span class="badge">${esc(c.ru)}</span>` : ''}
        </div>
      </div>
      ${body}
    </div>
    <p class="kbd-hint">Esc — выйти из диалога</p>`;
}

function dlgNext() {
  if (dlg.i >= dlg.ids.length - 1) {
    state.dialogueDone++;
    saveState();
    $('#screen').innerHTML = `
      <div class="result-box">
        <p class="result-score">Диалог завершён</p>
        <p class="result-sub">${esc(dlg.title)} · отработано фраз: ${dlg.ids.length}</p>
        <p class="result-sub">Всего диалогов проведено: ${state.dialogueDone}</p>
        <div class="result-actions">
          <button type="button" class="btn" data-action="go" data-to="#/dialogue/${esc(dlg.topicId)}">Ещё диалог</button>
          <button type="button" class="btn outline" data-action="go" data-to="#/">На главную</button>
        </div>
      </div>`;
    dlg = null;
    return;
  }
  dlg.i++;
  dlg.stage = 'partner';
  dlg.picked = -1;
  dlg.free = '';
  dlg.showRu = false;
  drawDialogue();
}

/* ─────────────── 8. Тест и сопоставление ─────────────── */
function renderQuiz(topicId) {
  if (!topicId) { drawQuizSetup(); return; }
  const pool = topicId === 'all' ? DATA.cards : DATA.cards.filter(c => c.topic === topicId);
  if (pool.length < 4) { drawQuizSetup(); return; }
  quiz = {
    topicId, total: Math.min(10, pool.length),
    ids: shuffle(pool).slice(0, Math.min(10, pool.length)).map(c => c.id),
    i: 0, score: 0, answered: false, opts: [], correct: 0, type: 'ru2t',
    mistakes: [],
  };
  makeQuestion();
  drawQuiz();
}

function drawQuizSetup() {
  const canListen = speechAvailable;
  $('#screen').innerHTML = `
    <div class="view-head">
      <button type="button" class="back-btn" data-action="back">← На главную</button>
      <h2>✅ Тест</h2>
    </div>
    <div class="setup-box">
      <div class="setup-row">
        <span class="lbl">Тема</span>
        <div class="select-wrap">
          <select id="quizTopic">
            <option value="all">Все темы</option>
            ${DATA.topics.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join('')}
          </select>
        </div>
      </div>
      ${canListen ? `<label class="check"><input type="checkbox" id="quizListen" checked> Включить задания на аудирование</label>` : ''}
      <p style="margin:0" class="mut">10 вопросов: перевод в обе стороны, аудирование, выбор фразы.
      Правильный ответ автоматически отмечает карточку изученной.</p>
      <button type="button" class="btn" data-action="quiz-start">Начать тест</button>
      <div class="setup-row">
        <span class="lbl">Или тренировка слов</span>
        <button type="button" class="btn outline" data-action="pairs-start">🔤 Сопоставление слов (глоссарий)</button>
      </div>
    </div>`;
}

/* Генерация вопроса: выбор типа и вариантов ответа */
function makeQuestion() {
  const L = LANGS[state.lang];
  const c = byId[quiz.ids[quiz.i]];
  const listenOk = speechAvailable && $('#quizListen') ? $('#quizListen').checked : false;
  const types = ['ru2t', 't2ru'];
  if (listenOk) types.push('listen', 'listen'); // аудирование чаще
  quiz.type = types[Math.floor(Math.random() * types.length)];

  // дистракторы: сначала из той же темы, добираем из всех
  const sameTopic = DATA.cards.filter(x => x.topic === c.topic && x.id !== c.id);
  const others = shuffle(DATA.cards.filter(x => x.id !== c.id && !sameTopic.includes(x)));
  const distr = shuffle(sameTopic).slice(0, 3);
  while (distr.length < 3 && others.length) distr.push(others.pop());
  const texts = new Set([c[L.field]]);
  const opts = [c];
  for (const d of shuffle(distr)) {
    if (texts.has(d[L.field])) continue;
    texts.add(d[L.field]);
    opts.push(d);
  }
  // если переводов-дистракторов мало — добираем из всех без ограничений
  for (const d of shuffle(others)) {
    if (opts.length >= 4) break;
    if (texts.has(d[L.field])) continue;
    texts.add(d[L.field]);
    opts.push(d);
  }
  quiz.opts = shuffle(opts);
  quiz.correct = quiz.opts.findIndex(o => o.id === c.id);
  quiz.answered = false;
}

function drawQuiz() {
  const L = LANGS[state.lang];
  const c = byId[quiz.ids[quiz.i]];
  // для ru2t варианты на целевом языке, для t2ru/listen — на русском
  const optText = o => quiz.type === 'ru2t' ? o[L.field] : o.ru;
  const optCls = quiz.type === 'ru2t' ? 'kr' : '';
  let head = '';
  if (quiz.type === 'ru2t') {
    head = `<p class="q-label">Как это сказать на ${LANGS[state.lang].title.toLowerCase()}?</p>
            <p class="q-phrase">${esc(c.ru)}</p>`;
  } else if (quiz.type === 't2ru') {
    head = `<p class="q-label">Что означает эта фраза?</p>
            <p class="q-phrase kr">${esc(c[L.field])}</p>`;
  } else {
    head = `<p class="q-label">Прослушайте и выберите перевод</p>
            <p class="q-phrase" style="font-size:1em">${speakBtn(c.id, 'target', 'Прослушать ещё раз')}
            <span class="mut" style="font-size:0.85em">нажмите кнопку</span></p>`;
  }
  $('#screen').innerHTML = `
    <div class="view-head">
      <button type="button" class="back-btn" data-action="go" data-to="#/quiz">← К настройкам</button>
      <h2>Тест</h2>
      <span class="badge outline">Вопрос ${quiz.i + 1} / ${quiz.total}</span>
      <span class="spacer"></span>
      <span class="q-counter">Счёт: ${quiz.score}</span>
    </div>
    <div class="q-card">
      ${head}
      <div class="opts two">
        ${quiz.opts.map((o, i) => `
          <button type="button" class="opt" data-action="quiz-answer" data-idx="${i}" ${quiz.answered ? 'disabled' : ''}>
            <span class="num">${i + 1}.</span>
            <span class="${optCls}">${esc(optText(o))}</span>
          </button>`).join('')}
      </div>
      ${quiz.answered ? `
        <div class="q-actions">
          <span class="badge ${quiz.wasRight ? 'lv-basic' : ''}" style="${quiz.wasRight ? '' : 'background:var(--bad-bg);color:var(--bad)'}">
            ${quiz.wasRight ? 'Верно!' : 'Ошибка'}
          </span>
          <button type="button" class="btn" data-action="quiz-next">
            ${quiz.i === quiz.total - 1 ? 'Результат' : 'Дальше →'}
          </button>
        </div>` : ''}
    </div>
    <p class="kbd-hint">1–4 — выбрать вариант · Esc — выйти из теста</p>`;
}

function quizAnswer(idx) {
  if (quiz.answered) return;
  quiz.answered = true;
  const right = idx === quiz.correct;
  quiz.wasRight = right;
  const c = byId[quiz.ids[quiz.i]];
  if (right) {
    quiz.score++;
    state.learned[c.id] = Date.now();       // верный ответ = карточка изучена
  } else {
    quiz.mistakes.push(c.id);
  }
  const q = state.quiz[c.id] || { ok: 0, bad: 0 };
  right ? q.ok++ : q.bad++;
  state.quiz[c.id] = q;
  saveState();
  drawQuiz();
}

function quizNext() {
  if (quiz.i >= quiz.total - 1) {
    const total = quiz.total;
    const score = quiz.score;
    const pct = Math.round(score / total * 100);
    const msg = pct === 100 ? 'Идеально! Так держать.'
      : pct >= 70 ? 'Хороший результат. Загляните в ошибки.'
      : 'Повторите ошибки — и впереди ещё один круг.';
    $('#screen').innerHTML = `
      <div class="result-box">
        <p class="result-score">${score} / ${total}</p>
        <p class="result-sub">${pct}% правильных ответов</p>
        <p class="result-sub">${msg}</p>
        <div class="result-actions">
          <button type="button" class="btn" data-action="go" data-to="#/quiz/${esc(quiz.topicId)}">Пройти ещё раз</button>
          <button type="button" class="btn outline" data-action="go" data-to="#/quiz">Сменить тему</button>
          <button type="button" class="btn outline" data-action="go" data-to="#/">На главную</button>
        </div>
        ${quiz.mistakes.length ? `
          <p class="result-sub" style="align-self:flex-start">Ошибки (${quiz.mistakes.length}):</p>
          <div class="miss-list">
            ${quiz.mistakes.map(id => {
              const m = byId[id];
              return `<div class="miss-item">
                <b>${esc(m.ru)}</b>
                ${state.lang === 'ko'
                  ? `<span class="koc kr">${esc(m.ko)}</span>`
                  : `<span class="enc">${esc(m.en)}</span>`}
                ${speakBtn(id, 'target', 'Озвучить')}
              </div>`;
            }).join('')}
          </div>` : ''}
      </div>`;
    quiz = null;
    return;
  }
  quiz.i++;
  makeQuestion();
  drawQuiz();
}

/* Сопоставление: 6 пар «русский ↔ корейский/английский» из глоссария */
function startPairs() {
  const terms = shuffle(DATA.glossary).slice(0, 6);
  const tiles = shuffle([
    ...terms.map(t => ({ id: t.id, side: 'ru', text: t.ru })),
    ...terms.map(t => ({ id: t.id, side: 'x', text: LANGS[state.lang].field === 'ko' ? t.ko : t.en })),
  ]);
  pairsG = { terms, tiles, sel: null, done: 0 };
  drawPairs();
}

function drawPairs() {
  const left = pairsG.done < 6;
  $('#screen').innerHTML = `
    <div class="view-head">
      <button type="button" class="back-btn" data-action="go" data-to="#/quiz">← К настройкам</button>
      <h2>Сопоставление слов</h2>
      <span class="badge outline">Собрано пар: ${pairsG.done} / 6</span>
    </div>
    <div class="pairs-grid">
      ${pairsG.tiles.map((t, i) => `
        <button type="button" class="pair-tile ${t.state || ''}" data-action="pair-click" data-idx="${i}" ${t.state === 'done' ? 'disabled' : ''}>
          <span class="side-tag">${t.side === 'ru' ? 'Русский' : (LANGS[state.lang].code === 'KO' ? '한국어' : 'English')}</span>
          <span class="${t.side === 'x' && LANGS[state.lang].field === 'ko' ? 'kr' : ''}">${esc(t.text)}</span>
        </button>`).join('')}
    </div>
    ${left ? '<p class="kbd-hint">Выберите слово слева и его перевод справа (или наоборот)</p>' : `
      <div class="result-box" style="margin-top:1rem">
        <p class="result-score">Все пары собраны!</p>
        <div class="result-actions">
          <button type="button" class="btn" data-action="pairs-start">Ещё раунд</button>
          <button type="button" class="btn outline" data-action="go" data-to="#/">На главную</button>
        </div>
      </div>`}`;
}

function pairClick(idx) {
  const tile = pairsG.tiles[idx];
  if (!tile || tile.state === 'done') return;
  if (!pairsG.sel) {
    pairsG.sel = idx;
    tile.state = 'sel';
    drawPairs();
    return;
  }
  if (pairsG.sel === idx) {
    tile.state = '';
    pairsG.sel = null;
    drawPairs();
    return;
  }
  const first = pairsG.tiles[pairsG.sel];
  if (first.id === tile.id && first.side !== tile.side) {
    first.state = tile.state = 'done';
    pairsG.done++;
  } else {
    first.state = tile.state = 'err';
    setTimeout(() => {
      first.state = tile.state = '';
      pairsG.sel = null;
      drawPairs();
    }, 550);
  }
  pairsG.sel = null;
  drawPairs();
}

/* ─────────────── 9. Справочник: глоссарий, график отгрузок, классификация, сроки ─────────────── */
function renderReference(tab) {
  refTab = tab || 'glossary';
  if (!refLang) refLang = state.lang;   // язык таблиц по умолчанию — как язык карточек
  const langBtn = (id, label) => `
    <button type="button" class="mode-btn ${refTab === id ? 'active' : ''}" data-action="go" data-to="#/reference/${id}">${label}</button>`;
  $('#screen').innerHTML = `
    <div class="view-head">
      <button type="button" class="back-btn" data-action="back">← На главную</button>
      <h2>📖 Справочник</h2>
    </div>
    <div class="ref-tabs mode-switch" style="display:flex;justify-content:center;margin-bottom:1rem">
      ${langBtn('glossary', 'Глоссарий')}
      ${langBtn('shipments', 'График отгрузок')}
      ${langBtn('classification', 'Классификация')}
      ${langBtn('timeline', 'Сроки')}
    </div>
    <div id="refBody"></div>`;
  ({ glossary: drawGlossary, shipments: drawShipments, classification: drawClassification, timeline: drawTimeline })[refTab]();
}

/* Переключатель языка таблиц справочника (RU/KO/EN) — на язык карточек не влияет */
function refLangSwitch() {
  return `
    <div class="mode-switch" role="group" aria-label="Язык таблицы" style="display:flex;justify-content:center;gap:0.35rem;margin:0 0 0.9rem">
      ${['ru', 'ko', 'en'].map(l => `
        <button type="button" class="mode-btn ${refLang === l ? 'active' : ''}" data-action="ref-lang" data-lang="${l}">${l.toUpperCase()}</button>`).join('')}
    </div>`;
}

function drawGlossary() {
  const q = refQuery.trim().toLowerCase();
  const match = t => !q || [t.ru, t.ko, t.en, t.note].some(s => (s || '').toLowerCase().includes(q));
  const groups = DATA.topics
    .map(t => ({ t, items: DATA.glossary.filter(g => g.topic === t.id && match(g)) }))
    .filter(g => g.items.length);
  $('#refBody').innerHTML = `
    <input type="search" class="search-input" id="glSearch" placeholder="Поиск по глоссарию…" value="${esc(refQuery)}">
    ${groups.length ? groups.map(({ t, items }) => `
      <h3 class="gl-group-title">${t.emoji} ${esc(t.title)}</h3>
      <div class="term-box">
        ${items.map(g => `
          <div class="term-row">
            <span class="term-ru">${esc(g.ru)}</span>
            <span class="term-ko kr">${esc(g.ko)}</span>
            <span class="term-en">${esc(g.en)}</span>
            ${speakBtn(g.id, 'gloss', 'Озвучить корейский')}
            ${g.note ? `<span class="term-note">${esc(g.note)}</span>` : ''}
          </div>`).join('')}
      </div>`).join('')
    : '<div class="empty-box"><div class="t">Ничего не найдено</div><div class="d">Попробуйте другой запрос.</div></div>'}
  `;
  const inp = $('#glSearch');
  inp.addEventListener('input', () => { refQuery = inp.value; drawGlossary(); restoreCaret(inp); });
}

/* Возврат каретки в конец поля после перерисовки */
function restoreCaret(inp) {
  const len = inp.value.length;
  inp.focus();
  inp.setSelectionRange(len, len);
}

function drawShipments() {
  const sh = DATA.shipments;
  const lang = refLang || state.lang;
  const cell = (obj) => esc((obj && (obj[lang] || obj.ru)) || '—');
  $('#refBody').innerHTML = `
    ${refLangSwitch()}
    <h3 class="ref-title">${esc(sh.title[lang] || sh.title.ru)}</h3>
    <div class="table-box">
      <table class="ship">
        <thead><tr>
          ${(sh.cols[lang] || sh.cols.ru).map(c => `<th>${esc(c)}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${sh.rows.map(r => `
            <tr>
              <td class="n">${esc(r.n)}</td>
              <td class="n">${cell(r.qty)}</td>
              <td>${cell(r.to)}</td>
              <td>${cell(r.status)}</td>
              <td>${cell(r.reply)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <ul class="notes">
      ${sh.notes.map(n => `<li>${esc(n[lang] || n.ru)}</li>`).join('')}
    </ul>`;
}

/* Заявление на классификацию товара: пример заполнения бланка (Denka Black) */
function drawClassification() {
  const cl = DATA.classification;
  if (!cl || !Array.isArray(cl.rows)) {
    $('#refBody').innerHTML = `<div class="empty-box"><div class="t">Нет данных</div><div class="d">Блок classification не найден в data.js.</div></div>`;
    return;
  }
  const lang = refLang || state.lang;
  const t = (obj) => esc((obj && (obj[lang] || obj.ru)) || '—');
  $('#refBody').innerHTML = `
    ${refLangSwitch()}
    <h3 class="ref-title">${esc(cl.title[lang] || cl.title.ru)}</h3>
    <p class="ref-sub">${esc(cl.subtitle[lang] || cl.subtitle.ru)}</p>
    <div class="table-box">
      <table class="ship form">
        <thead><tr>
          <th style="width:36%">${esc(cl.colField[lang] || cl.colField.ru)}</th>
          <th>${esc(cl.colValue[lang] || cl.colValue.ru)}</th>
        </tr></thead>
        <tbody>
          ${cl.rows.map(r => `
            <tr>
              <td class="field">${r.no ? `<span class="f-no">${esc(r.no)}</span>` : ''}${t(r.field)}</td>
              <td>${t(r.value)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <ul class="notes">
      ${(cl.notes || []).map(n => `<li>${t(n)}</li>`).join('')}
    </ul>`;
}

/* Таймлайн ключевых сроков: ближайшие шаги + события по месяцам */
function drawTimeline() {
  const tl = DATA.timeline;
  if (!tl || !Array.isArray(tl.months)) {
    $('#refBody').innerHTML = `<div class="empty-box"><div class="t">Нет данных</div><div class="d">Блок timeline не найден в data.js.</div></div>`;
    return;
  }
  const lang = refLang || state.lang;
  const T = (obj) => esc((obj && (obj[lang] || obj.ru)) || '—');
  const TAG = { ship: '🚢', po: '📝', wait: '⏳', meet: '🗓️' };
  $('#refBody').innerHTML = `
    ${refLangSwitch()}
    <h3 class="ref-title">${esc(tl.title[lang] || tl.title.ru)}</h3>
    ${(tl.legend || []).length ? `
      <div class="tl-legend">
        ${tl.legend.map(l => `<span><i class="dot ${esc(l.tag)}"></i>${TAG[l.tag] || ''} ${T(l.label)}</span>`).join('')}
      </div>` : ''}
    ${(tl.soon || []).length ? `
      <div class="tl-soon-label">Ближайшие шаги</div>
      <div class="tl-soon">
        ${tl.soon.map(s => `<div class="tl-soon-chip"><span class="d">${T(s.d)}</span> ${T(s.text)}</div>`).join('')}
      </div>` : ''}
    <div class="tl-box">
      ${tl.months.map(m => `
        <div class="tl-month">${T(m.m)}</div>
        ${m.events.map(ev => `
          <div class="tl-event ${esc(ev.tag || '')}">
            <div class="tl-when">${TAG[ev.tag] || '•'} ${T(ev.d)}</div>
            <p class="tl-text">${T(ev.text)}</p>
          </div>`).join('')}`
      ).join('')}
    </div>`;
}

/* ─────────────── 10. Статистика ─────────────── */
function renderStats() {
  const o = overallPct();
  const q = Object.values(state.quiz);
  const ok = q.reduce((s, x) => s + x.ok, 0);
  const bad = q.reduce((s, x) => s + x.bad, 0);
  const acc = ok + bad ? Math.round(ok / (ok + bad) * 100) : 0;
  $('#screen').innerHTML = `
    <div class="view-head">
      <button type="button" class="back-btn" data-action="back">← На главную</button>
      <h2>📊 Статистика</h2>
    </div>
    <div class="stat-row" style="justify-content:flex-start;margin-bottom:1rem">
      <span class="stat-chip">Изучено <b>${o.learned}</b> из ${o.total} (${o.pct}%)</span>
      <span class="stat-chip">В избранном <b>${state.fav.length}</b></span>
      <span class="stat-chip">Точность в тестах <b>${acc}%</b> (${ok} верных из ${ok + bad})</span>
      <span class="stat-chip">Диалогов <b>${state.dialogueDone}</b></span>
    </div>
    <div class="stats-box">
      ${DATA.topics.map(t => {
        const p = topicProgress(t.id);
        return `
        <div class="stat-line">
          <span class="name">${t.emoji} ${esc(t.title)}<span class="cnt">${p.learned}/${p.total}</span></span>
          <div class="progress"><i style="width:${p.pct}%"></i></div>
          <span class="q-counter">${p.pct}%</span>
        </div>`;
      }).join('')}
    </div>
    <h3 class="home-sec-title">Прогресс и данные</h3>
    <div class="setup-box">
      <p style="margin:0" class="mut">Прогресс хранится в этом браузере (localStorage).
      Экспортируйте его, чтобы перенести на другое устройство, или импортируйте файл.</p>
      <div class="danger-zone">
        <button type="button" class="btn outline" data-action="export">Экспорт прогресса</button>
        <button type="button" class="btn outline" data-action="import">Импорт прогресса</button>
        <button type="button" class="btn outline" data-action="print-all">Печать всех карточек</button>
        <button type="button" class="btn danger" data-action="reset">Сбросить прогресс</button>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </div>`;
}

/* Экспорт прогресса в JSON-файл */
function exportProgress() {
  const payload = {
    app: 'negot-trainer', version: 1,
    exported: new Date().toISOString(),
    lang: state.lang,
    learned: state.learned, fav: state.fav, quiz: state.quiz,
    dialogueDone: state.dialogueDone,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'progress-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* Импорт: читаем файл, показываем сводку, применяем по подтверждению */
function importProgress(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let imp;
    try { imp = JSON.parse(reader.result); }
    catch (e) { alert('Не удалось прочитать файл: это не JSON.'); return; }
    if (!imp || imp.app !== 'negot-trainer' || typeof imp.learned !== 'object') {
      alert('Это не файл прогресса этого тренажёра.'); return;
    }
    const panel = $('#overlayPanel');
    $('#overlay').hidden = false;
    panel.innerHTML = `
      <h2>Импорт прогресса</h2>
      <p>В файле: изучено карточек — <b>${Object.keys(imp.learned || {}).length}</b>,
      в избранном — <b>${(imp.fav || []).length}</b>,
      результатов тестов — <b>${Object.keys(imp.quiz || {}).length}</b>.</p>
      <p>Текущий прогресс будет заменён.</p>
      <div class="result-actions" style="justify-content:flex-start">
        <button type="button" class="btn" data-action="do-import">Применить</button>
        <button type="button" class="btn outline" data-action="overlay-close">Отмена</button>
      </div>`;
    panel.dataset.payload = JSON.stringify(imp);
  };
  reader.readAsText(file);
}

function applyImport(imp) {
  state.learned = imp.learned || {};
  state.fav = Array.isArray(imp.fav) ? imp.fav : [];
  state.quiz = imp.quiz || {};
  state.dialogueDone = imp.dialogueDone || 0;
  if (imp.lang === 'ko' || imp.lang === 'en') state.lang = imp.lang;
  saveState();
  $('#overlay').hidden = true;
  updateHeaderState();
  route();
}

function resetProgress() {
  if (!confirm('Сбросить весь прогресс? Изученные карточки, избранное и результаты тестов будут удалены.')) return;
  state.learned = {}; state.fav = []; state.quiz = {}; state.dialogueDone = 0;
  saveState();
  route();
}

/* ─────────────── 11. Печать карточек ─────────────── */
function printCards(title, ids) {
  const cards = ids.map(id => byId[id]).filter(Boolean);
  if (!cards.length) return;
  $('#printArea').innerHTML = `
    <p class="print-title">${esc(title)} — ${cards.length} карточек</p>
    <div class="print-grid">
      ${cards.map(c => {
        const t = DATA.topics.find(x => x.id === c.topic);
        return `
        <div class="print-card">
          <p class="pc-topic">${esc(t ? t.title : '')}</p>
          <p class="pc-ru">${esc(c.ru)}</p>
          <p class="pc-ko kr">${esc(c.ko)}</p>
          <p class="pc-en">${esc(c.en)}</p>
        </div>`;
      }).join('')}
    </div>`;
  window.print();
}

/* ─────────────── 12. Шапка: тема, язык, шрифт ─────────────── */
function applyTheme() {
  let t = null;
  try { t = localStorage.getItem('negot-theme'); } catch (e) {}
  if (t !== 'light' && t !== 'dark') t = 'dark';   // тёмная тема — по умолчанию
  document.documentElement.classList.toggle('dark', t === 'dark');
}
function toggleTheme() {
  const dark = document.documentElement.classList.toggle('dark');
  try { localStorage.setItem('negot-theme', dark ? 'dark' : 'light'); } catch (e) {}
}
function applyFont() {
  document.documentElement.style.setProperty('--fscale', state.fscale);
  $('#fontVal').textContent = Math.round(state.fscale * 100) + '%';
}
function applyLang() {
  $$('.lang-switch button').forEach(b =>
    b.classList.toggle('on', b.dataset.lang === state.lang));
}
function updateHeaderState() { applyLang(); applyFont(); }

function updateFoot() {
  const o = overallPct();
  $('#footStats').textContent = `${DATA.cards.length} карточек · ${DATA.topics.length} тем · изучено ${o.pct}%`;
}

/* ─────────────── Обработчик действий (делегирование) ─────────────── */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const act = btn.dataset.action;
  const id = btn.dataset.id;

  switch (act) {
    case 'go': location.hash = btn.dataset.to; break;
    case 'back': location.hash = '#/'; break;
    case 'theme': toggleTheme(); break;
    case 'lang':
      if (state.lang !== btn.dataset.lang) {
        state.lang = btn.dataset.lang;
        saveState();
        applyLang();
        route();   // перерисовать экран под новый язык
      }
      break;
    case 'font-inc': state.fscale = Math.min(1.3, +(state.fscale + 0.075).toFixed(3)); applyFont(); saveState(); break;
    case 'font-dec': state.fscale = Math.max(0.55, +(state.fscale - 0.075).toFixed(3)); applyFont(); saveState(); break;

    /* Режим изучения */
    case 'reveal': study.revealed = true; drawStudy(); break;
    case 'prev': studyNav(-1); break;
    case 'next': studyNav(1); break;
    case 'fav': {
      const i = state.fav.indexOf(id);
      i >= 0 ? state.fav.splice(i, 1) : state.fav.push(id);
      saveState();
      if (study.mode === 'favorites' && i >= 0) {  // удалили из избранного — уходим с карточки
        study.queue = buildQueue('favorites');
        if (study.i >= study.queue.length) study.i = Math.max(0, study.queue.length - 1);
        study.queue.length ? drawStudy() : renderLearn('favorites');
      } else drawStudy();
      break;
    }
    case 'learned': {
      if (state.learned[id]) delete state.learned[id];
      else state.learned[id] = Date.now();
      saveState();
      drawStudy();
      break;
    }
    case 'print-topic': {
      const t = DATA.topics.find(x => x.id === study.topicId);
      printCards(t ? t.title : 'Карточки', study.queue);
      break;
    }

    /* Диалог */
    case 'dlg-start': {
      const v = $('#dlgTopic') ? $('#dlgTopic').value : 'all';
      location.hash = '#/dialogue/' + v;
      break;
    }
    case 'dlg-show-ru': dlg.showRu = true; drawDialogue(); break;
    case 'dlg-show-replies': dlg.stage = 'replies'; drawDialogue(); break;
    case 'dlg-free': dlg.stage = 'free'; drawDialogue(); {
      const ta = $('#freeText'); if (ta) ta.focus();
      break;
    }
    case 'dlg-free-done': {
      const ta = $('#freeText');
      dlg.free = (ta ? ta.value : '').trim();
      if (!dlg.free) { dlg.stage = 'partner'; drawDialogue(); break; }
      dlg.stage = 'answered'; dlg.picked = -1;
      drawDialogue();
      break;
    }
    case 'dlg-pick': dlg.picked = +btn.dataset.idx; dlg.stage = 'answered'; drawDialogue(); break;
    case 'dlg-next': dlgNext(); break;

    /* Тест */
    case 'quiz-start': {
      const v = $('#quizTopic') ? $('#quizTopic').value : 'all';
      location.hash = '#/quiz/' + v;
      break;
    }
    case 'quiz-answer': quizAnswer(+btn.dataset.idx); break;
    case 'quiz-next': quizNext(); break;

    /* Сопоставление */
    case 'pairs-start': startPairs(); break;
    case 'pair-click': pairClick(+btn.dataset.idx); break;

    /* Справочник */
    case 'ref-tab': renderReference(btn.dataset.tab); break;
    case 'ref-lang':
      if (refLang !== btn.dataset.lang) {
        refLang = btn.dataset.lang;
        if (refTab === 'shipments') drawShipments();
        else if (refTab === 'classification') drawClassification();
        else if (refTab === 'timeline') drawTimeline();
      }
      break;

    /* Озвучка */
    case 'speak': speakCard(btn.dataset.card, btn.dataset.kind, btn); break;

    /* Статистика */
    case 'export': exportProgress(); break;
    case 'import': $('#importFile').click(); break;
    case 'do-import': applyImport(JSON.parse($('#overlayPanel').dataset.payload)); break;
    case 'overlay-close': $('#overlay').hidden = true; break;
    case 'reset': resetProgress(); break;
    case 'print-all': printCards('Все карточки', DATA.cards.map(c => c.id)); break;
  }
});

/* Тап по свободному месту карточки = открыть перевод / закрыть обратно */
document.addEventListener('click', e => {
  const box = e.target.closest('#cardBox');
  if (!box || e.target.closest('button, a, input, textarea, select')) return;
  study.revealed = !study.revealed;
  drawStudy();
});

/* Свайп влево/вправо по карточке = следующая/предыдущая (телефон) */
let swipe = null;
document.addEventListener('touchstart', e => {
  if (e.touches.length !== 1 || !e.target.closest('.card-zone')) { swipe = null; return; }
  swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
document.addEventListener('touchend', e => {
  if (!swipe) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, dt = Date.now() - swipe.t;
  swipe = null;
  if (dt > 800) return;                                   // долгий тап — не свайп
  if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return; // вертикальная прокрутка
  const inStudy = $('#cardBox') && (location.hash.startsWith('#/learn')
    || location.hash.startsWith('#/random') || location.hash.startsWith('#/favorites'));
  if (!inStudy) return;
  studyNav(dx < 0 ? 1 : -1);
}, { passive: true });

/* Импорт файла */
document.addEventListener('change', e => {
  if (e.target.id === 'importFile' && e.target.files[0]) {
    importProgress(e.target.files[0]);
    e.target.value = '';
  }
});

/* ─────────────── Клавиатурная навигация ─────────────── */
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const inStudy = location.hash.startsWith('#/learn') || location.hash.startsWith('#/random')
               || location.hash.startsWith('#/favorites');
  const inQuiz = quiz && quiz.opts;
  const inDlg = dlg && dlg.ids;

  if (e.key === 'Escape') {
    if (!$('#overlay').hidden) { $('#overlay').hidden = true; return; }
    if (inDlg) { location.hash = '#/dialogue'; return; }
    if (location.hash.startsWith('#/quiz/') && quiz) { location.hash = '#/quiz'; return; }
    if (inStudy || location.hash.startsWith('#/reference') || location.hash.startsWith('#/stats')) {
      location.hash = '#/';
    }
    return;
  }
  if (inQuiz && quiz.answered && (e.key === 'ArrowRight' || e.key === 'Enter')) {
    quizNext();
    e.preventDefault();
    return;
  }
  if (inQuiz && !quiz.answered && /^[1-4]$/.test(e.key)) {
    const i = +e.key - 1;
    if (i < quiz.opts.length) quizAnswer(i);
    return;
  }
  if (inStudy) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { studyNav(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { studyNav(-1); e.preventDefault(); }
    else if (e.key === ' ') {
      if (!study.revealed) { study.revealed = true; drawStudy(); e.preventDefault(); }
    } else if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
      speakCard(study.queue[study.i], 'target');
    } else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') {
      const id = study.queue[study.i];
      const i = state.fav.indexOf(id);
      i >= 0 ? state.fav.splice(i, 1) : state.fav.push(id);
      saveState(); drawStudy();
    } else if (e.key === 'l' || e.key === 'L' || e.key === 'д' || e.key === 'Д') {
      const id = study.queue[study.i];
      if (state.learned[id]) delete state.learned[id]; else state.learned[id] = Date.now();
      saveState(); drawStudy();
    }
  }
});

/* ─────────────── Инициализация ─────────────── */
/* Данные читаются из data.js (window.APP_DATA) — обычный <script>, поэтому
   платформа работает двойным кликом (file://) без локального сервера. */
function loadData() {
  const d = window.APP_DATA;
  if (!d || typeof d !== 'object' || !Array.isArray(d.cards) || !Array.isArray(d.glossary)) {
    throw new Error('window.APP_DATA не найден или повреждён');
  }
  return d;
}

function showDataError(err) {
  const panel = $('#overlayPanel');
  $('#overlay').hidden = false;
  panel.innerHTML = `
    <h2>Не удалось прочитать data.js</h2>
    <p>Причина: <b>${esc(err && err.message || 'неизвестно')}</b>.</p>
    <p>Чаще всего это опечатка при ручном редактировании: пропущенная запятая,
    кавычка или скобка. Откройте <b>data.js</b> в блокноте и проверьте место,
    которое правили последним. Точную строку ошибки покажет консоль браузера
    (клавиша F12 → вкладка Console).</p>
    <p>Файл должен начинаться строкой <code>window.APP_DATA = {</code>
    и заканчиваться <code>};</code>. Примеры правки — в README.md.</p>`;
}

async function init() {
  applyTheme();
  loadState();
  updateHeaderState();
  try {
    DATA = await loadData();
  } catch (e) {
    showDataError(e);
    return;
  }
  byId = Object.fromEntries(DATA.cards.map(c => [c.id, c]));
  glossById = Object.fromEntries(DATA.glossary.map(g => [g.id, g]));
  updateFoot();
  route();
}

init();
