#!/usr/bin/env node
'use strict';

/*
 * Verifica o estado das inscrições de cada prova futura que tenha urlInscricao.
 *
 * Abre a página com o Chromium do Playwright (para sites que dependem de JavaScript),
 * procura palavras-chave em PT, ES, EN, FR, IT e DE e grava em cada prova:
 *   statusInscricao, statusMotivo (frase encontrada, máx. 100 caracteres), verificadoEm.
 * Erro, timeout, captcha, robots.txt ou página ambígua → a verificação falhou: mantém-se o último
 * status confirmado, e só ao fim de 3 dias seguidos de falha a prova passa a "nao_verificado".
 * Com "statusManual" preenchido, o robô não altera o status dessa prova.
 *
 * Uso:
 *   node scripts/check-status.js              # verifica tudo e grava
 *   node scripts/check-status.js --dry-run    # só mostra o resultado
 *   node scripts/check-status.js --pais=pt,es # só alguns países
 *   node scripts/check-status.js --id=ironman-703-cascais --verbose   # uma prova, com detalhe
 *   node scripts/check-status.js --diagnostico  # só as não verificadas: URL, HTTP, motivo e trecho (não grava)
 *
 * Regra de edições: quando a data de uma prova já passou, ela fica no Histórico e, se ainda não
 * existir, é criado o registo da próxima edição (data null = "Próxima edição a anunciar").
 * Se nenhuma página responder (sem rede), nada é gravado.
 *
 * Variáveis de ambiente opcionais:
 *   NTFY_TOPIC   tópico do ntfy.sh para alertas de provas favoritas
 *   HTTPS_PROXY  proxy para o Chromium (não é preciso no GitHub Actions)
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const RACES_DIR = path.join(ROOT, 'data', 'races');
const LOG_FILE = path.join(ROOT, 'data', 'status-log.json');

const DELAY_MS = 3000;      // no máximo 1 pedido a cada 3 segundos
const TIMEOUT_MS = 45000;   // tempo máximo por página (com uma nova tentativa em caso de timeout)
const FAIL_DAYS = 3;        // dias seguidos de falha até mostrar "não verificado"
const MOTIVO_MAX = 100;
const REPO = process.env.GITHUB_REPOSITORY || 'max-provas';
const USER_AGENT = `MaxProvasStatusBot/1.0 (+https://github.com/${REPO}; verificação diária de inscrições)`;
// Só usado quando o site bloqueia o user-agent identificado (403/429/captcha).
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const NTFY_TOPIC = process.env.NTFY_TOPIC || '';

const args = process.argv.slice(2);
const DIAGNOSTICO = args.includes('--diagnostico');
const DRY_RUN = args.includes('--dry-run') || DIAGNOSTICO;
const ONLY = (args.find((a) => a.startsWith('--pais=')) || '').slice(7).split(',').filter(Boolean);
const ONLY_IDS = (args.find((a) => a.startsWith('--id=')) || '').slice(5).split(',').filter(Boolean);
const VERBOSE = args.includes('--verbose');

const STATUS_LABEL = {
  aberta: '🟢 Inscrições abertas',
  aguardando: '🟡 Aguardando abertura',
  esgotada: '🔴 Esgotada',
  nao_verificado: '⚪ Não verificado'
};

// Palavras-chave por estado (PT, ES, EN, FR, IT, DE).
const KEYWORDS = {
  esgotada: [
    /sold[\s-]?out/i, /\besgotad[oa]s?\b/i, /\bagotad[oa]s?\b/i, /\bcomplets?\b/i, /\bausverkauft\b/i,
    /\bausgebucht\b/i, /\besaurit[oiae]\b/i, /\bwait[\s-]?list\b/i, /lista de espera/i,
    /liste d['’]attente/i, /\bwarteliste\b/i, /lista d['’]attesa/i,
    // Inscrições fechadas: já não é possível inscrever-se.
    /registration (is )?closed/i, /entries (are )?closed/i, /inscri[çc][õo]es encerradas/i,
    /inscripciones cerradas/i, /inscriptions? (closes|ferm[ée]es|cl[ôo]tur[ée]es)/i, /iscrizioni chiuse/i,
    /anmeldung (ist )?geschlossen/i, /anmeldeschluss erreicht/i,
    /\bwaiting list\b/i,
    /\b(registration|application|entries|entry|ballot|drawing|public places)\b[^.\n]{0,80}\b(is|are) (now )?(closed|at capacity)\b/i
  ],
  aberta: [
    /register now/i, /inscreva-se/i, /inscr[ií]bete/i, /inscriptions? ouvertes?/i, /entries (are )?open/i,
    /\bregist\w* (is |are )?(now )?open\b/i, /\bregistrations? for [^.\n]{0,60}\b(are|is) (now )?open\b/i,
    /\bregister for 20\d\d\b/i, /\banm[äa]l dig\b/i, /\bentries? (is |are )?(now )?open\b/i, /inscri[çc][õo]es abertas/i, /inscripciones abiertas/i,
    /iscrizioni aperte/i, /\biscriviti\b/i, /jetzt anmelden/i, /anmeldung (ist )?(ge)?(ö|oe)ffnet/i
  ],
  aguardando: [
    /coming soon/i, /\bem breve\b/i, /registration coming/i, /registration (for 20\d\d )?available (from |on )?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
    /inschrijving[^.\n]{0,60}van start/i, /\bpr[óo]ximamente\b/i, /opens on/i, /registration opens/i,
    /inscri[çc][õo]es abrem/i, /inscripciones se abren/i, /\bbient[ôo]t\b/i, /ouverture des inscriptions/i,
    /\bprossimamente\b/i, /iscrizioni apriranno/i, /\bdemn[äa]chst\b/i, /anmeldung startet/i
  ]
};

// Num botão/link isolado, estes textos também indicam inscrições abertas.
const BUTTON_OPEN = /^(register|register here|sign up|enter now|inscrever|inscri[çc][ãa]o|inscribirse|inscr[ií]bete|s['’]inscrire|iscriviti|anmelden)$|^(registration|inscripci[oó]n|inscri[çc][ãa]o) (for|para) \S/i;

// Páginas de verificação/bloqueio: não dá para ler o estado real.
const BLOQUEIO = /captcha|verify you are human|are you a robot|just a moment\.\.\.|checking your browser|attention required|access denied|cf-browser-verification|log in to facebook|log into facebook/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (s, n = MOTIVO_MAX) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ---------- Classificação ---------- */

// Devolve a frase (linha) onde a palavra-chave aparece, centrada nela e com no máximo 100 caracteres.
function phraseAround(text, index, length) {
  const start = text.lastIndexOf('\n', index) + 1;
  const endNl = text.indexOf('\n', index + length);
  const line = text.slice(start, endNl === -1 ? undefined : endNl).replace(/\s+/g, ' ').trim();
  if (line.length <= MOTIVO_MAX) return line;
  const pos = Math.max(0, index - start - 30);
  return clip(line.slice(pos).trim());
}

// Botões, links e badges (ex.: "Sold Out", "Waitlist", "Registration Closed") têm prioridade:
// são o elemento que o site usa para mostrar o estado da inscrição.
function classifyButtons(labels) {
  const found = {};
  for (const label of labels) {
    for (const [status, patterns] of Object.entries(KEYWORDS)) {
      if (!found[status] && patterns.some((re) => re.test(label))) found[status] = label;
    }
    if (!found.aberta && BUTTON_OPEN.test(label)) found.aberta = label;
  }
  const hits = Object.keys(found);
  return hits.length === 1 ? { status: hits[0], motivo: clip(`[botão] ${found[hits[0]]}`) } : null;
}

function classify(text) {
  if (BLOQUEIO.test(text.slice(0, 5000))) {
    return { status: 'nao_verificado', motivo: 'Página de verificação/captcha — não foi possível ler o estado' };
  }
  const found = {};
  for (const [status, patterns] of Object.entries(KEYWORDS)) {
    for (const re of patterns) {
      const m = re.exec(text);
      if (m) {
        found[status] = phraseAround(text, m.index, m[0].length);
        break;
      }
    }
  }
  const hits = Object.keys(found);
  if (hits.length === 1) return { status: hits[0], motivo: clip(found[hits[0]]) };
  if (hits.length === 0) return { status: 'nao_verificado', motivo: 'Nenhuma palavra-chave de inscrição encontrada na página' };
  return {
    status: 'nao_verificado',
    motivo: clip(`Ambíguo (${hits.join(' + ')}): ${hits.map((h) => `“${found[h]}”`).join(' / ')}`)
  };
}

/* ---------- robots.txt ---------- */

const robotsCache = new Map();

function parseRobots(txt) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (key === 'allow' || key === 'disallow')) current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const own = groups.filter((g) => g.agents.some((a) => a !== '*' && 'maxprovasstatusbot'.includes(a)));
  return (own.length ? own : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules);
}

function robotsAllows(rules, pathname) {
  let best = null;
  for (const r of rules) {
    if (!r.path) continue;
    const re = new RegExp(`^${r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
    if (re.test(pathname) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

async function robotsRules(origin, throttle) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let rules = [];
  try {
    await throttle();
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (res.ok) rules = parseRobots(await res.text());
  } catch {
    // Sem robots.txt acessível: segue as regras normais (a própria página ainda pode falhar).
  }
  robotsCache.set(origin, rules);
  return rules;
}

/* ---------- Verificação de uma página ---------- */

// Trecho útil do texto da página para o diagnóstico: à volta da primeira menção a inscrições.
function excerpt(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const m = /inscri|regist|entr(y|ies)|anmeld|iscri|ticket|bib|dorsal/i.exec(flat);
  const from = m ? Math.max(0, m.index - 40) : 0;
  return clip(flat.slice(from, from + 160), 160);
}

// Abre a página e lê o texto e os botões. Devolve também o código HTTP e o URL final.
async function loadPage(context, url, throttle) {
  const page = await context.newPage();
  const started = Date.now();
  try {
    await throttle();
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    const http = res ? res.status() : null;
    if (!res || http >= 400) return { http, finalUrl: page.url(), text: '', labels: [] };
    // Espera o carregamento completo (JavaScript e pedidos da página), dentro do limite.
    const left = TIMEOUT_MS - (Date.now() - started);
    if (left > 0) await page.waitForLoadState('networkidle', { timeout: left }).catch(() => {});
    const read = () => page.evaluate(() => {
      const sel = 'button, a, [role="button"], input[type="submit"], input[type="button"], '
        + '[class*="badge" i], [class*="status" i], [class*="pill" i], [class*="tag" i], [class*="label" i]';
      const labels = new Set();
      for (const el of document.querySelectorAll(sel)) {
        for (const t of [el.innerText, el.value, el.getAttribute('aria-label'), el.getAttribute('title')]) {
          const v = (t || '').replace(/\s+/g, ' ').trim();
          if (v && v.length <= 60) labels.add(v);
        }
      }
      return { text: document.body ? document.body.innerText : '', labels: [...labels] };
    });
    let content = await read();
    // Páginas que só escrevem o conteúdo depois de carregar: espera um pouco e volta a ler.
    const remaining = TIMEOUT_MS - (Date.now() - started);
    if (!classifyButtons(content.labels) && classify(content.text).motivo.startsWith('Nenhuma palavra-chave') && remaining > 1000) {
      await sleep(Math.min(remaining - 500, 5000));
      content = await read();
    }
    return { http, finalUrl: page.url(), ...content };
  } finally {
    await page.close().catch(() => {});
  }
}

function categorize(result) {
  const m = result.motivo;
  if (result.status !== 'nao_verificado') return 'ok';
  if (/robots\.txt/.test(m)) return 'robots.txt';
  if (/^Timeout/.test(m)) return 'timeout';
  if (/captcha/i.test(m)) return 'captcha';
  if (/HTTP (403|429)/.test(m)) return 'bloqueio';
  if (/HTTP 404/.test(m)) return 'link errado (404)';
  if (/HTTP/.test(m)) return 'erro HTTP';
  if (/^Ambíguo/.test(m)) return 'ambíguo';
  if (/^Nenhuma palavra-chave/.test(m)) return 'sem palavra-chave';
  return 'erro';
}

// Verifica uma página: até 45 s; em timeout tenta mais uma vez; se o site bloquear o
// user-agent identificado (403/429/captcha), tenta uma vez como navegador normal.
async function checkUrl(contexts, url, throttle) {
  const ctxs = contexts.bot ? contexts : { bot: contexts, browser: contexts };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { status: 'nao_verificado', motivo: 'URL inválido', categoria: 'erro', http: null, trecho: '' };
  }
  const rules = await robotsRules(parsed.origin, throttle);
  if (!robotsAllows(rules, parsed.pathname + parsed.search)) {
    return { status: 'nao_verificado', motivo: 'Página excluída pelo robots.txt do site', categoria: 'robots.txt', http: null, trecho: '' };
  }

  const attempt = async (context) => {
    try {
      const page = await loadPage(context, url, throttle);
      if (page.http === null) return { status: 'nao_verificado', motivo: 'Sem resposta do servidor', ...page };
      if (page.http >= 400) return { status: 'nao_verificado', motivo: `Erro HTTP ${page.http}`, ...page };
      const blocked = classify(page.text);
      const result = blocked.motivo.startsWith('Página de verificação') ? blocked
        : (classifyButtons(page.labels) || blocked);
      return { ...result, ...page };
    } catch (err) {
      const msg = String(err.message || err).split('\n')[0];
      return {
        status: 'nao_verificado',
        motivo: clip(/timeout/i.test(msg) ? `Timeout (${TIMEOUT_MS / 1000} s)` : `Erro: ${msg}`),
        http: null, finalUrl: url, text: '', labels: [],
        redeFalhou: /net::ERR_(TUNNEL|PROXY|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|NETWORK|ADDRESS_UNREACHABLE)/.test(msg)
      };
    }
  };

  let r = await attempt(ctxs.bot);
  let tentativa = 'bot';
  if (categorize(r) === 'timeout') {
    r = await attempt(ctxs.bot);
    tentativa = 'bot (2.ª tentativa)';
  }
  if (['bloqueio', 'captcha'].includes(categorize(r))) {
    r = await attempt(ctxs.browser);
    tentativa = 'navegador';
  }
  const { text, labels, ...out } = r;
  out.categoria = categorize(r);
  out.trecho = excerpt(text || '');
  out.tentativa = tentativa;
  if (VERBOSE) {
    console.log(`  URL: ${url}${out.finalUrl && out.finalUrl !== url ? ` → ${out.finalUrl}` : ''} (HTTP ${out.http ?? '—'}, ${tentativa})`);
    console.log(`  Botões/badges (${labels.length}): ${labels.slice(0, 15).map((l) => `“${l}”`).join(', ')}`);
    console.log(`  Trecho: ${out.trecho}`);
    console.log(`  Texto (até 1500 caracteres): ${clip((text || '').replace(/\s+/g, ' ').trim(), 1500)}`);
  }
  return out;
}

/* ---------- Dados ---------- */

const isIronmanHost = (u) => { try { return /(^|\.)ironman\.com$/i.test(new URL(u).hostname); } catch { return false; } };

const IRONMAN_CALENDAR = 'https://www.ironman.com/races';
let ironmanLinks = null;

// Lê uma vez o calendário oficial da IRONMAN e guarda os links das provas.
async function ironmanCalendar(context, throttle) {
  if (ironmanLinks) return ironmanLinks;
  ironmanLinks = [];
  const page = await context.newPage();
  try {
    await throttle();
    const res = await page.goto(IRONMAN_CALENDAR, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    if (res && res.status() < 400) {
      await page.waitForLoadState('networkidle', { timeout: TIMEOUT_MS }).catch(() => {});
      ironmanLinks = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
        .map((a) => ({ href: a.href, text: (a.innerText || '').replace(/\s+/g, ' ').trim() })));
    }
  } catch (err) {
    if (VERBOSE) console.log(`  Calendário IRONMAN: ${String(err.message || err).split('\n')[0]}`);
  } finally {
    await page.close().catch(() => {});
  }
  return ironmanLinks;
}

const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Procura no calendário oficial o link do evento: tem de ser do mesmo tipo (70.3 / full)
// e conter o nome do local. Só aceita quando há exatamente um candidato.
function matchIronman(links, r) {
  const is703 = /70\.3/.test(r.serie || r.nome);
  const places = normalize(`${r.nome} ${r.local || ''}`).replace(/ironman|70\.3/g, ' ')
    .split(/[^a-z]+/).filter((w) => w.length > 3);
  const candidates = new Set(links
    .filter((l) => isIronmanHost(l.href))
    .filter((l) => {
      const h = normalize(`${l.href} ${l.text}`);
      const kindOk = is703 ? /im703|70\.3/.test(h) : !/im703|70\.3/.test(h) && /\/(races\/)?im-/.test(h);
      return kindOk && places.some((w) => h.includes(w));
    })
    .map((l) => l.href.split(/[?#]/)[0]));
  return candidates.size === 1 ? [...candidates][0] : null;
}

async function findIronmanEventUrl(context, r, throttle) {
  const links = await ironmanCalendar(context, throttle);
  const found = matchIronman(links, r);
  console.log(`  Calendário IRONMAN (${IRONMAN_CALENDAR}): ${links.length} links lidos → ${found || 'nenhum candidato único'}`);
  if (VERBOSE) {
    const words = normalize(`${r.nome} ${r.local || ''}`).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && w !== 'ironman');
    for (const l of links.filter((x) => words.some((w) => normalize(`${x.href} ${x.text}`).includes(w))).slice(0, 25)) {
      console.log(`    link: ${l.href} — “${clip(l.text, 80)}”`);
    }
  }
  return found;
}

// Sem página própria: lê o card da prova no calendário oficial filtrado pelo país
// (ex.: https://www.ironman.com/races?facet%5B0%5D=country%3APT) e classifica só esse bloco de texto.
async function checkIronmanCalendar(context, r, pais, throttle) {
  const url = `${IRONMAN_CALENDAR}?facet%5B0%5D=country%3A${pais.toUpperCase()}`;
  const page = await context.newPage();
  try {
    await throttle();
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    const http = res ? res.status() : null;
    if (!res || http >= 400) return { status: 'nao_verificado', motivo: `Erro HTTP ${http}`, http, url, categoria: 'erro HTTP', trecho: '' };
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT_MS }).catch(() => {});
    const text = await page.evaluate(() => (document.body ? document.body.innerText : ''));
    const is703 = /70\.3/.test(r.serie || r.nome);
    const place = normalize(r.local || '').split(/[^a-z]+/).find((w) => w.length > 3) || '';
    // Bloco do card: linhas à volta da menção ao local, do tipo certo (70.3 ou full).
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    let block = '';
    for (let i = 0; i < lines.length; i++) {
      const l = normalize(lines[i]);
      if (place && l.includes(place) && (/70\.3/.test(l) === is703)) {
        block = lines.slice(Math.max(0, i - 3), i + 6).join('\n');
        break;
      }
    }
    if (VERBOSE) {
      console.log(`  URL: ${url} (HTTP ${http}, calendário oficial)`);
      console.log(`  Card encontrado: ${block ? block.replace(/\n/g, ' | ') : '(nenhum)'}`);
      if (!block) console.log(`  Texto (até 1500 caracteres): ${clip(text.replace(/\s+/g, ' ').trim(), 1500)}`);
    }
    if (!block) return { status: 'nao_verificado', motivo: 'Prova não encontrada no calendário oficial', http, url, categoria: 'sem palavra-chave', trecho: excerpt(text) };
    const result = classify(block);
    return { ...result, motivo: result.status === 'nao_verificado' ? result.motivo : clip(`[calendário ironman.com] ${result.motivo}`), http, url, categoria: categorize(result), trecho: clip(block.replace(/\n/g, ' | '), 160) };
  } catch (err) {
    const msg = String(err.message || err).split('\n')[0];
    return { status: 'nao_verificado', motivo: clip(/timeout/i.test(msg) ? `Timeout (${TIMEOUT_MS / 1000} s)` : `Erro: ${msg}`), http: null, url, categoria: 'erro', trecho: '' };
  } finally {
    await page.close().catch(() => {});
  }
}

// Página a verificar. Nas provas IRONMAN, a página oficial do evento em ironman.com tem prioridade;
// se ainda não a temos, procura-a no calendário oficial.
async function urlToCheck(context, r, throttle, changes, pais) {
  if (/^IRONMAN/i.test(r.serie || '')) {
    const official = [r.urlInscricao, r.urlOficial].find((u) => u && isIronmanHost(u));
    if (official) return official;
    const found = await findIronmanEventUrl(context, r, throttle);
    if (found) {
      changes.push({ id: r.id, pais, prova: r.nome, de: r.urlOficial, para: found, motivo: 'Página oficial encontrada no calendário ironman.com' });
      r.urlOficial = found;
      r.urlInscricao = found;
      return found;
    }
  }
  return r.urlInscricao || null;
}

const eventKey = (r) => r.evento || String(r.id).replace(/-\d{4}$/, '');

// Regra de edições: prova passada sem edição seguinte registada → cria a próxima (data por anunciar).
function ensureNextEditions(races, today, pais, log) {
  const added = [];
  for (const r of races) {
    if (!r.data || r.data >= today) continue;
    const key = eventKey(r);
    const hasNext = races.concat(added).some((o) => o !== r && eventKey(o) === key && (!o.data || o.data >= today));
    if (hasNext) continue;
    const year = Number(r.data.slice(0, 4)) + 1;
    const next = {
      id: `${key}-${year}`, nome: r.nome, ...(r.favorita ? { favorita: true } : {}), local: r.local,
      modalidade: r.modalidade, serie: r.serie ?? null, data: null, dataConfirmada: false, distancia: r.distancia ?? null,
      statusInscricao: null, urlOficial: r.urlOficial ?? null, urlInscricao: r.urlInscricao ?? r.urlOficial ?? null,
      fonte: null, verificadoEm: today, edicaoAnterior: r.id
    };
    added.push(next);
    log.push({ id: next.id, pais, prova: r.nome, de: `edição de ${r.data} (Histórico)`, para: 'próxima edição a anunciar', motivo: 'A data da prova já passou' });
  }
  races.push(...added);
  return added.length;
}

function todayIn(tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); // YYYY-MM-DD
}

// Mantém os campos de estado juntos, logo a seguir a statusInscricao.
function orderKeys(r) {
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === 'statusMotivo' || k === 'ultimoStatusVerificado') continue;
    out[k] = v;
    if (k === 'statusInscricao') {
      if ('statusMotivo' in r) out.statusMotivo = r.statusMotivo;
      if ('ultimoStatusVerificado' in r) out.ultimoStatusVerificado = r.ultimoStatusVerificado;
    }
  }
  return out;
}

async function notify(race, status) {
  if (!NTFY_TOPIC) return;
  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(NTFY_TOPIC)}`, {
      method: 'POST',
      body: `${STATUS_LABEL[status]}: ${race.nome}`,
      headers: {
        Title: 'Max Provas',
        Tags: status === 'aberta' ? 'runner,green_circle' : 'runner',
        ...(race.urlInscricao ? { Click: race.urlInscricao } : {})
      },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) console.warn(`  ntfy: HTTP ${res.status}`);
  } catch (err) {
    console.warn(`  ntfy: ${err.message}`);
  }
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

// Tabela das verificações que falharam: no terminal, no resumo do GitHub Actions e em linhas DIAG (JSON).
function printDiagnostics(rows) {
  if (!rows.length) return;
  const cell = (v) => String(v ?? '—').replace(/\|/g, '/').replace(/\s+/g, ' ');
  const lines = ['| País | Prova | URL usada | HTTP | Motivo | Detalhe | Trecho da página |', '|---|---|---|---|---|---|---|'];
  for (const d of rows) {
    lines.push(`| ${d.pais} | ${cell(d.nome)} | ${cell(d.url)} | ${cell(d.http)} | ${cell(d.categoria)} | ${cell(d.motivo)} | ${cell(d.trecho)} |`);
    console.log(`DIAG\t${JSON.stringify({ pais: d.pais, nome: d.nome, url: d.url, finalUrl: d.finalUrl, http: d.http, categoria: d.categoria, motivo: d.motivo, tentativa: d.tentativa, trecho: d.trecho })}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Verificações que falharam (${rows.length})\n\n${lines.join('\n')}\n`);
  }
}

async function main() {
  const today = todayIn('Europe/Madrid');
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const files = fs.readdirSync(RACES_DIR).filter((f) => f.endsWith('.json')).sort()
    .filter((f) => !ONLY.length || ONLY.includes(f.slice(0, -5)));

  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy });
  const newContext = async (userAgent) => {
    const ctx = await browser.newContext({ userAgent, locale: 'pt-PT', viewport: { width: 1280, height: 900 } });
    // Só o HTML/JS: imagens, vídeos e fontes não são precisos e poupam o servidor.
    await ctx.route('**/*', (route) =>
      ['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue());
    return ctx;
  };
  const contexts = { bot: await newContext(USER_AGENT), browser: await newContext(BROWSER_UA) };
  const context = contexts.bot;

  let last = 0;
  const throttle = async () => {
    const wait = last + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  };

  const byUrl = new Map(); // páginas partilhadas por várias provas são abertas uma vez
  const changes = [];
  const counts = { aberta: 0, aguardando: 0, esgotada: 0, nao_verificado: 0, sem_status: 0, manual: 0 };
  const diag = []; // verificações que falharam (diagnóstico)
  const alerts = [];
  const pending = []; // ficheiros a gravar no fim (só se houve rede)
  let networkFailures = 0;

  for (const file of files) {
    const pais = file.slice(0, -5);
    const fullPath = path.join(RACES_DIR, file);
    const races = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    let touched = !ONLY_IDS.length && ensureNextEditions(races, today, pais, changes) > 0;

    for (const r of races) {
      if (ONLY_IDS.length && !ONLY_IDS.includes(r.id)) continue;
      if (r.data && r.data < today) continue; // prova já passou: fica no Histórico
      if (DIAGNOSTICO && r.statusInscricao !== 'nao_verificado' && !r.falhaDesde) continue;
      if (r.statusManual) {
        counts.manual++;
        console.log(`${pais}  ${'✋ Manual: ' + r.statusManual}`.padEnd(28) + ` ${r.nome} — statusManual tem prioridade, não verificado`);
        continue;
      }
      if (!r.urlInscricao && !/^IRONMAN/i.test(r.serie || '')) continue;
      const url = await urlToCheck(context, r, throttle, changes, pais);
      if (!url) continue;

      if (VERBOSE) console.log(`\n${pais}  ${r.nome} (${r.id})`);
      const ironmanSemPagina = /^IRONMAN/i.test(r.serie || '') && !isIronmanHost(url);
      const key = ironmanSemPagina ? `ironman-cal:${pais}:${r.id}` : url;
      if (!byUrl.has(key)) {
        byUrl.set(key, ironmanSemPagina ? await checkIronmanCalendar(contexts.browser, r, pais, throttle) : await checkUrl(contexts, url, throttle));
      }
      const res = byUrl.get(key);
      const { status, motivo, redeFalhou } = res;
      if (redeFalhou) networkFailures++;
      if (status === 'nao_verificado') diag.push({ pais, nome: r.nome, url: res.url || url, ...res });
      const before = r.statusInscricao ?? null;

      if (status !== 'nao_verificado') {
        // Compara com o último estado lido de facto, para não alertar por falhas pontuais do site.
        const baseline = r.ultimoStatusVerificado ?? (before !== 'nao_verificado' ? before : null);
        if (r.favorita && baseline !== status) alerts.push([r, status]);
        r.ultimoStatusVerificado = status;
        r.statusInscricao = status;
        r.statusMotivo = motivo;
        r.verificadoEm = nowIso;
        delete r.falhaDesde;
        delete r.falhaMotivo;
      } else {
        // Falhou: mantém o último status confirmado; só ao fim de 3 dias seguidos mostra "não verificado".
        r.falhaDesde = r.falhaDesde || today;
        r.falhaMotivo = motivo;
        const failingDays = daysBetween(r.falhaDesde, today) + 1;
        const kept = r.ultimoStatusVerificado ?? (before !== 'nao_verificado' ? before : null);
        r.statusInscricao = failingDays >= FAIL_DAYS ? 'nao_verificado' : kept;
      }
      const now = r.statusInscricao ?? null;
      counts[now ?? 'sem_status']++;
      console.log(`${pais}  ${(now ? STATUS_LABEL[now] : '— sem status').padEnd(24)} ${r.nome} — ${status === 'nao_verificado' ? `falhou (${res.categoria}): ` : ''}${motivo}`);
      if (before !== now) changes.push({ id: r.id, pais, prova: r.nome, de: before, para: now, motivo });
      touched = true;
    }

    if (touched) pending.push([fullPath, races]);
  }
  await browser.close();

  // Sem rede nenhuma (ex.: firewall, falha do runner): gravar "não verificado" em tudo seria um palpite.
  const checked = Object.entries(counts).filter(([k]) => k !== 'manual').reduce((a, [, b]) => a + b, 0);
  const noNetwork = checked > 0 && networkFailures === checked;
  if (noNetwork) {
    console.warn(`\n⚠️  Nenhuma página respondeu (${networkFailures} falhas de rede). Nenhum status foi alterado.`);
    changes.splice(0, changes.length, ...changes.filter((c) => c.para === 'próxima edição a anunciar'));
    alerts.length = 0;
    // A regra de edições não depende da rede: aplica-a sobre os ficheiros originais.
    if (!DRY_RUN && !ONLY_IDS.length) {
      for (const [fullPath] of pending) {
        const races = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        if (ensureNextEditions(races, today, path.basename(fullPath, '.json'), [])) {
          fs.writeFileSync(fullPath, `${JSON.stringify(races.map(orderKeys), null, 2)}\n`);
        }
      }
      if (changes.length) {
        fs.writeFileSync(LOG_FILE, `${JSON.stringify({ data: today, geradoEm: nowIso, mudancas: changes }, null, 2)}\n`);
      }
    }
  }

  if (!DRY_RUN && !noNetwork) {
    for (const [fullPath, races] of pending) {
      fs.writeFileSync(fullPath, `${JSON.stringify(races.map(orderKeys), null, 2)}\n`);
    }
    for (const [race, status] of alerts) await notify(race, status);
    if (changes.length) {
      fs.writeFileSync(LOG_FILE, `${JSON.stringify({ data: today, geradoEm: nowIso, mudancas: changes }, null, 2)}\n`);
    }
  }

  printDiagnostics(diag);

  console.log('\nResumo (status após esta execução):');
  const label = { ...STATUS_LABEL, sem_status: '— Sem status', manual: '✋ statusManual' };
  for (const [s, n] of Object.entries(counts)) console.log(`  ${label[s].padEnd(24)} ${n}`);
  console.log(`  Verificações que falharam hoje: ${diag.length}`);
  console.log(`  Páginas abertas: ${byUrl.size} · mudanças: ${changes.length} · alertas: ${alerts.length}${NTFY_TOPIC ? '' : ' (sem NTFY_TOPIC, não enviados)'}`);

  if (process.env.GITHUB_OUTPUT) {
    const changed = !DRY_RUN && changes.length > 0;
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\ncount=${changed ? changes.length : 0}\n`);
  }
}

module.exports = { classify, classifyButtons, checkUrl, matchIronman, parseRobots, robotsAllows };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
