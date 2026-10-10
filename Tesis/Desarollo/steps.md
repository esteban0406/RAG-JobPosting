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

## Cronograma resumen (replanificado 10-oct)

| Fechas | Fase | Entregable |
|---|---|---|
| 7 sep | Problemática, objetivos, marco teórico, estado del arte | Cap1 y Cap2 (hecho) |
| 10-12 oct | Migración a Qdrant, correcciones, metodología, Cap0/Cap3/Cap4 | **Martes 13-oct:** PDF + nota + demo al profesor |
| 13-18 oct | Ajustes del director, dataset de consultas, BM25/ILIKE, harness de evaluación | Cap4 completo |
| 19-25 oct | Benchmark sintético, generación (RAGAS), latencia; anotación humana para kappa | Resultados preliminares |
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

- [ ] Congelar el snapshot del corpus (`evaluation/snapshots/`, manifest con sha256 y conteos). Ingesta en curso desde el 10-oct 17:41 (~1.070 ofertas: Findwork 895, Jobicy 162, Remotive 11).
- [x] Instrumentar JobAI: `buildContext` devuelve contextos por oferta y tiempos por etapa; temperatura configurable en el stream (10-oct).
- [~] Dataset de consultas: borrador en `evaluation/datasets/queries.v2.draft.jsonl` (75 EN + 25 ES, 75 necesidades). **Pendiente: revisión del autor** y verificar contra el corpus congelado que cada necesidad tenga ofertas relevantes.
- [x] Líneas base `ilike` y `bm25` + comandos `eval:retrieve`, `eval:pool`, `eval:judge` (UMBRELA, caché), `eval:kappa-export`, `eval:generate`; análisis en `evaluation/analysis/{metrics,kappa}.py` (imagen Docker fijada). Probados de punta a punta en la base de desarrollo (10-oct).
- [ ] Anotación humana de la muestra para kappa (~250-300 pares, 2-3 h) — el CSV ciego sale de `eval:kappa-export`.
- [~] Generación + RAGAS: `eval:generate` probado; `evaluation/ragas/` (ragas 0.4.3, imagen aislada) instanciado; falta la prueba completa con el juez local.
- [~] Benchmark de almacenes vectoriales (`evaluation/bench/`): implementado y probado a pequeña escala (5k). Ya muestra el problema de post-filtrado de pgvector: filtro 10 % con ef=16 sin iterative scan → recall 0,19; con `relaxed_order` → 0,995. Requiere recrear el contenedor de Postgres (`shm_size: 4gb`) antes de la corrida real.
- [ ] Corrida final con juez de pago; análisis estadístico (aleatorización pareada + Holm) y figuras.

**Hallazgos pendientes de decisión (10-oct):**
- La plantilla `count_remote` cuenta remotos por `location ILIKE '%remote%'` e ignora la columna `isRemote` del parser → subestima mucho las ofertas remotas. ¿Corregir (nueva iteración) o reportar como defecto encontrado en la evaluación?
- El normalizador de salarios no convierte monedas ni algunos montos por hora (p. ej. 86.528.000 USD para un "Dispatch Specialist"; salarios en SEK). 5 de 253 ofertas con salario son atípicas; mediana 175 k. Se documenta como limitación de calidad de datos.
- Groq retiró `qwen3-32b` y `qwen3.6-27b`: revisar el `LLM_MODEL` de producción.

---

## Fase 4 (semanas 7-9) — Redacción de capítulos

Mapeo de capítulos de la plantilla a su contenido:

- [~] Introducción (`Cap0`) — borrador 10-oct; revisar al final con los resultados (sin adelantarlos).
- [x] Capítulo 1 (`Cap1`) — Planteamiento del problema y marco teórico (7-sep; referencias a capítulos ahora con `\ref`).
- [x] Capítulo 2 (`Cap2`) — Estado del arte (7-sep; corregido 10-oct: índice IVFFlat real, descripción del clasificador).
- [~] Capítulo 3 (`Cap3`) — Metodología: borrador completo 10-oct; quedan `\pendiente{}` con estadísticas del corpus y el modelo del juez final.
- [~] Capítulo 4 (`Cap4`) — Diseño y desarrollo: borrador 10-oct (arquitectura corregida contra el código, migración a Qdrant, defectos corregidos); falta la evidencia `EXPLAIN` sobre el corpus completo.
- [ ] Capítulo 5 (`Cap5`) — Resultados y evaluación (datos de la Fase 3).
- [ ] Conclusiones y recomendaciones (`Cap9`) — respuesta a cada objetivo específico + trabajo futuro.

---

## Fase 5 (semanas 9-10) — Formato final

- [ ] Resumen/Abstract bilingüe con palabras clave (`FrontMatter/F04-Abstract.tex`).
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
