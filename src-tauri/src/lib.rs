use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        // single-instance 需最先注册，第二个实例启动时把已有主窗口带到前台后退出
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let Some(win) = app.get_webview_window("main") else {
                return;
            };
            let _ = win.unminimize();
            let _ = win.show();
            let _ = win.set_focus();
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("启动应用失败")
}
