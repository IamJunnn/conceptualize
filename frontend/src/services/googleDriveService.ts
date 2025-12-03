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

  console.log(`📤 Sharing folder ${folderId} with ${memberEmail} as ${role}...`);

  const response = await fetch(`${DRIVE_API_BASE}/files/${folderId}/permissions?supportsAllDrives=true`, {
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
    console.error(`❌ Failed to share folder ${folderId}:`, error);
    throw new Error(`Failed to share folder: ${error}`);
  }

  const result = await response.json();
  console.log(`✅ Shared folder ${folderId} - permission ID: ${result.id}`);
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
 * Check if the current user has access to a specific folder
 */
export async function checkFolderAccess(folderId: string): Promise<boolean> {
  try {
    const token = await getAccessToken();

    // Try to get folder metadata - this will fail if no access
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.ok) {
      console.log(`✅ User has access to folder ${folderId}`);
      return true;
    } else if (response.status === 404 || response.status === 403) {
      console.log(`❌ User does not have access to folder ${folderId}`);
      return false;
    } else {
      console.warn(`⚠️ Unexpected response when checking folder access: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('Failed to check folder access:', error);
    return false;
  }
}

/**
 * Comprehensive diagnostic for team folder permissions
 */
export async function diagnoseFolderPermissions(folderId: string, userEmail: string): Promise<{
  hasAccess: boolean;
  folderExists: boolean;
  permissions: DrivePermission[];
  userPermission: DrivePermission | null;
  sharedWithMe: boolean;
  issues: string[];
  recommendations: string[];
}> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let hasAccess = false;
  let folderExists = false;
  let permissions: DrivePermission[] = [];
  let userPermission: DrivePermission | null = null;
  let sharedWithMe = false;

  try {
    const token = await getAccessToken();

    // 1. Check if folder exists and user has access
    const folderResponse = await fetch(
      `${DRIVE_API_BASE}/files/${folderId}?fields=id,name,mimeType,ownedByMe,shared,sharingUser&supportsAllDrives=true`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (folderResponse.ok) {
      folderExists = true;
      hasAccess = true;
      const folderData = await folderResponse.json();
      sharedWithMe = !folderData.ownedByMe && folderData.shared;

      console.log('📁 Folder metadata:', folderData);

      // 2. Get permissions list
      const permissionsResponse = await fetch(
        `${DRIVE_API_BASE}/files/${folderId}/permissions?fields=permissions(id,type,role,emailAddress)&supportsAllDrives=true`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (permissionsResponse.ok) {
        const permData = await permissionsResponse.json();
        permissions = permData.permissions || [];

        // Find user's specific permission
        userPermission = permissions.find(p =>
          p.emailAddress?.toLowerCase() === userEmail.toLowerCase()
        ) || null;

        console.log('🔐 Permissions:', permissions);
        console.log('👤 User permission:', userPermission);

        if (!userPermission) {
          issues.push(`No explicit permission found for ${userEmail}`);
          if (sharedWithMe) {
            issues.push('Folder appears shared but no specific permission found');
          }
        } else if (userPermission.role === 'reader') {
          issues.push('User has read-only access (should have writer access)');
          recommendations.push('Team owner should update permission to "writer" role');
        }
      } else {
        issues.push(`Failed to fetch permissions (${permissionsResponse.status})`);
      }

      // 3. Check if folder appears in "shared with me"
      const sharedCheckResponse = await fetch(
        `${DRIVE_API_BASE}/files?q='${folderId}'+in+parents+and+sharedWithMe=true&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!sharedCheckResponse.ok || (await sharedCheckResponse.json()).files?.length === 0) {
        if (!sharedWithMe) {
          issues.push('Folder not appearing in "Shared with me" section');
          recommendations.push('Ask team owner to re-share the folder');
        }
      }

    } else if (folderResponse.status === 404) {
      folderExists = false;
      issues.push('Folder not found or no access');

      // Try to search for the folder in shared items
      console.log('🔍 Searching for folder in shared items...');
      try {
        const searchResponse = await fetch(
          `${DRIVE_API_BASE}/files?q=mimeType='application/vnd.google-apps.folder'+and+sharedWithMe=true&fields=files(id,name)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          console.log('📂 Shared folders found:', searchData.files?.map((f: any) => ({ id: f.id, name: f.name })));

          const matchingFolder = searchData.files?.find((f: any) => f.id === folderId);
          if (matchingFolder) {
            console.log('✅ Found folder in shared items:', matchingFolder);
            issues.push('Folder exists in shared items but direct access failed');
            recommendations.push('Try refreshing the page');
          } else {
            console.log('❌ Folder ID not found in shared folders');
            recommendations.push('The folder may not be shared with your account yet');
            recommendations.push('Ask team owner to click "Re-share Contents" in Team Settings');
          }
        }
      } catch (searchErr) {
        console.error('Search failed:', searchErr);
      }

      recommendations.push('Primary issue: No access to team folder');
      recommendations.push('Verify the folder ID is correct');
      recommendations.push('Ask team owner to share the folder with you');
      recommendations.push('Try signing out and back in with Google');
      recommendations.push('Contact team owner to verify invitation was sent to: ' + userEmail);
    } else if (folderResponse.status === 403) {
      folderExists = true; // Likely exists but no permission
      issues.push('Access denied to folder');
      recommendations.push('Ask team owner to share the folder with your email: ' + userEmail);
      recommendations.push('Make sure you\'re signed in with the correct Google account');
    }

    // 4. Additional checks
    if (hasAccess) {
      // Try to list files to verify read access
      const listResponse = await fetch(
        `${DRIVE_API_BASE}/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!listResponse.ok) {
        issues.push('Cannot list folder contents despite having folder access');
        recommendations.push('Permission might be incomplete - ask owner to re-share');
      }
    }

  } catch (error) {
    console.error('Diagnostic error:', error);
    issues.push(`Diagnostic failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Generate final recommendations
  if (issues.length === 0) {
    recommendations.push('All permissions look good!');
  } else {
    if (!hasAccess) {
      recommendations.unshift('Primary issue: No access to team folder');
    }
    recommendations.push('Try signing out and back in with Google');
    recommendations.push('Contact team owner to verify invitation was sent to: ' + userEmail);
  }

  return {
    hasAccess,
    folderExists,
    permissions,
    userPermission,
    sharedWithMe,
    issues,
    recommendations
  };
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
 * Tries multiple query strategies to handle different sharing scenarios:
 * 1. Default query (works for most shared folders)
 * 2. allDrives corpora (for Shared Drives)
 */
export async function listFolderFiles(folderId: string): Promise<DriveFile[]> {
  const token = await getAccessToken();

  console.log('[listFolderFiles] 📂 Listing files in folder:', folderId);

  const query = `'${folderId}'+in+parents+and+trashed=false`;
  const fields = 'files(id,name,mimeType,modifiedTime,size,webViewLink,parents)';

  // Try multiple approaches to handle different sharing scenarios
  const approaches = [
    // Approach 1: Default user corpora (works for regular shared folders)
    {
      name: 'default',
      url: `${DRIVE_API_BASE}/files?q=${query}&fields=${fields}&orderBy=modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true`
    },
    // Approach 2: allDrives corpora (for Shared Drives)
    {
      name: 'allDrives',
      url: `${DRIVE_API_BASE}/files?q=${query}&fields=${fields}&orderBy=modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`
    },
  ];

  for (const approach of approaches) {
    console.log(`[listFolderFiles] 🔍 Trying ${approach.name} approach...`);

    const response = await fetch(approach.url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log(`[listFolderFiles] 📡 ${approach.name} response:`, response.status, response.statusText);

    if (response.ok) {
      const data = await response.json();
      const files = data.files || [];

      console.log(`[listFolderFiles] 📊 ${approach.name} found ${files.length} items`);

      if (files.length > 0) {
        console.log('[listFolderFiles] 📁 Files:', files.map((f: DriveFile) => `${f.name} (${f.mimeType})`));
        return files;
      }
      // If empty, try next approach
    } else if (response.status !== 400) {
      // Log non-400 errors but continue to next approach
      const error = await response.text();
      console.warn(`[listFolderFiles] ⚠️ ${approach.name} failed:`, error);
    }
  }

  // All approaches returned empty or failed
  console.log('[listFolderFiles] ℹ️ No files found with any approach (folder may be empty)');
  return [];
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
    `${DRIVE_API_BASE}/files/${folderId}?fields=id,name,webViewLink,createdTime&supportsAllDrives=true`,
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
