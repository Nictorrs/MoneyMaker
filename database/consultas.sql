-- =============================================================================
-- MoneyMaker · consultas de la app (FinanceDatabase.java) con valores de ejemplo
-- =============================================================================
-- Ábrelas en DB Browser: pestaña "Ejecutar SQL", selecciona una consulta y
-- pulsa Ctrl+Retorno (ejecuta solo la línea/selección) o F5 (todo el archivo).
-- En la app, los valores fijos ('COP', fechas, ids) llegan como parámetros "?".
-- =============================================================================

-- 1. Saldo total (Centro de mando)
SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS balance
FROM transactions
WHERE status = 'confirmed' AND currency = 'COP';

-- 2. Movimientos por confirmar
SELECT COUNT(*) AS pending FROM transactions WHERE status = 'pending';

-- 3. Primera página de Movimientos (filtro "all"), del más reciente al más antiguo
SELECT * FROM transactions
WHERE 1 = 1
ORDER BY date DESC, created_at DESC, id DESC
LIMIT 30;

-- 4. Página siguiente con cursor: última fila de la página anterior (date, created_at, id)
SELECT * FROM transactions
WHERE status = 'confirmed' AND type = 'expense'
  AND (date < '2026-10-08' OR (date = '2026-10-08' AND (created_at < 1791502200000
       OR (created_at = 1791502200000 AND id < 'tx-1003'))))
ORDER BY date DESC, created_at DESC, id DESC
LIMIT 30;

-- 5. Totales por mes, tipo y categoría (Analítica, últimos 3 meses)
SELECT substr(date, 1, 7) AS month, type, category, SUM(amount) AS total, COUNT(*) AS count
FROM transactions
WHERE status = 'confirmed' AND currency = 'COP' AND date BETWEEN '2026-08-01' AND '2026-10-31'
GROUP BY month, type, category;

-- 6. Comercios donde más se gastó en el mes
SELECT merchant, SUM(amount) AS total
FROM transactions
WHERE status = 'confirmed' AND type = 'expense' AND currency = 'COP' AND date LIKE '2026-10-%'
  AND merchant IS NOT NULL AND merchant <> ''
GROUP BY merchant
ORDER BY total DESC
LIMIT 5;

-- 7. Gasto por día (racha "sin pasarse del presupuesto")
SELECT date, SUM(amount) AS total
FROM transactions
WHERE status = 'confirmed' AND type = 'expense' AND currency = 'COP' AND date >= '2026-08-27'
GROUP BY date;

-- 8. Días con registros (racha de constancia)
SELECT DISTINCT date FROM transactions
WHERE status = 'confirmed' AND date >= '2026-08-27'
ORDER BY date DESC;

-- 9. Movimientos por origen (insignias: Escriba IA, Cazarrecibos, Piloto automático)
SELECT source, COUNT(*) AS count FROM transactions WHERE status = 'confirmed' GROUP BY source;

-- 10. Rango de fechas con datos (selector de meses de Analítica)
SELECT MIN(date) AS first, MAX(date) AS last FROM transactions WHERE status = 'confirmed';

-- 11. Contexto para el Copilot: campos mínimos de los movimientos recientes
SELECT date, type, amount, category, merchant
FROM transactions
WHERE status = 'confirmed' AND currency = 'COP' AND date >= '2026-09-11'
ORDER BY date DESC, created_at DESC, id DESC
LIMIT 60;

-- 12. ¿Ya llegó la misma alerta bancaria hace menos de 10 minutos? (SMS + notificación)
SELECT 1 FROM transactions
WHERE type = 'expense' AND ABS(amount - 45900) < 0.005 AND date = '2026-10-26'
  AND source IN ('sms', 'notification') AND created_at >= 1793037300000 - 600000
LIMIT 1;

-- 13. Correcciones de categoría pendientes de compartir
SELECT * FROM category_feedback WHERE shared = 0 ORDER BY created_at DESC LIMIT 100;

-- 14. Metas
SELECT * FROM goals ORDER BY created_at ASC;

-- 15. Ajustes
SELECT key, value FROM settings ORDER BY key;


-- -----------------------------------------------------------------------------
-- Vistas del esquema (resúmenes listos)
-- -----------------------------------------------------------------------------
SELECT * FROM v_balance;
SELECT * FROM v_monthly_summary ORDER BY month DESC;
SELECT * FROM v_monthly_category_totals WHERE month = '2026-10' ORDER BY type, total DESC;
SELECT * FROM v_pending_transactions;
SELECT * FROM v_goal_progress;
SELECT * FROM v_settings;
SELECT * FROM v_category_corrections;

-- Presupuesto del mes: gastado, restante y porcentaje usado.
SELECT CAST(s.value AS REAL)                                   AS budget,
       COALESCE(m.expense, 0)                                  AS spent,
       CAST(s.value AS REAL) - COALESCE(m.expense, 0)          AS remaining,
       ROUND(COALESCE(m.expense, 0) * 100.0 / NULLIF(CAST(s.value AS REAL), 0), 1) AS used_pct
FROM v_settings s
LEFT JOIN v_monthly_summary m ON m.month = '2026-10' AND m.currency = 'COP'
WHERE s.key = 'budget';


-- -----------------------------------------------------------------------------
-- Revisión de integridad (deben devolver "ok" y ninguna fila, respectivamente)
-- -----------------------------------------------------------------------------
PRAGMA integrity_check;
PRAGMA foreign_key_check;
