use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use regex::Regex; // Still needed for todo parsing

// OAuth module
mod oauth;

// Email module
mod email;

// Old Todo list data structures (to be deprecated)
#[derive(Debug, Serialize, Deserialize, Clone)]
struct Todo {
    id: String,
    text: String,
    completed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    due_date: Option<String>, // ISO 8601 format
    created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    linked_note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    list_id: Option<String>, // Which list this todo belongs to
    #[serde(skip_serializing_if = "Option::is_none")]
    priority: Option<u8>, // 1-4: 1=urgent, 2=high, 3=medium, 4=low
    #[serde(skip_serializing_if = "Option::is_none")]
    start_date: Option<String>, // ISO 8601 format
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>, // Optional description/notes
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TodoList {
    id: String,
    name: String,
    icon: String, // emoji
    todos: Vec<Todo>,
}

#[derive(Debug, Serialize, Deserialize)]
struct TodoData {
    lists: Vec<TodoList>,
}

// New note-embedded todo system
#[derive(Debug, Serialize, Deserialize, Clone)]
struct NoteTodo {
    id: String,
    title: String,
    completed: bool,
    priority: Option<u8>, // 1-4: 1=urgent(red), 2=high(orange), 3=medium(yellow), 4=low(white)
    #[serde(skip_serializing_if = "Option::is_none")]
    start_date: Option<String>, // ISO 8601 format
    #[serde(skip_serializing_if = "Option::is_none")]
    end_date: Option<String>, // ISO 8601 format
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>, // Optional description/notes
    note_path: String, // Which note this todo is embedded in
    line_number: usize, // Line number in the note where this todo appears
    created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    completed_at: Option<String>, // When it was completed (for archive)
}

#[derive(Debug, Serialize, Deserialize)]
struct NoteTodoArchive {
    todos: Vec<NoteTodo>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NoteTodosResult {
    active: Vec<NoteTodo>,
    archived: Vec<NoteTodo>,
}

// AI features for smart suggestions - Hidden for now
// mod ai;
// mod embeddings;
// mod vector_db;

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

// Generic config commands for storing app settings
#[tauri::command]
fn get_config_value(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let config_path = app.path().app_config_dir().map_err(|e| e.to_string())?.join("config.json");
    if !config_path.exists() { return Ok(None); }
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let config: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(config.get(&key).and_then(|v| v.as_str()).map(|s| s.to_string()))
}

#[tauri::command]
fn set_config_value(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");
    let mut config = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else { serde_json::json!({}) };
    config[key] = serde_json::json!(value);
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&config_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_config_value(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let config_path = app.path().app_config_dir().map_err(|e| e.to_string())?.join("config.json");
    if !config_path.exists() { return Ok(()); }
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let mut config: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if let Some(obj) = config.as_object_mut() {
        obj.remove(&key);
    }
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&config_path, content).map_err(|e| e.to_string())?;
    Ok(())
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

// AI commands temporarily disabled
// #[tauri::command]
// async fn ai_chat(prompt: String) -> ai::AiChatResult {
//     ai::ask_ai(prompt).await
// }

// AI embedding and search functions temporarily disabled
// #[derive(Debug, Clone, Serialize, Deserialize)]
// struct IndexProgress {
//     total: usize,
//     current: usize,
//     file_path: String,
// }
//
// /// Represents a chunk of text from a markdown file
// #[derive(Debug, Clone)]
// struct TextChunk {
//     content: String,
//     heading: Option<String>,
//     index: i32,
// }
//
// /// Split markdown content into semantic chunks
// fn chunk_markdown(content: &str) -> Vec<TextChunk> {
//     // ... (chunking logic commented out)
// }
//
// #[tauri::command]
// async fn index_notes(app: tauri::AppHandle, root_path: String) -> Result<String, String> {
//     // ... (indexing logic commented out)
// }
//
// #[tauri::command]
// async fn search_notes(app: tauri::AppHandle, query: String, limit: Option<usize>) -> Result<Vec<vector_db::SearchResult>, String> {
//     // ... (search logic commented out)
// }
//
// #[tauri::command]
// async fn ai_chat_with_context(app: tauri::AppHandle, prompt: String) -> ai::AiChatResult {
//     // ... (RAG logic commented out)
// }

// AI Smart Suggestions - Cross-folder relationship discovery - Hidden for now
/*
use regex::Regex;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SmartSuggestion {
    source_file: String,
    target_file: String,
    source_folder: String,
    target_folder: String,
    relationship: String,
    confidence: f32,
    reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IdeaAnalysis {
    idea_file: String,
    tech_stack_matches: Vec<String>,
    advantages: Vec<String>,
    disadvantages: Vec<String>,
    complexity_score: u8, // 1-10
}
*/

/*
/// Chunk markdown content into semantic pieces with size limits
fn chunk_markdown(content: &str) -> Vec<String> {
    const MAX_CHUNK_SIZE: usize = 2000; // Characters (~500 tokens for safety)
    const MIN_CHUNK_SIZE: usize = 50;

    let heading_regex = Regex::new(r"(?m)^#{1,6}\s+(.+)$").unwrap();
    let mut chunks = Vec::new();
    let mut current_chunk = String::new();

    for line in content.lines() {
        // Start new chunk on heading if current chunk has content
        if heading_regex.is_match(line) && !current_chunk.is_empty() {
            // If chunk is too large, split it further
            if current_chunk.len() > MAX_CHUNK_SIZE {
                for sub_chunk in split_large_chunk(&current_chunk, MAX_CHUNK_SIZE) {
                    if sub_chunk.len() >= MIN_CHUNK_SIZE {
                        chunks.push(sub_chunk);
                    }
                }
            } else if current_chunk.trim().len() >= MIN_CHUNK_SIZE {
                chunks.push(current_chunk.trim().to_string());
            }
            current_chunk = String::new();
        }

        current_chunk.push_str(line);
        current_chunk.push('\n');

        // Force split if chunk gets too large
        if current_chunk.len() > MAX_CHUNK_SIZE {
            for sub_chunk in split_large_chunk(&current_chunk, MAX_CHUNK_SIZE) {
                if sub_chunk.len() >= MIN_CHUNK_SIZE {
                    chunks.push(sub_chunk);
                }
            }
            current_chunk = String::new();
        }
    }

    // Add remaining content
    if current_chunk.trim().len() >= MIN_CHUNK_SIZE {
        if current_chunk.len() > MAX_CHUNK_SIZE {
            for sub_chunk in split_large_chunk(&current_chunk, MAX_CHUNK_SIZE) {
                if sub_chunk.len() >= MIN_CHUNK_SIZE {
                    chunks.push(sub_chunk);
                }
            }
        } else {
            chunks.push(current_chunk.trim().to_string());
        }
    }

    chunks
}

/// Split a large chunk into smaller pieces at sentence boundaries
fn split_large_chunk(text: &str, max_size: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();

    // Try to split at sentence boundaries (., !, ?, newline)
    for sentence in text.split_inclusive(&['.', '!', '?', '\n']) {
        if current.len() + sentence.len() > max_size && !current.is_empty() {
            chunks.push(current.trim().to_string());
            current = String::new();
        }
        current.push_str(sentence);
    }

    if !current.is_empty() {
        chunks.push(current.trim().to_string());
    }

    chunks
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IndexProgress {
    total: usize,
    current: usize,
    file_path: String,
    status: String, // "indexing", "complete", "error"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IndexStatus {
    indexed_files: i64,
    total_chunks: i64,
    needs_update: bool,
}
*/

/*
/// Smart incremental indexing - only indexes new/changed files
#[tauri::command]
async fn auto_index_notes(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<String, String> {
    eprintln!("🔄 Starting auto-index for: {}", root_path);

    let markdown_files = get_markdown_files_recursive(&root_path)
        .map_err(|e| format!("Failed to read files: {}", e))?;

    let db_path = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("vector_db.sqlite");

    // Ensure database directory exists
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let db = vector_db::VectorDB::new(db_path).map_err(|e| e.to_string())?;

    let mut indexed_count = 0;
    let mut skipped_count = 0;
    let total = markdown_files.len();

    for (idx, file_path) in markdown_files.iter().enumerate() {
        let file_path_str = file_path.to_string_lossy().to_string();

        // Get file modification time
        let metadata = fs::metadata(file_path).map_err(|e| e.to_string())?;
        let modified = metadata.modified()
            .map_err(|e| e.to_string())?
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        // Check if file needs reindexing
        let needs_indexing = db.needs_reindexing(&file_path_str, modified)
            .map_err(|e| e.to_string())?;

        if !needs_indexing {
            skipped_count += 1;
            eprintln!("  ⏭️  Skipping (up-to-date): {}", file_path_str);
            continue;
        }

        // Emit progress event
        let _ = app.emit("index-progress", IndexProgress {
            total,
            current: idx + 1,
            file_path: file_path_str.clone(),
            status: "indexing".to_string(),
        });

        eprintln!("  📄 Indexing [{}/{}]: {}", idx + 1, total, file_path_str);

        // Delete old embeddings for this file
        db.delete_file_embeddings(&file_path_str).map_err(|e| e.to_string())?;

        // Read and chunk the file
        let content = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
        let chunks = chunk_markdown(&content);

        // Index each chunk
        for (chunk_idx, chunk) in chunks.iter().enumerate() {
            // Generate embedding
            match embeddings::generate_embedding(chunk).await {
                Ok(embedding) => {
                    let note_embedding = vector_db::NoteEmbedding {
                        id: None,
                        file_path: file_path_str.clone(),
                        content: chunk.clone(),
                        embedding,
                        chunk_index: chunk_idx as i32,
                        heading: None,
                    };

                    db.store_embedding(&note_embedding).map_err(|e| e.to_string())?;
                }
                Err(e) => {
                    eprintln!("    ⚠️  Warning: Failed to embed chunk {}: {}", chunk_idx, e);
                    // Continue with other chunks even if one fails
                }
            }
        }

        // Update file metadata
        db.update_file_metadata(&file_path_str, modified, chunks.len() as i32)
            .map_err(|e| e.to_string())?;

        indexed_count += 1;
    }

    let (total_files, total_chunks) = db.get_index_status().map_err(|e| e.to_string())?;

    let message = format!(
        "✅ Indexing complete! Indexed {} files, skipped {} (up-to-date). Total: {} files, {} chunks.",
        indexed_count, skipped_count, total_files, total_chunks
    );

    eprintln!("{}", message);

    Ok(message)
}

/// Get current index status
#[tauri::command]
fn get_index_status(app: tauri::AppHandle) -> Result<IndexStatus, String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("vector_db.sqlite");

    if !db_path.exists() {
        return Ok(IndexStatus {
            indexed_files: 0,
            total_chunks: 0,
            needs_update: true,
        });
    }

    let db = vector_db::VectorDB::new(db_path).map_err(|e| e.to_string())?;
    let (files, chunks) = db.get_index_status().map_err(|e| e.to_string())?;

    Ok(IndexStatus {
        indexed_files: files,
        total_chunks: chunks,
        needs_update: files == 0,
    })
}

/// Search for cross-folder suggestions (no indexing, just search)
#[tauri::command]
async fn find_cross_folder_suggestions(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<Vec<SmartSuggestion>, String> {
    eprintln!("🔍 Searching for cross-folder suggestions...");

    let db_path = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("vector_db.sqlite");

    if !db_path.exists() {
        return Err("No index found. Please wait for auto-indexing to complete.".to_string());
    }

    let db = vector_db::VectorDB::new(db_path).map_err(|e| e.to_string())?;
    let mut suggestions = Vec::new();

    // Search using existing embeddings (much faster!)
    // We'll get all embeddings and compute cross-folder similarities
    use std::collections::HashMap;

    // Group embeddings by file
    let mut file_embeddings: HashMap<String, Vec<(i32, Vec<f32>)>> = HashMap::new();

    // Get all embeddings from database
    let all_embeddings = get_all_file_embeddings(&db).map_err(|e| e.to_string())?;

    for (file_path, chunk_idx, embedding) in all_embeddings {
        file_embeddings
            .entry(file_path)
            .or_insert_with(Vec::new)
            .push((chunk_idx, embedding));
    }

    // Now compare files across different folders
    for (source_file, source_chunks) in &file_embeddings {
        let source_path = PathBuf::from(source_file);
        let source_folder = source_path
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "root".to_string());

        for (target_file, target_chunks) in &file_embeddings {
            if source_file == target_file {
                continue; // Skip self
            }

            let target_path = PathBuf::from(target_file);
            let target_folder = target_path
                .parent()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "root".to_string());

            // Only compare across folders
            if source_folder == target_folder {
                continue;
            }

            // Find best similarity between any chunks
            let mut best_similarity = 0.0;
            for (_, source_emb) in source_chunks {
                for (_, target_emb) in target_chunks {
                    let similarity = embeddings::cosine_similarity(source_emb, target_emb);
                    if similarity > best_similarity {
                        best_similarity = similarity;
                    }
                }
            }

            // Only suggest if high similarity
            if best_similarity > 0.75 {
                suggestions.push(SmartSuggestion {
                    source_file: source_file.clone(),
                    target_file: target_file.clone(),
                    source_folder: source_folder.clone(),
                    target_folder,
                    relationship: "semantic_similarity".to_string(),
                    confidence: best_similarity,
                    reason: format!(
                        "These notes share similar concepts (similarity: {:.2}%)",
                        best_similarity * 100.0
                    ),
                });
            }
        }
    }

    // Deduplicate suggestions
    suggestions.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());
    suggestions.truncate(20); // Limit to top 20

    eprintln!("✅ Found {} cross-folder suggestions", suggestions.len());

    Ok(suggestions)
}

/// Helper function to get all embeddings from database
fn get_all_file_embeddings(db: &vector_db::VectorDB) -> Result<Vec<(String, i32, Vec<f32>)>, String> {
    db.get_all_embeddings().map_err(|e| e.to_string())
}

#[tauri::command]
async fn analyze_idea(
    idea_file_path: String,
    tech_stack_notes: Vec<String>,
) -> Result<IdeaAnalysis, String> {
    // Read idea file
    let idea_content = fs::read_to_string(&idea_file_path)
        .map_err(|e| format!("Failed to read idea file: {}", e))?;

    // Read tech stack files
    let mut tech_content = String::new();
    for tech_path in &tech_stack_notes {
        if let Ok(content) = fs::read_to_string(tech_path) {
            tech_content.push_str(&format!("\n\n--- {} ---\n", tech_path));
            tech_content.push_str(&content);
        }
    }

    // Build AI prompt
    let prompt = format!(
        "Analyze this project idea and provide structured feedback.\n\n\
        IDEA:\n{}\n\n\
        AVAILABLE TECH STACK:\n{}\n\n\
        Provide a JSON response with:\n\
        1. tech_stack_matches: which technologies from the tech stack are best suited\n\
        2. advantages: positive aspects of this idea (3-5 points)\n\
        3. disadvantages: potential challenges and drawbacks (3-5 points)\n\
        4. complexity_score: rate 1-10 (1=simple, 10=very complex)\n\n\
        Format as JSON only, no markdown:\n\
        {{\n  \"tech_stack_matches\": [...],\n  \"advantages\": [...],\n  \"disadvantages\": [...],\n  \"complexity_score\": 5\n}}",
        idea_content, tech_content
    );

    // Call AI
    let ai_result = ai::ask_ai(prompt).await;

    if !ai_result.success {
        return Err(ai_result.error.unwrap_or_else(|| "AI analysis failed".to_string()));
    }

    let response_text = ai_result.response.unwrap_or_default();

    // Try to parse JSON from response
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&response_text);

    match parsed {
        Ok(json) => Ok(IdeaAnalysis {
            idea_file: idea_file_path,
            tech_stack_matches: json["tech_stack_matches"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default(),
            advantages: json["advantages"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default(),
            disadvantages: json["disadvantages"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default(),
            complexity_score: json["complexity_score"].as_u64().unwrap_or(5) as u8,
        }),
        Err(_) => {
            // Fallback: return raw text as disadvantages if JSON parsing fails
            Ok(IdeaAnalysis {
                idea_file: idea_file_path,
                tech_stack_matches: vec![],
                advantages: vec!["AI analysis completed".to_string()],
                disadvantages: vec![response_text],
                complexity_score: 5,
            })
        }
    }
}

/// Helper to get all markdown files recursively
fn get_markdown_files_recursive(root: &str) -> Result<Vec<PathBuf>, std::io::Error> {
    let mut md_files = Vec::new();
    let root_path = Path::new(root);

    fn visit_dir(dir: &Path, md_files: &mut Vec<PathBuf>) -> Result<(), std::io::Error> {
        if dir.is_dir() {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    visit_dir(&path, md_files)?;
                } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
                    md_files.push(path);
                }
            }
        }
        Ok(())
    }

    visit_dir(root_path, &mut md_files)?;
    Ok(md_files)
}
*/

// Todo list commands
#[tauri::command]
fn get_todos(app: tauri::AppHandle) -> Result<TodoData, String> {
    let config_path = app.path().app_config_dir().map_err(|e| e.to_string())?.join("todos.json");

    if !config_path.exists() {
        // Return default empty structure
        return Ok(TodoData { lists: vec![] });
    }

    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let data: TodoData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
fn save_todos(app: tauri::AppHandle, data: TodoData) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_path = config_dir.join("todos.json");

    let content = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(&config_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn add_todo_list(app: tauri::AppHandle, name: String, icon: String) -> Result<TodoList, String> {
    let mut data = get_todos(app.clone())?;

    let new_list = TodoList {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        icon,
        todos: vec![],
    };

    data.lists.push(new_list.clone());
    save_todos(app, data)?;
    Ok(new_list)
}

#[tauri::command]
fn add_todo(app: tauri::AppHandle, list_id: String, text: String, due_date: Option<String>, linked_note: Option<String>) -> Result<Todo, String> {
    let mut data = get_todos(app.clone())?;

    let new_todo = Todo {
        id: uuid::Uuid::new_v4().to_string(),
        text,
        completed: false,
        due_date,
        created_at: chrono::Utc::now().to_rfc3339(),
        linked_note,
        list_id: Some(list_id.clone()),
        priority: None,
        start_date: None,
        description: None,
    };

    // Find the list and add the todo
    if let Some(list) = data.lists.iter_mut().find(|l| l.id == list_id) {
        list.todos.push(new_todo.clone());
        save_todos(app, data)?;
        Ok(new_todo)
    } else {
        Err("List not found".to_string())
    }
}

#[tauri::command]
fn update_todo(
    app: tauri::AppHandle,
    list_id: String,
    todo_id: String,
    text: Option<String>,
    completed: Option<bool>,
    due_date: Option<String>,
    root_path: Option<String>,
    priority: Option<u8>,
    start_date: Option<String>,
    description: Option<String>
) -> Result<(), String> {
    let mut data = get_todos(app.clone())?;

    if let Some(list) = data.lists.iter_mut().find(|l| l.id == list_id) {
        if let Some(todo) = list.todos.iter_mut().find(|t| t.id == todo_id) {
            let old_text = todo.text.clone();
            let linked_note = todo.linked_note.clone();

            if let Some(t) = text {
                todo.text = t;
            }
            if let Some(c) = completed {
                todo.completed = c;

                // SYNC TO NOTE: If todo is linked to a note, update the checkbox in the note
                if let (Some(note_name), Some(rp)) = (&linked_note, &root_path) {
                    let note_path = PathBuf::from(rp).join(format!("{}.md", note_name));

                    if note_path.exists() {
                        if let Ok(content) = fs::read_to_string(&note_path) {
                            let lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
                            let mut new_lines = lines.clone();

                            // Find the line with this todo (match by text)
                            for (idx, line) in lines.iter().enumerate() {
                                if line.contains(&old_text) && (line.contains("- [ ]") || line.contains("- [x]")) {
                                    // Toggle checkbox in note
                                    new_lines[idx] = if c {
                                        line.replace("- [ ]", "- [x]")
                                    } else {
                                        line.replace("- [x]", "- [ ]").replace("- [X]", "- [ ]")
                                    };
                                    break;
                                }
                            }

                            let new_content = new_lines.join("\n");
                            let _ = fs::write(&note_path, new_content);
                        }
                    }
                }
            }
            if let Some(d) = due_date {
                todo.due_date = Some(d);
            }
            if let Some(p) = priority {
                todo.priority = Some(p);
            }
            if let Some(s) = start_date {
                todo.start_date = Some(s);
            }
            if let Some(desc) = description {
                todo.description = Some(desc);
            }
            save_todos(app, data)?;
            return Ok(());
        }
    }

    Err("Todo not found".to_string())
}

#[tauri::command]
fn delete_todo(app: tauri::AppHandle, list_id: String, todo_id: String) -> Result<(), String> {
    let mut data = get_todos(app.clone())?;

    if let Some(list) = data.lists.iter_mut().find(|l| l.id == list_id) {
        list.todos.retain(|t| t.id != todo_id);
        save_todos(app, data)?;
        return Ok(());
    }

    Err("List not found".to_string())
}

// Unified todo creation - writes to both standalone todos AND creates note entry
#[derive(Debug, Serialize, Deserialize)]
struct UnifiedTodo {
    id: String,
    text: String,
    completed: bool,
    due_date: Option<String>,
    created_at: String,
    linked_note: Option<String>,
    list_id: Option<String>,
    priority: Option<u8>,
    start_date: Option<String>,
    end_date: Option<String>,
    note_path: Option<String>,
    description: Option<String>,
}

#[tauri::command]
fn add_unified_todo(
    app: tauri::AppHandle,
    list_id: String,
    text: String,
    priority: Option<u8>,
    start_date: Option<String>,
    end_date: Option<String>,
    root_path: String,
    note_name: Option<String>, // If provided, writes todo to this note file
    description: Option<String>,
    linked_note: Option<String>, // Just a reference, doesn't write to file
) -> Result<UnifiedTodo, String> {
    // 1. Add to standalone todos
    let mut data = get_todos(app.clone())?;

    let todo_id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();

    let new_todo = Todo {
        id: todo_id.clone(),
        text: text.clone(),
        completed: false,
        due_date: end_date.clone(), // Use end_date as due_date for backwards compatibility
        created_at: created_at.clone(),
        linked_note: linked_note.clone(), // Use the new linked_note parameter
        list_id: Some(list_id.clone()),
        priority: priority.clone(),
        start_date: start_date.clone(),
        description: description.clone(),
    };

    // If list doesn't exist, create it (especially for 'default' list)
    if !data.lists.iter().any(|l| l.id == list_id) {
        let new_list = TodoList {
            id: list_id.clone(),
            name: if list_id == "default" { "My Todos".to_string() } else { list_id.clone() },
            icon: "📋".to_string(),
            todos: vec![],
        };
        data.lists.push(new_list);
    }

    if let Some(list) = data.lists.iter_mut().find(|l| l.id == list_id) {
        list.todos.push(new_todo.clone());
        save_todos(app, data)?;
    } else {
        return Err("List not found".to_string());
    }

    // 2. Write to note file ONLY if note_name is provided (creates or appends)
    let note_path_str = if let Some(note_file_name) = note_name.as_deref() {
        let note_path = PathBuf::from(&root_path).join(format!("{}.md", note_file_name));

        // Build the markdown todo line with metadata
        let mut metadata_parts = Vec::new();
        if let Some(p) = priority {
            metadata_parts.push(format!("priority: {}", p));
        }
        if let Some(s) = &start_date {
            metadata_parts.push(format!("start: {}", s));
        }
        if let Some(e) = &end_date {
            metadata_parts.push(format!("end: {}", e));
        }
        if let Some(d) = &description {
            // Escape quotes in description
            let escaped_desc = d.replace('"', "\\\"");
            metadata_parts.push(format!("desc: \"{}\"", escaped_desc));
        }

        let todo_line = if metadata_parts.is_empty() {
            format!("- [ ] {}\n", text)
        } else {
            format!("- [ ] {} {{{}}}\n", text, metadata_parts.join(", "))
        };

        // Append to note file (or create if doesn't exist)
        if note_path.exists() {
            let content = fs::read_to_string(&note_path).map_err(|e| e.to_string())?;
            let new_content = format!("{}\n{}", content, todo_line);
            fs::write(&note_path, new_content).map_err(|e| e.to_string())?;
        } else {
            fs::write(&note_path, todo_line).map_err(|e| e.to_string())?;
        }

        Some(note_path.to_string_lossy().to_string())
    } else {
        None
    };

    // 3. Return unified todo
    Ok(UnifiedTodo {
        id: todo_id,
        text,
        completed: false,
        due_date: end_date.clone(),
        created_at,
        linked_note: note_name.clone(),
        list_id: Some(list_id),
        priority,
        start_date,
        end_date,
        note_path: note_path_str,
        description,
    })
}

// Note-embedded todo functions
use chrono::Utc;

fn parse_todo_metadata(line: &str) -> (String, Option<u8>, Option<String>, Option<String>, Option<String>) {
    // Parse: - [ ] Title {priority: 1, start: 2025-01-15, end: 2025-01-20, desc: "Some description"}
    let re = Regex::new(r"^-\s*\[([ x])\]\s*(.+?)(?:\s*\{(.+?)\})?$").unwrap();

    if let Some(caps) = re.captures(line) {
        let title = caps.get(2).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
        let metadata_str = caps.get(3).map(|m| m.as_str());

        let mut priority = None;
        let mut start_date = None;
        let mut end_date = None;
        let mut description = None;

        if let Some(meta) = metadata_str {
            // Parse priority
            if let Some(p_match) = Regex::new(r"priority:\s*(\d+)").unwrap().captures(meta) {
                if let Ok(p) = p_match[1].parse::<u8>() {
                    if (1..=4).contains(&p) {
                        priority = Some(p);
                    }
                }
            }

            // Parse start date
            if let Some(s_match) = Regex::new(r"start:\s*([0-9-]+)").unwrap().captures(meta) {
                start_date = Some(s_match[1].to_string());
            }

            // Parse end date
            if let Some(e_match) = Regex::new(r"end:\s*([0-9-]+)").unwrap().captures(meta) {
                end_date = Some(e_match[1].to_string());
            }

            // Parse description
            if let Some(d_match) = Regex::new(r#"desc:\s*"([^"]+)""#).unwrap().captures(meta) {
                description = Some(d_match[1].to_string());
            }
        }

        (title, priority, start_date, end_date, description)
    } else {
        (String::new(), None, None, None, None)
    }
}

fn get_archive_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(config_dir.join("todo-archive.json"))
}

fn load_archive(app: &tauri::AppHandle) -> Result<NoteTodoArchive, String> {
    let archive_path = get_archive_path(app)?;

    if !archive_path.exists() {
        return Ok(NoteTodoArchive { todos: vec![] });
    }

    let content = fs::read_to_string(archive_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn save_archive(app: &tauri::AppHandle, archive: &NoteTodoArchive) -> Result<(), String> {
    let archive_path = get_archive_path(app)?;
    let json = serde_json::to_string_pretty(archive).map_err(|e| e.to_string())?;
    fs::write(archive_path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn scan_note_todos(root_path: String) -> Result<Vec<NoteTodo>, String> {
    let root = Path::new(&root_path);
    let mut todos = Vec::new();

    use std::collections::HashSet;
    let mut seen_ids: HashSet<String> = HashSet::new();

    fn scan_directory(dir: &Path, todos: &mut Vec<NoteTodo>, seen_ids: &mut HashSet<String>) -> Result<(), String> {
        let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;

        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();

            if path.is_dir() {
                scan_directory(&path, todos, seen_ids)?;
            } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
                println!("📖 Reading markdown file: {:?}", path);
                println!("   File name: {:?}", path.file_name());
                println!("   Full path string: {:?}", path.to_string_lossy().to_string());
                // Parse markdown file for todos
                let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;

                for (line_num, line) in content.lines().enumerate() {
                    if line.trim_start().starts_with("- [") {
                        let (title, priority, start_date, end_date, description) = parse_todo_metadata(line);

                        if !title.is_empty() {
                            let completed = line.contains("- [x]") || line.contains("- [X]");

                            // Only include active todos (not completed)
                            if !completed {
                                // Create unique ID based on file path and line number (1-indexed)
                                let id = format!("{}:{}", path.display(), line_num + 1);

                                // LOG: Check for duplicates
                                if seen_ids.contains(&id) {
                                    println!("⚠️ DUPLICATE FOUND: {} - '{}'", id, title);
                                    continue;
                                }
                                println!("✅ Adding todo: {} - '{}'", id, title);
                                seen_ids.insert(id.clone());

                                let note_path_str = path.to_string_lossy().to_string();
                                println!("📁 File path for todo: '{}'", note_path_str);

                                todos.push(NoteTodo {
                                    id,
                                    title,
                                    completed: false,
                                    priority,
                                    start_date,
                                    end_date,
                                    description,
                                    note_path: note_path_str,
                                    line_number: line_num + 1,
                                    created_at: Utc::now().to_rfc3339(),
                                    completed_at: None,
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    scan_directory(root, &mut todos, &mut seen_ids)?;
    Ok(todos)
}

#[tauri::command]
fn get_note_todos(app: tauri::AppHandle, root_path: String) -> Result<NoteTodosResult, String> {
    let active = scan_note_todos(root_path)?;
    let archive = load_archive(&app)?;

    Ok(NoteTodosResult {
        active,
        archived: archive.todos,
    })
}

// Get unified todos: combines note todos AND todos.json todos
#[tauri::command]
fn get_unified_todos(app: tauri::AppHandle, root_path: String) -> Result<NoteTodosResult, String> {
    println!("🔍 get_unified_todos called");

    // 1. Get note-based todos
    let note_todos_active = scan_note_todos(root_path.clone())?;
    println!("📋 Found {} note todos (active)", note_todos_active.len());

    let archive = load_archive(&app)?;
    let note_todos_archived = archive.todos;
    println!("📦 Found {} archived todos", note_todos_archived.len());

    // 2. Get todos.json todos
    let mut todo_data = get_todos(app.clone())?;

    // 3. Create a set of (note_path, todo_text) pairs for deduplication
    use std::collections::HashSet;
    let mut note_todo_signatures: HashSet<(String, String)> = HashSet::new();

    for todo in &note_todos_active {
        if !todo.note_path.is_empty() {
            note_todo_signatures.insert((todo.note_path.clone(), todo.title.clone()));
        }
    }

    for todo in &note_todos_archived {
        if !todo.note_path.is_empty() {
            note_todo_signatures.insert((todo.note_path.clone(), todo.title.clone()));
        }
    }

    // 4. Clean up duplicates from todos.json and build result
    let mut final_active = note_todos_active;
    let mut final_archived = note_todos_archived;
    let mut needs_save = false;

    for list in &mut todo_data.lists {
        // Filter out duplicate todos
        let original_len = list.todos.len();
        list.todos.retain(|todo| {
            // Determine note path if linked
            let note_path = if let Some(note_name) = &todo.linked_note {
                PathBuf::from(&root_path).join(format!("{}.md", note_name)).to_string_lossy().to_string()
            } else {
                String::new()
            };

            // Check if this todo already exists in notes
            let signature = (note_path.clone(), todo.text.clone());
            !note_todo_signatures.contains(&signature)
        });

        if list.todos.len() != original_len {
            needs_save = true;
        }

        // Add remaining todos to result
        for todo in &list.todos {
            let note_path = if let Some(note_name) = &todo.linked_note {
                PathBuf::from(&root_path).join(format!("{}.md", note_name)).to_string_lossy().to_string()
            } else {
                String::new()
            };

            let note_todo = NoteTodo {
                id: todo.id.clone(),
                title: todo.text.clone(),
                completed: todo.completed,
                priority: todo.priority.clone(),
                start_date: todo.start_date.clone(),
                end_date: todo.due_date.clone(),
                description: todo.description.clone(),
                note_path: note_path.clone(),
                line_number: 0,
                created_at: todo.created_at.clone(),
                completed_at: None,
            };

            if todo.completed {
                final_archived.push(note_todo);
            } else {
                final_active.push(note_todo);
            }
        }
    }

    // 5. Save cleaned todos.json if duplicates were removed
    if needs_save {
        save_todos(app.clone(), todo_data)?;
    }

    Ok(NoteTodosResult {
        active: final_active,
        archived: final_archived,
    })
}

#[tauri::command]
fn toggle_note_todo(
    app: tauri::AppHandle,
    note_path: String,
    line_number: usize,
    completed: bool,
) -> Result<(), String> {
    // If line_number is 0 or note_path is empty, this is a todos.json entry (not a note todo)
    // In this case, we only update todos.json without trying to read/write a note file
    if line_number == 0 || note_path.trim().is_empty() {
        println!("⚠️ toggle_note_todo called with line_number=0 or empty note_path - this should be handled via update_todo instead");
        return Err("This todo is not embedded in a note. Use update_todo command instead.".to_string());
    }

    // Verify file exists before trying to read it
    let path = Path::new(&note_path);
    if !path.exists() {
        return Err(format!("Note file does not exist: {}", note_path));
    }

    // Read the note file
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read file {}: {}", note_path, e))?;
    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();

    if line_number > lines.len() {
        return Err(format!("Invalid line number {} (file has {} lines)", line_number, lines.len()));
    }

    let line_idx = line_number - 1;
    let line = lines[line_idx].clone(); // Clone to avoid borrowing issues

    // Toggle the checkbox
    let new_line = if completed {
        line.replace("- [ ]", "- [x]")
    } else {
        line.replace("- [x]", "- [ ]").replace("- [X]", "- [ ]")
    };

    lines[line_idx] = new_line;

    // Write back to file
    let new_content = lines.join("\n");
    fs::write(path, new_content).map_err(|e| format!("Failed to write file {}: {}", note_path, e))?;

    // Parse todo metadata
    let (title, priority, start_date, end_date, description) = parse_todo_metadata(&line);
    let todo_id = format!("{}:{}", note_path, line_number);

    // SYNC WITH TODOS.JSON
    let mut todo_data = get_todos(app.clone())?;

    // Find matching todo in todos.json by checking if linked_note matches
    let note_name = Path::new(&note_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    for list in &mut todo_data.lists {
        if let Some(todo) = list.todos.iter_mut().find(|t| {
            t.linked_note.as_deref() == Some(note_name) && t.text == title
        }) {
            todo.completed = completed;
        }
    }
    save_todos(app.clone(), todo_data)?;

    // If completed, move to archive
    if completed {
        let mut archive = load_archive(&app)?;
        archive.todos.push(NoteTodo {
            id: todo_id,
            title,
            completed: true,
            priority,
            start_date,
            end_date,
            description,
            note_path: note_path.clone(),
            line_number,
            created_at: Utc::now().to_rfc3339(),
            completed_at: Some(Utc::now().to_rfc3339()),
        });

        save_archive(&app, &archive)?;
    } else {
        // If uncompleted, remove from archive
        let mut archive = load_archive(&app)?;
        archive.todos.retain(|t| t.id != todo_id);
        save_archive(&app, &archive)?;
    }

    Ok(())
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

// New todo commands for inline todo blocks
#[tauri::command]
fn create_todo(
    app: tauri::AppHandle,
    text: String,
    priority: Option<u8>,
    start_date: Option<String>,
    end_date: Option<String>,
    linked_note_path: Option<String>,
    _linked_note_name: Option<String>,
    description: Option<String>,
    completed: bool,
) -> Result<serde_json::Value, String> {
    let mut data = get_todos(app.clone())?;

    // Generate ID
    let todo_id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();

    // Create todo in the first list (or create a default list if none exists)
    if data.lists.is_empty() {
        // Create a default "Inbox" list
        let inbox_id = uuid::Uuid::new_v4().to_string();
        data.lists.push(TodoList {
            id: inbox_id.clone(),
            name: "Inbox".to_string(),
            icon: "📥".to_string(),
            todos: vec![],
        });
    }

    let list_id = data.lists[0].id.clone();

    let new_todo = Todo {
        id: todo_id.clone(),
        text: text.clone(),
        completed,
        due_date: end_date.clone(),
        created_at,
        linked_note: linked_note_path.clone(),
        list_id: Some(list_id.clone()),
        priority,
        start_date,
        description,
    };

    if let Some(list) = data.lists.iter_mut().find(|l| l.id == list_id) {
        list.todos.push(new_todo.clone());
        save_todos(app, data)?;
    }

    Ok(serde_json::json!({
        "success": true,
        "id": todo_id
    }))
}

#[tauri::command]
fn get_all_todos(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let data = get_todos(app)?;

    let mut all_todos = Vec::new();
    for list in data.lists {
        for todo in list.todos {
            all_todos.push(serde_json::json!({
                "id": todo.id,
                "text": todo.text,
                "completed": todo.completed,
                "priority": todo.priority,
                "startDate": todo.start_date,
                "endDate": todo.due_date,
                "description": todo.description,
                "linkedNote": todo.linked_note,
                "listId": todo.list_id,
                "createdAt": todo.created_at,
            }));
        }
    }

    Ok(all_todos)
}

#[tauri::command]
fn toggle_todo_completion(app: tauri::AppHandle, todo_id: String) -> Result<(), String> {
    let mut data = get_todos(app.clone())?;

    for list in data.lists.iter_mut() {
        if let Some(todo) = list.todos.iter_mut().find(|t| t.id == todo_id) {
            todo.completed = !todo.completed;
            save_todos(app, data)?;
            return Ok(());
        }
    }

    Err("Todo not found".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_root_folder, select_folder, save_root_folder,
            get_config_value, set_config_value, delete_config_value,
            get_file_tree, create_file, create_folder,
            get_markdown_files, delete_item, rename_item, move_item, read_file, read_binary_file, write_file,
            reveal_in_explorer, open_file_external, find_file_by_name, search_files,
            // Old Todo commands (to be deprecated)
            get_todos, save_todos, add_todo_list, add_todo, update_todo, delete_todo,
            // New note-embedded todo commands
            scan_note_todos, get_note_todos, toggle_note_todo,
            // Unified todo commands
            add_unified_todo, get_unified_todos,
            // Inline todo block commands
            create_todo, get_all_todos, toggle_todo_completion,
            // OAuth commands
            oauth::start_oauth_callback_server, oauth::open_oauth_url,
            // Email commands
            email::send_invitation_email, email::send_team_invitation_email,
            // AI Smart Suggestions commands - Hidden for now
            // auto_index_notes, get_index_status, find_cross_folder_suggestions, analyze_idea
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
