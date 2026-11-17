package com.moneymaker.finance;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.Test;

public class PasswordVaultTest {

    private static final char[] PASSWORD = "caballo-bateria-9".toCharArray();

    private static String hashFast(String password) {
        return PasswordVault.hash(password.toCharArray(), new byte[] {1, 2, 3, 4}, 1_000);
    }

    @Test
    public void verifiesTheRightPasswordAndRejectsOthers() {
        String stored = hashFast("caballo-bateria-9");
        assertTrue(PasswordVault.verify(PASSWORD, stored));
        assertFalse(PasswordVault.verify("caballo-bateria-8".toCharArray(), stored));
        assertFalse(PasswordVault.verify("".toCharArray(), stored));
        assertFalse(PasswordVault.verify(null, stored));
    }

    @Test
    public void neverStoresThePasswordAndSaltsEachHash() {
        String first = PasswordVault.hash(PASSWORD);
        String second = PasswordVault.hash(PASSWORD);
        assertNotEquals(first, second);
        assertFalse(first.contains("caballo"));
        assertEquals("pbkdf2-sha256", first.split("\\$")[0]);
        assertEquals(String.valueOf(PasswordVault.ITERATIONS), first.split("\\$")[1]);
        assertTrue(PasswordVault.verify(PASSWORD, first));
        assertTrue(PasswordVault.verify(PASSWORD, second));
    }

    @Test
    public void rejectsDamagedOrForeignHashes() {
        String stored = hashFast("caballo-bateria-9");
        assertFalse(PasswordVault.verify(PASSWORD, "no soy un hash"));
        assertFalse(PasswordVault.verify(PASSWORD, "md5$1000$aa$bb"));
        assertFalse(PasswordVault.verify(PASSWORD, stored.substring(0, stored.length() - 2)));
        assertFalse(PasswordVault.verify(PASSWORD, stored.replace("$1000$", "$10$")));
        assertFalse(PasswordVault.verify(PASSWORD, "pbkdf2-sha256$1000$zz$bb"));
    }

    @Test
    public void comparesUsernamesWithoutCaseOrSpaces() {
        assertEquals("nicolas", PasswordVault.normalizeUsername("  Nicolas "));
        assertEquals("nicolas", PasswordVault.normalizeUsername("NICOLAS"));
        assertEquals("", PasswordVault.normalizeUsername(null));
    }

    @Test
    public void requiresAUsableUsernameAndPassword() {
        PasswordVault.requireValid("nicolas", PASSWORD);
        assertRejected("ni", PASSWORD);
        assertRejected("   ", PASSWORD);
        assertRejected("nicolas", "corta".toCharArray());
        assertRejected("nicolas", null);
        assertRejected(null, PASSWORD);
    }

    @Test
    public void waitsLongerAfterEveryExtraFailure() {
        for (int attempts = 0; attempts < PasswordVault.ATTEMPTS_BEFORE_LOCK; attempts++) {
            assertEquals(0, PasswordVault.lockMillis(attempts));
        }
        assertEquals(30_000, PasswordVault.lockMillis(5));
        assertEquals(60_000, PasswordVault.lockMillis(6));
        assertEquals(120_000, PasswordVault.lockMillis(7));
        assertEquals(900_000, PasswordVault.lockMillis(12));
        assertEquals(900_000, PasswordVault.lockMillis(90));
    }

    private static void assertRejected(String username, char[] password) {
        try {
            PasswordVault.requireValid(username, password);
            fail("se esperaba rechazo de " + username);
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().length() > 0);
        }
    }
}
