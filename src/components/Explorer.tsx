import './Explorer.css'

interface ExplorerProps {
  rootPath: string
}

function Explorer({ rootPath }: ExplorerProps) {
  return (
    <div className="explorer">
      <div className="explorer-header">
        <h3>Explorer</h3>
      </div>
      <div className="explorer-content">
        <div className="root-folder">
          <div className="folder-icon">📁</div>
          <div className="folder-info">
            <div className="folder-name">{rootPath.split(/[\\\/]/).pop()}</div>
          </div>
        </div>
        <div className="empty-state">
          <p>No files yet</p>
          <p className="hint">Create your first note to get started</p>
        </div>
      </div>
    </div>
  )
}

export default Explorer

