package com.moneymaker.finance;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.List;

public class SqlScriptTest {

    /** Las pruebas de Gradle corren desde mobile/android/app; los scripts están en database/. */
    private static String script(String name) throws IOException {
        Path path = Paths.get("..", "..", "..", "database", name);
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
    }

    private static long countStartingWith(List<String> statements, String prefix) {
        return statements.stream().filter(s -> s.startsWith(prefix)).count();
    }

    @Test
    public void splitsStatementsAndDropsComments() {
        List<String> statements = SqlScript.statements(
                "-- comentario; con punto y coma\nCREATE TABLE a (x TEXT);\n/* otro; */ INSERT INTO a VALUES ('uno; dos');\n\n");
        assertEquals(Arrays.asList("CREATE TABLE a (x TEXT)", "INSERT INTO a VALUES ('uno; dos')"), statements);
    }

    @Test
    public void keepsTheBodyOfATriggerTogether() {
        List<String> statements = SqlScript.statements(
                "CREATE TRIGGER t BEFORE INSERT ON a WHEN (CASE NEW.x WHEN 'it''s' THEN 1 ELSE 0 END) = 1\n"
                        + "BEGIN\n    SELECT RAISE(ABORT, 'no; vale');\n    DELETE FROM a;\nEND;\nSELECT 1;");
        assertEquals(2, statements.size());
        assertTrue(statements.get(0).endsWith("END"));
        assertTrue(statements.get(0).contains("DELETE FROM a;"));
        assertEquals("SELECT 1", statements.get(1));
    }

    @Test
    public void rejectsUnfinishedScripts() {
        try {
            SqlScript.statements("CREATE TRIGGER t BEFORE INSERT ON a BEGIN SELECT 1;");
            fail("un trigger sin END debe fallar");
        } catch (IllegalArgumentException expected) {
            // ok
        }
        try {
            SqlScript.statements("INSERT INTO a VALUES ('sin cerrar);");
            fail("un texto sin cerrar debe fallar");
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }

    private static void assertTriggersEndWithEnd(List<String> statements) {
        for (String statement : statements) {
            if (statement.startsWith("CREATE TRIGGER")) {
                assertTrue(statement, statement.endsWith("END"));
            }
        }
    }

    @Test
    public void splitsTheRealSchema() throws IOException {
        List<String> statements = SqlScript.statements(script("esquema.sql"));
        assertEquals(11, countStartingWith(statements, "CREATE TABLE"));
        assertEquals(5, countStartingWith(statements, "CREATE INDEX"));
        assertEquals(11, countStartingWith(statements, "CREATE TRIGGER"));
        assertEquals(10, countStartingWith(statements, "CREATE VIEW"));
        assertEquals(4, countStartingWith(statements, "INSERT INTO"));
        assertEquals(2, countStartingWith(statements, "PRAGMA"));
        assertEquals(43, statements.size());
        assertTriggersEndWithEnd(statements);
    }

    @Test
    public void splitsTheImportScript() throws IOException {
        List<String> statements = SqlScript.statements(script("importar.sql"));
        assertEquals(12, statements.size());
        assertEquals(1, countStartingWith(statements, "INSERT OR REPLACE INTO settings"));
        assertEquals(1, countStartingWith(statements, "INSERT OR IGNORE INTO transactions"));
        assertEquals(1, countStartingWith(statements, "INSERT OR IGNORE INTO goals"));
        assertEquals(1, countStartingWith(statements, "INSERT OR IGNORE INTO category_feedback"));
        assertEquals(2, countStartingWith(statements, "CREATE TEMP VIEW"));
        assertEquals(2, countStartingWith(statements, "INSERT INTO goal_contributions"));
        assertEquals(1, countStartingWith(statements, "INSERT OR IGNORE INTO goal_contributions"));
        assertEquals(2, countStartingWith(statements, "DROP VIEW temp."));
        assertEquals(1, countStartingWith(statements, "INSERT OR IGNORE INTO badge_unlocks"));
    }

    @Test
    public void splitsTheVersion5Migration() throws IOException {
        List<String> statements = SqlScript.statements(script("migracion_v5.sql"));
        assertEquals(14, statements.size());
        assertEquals(3, countStartingWith(statements, "CREATE TABLE"));
        assertEquals(5, countStartingWith(statements, "CREATE TRIGGER"));
        assertEquals(2, countStartingWith(statements, "CREATE VIEW"));
        assertEquals(2, countStartingWith(statements, "INSERT INTO"));
        assertTriggersEndWithEnd(statements);
    }
}
