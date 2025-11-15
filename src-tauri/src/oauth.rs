use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;
use warp::Filter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthCallbackData {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// Start a temporary HTTP server on localhost to receive OAuth callback
#[tauri::command]
pub async fn start_oauth_callback_server(
    app_handle: AppHandle,
) -> Result<u16, String> {
    // Use a random available port
    let port: u16 = 8080;

    // Create a oneshot channel to signal when we receive the callback
    let (tx, rx) = oneshot::channel::<OAuthCallbackData>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    // Clone for the route handler
    let tx_clone = tx.clone();
    let app_handle_clone = app_handle.clone();

    // Create the OAuth callback route
    let callback_route = warp::path("auth")
        .and(warp::path("callback"))
        .and(warp::query::<OAuthCallbackData>())
        .map(move |data: OAuthCallbackData| {
            println!("🔔 OAuth callback received: code={:?}, state={:?}, error={:?}",
                     data.code.is_some(), data.state.is_some(), data.error.is_some());

            // Send the callback data through the channel
            if let Some(sender) = tx_clone.lock().unwrap().take() {
                let _ = sender.send(data.clone());
                println!("📤 Sent callback data through channel");

                // Emit event to main window
                if let Some(window) = app_handle_clone.get_webview_window("main") {
                    match window.emit("oauth-callback", &data) {
                        Ok(_) => println!("✅ Successfully emitted oauth-callback event to main window"),
                        Err(e) => eprintln!("❌ Failed to emit oauth-callback event: {}", e),
                    }
                } else {
                    eprintln!("⚠️ Could not find main window");
                }
            } else {
                eprintln!("⚠️ Sender already consumed or not available");
            }

            // Return a success page
            warp::reply::html(
                r#"
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Authentication Successful</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        }
                        .container {
                            background: white;
                            padding: 40px;
                            border-radius: 10px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                            text-align: center;
                            max-width: 400px;
                        }
                        h1 {
                            color: #333;
                            margin-bottom: 20px;
                        }
                        p {
                            color: #666;
                            margin-bottom: 30px;
                        }
                        .success-icon {
                            width: 80px;
                            height: 80px;
                            margin: 0 auto 20px;
                            background: #4CAF50;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .checkmark {
                            color: white;
                            font-size: 50px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="success-icon">
                            <div class="checkmark">✓</div>
                        </div>
                        <h1>Authentication Successful!</h1>
                        <p>You can close this browser tab and return to the application.</p>
                    </div>
                    <script>
                        // Auto-close after 3 seconds
                        setTimeout(() => {
                            window.close();
                        }, 3000);
                    </script>
                </body>
                </html>
                "#,
            )
        });

    // Start the server in a background task
    let server = warp::serve(callback_route)
        .bind(([127, 0, 0, 1], port));

    tokio::spawn(async move {
        // Run the server until we receive a callback
        tokio::select! {
            _ = server => {},
            _ = rx => {
                // Callback received, server will shut down
            }
        }
    });

    Ok(port)
}

/// Open the OAuth URL in the system browser
#[tauri::command]
pub async fn open_oauth_url(url: String) -> Result<(), String> {
    opener::open(&url).map_err(|e| format!("Failed to open browser: {}", e))?;
    Ok(())
}
