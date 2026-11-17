-- Copia congelada del esquema v4 (26 de octubre de 2026). No se usa en la app: construir.py
-- la usa para probar la migración v4 -> v5 desde una base v4 real.
-- =============================================================================
-- MoneyMaker · Base de datos local (SQLite) · esquema v4
-- =============================================================================
-- Fuente de verdad de la app: vive en el teléfono (almacenamiento privado).
--
-- Compatibilidad:
--   * Mismas tablas y columnas que el esquema v3 de FinanceDatabase.java, así
--     que las consultas, el respaldo cifrado y la restauración siguen igual.
--   * v4 añade catálogos, claves foráneas, CHECK, triggers de coherencia,
--     vistas de consulta y un índice para las correcciones.
--   * Solo usa funciones de SQLite 3.9 (Android 7, minSdk 24): sin STRICT,
--     columnas generadas, UPSERT, RETURNING ni funciones de ventana.
--
-- Convenciones:
--   * Fechas de calendario: TEXT 'AAAA-MM-DD' (se valida con date()).
--   * Marcas de tiempo: INTEGER, milisegundos desde 1970 (System.currentTimeMillis).
--   * Booleanos: INTEGER 0/1 en columnas; 'true'/'false' en la tabla settings.
--   * Montos: REAL positivo; el signo lo da `type` (expense / income).
--
-- Las claves foráneas solo se aplican con PRAGMA foreign_keys = ON
-- (DB Browser lo activa por defecto; en Android, setForeignKeyConstraintsEnabled).
-- =============================================================================

PRAGMA foreign_keys = ON;


-- -----------------------------------------------------------------------------
-- 1. Catálogos (datos fijos que la app define en código)
-- -----------------------------------------------------------------------------

-- Categorías de theme.js. Una categoría puede servir para gastos, ingresos o ambos.
CREATE TABLE categories (
    id           TEXT    NOT NULL PRIMARY KEY
                         CHECK (id <> '' AND id NOT GLOB '*[^a-z]*'),
    label        TEXT    NOT NULL UNIQUE CHECK (trim(label) <> ''),
    color        TEXT    NOT NULL
                         CHECK (length(color) = 7 AND color GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'),
    icon         TEXT    NOT NULL CHECK (trim(icon) <> ''),
    for_expense  INTEGER NOT NULL CHECK (for_expense IN (0, 1)),
    for_income   INTEGER NOT NULL CHECK (for_income IN (0, 1)),
    sort_order   INTEGER NOT NULL UNIQUE CHECK (sort_order > 0),
    CHECK (for_expense = 1 OR for_income = 1)
);

INSERT INTO categories (id, label, color, icon, for_expense, for_income, sort_order) VALUES
    ('food',          'Comida',          '#FFA062', 'food',      1, 0,  1),
    ('groceries',     'Mercado',         '#FBBF24', 'cart',      1, 0,  2),
    ('transport',     'Transporte',      '#22D3EE', 'car',       1, 0,  3),
    ('housing',       'Vivienda',        '#A78BFA', 'home',      1, 0,  4),
    ('utilities',     'Servicios',       '#60A5FA', 'bolt',      1, 0,  5),
    ('health',        'Salud',           '#F472B6', 'heart',     1, 0,  6),
    ('entertainment', 'Entretenimiento', '#E879F9', 'ticket',    1, 0,  7),
    ('subscriptions', 'Suscripciones',   '#818CF8', 'repeat',    1, 0,  8),
    ('shopping',      'Compras',         '#FB7185', 'bag',       1, 0,  9),
    ('education',     'Educación',       '#34D399', 'book',      1, 0, 10),
    ('travel',        'Viajes',          '#38BDF8', 'plane',     1, 0, 11),
    ('transfer',      'Transferencias',  '#94A3B8', 'swap',      1, 1, 12),
    ('salary',        'Salario',         '#3DFFA2', 'briefcase', 0, 1, 13),
    ('freelance',     'Freelance',       '#6EE7B7', 'spark',     0, 1, 14),
    ('other',         'Otros',           '#CBD5E1', 'dots',      1, 1, 15);

-- Origen de cada movimiento (TransactionRow.SOURCE_LABELS y CAPTURE_LABELS).
CREATE TABLE sources (
    id           TEXT    NOT NULL PRIMARY KEY
                         CHECK (id <> '' AND id NOT GLOB '*[^a-z]*'),
    label        TEXT    NOT NULL UNIQUE CHECK (trim(label) <> ''),
    description  TEXT    NOT NULL CHECK (trim(description) <> ''),
    automated    INTEGER NOT NULL DEFAULT 0 CHECK (automated IN (0, 1)),
    sort_order   INTEGER NOT NULL UNIQUE CHECK (sort_order > 0)
);

INSERT INTO sources (id, label, description, automated, sort_order) VALUES
    ('manual',       'Manual',       'Registro manual',        0, 1),
    ('ai',           'IA',           'Texto con IA',           0, 2),
    ('voice',        'Voz',          'Dictado',                0, 3),
    ('receipt',      'Recibo',       'Recibo escaneado',       0, 4),
    ('sms',          'SMS',          'SMS bancario',           1, 5),
    ('notification', 'Notificación', 'Notificación bancaria',  1, 6);

-- Ajustes que la app reconoce, con su tipo y valor por defecto (FinanceContext.js,
-- AuthContext.js y TransactionIngestor.java). La tabla settings solo admite estas claves.
CREATE TABLE setting_definitions (
    key            TEXT NOT NULL PRIMARY KEY CHECK (trim(key) <> ''),
    value_type     TEXT NOT NULL CHECK (value_type IN ('boolean', 'amount', 'millis', 'currency')),
    default_value  TEXT NOT NULL,
    description    TEXT NOT NULL CHECK (trim(description) <> '')
);

INSERT INTO setting_definitions (key, value_type, default_value, description) VALUES
    ('currency',                 'currency', 'COP',   'Moneda principal (ISO 4217)'),
    ('budget',                   'amount',   '0',     'Presupuesto mensual de gastos; 0 = sin presupuesto'),
    ('onboarded',                'boolean',  'false', 'Terminó la pantalla de bienvenida'),
    ('secureScreen',             'boolean',  'true',  'Bloquear capturas de pantalla (FLAG_SECURE)'),
    ('reduceEffects',            'boolean',  'false', 'Modo ahorro de batería: sin blur ni animaciones'),
    ('shareFeedback',            'boolean',  'false', 'Compartir correcciones de categoría anónimas'),
    ('lockDelay',                'millis',   '60000', 'Tiempo en segundo plano antes de volver a pedir la contraseña'),
    ('automation.sms',           'boolean',  'false', 'Leer alertas bancarias por SMS'),
    ('automation.notifications', 'boolean',  'false', 'Leer alertas bancarias desde notificaciones');


-- -----------------------------------------------------------------------------
-- 2. Datos del usuario
-- -----------------------------------------------------------------------------

-- Movimientos: gastos e ingresos, confirmados o pendientes de confirmar
-- (las alertas bancarias entran como 'pending' y nunca se guardan en silencio).
CREATE TABLE transactions (
    id           TEXT    NOT NULL PRIMARY KEY CHECK (id <> ''),
    type         TEXT    NOT NULL CHECK (type IN ('expense', 'income')),
    amount       REAL    NOT NULL CHECK (amount > 0),
    currency     TEXT    NOT NULL CHECK (length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*'),
    date         TEXT    NOT NULL CHECK (date IS date(date)),
    merchant     TEXT             CHECK (merchant IS NULL OR trim(merchant) <> ''),
    description  TEXT    NOT NULL CHECK (trim(description) <> ''),
    category     TEXT    NOT NULL REFERENCES categories (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    source       TEXT    NOT NULL REFERENCES sources (id)    ON UPDATE CASCADE ON DELETE RESTRICT,
    status       TEXT    NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed')),
    dedupe_key   TEXT    UNIQUE CHECK (dedupe_key IS NULL OR dedupe_key <> ''),  -- huella del SMS/notificación
    created_at   INTEGER NOT NULL CHECK (created_at > 0),
    updated_at   INTEGER NOT NULL CHECK (updated_at > 0)
);

-- Metas de ahorro.
CREATE TABLE goals (
    id          TEXT    NOT NULL PRIMARY KEY CHECK (id <> ''),
    name        TEXT    NOT NULL CHECK (trim(name) <> ''),
    emoji       TEXT,
    target      REAL    NOT NULL CHECK (target > 0),
    saved       REAL    NOT NULL DEFAULT 0 CHECK (saved >= 0),
    deadline    TEXT             CHECK (deadline IS NULL OR deadline IS date(deadline)),
    created_at  INTEGER NOT NULL CHECK (created_at > 0)
);

-- Ajustes clave/valor. value NULL = usar el valor por defecto de setting_definitions.
CREATE TABLE settings (
    key    TEXT NOT NULL PRIMARY KEY REFERENCES setting_definitions (key) ON UPDATE CASCADE ON DELETE CASCADE,
    value  TEXT
);

-- Feedback loop: cada vez que el usuario cambia la categoría sugerida.
CREATE TABLE category_feedback (
    id                  TEXT    NOT NULL PRIMARY KEY CHECK (id <> ''),
    created_at          INTEGER NOT NULL CHECK (created_at > 0),
    day                 TEXT    NOT NULL CHECK (day IS date(day)),
    transaction_id      TEXT    REFERENCES transactions (id) ON UPDATE CASCADE ON DELETE SET NULL,
    capture             TEXT    NOT NULL CHECK (capture <> 'manual')
                                REFERENCES sources (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    model               TEXT    NOT NULL CHECK (model IN ('claude', 'rules', 'bank-parser', 'learned')),
    merchant            TEXT             CHECK (merchant IS NULL OR trim(merchant) <> ''),
    description         TEXT    NOT NULL CHECK (trim(description) <> ''),
    suggested_category  TEXT    NOT NULL REFERENCES categories (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    final_category      TEXT    NOT NULL REFERENCES categories (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    confidence          REAL             CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    shared              INTEGER NOT NULL DEFAULT 0 CHECK (shared IN (0, 1)),
    CHECK (suggested_category <> final_category)
);

-- Acceso local: una sola fila. Solo se guarda el derivado PBKDF2, nunca la contraseña.
CREATE TABLE auth (
    id               INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
    username         TEXT    NOT NULL CHECK (length(trim(username)) >= 3),
    username_key     TEXT    NOT NULL CHECK (username_key <> ''),   -- usuario en minúsculas, para comparar
    secret           TEXT    NOT NULL CHECK (secret GLOB 'pbkdf2-sha256$*$*$*'),
    created_at       INTEGER NOT NULL CHECK (created_at > 0),
    updated_at       INTEGER NOT NULL CHECK (updated_at > 0),
    failed_attempts  INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until     INTEGER NOT NULL DEFAULT 0 CHECK (locked_until >= 0)
);


-- -----------------------------------------------------------------------------
-- 3. Índices
-- -----------------------------------------------------------------------------

-- Paginación con cursor (date, created_at, id) y filtros por rango de fechas.
CREATE INDEX idx_transactions_page        ON transactions (date, created_at, id);
-- Balance y totales: status = 'confirmed' AND currency = ? AND date BETWEEN ...
CREATE INDEX idx_transactions_status_date ON transactions (status, currency, date);
-- Listado de correcciones (más recientes primero).
CREATE INDEX idx_category_feedback_created     ON category_feedback (created_at);
-- Necesario para ON DELETE SET NULL: sin él, borrar un movimiento recorre toda la tabla.
CREATE INDEX idx_category_feedback_transaction ON category_feedback (transaction_id);


-- -----------------------------------------------------------------------------
-- 4. Triggers de coherencia
-- -----------------------------------------------------------------------------

-- La categoría debe servir para el tipo de movimiento (p. ej. un gasto no puede ser 'Salario').
-- Si la categoría no existe, la clave foránea es la que rechaza la fila.
CREATE TRIGGER trg_transactions_category_type_insert
BEFORE INSERT ON transactions
WHEN EXISTS (
    SELECT 1 FROM categories c
    WHERE c.id = NEW.category
      AND (CASE NEW.type WHEN 'income' THEN c.for_income ELSE c.for_expense END) = 0
)
BEGIN
    SELECT RAISE(ABORT, 'La categoría no corresponde al tipo de movimiento');
END;

CREATE TRIGGER trg_transactions_category_type_update
BEFORE UPDATE OF type, category ON transactions
WHEN EXISTS (
    SELECT 1 FROM categories c
    WHERE c.id = NEW.category
      AND (CASE NEW.type WHEN 'income' THEN c.for_income ELSE c.for_expense END) = 0
)
BEGIN
    SELECT RAISE(ABORT, 'La categoría no corresponde al tipo de movimiento');
END;

-- Un movimiento confirmado no vuelve a quedar pendiente.
CREATE TRIGGER trg_transactions_no_unconfirm
BEFORE UPDATE OF status ON transactions
WHEN OLD.status = 'confirmed' AND NEW.status = 'pending'
BEGIN
    SELECT RAISE(ABORT, 'Un movimiento confirmado no puede volver a pendiente');
END;

-- La fecha de creación no cambia.
CREATE TRIGGER trg_transactions_created_at_fixed
BEFORE UPDATE OF created_at ON transactions
WHEN NEW.created_at IS NOT OLD.created_at
BEGIN
    SELECT RAISE(ABORT, 'created_at no se puede modificar');
END;

-- El valor de cada ajuste debe tener el formato de su tipo (NULL = valor por defecto).
-- La app guarda los ajustes con INSERT OR REPLACE, así que basta con validar inserciones;
-- el trigger de UPDATE cubre ediciones hechas a mano desde DB Browser.
CREATE TRIGGER trg_settings_value_insert
BEFORE INSERT ON settings
WHEN NEW.value IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM setting_definitions d
    WHERE d.key = NEW.key
      AND CASE d.value_type
            WHEN 'boolean'  THEN NEW.value IN ('true', 'false')
            WHEN 'amount'   THEN NEW.value <> '' AND NEW.value NOT GLOB '*[^0-9.]*'
                                 AND NEW.value NOT GLOB '*.*.*' AND NEW.value GLOB '[0-9]*'
            WHEN 'millis'   THEN NEW.value <> '' AND NEW.value NOT GLOB '*[^0-9]*'
            WHEN 'currency' THEN length(NEW.value) = 3 AND NEW.value NOT GLOB '*[^A-Z]*'
          END
)
-- Si la clave no existe, es la clave foránea la que la rechaza.
AND EXISTS (SELECT 1 FROM setting_definitions WHERE key = NEW.key)
BEGIN
    SELECT RAISE(ABORT, 'Valor no válido para este ajuste');
END;

CREATE TRIGGER trg_settings_value_update
BEFORE UPDATE OF key, value ON settings
WHEN NEW.value IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM setting_definitions d
    WHERE d.key = NEW.key
      AND CASE d.value_type
            WHEN 'boolean'  THEN NEW.value IN ('true', 'false')
            WHEN 'amount'   THEN NEW.value <> '' AND NEW.value NOT GLOB '*[^0-9.]*'
                                 AND NEW.value NOT GLOB '*.*.*' AND NEW.value GLOB '[0-9]*'
            WHEN 'millis'   THEN NEW.value <> '' AND NEW.value NOT GLOB '*[^0-9]*'
            WHEN 'currency' THEN length(NEW.value) = 3 AND NEW.value NOT GLOB '*[^A-Z]*'
          END
)
AND EXISTS (SELECT 1 FROM setting_definitions WHERE key = NEW.key)
BEGIN
    SELECT RAISE(ABORT, 'Valor no válido para este ajuste');
END;


-- -----------------------------------------------------------------------------
-- 5. Vistas (consultas listas para revisar en DB Browser)
-- -----------------------------------------------------------------------------

-- Movimientos con nombres legibles y monto con signo.
CREATE VIEW v_transactions AS
SELECT t.id,
       t.date,
       t.type,
       CASE t.type WHEN 'income' THEN t.amount ELSE -t.amount END AS signed_amount,
       t.currency,
       t.description,
       t.merchant,
       t.category,
       c.label AS category_label,
       t.source,
       s.label AS source_label,
       t.status,
       datetime(t.created_at / 1000, 'unixepoch', 'localtime') AS created,
       datetime(t.updated_at / 1000, 'unixepoch', 'localtime') AS updated
FROM transactions t
JOIN categories c ON c.id = t.category
JOIN sources    s ON s.id = t.source;

-- Saldo por moneda (solo confirmados), como FinanceDatabase.balance().
CREATE VIEW v_balance AS
SELECT currency,
       SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END) AS income,
       SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense,
       SUM(CASE WHEN type = 'income'  THEN amount ELSE -amount END) AS balance,
       COUNT(*) AS movements
FROM transactions
WHERE status = 'confirmed'
GROUP BY currency;

-- Resumen mensual por moneda.
CREATE VIEW v_monthly_summary AS
SELECT substr(date, 1, 7) AS month,
       currency,
       SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END) AS income,
       SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense,
       SUM(CASE WHEN type = 'income'  THEN amount ELSE -amount END) AS net,
       COUNT(*) AS movements
FROM transactions
WHERE status = 'confirmed'
GROUP BY month, currency;

-- Totales por mes, tipo y categoría (lo que pide Analítica: monthlyTotals).
CREATE VIEW v_monthly_category_totals AS
SELECT substr(t.date, 1, 7) AS month,
       t.currency,
       t.type,
       t.category,
       c.label AS category_label,
       SUM(t.amount) AS total,
       COUNT(*) AS movements
FROM transactions t
JOIN categories c ON c.id = t.category
WHERE t.status = 'confirmed'
GROUP BY month, t.currency, t.type, t.category;

-- Alertas bancarias y borradores pendientes de confirmar.
CREATE VIEW v_pending_transactions AS
SELECT t.id, t.date, t.type, t.amount, t.currency, t.description, t.merchant,
       t.category, t.source, s.description AS source_description,
       datetime(t.created_at / 1000, 'unixepoch', 'localtime') AS detected
FROM transactions t
JOIN sources s ON s.id = t.source
WHERE t.status = 'pending';

-- Progreso de cada meta.
CREATE VIEW v_goal_progress AS
SELECT id,
       emoji,
       name,
       target,
       saved,
       MAX(target - saved, 0) AS remaining,
       ROUND(MIN(saved / target, 1) * 100, 1) AS progress_pct,
       CASE WHEN saved >= target THEN 1 ELSE 0 END AS completed,
       deadline,
       datetime(created_at / 1000, 'unixepoch', 'localtime') AS created
FROM goals;

-- Valor efectivo de cada ajuste (el guardado o, si no hay, el de por defecto).
CREATE VIEW v_settings AS
SELECT d.key,
       COALESCE(s.value, d.default_value) AS value,
       CASE WHEN s.value IS NULL THEN 1 ELSE 0 END AS is_default,
       d.value_type,
       d.description
FROM setting_definitions d
LEFT JOIN settings s ON s.key = d.key;

-- Qué corrige más el usuario: sugerida -> final, por modelo.
CREATE VIEW v_category_corrections AS
SELECT f.model,
       f.suggested_category,
       cs.label AS suggested_label,
       f.final_category,
       cf.label AS final_label,
       COUNT(*) AS corrections,
       SUM(f.shared) AS shared,
       MAX(f.day) AS last_day
FROM category_feedback f
JOIN categories cs ON cs.id = f.suggested_category
JOIN categories cf ON cf.id = f.final_category
GROUP BY f.model, f.suggested_category, f.final_category;


-- Versión del esquema (SQLiteOpenHelper la usa para decidir onUpgrade).
PRAGMA user_version = 4;
