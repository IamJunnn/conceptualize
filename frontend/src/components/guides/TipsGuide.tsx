import React from 'react';
import { Target, Lightbulb, Flame, BarChart3, Link2 } from 'lucide-react';

const TipsGuide: React.FC = () => {
  return (
    <>
      <div className="help-section">
        <div className="help-section-title">
          <Target size={16} className="help-section-icon" />
          Getting Started
        </div>
        <ul className="help-list">
          <li><strong>Create your first note:</strong> Click "New Note" button in the sidebar or use the context menu</li>
          <li><strong>Connect your ideas:</strong> Use [[wiki links]] to link notes together</li>
          <li><strong>Visualize connections:</strong> Switch to Graph view to see how your notes are connected</li>
          <li><strong>Organize with folders:</strong> Right-click in sidebar to create folders and organize your notes</li>
        </ul>
      </div>

      <div className="help-section">
        <div className="help-section-title">
          <Lightbulb size={16} className="help-section-icon" />
          Pro Tips
        </div>
        <ul className="help-list">
          <li><strong>Hide from graph:</strong> Right-click any file or folder and select "Hide from Graph" to declutter your visualization</li>
          <li><strong>Split view:</strong> Press Ctrl+\ or drag a tab to the edge to work on two notes side-by-side</li>
          <li><strong>Quick search:</strong> Press Ctrl+P to quickly find and open any file</li>
          <li><strong>Drag to organize:</strong> Drag files in the sidebar to move them between folders</li>
          <li><strong>Auto-save:</strong> Your notes save automatically - no need to press Ctrl+S!</li>
        </ul>
      </div>

      <div className="help-section">
        <div className="help-section-title">
          <Flame size={16} className="help-section-icon" />
          Power Features
        </div>

        <div className="help-example">
          <div className="help-example-title"><BarChart3 size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />Graph View Interactions</div>
          <div className="help-example-content">
            <ul className="help-list">
              <li>Click a node to highlight its connections</li>
              <li>Double-click to open the note</li>
              <li>Right-click for quick actions</li>
              <li>Drag nodes to organize your graph layout</li>
              <li>Scroll to zoom in/out</li>
            </ul>
          </div>
        </div>

        <div className="help-example">
          <div className="help-example-title"><Link2 size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />Smart Linking</div>
          <div className="help-example-content">
            <ul className="help-list">
              <li>Type [[Note Name]] to link to existing notes</li>
              <li>Link to non-existent notes to create them automatically</li>
              <li>Ctrl+Click any link to follow it</li>
              <li>Links appear as connections in the graph</li>
            </ul>
          </div>
        </div>

        <div className="help-example">
          <div className="help-example-title">⚡ Context Menus</div>
          <div className="help-example-content">
            <ul className="help-list">
              <li>Right-click files in sidebar for file operations</li>
              <li>Right-click folders to create new notes/folders inside</li>
              <li>Right-click graph nodes for quick actions</li>
              <li>Access "Reveal in File Explorer" to open the folder</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="help-section">
        <div className="help-section-title">
          <span className="help-section-icon">🎨</span>
          Organization Tips
        </div>
        <ul className="help-list">
          <li><strong>Use folders for projects:</strong> Create a folder for each major project or area</li>
          <li><strong>Create index notes:</strong> Make "Table of Contents" notes with links to related notes</li>
          <li><strong>Tag with folders:</strong> Use folder structure as your tagging system</li>
          <li><strong>Hide archived content:</strong> Keep old notes but hide them from the graph to reduce clutter</li>
        </ul>
      </div>

      <div className="help-section">
        <div className="help-section-title">
          <span className="help-section-icon">🚀</span>
          Workflow Ideas
        </div>

        <div className="help-example">
          <div className="help-example-title">Daily Notes Workflow</div>
          <div className="help-example-content">
            Create a "Daily Notes" folder and add a note for each day. Link to other notes as you reference them. Your graph will show how your daily work connects to your projects.
          </div>
        </div>

        <div className="help-example">
          <div className="help-example-title">Project Management</div>
          <div className="help-example-content">
            Create a folder for each project. Add a main "Project Overview" note with [[links]] to task notes, meeting notes, and resources. Use the graph to see project scope.
          </div>
        </div>

        <div className="help-example">
          <div className="help-example-title">Learning & Research</div>
          <div className="help-example-content">
            Create atomic notes (one concept per note) and link them together. The graph becomes your "second brain" showing connections between concepts.
          </div>
        </div>
      </div>

      <div className="help-tip">
        <div className="help-tip-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Lightbulb size={16} /> Remember
        </div>
        <div className="help-tip-content">
          The power of Conceptualize comes from <strong>linking your thoughts</strong>. Don't just create isolated notes - connect them with [[wiki links]] and watch your knowledge graph grow!
        </div>
      </div>
    </>
  );
};

export default TipsGuide;
