#!/usr/bin/env bash
# Compila una vista previa de la tesis con los borradores de Tesis/Desarollo/borradores/*-director.tex
# superpuestos sobre una copia de Tesis/Plantilla, sin tocar MainMatter/.
# Uso: bash Tesis/Desarollo/build-preview.sh   ->  Tesis/Desarollo/borradores/vista-previa-director.pdf
set -euo pipefail
T="$(cd "$(dirname "$0")/.." && pwd)"
B="$T/Desarollo/borradores"
S="$(mktemp -d)"
trap 'rm -rf "$S"' EXIT
cp -r "$T/Plantilla/." "$S/"
# Sin borrar los auxiliares, latexmk corre bibtex sobre un .aux vacío y falla.
rm -f "$S"/main.{aux,bbl,blg,brf,fdb_latexmk,fls,lof,log,lot,out,toc,pdf}
cp "$B/main-director.tex" "$S/main.tex"
cp "$B/cap0-director.tex" "$S/MainMatter/Cap0/M01-Introduction.tex"
cp "$B/cap1-director.tex" "$S/MainMatter/Cap1/M02-Chapter1.tex"
cp "$B/cap2-director.tex" "$S/MainMatter/Cap2/M03-Chapter2.tex"
cp "$B/cap3-director.tex" "$S/MainMatter/Cap3/M04-Chapter3.tex"
cp "$B/cap4-director.tex" "$S/MainMatter/Cap4/M05-Chapter4.tex"
cp "$B/cap5-director.tex" "$S/MainMatter/Cap5/M06-Chapter5.tex"
cp "$B/cap9-director.tex" "$S/MainMatter/Cap9/M10-Conclusiones.tex"
cp "$B/anexos-director.tex" "$S/BackMatter/B01-Anexos.tex"
cd "$S"
latexmk -pdf -interaction=nonstopmode main.tex > latexmk.out 2>&1 || { tail -20 latexmk.out; exit 1; }
# main.log tiene bytes no UTF-8: grep -a.
echo "Errores y referencias indefinidas:"; grep -a -E "^! |undefined" main.log | grep -av "Font shape" || echo "  ninguno"
pdfinfo main.pdf | grep Pages
grep -a -E '\{chapter\}' main.toc | sed -E 's/\\contentsline \{chapter\}\{(\\numberline \{([^}]*)\})?//; s/\}\{([0-9]+)\}\{.*/ | p. \1/'
cp main.pdf "$B/vista-previa-director.pdf"
echo "-> $B/vista-previa-director.pdf"
