# Anotación humana para el kappa (juez `umbrela-jobs-v2`)

Archivo: `kappa-sample.csv` (401 pares: 103 de calibración, 298 de validación).

## Cómo anotar

- Llena **solo** la columna `human_grade_0_3` con un entero de 0 a 3. `notes` es opcional.
- No mires la etiqueta del juez: está en `kappa-key.jsonl` y solo se cruza al final.
- Juzga la oferta tal como aparece en la ficha (`job_posting`), contra la necesidad (`search_need`). No busques la oferta en internet.
- Anota primero las filas `calibration` y avísale a Claude: con ellas se revisa si el *prompt* del juez necesita ajustes antes de mirar las de `validation`. Las de `validation` no se usan para cambiar nada.

## Escala (la misma del juez)

| Nota | Significado |
|---|---|
| 0 | La oferta no tiene nada que ver con la necesidad. |
| 1 | Está relacionada, pero no la satisface. |
| 2 | Satisface lo principal de la necesidad, pero falta, es dudoso o se contradice un requisito **secundario** (por ejemplo, la seniority o una habilidad). |
| 3 | Está dedicada a la necesidad y la satisface completa: rol, habilidades, seniority y, si se mencionan, salario, ubicación o tipo de contrato. |

## Condiciones duras

Si la necesidad fija **un umbral de salario, trabajo remoto, un tipo de contrato o una ubicación**, la oferta debe **informar** ese atributo y **cumplirlo**. Si lo contradice o no lo informa ("not stated"), la nota máxima es **1**, aunque el resto calce perfecto.

- Ejemplo: necesidad "Remote backend roles in Python with a salary above $150,000. The posting must state its salary…", oferta de backend en Python, remota, con "Salary: not stated" → **1**.
- La seniority y las habilidades **no** son condiciones duras: si faltan, la oferta puede recibir 2.
- "Freelance or contract" acepta ofertas `contract` o `freelance`.
