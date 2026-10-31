# 🏁 Max Provas

PWA com provas de **corrida, triatlo, ciclismo e natação no mundo todo**.
HTML + CSS + JavaScript vanilla, sem build, pronto para o GitHub Pages.

- **Provas**: cards com badge de estado da inscrição, tag da série (ex.: `T100`, `Marathon Majors`), contagem regressiva, **Inscrever-me** e **Adicionar à agenda** (`.ics`, dia inteiro).
- **Filtro de país**: toque em 🌍 para escolher os países. Só aparecem países com provas, com bandeira e número de provas (ex.: 🇫🇷 França · 6). A app só descarrega os ficheiros dos países escolhidos, e a escolha fica guardada.
- **Filtro de série** (opcional): faixa de chips por cima dos resultados.
- **Temporada**: linha do tempo com as semanas entre provas; intervalos com menos de 4 semanas ficam a laranja.
- **Coach** (dois modos): **💬 Conversar** com um treinador de IA só de triathlon, natação, corrida e ciclismo; e **🔎 Buscar provas** em linguagem natural ("meia maratona plana na Europa em março"). Ver [Coach de IA](#-coach-de-ia-chat) e [Coach: busca](#-coach-busca-em-linguagem-natural).
- **Histórico**: provas que já passaram, com o resultado (e se o objetivo foi cumprido).
- Funciona offline (os países já consultados ficam em cache) e pode ser instalada na Tela de Início do iPhone.

---

## ✅ Estado dos dados (verificado em 30/10/2026)

As datas vêm **apenas de fontes oficiais** (site da prova, do organizador ou da série). Cada prova tem o campo `fonte` com o link de onde a data foi tirada. Quando não encontrei a data num site oficial, `data` fica `null` — nada foi inventado. `statusInscricao` só está preenchido quando o site oficial o indicava; caso contrário fica `null` e o card mostra "Inscrições: ver site".

Cobertura atual:

- **Triatlo**: T100 (fim de 2026 e 2027) e Challenge Family; provas portuguesas (HMS, TRITON, Caminha…).
- **Corrida**: World Marathon Majors (incl. Sydney e Cidade do Cabo, que entraram no circuito) e as principais maratonas e meias de PT, ES, FR, IT, DE, GB, NL, BR, AR, CL, US e CA.
- **Ciclismo**: qualificativas da UCI Gran Fondo World Series e Mundial 2027, L'Étape du Tour 2027 e grandes gran fondos europeus.
- **Natação**: calendário Oceanman, Vansbrosimningen e Travessia Mar Grande–Salvador.

Ainda por fazer / confirmar:

- [ ] **IRONMAN e IRONMAN 70.3** — o ironman.com está bloqueado no ambiente onde os dados foram recolhidos. Falta todo o calendário (só está o 70.3 Cascais).
- [ ] **Outros países da corrida** — BE, CH, AT, IE, MX, CO, PE, UY e restantes países da Europa e das Américas: não encontrei datas 2026/2027 em sites oficiais acessíveis.
- [ ] **Datas só vistas na imprensa** (ficaram `null`): Maratona e Semi de Paris, Vienna City Marathon, Dublin Marathon, Egmond, Lima 42K.
- [ ] **Sem data 2027 publicada**: Maratona de Lisboa, Maratón y Medio de Buenos Aires, Medio Maratón de Valencia, BMO Vancouver, Travessia Mar Grande–Salvador, Caminha, TRITON Lisboa, Sines.
- [ ] **Datas a confirmar** (`dataConfirmada: false`): Sydney Marathon (marcada "Postponed" no diretório oficial), Frankfurt (só no portal da cidade), CPC Den Haag, Quebrantahuesos, Ötztaler, T100 Arábia Saudita 2026, Oceanman Guanacaste.
- [ ] `objetivoTempo` e `resultado` — opcionais, para as suas provas.

---

## ✏️ Como editar os dados

```
data/
├── countries.json        # gerado: país, código, continente, bandeira e nº de provas
└── races/
    ├── pt.json           # uma lista de provas por país (código ISO de 2 letras)
    ├── es.json
    └── …
```

Cada ficheiro `data/races/{pais}.json` é uma lista (`[...]`) de provas:

```json
{
  "id": "maratona-sp-2027",
  "nome": "Maratona Internacional de São Paulo",
  "local": "São Paulo (Ibirapuera)",
  "modalidade": "Corrida",
  "serie": null,
  "data": "2027-04-04",
  "dataConfirmada": true,
  "distancia": "42,195 km",
  "statusInscricao": null,
  "urlOficial": "https://…",
  "urlInscricao": "https://…",
  "fonte": "https://…",
  "verificadoEm": "2026-10-30",
  "objetivoTempo": "3:30:00",
  "resultado": null
}
```

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | texto | Único em toda a base, sem espaços. Convenção: `nome-curto-ano`. |
| `nome` | texto | Nome da prova. |
| `local` | texto ou `null` | Cidade/local (sem local, o card mostra o país). |
| `modalidade` | `"Corrida"` \| `"Triatlo"` \| `"Ciclismo"` \| `"Natação"` | Define o ícone. |
| `serie` | texto ou `null` | Ex.: `"IRONMAN 70.3"`, `"T100"`, `"Marathon Majors"`. Aparece como tag e no filtro de série. |
| `data` | `"YYYY-MM-DD"` ou `null` | Dia da prova (num evento de vários dias, o primeiro; os outros dias vão em `distancia`). |
| `dataConfirmada` | `true` / `false` | `false` mostra a etiqueta **"data prevista"**. |
| `distancia` | texto ou `null` | Texto livre. |
| `statusInscricao` | `"aberta"` \| `"aguardando"` \| `"esgotada"` \| `"nao_verificado"` \| `null` | 🟢 / 🟡 / 🔴 / ⚪ / "ver site". Atualizado pelo robô diário. |
| `statusManual` | `"aberta"` \| `"aguardando"` \| `"esgotada"` (opcional) | **Ajuste manual.** Quando preenchido tem prioridade sobre `statusInscricao` e o robô não verifica nem altera essa prova. Apague o campo para voltar ao automático. |
| `falhaDesde` / `falhaMotivo` | data / texto | Escritos pelo robô quando a verificação falha; apagados quando volta a funcionar. |
| `statusMotivo` | texto ou `null` | Frase encontrada na página (máx. 100 caracteres). Aparece ao tocar no status. Escrito pelo robô. |
| `ultimoStatusVerificado` | texto | Último estado lido com sucesso; serve para não alertar por falhas pontuais. Escrito pelo robô. |
| `favorita` | `true` (opcional) | Mostra ⭐, entra no filtro "Favoritas" e gera alertas no telemóvel quando o status muda. |
| `urlOficial` | URL ou `null` | Link "Site oficial". |
| `urlInscricao` | URL ou `null` | Botão **Inscrever-me**. Se a inscrição ainda não abriu, use o `urlOficial`. |
| `fonte` | URL | Página oficial de onde tirou a data (obrigatório quando há `data`). |
| `verificadoEm` | `"YYYY-MM-DD"` ou `"YYYY-MM-DDTHH:MM:SSZ"` | Última verificação (o robô grava data e hora). Card: "verificado há X horas". |
| `objetivoTempo` | texto (opcional) | `h:mm:ss` ou `mm:ss`, comparado com o resultado. |
| `resultado` | texto (opcional) | Tempo final. Aparece no Histórico. |

**Depois de editar, corra:**

```bash
python3 tools/atualizar_paises.py
```

O script valida todos os ficheiros (campos obrigatórios, datas, ids repetidos, `fonte` em falta) e regenera `data/countries.json` com a contagem de provas. Para um país novo, crie `data/races/{codigo}.json`; se o código não estiver na lista `PAISES` do script, acrescente-o lá (nome e continente).

Dicas:

- JSON não aceita comentários nem vírgula depois do último elemento.
- A ordem no ficheiro não importa: a app mostra primeiro as inscrições abertas, depois ordena por data; provas sem data ficam no fim.
- Uma prova passa para o **Histórico** no dia seguinte à `data`.

---

## 🤖 Atualização automática do status

O script [`scripts/check-status.js`](scripts/check-status.js) (Node + Playwright) abre a `urlInscricao` de cada prova futura e procura palavras-chave em PT, ES, EN, FR, IT e DE:

| Status | Exemplos de palavras-chave |
|--------|----------------------------|
| 🔴 `esgotada` | sold out, esgotado, agotado, complet, ausverkauft, waitlist, lista de espera, registration closed, inscrições encerradas |
| 🟢 `aberta` | register now, inscreva-se, inscríbete, inscriptions ouvertes, entries open |
| 🟡 `aguardando` | coming soon, em breve, próximamente, opens on |
| ⚪ `nao_verificado` | erro, timeout, captcha, bloqueio por robots.txt, nenhuma palavra-chave ou palavras de mais de um estado |

Espera o carregamento completo da página (`networkidle`, até 20 s) e lê **primeiro os botões e badges** (ex.: "Sold Out", "Waitlist", "Registration Closed", "Register"); só se não forem conclusivos usa o texto da página. Nas provas **IRONMAN**, a página oficial do evento em ironman.com é a fonte prioritária: se a prova ainda não tiver esse link, o script procura-o no calendário oficial (`ironman.com/races`) e grava-o. O script nunca escolhe um estado quando a página é ambígua, e **se nenhuma página responder (sem rede) não grava nenhum status**.

- **Timeout**: 45 s por página, com uma segunda tentativa.
- **Bloqueio (403/429/captcha)**: nova tentativa com user-agent de navegador real e carregamento completo.
- **Não perde informação**: se a verificação falhar, a prova mantém o último status confirmado (o card diz "última tentativa falhou"); só ao fim de **3 dias seguidos** de falha passa a **⚪ Não verificado há X dias**.
- **Diagnóstico**: `node scripts/check-status.js --diagnostico` (ou **Run workflow → modo: diagnostico**) lista só as provas com falha: URL usada, código HTTP, motivo (timeout, bloqueio, captcha, link errado, sem palavra-chave…) e um trecho da página. No GitHub, a tabela aparece no resumo da execução. É gentil com os sites: no máximo 1 pedido a cada 3 segundos, user-agent `MaxProvasStatusBot/1.0`, timeout de 20 s, respeita o `robots.txt`, não descarrega imagens nem vídeos, e páginas partilhadas por várias provas são abertas uma única vez. As mudanças do dia ficam em `data/status-log.json` (prova, de → para).

```bash
npm install && npx playwright install chromium
npm run check-status:dry      # só mostra o resultado
npm run check-status          # grava nos ficheiros
node scripts/check-status.js --pais=pt,es
node scripts/check-status.js --id=ironman-703-cascais --verbose   # mostra URL, botões e texto lidos
```

**Regra de edições:** cada registo é uma edição. Quando a data passa, a prova vai para o **Histórico**; se não existir ainda um registo para a edição seguinte, o script cria-o (`id` com o ano seguinte, `data: null`, `edicaoAnterior`) e a app mostra **"Próxima edição a anunciar"** até a data ser publicada no site oficial.

O workflow [`.github/workflows/check-status.yml`](.github/workflows/check-status.yml) corre **todos os dias às 07:00 de Madrid** (e no botão **Run workflow** do separador Actions), e só faz commit se algum status mudou. Os agendamentos do GitHub só correm no branch principal (`main`).

**Alertas no telemóvel:** se o secret `NTFY_TOPIC` existir, cada prova com `"favorita": true` que mude de status envia uma notificação ntfy, ex.: `🟢 Inscrições abertas: Meia de Cascais`.

---

## 💬 Coach de IA (chat)

Na aba **Coach → 💬 Conversar** há um chat com o **Coach Max Provas**, que responde **somente** sobre triathlon, natação, corrida e ciclismo (treinos, planilhas, ritmo/zonas, técnica, transições, equipamento, nutrição e hidratação, preparação para provas e recuperação). Perguntas fora do tema são recusadas educadamente; para dor ou lesão dá só orientação geral e recomenda médico/fisioterapeuta.

- **Front** (`js/chat.js`): histórico, campo de texto, botão Enviar (Enter envia, Shift+Enter muda de linha), indicador "a escrever", erro amigável com **Tentar de novo**, **Limpar conversa**. O histórico fica no `localStorage` do telemóvel (`maxprovas.chat`).
- **Worker** (`worker/src/chat.js`, rota `POST /chat`): proxy para `POST https://api.anthropic.com/v1/messages` com `anthropic-version: 2023-06-01`, modelo **`claude-haiku-5-5`**, `max_tokens: 1024`. O **system prompt** e a **chave** ficam só no Worker.
- **Limites**: só as **últimas 10 mensagens** vão para a API; **20 mensagens por hora por IP** (Cloudflare KV); 2000 caracteres por mensagem.
- **CORS**: só a origem em `ALLOWED_ORIGIN` (o seu GitHub Pages) pode chamar o Worker.

## 🧭 Coach: busca em linguagem natural

Na aba **Coach**, o campo **"O que você procura?"** aceita pedidos livres, com exemplos clicáveis por baixo.

1. O Worker (`worker/`) pede à Claude API (`claude-opus-5-5`, saída JSON estruturada) que extraia os filtros: modalidade, distância, países/região, período, nível e preferências.
2. A app procura na base (`data/races`) com esses filtros.
3. Com **3 ou mais** provas na base, a IA escolhe até 5 e explica porque combinam (sem web).
   Com **menos de 3**, o Worker usa a ferramenta de busca na web da Anthropic (`web_search_20250305`), priorizando sites oficiais (agregadores de calendários ficam bloqueados), e devolve até 5 opções.
4. Os resultados aparecem como cards com **📚 da base** ou **🌐 da web**, a fonte de cada um e os botões **⭐ Favoritar** e **Inscrever-me**.

Regras que o Worker aplica (não dependem só do modelo):

- **Links**: `urlOficial` e `fonte` só são aceites se vieram dos resultados reais da busca; uma opção sem fonte verificável é descartada.
- **Datas**: só aparecem se uma citação da busca contiver o trecho com a data; caso contrário o card mostra **"data a confirmar"**.
- **Limite**: 10 buscas na web por utilizador por dia (e 30 por IP), contadas no Worker (Cloudflare KV). As escolhas feitas só na base não contam.
- **Recusas**: o pedido usa o fallback do lado do servidor (`fallbacks: "default"`), por isso se o modelo recusar um pedido a API tenta outro modelo automaticamente.

**Favoritas**: ficam guardadas no próprio telemóvel (`localStorage`). Uma prova da web favoritada é gravada também como prova local (`maxprovas.racesLocais`), marcada **"adicionada pela busca"**, e passa a aparecer em Provas/Temporada. (Os alertas ntfy do robô continuam a usar o campo `"favorita": true` dos ficheiros `data/races`, porque o robô corre no GitHub e não vê o telemóvel.)

### Publicar o Worker (Cloudflare) — chat e busca

O mesmo Worker serve o chat (`/chat`) e a busca (`/coach`). Precisa de uma conta Cloudflare (o plano grátis chega), de Node.js 20+ e de uma chave da [Claude API](https://platform.claude.com/).

1. **Instalar o wrangler** (fica como dependência da pasta `worker/`):
   ```bash
   cd worker
   npm install
   ```
2. **Login na Cloudflare** (abre o navegador):
   ```bash
   npx wrangler login
   ```
3. **Criar o KV** usado pelos limites de uso:
   ```bash
   npx wrangler kv namespace create COACH_KV
   ```
   Copie o `id` que aparecer para `worker/wrangler.toml`, em `[[kv_namespaces]]`, no lugar de `COLE_AQUI_O_ID_DO_KV`.
4. **Origem autorizada**: em `worker/wrangler.toml`, confira `ALLOWED_ORIGIN` — o endereço do seu GitHub Pages, sem barra nem caminho no fim (ex.: `https://vyrz9pzbkb-ship-it.github.io`). Para testar localmente, acrescente `,http://localhost:8000`.
5. **Guardar a chave da API como secret** (cole a chave quando pedir; ela fica só na Cloudflare):
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   ```
6. **Testar e publicar**:
   ```bash
   npm test              # testes com respostas simuladas (não gastam API)
   npx wrangler deploy
   ```
   No fim aparece o endereço do Worker, ex.: `https://max-provas-coach.<a-sua-conta>.workers.dev`.
7. **Colar a URL no app**: abra [`js/config.js`](js/config.js) e preencha `coachApi` com esse endereço (sem barra no fim). Faça commit e push; o GitHub Pages republica em ~1 minuto.

Para ver erros em tempo real: `npx wrangler tail`.

Custos: cada mensagem do chat é 1 pedido ao Claude Haiku 5.5 (barato); cada busca de provas são 2 pedidos ao Claude Opus 5.5 (3 quando vai à web, mais o custo da busca na web).

---

## 🚀 Deploy no GitHub Pages

1. Faça push deste repositório para o GitHub (o repositório tem de ser público, ou ter um plano que permita Pages em privados).
2. No repositório: **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
4. Escolha o branch (ex.: `main`) e a pasta **`/ (root)`** → **Save**.
5. Após ~1 minuto a app fica em `https://<utilizador>.github.io/<repositório>/`.

Todos os caminhos são relativos, por isso funciona tanto na raiz como num subcaminho. O ficheiro `.nojekyll` desativa o processamento Jekyll.

### Instalar no iPhone

1. Abra o endereço no **Safari**.
2. Toque em **Partilhar** → **Adicionar ao ecrã principal**.
3. A app abre em ecrã inteiro e funciona offline depois da primeira visita.

### Atualizações e cache offline

- Os ficheiros de `data/` são pedidos **primeiro à rede** — as edições aparecem na próxima abertura (com ligação). Cada país consultado fica em cache para uso offline.
- HTML, JS e CSS vêm **sempre da rede** quando há ligação (a cache só é usada offline), para o `index.html` e os scripts serem sempre da mesma versão. Ícones e manifest vêm da cache e atualizam em segundo plano.
- **Ao publicar uma alteração de código, suba a versão nos três sítios** (o mesmo valor, ex.: `v9` → `v10`):
  1. `CACHE_VERSION` em [`sw.js`](sw.js);
  2. `MAX_PROVAS_BUILD` e o `?v=` dos `<script>`/`<link>` em [`index.html`](index.html);
  3. `MAX_PROVAS_APP_BUILD` em [`js/app.js`](js/app.js).

  Se um telemóvel tiver um service worker antigo que sirva um `app.js` de outra versão, o `index.html` deteta a diferença, apaga as caches, remove o service worker antigo e recarrega uma vez.

### Testar localmente

O service worker precisa de HTTP (não funciona com `file://`):

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

---

## 📁 Estrutura

```
.
├── index.html            # shell da app + meta tags iOS
├── manifest.json         # manifesto PWA
├── sw.js                 # service worker (offline)
├── .nojekyll
├── css/styles.css        # estilos (claro/escuro, safe-area)
├── js/app.js             # lógica: ecrãs, filtros, contagem regressiva, .ics
├── js/coach.js           # aba Coach: modos e busca em linguagem natural
├── js/chat.js            # aba Coach: chat com o Coach de IA
├── js/config.js          # endereço do Worker do Coach
├── worker/               # Cloudflare Worker do Coach: /chat (Haiku) e /coach (busca)
├── data/countries.json   # países com provas (gerado pelo script)
├── data/races/*.json     # ← provas, um ficheiro por país
├── tools/atualizar_paises.py  # valida dados e recalcula contagens
├── scripts/check-status.js    # robô de verificação do status das inscrições
├── .github/workflows/check-status.yml  # corre o robô todos os dias às 07:00 (Madrid)
├── package.json          # só para o robô (Playwright); a app não tem build
└── icons/                # ícones PWA + apple-touch-icon
```
