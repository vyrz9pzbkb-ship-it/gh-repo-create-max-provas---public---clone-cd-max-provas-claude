'use strict';

/* Chat do Coach Max Provas (aba Coach → "Conversar").
 * Fala com o Worker em POST {coachApi}/chat; o system prompt e a chave ficam no Worker.
 * O histórico fica no localStorage deste telemóvel. */

const CHAT_KEY = 'maxprovas.chat';
const CHAT_GUARDAR = 60; // mensagens guardadas no telemóvel (o Worker só usa as últimas 10)
const CHAT_SUGESTOES = [
  'Como montar uma semana de treino para a primeira meia maratona?',
  'Quais são as zonas de frequência cardíaca para corrida?',
  'Como treinar a transição bike → corrida no triathlon?',
  'O que comer antes de uma prova de 2 horas?'
];

const chat = {
  mensagens: readJSON(CHAT_KEY, []).filter((m) => m && typeof m.content === 'string'),
  carregando: false,
  erro: '',
  rascunho: ''
};

function chatSave() {
  chat.mensagens = chat.mensagens.slice(-CHAT_GUARDAR);
  writeJSON(CHAT_KEY, chat.mensagens);
}

// Formatação mínima e segura da resposta: escapa o HTML e depois aplica **negrito**,
// listas com "-"/"•"/"1." e parágrafos.
function chatFormat(texto) {
  const linhas = esc(texto).split('\n');
  let html = '';
  let lista = null;
  const fecharLista = () => {
    if (lista) html += `</${lista}>`;
    lista = null;
  };
  for (const linha of linhas) {
    const l = linha.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const ul = /^\s*[-•*]\s+(.*)$/.exec(l);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(l);
    if (ul || ol) {
      const tipo = ul ? 'ul' : 'ol';
      if (lista !== tipo) {
        fecharLista();
        html += `<${tipo}>`;
        lista = tipo;
      }
      html += `<li>${(ul || ol)[1]}</li>`;
    } else if (l.trim()) {
      fecharLista();
      html += `<p>${l.replace(/^#+\s*/, '')}</p>`;
    } else {
      fecharLista();
    }
  }
  fecharLista();
  return html;
}

function chatBubble(m) {
  const user = m.role === 'user';
  return `
    <div class="bubble ${user ? 'user' : 'coach'}">
      ${user ? `<p>${esc(m.content).replace(/\n/g, '<br>')}</p>` : chatFormat(m.content)}
      ${m.cortada ? '<p class="bubble-note">(resposta resumida — peça mais detalhes se precisar)</p>' : ''}
    </div>`;
}

function renderChat(view, sub) {
  sub.textContent = 'Treinador de IA para corrida, natação, ciclismo e triathlon';
  const configured = Boolean(coachApi());
  const vazio = !chat.mensagens.length;

  view.innerHTML = `
    ${coachModeSwitch()}
    <section class="chat" aria-label="Conversa com o Coach">
      <div class="chat-log" id="chat-log" aria-live="polite">
        ${!configured
          ? '<p class="empty">O Coach ainda não está ligado: falta o endereço do Worker em <code>js/config.js</code> (ver README).</p>'
          : vazio
            ? `<div class="bubble coach"><p>Olá! Sou o <strong>Coach Max Provas</strong>. Pergunte sobre treinos, ritmo, técnica, equipamento, nutrição ou preparação para provas de corrida, natação, ciclismo e triathlon.</p></div>
               <div class="chips chat-sugestoes" role="group" aria-label="Sugestões">
                 ${CHAT_SUGESTOES.map((t) => `<button type="button" class="chip" data-chat-sugestao="${esc(t)}">${esc(t)}</button>`).join('')}
               </div>`
            : chat.mensagens.map(chatBubble).join('')}
        ${chat.carregando ? '<div class="bubble coach typing" role="status"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">O Coach está escrevendo…</span></div>' : ''}
        ${chat.erro ? `<div class="chat-error" role="alert">${esc(chat.erro)} <button type="button" class="link-btn" data-chat-retry>Tentar de novo</button></div>` : ''}
      </div>
      <form class="chat-form" data-chat-form>
        <textarea id="chat-input" rows="1" maxlength="2000" placeholder="Pergunte ao Coach…" aria-label="Mensagem para o Coach" ${configured ? '' : 'disabled'}>${esc(chat.rascunho)}</textarea>
        <button type="submit" class="btn primary chat-send" aria-label="Enviar" ${configured && !chat.carregando ? '' : 'disabled'}>Enviar</button>
      </form>
      ${chat.mensagens.length ? '<button type="button" class="link-btn chat-clear" data-chat-clear>Limpar conversa</button>' : ''}
    </section>`;

  const log = document.getElementById('chat-log');
  if (log) log.lastElementChild?.scrollIntoView({ block: 'end' });
}

async function chatSend(texto) {
  const pergunta = texto.trim();
  if (!pergunta || chat.carregando) return;
  chat.mensagens.push({ role: 'user', content: pergunta });
  chatSave();
  chat.rascunho = '';
  await chatRequest();
}

// Envia o histórico (o Worker corta para as últimas 10) e acrescenta a resposta.
async function chatRequest() {
  chat.carregando = true;
  chat.erro = '';
  renderIfCoach();
  try {
    const res = await fetch(`${coachApi()}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chat.mensagens.slice(-10).map(({ role, content }) => ({ role, content })) })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erro || 'O Coach não respondeu. Verifique a ligação e tente de novo.');
    chat.mensagens.push({ role: 'assistant', content: data.resposta, ...(data.cortada ? { cortada: true } : {}) });
    chatSave();
  } catch (err) {
    chat.erro = navigator.onLine === false
      ? 'Você está sem internet. A pergunta ficou guardada; tente de novo quando voltar a ligação.'
      : (err.message || 'Algo correu mal. Tente de novo.');
  } finally {
    chat.carregando = false;
    renderIfCoach();
  }
}

document.addEventListener('submit', (e) => {
  if (!e.target.closest('[data-chat-form]')) return;
  e.preventDefault();
  chatSend(document.getElementById('chat-input').value);
});

document.addEventListener('click', (e) => {
  const sugestao = e.target.closest('[data-chat-sugestao]');
  if (sugestao) return chatSend(sugestao.dataset.chatSugestao);
  if (e.target.closest('[data-chat-retry]')) {
    // A última pergunta ficou sem resposta: reenvia sem a duplicar.
    if (chat.mensagens.at(-1)?.role === 'user') chatRequest();
    return;
  }
  if (e.target.closest('[data-chat-clear]')) {
    if (confirm('Apagar a conversa com o Coach?')) {
      chat.mensagens = [];
      chat.erro = '';
      chatSave();
      render();
    }
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'chat-input') return;
  chat.rascunho = e.target.value;
  // Cresce com o texto, até um limite.
  e.target.style.height = 'auto';
  e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
});

document.addEventListener('keydown', (e) => {
  // Enter envia; Shift+Enter muda de linha.
  if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'chat-input') {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
});
