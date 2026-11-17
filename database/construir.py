"""Construye moneymaker.db (esquema + datos de ejemplo) y comprueba que todo funcione.

Uso:  python database/construir.py

Pruebas que corre:
  1. Integridad, claves foráneas y versión del esquema.
  2. Las tablas de datos de v3 conservan sus columnas.
  3. Todas las consultas de consultas.sql se ejecutan sin error y dan lo esperado.
  4. Los flujos de escritura de la app (alta, confirmación, borrado, metas con su
     historial, insignias, ajustes, acceso, borrado total) funcionan.
  5. Los datos incoherentes se rechazan (CHECK, claves foráneas y triggers).
  6. La migración desde v3 (mismos pasos que FinanceDatabase.rebuildFromVersion3)
     corrige o descarta los datos que el esquema no admite.
  7. La migración v4 -> v5 (migracion_v5.sql) deja la base igual a una nueva.
  8. Restaurar respaldos (FinanceDatabase.replaceAll + importar.sql): antiguos con
     datos inválidos, y uno actual de ida y vuelta sin perder nada.

Las pruebas de escritura se deshacen: el archivo final solo tiene los datos de ejemplo.
"""

import os
import re
import sqlite3
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCHEMA = HERE / "esquema.sql"
SCHEMA_V4 = HERE / "historial" / "esquema_v4.sql"
MIGRATION_V5 = HERE / "migracion_v5.sql"
SAMPLE = HERE / "datos_ejemplo.sql"
QUERIES = HERE / "consultas.sql"
IMPORT = HERE / "importar.sql"
OUTPUT = HERE / "moneymaker.db"
FINANCE_DATABASE_JAVA = (HERE.parent / "mobile" / "android" / "app" / "src" / "main" / "java" / "com" / "moneymaker"
                         / "finance" / "FinanceDatabase.java")

SCHEMA_VERSION = 5
# Orden de FinanceDatabase.clearTables(): las metas arrastran su historial (ON DELETE CASCADE).
USER_TABLES = ("category_feedback", "transactions", "goals", "goal_contributions", "settings", "badge_unlocks")
# Tablas que viajan en el respaldo y se cargan en legacy_* al restaurar.
BACKUP_TABLES = ("transactions", "goals", "settings", "category_feedback", "goal_contributions", "badge_unlocks")
V3_TABLES = ("transactions", "goals", "settings", "category_feedback", "auth")

# Esquema v3 tal como lo crean FinanceDatabase.onCreate() y applyVersion2/3() de la app v3.
V3_SCHEMA = """
CREATE TABLE transactions (id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('expense','income')),
  amount REAL NOT NULL CHECK (amount >= 0), currency TEXT NOT NULL, date TEXT NOT NULL, merchant TEXT,
  description TEXT NOT NULL, category TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed',
  dedupe_key TEXT UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE goals (id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT, target REAL NOT NULL CHECK (target > 0),
  saved REAL NOT NULL DEFAULT 0, deadline TEXT, created_at INTEGER NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE category_feedback (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, day TEXT NOT NULL,
  transaction_id TEXT, capture TEXT NOT NULL, model TEXT NOT NULL, merchant TEXT, description TEXT NOT NULL,
  suggested_category TEXT NOT NULL, final_category TEXT NOT NULL, confidence REAL, shared INTEGER NOT NULL DEFAULT 0);
CREATE TABLE auth (id INTEGER PRIMARY KEY CHECK (id = 1), username TEXT NOT NULL, username_key TEXT NOT NULL,
  secret TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_status_date ON transactions(status, currency, date);
CREATE INDEX idx_transactions_page ON transactions(date, created_at, id);
"""

NOW = 1793040000000  # 2026-10-26, para las filas de prueba
SECRET = "pbkdf2-sha256$210000$" + "ab" * 16 + "$" + "cd" * 32

failures = []
passed = 0


def check(condition, label):
    global passed
    if condition:
        passed += 1
    else:
        failures.append(label)
        print(f"  FALLA: {label}")


def statements(sql):
    """Divide un archivo SQL en sentencias completas (respeta BEGIN...END de los triggers)."""
    result, buffer = [], ""
    for line in sql.splitlines(keepends=True):
        buffer += line
        if sqlite3.complete_statement(buffer):
            text = buffer.strip()
            if any(not l.strip().startswith("--") and l.strip() for l in text.splitlines()):
                result.append(text)
            buffer = ""
    if buffer.strip() and any(not l.strip().startswith("--") and l.strip() for l in buffer.splitlines()):
        raise ValueError(f"Sentencia incompleta al final del archivo: {buffer[:80]!r}")
    return result


def connect(path):
    conn = sqlite3.connect(path, isolation_level=None)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def build(path):
    conn = connect(path)
    conn.execute("BEGIN")
    for sql in statements(SCHEMA.read_text(encoding="utf-8")) + statements(SAMPLE.read_text(encoding="utf-8")):
        conn.execute(sql)
    conn.execute("COMMIT")
    conn.execute("VACUUM")
    return conn


def rejected(conn, sql, params=(), expect=None):
    """True si la sentencia viola una restricción (y, si se indica, con ese mensaje)."""
    conn.execute("SAVEPOINT t")
    try:
        conn.execute(sql, params)
        return False
    except sqlite3.IntegrityError as error:
        return expect is None or expect in str(error)
    finally:
        conn.execute("ROLLBACK TO t")
        conn.execute("RELEASE t")


def columns(conn, table):
    return [row[1] for row in conn.execute(f"PRAGMA table_info({table})")]


def run_script(conn, path):
    """Como FinanceDatabase.runScript(): los PRAGMA los maneja SQLiteOpenHelper."""
    for sql in statements(path.read_text(encoding="utf-8")):
        if not sql.upper().startswith("PRAGMA"):
            conn.execute(sql)


def normalized_schema(conn):
    """Objetos del esquema sin comentarios ni espacios (la app quita los comentarios al ejecutar)."""
    norm = lambda sql: re.sub(r"\s+", " ", re.sub(r"--[^\n]*", "", sql or "")).replace("( ", "(").replace(" )", ")").strip()  # noqa: E731
    return {(t, n, norm(s)) for t, n, s in conn.execute(
        "SELECT type, name, sql FROM sqlite_master WHERE name <> 'android_metadata'")}


def saved_matches_history(conn):
    """goals.saved debe ser siempre la suma de su historial de aportes."""
    return conn.execute("""SELECT COUNT(*) FROM goals g
        WHERE g.saved IS NOT (SELECT COALESCE(ROUND(SUM(amount), 2), 0) FROM goal_contributions WHERE goal_id = g.id)
    """).fetchone()[0] == 0


def staging_tables():
    """Las sentencias CREATE TEMP TABLE de FinanceDatabase.java (concatenaciones de Java incluidas)."""
    java = FINANCE_DATABASE_JAVA.read_text(encoding="utf-8")
    found = re.findall(r'"(CREATE TEMP TABLE \w+ \([^"]*)"((?:\s*\+\s*"[^"]*")*)', java)
    return {re.search(r"CREATE TEMP TABLE (\w+)", head).group(1): head + "".join(re.findall(r'"([^"]*)"', tail))
            for head, tail in found}


def insert_rows(conn, table, rows):
    for row in rows:
        conn.execute(f"INSERT INTO {table} ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))


def table_rows(conn, table):
    cur = conn.execute(f"SELECT * FROM {table}")
    names = [d[0] for d in cur.description]
    return [dict(zip(names, row)) for row in cur.fetchall()]


# --- Pasos de la app (espejo de FinanceDatabase.java) --------------------------

def app_upsert_goal(conn, goal, contributions=(), saved=None):
    """FinanceDatabase.upsertGoal(): el ahorro nunca se escribe directo, se registra en el historial."""
    created = not goal.get("id")
    goal_id = goal.get("id") or f"g-{NOW}"
    if created:
        conn.execute("INSERT INTO goals (id, name, emoji, target, saved, deadline, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
                     (goal_id, goal["name"], goal.get("emoji"), goal["target"], goal.get("deadline"), NOW))
    else:
        conn.execute("UPDATE goals SET name = ?, emoji = ?, target = ?, deadline = ? WHERE id = ?",
                     (goal["name"], goal.get("emoji"), goal["target"], goal.get("deadline"), goal_id))
    insert = "INSERT INTO goal_contributions (id, goal_id, kind, amount, created_at) VALUES (?, ?, ?, ?, ?)"
    taken = conn.execute("SELECT COUNT(*) FROM goal_contributions WHERE goal_id = ?", (goal_id,)).fetchone()[0]
    for i, amount in enumerate(contributions):
        conn.execute(insert, (f"{goal_id}-c{taken + i}", goal_id, "contribution", amount, NOW + taken + i))
    if saved is not None:
        current = conn.execute("SELECT saved FROM goals WHERE id = ?", (goal_id,)).fetchone()[0]
        delta = round(saved - current, 2)
        if abs(delta) >= 0.005:
            n = taken + len(contributions)
            conn.execute(insert, (f"{goal_id}-c{n}", goal_id, "initial" if created else "adjustment", delta, NOW + n))
    return goal_id


def app_rebuild_from_v3(conn):
    """FinanceDatabase.rebuildFromVersion3(), dentro de la transacción de onUpgrade."""
    for index in ("idx_transactions_date", "idx_transactions_status_date", "idx_transactions_page"):
        conn.execute(f"DROP INDEX IF EXISTS {index}")
    for table in V3_TABLES:
        conn.execute(f"ALTER TABLE {table} RENAME TO legacy_{table}")
    run_script(conn, SCHEMA)
    staging = staging_tables()
    for table in ("goal_contributions", "badge_unlocks"):  # v3 no las tenía: se importan vacías
        conn.execute(staging[f"legacy_{table}"])
    run_script(conn, IMPORT)
    conn.execute("INSERT OR IGNORE INTO auth SELECT * FROM legacy_auth")
    for table in V3_TABLES:
        conn.execute(f"DROP TABLE legacy_{table}")
    for table in ("goal_contributions", "badge_unlocks"):
        conn.execute(f"DROP TABLE temp.legacy_{table}")


def app_replace_all(conn, backup):
    """FinanceDatabase.replaceAll(): carga el respaldo en tablas temporales e importa."""
    staging = staging_tables()
    for table in BACKUP_TABLES:
        conn.execute(staging[f"legacy_{table}"])
        insert_rows(conn, f"legacy_{table}", backup.get(table, []))
    for table in USER_TABLES:
        conn.execute(f"DELETE FROM {table}")
    run_script(conn, IMPORT)
    for table in BACKUP_TABLES:
        conn.execute(f"DROP TABLE temp.legacy_{table}")


# --- Pruebas ---------------------------------------------------------------------

def test_structure(conn):
    print("1. Integridad y estructura")
    check(conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "integrity_check")
    check(conn.execute("PRAGMA foreign_key_check").fetchall() == [], "foreign_key_check sin filas")
    check(conn.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION, f"user_version = {SCHEMA_VERSION}")
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    check(tables == {"categories", "sources", "setting_definitions", "badges", "transactions", "goals",
                     "goal_contributions", "settings", "category_feedback", "badge_unlocks", "auth"},
          f"tablas esperadas ({sorted(tables)})")
    for view in [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'view'")]:
        try:
            check(len(conn.execute(f"SELECT * FROM {view}").fetchall()) > 0, f"vista {view} con filas")
        except sqlite3.Error as error:
            check(False, f"vista {view}: {error}")

    print("2. Las tablas de v3 conservan sus columnas")
    v3 = sqlite3.connect(":memory:")
    v3.executescript(V3_SCHEMA)
    for table in V3_TABLES:
        check(columns(conn, table) == columns(v3, table), f"columnas de {table} iguales a v3")


def test_queries(conn):
    print("3. Consultas de consultas.sql")
    for sql in statements(QUERIES.read_text(encoding="utf-8")):
        try:
            conn.execute(sql).fetchall()
            check(True, sql[:60])
        except sqlite3.Error as error:
            check(False, f"{sql[:60]!r}: {error}")

    one = lambda sql, *p: conn.execute(sql, p).fetchone()[0]  # noqa: E731
    income = one("SELECT SUM(amount) FROM transactions WHERE status='confirmed' AND type='income'")
    expense = one("SELECT SUM(amount) FROM transactions WHERE status='confirmed' AND type='expense'")
    check(one("SELECT balance FROM v_balance WHERE currency='COP'") == income - expense, "v_balance cuadra")
    check(one("SELECT COUNT(*) FROM v_pending_transactions") == 2, "2 movimientos pendientes")
    check(one("SELECT SUM(net) FROM v_monthly_summary") == income - expense, "v_monthly_summary cuadra con el saldo")
    check(one("SELECT SUM(total) FROM v_monthly_category_totals WHERE type='expense'") == expense,
          "totales por categoría suman el gasto")
    check(one("SELECT COUNT(*) FROM v_settings") == 9, "v_settings muestra los 9 ajustes")
    check(one("SELECT value FROM v_settings WHERE key='reduceEffects'") == "false", "ajuste sin guardar usa su valor por defecto")
    check(one("SELECT completed FROM v_goal_progress WHERE id='goal-02'") == 0, "meta sin completar")
    # El cursor de la consulta 4 corresponde a tx-1003 y la consulta 12 encuentra la alerta pendiente.
    check(one("SELECT created_at FROM transactions WHERE id='tx-1003'") == 1791502200000, "cursor de ejemplo = tx-1003")
    check(one("SELECT created_at FROM transactions WHERE id='tx-p002'") == 1793037300000, "alerta de ejemplo = tx-p002")
    check(one("""SELECT COUNT(*) FROM category_feedback f JOIN transactions t ON t.id = f.transaction_id
                 WHERE t.category <> f.final_category""") == 0, "las correcciones coinciden con la categoría guardada")
    # Fechas de creación de metas y correcciones coherentes con su día (hora de Colombia).
    check(one("""SELECT COUNT(*) FROM category_feedback
                 WHERE date(created_at / 1000, 'unixepoch', '-5 hours') <> day""") == 0, "created_at de correcciones = day")
    # Historial de aportes e insignias de ejemplo.
    saved = dict(conn.execute("SELECT id, saved FROM goals"))
    check(saved == {"goal-01": 2350000, "goal-02": 1900000, "goal-03": 800000}, f"ahorro de las metas = su historial ({saved})")
    check(saved_matches_history(conn), "goals.saved coincide con la suma de goal_contributions")
    check(one("SELECT COUNT(*) FROM v_goal_contributions") == 11, "11 aportes de ejemplo")
    check(one("SELECT COUNT(*) FROM v_badges") == 9 and one("SELECT SUM(unlocked) FROM v_badges") == 5,
          "9 insignias en el catálogo, 5 desbloqueadas")

    plan = " ".join(r[3] for r in conn.execute(
        "EXPLAIN QUERY PLAN SELECT COALESCE(SUM(amount),0) FROM transactions WHERE status='confirmed' AND currency='COP'"))
    check("idx_transactions_status_date" in plan, f"el saldo usa idx_transactions_status_date ({plan})")
    plan = " ".join(r[3] for r in conn.execute(
        "EXPLAIN QUERY PLAN SELECT * FROM transactions ORDER BY date DESC, created_at DESC, id DESC LIMIT 30"))
    check("idx_transactions_page" in plan, f"la paginación usa idx_transactions_page ({plan})")
    plan = " ".join(r[3] for r in conn.execute(
        "EXPLAIN QUERY PLAN SELECT * FROM goal_contributions WHERE goal_id = 'goal-01' ORDER BY created_at DESC"))
    check("idx_goal_contributions_goal" in plan, f"el historial usa idx_goal_contributions_goal ({plan})")


def test_app_writes(conn):
    print("4. Flujos de escritura de la app")
    conn.execute("SAVEPOINT app")
    try:
        tx = dict(id="new-1", type="expense", amount=18000.0, currency="COP", date="2026-10-26", merchant=None,
                  description="Almuerzo", category="food", source="manual", status="confirmed",
                  created_at=NOW, updated_at=NOW)
        # upsertTransaction(): UPDATE que no encuentra la fila y luego INSERT OR IGNORE.
        conn.execute("UPDATE transactions SET amount = ? WHERE id = ?", (1, tx["id"]))
        cur = conn.execute(f"INSERT OR IGNORE INTO transactions ({', '.join(tx)}) VALUES ({', '.join('?' * len(tx))})",
                           tuple(tx.values()))
        check(cur.rowcount == 1, "alta manual")
        conn.execute("UPDATE transactions SET amount = 21000, category = 'groceries', updated_at = ? WHERE id = 'new-1'",
                     (NOW + 1,))
        check(True, "edición")
        # Confirmar una alerta pendiente corrigiendo la categoría + registro de la corrección.
        conn.execute("""UPDATE transactions SET status = 'confirmed', category = 'transport', description = 'Gasolina',
                        updated_at = ? WHERE id = 'tx-p001'""", (NOW,))
        conn.execute("""INSERT INTO category_feedback (id, created_at, day, transaction_id, capture, model, merchant,
                        description, suggested_category, final_category, confidence, shared)
                        VALUES ('fb-new', ?, '2026-10-26', 'tx-p002', 'sms', 'bank-parser', 'Rappi', 'Rappi',
                        'food', 'groceries', NULL, 0)""", (NOW,))
        conn.execute("UPDATE transactions SET status='confirmed', category='groceries', updated_at=? WHERE id='tx-p002'",
                     (NOW,))
        check(True, "confirmar alertas pendientes")
        conn.execute("UPDATE transactions SET type = 'income', category = 'salary' WHERE id = 'new-1'")
        check(True, "cambio de tipo con categoría válida")
        # Misma alerta por SMS y notificación: el dedupe_key repetido se ignora en silencio.
        cur = conn.execute("""INSERT OR IGNORE INTO transactions (id, type, amount, currency, date, merchant, description,
                              category, source, status, dedupe_key, created_at, updated_at)
                              VALUES ('dup', 'expense', 45900, 'COP', '2026-10-26', 'Rappi', 'Rappi', 'food', 'sms',
                              'pending', 'fp-e8f6d2a0c5b3', ?, ?)""", (NOW, NOW))
        check(cur.rowcount == 0, "dedupe_key repetido ignorado (CONFLICT_IGNORE)")
        conn.execute("DELETE FROM transactions WHERE id = 'tx-0909'")
        check(conn.execute("SELECT transaction_id FROM category_feedback WHERE id = 'fb-02'").fetchone()[0] is None,
              "borrar movimiento deja la corrección con transaction_id NULL")

        # Metas: el ahorro se mueve solo con el historial.
        goal_id = app_upsert_goal(conn, {"name": "Moto", "emoji": "🏍️", "target": 9000000}, saved=1000000)
        rows = conn.execute("SELECT kind, amount FROM goal_contributions WHERE goal_id = ?", (goal_id,)).fetchall()
        check(rows == [("initial", 1000000.0)], f"meta nueva: el ahorro inicial queda como saldo inicial ({rows})")
        # Dos aportes rápidos (+250.000, +100.000) y además el usuario corrige el total a mano (1.200.000).
        app_upsert_goal(conn, {"id": goal_id, "name": "Moto", "emoji": "🏍️", "target": 9500000},
                        contributions=(250000, 100000), saved=1200000)
        rows = conn.execute("SELECT kind, amount FROM goal_contributions WHERE goal_id = ? ORDER BY created_at",
                            (goal_id,)).fetchall()
        check(rows == [("initial", 1000000.0), ("contribution", 250000.0), ("contribution", 100000.0),
                       ("adjustment", -150000.0)], f"aportes y ajuste en el historial ({rows})")
        check(conn.execute("SELECT saved, target FROM goals WHERE id = ?", (goal_id,)).fetchone() == (1200000.0, 9500000.0),
              "el ahorro de la meta es la suma del historial")
        # Editar solo el nombre no toca el historial.
        app_upsert_goal(conn, {"id": goal_id, "name": "Moto nueva", "target": 9500000}, saved=1200000)
        check(conn.execute("SELECT COUNT(*) FROM goal_contributions WHERE goal_id = ?", (goal_id,)).fetchone()[0] == 4,
              "editar la meta sin cambiar el ahorro no añade registros")
        # Borrar un aporte recalcula el ahorro; borrar la meta borra su historial.
        conn.execute("DELETE FROM goal_contributions WHERE id = ?", (f"{goal_id}-c1",))  # el aporte de 250.000
        check(conn.execute("SELECT saved FROM goals WHERE id = ?", (goal_id,)).fetchone()[0] == 950000.0,
              "borrar un aporte recalcula el ahorro")
        conn.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
        check(conn.execute("SELECT COUNT(*) FROM goal_contributions WHERE goal_id = ?", (goal_id,)).fetchone()[0] == 0,
              "borrar la meta borra su historial")
        check(saved_matches_history(conn), "el ahorro sigue cuadrando con el historial")

        # Insignias: INSERT OR IGNORE, como unlockBadges(); la fecha de la primera vez se conserva.
        conn.execute("INSERT OR IGNORE INTO badge_unlocks (badge_id, unlocked_at) VALUES ('streak-7', ?)", (NOW,))
        conn.execute("INSERT OR IGNORE INTO badge_unlocks (badge_id, unlocked_at) VALUES ('first-step', ?)", (NOW,))
        check(conn.execute("SELECT unlocked_at FROM badge_unlocks WHERE badge_id = 'first-step'").fetchone()[0]
              != NOW, "volver a ganar una insignia no cambia su fecha")
        check(conn.execute("SELECT unlocked FROM v_badges WHERE id = 'streak-7'").fetchone()[0] == 1, "insignia nueva guardada")

        # Ajustes con los formatos que escribe la app: String(value) e INSERT OR REPLACE.
        for key, value in [("currency", "USD"), ("budget", "0"), ("budget", "1250000.5"), ("onboarded", "false"),
                           ("secureScreen", "false"), ("reduceEffects", "true"), ("shareFeedback", "true"),
                           ("lockDelay", "0"), ("lockDelay", "300000"), ("automation.sms", "false"),
                           ("automation.notifications", "false"), ("budget", None)]:
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
        check(True, "ajustes válidos (INSERT OR REPLACE)")
        # Acceso: crear credenciales, intentos fallidos, cambiar contraseña, quitar el bloqueo.
        conn.execute("""INSERT OR REPLACE INTO auth (id, username, username_key, secret, created_at, updated_at,
                        failed_attempts, locked_until) VALUES (1, 'Ñandú', 'ñandú', ?, ?, ?, 0, 0)""", (SECRET, NOW, NOW))
        conn.execute("UPDATE auth SET failed_attempts = 5, locked_until = ? WHERE id = 1", (NOW + 30000,))
        conn.execute("INSERT OR REPLACE INTO auth VALUES (1, 'Ñandú', 'ñandú', ?, ?, ?, 0, 0)", (SECRET, NOW, NOW + 5))
        conn.execute("DELETE FROM auth")
        check(True, "acceso: crear, bloquear, cambiar y quitar")
        # Borrado total (wipe): también quita el acceso. Los catálogos se conservan.
        for table in USER_TABLES + ("auth",):
            conn.execute(f"DELETE FROM {table}")
        check(conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 15
              and conn.execute("SELECT COUNT(*) FROM badges").fetchone()[0] == 9, "borrado total conserva catálogos")
    except sqlite3.Error as error:
        check(False, f"flujo de la app falló: {error}")
    finally:
        conn.execute("ROLLBACK TO app")
        conn.execute("RELEASE app")


def test_rejections(conn):
    print("5. Datos incoherentes rechazados")
    cols = "id, type, amount, currency, date, merchant, description, category, source, status, created_at, updated_at"

    def tx(**over):
        row = dict(id="bad", type="expense", amount=1000, currency="COP", date="2026-10-26", merchant=None,
                   description="Prueba", category="food", source="manual", status="confirmed",
                   created_at=NOW, updated_at=NOW)
        row.update(over)
        return f"INSERT INTO transactions ({cols}) VALUES ({', '.join('?' * 12)})", tuple(row.values())

    cases = [
        ("monto cero", *tx(amount=0)),
        ("monto negativo", *tx(amount=-500)),
        ("tipo desconocido", *tx(type="gasto")),
        ("fecha inexistente 2026-02-30", *tx(date="2026-02-30")),
        ("fecha en otro formato", *tx(date="26/10/2026")),
        ("fecha con hora", *tx(date="2026-10-26 10:00")),
        ("moneda en minúsculas", *tx(currency="cop")),
        ("moneda de 2 letras", *tx(currency="CO")),
        ("categoría inexistente", *tx(category="comida")),
        ("origen inexistente", *tx(source="email")),
        ("estado desconocido", *tx(status="deleted")),
        ("concepto vacío", *tx(description="   ")),
        ("comercio vacío (debe ser NULL)", *tx(merchant="")),
        ("id NULL", *tx(id=None)),
        ("id repetido", *tx(id="tx-0801")),
        ("created_at en cero", *tx(created_at=0)),
    ]
    for label, sql, params in cases:
        check(rejected(conn, sql, params), f"transacción: {label}")

    trigger = "La categoría no corresponde al tipo de movimiento"
    check(rejected(conn, *tx(category="salary"), expect=trigger), "gasto con categoría Salario")
    check(rejected(conn, *tx(type="income", category="food"), expect=trigger), "ingreso con categoría Comida")
    check(rejected(conn, "UPDATE transactions SET type = 'expense' WHERE id = 'tx-0801'", expect=trigger),
          "pasar un ingreso Salario a gasto sin cambiar la categoría")
    check(rejected(conn, "UPDATE transactions SET category = 'freelance' WHERE id = 'tx-0802'", expect=trigger),
          "poner categoría de ingreso a un gasto")
    check(rejected(conn, "UPDATE transactions SET status = 'pending' WHERE id = 'tx-0802'", expect="pendiente"),
          "confirmado -> pendiente")
    check(rejected(conn, "UPDATE transactions SET created_at = 1 WHERE id = 'tx-0802'", expect="created_at"),
          "modificar created_at")
    check(rejected(conn, "INSERT INTO transactions SELECT 'dup2', type, amount, currency, date, merchant, description, "
                         "category, source, status, dedupe_key, created_at, updated_at FROM transactions WHERE id='tx-p002'"),
          "dedupe_key repetido")

    goal = "INSERT INTO goals (id, name, emoji, target, saved, deadline, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    for label, params in [
        ("objetivo cero", ("g", "Meta", None, 0, 0, None, NOW)),
        ("nombre vacío", ("g", " ", None, 100, 0, None, NOW)),
        ("fecha límite inválida", ("g", "Meta", None, 100, 0, "2026-13-01", NOW)),
    ]:
        check(rejected(conn, goal, params), f"meta: {label}")
    check(rejected(conn, goal, ("g", "Meta", None, 100, 50, None, NOW), expect="empieza en 0"),
          "meta nueva con ahorro sin historial")
    check(rejected(conn, "UPDATE goals SET saved = 9999999 WHERE id = 'goal-01'", expect="aporte o un ajuste"),
          "cambiar goals.saved sin registrar un aporte")

    contribution = "INSERT INTO goal_contributions (id, goal_id, kind, amount, created_at) VALUES (?, ?, ?, ?, ?)"
    for label, params in [
        ("monto cero", ("c", "goal-01", "contribution", 0, NOW)),
        ("aporte negativo (eso es un ajuste)", ("c", "goal-01", "contribution", -10, NOW)),
        ("saldo inicial negativo", ("c", "goal-01", "initial", -10, NOW)),
        ("tipo desconocido", ("c", "goal-01", "regalo", 10, NOW)),
        ("meta inexistente", ("c", "no-existe", "contribution", 10, NOW)),
        ("ajuste que deja la meta en negativo", ("c", "goal-03", "adjustment", -800001, NOW)),
        ("created_at en cero", ("c", "goal-01", "contribution", 10, 0)),
        ("id repetido", ("ap-0101", "goal-01", "contribution", 10, NOW)),
    ]:
        check(rejected(conn, contribution, params), f"aporte: {label}")
    check(conn.execute("SELECT saved FROM goals WHERE id = 'goal-03'").fetchone()[0] == 800000,
          "un aporte rechazado no cambia el ahorro")

    unlock = "INSERT INTO badge_unlocks (badge_id, unlocked_at) VALUES (?, ?)"
    check(rejected(conn, unlock, ("no-existe", NOW)), "insignia inexistente")
    check(rejected(conn, unlock, ("first-step", NOW)), "insignia desbloqueada dos veces")
    check(rejected(conn, unlock, ("streak-7", 0)), "insignia sin fecha")

    setting = "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
    for label, params in [
        ("clave desconocida", ("theme", "dark")),
        ("booleano 'yes'", ("onboarded", "yes")),
        ("booleano '1'", ("secureScreen", "1")),
        ("presupuesto negativo", ("budget", "-5")),
        ("presupuesto NaN", ("budget", "NaN")),
        ("presupuesto vacío", ("budget", "")),
        ("presupuesto con dos puntos", ("budget", "1.2.3")),
        ("lockDelay decimal", ("lockDelay", "1.5")),
        ("moneda en minúsculas", ("currency", "usd")),
    ]:
        check(rejected(conn, setting, params), f"ajuste: {label}")
    check(rejected(conn, "UPDATE settings SET value = 'maybe' WHERE key = 'onboarded'"), "ajuste: UPDATE inválido")

    feedback = """INSERT INTO category_feedback (id, created_at, day, transaction_id, capture, model, merchant, description,
                  suggested_category, final_category, confidence, shared) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"""
    base = ["f", NOW, "2026-10-26", None, "ai", "claude", None, "Café", "food", "groceries", 0.5, 0]

    def fb(index, value):
        row = list(base)
        row[index] = value
        return tuple(row)

    for label, params in [
        ("captura manual", fb(4, "manual")),
        ("modelo desconocido", fb(5, "gpt")),
        ("sugerida = final", fb(9, "food")),
        ("confianza > 1", fb(10, 1.5)),
        ("shared = 2", fb(11, 2)),
        ("movimiento inexistente", fb(3, "no-existe")),
        ("categoría inexistente", fb(8, "comida")),
        ("día inválido", fb(2, "ayer")),
    ]:
        check(rejected(conn, feedback, params), f"corrección: {label}")

    auth = "INSERT INTO auth VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    for label, params in [
        ("segunda fila", (2, "nico", "nico", SECRET, NOW, NOW, 0, 0)),
        ("usuario corto", (1, "ab", "ab", SECRET, NOW, NOW, 0, 0)),
        ("contraseña en texto plano", (1, "nico", "nico", "12345678", NOW, NOW, 0, 0)),
        ("intentos negativos", (1, "nico", "nico", SECRET, NOW, NOW, -1, 0)),
    ]:
        check(rejected(conn, auth, params), f"acceso: {label}")

    check(rejected(conn, "DELETE FROM categories WHERE id = 'food'"), "borrar una categoría en uso")
    check(rejected(conn, "DELETE FROM sources WHERE id = 'sms'"), "borrar un origen en uso")
    check(rejected(conn, "INSERT INTO categories VALUES ('x', 'X', '#FFFFFF', 'dots', 0, 0, 99)"),
          "categoría que no sirve ni para gastos ni para ingresos")


# Filas v3 con todo lo que el esquema no admite (columnas: las de v3).
DIRTY_TRANSACTIONS = [
    dict(id="ok", type="expense", amount=18000, currency="COP", date="2026-10-01", merchant="Juan Valdez",
         description="Café", category="food", source="manual", status="confirmed", dedupe_key=None,
         created_at=1791000000000, updated_at=1791000000000),
    dict(id="moneda", type="expense", amount=10, currency=" usd", date="2026-10-02", merchant=None,
         description="Libro", category="education", source="ai", status="confirmed", dedupe_key=None,
         created_at=1791000000001, updated_at=1791000000001),
    dict(id="fecha", type="expense", amount=5000, currency="COP", date="2026-13-01", merchant=None,
         description="Pan", category="groceries", source="voice", status="confirmed", dedupe_key=None,
         created_at=1791502200000, updated_at=1791502200000),  # 2026-10-08 18:30 en Colombia
    dict(id="cero", type="expense", amount=0, currency="COP", date="2026-10-03", merchant=None,
         description="Nada", category="other", source="manual", status="confirmed", dedupe_key=None,
         created_at=1791000000003, updated_at=1791000000003),
    dict(id="ingreso-comida", type="income", amount=20000, currency="COP", date="2026-10-04", merchant=None,
         description="Me pagaron el almuerzo", category="food", source="ai", status="confirmed", dedupe_key=None,
         created_at=1791000000004, updated_at=1791000000004),
    dict(id="gasto-salario", type="expense", amount=30000, currency="COP", date="2026-10-05", merchant=None,
         description="Cambié el tipo", category="salary", source="manual", status="confirmed", dedupe_key=None,
         created_at=1791000000005, updated_at=1791000000005),
    dict(id="categoria", type="expense", amount=7000, currency="COP", date="2026-10-06", merchant="",
         description="", category="comida", source="email", status="borrado", dedupe_key="",
         created_at=0, updated_at=0),
]
DIRTY_GOALS = [
    dict(id="g-ok", name="Viaje", emoji="🏖️", target=1000000, saved=-5, deadline="pronto", created_at=1791000000000),
    dict(id="g-nombre", name="  ", emoji=None, target=500000, saved=100, deadline="2026-12-31", created_at=1791000000000),
]
DIRTY_SETTINGS = [
    dict(key="currency", value="COP"), dict(key="budget", value="NaN"), dict(key="onboarded", value="true"),
    dict(key="theme", value="dark"), dict(key="lockDelay", value="300000"), dict(key="shareFeedback", value=None),
]
DIRTY_FEEDBACK = [
    dict(id="f-ok", created_at=1791000000000, day="2026-10-01", transaction_id="ok", capture="ai", model="claude",
         merchant="", description="Café", suggested_category="shopping", final_category="food", confidence=1.5, shared=1),
    dict(id="f-huerfana", created_at=1791000000000, day="ayer", transaction_id="borrado-hace-tiempo", capture="voice",
         model="rules", merchant=None, description="Taxi", suggested_category="other", final_category="transport",
         confidence=0.4, shared=0),
    dict(id="f-manual", created_at=1791000000000, day="2026-10-01", transaction_id=None, capture="manual", model="rules",
         merchant=None, description="X", suggested_category="other", final_category="food", confidence=None, shared=0),
    dict(id="f-igual", created_at=1791000000000, day="2026-10-01", transaction_id=None, capture="ai", model="claude",
         merchant=None, description="X", suggested_category="food", final_category="food", confidence=None, shared=0),
]
# Solo en respaldos v3+ (formato de la app con historial): una meta cuyo historial cuadra,
# otra cuyo historial no suma su ahorro, y filas inválidas.
HISTORY_GOALS = [
    dict(id="g-hist", name="Carro", emoji="🚗", target=20000000, saved=200, deadline=None, created_at=1791000000000),
    dict(id="g-descuadre", name="Casa", emoji="🏠", target=90000000, saved=500, deadline=None, created_at=1791000000000),
]
DIRTY_CONTRIBUTIONS = [
    dict(id="c-1", goal_id="g-hist", kind="contribution", amount=300, created_at=1791000000001),
    dict(id="c-2", goal_id="g-hist", kind="adjustment", amount=-100, created_at=1791000000002),
    dict(id="c-3", goal_id="g-descuadre", kind="contribution", amount=800, created_at=1791000000003),
    dict(id="c-neg", goal_id="g-hist", kind="contribution", amount=-5, created_at=1791000000004),
    dict(id="c-huerfano", goal_id="no-existe", kind="contribution", amount=10, created_at=1791000000005),
    dict(id="c-tipo", goal_id="g-hist", kind="regalo", amount=10, created_at=1791000000006),
    dict(id="c-cero", goal_id="g-hist", kind="adjustment", amount=0, created_at=1791000000007),
]
DIRTY_UNLOCKS = [
    dict(badge_id="first-step", unlocked_at=1791000000000),
    dict(badge_id=" autopilot ", unlocked_at=0),
    dict(badge_id="no-existe", unlocked_at=1791000000000),
]


def check_imported(conn, label):
    """Lo que debe quedar tras importar las filas DIRTY_* (migración o restauración)."""
    one = lambda sql, *p: conn.execute(sql, p).fetchone()  # noqa: E731
    ids = {r[0] for r in conn.execute("SELECT id FROM transactions")}
    check(ids == {"ok", "moneda", "fecha", "ingreso-comida", "gasto-salario", "categoria"},
          f"{label}: se descarta solo el movimiento con monto 0 ({sorted(ids)})")
    check(one("SELECT currency FROM transactions WHERE id='moneda'")[0] == "USD", f"{label}: moneda normalizada")
    check(one("SELECT date FROM transactions WHERE id='fecha'")[0] == "2026-10-08", f"{label}: fecha inválida -> día de creación")
    check(one("SELECT category FROM transactions WHERE id='ingreso-comida'")[0] == "other", f"{label}: ingreso en Comida -> Otros")
    check(one("SELECT category FROM transactions WHERE id='gasto-salario'")[0] == "other", f"{label}: gasto en Salario -> Otros")
    row = one("SELECT category, source, status, merchant, description, dedupe_key, created_at > 0, updated_at > 0 "
              "FROM transactions WHERE id='categoria'")
    check(row == ("other", "manual", "pending", None, "Sin concepto", None, 1, 1),
          f"{label}: categoría, origen, estado, comercio, concepto y fechas corregidos ({row})")
    check(one("SELECT saved, deadline FROM goals WHERE id='g-ok'") == (0.0, None), f"{label}: meta con ahorro y fecha corregidos")
    check(one("SELECT name, saved FROM goals WHERE id='g-nombre'") == ("Meta", 100.0), f"{label}: meta sin nombre conserva su ahorro")
    history = conn.execute("SELECT kind, amount FROM goal_contributions WHERE goal_id='g-nombre'").fetchall()
    check(history == [("initial", 100.0)], f"{label}: el ahorro sin historial queda como saldo inicial ({history})")
    check(conn.execute("SELECT COUNT(*) FROM goal_contributions WHERE goal_id='g-ok'").fetchone()[0] == 0,
          f"{label}: una meta en 0 no recibe historial")
    check(saved_matches_history(conn), f"{label}: el ahorro coincide con el historial")
    settings = dict(conn.execute("SELECT key, value FROM settings"))
    check(settings == {"currency": "COP", "onboarded": "true", "lockDelay": "300000", "shareFeedback": None},
          f"{label}: ajustes inválidos o desconocidos descartados ({settings})")
    feedback = {r[0]: r[1:] for r in conn.execute(
        "SELECT id, transaction_id, day, merchant, confidence FROM category_feedback")}
    check(set(feedback) == {"f-ok", "f-huerfana"}, f"{label}: correcciones inválidas descartadas ({sorted(feedback)})")
    check(feedback.get("f-ok") == ("ok", "2026-10-01", None, None), f"{label}: corrección válida limpia ({feedback.get('f-ok')})")
    check(feedback.get("f-huerfana", (0,))[0] is None, f"{label}: corrección huérfana sin transaction_id")
    check(conn.execute("PRAGMA foreign_key_check").fetchall() == [], f"{label}: claves foráneas válidas")


def dirty_v3_database():
    conn = connect(":memory:")
    conn.executescript(V3_SCHEMA)
    conn.execute("PRAGMA foreign_keys = ON")
    insert_rows(conn, "transactions", DIRTY_TRANSACTIONS)
    insert_rows(conn, "goals", DIRTY_GOALS)
    insert_rows(conn, "settings", DIRTY_SETTINGS)
    insert_rows(conn, "category_feedback", DIRTY_FEEDBACK)
    conn.execute("INSERT INTO auth VALUES (1, 'Ñandú', 'ñandú', ?, ?, ?, 2, 0)", (SECRET, NOW, NOW))
    return conn


def test_migration_from_v3():
    print("6. Migración desde v3 (FinanceDatabase.rebuildFromVersion3)")
    conn = dirty_v3_database()
    try:
        conn.execute("BEGIN")  # onUpgrade corre en una transacción, con las claves foráneas activas
        app_rebuild_from_v3(conn)
        conn.execute("COMMIT")
        check(True, "migración sin errores")
    except sqlite3.Error as error:
        check(False, f"la migración falló: {error}")
        return
    check_imported(conn, "migración v3")
    check(conn.execute("SELECT username, failed_attempts FROM auth").fetchone() == ("Ñandú", 2), "migración v3: conserva el acceso")
    check(conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "migración v3: integrity_check")
    fresh = connect(":memory:")
    run_script(fresh, SCHEMA)
    check(normalized_schema(conn) == normalized_schema(fresh), "migración v3: el esquema queda igual al de una base nueva")


def test_migration_from_v4(sample):
    print("7. Migración v4 -> v5 (migracion_v5.sql)")
    conn = connect(":memory:")
    run_script(conn, SCHEMA_V4)
    conn.execute(f"ATTACH DATABASE '{sample}' AS sample")
    for table in ("transactions", "settings", "category_feedback"):
        conn.execute(f"INSERT INTO main.{table} SELECT * FROM sample.{table}")
    # En v4 el ahorro se escribía directo en la meta.
    conn.execute("INSERT INTO main.goals SELECT * FROM sample.goals")
    conn.execute("INSERT INTO main.goals VALUES ('g-cero', 'Sin ahorro', NULL, 100000, 0, NULL, ?)", (NOW,))
    conn.execute("DETACH DATABASE sample")
    before = dict(conn.execute("SELECT id, saved FROM goals"))
    try:
        conn.execute("BEGIN")
        run_script(conn, MIGRATION_V5)
        conn.execute("COMMIT")
        check(True, "migración v4 -> v5 sin errores")
    except sqlite3.Error as error:
        check(False, f"la migración v4 -> v5 falló: {error}")
        return
    check(dict(conn.execute("SELECT id, saved FROM goals")) == before, "migración v4: cada meta conserva su ahorro")
    initial = dict(conn.execute("SELECT goal_id, amount FROM goal_contributions WHERE kind = 'initial'"))
    check(initial == {k: v for k, v in before.items() if v > 0}, f"migración v4: el ahorro pasa a saldo inicial ({initial})")
    check(saved_matches_history(conn), "migración v4: el ahorro coincide con el historial")
    check(conn.execute("SELECT COUNT(*) FROM badges").fetchone()[0] == 9, "migración v4: catálogo de insignias")
    check(conn.execute("PRAGMA foreign_key_check").fetchall() == [], "migración v4: claves foráneas válidas")
    fresh = connect(":memory:")
    run_script(fresh, SCHEMA)
    diff = sorted(name for _, name, _ in normalized_schema(conn) ^ normalized_schema(fresh))
    check(not diff, f"migración v4: el esquema queda igual al de una base nueva (diferencias: {diff})")


def test_restore(conn):
    print("8. Restaurar respaldos (FinanceDatabase.replaceAll)")
    staging = staging_tables()
    check(set(staging) == {f"legacy_{t}" for t in BACKUP_TABLES}, f"FinanceDatabase.java define las tablas temporales ({sorted(staging)})")
    v3 = sqlite3.connect(":memory:")
    v3.executescript(V3_SCHEMA)
    conn.execute("SAVEPOINT columnas")
    for table in ("transactions", "goals", "settings", "category_feedback"):
        conn.execute(staging[f"legacy_{table}"])
        staged = [r[1] for r in conn.execute(f"PRAGMA temp.table_info(legacy_{table})")]
        check(staged == columns(v3, table), f"tabla temporal legacy_{table} con las columnas de v3")
    for table in ("goal_contributions", "badge_unlocks"):
        conn.execute(staging[f"legacy_{table}"])
        staged = [r[1] for r in conn.execute(f"PRAGMA temp.table_info(legacy_{table})")]
        check(staged == columns(conn, table), f"tabla temporal legacy_{table} con las columnas de la tabla real")
    conn.execute("ROLLBACK TO columnas")
    conn.execute("RELEASE columnas")

    # Respaldo antiguo con datos inválidos (y, para v3+, historial e insignias inválidos).
    conn.execute("SAVEPOINT restore")
    try:
        conn.execute("INSERT INTO auth VALUES (1, 'nico', 'nico', ?, ?, ?, 0, 0)", (SECRET, NOW, NOW))
        app_replace_all(conn, {
            "transactions": DIRTY_TRANSACTIONS, "goals": DIRTY_GOALS + HISTORY_GOALS,
            "settings": DIRTY_SETTINGS, "category_feedback": DIRTY_FEEDBACK,
            "goal_contributions": DIRTY_CONTRIBUTIONS, "badge_unlocks": DIRTY_UNLOCKS,
        })
        check(True, "restauración sin errores")
        check_imported(conn, "restauración")
        hist = conn.execute("SELECT id, kind, amount FROM goal_contributions WHERE goal_id='g-hist' ORDER BY id").fetchall()
        check(hist == [("c-1", "contribution", 300.0), ("c-2", "adjustment", -100.0)],
              f"restauración: historial válido conservado, filas inválidas descartadas ({hist})")
        rows = conn.execute("SELECT kind, amount FROM goal_contributions WHERE goal_id='g-descuadre' ORDER BY amount").fetchall()
        check(rows == [("adjustment", -300.0), ("contribution", 800.0)]
              and conn.execute("SELECT saved FROM goals WHERE id='g-descuadre'").fetchone()[0] == 500.0,
              f"restauración: si el historial no cuadra, un ajuste conserva el ahorro guardado ({rows})")
        unlocks = dict(conn.execute("SELECT badge_id, unlocked_at > 0 FROM badge_unlocks"))
        check(unlocks == {"first-step": 1, "autopilot": 1}, f"restauración: insignias válidas ({unlocks})")
        check(conn.execute("SELECT username FROM auth").fetchone() == ("nico",), "restauración: conserva el acceso")
    except sqlite3.Error as error:
        check(False, f"la restauración falló: {error}")
    finally:
        conn.execute("ROLLBACK TO restore")
        conn.execute("RELEASE restore")

    # Respaldo actual (exportar + restaurar): vuelve exactamente lo mismo.
    conn.execute("SAVEPOINT roundtrip")
    try:
        backup = {table: table_rows(conn, table) for table in BACKUP_TABLES}
        app_replace_all(conn, backup)
        same = {table: sorted(map(tuple, (r.values() for r in table_rows(conn, table)))) ==
                       sorted(map(tuple, (r.values() for r in backup[table]))) for table in BACKUP_TABLES}
        check(all(same.values()), f"respaldo de ida y vuelta sin cambios ({same})")
    except sqlite3.Error as error:
        check(False, f"el respaldo de ida y vuelta falló: {error}")
    finally:
        conn.execute("ROLLBACK TO roundtrip")
        conn.execute("RELEASE roundtrip")

    # La importación acepta exactamente los valores de ajustes que acepta el trigger.
    settings_import = statements(IMPORT.read_text(encoding="utf-8"))[0]
    candidates = ["true", "false", "TRUE", "1", "", "0", "12.5", "1.2.3", ".5", "-5", "NaN", "60000", "COP", "cop", "US"]
    mismatches = []
    for key in [r[0] for r in conn.execute("SELECT key FROM setting_definitions")]:
        for value in candidates:
            by_trigger = not rejected(conn, "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
            conn.execute("SAVEPOINT s")
            conn.execute("CREATE TEMP TABLE legacy_settings (key TEXT, value TEXT)")
            conn.execute("INSERT INTO legacy_settings VALUES (?, ?)", (key, value))
            conn.execute("DELETE FROM settings")
            conn.execute(settings_import)
            by_import = conn.execute("SELECT COUNT(*) FROM settings").fetchone()[0] == 1
            conn.execute("ROLLBACK TO s")
            conn.execute("RELEASE s")
            if by_trigger != by_import:
                mismatches.append((key, value, by_trigger, by_import))
    check(mismatches == [], f"importar.sql valida los ajustes igual que el trigger ({mismatches})")


def main():
    fd, temp = tempfile.mkstemp(suffix=".db", dir=HERE)
    os.close(fd)
    try:
        conn = build(temp)
        test_structure(conn)
        test_queries(conn)
        test_app_writes(conn)
        test_rejections(conn)
        test_migration_from_v3()
        test_migration_from_v4(temp)
        test_restore(conn)
        check(conn.execute("PRAGMA foreign_key_check").fetchall() == [], "datos de ejemplo intactos tras las pruebas")
        check(conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 46, "los 46 movimientos de ejemplo siguen ahí")
        conn.close()
        if failures:
            print(f"\n{len(failures)} prueba(s) fallaron; no se reemplazó {OUTPUT.name}.")
            return 1
        os.replace(temp, OUTPUT)
    except PermissionError:
        print(f"\nNo se pudo reemplazar {OUTPUT.name}: ciérralo en DB Browser y vuelve a correr el script.")
        return 1
    finally:
        if os.path.exists(temp):
            os.remove(temp)

    conn = sqlite3.connect(OUTPUT)
    counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
              for t in ("transactions", "goals", "goal_contributions", "settings", "category_feedback", "badge_unlocks",
                        "auth")}
    conn.close()
    print(f"\n{passed} pruebas superadas. Base creada: {OUTPUT}")
    print("Filas:", ", ".join(f"{t}={n}" for t, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
