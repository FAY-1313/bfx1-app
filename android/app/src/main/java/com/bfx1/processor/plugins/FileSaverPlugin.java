package com.bfx1.processor.plugins;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import android.provider.DocumentsContract;

/**
 * BFX1 file saver plugin (v74 / 2026-10-16)
 *
 * Why this exists:
 *   Exporting a preset .json from inside the Capacitor WebView does not work with
 *   web-only tricks on this device:
 *     - Blob + <a download> is swallowed (no DownloadListener on the WebView).
 *     - navigator.share / canShare({files}) is unavailable in this WebView.
 *   User report was "saved a JSON but I cannot find it anywhere".
 *
 *   So we ship a tiny native plugin compiled as part of the app module (JDK 17,
 *   no extra npm native dependency, no JDK 21 toolchain needed):
 *
 *   save({filename, content, subdir})
 *     - API 29+ : write via MediaStore.Downloads into "Download/<subdir>/"
 *                 (no permission required, immediately searchable in file managers)
 *     - API <29 : delegate to the SAF picker (ACTION_CREATE_DOCUMENT)
 *     resolves { displayPath }
 *
 *   saveAs({filename, content})
 *     - always opens the SAF document picker so the user chooses the folder
 *     resolves { uri }
 */
@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    private static final String DEFAULT_SUBDIR = "BFX1";

    /* Content held between launching the SAF picker and its result callback.
       If the OS recycles the process in between (extremely unlikely for a 2 KB
       JSON) the call is rejected and the user simply retries. */
    private String pendingContent;

    /* v3.68: multi-file export — pending list kept across the folder picker. */
    private JSArray pendingFiles;
    private String pendingSubdir;

    @PluginMethod
    public void save(PluginCall call) {
        final String filename = sanitizeName(call.getString("filename"));
        final String content = call.getString("content");
        if (filename == null || content == null) {
            call.reject("filename and content are required");
            return;
        }
        final String subdir = sanitizeSegment(call.getString("subdir", DEFAULT_SUBDIR));
        final String mime = mimeOf(filename, call.getString("mime"));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                JSObject ret = new JSObject();
                ret.put("displayPath", saveViaMediaStore(filename, content, subdir, mime));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("save failed: " + e.getMessage());
            }
        } else {
            /* API 24-28: no WRITE_EXTERNAL_STORAGE grant path here, use SAF instead */
            saveAs(call);
        }
    }

    /**
     * v3.68: write several files into Download/<subdir>/ in one call.
     * Used by the local-bank "export three formats" button.
     * On API < 29 there is no MediaStore path, so it falls back to the SAF
     * folder picker (the user chooses the destination, which is exactly what
     * "open a folder and save into it" means for those devices).
     */
    @PluginMethod
    public void saveMany(PluginCall call) {
        final JSArray files = call.getArray("files");
        final String subdir = sanitizeSegment(call.getString("subdir", DEFAULT_SUBDIR));
        if (files == null || files.length() == 0) { call.reject("files is empty"); return; }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            this.pendingFiles = files;
            this.pendingSubdir = subdir;
            launchFolderPicker(call);
            return;
        }
        try {
            JSArray paths = new JSArray();
            for (int i = 0; i < files.length(); i++) {
                org.json.JSONObject f = files.getJSONObject(i);
                String name = sanitizeName(f.getString("filename"));
                String content = f.getString("content");
                if (name == null || content == null) continue;
                paths.put(saveViaMediaStore(name, content, subdir, mimeOf(name, f.getString("mime"))));
            }
            JSObject ret = new JSObject();
            ret.put("displayPaths", paths);
            ret.put("dir", "\u4e0b\u8f7d/" + subdir);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("save failed: " + e.getMessage());
        }
    }

    /**
     * v3.68: let the user pick a destination folder (SAF), then write all files
     * into <chosen>/<subdir>/ (falls back to <chosen>/ when the provider refuses
     * to create a subdirectory).
     * Resolves { folder, count } — no more "I cannot find the file".
     */
    @PluginMethod
    public void saveManyAs(PluginCall call) {
        JSArray files = call.getArray("files");
        if (files == null || files.length() == 0) { call.reject("files is empty"); return; }
        this.pendingFiles = files;
        this.pendingSubdir = sanitizeSegment(call.getString("subdir", DEFAULT_SUBDIR));
        launchFolderPicker(call);
    }

    private void launchFolderPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "saveManyAsResult");
    }

    @ActivityCallback
    private void saveManyAsResult(PluginCall call, ActivityResult result) {
        JSArray files = this.pendingFiles;
        String subdir = this.pendingSubdir;
        this.pendingFiles = null;
        this.pendingSubdir = null;

        if (files == null) { call.reject("EXPIRED"); return; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("CANCELED");
            return;
        }
        Uri tree = result.getData().getData();
        if (tree == null) { call.reject("NO_URI"); return; }

        ContentResolver resolver = getContext().getContentResolver();
        Uri dir = tree;
        boolean madeSubdir = false;
        try {
            Uri sub = DocumentsContract.createDocument(
                    resolver, tree, DocumentsContract.Document.MIME_TYPE_DIR, subdir);
            if (sub != null) { dir = sub; madeSubdir = true; }
        } catch (Exception ignore) {
            /* some providers do not allow creating directories -> write to root */
        }

        int count = 0;
        List<String> written = new ArrayList<>();
        for (int i = 0; i < files.length(); i++) {
            try {
                org.json.JSONObject f = files.getJSONObject(i);
                String name = sanitizeName(f.getString("filename"));
                String content = f.getString("content");
                if (name == null || content == null) continue;
                Uri doc = DocumentsContract.createDocument(resolver, dir, mimeOf(name, f.getString("mime")), name);
                if (doc == null) continue;
                try (OutputStream os = resolver.openOutputStream(doc)) {
                    if (os == null) continue;
                    os.write(content.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                }
                count++;
                written.add(name);
            } catch (Exception ignore) {
                /* one failed file must not abort the rest */
            }
        }
        if (count == 0) { call.reject("WRITE_FAILED"); return; }

        JSObject ret = new JSObject();
        ret.put("count", count);
        ret.put("folder", madeSubdir ? subdir : "");
        JSArray names = new JSArray();
        for (String n : written) names.put(n);
        ret.put("filenames", names);
        call.resolve(ret);
    }

    @PluginMethod
    public void saveAs(PluginCall call) {
        final String filename = sanitizeName(call.getString("filename"));
        final String content = call.getString("content");
        if (filename == null || content == null) {
            call.reject("filename and content are required");
            return;
        }
        this.pendingContent = content;

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeOf(filename, call.getString("mime")));
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "saveAsResult");
    }

    @ActivityCallback
    private void saveAsResult(PluginCall call, ActivityResult result) {
        String content = this.pendingContent;
        this.pendingContent = null;
        if (content == null) {
            call.reject("EXPIRED");
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("CANCELED");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("NO_URI");
            return;
        }
        try (OutputStream os = getContext().getContentResolver().openOutputStream(uri)) {
            if (os == null) throw new IllegalStateException("openOutputStream returned null");
            os.write(content.getBytes(StandardCharsets.UTF_8));
            os.flush();
        } catch (Exception e) {
            call.reject("write failed: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
        call.resolve(ret);
    }

    /* ------------------------------ MediaStore (API 29+) ------------------------------ */

    /** Writes to Download/<subdir>/<filename> and returns a user-facing display path. */
    private String saveViaMediaStore(String filename, String content, String subdir, String mime) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        String relative = Environment.DIRECTORY_DOWNLOADS + "/" + subdir; // "Download/BFX1"

        /* Overwrite on same name so the returned path always matches the real file
           (MediaStore would otherwise auto-rename to "file (1).json"). */
        Uri stale = null;
        try (android.database.Cursor c = resolver.query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                new String[]{MediaStore.Downloads._ID},
                MediaStore.Downloads.DISPLAY_NAME + "=? AND "
                        + MediaStore.Downloads.RELATIVE_PATH + " LIKE ?",
                new String[]{filename, relative + "%"}, null)) {
            if (c != null && c.moveToFirst()) {
                stale = Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        String.valueOf(c.getLong(0)));
            }
        } catch (Exception ignore) {
            /* a failed lookup must not block the save */
        }
        if (stale != null) {
            try { resolver.delete(stale, null, null); } catch (Exception ignore) { }
        }

        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
        values.put(MediaStore.Downloads.MIME_TYPE, mime);
        values.put(MediaStore.Downloads.RELATIVE_PATH, relative);
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("MediaStore insert returned null");

        try (OutputStream os = resolver.openOutputStream(uri)) {
            if (os == null) throw new IllegalStateException("openOutputStream returned null");
            os.write(content.getBytes(StandardCharsets.UTF_8));
            os.flush();
        } catch (Exception e) {
            try { resolver.delete(uri, null, null); } catch (Exception ignore) { }
            throw e;
        }

        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        return "\u4e0b\u8f7d/" + subdir + "/" + filename;
    }

    /* --------------------------------- helpers --------------------------------- */

    /** Strip path separators / control chars so a name can never escape its folder. */
    private static String sanitizeName(String raw) {
        if (raw == null) return null;
        String s = raw.replaceAll("[/\\\\]", "_").replaceAll("[\\r\\n\\t]", "_").trim();
        if (s.isEmpty() || s.equals(".") || s.equals("..")) return null;
        return s.length() > 120 ? s.substring(0, 120) : s;
    }

    private static String sanitizeSegment(String raw) {
        if (raw == null) return DEFAULT_SUBDIR;
        String s = raw.replaceAll("[/\\\\]", "_").replaceAll("[\\r\\n\\t]", "_").trim();
        return s.isEmpty() ? DEFAULT_SUBDIR : s;
    }

    /**
     * v3.68: pick the MIME type from the extension so MediaStore / SAF show the
     * file correctly. The old code hard-coded application/json, which is wrong
     * for the .txt / .c exports (some file managers then hide the file).
     */
    private static String mimeOf(String filename, String given) {
        if (given != null && !given.trim().isEmpty()) return given.trim();
        String n = filename == null ? "" : filename.toLowerCase(Locale.US);
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".c") || n.endsWith(".h")) return "text/x-c";
        if (n.endsWith(".csv")) return "text/csv";
        return "text/plain";
    }
}
