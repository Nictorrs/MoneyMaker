# MoneyMaker

Finanzas personales Zero-Friction: registro rápido con dictado y foto del recibo como evidencia, lectura automática de alertas bancarias, copiloto financiero con preguntas fijas y gamificación. Todo funciona dentro del teléfono, sin servidor. Estilo visual Advanced Glassmorphism.

```
MoneyMaker/
├── backend/   Microservicio de IA (Python · FastAPI · Claude). La app entregada no lo usa
├── database/  Esquema SQLite v5 (lo usa la app y se abre en DB Browser for SQLite)
└── mobile/    App React Native (JavaScript) + módulos nativos Android (Java)
```

## Arquitectura

| Capa | Tecnología | Responsabilidad |
|---|---|---|
| UI | React Native 0.87 (JS), `react-native-svg`, `@react-native-community/blur` | Pantallas, glassmorphism, gráficos SVG, animaciones con `Animated` (driver nativo) |
| Core local | Java (`mobile/android/app/src/main/java/com/moneymaker/finance`) | SQLite, `BroadcastReceiver` de SMS, `NotificationListenerService`, dictado, fotos de recibo, respaldo cifrado, `FLAG_SECURE` |

Flujo de datos: la base SQLite del teléfono es la fuente de verdad y la app no llama a ningún servidor. El copiloto, las alertas predictivas y la lectura de alertas bancarias se calculan en el dispositivo. El dictado usa el reconocedor de voz del sistema Android, que en muchos teléfonos necesita internet (servicio de Google, no de MoneyMaker).

## Backend (opcional, no lo usa la app)

La versión entregada de la app funciona sin este servicio: no lo llama en ningún momento. Se conserva en el repositorio como base para una futura versión con IA (lectura de texto libre, OCR de recibos y chat abierto), que requeriría desplegarlo en la nube con HTTPS, un token y límite de peticiones.

```bash
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
copy .env.example .env   # agrega ANTHROPIC_API_KEY
.venv\Scripts\uvicorn app.main:app --reload --env-file .env
.venv\Scripts\python -m pytest
```

| Endpoint | Entrada | Salida |
|---|---|---|
| `POST /v1/parse/text` | `{text, today?, currency?, hints?}` | Transacciones con `highlights` (posiciones del texto que respaldan monto, fecha, comercio y categoría) |
| `POST /v1/parse/receipt` | multipart `file` (+ `today`, `currency`, `hints` en JSON) | Total, comercio, fecha, categoría, ítems e impuestos |
| `POST /v1/copilot/chat` | `{question, snapshot, history}` | Respuesta del Copilot |
| `POST /v1/feedback` | `{items: [correcciones]}` | Guarda correcciones de categoría compartidas (opt-in) para re-entrenar; 503 si `MONEYMAKER_FEEDBACK_PATH` no está configurado |

`hints` son las correcciones previas del usuario (`{text, category}`): Claude las usa cuando el comercio o concepto coincide.
| `GET /health` | | Estado y si la IA está activa |

- Sin credenciales (`MONEYMAKER_AI_MODE=auto`), el texto y el Copilot funcionan con un **motor de reglas en español** que entiende "45 mil", "18k", "lucas", "ayer", "el lunes" o "hace 3 días". El OCR sí requiere IA.
- Si Claude falla o declina, el texto y el Copilot caen al motor de reglas. Las solicitudes usan `fallbacks: "default"` para reintentar del lado del servidor con el modelo de respaldo.

### Producción

```bash
docker build -t moneymaker-ai backend
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=... -e MONEYMAKER_APP_TOKEN=... moneymaker-ai
```

La imagen corre como usuario sin privilegios, con `MONEYMAKER_ENV=production`. En ese modo `/docs` y `/openapi.json` no se publican y, sin `MONEYMAKER_APP_TOKEN`, los endpoints responden 503 en vez de quedar abiertos. Debe ir detrás de un balanceador con HTTPS.

## App móvil

Requisitos: Node ≥ 22, JDK 17 y Android SDK con `platforms;android-37.0`, `build-tools;37.0.0`, `ndk;27.1.12297006` y `cmake;3.22.1` (ya instalados en este equipo). `mobile/android/local.properties` apunta al SDK y no se versiona.

```bash
cd mobile
npm install
npm run android        # con el emulador abierto
npm test               # lógica JS (analítica, proyección, gamificación, geometría)
cd android && gradlew testDebugUnitTest   # parser bancario, cifrado de respaldos y scripts SQL (Java)
python ../database/construir.py           # esquema, migraciones (v3 y v4 -> v5) y restauración (SQLite)
```

### Base de datos

- El esquema vive en [`database/esquema.sql`](database/esquema.sql), el mismo archivo que se abre en DB Browser for SQLite. Gradle lo copia a los assets y `FinanceDatabase` lo ejecuta, así que no hay una segunda copia en Java.
- La versión 4 añadió:
  - catálogos de categorías, orígenes y ajustes;
  - claves foráneas, activadas en cada conexión;
  - restricciones CHECK y triggers. Por ejemplo, un gasto no puede quedar en la categoría Salario.
- La versión 5 añade:
  - el historial de aportes de cada meta: el ahorro es la suma de ese historial;
  - las insignias ganadas, que ya no se pierden si se rompe una racha.
- Al actualizar desde v3 o v4, la app migra los datos y corrige lo que el esquema no admite. Hace lo mismo al restaurar un respaldo de una versión anterior.
- Los detalles están en [`database/README.md`](database/README.md).

**OneDrive:** el proyecto está dentro de `OneDrive\Documentos`, y eso da problemas.
- OneDrive intenta sincronizar `node_modules` y las carpetas `build` (decenas de miles de archivos) y muestra avisos de "ruta demasiado larga".
- También convierte las salidas de compilación en archivos de nube, lo que rompe la caché de Gradle (`Cannot snapshot … not a regular file`).
- Redirigir las carpetas `build` no funciona: el plugin de React Native usa rutas fijas a `android/app/build/generated/autolinking`.
- La solución es mover el proyecto fuera de OneDrive, por ejemplo a `C:\dev\MoneyMaker`.
- Mientras tanto, si reaparece el error de la caché, detén Gradle (`gradlew --stop`) y borra `android/app/build`, `android/app/.cxx` y las entradas de `~/.gradle/caches/<versión>/transforms` indicadas en el error.

Para un build de prueba más rápido, compila solo la arquitectura del emulador: `gradlew assembleDebug -PreactNativeArchitectures=x86_64`. El primero tarda ~15 min porque descarga dependencias y compila C++; los siguientes usan caché.

- En el onboarding, "Explorar con datos de ejemplo" carga 5 meses de movimientos, metas y alertas pendientes.

### Pantallas

- **Bienvenida**: estándares de privacidad y seguridad, moneda, presupuesto y permisos de automatización.
- **Centro de mando**: balance total, anillo de presupuesto restante, accesos a Dictar, Escribir y Recibo, alertas predictivas y el copiloto financiero.
- **Copiloto financiero**: cuatro preguntas fijas ("¿Me alcanza el presupuesto?", "¿Cómo voy este mes?", "¿En qué gasto más?", "¿Cómo puedo ahorrar más?"). Las respuestas se calculan en el teléfono con los totales del mes y se actualizan con cada movimiento. No hay chat libre ni IA.
- **Bloqueo**: al abrir la app pide el usuario y la contraseña que se crearon en la bienvenida. Se administra en Ajustes → Acceso (cambiar contraseña, cuándo volver a pedirla o quitar el bloqueo).
- **Botón +** (centro de la barra): toque = formulario de nuevo movimiento; mantener presionado = formulario con el dictado ya activo.
- **Nuevo movimiento**:
  - Monto, descripción, comercio, categoría y fecha se llenan a mano.
  - El micrófono de la descripción transcribe literalmente lo que dices; no interpreta montos ni categorías. El movimiento queda con origen "Voz".
  - **Foto del recibo (opcional)**: desde la cámara o la galería. Se guarda como evidencia del gasto y se ve al abrir el movimiento (toca la miniatura para verla completa). No se lee ni se interpreta. El movimiento queda con origen "Recibo".
  - El acceso "Recibo" del Centro de mando abre el formulario con la cámara.
- **Confirmación de transacción** (alertas bancarias pendientes):
  - Monto, fecha, concepto y comercio editables.
  - La categoría sugerida es un menú desplegable que indica su origen: lector bancario o aprendida.
  - Solo se guarda con "Confirmar y guardar".
- **Movimientos**: lista virtualizada y paginada (30 por página, se cargan al acercarse al final), con swipe para editar o eliminar (con deshacer) y filtros.
- **Analítica (comparativa histórica)**:
  - Barra flotante con los meses A y B, elegibles con ruedas estilo iOS o atajos.
  - Titular del mayor cambio por categoría ("Gastaste 15% más en Comida…").
  - Tarjetas con flechas de tendencia: verde hacia abajo si es ahorro, roja hacia arriba si aumenta el gasto.
  - Barras superpuestas A vs. B, dona del mes A, curvas de 6 meses y comercios principales.
  - Si un mes está en curso, ambos se comparan sobre los mismos días.
- **Metas**:
  - Metas con barras animadas y su historial: saldo inicial, aportes rápidos y ajustes hechos a mano.
  - Rachas e insignias con medallas renderizadas. Cada insignia ganada se guarda con su fecha y no se pierde aunque se rompa la racha.
- **Ajustes y privacidad** (ícono de controles en el Centro de mando): presupuesto y moneda, acceso, bloqueo de capturas, categorías aprendidas, modo ahorro de batería, respaldo cifrado y borrado total.

## Logo e íconos

- **Original:** `branding/moneymaker-logo.jpg`.
- **Símbolo recortado con fondo transparente:** `branding/moneymaker-mark.png`.
- **Ícono de Android:** adaptativo (fondo, símbolo y capa monocromática para íconos temáticos de Android 13+) con versiones clásicas para Android 7.
- **Ícono de iOS:** `AppIcon-1024.png`.
- **Logo de la pantalla de bienvenida:** `mobile/assets/brand/logo-mark.png`.

Para regenerarlos, ejecuta `powershell -ExecutionPolicy Bypass -File branding\generate-icons.ps1`.

## Categorías aprendidas

1. Si el usuario cambia la categoría sugerida al confirmar una alerta bancaria, la corrección queda etiquetada en la tabla local `category_feedback`: comercio, concepto, categoría sugerida y final, origen y día.
2. Esas correcciones se convierten en preferencias que ajustan de inmediato las siguientes sugerencias ("Aprendida de tus correcciones").
3. Nada de esto sale del teléfono.

## Rendimiento

- **Estado con carga perezosa**: al abrir la app se pide un único snapshot en SQL (balance, totales del mes y 3 previos, recientes, pendientes y fechas para la racha). Analítica, Metas y Movimientos piden sus datos al abrirse; el copiloto usa el mismo snapshot. Las consultas se cachean y se invalidan solo cuando algo escribe en la base.
- **Agregados en SQLite**: totales por mes y categoría, comercios, estadísticas de actividad y páginas con cursor (fecha, creación, id) se calculan en la base con índices, no en JavaScript.
- **Listas virtualizadas**: `SectionList` con ventana acotada (`windowSize`, `maxToRenderPerBatch`, `removeClippedSubviews`), filas y gráficos memorizados.
- **Glassmorphism**: las capas del cristal están memorizadas y el brillo se cachea en la GPU (`renderToHardwareTextureAndroid`). El blur de Android usa `downsampleFactor`. Las manchas del fondo se rasterizan una vez y solo se anima su transformación con el driver nativo.
- **Modo ahorro de batería** (Ajustes, o automático si el sistema pide reducir movimiento): sin blur y con el fondo y el pulso del botón + detenidos. El fondo también se pausa con la app en segundo plano.
- **Inserción masiva** en una sola transacción SQL, usada por los datos de ejemplo.

## Privacidad y seguridad implementadas

- Sin cuentas ni servidores: el usuario y la contraseña se crean y se comprueban dentro del teléfono; los datos viven en SQLite dentro del almacenamiento privado de la app.
- **Acceso con usuario y contraseña**:
  - La contraseña se guarda derivada con PBKDF2-HMAC-SHA256 (210.000 iteraciones y sal aleatoria por usuario), nunca en texto, y se compara en tiempo constante.
  - La app se bloquea al abrirse y al volver del segundo plano después del tiempo elegido en Ajustes (al instante, 1 o 5 minutos).
  - Tras 5 intentos fallidos hay una espera que se duplica hasta 15 minutos. El contador vive en la base, así que reiniciar la app no la salta.
  - Nadie puede restablecer la contraseña: sin servidor, la única salida es borrar los datos y restaurar un respaldo. La pantalla de bloqueo lo dice antes de borrar nada.
  - El bloqueo controla el acceso a la app; la base en sí no está cifrada en reposo.
- **Respaldo cifrado en la nube del usuario**:
  - La base completa se cifra con AES-256-GCM y una clave derivada de la contraseña del usuario (PBKDF2-HMAC-SHA256, 600.000 iteraciones). El encabezado va autenticado.
  - El archivo `.mmbackup` se guarda donde el usuario elija (Drive, OneDrive, Dropbox) con el selector de documentos del sistema.
  - La restauración valida el archivo completo antes de reemplazar los datos, en una sola transacción.
- `allowBackup=false` y reglas de extracción que excluyen base de datos, preferencias y archivos de los respaldos automáticos de Android.
- `network_security_config`: solo HTTPS con CA del sistema; texto plano permitido únicamente hacia `localhost` y `10.0.2.2` (desarrollo).
- `FLAG_SECURE` desactivado por defecto (se puede activar en Ajustes → Privacidad): bloquea capturas y oculta la app en recientes.
- **Alertas bancarias**:
  - SMS y notificaciones se analizan en el dispositivo y solo se guardan monto, comercio y fecha, como pendientes de confirmar.
  - Se ignoran compras rechazadas, recordatorios de pago, promociones y códigos de verificación.
  - Los avisos repetidos se deduplican por huella del mensaje y por ventana de 10 minutos, porque un mismo movimiento suele llegar por SMS y por notificación.
- El copiloto no envía nada: responde con cálculos locales.
- **Fotos de recibo**: se copian a la carpeta privada de la app (`files/receipts`), sin cifrar, igual que la base. **No se incluyen en el respaldo cifrado**: al restaurar en otro teléfono los movimientos llegan sin foto. Se borran con el borrado total; las de movimientos eliminados se limpian la próxima vez que se abre la app (así se puede deshacer el borrado).

## Pendiente / limitaciones conocidas

- **Probado en emulador (Pixel, Android 14)**: onboarding, datos de ejemplo, Centro de mando, Movimientos, Analítica, Metas, captura por texto contra el backend (modo reglas) y guardado del movimiento.
  - Migración de la base v3 → v4 (26 de octubre de 2026): probada con datos de ejemplo y filas inválidas, y con una base real con contraseña, que se conservó.
  - Migración v4 → v5 (26 de octubre de 2026): probada con metas de ejemplo y con la base real.
    - Las metas pasan su ahorro a "saldo inicial".
    - Probados en pantalla: aportes rápidos, ajustes a mano y la insignia "Meta cumplida", que sigue desbloqueada después de bajar el ahorro.
  - Tres fallos solo aparecieron en el dispositivo y ya están corregidos: faltaba el permiso `VIBRATE`, `ContentValues.valueSet()` no admite `toArray()` en Android, y RN 0.87 eliminó `StyleSheet.absoluteFillObject`.
  - Versión sin IA (10 de noviembre de 2026): copiloto de preguntas fijas, formulario con dictado y foto de recibo.
  - Aún sin probar en un teléfono físico: dictado por voz, cámara, lectura real de SMS y notificaciones, y respaldo cifrado con el selector de archivos.
- **Backend**: la app entregada no lo usa. Su imagen Docker no se ha construido (Docker no está instalado en este equipo).
- **Google Play y SMS**: `RECEIVE_SMS` es un permiso restringido; Play solo lo aprueba para ciertas categorías de apps. Para publicar, la vía más segura es el lector de notificaciones y dejar SMS para distribución fuera de Play.
- **Cifrado en reposo**: la base SQLite local no está cifrada; los respaldos exportados sí. Se recomienda SQLCipher con la clave en Android Keystore.
- **Sincronización automática**: no existe. El respaldo en la nube es manual (crear y restaurar).
- **iOS**: la UI funciona, pero no hay módulo nativo. Usa un almacén en memoria, y el dictado, la lectura de alertas y los respaldos no están disponibles.
- **Tipografía**: se usa la fuente del sistema; para una geométrica (Outfit, Manrope) enlázala con `react-native-asset` y ajústala en `src/theme.js`.
- La moneda por defecto es COP; cámbiala en `src/config.js`.
- Las insignias "Escriba IA" (10 registros por voz o texto) y "Cazarrecibos" (5 recibos) conservan el nombre que tienen en la base: ahora cuentan registros dictados y movimientos con foto de recibo.
