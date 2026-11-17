package com.moneymaker.finance;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Divide un script SQL en sentencias sueltas, porque SQLiteDatabase.execSQL ejecuta
 * solo una por llamada.
 *
 * Ignora los comentarios y los ';' dentro de textos entre comillas. En un CREATE TRIGGER,
 * los ';' del cuerpo no cierran la sentencia: solo la cierra el ';' que sigue a END.
 * No admite un CASE ... END; dentro del cuerpo de un trigger (los scripts de database/ no lo usan).
 */
final class SqlScript {

    private SqlScript() {}

    static List<String> statements(String script) {
        List<String> result = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        List<String> leadingWords = new ArrayList<>();
        String lastToken = "";
        int i = 0;
        int n = script.length();
        while (i < n) {
            char c = script.charAt(i);
            if (c == '-' && i + 1 < n && script.charAt(i + 1) == '-') {
                while (i < n && script.charAt(i) != '\n') {
                    i++;
                }
                continue;
            }
            if (c == '/' && i + 1 < n && script.charAt(i + 1) == '*') {
                int end = script.indexOf("*/", i + 2);
                i = end < 0 ? n : end + 2;
                current.append(' ');
                continue;
            }
            if (c == '\'' || c == '"') {
                int end = closingQuote(script, i, c);
                current.append(script, i, end);
                lastToken = String.valueOf(c);
                i = end;
                continue;
            }
            if (Character.isLetter(c) || c == '_') {
                int end = i;
                while (end < n && (Character.isLetterOrDigit(script.charAt(end)) || script.charAt(end) == '_')) {
                    end++;
                }
                String word = script.substring(i, end).toUpperCase(Locale.ROOT);
                if (leadingWords.size() < 3) {
                    leadingWords.add(word);
                }
                lastToken = word;
                current.append(script, i, end);
                i = end;
                continue;
            }
            if (c == ';' && (!isTrigger(leadingWords) || "END".equals(lastToken))) {
                String statement = current.toString().trim();
                if (!statement.isEmpty()) {
                    result.add(statement);
                }
                current.setLength(0);
                leadingWords.clear();
                lastToken = "";
                i++;
                continue;
            }
            if (!Character.isWhitespace(c)) {
                lastToken = String.valueOf(c);
            }
            current.append(c);
            i++;
        }
        String rest = current.toString().trim();
        if (!rest.isEmpty()) {
            if (isTrigger(leadingWords)) {
                throw new IllegalArgumentException("CREATE TRIGGER sin END; al final del script");
            }
            result.add(rest);
        }
        return result;
    }

    /** Posición siguiente a la comilla que cierra; una comilla doble ('') es una comilla escapada. */
    private static int closingQuote(String script, int start, char quote) {
        int i = start + 1;
        while (i < script.length()) {
            if (script.charAt(i) == quote) {
                if (i + 1 < script.length() && script.charAt(i + 1) == quote) {
                    i += 2;
                    continue;
                }
                return i + 1;
            }
            i++;
        }
        throw new IllegalArgumentException("Texto entre comillas sin cerrar en el script SQL");
    }

    private static boolean isTrigger(List<String> words) {
        if (words.size() < 2 || !"CREATE".equals(words.get(0))) {
            return false;
        }
        String second = words.get(1);
        return "TRIGGER".equals(second)
                || (("TEMP".equals(second) || "TEMPORARY".equals(second)) && words.size() > 2 && "TRIGGER".equals(words.get(2)));
    }
}
