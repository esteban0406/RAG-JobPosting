# Avance de trabajo de grado — 15 de octubre de 2026

**Estudiante:** Luis Esteban Peña Rodríguez · **Programa:** Ingeniería en Ciencias de la Computación e Inteligencia Artificial · **Trabajo:** *Evaluación por componentes de un pipeline de Retrieval-Augmented Generation para la búsqueda de empleo remoto: el caso JobAI* · **Enfoque:** Design Science Research

Adjunto el borrador del documento en PDF. Contiene:

- la introducción;
- el problema, la pregunta, las hipótesis y los objetivos (Cap. 2);
- el estado del arte (Cap. 3);
- la metodología (Cap. 4);
- el diseño del artefacto (Cap. 5);
- los resultados preliminares (Cap. 6);
- el resumen.

Los resultados son provisionales: los juicios de relevancia los asignó un modelo local y todavía no tienen la validación humana. La discusión y las conclusiones solo tienen su estructura.

**Lo que más necesito de esta revisión** es su validación del problema, la pregunta de investigación, las hipótesis y los cuatro objetivos específicos (Cap. 2). Es la primera vez que se los envío y el resto del documento se apoya en ellos.

## Planteamiento

- **Pregunta:** ¿en qué medida un pipeline de *Retrieval-Augmented Generation* mejora la recuperación de ofertas de empleo frente a la búsqueda por palabras clave, qué componentes del pipeline explican esa mejora y con qué costo en latencia?
- **Hipótesis:**
  - H1: la recuperación densa supera a BM25, sobre todo cuando la consulta y la oferta usan palabras distintas.
  - H2: los filtros estructurados, la búsqueda híbrida y el reordenamiento aportan mejoras adicionales.
  - H3: a la escala del corpus real, el motor vectorial (pgvector o Qdrant) no limita la calidad ni la latencia; las diferencias aparecen solo a mayor escala y con filtros selectivos.
- **Objetivo general:** evaluar en qué medida un pipeline RAG aplicado a la búsqueda de empleo remoto mejora la recuperación frente a la búsqueda por palabras clave, e identificar el aporte y el costo de cada componente, con la plataforma JobAI como caso de estudio.
- **Caso de estudio:** JobAI es una plataforma que desarrollé antes de la tesis, sin un protocolo de evaluación formal. La tesis la usa como caso para evaluar los componentes; no se centra en su desarrollo.

## Qué se hizo

- **Protocolo de evaluación:**
  - un corpus congelado de 1.068 ofertas reales;
  - 100 consultas de prueba en cinco categorías, en inglés y en español;
  - un conjunto de desarrollo separado, para que ninguna decisión de configuración se tome mirando las consultas de prueba;
  - juicios de relevancia de un modelo de lenguaje, que se validarán contra mis juicios en una muestra del 20 %;
  - análisis estadístico pareado.
- **Dos iteraciones de diseño:**
  - *Corrección.* La preparación de la evaluación reveló fallas del artefacto que se corrigieron, entre ellas que la búsqueda vectorial nunca usaba el índice. El almacenamiento vectorial quedó detrás de una interfaz común para comparar pgvector y Qdrant.
  - *Mejora.* Se incorporaron filtros extraídos de la consulta, búsqueda híbrida con BM25, reordenamiento y un modelo de *embeddings* multilingüe.
- **Fallas silenciosas:** el protocolo reveló 12 fallas del artefacto y 5 del propio arnés de evaluación. En 10 de las del artefacto el sistema seguía respondiendo con fluidez, por ejemplo ignorando las restricciones de la consulta. El Cap. 5 las clasifica y extrae una lección de cada una.

## Resultados preliminares (juez local)

- nDCG@10 de 0,80 con la configuración completa, frente a 0,56 de BM25.
- Partiendo de la recuperación densa (0,68):
  - los filtros aportan +0,05 y el reordenamiento +0,08, ambos significativos;
  - la búsqueda híbrida no aporta, un resultado negativo que discutiré frente a la literatura.
- Con restricciones (salario, modalidad, tipo de contrato), la proporción de los cinco primeros resultados que las cumplen pasa de 0,41 a 0,97. En español, el sistema obtiene 0,80, frente a 0,35 de BM25.
- El reordenamiento cuesta unos 0,8 s por consulta.
- Los dos motores vectoriales dan la misma calidad a la escala real. Con 500.000 vectores y un filtro del 1 %, Qdrant mantiene un *recall* de 0,98 en 1,7 ms; pgvector no supera 0,90 con su índice HNSW y solo llega a 1,0 con búsqueda exacta, en 9 ms.

## Cronograma

| Fechas | Actividad |
|---|---|
| hasta 25 oct | Validación humana del juez; latencia de la generación |
| 26 oct a 1 nov | Corrida final con el juez comercial (GPT-4o); resultados congelados |
| 2 a 8 nov | Resultados finales, discusión, conclusiones; resumen y abstract finales |
| 9 a 15 nov | Envío del documento completo |
| 16 a 22 nov | Ajustes según sus observaciones |
| 23 a 30 nov | Entrega final |

## Preguntas para usted

1. ¿Aprueba el problema, la pregunta, las hipótesis y los cuatro objetivos específicos (Cap. 2)?
2. ¿Considera aceptable usar un modelo de lenguaje como juez de relevancia, validado con mis juicios sobre una muestra, en lugar de anotar a mano todos los pares?
3. ¿Hay una extensión o una estructura de capítulos que exija el programa de pregrado, distinta de la plantilla?
4. ¿Hay alguna fecha intermedia obligatoria antes de la entrega final?
