# 🏁 Max Provas

PWA para acompanhar as minhas provas de corrida e triatlo em Portugal.
HTML + CSS + JavaScript vanilla, sem build, pronto para o GitHub Pages.

- **Provas**: cards ordenados por data, badge de estado da inscrição, contagem regressiva, botão **Inscrever-me** e **Adicionar à agenda** (`.ics`, dia inteiro).
- **Temporada**: linha do tempo vertical com as semanas entre cada prova; intervalos com menos de 4 semanas ficam destacados a laranja.
- **Histórico**: provas cuja data já passou, com o resultado (e se o objetivo foi cumprido).
- Funciona offline e pode ser instalada na Tela de Início do iPhone. Modo claro/escuro automático e suporte ao notch (safe-area).

---

## ✅ Estado dos dados (verificado em 30/10/2026)

As datas foram pesquisadas apenas em fontes oficiais (site da prova ou organizador). Cada prova tem o campo `fonte` com o link de onde a data foi tirada. Quando a próxima edição ainda não tem data divulgada, `data` fica `null` — nada foi inventado.

Ainda por fazer / confirmar:

- [ ] **Triatlo Longo de Caminha** — data de 2027 ainda não divulgada.
- [ ] **TRITON 1 Lisboa** — o calendário de 2027 só será anunciado em novembro de 2026.
- [ ] **Sines Triathlon** — data de 2027 ainda não divulgada. (Nota: não é uma etapa oficial do circuito T100; é o triatlo de 100 km da HMS Sports em Sines.)
- [ ] **IRONMAN 70.3 Portugal-Cascais** — `urlOficial`/`urlInscricao` apontam para a página oficial do IRONMAN Portugal no Facebook; trocar pela página do evento em ironman.com.
- [ ] **Estados de inscrição** — confirmar no site: a Meia dos Descobrimentos e a São Silvestre mostravam "inscrições abertas" na página inicial e "esgotada" na página de inscrições; o IRONMAN 70.3 foi anunciado como aberto, mas a imprensa já fala em esgotado.
- [ ] `objetivoTempo` — opcional, preencha quando definir a meta.
- [ ] `resultado` — preencha depois de cada prova.

Enquanto a `data` estiver a `null`, a prova aparece em **"Data a confirmar"**, sem contagem regressiva, e o botão **Adicionar à agenda** fica desativado.

---

## ✏️ Como editar o `races.json`

O ficheiro é uma lista (`[...]`) de provas. Cada prova tem este formato:

```json
{
  "id": "meia-cascais",
  "nome": "Meia Maratona de Cascais",
  "local": "Cascais",
  "modalidade": "Corrida",
  "data": "2027-02-07",
  "dataConfirmada": true,
  "distancia": "21,1 km",
  "statusInscricao": "aberta",
  "urlOficial": "https://…",
  "urlInscricao": "https://…",
  "fonte": "https://…",
  "verificadoEm": "2026-10-30",
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
| `dataConfirmada` | `true` / `false` | `false` mostra a etiqueta discreta **"data prevista"**. |
| `distancia` | texto ou `null` | Texto livre, ex.: `"10 km"`, `"Sprint (750 m · 20 km · 5 km)"`. |
| `statusInscricao` | `"aberta"` \| `"aguardando"` \| `"esgotada"` | 🟢 / 🟡 / 🔴 |
| `urlOficial` | URL ou `null` | Link "Site oficial". |
| `urlInscricao` | URL ou `null` | Aberto pelo botão **Inscrever-me**. Se a inscrição ainda não abriu, use o mesmo link do `urlOficial`. |
| `fonte` | URL | Página oficial de onde tirou a data (link "Fonte da data" no card). |
| `verificadoEm` | `"YYYY-MM-DD"` | Quando conferiu os dados. A mais recente aparece no rodapé: "Atualizado em …". |
| `objetivoTempo` | texto (opcional) | Formato `h:mm:ss` ou `mm:ss` para comparar com o resultado. |
| `resultado` | texto (opcional) | Tempo final, ex.: `"1:42:31"`. Aparece no Histórico. |

Dicas:

- JSON não aceita comentários nem vírgula depois do último elemento. Valide em <https://jsonlint.com> ou com `python3 -m json.tool data/races.json`.
- A ordem no ficheiro não importa: a app mostra primeiro as provas com inscrição aberta, depois ordena por data; provas sem data ficam no fim.
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
