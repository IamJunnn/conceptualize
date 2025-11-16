# Temporary Revert to Old System

Since the service account isn't set up yet, here's how to revert to the old system temporarily:

## Quick Fix

Replace the imports and backend initialization in `src/components/Team/TeamMainUI.tsx`:

### Change 1: Import
```typescript
// OLD (current - doesn't work yet):
import { DriveStorageBackendV2 } from '../../services/driveStorageBackendV2';

// NEW (temporary):
import { DriveStorageBackend } from '../../services/driveStorageBackend';
import { hasTokens, getTokenDebugInfo } from '../../services/tokenStorage';
```

### Change 2: State
```typescript
// OLD (line 36):
const [storageBackend, setStorageBackend] = useState<DriveStorageBackendV2 | null>(null);

// NEW:
const [storageBackend, setStorageBackend] = useState<DriveStorageBackend | null>(null);
```

### Change 3: Backend Initialization (lines 75-88)
```typescript
// Replace the entire useEffect with:
useEffect(() => {
  if (selectedTeam) {
    // Check if we have Google Drive access token
    if (!hasTokens()) {
      console.error('❌ No Google Drive access token found. Please sign in again.');
      console.log('📊 Token debug info:', getTokenDebugInfo());
      return;
    }

    console.log('✅ Google Drive tokens found, initializing storage backend...');
    const backend = new DriveStorageBackend(
      selectedTeam.driveFolderId,
      selectedTeam.name
    );
    setStorageBackend(backend);
    loadFileTree(backend);
  }
}, [selectedTeam]);
```

### Change 4: Function signature (line 90)
```typescript
// OLD:
const loadFileTree = async (backend?: DriveStorageBackendV2) => {

// NEW:
const loadFileTree = async (backend?: DriveStorageBackend) => {
```

## After Making These Changes

The app will work like before - you'll need to sign in with the Google account that owns the Drive folder (conceptualize@launchwith.co).

## When Ready for Service Account

Once you complete the service account setup, just undo these changes to switch back to the V2 backend!
