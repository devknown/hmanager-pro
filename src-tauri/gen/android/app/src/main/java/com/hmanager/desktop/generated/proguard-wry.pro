# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class com.hmanager.desktop.* {
  native <methods>;
}

-keep class com.hmanager.desktop.WryActivity {
  public <init>(...);

  void setWebView(com.hmanager.desktop.RustWebView);
  java.lang.Class getAppClass(...);
  int getId();
  java.lang.String getVersion();
  int startActivity(...);
}

-keep class com.hmanager.desktop.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class com.hmanager.desktop.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class com.hmanager.desktop.RustWebChromeClient,com.hmanager.desktop.RustWebViewClient {
  public <init>(...);
}
