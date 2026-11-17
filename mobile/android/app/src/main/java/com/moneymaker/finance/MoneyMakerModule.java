package com.moneymaker.finance;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import android.view.WindowManager;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import org.json.JSONException;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Módulo nativo expuesto a JavaScript como NativeModules.MoneyMaker. */
public class MoneyMakerModule extends ReactContextBaseJavaModule
        implements TransactionIngestor.Listener, ActivityEventListener {

    static final String NAME = "MoneyMaker";
    private static final String EVENT_DETECTED = "MoneyMaker:transactionDetected";
    private static final String EVENT_SPEECH_PARTIAL = "MoneyMaker:speechPartial";
    private static final int REQUEST_EXPORT_BACKUP = 7301;
    private static final int REQUEST_IMPORT_BACKUP = 7302;

    /** Respaldo esperando a que el usuario elija el archivo en el selector del sistema. */
    private static final class PendingBackup {
        final int requestCode;
        final char[] passphrase;
        final Promise promise;

        PendingBackup(int requestCode, char[] passphrase, Promise promise) {
            this.requestCode = requestCode;
            this.passphrase = passphrase;
            this.promise = promise;
        }

        void clear() {
            Arrays.fill(passphrase, '\0');
        }
    }

    @Nullable private PendingBackup pendingBackup;

    private static final String[] TX_STRING_FIELDS = {
        "id", "type", "currency", "date", "merchant", "description", "category", "source", "status"
    };
    private static final String[] GOAL_STRING_FIELDS = {"id", "name", "emoji", "deadline"};
    private static final String[] FEEDBACK_STRING_FIELDS = {
        "day", "transaction_id", "capture", "model", "merchant", "description", "suggested_category", "final_category"
    };

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    @Nullable private SpeechRecognizer recognizer;

    MoneyMakerModule(ReactApplicationContext context) {
        super(context);
        TransactionIngestor.setListener(this);
        context.addActivityEventListener(this);
    }

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }

    private FinanceDatabase db() {
        return FinanceDatabase.get(getReactApplicationContext());
    }

    private interface DbTask {
        Object run() throws Exception;
    }

    private void onIo(Promise promise, DbTask task) {
        io.execute(() -> {
            try {
                promise.resolve(task.run());
            } catch (Exception e) {
                Log.e(NAME, "Falló una operación de la base local", e);
                promise.reject("E_DB", e.getClass().getSimpleName() + ": " + e.getMessage(), e);
            }
        });
    }

    // --- Transacciones -------------------------------------------------------

    @ReactMethod
    public void listTransactions(@Nullable String fromDate, @Nullable String toDate, Promise promise) {
        onIo(promise, () -> toArray(db().listTransactions(fromDate, toDate)));
    }

    @ReactMethod
    public void upsertTransaction(ReadableMap tx, Promise promise) {
        onIo(promise, () -> {
            ContentValues values = copy(tx, TX_STRING_FIELDS, "amount");
            String type = values.getAsString("type");
            Double amount = values.getAsDouble("amount");
            if (!"expense".equals(type) && !"income".equals(type)) {
                throw new IllegalArgumentException("type inválido");
            }
            if (amount == null || amount < 0 || amount.isNaN() || amount.isInfinite()) {
                throw new IllegalArgumentException("amount inválido");
            }
            String id = db().upsertTransaction(values);
            if (id == null) {
                throw new IllegalStateException("Transacción duplicada");
            }
            return toMap(db().getTransaction(id));
        });
    }

    @ReactMethod
    public void deleteTransaction(String id, Promise promise) {
        onIo(promise, () -> db().deleteTransaction(id));
    }

    // --- Fotos de recibo (evidencia, sin lectura automática) ------------------

    @ReactMethod
    public void saveReceipt(String transactionId, String sourceUri, Promise promise) {
        onIo(promise, () -> ReceiptStore.save(getReactApplicationContext(), transactionId, sourceUri));
    }

    @ReactMethod
    public void getReceipt(String transactionId, Promise promise) {
        onIo(promise, () -> ReceiptStore.find(getReactApplicationContext(), transactionId));
    }

    @ReactMethod
    public void deleteReceipt(String transactionId, Promise promise) {
        onIo(promise, () -> ReceiptStore.delete(getReactApplicationContext(), transactionId));
    }

    /**
     * Al borrar un movimiento la foto se conserva mientras se puede deshacer; esta
     * limpieza (al abrir la app) quita las que ya no tienen movimiento.
     */
    @ReactMethod
    public void pruneReceipts(Promise promise) {
        onIo(promise, () -> ReceiptStore.prune(getReactApplicationContext(), db().transactionIds()));
    }

    // --- Consultas agregadas (cada pantalla carga solo lo que muestra) -------

    /** Snapshot del Centro de mando: balance, totales del mes (y 3 previos), recientes y pendientes. */
    @ReactMethod
    public void getOverview(ReadableMap options, Promise promise) {
        onIo(promise, () -> {
            String currency = options.getString("currency");
            WritableMap result = Arguments.createMap();
            result.putDouble("balance", db().balance(currency));
            result.putArray("monthlyTotals", toArray(db().monthlyTotals(
                    currency, options.getString("historyStart"), options.getString("monthEnd"))));
            result.putArray("recent", toArray(db().transactionsPage("all", null, options.getInt("recentLimit"))));
            result.putArray("pending", toArray(db().transactionsPage("pending", null, options.getInt("pendingLimit"))));
            result.putInt("pendingCount", db().pendingCount());
            WritableArray recordDates = Arguments.createArray();
            if (options.hasKey("recordsSince")) {
                for (ContentValues row : db().recordDates(options.getString("recordsSince"))) {
                    recordDates.pushString(row.getAsString("date"));
                }
            }
            result.putArray("recordDates", recordDates);
            return result;
        });
    }

    /** Página de movimientos con cursor (fecha, creación, id) para la lista virtualizada. */
    @ReactMethod
    public void listTransactionsPage(ReadableMap options, Promise promise) {
        onIo(promise, () -> {
            ContentValues cursor = null;
            ReadableMap after = options.hasKey("cursor") && !options.isNull("cursor") ? options.getMap("cursor") : null;
            if (after != null) {
                cursor = new ContentValues();
                cursor.put("date", after.getString("date"));
                cursor.put("created_at", (long) after.getDouble("created_at"));
                cursor.put("id", after.getString("id"));
            }
            int limit = options.getInt("limit");
            List<ContentValues> items = db().transactionsPage(options.getString("filter"), cursor, limit);
            WritableMap result = Arguments.createMap();
            result.putArray("items", toArray(items));
            if (items.size() == limit) {
                ContentValues last = items.get(items.size() - 1);
                WritableMap next = Arguments.createMap();
                next.putString("date", last.getAsString("date"));
                next.putDouble("created_at", last.getAsLong("created_at"));
                next.putString("id", last.getAsString("id"));
                result.putMap("nextCursor", next);
            } else {
                result.putNull("nextCursor");
            }
            return result;
        });
    }

    @ReactMethod
    public void getMonthlyTotals(ReadableMap options, Promise promise) {
        onIo(promise, () -> toArray(db().monthlyTotals(
                options.getString("currency"), options.getString("fromDate"), options.getString("toDate"))));
    }

    @ReactMethod
    public void getMerchantTotals(ReadableMap options, Promise promise) {
        onIo(promise, () -> toArray(db().merchantTotals(
                options.getString("currency"), options.getString("month"), options.getInt("limit"))));
    }

    /** Datos para rachas e insignias; se piden solo al abrir Metas. */
    @ReactMethod
    public void getActivityStats(ReadableMap options, Promise promise) {
        onIo(promise, () -> {
            String currency = options.getString("currency");
            String since = options.getString("sinceDate");
            WritableMap result = Arguments.createMap();
            result.putArray("dailyExpenses", toArray(db().dailyExpenses(currency, since)));
            WritableArray dates = Arguments.createArray();
            for (ContentValues row : db().recordDates(since)) {
                dates.pushString(row.getAsString("date"));
            }
            result.putArray("recordDates", dates);
            WritableMap sources = Arguments.createMap();
            for (ContentValues row : db().sourceCounts()) {
                sources.putDouble(row.getAsString("source"), row.getAsLong("count"));
            }
            result.putMap("sourceCounts", sources);
            result.putMap("dateRange", toMap(db().dateRange()));
            return result;
        });
    }

    @ReactMethod
    public void getDateRange(Promise promise) {
        onIo(promise, () -> toMap(db().dateRange()));
    }

    @ReactMethod
    public void listRecentForCopilot(ReadableMap options, Promise promise) {
        onIo(promise, () -> toArray(db().recentForCopilot(
                options.getString("currency"), options.getString("sinceDate"), options.getInt("limit"))));
    }

    @ReactMethod
    public void bulkInsertTransactions(ReadableArray items, Promise promise) {
        onIo(promise, () -> {
            List<ContentValues> rows = new ArrayList<>(items.size());
            for (int i = 0; i < items.size(); i++) {
                rows.add(copy(items.getMap(i), TX_STRING_FIELDS, "amount"));
            }
            return db().insertTransactions(rows);
        });
    }

    // --- Correcciones de categoría (feedback loop) ---------------------------

    @ReactMethod
    public void recordCategoryFeedback(ReadableMap feedback, Promise promise) {
        onIo(promise, () -> db().insertFeedback(copy(feedback, FEEDBACK_STRING_FIELDS, "confidence")));
    }

    @ReactMethod
    public void listCategoryFeedback(ReadableMap options, Promise promise) {
        onIo(promise, () -> toArray(db().listFeedback(
                options.getInt("limit"), options.hasKey("onlyUnshared") && options.getBoolean("onlyUnshared"))));
    }

    @ReactMethod
    public void markCategoryFeedbackShared(ReadableArray ids, Promise promise) {
        onIo(promise, () -> {
            List<String> list = new ArrayList<>(ids.size());
            for (int i = 0; i < ids.size(); i++) {
                list.add(ids.getString(i));
            }
            return db().markFeedbackShared(list);
        });
    }

    // --- Metas y ajustes -----------------------------------------------------

    @ReactMethod
    public void listGoals(Promise promise) {
        onIo(promise, () -> toArray(db().listGoals()));
    }

    /** `contributions`: aportes rápidos de esta edición; `saved` (opcional): el total que quedó en el formulario. */
    @ReactMethod
    public void upsertGoal(ReadableMap goal, ReadableArray contributions, Promise promise) {
        onIo(promise, () -> {
            List<Double> amounts = new ArrayList<>(contributions.size());
            for (int i = 0; i < contributions.size(); i++) {
                amounts.add(contributions.getDouble(i));
            }
            return db().upsertGoal(copy(goal, GOAL_STRING_FIELDS, "target", "saved"), amounts);
        });
    }

    @ReactMethod
    public void listGoalContributions(String goalId, int limit, Promise promise) {
        onIo(promise, () -> toArray(db().listGoalContributions(goalId, limit)));
    }

    // --- Insignias -------------------------------------------------------------

    @ReactMethod
    public void listBadgeUnlocks(Promise promise) {
        onIo(promise, () -> toArray(db().listBadgeUnlocks()));
    }

    @ReactMethod
    public void unlockBadges(ReadableArray badgeIds, Promise promise) {
        onIo(promise, () -> {
            List<String> ids = new ArrayList<>(badgeIds.size());
            for (int i = 0; i < badgeIds.size(); i++) {
                ids.add(badgeIds.getString(i));
            }
            return db().unlockBadges(ids);
        });
    }

    @ReactMethod
    public void deleteGoal(String id, Promise promise) {
        onIo(promise, () -> db().deleteGoal(id));
    }

    @ReactMethod
    public void getSetting(String key, Promise promise) {
        onIo(promise, () -> db().getSetting(key));
    }

    @ReactMethod
    public void setSetting(String key, @Nullable String value, Promise promise) {
        onIo(promise, () -> {
            db().setSetting(key, value);
            return null;
        });
    }

    @ReactMethod
    public void wipeAllData(Promise promise) {
        onIo(promise, () -> {
            db().wipe();
            ReceiptStore.deleteAll(getReactApplicationContext());
            return null;
        });
    }

    // --- Acceso con usuario y contraseña --------------------------------------

    /**
     * La contraseña llega como String desde el puente de React Native, así que no
     * se puede borrar de memoria; se convierte a char[] cuanto antes y ese arreglo
     * sí se limpia. Lo que se guarda en la base es solo el derivado PBKDF2.
     */
    private static WritableMap authState(@Nullable ContentValues row) {
        WritableMap map = Arguments.createMap();
        map.putBoolean("configured", row != null);
        if (row == null) {
            map.putNull("username");
            map.putInt("failedAttempts", 0);
            map.putDouble("lockedUntil", 0);
            map.putDouble("updatedAt", 0);
        } else {
            map.putString("username", row.getAsString("username"));
            map.putInt("failedAttempts", row.getAsInteger("failed_attempts"));
            map.putDouble("lockedUntil", row.getAsLong("locked_until"));
            map.putDouble("updatedAt", row.getAsLong("updated_at"));
        }
        return map;
    }

    @Nullable
    private static String text(ReadableMap options, String key) {
        return options.hasKey(key) && !options.isNull(key) ? options.getString(key) : null;
    }

    @ReactMethod
    public void getAuthState(Promise promise) {
        onIo(promise, () -> authState(db().credentials()));
    }

    /** Crea la contraseña o la cambia (en ese caso exige la actual). */
    @ReactMethod
    public void setCredentials(ReadableMap options, Promise promise) {
        onIo(promise, () -> {
            String password = text(options, "password");
            char[] chars = password == null ? null : password.toCharArray();
            char[] currentChars = null;
            try {
                ContentValues current = db().credentials();
                if (current != null) {
                    String currentPassword = text(options, "currentPassword");
                    currentChars = currentPassword == null ? new char[0] : currentPassword.toCharArray();
                    if (!PasswordVault.verify(currentChars, current.getAsString("secret"))) {
                        throw new IllegalArgumentException("La contraseña actual no coincide");
                    }
                }
                String requested = text(options, "username");
                String username = requested != null ? requested.trim()
                        : current != null ? current.getAsString("username") : null;
                PasswordVault.requireValid(username, chars);
                db().saveCredentials(username, PasswordVault.normalizeUsername(username), PasswordVault.hash(chars));
                return authState(db().credentials());
            } finally {
                if (chars != null) {
                    Arrays.fill(chars, '\0');
                }
                if (currentChars != null) {
                    Arrays.fill(currentChars, '\0');
                }
            }
        });
    }

    /**
     * Comprueba usuario y contraseña. Los fallos se acumulan en la base, así que
     * reiniciar la app no sirve para saltarse la espera.
     */
    @ReactMethod
    public void verifyPassword(ReadableMap options, Promise promise) {
        onIo(promise, () -> {
            ContentValues row = db().credentials();
            WritableMap result = Arguments.createMap();
            if (row == null) {
                result.putBoolean("ok", false);
                result.putString("reason", "not-configured");
                return result;
            }
            long now = System.currentTimeMillis();
            long lockedUntil = row.getAsLong("locked_until");
            int failedAttempts = row.getAsInteger("failed_attempts");
            if (lockedUntil > now) {
                result.putBoolean("ok", false);
                result.putString("reason", "locked");
                result.putDouble("lockedUntil", lockedUntil);
                result.putInt("failedAttempts", failedAttempts);
                return result;
            }

            String password = text(options, "password");
            char[] chars = password == null ? new char[0] : password.toCharArray();
            boolean ok;
            try {
                // Se deriva siempre, coincida o no el usuario, para no delatar cuál de los dos falló.
                boolean passwordOk = PasswordVault.verify(chars, row.getAsString("secret"));
                boolean usernameOk = PasswordVault.normalizeUsername(text(options, "username"))
                        .equals(row.getAsString("username_key"));
                ok = passwordOk && usernameOk;
            } finally {
                Arrays.fill(chars, '\0');
            }

            if (ok) {
                db().setLoginAttempts(0, 0);
                result.putBoolean("ok", true);
                result.putString("username", row.getAsString("username"));
                return result;
            }
            int attempts = failedAttempts + 1;
            long wait = PasswordVault.lockMillis(attempts);
            long until = wait > 0 ? now + wait : 0;
            db().setLoginAttempts(attempts, until);
            result.putBoolean("ok", false);
            result.putString("reason", wait > 0 ? "locked" : "invalid");
            result.putDouble("lockedUntil", until);
            result.putInt("failedAttempts", attempts);
            return result;
        });
    }

    /** Quita el bloqueo de la app (los datos quedan intactos). Exige la contraseña actual. */
    @ReactMethod
    public void clearCredentials(ReadableMap options, Promise promise) {
        onIo(promise, () -> {
            ContentValues current = db().credentials();
            if (current != null) {
                String password = text(options, "password");
                char[] chars = password == null ? new char[0] : password.toCharArray();
                try {
                    if (!PasswordVault.verify(chars, current.getAsString("secret"))) {
                        throw new IllegalArgumentException("La contraseña no coincide");
                    }
                } finally {
                    Arrays.fill(chars, '\0');
                }
            }
            db().clearCredentials();
            return authState(null);
        });
    }

    // --- Respaldo cifrado ----------------------------------------------------

    @ReactMethod
    public void exportBackup(String passphrase, Promise promise) {
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(BackupManager.MIME_TYPE)
                .putExtra(Intent.EXTRA_TITLE, "moneymaker-" + today + BackupManager.FILE_EXTENSION);
        startBackupPicker(REQUEST_EXPORT_BACKUP, intent, passphrase, promise);
    }

    @ReactMethod
    public void importBackup(String passphrase, Promise promise) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("*/*");
        startBackupPicker(REQUEST_IMPORT_BACKUP, intent, passphrase, promise);
    }

    private void startBackupPicker(int requestCode, Intent intent, String passphrase, Promise promise) {
        if (passphrase == null || passphrase.length() < BackupCipher.MIN_PASSPHRASE_LENGTH) {
            promise.reject("E_BACKUP_WEAK", "Contraseña demasiado corta");
            return;
        }
        Activity activity = getReactApplicationContext().getCurrentActivity();
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "No hay una pantalla activa");
            return;
        }
        synchronized (this) {
            if (pendingBackup != null) {
                promise.reject("E_BACKUP_BUSY", "Ya hay un respaldo en curso");
                return;
            }
            pendingBackup = new PendingBackup(requestCode, passphrase.toCharArray(), promise);
        }
        try {
            activity.startActivityForResult(intent, requestCode);
        } catch (Exception e) {
            PendingBackup pending = takePendingBackup(requestCode);
            if (pending != null) {
                pending.clear();
                promise.reject("E_BACKUP_IO", e.getMessage(), e);
            }
        }
    }

    private synchronized PendingBackup takePendingBackup(int requestCode) {
        if (pendingBackup == null || pendingBackup.requestCode != requestCode) {
            return null;
        }
        PendingBackup pending = pendingBackup;
        pendingBackup = null;
        return pending;
    }

    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, @Nullable Intent data) {
        if (requestCode != REQUEST_EXPORT_BACKUP && requestCode != REQUEST_IMPORT_BACKUP) {
            return;
        }
        PendingBackup pending = takePendingBackup(requestCode);
        if (pending == null) {
            return;
        }
        Uri uri = data != null ? data.getData() : null;
        if (resultCode != Activity.RESULT_OK || uri == null) {
            pending.clear();
            pending.promise.resolve(null); // el usuario canceló el selector
            return;
        }
        io.execute(() -> {
            try {
                BackupManager.Counts counts = requestCode == REQUEST_EXPORT_BACKUP
                        ? BackupManager.export(getReactApplicationContext(), uri, pending.passphrase)
                        : BackupManager.restore(getReactApplicationContext(), uri, pending.passphrase);
                WritableMap result = Arguments.createMap();
                result.putInt("transactions", counts.transactions);
                result.putInt("goals", counts.goals);
                pending.promise.resolve(result);
            } catch (BackupCipher.BackupException e) {
                pending.promise.reject(backupErrorCode(e.reason), e.getMessage(), e);
            } catch (JSONException e) {
                pending.promise.reject("E_BACKUP_FORMAT", e.getMessage(), e);
            } catch (Exception e) {
                pending.promise.reject("E_BACKUP_IO", e.getMessage(), e);
            } finally {
                pending.clear();
            }
        });
    }

    private static String backupErrorCode(BackupCipher.BackupException.Reason reason) {
        switch (reason) {
            case WRONG_PASSPHRASE_OR_CORRUPTED:
                return "E_BACKUP_PASSPHRASE";
            case INVALID_FORMAT:
                return "E_BACKUP_FORMAT";
            case WEAK_PASSPHRASE:
                return "E_BACKUP_WEAK";
            default:
                return "E_BACKUP_IO";
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        // Sin uso: los respaldos solo necesitan onActivityResult.
    }

    // --- Automatización ------------------------------------------------------

    @ReactMethod
    public void getAutomationStatus(Promise promise) {
        onIo(promise, () -> {
            ReactApplicationContext ctx = getReactApplicationContext();
            WritableMap status = Arguments.createMap();
            status.putBoolean("smsPermission", ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECEIVE_SMS)
                    == PackageManager.PERMISSION_GRANTED);
            status.putBoolean("notificationAccess",
                    NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.getPackageName()));
            status.putBoolean("smsEnabled", "true".equals(db().getSetting(TransactionIngestor.SETTING_SMS_ENABLED)));
            status.putBoolean("notificationsEnabled",
                    "true".equals(db().getSetting(TransactionIngestor.SETTING_NOTIFICATIONS_ENABLED)));
            return status;
        });
    }

    @ReactMethod
    public void openNotificationAccessSettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("E_SETTINGS", e.getMessage(), e);
        }
    }

    /** Evita capturas de pantalla y oculta el contenido en la vista de apps recientes. */
    @ReactMethod
    public void setSecureScreen(boolean secure) {
        UiThreadUtil.runOnUiThread(() -> {
            Activity activity = getReactApplicationContext().getCurrentActivity();
            if (activity == null) {
                return;
            }
            if (secure) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
        });
    }

    // --- Dictado por voz -----------------------------------------------------

    @ReactMethod
    public void startSpeechRecognition(String locale, Promise promise) {
        UiThreadUtil.runOnUiThread(() -> {
            ReactApplicationContext ctx = getReactApplicationContext();
            if (!SpeechRecognizer.isRecognitionAvailable(ctx)) {
                promise.reject("E_SPEECH_UNAVAILABLE", "Reconocimiento de voz no disponible");
                return;
            }
            destroyRecognizer();
            recognizer = SpeechRecognizer.createSpeechRecognizer(ctx);
            recognizer.setRecognitionListener(new SpeechListener(promise));

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            recognizer.startListening(intent);
        });
    }

    @ReactMethod
    public void stopSpeechRecognition() {
        UiThreadUtil.runOnUiThread(() -> {
            if (recognizer != null) {
                recognizer.stopListening();
            }
        });
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
    }

    private final class SpeechListener implements RecognitionListener {
        private final Promise promise;
        private boolean settled;

        SpeechListener(Promise promise) {
            this.promise = promise;
        }

        @Override
        public void onResults(Bundle results) {
            if (settled) {
                return;
            }
            settled = true;
            List<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            promise.resolve(matches == null || matches.isEmpty() ? "" : matches.get(0));
            destroyRecognizer();
        }

        @Override
        public void onPartialResults(Bundle partial) {
            List<String> matches = partial.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (matches != null && !matches.isEmpty()) {
                emit(EVENT_SPEECH_PARTIAL, matches.get(0));
            }
        }

        @Override
        public void onError(int error) {
            if (settled) {
                return;
            }
            settled = true;
            promise.reject("E_SPEECH_" + error, "Error de reconocimiento de voz (" + error + ")");
            destroyRecognizer();
        }

        @Override public void onReadyForSpeech(Bundle params) {}
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float rmsdB) {}
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEndOfSpeech() {}
        @Override public void onEvent(int eventType, Bundle params) {}
    }

    // --- Eventos -------------------------------------------------------------

    @Override
    public void onTransactionDetected(ContentValues transaction) {
        if (transaction != null) {
            emit(EVENT_DETECTED, toMap(transaction));
        }
    }

    private void emit(String event, Object payload) {
        ReactApplicationContext ctx = getReactApplicationContext();
        if (ctx.hasActiveReactInstance()) {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit(event, payload);
        }
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Requerido por NativeEventEmitter.
    }

    @ReactMethod
    public void removeListeners(double count) {
        // Requerido por NativeEventEmitter.
    }

    @Override
    public void invalidate() {
        TransactionIngestor.setListener(null);
        getReactApplicationContext().removeActivityEventListener(this);
        synchronized (this) {
            if (pendingBackup != null) {
                pendingBackup.clear();
                pendingBackup = null;
            }
        }
        UiThreadUtil.runOnUiThread(this::destroyRecognizer);
        io.shutdown();
        super.invalidate();
    }

    // --- Conversión ContentValues <-> JS -------------------------------------

    private static ContentValues copy(ReadableMap map, String[] stringFields, String... numberFields) {
        ContentValues values = new ContentValues();
        for (String key : stringFields) {
            if (!map.hasKey(key)) {
                continue;
            }
            if (map.isNull(key)) {
                values.putNull(key);
            } else {
                values.put(key, map.getString(key));
            }
        }
        for (String key : numberFields) {
            if (map.hasKey(key) && !map.isNull(key)) {
                values.put(key, map.getDouble(key));
            }
        }
        return values;
    }

    private static WritableArray toArray(List<ContentValues> rows) {
        WritableArray array = Arguments.createArray();
        for (ContentValues row : rows) {
            array.pushMap(toMap(row));
        }
        return array;
    }

    private static WritableMap toMap(@Nullable ContentValues row) {
        if (row == null) {
            return null;
        }
        WritableMap map = Arguments.createMap();
        // ContentValues usa ArrayMap en Android: su entrySet() no admite toArray(), así que
        // se recorren las claves directamente.
        for (String key : row.keySet()) {
            Object value = row.get(key);
            if (value == null) {
                map.putNull(key);
            } else if (value instanceof Number) {
                map.putDouble(key, ((Number) value).doubleValue());
            } else {
                map.putString(key, value.toString());
            }
        }
        return map;
    }
}
