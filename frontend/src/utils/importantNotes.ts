// Utility functions for managing important notes

import { getLocalStorage, setLocalStorage } from '../hooks/useLocalStorage';

const IMPORTANT_NOTES_KEY = 'importantNotes';

export function getImportantNotes(): Set<string> {
  const stored = getLocalStorage<string[]>(IMPORTANT_NOTES_KEY, []);
  return new Set(stored);
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

  setLocalStorage(IMPORTANT_NOTES_KEY, Array.from(importantNotes));
  return importantNotes.has(filePath);
}

export function markAsImportant(filePath: string): void {
  const importantNotes = getImportantNotes();
  importantNotes.add(filePath);
  setLocalStorage(IMPORTANT_NOTES_KEY, Array.from(importantNotes));
}

export function unmarkAsImportant(filePath: string): void {
  const importantNotes = getImportantNotes();
  importantNotes.delete(filePath);
  setLocalStorage(IMPORTANT_NOTES_KEY, Array.from(importantNotes));
}
