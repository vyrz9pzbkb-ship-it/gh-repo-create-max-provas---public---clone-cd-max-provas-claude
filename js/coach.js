'use strict';

/* Coach do Max Provas: busca de provas em linguagem natural.
 * 1) O Worker extrai os filtros do pedido; 2) a app procura na base (data/races);
 * 3) o Worker escolhe as melhores da base ou, com menos de 3, procura na web. */

const COACH_EXEMPLOS = [
  'meia maratona plana na Europa em março',
  'primeiro triatlo sprint perto de Madrid',
  'maratona rápida para bater o meu recorde em 2027',
  'travessia em águas abertas no Brasil',
  'gran fondo de montanha no verão'
];
const USER_KEY = 'maxprovas.usuario';
const MAX_CANDIDATOS = 30;

const MODO_KEY = 'maxprovas.coachModo';
let coachModo = readJSON(MODO_KEY, 'chat') === 'busca' ? 'busca' : 'chat';

// Seletor dos dois modos da aba Coach: conversa (js/chat.js) e busca de provas (este ficheiro).
function coachModeSwitch() {
  const b = (modo, texto) =>
    `<button type="button" role="tab" data-coach-modo="${modo}" aria-selected="${coachModo === modo}">${texto}</button>`;
  return `<div class="seg" role="tablist" aria-label="Modo do Coach">${b('chat', '💬 Conversar')}${b('busca', '🔎 Buscar provas')}</div>`;
}

const coach = { pedido: '', estado: 'inicio', passo: '', erro: '', resumo: '', opcoes: [], restantes: null, origem: '' };

function coachApi() {
  const url = (window.MAX_PROVAS_CONFIG && window.MAX_PROVAS_CONFIG.coachApi) || '';
  return url.replace(/\/+$/, '');
}

function coachUser() {
  let id = readJSON(USER_KEY, null);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `u-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    writeJSON(USER_KEY, id);
  }
  return id;
}

async function coachPost(body) {
  const res = await fetch(`${coachApi()}/coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Max-Provas-User': coachUser() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`);
  return data;
}

/* ---------- Busca na base ---------- */

// Categoria de distância a partir do texto da prova (nome + distância).
function matchesDistance(r, cat) {
  const t = `${r.distancia || ''} ${r.nome || ''}`.toLowerCase();
  const meia = /21[,.]1|21 ?k|half|meia|medio|mitja|semi|halb/.test(t);
  switch (cat) {
    case '5k': return /\b5 ?km?\b/.test(t);
    case '10k': return /\b10 ?km?\b/.test(t);
    case 'meia': return meia;
    case 'maratona': return /42[,.]?195|\b42 ?k/.test(t) || (/marat/.test(t) && !meia);
    case 'ultra': return /ultra|\b(5\d|[6-9]\d|1\d\d) ?km\b/.test(t) && r.modalidade === 'Corrida';
    case 'sprint': return /sprint/.test(t);
    case 'olimpico': return /ol[ií]mpic|olympic|standard|5150/.test(t);
    case 'media': return /70\.3|1,9 km|middle|m[eé]dia dist|\b100 km\b/.test(t);
    case 'longa': return /3,8 km|longa|long distance|\bfull\b|180 km/.test(t);
    case 'gran-fondo': return r.modalidade === 'Ciclismo';
    case 'aguas-abertas': return r.modalidade === 'Natação';
    default: return true;
  }
}

async function coachCandidates(filtros) {
  const codes = filtros.paises && filtros.paises.length ? filtros.paises : countries.map((c) => c.codigo);
  const lists = await Promise.all(codes.filter((c) => countryOf(c)).map((c) => loadCountryFile(c).catch(() => [])));
  const hoje = ymd(today()).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  const { de, ate } = filtros.periodo || {};
  return lists.flat()
    .filter((r) => (r.data ? r.data >= hoje : !de && !ate))
    .filter((r) => !filtros.modalidade || r.modalidade === filtros.modalidade)
    .filter((r) => !filtros.distancia || matchesDistance(r, filtros.distancia))
    .filter((r) => (!de || (r.data && r.data >= de)) && (!ate || (r.data && r.data <= ate)))
    .sort((a, b) => String(a.data || '9999').localeCompare(String(b.data || '9999')))
    .slice(0, MAX_CANDIDATOS);
}

const compactRace = (r) => ({
  chave: r._key, nome: r.nome, data: r.data, local: r.local, pais: countryOf(r._pais)?.pais || null,
  modalidade: r.modalidade, distancia: r.distancia, serie: r.serie, inscricoes: statusOf(r) || null
});

async function coachSearch(pedido) {
  coach.pedido = pedido;
  coach.estado = 'carregando';
  coach.erro = '';
  coach.opcoes = [];
  coach.passo = 'A perceber o que procura…';
  renderIfCoach();
  try {
    const { filtros } = await coachPost({
      etapa: 'filtros', pedido,
      paises: countries.map((c) => ({ codigo: c.codigo, pais: c.pais, continente: c.continente }))
    });
    coach.resumo = filtros.resumo;
    coach.passo = 'A procurar na base do Max Provas…';
    renderIfCoach();

    const candidatos = await coachCandidates(filtros);
    coach.passo = candidatos.length >= 3
      ? `A escolher entre ${candidatos.length} provas da base…`
      : 'Poucas provas na base: a procurar nos sites oficiais…';
    renderIfCoach();

    const res = await coachPost({ etapa: 'opcoes', pedido, filtros, candidatos: candidatos.map(compactRace) });
    const byKey = new Map(candidatos.map((r) => [r._key, r]));
    coach.opcoes = res.opcoes
      .map((o) => (o.origem === 'base' ? { ...o, race: byKey.get(o.chave) } : o))
      .filter((o) => o.origem === 'web' || o.race);
    coach.restantes = res.buscasWebRestantes;
    coach.origem = res.origem;
    coach.estado = 'pronto';
  } catch (err) {
    coach.estado = 'erro';
    coach.erro = err.message || 'Não foi possível fazer a busca.';
  }
  renderIfCoach();
}

function renderIfCoach() {
  if (currentTab() === 'coach') render();
}

/* ---------- Favoritar ---------- */

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

function webRaceRecord(o) {
  return {
    id: `busca-${slug(o.nome)}-${o.data || 'sem-data'}`,
    nome: o.nome,
    favorita: true,
    adicionadaPelaBusca: true,
    local: o.cidade || null,
    modalidade: o.modalidade || null,
    serie: null,
    data: o.data || null,
    dataConfirmada: Boolean(o.dataConfirmada),
    distancia: o.distancia || null,
    statusInscricao: null,
    urlOficial: o.urlOficial || null,
    urlInscricao: o.urlOficial || null,
    fonte: o.fonte,
    verificadoEm: ymd(today()).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
    codigoPais: o.codigoPais || null,
    paisNome: o.pais || null,
    motivoBusca: o.porque
  };
}

function coachIsFav(o) {
  if (o.origem === 'base') return isFav(o.race);
  return favPrefs[`local:${webRaceRecord(o).id}`] === true;
}

async function coachToggleFav(i) {
  const o = coach.opcoes[i];
  if (!o) return;
  if (o.origem === 'base') {
    setFav(o.race._key, !isFav(o.race));
  } else {
    const rec = webRaceRecord(o);
    const key = `local:${rec.id}`;
    if (favPrefs[key] === true) {
      setFav(key, false);
      removeLocalRace(rec.id);
      toast('Removida das favoritas');
    } else if (saveLocalRace(rec)) {
      setFav(key, true);
      toast('Guardada nas suas provas');
    } else {
      toast('Não foi possível guardar neste dispositivo');
    }
    await loadSelected();
  }
  render();
}

/* ---------- Ecrã ---------- */

function coachCard(o, i) {
  const web = o.origem === 'web';
  const r = o.race;
  const nome = web ? o.nome : r.nome;
  const date = web ? parseDate(o.data) : r._date;
  const c = web ? countryOf(o.codigoPais) : countryOf(r._pais);
  const lugar = [web ? o.cidade : r.local, web ? (c?.pais || o.pais) : c?.pais].filter(Boolean);
  const distancia = web ? o.distancia : r.distancia;
  const modalidade = web ? o.modalidade : r.modalidade;
  const fonte = safeUrl(web ? o.fonte : (r.fonte || r.urlOficial));
  const inscricao = safeUrl(web ? o.urlOficial : (r.urlInscricao || r.urlOficial));
  const fav = coachIsFav(o);
  const prevista = !web && r._date && r.dataConfirmada === false ? ' <span class="tag">data prevista</span>' : '';

  return `
    <article class="card coach-card">
      <div class="card-top">
        <span class="origem ${web ? 'web' : 'base'}">${web ? '🌐 da web' : '📚 da base'}</span>
        ${!web ? serieTag(r) : ''}
      </div>
      <h2>${esc(nome)}</h2>
      <p class="meta">
        <span>📅 ${date ? esc(fmtLong.format(date)) : 'data a confirmar'}${prevista}</span>
        ${lugar.length ? `<span>📍 ${c ? `${c.bandeira} ` : ''}${esc(lugar.join(', '))}</span>` : ''}
        ${modalidade || distancia ? `<span>${MODALITY_ICON[modalidade] || '🏁'} ${esc([modalidade, distancia].filter(Boolean).join(' · '))}</span>` : ''}
      </p>
      ${o.porque ? `<p class="porque"><strong>Porque combina:</strong> ${esc(o.porque)}</p>` : ''}
      <div class="actions">
        <button type="button" class="btn ${fav ? 'is-fav' : ''}" data-coach-fav="${i}" aria-pressed="${fav}">${fav ? '★ Favorita' : '⭐ Favoritar'}</button>
        ${inscricao
          ? `<a class="btn primary" href="${esc(inscricao)}" target="_blank" rel="noopener">Inscrever-me</a>`
          : '<span class="btn primary" aria-disabled="true">Inscrever-me</span>'}
      </div>
      <div class="link-row">${fonte ? `<a class="muted" href="${esc(fonte)}" target="_blank" rel="noopener">Fonte: ${esc(new URL(fonte).hostname.replace(/^www\./, ''))} ↗</a>` : '<span class="muted">Sem fonte</span>'}</div>
    </article>`;
}

function renderCoach(view, sub) {
  if (coachModo === 'chat') return renderChat(view, sub);
  sub.textContent = 'Descreva a prova e o Coach procura por si';
  const configured = Boolean(coachApi());
  let resultados = '';
  if (!configured) {
    resultados = '<p class="empty">O Coach ainda não está ligado: falta o endereço do Worker em <code>js/config.js</code> (ver README).</p>';
  } else if (coach.estado === 'carregando') {
    resultados = `<p class="coach-status" role="status"><span class="spinner" aria-hidden="true"></span>${esc(coach.passo)}</p>`;
  } else if (coach.estado === 'erro') {
    resultados = `<p class="empty">${esc(coach.erro)}</p>`;
  } else if (coach.estado === 'pronto') {
    const extra = coach.restantes == null ? '' : ` · ${coach.restantes} ${coach.restantes === 1 ? 'busca' : 'buscas'} na web restantes hoje`;
    resultados = coach.opcoes.length
      ? `<p class="coach-status">${esc(coach.resumo || '')}${extra}</p><div class="list">${coach.opcoes.map(coachCard).join('')}</div>`
      : `<p class="empty">Não encontrei provas que combinem com o pedido.${extra}</p>`;
  }

  view.innerHTML = `
    ${coachModeSwitch()}
    <form class="coach-box" data-coach-form>
      <label for="coach-pedido" class="coach-label">O que você procura?</label>
      <div class="coach-input">
        <textarea id="coach-pedido" rows="2" maxlength="300" placeholder="Ex.: meia maratona plana na Europa em março" ${configured ? '' : 'disabled'}>${esc(coach.pedido)}</textarea>
        <button type="submit" class="btn primary" ${configured && coach.estado !== 'carregando' ? '' : 'disabled'}>Buscar</button>
      </div>
      <div class="chips coach-exemplos" role="group" aria-label="Exemplos">
        ${COACH_EXEMPLOS.map((e) => `<button type="button" class="chip" data-coach-exemplo="${esc(e)}" ${configured ? '' : 'disabled'}>${esc(e)}</button>`).join('')}
      </div>
    </form>
    ${resultados}`;
}

VIEWS.coach = { title: 'Coach', render: renderCoach };

document.addEventListener('submit', (e) => {
  if (!e.target.closest('[data-coach-form]')) return;
  e.preventDefault();
  const pedido = document.getElementById('coach-pedido').value.trim();
  if (pedido && coach.estado !== 'carregando') coachSearch(pedido);
});

document.addEventListener('click', (e) => {
  const modo = e.target.closest('[data-coach-modo]');
  if (modo) {
    coachModo = modo.dataset.coachModo;
    writeJSON(MODO_KEY, coachModo);
    return render();
  }
  const exemplo = e.target.closest('[data-coach-exemplo]');
  if (exemplo && coach.estado !== 'carregando') return coachSearch(exemplo.dataset.coachExemplo);
  const fav = e.target.closest('[data-coach-fav]');
  if (fav) coachToggleFav(Number(fav.dataset.coachFav));
});

document.addEventListener('keydown', (e) => {
  // Enter envia; Shift+Enter muda de linha.
  if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'coach-pedido') {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
});
