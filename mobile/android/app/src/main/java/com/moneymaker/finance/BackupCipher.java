package com.moneymaker.finance;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;

import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Cifrado de respaldos con la contraseña del usuario: PBKDF2-HMAC-SHA256 +
 * AES-256-GCM. El encabezado (formato, versión, iteraciones, sal e IV) va
 * autenticado como AAD, así que cualquier alteración invalida el archivo.
 *
 * Formato: "MMBK" | versión (1) | iteraciones (int) | sal (16) | IV (12) | cifrado + tag (16)
 */
public final class BackupCipher {

    public static final int MIN_PASSPHRASE_LENGTH = 8;
    static final int DEFAULT_ITERATIONS = 600_000;
    static final int MIN_ITERATIONS = 100_000;
    private static final int MAX_ITERATIONS = 10_000_000;

    private static final byte[] MAGIC = {'M', 'M', 'B', 'K'};
    private static final byte VERSION = 1;
    private static final int SALT_BYTES = 16;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final int HEADER_BYTES = MAGIC.length + 1 + Integer.BYTES + SALT_BYTES + IV_BYTES;

    public static final class BackupException extends Exception {
        public enum Reason { WEAK_PASSPHRASE, INVALID_FORMAT, WRONG_PASSPHRASE_OR_CORRUPTED, CRYPTO_UNAVAILABLE }

        private static final long serialVersionUID = 1L;

        public final Reason reason;

        BackupException(Reason reason, String message, Throwable cause) {
            super(message, cause);
            this.reason = reason;
        }
    }

    private BackupCipher() {}

    public static byte[] encrypt(byte[] plaintext, char[] passphrase) throws BackupException {
        return encrypt(plaintext, passphrase, DEFAULT_ITERATIONS);
    }

    static byte[] encrypt(byte[] plaintext, char[] passphrase, int iterations) throws BackupException {
        requireStrongEnough(passphrase);
        SecureRandom random = new SecureRandom();
        byte[] salt = new byte[SALT_BYTES];
        byte[] iv = new byte[IV_BYTES];
        random.nextBytes(salt);
        random.nextBytes(iv);

        byte[] header = ByteBuffer.allocate(HEADER_BYTES)
                .put(MAGIC).put(VERSION).putInt(iterations).put(salt).put(iv).array();
        byte[] key = null;
        try {
            key = pbkdf2Sha256(passphrase, salt, iterations);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(header);
            byte[] ciphertext = cipher.doFinal(plaintext);
            return ByteBuffer.allocate(header.length + ciphertext.length).put(header).put(ciphertext).array();
        } catch (GeneralSecurityException e) {
            throw new BackupException(BackupException.Reason.CRYPTO_UNAVAILABLE, "Cifrado no disponible", e);
        } finally {
            if (key != null) {
                Arrays.fill(key, (byte) 0);
            }
        }
    }

    public static byte[] decrypt(byte[] blob, char[] passphrase) throws BackupException {
        if (blob == null || blob.length < HEADER_BYTES + TAG_BITS / 8) {
            throw invalidFormat();
        }
        ByteBuffer buffer = ByteBuffer.wrap(blob);
        byte[] magic = new byte[MAGIC.length];
        buffer.get(magic);
        if (!Arrays.equals(magic, MAGIC) || buffer.get() != VERSION) {
            throw invalidFormat();
        }
        int iterations = buffer.getInt();
        if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
            throw invalidFormat();
        }
        byte[] salt = new byte[SALT_BYTES];
        byte[] iv = new byte[IV_BYTES];
        buffer.get(salt).get(iv);

        byte[] key = null;
        try {
            key = pbkdf2Sha256(passphrase, salt, iterations);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(blob, 0, HEADER_BYTES);
            return cipher.doFinal(blob, HEADER_BYTES, blob.length - HEADER_BYTES);
        } catch (AEADBadTagException e) {
            throw new BackupException(BackupException.Reason.WRONG_PASSPHRASE_OR_CORRUPTED,
                    "Contraseña incorrecta o archivo dañado", e);
        } catch (GeneralSecurityException e) {
            throw new BackupException(BackupException.Reason.CRYPTO_UNAVAILABLE, "Cifrado no disponible", e);
        } finally {
            if (key != null) {
                Arrays.fill(key, (byte) 0);
            }
        }
    }

    /**
     * PBKDF2-HMAC-SHA256 con un bloque de salida (32 bytes). Se implementa sobre
     * HmacSHA256 porque "PBKDF2WithHmacSHA256" no existe en Android antes de API 26.
     */
    static byte[] pbkdf2Sha256(char[] passphrase, byte[] salt, int iterations) throws GeneralSecurityException {
        byte[] password = utf8(passphrase);
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(password, "HmacSHA256"));
            mac.update(salt);
            mac.update(new byte[] {0, 0, 0, 1});
            byte[] u = mac.doFinal();
            byte[] result = u.clone();
            for (int i = 1; i < iterations; i++) {
                mac.update(u);
                mac.doFinal(u, 0);
                for (int j = 0; j < result.length; j++) {
                    result[j] ^= u[j];
                }
            }
            return result;
        } finally {
            Arrays.fill(password, (byte) 0);
        }
    }

    private static void requireStrongEnough(char[] passphrase) throws BackupException {
        if (passphrase == null || passphrase.length < MIN_PASSPHRASE_LENGTH) {
            throw new BackupException(BackupException.Reason.WEAK_PASSPHRASE,
                    "La contraseña debe tener al menos " + MIN_PASSPHRASE_LENGTH + " caracteres", null);
        }
    }

    private static BackupException invalidFormat() {
        return new BackupException(BackupException.Reason.INVALID_FORMAT, "El archivo no es un respaldo de MoneyMaker", null);
    }

    private static byte[] utf8(char[] chars) {
        ByteBuffer encoded = StandardCharsets.UTF_8.encode(CharBuffer.wrap(chars));
        byte[] bytes = new byte[encoded.remaining()];
        encoded.get(bytes);
        if (encoded.hasArray()) {
            Arrays.fill(encoded.array(), (byte) 0);
        }
        return bytes;
    }
}
