/**
 * Google Drive API Service
 * Handles folder creation, sharing, file upload/download for team collaboration
 */

import { getAccessToken as getStoredAccessToken, refreshAccessToken as refreshStoredToken, isTokenExpired, hasTokens, clearTokens } from './tokenStorage';

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
  parents?: string[]; // Parent folder IDs
}

export interface DrivePermission {
  id: string;
  type: 'user' | 'group' | 'domain' | 'anyone';
  role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
  emailAddress?: string;
}

/**
 * Get access token from storage with automatic refresh
 */
async function getAccessToken(): Promise<string> {
  // Check if token is expired and refresh if needed
  if (isTokenExpired()) {
    console.log('🔄 Token expired, refreshing...');
    try {
      return await refreshStoredToken();
    } catch (error) {
      console.error('❌ Failed to refresh token:', error);
      throw new Error('Authentication expired. Please sign in again.');
    }
  }

  const token = getStoredAccessToken();
  if (!token) {
    throw new Error('Not authenticated with Google Drive. Please sign in again.');
  }
  return token;
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
  return folder;
}

/**
 * Create a subfolder inside a parent folder
 */
export async function createSubfolder(
  parentFolderId: string,
  folderName: string
): Promise<DriveFolder> {
  const token = await getAccessToken();

  const response = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create subfolder: ${error}`);
  }

  const folder = await response.json();
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
      sendNotificationEmail: false, // Don't send individual emails for each file
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to share folder: ${error}`);
  }
}

/**
 * Recursively share a folder and all its contents with a team member
 * Uses batch API to reduce email spam
 */
export async function shareFolderRecursively(
  folderId: string,
  memberEmail: string,
  role: 'reader' | 'writer' | 'commenter' = 'writer'
): Promise<void> {
  console.log(`📤 Recursively sharing folder ${folderId} with ${memberEmail}...`);
  const token = await getAccessToken();

  // Get all files and subfolders
  const allFiles = await listAllFilesRecursive(folderId);
  console.log(`📊 Found ${allFiles.length} items to share (plus parent folder)`);

  // Add parent folder to the list
  const allItems = [{ id: folderId, name: 'Parent Folder' }, ...allFiles];

  // Batch process in groups of 100 (Google's batch limit)
  const BATCH_SIZE = 100;
  let totalShared = 0;

  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    const batch = allItems.slice(i, i + BATCH_SIZE);
    console.log(`📤 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allItems.length / BATCH_SIZE)} (${batch.length} items)...`);

    // Create multipart batch request
    const boundary = 'batch_' + Math.random().toString(36).substring(7);
    let batchBody = '';

    batch.forEach((item, index) => {
      const permissionRequest = {
        type: 'user',
        role: role,
        emailAddress: memberEmail,
        sendNotificationEmail: false,
      };

      batchBody += `--${boundary}\r\n`;
      batchBody += `Content-Type: application/http\r\n`;
      batchBody += `Content-ID: <item${index}>\r\n\r\n`;
      batchBody += `POST /drive/v3/files/${item.id}/permissions HTTP/1.1\r\n`;
      batchBody += `Content-Type: application/json\r\n`;
      batchBody += `Host: www.googleapis.com\r\n\r\n`;
      batchBody += JSON.stringify(permissionRequest) + '\r\n';
    });

    batchBody += `--${boundary}--`;

    try {
      const response = await fetch('https://www.googleapis.com/batch/drive/v3', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/mixed; boundary=${boundary}`,
        },
        body: batchBody,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`⚠️ Batch request returned ${response.status}:`, error);
        throw new Error(`Batch request failed: ${response.status}`);
      }

      // Parse batch response to check individual operation results
      const responseText = await response.text();
      console.log(`📝 Batch response (first 500 chars):`, responseText.substring(0, 500));

      // Count successful operations by checking for "200 OK" in response parts
      const successCount = (responseText.match(/HTTP\/\d\.\d 200/g) || []).length;
      const failureCount = batch.length - successCount;

      if (failureCount > 0) {
        console.warn(`⚠️ Batch partially failed: ${successCount} succeeded, ${failureCount} failed`);
        console.log(`📄 Full batch response for debugging:`, responseText);

        // Fallback to individual sharing for failed items
        console.log(`🔄 Falling back to individual sharing for ${batch.length} items...`);
        for (const item of batch) {
          try {
            await shareFolder(item.id, memberEmail, role);
            totalShared++;
            console.log(`✅ Individually shared: ${item.name}`);
          } catch (err) {
            console.warn(`⚠️ Failed to share ${item.name}:`, err);
          }
        }
      } else {
        totalShared += batch.length;
        console.log(`✅ Batch shared ${totalShared}/${allItems.length} items successfully`);
      }
    } catch (error) {
      console.error(`❌ Batch request failed:`, error);

      // Fallback to individual sharing
      console.log(`🔄 Falling back to individual sharing for ${batch.length} items...`);
      for (const item of batch) {
        try {
          await shareFolder(item.id, memberEmail, role);
          totalShared++;
          console.log(`✅ Individually shared: ${item.name}`);
        } catch (err) {
          console.warn(`⚠️ Failed to share ${item.name}:`, err);
        }
      }
    }
  }

  console.log(`✅ Recursively shared folder and ${totalShared} items with ${memberEmail}`);
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
  return content;
}

/**
 * List all files in a folder
 */
export async function listFolderFiles(folderId: string): Promise<DriveFile[]> {
  const token = await getAccessToken();

  console.log('[listFolderFiles] 📂 Listing files in folder:', folderId);

  const query = `'${folderId}'+in+parents+and+trashed=false`;
  const url = `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink,parents)&orderBy=modifiedTime desc`;

  console.log('[listFolderFiles] 🔍 API URL:', url);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  console.log('[listFolderFiles] 📡 Response status:', response.status, response.statusText);

  if (!response.ok) {
    const error = await response.text();
    console.error('[listFolderFiles] ❌ Failed to list files:', error);
    throw new Error(`Failed to list files: ${error}`);
  }

  const data = await response.json();
  console.log('[listFolderFiles] ✅ Response data:', data);
  console.log('[listFolderFiles] 📊 Found', (data.files || []).length, 'items');

  if (data.files && data.files.length > 0) {
    console.log('[listFolderFiles] 📁 Files:', data.files.map((f: DriveFile) => `${f.name} (${f.mimeType})`));
  }

  return data.files || [];
}

/**
 * Recursively list all files in a folder and its subfolders
 */
export async function listAllFilesRecursive(folderId: string): Promise<DriveFile[]> {
  const allFiles: DriveFile[] = [];
  const token = await getAccessToken();

  async function listFolder(currentFolderId: string) {
    const files = await listFolderFiles(currentFolderId);

    for (const file of files) {
      allFiles.push(file);

      // If it's a folder, recursively list its contents
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        await listFolder(file.id);
      }
    }
  }

  await listFolder(folderId);
  return allFiles;
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
 * Rename a file in Drive
 */
export async function renameFile(fileId: string, newName: string): Promise<void> {
  const token = await getAccessToken();

  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: newName,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to rename file: ${error}`);
  }
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
}

/**
 * Move a file to a different folder
 */
export async function moveFile(
  fileId: string,
  newParentFolderId: string,
  currentParentFolderId?: string
): Promise<void> {
  const token = await getAccessToken();

  // Build query params to add new parent and optionally remove old parent
  const params = new URLSearchParams({
    addParents: newParentFolderId,
  });

  if (currentParentFolderId) {
    params.append('removeParents', currentParentFolderId);
  }

  const response = await fetch(
    `${DRIVE_API_BASE}/files/${fileId}?${params.toString()}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to move file: ${error}`);
  }
}

/**
 * Check if user has Drive access token
 */
export function hasDriverAccess(): boolean {
  return hasTokens();
}

/**
 * Clear Drive tokens (on sign out)
 */
export function clearDriveTokens(): void {
  clearTokens();
}
