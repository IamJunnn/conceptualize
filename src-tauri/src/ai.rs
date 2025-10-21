use serde::{Deserialize, Serialize};
use reqwest;

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaRequest {
    pub model: String,
    pub prompt: String,
    pub stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaResponse {
    pub model: String,
    pub created_at: String,
    pub response: String,
    pub done: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiChatResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Call Ollama API to get AI response
pub async fn ask_ai(prompt: String) -> AiChatResult {
    let client = reqwest::Client::new();

    let request_body = OllamaRequest {
        model: "llama3.2:1b".to_string(),
        prompt,
        stream: false,
    };

    match client
        .post("http://localhost:11434/api/generate")
        .json(&request_body)
        .send()
        .await
    {
        Ok(response) => {
            match response.json::<OllamaResponse>().await {
                Ok(ollama_response) => AiChatResult {
                    success: true,
                    response: Some(ollama_response.response),
                    error: None,
                },
                Err(e) => AiChatResult {
                    success: false,
                    response: None,
                    error: Some(format!("Failed to parse response: {}", e)),
                },
            }
        }
        Err(e) => AiChatResult {
            success: false,
            response: None,
            error: Some(format!("Failed to connect to Ollama: {}. Make sure Ollama is running.", e)),
        },
    }
}
