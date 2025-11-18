import { createContext, useContext, useState, ReactNode } from 'react';

export type EditorPane = 'left' | 'right';
export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center';

export interface DraggedTab {
  filePath: string;
  fileName: string;
  sourcePane?: EditorPane; // undefined for single pane mode
  id?: string; // Google Drive file ID for team mode
}

interface DragDropContextType {
  draggedTab: DraggedTab | null;
  setDraggedTab: (tab: DraggedTab | null) => void;
  dropZone: DropZone | null;
  setDropZone: (zone: DropZone | null) => void;
  targetPane: EditorPane | null;
  setTargetPane: (pane: EditorPane | null) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
}

const DragDropContext = createContext<DragDropContextType | undefined>(undefined);

export function DragDropProvider({ children }: { children: ReactNode }) {
  const [draggedTab, setDraggedTab] = useState<DraggedTab | null>(null);
  const [dropZone, setDropZone] = useState<DropZone | null>(null);
  const [targetPane, setTargetPane] = useState<EditorPane | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  return (
    <DragDropContext.Provider
      value={{
        draggedTab,
        setDraggedTab,
        dropZone,
        setDropZone,
        targetPane,
        setTargetPane,
        isDragging,
        setIsDragging,
      }}
    >
      {children}
    </DragDropContext.Provider>
  );
}

export function useDragDrop() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDrop must be used within DragDropProvider');
  }
  return context;
}
