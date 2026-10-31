import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/index.js';
import { validarOpcoesWeb, recolherFontes, validarFiltros } from '../src/coach.js';

const ORIGEM = 'https://exemplo.github.io';
const env = (kv = new Map()) => ({
  ALLOWED_ORIGIN: ORIGEM,
  COACH_KV: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } }
});
const pedido = (body, user = 'u1') => new Request('https://w.dev/coach', {
  method: 'POST', body: JSON.stringify(body),
  headers: { Origin: ORIGEM, 'Content-Type': 'application/json', 'X-Max-Provas-User': user }
});
// Cliente falso: devolve as respostas pela ordem e guarda os pedidos.
const fakeClient = (respostas) => {
  const pedidos = [];
  return { pedidos, beta: { messages: { create: async (p) => { pedidos.push(p); return respostas.shift(); } } } };
};
const texto = (obj) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });

test('filtros: só países da lista e datas válidas', () => {
  const f = validarFiltros({ modalidade: 'Corrida', distancia: 'meia', paises: ['ES', 'xx', 'pt'], regiao: 'Europa',
    periodo: { de: '2027-03-31', ate: '2027-03-01' }, nivel: null, preferencias: ['plano'], resumo: 'ok' }, new Set(['es', 'pt']));
  assert.deepEqual(f.paises, ['es', 'pt']);
  assert.deepEqual(f.periodo, { de: '2027-03-01', ate: '2027-03-31' });
});

test('etapa filtros usa saída estruturada e fallback', async () => {
  const client = fakeClient([texto({ modalidade: 'Triatlo', distancia: 'sprint', paises: ['es'], regiao: 'Madrid',
    periodo: { de: null, ate: null }, nivel: 'iniciante', preferencias: [], resumo: 'Triatlo sprint perto de Madrid' })]);
  const res = await handle(pedido({ etapa: 'filtros', pedido: 'primeiro triatlo sprint perto de Madrid',
    paises: [{ codigo: 'es', pais: 'Espanha', continente: 'Europa' }] }), env(), { client });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.filtros.distancia, 'sprint');
  const p = client.pedidos[0];
  assert.equal(p.model, 'claude-opus-5-5');
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p.output_config.format.type, 'json_schema');
});

test('3+ candidatas da base: escolhe entre elas, sem web e sem gastar o limite', async () => {
  const kv = new Map();
  const client = fakeClient([texto({ opcoes: [{ chave: 'pt:a', porque: 'plana' }, { chave: 'inventada', porque: 'x' }] })]);
  const candidatos = ['pt:a', 'pt:b', 'es:c'].map((chave) => ({ chave, nome: chave }));
  const res = await handle(pedido({ etapa: 'opcoes', pedido: 'meia plana', filtros: {}, candidatos }), env(kv), { client });
  const body = await res.json();
  assert.equal(body.origem, 'base');
  assert.deepEqual(body.opcoes.map((o) => o.chave), ['pt:a']); // a chave inventada é descartada
  assert.equal(client.pedidos[0].tools, undefined);
  assert.equal(body.buscasWebRestantes, 10);
});

const respostaPesquisa = {
  stop_reason: 'end_turn',
  content: [
    { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'sprint triathlon madrid' } },
    { type: 'web_search_tool_result', tool_use_id: 's1', content: [
      { type: 'web_search_result', url: 'https://www.triatlonmadrid.es/sprint', title: 'Triatlón Sprint Madrid', page_age: null, encrypted_content: 'x' }
    ] },
    { type: 'text', text: 'O Triatlón Sprint de Madrid é a 6 de junho de 2027.', citations: [
      { type: 'web_search_result_location', url: 'https://www.triatlonmadrid.es/sprint', title: 'Triatlón Sprint Madrid',
        cited_text: 'Domingo 6 de junio de 2027 · Triatlón Sprint Madrid · Casa de Campo', encrypted_index: 'i' }
    ] }
  ]
};

test('menos de 3: busca na web, valida links e datas, conta o limite', async () => {
  const kv = new Map();
  const client = fakeClient([respostaPesquisa, texto({ opcoes: [
    { nome: 'Triatlón Sprint Madrid', data: '2027-06-06', evidenciaData: 'Domingo 6 de junio de 2027', cidade: 'Madrid', pais: 'Espanha',
      codigoPais: 'ES', modalidade: 'Triatlo', distancia: 'Sprint', porque: 'Primeiro triatlo, curto',
      urlOficial: 'https://triatlonmadrid.es/sprint/', fonte: 'https://www.triatlonmadrid.es/sprint' },
    { nome: 'Prova sem fonte', data: '2027-05-01', evidenciaData: null, cidade: null, pais: null, codigoPais: null,
      modalidade: null, distancia: null, porque: 'x', urlOficial: 'https://inventado.com', fonte: 'https://inventado.com' },
    { nome: 'Data sem citação', data: '2027-09-09', evidenciaData: '9 de setembro de 2027', cidade: null, pais: null, codigoPais: 'es',
      modalidade: 'Triatlo', distancia: null, porque: 'y', urlOficial: null, fonte: 'https://www.triatlonmadrid.es/sprint' }
  ] })]);
  const res = await handle(pedido({ etapa: 'opcoes', pedido: 'primeiro triatlo sprint perto de Madrid', filtros: {},
    candidatos: [{ chave: 'es:x', nome: 'X' }] }), env(kv), { client });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.origem, 'web');
  assert.equal(body.buscasWebRestantes, 9);
  assert.equal(body.opcoes[0].origem, 'base');
  const [sprint, semData] = body.opcoes.slice(1);
  assert.equal(body.opcoes.length, 3);                   // a prova com link inventado foi descartada
  assert.equal(sprint.data, '2027-06-06');
  assert.equal(sprint.urlOficial, 'https://www.triatlonmadrid.es/sprint'); // URL normalizado para o resultado real
  assert.equal(sprint.codigoPais, 'es');
  assert.equal(semData.data, null);                       // sem citação que a mostre → data a confirmar
  const ferramenta = client.pedidos[0].tools[0];
  assert.equal(ferramenta.type, 'web_search_20250305');
  assert.ok(ferramenta.blocked_domains.includes('ahotu.com'));
  assert.equal(client.pedidos[1].tools, undefined);
});

test('limite de 10 buscas na web por dia', async () => {
  const kv = new Map();
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  kv.set(`web:${dia}:u:u1`, '10');
  const client = fakeClient([]);
  const res = await handle(pedido({ etapa: 'opcoes', pedido: 'algo raro', filtros: {}, candidatos: [] }), env(kv), { client });
  assert.equal(res.status, 429);
  assert.equal(client.pedidos.length, 0);
});

test('origem não autorizada é recusada', async () => {
  const req = new Request('https://w.dev/coach', { method: 'POST', body: '{}', headers: { Origin: 'https://mau.example' } });
  const res = await handle(req, env(), { client: fakeClient([]) });
  assert.equal(res.status, 403);
});

test('recusa do modelo vira erro amigável', async () => {
  const client = fakeClient([{ stop_reason: 'refusal', content: [] }]);
  const res = await handle(pedido({ etapa: 'filtros', pedido: 'x', paises: [] }), env(), { client });
  assert.equal(res.status, 422);
});

test('erro da ferramenta de pesquisa (objeto, não lista) é tratado', () => {
  const f = recolherFontes([{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }]);
  assert.equal(f.resultados.length, 0);
  assert.deepEqual(validarOpcoesWeb({ opcoes: [] }, f, '2026-10-31'), []);
});
