// Remry desktop app: a window on the local Remry server.
//
// All the logic lives in the `remry` binary this app bundles (its sidecar); this
// shell only runs it and shows the result:
//   1. `remry install` copies the bundled binary into <data dir>/App/<version> and
//      points App/current at it, as the Claude plugin does. Everything after runs that
//      installed copy, so an app update never has to replace a running binary.
//   2. `remry app ensure` starts the server on 127.0.0.1:5173, or reuses (or, for a
//      different version, replaces) one that's running, and prints its address.
//   3. The window leaves its splash page for that address. The page gets no access to
//      Tauri's IPC: it's the same web app a browser shows.
// The Claude menu registers the installed binary as an MCP server with Claude desktop
// or Claude Code (`remry connect …`), after asking. The server keeps running when the
// window closes, as it does when Claude starts it.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

const APP_ORIGIN_HOST: &str = "127.0.0.1";
const APP_PORT: u16 = 5173;
const CONNECT_DESKTOP: &str = "connect-claude-desktop";
const CONNECT_CODE: &str = "connect-claude-code";

fn binary_name() -> &'static str {
    if cfg!(windows) { "remry.exe" } else { "remry" }
}

/// Runs a `remry` command that prints one JSON result, and returns its value or its error message.
fn run_remry(binary: &Path, args: &[&str], envs: &[(&str, String)]) -> Result<Value, String> {
    let mut command = Command::new(binary);
    command.args(args);
    for (key, value) in envs {
        command.env(key, value);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command
        .output()
        .map_err(|error| format!("Couldn't run {}: {error}", binary.display()))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: Value = stdout
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str(line).ok())
        .ok_or_else(|| {
            let stderr = String::from_utf8_lossy(&output.stderr);
            format!("`remry {}` gave no result.\n{}", args.join(" "), stderr.trim())
        })?;
    if result["ok"].as_bool() == Some(true) {
        Ok(result["value"].clone())
    } else {
        Err(result["error"]["message"].as_str().unwrap_or("Unknown error").to_string())
    }
}

/// The sidecar sits next to this app's own executable (Tauri strips its target suffix when bundling).
fn bundled_binary() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    Ok(exe.with_file_name(binary_name()))
}

/// Installs the bundled binary and returns the installed copy's path.
fn install(app: &AppHandle) -> Result<PathBuf, String> {
    let resources = app.path().resource_dir().map_err(|error| error.to_string())?;
    let version = std::fs::read_to_string(resources.join("VERSION"))
        .map_err(|error| format!("This app is missing its VERSION file: {error}"))?;
    let envs = [
        ("REMRY_VERSION", version.trim().to_string()),
        ("REMRY_MIGRATIONS_DIR", resources.join("migrations").to_string_lossy().into_owned()),
    ];
    let value = run_remry(&bundled_binary()?, &["install"], &envs)?;
    value["binary"]
        .as_str()
        .map(PathBuf::from)
        .ok_or_else(|| "`remry install` didn't say where it installed".to_string())
}

fn show_error(window: &WebviewWindow, message: &str) {
    let text = serde_json::to_string(message).unwrap_or_default();
    let _ = window.eval(format!(
        "document.getElementById('status').textContent = \"Remry couldn't start.\";\
         const e = document.getElementById('error'); e.hidden = false; e.textContent = {text};"
    ));
}

/// Installs, starts or reuses the server, then moves the window to it.
fn start(app: AppHandle, window: WebviewWindow) {
    std::thread::spawn(move || {
        let result = install(&app).and_then(|binary| {
            app.manage(Installed(binary.clone()));
            run_remry(&binary, &["app", "ensure"], &[])
        });
        match result.and_then(|value| {
            value["url"]
                .as_str()
                .and_then(|url| Url::parse(url).ok())
                .ok_or_else(|| "`remry app ensure` gave no address".to_string())
        }) {
            Ok(url) => {
                let _ = window.navigate(url);
            }
            Err(message) => show_error(&window, &message),
        }
    });
}

/// The installed binary, once `install` has run.
struct Installed(PathBuf);

/// The app's own pages: the splash page, and the server on 127.0.0.1:5173.
fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => match url.host_str() {
            Some("tauri.localhost") => true,
            Some(APP_ORIGIN_HOST) | Some("localhost") => url.port() == Some(APP_PORT),
            _ => false,
        },
        _ => false,
    }
}

fn connect(app: AppHandle, target: &'static str) {
    let (name, explain, after) = match target {
        "claude-desktop" => (
            "Claude desktop",
            "This adds Remry to Claude desktop's MCP servers, in its config file. Skip it if you installed the Remry plugin in Claude desktop, which already includes it.",
            "Restart Claude desktop to use it.",
        ),
        _ => (
            "Claude Code",
            "This runs `claude mcp add` to add Remry to Claude Code for your user. Skip it if you installed the Remry plugin in Claude Code, which already includes it.",
            "New Claude Code sessions will have it.",
        ),
    };
    let dialog = app.dialog().clone();
    dialog
        .message(explain)
        .title(format!("Connect to {name}?"))
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom("Connect".into(), "Cancel".into()))
        .show(move |confirmed| {
            if !confirmed {
                return;
            }
            let message = match app.try_state::<Installed>() {
                None => Err("Remry is still starting. Try again in a moment.".to_string()),
                Some(installed) => run_remry(&installed.0, &["connect", target], &[]),
            };
            let (kind, text) = match message {
                Ok(value) if value["change"] == "unchanged" => (MessageDialogKind::Info, format!("Remry was already connected to {name}.")),
                Ok(_) => (MessageDialogKind::Info, format!("Connected Remry to {name}. {after}")),
                Err(error) => (MessageDialogKind::Error, error),
            };
            app.dialog().message(text).title(format!("Connect to {name}")).kind(kind).show(|_| {});
        });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();

            let menu = Menu::default(&handle)?;
            let claude = Submenu::with_items(
                &handle,
                "Claude",
                true,
                &[
                    &MenuItem::with_id(&handle, CONNECT_DESKTOP, "Connect to Claude desktop…", true, None::<&str>)?,
                    &MenuItem::with_id(&handle, CONNECT_CODE, "Connect to Claude Code…", true, None::<&str>)?,
                ],
            )?;
            menu.append(&claude)?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| match event.id().as_ref() {
                CONNECT_DESKTOP => connect(app.clone(), "claude-desktop"),
                CONNECT_CODE => connect(app.clone(), "claude-code"),
                _ => {}
            });

            // Links out of the app (a Linear issue in the sidebar) open in the browser.
            let opener = handle.clone();
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Remry")
                .inner_size(1280.0, 860.0)
                .min_inner_size(800.0, 560.0)
                .on_navigation(move |url| {
                    if is_app_url(url) {
                        return true;
                    }
                    let _ = opener.opener().open_url(url.as_str(), None::<&str>);
                    false
                })
                .build()?;

            start(handle, window);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Remry");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_app_in_the_window_and_sends_everything_else_out() {
        let url = |s: &str| Url::parse(s).unwrap();
        assert!(is_app_url(&url("tauri://localhost/index.html")));
        assert!(is_app_url(&url("http://tauri.localhost/index.html")));
        assert!(is_app_url(&url("http://127.0.0.1:5173/app/projects")));
        assert!(!is_app_url(&url("http://127.0.0.1:8080/")));
        assert!(!is_app_url(&url("https://linear.app/acme/issue/ENG-1")));
        assert!(!is_app_url(&url("file:///etc/passwd")));
    }
}
