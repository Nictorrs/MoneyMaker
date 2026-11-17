package com.moneymaker.finance;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.fail;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

public class BackupCipherTest {

    private static final char[] PASSPHRASE = "correcto caballo bateria".toCharArray();
    private static final byte[] PLAINTEXT = "{\"transactions\":[{\"amount\":45900}]}".getBytes(StandardCharsets.UTF_8);

    private static byte[] hex(String value) {
        byte[] out = new byte[value.length() / 2];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    private static BackupCipher.BackupException.Reason decryptFailure(byte[] blob, char[] passphrase) {
        try {
            BackupCipher.decrypt(blob, passphrase);
        } catch (BackupCipher.BackupException e) {
            return e.reason;
        }
        fail("se esperaba BackupException");
        return null;
    }

    @Test
    public void pbkdf2MatchesRfc7914Vector() throws Exception {
        byte[] derived = BackupCipher.pbkdf2Sha256("passwd".toCharArray(), "salt".getBytes(StandardCharsets.US_ASCII), 1);
        assertArrayEquals(hex("55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc"), derived);
    }

    @Test
    public void pbkdf2MatchesJceImplementation() throws Exception {
        byte[] salt = hex("000102030405060708090a0b0c0d0e0f");
        for (int iterations : new int[] {2, 1000, 4097}) {
            PBEKeySpec spec = new PBEKeySpec(PASSPHRASE, salt, iterations, 256);
            byte[] expected = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            assertArrayEquals(expected, BackupCipher.pbkdf2Sha256(PASSPHRASE, salt, iterations));
        }
    }

    @Test
    public void roundTripWithRandomizedOutput() throws Exception {
        byte[] first = BackupCipher.encrypt(PLAINTEXT, PASSPHRASE, BackupCipher.MIN_ITERATIONS);
        byte[] second = BackupCipher.encrypt(PLAINTEXT, PASSPHRASE, BackupCipher.MIN_ITERATIONS);
        assertFalse(Arrays.equals(first, second));
        assertArrayEquals(PLAINTEXT, BackupCipher.decrypt(first, PASSPHRASE));
        assertArrayEquals(PLAINTEXT, BackupCipher.decrypt(second, PASSPHRASE));
    }

    @Test
    public void defaultIterationsRoundTrip() throws Exception {
        assertArrayEquals(PLAINTEXT, BackupCipher.decrypt(BackupCipher.encrypt(PLAINTEXT, PASSPHRASE), PASSPHRASE));
    }

    @Test
    public void wrongPassphraseAndTamperingAreDetected() throws Exception {
        byte[] blob = BackupCipher.encrypt(PLAINTEXT, PASSPHRASE, BackupCipher.MIN_ITERATIONS);
        assertEquals(BackupCipher.BackupException.Reason.WRONG_PASSPHRASE_OR_CORRUPTED,
                decryptFailure(blob, "otra contraseña".toCharArray()));

        byte[] tamperedBody = blob.clone();
        tamperedBody[tamperedBody.length - 1] ^= 1;
        assertEquals(BackupCipher.BackupException.Reason.WRONG_PASSPHRASE_OR_CORRUPTED, decryptFailure(tamperedBody, PASSPHRASE));

        byte[] tamperedSalt = blob.clone();
        tamperedSalt[12] ^= 1; // dentro de la sal, que va autenticada como AAD
        assertEquals(BackupCipher.BackupException.Reason.WRONG_PASSPHRASE_OR_CORRUPTED, decryptFailure(tamperedSalt, PASSPHRASE));
    }

    @Test
    public void rejectsForeignFilesAndWeakPassphrases() throws Exception {
        assertEquals(BackupCipher.BackupException.Reason.INVALID_FORMAT,
                decryptFailure("no soy un respaldo, solo texto plano suficientemente largo".getBytes(StandardCharsets.UTF_8), PASSPHRASE));
        assertEquals(BackupCipher.BackupException.Reason.INVALID_FORMAT, decryptFailure(new byte[10], PASSPHRASE));

        byte[] lowIterations = BackupCipher.encrypt(PLAINTEXT, PASSPHRASE, BackupCipher.MIN_ITERATIONS);
        lowIterations[5] = 0; // byte alto del contador de iteraciones -> por debajo del mínimo
        lowIterations[6] = 0;
        assertEquals(BackupCipher.BackupException.Reason.INVALID_FORMAT, decryptFailure(lowIterations, PASSPHRASE));

        try {
            BackupCipher.encrypt(PLAINTEXT, "corta".toCharArray());
            fail("se esperaba rechazo de contraseña débil");
        } catch (BackupCipher.BackupException e) {
            assertEquals(BackupCipher.BackupException.Reason.WEAK_PASSPHRASE, e.reason);
        }
    }
}
