package com.moneymaker.finance;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Lee notificaciones de apps bancarias y de correo (alertas de compra) cuando el
 * usuario concede el acceso a notificaciones desde los ajustes del sistema.
 */
public class BankNotificationListener extends NotificationListenerService {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || getPackageName().equals(sbn.getPackageName())) {
            return;
        }
        Notification notification = sbn.getNotification();
        if (notification == null || (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) {
            return;
        }
        Bundle extras = notification.extras;
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence text = big != null ? big : extras.getCharSequence(Notification.EXTRA_TEXT);
        if (text == null) {
            return;
        }
        final String body = (title != null ? title + ": " : "") + text;
        final long postedAt = sbn.getPostTime();
        executor.execute(() -> TransactionIngestor.ingest(getApplicationContext(), body, "notification", postedAt));
    }

    @Override
    public void onDestroy() {
        executor.shutdown();
        super.onDestroy();
    }
}
