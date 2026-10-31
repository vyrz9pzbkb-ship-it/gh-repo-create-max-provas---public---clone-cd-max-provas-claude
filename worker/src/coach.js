// Lógica do Coach sem I/O: esquemas, prompts e validações. Testável sem chamar a API.

export const MODEL = 'claude-opus-5-5';
// Fallback do lado do servidor: se o modelo recusar o pedido, a API tenta outro modelo no mesmo pedido.
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
export const LIMITE_WEB_DIA = 10;     // buscas na web por utilizador por dia
export const LIMITE_WEB_IP_DIA = 30;  // proteção extra contra ids inventados
export const MAX_OPCOES = 5;

export const MODALIDADES = ['Corrida', 'Triatlo', 'Ciclismo', 'Natação'];
export const DISTANCIAS = ['5k', '10k', 'meia', 'maratona', 'ultra', 'sprint', 'olimpico', 'media', 'longa',
  'gran-fondo', 'aguas-abertas'];
export const NIVEIS = ['iniciante', 'intermedio', 'avancado'];

// Agregadores de calendários: ficam de fora para a busca ir aos sites oficiais das provas.
export const AGREGADORES = ['ahotu.com', 'racefinder.pt', 'worldsmarathons.com', 'runningintheusa.com',
  'findarace.com', 'raceraves.com', 'marathonscout.com', 'sundaymarathon.com', 'finishers.com',
  'portugalrunning.com', 'running.life', 'racecenter.com'];

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });

export const FILTROS_SCHEMA = {
  type: 'object',
  properties: {
    modalidade: nullable({ type: 'string', enum: MODALIDADES }),
    distancia: nullable({ type: 'string', enum: DISTANCIAS }),
    paises: { type: 'array', items: { type: 'string' } },
    regiao: nullable({ type: 'string' }),
    periodo: {
      type: 'object',
      properties: { de: nullable({ type: 'string' }), ate: nullable({ type: 'string' }) },
      required: ['de', 'ate'],
      additionalProperties: false
    },
    nivel: nullable({ type: 'string', enum: NIVEIS }),
    preferencias: { type: 'array', items: { type: 'string' } },
    resumo: { type: 'string' }
  },
  required: ['modalidade', 'distancia', 'paises', 'regiao', 'periodo', 'nivel', 'preferencias', 'resumo'],
  additionalProperties: false
};

export const ESCOLHA_BASE_SCHEMA = {
  type: 'object',
  properties: {
    opcoes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { chave: { type: 'string' }, porque: { type: 'string' } },
        required: ['chave', 'porque'],
        additionalProperties: false
      }
    }
  },
  required: ['opcoes'],
  additionalProperties: false
};

export const OPCOES_WEB_SCHEMA = {
  type: 'object',
  properties: {
    opcoes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          data: nullable({ type: 'string' }),
          evidenciaData: nullable({ type: 'string' }),
          cidade: nullable({ type: 'string' }),
          pais: nullable({ type: 'string' }),
          codigoPais: nullable({ type: 'string' }),
          modalidade: nullable({ type: 'string', enum: MODALIDADES }),
          distancia: nullable({ type: 'string' }),
          porque: { type: 'string' },
          urlOficial: nullable({ type: 'string' }),
          fonte: nullable({ type: 'string' })
        },
        required: ['nome', 'data', 'evidenciaData', 'cidade', 'pais', 'codigoPais', 'modalidade', 'distancia',
          'porque', 'urlOficial', 'fonte'],
        additionalProperties: false
      }
    }
  },
  required: ['opcoes'],
  additionalProperties: false
};

/* ---------- Prompts ---------- */

export const SYSTEM_FILTROS = `Extrais filtros de busca de provas desportivas (corrida, triatlo, ciclismo, natação em águas abertas) a partir de um pedido em linguagem natural, em português ou outra língua.
- "paises": só códigos da lista de países fornecida que correspondam à região pedida (ex.: "Europa" → todos os códigos europeus da lista; "perto de Madrid" → "es" e, se fizer sentido, "pt"/"fr"). Lista vazia = sem restrição.
- "periodo": datas YYYY-MM-DD inclusivas, calculadas a partir da data de hoje fornecida; um mês sem ano é a próxima ocorrência desse mês. null quando o pedido não fala de datas.
- "distancia": a categoria que melhor descreve o pedido, ou null.
- "preferencias": características pedidas, em palavras curtas (ex.: "percurso plano", "praia", "rápida", "primeira prova").
- "resumo": uma frase curta, em português, a descrever o que vais procurar.`;

export const SYSTEM_ESCOLHA_BASE = `Escolhes, de uma lista de provas candidatas, as que melhor correspondem ao pedido do utilizador (no máximo ${MAX_OPCOES}), por ordem de adequação.
- Usa só provas da lista, identificadas pelo campo "chave" exatamente como vem.
- "porque": uma frase curta em português a explicar porque combina com o pedido, baseada apenas nos dados da candidata e em conhecimento geral sobre a prova (ex.: percurso conhecido por ser plano). Se não tiveres a certeza de uma característica, não a afirmes.
- Se nenhuma candidata servir, devolve a lista vazia.`;

export const SYSTEM_PESQUISA_WEB = `Procuras provas desportivas reais que correspondam a um pedido. Dá prioridade aos sites oficiais das provas e dos organizadores; usa notícias ou calendários apenas para descobrir a prova e depois procura a página oficial.
Para cada prova encontrada (no máximo ${MAX_OPCOES}), indica: nome, data da próxima edição, cidade, país, distância e o URL do site oficial.
Regras:
- Nunca inventes datas nem links. Só indica uma data se uma página que encontraste a mostrar, e cita essa página. Se não encontrares a data confirmada, escreve "data a confirmar".
- Só indica URLs que apareceram nos resultados da pesquisa.
- Ignora edições que já aconteceram antes da data de hoje fornecida.`;

export const SYSTEM_ESTRUTURA_WEB = `Convertes uma pesquisa de provas desportivas numa lista estruturada (no máximo ${MAX_OPCOES} opções).
Regras obrigatórias:
- "urlOficial" e "fonte" têm de ser URLs da lista "fontes" fornecida, copiados exatamente. Se não houver um URL adequado, usa null.
- "fonte" é a página de onde vem a informação da prova (de preferência o site oficial).
- "data" no formato YYYY-MM-DD só se a data aparecer numa citação; "evidenciaData" é o trecho exato dessa citação que mostra a data (copiado de "citacoes"). Caso contrário, "data" e "evidenciaData" são null.
- "codigoPais": código ISO 3166-1 alfa-2 em minúsculas (ex.: "es"), ou null.
- "porque": uma frase curta em português a explicar porque combina com o pedido.
- Não incluas provas que não apareçam na pesquisa.`;

export function promptFiltros(pedido, paises, hoje) {
  return JSON.stringify({ hoje, pedido, paisesDisponiveis: paises });
}

/* ---------- Validação ---------- */

const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const dataValida = (s) => typeof s === 'string' && ISO_DATA.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function validarFiltros(f, codigosValidos) {
  const out = {
    modalidade: MODALIDADES.includes(f?.modalidade) ? f.modalidade : null,
    distancia: DISTANCIAS.includes(f?.distancia) ? f.distancia : null,
    paises: Array.isArray(f?.paises) ? [...new Set(f.paises.map((c) => String(c).toLowerCase()))].filter((c) => codigosValidos.has(c)) : [],
    regiao: typeof f?.regiao === 'string' ? f.regiao.slice(0, 80) : null,
    periodo: {
      de: dataValida(f?.periodo?.de) ? f.periodo.de : null,
      ate: dataValida(f?.periodo?.ate) ? f.periodo.ate : null
    },
    nivel: NIVEIS.includes(f?.nivel) ? f.nivel : null,
    preferencias: Array.isArray(f?.preferencias) ? f.preferencias.map((p) => String(p).slice(0, 40)).slice(0, 8) : [],
    resumo: typeof f?.resumo === 'string' ? f.resumo.slice(0, 200) : ''
  };
  if (out.periodo.de && out.periodo.ate && out.periodo.de > out.periodo.ate) out.periodo = { de: out.periodo.ate, ate: out.periodo.de };
  return out;
}

export function validarEscolhaBase(resposta, candidatos) {
  const chaves = new Set(candidatos.map((c) => c.chave));
  const vistos = new Set();
  const opcoes = [];
  for (const o of resposta?.opcoes || []) {
    if (!chaves.has(o.chave) || vistos.has(o.chave)) continue;
    vistos.add(o.chave);
    opcoes.push({ origem: 'base', chave: o.chave, porque: String(o.porque || '').slice(0, 240) });
    if (opcoes.length >= MAX_OPCOES) break;
  }
  return opcoes;
}

const normUrl = (u) => {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return null;
  }
};
const normTexto = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Junta os resultados da pesquisa e as citações de uma resposta (ou várias, com pause_turn).
export function recolherFontes(content) {
  const resultados = new Map(); // url → { url, titulo, idade }
  const citacoes = [];          // { url, titulo, texto }
  let texto = '';
  for (const block of content || []) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === 'web_search_result' && r.url) resultados.set(r.url, { url: r.url, titulo: r.title || null, idade: r.page_age || null });
      }
    } else if (block.type === 'text') {
      texto += block.text;
      for (const c of block.citations || []) {
        if (c.type === 'web_search_result_location' && c.url) {
          citacoes.push({ url: c.url, titulo: c.title || null, texto: c.cited_text || '' });
          if (!resultados.has(c.url)) resultados.set(c.url, { url: c.url, titulo: c.title || null, idade: null });
        }
      }
    }
  }
  return { resultados: [...resultados.values()], citacoes, texto };
}

// Erros da ferramenta de pesquisa chegam como bloco com content = objeto de erro (HTTP 200).
export function errosPesquisa(content) {
  return (content || [])
    .filter((b) => b.type === 'web_search_tool_result' && b.content && !Array.isArray(b.content))
    .map((b) => b.content.error_code || 'erro');
}

// Valida as opções vindas da web: links só dos resultados da pesquisa; data só com citação que a mostre.
export function validarOpcoesWeb(resposta, fontes, hoje) {
  const porUrl = new Map(fontes.resultados.map((r) => [normUrl(r.url), r.url]));
  const citacoesNorm = fontes.citacoes.map((c) => ({ url: normUrl(c.url), texto: normTexto(c.texto) }));
  const urlConhecido = (u) => (u && porUrl.get(normUrl(u))) || null;
  const opcoes = [];
  for (const o of resposta?.opcoes || []) {
    const urlOficial = urlConhecido(o.urlOficial);
    const fonte = urlConhecido(o.fonte) || urlOficial;
    if (!fonte || !o.nome) continue; // sem fonte verificável não se mostra
    let data = null;
    if (dataValida(o.data) && o.data >= hoje && o.evidenciaData) {
      const ev = normTexto(o.evidenciaData);
      const ano = o.data.slice(0, 4);
      const citada = ev.length >= 6 && ev.includes(ano) && citacoesNorm.some((c) => c.texto.includes(ev));
      if (citada) data = o.data;
    }
    const codigo = typeof o.codigoPais === 'string' && /^[a-z]{2}$/i.test(o.codigoPais) ? o.codigoPais.toLowerCase() : null;
    opcoes.push({
      origem: 'web',
      nome: String(o.nome).slice(0, 120),
      data,
      dataConfirmada: Boolean(data),
      cidade: o.cidade ? String(o.cidade).slice(0, 80) : null,
      pais: o.pais ? String(o.pais).slice(0, 60) : null,
      codigoPais: codigo,
      modalidade: MODALIDADES.includes(o.modalidade) ? o.modalidade : null,
      distancia: o.distancia ? String(o.distancia).slice(0, 80) : null,
      porque: String(o.porque || '').slice(0, 240),
      urlOficial,
      fonte
    });
    if (opcoes.length >= MAX_OPCOES) break;
  }
  return opcoes;
}

// Primeiro bloco de texto com JSON (saída estruturada).
export function lerJson(message) {
  const bloco = (message.content || []).find((b) => b.type === 'text');
  if (!bloco) throw new Error('Resposta sem texto');
  return JSON.parse(bloco.text);
}
