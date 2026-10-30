'use strict';

/* Max Provas — app em JS vanilla, sem dependências. */

const COUNTRIES_URL = 'data/countries.json';
const raceFileUrl = (codigo) => `data/races/${codigo}.json`;
const STORE_KEY = 'maxprovas.filtro';
const DEFAULT_COUNTRY = 'pt';
const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_GAP_DAYS = 28; // intervalos < 4 semanas são destacados

const STATUS = {
  aberta: { emoji: '🟢', label: 'Inscrições abertas' },
  aguardando: { emoji: '🟡', label: 'Aguardando abertura' },
  esgotada: { emoji: '🔴', label: 'Esgotada' }
};

const MODALITY_ICON = { Corrida: '🏃‍♂️', Triatlo: '🏊‍♂️🚴‍♂️🏃‍♂️', Ciclismo: '🚴‍♂️', 'Natação': '🏊‍♂️' };

const VIEWS = {
  provas: { title: 'Provas', render: renderUpcoming },
  temporada: { title: 'Temporada', render: renderSeason },
  historico: { title: 'Histórico', render: renderHistory }
};

const fmtLong = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtDate = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' });

let countries = [];      // data/countries.json (só países com provas)
let selected = [];       // códigos dos países escolhidos no filtro
let serieFilter = '';    // '' = todas as séries
let races = [];          // provas dos países escolhidos
const fileCache = new Map();

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

function countdownHTML(days) {
  if (days === 0) return '<strong>é hoje!</strong> 🔥';
  if (days === 1) return '<strong>é amanhã</strong>';
  return `faltam <strong>${days}</strong> dias`;
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

function countryOf(codigo) {
  return countries.find((c) => c.codigo === codigo);
}

function readFilter() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveFilter() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ paises: selected, serie: serieFilter }));
  } catch { /* modo privado: o filtro só não fica guardado */ }
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------- Dados ---------- */

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function loadCountries() {
  const list = await fetchJSON(COUNTRIES_URL);
  return list.filter((c) => c.provas > 0);
}

// Carrega apenas os ficheiros dos países escolhidos (com cache em memória).
async function loadSelected() {
  const lists = await Promise.all(selected.map(async (codigo) => {
    if (!fileCache.has(codigo)) {
      const list = await fetchJSON(raceFileUrl(codigo));
      fileCache.set(codigo, list.map((r) => ({ ...r, _pais: codigo, _key: `${codigo}:${r.id}`, _date: parseDate(r.data) })));
    }
    return fileCache.get(codigo);
  }));
  races = lists.flat();
  if (serieFilter && !races.some((r) => r.serie === serieFilter)) serieFilter = '';
}

function visible() {
  return serieFilter ? races.filter((r) => r.serie === serieFilter) : races;
}

function partition() {
  const t = today();
  const upcoming = [];
  const undated = [];
  const past = [];
  for (const r of visible()) {
    if (!r._date) undated.push(r);
    else if (r._date < t) past.push(r);
    else upcoming.push(r);
  }
  // Inscrições abertas primeiro; depois por data (sem data fica sempre no fim, em `undated`).
  const openFirst = (a, b) => (b.statusInscricao === 'aberta') - (a.statusInscricao === 'aberta');
  upcoming.sort((a, b) => openFirst(a, b) || a._date - b._date);
  past.sort((a, b) => b._date - a._date);
  undated.sort((a, b) => openFirst(a, b) || String(a.nome).localeCompare(String(b.nome), 'pt'));
  return { upcoming, undated, past, today: t };
}

/* ---------- Componentes ---------- */

function badge(status) {
  const s = STATUS[status];
  if (!s) return '<span class="badge unknown">Inscrições: ver site</span>';
  return `<span class="badge ${status}"><span aria-hidden="true">${s.emoji}</span>${s.label}</span>`;
}

function serieTag(r) {
  return r.serie ? `<span class="serie">${esc(r.serie)}</span>` : '';
}

function metaLine(r) {
  const parts = [];
  const prevista = r._date && r.dataConfirmada === false ? ' <span class="tag">data prevista</span>' : '';
  parts.push(`<span>📅 ${r._date ? esc(fmtLong.format(r._date)) : 'Data a confirmar'}${prevista}</span>`);
  const c = countryOf(r._pais);
  const flag = c && selected.length > 1 ? `${c.bandeira} ` : '';
  if (r.local || flag) parts.push(`<span>📍 ${flag}${esc(r.local || c.pais)}</span>`);
  const kind = [r.modalidade, r.distancia].filter(Boolean).map(esc).join(' · ');
  if (kind) parts.push(`<span>${MODALITY_ICON[r.modalidade] || '🏁'} ${kind}</span>`);
  return `<p class="meta">${parts.join('')}</p>`;
}

function upcomingCard(r, t) {
  const inscricao = safeUrl(r.urlInscricao);
  const oficial = safeUrl(r.urlOficial);
  const fonte = safeUrl(r.fonte);
  const countdown = r._date ? `<p class="countdown">${countdownHTML(daysBetween(t, r._date))}</p>` : '';
  const links = [
    oficial && `<a href="${esc(oficial)}" target="_blank" rel="noopener">Site oficial ↗</a>`,
    fonte && fonte !== oficial && `<a class="muted" href="${esc(fonte)}" target="_blank" rel="noopener">Fonte da data ↗</a>`
  ].filter(Boolean);

  const signup = inscricao
    ? `<a class="btn primary" href="${esc(inscricao)}" target="_blank" rel="noopener">Inscrever-me</a>`
    : '<span class="btn primary" aria-disabled="true" title="Link de inscrição por preencher">Inscrever-me</span>';

  const ics = `<button class="btn" type="button" data-ics="${esc(r._key)}" ${r._date ? '' : 'disabled title="Defina a data primeiro"'}>Adicionar à agenda</button>`;

  return `
    <article class="card">
      <div class="card-top">${badge(r.statusInscricao)}${serieTag(r)}</div>
      <h2>${esc(r.nome)}</h2>
      ${countdown}
      ${metaLine(r)}
      ${r.objetivoTempo ? `<p class="goal">🎯 Objetivo: <strong>${esc(r.objetivoTempo)}</strong></p>` : ''}
      <div class="actions">${signup}${ics}</div>
      ${links.length ? `<div class="link-row">${links.join('')}</div>` : ''}
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
      ${r.serie ? `<div class="card-top">${serieTag(r)}</div>` : ''}
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

  let html = filterBar();
  if (!n) {
    view.innerHTML = html + '<p class="empty">Sem provas futuras para este filtro.</p>';
    return;
  }

  if (upcoming.length) {
    html += `<div class="list">${upcoming.map((r) => upcomingCard(r, t)).join('')}</div>`;
  }
  if (undated.length) {
    html += `<h2 class="section-title">Data a confirmar</h2><div class="list">${undated.map((r) => upcomingCard(r, t)).join('')}</div>`;
  }
  html += updatedFooter();
  view.innerHTML = html;
}

// Data de verificação mais recente entre as provas (campo verificadoEm).
function updatedFooter() {
  const latest = visible().map((r) => parseDate(r.verificadoEm)).filter(Boolean).sort((a, b) => b - a)[0];
  return latest ? `<p class="updated">Atualizado em ${esc(fmtDate.format(latest))}</p>` : '';
}

function renderSeason(view, sub) {
  const { upcoming, undated, today: t } = partition();

  if (!upcoming.length) {
    sub.textContent = '';
    view.innerHTML = filterBar() + `<p class="empty">Ainda não há provas com data definida.${undated.length ? `<br>${undated.length} ${undated.length === 1 ? 'prova aguarda' : 'provas aguardam'} data.` : ''}</p>`;
    return;
  }

  const gaps = upcoming.slice(1).map((r, i) => daysBetween(upcoming[i]._date, r._date));
  const shortGaps = gaps.filter((d) => d < SHORT_GAP_DAYS).length;
  const minGap = gaps.length ? Math.min(...gaps) : null;
  const first = upcoming[0];
  const last = upcoming[upcoming.length - 1];
  sub.textContent = `${fmtShort.format(first._date)} → ${fmtShort.format(last._date)}`;

  let html = filterBar() + `
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
          <div class="tl-date">${esc(fmtLong.format(r._date))} ${serieTag(r)}</div>
          <h3>${esc(r.nome)}</h3>
          <p class="meta">${[r.local && `📍 ${selected.length > 1 ? countryOf(r._pais)?.bandeira || '' : ''} ${esc(r.local)}`, [r.modalidade, r.distancia].filter(Boolean).map(esc).join(' · ')].filter(Boolean).map((s) => `<span>${s}</span>`).join('')}</p>
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
  view.innerHTML = filterBar() + (past.length
    ? `<div class="list">${past.map(pastCard).join('')}</div>`
    : '<p class="empty">Ainda sem provas concluídas. As provas passam para aqui automaticamente depois da data.</p>');
}

/* ---------- Filtros: países e série ---------- */

function filterBar() {
  const chosen = selected.map(countryOf).filter(Boolean);
  const label = chosen.length === 1
    ? `${chosen[0].bandeira} ${esc(chosen[0].pais)}`
    : `${chosen.slice(0, 4).map((c) => c.bandeira).join(' ')}${chosen.length > 4 ? ' …' : ''} · ${chosen.length} países`;

  const counts = new Map();
  for (const r of races) if (r.serie) counts.set(r.serie, (counts.get(r.serie) || 0) + 1);
  const series = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const chip = (value, text) =>
    `<button type="button" class="chip" data-serie="${esc(value)}" aria-pressed="${serieFilter === value}">${text}</button>`;

  return `
    <div class="filters">
      <button type="button" class="country-btn" data-open-countries>🌍 ${label} <span aria-hidden="true">▾</span></button>
      ${series.length ? `<div class="chips" role="group" aria-label="Filtrar por série">${chip('', 'Todas as séries')}${series.map(([s, n]) => chip(s, `${esc(s)} · ${n}`)).join('')}</div>` : ''}
    </div>`;
}

function openCountrySheet() {
  const dlg = document.getElementById('country-sheet');
  const body = dlg.querySelector('.sheet-body');
  const groups = new Map();
  for (const c of countries) {
    if (!groups.has(c.continente)) groups.set(c.continente, []);
    groups.get(c.continente).push(c);
  }
  body.innerHTML = [...groups].map(([continente, list]) => `
    <h3 class="section-title">${esc(continente)}</h3>
    <div class="country-grid">${list.map((c) => `
      <label class="country">
        <input type="checkbox" value="${esc(c.codigo)}" ${selected.includes(c.codigo) ? 'checked' : ''}>
        <span>${c.bandeira} ${esc(c.pais)} · ${c.provas}</span>
      </label>`).join('')}
    </div>`).join('');
  updateSheetCount();
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}

function sheetSelection() {
  return [...document.querySelectorAll('#country-sheet input:checked')].map((i) => i.value);
}

function updateSheetCount() {
  const chosen = sheetSelection();
  const n = chosen.reduce((acc, codigo) => acc + (countryOf(codigo)?.provas || 0), 0);
  const btn = document.querySelector('#country-sheet [data-apply]');
  btn.disabled = !chosen.length;
  btn.textContent = chosen.length ? `Ver ${n} ${n === 1 ? 'prova' : 'provas'}` : 'Escolha um país';
}

async function applyCountries(codes) {
  selected = codes;
  saveFilter();
  document.getElementById('view').innerHTML = '<p class="empty">A carregar…</p>';
  try {
    await loadSelected();
  } catch (err) {
    console.error(err);
    toast('Não foi possível carregar alguns países');
  }
  saveFilter();
  render();
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

function downloadICS(key) {
  const r = races.find((x) => x._key === key);
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
  const ics = e.target.closest('[data-ics]');
  if (ics) return downloadICS(ics.dataset.ics);

  const chip = e.target.closest('[data-serie]');
  if (chip) {
    serieFilter = chip.dataset.serie;
    saveFilter();
    return render();
  }

  if (e.target.closest('[data-open-countries]')) return openCountrySheet();

  const dlg = document.getElementById('country-sheet');
  if (e.target.closest('[data-close]')) return dlg.close();
  if (e.target.closest('[data-clear]')) {
    dlg.querySelectorAll('input:checked').forEach((i) => { i.checked = false; });
    return updateSheetCount();
  }
  if (e.target.closest('[data-apply]')) {
    const codes = sheetSelection();
    dlg.close();
    window.scrollTo(0, 0);
    return applyCountries(codes);
  }
});

document.addEventListener('change', (e) => {
  if (e.target.closest('#country-sheet')) updateSheetCount();
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
    countries = await loadCountries();
    const saved = readFilter();
    const valid = (codes) => (Array.isArray(codes) ? codes : []).filter((c) => countryOf(c));
    selected = valid(saved.paises);
    if (!selected.length) selected = valid([DEFAULT_COUNTRY]);
    if (!selected.length && countries.length) selected = [countries[0].codigo];
    serieFilter = typeof saved.serie === 'string' ? saved.serie : '';
    await loadSelected();
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
