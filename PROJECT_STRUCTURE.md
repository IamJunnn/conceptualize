# Conceptualize Project Structure

This document describes the organized folder structure of the Conceptualize project.

## Root Directory

```
conceptualize/
├── backend/                    # Backend services
├── frontend/                   # React/TypeScript frontend
├── src-tauri/                 # Tauri desktop app (Rust)
├── docs/                      # Documentation
├── scripts/                   # Utility scripts
├── dist/                      # Build output (gitignored)
├── target/                    # Rust build output (gitignored)
├── node_modules/              # Dependencies (gitignored)
└── [config files]             # Firebase, Vite, TypeScript configs
```

## Backend (`/backend/`)

### Firebase Functions (`/backend/firebase-functions/`)
- Node.js Cloud Functions for Firebase
- **Key file**: `index.js` - All Firebase Cloud Functions
- **Purpose**: Team management, Cloud Storage operations, authentication middleware

## Frontend (`/frontend/`)

### React Application
- **Entry point**: `index.html`
- **Source code**: `/frontend/src/`
- **Static assets**: `/frontend/public/`

### Components (`/frontend/src/components/`)
- **AI/**: AI chat and suggestions
- **Auth/**: Login, mode selection, team action screens
- **Editor/**: Markdown editor (Milkdown-based)
- **Graph/**: Graph visualization
- **Team/**: Team collaboration UI
- **Workspace/**: Workspace management
- **UI/**: Reusable UI components

### Services (`/frontend/src/services/`)
- **firebase.ts**: Firebase initialization
- **teamService.ts**: Team management
- **cloudStorageBackend.ts**: Firebase Cloud Storage interface
- **authService.ts**: Authentication
- **[other services]**: Google Drive, workspace, email, etc.

## Documentation (`/docs/`)

### Setup (`/docs/setup/`)
- Firebase authentication setup
- Service account setup
- Email configuration

### Guides (`/docs/guides/`)
- Quick start guides
- Testing guides
- Team workflow documentation

### Deployment (`/docs/deployment/`)
- Firebase deployment instructions
- Cloud Functions deployment

### Reference (`/docs/reference/`)
- Architecture diagrams
- Implementation summaries
- Release notes
- Database schema

## Tauri Desktop Backend (`/src-tauri/`)

Rust-based desktop application backend:
- **src/lib.rs**: Main Tauri logic
- **src/oauth.rs**: OAuth authentication
- **src/email.rs**: Email functionality
- **src/ai.rs**: AI integrations
- **src/vector_db.rs**: Vector database operations
- **src/embeddings.rs**: Vector embeddings

## Scripts (`/scripts/`)

Utility scripts for development and testing:
- `get-central-oauth-tokens.js`: OAuth token management
- `test-service-account.js`: Service account testing

## Configuration Files (Root)

### Critical
- **package.json**: Frontend dependencies and scripts
- **firebase.json**: Firebase configuration (points to `backend/firebase-functions`)
- **vite.config.mts**: Vite build configuration (points to `frontend/`)
- **tsconfig.json**: TypeScript configuration
- **.env**: Environment variables (SECRET - never commit)
- **storage.rules**: Firebase Cloud Storage security rules

### Git
- **.gitignore**: Git ignore rules
- **.firebaserc**: Firebase project configuration

## Build Output

- **dist/**: Vite-compiled frontend (referenced by Tauri)
- **target/**: Rust/Tauri build output

## Key Features

1. **Personal Workspace**: Single-user knowledge management
   - Markdown notes with wiki-links
   - Graph visualization
   - Todo/task management
   - Timeline/Gantt view

2. **Team Collaboration**: Multi-user team workspace
   - Firebase Cloud Storage for shared files
   - Team management and invitations
   - Role-based access control

3. **Desktop Application**: Tauri-based cross-platform app
   - Rust backend for performance
   - React frontend for UI
   - OAuth integration
   - AI-powered features

## Recent Changes

- **Organized documentation**: Moved 26+ markdown files from root to `/docs/`
- **Backend consolidation**: Created `/backend/` folder for Firebase functions
- **Frontend organization**: Moved React app to `/frontend/` folder
- **Config updates**: Updated `firebase.json`, `vite.config.mts`, and `tsconfig.json` to reflect new structure
