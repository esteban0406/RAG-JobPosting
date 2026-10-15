# Avance de tesis — 13 de octubre de 2026

**Estudiante:** Luis Esteban Peña Rodriguez · **Trabajo:** *JobAI: diseño y evaluación de una plataforma de búsqueda de empleo remoto basada en Retrieval-Augmented Generation* · **Enfoque:** Design Science Research

Adjunto el borrador del documento en PDF. Contiene la introducción, el planteamiento del problema, los objetivos, el estado del arte, la metodología completa y el capítulo de diseño y desarrollo. Los capítulos de resultados y conclusiones solo tienen su estructura; se redactan cuando termine la evaluación.

## Qué se avanzó

- **Problema y objetivos** (Cap. 1), **estado del arte** con 19 fuentes en seis líneas (Cap. 2) y **metodología de evaluación** (Cap. 3). Es la primera vez que le envío la problemática y los objetivos; su validación es lo que más necesito en esta revisión.
- **Iteración de diseño sobre el artefacto** (Cap. 4):
  - **Diagnóstico de pgvector:** la búsqueda vectorial nunca usaba el índice, según la evidencia de `EXPLAIN ANALYZE`, y el umbral de similitud no filtraba nada.
  - **Migración a Qdrant:** el almacén vectorial quedó detrás de una interfaz común, de modo que la plataforma funciona con pgvector o con Qdrant cambiando una variable de configuración. Ambos motores usan el mismo índice HNSW para compararlos en igualdad de condiciones.
  - **Defectos corregidos:** la revisión del código encontró cinco, entre ellos que la personalización por currículo descartaba la pregunta del usuario.
- **Corpus de evaluación:** se ingirió y congeló un corpus de 1.068 ofertas reales (4.013 fragmentos) de Remotive, Jobicy y Findwork, para que los experimentos sean reproducibles.
- **Primer resultado técnico** (Cap. 5, preliminar): con el plan que elige PostgreSQL, la búsqueda en pgvector recorre la tabla completa (23,6 ms); servida desde Qdrant tarda 3,1 ms con un *recall* de 0,988. Forzando el índice en pgvector se obtiene 2,2 ms, lo que muestra que a esta escala la diferencia se debe al planificador y no al motor; el benchmark completo con datos sintéticos y filtros lo dirá a mayor escala.
- **Arnés de evaluación listo:** cinco sistemas de recuperación, juez de relevancia con caché, validación con kappa, métricas RAGAS y benchmark de almacenes vectoriales, probados de punta a punta.

## Decisiones metodológicas

1. **Sistemas comparados:** la recuperación semántica de JobAI se compara contra **dos líneas base léxicas**:
   - la búsqueda por palabra clave que ofrece hoy la plataforma;
   - **BM25**, la línea base fuerte de la literatura, para no comparar solo contra un sistema débil.
2. **Consultas de prueba:** 75 consultas en inglés en cinco categorías (exactas, desajuste de vocabulario, con restricciones, ruidosas y de agregación), más 25 en español.
3. **Juicios de relevancia:** los asigna un **modelo de lenguaje como juez** (procedimiento UMBRELA, Thomas et al. 2024), **validado contra mis juicios** sobre una muestra del 20 % con el kappa de Cohen. Los resultados históricos del propio artefacto muestran por qué hace falta: la misma configuración obtuvo 90,7 % o 98,7 % de precisión según el modelo que actuó como juez.
4. **Generación:** la fidelidad de las respuestas se mide con RAGAS.
5. **Almacenamiento vectorial:** la comparación pgvector frente a Qdrant usa la metodología de ANN-Benchmarks, con el corpus real más datos sintéticos de hasta 500.000 vectores, con y sin filtros.
6. **Análisis estadístico:** prueba de aleatorización pareada con corrección de Holm.

## Cronograma

| Fechas | Actividad |
|---|---|
| 13 a 18 oct | Ajustes según esta revisión; conjunto de consultas; líneas base |
| 19 oct a 1 nov | Ejecución de la evaluación y validación del juez |
| 2 a 8 nov | Resultados, conclusiones, resumen |
| 9 a 15 nov | Envío del documento completo |
| 16 a 22 nov | Ajustes finales |
| 23 a 30 nov | Entrega |

## Preguntas para usted

1. ¿Aprueba la problemática, la pregunta de investigación y los cuatro objetivos específicos (Cap. 1)? El objetivo 2 incluye la migración del almacenamiento vectorial.
2. ¿Considera aceptable usar un modelo de lenguaje como juez de relevancia, con validación humana sobre una muestra, en lugar de anotar a mano todos los juicios?
3. ¿Hay una extensión o estructura de capítulos esperada por el programa, distinta de la plantilla (máximo 120 páginas)?
4. ¿Hay alguna fecha intermedia obligatoria antes de la entrega final?
