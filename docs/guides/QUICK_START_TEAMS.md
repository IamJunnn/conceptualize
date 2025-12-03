# Quick Start: Team Collaboration Setup

## ✅ What We Just Set Up

1. **PostgreSQL Schema** - [database_schema.sql](database_schema.sql)
   - Users & OAuth tokens
   - Teams & members
   - Notes & sync queue
   - Conflict resolution

2. **Dependencies** - Updated [src-tauri/Cargo.toml](src-tauri/Cargo.toml)
   - `sqlx` - PostgreSQL client
   - `dotenv` - Environment variables

3. **Implementation Guide** - [TEAM_DRIVE_IMPLEMENTATION.md](TEAM_DRIVE_IMPLEMENTATION.md)
   - Complete flow diagrams
   - Token management
   - Security best practices

---

## 🎯 The Answer to Your Question

### "How do we connect User A creating a team to their Google Drive?"

**Answer: OAuth Access Tokens!**

```
User A → Grants permission via Google OAuth → App gets access_token
                                                        ↓
                                    App uses access_token to create folder
                                    IN USER A'S DRIVE (not yours!)
                                                        ↓
                                    App saves folder_id to PostgreSQL
                                                        ↓
                                    Now app knows: Team "Marketing" = Folder "1aB2cD..."
```

### The Magic

- **User A's token** lets the app act as User A
- **User B's token** lets the app act as User B
- But they both read/write to **the same shared folder**!

---

## 📋 Implementation Checklist

### Phase 1: Setup PostgreSQL ✅
- [x] Created database schema
- [ ] Install PostgreSQL locally
- [ ] Create database: `createdb conceptualize`
- [ ] Run schema: `psql conceptualize < database_schema.sql`
- [ ] Add `.env` file with `DATABASE_URL`

### Phase 2: Extend OAuth for Drive Scope
- [x] Update [src/services/authServiceTauri.ts](src/services/authServiceTauri.ts) line 92
  - Use `https://www.googleapis.com/auth/drive` scope (full access needed for shared folders)
- [ ] Store `access_token` and `refresh_token` in PostgreSQL
- [ ] Implement token refresh logic

### Phase 3: Build Google Drive Service
- [ ] Create `src/services/googleDriveService.ts`
  - `createTeamFolder()` - Create folder in user's Drive
  - `shareFolder()` - Share with team members
  - `uploadNote()` - Upload file to folder
  - `downloadNote()` - Download file from folder
  - `listFolderFiles()` - List all files in folder

### Phase 4: Build Team Management
- [ ] Create `src/services/teamService.ts`
  - `createTeam()` - Create team + Drive folder
  - `inviteTeamMember()` - Invite user to team
  - `acceptTeamInvite()` - Join team
  - `getUserTeams()` - Get all user's teams

### Phase 5: Build UI
- [ ] Create Team modal component
- [ ] Team list view
- [ ] Team members panel
- [ ] Invite member dialog

### Phase 6: Sync Engine
- [ ] Watch for local note changes
- [ ] Upload to Drive on change
- [ ] Download remote changes
- [ ] Conflict resolution UI

---

## 🔐 Environment Setup

Create `.env` file in `src-tauri/`:

```bash
# PostgreSQL connection
DATABASE_URL=postgresql://username:password@localhost/conceptualize

# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=549066711560-lnsaqugfnbldudoilvmkl0r4dqjogjes.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_secret_here

# App settings
RUST_LOG=info
```

---

## 💰 Cost Summary (for your peace of mind)

| Service | Cost | Notes |
|---------|------|-------|
| **Google Drive API** | $0 | Free! Unlimited API calls |
| **Google Drive Storage** | $0 | Users use their own 15GB free quota |
| **PostgreSQL** | $0 (local) | Or $5-15/month for hosted (Railway, Supabase) |
| **Firebase Auth** | $0 | Free up to 50k MAU |
| **Firebase Firestore** | $0 | Free tier: 50k reads, 20k writes/day |

**Total monthly cost**: $0 for local development, ~$5-15 for production (just database hosting)

---

## 🚀 Ready to Implement?

The groundwork is done! Now we can:

1. **Set up PostgreSQL** locally
2. **Extend OAuth** to request Drive scope
3. **Build Drive service** to create folders and sync files
4. **Create team UI** for users to collaborate

Which part would you like me to implement first?

- **Option A**: PostgreSQL setup + connection in Rust
- **Option B**: Google Drive service implementation
- **Option C**: Team creation UI flow
- **Option D**: Complete end-to-end implementation

Let me know! 🚀
