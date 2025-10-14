use serde::{Deserialize, Serialize};
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

#[derive(Debug, Serialize, Deserialize)]
struct MarkdownFilesResult {
    files: Vec<MarkdownFile>,
    folders: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SearchResult {
    file_path: String,
    file_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    line_content: Option<String>,
    match_type: String, // "filename" or "content"
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
    let folder = app.dialog().file().set_title("Choose Your Conceptualize Folder").blocking_pick_folder();
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
fn get_markdown_files(root_path: String) -> Result<MarkdownFilesResult, String> {
    fn collect_markdown_files_and_folders(
        dir_path: &Path,
        files: &mut Vec<MarkdownFile>,
        folders: &mut Vec<String>
    ) -> Result<(), String> {
        let entries = fs::read_dir(dir_path).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" { continue; }
            if path.is_dir() {
                folders.push(path.to_string_lossy().to_string());
                collect_markdown_files_and_folders(&path, files, folders)?;
            } else if path.is_file() {
                // Include all files, but only read content for markdown files
                let content = if path.extension().and_then(|s| s.to_str()) == Some("md") {
                    match fs::read_to_string(&path) {
                        Ok(content) => {
                            eprintln!("📖 Reading markdown file: {:?}", path);
                            eprintln!("   Content length: {} bytes", content.len());
                            content
                        },
                        Err(e) => {
                            eprintln!("Failed to read file {:?}: {}", path, e);
                            String::new()
                        }
                    }
                } else {
                    // For non-markdown files, store empty content
                    String::new()
                };
                files.push(MarkdownFile { path: path.to_string_lossy().to_string(), content });
            }
        }
        Ok(())
    }
    let mut files = Vec::new();
    let mut folders = Vec::new();
    collect_markdown_files_and_folders(Path::new(&root_path), &mut files, &mut folders)?;
    Ok(MarkdownFilesResult { files, folders })
}

#[tauri::command]
fn delete_item(item_path: String) -> CreateResult {
    let path = PathBuf::from(&item_path);
    if !path.exists() {
        return CreateResult {
            success: false,
            path: None,
            name: None,
            error: Some("Item does not exist".to_string())
        };
    }

    let result = if path.is_dir() {
        fs::remove_dir_all(&path)
    } else {
        fs::remove_file(&path)
    };

    match result {
        Ok(_) => CreateResult {
            success: true,
            path: Some(item_path),
            name: None,
            error: None
        },
        Err(e) => CreateResult {
            success: false,
            path: None,
            name: None,
            error: Some(e.to_string())
        }
    }
}

#[tauri::command]
fn rename_item(old_path: String, new_name: String, root_path: String) -> CreateResult {
    let old_path_buf = PathBuf::from(&old_path);
    if !old_path_buf.exists() {
        return CreateResult {
            success: false,
            path: None,
            name: None,
            error: Some("Item does not exist".to_string())
        };
    }

    let parent = match old_path_buf.parent() {
        Some(p) => p,
        None => {
            return CreateResult {
                success: false,
                path: None,
                name: None,
                error: Some("Cannot get parent directory".to_string())
            };
        }
    };

    let new_path = parent.join(&new_name);
    if new_path.exists() {
        return CreateResult {
            success: false,
            path: None,
            name: None,
            error: Some("An item with that name already exists".to_string())
        };
    }

    // Get old and new file names without extension for wiki-link updating
    let old_name = old_path_buf.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let new_name_without_ext = Path::new(&new_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    // Rename the file
    match fs::rename(&old_path_buf, &new_path) {
        Ok(_) => {
            // Update wiki-links in all markdown files if this is a markdown file
            if old_path.ends_with(".md") && !old_name.is_empty() && !new_name_without_ext.is_empty() {
                let _ = update_wiki_links_in_folder(
                    Path::new(&root_path),
                    old_name,
                    new_name_without_ext
                );
            }

            CreateResult {
                success: true,
                path: Some(new_path.to_string_lossy().to_string()),
                name: Some(new_name),
                error: None
            }
        },
        Err(e) => CreateResult {
            success: false,
            path: None,
            name: None,
            error: Some(e.to_string())
        }
    }
}

fn update_wiki_links_in_folder(dir_path: &Path, old_name: &str, new_name: &str) -> Result<(), String> {
    let entries = fs::read_dir(dir_path).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name.starts_with('.') || file_name == "node_modules" {
            continue;
        }

        if path.is_dir() {
            let _ = update_wiki_links_in_folder(&path, old_name, new_name);
        } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
            if let Ok(content) = fs::read_to_string(&path) {
                // Replace [[old_name]] with [[new_name]]
                let old_link = format!("[[{}]]", old_name);
                let new_link = format!("[[{}]]", new_name);

                if content.contains(&old_link) {
                    let updated_content = content.replace(&old_link, &new_link);
                    let _ = fs::write(&path, updated_content);
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn move_item(source_path: String, destination_path: String) -> CreateResult {
    let source = PathBuf::from(&source_path);
    let dest = PathBuf::from(&destination_path);

    if !source.exists() {
        return CreateResult {
            success: false,
            path: None,
            name: None,
            error: Some("Source item does not exist".to_string())
        };
    }

    if !dest.exists() || !dest.is_dir() {
        return CreateResult {
            success: false,
            path: None,
            name: None,
            error: Some("Destination must be an existing folder".to_string())
        };
    }

    let file_name = match source.file_name() {
        Some(name) => name.to_string_lossy().to_string(),
        None => {
            return CreateResult {
                success: false,
                path: None,
                name: None,
                error: Some("Cannot get source file name".to_string())
            };
        }
    };

    // Check if moving to the same parent directory
    if let Some(source_parent) = source.parent() {
        if source_parent == dest.as_path() {
            return CreateResult {
                success: false,
                path: None,
                name: None,
                error: Some("Item is already in this folder".to_string())
            };
        }
    }

    // Handle name conflicts by adding (1), (2), etc.
    let mut new_path = dest.join(&file_name);
    let mut final_name = file_name.clone();

    if new_path.exists() {
        let is_dir = source.is_dir();
        let (name_without_ext, extension) = if is_dir {
            (file_name.clone(), String::new())
        } else {
            let path = Path::new(&file_name);
            let name = path.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| file_name.clone());
            let ext = path.extension()
                .map(|s| format!(".{}", s.to_string_lossy()))
                .unwrap_or_default();
            (name, ext)
        };

        // Find available number
        let mut counter = 1;
        loop {
            final_name = format!("{} ({}){}", name_without_ext, counter, extension);
            new_path = dest.join(&final_name);
            if !new_path.exists() {
                break;
            }
            counter += 1;
            if counter > 1000 {
                return CreateResult {
                    success: false,
                    path: None,
                    name: None,
                    error: Some("Too many files with similar names".to_string())
                };
            }
        }
    }

    match fs::rename(&source, &new_path) {
        Ok(_) => CreateResult {
            success: true,
            path: Some(new_path.to_string_lossy().to_string()),
            name: Some(final_name),
            error: None
        },
        Err(e) => CreateResult {
            success: false,
            path: None,
            name: None,
            error: Some(e.to_string())
        }
    }
}

#[tauri::command]
fn read_file(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    if !path.is_file() {
        return Err("Path is not a file".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_binary_file(file_path: String) -> Result<Vec<u8>, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    if !path.is_file() {
        return Err("Path is not a file".to_string());
    }
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(file_path: String, content: String) -> CreateResult {
    let path = PathBuf::from(&file_path);
    match fs::write(&path, content) {
        Ok(_) => CreateResult {
            success: true,
            path: Some(file_path),
            name: None,
            error: None
        },
        Err(e) => CreateResult {
            success: false,
            path: None,
            name: None,
            error: Some(e.to_string())
        }
    }
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);

    // If it's a file, get the parent directory
    let reveal_path = if path_buf.is_file() {
        path_buf.parent().unwrap_or(&path_buf)
    } else {
        &path_buf
    };

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(reveal_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(reveal_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(reveal_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn open_file_external(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        return Err("File does not exist".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/C", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn find_file_by_name(root_path: String, file_name: String) -> CreateResult {
    fn search_for_file(dir_path: &Path, target_name: &str) -> Option<PathBuf> {
        let entries = fs::read_dir(dir_path).ok()?;

        for entry in entries {
            let entry = entry.ok()?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if name.starts_with('.') || name == "node_modules" {
                continue;
            }

            if path.is_file() && name == target_name {
                return Some(path);
            } else if path.is_dir() {
                if let Some(found) = search_for_file(&path, target_name) {
                    return Some(found);
                }
            }
        }

        None
    }

    match search_for_file(Path::new(&root_path), &file_name) {
        Some(path) => CreateResult {
            success: true,
            path: Some(path.to_string_lossy().to_string()),
            name: Some(file_name),
            error: None
        },
        None => CreateResult {
            success: false,
            path: None,
            name: None,
            error: Some(format!("File '{}' not found", file_name))
        }
    }
}

#[tauri::command]
fn search_files(root_path: String, query: String) -> Result<Vec<SearchResult>, String> {
    fn search_in_directory(
        dir_path: &Path,
        query: &str,
        filename_results: &mut Vec<SearchResult>,
        content_results: &mut Vec<SearchResult>,
        root: &Path,
        max_results: usize
    ) -> Result<(), String> {
        let entries = fs::read_dir(dir_path).map_err(|e| e.to_string())?;
        let query_lower = query.to_lowercase();

        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files and node_modules
            if file_name.starts_with('.') || file_name == "node_modules" {
                continue;
            }

            if path.is_dir() {
                // Recursively search subdirectories
                search_in_directory(&path, query, filename_results, content_results, root, max_results)?;
            } else if path.is_file() {
                let relative_path = path.strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();

                // Check if filename matches (search filename first)
                if file_name.to_lowercase().contains(&query_lower) {
                    filename_results.push(SearchResult {
                        file_path: relative_path.clone(),
                        file_name: file_name.clone(),
                        line: None,
                        line_content: None,
                        match_type: "filename".to_string(),
                    });
                }

                // Search file content (only for text files) if we haven't hit limit
                if filename_results.len() + content_results.len() < max_results {
                    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                        // Only search in text-based files
                        if matches!(ext, "md" | "txt" | "json" | "toml" | "yaml" | "yml" | "rs" | "js" | "ts" | "tsx" | "jsx" | "css" | "html") {
                            if let Ok(content) = fs::read_to_string(&path) {
                                let mut matches_in_file = 0;

                                for (line_num, line) in content.lines().enumerate() {
                                    if line.to_lowercase().contains(&query_lower) {
                                        // Truncate long lines
                                        let truncated_line = if line.len() > 100 {
                                            format!("{}...", &line[..100])
                                        } else {
                                            line.to_string()
                                        };

                                        content_results.push(SearchResult {
                                            file_path: relative_path.clone(),
                                            file_name: file_name.clone(),
                                            line: Some(line_num + 1),
                                            line_content: Some(truncated_line),
                                            match_type: "content".to_string(),
                                        });

                                        matches_in_file += 1;

                                        // Limit results per file to 3
                                        if matches_in_file >= 3 {
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Early termination if we hit the limit
            if filename_results.len() + content_results.len() >= max_results {
                return Ok(());
            }
        }

        Ok(())
    }

    let mut filename_results = Vec::new();
    let mut content_results = Vec::new();
    let root = Path::new(&root_path);
    let max_results = 50;

    search_in_directory(root, &query, &mut filename_results, &mut content_results, root, max_results)?;

    // Combine results: filename matches first, then content matches
    let mut results = filename_results;
    results.extend(content_results);

    // Truncate to max_results in case we went over
    results.truncate(max_results);

    Ok(results)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_root_folder, select_folder, save_root_folder, get_file_tree, create_file, create_folder, get_markdown_files, delete_item, rename_item, move_item, read_file, read_binary_file, write_file, reveal_in_explorer, open_file_external, find_file_by_name, search_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
