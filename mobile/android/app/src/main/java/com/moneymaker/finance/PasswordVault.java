package com.moneymaker.finance;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Locale;

/**
 * Contraseña de acceso a la app, verificada dentro del teléfono.
 *
 * Nunca se guarda la contraseña: solo el derivado PBKDF2-HMAC-SHA256 con una sal
 * aleatoria por usuario. Formato almacenado:
 * "pbkdf2-sha256$iteraciones$salHex$derivadoHex".
 *
 * Esto bloquea el acceso a la app; la base de datos en sí no queda cifrada
 * (para eso está el respaldo cifrado de {@link BackupCipher}).
 */
public final class PasswordVault {

    public static final int MIN_USERNAME_LENGTH = 3;
    public static final int MAX_USERNAME_LENGTH = 32;
    public static final int MIN_PASSWORD_LENGTH = 8;
    public static final int MAX_PASSWORD_LENGTH = 128;

    /** Intentos fallidos consecutivos antes del primer bloqueo temporal. */
    public static final int ATTEMPTS_BEFORE_LOCK = 5;
    private static final long FIRST_LOCK_MILLIS = 30_000L;
    private static final long MAX_LOCK_MILLIS = 15 * 60_000L;

    private static final String ALGORITHM = "pbkdf2-sha256";
    static final int ITERATIONS = 210_000;
    private static final int SALT_BYTES = 16;

    private PasswordVault() {}

    /** Usuario tal como se compara: sin espacios alrededor y sin distinguir mayúsculas. */
    public static String normalizeUsername(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    public static void requireValid(String username, char[] password) {
        String normalized = normalizeUsername(username);
        if (normalized.length() < MIN_USERNAME_LENGTH || normalized.length() > MAX_USERNAME_LENGTH) {
            throw new IllegalArgumentException("El usuario debe tener entre "
                    + MIN_USERNAME_LENGTH + " y " + MAX_USERNAME_LENGTH + " caracteres");
        }
        if (password == null || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
            throw new IllegalArgumentException("La contraseña debe tener al menos "
                    + MIN_PASSWORD_LENGTH + " caracteres");
        }
    }

    /** Deriva la contraseña con una sal nueva. Devuelve la cadena que se guarda en la base. */
    public static String hash(char[] password) {
        byte[] salt = new byte[SALT_BYTES];
        new SecureRandom().nextBytes(salt);
        return hash(password, salt, ITERATIONS);
    }

    static String hash(char[] password, byte[] salt, int iterations) {
        byte[] derived = null;
        try {
            derived = BackupCipher.pbkdf2Sha256(password, salt, iterations);
            return ALGORITHM + "$" + iterations + "$" + toHex(salt) + "$" + toHex(derived);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Cifrado no disponible en este dispositivo", e);
        } finally {
            if (derived != null) {
                Arrays.fill(derived, (byte) 0);
            }
        }
    }

    /** Comparación en tiempo constante contra el derivado guardado. */
    public static boolean verify(char[] password, String stored) {
        // Una contraseña vacía nunca es válida (y HmacSHA256 rechaza claves vacías).
        if (password == null || password.length == 0 || stored == null) {
            return false;
        }
        String[] parts = stored.split("\\$");
        if (parts.length != 4 || !ALGORITHM.equals(parts[0])) {
            return false;
        }
        byte[] salt;
        byte[] expected;
        int iterations;
        try {
            iterations = Integer.parseInt(parts[1]);
            salt = fromHex(parts[2]);
            expected = fromHex(parts[3]);
        } catch (IllegalArgumentException e) {
            return false;
        }
        if (iterations < 1_000 || salt.length == 0 || expected.length == 0) {
            return false;
        }
        byte[] derived = null;
        try {
            derived = BackupCipher.pbkdf2Sha256(password, salt, iterations);
            return MessageDigest.isEqual(derived, expected);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Cifrado no disponible en este dispositivo", e);
        } finally {
            if (derived != null) {
                Arrays.fill(derived, (byte) 0);
            }
        }
    }

    /**
     * Espera tras {@code failedAttempts} fallos seguidos: los primeros intentos son
     * libres y a partir de ahí la espera se duplica hasta un tope de 15 minutos.
     */
    public static long lockMillis(int failedAttempts) {
        if (failedAttempts < ATTEMPTS_BEFORE_LOCK) {
            return 0;
        }
        long wait = FIRST_LOCK_MILLIS;
        for (int i = ATTEMPTS_BEFORE_LOCK; i < failedAttempts && wait < MAX_LOCK_MILLIS; i++) {
            wait *= 2;
        }
        return Math.min(wait, MAX_LOCK_MILLIS);
    }

    private static String toHex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            out.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
        }
        return out.toString();
    }

    private static byte[] fromHex(String value) {
        if (value.length() % 2 != 0) {
            throw new IllegalArgumentException("hex inválido");
        }
        byte[] out = new byte[value.length() / 2];
        for (int i = 0; i < out.length; i++) {
            int high = Character.digit(value.charAt(i * 2), 16);
            int low = Character.digit(value.charAt(i * 2 + 1), 16);
            if (high < 0 || low < 0) {
                throw new IllegalArgumentException("hex inválido");
            }
            out[i] = (byte) ((high << 4) | low);
        }
        return out;
    }
}
