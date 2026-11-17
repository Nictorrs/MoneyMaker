-- =============================================================================
-- MoneyMaker · importar datos antiguos o de un respaldo al esquema actual
-- =============================================================================
-- La app usa este script en dos casos:
--   * Migración desde v3: las tablas v3 se renombran a legacy_* y se crea el esquema actual.
--   * Restaurar un respaldo .mmbackup (cualquier versión): las filas se cargan en tablas
--     temporales legacy_* antes de vaciar las tablas reales.
-- legacy_goal_contributions y legacy_badge_unlocks existen siempre (vacías si el
-- origen no las tenía, como v3 o los respaldos v1 y v2).
--
-- legacy_* no tiene restricciones, así que puede traer datos que el esquema
-- rechazaría. Aquí se corrigen al copiarlos:
--   * moneda en minúsculas o inválida -> la moneda de los ajustes;
--   * fecha inválida -> el día en que se creó el registro;
--   * categoría inexistente o que no sirve para el tipo -> 'other';
--   * origen desconocido -> 'manual';
--   * comercio vacío -> NULL;
--   * corrección que apunta a un movimiento borrado -> transaction_id NULL.
-- Lo que no tiene arreglo se descarta:
--   * movimientos con tipo desconocido o monto <= 0, que no cambian el saldo;
--   * metas con objetivo <= 0;
--   * ajustes desconocidos o con valor inválido: vuelven a su valor por defecto;
--   * correcciones con captura, modelo o categorías inválidas;
--   * aportes de metas inexistentes o inválidos, e insignias que ya no existen.
-- El ahorro de cada meta se conserva: si el historial no lo suma (o no hay historial),
-- se añade un saldo inicial o un ajuste por la diferencia.
--
-- Requiere las tablas de datos vacías y los catálogos de esquema.sql.
-- =============================================================================

-- 1. Ajustes (primero: la moneda guardada se usa para corregir movimientos)
INSERT OR REPLACE INTO settings (key, value)
SELECT l.key, l.value
FROM legacy_settings l
JOIN setting_definitions d ON d.key = l.key
WHERE l.value IS NULL
   OR CASE d.value_type
        WHEN 'boolean'  THEN l.value IN ('true', 'false')
        WHEN 'amount'   THEN l.value <> '' AND l.value NOT GLOB '*[^0-9.]*'
                             AND l.value NOT GLOB '*.*.*' AND l.value GLOB '[0-9]*'
        WHEN 'millis'   THEN l.value <> '' AND l.value NOT GLOB '*[^0-9]*'
        WHEN 'currency' THEN length(l.value) = 3 AND l.value NOT GLOB '*[^A-Z]*'
      END;

-- 2. Movimientos
INSERT OR IGNORE INTO transactions
    (id, type, amount, currency, date, merchant, description, category, source, status, dedupe_key, created_at, updated_at)
SELECT c.id,
       c.type,
       c.amount,
       c.currency,
       CASE WHEN typeof(c.date) = 'text' AND c.date IS date(c.date) THEN c.date
            ELSE COALESCE(CASE WHEN typeof(c.date) = 'text' THEN date(c.date) END,
                          date(c.created_at / 1000, 'unixepoch', 'localtime')) END,
       c.merchant,
       c.description,
       CASE WHEN EXISTS (SELECT 1 FROM categories k
                         WHERE k.id = c.category
                           AND (CASE c.type WHEN 'income' THEN k.for_income ELSE k.for_expense END) = 1)
            THEN c.category ELSE 'other' END,
       c.source,
       c.status,
       c.dedupe_key,
       c.created_at,
       CASE WHEN typeof(c.updated_at) IN ('integer', 'real') AND c.updated_at > 0
            THEN CAST(c.updated_at AS INTEGER) ELSE c.created_at END
FROM (
    SELECT COALESCE(NULLIF(trim(l.id), ''), lower(hex(randomblob(16)))) AS id,
           l.type,
           CAST(l.amount AS REAL) AS amount,
           CASE WHEN length(trim(l.currency)) = 3 AND upper(trim(l.currency)) NOT GLOB '*[^A-Z]*'
                THEN upper(trim(l.currency))
                ELSE COALESCE((SELECT value FROM settings WHERE key = 'currency'),
                              (SELECT default_value FROM setting_definitions WHERE key = 'currency')) END AS currency,
           l.date,
           CASE WHEN trim(l.merchant) = '' THEN NULL ELSE l.merchant END AS merchant,
           CASE WHEN trim(COALESCE(l.description, '')) = '' THEN 'Sin concepto' ELSE l.description END AS description,
           l.category,
           CASE WHEN l.source IN (SELECT id FROM sources) THEN l.source ELSE 'manual' END AS source,
           CASE WHEN l.status IS NULL THEN 'confirmed'
                WHEN l.status IN ('pending', 'confirmed') THEN l.status
                ELSE 'pending' END AS status,
           CASE WHEN trim(l.dedupe_key) = '' THEN NULL ELSE l.dedupe_key END AS dedupe_key,
           CASE WHEN typeof(l.created_at) IN ('integer', 'real') AND l.created_at > 0
                THEN CAST(l.created_at AS INTEGER)
                ELSE CAST(strftime('%s', 'now') AS INTEGER) * 1000 END AS created_at,
           l.updated_at
    FROM legacy_transactions l
    WHERE l.type IN ('expense', 'income')
      AND typeof(l.amount) IN ('integer', 'real') AND l.amount > 0
) c;

-- 3. Metas, en 0: su ahorro sale del historial (paso 5)
INSERT OR IGNORE INTO goals (id, name, emoji, target, saved, deadline, created_at)
SELECT COALESCE(NULLIF(trim(l.id), ''), 'meta-' || l.rowid),
       CASE WHEN trim(COALESCE(l.name, '')) = '' THEN 'Meta' ELSE l.name END,
       l.emoji,
       CAST(l.target AS REAL),
       0,
       CASE WHEN typeof(l.deadline) = 'text' AND l.deadline IS date(l.deadline) THEN l.deadline END,
       CASE WHEN typeof(l.created_at) IN ('integer', 'real') AND l.created_at > 0
            THEN CAST(l.created_at AS INTEGER)
            ELSE CAST(strftime('%s', 'now') AS INTEGER) * 1000 END
FROM legacy_goals l
WHERE typeof(l.target) IN ('integer', 'real') AND l.target > 0;

-- 4. Correcciones de categoría (después de los movimientos, para validar transaction_id)
INSERT OR IGNORE INTO category_feedback
    (id, created_at, day, transaction_id, capture, model, merchant, description,
     suggested_category, final_category, confidence, shared)
SELECT c.id,
       c.created_at,
       CASE WHEN typeof(c.day) = 'text' AND c.day IS date(c.day) THEN c.day
            ELSE date(c.created_at / 1000, 'unixepoch', 'localtime') END,
       CASE WHEN c.transaction_id IN (SELECT id FROM transactions) THEN c.transaction_id END,
       c.capture,
       c.model,
       CASE WHEN trim(c.merchant) = '' THEN NULL ELSE c.merchant END,
       CASE WHEN trim(COALESCE(c.description, '')) = '' THEN '—' ELSE c.description END,
       c.suggested_category,
       c.final_category,
       CASE WHEN typeof(c.confidence) IN ('integer', 'real') AND c.confidence >= 0 AND c.confidence <= 1
            THEN c.confidence END,
       CASE WHEN c.shared IN (1, '1', 'true') THEN 1 ELSE 0 END
FROM (
    SELECT COALESCE(NULLIF(trim(l.id), ''), lower(hex(randomblob(16)))) AS id,
           CASE WHEN typeof(l.created_at) IN ('integer', 'real') AND l.created_at > 0
                THEN CAST(l.created_at AS INTEGER)
                ELSE CAST(strftime('%s', 'now') AS INTEGER) * 1000 END AS created_at,
           l.day, l.transaction_id, l.capture, l.model, l.merchant, l.description,
           l.suggested_category, l.final_category, l.confidence, l.shared
    FROM legacy_category_feedback l
    WHERE l.capture IN (SELECT id FROM sources WHERE id <> 'manual')
      AND l.model IN ('claude', 'rules', 'bank-parser', 'learned')
      AND l.suggested_category IN (SELECT id FROM categories)
      AND l.final_category IN (SELECT id FROM categories)
      AND l.suggested_category <> l.final_category
) c;

-- 5. Historial de aportes. Los triggers recalculan goals.saved con cada fila.
--    import_goal_gaps es, por meta, el ahorro guardado menos lo que suma su historial.
--    Orden: diferencias positivas, aportes de mayor a menor y diferencias negativas;
--    así la suma parcial nunca baja de 0 (goals.saved >= 0) aunque haya retiros.
CREATE TEMP VIEW import_contributions AS
SELECT COALESCE(NULLIF(trim(c.id), ''), 'aporte-' || c.rowid) AS id,
       trim(c.goal_id) AS goal_id,
       c.kind,
       ROUND(c.amount, 2) AS amount,
       CASE WHEN typeof(c.created_at) IN ('integer', 'real') AND c.created_at > 0
            THEN CAST(c.created_at AS INTEGER)
            ELSE CAST(strftime('%s', 'now') AS INTEGER) * 1000 END AS created_at
FROM legacy_goal_contributions c
WHERE typeof(c.amount) IN ('integer', 'real') AND ROUND(c.amount, 2) <> 0
  AND c.kind IN ('initial', 'contribution', 'adjustment')
  AND (c.kind = 'adjustment' OR c.amount > 0)
  AND trim(c.goal_id) IN (SELECT id FROM goals);

CREATE TEMP VIEW import_goal_gaps AS
SELECT g.id AS goal_id,
       g.created_at,
       ROUND(CASE WHEN typeof(l.saved) IN ('integer', 'real') AND l.saved > 0 THEN l.saved ELSE 0 END
             - COALESCE((SELECT SUM(i.amount) FROM import_contributions i WHERE i.goal_id = g.id), 0), 2) AS gap,
       (SELECT COUNT(*) FROM import_contributions i WHERE i.goal_id = g.id) AS history
FROM goals g
JOIN legacy_goals l
  ON l.rowid = (SELECT MIN(f.rowid) FROM legacy_goals f
                WHERE COALESCE(NULLIF(trim(f.id), ''), 'meta-' || f.rowid) = g.id);

-- Sin historial (v3, respaldos v1 y v2), el ahorro guardado es el saldo inicial.
INSERT INTO goal_contributions (id, goal_id, kind, amount, created_at)
SELECT lower(hex(randomblob(16))), goal_id, CASE WHEN history = 0 THEN 'initial' ELSE 'adjustment' END, gap, created_at
FROM import_goal_gaps
WHERE gap > 0;

INSERT OR IGNORE INTO goal_contributions (id, goal_id, kind, amount, created_at)
SELECT id, goal_id, kind, amount, created_at
FROM import_contributions
ORDER BY amount DESC;

INSERT INTO goal_contributions (id, goal_id, kind, amount, created_at)
SELECT lower(hex(randomblob(16))), goal_id, 'adjustment', gap, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM import_goal_gaps
WHERE gap < 0;

DROP VIEW temp.import_goal_gaps;
DROP VIEW temp.import_contributions;

-- 6. Insignias desbloqueadas (las que siguen en el catálogo)
INSERT OR IGNORE INTO badge_unlocks (badge_id, unlocked_at)
SELECT trim(l.badge_id),
       CASE WHEN typeof(l.unlocked_at) IN ('integer', 'real') AND l.unlocked_at > 0
            THEN CAST(l.unlocked_at AS INTEGER)
            ELSE CAST(strftime('%s', 'now') AS INTEGER) * 1000 END
FROM legacy_badge_unlocks l
WHERE trim(l.badge_id) IN (SELECT id FROM badges);
