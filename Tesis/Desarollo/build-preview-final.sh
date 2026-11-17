#!/usr/bin/env bash
# Compila la vista previa de la versión final: superpone los borradores *-final.tex y las figuras
# del juez final (GPT-6 Sol) sobre una copia de Tesis/Plantilla, sin tocar MainMatter/.
# Uso (desde la raíz del repositorio): bash Tesis/Desarollo/build-preview-final.sh
#   -> Tesis/Desarollo/borradores/vista-previa-final.pdf
set -euo pipefail
T="$(cd "$(dirname "$0")/.." && pwd)"
B="$T/Desarollo/borradores"
S="$(mktemp -d)"
trap 'rm -rf "$S"' EXIT
cp -r "$T/Plantilla/." "$S/"
# Sin borrar los auxiliares, latexmk corre bibtex sobre un .aux vacío y falla.
rm -f "$S"/main.{aux,bbl,blg,brf,fdb_latexmk,fls,lof,log,lot,out,toc,pdf}
cp "$B/F04-Abstract-final.tex" "$S/FrontMatter/F04-Abstract.tex"
cp "$B/M04-Chapter3-final.tex" "$S/MainMatter/Cap3/M04-Chapter3.tex"
cp "$B/M06-Chapter5-final.tex" "$S/MainMatter/Cap5/M06-Chapter5.tex"
cp "$B/M10-Conclusiones-final.tex" "$S/MainMatter/Cap9/M10-Conclusiones.tex"
cp "$B/B01-Anexos-final.tex" "$S/BackMatter/B01-Anexos.tex"
cp "$B"/figuras-gpt6sol/*.pdf "$S/Images/resultados/"
cd "$S"
latexmk -pdf -interaction=nonstopmode main.tex > latexmk.out 2>&1 || { tail -20 latexmk.out; exit 1; }
# main.log tiene bytes no UTF-8: grep -a.
echo "Errores y referencias indefinidas:"; grep -a -E "^! |undefined" main.log | grep -av "Font shape" || echo "  ninguno"
pdfinfo main.pdf | grep Pages
for p in 3 4 5; do printf "p. %s: " "$p"; pdftotext -f "$p" -l "$p" main.pdf - | head -1; done
grep -a -E '\{chapter\}' main.toc | sed -E 's/\\contentsline \{chapter\}\{(\\numberline \{([^}]*)\})?//; s/\}\{([0-9]+)\}\{.*/ | p. \1/'
cp main.pdf "$B/vista-previa-final.pdf"
echo "-> $B/vista-previa-final.pdf"
