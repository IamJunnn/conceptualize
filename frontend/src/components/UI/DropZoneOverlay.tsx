import React, { useEffect } from 'react';
import { useDragDrop, DropZone } from '../../contexts/DragDropContext';
import './DropZoneOverlay.css';

interface DropZoneOverlayProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const EDGE_THRESHOLD = 200; // pixels from edge to trigger drop zone (increased for easier targeting)

export function DropZoneOverlay({ containerRef }: DropZoneOverlayProps) {
  const { draggedTab, dropZone, setDropZone } = useDragDrop();

  useEffect(() => {
    if (!draggedTab || !containerRef.current) {
      setDropZone(null);
      return;
    }

    // Handle mouse move events to update drop zone
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;

      // Check if cursor is over a tab bar (don't show drop zones when reordering tabs)
      const tabBar = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tab-bar');
      if (tabBar) {
        if (dropZone !== null) {
          setDropZone(null);
        }
        return;
      }

      // Determine which edge is closest - ONLY LEFT/RIGHT
      let newZone: DropZone | null = null;

      // Only left and right edges
      if (x < EDGE_THRESHOLD) {
        newZone = 'left';
      } else if (x > width - EDGE_THRESHOLD) {
        newZone = 'right';
      }
      // If not near left or right edge, set to null (no zone)

      if (newZone !== dropZone) {
        setDropZone(newZone);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [draggedTab, dropZone, setDropZone, containerRef]);

  // Only render if actively dragging
  if (!draggedTab) return null;

  return (
    <div className="drop-zone-overlay">
      {dropZone === 'left' && <div className="drop-zone-indicator left" />}
      {dropZone === 'right' && <div className="drop-zone-indicator right" />}
    </div>
  );
}
