"""Verifica que cada cifra de la Discusión, las Conclusiones y el resumen tenga una fuente.

Fuentes: Resultados (Cap5 hasta antes de la Discusión, con sus tablas de borradores/tablas/), Metodología (Cap3), Anexos y steps.md.
Uso (desde la raíz del repositorio): python3 Tesis/Desarollo/check-numbers.py
Imprime las cifras sin fuente por texto revisado; una lista vacía significa que todas la tienen.
Los años, números de sección y similares pueden aparecer como falsos positivos: revisarlos a mano.
"""

import re
from pathlib import Path

D = Path(__file__).resolve().parent
B = D / "borradores"


def norm(s: str) -> str:
    return s.replace("{,}", ",").replace("\\,", "").replace("~", " ")


cap5 = (B / "M06-Chapter5-final.tex").read_text(encoding="utf-8")
cut = cap5.index("\\section{Discusión}")
sources = norm(
    cap5[:cut]
    + (B / "M04-Chapter3-final.tex").read_text(encoding="utf-8")
    + (B / "B01-Anexos-final.tex").read_text(encoding="utf-8")
    + (D / "steps.md").read_text(encoding="utf-8")
    # Tablas de Resultados generadas por evaluation/analysis/tables.py.
    + "".join(f.read_text(encoding="utf-8") for f in sorted((B / "tablas").glob("*.tex")))
)
checked = {
    "Discusión (Cap5)": cap5[cut:],
    "Conclusiones": (B / "M10-Conclusiones-final.tex").read_text(encoding="utf-8"),
    # El abstract usa punto decimal y coma de miles: se pasa a la notación del resto.
    "Resumen y abstract": (B / "F04-Abstract-final.tex").read_text(encoding="utf-8"),
}
for name, text in checked.items():
    text = norm(text)
    if name.startswith("Resumen"):
        es, en = text.split("\\section*{Abstract}")
        en = re.sub(r"(\d),(\d{3})", r"\1.\2", en)
        en = re.sub(r"(\d)\.(\d{1,2})(?!\d)", r"\1,\2", en)
        text = es + en
    numbers = set(re.findall(r"\d[\d.,]*\d|\d", text))
    missing = sorted(n for n in numbers if n not in sources and n.rstrip(".,") not in sources)
    print(f"{name}: {missing}")
