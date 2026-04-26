(() => {
  'use strict';

  const CYCLE_SIZE = 20;
  const STORAGE_KEY = 'vapt-prep-state-v1';
  const TOPICS = ['web', 'ad', 'network', 'mobile'];
  const TOPIC_LABEL = { web: 'Web App', ad: 'Active Directory', network: 'Network', mobile: 'Mobile App' };

  // ---------- State ----------

  let state = { byId: {}, cycles: [] };
  let storageOK = true;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = JSON.parse(raw);
    } catch (e) {
      console.warn('localStorage unavailable:', e);
      storageOK = false;
    }
    state.byId = state.byId || {};
    state.cycles = state.cycles || [];
  }

  function saveState() {
    if (!storageOK) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('save failed:', e);
      storageOK = false;
    }
  }

  function ensureQState(id) {
    if (!state.byId[id]) {
      state.byId[id] = { seen: 0, correct: 0, wrong: 0, lastSeen: 0, consecutive: 0, bucket: 'new' };
    }
    return state.byId[id];
  }

  function getBucket(qstate) {
    if (!qstate || qstate.seen === 0) return 'new';
    return qstate.bucket || 'learning';
  }

  // ---------- Question bank ----------

  let allQuestions = [];
  let bankIssues = [];

  function loadBank() {
    allQuestions = [];
    bankIssues = [];
    for (const t of TOPICS) {
      const arr = (window.QUESTION_BANK && window.QUESTION_BANK[t]) || null;
      if (!Array.isArray(arr)) {
        bankIssues.push(`Missing or invalid topic file: questions/${t}.js`);
        continue;
      }
      for (const q of arr) {
        if (!isValidQuestion(q)) {
          console.warn('Skipping malformed question', q);
          continue;
        }
        allQuestions.push(q);
      }
    }
  }

  function isValidQuestion(q) {
    return q && typeof q.id === 'string'
      && TOPICS.includes(q.topic)
      && typeof q.question === 'string'
      && Array.isArray(q.choices) && q.choices.length === 4
      && Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3
      && typeof q.explanation === 'string'
      && q.source && typeof q.source.url === 'string';
  }

  // ---------- Cycle picker ----------

  function pickCycle(filter) {
    let pool = allQuestions.slice();
    if (filter && filter !== 'all' && filter !== 'weak') {
      pool = pool.filter(q => q.topic === filter);
    }
    if (filter === 'weak') {
      pool = pool.filter(q => getBucket(state.byId[q.id]) === 'learning');
    }
    if (pool.length === 0) return [];

    // Bucket distribution
    const buckets = { new: [], learning: [], mastered: [] };
    for (const q of pool) buckets[getBucket(state.byId[q.id])].push(q);

    const targets = {
      learning: Math.round(CYCLE_SIZE * 0.60),
      new: Math.round(CYCLE_SIZE * 0.25),
      mastered: CYCLE_SIZE - Math.round(CYCLE_SIZE * 0.60) - Math.round(CYCLE_SIZE * 0.25),
    };

    const picked = [];
    const order = ['learning', 'new', 'mastered'];
    for (const b of order) {
      const want = Math.min(targets[b], buckets[b].length);
      picked.push(...sample(buckets[b], want));
    }
    // Fill any remaining shortfall from any leftover pool
    if (picked.length < Math.min(CYCLE_SIZE, pool.length)) {
      const remaining = pool.filter(q => !picked.includes(q));
      picked.push(...sample(remaining, Math.min(CYCLE_SIZE, pool.length) - picked.length));
    }
    return shuffle(picked);
  }

  function sample(arr, n) {
    if (n <= 0) return [];
    const copy = arr.slice();
    shuffle(copy);
    return copy.slice(0, n);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- Session ----------

  let session = null;

  function startCycle(filter) {
    const qs = pickCycle(filter);
    if (qs.length === 0) {
      alert('No questions available for this filter. Run a normal cycle first or pick another topic.');
      return;
    }
    session = {
      filter,
      questions: qs,
      answers: new Array(qs.length).fill(null),
      index: 0,
      startedAt: Date.now(),
    };
    renderCycle();
  }

  function answer(choiceIdx) {
    const q = session.questions[session.index];
    if (session.answers[session.index] !== null) return;
    const correct = choiceIdx === q.correctIndex;

    session.answers[session.index] = { chosen: choiceIdx, correct };

    const qs = ensureQState(q.id);
    qs.seen += 1;
    qs.lastSeen = Date.now();
    if (correct) {
      qs.correct += 1;
      qs.consecutive = (qs.consecutive || 0) + 1;
      if (qs.consecutive >= 2) qs.bucket = 'mastered';
      else if (qs.bucket !== 'mastered') qs.bucket = 'learning';
    } else {
      qs.wrong += 1;
      qs.consecutive = 0;
      qs.bucket = 'learning';
    }
    saveState();
    renderCycle();
  }

  function nextQuestion() {
    if (session.index < session.questions.length - 1) {
      session.index += 1;
      renderCycle();
    } else {
      endCycle();
    }
  }

  function endCycle() {
    const score = session.answers.filter(a => a && a.correct).length;
    const total = session.questions.length;
    const byTopic = {};
    for (let i = 0; i < session.questions.length; i++) {
      const t = session.questions[i].topic;
      byTopic[t] = byTopic[t] || { correct: 0, total: 0 };
      byTopic[t].total += 1;
      if (session.answers[i] && session.answers[i].correct) byTopic[t].correct += 1;
    }
    state.cycles.push({ at: Date.now(), score, total, byTopic, filter: session.filter });
    saveState();
    renderEnd(score, total, byTopic);
  }

  // ---------- Rendering ----------

  const host = () => document.getElementById('screen-host');

  function renderApp() {
    loadBank();
    renderHeaderStats();
    if (bankIssues.length === TOPICS.length) {
      host().innerHTML = `<div class="banner banner-error">
        Could not load any topic files. Make sure <code>questions/web.js</code>,
        <code>questions/ad.js</code>, <code>questions/network.js</code>,
        <code>questions/mobile.js</code> exist next to <code>index.html</code>.
      </div>`;
      return;
    }
    renderHome();
  }

  function renderHeaderStats() {
    const stats = document.getElementById('header-stats');
    const total = allQuestions.length;
    const seen = Object.values(state.byId).filter(s => s.seen > 0).length;
    const cycles = state.cycles.length;
    stats.textContent = `${total} questions · ${seen} seen · ${cycles} cycles`;
  }

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') e.className = attrs[k];
        else if (k === 'onClick') e.addEventListener('click', attrs[k]);
        else if (k === 'html') e.innerHTML = attrs[k];
        else e.setAttribute(k, attrs[k]);
      }
    }
    for (const kid of kids) {
      if (kid == null) continue;
      e.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return e;
  }

  function renderHome() {
    const h = host();
    h.innerHTML = '';

    if (!storageOK) {
      h.appendChild(el('div', { class: 'banner banner-warn' },
        'localStorage is unavailable — your progress will not persist across reloads.'));
    }
    if (bankIssues.length) {
      const b = el('div', { class: 'banner banner-warn' });
      b.innerHTML = bankIssues.map(s => `<div>${s}</div>`).join('');
      h.appendChild(b);
    }

    // Bank summary
    const summary = el('div', { class: 'bank-summary' });
    const tbl = el('table');
    const total = allQuestions.length;
    const headerRow = el('tr');
    headerRow.appendChild(el('td', null, el('strong', null, 'Question bank')));
    headerRow.appendChild(el('td', null, `${total} total`));
    tbl.appendChild(headerRow);
    for (const t of TOPICS) {
      const count = allQuestions.filter(q => q.topic === t).length;
      const row = el('tr');
      row.appendChild(el('td', null, TOPIC_LABEL[t]));
      row.appendChild(el('td', null, `${count}`));
      tbl.appendChild(row);
    }
    summary.appendChild(tbl);
    h.appendChild(summary);

    // Topic chips
    let activeFilter = 'all';
    const chipsBox = el('div', { class: 'chips' });

    const learningCount = Object.values(state.byId).filter(s => s.bucket === 'learning').length;

    const chipDefs = [
      { key: 'all', label: 'All topics' },
      ...TOPICS.map(t => ({ key: t, label: TOPIC_LABEL[t] })),
      { key: 'weak', label: `Weak areas only (${learningCount})`, disabled: learningCount === 0 },
    ];

    const chipEls = {};
    for (const def of chipDefs) {
      const c = el('button', {
        class: 'chip' + (def.key === activeFilter ? ' active' : '') + (def.disabled ? ' disabled' : ''),
        onClick: () => {
          if (def.disabled) return;
          activeFilter = def.key;
          for (const k in chipEls) chipEls[k].classList.toggle('active', k === activeFilter);
        },
      }, def.label);
      if (def.disabled) c.disabled = true;
      chipEls[def.key] = c;
      chipsBox.appendChild(c);
    }
    h.appendChild(chipsBox);

    // CTA
    const cta = el('div', { class: 'home-cta' });
    cta.appendChild(el('button', {
      class: 'primary',
      onClick: () => startCycle(activeFilter),
    }, `Start ${CYCLE_SIZE}-question cycle`));
    h.appendChild(cta);

    // Last cycle hint
    if (state.cycles.length > 0) {
      const last = state.cycles[state.cycles.length - 1];
      const hint = el('div', { class: 'muted', style: 'font-size:13px; margin-top:8px;' },
        `Last cycle: ${last.score}/${last.total} (${Math.round(100 * last.score / last.total)}%)`);
      h.appendChild(hint);
    }
  }

  function renderCycle() {
    const h = host();
    h.innerHTML = '';
    const i = session.index;
    const q = session.questions[i];
    const ans = session.answers[i];

    // Progress
    const prog = el('div', { class: 'progress' },
      el('span', null, `Q ${i + 1} / ${session.questions.length}`),
      el('div', { class: 'progress-bar' }, el('div', { style: `width: ${100 * (i + (ans ? 1 : 0)) / session.questions.length}%` })),
      el('span', null, TOPIC_LABEL[q.topic]),
    );
    h.appendChild(prog);

    const card = el('div', { class: 'question-card' });
    if (q.subtopic) card.appendChild(el('div', { class: 'topic-tag' }, q.subtopic));
    card.appendChild(el('div', { class: 'question-text' }, q.question));

    const choices = el('div', { class: 'choices' });
    const letters = ['A', 'B', 'C', 'D'];
    for (let idx = 0; idx < q.choices.length; idx++) {
      let cls = 'choice';
      if (ans) {
        cls += ' locked';
        if (idx === q.correctIndex) cls += ' correct';
        else if (idx === ans.chosen) cls += ' wrong';
      }
      const btn = el('button', { class: cls, onClick: () => answer(idx) },
        el('span', { class: 'choice-letter' }, letters[idx]),
        el('span', null, q.choices[idx]),
      );
      if (ans) btn.disabled = true;
      choices.appendChild(btn);
    }
    card.appendChild(choices);

    // Explanation panel after answer
    if (ans) {
      const panel = el('div', { class: 'explain-panel' });

      if (ans.correct) {
        panel.appendChild(el('h4', { class: 'correct-h' }, '✓ Correct'));
        panel.appendChild(el('p', null, q.explanation));
      } else {
        panel.appendChild(el('h4', { class: 'wrong-h' }, `✗ The correct answer is ${letters[q.correctIndex]}`));
        panel.appendChild(el('p', null, q.explanation));

        const distractor = q.distractorRationale && q.distractorRationale[ans.chosen];
        if (distractor) {
          panel.appendChild(el('h4', null, `Why ${letters[ans.chosen]} is wrong:`));
          panel.appendChild(el('p', null, distractor));
        }
      }

      const link = el('a', {
        class: 'source-link',
        href: q.source.url,
        target: '_blank',
        rel: 'noopener noreferrer',
      }, `Source: ${q.source.name || q.source.url}`);
      panel.appendChild(link);
      card.appendChild(panel);

      const nextRow = el('div', { class: 'next-row' });
      const nextLabel = i < session.questions.length - 1 ? 'Next →' : 'Finish cycle';
      nextRow.appendChild(el('button', { class: 'primary', onClick: nextQuestion }, nextLabel));
      card.appendChild(nextRow);
    }

    h.appendChild(card);
  }

  function renderEnd(score, total, byTopic) {
    const h = host();
    h.innerHTML = '';

    const pct = Math.round(100 * score / total);
    const summary = el('div', { class: 'cycle-summary' });
    summary.appendChild(el('div', { class: 'muted' }, 'Cycle complete'));
    summary.appendChild(el('div', { class: 'score' }, `${score} / ${total}`));
    summary.appendChild(el('div', { class: 'score-pct' }, `${pct}% correct`));

    const breakdown = el('div', { class: 'topic-breakdown' });
    for (const t of TOPICS) {
      const r = byTopic[t];
      if (!r) continue;
      const cell = el('div', { class: 'topic-cell' });
      cell.appendChild(el('div', { class: 'label' }, TOPIC_LABEL[t]));
      cell.appendChild(el('div', { class: 'value' }, `${r.correct} / ${r.total}`));
      breakdown.appendChild(cell);
    }
    summary.appendChild(breakdown);
    h.appendChild(summary);

    // Wrong-answer review
    const wrongs = [];
    for (let i = 0; i < session.questions.length; i++) {
      const a = session.answers[i];
      if (a && !a.correct) wrongs.push({ q: session.questions[i], chosen: a.chosen });
    }

    if (wrongs.length > 0) {
      const reviewBox = el('div', { class: 'review-list' });
      reviewBox.appendChild(el('h3', null, `Review your ${wrongs.length} wrong answer${wrongs.length === 1 ? '' : 's'}`));
      const letters = ['A', 'B', 'C', 'D'];
      for (const w of wrongs) {
        const item = el('div', { class: 'review-item' });
        item.appendChild(el('div', { class: 'q' }, w.q.question));
        const ansLine = el('div', { class: 'a' });
        ansLine.innerHTML = `You picked <strong style="color:var(--red)">${letters[w.chosen]}</strong>.
          Correct answer: <strong>${letters[w.q.correctIndex]}</strong> — ${escapeHtml(w.q.choices[w.q.correctIndex])}`;
        item.appendChild(ansLine);
        item.appendChild(el('div', { class: 'a' }, w.q.explanation));
        const distractor = w.q.distractorRationale && w.q.distractorRationale[w.chosen];
        if (distractor) {
          const d = el('div', { class: 'a' });
          d.innerHTML = `<em>Why ${letters[w.chosen]} was wrong:</em> ${escapeHtml(distractor)}`;
          item.appendChild(d);
        }
        item.appendChild(el('a', {
          class: 'source-link',
          href: w.q.source.url,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, `Source: ${w.q.source.name || w.q.source.url}`));
        reviewBox.appendChild(item);
      }
      h.appendChild(reviewBox);
    } else {
      h.appendChild(el('div', { class: 'banner banner-warn' }, 'Nothing wrong this cycle. Nicely done.'));
    }

    const actions = el('div', { class: 'end-actions' });
    actions.appendChild(el('button', { class: 'primary', onClick: () => startCycle(session.filter) }, 'Start another cycle'));
    actions.appendChild(el('button', { class: 'secondary', onClick: () => { session = null; renderApp(); } }, 'Back to home'));
    h.appendChild(actions);

    renderHeaderStats();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ---------- Reset ----------

  document.addEventListener('keydown', e => {
    if (e.key === 'r' || e.key === 'R') {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (confirm('Reset all progress (cycle history, mastery)?')) {
        state = { byId: {}, cycles: [] };
        saveState();
        session = null;
        renderApp();
      }
    }
  });

  // ---------- Boot ----------

  document.addEventListener('DOMContentLoaded', () => {
    loadState();
    renderApp();
  });
})();
