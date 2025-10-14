import EditorTabMilkdown from './EditorTabMilkdown'
import PdfViewer from './PdfViewer'
import ImageViewer from './ImageViewer'

interface FileViewerProps {
  filePath: string
  fileName: string
  // Optional props for markdown files
  rootPath?: string
  onOpenFile?: (filePath: string, fileName: string) => void
  onFileCreated?: () => void
  onFileRenamed?: (oldPath: string, newPath: string, newName: string) => void
  onPaneActivate?: () => void // Callback to activate the pane when editor is clicked
  editorId?: string // Unique ID for autocomplete scoping
  isActive?: boolean
}

type FileType = 'markdown' | 'text' | 'pdf' | 'image' | 'unknown'

function getFileType(fileName: string): FileType {
  const ext = fileName.toLowerCase().split('.').pop()

  if (ext === 'md') return 'markdown'
  if (ext === 'txt') return 'text'
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'bmp', 'ico'].includes(ext || '')) {
    return 'image'
  }

  return 'unknown'
}

function FileViewer({ filePath, fileName, rootPath, onOpenFile, onFileCreated, onFileRenamed, onPaneActivate, editorId, isActive }: FileViewerProps) {
  const fileType = getFileType(fileName)

  switch (fileType) {
    case 'markdown':
    case 'text':
      return (
        <EditorTabMilkdown
          filePath={filePath}
          fileName={fileName}
          rootPath={rootPath}
          onOpenFile={onOpenFile}
          onFileCreated={onFileCreated}
          onFileRenamed={onFileRenamed}
          onPaneActivate={onPaneActivate}
          editorId={editorId}
          isActive={isActive}
        />
      )

    case 'pdf':
      return <PdfViewer filePath={filePath} fileName={fileName} rootPath={rootPath} />

    case 'image':
      return <ImageViewer filePath={filePath} fileName={fileName} rootPath={rootPath} />

    case 'unknown':
    default:
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#666',
          fontSize: '14px'
        }}>
          <p>Cannot preview this file type: {fileName}</p>
        </div>
      )
  }
}

export default FileViewer
