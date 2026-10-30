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
| `statusInscricao` | `"aberta"` \| `"aguardando"` \| `"esgotada"` \| `null` | 🟢 / 🟡 / 🔴 / "ver site". |
| `urlOficial` | URL ou `null` | Link "Site oficial". |
| `urlInscricao` | URL ou `null` | Botão **Inscrever-me**. Se a inscrição ainda não abriu, use o `urlOficial`. |
| `fonte` | URL | Página oficial de onde tirou a data (obrigatório quando há `data`). |
| `verificadoEm` | `"YYYY-MM-DD"` | Quando conferiu os dados. A mais recente aparece no rodapé. |
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
└── icons/                # ícones PWA + apple-touch-icon
```
