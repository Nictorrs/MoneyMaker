-- =============================================================================
-- MoneyMaker · migración v4 -> v5: historial de aportes e insignias desbloqueadas
-- =============================================================================
-- La ejecuta FinanceDatabase.onUpgrade cuando la base está en v4, dentro de una
-- transacción. Solo añade objetos: las tablas de v4 no cambian.
--
-- Las sentencias CREATE son copia de las de esquema.sql. construir.py comprueba que
-- una base migrada quede idéntica a una nueva, así que si cambias una, cambia la otra.
-- =============================================================================

CREATE TABLE badges (
    id           TEXT    NOT NULL PRIMARY KEY
                         CHECK (id <> '' AND id NOT GLOB '*[^a-z0-9-]*'),
    title        TEXT    NOT NULL UNIQUE CHECK (trim(title) <> ''),
    description  TEXT    NOT NULL CHECK (trim(description) <> ''),
    tier         TEXT    NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold')),
    sort_order   INTEGER NOT NULL UNIQUE CHECK (sort_order > 0)
);

INSERT INTO badges (id, title, description, tier, sort_order) VALUES
    ('first-step',     'Primer paso',       'Registra tu primer movimiento',                    'bronze', 1),
    ('streak-7',       'Constancia',        '7 días seguidos registrando',                      'silver', 2),
    ('streak-30',      'Hábito de acero',   '30 días seguidos registrando',                     'gold',   3),
    ('budget-14',      'Guardián',          '14 días sin pasarte del presupuesto diario',       'silver', 4),
    ('green-month',    'Mes en verde',      'Cierra un mes con más ingresos que gastos',        'gold',   5),
    ('goal-done',      'Meta cumplida',     'Completa una meta de ahorro',                      'gold',   6),
    ('ai-scribe',      'Escriba IA',        '10 registros por voz o texto natural',             'bronze', 7),
    ('receipt-hunter', 'Cazarrecibos',      'Escanea 5 recibos',                                'silver', 8),
    ('autopilot',      'Piloto automático', 'Confirma un movimiento detectado automáticamente', 'bronze', 9);

CREATE TABLE goal_contributions (
    id          TEXT    NOT NULL PRIMARY KEY CHECK (id <> ''),
    goal_id     TEXT    NOT NULL REFERENCES goals (id) ON UPDATE CASCADE ON DELETE CASCADE,
    kind        TEXT    NOT NULL CHECK (kind IN ('initial', 'contribution', 'adjustment')),
    amount      REAL    NOT NULL CHECK (amount <> 0),
    created_at  INTEGER NOT NULL CHECK (created_at > 0),
    CHECK (kind = 'adjustment' OR amount > 0)
);

CREATE TABLE badge_unlocks (
    badge_id     TEXT    NOT NULL PRIMARY KEY REFERENCES badges (id) ON UPDATE CASCADE ON DELETE CASCADE,
    unlocked_at  INTEGER NOT NULL CHECK (unlocked_at > 0)
);

CREATE INDEX idx_goal_contributions_goal ON goal_contributions (goal_id, created_at);

CREATE TRIGGER trg_goal_contributions_insert
AFTER INSERT ON goal_contributions
BEGIN
    UPDATE goals
    SET saved = (SELECT COALESCE(ROUND(SUM(amount), 2), 0) FROM goal_contributions WHERE goal_id = NEW.goal_id)
    WHERE id = NEW.goal_id;
END;

CREATE TRIGGER trg_goal_contributions_delete
AFTER DELETE ON goal_contributions
BEGIN
    UPDATE goals
    SET saved = (SELECT COALESCE(ROUND(SUM(amount), 2), 0) FROM goal_contributions WHERE goal_id = OLD.goal_id)
    WHERE id = OLD.goal_id;
END;

CREATE TRIGGER trg_goal_contributions_update
AFTER UPDATE OF goal_id, amount ON goal_contributions
BEGIN
    UPDATE goals
    SET saved = (SELECT COALESCE(ROUND(SUM(amount), 2), 0) FROM goal_contributions WHERE goal_id = OLD.goal_id)
    WHERE id = OLD.goal_id;
    UPDATE goals
    SET saved = (SELECT COALESCE(ROUND(SUM(amount), 2), 0) FROM goal_contributions WHERE goal_id = NEW.goal_id)
    WHERE id = NEW.goal_id;
END;

CREATE TRIGGER trg_goals_saved_matches_history
BEFORE UPDATE OF saved ON goals
WHEN NEW.saved IS NOT (SELECT COALESCE(ROUND(SUM(amount), 2), 0) FROM goal_contributions WHERE goal_id = NEW.id)
BEGIN
    SELECT RAISE(ABORT, 'El ahorro de una meta se cambia registrando un aporte o un ajuste');
END;

CREATE TRIGGER trg_goals_start_at_zero
BEFORE INSERT ON goals
WHEN NEW.saved <> 0
BEGIN
    SELECT RAISE(ABORT, 'Una meta nueva empieza en 0: el ahorro inicial se registra como aporte');
END;

CREATE VIEW v_goal_contributions AS
SELECT g.emoji,
       g.name AS goal,
       c.kind,
       CASE c.kind WHEN 'initial' THEN 'Saldo inicial' WHEN 'contribution' THEN 'Aporte' ELSE 'Ajuste' END AS kind_label,
       c.amount,
       datetime(c.created_at / 1000, 'unixepoch', 'localtime') AS created,
       c.goal_id,
       c.id
FROM goal_contributions c
JOIN goals g ON g.id = c.goal_id;

CREATE VIEW v_badges AS
SELECT b.id,
       b.title,
       b.tier,
       b.description,
       CASE WHEN u.badge_id IS NULL THEN 0 ELSE 1 END AS unlocked,
       datetime(u.unlocked_at / 1000, 'unixepoch', 'localtime') AS unlocked_on
FROM badges b
LEFT JOIN badge_unlocks u ON u.badge_id = b.id;

-- Lo ahorrado hasta hoy en cada meta pasa a ser su saldo inicial, con la fecha de la
-- meta. El trigger recalcula goals.saved con el mismo valor.
INSERT INTO goal_contributions (id, goal_id, kind, amount, created_at)
SELECT lower(hex(randomblob(16))), id, 'initial', ROUND(saved, 2), created_at
FROM goals
WHERE ROUND(saved, 2) > 0;

PRAGMA user_version = 5;
