use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
// use tauri::Emitter; // Temporarily unused - was for AI indexing progress
// use regex::Regex; // Temporarily unused - was for markdown chunking

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

// AI features temporarily disabled - focusing on todo/timeline features
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
fn update_todo(app: tauri::AppHandle, list_id: String, todo_id: String, text: Option<String>, completed: Option<bool>, due_date: Option<String>, root_path: Option<String>) -> Result<(), String> {
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
    note_name: Option<String>,
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
        linked_note: note_name.clone(),
        list_id: Some(list_id.clone()),
    };

    if let Some(list) = data.lists.iter_mut().find(|l| l.id == list_id) {
        list.todos.push(new_todo.clone());
        save_todos(app, data)?;
    } else {
        return Err("List not found".to_string());
    }

    // 2. Write to note file (creates or appends)
    let note_file_name = note_name.as_deref().unwrap_or("Quick Todos");
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

    // 3. Return unified todo
    Ok(UnifiedTodo {
        id: todo_id,
        text,
        completed: false,
        due_date: end_date.clone(),
        created_at,
        linked_note: Some(note_file_name.to_string()),
        list_id: Some(list_id),
        priority,
        start_date,
        end_date,
        note_path: Some(note_path.to_string_lossy().to_string()),
    })
}

// Note-embedded todo functions
use regex::Regex;
use chrono::Utc;

fn parse_todo_metadata(line: &str) -> (String, Option<u8>, Option<String>, Option<String>) {
    // Parse: - [ ] Title {priority: 1, start: 2025-01-15, end: 2025-01-20}
    let re = Regex::new(r"^-\s*\[([ x])\]\s*(.+?)(?:\s*\{(.+?)\})?$").unwrap();

    if let Some(caps) = re.captures(line) {
        let title = caps.get(2).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
        let metadata_str = caps.get(3).map(|m| m.as_str());

        let mut priority = None;
        let mut start_date = None;
        let mut end_date = None;

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
        }

        (title, priority, start_date, end_date)
    } else {
        (String::new(), None, None, None)
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

    fn scan_directory(dir: &Path, todos: &mut Vec<NoteTodo>) -> Result<(), String> {
        let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;

        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();

            if path.is_dir() {
                scan_directory(&path, todos)?;
            } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
                // Parse markdown file for todos
                let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;

                for (line_num, line) in content.lines().enumerate() {
                    if line.trim_start().starts_with("- [") {
                        let (title, priority, start_date, end_date) = parse_todo_metadata(line);

                        if !title.is_empty() {
                            let completed = line.contains("- [x]") || line.contains("- [X]");

                            // Only include active todos (not completed)
                            if !completed {
                                todos.push(NoteTodo {
                                    id: format!("{}:{}", path.display(), line_num),
                                    title,
                                    completed: false,
                                    priority,
                                    start_date,
                                    end_date,
                                    note_path: path.to_string_lossy().to_string(),
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

    scan_directory(root, &mut todos)?;
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
    // 1. Get note-based todos
    let mut note_todos_active = scan_note_todos(root_path.clone())?;
    let archive = load_archive(&app)?;
    let mut note_todos_archived = archive.todos;

    // 2. Get todos.json todos
    let todo_data = get_todos(app)?;

    // 3. Convert todos.json todos to NoteTodo format
    for list in todo_data.lists {
        for todo in list.todos {
            // Determine note path if linked
            let note_path = if let Some(note_name) = &todo.linked_note {
                PathBuf::from(&root_path).join(format!("{}.md", note_name)).to_string_lossy().to_string()
            } else {
                String::new()
            };

            let note_todo = NoteTodo {
                id: todo.id,
                title: todo.text,
                completed: todo.completed,
                priority: None, // todos.json doesn't have priority yet
                start_date: None, // todos.json doesn't have start_date yet
                end_date: todo.due_date,
                note_path: note_path.clone(),
                line_number: 0, // Not applicable for todos.json todos
                created_at: todo.created_at,
                completed_at: None,
            };

            if todo.completed {
                note_todos_archived.push(note_todo);
            } else {
                note_todos_active.push(note_todo);
            }
        }
    }

    Ok(NoteTodosResult {
        active: note_todos_active,
        archived: note_todos_archived,
    })
}

#[tauri::command]
fn toggle_note_todo(
    app: tauri::AppHandle,
    note_path: String,
    line_number: usize,
    completed: bool,
) -> Result<(), String> {
    // Read the note file
    let path = Path::new(&note_path);
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();

    if line_number == 0 || line_number > lines.len() {
        return Err("Invalid line number".to_string());
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
    fs::write(path, new_content).map_err(|e| e.to_string())?;

    // Parse todo metadata
    let (title, priority, start_date, end_date) = parse_todo_metadata(&line);
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
        .invoke_handler(tauri::generate_handler![
            get_root_folder, select_folder, save_root_folder, get_file_tree, create_file, create_folder,
            get_markdown_files, delete_item, rename_item, move_item, read_file, read_binary_file, write_file,
            reveal_in_explorer, open_file_external, find_file_by_name, search_files,
            // Old Todo commands (to be deprecated)
            get_todos, save_todos, add_todo_list, add_todo, update_todo, delete_todo,
            // New note-embedded todo commands
            scan_note_todos, get_note_todos, toggle_note_todo,
            // Unified todo commands
            add_unified_todo, get_unified_todos
        ])
        // AI commands temporarily disabled: ai_chat, index_notes, search_notes, ai_chat_with_context
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
