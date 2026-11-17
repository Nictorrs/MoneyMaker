package com.moneymaker.finance;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Convierte alertas bancarias (SMS o notificaciones) en transacciones.
 *
 * Todo el análisis ocurre en el dispositivo: el texto original nunca sale del
 * teléfono y solo se guardan los campos extraídos. Es Java puro (sin APIs de
 * Android) para poder probarlo en la JVM.
 */
public final class BankMessageParser {

    public static final class Alert {
        public final String type;
        public final double amount;
        public final String currency;
        public final String date;
        public final String merchant;
        public final String description;
        public final String category;
        /** Huella del mensaje normalizado: el mismo aviso recibido dos veces no se duplica. */
        public final String fingerprint;

        Alert(String type, double amount, String currency, String date, String merchant,
              String description, String category, String fingerprint) {
            this.type = type;
            this.amount = amount;
            this.currency = currency;
            this.date = date;
            this.merchant = merchant;
            this.description = description;
            this.category = category;
            this.fingerprint = fingerprint;
        }
    }

    private static final Pattern BANK_HINT = Pattern.compile(
            "\\b(bancolombia|davivienda|nequi|daviplata|bbva|scotiabank|colpatria|itau|av villas|"
                    + "banco|bancaria|tarjeta|t\\.?\\s?cred|t\\.?\\s?deb|cuenta|cta|nu|lulo|movii|rappipay)\\b|\\*\\d{4}");
    private static final Pattern AMOUNT = Pattern.compile(
            "(?<![a-z])(\\$|cop|usd|us\\$)\\s?(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)(?!\\d)");
    /** Rechazos, recordatorios, promociones y códigos de verificación no son movimientos. */
    private static final Pattern NOT_A_TRANSACTION = Pattern.compile(
            "\\b(rechazad[ao]|declinad[ao]|no aprobad[ao]|fallid[ao]|no exitos[ao]|recuerda|recuerde|vence|"
                    + "vencimiento|pago minimo|evita|aprovecha|gana|promocion|oferta|descuento|preaprobad[ao]|"
                    + "clave|codigo)\\b");
    private static final Pattern INCOME = Pattern.compile(
            "\\b(recibiste|recibio|te enviaron|te llego|te llegaron|abono|abonaron|abonamos|consignacion|"
                    + "consignaron|deposito|depositaron|transferencia recibida|te transfirieron|reembolso|"
                    + "devolucion|pago de nomina|nomina)\\b");
    private static final Pattern EXPENSE = Pattern.compile(
            "\\b(compra|compraste|pago|pagaste|retiro|retiraste|transferiste|transferencia|enviaste|debito|"
                    + "debitamos|cargo|avance)\\b");
    private static final Pattern SALARY = Pattern.compile("\\b(nomina|salario|sueldo)\\b");
    private static final Pattern WITHDRAWAL = Pattern.compile("\\b(retiro|retiraste)\\b");

    private static final String STOP = "(?=\\s+\\d{1,2}:\\d{2}|\\s+\\d{1,2}/\\d{1,2}"
            + "|\\s+(?:con|desde|el|por|a las|cta|tarjeta|t\\.?\\s?cred|t\\.?\\s?deb)\\b"
            + "|\\s*\\*\\d{2,4}|[.,](?:\\s|$)|$)";
    private static final Pattern MERCHANT = Pattern.compile(
            "\\b(?:en|a)\\s+([\\p{L}0-9][\\p{L}0-9 .&*'-]{1,40}?)" + STOP,
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern SENDER = Pattern.compile(
            "\\bde\\s+(\\p{L}[\\p{L} .'-]{1,40}?)(?=\\s+(?:en|a|el|por|desde)\\b|[.,](?:\\s|$)|$)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern NOT_A_NAME = Pattern.compile("^(tu|su|la|el|mi)\\b|^(cuenta|tarjeta|nomina|ahorros)\\b");
    private static final Pattern DATE = Pattern.compile("\\b(\\d{1,2})/(\\d{1,2})/(\\d{4}|\\d{2})\\b");

    private static final Map<Pattern, String> MERCHANT_CATEGORIES = new LinkedHashMap<>();

    static {
        category("food", "rappi", "ifood", "domicilios", "mcdonalds", "crepes", "juan valdez", "starbucks", "frisby", "kfc", "restaurante");
        category("transport", "uber", "didi", "cabify", "indriver", "terpel", "primax", "esso", "texaco", "peaje", "parqueadero");
        category("groceries", "exito", "carulla", "jumbo", "d1", "ara", "olimpica", "makro", "pricesmart", "oxxo");
        category("subscriptions", "netflix", "spotify", "disney", "hbo", "youtube", "apple.com", "google");
        category("shopping", "amazon", "mercadolibre", "mercado libre", "falabella", "zara");
        category("health", "farmatodo", "drogueria", "cruz verde", "colsubsidio");
        category("utilities", "claro", "movistar", "tigo", "etb", "epm", "codensa", "enel", "vanti", "directv");
    }

    private static void category(String id, String... keys) {
        for (String key : keys) {
            MERCHANT_CATEGORIES.put(
                    Pattern.compile("(?<![\\p{L}0-9])" + Pattern.quote(key) + "(?![\\p{L}0-9])"), id);
        }
    }

    private BankMessageParser() {}

    /** Devuelve la transacción detectada o null si el mensaje no es un movimiento bancario. */
    public static Alert parse(String body, String defaultCurrency, long receivedAt) {
        if (body == null || body.length() < 12) {
            return null;
        }
        String folded = fold(body);
        if (!BANK_HINT.matcher(folded).find() || NOT_A_TRANSACTION.matcher(folded).find()) {
            return null;
        }
        Matcher amountMatch = AMOUNT.matcher(folded);
        if (!amountMatch.find()) {
            return null;
        }
        boolean income = INCOME.matcher(folded).find();
        if (!income && !EXPENSE.matcher(folded).find()) {
            return null;
        }
        double amount = toNumber(amountMatch.group(2));
        if (amount <= 0) {
            return null;
        }
        String currency = amountMatch.group(1).startsWith("us") ? "USD" : defaultCurrency;
        String date = extractDate(body, receivedAt);

        if (income) {
            boolean salary = SALARY.matcher(folded).find();
            String sender = findName(SENDER, body);
            String description = salary ? "Nómina" : sender != null ? "Transferencia de " + sender : "Ingreso bancario";
            return new Alert("income", amount, currency, date, sender, description,
                    salary ? "salary" : "transfer", fingerprint(folded));
        }

        String merchant = findName(MERCHANT, body);
        String description = WITHDRAWAL.matcher(folded).find()
                ? "Retiro de efectivo"
                : merchant != null ? merchant : "Movimiento bancario";
        return new Alert("expense", amount, currency, date, merchant, description,
                categoryFor(merchant), fingerprint(folded));
    }

    static double toNumber(String raw) {
        // "45.900,00" y "25.99" terminan en decimales; "150,000" usa separador de miles.
        String s = raw;
        String fraction = "";
        Matcher decimals = Pattern.compile("[.,](\\d{1,2})$").matcher(s);
        if (decimals.find()) {
            fraction = decimals.group(1);
            s = s.substring(0, decimals.start());
        }
        String integer = s.replaceAll("[.,]", "");
        try {
            return Double.parseDouble(fraction.isEmpty() ? integer : integer + "." + fraction);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    private static String findName(Pattern pattern, String body) {
        Matcher m = pattern.matcher(body);
        while (m.find()) {
            String name = m.group(1).replaceAll("[\\s.*'-]+$", "").trim();
            String folded = fold(name);
            if (name.length() >= 2 && folded.matches(".*\\p{L}.*") && !NOT_A_NAME.matcher(folded).find()) {
                return titleCase(name);
            }
        }
        return null;
    }

    private static String categoryFor(String merchant) {
        if (merchant == null) {
            return "other";
        }
        String folded = fold(merchant);
        for (Map.Entry<Pattern, String> entry : MERCHANT_CATEGORIES.entrySet()) {
            if (entry.getKey().matcher(folded).find()) {
                return entry.getValue();
            }
        }
        return "other";
    }

    private static String extractDate(String body, long receivedAt) {
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        String received = iso.format(new Date(receivedAt));
        Matcher m = DATE.matcher(body);
        if (!m.find()) {
            return received;
        }
        int year = Integer.parseInt(m.group(3));
        String candidate = String.format(Locale.ROOT, "%04d-%02d-%02d",
                year < 100 ? year + 2000 : year, Integer.parseInt(m.group(2)), Integer.parseInt(m.group(1)));
        iso.setLenient(false);
        try {
            Date parsed = iso.parse(candidate);
            // Una fecha posterior a la recepción es un error de lectura (p. ej. un vencimiento).
            return parsed.getTime() > receivedAt + 86_400_000L ? received : candidate;
        } catch (ParseException e) {
            return received;
        }
    }

    static String fold(String text) {
        String nfd = Normalizer.normalize(text, Normalizer.Form.NFD);
        return nfd.replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
    }

    private static String titleCase(String text) {
        StringBuilder out = new StringBuilder();
        for (String word : text.toLowerCase(Locale.ROOT).split("\\s+")) {
            if (word.isEmpty()) {
                continue;
            }
            if (out.length() > 0) {
                out.append(' ');
            }
            out.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return out.toString();
    }

    private static String fingerprint(String folded) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(folded.replaceAll("\\s+", " ").trim().getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
