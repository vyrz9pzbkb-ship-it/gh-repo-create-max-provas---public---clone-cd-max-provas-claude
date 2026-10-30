#!/usr/bin/env node
'use strict';

/*
 * Verifica o estado das inscrições de cada prova futura que tenha urlInscricao.
 *
 * Abre a página com o Chromium do Playwright (para sites que dependem de JavaScript),
 * procura palavras-chave em PT, ES, EN, FR, IT e DE e grava em cada prova:
 *   statusInscricao, statusMotivo (frase encontrada, máx. 100 caracteres), verificadoEm.
 * Erro, timeout, captcha, robots.txt ou página ambígua → "nao_verificado" (nunca um palpite).
 *
 * Uso:
 *   node scripts/check-status.js              # verifica tudo e grava
 *   node scripts/check-status.js --dry-run    # só mostra o resultado
 *   node scripts/check-status.js --pais=pt,es # só alguns países
 *   node scripts/check-status.js --id=ironman-703-cascais --verbose   # uma prova, com detalhe
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
const TIMEOUT_MS = 20000;   // tempo máximo por página
const MOTIVO_MAX = 100;
const REPO = process.env.GITHUB_REPOSITORY || 'max-provas';
const USER_AGENT = `MaxProvasStatusBot/1.0 (+https://github.com/${REPO}; verificação diária de inscrições)`;
const NTFY_TOPIC = process.env.NTFY_TOPIC || '';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
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
    /anmeldung (ist )?geschlossen/i, /anmeldeschluss erreicht/i
  ],
  aberta: [
    /register now/i, /inscreva-se/i, /inscr[ií]bete/i, /inscriptions? ouvertes?/i, /entries (are )?open/i,
    /registration (is )?(now )?open\b/i, /inscri[çc][õo]es abertas/i, /inscripciones abiertas/i,
    /iscrizioni aperte/i, /\biscriviti\b/i, /jetzt anmelden/i, /anmeldung (ist )?(ge)?(ö|oe)ffnet/i
  ],
  aguardando: [
    /coming soon/i, /\bem breve\b/i, /\bpr[óo]ximamente\b/i, /opens on/i, /registration opens/i,
    /inscri[çc][õo]es abrem/i, /inscripciones se abren/i, /\bbient[ôo]t\b/i, /ouverture des inscriptions/i,
    /\bprossimamente\b/i, /iscrizioni apriranno/i, /\bdemn[äa]chst\b/i, /anmeldung startet/i
  ]
};

// Num botão/link isolado, estes textos também indicam inscrições abertas.
const BUTTON_OPEN = /^(register|register here|sign up|enter now|inscrever|inscri[çc][ãa]o|inscribirse|inscr[ií]bete|s['’]inscrire|iscriviti|anmelden)$/i;

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

async function checkUrl(context, url, throttle) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { status: 'nao_verificado', motivo: 'URL inválido' };
  }
  const rules = await robotsRules(parsed.origin, throttle);
  if (!robotsAllows(rules, parsed.pathname + parsed.search)) {
    return { status: 'nao_verificado', motivo: 'Página excluída pelo robots.txt do site' };
  }

  const page = await context.newPage();
  const started = Date.now();
  try {
    await throttle();
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    if (!res) return { status: 'nao_verificado', motivo: 'Sem resposta do servidor' };
    if (res.status() >= 400) return { status: 'nao_verificado', motivo: `Erro HTTP ${res.status()}` };
    // Espera o carregamento completo (JavaScript e pedidos da página), sem passar dos 20 s no total.
    const left = TIMEOUT_MS - (Date.now() - started);
    if (left > 0) await page.waitForLoadState('networkidle', { timeout: left }).catch(() => {});
    const read = async () => {
      const { text, labels } = await page.evaluate(() => {
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
      const blocked = classify(text || '');
      if (blocked.motivo.startsWith('Página de verificação')) return { ...blocked, labels, text };
      return { ...(classifyButtons(labels) || classify(text || '')), labels, text };
    };
    let result = await read();
    // Páginas que só escrevem o conteúdo depois de carregar: espera um pouco e volta a ler.
    const remaining = TIMEOUT_MS - (Date.now() - started);
    if (result.motivo.startsWith('Nenhuma palavra-chave') && remaining > 1000) {
      await sleep(Math.min(remaining - 500, 4000));
      result = await read();
    }
    const { labels, text, ...out } = result;
    if (VERBOSE) {
      console.log(`  URL aberta: ${url}${page.url() !== url ? ` → ${page.url()}` : ''} (HTTP ${res.status()})`);
      console.log(`  Botões/badges (${labels.length}): ${labels.slice(0, 15).map((l) => `“${l}”`).join(', ')}`);
      console.log(`  Texto (início): ${clip(text.replace(/\s+/g, ' ').trim(), 300)}`);
    }
    return out;
  } catch (err) {
    const msg = String(err.message || err).split('\n')[0];
    if (VERBOSE) console.log(`  URL aberta: ${url} — falhou: ${msg}`);
    return {
      status: 'nao_verificado',
      motivo: clip(/timeout/i.test(msg) ? 'Timeout (20 s)' : `Erro: ${msg}`),
      redeFalhou: /net::ERR_(TUNNEL|PROXY|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|NETWORK|ADDRESS_UNREACHABLE)/.test(msg)
    };
  } finally {
    await page.close().catch(() => {});
  }
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
  return matchIronman(await ironmanCalendar(context, throttle), r);
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

async function main() {
  const today = todayIn('Europe/Madrid');
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const files = fs.readdirSync(RACES_DIR).filter((f) => f.endsWith('.json')).sort()
    .filter((f) => !ONLY.length || ONLY.includes(f.slice(0, -5)));

  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy });
  const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'pt-PT' });
  // Só o HTML/JS: imagens, vídeos e fontes não são precisos e poupam o servidor.
  await context.route('**/*', (route) =>
    ['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue());

  let last = 0;
  const throttle = async () => {
    const wait = last + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  };

  const byUrl = new Map(); // páginas partilhadas por várias provas são abertas uma vez
  const changes = [];
  const counts = { aberta: 0, aguardando: 0, esgotada: 0, nao_verificado: 0 };
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
      if (!r.urlInscricao && !/^IRONMAN/i.test(r.serie || '')) continue;
      const url = await urlToCheck(context, r, throttle, changes, pais);
      if (!url) continue;

      if (VERBOSE) console.log(`\n${pais}  ${r.nome} (${r.id})`);
      if (!byUrl.has(url)) byUrl.set(url, await checkUrl(context, url, throttle));
      const { status, motivo, redeFalhou } = byUrl.get(url);
      if (redeFalhou) networkFailures++;
      counts[status]++;
      console.log(`${pais}  ${STATUS_LABEL[status].padEnd(24)} ${r.nome} — ${motivo}`);

      const before = r.statusInscricao ?? null;
      if (before !== status) changes.push({ id: r.id, pais, prova: r.nome, de: before, para: status, motivo });

      if (status !== 'nao_verificado') {
        // Compara com o último estado lido de facto, para não alertar por falhas pontuais do site.
        const baseline = r.ultimoStatusVerificado ?? (before !== 'nao_verificado' ? before : null);
        if (r.favorita && baseline !== status) alerts.push([r, status]);
        r.ultimoStatusVerificado = status;
      }
      r.statusInscricao = status;
      r.statusMotivo = motivo;
      r.verificadoEm = nowIso;
      touched = true;
    }

    if (touched) pending.push([fullPath, races]);
  }
  await browser.close();

  // Sem rede nenhuma (ex.: firewall, falha do runner): gravar "não verificado" em tudo seria um palpite.
  const checked = Object.values(counts).reduce((a, b) => a + b, 0);
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

  console.log('\nResumo:');
  for (const [s, n] of Object.entries(counts)) console.log(`  ${STATUS_LABEL[s].padEnd(24)} ${n}`);
  console.log(`  Páginas abertas: ${byUrl.size} · mudanças: ${changes.length} · alertas: ${alerts.length}${NTFY_TOPIC ? '' : ' (sem NTFY_TOPIC, não enviados)'}`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changes.length > 0}\ncount=${changes.length}\n`);
  }
}

module.exports = { classify, classifyButtons, checkUrl, matchIronman, parseRobots, robotsAllows };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
