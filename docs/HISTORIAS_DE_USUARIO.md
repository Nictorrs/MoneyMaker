# Historias de Usuario · MoneyMaker 2.0

> Documento de producto e ingeniería. Cada historia describe **solo comportamiento ya implementado** en la app (`mobile/`, `database/`). Los textos entre comillas son los textos reales de la interfaz. Lo que existe en la visión del producto pero no en el código se lista en la sección final [Brechas conocidas](#brechas-conocidas-no-son-historias).
>
> **Versión sin IA (10 de noviembre de 2026):** la app ya no usa el backend. El registro por texto libre, el OCR de recibos, el chat abierto del Copilot y el envío de correcciones se retiraron. En su lugar: dictado literal de la descripción (HU-05), foto del recibo como evidencia (HU-06) y Copiloto con preguntas fijas calculadas en el teléfono (HU-12). El backend sigue en `backend/`, pero ninguna historia depende de él.

**Plataforma de referencia:** Android (React Native 0.87 + módulo nativo Java `com.moneymaker.finance`). **Backend:** no lo usa la app. **Datos:** SQLite local, esquema v5 (`database/esquema.sql`), y fotos de recibo en el almacenamiento privado de la app.

## Índice

| ID | Historia | Épica / Módulo |
|---|---|---|
| [HU-01](#hu-01---crear-el-acceso-local-durante-la-bienvenida) | Crear el acceso local durante la bienvenida | Onboarding |
| [HU-02](#hu-02---definir-moneda-presupuesto-y-registro-automático-al-terminar-la-bienvenida) | Definir moneda, presupuesto y registro automático | Onboarding |
| [HU-03](#hu-03---desbloquear-la-app-con-usuario-y-contraseña) | Desbloquear la app con usuario y contraseña | Seguridad y acceso |
| [HU-04](#hu-04---administrar-el-acceso-desde-ajustes) | Administrar el acceso desde Ajustes | Seguridad y acceso |
| [HU-05](#hu-05---registrar-un-movimiento-con-el-formulario-y-dictar-la-descripción) | Registrar con el formulario y dictar la descripción | Captura rápida |
| [HU-06](#hu-06---adjuntar-la-foto-del-recibo-como-evidencia) | Adjuntar la foto del recibo como evidencia | Captura rápida |
| [HU-07](#hu-07---revisar-y-confirmar-las-alertas-bancarias-confirmación-de-transacción) | Confirmación de transacción y aprendizaje de categorías | Registro automático |
| [HU-08](#hu-08---convertir-alertas-bancarias-en-movimientos-por-confirmar) | Convertir alertas bancarias en movimientos por confirmar | Registro automático |
| [HU-09](#hu-09---gestionar-movimientos-crear-editar-eliminar-y-filtrar) | Gestionar movimientos | Gestor de transacciones |
| [HU-10](#hu-10---ver-el-centro-de-mando-y-ajustar-el-presupuesto) | Ver el Centro de mando y ajustar el presupuesto | Centro de mando |
| [HU-11](#hu-11---recibir-alertas-predictivas-del-copilot) | Recibir alertas predictivas del Copilot | Copiloto financiero |
| [HU-12](#hu-12---consultar-el-copiloto-con-preguntas-fijas) | Consultar el Copiloto con preguntas fijas | Copiloto financiero |
| [HU-13](#hu-13---comparar-dos-meses-en-analítica) | Comparar dos meses en Analítica | Analítica |
| [HU-14](#hu-14---crear-metas-de-ahorro-y-registrar-aportes) | Crear metas de ahorro y registrar aportes | Metas y gamificación |
| [HU-15](#hu-15---seguir-rachas-y-ganar-insignias) | Seguir rachas y ganar insignias | Metas y gamificación |
| [HU-16](#hu-16---crear-y-restaurar-un-respaldo-cifrado-en-mi-nube) | Crear y restaurar un respaldo cifrado | Respaldo y portabilidad |
| [HU-17](#hu-17---configurar-privacidad-categorías-aprendidas-rendimiento-y-borrado-total) | Privacidad, categorías aprendidas, rendimiento y borrado total | Ajustes y privacidad |

## Convenciones transversales

Aplican a todas las historias y no se repiten en cada una:

- **Idioma:** toda la interfaz está en español.
- **Diseño:** glassmorphism (`components/Glass.js`, `MeshBackground.js`) sobre fondo `colors.night` con manchas de gradiente animadas. Verde neón (`colors.neonGreen`) para ingresos, rojo suave (`colors.softRed`) para gastos y saldos negativos, ámbar (`colors.amber`) para avisos.
- **Botones (`GlassButton`):** estado `loading` muestra un indicador y bloquea `onPress`; estado `disabled` baja la opacidad a 0,45 y no responde.
- **Tarjetas presionables (`GlassCard` con `onPress`):** se escalan a 0,975 con resorte nativo, muestran un brillo de presión y emiten `haptic()` (vibración de 10 ms; `success` = patrón `[0, 12, 60, 18]`).
- **Hojas (`Sheet`):** aparecen con `Animated.timing` y un velo (`scrim`) que se desvanece.
- **Toast:** aviso flotante superior que dura 4,5 s (`TOAST_MS`) y puede incluir "Deshacer".
- **Animaciones:** todas con `useNativeDriver: true`. El modo de efectos reducidos (ajuste propio o "reducir movimiento" del sistema) quita el blur y detiene el fondo y el pulso del botón +.
- **Estado global:** `FinanceContext` (snapshot + consultas cacheadas invalidadas por `dataVersion`) y `AuthContext` (bloqueo).
- **Persistencia:** `services/storage.js` → `NativeModules.MoneyMaker` → `FinanceDatabase` (SQLite). En iOS y en pruebas se usa un almacén en memoria con la misma API.
- **Red:** la app no llama a ningún servidor. Solo el reconocedor de voz del sistema puede usar internet en algunos teléfonos.

## Definition of Done común

Toda historia, además de su DoD específico, cumple:

- [ ] `npm test` (Jest, `mobile/__tests__/logic.test.js`) en verde.
- [ ] `gradlew testDebugUnitTest` en verde cuando toca Java (`BankMessageParserTest`, `BackupCipherTest`, `PasswordVaultTest`, `SqlScriptTest`).
- [ ] `python database/construir.py` en verde cuando toca `database/` (esquema, migraciones v3/v4 → v5, restauración).
- [ ] Bundle de Metro y `gradlew assembleDebug` compilan.
- [ ] Verificada en el emulador `Vida_Pixel` cuando toca el módulo nativo (los stubs de `android.jar` en JVM no reproducen el comportamiento de Android, p. ej. `ContentValues`).
- [ ] Textos nuevos en español y alineados con el manual de usuario.
- [ ] Ninguna afirmación de privacidad en la UI que no esté implementada.

---

## HU-01 - Crear el acceso local durante la bienvenida

**Épica / Módulo:** Onboarding (`screens/WelcomeScreen.js`, pasos 0 y 1)

### 1. Descripción de la Historia

* **Como** persona que abre MoneyMaker por primera vez
* **Quiero** conocer las garantías de privacidad y crear un usuario y una contraseña que solo existan en mi teléfono
* **Para** proteger mis finanzas de quien tome mi teléfono sin depender de una cuenta en la nube

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Ver las garantías antes de continuar**
   * **Dado que** la app no tiene el ajuste `onboarded = true` y no hay credenciales en la tabla `auth`
   * **Cuando** abro la app
   * **Entonces** veo el logo, "MoneyMaker", el lema, los tres pilares ("Local-first, sin registro", "Todo se calcula en tu teléfono", "Tu nube, tus reglas"), la tarjeta "Estándares de protección" con sus 7 compromisos y el botón "Continuar"

* **Escenario: Crear el acceso con datos válidos**
   * **Dado que** estoy en el paso "Crea tu acceso"
   * **Cuando** escribo un usuario de 3 a 32 caracteres sin espacios, una contraseña válida, la repito igual y toco "Crear acceso"
   * **Entonces** el módulo nativo guarda el usuario y la contraseña derivada con PBKDF2 en la tabla `auth`, los campos de contraseña se vacían y paso al paso "Tu punto de partida"

* **Escenario: Usuario inválido**
   * **Dado que** estoy en el paso "Crea tu acceso"
   * **Cuando** el usuario tiene menos de 3 caracteres, más de 32 o contiene espacios
   * **Entonces** veo, respectivamente, "El usuario necesita al menos 3 caracteres.", "El usuario no puede pasar de 32 caracteres." o "El usuario no puede llevar espacios." y no se guarda nada

* **Escenario: Contraseña inválida**
   * **Dado que** el usuario es válido
   * **Cuando** la contraseña tiene menos de 8 o más de 128 caracteres, es igual al usuario o está en la lista de contraseñas comunes (`12345678`, `password`, `moneymaker`, etc.)
   * **Entonces** veo el mensaje correspondiente ("La contraseña necesita al menos 8 caracteres.", "La contraseña no puede pasar de 128 caracteres.", "La contraseña no puede ser igual al usuario." o "Esa contraseña es de las más usadas del mundo. Elige otra.") y no se guarda nada

* **Escenario: Las contraseñas no coinciden**
   * **Dado que** usuario y contraseña son válidos
   * **Cuando** "Repite la contraseña" no es igual a "Contraseña"
   * **Entonces** veo "Las contraseñas no coinciden."

* **Escenario: Error del módulo nativo**
   * **Dado que** las validaciones de la interfaz pasan
   * **Cuando** `store.setCredentials` lanza un error (p. ej. `IllegalArgumentException: motivo`)
   * **Entonces** veo solo el motivo, sin el prefijo de la excepción (`authErrorMessage`), y sigo en el mismo paso

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Indicador de pasos: puntos de 6 px; el activo se alarga a 22 px en `colors.cyan`.
* Entrada escalonada `FadeIn` (opacidad 0 → 1 y desplazamiento 18 → 0 px, 520 ms) con retardo de 120 ms por pilar y 520 ms para los estándares.
* Campos de contraseña con `secureTextEntry` y botón de ojo que alterna mostrar/ocultar en ambos campos a la vez.
* Debajo de los campos aparece "Fuerza de la contraseña: …" (muy corta, débil, aceptable, buena, fuerte). Es una pista: nunca bloquea el guardado.
* El error se muestra en `colors.softRed` y se borra en cuanto el usuario edita cualquier campo.
* "Crear acceso" muestra `loading` mientras el módulo nativo deriva la contraseña.

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** estado local del paso (`step`), del formulario (`access`) y del error (`accessError`). Validación en `lib/auth.js` (`validateUsername`, `validatePassword`, `passwordStrength`). `AuthContext.saveCredentials` llama a `store.setCredentials` y deja `locked = false`.
* **Backend / Datos:** sin backend. `PasswordVault.java` deriva con PBKDF2-HMAC-SHA256, 210.000 iteraciones, sal aleatoria, codificación hex. Fila única en la tabla `auth` (esquema v3+). El `char[]` vacío se rechaza antes de `HmacSHA256`.

### 5. Casos Extremos (Edge Cases)

* **Sin conectividad:** no aplica; todo ocurre en el dispositivo.
* **Doble toque en "Crear acceso":** el botón en `loading` ignora `onPress` mientras dura la operación.
* **Usuario con espacios al inicio o al final:** se recorta (`trim`) antes de validar y guardar.
* **App cerrada tras crear el acceso y antes de terminar la bienvenida:** las credenciales ya existen; al volver a abrir se pide la contraseña (`LockScreen`) y luego se retoma la bienvenida porque `onboarded` sigue en `false`.
* **iOS:** el almacén en memoria acepta las credenciales, pero no persisten al cerrar la app.

### 6. Definition of Done (DoD)

* [ ] `PasswordVaultTest` cubre derivación con sal por hash, verificación y rechazo de usuario o contraseña inutilizables.
* [ ] Pruebas Jest de `validateUsername`, `validatePassword` y `passwordStrength` con los límites 3/32 y 8/128.
* [ ] Verificado en emulador: crear acceso y reabrir la app pide la contraseña.

---

## HU-02 - Definir moneda, presupuesto y registro automático al terminar la bienvenida

**Épica / Módulo:** Onboarding (`screens/WelcomeScreen.js`, pasos 2 y 3)

### 1. Descripción de la Historia

* **Como** persona que acaba de crear su acceso
* **Quiero** elegir mi moneda, fijar mi presupuesto mensual de gastos y, en Android, activar la lectura de alertas bancarias, o explorar con datos de ejemplo
* **Para** que el Copilot pueda proyectar sobregiros desde el primer día y yo pueda probar la app sin cargar datos reales

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Guardar moneda y presupuesto (Android)**
   * **Dado que** estoy en "Tu punto de partida" en Android
   * **Cuando** elijo una moneda (COP, USD, EUR o MXN), escribo "2.500.000" en "Presupuesto de gastos del mes" y toco "Continuar"
   * **Entonces** paso al paso "Registro automático" con la tarjeta `AutomationCard`

* **Escenario: Terminar sin datos de ejemplo**
   * **Dado que** estoy en "Registro automático"
   * **Cuando** toco "Empezar"
   * **Entonces** se guardan los ajustes `currency` y `budget`, luego `onboarded = true`, y entro al Centro de mando

* **Escenario: Plataforma sin automatización**
   * **Dado que** `automationSupported` es `false`
   * **Cuando** toco "Continuar" en "Tu punto de partida"
   * **Entonces** la bienvenida termina directamente, sin mostrar el paso "Registro automático"

* **Escenario: Explorar con datos de ejemplo**
   * **Dado que** estoy en "Tu punto de partida" o en "Registro automático"
   * **Cuando** toco "Explorar con datos de ejemplo" o "Empezar con datos de ejemplo"
   * **Entonces** se insertan en una sola transacción SQL cinco meses de movimientos de muestra, metas y un presupuesto de ejemplo (`buildDemoData`), se recarga el estado y entro al Centro de mando

* **Escenario: Presupuesto vacío o no numérico**
   * **Dado que** dejo vacío el presupuesto o escribo texto sin dígitos
   * **Cuando** termino la bienvenida
   * **Entonces** el presupuesto se guarda como 0 y el anillo del Centro de mando muestra "Definir presupuesto"

* **Escenario: Falla al guardar la configuración**
   * **Dado que** la escritura de ajustes o la carga de datos de ejemplo falla
   * **Cuando** termino la bienvenida
   * **Entonces** veo "No se pudo completar la configuración: <motivo>" y sigo en el mismo paso

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Moneda con control segmentado (`Segmented`); presupuesto con teclado `decimal-pad` y texto de 24 pt en negrita.
* "Continuar" es el botón primario; las opciones de datos de ejemplo usan el estilo cristal con ícono `sparkles`.
* El botón de datos de ejemplo muestra `loading` mientras se insertan los registros.
* Las filas de `AutomationCard` se describen en [HU-08](#hu-08---convertir-alertas-bancarias-en-movimientos-por-confirmar).

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** `finish(demo)` → `updateSettings({ currency, budget })` → `loadDemoData()` (opcional) → `updateSettings({ onboarded: true })`. `parseAmountInput` acepta separadores es-CO ("2.500.000", "12,5").
* **Backend / Datos:** tabla de ajustes clave-valor (`setSetting`); `bulkInsertTransactions` inserta en una sola transacción. Cambiar `currency` invalida el snapshot.

### 5. Casos Extremos (Edge Cases)

* **Cierre de la app a mitad del proceso:** como `onboarded` se escribe al final, la bienvenida vuelve a mostrarse al reabrir.
* **Permisos denegados en el paso 4:** la bienvenida puede terminar igual; la tarjeta mostrará el estado real al volver.
* **Moneda por defecto:** COP (`DEFAULT_CURRENCY`), preseleccionada.

### 6. Definition of Done (DoD)

* [ ] Prueba Jest de `parseAmountInput` con "2.500.000", "12,5" y texto vacío.
* [ ] Verificado en emulador: onboarding completo con y sin datos de ejemplo.

---

## HU-03 - Desbloquear la app con usuario y contraseña

**Épica / Módulo:** Seguridad y acceso (`screens/LockScreen.js`, `state/AuthContext.js`)

### 1. Descripción de la Historia

* **Como** usuaria o usuario con acceso local configurado
* **Quiero** entrar con mi usuario y contraseña, con una pausa creciente ante intentos fallidos y una salida clara si la olvido
* **Para** que nadie más vea mis finanzas, sin que exista una forma remota de saltarse el bloqueo

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Desbloqueo correcto**
   * **Dado que** `auth.configured` es `true` y la app está bloqueada
   * **Cuando** escribo el usuario y la contraseña correctos y toco "Entrar" (o "ir" en el teclado)
   * **Entonces** el módulo nativo verifica en tiempo constante, se reinicia el contador de intentos, se vacía el campo de contraseña y veo la app

* **Escenario: Credenciales incorrectas**
   * **Dado que** la app está bloqueada
   * **Cuando** la verificación falla
   * **Entonces** veo "Usuario o contraseña incorrectos.", el teléfono vibra, la contraseña se borra, el foco vuelve a ese campo y aparece "Te quedan N intentos antes de una pausa."

* **Escenario: Pausa tras 5 intentos fallidos**
   * **Dado que** acumulo 5 intentos fallidos
   * **Cuando** vuelvo a la pantalla de bloqueo
   * **Entonces** veo "Demasiados intentos. Vuelve a intentarlo en 30 s.", el botón dice "Espera un momento" y está deshabilitado; el contador se actualiza cada segundo

* **Escenario: La pausa se duplica**
   * **Dado que** ya hubo una pausa
   * **Cuando** fallo de nuevo
   * **Entonces** la espera se duplica (30 s, 60 s, 120 s…) hasta un máximo de 15 min

* **Escenario: Reiniciar la app no salta la pausa**
   * **Dado que** hay una pausa activa
   * **Cuando** cierro y reabro la app
   * **Entonces** la pausa sigue, porque `failedAttempts` y `lockedUntil` viven en la base

* **Escenario: Bloqueo al volver del segundo plano**
   * **Dado que** el tiempo de rebloqueo es 1 min (valor por defecto)
   * **Cuando** la app pasa a segundo plano 1 min o más y vuelve a primer plano
   * **Entonces** se muestra `LockScreen`; si estuvo menos tiempo, no

* **Escenario: Olvidé mi contraseña**
   * **Dado que** estoy en la pantalla de bloqueo
   * **Cuando** toco "Olvidé mi contraseña"
   * **Entonces** veo el aviso "¿Olvidaste tu contraseña?" que explica que no hay recuperación, con "Volver" y "Borrar y empezar de nuevo"

* **Escenario: Confirmar borrado por olvido**
   * **Dado que** veo ese aviso
   * **Cuando** toco "Borrar y empezar de nuevo"
   * **Entonces** se borran todos los datos y las credenciales (`wipeAllData`), se refresca el estado de acceso y vuelvo a la bienvenida

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Saludo personalizado "Hola de nuevo, <usuario>." si hay usuario guardado; si no, "Ingresa para ver tus finanzas.". El campo usuario viene prellenado.
* "Entrar" se deshabilita si el usuario está vacío, la contraseña está vacía o hay pausa activa; muestra `loading` durante la verificación.
* Íconos del aviso: `alert` para error y `clock` para pausa, ambos en `colors.softRed`; la pista de intentos restantes va en estilo `caption` neutro.
* "Olvidé mi contraseña" como enlace en `colors.cyan`. Pie: "Tu contraseña se comprueba dentro del teléfono…".
* El botón destructivo del aviso usa `style: 'destructive'`.
* `KeyboardAvoidingView` en iOS; "siguiente" en el teclado del usuario lleva el foco a la contraseña.

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** `AuthContext.unlock` → `store.verifyPassword`; actualiza `failedAttempts` y `lockedUntil`. `lib/auth.js` replica la política de `PasswordVault.lockMillis` (`ATTEMPTS_BEFORE_LOCK = 5`, `FIRST_LOCK_MS = 30 000`, `MAX_LOCK_MS = 900 000`). `AppState` mide el tiempo fuera de pantalla contra `lockDelay`.
* **Backend / Datos:** tabla `auth` con hash, sal, contador de intentos y `lockedUntil`. El borrado total elimina también `auth`.

### 5. Casos Extremos (Edge Cases)

* **Error inesperado del puente nativo:** el mensaje se muestra tal cual en el aviso de error.
* **Reloj del sistema cambiado:** la pausa se calcula con `Date.now()` contra `lockedUntil` guardado.
* **Envío repetido:** `submit` sale si `busy` o hay pausa activa.
* **Respaldo restaurado:** conserva las credenciales actuales (ver [HU-16](#hu-16---crear-y-restaurar-un-respaldo-cifrado-en-mi-nube)).

### 6. Definition of Done (DoD)

* [ ] Pruebas de `lockMillisFor`, `attemptsLeft` y `lockMessage` alineadas con `PasswordVault.lockMillis`.
* [ ] `PasswordVaultTest` cubre la espera creciente; Jest cubre bloqueo y desbloqueo con el almacén en memoria.
* [ ] Verificado en emulador: pausa tras 5 fallos y "Borrar y empezar de nuevo".

---

## HU-04 - Administrar el acceso desde Ajustes

**Épica / Módulo:** Seguridad y acceso (`components/AccessSettings.js`, sección "Acceso" de `SettingsSheet`)

### 1. Descripción de la Historia

* **Como** usuaria o usuario de MoneyMaker
* **Quiero** cambiar mi contraseña, elegir cuándo se vuelve a pedir, quitar el bloqueo o activarlo si no lo tengo
* **Para** ajustar el nivel de protección a mi forma de usar el teléfono

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Cambiar la contraseña**
   * **Dado que** el acceso está configurado
   * **Cuando** toco "Cambiar contraseña", escribo la "Contraseña actual" correcta, una "Contraseña nueva" válida, la repito y toco "Guardar"
   * **Entonces** se actualiza la contraseña derivada, el formulario se cierra y veo "Contraseña actualizada."

* **Escenario: Contraseña actual incorrecta**
   * **Dado que** estoy cambiando la contraseña
   * **Cuando** la contraseña actual no coincide
   * **Entonces** veo el error que devuelve el módulo nativo y la contraseña no cambia

* **Escenario: Elegir el tiempo de rebloqueo**
   * **Dado que** el acceso está configurado
   * **Cuando** elijo "Al instante", "1 min" o "5 min" en "Volver a pedirla después de"
   * **Entonces** se guarda el ajuste `lockDelay` (0, 60 000 o 300 000 ms) y se aplica en el siguiente regreso del segundo plano

* **Escenario: Quitar el bloqueo**
   * **Dado que** el acceso está configurado
   * **Cuando** toco "Quitar bloqueo", escribo mi contraseña actual, toco "Quitar bloqueo" y confirmo "Quitar" en el aviso
   * **Entonces** se eliminan las credenciales sin tocar mis datos y veo "La app ya no pide contraseña."

* **Escenario: Activar el bloqueo**
   * **Dado que** no hay acceso configurado
   * **Cuando** toco "Activar el bloqueo", completo usuario y contraseña válidos y toco "Guardar"
   * **Entonces** se crean las credenciales y veo "Bloqueo activado."

* **Escenario: Cancelar**
   * **Dado que** tengo abierto cualquiera de los formularios
   * **Cuando** toco "Cancelar"
   * **Entonces** el formulario se cierra y se limpian los campos

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Con acceso configurado se muestra "Usuario" con su valor y el texto "La app pide la contraseña al abrirse y al volver desde otras apps.". Sin acceso, una advertencia sobre el riesgo y la imposibilidad de recuperarla.
* "Quitar bloqueo" (en el formulario) está deshabilitado mientras la contraseña actual esté vacía.
* El aviso usa ícono `check` en verde para éxito y `alert` en rojo para error; se borra al editar un campo.
* Indicador de fuerza visible al crear o cambiar, oculto al quitar.

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** estado local `mode` (`create` | `change` | `remove` | `null`). Usa `saveCredentials` (con `currentPassword` al cambiar), `removeCredentials` y `setLockDelay` de `AuthContext`.
* **Backend / Datos:** `store.setCredentials`, `store.clearCredentials` y `store.setSetting('lockDelay')`; todo local.

### 5. Casos Extremos (Edge Cases)

* **Contraseña nueva igual al usuario guardado:** se rechaza con "La contraseña no puede ser igual al usuario.".
* **Doble toque en "Guardar":** el botón en `loading` no repite la operación.
* **Quitar el bloqueo con contraseña incorrecta:** el error nativo se muestra y el bloqueo sigue activo.

### 6. Definition of Done (DoD)

* [ ] Jest ("changing or removing the password needs the current one") cubre que cambiar o quitar la contraseña exige la actual.
* [ ] Verificado en emulador: cambiar, quitar y volver a activar el bloqueo.

---

## HU-05 - Registrar un movimiento con el formulario y dictar la descripción

**Épica / Módulo:** Captura rápida (`sheets/TransactionSheet.js`, `BottomNav.js`, `services/device.js`)

### 1. Descripción de la Historia

* **Como** persona que quiere registrar un gasto o ingreso rápido
* **Quiero** abrir el formulario con un toque y poder dictar la descripción en vez de escribirla
* **Para** registrar en segundos sin depender de internet ni de un servidor

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Abrir el formulario**
   * **Dado que** estoy en cualquier pestaña
   * **Cuando** toco el botón flotante + o "Escribir" en el Centro de mando
   * **Entonces** se abre "Nuevo movimiento" con Gasto/Ingreso, Monto, Descripción, Comercio (opcional), Categoría, Fecha y Foto del recibo (opcional)

* **Escenario: Dictar la descripción**
   * **Dado que** el dispositivo soporta voz (`voiceSupported`)
   * **Cuando** toco el micrófono del campo Descripción
   * **Entonces** veo "Te escucho… se escribirá tal cual lo digas.", la transcripción parcial aparece en el campo y, al terminar, queda el texto literal

* **Escenario: El dictado no interpreta**
   * **Dado que** dicté "almuerzo veinticinco mil en Crepes"
   * **Cuando** termina el dictado
   * **Entonces** la descripción contiene esa frase tal cual; el monto, la categoría y la fecha no cambian y los lleno yo

* **Escenario: Abrir dictando**
   * **Dado que** el dispositivo soporta voz
   * **Cuando** mantengo presionado + o toco "Dictar" en el Centro de mando
   * **Entonces** se abre "Nuevo movimiento" con el dictado ya activo

* **Escenario: Detener el dictado**
   * **Dado que** estoy dictando
   * **Cuando** toco el micrófono activo
   * **Entonces** se detiene la escucha y queda lo transcrito hasta ese momento

* **Escenario: Sin voz disponible**
   * **Dado que** `voiceSupported` es `false`
   * **Cuando** mantengo presionado +
   * **Entonces** se abre el formulario normal y no se muestra el micrófono

* **Escenario: Guardar**
   * **Dado que** los campos son válidos
   * **Cuando** toco "Guardar"
   * **Entonces** el movimiento se guarda confirmado con origen "Voz" si usé el dictado, "Recibo" si adjunté foto ([HU-06](#hu-06---adjuntar-la-foto-del-recibo-como-evidencia)) o "Manual" en otro caso

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Botón + con pulso continuo (escala 1 → 1,7 y opacidad 0,55 → 0 en 2,2 s) que se detiene con efectos reducidos; al presionar se escala a 0,92 con brillo y vibra.
* Descripción multilínea de hasta 120 caracteres; no editable mientras se escucha. Placeholder "Almuerzo (o toca el micrófono y dicta)".
* Micrófono circular de 40 px; activo se pinta en `colors.neonGreen`. Al terminar el dictado, `haptic('success')`.

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** `services/device.listen({ onPartial })` con `SPEECH_LOCALE = 'es-CO'` (`SpeechRecognizer` de Android en el módulo nativo). El texto se recorta a 120 caracteres. `autoStart = 'voice'` arranca el dictado al abrir. Al cerrar la hoja se llama `stopListening()` y se ignoran resultados tardíos.
* **Datos:** `saveTransaction` → `store.upsertTransaction` con `source` `voice`, `receipt` o `manual`. No hay llamadas de red.

### 5. Casos Extremos (Edge Cases)

* **Sin permiso de micrófono:** "Necesito permiso de micrófono para dictar.".
* **Silencio:** "No escuché nada. Toca el micrófono e intenta de nuevo.".
* **No se entendió:** "No te entendí bien. Intenta de nuevo.".
* **Reconocedor no disponible (o sin internet en teléfonos que reconocen en línea):** "El dictado no está disponible ahora."; se puede escribir a mano.

### 6. Definition of Done (DoD)

* [ ] Verificado en emulador: formulario, guardado y origen.
* [ ] **Pendiente:** verificar el dictado por voz en un teléfono físico.

---

## HU-06 - Adjuntar la foto del recibo como evidencia

**Épica / Módulo:** Captura rápida (`sheets/TransactionSheet.js`, `ReceiptStore.java`)

### 1. Descripción de la Historia

* **Como** persona que recibe recibos en papel
* **Quiero** tomar o elegir una foto del recibo y dejarla guardada con el movimiento
* **Para** tener evidencia de lo que gasté

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Abrir con la cámara**
   * **Dado que** estoy en el Centro de mando
   * **Cuando** toco "Recibo"
   * **Entonces** se abre "Nuevo movimiento" y se lanza la cámara

* **Escenario: Adjuntar desde el formulario**
   * **Dado que** estoy en "Nuevo movimiento" o "Editar movimiento"
   * **Cuando** toco "Cámara" o "Galería" en "Foto del recibo (opcional)"
   * **Entonces** veo la miniatura de la foto con los botones "Cambiar" y "Quitar"

* **Escenario: La foto no se interpreta**
   * **Dado que** adjunté una foto
   * **Cuando** veo el formulario
   * **Entonces** monto, descripción, comercio, categoría y fecha siguen como estaban: los lleno yo

* **Escenario: Ver la evidencia**
   * **Dado que** un movimiento tiene foto
   * **Cuando** lo abro para editar y toco la miniatura
   * **Entonces** la foto se ve a pantalla completa; al tocarla se cierra

* **Escenario: Quitar o cambiar la foto**
   * **Dado que** un movimiento tiene foto
   * **Cuando** toco "Quitar" (o "Cambiar") y luego "Guardar"
   * **Entonces** la foto se borra (o se reemplaza); si cierro sin guardar, no cambia nada

* **Escenario: Cancelar la cámara**
   * **Dado que** se abrió la cámara o la galería
   * **Cuando** cancelo
   * **Entonces** vuelvo al formulario sin error

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Miniatura de 96 × 96 px con bordes `radii.md`. Visor a pantalla completa sobre fondo negro al 92 % con "Toca para cerrar".
* Texto fijo bajo la sección: "Se guarda como evidencia en este teléfono. No se incluye en el respaldo cifrado.".

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** `react-native-image-picker` con `maxWidth/maxHeight 1600`, `quality 0.8`, `saveToPhotos: false`, sin base64. La foto se guarda después del movimiento, con el id que devolvió la base.
* **Nativo / Datos:** `ReceiptStore.java` copia la imagen a `files/receipts/<id>-<marca de tiempo>.jpg` en el almacenamiento privado de la app (sin cifrar) y borra las anteriores de ese movimiento. `MoneyMaker.saveReceipt`, `getReceipt`, `deleteReceipt` y `pruneReceipts`. No hay columna en la base ni cambio de esquema.

### 5. Casos Extremos (Edge Cases)

* **Error al abrir la cámara:** se muestra `errorMessage` o "No se pudo abrir la cámara.".
* **El movimiento se guarda pero la foto no:** aviso "Foto no guardada" y la hoja se cierra para no duplicar el movimiento.
* **Eliminar un movimiento con foto:** la foto se conserva mientras se puede deshacer y se borra la próxima vez que se abre la app.
* **Restaurar un respaldo:** los movimientos llegan sin foto; las fotos que quedaron sin movimiento se borran al recargar.
* **Borrado total:** borra también todas las fotos.

### 6. Definition of Done (DoD)

* [ ] Prueba Jest del almacén en memoria: guardar, limpiar huérfanas y borrado total.
* [ ] Verificado en emulador: adjuntar desde la galería, ver, quitar.
* [ ] **Pendiente:** verificar la cámara en un teléfono físico.

---

## HU-07 - Revisar y confirmar las alertas bancarias (Confirmación de transacción)

**Épica / Módulo:** Registro automático (`sheets/TransactionConfirmSheet.js`, `components/CategoryDropdown.js`, `lib/personalization.js`)

### 1. Descripción de la Historia

* **Como** persona que activó la lectura de alertas bancarias
* **Quiero** revisar y corregir cada dato propuesto antes de guardarlo, y que mis correcciones de categoría se recuerden
* **Para** que ningún dato automático se guarde sin mi aprobación y la app aprenda mi forma de clasificar

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Ver la propuesta**
   * **Dado que** toco una alerta bancaria pendiente
   * **Cuando** se abre "Confirmación de transacción"
   * **Entonces** veo el subtítulo "<origen> · revisa y corrige antes de guardar" (SMS bancario o Notificación bancaria) y, Gasto/Ingreso, Monto (con moneda), Concepto, Fecha, Comercio (opcional) y Categoría

* **Escenario: Confianza baja**
   * **Dado que** un borrador trae `confidence < 0.7`
   * **Cuando** veo su tarjeta
   * **Entonces** aparece "Confianza baja: revisa los datos antes de guardar." en ámbar

* **Escenario: Confirmar y guardar**
   * **Dado que** todos los campos son válidos
   * **Cuando** toco "Confirmar y guardar"
   * **Entonces** cada movimiento se guarda con `status = 'confirmed'`, la hoja se cierra y veo el toast "Movimiento guardado" (o "N movimientos guardados")

* **Escenario: Corregir la categoría**
   * **Dado que** cambio la categoría sugerida en el desplegable
   * **Cuando** confirmo
   * **Entonces** se registra la corrección en `category_feedback` (comercio, concepto, categoría sugerida y final, origen, confianza y día), se recalculan mis preferencias y veo "Guardado · tu corrección ajustará las próximas sugerencias"

* **Escenario: Preferencia aprendida aplicada**
   * **Dado que** corregí antes la categoría de un comercio o concepto
   * **Cuando** una nueva alerta coincide
   * **Entonces** el desplegable propone mi categoría con el origen "aprendida"

* **Escenario: Cambiar el tipo**
   * **Dado que** cambio de Gasto a Ingreso (o al revés)
   * **Cuando** la categoría actual no es válida para el nuevo tipo
   * **Entonces** se reemplaza por una válida (`fitCategory`); un gasto nunca queda en "Salario"

* **Escenario: Validaciones**
   * **Dado que** un campo no es válido
   * **Cuando** toco "Confirmar y guardar"
   * **Entonces** veo, según el caso: "Escribe un monto mayor que cero.", "Agrega un concepto.", "El concepto debe tener palabras, no solo números o símbolos.", "El concepto no puede ser un mismo carácter repetido.", el equivalente para "El comercio" o "La fecha debe tener el formato AAAA-MM-DD."; con varios borradores se añade " (movimiento N)"

* **Escenario: Varios movimientos**
   * **Dado que** hay más de un borrador
   * **Cuando** veo la hoja
   * **Entonces** cada tarjeta dice "Movimiento N de M" y al final aparece "Total: ±<monto>" con signo

* **Escenario: Descartar**
   * **Dado que** la hoja está abierta
   * **Cuando** toco "Descartar" (o "Ahora no" para alertas bancarias)
   * **Entonces** la hoja se cierra y no se guarda nada; un pendiente bancario sigue en "Por confirmar"

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Pie fijo con "Descartar" (flex 1) y "Confirmar y guardar" (primario, flex 1,6) en `loading` mientras guarda.
* Monto de 26 pt en negrita con teclado `decimal-pad`. Concepto y comercio con máximo 60 caracteres.
* Fecha con chips "Hoy" y "Ayer" (activos cuando coinciden) y campo libre "AAAA-MM-DD" de 10 caracteres.
* El desplegable muestra el origen de la sugerencia: lector bancario o aprendida.
* Error en `colors.softRed`, negrita, debajo del formulario.

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** estado local `forms[]` derivado de `payload.drafts` (`toForm`). `FinanceContext.confirmDrafts(entries, capture)` guarda en orden, genera `feedbackRecord` si la categoría cambió, reconstruye `preferences` (últimas 200 correcciones) y luego invalida la caché. Nada sale del teléfono.
* **Backend / Datos:** `store.upsertTransaction` y `store.recordCategoryFeedback`. Esquema v5 con CHECKs y triggers que rechazan categorías incompatibles con el tipo. No se añadió un trigger que rechace feedback con sugerida y final de distinto tipo, porque cambiar el tipo en esta hoja crea esas filas legítimamente.

### 5. Casos Extremos (Edge Cases)

* **Fecha imposible (2026-02-30):** se rechaza porque `toISODate(fromISODate(iso))` no coincide.
* **Falla al guardar a mitad de varios borradores:** los anteriores ya quedaron guardados; se muestra el error y la hoja sigue abierta.
* **Moneda del borrador distinta a la principal:** se conserva la del borrador.
* **Monto con separadores es-CO:** "45.000" → 45000; "12,5" → 12,5.

### 6. Definition of Done (DoD)

* [ ] Pruebas Jest de `toDraft`, `buildPreferences`, `feedbackRecord`, `textFieldError` y `fitCategory`.
* [ ] La prueba Jest que compara categorías de `esquema.sql` con `theme.js` sigue en verde.
* [ ] Verificado en emulador: confirmar, corregir categoría y ver el toast de corrección.

---

## HU-08 - Convertir alertas bancarias en movimientos por confirmar

**Épica / Módulo:** Registro automático (`AutomationCard` en `TransactionsScreen.js`, `BankSmsReceiver`, `BankNotificationListener`, `BankMessageParser`, `TransactionIngestor`)

### 1. Descripción de la Historia

* **Como** persona en Android que recibe alertas de su banco por SMS o notificación
* **Quiero** que esas alertas se analicen dentro del teléfono y queden como movimientos pendientes de confirmar
* **Para** registrar casi todos mis gastos sin abrir la app y sin enviar el texto de mis alertas a internet

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Activar SMS bancarios**
   * **Dado que** estoy en Movimientos (o en el paso 4 de la bienvenida) en Android
   * **Cuando** toco "Activar" en "SMS bancarios" y concedo el permiso
   * **Entonces** la fila queda activa (ícono verde, botón "Desactivar")

* **Escenario: Activar notificaciones sin acceso concedido**
   * **Dado que** activé "Notificaciones" pero Android no concedió el acceso
   * **Cuando** vuelvo a la app
   * **Entonces** la fila dice "Falta conceder el acceso en Ajustes." y el botón dice "Ajustes", que abre la pantalla de permisos

* **Escenario: Detectar un movimiento**
   * **Dado que** una fuente está activa
   * **Cuando** llega una alerta de compra o abono
   * **Entonces** el parser nativo extrae monto, comercio y fecha y crea un movimiento con `status = 'pending'` y su `dedupe_key`; si la app está abierta se invalida el snapshot (`onTransactionDetected`)

* **Escenario: Mensajes que no son movimientos**
   * **Dado que** llega una alerta de compra rechazada, recordatorio de pago, promoción u código de verificación
   * **Cuando** el parser la analiza
   * **Entonces** se ignora y no se crea nada

* **Escenario: Duplicados por SMS y notificación**
   * **Dado que** el mismo movimiento llega por SMS y por notificación
   * **Cuando** se procesan
   * **Entonces** se guarda una sola vez (huella del mensaje y ventana de 10 min)

* **Escenario: Revisar pendientes**
   * **Dado que** hay pendientes
   * **Cuando** entro a Movimientos
   * **Entonces** el filtro inicial es "Por confirmar (N)", cada fila muestra el botón "Confirmar" y en el Centro de mando aparece la alerta "N movimientos por confirmar"; al tocarla voy a Movimientos

* **Escenario: Confirmar un pendiente**
   * **Dado que** toco "Confirmar" en una fila pendiente
   * **Cuando** se abre la Confirmación de transacción (origen SMS o Notificación bancaria, botón "Ahora no")
   * **Entonces** puedo corregir y "Confirmar y guardar", y el movimiento pasa a `confirmed`

* **Escenario: Plataforma sin soporte**
   * **Dado que** no estoy en Android
   * **Cuando** veo la tarjeta
   * **Entonces** dice "La lectura automática de alertas bancarias está disponible en Android."

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Tarjeta "Registro automático" con ícono `bolt` ámbar; filas con ícono de 40 px que se tiñe de verde (`rgba(61,255,162,0.15)`) cuando está activa.
* Nota de privacidad con ícono `shield` cian: "El texto se analiza dentro del teléfono y solo se guardan monto, comercio y fecha, como pendientes de confirmar."
* El estado de la tarjeta se refresca cada vez que la app vuelve a primer plano.
* Botón "Confirmar" de la fila: píldora verde neón con ícono `check`.

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** `services/device` (`getAutomationStatus`, `enableSmsReading`, `enableNotificationReading`, `disableAutomation`). `App.onConfirmPending` arma el borrador con `toDraft(tx, preferences, 'bank-parser')`. `FinanceContext` invalida al volver del segundo plano después de 30 s (`RESUME_REFRESH_MS`).
* **Backend / Datos:** sin backend. `BroadcastReceiver` de SMS y `NotificationListenerService` → `BankMessageParser` (regex de exclusión y categorías por comercio) → `TransactionIngestor` (`DUPLICATE_WINDOW_MS = 600 000`, inserción `pending`). El snapshot pide hasta 20 pendientes.

### 5. Casos Extremos (Edge Cases)

* **App cerrada o en segundo plano:** los receptores nativos guardan igual; el contador se actualiza al volver.
* **Optimización de batería del fabricante:** puede cerrar el servicio; el manual indica excluir la app.
* **Permiso revocado desde Android:** la fila deja de mostrarse activa al volver a la app.
* **Alerta con formato desconocido:** no se crea movimiento.

### 6. Definition of Done (DoD)

* [ ] `BankMessageParserTest` cubre compras, abonos, salario, exclusiones y huella.
* [ ] **Pendiente:** verificar en dispositivo la lectura real de SMS y notificaciones.
* [ ] Nota de publicación: `RECEIVE_SMS` es un permiso restringido en Google Play.

---

## HU-09 - Gestionar movimientos: crear, editar, eliminar y filtrar

**Épica / Módulo:** Gestor de transacciones (`screens/TransactionsScreen.js`, `sheets/TransactionSheet.js`, `components/TransactionRow.js`)

### 1. Descripción de la Historia

* **Como** persona que lleva sus finanzas
* **Quiero** ver todos mis movimientos agrupados por día, filtrarlos, crearlos a mano y editarlos o eliminarlos deslizando
* **Para** mantener mi historial correcto y encontrar cualquier movimiento rápido

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Ver la lista**
   * **Dado que** tengo movimientos
   * **Cuando** abro "Movimientos"
   * **Entonces** veo secciones por día ("Hoy", "Ayer", "12 oct" o "12 oct 2025" si es de otro año) con el neto del día, y cada fila con ícono de categoría, descripción, comercio o categoría, origen (Manual, Texto, Voz, Recibo, SMS, Notificación; "Texto" solo aparece en movimientos antiguos) y monto con signo

* **Escenario: Paginación**
   * **Dado que** hay más de 30 movimientos en el filtro
   * **Cuando** me acerco al final de la lista
   * **Entonces** se pide la siguiente página con cursor (fecha, creación, id) y se muestra un indicador al pie mientras carga

* **Escenario: Filtrar**
   * **Dado que** estoy en Movimientos
   * **Cuando** toco "Todos", "Gastos", "Ingresos" o "Por confirmar"
   * **Entonces** la lista se reinicia con ese filtro

* **Escenario: Lista vacía**
   * **Dado que** no hay movimientos en el filtro
   * **Cuando** termina la carga
   * **Entonces** veo "Aún no hay movimientos aquí." o, en "Por confirmar", "No hay movimientos por confirmar."

* **Escenario: Crear a mano**
   * **Dado que** toco "Nuevo"
   * **Cuando** completo Monto, Descripción, Comercio (opcional), Categoría y Fecha y toco "Guardar"
   * **Entonces** se guarda con origen `manual` y estado `confirmed`

* **Escenario: Editar**
   * **Dado que** toco una fila o deslizo a la izquierda y toco "Editar"
   * **Cuando** cambio campos y toco "Guardar"
   * **Entonces** se actualiza el movimiento conservando su origen y moneda

* **Escenario: Eliminar deslizando con deshacer**
   * **Dado que** deslizo una fila a la izquierda
   * **Cuando** toco "Eliminar"
   * **Entonces** se borra, veo el toast "Movimiento eliminado" con "Deshacer" durante 4,5 s, y "Deshacer" lo vuelve a guardar

* **Escenario: Eliminar desde la hoja de edición**
   * **Dado que** estoy en "Editar movimiento"
   * **Cuando** toco "Eliminar"
   * **Entonces** se borra y la hoja se cierra (sin toast de deshacer)

* **Escenario: Validaciones del formulario manual**
   * **Dado que** un campo no es válido
   * **Cuando** toco "Guardar"
   * **Entonces** veo "Escribe un monto mayor que cero.", "Agrega una descripción corta.", el error de `textFieldError` o "La fecha debe tener el formato AAAA-MM-DD."

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Encabezado "Gestor de transacciones" / "Movimientos" con botón compacto "Nuevo".
* Chips de filtro con color: neutro, rojo, verde y ámbar; "Por confirmar (N)" muestra el conteo.
* Pista: "Desliza un movimiento a la izquierda para editarlo o eliminarlo."
* Deslizar: se activa con desplazamiento horizontal > 10 px y 1,6 veces el vertical; se abre a 148 px con resorte; vibra al abrir; las acciones aparecen con opacidad interpolada. "Editar" en azul y "Eliminar" en rojo, ambos translúcidos.
* Neto del día en verde si es ≥ 0. Montos de fila en 16 pt negrita.
* Título de la hoja: "Nuevo movimiento", "Editar movimiento" o "Confirmar movimiento" (pendiente, con subtítulo "Detectado automáticamente desde una alerta bancaria." y botones "Descartar"/"Confirmar").

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** `SectionList` con `initialNumToRender 12`, `maxToRenderPerBatch 10`, `windowSize 7`, `removeClippedSubviews` en Android y `onEndReachedThreshold 0.6`. `useTransactionPages(filter, 30)` descarta respuestas obsoletas con un id de petición. `TransactionRow` memorizado.
* **Backend / Datos:** `store.listTransactionsPage({ filter, cursor, limit })` con índices; `upsertTransaction` y `deleteTransaction` invalidan la caché (`dataVersion`).

### 5. Casos Extremos (Edge Cases)

* **Cambio de filtro mientras carga una página:** la respuesta vieja se descarta.
* **Escritura en la base mientras se navega:** la lista se recarga desde la primera página.
* **"Deshacer" después de 4,5 s:** el toast ya no está; la eliminación queda.
* **Gesto vertical sobre la fila:** no abre las acciones; la lista se desplaza.

### 6. Definition of Done (DoD)

* [ ] Pruebas de agrupación por día y de `formatDayLabel`.
* [ ] Verificado en emulador: paginación, filtros, deslizar, deshacer.

---

## HU-10 - Ver el Centro de mando y ajustar el presupuesto

**Épica / Módulo:** Centro de mando (`screens/DashboardScreen.js`)

### 1. Descripción de la Historia

* **Como** persona que abre la app
* **Quiero** ver de un vistazo mi balance del mes, ingresos, gastos, cuánto me queda del presupuesto y mis últimos movimientos
* **Para** saber cómo voy sin navegar por varias pantallas

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Ver el resumen del mes**
   * **Dado que** tengo movimientos este mes
   * **Cuando** abro el Centro de mando
   * **Entonces** veo la fecha ("lunes 2 de noviembre"), "Balance total" (ingresos − gastos del mes), ↑ ingresos en verde, ↓ gastos en rojo y "Movimientos de este mes"

* **Escenario: Anillo con presupuesto**
   * **Dado que** el presupuesto es mayor que 0
   * **Cuando** veo el anillo
   * **Entonces** muestra "Restante", el monto restante y "N% usado"

* **Escenario: Sin presupuesto**
   * **Dado que** el presupuesto es 0
   * **Cuando** veo el anillo
   * **Entonces** muestra un "+" y "Definir presupuesto"

* **Escenario: Editar el presupuesto**
   * **Dado que** toco el anillo
   * **Cuando** escribo un valor en "Presupuesto mensual" y toco "Guardar"
   * **Entonces** se guarda el ajuste `budget` y se recalculan anillo y alertas

* **Escenario: Racha visible**
   * **Dado que** mi racha de registro es mayor que 0
   * **Cuando** veo el encabezado
   * **Entonces** aparece la llama con el número de días

* **Escenario: Recientes**
   * **Dado que** tengo movimientos
   * **Cuando** veo "Recientes"
   * **Entonces** aparecen los 4 últimos y "Ver todos" lleva a Movimientos; sin movimientos veo "Toca + para registrar tu primer gasto. Puedes dictar la descripción o adjuntar la foto del recibo."

* **Escenario: Accesos rápidos**
   * **Dado que** estoy en el Centro de mando
   * **Cuando** toco "Dictar", "Escribir" o "Recibo"
   * **Entonces** se abre la captura en el modo correspondiente ([HU-05](#hu-05---registrar-un-movimiento-escribiendo-o-dictando-en-lenguaje-natural), [HU-06](#hu-06---registrar-un-gasto-escaneando-un-recibo))

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Balance en tipografía `display` ajustada al ancho (`fitFontSize` 34 → 20) y en rojo si es negativo; el restante también en rojo si es negativo.
* Anillo de 138 px y trazo 12 dentro de una tarjeta de cristal presionable (`accessibilityLabel` "Editar presupuesto").
* Botón de ajustes circular de 40 px con ícono `sliders` (`accessibilityLabel` "Ajustes y privacidad").
* Llama en `colors.orange` dentro de una píldora translúcida.
* La hoja de presupuesto enfoca el campo al abrirse (`autoFocus`) con texto de 26 pt.
* Transición de pestaña: opacidad y desplazamiento 16 → 0 con resorte.

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** `model` = `buildOverviewModel(overview, { todayIso, budget })`; `loggingStreak(overview.recordDates)`. No recorre el historial completo.
* **Backend / Datos:** `store.getOverview` en una sola consulta: balance, totales del mes y de los 3 previos, 4 recientes, hasta 20 pendientes y fechas de registro de los últimos 60 días.

### 5. Casos Extremos (Edge Cases)

* **Cambio de día con la app abierta:** al volver del segundo plano tras 30 s se recalcula `todayIso` y el snapshot.
* **Presupuesto no numérico:** se guarda 0.
* **Montos muy largos:** la fuente se reduce para caber en una línea.

### 6. Definition of Done (DoD)

* [ ] Pruebas Jest de `buildOverviewModel` y `loggingStreak`.
* [ ] Verificado en emulador con datos de ejemplo.

---

## HU-11 - Recibir alertas predictivas del Copilot

**Épica / Módulo:** Copilot financiero (`lib/analytics.js` → `buildInsights`, `InsightCards`)

### 1. Descripción de la Historia

* **Como** persona con un presupuesto mensual
* **Quiero** ver alertas que proyecten mi cierre de mes, avisen de categorías al alza y resuman mis suscripciones
* **Para** corregir el rumbo antes de pasarme, no después

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Dentro del presupuesto**
   * **Dado que** presupuesto > 0, hay gasto y la proyección no supera el límite
   * **Cuando** veo las alertas
   * **Entonces** aparece "Vas dentro del presupuesto" (tono positivo) con la proyección de cierre y lo que queda

* **Escenario: Sobregiro proyectado**
   * **Dado que** aún no supero el presupuesto pero la proyección sí
   * **Cuando** veo las alertas
   * **Entonces** aparece "Sobregiro proyectado" (advertencia) con el día estimado en que se agota, el cierre proyectado y el "Límite diario sugerido"

* **Escenario: Presupuesto superado**
   * **Dado que** el gasto ya supera el presupuesto
   * **Cuando** veo las alertas
   * **Entonces** aparece "Presupuesto superado" con cuánto me pasé y el cierre proyectado

* **Escenario: Categoría al alza**
   * **Dado que** una categoría pesa al menos el 10 % del gasto del mes y va ≥ 30 % por encima de su promedio de los 3 meses anteriores
   * **Cuando** veo las alertas
   * **Entonces** aparece "<Categoría> viene al alza" con el monto y el porcentaje sobre el promedio (solo la de mayor aumento)

* **Escenario: Suscripciones**
   * **Dado que** hay gasto en la categoría Suscripciones este mes
   * **Cuando** veo las alertas
   * **Entonces** aparece "Suscripciones del mes" (informativa) con el total

* **Escenario: Pendientes**
   * **Dado que** hay movimientos pendientes
   * **Cuando** toco la alerta "N movimientos por confirmar"
   * **Entonces** voy a Movimientos

* **Escenario: Sin alertas**
   * **Dado que** ninguna condición se cumple
   * **Cuando** veo el Centro de mando
   * **Entonces** no se muestran ni el título "Alertas del copiloto" ni las tarjetas

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Carrusel horizontal de tarjetas de 250 px de ancho y mínimo 118 px de alto, sin barra de desplazamiento.
* Barra lateral de 3 px con resplandor del color del tono: ámbar (`alert`), verde (`check`) o cian (`info`).
* Título en una línea; cuerpo hasta 4 líneas.

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** `buildInsights(model, overview.monthlyTotals, { todayIso, budget, currency })` memorizado en `FinanceContext`. Proyección: gasto acumulado / días transcurridos × días del mes.
* **Backend / Datos:** se calcula en el dispositivo; no llama al backend.

### 5. Casos Extremos (Edge Cases)

* **Sin historial de meses previos:** no hay alerta de categoría al alza (promedio 0).
* **Primer día del mes:** la proyección se basa en pocos datos; el manual advierte que mejora con el avance del mes.
* **Presupuesto 0:** no hay alertas de presupuesto.

### 6. Definition of Done (DoD)

* [ ] Pruebas Jest de la proyección y de cada alerta, incluido el umbral 1,3 y el 10 %.

---

## HU-12 - Consultar el Copiloto con preguntas fijas

**Épica / Módulo:** Copiloto financiero (`CopilotChat`, `lib/copilot.js`)

### 1. Descripción de la Historia

* **Como** persona que quiere entender sus gastos
* **Quiero** tocar una pregunta frecuente y recibir al instante una respuesta con mis números
* **Para** decidir mejor sin calcular a mano y sin depender de internet

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Preguntas disponibles**
   * **Dado que** estoy en el Centro de mando
   * **Cuando** veo la tarjeta "Copiloto financiero"
   * **Entonces** veo "¿Me alcanza el presupuesto?", "¿Cómo voy este mes?", "¿En qué gasto más?" y "¿Cómo puedo ahorrar más?"

* **Escenario: Responder una pregunta**
   * **Dado que** toco una pregunta
   * **Cuando** se muestra la respuesta
   * **Entonces** veo la pregunta, la respuesta calculada con los totales del mes y "Calculado en tu teléfono"; la pregunta elegida queda resaltada

* **Escenario: Sin presupuesto**
   * **Dado que** no definí presupuesto
   * **Cuando** toco "¿Me alcanza el presupuesto?"
   * **Entonces** veo "Aún no tienes un presupuesto mensual. Defínelo en Ajustes y te digo si vas camino a pasarte."

* **Escenario: Respuesta al día**
   * **Dado que** ya elegí una pregunta
   * **Cuando** registro o borro un movimiento
   * **Entonces** la respuesta se recalcula con los datos nuevos

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Encabezado "Copiloto financiero" / "Elige una pregunta sobre tu mes" con avatar violeta.
* Preguntas como chips; la activa con borde cian. Vibra al tocar.
* No hay campo de texto libre ni historial de conversación.

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** `answerCopilot(id, model, { currency })` usa el modelo del Centro de mando (`buildOverviewModel`): gastado, ingresos, presupuesto, gasto por categoría y la proyección de `projectMonth`. "¿Cómo puedo ahorrar más?" calcula el ahorro de recortar 15 % la categoría más alta y el límite diario.
* **Datos:** sin consultas extra ni red: reutiliza el snapshot ya cargado.

### 5. Casos Extremos (Edge Cases)

* **Mes sin movimientos:** "Este mes todavía no tienes movimientos confirmados." / "Registra tus gastos del mes y te diré dónde puedes recortar.".
* **Presupuesto superado:** indica por cuánto y el cierre proyectado.

### 6. Definition of Done (DoD)

* [ ] Prueba Jest de las cuatro respuestas, con y sin presupuesto.
* [ ] Verificado en emulador.

---

## HU-13 - Comparar dos meses en Analítica

**Épica / Módulo:** Analítica (`screens/AnalyticsScreen.js`, `components/ComparisonChart.js`, `Charts.js`, `MonthPicker.js`)

### 1. Descripción de la Historia

* **Como** persona que quiere cambiar hábitos
* **Quiero** elegir un mes A y uno B y ver lado a lado gastos, ingresos, flujo neto, promedio diario y categorías
* **Para** saber si gasto más o menos que antes y dónde

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Elegir meses**
   * **Dado que** estoy en Analítica
   * **Cuando** toco la píldora A o B
   * **Entonces** se abre "Mes a analizar (A)" o "Mes de referencia (B)" con ruedas de selección y atajos ("Mes actual", "Mes anterior" para A; "Mes previo a A", "Mismo mes, año anterior" para B)

* **Escenario: Comparación justa con mes en curso**
   * **Dado que** el mes A está en curso (día N)
   * **Cuando** se calcula la comparación
   * **Entonces** ambos meses se comparan sobre los días 1 a N y se muestra "Mes en curso: se comparan los días 1 a N de cada mes."

* **Escenario: Indicadores**
   * **Dado que** la comparación A/B está activa
   * **Cuando** veo las tarjetas
   * **Entonces** "Gastado", "Ingresado", "Flujo neto" y "Promedio diario" muestran el valor de A, "vs <B>" y una flecha de tendencia: verde hacia abajo si el gasto baja, roja hacia arriba si sube

* **Escenario: Titular**
   * **Dado que** hay cambios por categoría
   * **Cuando** veo el encabezado del análisis
   * **Entonces** aparece el titular del mayor cambio (p. ej. "Gastaste 15% más en Comida…")

* **Escenario: Gráficos**
   * **Dado que** hay datos
   * **Cuando** me desplazo
   * **Entonces** veo "Gasto por categoría: A vs. B" (barras superpuestas), "Distribución de <A>" (dona), "Ingresos vs. egresos (6 meses)" y "Dónde más gastaste en <mes A>" (ranking de comercios)

* **Escenario: Desactivar comparación**
   * **Dado que** toco el interruptor "A/B"
   * **Cuando** queda apagado
   * **Entonces** solo veo el mes A, sin deltas ni píldora B

* **Escenario: Carga**
   * **Dado que** las consultas aún no responden
   * **Cuando** abro la pestaña
   * **Entonces** veo "Calculando tu historial…"

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Barra flotante con píldoras A (violeta) y B (cian), con `accessibilityLabel` "<A/B>: <mes>. Toca para elegir otro mes".
* Ruedas estilo iOS en `MonthPicker`.
* Valores de las tarjetas con fuente ajustada (20 → 13 pt) en una línea; gastado en rojo e ingresado en verde.
* `TrendBadge` con color según `goodWhen` (`down` para gasto y promedio, `up` para ingreso).

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** consultas perezosas y cacheadas con `useFinanceQuery`; gráficos SVG (`react-native-svg`) memorizados.
* **Backend / Datos:** agregados en SQLite (totales por mes y categoría, comercios principales) con índices y vistas del esquema v5; sin backend.

### 5. Casos Extremos (Edge Cases)

* **Mes sin datos:** tarjetas en cero; las secciones que dependen de datos no se muestran.
* **Error en la consulta:** el hook devuelve `error` y la caché descarta la promesa para reintentar.
* **Comparar un mes consigo mismo:** deltas en cero.

### 6. Definition of Done (DoD)

* [ ] Pruebas Jest del recorte por días, deltas y titular.
* [ ] Verificado en emulador con datos de ejemplo.

---

## HU-14 - Crear metas de ahorro y registrar aportes

**Épica / Módulo:** Metas y gamificación (`screens/GoalsScreen.js`, `sheets/GoalSheet.js`, tablas `goals` y `goal_contributions`)

### 1. Descripción de la Historia

* **Como** persona que ahorra para algo concreto
* **Quiero** crear metas con ícono, nombre y objetivo, registrar aportes rápidos y ver su historial
* **Para** mantener la motivación viendo mi progreso

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Crear una meta**
   * **Dado que** toco crear meta
   * **Cuando** elijo un ícono, escribo "Fondo de emergencia", objetivo "5.000.000", ahorrado "500.000" y toco "Guardar"
   * **Entonces** se crea la meta con `saved = 0` y una contribución `initial` de 500.000, que el trigger suma en `goals.saved`

* **Escenario: Aporte rápido**
   * **Dado que** abro una meta existente
   * **Cuando** toco "+$50.000", "+$100.000" o "+$250.000" y luego "Guardar"
   * **Entonces** cada toque suma al ahorrado con vibración de éxito y, al guardar, cada uno queda como contribución `contribution`

* **Escenario: Ajuste manual**
   * **Dado que** cambio a mano el campo "Ahorrado"
   * **Cuando** guardo
   * **Entonces** la diferencia que no explican los aportes rápidos queda como `adjustment`

* **Escenario: Historial**
   * **Dado que** la meta tiene contribuciones
   * **Cuando** la abro
   * **Entonces** veo "Historial" con hasta 20 filas "Saldo inicial", "Aporte" o "Ajuste" · día, y el monto en verde (positivo) o rojo (negativo)

* **Escenario: Meta cumplida**
   * **Dado que** el ahorrado llega al objetivo
   * **Cuando** veo la meta
   * **Entonces** aparece "¡Meta cumplida! 🎉"

* **Escenario: Validaciones**
   * **Dado que** el nombre está vacío o el objetivo no es mayor que cero
   * **Cuando** toco "Guardar"
   * **Entonces** veo "Ponle nombre a tu meta." o "El objetivo debe ser mayor que cero."

* **Escenario: Eliminar**
   * **Dado que** abro una meta existente
   * **Cuando** toco "Eliminar"
   * **Entonces** la meta desaparece de la lista y se borra de la base

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Íconos: 🛟 🏖️ 💻 🏠 🚗 🎓 💍 🎁 como chips seleccionables. Nombre con máximo 40 caracteres.
* Título de la hoja: "Nueva meta" o "<ícono> <nombre>".
* Barra de progreso animada y texto "<ahorrado> de <objetivo>". Chips de aporte en verde neón.
* Estado vacío: "Crea tu primera meta: un viaje, un fondo de emergencia, un portátil…".

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** estado local `form` y `added[]`. `saveGoal(goal, contributions)` recarga metas e invalida la caché; historial con `useFinanceQuery('goal-history|<id>')`.
* **Backend / Datos:** `goals.saved` es derivado: triggers AFTER recalculan `ROUND(SUM, 2)` y un BEFORE UPDATE rechaza escrituras directas. `upsertGoal` en Java convierte los aportes en filas `contribution` y el resto del cambio en `adjustment` (`initial` para meta nueva).

### 5. Casos Extremos (Edge Cases)

* **Ahorrado negativo:** se guarda como `Math.max(0, saved)`.
* **Bajar el ahorro tras cumplir la meta:** la insignia "Meta cumplida" sigue desbloqueada.
* **Eliminar:** no pide confirmación ni ofrece deshacer (comportamiento actual).
* **Migración desde v4:** el ahorro previo pasa a "Saldo inicial".

### 6. Definition of Done (DoD)

* [ ] `construir.py` cubre los triggers de `goal_contributions` y la reconciliación de `importar.sql`.
* [ ] Verificado en emulador: aportes rápidos, ajuste manual e insignia persistente.

---

## HU-15 - Seguir rachas y ganar insignias

**Épica / Módulo:** Metas y gamificación (`lib/gamification.js`, `components/Medal.js`, tablas `badges` y `badge_unlocks`)

### 1. Descripción de la Historia

* **Como** persona que quiere sostener el hábito
* **Quiero** ver mis rachas de registro y de días bajo presupuesto, y ganar insignias que no se pierdan
* **Para** convertir el registro en un juego que quiero seguir jugando

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Racha de registro**
   * **Dado que** registré movimientos en días consecutivos terminando hoy o ayer
   * **Cuando** abro "Metas y logros"
   * **Entonces** "Racha de registro" muestra N "días" (o "día" si es 1)

* **Escenario: Racha bajo presupuesto**
   * **Dado que** tengo presupuesto
   * **Cuando** veo "Bajo presupuesto"
   * **Entonces** muestra los días consecutivos, hasta ayer, en que el gasto no superó presupuesto / días del mes; con presupuesto 0 muestra 0

* **Escenario: Ganar una insignia**
   * **Dado que** una insignia llega al 100 % (Primer paso, Escriba IA, Piloto automático, Constancia, Guardián, Cazarrecibos, Hábito de acero, Mes en verde o Meta cumplida)
   * **Cuando** ocurre cualquier cambio de datos
   * **Entonces** se guarda en `badge_unlocks` con su fecha, aunque no esté en la pestaña Metas

* **Escenario: Insignia permanente**
   * **Dado que** gané "Constancia"
   * **Cuando** rompo la racha
   * **Entonces** la insignia sigue desbloqueada

* **Escenario: Progreso de insignias bloqueadas**
   * **Dado que** una insignia no está ganada
   * **Cuando** la veo
   * **Entonces** muestra cuánto me falta

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Encabezado "Gamificación" / "Metas y logros". Tarjetas de racha con ícono `flame` naranja y `shield` verde.
* Medallas renderizadas en SVG con niveles bronce, plata y oro.

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** `FinanceContext` evalúa las insignias tras cada cambio de `dataVersion` con `evaluateBadges` y guarda las nuevas (`newlyEarned`). Comparte la caché `activity|<moneda>|<desde>` con `GoalsScreen` vía `useActivityStats` (ventana de 120 días).
* **Backend / Datos:** `store.getActivityStats` (fechas con registro, gasto diario, conteo por origen); `store.unlockBadges`; catálogo `badges` verificado contra `gamification.js` con Jest.

### 5. Casos Extremos (Edge Cases)

* **Falla al evaluar:** se ignora y se reintenta con el siguiente cambio de datos.
* **Actividad anterior a 120 días:** no cuenta para rachas largas.
* **Borrado total:** elimina las insignias ganadas.

### 6. Definition of Done (DoD)

* [ ] Pruebas Jest de `loggingStreak`, `underBudgetStreak`, `evaluateBadges` y `newlyEarned`.
* [ ] Prueba Jest de consistencia del catálogo `badges` con `gamification.js`.

---

## HU-16 - Crear y restaurar un respaldo cifrado en mi nube

**Épica / Módulo:** Respaldo y portabilidad (`services/backup.js`, `BackupManager.java`, `BackupCipher.java`)

### 1. Descripción de la Historia

* **Como** persona cuyos datos solo viven en su teléfono
* **Quiero** crear un respaldo cifrado con mi contraseña, guardarlo en Drive, OneDrive, Dropbox o el teléfono, y restaurarlo después
* **Para** no perder mi historial si cambio o pierdo el teléfono, sin que nadie más pueda leerlo

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Crear respaldo**
   * **Dado que** estoy en "Respaldo cifrado en tu nube" en Android
   * **Cuando** escribo una contraseña de al menos 8 caracteres, la repito, toco "Crear" y elijo un destino en el selector del sistema
   * **Entonces** se guarda un archivo `.mmbackup` cifrado y veo "Respaldo guardado: N movimientos y M metas."

* **Escenario: Restaurar respaldo**
   * **Dado que** escribo la contraseña del respaldo
   * **Cuando** toco "Restaurar", confirmo "Restaurar" en el aviso "Se reemplazarán todos tus movimientos, metas y ajustes actuales por los del archivo." y elijo el archivo
   * **Entonces** el archivo se valida completo, los datos se reemplazan en una sola transacción, se recarga el estado y veo "Respaldo restaurado: N movimientos y M metas."

* **Escenario: Contraseñas distintas al crear**
   * **Dado que** las dos contraseñas no coinciden
   * **Cuando** toco "Crear"
   * **Entonces** veo "Las contraseñas no coinciden."

* **Escenario: Contraseña corta**
   * **Dado que** la contraseña tiene menos de 8 caracteres
   * **Cuando** toco "Crear" o "Restaurar"
   * **Entonces** veo "La contraseña debe tener al menos 8 caracteres."

* **Escenario: Contraseña incorrecta o archivo dañado**
   * **Dado que** restauro con otra contraseña o un archivo alterado
   * **Cuando** se valida
   * **Entonces** veo "Contraseña incorrecta o archivo dañado." y mis datos actuales no cambian

* **Escenario: Archivo ajeno**
   * **Dado que** elijo un archivo que no es un respaldo de MoneyMaker
   * **Cuando** se valida
   * **Entonces** veo "Ese archivo no es un respaldo de MoneyMaker."

* **Escenario: Cancelar el selector**
   * **Dado que** se abrió el selector
   * **Cuando** lo cancelo
   * **Entonces** no se muestra ningún aviso

* **Escenario: Respaldo de una versión anterior**
   * **Dado que** restauro un respaldo de un esquema anterior
   * **Cuando** se importa
   * **Entonces** las filas se migran con `importar.sql` y se corrige lo que el esquema v5 no admite; las credenciales actuales se conservan

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Texto explicativo del cifrado AES-256-GCM y destinos posibles. Campos con `secureTextEntry` y placeholder "Contraseña (mín. 8 caracteres)".
* "Crear" y "Restaurar" lado a lado; el que corre muestra `loading` y ambos se deshabilitan mientras dura.
* Advertencia permanente en ámbar: "Si olvidas la contraseña, el respaldo no se puede recuperar."
* Resultado en verde (éxito) o rojo (error). Fuera de Android: "Los respaldos cifrados están disponibles en Android."

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** `exportBackup`/`importBackup` validan la longitud y traducen códigos nativos (`E_BACKUP_WEAK`, `E_BACKUP_PASSPHRASE`, `E_BACKUP_FORMAT`, `E_BACKUP_BUSY`, `E_NO_ACTIVITY`, `E_BACKUP_IO`). Tras restaurar, `reload()`.
* **Backend / Datos:** sin backend. Base completa cifrada con AES-256-GCM, clave PBKDF2-HMAC-SHA256 de 600.000 iteraciones, encabezado autenticado, formato 3. Guardado con el Storage Access Framework. La restauración usa tablas TEMP `legacy_*` y `importar.sql`; las metas se reconcilian contra su historial.

### 5. Casos Extremos (Edge Cases)

* **Otro respaldo en curso:** "Ya hay un respaldo en curso.".
* **Sin actividad en primer plano:** "Abre la app e intenta de nuevo.".
* **Error de lectura o escritura:** "No se pudo leer o escribir el archivo.".
* **Cualquier otro error:** "No se pudo completar el respaldo.".
* **Sin conexión al guardar en la nube:** lo maneja el proveedor de documentos del sistema.

### 6. Definition of Done (DoD)

* [ ] `BackupCipherTest` cubre cifrado, descifrado, contraseña incorrecta y encabezado alterado.
* [ ] `construir.py` cubre la restauración desde respaldos de versiones anteriores.
* [ ] **Pendiente:** verificar en dispositivo el selector de archivos real.

---

## HU-17 - Configurar privacidad, categorías aprendidas, rendimiento y borrado total

**Épica / Módulo:** Ajustes y privacidad (`sheets/SettingsSheet.js`)

### 1. Descripción de la Historia

* **Como** persona que quiere controlar sus datos y su dispositivo
* **Quiero** cambiar moneda y presupuesto, bloquear capturas, ver cuántas categorías aprendió, activar el modo ahorro de batería y borrar todo
* **Para** ajustar la app a mi nivel de privacidad y a mi teléfono

### 2. Criterios de Aceptación (BDD - Formato Gherkin)

* **Escenario: Moneda y presupuesto**
   * **Dado que** abro "Ajustes y privacidad" desde el ícono de controles
   * **Cuando** cambio moneda o presupuesto en "Presupuesto y moneda" y toco "Guardar"
   * **Entonces** se guardan los ajustes y, si cambió la moneda, se recalcula el snapshot

* **Escenario: Bloquear capturas**
   * **Dado que** "Bloquear capturas de pantalla" está apagado (por defecto)
   * **Cuando** lo activo
   * **Entonces** se aplica `FLAG_SECURE`: se bloquean las capturas y la app se oculta en recientes (en builds de desarrollo siempre se permiten capturas)

* **Escenario: Preferencias aprendidas**
   * **Dado que** abro "Categorías aprendidas"
   * **Cuando** veo la sección
   * **Entonces** dice "1 preferencia aprendida" o "N preferencias aprendidas"

* **Escenario: Modo ahorro de batería**
   * **Dado que** activo "Modo ahorro de batería"
   * **Cuando** vuelvo a la app
   * **Entonces** no hay desenfoque y el fondo y el pulso del botón + están detenidos; ocurre igual si el sistema pide reducir el movimiento

* **Escenario: Borrar todos los datos**
   * **Dado que** toco "Borrar todos los datos" en "Zona de peligro"
   * **Cuando** confirmo "Borrar todo" en el aviso "Se eliminarán de este teléfono todos tus movimientos, metas y ajustes. No se puede deshacer."
   * **Entonces** se cierra la hoja, se borran datos, credenciales y fotos de recibo y vuelvo a la bienvenida

### 3. Restricciones de Diseño y Experiencia de Usuario (UX/UI)

* Secciones como tarjetas de cristal sin blur con ícono de color: Presupuesto y moneda (cian), Acceso (cian), Privacidad (verde), Categorías aprendidas (violeta), Rendimiento (ámbar), Respaldo (violeta), Zona de peligro (rojo).
* Interruptores con pista activa en `colors.emerald`.
* Avisos destructivos con `Alert.alert` y botón `style: 'destructive'`.

### 4. Requisitos Técnicos y de Arquitectura

* **Frontend:** `updateSettings(patch)` escribe cada clave como texto; `setSecureScreen(settings.secureScreen && !DEV_ALLOW_SCREENSHOTS)`; `EffectsContext` = `reduceEffects || systemReduceMotion`.
* **Datos:** `store.wipeAll` borra datos, `auth` y las fotos de recibo. El ajuste antiguo `shareFeedback` sigue en el catálogo de la base, pero la app ya no lo lee ni envía correcciones. `allowBackup=false` y reglas de extracción excluyen la base de los respaldos automáticos de Android.

### 5. Casos Extremos (Edge Cases)

* **Presupuesto no numérico:** se guarda 0.
* **Cerrar la app durante el borrado:** comportamiento no verificado.

### 6. Definition of Done (DoD)

* [ ] Verificado en emulador: borrado total vuelve a la bienvenida sin credenciales.

---

## Brechas conocidas (no son historias)

Estas diferencias entre la visión del producto y el código actual **no se redactaron como historias** porque no están implementadas. Se listan para que el equipo decida si entran al backlog:

| Tema | Estado en el código |
|---|---|
| Sincronización automática entre dispositivos | No existe. Solo respaldo manual (HU-16). |
| Cifrado de la base local en reposo | No existe. SQLite sin cifrar; solo los respaldos van cifrados. |
| iOS | La UI funciona, pero sin módulo nativo: almacén en memoria, sin dictado, alertas bancarias ni respaldos. |
| Rastreador de suscripciones dedicado | No existe. Solo la categoría "Suscripciones" y su alerta mensual (HU-11). |
| IA (texto libre, OCR de recibos, chat abierto) | Retirada de la app el 10 de noviembre de 2026: requería un servidor desplegado. El código del servicio sigue en `backend/`. |
| Fotos de recibo en el respaldo | No se incluyen; al restaurar, los movimientos llegan sin foto. |
| Confirmación al eliminar una meta o un movimiento desde su hoja | No existe; solo el deslizar en la lista ofrece "Deshacer". |
| Validación del presupuesto | Un valor no numérico se guarda como 0 sin aviso. |

**Pendiente de verificación en un teléfono físico:** dictado por voz, cámara, lectura real de SMS y notificaciones y selector de archivos del respaldo.
