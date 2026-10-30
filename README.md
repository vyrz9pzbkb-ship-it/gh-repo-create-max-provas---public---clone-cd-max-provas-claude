# 🏁 Max Provas

PWA com provas de **corrida, triatlo, ciclismo e natação no mundo todo**.
HTML + CSS + JavaScript vanilla, sem build, pronto para o GitHub Pages.

- **Provas**: cards com badge de estado da inscrição, tag da série (ex.: `T100`, `Marathon Majors`), contagem regressiva, **Inscrever-me** e **Adicionar à agenda** (`.ics`, dia inteiro).
- **Filtro de país**: toque em 🌍 para escolher os países. Só aparecem países com provas, com bandeira e número de provas (ex.: 🇫🇷 França · 6). A app só descarrega os ficheiros dos países escolhidos, e a escolha fica guardada.
- **Filtro de série** (opcional): faixa de chips por cima dos resultados.
- **Temporada**: linha do tempo com as semanas entre provas; intervalos com menos de 4 semanas ficam a laranja.
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
| 🔴 `esgotada` | sold out, esgotado, agotado, complet, ausverkauft, waitlist, lista de espera |
| 🟢 `aberta` | register now, inscreva-se, inscríbete, inscriptions ouvertes, entries open |
| 🟡 `aguardando` | coming soon, em breve, próximamente, opens on |
| ⚪ `nao_verificado` | erro, timeout, captcha, bloqueio por robots.txt, nenhuma palavra-chave ou palavras de mais de um estado |

O script nunca escolhe um estado quando a página é ambígua. É gentil com os sites: no máximo 1 pedido a cada 3 segundos, user-agent `MaxProvasStatusBot/1.0`, timeout de 20 s, respeita o `robots.txt`, não descarrega imagens nem vídeos, e páginas partilhadas por várias provas são abertas uma única vez. As mudanças do dia ficam em `data/status-log.json` (prova, de → para).

```bash
npm install && npx playwright install chromium
npm run check-status:dry      # só mostra o resultado
npm run check-status          # grava nos ficheiros
node scripts/check-status.js --pais=pt,es
```

O workflow [`.github/workflows/check-status.yml`](.github/workflows/check-status.yml) corre **todos os dias às 07:00 de Madrid** (e no botão **Run workflow** do separador Actions), e só faz commit se algum status mudou. Os agendamentos do GitHub só correm no branch principal (`main`).

**Alertas no telemóvel:** se o secret `NTFY_TOPIC` existir, cada prova com `"favorita": true` que mude de status envia uma notificação ntfy, ex.: `🟢 Inscrições abertas: Meia de Cascais`.

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
- Os restantes ficheiros (HTML/CSS/JS/ícones) vêm da cache e são atualizados em segundo plano. Se alterar código e quiser forçar a atualização, incremente `CACHE_VERSION` em [`sw.js`](sw.js).

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
├── data/countries.json   # países com provas (gerado pelo script)
├── data/races/*.json     # ← provas, um ficheiro por país
├── tools/atualizar_paises.py  # valida dados e recalcula contagens
├── scripts/check-status.js    # robô de verificação do status das inscrições
├── .github/workflows/check-status.yml  # corre o robô todos os dias às 07:00 (Madrid)
├── package.json          # só para o robô (Playwright); a app não tem build
└── icons/                # ícones PWA + apple-touch-icon
```
