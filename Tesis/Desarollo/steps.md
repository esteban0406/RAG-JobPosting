# Roadmap de Tesis — JobAI (Plataforma de búsqueda de empleo con IA)

## Contexto y enfoque

- **Programa:** Maestría en Inteligencia Artificial, Universidad Sergio Arboleda (plantilla NTC1486 en `Tesis/Plantilla`).
- **Fecha límite:** entrega última semana de noviembre

- **Enfoque:** Design Science Research (DSR). JobAI ya es el artefacto construido (ver `caseStudy.md`). El aporte académico nuevo NO es construir features grandes, sino: (a) fundamentar el problema en literatura, (b) definir metodología y métricas de evaluación, (c) evaluar el artefacto cuantitativamente (precisión de retrieval, fidelidad/groundedness de respuestas, y opcionalmente comparación contra un baseline de búsqueda por palabra clave).
- **Cambio de arquitectura decidido:** la plataforma migrará su almacenamiento vectorial de PostgreSQL+pgvector a una base de datos vectorial dedicada (Qdrant). Esto sí es desarrollo nuevo (migración de embeddings, actualización de ingesta y del módulo de retrieval), pero encaja dentro de DSR como una iteración del ciclo diseño-evaluación, y abre la puerta a una comparación empírica pgvector vs. Qdrant (latencia/recall) que enriquece la evaluación sin salirse del alcance.
- **Pedido actual del director:** problemática fundamentada en literatura + objetivo general y 4 objetivos específicos.

## Estado al 10-oct-2026 (replanificación)

El proyecto iba ~3 semanas atrasado (Fase 2 sin empezar). Se replanificó el 10-oct; el plan detallado está en `~/.claude/plans/vamos-a-continuar-con-parallel-cloud.md`. Decisiones tomadas ese día:

- Migrar a Qdrant **y** comparar contra pgvector: corpus real + escalamiento sintético (100k/500k), con y sin filtros.
- Relevancia: LLM-juez (estilo UMBRELA) + validación humana del 20 % de los pares (kappa de Cohen). Juez local (Ollama) para desarrollar; juez de pago solo en la corrida final.
- Embeddings de evaluación: e5-base-v2 local. Generador: Groq `qwen/qwen3.8-27b` (temperatura 0 en evaluación).
- Corpus: ingesta local nueva en la base `jobpostings_eval`, congelada en un snapshot.
- Consultas: 75 en inglés (5 categorías × 15) + 25 en español (paralelas).
- Líneas base: ILIKE (lo que ofrece la plataforma) y **BM25** (línea base fuerte).
- Estadística: prueba de aleatorización pareada + IC bootstrap + Holm (Smucker et al. 2007 desaconseja Wilcoxon en IR).
- Claude redacta los capítulos; el autor revisa. Trabajo en la rama `thesis/qdrant-eval`.
- Primera entrega al profesor: **martes 13-oct** (PDF + nota `nota-profesor-2026-10-13.md` + demo del cambio pgvector/Qdrant).

## Cronograma resumen (replanificado 10-oct; iteración 5 agregada el 14-oct)

| Fechas | Fase | Entregable |
|---|---|---|
| 7 sep | Problemática, objetivos, marco teórico, estado del arte | Cap1 y Cap2 (hecho) |
| 10-12 oct | Migración a Qdrant, correcciones, metodología, Cap0/Cap3/Cap4 | **Martes 13-oct:** PDF + nota + demo al profesor |
| 14-21 oct | **Iteración 5 del artefacto** (filtros, híbrida, *reranking*, e5 multilingüe) + revisión del dataset | Código y corpus re-embebido |
| 22-25 oct | Corrida completa con juez local, benchmark sintético con vectores nuevos, anotación kappa, Cap3/Cap4 | Resultados preliminares |
| 26 oct-1 nov | Corrida final con juez de pago, estadística, figuras | Resultados congelados |
| 2-8 nov | Cap5, Conclusiones, Cap0 final, resumen ES/EN | Borrador completo |
| 9-15 nov | Envío al director, formato NTC1486 | Versión 1 |
| 16-22 nov | Ajustes del director | Versión revisada |
| 23-30 nov | Entrega final + sustentación | Entrega |

---

## Fase 0 (semana 1, 7-14 sep) — Problemática y objetivos

**⚠️ Nota de secuencia (7-sep, importante):** estas tareas de redacción se completaron *de facto* como efecto colateral de escribir el Capítulo 1 (Fase 1), no en el orden del cronograma original. No fue un error de actualización del roadmap — se hizo porque así se pidió explícitamente en la sesión anterior ("redactar el capítulo de marco teórico" terminó incluyendo el planteamiento del problema y los objetivos, porque el mapeo de Fase 4 ubica ambos en `Cap1`). El riesgo real es otro: el director pidió este entregable (problemática + objetivos) específicamente como primer *checkpoint*, antes de invertir tiempo en el capítulo completo de estado del arte — y ese checkpoint **todavía no se ha hecho**. Ya se escribieron Cap1 *y* Cap2 completos (Fase 1) sobre una problemática/objetivos que el director no ha visto ni validado. Si pide cambios, hay retrabajo en cascada sobre Cap1 y sobre las secciones "Relación con JobAI" de Cap2. **Acción inmediata recomendada: enviar ya el borrador al director (punto pendiente más abajo) antes de avanzar en la Fase 2**, para cerrar el checkpoint lo antes posible y minimizar el retrabajo si pide ajustes.

- [x] Recopilar 8-12 fuentes académicas (papers/libros) de las líneas de literatura de la Fase 1. — Hecho (19 fuentes, más de lo mínimo pedido); ver detalle en Fase 1.
- [x] Redactar la problemática (1-2 párrafos, con citas) usando como base:
  - Fragmentación de la búsqueda de empleo remoto entre múltiples plataformas.
  - Limitaciones de precisión del keyword-matching en sistemas de reclutamiento (ATS).
  - RAG como alternativa de búsqueda semántica para superar esas limitaciones.
  - Hecho — redactada en `Cap1/M02-Chapter1.tex` §"Planteamiento del problema" con citas (Ha-Thuc 2017, Bocharova 2023, Rojas-Galeano 2022, Lewis 2020, Gao 2023). Nota: quedó como ~4 párrafos de prosa académica, no 1-2 párrafos breves — si el director espera algo más corto y directo para la revisión inicial, considerar enviar un resumen condensado en vez de pegar la sección completa del capítulo.
- [x] Redactar el objetivo general (borrador):
  > Desarrollar y evaluar una plataforma de búsqueda de empleo remoto que utiliza un pipeline de Retrieval-Augmented Generation para permitir búsqueda semántica y conversacional sobre ofertas laborales, superando las limitaciones de precisión de la búsqueda por palabras clave.
  - Hecho — llevado sin cambios a `Cap1/M02-Chapter1.tex` §"Objetivo general".
- [x] Redactar los 4 objetivos específicos (borrador):
  1. Caracterizar, a partir de la literatura, las limitaciones de los sistemas actuales de búsqueda de empleo y las oportunidades que ofrece RAG para superarlas.
  2. Diseñar y documentar la arquitectura del pipeline RAG (ingestión, chunking, embeddings, clasificación de consultas, síntesis) aplicada al dominio de búsqueda de empleo.
  3. Definir una metodología de evaluación con métricas cuantitativas (precisión de recuperación, fidelidad/groundedness de respuestas, tiempo de respuesta) para validar la plataforma.
  4. Evaluar los resultados obtenidos y contrastarlos frente a un enfoque de búsqueda tradicional por palabras clave.
  - Hecho, con un cambio: el objetivo específico 2 en `Cap1/M02-Chapter1.tex` quedó extendido para mencionar explícitamente "incluyendo la migración del almacenamiento vectorial de pgvector a una base de datos vectorial dedicada" (no estaba en el borrador original). Si se envía al director, aclarar que es una actualización intencional (coherente con la decisión de migrar a Qdrant), no un error de transcripción.
- [x] Revisar la problemática y objetivos contra la plantilla — hecho 10-oct (tono impersonal; Cap0 redactado sin adelantar resultados).
- [ ] **Enviar borrador al director — programado para el martes 13-oct** junto con el PDF completo y la nota `nota-profesor-2026-10-13.md` (incluye las preguntas de validación).
  - Las preguntas al director están en la nota: validar problemática/objetivos, aceptación del LLM-juez con validación humana, extensión esperada y fechas intermedias.

---

## Fase 1 (semanas 2-3) — Marco teórico / estado del arte

Líneas de literatura a investigar, con términos de búsqueda concretos:

- [x] **RAG (fundamento técnico):**
  - Lewis et al. 2020 — paper original de Retrieval-Augmented Generation.
  - Gao et al. 2023 — "Retrieval-Augmented Generation for Large Language Models: A Survey".
  - Es et al. 2023 — RAGAS, framework de evaluación de sistemas RAG (verificado: venue formal EACL 2024, `referencias.bib` usa año 2024; preprint arXiv es de 2023, de ahí el nombre de archivo).
- [x] **Sistemas de recomendación/matching de empleo con NLP/LLMs:**
  - Ha-Thuc et al. 2017 (LinkedIn Query-By-Example); Bocharova, Malakhov & Mezhuyev 2023 (VacancySBERT); Shen, Jianqiang et al. 2024 (LinkedIn, "Learning to Retrieve for Job Matching", KDD 2024 — verificado, autor real coincide con nombre de archivo, no estaba listado explícitamente en esta sección pero ya estaba en `Tesis/Literatura/` y es una de las 19 fuentes).
- [x] **Limitaciones de keyword search / ATS en reclutamiento:**
  - Cubierta con las mismas fuentes de matching de empleo (Ha-Thuc 2017, Bocharova 2023) más la revisión bibliométrica de Rojas-Galeano et al. 2022 — no requirió una fuente dedicada adicional.
- [x] **Metodología de investigación aplicada:**
  - Hevner et al. 2004; Peffers et al. 2007; Hevner & Chatterjee 2010 (eds.) — Design Science Research en sistemas de información (marco metodológico formal para la Fase 2).
- [x] **Bases vectoriales / embeddings (actualizado: migración a Qdrant):**
  - Algoritmos de indexación HNSW/IVFFlat (Malkov & Yashunin 2020; Johnson et al. 2019 FAISS; Aumüller et al. 2018 ANN-Benchmarks) — siguen aplicando, porque Qdrant también usa HNSW internamente.
  - Bases de datos vectoriales dedicadas: Wang et al. 2021 (Milvus); Pan, Wang & Li 2023 (survey VDBMS); Taipalus 2024; Sanca & Ailamaki 2024 (trade-off vector-relacional) — ya recopilados, cubren la justificación de migrar a Qdrant.
  - La documentación oficial de Qdrant se cita solo en la sección de implementación (no es fuente académica revisada por pares), igual que se hacía con pgvector.
- [x] **Clasificación híbrida de consultas / text-to-SQL:**
  - Biswal, Asim et al. 2024 (TAG); Li, Jinyang et al. 2023 (BIRD) — justifica la decisión de JobAI de clasificar con regex antes de recurrir a un LLM.
- [x] Fuentes consultadas: arXiv, ACL Anthology, ACM DL, IEEE Xplore, Springer, VLDB Journal, MIS Quarterly/JMIS (verificación directa de autor/venue contra la fuente original, no solo contra lo que reportó Perplexity).
- [x] Redactar el capítulo de marco teórico / estado del arte con las citas recopiladas — hecho 7-sep: `MainMatter/Cap1/M02-Chapter1.tex` (planteamiento del problema + objetivos + marco teórico conceptual) y `MainMatter/Cap2/M03-Chapter2.tex` (estado del arte, una sección por línea de literatura + relación explícita con JobAI en cada una).

**Estado de `Tesis/Literatura/` (verificado 7-sep — nombres de archivo ya corregidos con autor real, no el que dio Perplexity):**

- [x] Línea 2/3 (matching de empleo, límites keyword/ATS) — presentes: *Ha-Thuc, Viet et al. 2017* (LinkedIn Talent Search — **no es Balog**); *Bocharova, Malakhov & Mezhuyev 2023* (VacancySBERT — **no es Nurbakova/Laporte**); *Rojas-Galeano, Posada & Ordoñez 2022* (bibliometric review — **no es Gutiérrez**); *Shen, Jianqiang et al. 2024* (LinkedIn "Learning to Retrieve for Job Matching", KDD 2024 — verificado 7-sep vía arXiv 2402.13435, autor real coincide).
- [x] Línea 4 (DSR) — presentes: Hevner et al. 2004; Peffers et al. 2007; Hevner & Chatterjee 2010.
- [x] Línea 5 (vector DB) — presentes: Malkov & Yashunin 2020 (HNSW); Johnson et al. 2019 (FAISS); Aumüller et al. 2018 (ANN-Benchmarks — `referencias.bib` cita la versión de revista Information Systems 2020, DOI verificado; el arXiv preprint es de 2018, de ahí el nombre de archivo); Wang, Jianguo et al. 2021 (Milvus — **no es Wang & Pan**); Pan, Wang & Li 2023 (survey VDBMS — `referencias.bib` usa año 2024, venue formal VLDB Journal; preprint arXiv de 2023); Taipalus 2024; Sanca & Ailamaki 2024.
- [x] Línea 6 (text-to-SQL híbrido) — presentes: *Biswal, Asim et al. 2024* (TAG — **no es Pourreza/Rafiei**); *Li, Jinyang et al. 2023* (BIRD — **no es Tai**).
- [x] Línea 1 (RAG, fundamento técnico) — presentes y verificados: Lewis et al. 2020 (RAG original); Gao et al. 2023 (survey RAG); Es et al. 2023 (RAGAS). Estos 3 no tuvieron error de autor.

**Las 19 fuentes imprescindibles ya están en `Tesis/Literatura/`, con nombre de archivo `Autor(es) (Año). Título.pdf` y autor verificado contra la fuente original.** `Bibliography/referencias.bib` ya tiene las 19 entradas BibTeX correspondientes (además de las 5 entradas de plantilla que sí se usan en `Cap0`). El capítulo de marco teórico/estado del arte ya está redactado (ver Cap1 y Cap2 arriba); pendiente: revisión del director y, si aplica, compilar el PDF completo para verificar formato.

Nota de proceso: Perplexity mezcló/inventó el autor real en 6 de 16 fuentes (mismo título correcto, autor equivocado) — verificar siempre autor contra la fuente original (arXiv/DOI) antes de meter una cita a `referencias.bib`. Nota adicional (7-sep): en 3 de las 19 fuentes (Es et al., Aumüller et al., Pan et al.) el año del nombre de archivo corresponde al preprint de arXiv, mientras que `referencias.bib` usa el año de la publicación formal revisada por pares (EACL 2024, Information Systems 2020, VLDB Journal 2024 respectivamente) — el autor es correcto en ambos casos, solo difiere el año por convención de citación; no requiere acción, solo quedó documentado aquí para evitar confusión al revisar.

---

## Fase 2 (semanas 2-4) — Migración a Qdrant, metodología y diseño de evaluación

- [x] Abstracción `VectorStore` con dos backends (`PgVectorStore`, `QdrantVectorStore`) seleccionables con `VECTOR_BACKEND`; colección Qdrant con payload (texto, tipo, salario, modalidad, fuente) y mismos parámetros HNSW (m=16, ef_construction=128). Hecho 10-oct (commit 155a4c0).
- [x] pgvector corregido: la consulta ordenaba por una expresión derivada y nunca usaba el índice (evidencia `EXPLAIN ANALYZE` en `evaluation/evidence/`); IVFFlat reemplazado por HNSW; modos auto/ann/exact.
- [x] Comando `qdrant:backfill` (carga idempotente + verificación de conteos) y `ann:quick` (recall@10 vs exacto + latencia). Paridad exacta pgvector = Qdrant verificada en la base de desarrollo.
- [x] Conservar pgvector para la comparación — hecho (ambos backends conviven).
- [ ] Backfill y `EXPLAIN` sobre el corpus de evaluación completo (cuando termine la ingesta).
- [x] Bugs corregidos: currículo reemplazaba la consulta; ruta de agregación fallaba sin plantilla; `findAll` topado en 20; cron no desactivable.
- [x] Formalizar el marco DSR (Cap3 §1, incluye las 3 iteraciones previas registradas en git: P@5 66,7 % → 92,0 % → 90,7/98,7 % según juez).
- [x] Métricas definidas (Cap3 §6): P@5/10, nDCG@10, MRR, Recall@10; faithfulness y answer relevancy (RAGAS); latencia por etapa; recall-latencia, QPS, memoria para pgvector vs Qdrant.
- [x] Diseño del experimento contra baseline (Cap3 §4-5): ILIKE + BM25, pooling profundidad 10, LLM-juez validado con kappa.
- [x] Borrador del capítulo de metodología (Cap3) — 10-oct.

---

## Fase 3 (semanas 5-7) — Ejecución de la evaluación

- [x] Snapshot congelado (11-oct): 1.068 ofertas (Findwork 895, Jobicy 162, Remotive 11), 4.013 chunks; `evaluation/snapshots/corpus-2026-10-10.dump` (fuera de git, respaldar en Drive) + `manifest.json` (sha256 `8106c29a…`). Restauración verificada. HNSW aplicado a `jobpostings_eval`; Qdrant `eval_job_chunks` con backfill verificado (4.013/4.013 indexados).
- [x] `ann:quick` sobre el corpus real (200 consultas): pgvector en modo automático hace barrido completo (23,6 ms) porque el planificador descarta el HNSW a esta escala; forzado: 2,2 ms (recall 0,995 con ef=64); Qdrant: 3,1 ms (recall 0,988). Tabla preliminar en Cap5.
- [x] Instrumentar JobAI: `buildContext` devuelve contextos por oferta y tiempos por etapa; temperatura configurable en el stream (10-oct).
- [x] Dataset de consultas `evaluation/datasets/queries.v2.draft.jsonl` (75 EN + 25 ES, 75 necesidades) — **revisado con el autor el 14-oct**. Cobertura verificada con SQL contra el corpus: n-co-03 (data engineering remoto ≥120k) y n-co-15 (data analyst por contrato) no tenían ofertas relevantes → reemplazadas por *data scientist* remoto ≥120k (9 ofertas) e ingeniería de IA/ML por contrato (4). 8 necesidades tienen solo 1-2 relevantes (Salesforce dev/admin, technical recruiter, DevOps remoto EE. UU., data engineer+Spark, Rust+blockchain, AML, DevSecOps): se mantienen y se documentan en Cap3/amenazas. Varias consultas de "desajuste de vocabulario" comparten términos con las ofertas (BM25 0,64-0,90 en en-sv-01/03/11/12/13 en la corrida provisional): definir la categoría en Cap3 como "descripción funcional del rol", no como "cero términos en común".
- [x] Líneas base `ilike` y `bm25` + comandos `eval:retrieve`, `eval:pool`, `eval:judge` (UMBRELA, caché), `eval:kappa-export`, `eval:generate`; análisis en `evaluation/analysis/{metrics,kappa}.py` (imagen Docker fijada). Probados de punta a punta en la base de desarrollo (10-oct).
- [ ] Anotación humana de la muestra para kappa — **⚠️ no anotar todavía (14-oct): la muestra se regenera sobre el pool final de la iteración 5.** CSV anterior (13-oct): `evaluation/runs/2026-10-14T00-03-00-717ba41-dirty-retrieve-full/kappa-sample.csv` (286 pares: 75 de calibración, 211 de validación). Pendiente que el autor lo anote.
- [x] Generación + RAGAS probados de punta a punta (piloto de 3 consultas, juez local): faithfulness 0,889, answer relevancy 0,903, 0 % NaN; ~50 s por respuesta con el juez local.
- [~] Benchmark de almacenes vectoriales (`evaluation/bench/`): **corpus real completo (13-oct)** → `evaluation/bench/results/` y Cap5 §PE4 (Tabla `tab:res-bench-real`). Postgres ya tiene `shm_size: 4gb`. Datos sintéticos de 100k y 500k y su verdad de referencia **ya generados** en `evaluation/bench/data/` (fuera de git; σ=0,5, KS=0,23). **Pausado por el autor antes de 100k/500k.**
  - **Para correr mañana (1,5-2,5 h, la máquina debe quedar libre):**
    1. Descargar los modelos de Ollama: `ollama stop llama3.1:8b-ctx16k` (y cualquiera que muestre `ollama ps`). No correr nada pesado en paralelo.
    2. Desde la raíz del repo: `bash evaluation/bench/run_bench.sh synth-100000 synth-500000` (detiene y reinicia Postgres y Qdrant por turnos; al final ejecuta `bench report`, que junta también los resultados del corpus real).
    3. Al terminar, dejar los servicios como estaban: `docker exec job-posting-db psql -U postgres -tAc "SHOW shared_buffers"` debe dar 128MB (el script lo restablece) y `docker start job-posting-qdrant` si quedó detenido.
    4. Con `evaluation/bench/results/summary.csv` y las figuras `recall-latency-*.pdf`: llenar el `\pendiente` de Cap5 §"Escalamiento con datos sintéticos" y el del resumen. Las figuras de `bench report` usan el estilo por defecto de matplotlib y punto decimal: regenerarlas con el estilo de `evaluation/analysis/figures.py` antes de incluirlas.
    5. El resumen está en 494 palabras y ocupa una página justa: al agregar PE4 hay que recortar otra parte.
    6. 1M vectores: decidir según la memoria pico de 500k (la máquina tiene 15 GB; el contenedor se limita a 10 GB).
  - Nota: `run_bench.sh` deja a `job-posting-db` y `job-posting-qdrant` limitados a 8 CPU / 10 GB (`docker update` no permite quitar el límite). Para volver a ilimitado: `docker compose up -d --force-recreate postgres qdrant` (conserva los volúmenes).
- [x] **Corrida completa provisional (13-oct), juez local + dataset borrador:** recuperación de los 5 sistemas, pool (1.403 pares), juez llama3.1:8b, métricas y significancia, generación (85 respuestas), RAGAS, latencia por etapa (comandos nuevos `eval:latency` y `eval:aggregation`), agregación y benchmark de almacenes (real, 100k, 500k). Resultados en Cap5; resumen ES redactado con estas cifras.
  - RAGAS con la ventana por defecto de Ollama (4.096 tokens) truncó la fidelidad en 21/85 respuestas → se repuntuó todo con `llama3.1:8b-ctx16k` (modelo local creado con `num_ctx 16384`) y `--max-tokens 4096`. Aun así, la revisión de casos con puntaje 0 muestra errores del juez de 8B: PE2 no es fiable hasta la corrida con el juez final.
  - `expectedTemplates` de las 15 consultas de agregación revisadas el 14-oct. `goldSql` de en-ag-04 (solo full_time y contract) y en-ag-11 (sin `jobType` nulo) corregidas: ahora coinciden exactamente con su plantilla.
  - Las cifras del Cap5 y del resumen **cambiarán** con el juez de pago, el kappa y el dataset revisado.
- [ ] Corrida final con juez de pago (elegir modelo y poner `JUDGE_API_KEY`); kappa; actualizar Cap5 y resumen.

**Hallazgos pendientes de decisión (10-oct):**
- [x] La plantilla `count_remote` (y `list_remote_jobs`) contaba remotos por `location ILIKE '%remote%'` e ignoraba la columna `isRemote` → 39 vs. 614 en el corpus de evaluación. **Corregida el 10-oct por decisión del autor**; documentada en Cap4 como quinto defecto.
- [x] Salarios atípicos (p. ej. 86.528.000 USD para un "Dispatch Specialist", montos en SEK): **resuelto el 14-oct** con la regla `plausibleSalary` (10k-1M USD/año y mínimo ≤ máximo; si no, "no informado", sin adivinar la conversión), aplicada en la ingesta y al corpus congelado con `jobs:clean-salaries` (12 ofertas, también en el *payload* de Qdrant). Ofertas con salario: 504 → 493; salario promedio del corpus (ag-03): 544.127 → 158.786.
- [x] Groq retiró `qwen3-32b` y `qwen3.6-27b`; producción ya usa `qwen/qwen3.8-27b` (confirmado por el autor).
- [x] Apellido del profesor confirmado: Cifuentes.

---

## Iteración 5 (14-23 oct) — De Naive a Advanced RAG

Decidida el 14-oct tras revisar si el artefacto tenía nivel de tesis (plan: `~/.claude/plans/estoy-desarrollando-mi-tesis-shiny-lagoon.md`). Veredicto: no refactorizar; cerrar brechas de coherencia entre lo que se mide y lo que el artefacto hace. Hallazgos: los filtros (salario, modalidad, tipo) nunca llegaban a la búsqueda vectorial —PE4 medía búsqueda filtrada que la app no usaba—; sin búsqueda híbrida ni *reranking*; respuestas en inglés a consultas en español; e5-base-v2 solo inglés; producción (Gemini + pgvector) ≠ configuración evaluada.

Decisiones del autor: híbrida BM25-en-la-app + RRF y *reranking* con bge-reranker-v2-m3 en la GPU (obligatorios); embeddings multilingual-e5-base con ablación e5-base-v2; la tesis defiende la **configuración de referencia** (`docker-compose.yml`), el despliegue público se actualiza después; lo conversacional se **acota** (historial solo en la generación). PE1 se reporta como **escalera de ablación**: denso → +filtros → +híbrida → +*reranking*.

**Código (hecho 14-oct, commits 6dd5ecb y 4060e34; 267 pruebas unitarias + 41 de integración):**
- [x] Respuesta en el idioma de la pregunta (`ANSWER_LANGUAGE_RULE` en los tres *prompts*).
- [x] Servidor de embeddings: modelo por variable de entorno, CUDA, `/health`, `/rerank`; dependencias fijadas; el backend rechaza vectores de otro modelo y la caché incluye el modelo.
- [x] Filtros en la recuperación: compuerta de restricciones EN/ES en el clasificador → `filter_jobs` (ahora ruta de recuperación) → `VectorFilter` (nuevo `salaryAtLeast`). Eliminado el filtro SQL por `title ILIKE` y su contexto de 30 ofertas.
- [x] `RetrievalPipeline` (`backend/src/retrieval/`): densa + BM25 con el mismo filtro → RRF (k=60) → *reranking* de 30 candidatas → 5 ofertas; respaldo sin filtro si no hay coincidencias (y aviso al LLM); orden fusionado si el *reranker* cae. El índice BM25 se reconstruye tras cada ingesta.
- [x] Arnés: sistemas `qdrant-e5base`, `qdrant-filtered`, `qdrant-hybrid`, `qdrant-hybrid-rerank`; caché de clasificaciones compartida (`evaluation/classifications/`); latencia de clasificación, BM25, fusión y *reranking*; `eval:aggregation` sin la ruta SQL de `filter_jobs`.
- [x] Comando `embeddings:reembed` (re-embebe en el lugar, mismos ids y textos, `REINDEX`).
- [x] Benchmark sintético 100k/500k con vectores e5-base-v2 commiteado como **provisional** (cfcce3f); se repite con los vectores nuevos (sirve además como prueba de robustez).

**Pasos con datos (pendientes; requieren Postgres, Qdrant y la GPU):**
1. [x] **Autor:** instalar `nvidia-container-toolkit` (guía oficial de NVIDIA), `sudo nvidia-ctk runtime configure --runtime=docker`, reiniciar Docker; verificar con `docker run --rm --gpus all <imagen CUDA base> nvidia-smi`.
2. [x] (14-oct) `docker compose up -d postgres qdrant`. Ablación: copiar los vectores e5 actuales **antes** de re-embeber: `DATABASE_URL=…/jobpostings_eval QDRANT_COLLECTION=eval_job_chunks_e5base pnpm qdrant:backfill --recreate`.
3. [x] (14-oct; e5 de ablación en CPU, puerto 8001) `docker compose build embedding-server && docker compose up -d embedding-server` (multilingual-e5-base + reranker en GPU); `curl localhost:8000/health` debe decir `cuda`. Para la ablación: `docker compose --profile ablation up -d embedding-server-e5` (puerto 8001).
4. [x] (14-oct) `DATABASE_URL=…/jobpostings_eval pnpm embeddings:reembed`, luego `QDRANT_COLLECTION=eval_job_chunks pnpm qdrant:backfill --recreate` y `ann:quick` (paridad exacta pg = Qdrant). Nuevo snapshot + `manifest.json`; regenerar evidencia `EXPLAIN`.
   - Resultado: 4.013 fragmentos re-embebidos en 48 s (GPU). Snapshot final (tras la limpieza de salarios, ver revisión del dataset): `corpus-2026-10-14-clean.dump` (sha256 `5c23afbe…`, fuera de git: **respaldar en Drive** junto al del 10-oct; el `…-multilingual-e5.dump` intermedio quedó reemplazado) con `manifest-2026-10-14.json`; misma huella de ids y textos que el snapshot del 10-oct (`14cfb902…`), restauración verificada.
   - Colección de ablación `eval_job_chunks_e5base`: top-10 exacto idéntico a pgvector-e5 en 20 consultas.
   - `ann:quick`: paridad exacta 0,9975; **con vectores multilingües HNSW pierde más recall a ef bajo** (ef=16: pg 0,918 / Qdrant 0,850, frente a 0,976 / 0,925 con e5); ef=64: 0,990 / 0,977. Mencionar en Cap5.
   - `EXPLAIN` (`explain-evalcorpus-multilingual-e5.txt`): igual que antes sin filtro (barrido 24,6 ms; índice forzado 1,6 ms); con el filtro de producción (remoto, ≥150k) el planificador hace búsqueda exacta sobre 863 filas (hash join, 8,7 ms).
5. [x] Umbral: resuelto en el paso 5b con el conjunto de desarrollo (no con las consultas de prueba). **Hallazgo (14-oct):** bge-reranker-v2-m3 es muy literal: "security engineer" vs "Security Engineer, Cloud" = 0,97, pero "Cybersecurity roles defending company systems against attacks" vs "Security Engineer" = 0,002 (igual en fp32 y fp16). Puede empeorar las consultas de desajuste de vocabulario (la escalera de ablación lo medirá; no ajustarlo sobre el conjunto de prueba) y sus puntajes absolutos probablemente no sirvan como umbral.
5b. **Selección del *reranker* con un conjunto de desarrollo** (decidido el 14-oct; evaluación formativa, nunca se reporta como resultado):
   - Conjunto: `evaluation/datasets/queries.dev.jsonl` (20 necesidades, 5 por categoría, 28 consultas EN/ES, sin solapamiento con las 75 de prueba) + `queries.dev-ood.jsonl` (10 consultas fuera de dominio, solo para el umbral). Revisado por el autor el 14-oct.
   - Servidores: bge en `:8000`; Qwen3-Reranker-0.6B en `:8002` (`docker compose --profile rerank-dev up -d reranker-qwen`). Variantes en `evaluation/datasets/rerank-variants.dev.json`.
   - **Regla de decisión (fijada antes de ver resultados):**
     - Etapa 1 (30 candidatas): `qdrant-hybrid` (sin *reranking*, referencia), `rr-bge`, `rr-bge-rrf`, `rr-qwen`, `rr-qwen-instr`, `rr-qwen-instr-rrf`; pool de profundidad 10; juez local v2. Se elige la de mayor nDCG@10 medio en las 28 consultas; si otra queda a ≤ 0,02, se prefiere la más simple en el orden `rr-bge` < `rr-bge-rrf` < `rr-qwen` < `rr-qwen-instr` < `rr-qwen-instr-rrf`. Se reportan también P@5 y nDCG@10 por categoría.
     - Etapa 2: la ganadora con 20 frente a 30 candidatas; se usan 20 si el nDCG@10 baja ≤ 0,01.
     - Etapa 3 (umbral): con la configuración final, t = el mayor valor tal que a lo sumo 1 de las 28 consultas de desarrollo tiene su mejor puntaje del *reranker* por debajo de t; el umbral se adopta solo si al menos 8 de las 10 consultas fuera de dominio quedan por debajo de t. Si no, no hay umbral.
   - Detener el servidor auxiliar antes de juzgar (el juez de Ollama necesita ~6 GB de GPU).
   - **Resultado (14-oct, juez local v2; corridas `evaluation/runs/2026-10-14T18-*-dev-*`):**
     - Etapa 1 (nDCG@10 / P@5): `rr-qwen-instr` 0,839 / 0,879 · `rr-qwen` 0,820 / 0,864 · `rr-qwen-instr-rrf` 0,812 / 0,879 · `rr-bge` 0,804 / 0,814 · `rr-bge-rrf` 0,798 / 0,800 · sin *reranking* 0,742 / 0,757. `rr-qwen` queda a 0,019 de la mejor → **la regla elige `rr-qwen`** (Qwen3-Reranker-0.6B sin instrucción, fusión `replace`). Todos los *rerankers* mejoran 0,06-0,10 sobre no rerankear; bge **no** empeoró las consultas de vocabulario en este conjunto (0,836 vs 0,759).
     - Etapa 2: 30 candidatas 0,832 vs 20 candidatas 0,830 → **20** (recuperación p50 1.184 → 788 ms). Reproducibilidad: las listas de `rr-qwen` de las etapas 1 y 2 son idénticas.
     - Etapa 3: mejor puntaje del *reranker* — desarrollo: la más baja 0,132 ("lawer remote"), la siguiente 0,134; fuera de dominio: todas ≤ 0,09 → **umbral 0,134 adoptado** (10/10 fuera de dominio por debajo, 1/28 de desarrollo). Se aplica como *compuerta de "sin resultados"* sobre el mejor puntaje de la consulta (así se calibró), no recortando ofertas individuales.
     - Configuración de referencia actualizada: `RERANKER_MODEL=Qwen/Qwen3-Reranker-0.6B` (el backend verifica el modelo en cada llamada), `RERANK_CANDIDATES=20`, `RERANK_MIN_SCORE=0.134`. bge queda en el perfil `rerank-dev` (`reranker-bge`, `:8002`) para repetir el experimento.
     - Para el Cap4: sección de evaluación formativa con esta tabla; para amenazas: la decisión se motivó por una necesidad de prueba (n-sv-06), pero se tomó solo con datos de desarrollo y una regla registrada antes.
6. Corrida con juez local: `eval:retrieve` (todos los sistemas) → `eval:pool` → `eval:judge` → `metrics.py`; `eval:generate` + RAGAS; `eval:aggregation`; `eval:latency`.
7. Regenerar la muestra kappa sobre el pool final (**no anotar el CSV del 13-oct**) y anotarla.
8. Benchmark sintético: `bench.py export/queries/synth/truth` y `run_bench.sh real synth-100000 synth-500000`.
- [x] `expectedFilters` en las 24 consultas con restricciones (o que podrían leerse así), `{}` donde no debe extraerse nada (14-oct, commit 3a80b50). Decisiones del autor: **las ofertas sin salario no califican** cuando se pide un mínimo (explícito en el `infoNeed` de las 8 necesidades salariales); **"freelance" acepta `contract` o `freelance`** (las fuentes etiquetan el trabajo freelance como contract; `infoNeed` de n-co-08 ajustado).
- [x] **Juez `umbrela-jobs-v2`** (decisión del autor): salario, modalidad remota, tipo de contrato y ubicación explícitos son condiciones duras; una oferta que las contradice o no las informa recibe como máximo 1 (antes recibía 2 y contaba como relevante). Seniority y habilidades siguen siendo blandas. **Todos los pares se vuelven a juzgar** con el juez local.
- [x] Métrica determinista de **cumplimiento de restricciones** (% del top-5/top-10 que cumple `expectedFilters`, sin juez): `compliance.jsonl` y `constraintCompliance` en `config.json` de `eval:retrieve`; exactitud de la extracción en `filters.jsonl`. Línea base de humo: BM25 cumple 38 % en el top-5. Pendiente integrarla a `metrics.py` (prueba pareada como las demás).
- [ ] Documento: Cap0 ("en producción" → configuración de referencia), Cap1 §Alcance (conversación), Cap2 (RRF, fusión híbrida, *reranking*, BGE-M3, Multilingual E5, ANN con filtros — verificar autores), Cap3 (escalera, hardware), Cap4 ("Iteración 5"), Cap5 (tablas nuevas).

---

## Fase 4 (semanas 7-9) — Redacción de capítulos

Mapeo de capítulos de la plantilla a su contenido:

- [~] Introducción (`Cap0`) — borrador 10-oct; revisar al final con los resultados (sin adelantarlos).
- [x] Capítulo 1 (`Cap1`) — Planteamiento del problema y marco teórico (7-sep; referencias a capítulos ahora con `\ref`).
- [x] Capítulo 2 (`Cap2`) — Estado del arte (7-sep; corregido 10-oct: índice IVFFlat real, descripción del clasificador).
- [~] Capítulo 3 (`Cap3`) — Metodología: borrador completo 10-oct; quedan `\pendiente{}` con estadísticas del corpus y el modelo del juez final.
- [~] Capítulo 4 (`Cap4`) — Diseño y desarrollo: borrador 10-oct (arquitectura corregida contra el código, migración a Qdrant, defectos corregidos); falta la evidencia `EXPLAIN` sobre el corpus completo.
- [~] Capítulo 5 (`Cap5`) — Resultados y evaluación: tablas y texto de PE1-PE4 con la corrida provisional (13-oct); pendientes la validación del juez (kappa) y la Discusión.
- [ ] Conclusiones y recomendaciones (`Cap9`) — respuesta a cada objetivo específico + trabajo futuro.

---

## Fase 5 (semanas 9-10) — Formato final

- [~] Resumen/Abstract bilingüe con palabras clave (`FrontMatter/F04-Abstract.tex`): resumen en español redactado con cifras provisionales (13-oct); Abstract en inglés pendiente (se traduce cuando el autor apruebe el español).
- [ ] Glosario y lista de símbolos si aplica (`F05-Symbols.tex`, `F06-Glossary.tex`).
- [ ] Anexos si aplica (`BackMatter/B01-Anexos.tex`).
- [ ] Verificar cumplimiento de formato NTC1486 (márgenes, numeración, extensión de la introducción 2-4 páginas, documento completo ≤120 páginas salvo reglamento distinto).
- [ ] Completar bibliografía en `Bibliography/referencias.bib` con todas las fuentes citadas.
- [ ] Compilar el documento completo y revisar tabla de contenidos, figuras y tablas.

---

## Fase 6 (semanas 10-11) — Revisión con director

- [ ] Enviar documento completo al director.
- [ ] Recoger observaciones y aplicar ajustes.
- [ ] Ronda adicional de revisión si es necesaria.

---

## Fase 7 (semana 12, ~23-30 nov) — Entrega final

- [ ] Entrega del documento final.
- [ ] Preparar material de sustentación (presentación, demo de JobAI si aplica).
