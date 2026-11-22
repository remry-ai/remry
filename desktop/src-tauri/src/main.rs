// Remry desktop app: a window on the local Remry server.
//
// All the logic lives in the `remry` binary this app bundles (its sidecar); this
// shell only runs it and shows the result:
//   1. `remry install` copies the bundled binary into <data dir>/App/<version> and
//      points App/current at it, as the Claude plugin does. Everything after runs that
//      installed copy, so an app update never has to replace a running binary.
//   2. `remry app ensure` starts the server on 127.0.0.1:7369, or reuses (or, for a
//      different version, replaces) one that's running, and prints its address.
//   3. The window leaves its splash page for that address. The page gets no access to
//      Tauri's IPC: it's the same web app a browser shows.
// The Claude menu registers the installed binary as an MCP server with Claude desktop
// or Claude Code (`remry connect …`), after asking. The server keeps running when the
// window closes, as it does when Claude starts it.
//
// Links: Claude links to pages as http://127.0.0.1:7369/open/app/...; with this app installed,
// the server hands them over as remry://open/app/... (src/shared/desktop/handoff.ts), which this
// shell registers and opens in its window: at once, or when the server is up after a cold start.
//
// Updates: the one network request Remry makes. At launch, and from "Check for Updates…",
// this shell asks GitHub Releases for latest.json (tauri-plugin-updater). It sends nothing
// but the request itself, and installs only an update signed with the key whose public
// half is in tauri.conf.json, after the user says yes. The next launch's `remry install`
// and `remry app ensure` then put the new binary in place and replace the old server.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Wry};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

const APP_ORIGIN_HOST: &str = "127.0.0.1";
const APP_PORT: u16 = 7369;
const CONNECT_DESKTOP: &str = "connect-claude-desktop";
const CONNECT_CODE: &str = "connect-claude-code";
const CHECK_UPDATES: &str = "check-for-updates";
const RELOAD: &str = "reload";
const NEW_WINDOW: &str = "new-window";
const DEEP_LINK_SCHEME: &str = "remry";

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
    let sidecar = exe.with_file_name(binary_name());
    if sidecar == exe {
        return Err("This app's executable has the same name as the remry binary it bundles.".to_string());
    }
    Ok(sidecar)
}

/// Installs the bundled binary and returns the installed copy's path.
fn install(app: &AppHandle) -> Result<PathBuf, String> {
    let resources = app.path().resource_dir().map_err(|error| error.to_string())?;
    let version = std::fs::read_to_string(resources.join("VERSION"))
        .map_err(|error| format!("This app is missing its VERSION file: {error}"))?;
    let envs = [
        ("REMRY_VERSION", version.trim().to_string()),
        ("REMRY_MIGRATIONS_DIR", resources.join("migrations").to_string_lossy().into_owned()),
        // Records this app in the data folder, so the server hands Claude's links to it.
        ("REMRY_DESKTOP", "1".to_string()),
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
                // A remry:// link that arrived while the server was starting opens instead of /app.
                let pending = {
                    let state = app.state::<LinkState>();
                    let mut links = state.0.lock().unwrap();
                    links.ready = true;
                    links.pending.take()
                };
                let _ = window.navigate(pending.as_deref().and_then(app_page).unwrap_or(url));
            }
            Err(message) => show_error(&window, &message),
        }
    });
}

/// The installed binary, once `install` has run.
struct Installed(PathBuf);

/// Whether the server is up, and the page of a remry:// link that arrived before it was.
#[derive(Default)]
struct Links {
    ready: bool,
    pending: Option<String>,
}

struct LinkState(Mutex<Links>);

/// The app page a `remry://open/app/...` link points at, with its query; None for anything else,
/// so a link from anywhere can only move the window within the app.
fn deep_link_path(url: &Url) -> Option<String> {
    if url.scheme() != DEEP_LINK_SCHEME || url.host_str() != Some("open") {
        return None;
    }
    let path = url.path();
    if path != "/app" && !path.starts_with("/app/") {
        return None;
    }
    if path.split('/').any(|segment| segment == ".." || segment == ".") {
        return None;
    }
    Some(match url.query() {
        Some(query) => format!("{path}?{query}"),
        None => path.to_string(),
    })
}

/// An app path on the server's address.
fn app_page(path: &str) -> Option<Url> {
    Url::parse(&format!("http://{APP_ORIGIN_HOST}:{APP_PORT}{path}")).ok()
}

/// Shows a remry:// link's page in the window, or keeps it for when the server is up.
fn open_link(app: &AppHandle, url: &Url) {
    let Some(path) = deep_link_path(url) else { return };
    {
        let state = app.state::<LinkState>();
        let mut links = state.0.lock().unwrap();
        if !links.ready {
            links.pending = Some(path);
            return;
        }
    }
    if let (Some(window), Some(page)) = (front_window(app), app_page(&path)) {
        let _ = window.navigate(page);
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// The window a menu command or a link acts on: the focused one, else the first window opened,
/// else any. With several windows open, "main" may be closed or behind another.
fn front_window(app: &AppHandle) -> Option<WebviewWindow> {
    let windows = app.webview_windows();
    windows
        .values()
        .find(|w| w.is_focused().unwrap_or(false))
        .or_else(|| windows.get("main"))
        .or_else(|| windows.values().next())
        .cloned()
}

/// File → New Window (⌘N / Ctrl+N): another window on the app's home page, as a browser opens
/// one. While the server is still starting there's no page to open, so it brings the window forward.
fn new_window(app: &AppHandle) {
    let ready = app.state::<LinkState>().0.lock().unwrap().ready;
    match app_page("/app").filter(|_| ready) {
        Some(home) => open_window(app, home),
        None => {
            if let Some(window) = front_window(app) {
                let _ = window.set_focus();
            }
        }
    }
}

/// The app's own pages: the splash page, and the server on 127.0.0.1:7369.
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

/// What the window may download: the app's own pages and files, or a blob one of them made
/// (a doc's PDF from "Download PDF"). A `download` link to anywhere else is refused.
fn is_app_download(url: &Url) -> bool {
    if url.scheme() == "blob" {
        return Url::parse(url.path()).is_ok_and(|inner| is_app_url(&inner));
    }
    is_app_url(url)
}

/// Shows a finished download in Finder (Explorer), or says why it failed.
fn download_finished(app: &AppHandle, path: Option<PathBuf>, success: bool) {
    if !success {
        app.dialog()
            .message("The file couldn't be saved to your Downloads folder.")
            .title("Download Failed")
            .kind(MessageDialogKind::Error)
            .show(|_| {});
        return;
    }
    if let Some(path) = path {
        let _ = app.opener().reveal_item_in_dir(path);
    }
}

/// How a page asks its window to print, since it has no IPC: "Print…" on the print pages
/// navigates to `remry-print:` (see `src/lib/doc/print.ts`), which `app_window` cancels and turns
/// into a print. Tauri's own `window.print()` goes through IPC on macOS, so there it did nothing.
const PRINT_SCHEME: &str = "remry-print";

/// Tells the page it's in the desktop window, so "Print…" asks the window. It sets a flag and
/// nothing else: the page still gets no IPC.
const DESKTOP_FLAG_SCRIPT: &str = "Object.defineProperty(window, '__remryDesktop', { value: true });";

/// Whether a navigation is a page asking its window to print.
fn is_print_request(url: &Url) -> bool {
    url.scheme() == PRINT_SCHEME
}

/// Numbers the windows that links opening a new window get.
static NEXT_WINDOW: AtomicUsize = AtomicUsize::new(1);

/// A window on the app, the main one or one a link opened. WebKit drops what a window has no
/// handler for, so each one is handled here:
/// - a link to anywhere else opens in the browser (a Linear issue in the sidebar);
/// - a link that opens a new window ("Export PDF", an attached PDF) gets a window of its own when
///   it's an app page, as a browser gives it a tab, so the page behind keeps unsaved edits;
/// - a download ("Download PDF") saves to the Downloads folder under the name the page gave.
///   macOS doesn't report where a finished download went, so keep where it started.
fn app_window<'a>(app: &'a AppHandle, label: &str, url: WebviewUrl) -> WebviewWindowBuilder<'a, Wry, AppHandle> {
    let opener = app.clone();
    let windows = app.clone();
    let downloads = app.clone();
    let printer = app.clone();
    let print_label = label.to_string();
    let destinations: Arc<Mutex<HashMap<String, PathBuf>>> = Arc::default();
    WebviewWindowBuilder::new(app, label, url)
        .title("Remry")
        .inner_size(1100.0, 860.0)
        .min_inner_size(800.0, 560.0)
        // Files dragged in from Finder go to the page, as in a browser, so an image
        // dropped on the doc editor uploads. Tauri's own handler would take them.
        .disable_drag_drop_handler()
        .initialization_script(DESKTOP_FLAG_SCRIPT)
        .on_download(move |_webview, event| match event {
            DownloadEvent::Requested { url, destination } => {
                if !is_app_download(&url) {
                    return false;
                }
                destinations.lock().unwrap().insert(url.to_string(), destination.clone());
                true
            }
            DownloadEvent::Finished { url, path, success } => {
                let started = destinations.lock().unwrap().remove(url.as_str());
                download_finished(&downloads, path.or(started), success);
                true
            }
            _ => true,
        })
        .on_navigation(move |url| {
            if is_print_request(url) {
                // print() is queued on the event loop, so the dialog opens after this returns.
                if let Some(window) = printer.get_webview_window(&print_label) {
                    let _ = window.print();
                }
                return false;
            }
            if is_app_url(url) {
                return true;
            }
            let _ = opener.opener().open_url(url.as_str(), None::<&str>);
            false
        })
        .on_new_window(move |url, _features| {
            if is_app_url(&url) {
                open_window(&windows, url);
            } else {
                let _ = windows.opener().open_url(url.as_str(), None::<&str>);
            }
            NewWindowResponse::Deny
        })
}

/// Opens an app page in a window of its own. Built on another thread: the request arrives in
/// WebKit's callback on the main thread, which has to be free to make the window.
fn open_window(app: &AppHandle, url: Url) {
    let app = app.clone();
    std::thread::spawn(move || {
        let label = format!("page-{}", NEXT_WINDOW.fetch_add(1, Ordering::Relaxed));
        let _ = app_window(&app, &label, WebviewUrl::External(url)).build();
    });
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

/// Whether this build can check for updates: it needs the public key a release is signed with.
fn updates_configured(app: &AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|updater| updater.get("pubkey"))
        .and_then(Value::as_str)
        .is_some_and(|key| !key.trim().is_empty())
}

/// Checks for a newer release and, if the user agrees, installs it and restarts.
/// At launch (`announce_none` false) it stays quiet unless there is an update.
fn check_for_updates(app: AppHandle, announce_none: bool) {
    if !updates_configured(&app) {
        if announce_none {
            app.dialog()
                .message("This build of Remry can't update itself. Download the latest release from GitHub.")
                .title("Check for Updates")
                .show(|_| {});
        }
        return;
    }
    tauri::async_runtime::spawn(async move {
        let found = match app.updater() {
            Ok(updater) => updater.check().await.map_err(|error| error.to_string()),
            Err(error) => Err(error.to_string()),
        };
        let update = match found {
            Ok(Some(update)) => update,
            Ok(None) => {
                if announce_none {
                    app.dialog().message("Remry is up to date.").title("Check for Updates").show(|_| {});
                }
                return;
            }
            Err(error) => {
                // Offline, or no release yet: only worth saying when the user asked.
                if announce_none {
                    app.dialog()
                        .message(format!("Couldn't check for updates: {error}"))
                        .title("Check for Updates")
                        .kind(MessageDialogKind::Error)
                        .show(|_| {});
                }
                return;
            }
        };
        let version = update.version.clone();
        let installer = app.clone();
        app.dialog()
            .message(format!(
                "Remry {version} is available (you have {}). Install it and restart? Your notebooks aren't touched.",
                update.current_version
            ))
            .title("Update Remry")
            .buttons(MessageDialogButtons::OkCancelCustom("Install and Restart".into(), "Later".into()))
            .show(move |confirmed| {
                if !confirmed {
                    return;
                }
                tauri::async_runtime::spawn(async move {
                    match update.download_and_install(|_, _| {}, || {}).await {
                        Ok(()) => installer.restart(),
                        Err(error) => {
                            installer
                                .dialog()
                                .message(format!("Couldn't install Remry {version}: {error}"))
                                .title("Update Remry")
                                .kind(MessageDialogKind::Error)
                                .show(|_| {});
                        }
                    }
                });
            });
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = front_window(app) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        // After single-instance, which hands it the links that start a second instance.
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        // Without its click script: by default it catches every plain click on a target="_blank"
        // link (and a Ctrl- or Shift-click on any), cancels it and asks IPC to open the URL. The
        // page gets no IPC, so the link did nothing. Left alone, WebKit asks for a new window and
        // `app_window`'s handler opens it: an app page in a window, anything else in the browser.
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(LinkState(Mutex::new(Links::default())));

            // macOS registers remry:// from the bundle's Info.plist; Windows and Linux at run time.
            #[cfg(any(windows, target_os = "linux"))]
            app.deep_link().register_all()?;
            let links = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    open_link(&links, &url);
                }
            });
            // The link that started the app, if one did.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    open_link(&handle, &url);
                }
            }

            let menu = Menu::default(&handle)?;
            // Tauri's default menu has no Reload, so ⌘R (Ctrl+R) did nothing: add it at the top of
            // View, or in a View menu of its own where the default has none.
            let reload = MenuItem::with_id(&handle, RELOAD, "Reload", true, Some("CmdOrCtrl+R"))?;
            let submenu = |name: &str| {
                menu.items().ok()?.into_iter().find_map(|item| {
                    item.as_submenu().filter(|s| s.text().is_ok_and(|t| t == name)).cloned()
                })
            };
            match submenu("View") {
                Some(view) => view.insert(&reload, 0)?,
                None => menu.append(&Submenu::with_items(&handle, "View", true, &[&reload])?)?,
            }
            // The default menu has no New Window either: at the top of File, as in a browser.
            let new_window_item = MenuItem::with_id(&handle, NEW_WINDOW, "New Window", true, Some("CmdOrCtrl+N"))?;
            match submenu("File") {
                Some(file) => file.insert(&new_window_item, 0)?,
                None => menu.insert(&Submenu::with_items(&handle, "File", true, &[&new_window_item])?, 1)?,
            }
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
            let updates = Submenu::with_items(
                &handle,
                "Updates",
                true,
                &[&MenuItem::with_id(&handle, CHECK_UPDATES, "Check for Updates…", true, None::<&str>)?],
            )?;
            menu.append(&updates)?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| match event.id().as_ref() {
                CONNECT_DESKTOP => connect(app.clone(), "claude-desktop"),
                CONNECT_CODE => connect(app.clone(), "claude-code"),
                CHECK_UPDATES => check_for_updates(app.clone(), true),
                NEW_WINDOW => new_window(app),
                RELOAD => {
                    if let Some(window) = front_window(app) {
                        let _ = window.eval("location.reload()");
                    }
                }
                _ => {}
            });

            let window = app_window(&handle, "main", WebviewUrl::App("index.html".into()))
                .inner_size(1280.0, 860.0)
                .build()?;

            start(handle.clone(), window);
            check_for_updates(handle, false);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Remry");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_shell_is_not_named_like_its_sidecar() {
        // Both sit in Contents/MacOS (or the install folder), so the same name loses one of them.
        let shell = env!("CARGO_BIN_NAME").to_lowercase();
        assert_ne!(shell, "remry");
        assert_ne!(format!("{shell}.exe"), binary_name());
    }

    #[test]
    fn opens_only_app_pages_from_remry_links() {
        let path = |s: &str| deep_link_path(&Url::parse(s).unwrap());
        assert_eq!(path("remry://open/app"), Some("/app".to_string()));
        assert_eq!(
            path("remry://open/app/people/abc?notebook=work"),
            Some("/app/people/abc?notebook=work".to_string())
        );
        assert_eq!(path("remry://open/files/x"), None);
        assert_eq!(path("remry://open/apple"), None);
        assert_eq!(path("remry://elsewhere/app"), None);
        assert_eq!(path("https://open/app"), None);
    }

    #[test]
    fn keeps_the_app_in_the_window_and_sends_everything_else_out() {
        let url = |s: &str| Url::parse(s).unwrap();
        assert!(is_app_url(&url("tauri://localhost/index.html")));
        assert!(is_app_url(&url("http://tauri.localhost/index.html")));
        assert!(is_app_url(&url("http://127.0.0.1:7369/app/projects")));
        assert!(!is_app_url(&url("http://127.0.0.1:8080/")));
        assert!(!is_app_url(&url("https://linear.app/acme/issue/ENG-1")));
        assert!(!is_app_url(&url("file:///etc/passwd")));
    }

    #[test]
    fn print_requests() {
        let url = |s: &str| Url::parse(s).unwrap();
        assert!(is_print_request(&url("remry-print:page")));
        assert!(!is_print_request(&url("http://127.0.0.1:7369/app/docs/x/print")));
        assert!(!is_print_request(&url("remry://open/app")));
    }

    #[test]
    fn downloads_only_what_the_app_made() {
        let url = |s: &str| Url::parse(s).unwrap();
        assert!(is_app_download(&url("blob:http://127.0.0.1:7369/4f1c2a9e-1d2b-4c3d-8e9f-0a1b2c3d4e5f")));
        assert!(is_app_download(&url("http://127.0.0.1:7369/files/doc/report.pdf")));
        assert!(!is_app_download(&url("blob:https://example.com/4f1c2a9e")));
        assert!(!is_app_download(&url("https://example.com/report.pdf")));
        assert!(!is_app_download(&url("data:application/pdf;base64,JVBERi0=")));
    }
}
