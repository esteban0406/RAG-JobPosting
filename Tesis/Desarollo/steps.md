# Roadmap de Tesis — JobAI (Plataforma de búsqueda de empleo con IA)

## Contexto y enfoque

- **Programa:** Maestría en Inteligencia Artificial, Universidad Sergio Arboleda (plantilla NTC1486 en `Tesis/Plantilla`).
- **Fecha límite:** entrega última semana de noviembre

- **Enfoque:** Design Science Research (DSR). JobAI ya es el artefacto construido (ver `caseStudy.md`). El aporte académico nuevo NO es construir features grandes, sino: (a) fundamentar el problema en literatura, (b) definir metodología y métricas de evaluación, (c) evaluar el artefacto cuantitativamente (precisión de retrieval, fidelidad/groundedness de respuestas, y opcionalmente comparación contra un baseline de búsqueda por palabra clave).
- **Cambio de arquitectura decidido:** la plataforma migrará su almacenamiento vectorial de PostgreSQL+pgvector a una base de datos vectorial dedicada (Qdrant). Esto sí es desarrollo nuevo (migración de embeddings, actualización de ingesta y del módulo de retrieval), pero encaja dentro de DSR como una iteración del ciclo diseño-evaluación, y abre la puerta a una comparación empírica pgvector vs. Qdrant (latencia/recall) que enriquece la evaluación sin salirse del alcance.
- **Pedido actual del director:** problemática fundamentada en literatura + objetivo general y 4 objetivos específicos.

## Cronograma resumen

| Semana | Fase | Entregable |
|---|---|---|
| 1 (7-14 sep) | Problemática y objetivos | Enviar a director |
| 2-3 | Marco teórico / estado del arte | Capítulo de antecedentes con citas |
| 2-4 | Migración a Qdrant + metodología (DSR) + diseño de métricas | Base vectorial migrada + definición de métricas y diseño experimental |
| 5-7 | Instrumentar y ejecutar evaluación | Resultados cuantitativos |
| 7-9 | Redacción de capítulos | Documento en plantilla LaTeX |
| 9-10 | Front/back matter, formato NTC1486, bibliografía | Documento formateado completo |
| 10-11 | Revisión con director, ajustes | Versión revisada |
| 12 (~23-30 nov) | Entrega final | Documento + preparación de sustentación |

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
- [ ] Revisar la problemática y objetivos contra la plantilla (`Plantilla - Tesis/MainMatter/Cap0/M01-Introduction.tex`, `FrontMatter/F04-Abstract.tex`) — pendiente; es una revisión rápida de forma (tono impersonal, que no se adelanten resultados/conclusiones) y puede hacerse antes o después de enviar al director.
- [ ] **Enviar borrador al director — pendiente y ahora es la acción más urgente del proyecto.** Usar como base el contenido ya redactado en `Cap1/M02-Chapter1.tex` §§"Planteamiento del problema", "Formulación del problema" y "Objetivos" (condensándolo si se prefiere un formato más breve para esta primera revisión).

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

- [ ] Migrar el almacenamiento de embeddings de PostgreSQL+pgvector a Qdrant (crear colección, definir esquema de payload, reingestar vectores existentes de jobs y resúmenes).
- [ ] Actualizar el módulo de Embedding/RAG y el pipeline de ingestión para escribir/consultar Qdrant en vez de pgvector.
- [ ] (Recomendado) Conservar temporalmente el backend pgvector para poder comparar pgvector vs. Qdrant en la Fase 3 (latencia, recall) — esto también sirve como resultado adicional para el capítulo de evaluación.
- [ ] Formalizar el marco DSR: definir el "artefacto" (JobAI), la "pregunta de investigación", y el ciclo de diseño-evaluación.
- [ ] Definir métricas de evaluación:
  - Precisión de retrieval (relevancia de los chunks recuperados).
  - Fidelidad/groundedness de las respuestas (evitar alucinación del LLM).
  - Tiempo de respuesta del pipeline (latencia end-to-end).
  - Si se conservó pgvector: latencia y recall comparados entre pgvector y Qdrant.
- [ ] Diseñar el experimento de comparación contra un baseline de búsqueda por palabra clave (dataset de consultas de prueba, criterio de éxito).
- [ ] Redactar el capítulo de metodología.

---

## Fase 3 (semanas 5-7) — Ejecución de la evaluación

- [ ] Instrumentar JobAI para capturar las métricas definidas en la Fase 2 (logging de resultados de retrieval, tiempos, respuestas).
- [ ] Construir el dataset de consultas de prueba.
- [ ] Ejecutar la evaluación (pipeline RAG vs. baseline keyword-search).
- [ ] Recolectar y tabular los resultados cuantitativos.

---

## Fase 4 (semanas 7-9) — Redacción de capítulos

Mapeo de capítulos de la plantilla a su contenido:

- [ ] Introducción (`Cap0`) — contexto, problemática, objetivos, alcance, metodología (resumen).
- [ ] Capítulo 1 (`Cap1`) — Planteamiento del problema y marco teórico.
- [ ] Capítulo 2 (`Cap2`) — Estado del arte (literatura de la Fase 1).
- [ ] Capítulo 3 (`Cap3`) — Metodología (DSR, métricas, diseño experimental de la Fase 2).
- [ ] Capítulo 4 (`Cap4`) — Desarrollo/Arquitectura (reusar y adaptar contenido de `caseStudy.md`; reescribir la sección de decisiones de arquitectura sobre almacenamiento vectorial para reflejar la migración de pgvector a Qdrant, con justificación académica).
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
