package com.moneymaker.finance;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;

/**
 * Respaldo cifrado de toda la base local en un archivo que el usuario guarda
 * donde quiera (Google Drive, OneDrive, Dropbox...) mediante el selector de
 * documentos del sistema. MoneyMaker nunca ve ni aloja el archivo.
 */
final class BackupManager {

    static final String MIME_TYPE = "application/octet-stream";
    static final String FILE_EXTENSION = ".mmbackup";
    private static final String FORMAT = "moneymaker-backup";
    /**
     * v2 añade las correcciones de categoría; v3, el historial de aportes y las insignias.
     * Se siguen aceptando respaldos v1 y v2 (importar.sql completa lo que les falta).
     */
    private static final int VERSION = 3;
    private static final int MAX_BACKUP_BYTES = 50 * 1024 * 1024;

    private static final String[] TRANSACTION_COLUMNS = {
        "id", "type", "amount", "currency", "date", "merchant", "description", "category",
        "source", "status", "dedupe_key", "created_at", "updated_at"
    };
    private static final String[] GOAL_COLUMNS = {"id", "name", "emoji", "target", "saved", "deadline", "created_at"};
    private static final String[] FEEDBACK_COLUMNS = {
        "id", "created_at", "day", "transaction_id", "capture", "model", "merchant", "description",
        "suggested_category", "final_category", "confidence", "shared"
    };
    private static final String[] CONTRIBUTION_COLUMNS = {"id", "goal_id", "kind", "amount", "created_at"};
    private static final String[] BADGE_UNLOCK_COLUMNS = {"badge_id", "unlocked_at"};

    static final class Counts {
        final int transactions;
        final int goals;

        Counts(int transactions, int goals) {
            this.transactions = transactions;
            this.goals = goals;
        }
    }

    private BackupManager() {}

    static Counts export(Context context, Uri destination, char[] passphrase)
            throws IOException, JSONException, BackupCipher.BackupException {
        FinanceDatabase db = FinanceDatabase.get(context);
        List<ContentValues> transactions = db.listTransactions(null, null);
        List<ContentValues> goals = db.listGoals();

        JSONObject root = new JSONObject();
        root.put("format", FORMAT);
        root.put("version", VERSION);
        root.put("exported_at", System.currentTimeMillis());
        root.put("transactions", toJson(transactions));
        root.put("goals", toJson(goals));
        root.put("settings", new JSONObject(db.listSettings()));
        root.put("category_feedback", toJson(db.listFeedback(10000, false)));
        root.put("goal_contributions", toJson(db.listAllGoalContributions()));
        root.put("badge_unlocks", toJson(db.listBadgeUnlocks()));

        byte[] plaintext = root.toString().getBytes(StandardCharsets.UTF_8);
        byte[] blob;
        try {
            blob = BackupCipher.encrypt(plaintext, passphrase);
        } finally {
            Arrays.fill(plaintext, (byte) 0);
        }
        try (OutputStream out = context.getContentResolver().openOutputStream(destination, "wt")) {
            if (out == null) {
                throw new IOException("No se pudo abrir el archivo de destino");
            }
            out.write(blob);
        }
        return new Counts(transactions.size(), goals.size());
    }

    static Counts restore(Context context, Uri source, char[] passphrase)
            throws IOException, JSONException, BackupCipher.BackupException {
        byte[] plaintext = BackupCipher.decrypt(readAll(context, source), passphrase);
        JSONObject root;
        try {
            root = new JSONObject(new String(plaintext, StandardCharsets.UTF_8));
        } finally {
            Arrays.fill(plaintext, (byte) 0);
        }
        int version = root.optInt("version");
        if (!FORMAT.equals(root.optString("format")) || version < 1 || version > VERSION) {
            throw new JSONException("Versión de respaldo no soportada");
        }

        // Se valida y convierte todo antes de tocar la base: si algo falla, no se borra nada.
        List<ContentValues> transactions = fromJson(root.getJSONArray("transactions"), TRANSACTION_COLUMNS);
        List<ContentValues> goals = fromJson(root.getJSONArray("goals"), GOAL_COLUMNS);
        Map<String, String> settings = new LinkedHashMap<>();
        JSONObject savedSettings = root.getJSONObject("settings");
        for (Iterator<String> keys = savedSettings.keys(); keys.hasNext(); ) {
            String key = keys.next();
            settings.put(key, savedSettings.isNull(key) ? null : savedSettings.getString(key));
        }

        List<ContentValues> feedback = optionalArray(root, "category_feedback", FEEDBACK_COLUMNS);
        List<ContentValues> contributions = optionalArray(root, "goal_contributions", CONTRIBUTION_COLUMNS);
        List<ContentValues> badgeUnlocks = optionalArray(root, "badge_unlocks", BADGE_UNLOCK_COLUMNS);

        FinanceDatabase db = FinanceDatabase.get(context);
        db.replaceAll(transactions, goals, settings, feedback, contributions, badgeUnlocks);
        // Lo que quedó tras corregir el respaldo (se descartan, p. ej., movimientos con monto 0).
        return new Counts((int) db.count("transactions"), (int) db.count("goals"));
    }

    private static byte[] readAll(Context context, Uri source) throws IOException {
        try (InputStream in = context.getContentResolver().openInputStream(source)) {
            if (in == null) {
                throw new IOException("No se pudo abrir el respaldo");
            }
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[16 * 1024];
            int read;
            while ((read = in.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
                if (buffer.size() > MAX_BACKUP_BYTES) {
                    throw new IOException("El archivo es demasiado grande para ser un respaldo");
                }
            }
            return buffer.toByteArray();
        }
    }

    private static JSONArray toJson(List<ContentValues> rows) throws JSONException {
        JSONArray array = new JSONArray();
        for (ContentValues row : rows) {
            JSONObject object = new JSONObject();
            for (String key : row.keySet()) {
                Object value = row.get(key);
                object.put(key, value == null ? JSONObject.NULL : value);
            }
            array.put(object);
        }
        return array;
    }

    /** Secciones que los respaldos más antiguos no traen: vacías en ese caso. */
    private static List<ContentValues> optionalArray(JSONObject root, String key, String[] columns) throws JSONException {
        return root.has(key) ? fromJson(root.getJSONArray(key), columns) : new ArrayList<>();
    }

    private static List<ContentValues> fromJson(JSONArray array, String[] columns) throws JSONException {
        List<ContentValues> rows = new ArrayList<>(array.length());
        for (int i = 0; i < array.length(); i++) {
            JSONObject object = array.getJSONObject(i);
            ContentValues values = new ContentValues();
            for (String column : columns) {
                if (!object.has(column)) {
                    continue;
                }
                Object value = object.get(column);
                if (value == JSONObject.NULL) {
                    values.putNull(column);
                } else if (value instanceof Integer || value instanceof Long) {
                    values.put(column, ((Number) value).longValue());
                } else if (value instanceof Number) {
                    values.put(column, ((Number) value).doubleValue());
                } else {
                    values.put(column, value.toString());
                }
            }
            rows.add(values);
        }
        return rows;
    }
}
