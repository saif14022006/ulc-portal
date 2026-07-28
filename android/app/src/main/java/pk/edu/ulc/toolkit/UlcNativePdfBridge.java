package pk.edu.ulc.toolkit;

import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.json.JSONObject;

/**
 * window.ULCNative — chunked PDF receive, then open Android Save dialog.
 */
public class UlcNativePdfBridge {
    private final MainActivity activity;
    private final Map<String, File> sessions = new HashMap<>();

    public UlcNativePdfBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String ping() {
        return "ok-v16";
    }

    @JavascriptInterface
    public String startSave() {
        try {
            String id = UUID.randomUUID().toString();
            File tmp = File.createTempFile("ulc_js_", ".part", activity.getCacheDir());
            sessions.put(id, tmp);
            return id;
        } catch (Exception e) {
            return "ERR:" + safe(e.getMessage());
        }
    }

    @JavascriptInterface
    public String writeChunk(String id, String data) {
        if (id == null || id.startsWith("ERR:")) return "ERR:bad id";
        File tmp = sessions.get(id);
        if (tmp == null) return "ERR:session missing";
        if (data == null || data.isEmpty()) return "ERR:empty chunk";
        try {
            int comma = data.indexOf(',');
            if (data.startsWith("data:") && comma >= 0) {
                data = data.substring(comma + 1);
            }
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            if (bytes == null || bytes.length == 0) return "ERR:decode empty";
            try (FileOutputStream out = new FileOutputStream(tmp, true)) {
                out.write(bytes);
                out.flush();
            }
            return "ok";
        } catch (Exception e) {
            cleanup(id);
            return "ERR:" + safe(e.getMessage());
        }
    }

    /**
     * Finish chunked upload and open the system Save dialog.
     * Returns immediately with {ok:true,pending:true}; actual file write happens after user picks a folder.
     */
    @JavascriptInterface
    public String finishSave(String id, String filename) {
        filename = sanitize(filename);
        File tmp = sessions.get(id);
        sessions.remove(id);
        if (tmp == null || !tmp.exists()) {
            return jsonErr("session missing — reopen app and try again");
        }
        if (tmp.length() < 20) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            return jsonErr("empty pdf");
        }

        try {
            /* Rename to a stable file so picker callback can find it */
            File ready = new File(activity.getCacheDir(), "ulc_ready_" + System.currentTimeMillis() + ".pdf");
            if (ready.exists()) {
                //noinspection ResultOfMethodCallIgnored
                ready.delete();
            }
            if (!tmp.renameTo(ready)) {
                /* copy fallback */
                try (java.io.FileInputStream in = new java.io.FileInputStream(tmp);
                     FileOutputStream out = new FileOutputStream(ready)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
                }
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
            }

            activity.openSavePicker(ready, filename);
            JSONObject o = new JSONObject();
            o.put("ok", true);
            o.put("pending", true);
            o.put("filename", filename);
            o.put("bytes", ready.length());
            return o.toString();
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            return jsonErr(safe(e.getMessage()));
        }
    }

    @JavascriptInterface
    public String diagnose() {
        try {
            JSONObject o = new JSONObject();
            o.put("ping", "ok-v16");
            o.put("activity", activity != null);
            o.put("sessions", sessions.size());
            return o.toString();
        } catch (Exception e) {
            return jsonErr(safe(e.getMessage()));
        }
    }

    private void cleanup(String id) {
        File tmp = sessions.remove(id);
        if (tmp != null && tmp.exists()) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        }
    }

    private void toast(String msg) {
        new Handler(Looper.getMainLooper()).post(
            () -> Toast.makeText(activity, msg, Toast.LENGTH_LONG).show()
        );
    }

    private static String sanitize(String filename) {
        if (filename == null || filename.trim().isEmpty()) filename = "ULC.pdf";
        filename = filename.replaceAll("[\\\\/:*?\"<>|]+", "_").trim();
        String lower = filename.toLowerCase();
        boolean known =
            lower.endsWith(".pdf")
                || lower.endsWith(".xls")
                || lower.endsWith(".xlsx")
                || lower.endsWith(".csv");
        if (!known) filename = filename + ".pdf";
        return filename;
    }

    private static String safe(String m) {
        return m == null ? "error" : m.replace("\"", "'");
    }

    private static String jsonErr(String msg) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", false);
            o.put("error", msg);
            return o.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"error\"}";
        }
    }
}
