"""LaTeX tables of the Results chapter, generated from the runs' CSV/JSON files.

Usage (from the repository root, image jobai-analysis):
    python evaluation/analysis/tables.py [--out DIR] [--check CHAPTER.tex]

Writes one .tex per table (the whole table environment: caption, label and
tabular) to --out (default Tesis/Desarollo/borradores/tablas/); the chapter
includes them with \\input. It also writes cifras.tex: one \\newcommand per figure
that the prose repeats (abstract, Introduction, Discussion, Conclusions), read by
the preamble. The rest of the prose's figures are checked with
Tesis/Desarollo/check-numbers.py.

--check compares every generated table with the table of the same \\label in a
chapter that still has the tables written by hand: the sequences of numbers must
be identical (regression test, E5 of decisiones-revision-borrador1.md). It exits
with status 1 and prints the differences otherwise.

Numbers are rounded half-up on their decimal representation, as when the tables
were written by hand (0.9175 -> 0.918), and printed with a decimal comma.
The table of failures (tab:res-fallas) is qualitative and stays in the chapter.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import numpy as np
import pandas as pd

RUNS = Path("evaluation/runs")
# PE1: retrieval run on the test set with the 13 systems (the 9 of the final run of
# 2026-10-14, reproduced list by list, plus the 4 added after the first draft's
# review, E1) and its analysis with the final judge over the expanded pool.
RETRIEVE = RUNS / "2026-11-17T01-31-32-1a7ec43-dirty-retrieve-test-e1"
FINAL_JUDGE = "api.openai.com_gpt-6-sol_reasoning_none"
ANALYSIS = RETRIEVE / f"analysis-qrels.{FINAL_JUDGE}"
# Judge validation (kappa files) lives in the final run of 2026-10-14.
KAPPA_RUN = RUNS / "2026-10-14T19-15-49-565eff3-retrieve-test-full"
# Calibration table: (kappa file suffix, name in the thesis), in the thesis order.
CALIBRATION_JUDGES = [
    ("anthropic_claude-sonnet-5-5_temperature_default_thinking_between_tools_max_tokens_1024", "Claude Sonnet 5.5"),
    (FINAL_JUDGE, "GPT-6 Sol, sin razonamiento"),
    ("localhost_11434_llama3.1_8b", "Llama 3.1 8B (juez local)"),
    ("api.openai.com_gpt-4o", "GPT-4o"),
]
# Aggregation route before and after fixing A7.
AGGREGATION = [RUNS / "2026-10-14T22-51-22-de8c6d4-dirty-aggregation-test-full",
               RUNS / "2026-10-15T01-27-38-b7770cd-aggregation-test-full-fix"]
# PE2: answers of the final configuration, scored by RAGAS.
GENERATE = RUNS / "2026-10-14T20-15-22-de8c6d4-dirty-generate-test-full"
RAGAS_FINAL = GENERATE / "ragas-gpt-6-sol_reasoning_none_temperature_0.csv"
RAGAS_LOCAL = GENERATE / "ragas-llama3.1_8b-ctx16k.csv"
# E2: the Iteration 1 answers, scored by RAGAS with the final judge after the review.
GENERATE_ITER1 = RUNS / "2026-10-14T00-59-39-717ba41-dirty-generate-full"
# PE3: local stages (iteration, engine) and provider-side stages per iteration.
LATENCY_LOCAL = {
    ("1", "qdrant"): RUNS / "2026-10-14T00-22-50-717ba41-dirty-latency-qdrant-local",
    ("1", "pgvector"): RUNS / "2026-10-14T00-18-46-717ba41-dirty-latency-pgvector-local",
    ("2", "qdrant"): RUNS / "2026-10-15T00-03-20-de8c6d4-dirty-latency-qdrant-test-full-local",
    ("2", "pgvector"): RUNS / "2026-10-15T00-44-51-de8c6d4-dirty-latency-pgvector-test-full-local",
}
LATENCY_GENERATION = {
    "1": RUNS / "2026-10-14T01-06-11-717ba41-dirty-latency-qdrant-generation",
    "2": RUNS / "2026-11-01T17-44-24-a951cf6-latency-qdrant-test-full-generation",
}
# PE4: vector search on the real corpus, and the store benchmark.
ANN_QUICK = RUNS / "2026-10-14T15-15-43-a5d0782-ann-quick"
BENCH = Path("evaluation/bench/results/summary.csv")
BENCH_EXACT_FILTERED = Path("evaluation/bench/results-scan-limit/exact-filtered.jsonl")

PE1_SYSTEMS = [
    ("ilike", "ILIKE"),
    ("bm25", "BM25"),
    ("qdrant-e5base", "Denso, e5-base-v2 (Iteración~1)"),
    ("pg-exact", "Denso, pgvector exacto"),
    ("pg-hnsw", "Denso, pgvector HNSW"),
    ("qdrant-hnsw", "Denso, Qdrant HNSW"),
    ("qdrant-filtered", "+ filtros"),
    ("qdrant-hybrid", "+ híbrida"),
    ("qdrant-hybrid-rerank", "+ reordenamiento (completa)"),
]
# Systems added after the first draft's review (E1), shown under a separator.
POST_HOC_SYSTEMS = [
    ("bm25-filtered", "BM25 + filtros"),
    ("bm25-filtered-rerank", "BM25 + filtros + reordenamiento"),
    ("qdrant-filtered-rerank", "Completa sin búsqueda híbrida"),
    ("qdrant-hybrid-rerank-nofilter", "Completa sin filtros"),
]
POST_HOC_LABEL = "\\textit{Análisis posterior a la revisión}"
CATEGORIES = [
    ("exact", "Exactas"),
    ("semantic_vocab_mismatch", "Desajuste de vocabulario"),
    ("constraint", "Con restricciones"),
    ("noisy", "Ruidosas"),
]


# ---------------------------------------------------------------- formatting

def num(value: float, decimals: int) -> str:
    """Half-up rounding on the decimal representation, decimal comma."""
    quantum = Decimal(1).scaleb(-decimals)
    text = str(Decimal(repr(float(value))).quantize(quantum, rounding=ROUND_HALF_UP))
    if text.startswith("-") and Decimal(text) == 0:
        text = text[1:]
    return text.replace(".", "{,}")


def signed(value: float, decimals: int = 3) -> str:
    text = num(value, decimals)
    return f"${text if text.startswith('-') else '+' + text}$"


def diff_ci(row: pd.Series) -> str:
    return f"{signed(row['mean_diff'])} [{signed(row['ci95_low'])}; {signed(row['ci95_high'])}]"


def thousands(value: int) -> str:
    return f"{value:,}".replace(",", ".")


def table(label: str, caption: str, spec: str, rows: list[str], small: bool = False) -> str:
    """A table environment with a rule after every row, as in the rest of the thesis."""
    lines = [
        "\\begin{table}[htbp!]",
        "    \\centering",
        f"    \\caption{{{caption}}}",
        f"    \\label{{{label}}}",
    ]
    if small:
        lines.append("    \\small")
    lines += [f"    \\begin{{tabular}}{{{spec}}}", "        \\hline"]
    for row in rows:
        lines += [f"        {row}", "        \\hline"]
    lines += ["    \\end{tabular}", "\\end{table}", ""]
    return "\n".join(lines)


def cells(*values: str) -> str:
    return " & ".join(values) + " \\\\"


def separator(columns: int) -> str:
    return f"\\multicolumn{{{columns}}}{{|l|}}{{{POST_HOC_LABEL}}} \\\\"


def header(*names: str) -> str:
    return cells(*[f"\\textbf{{{n}}}" for n in names])


# ---------------------------------------------------------------- data

def summary() -> pd.DataFrame:
    return pd.read_csv(ANALYSIS / "summary.csv").set_index(["group", "system"])


def kappa(judge: str) -> dict:
    return json.loads((KAPPA_RUN / f"kappa-{judge}.json").read_text())


def latency_records(run: Path) -> pd.DataFrame:
    rows = [json.loads(line) for line in (run / "latency.jsonl").read_text().splitlines() if line.strip()]
    return pd.DataFrame(rows)


def p50_p95(values: pd.Series | np.ndarray) -> tuple[float, float]:
    """Linear interpolation between ranks, as percentile() in backend/src/cli/run-context.ts."""
    values = np.asarray(values, dtype=float)
    return float(np.percentile(values, 50)), float(np.percentile(values, 95))


# ---------------------------------------------------------------- tables

def kappa_calibration() -> str:
    rows = [header("Juez", "Acuerdo exacto", "$\\kappa$ binario", "$\\kappa$ ponderado")]
    for judge, name in CALIBRATION_JUDGES:
        cal = kappa(judge)["calibration"]
        low, high = cal["kappa_binary_ci95"]
        rows.append(cells(
            name,
            num(cal["exact_agreement"], 2),
            f"{num(cal['kappa_binary'], 3)} [{num(low, 3)}; {num(high, 3)}]",
            num(cal["kappa_quadratic"], 3),
        ))
    n = kappa(FINAL_JUDGE)["calibration"]["n"]
    return table("tab:res-kappa-cal",
                 f"Acuerdo de los jueces con las etiquetas humanas revisadas en los {n} pares de calibración, "
                 "con IC bootstrap del 95\\,\\%", "|l|c|c|c|", rows)


def kappa_validation() -> str:
    val = kappa(FINAL_JUDGE)["validation"]
    matrix = np.array(val["confusion_rows_human_cols_judge"])
    rows = [header("Humano $\\backslash$ juez", "0", "1", "2", "3", "Total")]
    for grade, line in enumerate(matrix):
        rows.append(cells(str(grade), *[str(v) for v in line], str(line.sum())))
    rows.append(cells("Total", *[str(v) for v in matrix.sum(axis=0)], str(matrix.sum())))
    return table("tab:res-kappa-val",
                 f"Matriz de confusión de GPT-6 Sol frente a las etiquetas humanas en los {val['n']} pares de validación",
                 "|l|c|c|c|c|c|", rows)


def needs_count() -> int:
    per_query = pd.read_csv(ANALYSIS / "per_query.csv")
    return per_query["info_need"].nunique()


def pe1_global() -> str:
    data = summary()
    measures = ["P@5", "P@10", "nDCG@10", "MRR", "R@10"]
    rows = [header("Sistema", *measures)]
    for system, name in PE1_SYSTEMS:
        rows.append(cells(name, *[num(data.at[("all", system), m], 3) for m in measures]))
    rows.append(separator(len(measures) + 1))
    for system, name in POST_HOC_SYSTEMS:
        rows.append(cells(name, *[num(data.at[("all", system), m], 3) for m in measures]))
    return table("tab:res-pe1-global", f"Calidad de recuperación por sistema (media sobre {needs_count()} necesidades)",
                 "|l|c|c|c|c|c|", rows)


def ladder() -> str:
    data = summary()
    steps = pd.read_csv(ANALYSIS / "ladder.csv")
    steps = steps[(steps["measure"] == "nDCG@10") & (steps["subset"] == "all")].set_index(["system", "reference"])
    rows = [header("Sistema", "nDCG@10", "Diferencia", "$p_{Holm}$"),
            cells("Denso, Qdrant HNSW", num(data.at[("all", "qdrant-hnsw"), "nDCG@10"], 3), "--", "--")]
    for system, reference, name in [("qdrant-filtered", "qdrant-hnsw", "+ filtros"),
                                    ("qdrant-hybrid", "qdrant-filtered", "+ híbrida"),
                                    ("qdrant-hybrid-rerank", "qdrant-hybrid", "+ reordenamiento")]:
        row = steps.loc[(system, reference)]
        rows.append(cells(name, num(data.at[("all", system), "nDCG@10"], 3), diff_ci(row), num(row["p_holm"], 3)))
    row = steps.loc[("qdrant-hybrid-rerank", "qdrant-hnsw")]
    rows.append(cells("Iteración completa frente al denso", "--", diff_ci(row), num(row["p_holm"], 3)))
    return table("tab:res-escalera",
                 "Escalera de componentes: nDCG@10 y diferencia con el peldaño anterior, con IC bootstrap del 95\\,\\% "
                 f"({needs_count()} necesidades)", "|l|c|c|c|", rows)


LADDER_SYSTEMS = ["bm25", "qdrant-e5base", "qdrant-hnsw", "qdrant-filtered", "qdrant-hybrid", "qdrant-hybrid-rerank"]


def system_rows(systems: list[str], value, columns: int, names: dict[str, str] | None = None) -> list[str]:
    """Rows of the final run's systems, then the post hoc ones under a separator."""
    names = {**dict(PE1_SYSTEMS), **dict(POST_HOC_SYSTEMS), **(names or {})}
    rows = [cells(names[s], *value(s)) for s in systems]
    rows.append(separator(columns))
    rows += [cells(names[s], *value(s)) for s, _ in POST_HOC_SYSTEMS]
    return rows


def by_category() -> str:
    data = summary()
    per_query = pd.read_csv(ANALYSIS / "per_query.csv")
    per_category = per_query.groupby("category")["info_need"].nunique()
    short = {"semantic_vocab_mismatch": "Vocabulario", "constraint": "Restricciones"}
    rows = [header("Sistema", *[short.get(c, name) for c, name in CATEGORIES])]
    rows += system_rows(LADDER_SYSTEMS,
                        lambda s: [num(data.at[(f"category={c}", s), "nDCG@10"], 3) for c, _ in CATEGORIES],
                        len(CATEGORIES) + 1)
    sizes = {int(per_category[c]) for c, _ in CATEGORIES}
    size = f"{sizes.pop()} necesidades por categoría" if len(sizes) == 1 else "necesidades por categoría variables"
    return table("tab:res-pe1-categoria", f"nDCG@10 por categoría de consulta ({size})", "|l|c|c|c|c|", rows,
                 small=True)


def compliance() -> str:
    data = summary()
    per_query = pd.read_csv(ANALYSIS / "per_query.csv")
    needs = per_query.loc[per_query["measure"] == "C@5", "info_need"].nunique()
    rows = [header("Sistema", "C@5", "C@10")]
    rows += system_rows(LADDER_SYSTEMS, lambda s: [num(data.at[("all", s), m], 3) for m in ("C@5", "C@10")], 3)
    return table("tab:res-restricciones",
                 f"Cumplimiento de restricciones en las 5 y 10 primeras posiciones ({needs} necesidades)",
                 "|l|c|c|", rows)


def by_language() -> str:
    data = summary()
    per_query = pd.read_csv(ANALYSIS / "per_query.csv")
    n_es = per_query.loc[(per_query["lang"] == "es"), "query_id"].nunique()
    names = {"qdrant-e5base": "Denso, e5-base-v2", "qdrant-hnsw": "Denso, multilingual-e5-base"}
    rows = [header("Sistema", "Español", "Inglés (mismas necesidades)")]
    rows += system_rows(LADDER_SYSTEMS,
                        lambda s: [num(data.at[("lang=es", s), "nDCG@10"], 3),
                                   num(data.at[("lang=en-parallel", s), "nDCG@10"], 3)], 3, names)
    return table("tab:res-pe1-idioma",
                 f"nDCG@10 de las consultas en español y de sus contrapartes en inglés ({n_es} consultas cada una)",
                 "|l|c|c|", rows)


def post_hoc() -> str:
    """Comparisons added after the first draft's review: their own Holm family (posthoc.csv)."""
    names = {**dict(PE1_SYSTEMS), **dict(POST_HOC_SYSTEMS), "qdrant-hybrid-rerank": "Completa"}
    names["qdrant-filtered"] = "Denso + filtros"
    tests = pd.read_csv(ANALYSIS / "posthoc.csv")
    ndcg = tests[tests["measure"] == "nDCG@10"]
    c5 = tests[tests["measure"] == "C@5"].set_index(["system", "reference"])
    rows = [header("Comparación", "Diferencia en nDCG@10", "$p_{Holm}$", "C@5")]
    for _, row in ndcg.iterrows():
        key = (row["system"], row["reference"])
        c = c5.loc[key]
        rows.append(cells(f"{names[row['system']]} frente a {names[row['reference']].lower() if row['reference'].startswith('qdrant') else names[row['reference']]}",
                          diff_ci(row), "$< 0{,}001$" if row["p_holm"] < 0.001 else num(row["p_holm"], 3),
                          f"{num(c['mean_system'], 3)} / {num(c['mean_reference'], 3)}"))
    return table("tab:res-posthoc",
                 f"Comparaciones posteriores a la revisión: nDCG@10 con IC bootstrap del 95\\,\\% y Holm sobre "
                 f"{len(ndcg)} comparaciones ({int(ndcg['n'].iloc[0])} necesidades); C@5 del sistema y de la referencia",
                 "|l|c|c|c|", rows, small=True)


def aggregation() -> str:
    before, after = [json.loads((run / "config.json").read_text()) for run in AGGREGATION]
    n = after["queries"]

    def count(cfg: dict, key: str) -> str:
        return f"{round(cfg[key] * cfg['queries'])} ({num(cfg[key], 3)})"

    rows = [header("Medida", "Antes", "Después"),
            cells("Ruta y plantilla esperadas", count(before, "routingAccuracy"), count(after, "routingAccuracy")),
            cells("Respuesta exacta frente a la referencia", count(before, "answerExact"), count(after, "answerExact")),
            cells("Proporción media de filas cubiertas", num(before["meanCoverage"], 3), num(after["meanCoverage"], 3))]
    return table("tab:res-agregacion", f"Exactitud de la ruta de agregación ({n} consultas)", "|l|c|c|", rows)


def ragas() -> str:
    final = pd.read_csv(RAGAS_FINAL).set_index("queryId")
    local = pd.read_csv(RAGAS_LOCAL)
    # The local judge's CSV carries the raw output of failed rows on extra lines;
    # keep the scored answers only.
    local = local[local["queryId"].isin(final.index)].drop_duplicates("queryId").set_index("queryId")
    local["faithfulness"] = pd.to_numeric(local["faithfulness"], errors="coerce")
    groups = [("Todas", final.index)]
    groups += [(name, final.index[final["category"] == c]) for c, name in CATEGORIES]
    groups += [("Inglés", final.index[final["lang"] == "en"]), ("Español", final.index[final["lang"] == "es"])]
    rows = [header("Grupo", "$n$", "Fidelidad", "Relevancia", "Fidelidad, juez local")]
    for name, ids in groups:
        part = final.loc[ids]
        rows.append(cells(name, str(part["faithfulness"].notna().sum()), num(part["faithfulness"].mean(), 3),
                          num(part["answer_relevancy"].mean(), 3),
                          num(local.reindex(ids)["faithfulness"].mean(), 3)))
    return table("tab:res-pe2", "Fidelidad y relevancia de la respuesta (RAGAS), por categoría e idioma",
                 "|l|c|c|c|c|", rows)


def paired_p(diff: np.ndarray, seed: int = 42, permutations: int = 10_000) -> float:
    """Two-sided paired randomization test, as in metrics.py (fresh generator per test)."""
    rng = np.random.default_rng(seed)
    signs = rng.choice([-1.0, 1.0], size=(permutations, diff.size))
    return float((np.sum(np.abs((signs * diff).mean(axis=1)) >= abs(diff.mean())) + 1) / (permutations + 1))


def ragas_iterations() -> str:
    """E2: RAGAS with the final judge on the Iteration 1 and Iteration 2 answers, on the
    queries whose text did not change between the runs and that both scored."""
    def load(run: Path) -> pd.DataFrame:
        answers = pd.DataFrame([json.loads(l) for l in (run / "answers.jsonl").read_text().splitlines() if l.strip()])
        scores = pd.read_csv(run / "ragas-gpt-6-sol_reasoning_none_temperature_0.csv")
        return answers.set_index("queryId")[["question", "category", "lang"]].join(
            scores.set_index("queryId")[["faithfulness", "answer_relevancy"]])
    it1, it2 = load(GENERATE_ITER1), load(GENERATE)
    common = [q for q in it1.index if q in it2.index and it1.at[q, "question"] == it2.at[q, "question"]
              and pd.notna(it2.at[q, "faithfulness"]) and pd.notna(it1.at[q, "faithfulness"])]
    it1, it2 = it1.loc[common], it2.loc[common]
    groups = [("Todas", it1.index)] + [(name, it1.index[it1["category"] == c]) for c, name in CATEGORIES]
    groups += [("Inglés", it1.index[it1["lang"] == "en"]), ("Español", it1.index[it1["lang"] == "es"])]

    def cell(ids, metric: str) -> str:
        a, b = it1.loc[ids, metric], it2.loc[ids, metric]
        p = paired_p((b - a).to_numpy())
        p_text = "$< 0{,}001$" if p < 0.001 else num(p, 3)
        return f"{num(a.mean(), 3)} $\\rightarrow$ {num(b.mean(), 3)} ({p_text})"

    rows = [header("Grupo", "$n$", "Fidelidad", "Relevancia")]
    rows += [cells(name, str(len(ids)), cell(ids, "faithfulness"), cell(ids, "answer_relevancy")) for name, ids in groups]
    return table("tab:res-pe2-iteraciones",
                 "RAGAS con el juez final en las respuestas de la Iteración~1 y la Iteración~2: media de cada iteración "
                 f"y, entre paréntesis, $p$ de la prueba de aleatorización pareada sin ajustar ({len(common)} consultas "
                 "comunes)", "|l|c|c|c|", rows, small=True)


def latency_local() -> str:
    summaries = {key: json.loads((run / "summary.json").read_text())["local"] for key, run in LATENCY_LOCAL.items()}
    order = [("1", "qdrant"), ("1", "pgvector"), ("2", "qdrant"), ("2", "pgvector")]
    stages = [
        ("\\textit{Embedding} de la consulta", "embedMs"),
        ("Búsqueda densa", "denseMs"),
        ("BM25", "bm25Ms"),
        ("Fusión", "fuseMs"),
        ("Lectura de las ofertas", "fetchMs"),
        ("Reordenamiento", "rerankMs"),
        ("Contexto completo", "contextMs"),
    ]

    def cell(key: tuple[str, str], stage: str) -> str:
        values = summaries[key].get(stage)
        if values is None and stage == "denseMs":
            # Iteration 1 had a single retrieval step: the dense search.
            values = summaries[key].get("retrieveMs")
        if not values or not values["n"]:
            return "--"
        return f"{num(values['p50'], 1)} / {num(values['p95'], 1)}"

    rows = [
        "\\multirow{2}{*}{\\textbf{Etapa}} & \\multicolumn{2}{c|}{\\textbf{Iteración~1}} & "
        "\\multicolumn{2}{c|}{\\textbf{Iteración~2}} \\\\\n        \\cline{2-5}\n"
        "         & \\textbf{Qdrant} & \\textbf{pgvector} & \\textbf{Qdrant} & \\textbf{pgvector} \\\\",
    ]
    rows += [cells(name, *[cell(key, stage) for key in order]) for name, stage in stages]
    sizes = []
    for iteration in ("1", "2"):
        run = LATENCY_LOCAL[(iteration, "qdrant")]
        records = latency_records(run)
        # Queries with a context (the gated ones build none), times the repetitions.
        queries = records.loc[records["kind"] == "context", "queryId"].nunique()
        reps = json.loads((run / "config.json").read_text())["repetitions"]
        sizes.append(f"\\multicolumn{{2}}{{c|}}{{${queries} \\times {reps}$}}")
    rows.append("Consultas $\\times$ repeticiones & " + " & ".join(sizes) + " \\\\")
    return table("tab:res-pe3-local", "Latencia por etapa, mediana y percentil 95 en milisegundos", "|l|c|c|c|c|", rows,
                 small=True)


def latency_generation() -> str:
    data = {it: latency_records(run) for it, run in LATENCY_GENERATION.items()}
    data = {it: d[d["kind"] == "generation"] for it, d in data.items()}
    reps = int(data["2"].groupby("queryId").size().max())
    queries = data["2"]["queryId"].nunique()

    def cell(it: str, columns: list[str]) -> str:
        d = data[it]
        if any(c not in d for c in columns):
            return "no medida" if columns == ["classifyMs"] else "--"
        # Sums are taken per generation, not as a sum of medians.
        p50, p95 = p50_p95(d[columns].sum(axis=1) / 1000)
        return f"{num(p50, 2)} / {num(p95, 2)}"

    measures = [
        ("Clasificación", ["classifyMs"]),
        ("Contexto", ["contextMs"]),
        ("Primer \\textit{token} del generador (TTFT)", ["ttftMs"]),
        ("Generación completa", ["generationMs"]),
        ("Contexto + TTFT", ["contextMs", "ttftMs"]),
        ("Contexto + generación completa", ["contextMs", "generationMs"]),
        ("Clasificación + contexto + TTFT", ["classifyMs", "contextMs", "ttftMs"]),
        ("Clasificación + contexto + generación", ["classifyMs", "contextMs", "generationMs"]),
    ]
    rows = [header("Medida", "Iteración~1", "Iteración~2")]
    rows += [cells(name, cell("1", cols), cell("2", cols)) for name, cols in measures]
    return table("tab:res-pe3-generacion",
                 "Latencia de la clasificación y la generación, mediana y percentil 95 en segundos "
                 f"({queries} consultas $\\times$ {reps}, Qdrant)", "|l|c|c|", rows, small=True)


def ann_real() -> str:
    results = {r["system"]: r for r in json.loads((ANN_QUICK / "results.json").read_text())}
    config = json.loads((ANN_QUICK / "config.json").read_text())

    def pair(system: str) -> list[str]:
        r = results.get(system)
        return ["--", "--"] if r is None else [num(r["recallAtK"], 3), num(r["p50Ms"], 1)]

    rows = [
        "\\multirow{2}{*}{\\textbf{Modo}} & \\multicolumn{2}{c|}{\\textbf{pgvector}} & "
        "\\multicolumn{2}{c|}{\\textbf{Qdrant}} \\\\\n        \\cline{2-5}\n"
        "         & \\textbf{\\textit{Recall}} & \\textbf{p50 (ms)} & \\textbf{\\textit{Recall}} & \\textbf{p50 (ms)} \\\\",
        cells("Exacto", *pair("pg-exact"), *pair("qdrant-exact")),
        cells("Automático (decide el planificador)", *pair("pg-auto"), *pair("qdrant-auto")),
    ]
    for ef in config["efValues"]:
        rows.append(cells(f"HNSW, $ef_{{search}} = {ef}$", *pair(f"pg-hnsw-ef{ef}"), *pair(f"qdrant-hnsw-ef{ef}")))
    return table("tab:res-ann-real",
                 f"\\textit{{Recall}}@{config['k']} y latencia de la búsqueda vectorial sobre el corpus real "
                 f"({config['queries']} consultas, vectores multilingües)", "|l|c|c|c|c|", rows)


def bench_synthetic(ef: int = 64) -> str:
    bench = pd.read_csv(BENCH, keep_default_na=False)
    bench = bench[bench["ef"] == ef]
    exact = pd.DataFrame([json.loads(line) for line in BENCH_EXACT_FILTERED.read_text().splitlines() if line.strip()])
    exact = exact[exact["ef"] == ef]
    variants = [("pgvector", "off", "pgvector"), ("pgvector", "relaxed_order", "pgvector, barrido iterativo"),
                ("pgvector-exact", "", "pgvector, búsqueda exacta forzada"), ("qdrant", "n/a", "Qdrant")]
    scenarios = [("synth-100000", "none", "100.000, sin filtro"), ("synth-100000", "10pct", "100.000, filtro del 10\\,\\%"),
                 ("synth-500000", "none", "500.000, sin filtro"), ("synth-500000", "10pct", "500.000, filtro del 10\\,\\%"),
                 ("synth-500000", "1pct", "500.000, filtro del 1\\,\\%")]
    rows = [header("Datos y filtro", "Motor", "\\textit{Recall}", "p50", "Completitud")]
    for dataset, filt, title in scenarios:
        lines = []
        for engine, iterative, name in variants:
            if engine == "pgvector-exact":
                part = exact[(exact["dataset"] == dataset) & (exact["filter"] == filt)]
                if part.empty:
                    continue
                values = part[["recall", "p50_ms", "completeness"]].median()
            else:
                part = bench[(bench["dataset"] == dataset) & (bench["filter"] == filt) & (bench["engine"] == engine)
                             & (bench["iterative"] == iterative)]
                if part.empty or (filt == "none" and iterative == "relaxed_order"):
                    continue
                values = part.iloc[0]
            lines.append([name, num(values["recall"], 3), num(values["p50_ms"], 2), num(values["completeness"], 2)])
        block = [f"\\multirow{{{len(lines)}}}{{*}}{{{title}}} & " + " & ".join(lines[0]) + " \\\\"]
        block += ["         & " + " & ".join(line) + " \\\\" for line in lines[1:]]
        rows.append("\n        ".join(block))
    return table("tab:res-bench-sint",
                 f"\\textit{{Benchmark}} sintético con $ef_{{search}} = {ef}$: \\textit{{recall}}@10, latencia mediana (ms) "
                 "y completitud (mediana de tres corridas)", "|l|l|c|c|c|", rows, small=True)


# ---------------------------------------------------------------- key figures of the prose

DATASET = Path("evaluation/datasets/queries.v2.draft.jsonl")
RAGAS_REVIEW = GENERATE / "ragas-review-report.json"


def cifras() -> str:
    """\\newcommand for the figures the prose repeats (abstract, Introduction, Discussion,
    Conclusions), from the same files as the tables. Each decimal figure comes in three
    variants: <name> (as in the tables), <name>Dos (two decimals) and <name>En (two
    decimals, decimal point, for the abstract); differences also have <name>EnTres (three
    decimals, English). Spanish differences carry their sign and are wrapped in
    \\ensuremath; English variants are wrapped in \\mbox, because Spanish babel turns
    the decimal point into a comma in math mode. Both work in text and in math."""
    data = summary()
    steps = pd.read_csv(ANALYSIS / "ladder.csv").set_index(["measure", "system", "reference", "subset"])
    tests = pd.read_csv(ANALYSIS / "significance.csv").set_index(["measure", "system", "baseline"])
    defs: list[tuple[str, str, str]] = []  # (name, value, comment)

    def plain(name: str, value: float, decimals: int, comment: str, short: int | None = 2) -> None:
        defs.append((name, num(value, decimals), comment))
        if short is not None:
            defs.append((name + "Dos", num(value, short), comment + ", dos decimales"))
            defs.append((name + "En", f"\\mbox{{{num(value, short).replace('{,}', '.')}}}", comment + ", inglés"))

    def diff(name: str, value: float, comment: str, ci: tuple[float, float] | None = None, short: bool = False) -> None:
        sign = lambda v, d: (lambda t: t if t.startswith("-") else "+" + t)(num(v, d))
        defs.append((name, f"\\ensuremath{{{sign(value, 3)}}}", comment))
        if ci is not None:
            defs.append((name + "IC", f"\\ensuremath{{{sign(value, 3)}}} [\\ensuremath{{{sign(ci[0], 3)}}}; "
                                      f"\\ensuremath{{{sign(ci[1], 3)}}}]", comment + ", con IC del 95 %"))
        if short:
            defs.append((name + "Dos", f"\\ensuremath{{{sign(value, 2)}}}", comment + ", dos decimales"))
            defs.append((name + "En", f"\\mbox{{{sign(value, 2).replace('{,}', '.')}}}", comment + ", inglés"))
            defs.append((name + "EnTres", f"\\mbox{{{sign(value, 3).replace('{,}', '.')}}}",
                         comment + ", tres decimales, inglés"))

    def count(name: str, value: int, comment: str) -> None:
        defs.append((name, thousands(value), comment))
        if value >= 1000:
            defs.append((name + "En", f"\\mbox{{{value:,}}}", comment + ", inglés"))

    def ndcg(group: str, system: str) -> float:
        return data.at[(group, system), "nDCG@10"]

    # PE1, nDCG@10 over the 60 needs.
    for name, system in [("Completa", "qdrant-hybrid-rerank"), ("BM", "bm25"), ("Denso", "qdrant-hnsw"),
                         ("Ilike", "ilike"), ("Filtros", "qdrant-filtered"), ("Hibrida", "qdrant-hybrid"),
                         ("BMFiltros", "bm25-filtered"), ("BMFiltrosReord", "bm25-filtered-rerank"),
                         ("CompletaSinHibrida", "qdrant-filtered-rerank"),
                         ("CompletaSinFiltros", "qdrant-hybrid-rerank-nofilter")]:
        plain(f"cNdcg{name}", ndcg("all", system), 3, f"nDCG@10, {system}")
    row = tests.loc[("nDCG@10", "qdrant-hybrid-rerank", "bm25")]
    diff("cDifCompletaBM", row["mean_diff"], "completa frente a BM25", (row["ci95_low"], row["ci95_high"]))
    diff("cDifDensoBM", tests.loc[("nDCG@10", "qdrant-hnsw", "bm25"), "mean_diff"], "denso Qdrant HNSW frente a BM25")
    for name, system, reference in [("Filtros", "qdrant-filtered", "qdrant-hnsw"),
                                    ("Hibrida", "qdrant-hybrid", "qdrant-filtered"),
                                    ("Reord", "qdrant-hybrid-rerank", "qdrant-hybrid"),
                                    ("CompletaDenso", "qdrant-hybrid-rerank", "qdrant-hnsw")]:
        row = steps.loc[("nDCG@10", system, reference, "all")]
        diff(f"cDif{name}", row["mean_diff"], f"escalera: {system} frente a {reference}",
             (row["ci95_low"], row["ci95_high"]), short=name != "Hibrida")
    diff("cDifFiltrosRestr", ndcg("category=constraint", "qdrant-filtered") - ndcg("category=constraint", "qdrant-hnsw"),
         "filtros en las consultas con restricciones (diferencia de medias)")
    # Constraint compliance in the top 5 (needs with constraints).
    for name, system in [("Denso", "qdrant-hnsw"), ("Filtros", "qdrant-filtered"), ("Completa", "qdrant-hybrid-rerank"),
                         ("CompletaSinFiltros", "qdrant-hybrid-rerank-nofilter"), ("BM", "bm25")]:
        plain(f"cCumpl{name}", data.at[("all", system), "C@5"], 3, f"C@5, {system}")
    # Language: Spanish queries and their English counterparts.
    plain("cNdcgCompletaEs", ndcg("lang=es", "qdrant-hybrid-rerank"), 3, "nDCG@10 en español, completa")
    plain("cNdcgBMEs", ndcg("lang=es", "bm25"), 3, "nDCG@10 en español, BM25")
    plain("cNdcgBMEnParalela", ndcg("lang=en-parallel", "bm25"), 3, "nDCG@10 de las contrapartes en inglés, BM25")
    plain("cNdcgBMFiltrosReordEnParalela", ndcg("lang=en-parallel", "bm25-filtered-rerank"), 3,
          "nDCG@10 de las contrapartes en inglés, BM25 + filtros + reordenamiento")
    # Counts of the retrieval run.
    config = json.loads((RETRIEVE / "config.json").read_text())
    ilike_answered = {line.split()[0] for line in (RETRIEVE / "ilike.trec").read_text().splitlines() if line.strip()}
    count("cOfertas", config["corpus"]["jobs"], "ofertas del corpus congelado")
    count("cConsultasPrueba", sum(1 for l in DATASET.read_text().splitlines() if l.strip() and not l.startswith("//")),
          "consultas del conjunto de prueba")
    count("cConsultasRecuperacion", config["queries"], "consultas de recuperación")
    count("cNecesidades", needs_count(), "necesidades de información")
    count("cIlikeVacias", config["queries"] - len(ilike_answered), "consultas sin resultados con ILIKE")
    count("cParesJuzgados", sum(1 for l in (RETRIEVE / "pool.jsonl").read_text().splitlines() if l.strip()),
          "pares juzgados por el juez final")
    count("cSistemas", len(PE1_SYSTEMS) + len(POST_HOC_SYSTEMS), "sistemas comparados")
    # Judge.
    final, local = kappa(FINAL_JUDGE), kappa("localhost_11434_llama3.1_8b")
    val = final["validation"]
    plain("cKappaBin", val["kappa_binary"], 3, "kappa binario del juez final en validación")
    low, high = val["kappa_binary_ci95"]
    defs.append(("cKappaBinIC", f"{num(val['kappa_binary'], 3)} [{num(low, 3)}; {num(high, 3)}]",
                 "kappa binario del juez final con IC del 95 %"))
    plain("cKappaLocal", local["validation"]["kappa_binary"], 3, "kappa binario del juez local en validación", None)
    count("cParesValidacion", val["n"], "pares de validación")
    count("cParesCalibracion", final["calibration"]["n"], "pares de calibración")
    # PE2: faithfulness of the final configuration and its human check.
    ragas_final = pd.read_csv(RAGAS_FINAL)
    plain("cFidelidad", ragas_final["faithfulness"].mean(), 3, "fidelidad media, juez final")
    review = json.loads(RAGAS_REVIEW.read_text())
    plain("cFidelidadHumana", review["human_mean"], 3, "fidelidad media de la verificación humana", None)
    count("cRespuestasRevisadas", review["n_answers"], "respuestas de la verificación humana")
    # PE3: Iteration 2, Qdrant, medians.
    local_summary = json.loads((LATENCY_LOCAL[("2", "qdrant")] / "summary.json").read_text())["local"]
    defs.append(("cMsReord", num(local_summary["rerankMs"]["p50"], 0), "mediana del reordenamiento (ms)"))
    defs.append(("cMsContexto", num(local_summary["contextMs"]["p50"], 0), "mediana del contexto completo (ms)"))
    generation = latency_records(LATENCY_GENERATION["2"])
    generation = generation[generation["kind"] == "generation"]
    first_token = p50_p95(generation[["classifyMs", "contextMs", "ttftMs"]].sum(axis=1) / 1000)[0]
    defs.append(("cSegPrimerToken", num(first_token, 2), "mediana clasificación + contexto + TTFT (s)"))
    # PE4: 500,000 vectors, 1 % filter, ef_search = 64.
    bench = pd.read_csv(BENCH, keep_default_na=False)
    hard = bench[(bench["dataset"] == "synth-500000") & (bench["filter"] == "1pct")]
    qdrant = hard[(hard["engine"] == "qdrant") & (hard["ef"] == 64)].iloc[0]
    iterative = hard[(hard["engine"] == "pgvector") & (hard["iterative"] == "relaxed_order")]
    exact = pd.DataFrame([json.loads(l) for l in BENCH_EXACT_FILTERED.read_text().splitlines() if l.strip()])
    exact = exact[(exact["dataset"] == "synth-500000") & (exact["filter"] == "1pct") & (exact["ef"] == 64)]
    plain("cRecallQdrant", qdrant["recall"], 3, "recall de Qdrant, 500.000 vectores, filtro del 1 %")
    defs.append(("cMsQdrant", num(qdrant["p50_ms"], 2), "p50 de Qdrant (ms), mismo escenario"))
    defs.append(("cMsQdrantEn", f"\\mbox{{{num(qdrant['p50_ms'], 1).replace('{,}', '.')}}}", "p50 de Qdrant (ms), una cifra decimal, inglés"))
    defs.append(("cMsQdrantUno", num(qdrant["p50_ms"], 1), "p50 de Qdrant (ms), una cifra decimal"))
    plain("cRecallPgIterativo", iterative.loc[iterative["ef"] == 64, "recall"].iloc[0], 3,
          "recall de pgvector con barrido iterativo, ef_search = 64")
    plain("cRecallPgIterativoMax", iterative["recall"].max(), 3, "máximo recall de pgvector con barrido iterativo")
    defs.append(("cMsPgExacto", num(exact["p50_ms"].median(), 0), "p50 de la búsqueda exacta forzada (ms)"))
    plain("cRecallPgExacto", exact["recall"].median(), 1, "recall de la búsqueda exacta forzada, una cifra decimal",
          None)
    defs.append(("cRecallPgExactoEn", f"\\mbox{{{num(exact['recall'].median(), 1).replace('{,}', '.')}}}",
                 "recall de la búsqueda exacta forzada, inglés"))

    names = [n for n, _, _ in defs]
    duplicates = {n for n in names if names.count(n) > 1}
    bad = [n for n in names if not re.fullmatch(r"c[A-Za-z]+", n)]
    if duplicates or bad:
        raise ValueError(f"macro names: duplicated {duplicates}, invalid {bad}")
    lines = ["% Generado por evaluation/analysis/tables.py (cifras); no editar a mano.",
             "% Cifras clave de la prosa, con la misma fuente que las tablas de Resultados.", ""]
    lines += [f"\\newcommand{{\\{n}}}{{{v}}} % {c}" for n, v, c in defs]
    return "\n".join(lines) + "\n"


TABLES = {
    "res-kappa-cal": kappa_calibration,
    "res-kappa-val": kappa_validation,
    "res-pe1-global": pe1_global,
    "res-escalera": ladder,
    "res-pe1-categoria": by_category,
    "res-restricciones": compliance,
    "res-pe1-idioma": by_language,
    "res-posthoc": post_hoc,
    "res-agregacion": aggregation,
    "res-pe2": ragas,
    "res-pe2-iteraciones": ragas_iterations,
    "res-pe3-local": latency_local,
    "res-pe3-generacion": latency_generation,
    "res-ann-real": ann_real,
    "res-bench-sint": bench_synthetic,
}


# ---------------------------------------------------------------- regression check

NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


def numbers(tex: str) -> list[str]:
    tex = tex.replace("{,}", ",").replace("\\,", " ")
    return NUMBER.findall(tex)


def chapter_table(chapter: str, label: str) -> str | None:
    match = re.search(r"\\begin\{table\}(?:(?!\\end\{table\}).)*?\\label\{" + re.escape(label) + r"\}.*?\\end\{table\}",
                      chapter, re.S)
    return match.group(0) if match else None


def check(generated: dict[str, str], chapter_path: Path) -> bool:
    chapter = chapter_path.read_text(encoding="utf-8")
    ok = True
    for name, tex in generated.items():
        old = chapter_table(chapter, f"tab:{name}")
        if old is None:
            print(f"{name}: no table with that label in {chapter_path} (already \\input?)")
            ok = False
            continue
        new_numbers, old_numbers = numbers(tex), numbers(old)
        if new_numbers == old_numbers:
            print(f"{name}: OK ({len(new_numbers)} numbers)")
            continue
        ok = False
        print(f"{name}: DIFFERENT")
        for i, (a, b) in enumerate(zip(old_numbers, new_numbers)):
            if a != b:
                print(f"    #{i}: chapter {a}  generated {b}")
        if len(new_numbers) != len(old_numbers):
            print(f"    lengths: chapter {len(old_numbers)}, generated {len(new_numbers)}")
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=Path("Tesis/Desarollo/borradores/tablas"))
    parser.add_argument("--check", type=Path, help="chapter with hand-written tables to compare against")
    args = parser.parse_args()
    generated = {name: build() for name, build in TABLES.items()}
    if args.check:
        sys.exit(0 if check(generated, args.check) else 1)
    args.out.mkdir(parents=True, exist_ok=True)
    for name, tex in generated.items():
        path = args.out / f"{name}.tex"
        path.write_text(tex, encoding="utf-8")
        print(path)
    path = args.out / "cifras.tex"
    path.write_text(cifras(), encoding="utf-8")
    print(path)


if __name__ == "__main__":
    main()
