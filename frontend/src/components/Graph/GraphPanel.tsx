import React from 'react';
import { X } from 'lucide-react';
import GraphView from './GraphView';
import { TeamDriveStorage } from '../../services/teamDriveStorage';
import './GraphPanel.css';

interface GraphPanelProps {
  onClose: () => void;
  rootPath: string;
  graphKey?: number;
  onFileOpen?: (filePath: string, fileName: string) => void;
  onNodeContextMenu?: (event: React.MouseEvent, node: any) => void;
  onCreateNote?: () => void;
  onCreateFolder?: () => void;
  storageBackend?: TeamDriveStorage;
}

const GraphPanel: React.FC<GraphPanelProps> = ({
  onClose,
  rootPath,
  graphKey,
  onFileOpen,
  onNodeContextMenu,
  onCreateNote,
  onCreateFolder,
  storageBackend
}) => {
  return (
    <div className="graph-panel-overlay" onClick={onClose}>
      <div className="graph-panel" onClick={(e) => e.stopPropagation()}>
        <button className="graph-panel-close" onClick={onClose} title="Close Graph">
          <X size={20} />
        </button>
        <GraphView
          key={graphKey}
          rootPath={rootPath}
          onFileOpen={(path, name) => {
            if (onFileOpen) {
              onFileOpen(path, name);
              onClose();
            }
          }}
          onNodeContextMenu={onNodeContextMenu}
          onCreateNote={onCreateNote}
          onCreateFolder={onCreateFolder}
          storageBackend={storageBackend}
        />
      </div>
    </div>
  );
};

export default GraphPanel;
