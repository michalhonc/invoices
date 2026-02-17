use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

#[tauri::command]
fn get_sidecar_port() -> u16 {
    // In production, the sidecar writes its port to a temp file.
    // For dev, we default to 3001.
    let port_file = std::env::temp_dir().join("invoices-sidecar-port");
    if let Ok(port_str) = std::fs::read_to_string(&port_file) {
        port_str.trim().parse().unwrap_or(3001)
    } else {
        3001
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![get_sidecar_port])
        .setup(|app| {
            // Build system tray
            let quit = MenuItem::with_id(app, "quit", "Quit Invoices", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Open Invoices", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Invoices – Kontrolní hlášení DPH")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // Hide window to tray on close instead of quitting
            let window = app.get_webview_window("main").unwrap();
            let w = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = w.hide();
                }
            });

            // Spawn Bun sidecar in production
            // In dev mode, sidecar runs separately via `bun run --watch`
            #[cfg(not(debug_assertions))]
            {
                let sidecar_command = app
                    .shell()
                    .sidecar("sidecar/invoices-sidecar")
                    .expect("failed to create sidecar command");

                let (_rx, _child) = sidecar_command
                    .spawn()
                    .expect("Failed to spawn sidecar");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
