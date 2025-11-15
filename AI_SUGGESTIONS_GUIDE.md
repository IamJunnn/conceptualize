# AI Smart Suggestions - User Guide

## Overview

The AI Smart Suggestions feature discovers hidden relationships between your notes across different folders using AI-powered semantic analysis. It helps you connect ideas, match project concepts with tech stacks, and evaluate the feasibility of your ideas.

## Features

### 1. Cross-Folder Link Discovery
- **What it does**: Finds semantically similar content between notes in different folders
- **How it works**: Uses embeddings (vector representations) to calculate similarity
- **Example**: Your "Mobile App Idea" in the `/ideas` folder might be linked to "React Native Setup" in your `/tech-stack` folder

### 2. Idea Analysis
- **What it does**: Analyzes project ideas and provides structured feedback
- **Provides**:
  - Recommended tech stack from your notes
  - Advantages of the idea
  - Disadvantages and potential challenges
  - Complexity score (1-10)

## Prerequisites

### Required: Ollama Installation
1. Install [Ollama](https://ollama.com/)
2. Pull the required models:
   ```bash
   ollama pull llama3.2:1b
   ollama pull nomic-embed-text
   ```
3. Keep Ollama running in the background

## How to Use

### Opening the Panel
1. Look for the **purple link icon (🔗)** button in the bottom-right corner
2. Click it to open the AI Smart Suggestions panel

### Finding Cross-Folder Links
1. Click the **"🔍 Find Links"** button
2. Wait for the AI to analyze your notes (this may take a moment)
3. Browse discovered relationships in the Suggestions tab
4. Each suggestion shows:
   - Source and target folders
   - File names
   - Confidence score (percentage)
   - Reason for the connection
5. Click **"Open Source"** or **"Open Target"** to view the related notes

### Analyzing an Idea
1. After finding suggestions, click **"Analyze"** on any suggestion
2. Or select a suggestion and click the **"Analysis"** tab
3. The AI will provide:
   - Recommended technologies
   - Advantages
   - Disadvantages
   - Complexity rating

## Understanding Results

### Confidence Scores
- **90%+** (Green): Very strong semantic similarity
- **80-90%** (Yellow): Good match
- **75-80%** (Orange): Moderate similarity

### Similarity Threshold
- Only suggestions with 75%+ similarity are shown
- This ensures high-quality recommendations

## Example Use Cases

### 1. Project Planning
- **Folder Structure**:
  ```
  /ideas/
    mobile-game.md
  /tech-stack/
    game-engines.md
    multiplayer-frameworks.md
  ```
- **Result**: AI discovers that your mobile game idea matches with specific game engines from your tech stack

### 2. Learning Path Discovery
- **Folder Structure**:
  ```
  /goals/
    learn-web-development.md
  /resources/
    javascript-tutorials.md
    react-courses.md
  ```
- **Result**: AI connects your learning goals with relevant resources

### 3. Feasibility Analysis
- Select your idea note and a tech stack note
- Get instant feedback on:
  - Is this idea too complex?
  - What are the main challenges?
  - Which technologies should I use?

## Tips for Best Results

1. **Organize by Folders**: Keep different types of notes in separate folders (e.g., `/ideas`, `/tech-stack`, `/resources`)
2. **Rich Content**: Write detailed notes with context - better content = better suggestions
3. **Update Regularly**: Re-run "Find Links" after adding or updating notes
4. **Descriptive Headings**: Use markdown headings to help the AI understand structure

## Technical Details

### How It Works
1. **Chunking**: Notes are split into semantic chunks (by heading)
2. **Embedding**: Each chunk is converted to a vector using `nomic-embed-text`
3. **Storage**: Vectors are stored in a local SQLite database
4. **Similarity**: Cosine similarity calculates how related chunks are
5. **LLM Analysis**: `llama3.2:1b` provides natural language analysis

### Privacy
- All processing happens **locally** on your machine
- No data is sent to external servers
- Ollama runs entirely offline

## Troubleshooting

### "Failed to connect to Ollama"
- Make sure Ollama is running: `ollama serve` (or check if it's running as a service)
- Verify models are installed: `ollama list`

### No Suggestions Found
- Ensure you have notes in at least 2 different folders
- Add more detailed content to your notes
- Try lowering the similarity threshold (future feature)

### Slow Performance
- First run takes longer (indexing all notes)
- Subsequent runs use cached embeddings
- Consider closing other heavy applications

## Future Enhancements

- [ ] Adjustable similarity threshold
- [ ] One-click wiki-link creation from suggestions
- [ ] Automatic periodic background indexing
- [ ] Visual graph view of suggested connections
- [ ] Support for additional embedding models

## Keyboard Shortcuts

- Open from Graph View: Click any node and press `S` for suggestions (planned)
- Quick Analysis: `Ctrl+Shift+A` (planned)

## Credits

Built with:
- [Ollama](https://ollama.com/) - Local LLM runtime
- `nomic-embed-text` - Embedding model
- `llama3.2:1b` - Fast local LLM
- Tauri + React - Desktop app framework
