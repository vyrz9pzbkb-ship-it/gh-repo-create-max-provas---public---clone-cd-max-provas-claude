# 🏁 Max Provas

PWA para acompanhar as minhas provas de corrida e triatlo em Portugal.
HTML + CSS + JavaScript vanilla, sem build, pronto para o GitHub Pages.

- **Provas**: cards ordenados por data, badge de estado da inscrição, contagem regressiva, botão **Inscrever-me** e **Adicionar à agenda** (`.ics`, dia inteiro).
- **Temporada**: linha do tempo vertical com as semanas entre cada prova; intervalos com menos de 4 semanas ficam destacados a laranja.
- **Histórico**: provas cuja data já passou, com o resultado (e se o objetivo foi cumprido).
- Funciona offline e pode ser instalada na Tela de Início do iPhone. Modo claro/escuro automático e suporte ao notch (safe-area).

---

## ✅ TODO — dados por preencher

Os campos abaixo estão a `null` em [`data/races.json`](data/races.json) de propósito: **não foram inventados**. Preencha-os com a informação oficial de cada prova.

| id | Prova | Preencher |
|----|-------|-----------|
| `descobrimentos` | Corrida dos Descobrimentos | `data`, `distancia`, `urlOficial`, `urlInscricao` — confirmar `nome` oficial e `local` |
| `sao-silvestre-lidl` | São Silvestre Lidl | `data`, `local`, `distancia`, `urlOficial`, `urlInscricao` |
| `meia-cascais` | Meia Maratona de Cascais | `data`, `urlOficial`, `urlInscricao` |
| `setubal-triathlon` | Setúbal Triathlon | `data`, `distancia` (sprint/olímpico/…), `urlOficial`, `urlInscricao` |
| `caminha` | Caminha | `data`, `distancia`, `urlOficial`, `urlInscricao` — confirmar `nome` e `modalidade` |
| `triton-lisboa` | TRITON Lisboa | `data`, `distancia`, `urlOficial`, `urlInscricao` |
| `t100-sines` | T100 Sines | `data`, `urlOficial`, `urlInscricao` |
| `ironman-703-cascais` | IRONMAN 70.3 Cascais | `data`, `urlOficial`, `urlInscricao` |

Em todas as provas:

- [ ] `statusInscricao` está como `"aguardando"` por defeito — atualize para `"aberta"` ou `"esgotada"` conforme o caso.
- [ ] `objetivoTempo` — opcional, preencha quando definir a meta.
- [ ] `resultado` — preencha depois de cada prova.

Enquanto a `data` estiver a `null`, a prova aparece em **"Data a confirmar"**, sem contagem regressiva, e o botão **Adicionar à agenda** fica desativado. Sem `urlInscricao`, o botão **Inscrever-me** fica desativado.

---

## ✏️ Como editar o `races.json`

O ficheiro é uma lista (`[...]`) de provas. Cada prova tem este formato:

```json
{
  "id": "meia-cascais",
  "nome": "Meia Maratona de Cascais",
  "local": "Cascais",
  "modalidade": "Corrida",
  "data": "2027-03-14",
  "distancia": "21,1 km",
  "statusInscricao": "aberta",
  "urlOficial": "https://…",
  "urlInscricao": "https://…",
  "objetivoTempo": "1:45:00",
  "resultado": null
}
```

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | texto | Único, sem espaços (usado no nome do ficheiro `.ics`). |
| `nome` | texto | Nome da prova. |
| `local` | texto ou `null` | Cidade/local. |
| `modalidade` | texto | Ex.: `"Corrida"`, `"Triatlo"`. Qualquer texto com "tri" mostra os ícones de triatlo. |
| `data` | `"YYYY-MM-DD"` ou `null` | Dia da prova. |
| `distancia` | texto ou `null` | Texto livre, ex.: `"10 km"`, `"Sprint (750 m · 20 km · 5 km)"`. |
| `statusInscricao` | `"aberta"` \| `"aguardando"` \| `"esgotada"` | 🟢 / 🟡 / 🔴 |
| `urlOficial` | URL ou `null` | Link "Site oficial". |
| `urlInscricao` | URL ou `null` | Aberto pelo botão **Inscrever-me**. |
| `objetivoTempo` | texto (opcional) | Formato `h:mm:ss` ou `mm:ss` para comparar com o resultado. |
| `resultado` | texto (opcional) | Tempo final, ex.: `"1:42:31"`. Aparece no Histórico. |

Dicas:

- JSON não aceita comentários nem vírgula depois do último elemento. Valide em <https://jsonlint.com> ou com `python3 -m json.tool data/races.json`.
- A ordem no ficheiro não importa: a app ordena por data.
- Uma prova passa para o **Histórico** automaticamente no dia seguinte à `data`.
- Para acrescentar uma prova, copie um bloco `{ … }`, cole-o na lista (separado por vírgula) e mude o `id`.

Pode editar diretamente no GitHub: abra `data/races.json` → ícone de lápis → **Commit changes**. O GitHub Pages republica em ~1 minuto.

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

- O `races.json` é pedido **primeiro à rede** — as edições aparecem na próxima abertura (com ligação).
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
├── js/app.js             # lógica: ecrãs, contagem regressiva, .ics
├── data/races.json       # ← as suas provas
└── icons/                # ícones PWA + apple-touch-icon
```
