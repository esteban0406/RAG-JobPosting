"""Label kappa-sample.csv in the terminal, one pair at a time.

Usage:
    python3 evaluation/analysis/annotate.py <kappa-sample.csv> [--split calibration|validation|all]

Shows the rows of --split that have no human grade yet, asks for a grade 0-3
(optionally followed by a note) and rewrites the sheet after every answer, so a
session can stop and resume at any time. It reads only the labeling sheet: the
judge's grades live in the judgment cache and are never shown. The scale and the
hard conditions are in kappa-instrucciones.md, next to the sheet. Standard
library only, so it runs without the analysis image.
"""

from __future__ import annotations

import argparse
import csv
import html
import io
import os
import shutil
import textwrap
from pathlib import Path

GRADE = "human_grade_0_3"
SCALE = [
    "0  no tiene nada que ver con la necesidad",
    "1  relacionada, pero no la satisface",
    "2  satisface lo principal; falta o se contradice algo secundario (seniority, una habilidad)",
    "3  dedicada a la necesidad y la satisface completa",
    "Condición dura (salario, remoto, tipo de contrato, ubicación) no informada o incumplida → máximo 1",
]
KEYS = "0-3 [nota] anotar · s saltar · a volver a la anterior · q salir"


def read_sheet(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        return list(reader.fieldnames or []), list(reader)


def write_sheet(path: Path, header: list[str], rows: list[dict[str, str]]) -> None:
    # Same layout as eval:kappa-export: bare header, every cell quoted, \n endings.
    buf = io.StringIO()
    buf.write(",".join(header) + "\n")
    csv.writer(buf, quoting=csv.QUOTE_ALL, lineterminator="\n").writerows(
        [row[h] for h in header] for row in rows
    )
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(buf.getvalue(), encoding="utf-8")
    os.replace(tmp, path)


def wrap(text: str, width: int) -> str:
    # Postings keep HTML entities (&#x27;) as stored; decode them for reading only.
    text = html.unescape(text)
    return "\n".join(textwrap.fill(line, width) if line else "" for line in text.splitlines())


def show(row: dict[str, str], labeled: int, total: int, split: str, message: str) -> None:
    width = min(shutil.get_terminal_size().columns, 110)
    print("\033[2J\033[H", end="")
    print(f"{split} · {labeled}/{total} anotados · fila {row['sample_id']}")
    print("=" * width)
    print("NECESIDAD")
    print(wrap(row["search_need"], width))
    print("-" * width)
    print("OFERTA")
    print(wrap(row["job_posting"], width))
    print("=" * width)
    print("\n".join(SCALE))
    if row[GRADE].strip():
        print(f"\nNota actual: {row[GRADE]}" + (f" ({row['notes']})" if row["notes"] else ""))
    if message:
        print(f"\n{message}")
    print(f"\n{KEYS}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("sheet", type=Path)
    parser.add_argument(
        "--split", choices=("calibration", "validation", "all"), default="calibration"
    )
    args = parser.parse_args()

    header, rows = read_sheet(args.sheet)
    scope = [i for i, r in enumerate(rows) if args.split in ("all", r["split"])]
    pending = [i for i in scope if not rows[i][GRADE].strip()]
    answered: list[int] = []
    pos, message = 0, ""
    while pos < len(pending):
        i = pending[pos]
        labeled = sum(1 for j in scope if rows[j][GRADE].strip())
        show(rows[i], labeled, len(scope), args.split, message)
        message = ""
        try:
            answer = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if answer == "q":
            break
        if answer == "s":
            pos += 1
            continue
        if answer == "a":
            if answered:
                pending.insert(pos, answered.pop())
            else:
                message = "No hay una anotación anterior en esta sesión."
            continue
        grade, _, note = answer.partition(" ")
        if grade not in {"0", "1", "2", "3"}:
            message = f"Respuesta no válida: {answer!r}. Escribe 0, 1, 2 o 3, opcionalmente seguido de una nota."
            continue
        rows[i][GRADE] = grade
        if note.strip():
            rows[i]["notes"] = note.strip()
        write_sheet(args.sheet, header, rows)
        answered.append(i)
        pos += 1

    labeled = sum(1 for j in scope if rows[j][GRADE].strip())
    print(f"{args.split}: {labeled}/{len(scope)} anotados. Guardado en {args.sheet}.")


if __name__ == "__main__":
    main()
