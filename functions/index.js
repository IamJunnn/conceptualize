/**
 * Cloud Functions for Conceptualize Team Storage
 *
 * This backend service uses Firebase Cloud Storage to manage team file storage,
 * allowing any authenticated user to access their team's files without needing
 * individual Google Drive OAuth tokens.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

/**
 * Middleware to verify Firebase Auth token and extract user info
 */
async function authenticateUser(req, res) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
    return null;
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
    return null;
  }
}

/**
 * Verify user has access to the specified team
 */
async function verifyTeamAccess(userEmail, teamId) {
  const teamRef = db.collection('teams').doc(teamId);
  const teamDoc = await teamRef.get();

  if (!teamDoc.exists) {
    return { hasAccess: false, error: 'Team not found' };
  }

  const teamData = teamDoc.data();
  const memberEmails = teamData.memberEmails || [];

  const isMember = memberEmails.includes(userEmail);

  if (!isMember) {
    return { hasAccess: false, error: 'User is not a member of this team' };
  }

  return { hasAccess: true, team: teamData };
}

/**
 * GET /api/teams/:teamId/files
 * List all files in a team's Cloud Storage folder
 */
exports.listTeamFiles = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Authenticate user
    const user = await authenticateUser(req, res);
    if (!user) return;

    const teamId = req.params[0]?.split('/')[0]; // Extract teamId from path

    if (!teamId) {
      return res.status(400).json({ error: 'Team ID is required' });
    }

    // Verify team access
    const accessCheck = await verifyTeamAccess(user.email, teamId);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }

    try {
      const bucket = storage.bucket();
      const prefix = `teams/${teamId}/`;

      // List files in the team's folder
      const [files] = await bucket.getFiles({
        prefix: prefix,
        delimiter: '/', // Only get files in this directory level
      });

      const fileList = files
        .filter(file => file.name !== prefix) // Exclude the folder itself
        .map(file => ({
          id: file.id,
          name: file.name.replace(prefix, ''),
          fullPath: file.name,
          size: parseInt(file.metadata.size || 0),
          contentType: file.metadata.contentType,
          timeCreated: file.metadata.timeCreated,
          updated: file.metadata.updated,
        }));

      return res.status(200).json({ files: fileList });
    } catch (error) {
      console.error('Error listing files:', error);
      return res.status(500).json({ error: 'Failed to list files' });
    }
  });
});

/**
 * GET /api/teams/:teamId/files/:fileName
 * Get content of a specific file
 */
exports.getTeamFile = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Authenticate user
    const user = await authenticateUser(req, res);
    if (!user) return;

    const pathParts = req.params[0]?.split('/');
    const teamId = pathParts[0];
    const fileName = pathParts.slice(2).join('/'); // files/:fileName

    if (!teamId || !fileName) {
      return res.status(400).json({ error: 'Team ID and file name are required' });
    }

    // Verify team access
    const accessCheck = await verifyTeamAccess(user.email, teamId);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }

    try {
      const bucket = storage.bucket();
      const filePath = `teams/${teamId}/${fileName}`;
      const file = bucket.file(filePath);

      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Get file content
      const [fileBuffer] = await file.download();
      const content = fileBuffer.toString('utf-8');

      return res.status(200).json({
        content: content,
        metadata: {
          name: fileName,
          size: fileBuffer.length,
        }
      });
    } catch (error) {
      console.error('Error getting file:', error);
      return res.status(500).json({ error: 'Failed to get file' });
    }
  });
});

/**
 * POST /api/teams/:teamId/files
 * Create or update a file in the team's Cloud Storage folder
 */
exports.saveTeamFile = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Authenticate user
    const user = await authenticateUser(req, res);
    if (!user) return;

    const teamId = req.params[0]?.split('/')[0];
    const { fileName, content, filePath } = req.body;

    if (!teamId || !fileName) {
      return res.status(400).json({ error: 'Team ID and fileName are required' });
    }

    // Verify team access
    const accessCheck = await verifyTeamAccess(user.email, teamId);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }

    try {
      const bucket = storage.bucket();
      const fullPath = filePath || `teams/${teamId}/${fileName}`;
      const file = bucket.file(fullPath);

      // Save the file
      await file.save(content || '', {
        metadata: {
          contentType: 'text/markdown',
          metadata: {
            lastModifiedBy: user.email,
            lastModified: new Date().toISOString(),
          }
        }
      });

      return res.status(200).json({
        success: true,
        filePath: fullPath,
        fileName: fileName,
        message: 'File saved successfully'
      });
    } catch (error) {
      console.error('Error saving file:', error);
      return res.status(500).json({ error: 'Failed to save file' });
    }
  });
});

/**
 * DELETE /api/teams/:teamId/files/:fileName
 * Delete a file from the team's Cloud Storage folder
 */
exports.deleteTeamFile = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'DELETE') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Authenticate user
    const user = await authenticateUser(req, res);
    if (!user) return;

    const pathParts = req.params[0]?.split('/');
    const teamId = pathParts[0];
    const fileName = pathParts.slice(2).join('/'); // files/:fileName

    if (!teamId || !fileName) {
      return res.status(400).json({ error: 'Team ID and file name are required' });
    }

    // Verify team access
    const accessCheck = await verifyTeamAccess(user.email, teamId);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }

    try {
      const bucket = storage.bucket();
      const filePath = `teams/${teamId}/${fileName}`;
      const file = bucket.file(filePath);

      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Delete the file
      await file.delete();

      return res.status(200).json({
        success: true,
        message: 'File deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting file:', error);
      return res.status(500).json({ error: 'Failed to delete file' });
    }
  });
});

/**
 * POST /api/teams/:teamId/files/tree
 * Get complete file tree structure
 */
exports.getTeamFileTree = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Authenticate user
    const user = await authenticateUser(req, res);
    if (!user) return;

    const teamId = req.params[0]?.split('/')[0];

    if (!teamId) {
      return res.status(400).json({ error: 'Team ID is required' });
    }

    // Verify team access
    const accessCheck = await verifyTeamAccess(user.email, teamId);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }

    try {
      const bucket = storage.bucket();
      const prefix = `teams/${teamId}/`;

      // Get all files with the team prefix
      const [files] = await bucket.getFiles({
        prefix: prefix,
      });

      // Build tree structure
      const tree = [];
      const processedPaths = new Set();

      files.forEach(file => {
        const relativePath = file.name.replace(prefix, '');
        if (!relativePath) return; // Skip the folder itself

        const parts = relativePath.split('/');
        let currentLevel = tree;

        parts.forEach((part, index) => {
          const isFile = index === parts.length - 1;
          const currentPath = parts.slice(0, index + 1).join('/');

          if (!processedPaths.has(currentPath)) {
            const item = {
              id: file.id,
              name: part,
              type: isFile ? 'file' : 'folder',
              path: currentPath,
            };

            if (!isFile) {
              item.children = [];
            } else {
              item.size = parseInt(file.metadata.size || 0);
              item.modifiedTime = file.metadata.updated;
            }

            currentLevel.push(item);
            processedPaths.add(currentPath);

            if (!isFile) {
              const folderItem = currentLevel.find(i => i.name === part && i.type === 'folder');
              currentLevel = folderItem.children;
            }
          } else if (!isFile) {
            const folderItem = currentLevel.find(i => i.name === part && i.type === 'folder');
            currentLevel = folderItem.children;
          }
        });
      });

      return res.status(200).json({ tree });
    } catch (error) {
      console.error('Error getting file tree:', error);
      return res.status(500).json({ error: 'Failed to get file tree' });
    }
  });
});

/**
 * POST /api/teams/:teamId/folders
 * Create a new folder in the team's Cloud Storage
 */
exports.createTeamFolder = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Authenticate user
    const user = await authenticateUser(req, res);
    if (!user) return;

    const teamId = req.params[0]?.split('/')[0];
    const { folderName, parentPath } = req.body;

    if (!teamId || !folderName) {
      return res.status(400).json({ error: 'Team ID and folderName are required' });
    }

    // Verify team access
    const accessCheck = await verifyTeamAccess(user.email, teamId);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ error: accessCheck.error });
    }

    try {
      const bucket = storage.bucket();
      const basePath = parentPath
        ? `teams/${teamId}/${parentPath}/${folderName}`
        : `teams/${teamId}/${folderName}`;

      // Create a placeholder file to represent the folder
      const placeholderPath = `${basePath}/.keep`;
      const file = bucket.file(placeholderPath);

      await file.save('', {
        metadata: {
          contentType: 'text/plain',
          metadata: {
            isPlaceholder: 'true',
            createdBy: user.email,
            createdAt: new Date().toISOString(),
          }
        }
      });

      return res.status(201).json({
        success: true,
        folderPath: basePath,
        folderName: folderName,
        message: 'Folder created successfully'
      });
    } catch (error) {
      console.error('Error creating folder:', error);
      return res.status(500).json({ error: 'Failed to create folder' });
    }
  });
});

/**
 * POST /api/create-team-storage
 * Initialize Cloud Storage structure for a new team
 * This is called when a new team is created
 */
exports.createTeamStorage = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Authenticate user
    const user = await authenticateUser(req, res);
    if (!user) return;

    const { teamId, teamName } = req.body;

    if (!teamId || !teamName) {
      return res.status(400).json({ error: 'teamId and teamName are required' });
    }

    try {
      const bucket = storage.bucket();

      // Create the team's root folder with a placeholder file
      const teamPath = `teams/${teamId}/.keep`;
      const file = bucket.file(teamPath);

      await file.save('', {
        metadata: {
          contentType: 'text/plain',
          metadata: {
            teamName: teamName,
            createdBy: user.email,
            createdAt: new Date().toISOString(),
            isPlaceholder: 'true'
          }
        }
      });

      // Create default folders structure
      const defaultFolders = ['notes', 'shared', 'archive'];

      for (const folder of defaultFolders) {
        const folderPath = `teams/${teamId}/${folder}/.keep`;
        const folderFile = bucket.file(folderPath);

        await folderFile.save('', {
          metadata: {
            contentType: 'text/plain',
            metadata: {
              isPlaceholder: 'true',
              folderType: folder,
              createdBy: user.email,
              createdAt: new Date().toISOString(),
            }
          }
        });
      }

      console.log(`✅ Created team storage structure for: ${teamName} (ID: ${teamId})`);

      return res.status(201).json({
        success: true,
        teamId: teamId,
        teamName: teamName,
        storagePath: `teams/${teamId}`,
        message: 'Team storage created successfully in Cloud Storage'
      });
    } catch (error) {
      console.error('Error creating team storage:', error);
      return res.status(500).json({ error: 'Failed to create team storage', details: error.message });
    }
  });
});