-- PostgreSQL Schema for Conceptualize Teams & Sync

-- Users table (extends Firebase auth)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    firebase_uid VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Google OAuth tokens for each user
CREATE TABLE user_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    google_access_token TEXT NOT NULL,
    google_refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMP NOT NULL,
    scopes TEXT[], -- Array of granted scopes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Teams
CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    team_id VARCHAR(255) UNIQUE NOT NULL, -- Public team ID (UUID)
    name VARCHAR(255) NOT NULL,
    description TEXT,
    drive_folder_id VARCHAR(255) NOT NULL, -- Google Drive folder ID
    drive_owner_email VARCHAR(255) NOT NULL, -- Whose Drive this lives in
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Team members (many-to-many)
CREATE TABLE team_members (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(team_id, user_id)
);

-- Team invitations
CREATE TABLE team_invitations (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    invitee_email VARCHAR(255) NOT NULL,
    invited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP,
    expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days',
    UNIQUE(team_id, invitee_email)
);

-- Notes (local cache + sync metadata)
CREATE TABLE notes (
    id SERIAL PRIMARY KEY,
    note_id VARCHAR(255) UNIQUE NOT NULL, -- Local note ID (UUID)
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE NULL, -- NULL for personal notes
    title VARCHAR(500),
    content TEXT,
    drive_file_id VARCHAR(255), -- Google Drive file ID (if synced)
    local_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    drive_modified_at TIMESTAMP, -- Last known Drive modification time
    sync_status VARCHAR(50) DEFAULT 'unsynced' CHECK (sync_status IN ('unsynced', 'syncing', 'synced', 'conflict')),
    last_synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Sync queue (tracks pending sync operations)
CREATE TABLE sync_queue (
    id SERIAL PRIMARY KEY,
    note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    operation VARCHAR(50) NOT NULL CHECK (operation IN ('upload', 'download', 'delete')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- Sync conflicts (when two users edit same note)
CREATE TABLE sync_conflicts (
    id SERIAL PRIMARY KEY,
    note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    local_content TEXT,
    remote_content TEXT,
    local_modified_at TIMESTAMP,
    remote_modified_at TIMESTAMP,
    resolved BOOLEAN DEFAULT FALSE,
    resolution_strategy VARCHAR(50) CHECK (resolution_strategy IN ('keep_local', 'keep_remote', 'merge', 'manual')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_user_tokens_email ON user_tokens(email);
CREATE INDEX idx_teams_owner ON teams(owner_user_id);
CREATE INDEX idx_teams_drive_folder ON teams(drive_folder_id);
CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_team_invitations_email ON team_invitations(invitee_email);
CREATE INDEX idx_team_invitations_status ON team_invitations(status);
CREATE INDEX idx_notes_team ON notes(team_id);
CREATE INDEX idx_notes_sync_status ON notes(sync_status);
CREATE INDEX idx_sync_queue_status ON sync_queue(status);
CREATE INDEX idx_sync_conflicts_resolved ON sync_conflicts(resolved);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_tokens_updated_at BEFORE UPDATE ON user_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
