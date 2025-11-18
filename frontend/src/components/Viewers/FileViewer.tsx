import EditorTabMilkdown from '../Editor/EditorTabMilkdown'
import PdfViewer from './PdfViewer'
import ImageViewer from './ImageViewer'
import WordViewer from './WordViewer'
import ExcelViewer from './ExcelViewer'
import PowerPointViewer from './PowerPointViewer'
import { TeamDriveStorage } from '../../services/teamDriveStorage'

interface FileViewerProps {
  filePath: string
  fileName: string
  // Optional props for markdown files
  rootPath?: string
  fileId?: string // Google Drive file ID (for team mode)
  onOpenFile?: (filePath: string, fileName: string) => void
  onFileCreated?: () => void
  onFileRenamed?: (oldPath: string, newPath: string, newName: string) => void
  onPaneActivate?: () => void // Callback to activate the pane when editor is clicked
  editorId?: string // Unique ID for autocomplete scoping
  isActive?: boolean
  storageBackend?: TeamDriveStorage // For team mode
}

type FileType = 'markdown' | 'text' | 'pdf' | 'image' | 'word' | 'excel' | 'powerpoint' | 'unknown'

function getFileType(fileName: string): FileType {
  const ext = fileName.toLowerCase().split('.').pop()

  if (ext === 'md') return 'markdown'
  if (ext === 'txt') return 'text'
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'bmp', 'ico'].includes(ext || '')) {
    return 'image'
  }
  if (['doc', 'docx'].includes(ext || '')) {
    return 'word'
  }
  if (['xls', 'xlsx'].includes(ext || '')) {
    return 'excel'
  }
  if (['ppt', 'pptx'].includes(ext || '')) {
    return 'powerpoint'
  }

  return 'unknown'
}

function FileViewer({ filePath, fileName, rootPath, fileId, onOpenFile, onFileCreated, onFileRenamed, onPaneActivate, editorId, isActive, storageBackend }: FileViewerProps) {
  const fileType = getFileType(fileName)

  switch (fileType) {
    case 'markdown':
    case 'text':
      return (
        <EditorTabMilkdown
          filePath={filePath}
          fileName={fileName}
          rootPath={rootPath}
          fileId={fileId}
          onOpenFile={onOpenFile}
          onFileCreated={onFileCreated}
          onFileRenamed={onFileRenamed}
          onPaneActivate={onPaneActivate}
          editorId={editorId}
          isActive={isActive}
          storageBackend={storageBackend}
        />
      )

    case 'pdf':
      return <PdfViewer filePath={filePath} fileName={fileName} rootPath={rootPath} />

    case 'image':
      return <ImageViewer filePath={filePath} fileName={fileName} rootPath={rootPath} />

    case 'word':
      return <WordViewer filePath={filePath} fileName={fileName} rootPath={rootPath} />

    case 'excel':
      return <ExcelViewer filePath={filePath} fileName={fileName} rootPath={rootPath} />

    case 'powerpoint':
      return <PowerPointViewer filePath={filePath} fileName={fileName} rootPath={rootPath} />

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
