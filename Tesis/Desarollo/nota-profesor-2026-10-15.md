# Avance de tesis — 15 de octubre de 2026

**Estudiante:** Luis Esteban Peña Rodriguez · **Trabajo:** *JobAI: diseño y evaluación de una plataforma de búsqueda de empleo remoto basada en Retrieval-Augmented Generation* · **Enfoque:** Design Science Research

Adjunto el borrador del documento en PDF. Contiene la introducción, el planteamiento del problema y los objetivos (Cap. 1), el estado del arte (Cap. 2), la metodología (Cap. 3), el diseño y desarrollo (Cap. 4) y el resumen con los resultados preliminares. El capítulo de resultados (Cap. 5) conserva las tablas de una primera corrida y está marcado como desactualizado: las cifras vigentes son las del resumen. Las conclusiones solo tienen su estructura.

**Lo que más necesito de esta revisión** es su validación de la problemática, la pregunta de investigación y los cuatro objetivos específicos (Cap. 1). Es la primera vez que se los envío y el resto del documento se apoya en ellos.

## Qué se avanzó

- **Problema y objetivos** (Cap. 1), **estado del arte** con 19 fuentes en seis líneas (Cap. 2) y **metodología de evaluación** (Cap. 3).
- **Primera iteración de diseño: almacenamiento vectorial** (Cap. 4):
  - **Diagnóstico de pgvector:** la búsqueda vectorial nunca usaba el índice, según la evidencia de `EXPLAIN ANALYZE`, y el umbral de similitud no filtraba nada.
  - **Migración a Qdrant:** el almacén vectorial quedó detrás de una interfaz común, de modo que la plataforma funciona con pgvector o con Qdrant cambiando una variable de configuración. Ambos motores usan el mismo índice HNSW para compararlos en igualdad de condiciones.
  - **Defectos corregidos:** la revisión del código encontró cinco, entre ellos que la personalización por currículo descartaba la pregunta del usuario.
- **Segunda iteración de diseño: recuperación** (todavía no está en el Cap. 4; la redacto esta semana). Una primera corrida de la evaluación y la revisión del código mostraron que el artefacto no usaba en la búsqueda las restricciones de la consulta (salario, modalidad, tipo de contrato) y que respondía en inglés a preguntas en español. Se incorporaron:
  - filtros estructurados extraídos de la consulta;
  - búsqueda híbrida (BM25 con fusión por rangos recíprocos);
  - reordenamiento de los candidatos con un modelo de *reranking*, elegido sobre un conjunto de consultas de desarrollo separado del de prueba, con una regla de decisión fijada antes de ver los resultados;
  - un modelo de *embeddings* multilingüe.

  Por esto amplié la redacción del objetivo específico 2, que ahora nombra estos componentes.
- **Corpus de evaluación:** 1.068 ofertas reales (4.013 fragmentos) de Remotive, Jobicy y Findwork, congeladas para que los experimentos sean reproducibles.
- **Resultados preliminares** (juez local, todavía sin la validación humana):
  - nDCG@10 de 0,81 con la configuración completa, frente a 0,54 de BM25 y 0,05 de la búsqueda por palabra clave de la plataforma.
  - Los filtros y el reordenamiento mejoran el resultado de forma significativa; la búsqueda híbrida no, un resultado negativo que discutiré frente a la literatura.
  - En las consultas con restricciones, la proporción de los cinco primeros resultados que las cumplen pasa de 0,40 a 0,96.
  - pgvector y Qdrant devuelven resultados de la misma calidad. La búsqueda tarda 4,7 ms en Qdrant y 25,8 ms en pgvector, pero el reordenamiento (~0,8 s) domina el tiempo total.
  - Benchmark con 500.000 vectores: con un filtro del 1 %, pgvector no supera un *recall* de 0,90 ni siquiera con barrido iterativo (unos 10 ms), mientras que Qdrant alcanza 0,98 en 1,7 ms; sin filtro, los dos motores ofrecen compromisos similares. Las conclusiones se repiten con los vectores del modelo de *embeddings* anterior.

## Decisiones metodológicas

1. **Sistemas comparados:** la recuperación de JobAI se compara contra **dos líneas base léxicas**: la búsqueda por palabra clave que ofrece hoy la plataforma y **BM25**, la línea base fuerte de la literatura. El aporte de cada componente se mide agregándolos uno a uno (denso → filtros → híbrida → reordenamiento).
2. **Consultas:** 75 consultas de prueba en inglés en cinco categorías (exactas, desajuste de vocabulario, con restricciones, ruidosas y de agregación), más 25 en español. Las decisiones de configuración se toman con un conjunto de desarrollo aparte (28 consultas), para no ajustar el sistema con las consultas de prueba.
3. **Juicios de relevancia:** los asigna un **modelo de lenguaje como juez** (procedimiento UMBRELA, Upadhyay et al. 2024, basado en Thomas et al. 2024), **validado contra mis juicios** sobre una muestra del 20 % con el kappa de Cohen. Los resultados históricos del propio artefacto muestran por qué hace falta: la misma configuración obtuvo 90,7 % o 98,7 % de precisión según el modelo que actuó como juez. Durante el desarrollo uso un juez local; la corrida final se hará con un modelo comercial de mayor capacidad.
4. **Generación:** la fidelidad de las respuestas se mide con RAGAS.
5. **Almacenamiento vectorial:** la comparación pgvector frente a Qdrant usa la metodología de ANN-Benchmarks, con el corpus real más datos sintéticos de hasta 500.000 vectores, con y sin filtros.
6. **Análisis estadístico:** prueba de aleatorización pareada con intervalos de confianza por *bootstrap*. nDCG@10 es la métrica principal y sus comparaciones se corrigen con Holm; las demás métricas se reportan como secundarias.

## Cronograma

| Fechas | Actividad |
|---|---|
| 15 a 25 oct | Validación humana del juez; redacción de la segunda iteración (Cap. 3 y 4) |
| 26 oct a 1 nov | Corrida final con el juez comercial; resultados congelados |
| 2 a 8 nov | Resultados, discusión, conclusiones y resumen |
| 9 a 15 nov | Envío del documento completo |
| 16 a 22 nov | Ajustes según sus observaciones |
| 23 a 30 nov | Entrega final |

## Preguntas para usted

1. ¿Aprueba la problemática, la pregunta de investigación y los cuatro objetivos específicos (Cap. 1)? El objetivo 2 incluye la migración del almacenamiento vectorial y los componentes de la segunda iteración.
2. ¿Considera aceptable usar un modelo de lenguaje como juez de relevancia, con validación humana sobre una muestra, en lugar de anotar a mano todos los juicios?
3. ¿Hay una extensión o estructura de capítulos esperada por el programa, distinta de la plantilla (máximo 120 páginas)?
4. ¿Hay alguna fecha intermedia obligatoria antes de la entrega final?
