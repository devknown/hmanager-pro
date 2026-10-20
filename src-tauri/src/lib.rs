use std::collections::HashMap;
#[cfg(desktop)]
use tauri_plugin_opener::OpenerExt;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct RouterHttpResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

#[tauri::command]
fn router_http_request(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<RouterHttpResponse, String> {
    let mut req = match method.to_uppercase().as_str() {
        "POST" => ureq::post(&url),
        "PUT" => ureq::put(&url),
        "DELETE" => ureq::delete(&url),
        _ => ureq::get(&url),
    };

    req = req.timeout(std::time::Duration::from_secs(8));

    for (k, v) in headers {
        req = req.set(&k, &v);
    }

    let response_result = if let Some(b) = body {
        req.send_string(&b)
    } else {
        req.call()
    };

    let process_resp = |resp: ureq::Response, status: u16| -> RouterHttpResponse {
        let mut res_headers = HashMap::new();
        for h_name in resp.headers_names() {
            let lower = h_name.to_lowercase();
            if lower == "set-cookie" {
                let cookies = resp.all(&h_name);
                res_headers.insert(lower, cookies.join("; "));
            } else if let Some(val) = resp.header(&h_name) {
                res_headers.insert(lower, val.to_string());
            }
        }
        let body_str = resp.into_string().unwrap_or_default();
        RouterHttpResponse {
            status,
            body: body_str,
            headers: res_headers,
        }
    };

    match response_result {
        Ok(resp) => {
            let status = resp.status();
            Ok(process_resp(resp, status))
        }
        Err(ureq::Error::Status(code, resp)) => Ok(process_resp(resp, code)),
        Err(ureq::Error::Transport(e)) => Err(format!("Network connection failed: {}", e)),
    }
}

#[tauri::command]
fn app_minimize(window: tauri::Window) {
    #[cfg(desktop)]
    let _ = window.minimize();
    #[cfg(not(desktop))]
    let _ = window;
}

#[tauri::command]
fn app_toggle_maximize(window: tauri::Window) -> bool {
    #[cfg(desktop)]
    {
        if let Ok(is_max) = window.is_maximized() {
            if is_max {
                let _ = window.unmaximize();
                false
            } else {
                let _ = window.maximize();
                true
            }
        } else {
            let _ = window.maximize();
            true
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = window;
        false
    }
}

#[tauri::command]
fn app_close(window: tauri::Window) {
    #[cfg(desktop)]
    let _ = window.destroy();
    #[cfg(not(desktop))]
    let _ = window;
}

#[tauri::command]
fn app_is_maximized(window: tauri::Window) -> bool {
    #[cfg(desktop)]
    {
        window.is_maximized().unwrap_or(false)
    }
    #[cfg(not(desktop))]
    {
        let _ = window;
        false
    }
}

#[tauri::command]
fn app_open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if let Err(e) = app.opener().open_url(&url, None::<&str>) {
            log::warn!("opener plugin failed: {}, trying OS fallback", e);
            #[cfg(target_os = "windows")]
            {
                let _ = std::process::Command::new("rundll32")
                    .args(["url.dll,FileProtocolHandler", &url])
                    .spawn();
            }
            #[cfg(target_os = "macos")]
            {
                let _ = std::process::Command::new("open").arg(&url).spawn();
            }
            #[cfg(target_os = "linux")]
            {
                let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
            }
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, url);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

    #[cfg(not(desktop))]
    let builder = tauri::Builder::default();

    builder
        .invoke_handler(tauri::generate_handler![
            router_http_request,
            app_minimize,
            app_toggle_maximize,
            app_close,
            app_is_maximized,
            app_open_url
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
