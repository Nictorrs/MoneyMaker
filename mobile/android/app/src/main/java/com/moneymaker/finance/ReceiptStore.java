package com.moneymaker.finance;

import android.content.Context;
import android.net.Uri;

import androidx.annotation.Nullable;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fotos de recibo guardadas como evidencia de un movimiento. No se leen ni se
 * interpretan: se copian a la carpeta privada de la app
 * (files/receipts/<id>-<marca de tiempo>.jpg) y se muestran tal cual. No forman
 * parte de la base ni del respaldo cifrado.
 *
 * La marca de tiempo en el nombre hace que una foto nueva tenga otra URI, así la
 * vista no muestra la anterior desde su caché.
 */
final class ReceiptStore {

    private static final String DIR = "receipts";
    private static final Pattern SAFE_ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");
    private static final Pattern FILE_NAME = Pattern.compile("(.+)-(\\d+)\\.jpg");

    private ReceiptStore() {}

    private static File dir(Context context) {
        return new File(context.getFilesDir(), DIR);
    }

    private static boolean isSafe(@Nullable String transactionId) {
        return transactionId != null && SAFE_ID.matcher(transactionId).matches();
    }

    @Nullable
    private static String ownerOf(File file) {
        Matcher m = FILE_NAME.matcher(file.getName());
        return m.matches() ? m.group(1) : null;
    }

    private static File[] list(Context context) {
        File[] files = dir(context).listFiles();
        return files == null ? new File[0] : files;
    }

    /** Copia la imagen elegida (file:// o content://) y devuelve la URI de la copia. */
    static String save(Context context, String transactionId, String sourceUri) throws IOException {
        if (!isSafe(transactionId)) {
            throw new IllegalArgumentException("id de movimiento inválido");
        }
        File folder = dir(context);
        if (!folder.isDirectory() && !folder.mkdirs()) {
            throw new IOException("No se pudo crear la carpeta de recibos");
        }
        File temp = new File(folder, transactionId + ".tmp");
        try (InputStream in = context.getContentResolver().openInputStream(Uri.parse(sourceUri));
             OutputStream out = new FileOutputStream(temp)) {
            if (in == null) {
                throw new IOException("No se pudo leer la imagen");
            }
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
        } catch (IOException | RuntimeException e) {
            temp.delete();
            throw e;
        }
        File target = new File(folder, transactionId + "-" + System.currentTimeMillis() + ".jpg");
        if (!temp.renameTo(target)) {
            temp.delete();
            throw new IOException("No se pudo guardar el recibo");
        }
        // La foto nueva ya está escrita: recién ahora se borran las anteriores.
        for (File file : list(context)) {
            if (!file.equals(target) && transactionId.equals(ownerOf(file))) {
                file.delete();
            }
        }
        return Uri.fromFile(target).toString();
    }

    @Nullable
    static String find(Context context, String transactionId) {
        if (!isSafe(transactionId)) {
            return null;
        }
        File newest = null;
        for (File file : list(context)) {
            if (transactionId.equals(ownerOf(file)) && (newest == null || file.getName().compareTo(newest.getName()) > 0)) {
                newest = file;
            }
        }
        return newest == null ? null : Uri.fromFile(newest).toString();
    }

    static boolean delete(Context context, String transactionId) {
        boolean removed = false;
        for (File file : list(context)) {
            if (transactionId != null && transactionId.equals(ownerOf(file))) {
                removed |= file.delete();
            }
        }
        return removed;
    }

    /** Borra las fotos cuyo movimiento ya no existe (y temporales a medias); devuelve cuántas borró. */
    static int prune(Context context, Set<String> transactionIds) {
        int removed = 0;
        for (File file : list(context)) {
            String owner = ownerOf(file);
            if ((owner == null || !transactionIds.contains(owner)) && file.delete()) {
                removed++;
            }
        }
        return removed;
    }

    static void deleteAll(Context context) {
        for (File file : list(context)) {
            file.delete();
        }
    }
}
