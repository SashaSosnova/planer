package com.sosnova.planer;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    lockWebViewZoom();
  }

  @Override
  public void onResume() {
    super.onResume();
    lockWebViewZoom();
  }

  /**
   * Android system font size (accessibility) scales WebView text and often
   * blows up icon buttons / SVG layout. Keep layout at 100% like desktop Chrome.
   */
  private void lockWebViewZoom() {
    if (bridge == null || bridge.getWebView() == null) return;
    WebSettings settings = bridge.getWebView().getSettings();
    settings.setTextZoom(100);
    settings.setSupportZoom(false);
  }
}
