# No usar esta corrida

El cliente de Groq reintentaba por su cuenta (SDK, `maxRetries` 2 por defecto) las
peticiones rechazadas por límite de uso, esperando el `retry-after`, y esa espera quedó
dentro de `ttftMs`: 59 de las 90 generaciones superan 2,5 s (mediana 7,1 s), mientras que
las no contaminadas tienen una mediana de 0,48 s, igual que la Iteración 1.

Corregido el 15-oct: `eval:latency` fija `LLM_MAX_RETRIES=0`, así el rechazo llega al
arnés, que espera y vuelve a medir el intento. Repetir con `--delay-ms 35000`.
