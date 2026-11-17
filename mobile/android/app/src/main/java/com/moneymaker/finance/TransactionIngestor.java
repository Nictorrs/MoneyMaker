package com.moneymaker.finance;

import android.content.ContentValues;
import android.content.Context;
import android.util.Log;

/** Punto común para guardar alertas bancarias detectadas en segundo plano. */
public final class TransactionIngestor {

    private static final String TAG = "MoneyMakerIngest";
    public static final String SETTING_CURRENCY = "currency";
    public static final String SETTING_SMS_ENABLED = "automation.sms";
    public static final String SETTING_NOTIFICATIONS_ENABLED = "automation.notifications";

    /** Un mismo movimiento suele llegar por SMS y por notificación con segundos de diferencia. */
    private static final long DUPLICATE_WINDOW_MS = 10 * 60 * 1000L;

    public interface Listener {
        void onTransactionDetected(ContentValues transaction);
    }

    private static volatile Listener listener;

    private TransactionIngestor() {}

    public static void setListener(Listener value) {
        listener = value;
    }

    public static synchronized void ingest(Context context, String body, String source, long receivedAt) {
        FinanceDatabase db = FinanceDatabase.get(context);
        String enabledKey = "sms".equals(source) ? SETTING_SMS_ENABLED : SETTING_NOTIFICATIONS_ENABLED;
        if (!"true".equals(db.getSetting(enabledKey))) {
            return;
        }
        String currency = db.getSetting(SETTING_CURRENCY);
        BankMessageParser.Alert alert = BankMessageParser.parse(body, currency != null ? currency : "COP", receivedAt);
        if (alert == null) {
            return;
        }
        long now = System.currentTimeMillis();
        if (db.hasRecentAutomatedDuplicate(alert.type, alert.amount, alert.date, now - DUPLICATE_WINDOW_MS)) {
            return;
        }

        ContentValues values = new ContentValues();
        values.put("type", alert.type);
        values.put("amount", alert.amount);
        values.put("currency", alert.currency);
        values.put("date", alert.date);
        values.put("merchant", alert.merchant);
        values.put("description", alert.description);
        values.put("category", alert.category);
        values.put("source", source);
        values.put("status", "pending");
        values.put("dedupe_key", alert.fingerprint);

        String id = db.upsertTransaction(values);
        if (id == null) {
            return; // el mismo mensaje ya se había registrado
        }
        Log.i(TAG, "Movimiento bancario detectado desde " + source);
        Listener current = listener;
        if (current != null) {
            current.onTransactionDetected(db.getTransaction(id));
        }
    }
}
