// Utility functions for managing important notes

const IMPORTANT_NOTES_KEY = 'importantNotes';

export function getImportantNotes(): Set<string> {
  const stored = localStorage.getItem(IMPORTANT_NOTES_KEY);
  if (stored) {
    try {
      return new Set(JSON.parse(stored));
    } catch (e) {
      return new Set();
    }
  }
  return new Set();
}

export function isImportantNote(filePath: string): boolean {
  const importantNotes = getImportantNotes();
  return importantNotes.has(filePath);
}

export function toggleImportantNote(filePath: string): boolean {
  const importantNotes = getImportantNotes();

  if (importantNotes.has(filePath)) {
    importantNotes.delete(filePath);
  } else {
    importantNotes.add(filePath);
  }

  localStorage.setItem(IMPORTANT_NOTES_KEY, JSON.stringify(Array.from(importantNotes)));

  return importantNotes.has(filePath);
}

export function markAsImportant(filePath: string): void {
  const importantNotes = getImportantNotes();
  importantNotes.add(filePath);
  localStorage.setItem(IMPORTANT_NOTES_KEY, JSON.stringify(Array.from(importantNotes)));
}

export function unmarkAsImportant(filePath: string): void {
  const importantNotes = getImportantNotes();
  importantNotes.delete(filePath);
  localStorage.setItem(IMPORTANT_NOTES_KEY, JSON.stringify(Array.from(importantNotes)));
}
