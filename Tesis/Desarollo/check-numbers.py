"""Verificador estricto de las cifras de la tesis.

Cada cifra de la prosa de todos los capítulos y anexos debe tener fuente:
  1. las tablas generadas por evaluation/analysis/tables.py (borradores/tablas/res-*.tex);
  2. las macros de borradores/tablas/cifras.tex (generadas por el mismo script), que la
     prosa debería usar en lugar de escribir la cifra;
  3. check-numbers-permitidas.txt: números que no son datos (constantes del diseño,
     numeración, cifras de la literatura) y cifras verificadas contra los datos fuera de
     las tablas, cada uno con su motivo o su fuente, y limitado a ciertos archivos
     (prefijo del nombre: M06 vale para M06-Chapter5-final.tex).
steps.md NO es fuente.

Documentos revisados: los que compila build-preview-final.sh (el borrador *-final.tex si
existe, si no el de Plantilla/), en el orden de main.tex.

Coincidencia exacta del token numérico, con límites: «0,83» no pasa por estar dentro de
«0,839». No se revisan los comentarios LaTeX, los argumentos de \\label, \\ref, \\cite e
\\input, las especificaciones de tabular, las figuras TikZ ni los años (1950-2035). En el
abstract en inglés, el punto decimal y la coma de miles se pasan a la notación española.

Avisa también de las macros \\cXxx usadas y no definidas en cifras.tex, y de las definidas
y no usadas.

Uso (desde la raíz del repositorio): python3 Tesis/Desarollo/check-numbers.py [--resumen]
Sale con estado 1 si hay cifras sin fuente o macros indefinidas.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

D = Path(__file__).resolve().parent
T = D.parent
B = D / "borradores"
TABLAS = B / "tablas"
PERMITIDAS = D / "check-numbers-permitidas.txt"
DOCUMENTS = ["FrontMatter/F04-Abstract", "MainMatter/Cap0/M01-Introduction", "MainMatter/Cap1/M02-Chapter1",
             "MainMatter/Cap2/M03-Chapter2", "MainMatter/Cap3/M04-Chapter3", "MainMatter/Cap4/M05-Chapter4",
             "MainMatter/Cap5/M06-Chapter5", "MainMatter/Cap9/M10-Conclusiones", "BackMatter/B01-Anexos"]

TOKEN = re.compile(r"(?<![A-Za-z0-9@_.,/\\])\d+(?:[.,]\d+)*(?![A-Za-z0-9_])")
MACRO = re.compile(r"\\(c[A-Z][A-Za-z]*)")


def documents() -> list[Path]:
    """The draft that build-preview-final.sh copies over each template file, else the template's."""
    script = (D / "build-preview-final.sh").read_text(encoding="utf-8")
    drafts = {dest: B / src for src, dest in re.findall(r'cp "\$B/([^"]+)" "\$S/([^"]+)\.tex"', script)}
    return [drafts.get(doc, T / "Plantilla" / f"{doc}.tex") for doc in DOCUMENTS]


def clean(text: str) -> str:
    """Blank out what is not prose, keeping line numbers."""
    def blank(m: re.Match) -> str:
        return re.sub(r"[^\n]", " ", m.group(0))
    text = re.sub(r"(?<!\\)%[^\n]*", blank, text)
    text = re.sub(r"\\begin\{tikzpicture\}.*?\\end\{tikzpicture\}", blank, text, flags=re.S)
    text = re.sub(r"\\(?:label|ref|eqref|cite[a-z]*|input|include|includegraphics|url|href|hypersetup|texttt|symbol)"
                  r"(?:\[[^\]]*\])*\{[^}]*\}", blank, text)
    text = re.sub(r"\\begin\{(?:tabular|longtable|tabularx)\}(?:\{[^}]*\})+", blank, text)
    text = re.sub(r"\\(?:multicolumn|multirow|cline|hspace|vspace|rule|resizebox|scalebox)\{[^}]*\}(?:\{[^}]*\})?",
                  blank, text)
    text = re.sub(r"\[[^\]\n]*(?:width|height|scale)=[^\]\n]*\]", blank, text)
    text = re.sub(r"\d*\.?\d+\\(?:textwidth|linewidth|columnwidth|textheight)", blank, text)
    # Identificadores de consulta y de necesidad (en-no-02, n-co-03).
    text = re.sub(r"\b(?:en|es|n|ag)-[a-z]{2}-\d{2}\b", blank, text)
    return text


def norm(text: str) -> str:
    return text.replace("{,}", ",").replace("\\,", "").replace("~", " ")


def tokens(text: str) -> set[str]:
    return set(TOKEN.findall(norm(text)))


def english(token: str) -> str:
    if re.fullmatch(r"\d{1,3}(?:,\d{3})+", token):
        return token.replace(",", ".")
    return token.replace(".", ",") if re.fullmatch(r"\d+\.\d+", token) else token


def load_allowed() -> dict[str, set[str] | None]:
    """valor | archivos (prefijos del nombre separados por coma, p. ej. M06,B01; o *) | motivo o fuente."""
    allowed: dict[str, set[str] | None] = {}
    for n, line in enumerate(PERMITIDAS.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 3 or not parts[2]:
            sys.exit(f"{PERMITIDAS.name}:{n}: se esperan tres campos (valor | archivos | motivo)")
        value, files, _ = parts
        if files == "*":
            allowed[value] = None
        elif value not in allowed or allowed[value] is not None:
            allowed.setdefault(value, set()).update(f.strip() for f in files.split(","))
    return allowed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--resumen", action="store_true", help="solo los conteos por archivo")
    args = parser.parse_args()

    macros = dict(re.findall(r"\\newcommand\{\\(c[A-Za-z]+)\}\{(.*)\} %", (TABLAS / "cifras.tex").read_text("utf-8")))
    sources = tokens("".join(p.read_text("utf-8") for p in sorted(TABLAS.glob("res-*.tex"))))
    sources |= tokens(" ".join(macros.values()))
    allowed = load_allowed()

    failures, used = 0, set()
    for path in documents():
        raw = path.read_text(encoding="utf-8")
        used |= set(MACRO.findall(raw))
        text = clean(raw)
        english_from = text.find("\\section*{Abstract}") if "Abstract" in path.name else -1
        missing: dict[str, list[int]] = defaultdict(list)
        offset = 0
        for lineno, line in enumerate(text.split("\n"), 1):
            for m in TOKEN.finditer(norm(line)):
                token = m.group(0)
                if english_from >= 0 and offset >= english_from:
                    token = english(token)
                if re.fullmatch(r"(19[5-9]\d|20[0-3]\d)", token) or token in sources:
                    continue
                scope = allowed.get(token, set())
                if token in allowed and (scope is None or any(path.name.startswith(s) for s in scope)):
                    continue
                missing[token].append(lineno)
            offset += len(line) + 1
        count = sum(len(v) for v in missing.values())
        failures += count
        rel = path.relative_to(T)
        print(f"{rel}: {count} cifras sin fuente ({len(missing)} distintas)")
        if not args.resumen:
            for token, lines in sorted(missing.items(), key=lambda kv: kv[1][0]):
                print(f"    {token:>10}  líneas {', '.join(map(str, lines))}")

    undefined = sorted(used - macros.keys())
    unused = sorted(macros.keys() - used)
    print(f"Macros usadas y no definidas en cifras.tex: {undefined or 'ninguna'}")
    print(f"Macros definidas y no usadas: {len(unused)}" + (f" ({', '.join(unused)})" if unused and not args.resumen else ""))
    sys.exit(1 if failures or undefined else 0)


if __name__ == "__main__":
    main()
