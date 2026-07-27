package pk.edu.ulc.toolkit;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;

/**
 * Hosts PDF save: JavascriptInterface + Storage Access Framework picker
 * (ACTION_CREATE_DOCUMENT) so the user always sees a system Save dialog.
 */
public class MainActivity extends BridgeActivity {
    private static MainActivity instance;
    private static File pendingPdfFile;
    private static String pendingPdfName;

    private ActivityResultLauncher<String> createPdfLauncher;
    private UlcNativePdfBridge pdfBridge;

    static MainActivity getInstance() {
        return instance;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        instance = this;

        createPdfLauncher =
            registerForActivityResult(
                new ActivityResultContracts.CreateDocument("application/pdf"),
                uri -> {
                    if (uri == null) {
                        toast("Save cancelled");
                        clearPending();
                        return;
                    }
                    writePendingToUri(uri);
                }
            );

        registerPlugin(UlcPdfSaverPlugin.class);
        super.onCreate(savedInstanceState);

        pdfBridge = new UlcNativePdfBridge(this);
        attachNativeBridge();
        /* Capacitor may finish WebView setup a moment later — retry. */
        Handler h = new Handler(Looper.getMainLooper());
        h.post(this::attachNativeBridge);
        h.postDelayed(this::attachNativeBridge, 400);
        h.postDelayed(this::attachNativeBridge, 1200);
        h.postDelayed(this::attachNativeBridge, 3000);
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    private void attachNativeBridge() {
        try {
            if (getBridge() == null) return;
            WebView webView = getBridge().getWebView();
            if (webView == null) return;
            webView.addJavascriptInterface(pdfBridge, "ULCNative");
        } catch (Exception ignored) {}
    }

    /** Called from UlcNativePdfBridge on a binder thread. */
    void openSavePicker(File pdfFile, String filename) {
        pendingPdfFile = pdfFile;
        pendingPdfName = filename;
        runOnUiThread(() -> {
            try {
                toast("Choose where to save the PDF…");
                createPdfLauncher.launch(filename != null ? filename : "ULC.pdf");
            } catch (Exception e) {
                toast("Could not open save dialog: " + e.getMessage());
                clearPending();
            }
        });
    }

    private void writePendingToUri(Uri uri) {
        File src = pendingPdfFile;
        String name = pendingPdfName;
        if (src == null || !src.exists()) {
            toast("PDF data missing — try again");
            clearPending();
            return;
        }
        try (FileInputStream in = new FileInputStream(src);
             OutputStream out = getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new Exception("Cannot write to selected location");
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
            out.flush();
            toast("PDF saved successfully!");
            /* Offer to open */
            try {
                Intent view = new Intent(Intent.ACTION_VIEW);
                view.setDataAndType(uri, "application/pdf");
                view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(view, "Open PDF"));
            } catch (Exception ignored) {}
        } catch (Exception e) {
            toast("Save failed: " + e.getMessage());
        } finally {
            clearPending();
            if (src != null && src.exists()) {
                //noinspection ResultOfMethodCallIgnored
                src.delete();
            }
        }
    }

    private static void clearPending() {
        pendingPdfFile = null;
        pendingPdfName = null;
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show());
    }
}
