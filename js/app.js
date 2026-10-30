'use strict';

/* Max Provas — app em JS vanilla, sem dependências. */

const DATA_URL = 'data/races.json';
const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_GAP_DAYS = 28; // intervalos < 4 semanas são destacados

const STATUS = {
  aberta: { emoji: '🟢', label: 'Inscrições abertas' },
  aguardando: { emoji: '🟡', label: 'Aguardando abertura' },
  esgotada: { emoji: '🔴', label: 'Esgotada' }
};

const VIEWS = {
  provas: { title: 'Minhas provas', render: renderUpcoming },
  temporada: { title: 'Temporada', render: renderSeason },
  historico: { title: 'Histórico', render: renderHistory }
};

const fmtLong = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' });

let races = [];

/* ---------- Datas ---------- */

// "YYYY-MM-DD" -> Date à meia-noite local (evita o desvio de fuso horário de new Date("YYYY-MM-DD")).
function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 ? date : null;
}

function today() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function daysBetween(a, b) {
  return Math.round((b - a) / DAY_MS);
}

function countdownText(days) {
  if (days === 0) return 'é hoje! 🔥';
  if (days === 1) return 'é amanhã';
  return `faltam ${days} dias`;
}

function weeksText(days) {
  const w = Math.floor(days / 7);
  const d = days % 7;
  const parts = [];
  if (w) parts.push(`${w} ${w === 1 ? 'semana' : 'semanas'}`);
  if (d || !w) parts.push(`${d} ${d === 1 ? 'dia' : 'dias'}`);
  return parts.join(' e ');
}

/* ---------- Utilitários ---------- */

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function isTri(r) {
  return /tri/i.test(r.modalidade || '');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------- Dados ---------- */

async function loadRaces() {
  const res = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error('races.json deve conter uma lista de provas');
  return list.map((r) => ({ ...r, _date: parseDate(r.data) }));
}

function partition() {
  const t = today();
  const upcoming = [];
  const undated = [];
  const past = [];
  for (const r of races) {
    if (!r._date) undated.push(r);
    else if (r._date < t) past.push(r);
    else upcoming.push(r);
  }
  upcoming.sort((a, b) => a._date - b._date);
  past.sort((a, b) => b._date - a._date);
  undated.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt'));
  return { upcoming, undated, past, today: t };
}

/* ---------- Componentes ---------- */

function badge(status) {
  const s = STATUS[status] || STATUS.aguardando;
  const key = STATUS[status] ? status : 'aguardando';
  return `<span class="badge ${key}"><span aria-hidden="true">${s.emoji}</span>${s.label}</span>`;
}

function metaLine(r) {
  const parts = [];
  parts.push(`<span>📅 ${r._date ? esc(fmtLong.format(r._date)) : 'Data a confirmar'}</span>`);
  if (r.local) parts.push(`<span>📍 ${esc(r.local)}</span>`);
  const kind = [r.modalidade, r.distancia].filter(Boolean).map(esc).join(' · ');
  if (kind) parts.push(`<span>${isTri(r) ? '🏊‍♂️🚴‍♂️🏃‍♂️' : '🏃‍♂️'} ${kind}</span>`);
  return `<p class="meta">${parts.join('')}</p>`;
}

function upcomingCard(r, t) {
  const inscricao = safeUrl(r.urlInscricao);
  const oficial = safeUrl(r.urlOficial);
  const countdown = r._date
    ? `<span class="countdown">${countdownText(daysBetween(t, r._date))}</span>`
    : '<span class="countdown muted">sem data</span>';

  const signup = inscricao
    ? `<a class="btn primary" href="${esc(inscricao)}" target="_blank" rel="noopener">Inscrever-me</a>`
    : '<span class="btn primary" aria-disabled="true" title="Link de inscrição por preencher">Inscrever-me</span>';

  const ics = `<button class="btn" type="button" data-ics="${esc(r.id)}" ${r._date ? '' : 'disabled title="Defina a data primeiro"'}>Adicionar à agenda</button>`;

  return `
    <article class="card">
      <div class="card-top">${badge(r.statusInscricao)}${countdown}</div>
      <h2>${esc(r.nome)}</h2>
      ${metaLine(r)}
      ${r.objetivoTempo ? `<p class="goal">🎯 Objetivo: <strong>${esc(r.objetivoTempo)}</strong></p>` : ''}
      <div class="actions">${signup}${ics}</div>
      ${oficial ? `<div class="link-row"><a href="${esc(oficial)}" target="_blank" rel="noopener">Site oficial ↗</a></div>` : ''}
    </article>`;
}

function pastCard(r) {
  let result;
  if (r.resultado) {
    const hit = r.objetivoTempo && compareTimes(r.resultado, r.objetivoTempo) <= 0;
    result = `
      <div class="result">
        <span class="time">${esc(r.resultado)}</span>
        ${r.objetivoTempo ? `<span class="vs">objetivo ${esc(r.objetivoTempo)} ${hit ? '<span class="hit">✓ cumprido</span>' : ''}</span>` : ''}
      </div>`;
  } else {
    result = '<div class="result none">Sem resultado registado.</div>';
  }
  return `
    <article class="card past">
      <h2>${esc(r.nome)}</h2>
      ${metaLine(r)}
      ${result}
    </article>`;
}

// Compara tempos "h:mm:ss" / "mm:ss". Devolve NaN se algum não for um tempo.
function compareTimes(a, b) {
  const secs = (s) => {
    const p = String(s).trim().split(':').map(Number);
    if (!p.length || p.length > 3 || p.some((n) => !Number.isFinite(n))) return NaN;
    return p.reduce((acc, n) => acc * 60 + n, 0);
  };
  return secs(a) - secs(b);
}

/* ---------- Ecrãs ---------- */

function renderUpcoming(view, sub) {
  const { upcoming, undated, today: t } = partition();
  const n = upcoming.length + undated.length;
  sub.textContent = n ? `${n} ${n === 1 ? 'prova' : 'provas'} pela frente` : '';

  if (!n) {
    view.innerHTML = '<p class="empty">Sem provas futuras. Adicione provas em <code>data/races.json</code>.</p>';
    return;
  }

  let html = '';
  if (upcoming.length) {
    html += `<div class="list">${upcoming.map((r) => upcomingCard(r, t)).join('')}</div>`;
  }
  if (undated.length) {
    html += `<h2 class="section-title">Data a confirmar</h2><div class="list">${undated.map((r) => upcomingCard(r, t)).join('')}</div>`;
  }
  view.innerHTML = html;
}

function renderSeason(view, sub) {
  const { upcoming, undated, today: t } = partition();

  if (!upcoming.length) {
    sub.textContent = '';
    view.innerHTML = `<p class="empty">Ainda não há provas com data definida.${undated.length ? `<br>${undated.length} ${undated.length === 1 ? 'prova aguarda' : 'provas aguardam'} data.` : ''}</p>`;
    return;
  }

  const gaps = upcoming.slice(1).map((r, i) => daysBetween(upcoming[i]._date, r._date));
  const shortGaps = gaps.filter((d) => d < SHORT_GAP_DAYS).length;
  const minGap = gaps.length ? Math.min(...gaps) : null;
  const first = upcoming[0];
  const last = upcoming[upcoming.length - 1];
  sub.textContent = `${fmtShort.format(first._date)} → ${fmtShort.format(last._date)}`;

  let html = `
    <div class="summary">
      <div class="stat"><b>${upcoming.length}</b><span>provas com data</span></div>
      <div class="stat"><b>${minGap === null ? '—' : `${(minGap / 7).toFixed(1).replace('.', ',')}`}</b><span>menor intervalo (sem.)</span></div>
      <div class="stat ${shortGaps ? 'warn' : ''}"><b>${shortGaps}</b><span>intervalos &lt; 4 sem.</span></div>
    </div>
    <ol class="timeline">`;

  const untilFirst = daysBetween(t, first._date);
  html += gapItem(untilFirst, `${weeksText(untilFirst)} até à primeira prova`, false);

  upcoming.forEach((r, i) => {
    if (i > 0) {
      const d = gaps[i - 1];
      const short = d < SHORT_GAP_DAYS;
      html += gapItem(d, `${short ? '⚠️ ' : ''}${weeksText(d)}${short ? ' · intervalo curto' : ''}`, short);
    }
    html += `
      <li class="tl-race ${isTri(r) ? 'tri' : ''}">
        <div class="card">
          <div class="tl-date">${esc(fmtLong.format(r._date))}</div>
          <h3>${esc(r.nome)}</h3>
          <p class="meta">${[r.local && `📍 ${esc(r.local)}`, [r.modalidade, r.distancia].filter(Boolean).map(esc).join(' · ')].filter(Boolean).map((s) => `<span>${s}</span>`).join('')}</p>
        </div>
      </li>`;
  });
  html += '</ol>';

  html += `<p class="legend">Intervalos inferiores a 4 semanas aparecem destacados a laranja.</p>`;
  if (undated.length) {
    html += `<h2 class="section-title">Data a confirmar</h2><p class="legend" style="margin-top:0">${undated.map((r) => esc(r.nome)).join(' · ')}</p>`;
  }
  view.innerHTML = html;
}

function gapItem(days, label, short) {
  return `<li class="tl-gap ${short ? 'short' : ''}" aria-label="${esc(label)}"><span class="pill">${esc(label)}</span></li>`;
}

function renderHistory(view, sub) {
  const { past } = partition();
  const withResult = past.filter((r) => r.resultado).length;
  sub.textContent = past.length ? `${past.length} ${past.length === 1 ? 'prova concluída' : 'provas concluídas'} · ${withResult} com resultado` : '';
  view.innerHTML = past.length
    ? `<div class="list">${past.map(pastCard).join('')}</div>`
    : '<p class="empty">Ainda sem provas concluídas. As provas passam para aqui automaticamente depois da data.</p>';
}

/* ---------- Ficheiro .ics ---------- */

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
}

// Dobra linhas com mais de 75 octetos (RFC 5545 §3.1).
function icsFold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function ymd(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function buildICS(r) {
  const end = new Date(r._date.getFullYear(), r._date.getMonth(), r._date.getDate() + 1);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const desc = [
    r.modalidade && `Modalidade: ${r.modalidade}`,
    r.distancia && `Distância: ${r.distancia}`,
    r.objetivoTempo && `Objetivo: ${r.objetivoTempo}`,
    r.urlOficial && `Site oficial: ${r.urlOficial}`
  ].filter(Boolean).join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Max Provas//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${r.id}-${ymd(r._date)}@max-provas`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(r._date)}`,
    `DTEND;VALUE=DATE:${ymd(end)}`,
    `SUMMARY:${icsEscape(`🏁 ${r.nome}`)}`,
    r.local && `LOCATION:${icsEscape(r.local)}`,
    desc && `DESCRIPTION:${icsEscape(desc)}`,
    safeUrl(r.urlOficial) && `URL:${safeUrl(r.urlOficial)}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean);

  return lines.map(icsFold).join('\r\n') + '\r\n';
}

function downloadICS(id) {
  const r = races.find((x) => x.id === id);
  if (!r || !r._date) return;
  const blob = new Blob([buildICS(r)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${r.id}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Evento criado — abra o ficheiro para adicionar à agenda');
}

/* ---------- Navegação ---------- */

function currentTab() {
  const key = location.hash.replace('#', '');
  return VIEWS[key] ? key : 'provas';
}

function render() {
  const key = currentTab();
  const v = VIEWS[key];
  document.getElementById('view-title').textContent = v.title;
  document.title = key === 'provas' ? 'Max Provas' : `${v.title} · Max Provas`;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  v.render(document.getElementById('view'), document.getElementById('view-subtitle'));
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-ics]');
  if (btn) downloadICS(btn.dataset.ics);
});

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

// Atualiza contagens quando a app volta ao primeiro plano (ex.: no dia seguinte).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && races.length) render();
});

(async function init() {
  try {
    races = await loadRaces();
    render();
  } catch (err) {
    console.error(err);
    document.getElementById('view').innerHTML =
      `<p class="empty">Não foi possível carregar as provas.<br><small>${esc(err.message)}</small></p>`;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW:', err));
  }
})();
