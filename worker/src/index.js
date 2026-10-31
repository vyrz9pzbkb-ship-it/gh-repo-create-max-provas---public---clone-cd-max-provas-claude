// Worker do Coach do Max Provas: busca de provas em linguagem natural.
//
// POST /coach  { etapa: "filtros", pedido, paises: [{ codigo, pais, continente }] }
//   → { filtros }
// POST /coach  { etapa: "opcoes", pedido, filtros, candidatos: [{ chave, nome, data, ... }] }
//   → { origem: "base" | "web", opcoes: [...], buscasWebRestantes }
//   Com 3 ou mais candidatas da base, a IA escolhe e explica entre elas (sem web).
//   Com menos de 3, faz uma busca na web (web_search) limitada a 10 por utilizador por dia.
//
// Variáveis: ANTHROPIC_API_KEY (secret), ALLOWED_ORIGINS (lista separada por vírgulas), COACH_KV (KV).

import Anthropic from '@anthropic-ai/sdk';
import {
  MODEL, FALLBACK_BETA, LIMITE_WEB_DIA, LIMITE_WEB_IP_DIA, MAX_OPCOES, AGREGADORES,
  FILTROS_SCHEMA, ESCOLHA_BASE_SCHEMA, OPCOES_WEB_SCHEMA,
  SYSTEM_FILTROS, SYSTEM_ESCOLHA_BASE, SYSTEM_PESQUISA_WEB, SYSTEM_ESTRUTURA_WEB,
  promptFiltros, validarFiltros, validarEscolhaBase, recolherFontes, errosPesquisa, validarOpcoesWeb, lerJson
} from './coach.js';

const MAX_PEDIDO = 300;
const MAX_CANDIDATOS = 30;
const MAX_CONTINUACOES = 3; // pause_turn da pesquisa na web

class ErroCoach extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const hojeMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    ...(ok ? { 'Access-Control-Allow-Origin': origin || '*' } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Max-Provas-User',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

// Pedido à API com fallback do lado do servidor e verificação de recusa.
async function pedir(client, params) {
  const message = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    ...params
  });
  if (message.stop_reason === 'refusal') throw new ErroCoach(422, 'O pedido não pôde ser processado. Tente reformular.');
  return message;
}

/* ---------- Limite diário de buscas na web (KV) ---------- */

async function reservarBuscaWeb(env, usuario, ip) {
  if (!env.COACH_KV) throw new ErroCoach(500, 'COACH_KV não configurado no Worker');
  const dia = hojeMadrid();
  const kUser = `web:${dia}:u:${usuario}`;
  const kIp = `web:${dia}:ip:${ip}`;
  const [nUser, nIp] = (await Promise.all([env.COACH_KV.get(kUser), env.COACH_KV.get(kIp)])).map((v) => Number(v || 0));
  if (nUser >= LIMITE_WEB_DIA || nIp >= LIMITE_WEB_IP_DIA) {
    throw new ErroCoach(429, `Atingiu o limite de ${LIMITE_WEB_DIA} buscas na web por dia. Tente amanhã.`);
  }
  // Conta antes de chamar a API: pedidos simultâneos não passam o limite por muito (o KV é eventualmente consistente).
  const ttl = { expirationTtl: 60 * 60 * 48 };
  await Promise.all([env.COACH_KV.put(kUser, String(nUser + 1), ttl), env.COACH_KV.put(kIp, String(nIp + 1), ttl)]);
  return LIMITE_WEB_DIA - (nUser + 1);
}

async function buscasRestantes(env, usuario) {
  if (!env.COACH_KV) return null;
  const n = Number((await env.COACH_KV.get(`web:${hojeMadrid()}:u:${usuario}`)) || 0);
  return Math.max(0, LIMITE_WEB_DIA - n);
}

/* ---------- Etapas ---------- */

export async function etapaFiltros(client, { pedido, paises }) {
  const lista = (Array.isArray(paises) ? paises : []).slice(0, 120)
    .map((p) => ({ codigo: String(p.codigo || '').toLowerCase(), pais: String(p.pais || ''), continente: String(p.continente || '') }))
    .filter((p) => /^[a-z]{2}$/.test(p.codigo));
  const message = await pedir(client, {
    output_config: { effort: 'low', format: { type: 'json_schema', schema: FILTROS_SCHEMA } },
    system: SYSTEM_FILTROS,
    messages: [{ role: 'user', content: promptFiltros(pedido, lista, hojeMadrid()) }]
  });
  return { filtros: validarFiltros(lerJson(message), new Set(lista.map((p) => p.codigo))) };
}

export async function escolherDaBase(client, { pedido, filtros, candidatos }) {
  const message = await pedir(client, {
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ESCOLHA_BASE_SCHEMA } },
    system: SYSTEM_ESCOLHA_BASE,
    messages: [{ role: 'user', content: JSON.stringify({ hoje: hojeMadrid(), pedido, filtros, candidatos }) }]
  });
  return validarEscolhaBase(lerJson(message), candidatos);
}

export async function pesquisarNaWeb(client, { pedido, filtros }) {
  const hoje = hojeMadrid();
  const messages = [{ role: 'user', content: JSON.stringify({ hoje, pedido, filtros }) }];
  const conteudo = [];
  let message;
  for (let i = 0; i <= MAX_CONTINUACOES; i++) {
    message = await pedir(client, {
      output_config: { effort: 'medium' },
      system: SYSTEM_PESQUISA_WEB,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5, blocked_domains: AGREGADORES }],
      messages
    });
    conteudo.push(...message.content);
    if (message.stop_reason !== 'pause_turn') break;
    // A pesquisa ficou a meio: devolve o turno ao modelo para continuar.
    messages.push({ role: 'assistant', content: message.content });
  }

  const fontes = recolherFontes(conteudo);
  if (!fontes.resultados.length) {
    const erros = errosPesquisa(conteudo);
    throw new ErroCoach(502, erros.length ? `A busca na web falhou (${erros.join(', ')}).` : 'A busca na web não encontrou resultados.');
  }

  // Segundo passo, sem ferramentas: estruturar a pesquisa em JSON a partir das fontes recolhidas.
  const estrutura = await pedir(client, {
    output_config: { effort: 'low', format: { type: 'json_schema', schema: OPCOES_WEB_SCHEMA } },
    system: SYSTEM_ESTRUTURA_WEB,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        hoje, pedido, filtros,
        pesquisa: fontes.texto.slice(0, 12000),
        fontes: fontes.resultados.slice(0, 40),
        citacoes: fontes.citacoes.slice(0, 60)
      })
    }]
  });
  return validarOpcoesWeb(lerJson(estrutura), fontes, hoje);
}

/* ---------- HTTP ---------- */

export async function handle(request, env, { client } = {}) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const url = new URL(request.url);
  if (url.pathname !== '/coach' || request.method !== 'POST') return json({ erro: 'Não encontrado' }, 404, cors);
  if (!cors['Access-Control-Allow-Origin']) return json({ erro: 'Origem não autorizada' }, 403, cors);

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      throw new ErroCoach(400, 'JSON inválido');
    }
    const pedido = String(body?.pedido || '').trim().slice(0, MAX_PEDIDO);
    if (!pedido) throw new ErroCoach(400, 'Descreva a prova que procura.');
    const usuario = (request.headers.get('X-Max-Provas-User') || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) || 'anonimo';
    const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
    const api = client || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    if (body.etapa === 'filtros') {
      return json(await etapaFiltros(api, { pedido, paises: body.paises }), 200, cors);
    }

    if (body.etapa === 'opcoes') {
      const filtros = body.filtros && typeof body.filtros === 'object' ? body.filtros : {};
      const candidatos = (Array.isArray(body.candidatos) ? body.candidatos : []).slice(0, MAX_CANDIDATOS)
        .filter((c) => c && typeof c.chave === 'string');
      if (candidatos.length >= 3) {
        const opcoes = await escolherDaBase(api, { pedido, filtros, candidatos });
        return json({ origem: 'base', opcoes, buscasWebRestantes: await buscasRestantes(env, usuario) }, 200, cors);
      }
      const restantes = await reservarBuscaWeb(env, usuario, ip);
      const web = await pesquisarNaWeb(api, { pedido, filtros });
      // As poucas candidatas da base aparecem primeiro, sem passar pela web.
      const base = candidatos.map((c) => ({ origem: 'base', chave: c.chave, porque: 'Está na base do Max Provas e cumpre os filtros do pedido.' }));
      return json({ origem: 'web', opcoes: [...base, ...web].slice(0, MAX_OPCOES), buscasWebRestantes: restantes }, 200, cors);
    }

    throw new ErroCoach(400, 'Etapa desconhecida');
  } catch (err) {
    if (err instanceof ErroCoach) return json({ erro: err.message }, err.status, cors);
    if (err instanceof Anthropic.RateLimitError) return json({ erro: 'Serviço ocupado. Tente daqui a pouco.' }, 503, cors);
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API', err.status, err.message);
      return json({ erro: 'O Coach não está disponível agora.' }, 502, cors);
    }
    console.error(err);
    return json({ erro: 'Erro inesperado no Coach.' }, 500, cors);
  }
}

export default {
  fetch: (request, env) => handle(request, env)
};
