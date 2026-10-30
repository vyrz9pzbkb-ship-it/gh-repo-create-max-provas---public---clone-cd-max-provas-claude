#!/usr/bin/env python3
"""Valida data/races/*.json e regenera data/countries.json (com a contagem de provas).

Uso:  python3 tools/atualizar_paises.py

Não faz parte da app (que continua sem build): é só uma ajuda para quem edita os dados.
Para um país novo, crie data/races/{codigo}.json (código ISO 3166-1 alfa-2 em minúsculas)
e, se o código ainda não estiver em PAISES abaixo, acrescente-o.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RACES_DIR = ROOT / "data" / "races"
COUNTRIES = ROOT / "data" / "countries.json"

EUR, AS, AN, ASI, OCE, AFR = "Europa", "América do Sul", "América do Norte", "Ásia", "Oceania", "África"

PAISES = {
    # Europa
    "pt": ("Portugal", EUR), "es": ("Espanha", EUR), "fr": ("França", EUR), "it": ("Itália", EUR),
    "de": ("Alemanha", EUR), "gb": ("Reino Unido", EUR), "ie": ("Irlanda", EUR), "nl": ("Países Baixos", EUR),
    "be": ("Bélgica", EUR), "ch": ("Suíça", EUR), "at": ("Áustria", EUR), "dk": ("Dinamarca", EUR),
    "se": ("Suécia", EUR), "no": ("Noruega", EUR), "fi": ("Finlândia", EUR), "pl": ("Polónia", EUR),
    "cz": ("Chéquia", EUR), "sk": ("Eslováquia", EUR), "hu": ("Hungria", EUR), "gr": ("Grécia", EUR),
    "hr": ("Croácia", EUR), "si": ("Eslovénia", EUR), "ee": ("Estónia", EUR), "lv": ("Letónia", EUR),
    "lt": ("Lituânia", EUR), "ro": ("Roménia", EUR), "bg": ("Bulgária", EUR), "rs": ("Sérvia", EUR),
    "mt": ("Malta", EUR), "cy": ("Chipre", EUR), "lu": ("Luxemburgo", EUR), "is": ("Islândia", EUR),
    "tr": ("Turquia", EUR), "me": ("Montenegro", EUR), "mc": ("Mónaco", EUR), "ad": ("Andorra", EUR),
    # América do Sul
    "br": ("Brasil", AS), "ar": ("Argentina", AS), "cl": ("Chile", AS), "uy": ("Uruguai", AS),
    "pe": ("Peru", AS), "co": ("Colômbia", AS), "ec": ("Equador", AS), "py": ("Paraguai", AS),
    "bo": ("Bolívia", AS), "ve": ("Venezuela", AS),
    # América do Norte (inclui América Central e Caraíbas)
    "us": ("Estados Unidos", AN), "ca": ("Canadá", AN), "mx": ("México", AN), "cr": ("Costa Rica", AN),
    "pa": ("Panamá", AN), "gt": ("Guatemala", AN), "pr": ("Porto Rico", AN), "do": ("República Dominicana", AN),
    "bm": ("Bermudas", AN), "aw": ("Aruba", AN),
    # Ásia (inclui Médio Oriente)
    "ae": ("Emirados Árabes Unidos", ASI), "qa": ("Catar", ASI), "sa": ("Arábia Saudita", ASI), "bh": ("Barém", ASI),
    "om": ("Omã", ASI), "il": ("Israel", ASI), "jp": ("Japão", ASI), "cn": ("China", ASI), "kr": ("Coreia do Sul", ASI),
    "tw": ("Taiwan", ASI), "sg": ("Singapura", ASI), "my": ("Malásia", ASI), "th": ("Tailândia", ASI),
    "vn": ("Vietname", ASI), "ph": ("Filipinas", ASI), "id": ("Indonésia", ASI), "in": ("Índia", ASI),
    "uz": ("Uzbequistão", ASI), "kz": ("Cazaquistão", ASI), "hk": ("Hong Kong", ASI), "mv": ("Maldivas", ASI),
    # Oceania
    "au": ("Austrália", OCE), "nz": ("Nova Zelândia", OCE),
    # África
    "za": ("África do Sul", AFR), "ma": ("Marrocos", AFR), "eg": ("Egito", AFR), "ke": ("Quénia", AFR),
    "mu": ("Maurícia", AFR), "sc": ("Seicheles", AFR),
}

ORDEM_CONTINENTES = [EUR, AS, AN, ASI, OCE, AFR]
STATUS = {"aberta", "aguardando", "esgotada", None}
MODALIDADES = {"Corrida", "Triatlo", "Ciclismo", "Natação"}
OBRIGATORIOS = ["id", "nome", "local", "modalidade", "data", "dataConfirmada", "statusInscricao",
                "urlOficial", "urlInscricao", "fonte", "verificadoEm"]
DATA_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def bandeira(codigo):
    return "".join(chr(0x1F1E6 + ord(c) - ord("a")) for c in codigo.lower())


def main():
    erros = []
    ids = {}
    paises = []
    for f in sorted(RACES_DIR.glob("*.json")):
        codigo = f.stem
        if codigo not in PAISES:
            erros.append(f"{f.name}: código de país desconhecido (acrescente-o em PAISES)")
            continue
        try:
            provas = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            erros.append(f"{f.name}: JSON inválido — {e}")
            continue
        for i, r in enumerate(provas):
            onde = f"{f.name}[{i}] {r.get('id', '?')}"
            for campo in OBRIGATORIOS:
                if campo not in r:
                    erros.append(f"{onde}: falta o campo '{campo}'")
            if r.get("id") in ids:
                erros.append(f"{onde}: id repetido (também em {ids[r['id']]})")
            ids[r.get("id")] = f.name
            for campo in ("data", "verificadoEm"):
                if r.get(campo) is not None and not DATA_RE.match(str(r[campo])):
                    erros.append(f"{onde}: '{campo}' deve ser YYYY-MM-DD")
            if r.get("statusInscricao") not in STATUS:
                erros.append(f"{onde}: statusInscricao inválido")
            if r.get("modalidade") not in MODALIDADES:
                erros.append(f"{onde}: modalidade deve ser uma de {sorted(MODALIDADES)}")
            if r.get("data") and not r.get("fonte"):
                erros.append(f"{onde}: data preenchida sem 'fonte'")
        nome, continente = PAISES[codigo]
        paises.append({"codigo": codigo, "pais": nome, "continente": continente,
                       "bandeira": bandeira(codigo), "provas": len(provas)})

    if erros:
        print("\n".join(erros))
        sys.exit(1)

    paises.sort(key=lambda p: (ORDEM_CONTINENTES.index(p["continente"]), p["pais"]))
    COUNTRIES.write_text(json.dumps(paises, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(p["provas"] for p in paises)
    print(f"OK: {len(paises)} países, {total} provas → data/countries.json")


if __name__ == "__main__":
    main()
