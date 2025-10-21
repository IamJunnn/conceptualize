use serde::{Deserialize, Serialize};
use reqwest;

#[derive(Debug, Serialize, Deserialize)]
struct EmbeddingRequest {
    model: String,
    input: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct EmbeddingResponse {
    embeddings: Vec<Vec<f32>>,
}

/// Generate embedding vector for a given text using Ollama
pub async fn generate_embedding(text: &str) -> Result<Vec<f32>, String> {
    let client = reqwest::Client::new();

    let request_body = EmbeddingRequest {
        model: "nomic-embed-text".to_string(),
        input: text.to_string(),
    };

    match client
        .post("http://localhost:11434/api/embed")
        .json(&request_body)
        .send()
        .await
    {
        Ok(response) => {
            match response.json::<EmbeddingResponse>().await {
                Ok(embedding_response) => {
                    if let Some(embedding) = embedding_response.embeddings.first() {
                        Ok(embedding.clone())
                    } else {
                        Err("No embedding returned".to_string())
                    }
                }
                Err(e) => Err(format!("Failed to parse embedding response: {}", e)),
            }
        }
        Err(e) => Err(format!("Failed to connect to Ollama: {}", e)),
    }
}

/// Calculate cosine similarity between two vectors
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let magnitude_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let magnitude_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if magnitude_a == 0.0 || magnitude_b == 0.0 {
        return 0.0;
    }

    dot_product / (magnitude_a * magnitude_b)
}
