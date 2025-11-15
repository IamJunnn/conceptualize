use rusqlite::{Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteEmbedding {
    pub id: Option<i64>,
    pub file_path: String,
    pub content: String,
    pub embedding: Vec<f32>,
    pub chunk_index: i32,      // Which chunk this is (0, 1, 2, etc.)
    pub heading: Option<String>, // The markdown heading for this chunk
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub file_path: String,
    pub content: String,
    pub similarity: f32,
    pub chunk_index: i32,
    pub heading: Option<String>,
}

pub struct VectorDB {
    conn: Connection,
}

impl VectorDB {
    /// Create or open the vector database
    pub fn new(db_path: PathBuf) -> SqliteResult<Self> {
        let conn = Connection::open(db_path)?;

        // Create embeddings table if it doesn't exist
        conn.execute(
            "CREATE TABLE IF NOT EXISTS embeddings (
                id INTEGER PRIMARY KEY,
                file_path TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                heading TEXT,
                content TEXT NOT NULL,
                embedding BLOB NOT NULL,
                UNIQUE(file_path, chunk_index)
            )",
            [],
        )?;

        // Create file metadata tracking table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS file_metadata (
                file_path TEXT PRIMARY KEY,
                last_modified INTEGER NOT NULL,
                last_indexed INTEGER NOT NULL,
                chunk_count INTEGER NOT NULL
            )",
            [],
        )?;

        Ok(VectorDB { conn })
    }

    /// Store an embedding in the database
    pub fn store_embedding(&self, note: &NoteEmbedding) -> SqliteResult<()> {
        // Convert Vec<f32> to bytes for storage
        let embedding_bytes: Vec<u8> = note.embedding
            .iter()
            .flat_map(|f| f.to_le_bytes())
            .collect();

        self.conn.execute(
            "INSERT OR REPLACE INTO embeddings (file_path, chunk_index, heading, content, embedding) VALUES (?1, ?2, ?3, ?4, ?5)",
            (
                &note.file_path,
                &note.chunk_index,
                &note.heading,
                &note.content,
                &embedding_bytes,
            ),
        )?;

        Ok(())
    }

    /// Search for similar notes using cosine similarity
    pub fn search_similar(
        &self,
        query_embedding: &[f32],
        limit: usize,
    ) -> SqliteResult<Vec<SearchResult>> {
        // First check how many embeddings we have
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM embeddings",
            [],
            |row| row.get(0),
        )?;
        eprintln!("📊 VectorDB: Database contains {} embeddings", count);

        let mut stmt = self.conn.prepare(
            "SELECT file_path, chunk_index, heading, content, embedding FROM embeddings"
        )?;

        let results = stmt.query_map([], |row| {
            let file_path: String = row.get(0)?;
            let chunk_index: i32 = row.get(1)?;
            let heading: Option<String> = row.get(2)?;
            let content: String = row.get(3)?;
            let embedding_bytes: Vec<u8> = row.get(4)?;

            // Convert bytes back to Vec<f32>
            let embedding: Vec<f32> = embedding_bytes
                .chunks_exact(4)
                .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                .collect();

            // Calculate cosine similarity
            let similarity = crate::embeddings::cosine_similarity(query_embedding, &embedding);

            Ok(SearchResult {
                file_path,
                content,
                similarity,
                chunk_index,
                heading,
            })
        })?;

        let mut all_results: Vec<SearchResult> = results.filter_map(|r| r.ok()).collect();

        eprintln!("📊 VectorDB: Computed similarity for {} chunks", all_results.len());

        // Log top 10 similarity scores for debugging
        let mut sorted_for_debug = all_results.clone();
        sorted_for_debug.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap());
        for (i, result) in sorted_for_debug.iter().take(10).enumerate() {
            eprintln!("  Top {}: {} - similarity: {:.4}", i+1, result.file_path, result.similarity);
        }

        // Sort by similarity (highest first)
        all_results.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap());

        // Return top N results
        Ok(all_results.into_iter().take(limit).collect())
    }

    /// Get total count of embeddings
    pub fn count(&self) -> SqliteResult<i64> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM embeddings",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Clear all embeddings
    pub fn clear(&self) -> SqliteResult<()> {
        self.conn.execute("DELETE FROM embeddings", [])?;
        Ok(())
    }

    /// Update file metadata after indexing
    pub fn update_file_metadata(
        &self,
        file_path: &str,
        last_modified: i64,
        chunk_count: i32,
    ) -> SqliteResult<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        self.conn.execute(
            "INSERT OR REPLACE INTO file_metadata (file_path, last_modified, last_indexed, chunk_count)
             VALUES (?1, ?2, ?3, ?4)",
            (file_path, last_modified, now, chunk_count),
        )?;
        Ok(())
    }

    /// Check if a file needs reindexing
    pub fn needs_reindexing(&self, file_path: &str, current_modified: i64) -> SqliteResult<bool> {
        let result: Result<i64, _> = self.conn.query_row(
            "SELECT last_modified FROM file_metadata WHERE file_path = ?1",
            [file_path],
            |row| row.get(0),
        );

        match result {
            Ok(stored_modified) => Ok(stored_modified != current_modified),
            Err(_) => Ok(true), // File not in database, needs indexing
        }
    }

    /// Delete embeddings for a specific file
    pub fn delete_file_embeddings(&self, file_path: &str) -> SqliteResult<()> {
        self.conn.execute(
            "DELETE FROM embeddings WHERE file_path = ?1",
            [file_path],
        )?;
        self.conn.execute(
            "DELETE FROM file_metadata WHERE file_path = ?1",
            [file_path],
        )?;
        Ok(())
    }

    /// Get indexing status
    pub fn get_index_status(&self) -> SqliteResult<(i64, i64)> {
        let total_files: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM file_metadata",
            [],
            |row| row.get(0),
        )?;
        let total_chunks: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM embeddings",
            [],
            |row| row.get(0),
        )?;
        Ok((total_files, total_chunks))
    }

    /// Get all embeddings (for bulk similarity search)
    pub fn get_all_embeddings(&self) -> SqliteResult<Vec<(String, i32, Vec<f32>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT file_path, chunk_index, embedding FROM embeddings"
        )?;

        let results = stmt.query_map([], |row| {
            let file_path: String = row.get(0)?;
            let chunk_index: i32 = row.get(1)?;
            let embedding_bytes: Vec<u8> = row.get(2)?;

            // Convert bytes back to Vec<f32>
            let embedding: Vec<f32> = embedding_bytes
                .chunks_exact(4)
                .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                .collect();

            Ok((file_path, chunk_index, embedding))
        })?;

        results.collect()
    }
}
