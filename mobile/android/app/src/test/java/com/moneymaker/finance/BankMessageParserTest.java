package com.moneymaker.finance;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Calendar;

public class BankMessageParserTest {

    /** 13 de septiembre de 2026, 12:00 en la zona horaria del equipo. */
    private static final long RECEIVED_AT;

    static {
        Calendar calendar = Calendar.getInstance();
        calendar.clear();
        calendar.set(2026, Calendar.SEPTEMBER, 13, 12, 0, 0);
        RECEIVED_AT = calendar.getTimeInMillis();
    }

    private static BankMessageParser.Alert parse(String body) {
        return BankMessageParser.parse(body, "COP", RECEIVED_AT);
    }

    private static void assertAlert(BankMessageParser.Alert alert, String type, double amount, String currency,
                                    String date, String merchant, String category) {
        assertNotNull("se esperaba una transacción", alert);
        assertEquals(type, alert.type);
        assertEquals(amount, alert.amount, 0.001);
        assertEquals(currency, alert.currency);
        assertEquals(date, alert.date);
        assertEquals(merchant, alert.merchant);
        assertEquals(category, alert.category);
    }

    @Test
    public void bancolombiaCardPurchase() {
        assertAlert(parse("Bancolombia le informa Compra por $45.900,00 en EXITO CALLE 80 12:30. 13/09/2026 "
                        + "T.Cred *1234. Inquietudes al 6045109095/018000931987."),
                "expense", 45900, "COP", "2026-09-13", "Exito Calle 80", "groceries");
    }

    @Test
    public void incomingTransferUsesSender() {
        BankMessageParser.Alert alert = parse("Bancolombia: Recibiste una transferencia por $150,000 de JUAN PEREZ "
                + "en tu cuenta **7890 el 12/09/2026 10:15");
        assertAlert(alert, "income", 150000, "COP", "2026-09-12", "Juan Perez", "transfer");
        assertEquals("Transferencia de Juan Perez", alert.description);
    }

    @Test
    public void nequiPushNotification() {
        assertAlert(parse("Nequi: Pagaste $12.000 en RAPPI COLOMBIA."),
                "expense", 12000, "COP", "2026-09-13", "Rappi Colombia", "food");
    }

    @Test
    public void merchantStopsBeforeCardWords() {
        assertAlert(parse("Davivienda: Compra aprobada por $89.500 en TIENDA D1 SAS con tu tarjeta *4321. 12/09/26 18:42"),
                "expense", 89500, "COP", "2026-09-12", "Tienda D1 Sas", "groceries");
    }

    @Test
    public void allCapsPayment() {
        assertAlert(parse("BANCOLOMBIA: PAGO POR $120.000 A DIRECTV DESDE CTA *1234. 11/09/2026 08:01"),
                "expense", 120000, "COP", "2026-09-11", "Directv", "utilities");
    }

    @Test
    public void foreignCurrencyPurchase() {
        assertAlert(parse("Bancolombia le informa Compra por USD 25,99 en NETFLIX.COM 09:10. 13/09/2026"),
                "expense", 25.99, "USD", "2026-09-13", "Netflix.com", "subscriptions");
    }

    @Test
    public void payrollDepositIsSalary() {
        BankMessageParser.Alert alert = parse("Davivienda: Abono de nomina por $1.750.000 en tu cuenta *5566");
        assertAlert(alert, "income", 1750000, "COP", "2026-09-13", null, "salary");
        assertEquals("Nómina", alert.description);
    }

    @Test
    public void cashWithdrawal() {
        BankMessageParser.Alert alert = parse("Bancolombia le informa Retiro por $300.000 en CAJERO CENTRO ANDINO 14:22. "
                + "10/09/2026 T.Deb *1234");
        assertAlert(alert, "expense", 300000, "COP", "2026-09-10", "Cajero Centro Andino", "other");
        assertEquals("Retiro de efectivo", alert.description);
    }

    @Test
    public void ignoresDeclinedRemindersCodesAndChats() {
        assertNull(parse("Bancolombia: Compra rechazada por $50.000 en AMAZON. Fondos insuficientes."));
        assertNull(parse("Bancolombia te recuerda: el pago minimo de tu tarjeta por $150.000 vence el 15/09/2026"));
        assertNull(parse("Tu codigo para confirmar la compra por $80.000 es 482913. Bancolombia"));
        assertNull(parse("Hola! Nos vemos a las 8? Llevo $20.000 para las pizzas"));
        assertNull(parse("Bancolombia: tu tarjeta ya está activa"));
    }

    @Test
    public void invalidOrFutureDatesFallBackToReception() {
        assertEquals("2026-09-13", parse("Bancolombia: Compra por $10.000 en OXXO 31/02/2026").date);
        assertEquals("2026-09-13", parse("Bancolombia: Compra por $10.000 en OXXO. 20/12/2026").date);
    }

    @Test
    public void fingerprintIgnoresWhitespaceButNotContent() {
        String a = parse("Nequi: Pagaste $12.000 en RAPPI COLOMBIA.").fingerprint;
        String b = parse("Nequi:  Pagaste $12.000 en  RAPPI COLOMBIA. ").fingerprint;
        String c = parse("Nequi: Pagaste $13.000 en RAPPI COLOMBIA.").fingerprint;
        assertEquals(a, b);
        assertFalse(a.equals(c));
        assertTrue(a.matches("[0-9a-f]{64}"));
    }

    @Test
    public void amountSeparators() {
        assertEquals(45900, BankMessageParser.toNumber("45.900,00"), 0.001);
        assertEquals(150000, BankMessageParser.toNumber("150,000"), 0.001);
        assertEquals(25.99, BankMessageParser.toNumber("25.99"), 0.001);
        assertEquals(1750000, BankMessageParser.toNumber("1.750.000"), 0.001);
        assertEquals(12000, BankMessageParser.toNumber("12000"), 0.001);
    }
}
