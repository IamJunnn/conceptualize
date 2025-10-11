const fs = require('fs');
const path = require('path');

const libRsContent = String.raw`use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
struct FileNode {
    path: String,
    name: String,
    #[serde(rename = "type")]
    node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FileNode>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CreateResult {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct MarkdownFile {
    path: String,
    content: String,
}

#[tauri::command]
fn get_root_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let config_path = app.path().app_config_dir().map_err(|e| e.to_string())?.join("config.json");
    if !config_path.exists() { return Ok(None); }
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let config: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(config.get("rootFolder").and_then(|v| v.as_str()).map(|s| s.to_string()))
}

#[tauri::command]
async fn select_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app.dialog().file().set_title("Choose Your MicroGrid Folder").blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

#[tauri::command]
fn save_root_folder(app: tauri::AppHandle, folder_path: String) -> Result<String, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");
    let mut config = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else { serde_json::json!({}) };
    config["rootFolder"] = serde_json::json!(folder_path);
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&config_path, content).map_err(|e| e.to_string())?;
    Ok(folder_path)
}

#[tauri::command]
fn get_file_tree(root_path: String) -> Result<Vec<FileNode>, String> {
    fn build_file_tree(dir_path: &Path) -> Result<Vec<FileNode>, String> {
        let mut nodes = Vec::new();
        let entries = fs::read_dir(dir_path).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" { continue; }
            if path.is_dir() {
                let children = build_file_tree(&path)?;
                nodes.push(FileNode { path: path.to_string_lossy().to_string(), name, node_type: "folder".to_string(), children: Some(children) });
            } else {
                nodes.push(FileNode { path: path.to_string_lossy().to_string(), name, node_type: "file".to_string(), children: None });
            }
        }
        nodes.sort_by(|a, b| if a.node_type == b.node_type { a.name.cmp(&b.name) } else if a.node_type == "folder" { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater });
        Ok(nodes)
    }
    build_file_tree(Path::new(&root_path))
}

#[tauri::command]
fn create_file(parent_path: String, file_name: String) -> CreateResult {
    let full_file_name = if file_name.ends_with(".md") { file_name.clone() } else { format!("{}.md", file_name) };
    let file_path = PathBuf::from(&parent_path).join(&full_file_name);
    if file_path.exists() { return CreateResult { success: false, path: None, name: None, error: Some("File already exists".to_string()) }; }
    match fs::write(&file_path, "") {
        Ok(_) => CreateResult { success: true, path: Some(file_path.to_string_lossy().to_string()), name: Some(full_file_name), error: None },
        Err(e) => CreateResult { success: false, path: None, name: None, error: Some(e.to_string()) }
    }
}

#[tauri::command]
fn create_folder(parent_path: String, folder_name: String) -> CreateResult {
    let folder_path = PathBuf::from(&parent_path).join(&folder_name);
    if folder_path.exists() { return CreateResult { success: false, path: None, name: None, error: Some("Folder already exists".to_string()) }; }
    match fs::create_dir(&folder_path) {
        Ok(_) => CreateResult { success: true, path: Some(folder_path.to_string_lossy().to_string()), name: Some(folder_name), error: None },
        Err(e) => CreateResult { success: false, path: None, name: None, error: Some(e.to_string()) }
    }
}

#[tauri::command]
fn get_markdown_files(root_path: String) -> Result<Vec<MarkdownFile>, String> {
    fn collect_markdown_files(dir_path: &Path, files: &mut Vec<MarkdownFile>) -> Result<(), String> {
        let entries = fs::read_dir(dir_path).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" { continue; }
            if path.is_dir() {
                collect_markdown_files(&path, files)?;
            } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
                match fs::read_to_string(&path) {
                    Ok(content) => files.push(MarkdownFile { path: path.to_string_lossy().to_string(), content }),
                    Err(e) => eprintln!("Failed to read file {:?}: {}", path, e)
                }
            }
        }
        Ok(())
    }
    let mut files = Vec::new();
    collect_markdown_files(Path::new(&root_path), &mut files)?;
    Ok(files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_root_folder, select_folder, save_root_folder, get_file_tree, create_file, create_folder, get_markdown_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
`;

const targetPath = path.join(__dirname, 'src-tauri', 'src', 'lib.rs');
fs.writeFileSync(targetPath, libRsContent, 'utf8');
console.log('Successfully wrote lib.rs!');
