package pk.edu.ulc.toolkit;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Chunked PDF receive via Capacitor (reliable), then:
 * 1) try Downloads/ULC Toolkit via MediaStore
 * 2) always open Android Share sheet so the user can Save to Files/Drive
 */
@CapacitorPlugin(name = "UlcPdfSaver")
public class UlcPdfSaverPlugin extends Plugin {

    private final Map<String, File> sessions = new HashMap<>();

    @Override
    public void load() {
        /* Also expose window.ULCNative BEFORE first paint when possible */
        try {
            WebView wv = getBridge() != null ? getBridge().getWebView() : null;
            if (wv != null && getActivity() instanceof MainActivity) {
                wv.addJavascriptInterface(
                    new UlcNativePdfBridge((MainActivity) getActivity()),
                    "ULCNative"
                );
            }
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void ping(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("version", "1.9");
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            String id = UUID.randomUUID().toString();
            File tmp = File.createTempFile("ulc_pdf_", ".part", getContext().getCacheDir());
            sessions.put(id, tmp);
            JSObject ret = new JSObject();
            ret.put("id", id);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not start PDF save: " + e.getLocalizedMessage(), e);
        }
    }

    @PluginMethod
    public void writeChunk(PluginCall call) {
        String id = call.getString("id");
        String data = call.getString("data");
        if (id == null || id.isEmpty()) {
            call.reject("Missing session id");
            return;
        }
        if (data == null || data.isEmpty()) {
            call.reject("Missing chunk data");
            return;
        }
        File tmp = sessions.get(id);
        if (tmp == null || !tmp.exists()) {
            call.reject("Invalid or expired save session");
            return;
        }
        try {
            int comma = data.indexOf(',');
            if (data.startsWith("data:") && comma >= 0) {
                data = data.substring(comma + 1);
            }
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            if (bytes == null || bytes.length == 0) {
                call.reject("Empty chunk");
                return;
            }
            try (FileOutputStream out = new FileOutputStream(tmp, true)) {
                out.write(bytes);
                out.flush();
            }
            call.resolve();
        } catch (Exception e) {
            cleanup(id);
            call.reject("Chunk write failed: " + e.getLocalizedMessage(), e);
        }
    }

    /** Write to Downloads if possible, then always open Share sheet. */
    @PluginMethod
    public void finishAndShare(PluginCall call) {
        String id = call.getString("id");
        String filename = sanitizeFilename(call.getString("filename", "ULC.pdf"));
        if (id == null || id.isEmpty()) {
            call.reject("Missing session id");
            return;
        }
        File tmp = sessions.get(id);
        sessions.remove(id);
        if (tmp == null || !tmp.exists() || tmp.length() < 20) {
            if (tmp != null) {
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
            }
            call.reject("Empty or missing PDF data");
            return;
        }

        try {
            File ready = new File(getContext().getCacheDir(), "share_" + System.currentTimeMillis() + "_" + filename);
            if (!tmp.renameTo(ready)) {
                copyFile(tmp, ready);
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
            }

            String downloadsPath = null;
            try {
                downloadsPath = tryMediaStoreDownloads(ready, filename);
            } catch (Exception ignored) {}

            String archivePath = null;
            try {
                archivePath = archiveCopy(ready, filename);
            } catch (Exception ignored) {}

            shareFile(ready, filename);

            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("shared", true);
            ret.put("filename", filename);
            ret.put("bytes", ready.length());
            if (downloadsPath != null) {
                ret.put("path", downloadsPath);
                ret.put("downloaded", true);
            }
            if (archivePath != null) {
                ret.put("archivePath", archivePath);
                ret.put("archiveDirectory", "DATA");
            }
            toast("Share menu opened — tap Files or Drive to save your PDF");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Share failed: " + e.getLocalizedMessage(), e);
        }
    }

    /** @deprecated kept for older JS — redirects to finishAndShare behavior */
    @PluginMethod
    public void finishToDownloads(PluginCall call) {
        finishAndShare(call);
    }

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String filename = sanitizeFilename(call.getString("filename", "ULC.pdf"));
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("Missing PDF data");
            return;
        }
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma >= 0) {
            data = data.substring(comma + 1);
        }
        File tmp = null;
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            if (bytes == null || bytes.length == 0) {
                call.reject("Empty PDF data");
                return;
            }
            tmp = File.createTempFile("ulc_pdf_", ".part", getContext().getCacheDir());
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(bytes);
            }
            File ready = new File(getContext().getCacheDir(), "share_" + System.currentTimeMillis() + "_" + filename);
            if (!tmp.renameTo(ready)) {
                copyFile(tmp, ready);
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
            }
            tmp = null;
            String downloadsPath = null;
            try {
                downloadsPath = tryMediaStoreDownloads(ready, filename);
            } catch (Exception ignored) {}
            String archivePath = null;
            try {
                archivePath = archiveCopy(ready, filename);
            } catch (Exception ignored) {}
            shareFile(ready, filename);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("shared", true);
            ret.put("filename", filename);
            if (downloadsPath != null) {
                ret.put("path", downloadsPath);
                ret.put("downloaded", true);
            }
            if (archivePath != null) {
                ret.put("archivePath", archivePath);
                ret.put("archiveDirectory", "DATA");
            }
            toast("Share menu opened — tap Files or Drive to save your PDF");
            call.resolve(ret);
        } catch (Exception e) {
            if (tmp != null && tmp.exists()) {
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
            }
            call.reject("Save failed: " + e.getLocalizedMessage(), e);
        }
    }

    /** Re-share a PDF previously archived under app files (My Files → PDF). */
    @PluginMethod
    public void shareAppFile(PluginCall call) {
        String relative = call.getString("path");
        String filename = sanitizeFilename(call.getString("filename", "ULC.pdf"));
        String directory = call.getString("directory", "DATA");
        if (relative == null || relative.isEmpty()) {
            call.reject("Missing path");
            return;
        }
        try {
            File base =
                "DATA".equalsIgnoreCase(directory)
                    ? getContext().getFilesDir()
                    : getContext().getCacheDir();
            File file = new File(base, relative);
            if (!file.exists() || file.length() < 20) {
                call.reject("Saved PDF missing — generate it again");
                return;
            }
            shareFile(file, filename);
            toast("Share menu opened — tap Files or Drive to save");
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("shared", true);
            ret.put("filename", filename);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not open PDF: " + e.getLocalizedMessage(), e);
        }
    }

    private String archiveCopy(File src, String filename) throws Exception {
        File dir = new File(getContext().getFilesDir(), "ulc-pdf-archive");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new Exception("archive mkdir failed");
        }
        String safe = sanitizeFilename(filename);
        File dest = new File(dir, System.currentTimeMillis() + "_" + safe);
        copyFile(src, dest);
        return "ulc-pdf-archive/" + dest.getName();
    }

    private String tryMediaStoreDownloads(File src, String filename) throws Exception {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            File dir = new File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                "ULC Toolkit"
            );
            if (!dir.exists() && !dir.mkdirs()) return null;
            File dest = new File(dir, filename);
            copyFile(src, dest);
            return dest.getAbsolutePath();
        }

        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeForFilename(filename));
        values.put(
            MediaStore.MediaColumns.RELATIVE_PATH,
            Environment.DIRECTORY_DOWNLOADS + "/ULC Toolkit"
        );
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) return null;
        try (OutputStream out = resolver.openOutputStream(uri);
             FileInputStream in = new FileInputStream(src)) {
            if (out == null) throw new Exception("null stream");
            copyStream(in, out);
        }
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        return "Downloads/ULC Toolkit/" + filename;
    }

    private void shareFile(File file, String filename) {
        Uri uri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            file
        );
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mimeForFilename(filename));
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.putExtra(Intent.EXTRA_SUBJECT, filename);
        send.putExtra(Intent.EXTRA_TITLE, filename);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        getActivity().runOnUiThread(() -> {
            Intent chooser = Intent.createChooser(send, "Save or share file");
            /* Stay in the same task so Share reliably appears over the WebView */
            getActivity().startActivity(chooser);
        });
    }

    private void cleanup(String id) {
        File tmp = sessions.remove(id);
        if (tmp != null && tmp.exists()) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        }
    }

    private static void copyFile(File src, File dest) throws Exception {
        try (FileInputStream in = new FileInputStream(src);
             FileOutputStream out = new FileOutputStream(dest)) {
            copyStream(in, out);
        }
    }

    private static void copyStream(FileInputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
        out.flush();
    }

    private static String mimeForFilename(String filename) {
        String n = filename == null ? "" : filename.toLowerCase();
        if (n.endsWith(".xls")) return "application/vnd.ms-excel";
        if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (n.endsWith(".csv")) return "text/csv";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        return "application/pdf";
    }

    private static String sanitizeFilename(String filename) {
        if (filename == null || filename.trim().isEmpty()) filename = "ULC.pdf";
        filename = filename.replaceAll("[\\\\/:*?\"<>|]+", "_").trim();
        String lower = filename.toLowerCase();
        boolean known =
            lower.endsWith(".pdf")
                || lower.endsWith(".xls")
                || lower.endsWith(".xlsx")
                || lower.endsWith(".csv")
                || lower.endsWith(".png")
                || lower.endsWith(".jpg")
                || lower.endsWith(".jpeg");
        if (!known) filename = filename + ".pdf";
        return filename;
    }

    private void toast(String message) {
        try {
            Handler h = new Handler(Looper.getMainLooper());
            h.post(() -> Toast.makeText(getContext(), message, Toast.LENGTH_LONG).show());
        } catch (Exception ignored) {}
    }
}
