package com.hmanager.desktop

import android.graphics.Color
import android.os.Bundle
import android.view.WindowManager
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Ensure window is not fullscreen and clear edge-to-edge flags
    window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)

    // Style status bar and navigation bar to match app's clean white theme
    window.statusBarColor = Color.WHITE
    window.navigationBarColor = Color.WHITE

    val insetsController = WindowCompat.getInsetsController(window, window.decorView)
    insetsController.isAppearanceLightStatusBars = true
    insetsController.isAppearanceLightNavigationBars = true

    // Apply system insets (status bar, notch/cutout, navigation bar) to the content container
    // so app header and content are never overlapped by the device status bar
    ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content)) { view, windowInsets ->
      val insets = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      view.setPadding(insets.left, insets.top, insets.right, insets.bottom)
      windowInsets
    }
  }
}
