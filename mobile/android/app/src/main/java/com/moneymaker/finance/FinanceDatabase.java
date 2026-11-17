package com.moneymaker.finance;

import android.content.ContentValues;
import android.content.Context;
import android.content.res.AssetManager;
import android.database.Cursor;
import android.database.DatabaseUtils;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Base de datos local (fuente de verdad). Vive en el almacenamiento privado de
 * la app y queda excluida de los respaldos del sistema (ver data_extraction_rules.xml).
 *
 * Las pantallas piden agregados (totales por mes y categoría, páginas de movimientos)
 * calculados en SQL, en lugar de cargar toda la tabla en memoria.
 *
 * El esquema está en database/esquema.sql (el mismo archivo que se abre en DB Browser),
 * que Gradle copia a assets/db/. Ahí están los catálogos, las claves foráneas, los CHECK
 * y los triggers que rechazan datos incoherentes. El ahorro de una meta es la suma de su
 * historial (goal_contributions) y lo mantienen los triggers: nunca se escribe directo.
 */
public final class FinanceDatabase extends SQLiteOpenHelper {

    private static final String NAME = "moneymaker.db";
    private static final int VERSION = 5;
    private static final int MAX_PAGE = 200;

    private static final String SCHEMA_SCRIPT = "db/esquema.sql";
    /** Copia filas antiguas o de un respaldo (tablas legacy_*) corrigiendo lo que el esquema no admite. */
    private static final String IMPORT_SCRIPT = "db/importar.sql";
    /** v4 -> v5: historial de aportes e insignias desbloqueadas. */
    private static final String MIGRATION_V5_SCRIPT = "db/migracion_v5.sql";

    /**
     * Tablas de datos del usuario, en el orden en que se vacían (las metas arrastran su historial).
     * Los catálogos (categorías, orígenes, ajustes, insignias) son fijos.
     */
    private static final String[] USER_TABLES = {
        "category_feedback", "transactions", "goals", "goal_contributions", "settings", "badge_unlocks"
    };

    /** Tablas temporales sin restricciones donde se cargan los datos antes de importar.sql. */
    private static final String[] STAGING_TABLES = {
        "CREATE TEMP TABLE legacy_transactions (id TEXT, type TEXT, amount REAL, currency TEXT, date TEXT,"
                + " merchant TEXT, description TEXT, category TEXT, source TEXT, status TEXT, dedupe_key TEXT,"
                + " created_at INTEGER, updated_at INTEGER)",
        "CREATE TEMP TABLE legacy_goals (id TEXT, name TEXT, emoji TEXT, target REAL, saved REAL, deadline TEXT,"
                + " created_at INTEGER)",
        "CREATE TEMP TABLE legacy_settings (key TEXT, value TEXT)",
        "CREATE TEMP TABLE legacy_category_feedback (id TEXT, created_at INTEGER, day TEXT, transaction_id TEXT,"
                + " capture TEXT, model TEXT, merchant TEXT, description TEXT, suggested_category TEXT,"
                + " final_category TEXT, confidence REAL, shared INTEGER)",
        "CREATE TEMP TABLE legacy_goal_contributions (id TEXT, goal_id TEXT, kind TEXT, amount REAL,"
                + " created_at INTEGER)",
        "CREATE TEMP TABLE legacy_badge_unlocks (badge_id TEXT, unlocked_at INTEGER)",
    };

    /** Tablas que viajan en el respaldo (y que importar.sql lee de legacy_*). */
    private static final String[] BACKUP_TABLES = {
        "transactions", "goals", "settings", "category_feedback", "goal_contributions", "badge_unlocks"
    };

    /** Orden total y estable para paginar con cursor. */
    private static final String NEWEST_FIRST = "date DESC, created_at DESC, id DESC";

    private static volatile FinanceDatabase instance;

    public static FinanceDatabase get(Context context) {
        if (instance == null) {
            synchronized (FinanceDatabase.class) {
                if (instance == null) {
                    instance = new FinanceDatabase(context.getApplicationContext());
                }
            }
        }
        return instance;
    }

    private final AssetManager assets;

    private FinanceDatabase(Context context) {
        super(context, NAME, null, VERSION);
        assets = context.getAssets();
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        db.enableWriteAheadLogging();
        // SQLite no aplica las claves foráneas si no se activan en cada conexión.
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        runScript(db, SCHEMA_SCRIPT);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // v1 a v3 se completan como eran y luego se reconstruyen con el esquema actual.
        if (oldVersion < 2) {
            applyVersion2(db);
        }
        if (oldVersion < 3) {
            applyVersion3(db);
        }
        if (oldVersion < 4) {
            rebuildFromVersion3(db);
            return; // esquema.sql ya es la versión actual
        }
        if (oldVersion < 5) {
            runScript(db, MIGRATION_V5_SCRIPT);
        }
    }

    /** v2: correcciones de categoría (feedback loop) e índices para agregados y paginación. */
    private static void applyVersion2(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS category_feedback ("
                + "id TEXT PRIMARY KEY,"
                + "created_at INTEGER NOT NULL,"
                + "day TEXT NOT NULL,"
                + "transaction_id TEXT,"
                + "capture TEXT NOT NULL,"
                + "model TEXT NOT NULL,"
                + "merchant TEXT,"
                + "description TEXT NOT NULL,"
                + "suggested_category TEXT NOT NULL,"
                + "final_category TEXT NOT NULL,"
                + "confidence REAL,"
                + "shared INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_transactions_status_date ON transactions(status, currency, date)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_transactions_page ON transactions(date, created_at, id)");
    }

    /** v3: usuario y contraseña de acceso (una sola fila). Solo se guarda el derivado PBKDF2. */
    private static void applyVersion3(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS auth ("
                + "id INTEGER PRIMARY KEY CHECK (id = 1),"
                + "username TEXT NOT NULL,"
                + "username_key TEXT NOT NULL,"
                + "secret TEXT NOT NULL,"
                + "created_at INTEGER NOT NULL,"
                + "updated_at INTEGER NOT NULL,"
                + "failed_attempts INTEGER NOT NULL DEFAULT 0,"
                + "locked_until INTEGER NOT NULL DEFAULT 0)");
    }

    /**
     * v3 -> actual. v4 añadió catálogos, claves foráneas, CHECK y triggers, y SQLite no deja
     * añadir restricciones a una tabla existente: las tablas v3 se renombran a legacy_*, se crea
     * el esquema actual y se copian los datos corrigiendo lo que no admite (el ahorro de cada meta
     * pasa a su historial como saldo inicial). Todo ocurre dentro de la transacción de onUpgrade:
     * si algo falla, la base sigue en v3.
     */
    private void rebuildFromVersion3(SQLiteDatabase db) {
        // Los índices siguen a la tabla renombrada y sus nombres chocarían con los nuevos.
        for (String index : new String[] {"idx_transactions_date", "idx_transactions_status_date", "idx_transactions_page"}) {
            db.execSQL("DROP INDEX IF EXISTS " + index);
        }
        String[] tables = {"transactions", "goals", "settings", "category_feedback", "auth"};
        for (String table : tables) {
            db.execSQL("ALTER TABLE " + table + " RENAME TO legacy_" + table);
        }
        runScript(db, SCHEMA_SCRIPT);
        // v3 no tenía historial de aportes ni insignias: importar.sql las lee vacías.
        createStaging(db, "goal_contributions", "badge_unlocks");
        runScript(db, IMPORT_SCRIPT);
        // Las credenciales de la app ya cumplen las restricciones nuevas; mismas columnas que v3.
        db.execSQL("INSERT OR IGNORE INTO auth SELECT * FROM legacy_auth");
        for (String table : tables) {
            db.execSQL("DROP TABLE legacy_" + table);
        }
        dropStaging(db, "goal_contributions", "badge_unlocks");
    }

    private static void createStaging(SQLiteDatabase db, String... tables) {
        for (String table : tables) {
            String prefix = "CREATE TEMP TABLE legacy_" + table + " (";
            for (String sql : STAGING_TABLES) {
                if (sql.startsWith(prefix)) {
                    db.execSQL(sql);
                }
            }
        }
    }

    private static void dropStaging(SQLiteDatabase db, String... tables) {
        for (String table : tables) {
            db.execSQL("DROP TABLE temp.legacy_" + table);
        }
    }

    /** Ejecuta un script de assets/db/. Los PRAGMA del archivo los maneja SQLiteOpenHelper. */
    private void runScript(SQLiteDatabase db, String asset) {
        for (String sql : SqlScript.statements(readAsset(asset))) {
            if (!sql.regionMatches(true, 0, "PRAGMA", 0, 6)) {
                db.execSQL(sql);
            }
        }
    }

    private String readAsset(String name) {
        try (InputStream in = assets.open(name)) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8 * 1024];
            int read;
            while ((read = in.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
            }
            return new String(buffer.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("No se encontró el script " + name + " en los assets", e);
        }
    }

    // --- Transacciones -------------------------------------------------------

    /** Todas las transacciones (solo para respaldos). */
    public List<ContentValues> listTransactions(String fromDate, String toDate) {
        if (fromDate != null && toDate != null) {
            return rows("SELECT * FROM transactions WHERE date BETWEEN ? AND ? ORDER BY " + NEWEST_FIRST, args(fromDate, toDate));
        }
        return rows("SELECT * FROM transactions ORDER BY " + NEWEST_FIRST, args());
    }

    /**
     * Página de movimientos, del más reciente al más antiguo.
     *
     * @param filter "all" | "expense" | "income" | "pending"
     * @param cursor última fila de la página anterior (date, created_at, id) o null
     */
    public List<ContentValues> transactionsPage(String filter, ContentValues cursor, int limit) {
        StringBuilder where = new StringBuilder("1 = 1");
        List<String> params = args();
        if ("pending".equals(filter)) {
            where.append(" AND status = 'pending'");
        } else if ("expense".equals(filter) || "income".equals(filter)) {
            where.append(" AND status = 'confirmed' AND type = ?");
            params.add(filter);
        }
        if (cursor != null) {
            String date = cursor.getAsString("date");
            String createdAt = String.valueOf(cursor.getAsLong("created_at"));
            where.append(" AND (date < ? OR (date = ? AND (created_at < ? OR (created_at = ? AND id < ?))))");
            params.addAll(Arrays.asList(date, date, createdAt, createdAt, cursor.getAsString("id")));
        }
        int pageSize = Math.max(1, Math.min(limit, MAX_PAGE));
        return rows("SELECT * FROM transactions WHERE " + where + " ORDER BY " + NEWEST_FIRST + " LIMIT " + pageSize, params);
    }

    /** Inserta o actualiza. Devuelve el id, o null si dedupe_key ya existía. */
    public String upsertTransaction(ContentValues values) {
        long now = System.currentTimeMillis();
        String id = values.getAsString("id");
        if (id == null || id.isEmpty()) {
            id = UUID.randomUUID().toString();
            values.put("id", id);
            values.put("created_at", now);
        }
        values.put("updated_at", now);
        SQLiteDatabase db = getWritableDatabase();
        int updated = db.update("transactions", values, "id = ?", new String[] {id});
        if (updated == 0) {
            if (!values.containsKey("created_at")) {
                values.put("created_at", now);
            }
            long row = db.insertWithOnConflict("transactions", null, values, SQLiteDatabase.CONFLICT_IGNORE);
            if (row == -1) {
                return null;
            }
        }
        return id;
    }

    /** Inserción masiva en una sola transacción SQL (mucho más rápida que una llamada por fila). */
    public int insertTransactions(List<ContentValues> rows) {
        long now = System.currentTimeMillis();
        int inserted = 0;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            for (int i = 0; i < rows.size(); i++) {
                ContentValues values = rows.get(i);
                if (values.getAsString("id") == null) {
                    values.put("id", UUID.randomUUID().toString());
                }
                if (!values.containsKey("created_at")) {
                    values.put("created_at", now - i);
                }
                if (!values.containsKey("status")) {
                    values.put("status", "confirmed");
                }
                values.put("updated_at", now);
                if (db.insertWithOnConflict("transactions", null, values, SQLiteDatabase.CONFLICT_IGNORE) != -1) {
                    inserted++;
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return inserted;
    }

    public ContentValues getTransaction(String id) {
        List<ContentValues> found = rows("SELECT * FROM transactions WHERE id = ?", args(id));
        return found.isEmpty() ? null : found.get(0);
    }

    public boolean deleteTransaction(String id) {
        return getWritableDatabase().delete("transactions", "id = ?", new String[] {id}) > 0;
    }

    /** Ids de todos los movimientos (para limpiar fotos de recibo huérfanas). */
    public java.util.Set<String> transactionIds() {
        java.util.Set<String> ids = new java.util.HashSet<>();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id FROM transactions", null)) {
            while (c.moveToNext()) {
                ids.add(c.getString(0));
            }
        }
        return ids;
    }

    /** ¿Ya se registró automáticamente un movimiento igual en la ventana reciente? */
    public boolean hasRecentAutomatedDuplicate(String type, double amount, String date, long sinceMillis) {
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT 1 FROM transactions WHERE type = ? AND ABS(amount - ?) < 0.005 AND date = ?"
                        + " AND source IN ('sms', 'notification') AND created_at >= ? LIMIT 1",
                new String[] {type, String.valueOf(amount), date, String.valueOf(sinceMillis)})) {
            return c.moveToFirst();
        }
    }

    // --- Agregados -----------------------------------------------------------

    public double balance(String currency) {
        return scalarDouble("SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0)"
                + " FROM transactions WHERE status = 'confirmed' AND currency = ?", currency);
    }

    public int pendingCount() {
        return (int) scalarDouble("SELECT COUNT(*) FROM transactions WHERE status = 'pending'");
    }

    /** Totales confirmados por mes, tipo y categoría dentro de un rango de fechas. */
    public List<ContentValues> monthlyTotals(String currency, String fromDate, String toDate) {
        return rows("SELECT substr(date, 1, 7) AS month, type, category, SUM(amount) AS total, COUNT(*) AS count"
                + " FROM transactions WHERE status = 'confirmed' AND currency = ? AND date BETWEEN ? AND ?"
                + " GROUP BY month, type, category", args(currency, fromDate, toDate));
    }

    public List<ContentValues> merchantTotals(String currency, String month, int limit) {
        return rows("SELECT merchant, SUM(amount) AS total FROM transactions"
                + " WHERE status = 'confirmed' AND type = 'expense' AND currency = ? AND date LIKE ?"
                + " AND merchant IS NOT NULL AND merchant <> ''"
                + " GROUP BY merchant ORDER BY total DESC LIMIT " + Math.max(1, Math.min(limit, 50)),
                args(currency, month + "-%"));
    }

    public List<ContentValues> dailyExpenses(String currency, String sinceDate) {
        return rows("SELECT date, SUM(amount) AS total FROM transactions"
                + " WHERE status = 'confirmed' AND type = 'expense' AND currency = ? AND date >= ?"
                + " GROUP BY date", args(currency, sinceDate));
    }

    public List<ContentValues> recordDates(String sinceDate) {
        return rows("SELECT DISTINCT date FROM transactions WHERE status = 'confirmed' AND date >= ?"
                + " ORDER BY date DESC", args(sinceDate));
    }

    public List<ContentValues> sourceCounts() {
        return rows("SELECT source, COUNT(*) AS count FROM transactions WHERE status = 'confirmed' GROUP BY source", args());
    }

    /** Primera y última fecha con movimientos confirmados (para acotar el selector de meses). */
    public ContentValues dateRange() {
        List<ContentValues> found = rows("SELECT MIN(date) AS first, MAX(date) AS last FROM transactions"
                + " WHERE status = 'confirmed'", args());
        return found.isEmpty() ? new ContentValues() : found.get(0);
    }

    /** Movimientos recientes con los campos mínimos que necesita el Copilot. */
    public List<ContentValues> recentForCopilot(String currency, String sinceDate, int limit) {
        return rows("SELECT date, type, amount, category, merchant FROM transactions"
                + " WHERE status = 'confirmed' AND currency = ? AND date >= ?"
                + " ORDER BY " + NEWEST_FIRST + " LIMIT " + Math.max(1, Math.min(limit, 100)),
                args(currency, sinceDate));
    }

    // --- Correcciones de categoría (feedback loop) ---------------------------

    public String insertFeedback(ContentValues values) {
        String id = UUID.randomUUID().toString();
        values.put("id", id);
        values.put("created_at", System.currentTimeMillis());
        values.put("shared", 0);
        getWritableDatabase().insertOrThrow("category_feedback", null, values);
        return id;
    }

    public List<ContentValues> listFeedback(int limit, boolean onlyUnshared) {
        return rows("SELECT * FROM category_feedback" + (onlyUnshared ? " WHERE shared = 0" : "")
                + " ORDER BY created_at DESC LIMIT " + Math.max(1, Math.min(limit, 10000)), args());
    }

    public int markFeedbackShared(List<String> ids) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues shared = new ContentValues();
        shared.put("shared", 1);
        int updated = 0;
        db.beginTransaction();
        try {
            for (String id : ids) {
                updated += db.update("category_feedback", shared, "id = ?", new String[] {id});
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return updated;
    }

    // --- Metas ---------------------------------------------------------------

    public List<ContentValues> listGoals() {
        return rows("SELECT * FROM goals ORDER BY created_at ASC", args());
    }

    /**
     * Crea o edita una meta. El ahorro no se escribe directo: es la suma de su historial, que
     * los triggers mantienen en goals.saved. `contributions` son los aportes rápidos hechos en
     * esta edición; si `saved` trae otro total, la diferencia queda como ajuste (o como saldo
     * inicial si la meta es nueva).
     */
    public String upsertGoal(ContentValues values, List<Double> contributions) {
        Double saved = values.getAsDouble("saved");
        values.remove("saved");
        values.remove("created_at");
        long now = System.currentTimeMillis();
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            String id = values.getAsString("id");
            boolean created = id == null || id.isEmpty();
            if (created) {
                id = UUID.randomUUID().toString();
                values.put("id", id);
                values.put("saved", 0);
                values.put("created_at", now);
                db.insertOrThrow("goals", null, values);
            } else if (db.update("goals", values, "id = ?", new String[] {id}) == 0) {
                throw new IllegalArgumentException("La meta no existe");
            }
            int order = 0;
            for (Double amount : contributions) {
                if (amount != null && amount > 0) {
                    insertContribution(db, id, "contribution", amount, now + order++);
                }
            }
            if (saved != null) {
                double delta = Math.round((saved - goalSaved(db, id)) * 100) / 100.0;
                if (Math.abs(delta) >= 0.005) {
                    insertContribution(db, id, created ? "initial" : "adjustment", delta, now + order);
                }
            }
            db.setTransactionSuccessful();
            return id;
        } finally {
            db.endTransaction();
        }
    }

    private static void insertContribution(SQLiteDatabase db, String goalId, String kind, double amount, long createdAt) {
        ContentValues row = new ContentValues();
        row.put("id", UUID.randomUUID().toString());
        row.put("goal_id", goalId);
        row.put("kind", kind);
        row.put("amount", amount);
        row.put("created_at", createdAt);
        db.insertOrThrow("goal_contributions", null, row);
    }

    private static double goalSaved(SQLiteDatabase db, String goalId) {
        try (Cursor c = db.rawQuery("SELECT saved FROM goals WHERE id = ?", new String[] {goalId})) {
            return c.moveToFirst() ? c.getDouble(0) : 0;
        }
    }

    /** Historial de una meta, del registro más reciente al más antiguo. */
    public List<ContentValues> listGoalContributions(String goalId, int limit) {
        return rows("SELECT id, goal_id, kind, amount, created_at FROM goal_contributions WHERE goal_id = ?"
                + " ORDER BY created_at DESC, id DESC LIMIT " + Math.max(1, Math.min(limit, 500)), args(goalId));
    }

    /** Todo el historial (solo para respaldos). */
    public List<ContentValues> listAllGoalContributions() {
        return rows("SELECT * FROM goal_contributions ORDER BY created_at, id", args());
    }

    // --- Insignias -------------------------------------------------------------

    public List<ContentValues> listBadgeUnlocks() {
        return rows("SELECT badge_id, unlocked_at FROM badge_unlocks ORDER BY unlocked_at", args());
    }

    /** Guarda las insignias recién ganadas; las que ya estaban conservan su fecha. */
    public int unlockBadges(List<String> badgeIds) {
        long now = System.currentTimeMillis();
        SQLiteDatabase db = getWritableDatabase();
        int inserted = 0;
        db.beginTransaction();
        try {
            for (String badgeId : badgeIds) {
                ContentValues row = new ContentValues();
                row.put("badge_id", badgeId);
                row.put("unlocked_at", now);
                if (db.insertWithOnConflict("badge_unlocks", null, row, SQLiteDatabase.CONFLICT_IGNORE) != -1) {
                    inserted++;
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return inserted;
    }

    public boolean deleteGoal(String id) {
        return getWritableDatabase().delete("goals", "id = ?", new String[] {id}) > 0;
    }

    // --- Ajustes -------------------------------------------------------------

    public String getSetting(String key) {
        try (Cursor c = getReadableDatabase().query(
                "settings", new String[] {"value"}, "key = ?", new String[] {key}, null, null, null)) {
            return c.moveToFirst() ? c.getString(0) : null;
        }
    }

    public void setSetting(String key, String value) {
        ContentValues values = new ContentValues();
        values.put("key", key);
        values.put("value", value);
        getWritableDatabase().insertWithOnConflict("settings", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public Map<String, String> listSettings() {
        Map<String, String> settings = new LinkedHashMap<>();
        try (Cursor c = getReadableDatabase().query("settings", new String[] {"key", "value"}, null, null, null, null, "key")) {
            while (c.moveToNext()) {
                settings.put(c.getString(0), c.getString(1));
            }
        }
        return settings;
    }

    // --- Acceso ---------------------------------------------------------------

    /** Credenciales guardadas, o null si la app todavía no tiene contraseña. */
    public ContentValues credentials() {
        List<ContentValues> found = rows("SELECT * FROM auth WHERE id = 1", args());
        return found.isEmpty() ? null : found.get(0);
    }

    /** Crea o reemplaza las credenciales y borra los intentos fallidos acumulados. */
    public void saveCredentials(String username, String usernameKey, String secret) {
        long now = System.currentTimeMillis();
        ContentValues previous = credentials();
        ContentValues values = new ContentValues();
        values.put("id", 1);
        values.put("username", username);
        values.put("username_key", usernameKey);
        values.put("secret", secret);
        values.put("created_at", previous == null ? now : previous.getAsLong("created_at"));
        values.put("updated_at", now);
        values.put("failed_attempts", 0);
        values.put("locked_until", 0);
        getWritableDatabase().insertWithOnConflict("auth", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public void setLoginAttempts(int failedAttempts, long lockedUntil) {
        ContentValues values = new ContentValues();
        values.put("failed_attempts", failedAttempts);
        values.put("locked_until", lockedUntil);
        getWritableDatabase().update("auth", values, "id = 1", null);
    }

    public void clearCredentials() {
        getWritableDatabase().delete("auth", null, null);
    }

    // --- Respaldo y borrado ---------------------------------------------------

    /**
     * Reemplaza todos los datos de forma atómica: o se restaura todo o no cambia nada.
     *
     * Un respaldo antiguo puede traer datos que el esquema rechaza (una categoría que no sirve
     * para el tipo, una corrección de un movimiento borrado, metas sin historial...). Por eso las
     * filas se cargan primero en tablas temporales sin restricciones e importar.sql las corrige
     * al copiarlas, igual que en la migración desde v3.
     */
    public void replaceAll(List<ContentValues> transactions, List<ContentValues> goals, Map<String, String> settings,
                           List<ContentValues> feedback, List<ContentValues> contributions,
                           List<ContentValues> badgeUnlocks) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            createStaging(db, BACKUP_TABLES);
            insertAll(db, "legacy_transactions", transactions);
            insertAll(db, "legacy_goals", goals);
            for (Map.Entry<String, String> entry : settings.entrySet()) {
                ContentValues values = new ContentValues();
                values.put("key", entry.getKey());
                values.put("value", entry.getValue());
                db.insertOrThrow("legacy_settings", null, values);
            }
            insertAll(db, "legacy_category_feedback", feedback);
            insertAll(db, "legacy_goal_contributions", contributions);
            insertAll(db, "legacy_badge_unlocks", badgeUnlocks);
            clearTables(db);
            runScript(db, IMPORT_SCRIPT);
            dropStaging(db, BACKUP_TABLES);
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    private static void insertAll(SQLiteDatabase db, String table, List<ContentValues> rows) {
        for (ContentValues row : rows) {
            db.insertOrThrow(table, null, row);
        }
    }

    /** Filas de una tabla de datos (para informar qué se restauró). */
    public long count(String table) {
        if (!Arrays.asList(USER_TABLES).contains(table)) {
            throw new IllegalArgumentException("Tabla desconocida: " + table);
        }
        return DatabaseUtils.queryNumEntries(getReadableDatabase(), table);
    }

    /** Borrado total: a diferencia de restaurar un respaldo, también quita el acceso. */
    public void wipe() {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            clearTables(db);
            db.delete("auth", null, null);
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    /** Vacía los datos del usuario (cada tabla antes que aquellas a las que apunta). */
    private static void clearTables(SQLiteDatabase db) {
        for (String table : USER_TABLES) {
            db.delete(table, null, null);
        }
    }

    // --- Utilidades ----------------------------------------------------------

    private static List<String> args(String... values) {
        return new ArrayList<>(Arrays.asList(values));
    }

    private double scalarDouble(String sql, String... params) {
        try (Cursor c = getReadableDatabase().rawQuery(sql, params)) {
            return c.moveToFirst() && !c.isNull(0) ? c.getDouble(0) : 0;
        }
    }

    private List<ContentValues> rows(String sql, List<String> params) {
        try (Cursor c = getReadableDatabase().rawQuery(sql, params.toArray(new String[0]))) {
            List<ContentValues> result = new ArrayList<>(c.getCount());
            while (c.moveToNext()) {
                ContentValues row = new ContentValues();
                for (int i = 0; i < c.getColumnCount(); i++) {
                    String column = c.getColumnName(i);
                    switch (c.getType(i)) {
                        case Cursor.FIELD_TYPE_INTEGER:
                            row.put(column, c.getLong(i));
                            break;
                        case Cursor.FIELD_TYPE_FLOAT:
                            row.put(column, c.getDouble(i));
                            break;
                        case Cursor.FIELD_TYPE_NULL:
                            row.putNull(column);
                            break;
                        default:
                            row.put(column, c.getString(i));
                    }
                }
                result.add(row);
            }
            return result;
        }
    }
}
