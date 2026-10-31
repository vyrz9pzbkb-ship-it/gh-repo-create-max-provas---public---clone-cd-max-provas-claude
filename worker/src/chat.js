// Chat do Coach Max Provas: proxy para a Messages API (POST /v1/messages, HTTP direto).
// A chave fica no secret ANTHROPIC_API_KEY do Worker; o system prompt fica aqui, nunca no front.

export const CHAT_MODEL = 'claude-haiku-5-5';
export const CHAT_MAX_TOKENS = 1024;
export const CHAT_MAX_HISTORICO = 10;      // só as últimas 10 mensagens vão para a API
export const CHAT_LIMITE_HORA_IP = 20;     // mensagens por hora por IP
const MAX_CARACTERES = 2000;               // por mensagem
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export const SYSTEM_COACH = 'Você é o Coach Max Provas, um treinador especializado APENAS em triathlon, natação, corrida e ciclismo: treinos, planilhas, ritmo/zonas, técnica, transições, equipamento, nutrição e hidratação esportiva, preparação para provas e recuperação. Responda em português do Brasil, de forma direta e prática. Se a pergunta não for sobre esses esportes, recuse educadamente em uma frase e traga a conversa de volta para o treino. Para dor, lesão, sintomas ou condições médicas, dê só orientação geral e recomende procurar um médico ou fisioterapeuta. Não invente dados de provas específicas; se não souber, diga.';

export class ErroChat extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Normaliza o histórico vindo do front: só texto, papéis válidos, últimas 10 mensagens,
// a começar por "user" e a terminar com a pergunta do utilizador.
export function prepararHistorico(mensagens) {
  if (!Array.isArray(mensagens)) throw new ErroChat(400, 'Histórico inválido.');
  let lista = mensagens
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CARACTERES) }))
    .filter((m) => m.content)
    .slice(-CHAT_MAX_HISTORICO);
  while (lista.length && lista[0].role !== 'user') lista = lista.slice(1);
  if (!lista.length || lista[lista.length - 1].role !== 'user') {
    throw new ErroChat(400, 'Escreva uma pergunta para o Coach.');
  }
  return lista;
}

// Limite simples por IP e por hora no KV (o KV é eventualmente consistente: é um limite aproximado).
export async function reservarMensagem(kv, ip, agora = Date.now()) {
  if (!kv) throw new ErroChat(500, 'COACH_KV não configurado no Worker.');
  const hora = Math.floor(agora / 3600000);
  const chave = `chat:${hora}:ip:${ip}`;
  const usadas = Number((await kv.get(chave)) || 0);
  if (usadas >= CHAT_LIMITE_HORA_IP) {
    throw new ErroChat(429, `Você atingiu o limite de ${CHAT_LIMITE_HORA_IP} mensagens por hora. Tente de novo mais tarde.`);
  }
  await kv.put(chave, String(usadas + 1), { expirationTtl: 2 * 3600 });
  return CHAT_LIMITE_HORA_IP - (usadas + 1);
}

// Extrai o texto da resposta lendo os blocos pelo tipo (pode haver blocos "thinking" antes do texto).
export function lerResposta(data) {
  if (data.stop_reason === 'refusal') {
    return { texto: 'Não consigo ajudar com isso. Posso ajudar com treinos de corrida, natação, ciclismo ou triathlon?', cortada: false };
  }
  const texto = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!texto) {
    if (data.stop_reason === 'max_tokens') throw new ErroChat(502, 'A resposta ficou longa demais. Tente uma pergunta mais específica.');
    throw new ErroChat(502, 'O Coach não conseguiu responder agora. Tente de novo.');
  }
  return { texto, cortada: data.stop_reason === 'max_tokens' };
}

export async function responderChat(body, env, ip, fetchImpl = fetch) {
  const historico = prepararHistorico(body?.messages);
  const restantes = await reservarMensagem(env.COACH_KV, ip);
  if (!env.ANTHROPIC_API_KEY) throw new ErroChat(500, 'ANTHROPIC_API_KEY não configurada no Worker.');

  const res = await fetchImpl(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': API_VERSION
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: CHAT_MAX_TOKENS,
      // No Haiku 5.5 o raciocínio interno conta para max_tokens; esforço baixo deixa espaço para a resposta.
      output_config: { effort: 'low' },
      system: SYSTEM_COACH,
      messages: historico
    })
  });

  if (!res.ok) {
    const detalhe = await res.text().catch(() => '');
    console.error('Anthropic API', res.status, detalhe.slice(0, 500));
    if (res.status === 429 || res.status === 529) throw new ErroChat(503, 'O Coach está muito ocupado agora. Tente de novo em instantes.');
    throw new ErroChat(502, 'O Coach não está disponível agora. Tente de novo mais tarde.');
  }
  const { texto, cortada } = lerResposta(await res.json());
  return { resposta: texto, cortada, restantesNaHora: restantes };
}
