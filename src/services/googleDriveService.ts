/**
 * Google Drive API Service
 * Handles folder creation, sharing, file upload/download for team collaboration
 */

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveFolder {
  id: string;
  name: string;
  webViewLink?: string;
  createdTime?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
}

export interface DrivePermission {
  id: string;
  type: 'user' | 'group' | 'domain' | 'anyone';
  role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
  emailAddress?: string;
}

/**
 * Get access token from storage
 */
async function getAccessToken(): Promise<string> {
  const token = localStorage.getItem('google_access_token');
  if (!token) {
    throw new Error('Not authenticated with Google Drive. Please sign in again.');
  }

  // Check if token is expired
  const expiresAt = localStorage.getItem('google_token_expires_at');
  if (expiresAt && Date.now() >= parseInt(expiresAt)) {
    // Token expired, try to refresh
    console.log('Access token expired, refreshing...');
    return await refreshAccessToken();
  }

  return token;
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem('google_refresh_token');
  if (!refreshToken) {
    throw new Error('No refresh token available. Please sign in again.');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Token refresh failed:', error);
    throw new Error('Failed to refresh access token. Please sign in again.');
  }

  const data = await response.json();

  // Store new access token
  localStorage.setItem('google_access_token', data.access_token);
  localStorage.setItem('google_token_expires_at', (Date.now() + (data.expires_in * 1000)).toString());

  console.log('✅ Access token refreshed successfully');
  return data.access_token;
}

/**
 * Create a folder in user's Google Drive
 */
export async function createTeamFolder(teamName: string): Promise<DriveFolder> {
  const token = await getAccessToken();

  const response = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `Conceptualize - ${teamName}`,
      mimeType: 'application/vnd.google-apps.folder',
      description: `Team workspace for ${teamName}`,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create folder: ${error}`);
  }

  const folder = await response.json();
  console.log(`✅ Created folder "${folder.name}" (ID: ${folder.id})`);
  return folder;
}

/**
 * Share a folder with a team member
 */
export async function shareFolder(
  folderId: string,
  memberEmail: string,
  role: 'reader' | 'writer' | 'commenter' = 'writer'
): Promise<void> {
  const token = await getAccessToken();

  const response = await fetch(`${DRIVE_API_BASE}/files/${folderId}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'user',
      role: role,
      emailAddress: memberEmail,
      sendNotificationEmail: true, // Sends email invite to the member
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to share folder: ${error}`);
  }

  console.log(`✅ Shared folder ${folderId} with ${memberEmail} (${role})`);
}

/**
 * Upload a note file to Drive folder
 */
export async function uploadNote(
  folderId: string,
  fileName: string,
  content: string
): Promise<DriveFile> {
  const token = await getAccessToken();

  // Ensure fileName ends with .md
  const finalFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;

  // Create metadata
  const metadata = {
    name: finalFileName,
    parents: [folderId],
    mimeType: 'text/markdown',
  };

  // Use multipart upload
  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: text/markdown\r\n\r\n' +
    content +
    close_delim;

  const response = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body: multipartRequestBody,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload file: ${error}`);
  }

  const file = await response.json();
  console.log(`✅ Uploaded file "${file.name}" (ID: ${file.id})`);
  return file;
}

/**
 * Update an existing file in Drive
 */
export async function updateNote(
  fileId: string,
  content: string
): Promise<DriveFile> {
  const token = await getAccessToken();

  const response = await fetch(
    `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/markdown',
      },
      body: content,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update file: ${error}`);
  }

  const file = await response.json();
  console.log(`✅ Updated file (ID: ${file.id})`);
  return file;
}

/**
 * Download a note from Drive
 */
export async function downloadNote(fileId: string): Promise<string> {
  const token = await getAccessToken();

  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to download file: ${error}`);
  }

  const content = await response.text();
  console.log(`✅ Downloaded file (ID: ${fileId})`);
  return content;
}

/**
 * List all files in a folder
 */
export async function listFolderFiles(folderId: string): Promise<DriveFile[]> {
  const token = await getAccessToken();

  const response = await fetch(
    `${DRIVE_API_BASE}/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&orderBy=modifiedTime desc`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list files: ${error}`);
  }

  const data = await response.json();
  console.log(`✅ Listed ${data.files?.length || 0} files from folder ${folderId}`);
  return data.files || [];
}

/**
 * Get folders shared with this user (finds team folders)
 */
export async function getSharedFolders(): Promise<DriveFolder[]> {
  const token = await getAccessToken();

  const response = await fetch(
    `${DRIVE_API_BASE}/files?q=mimeType='application/vnd.google-apps.folder'+and+sharedWithMe=true+and+trashed=false&fields=files(id,name,webViewLink,createdTime)&orderBy=createdTime desc`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get shared folders: ${error}`);
  }

  const data = await response.json();
  console.log(`✅ Found ${data.files?.length || 0} shared folders`);
  return data.files || [];
}

/**
 * Get folder metadata
 */
export async function getFolderMetadata(folderId: string): Promise<DriveFolder> {
  const token = await getAccessToken();

  const response = await fetch(
    `${DRIVE_API_BASE}/files/${folderId}?fields=id,name,webViewLink,createdTime`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get folder metadata: ${error}`);
  }

  return await response.json();
}

/**
 * Delete a file from Drive
 */
export async function deleteNote(fileId: string): Promise<void> {
  const token = await getAccessToken();

  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete file: ${error}`);
  }

  console.log(`✅ Deleted file (ID: ${fileId})`);
}

/**
 * Check if user has Drive access token
 */
export function hasDriverAccess(): boolean {
  const token = localStorage.getItem('google_access_token');
  const refreshToken = localStorage.getItem('google_refresh_token');
  return !!(token && refreshToken);
}

/**
 * Clear Drive tokens (on sign out)
 */
export function clearDriveTokens(): void {
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('google_refresh_token');
  localStorage.removeItem('google_token_expires_at');
  console.log('✅ Cleared Google Drive tokens');
}
