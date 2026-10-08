mod storage;

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
        .invoke_handler(tauri::generate_handler![
            storage::commands::tasks_get_all,
            storage::commands::task_put,
            storage::commands::task_delete,
            storage::commands::tasks_clear,
            storage::commands::tasks_commit_deletion,
            storage::commands::conversations_get_all,
            storage::commands::conversation_put,
            storage::commands::conversations_clear,
            storage::commands::conversations_replace,
            storage::commands::image_get,
            storage::commands::image_put,
            storage::commands::image_delete,
            storage::commands::images_clear,
            storage::commands::image_ids,
            storage::commands::thumbnail_get,
            storage::commands::thumbnail_put,
            storage::commands::kv_get_all,
            storage::commands::kv_set,
            storage::commands::kv_remove,
            storage::commands::storage_info,
            storage::commands::storage_open_dir,
        ])
        .setup(|app| {
            // 存储需在主窗口创建前就绪，前端加载后立即会读取任务和图片
            let state = storage::init();
            // WebView2 数据放在数据目录的 webview/ 下，随安装目录走；数据目录不可用时用默认位置，不影响窗口创建
            let webview_dir = state
                .0
                .as_ref()
                .ok()
                .map(|s| s.root().join("webview"))
                .filter(|dir| match std::fs::create_dir_all(dir) {
                    Ok(()) => true,
                    Err(err) => {
                        eprintln!("[storage] 无法创建 WebView 数据目录，改用默认位置：{err}");
                        false
                    }
                });
            app.manage(state);
            // 主窗口在 tauri.conf.json 中设为 create: false，改由代码创建以便拦截新窗口。
            // 外部链接由前端转给系统浏览器，其余 target="_blank" 和 window.open 一律拒绝，避免出现不受管理的 WebView2 弹窗
            let builder = tauri::WebviewWindowBuilder::from_config(
                app.handle(),
                &app.config().app.windows[0],
            )?
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny);
            match webview_dir {
                Some(dir) => builder.data_directory(dir).build()?,
                None => builder.build()?,
            };
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动应用失败")
}
