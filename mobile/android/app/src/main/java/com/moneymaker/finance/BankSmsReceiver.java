package com.moneymaker.finance;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Telephony;
import android.telephony.SmsMessage;

/** Intercepta SMS entrantes y registra los que son alertas bancarias. */
public class BankSmsReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }
        Bundle extras = intent.getExtras();
        if (extras == null) {
            return;
        }
        Object[] pdus = (Object[]) extras.get("pdus");
        String format = extras.getString("format");
        if (pdus == null) {
            return;
        }

        // Un SMS largo llega partido en varias PDU: se concatenan antes de analizar.
        StringBuilder body = new StringBuilder();
        long timestamp = System.currentTimeMillis();
        for (Object pdu : pdus) {
            SmsMessage message = SmsMessage.createFromPdu((byte[]) pdu, format);
            if (message != null) {
                body.append(message.getMessageBody());
                timestamp = message.getTimestampMillis();
            }
        }

        final PendingResult pending = goAsync();
        final String text = body.toString();
        final long receivedAt = timestamp;
        final Context appContext = context.getApplicationContext();
        new Thread(() -> {
            try {
                TransactionIngestor.ingest(appContext, text, "sms", receivedAt);
            } finally {
                pending.finish();
            }
        }, "moneymaker-sms").start();
    }
}
