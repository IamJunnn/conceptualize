import React from 'react';
import { Keyboard, Lightbulb, Pencil, Mouse } from 'lucide-react';

const ShortcutsGuide: React.FC = () => {
  return (
    <>
      <div className="help-section">
        <div className="help-section-title">
          <Keyboard size={16} className="help-section-icon" />
          File Operations
        </div>
        <div className="help-item">
          <div className="help-item-key">Ctrl+P</div>
          <div className="help-item-description">Open file search</div>
        </div>
        <div className="help-item">
          <div className="help-item-key">Ctrl+Shift+F</div>
          <div className="help-item-description">Search files by name or content</div>
        </div>
        <div className="help-item">
          <div className="help-item-key">Ctrl+W</div>
          <div className="help-item-description">Close active tab</div>
        </div>
        <div className="help-item">
          <div className="help-item-key">Ctrl+\</div>
          <div className="help-item-description">Toggle split view</div>
        </div>
      </div>

      <div className="help-section">
        <div className="help-section-title">
          <Pencil size={16} className="help-section-icon" />
          Text Editing
        </div>
        <div className="help-item">
          <div className="help-item-key">Ctrl+B</div>
          <div className="help-item-description">Bold selected text</div>
        </div>
        <div className="help-item">
          <div className="help-item-key">Ctrl+I</div>
          <div className="help-item-description">Italic selected text</div>
        </div>
        <div className="help-item">
          <div className="help-item-key">Ctrl+K</div>
          <div className="help-item-description">Insert link</div>
        </div>
      </div>

      <div className="help-section">
        <div className="help-section-title">
          <Mouse size={16} className="help-section-icon" />
          Mouse Actions
        </div>
        <div className="help-item">
          <div className="help-item-key">Right-click</div>
          <div className="help-item-description">Open context menu (files, folders, graph nodes)</div>
        </div>
        <div className="help-item">
          <div className="help-item-key">Ctrl+Click</div>
          <div className="help-item-description">Follow wiki-link or external link</div>
        </div>
        <div className="help-item">
          <div className="help-item-key">Drag & Drop</div>
          <div className="help-item-description">Move files between folders in sidebar</div>
        </div>
        <div className="help-item">
          <div className="help-item-key">Drag Tab</div>
          <div className="help-item-description">Move tab to create split view</div>
        </div>
      </div>

      <div className="help-section">
        <div className="help-section-title">
          <span className="help-section-icon">🎨</span>
          Graph View
        </div>
        <div className="help-item">
          <div className="help-item-key">Click Node</div>
          <div className="help-item-description">Highlight connected nodes and links</div>
        </div>
        <div className="help-item">
          <div className="help-item-key">Double-click</div>
          <div className="help-item-description">Open file in editor</div>
        </div>
        <div className="help-item">
          <div className="help-item-key">Right-click</div>
          <div className="help-item-description">Show node options (hide from graph, rename, delete, etc.)</div>
        </div>
        <div className="help-item">
          <div className="help-item-key">Drag Node</div>
          <div className="help-item-description">Reposition node in graph</div>
        </div>
        <div className="help-item">
          <div className="help-item-key">Scroll</div>
          <div className="help-item-description">Zoom in/out</div>
        </div>
        <div className="help-item">
          <div className="help-item-key">Click Background</div>
          <div className="help-item-description">Clear node selection</div>
        </div>
      </div>

      <div className="help-tip">
        <div className="help-tip-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Lightbulb size={16} /> Pro Tip
        </div>
        <div className="help-tip-content">
          Press <strong>ESC</strong> to close any modal or dropdown in the app!
        </div>
      </div>
    </>
  );
};

export default ShortcutsGuide;
