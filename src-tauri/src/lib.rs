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
        .setup(|app| {
            // 主窗口在 tauri.conf.json 中设为 create: false，改由代码创建以便拦截新窗口。
            // 外部链接由前端转给系统浏览器，其余 target="_blank" 和 window.open 一律拒绝，避免出现不受管理的 WebView2 弹窗
            tauri::WebviewWindowBuilder::from_config(app.handle(), &app.config().app.windows[0])?
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动应用失败")
}
