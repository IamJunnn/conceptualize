/**
 * Team Notes Sync Service
 * Handles syncing notes between local storage and Google Drive
 */

import {
  uploadNote,
  downloadNote,
  listFolderFiles,
  updateNote,
  deleteNote,
  DriveFile
} from './googleDriveService';
import { getErrorMessage } from '../utils/errorUtils';

export interface TeamNote {
  id: string; // Drive file ID
  name: string;
  content: string;
  modifiedTime: Date;
  webViewLink?: string;
}

/**
 * List all notes in a team folder
 */
export async function listTeamNotes(folderId: string): Promise<TeamNote[]> {
  try {
    const files = await listFolderFiles(folderId);

    // Filter for markdown files only
    const markdownFiles = files.filter(
      file => file.name.endsWith('.md') || file.mimeType === 'text/markdown'
    );

    // Download content for each note
    const notes: TeamNote[] = await Promise.all(
      markdownFiles.map(async (file) => {
        try {
          const content = await downloadNote(file.id);
          return {
            id: file.id,
            name: file.name,
            content,
            modifiedTime: new Date(file.modifiedTime),
            webViewLink: file.webViewLink,
          };
        } catch (error) {
          console.error(`Failed to download note ${file.name}:`, error);
          // Return partial data if download fails
          return {
            id: file.id,
            name: file.name,
            content: `Error loading note: ${error}`,
            modifiedTime: new Date(file.modifiedTime),
            webViewLink: file.webViewLink,
          };
        }
      })
    );

    // Sort by modified time (newest first)
    notes.sort((a, b) => b.modifiedTime.getTime() - a.modifiedTime.getTime());

    console.log(`✅ Loaded ${notes.length} notes from folder ${folderId}`);
    return notes;
  } catch (error) {
    console.error('Failed to list team notes:', error);
    throw new Error(`Failed to list notes: ${getErrorMessage(error)}`);
  }
}

/**
 * Create a new note in team folder
 */
export async function createTeamNote(
  folderId: string,
  fileName: string,
  content: string
): Promise<TeamNote> {
  try {
    const file = await uploadNote(folderId, fileName, content);

    return {
      id: file.id,
      name: file.name,
      content,
      modifiedTime: new Date(),
      webViewLink: file.webViewLink,
    };
  } catch (error) {
    console.error('Failed to create team note:', error);
    throw new Error(`Failed to create note: ${getErrorMessage(error)}`);
  }
}

/**
 * Update an existing note
 */
export async function updateTeamNote(
  fileId: string,
  content: string
): Promise<void> {
  try {
    await updateNote(fileId, content);
    console.log(`✅ Updated note ${fileId}`);
  } catch (error) {
    console.error('Failed to update team note:', error);
    throw new Error(`Failed to update note: ${getErrorMessage(error)}`);
  }
}

/**
 * Delete a note from team folder
 */
export async function deleteTeamNote(fileId: string): Promise<void> {
  try {
    await deleteNote(fileId);
    console.log(`✅ Deleted note ${fileId}`);
  } catch (error) {
    console.error('Failed to delete team note:', error);
    throw new Error(`Failed to delete note: ${getErrorMessage(error)}`);
  }
}

/**
 * Sync local note to Drive
 * If the note exists (has fileId), update it
 * If it's new, create it
 */
export async function syncNoteToTeam(
  folderId: string,
  fileName: string,
  content: string,
  existingFileId?: string
): Promise<TeamNote> {
  try {
    if (existingFileId) {
      // Update existing note
      await updateTeamNote(existingFileId, content);
      return {
        id: existingFileId,
        name: fileName,
        content,
        modifiedTime: new Date(),
      };
    } else {
      // Create new note
      return await createTeamNote(folderId, fileName, content);
    }
  } catch (error) {
    console.error('Failed to sync note to team:', error);
    throw new Error(`Failed to sync note: ${getErrorMessage(error)}`);
  }
}

/**
 * Get file metadata from Drive without downloading content
 */
export async function getTeamNotesList(folderId: string): Promise<DriveFile[]> {
  try {
    const files = await listFolderFiles(folderId);

    // Filter for markdown files only
    const markdownFiles = files.filter(
      file => file.name.endsWith('.md') || file.mimeType === 'text/markdown'
    );

    return markdownFiles;
  } catch (error) {
    console.error('Failed to get team notes list:', error);
    throw new Error(`Failed to get notes list: ${getErrorMessage(error)}`);
  }
}
