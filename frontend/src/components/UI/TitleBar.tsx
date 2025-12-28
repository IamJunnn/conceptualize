import { useState, useRef, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { FileText } from 'lucide-react'
import './TitleBar.css'

interface SearchResult {
  filePath: string
  fileName: string
  line?: number
  lineContent?: string
}

interface TitleBarProps {
  onSearchResultClick: (filePath: string, fileName: string, line?: number) => void
  onGuideOpen?: (guideName: 'shortcuts' | 'markdown') => void
  rootPath: string
}

function TitleBar({ onSearchResultClick, onGuideOpen, rootPath }: TitleBarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const appWindow = getCurrentWindow()

  // Handle window controls
  const handleMinimize = () => {
    appWindow.minimize()
  }

  const handleMaximize = async () => {
    const maximized = await appWindow.isMaximized()
    if (maximized) {
      appWindow.unmaximize()
      setIsMaximized(false)
    } else {
      appWindow.maximize()
      setIsMaximized(true)
    }
  }

  const handleClose = () => {
    appWindow.close()
  }

  // Check initial maximized state and listen for changes
  useEffect(() => {
    const checkMaximized = async () => {
      const maximized = await appWindow.isMaximized()
      setIsMaximized(maximized)
    }

    checkMaximized()

    // Listen for window state changes
    const unlisten = appWindow.onResized(async () => {
      const maximized = await appWindow.isMaximized()
      setIsMaximized(maximized)
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [appWindow])

  // Handle search
  useEffect(() => {
    const handleSearch = async () => {
      const trimmedQuery = searchQuery.trim()

      if (trimmedQuery === '') {
        setSearchResults([])
        setShowDropdown(false)
        return
      }

      // Require at least 2 characters
      if (trimmedQuery.length < 2) {
        setSearchResults([])
        setShowDropdown(false)
        return
      }

      setIsSearching(true)
      setShowDropdown(true)

      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const rawResults = await invoke<any[]>('search_files', {
          rootPath,
          query: trimmedQuery
        })

        // Convert snake_case from Rust to camelCase for TypeScript
        const results: SearchResult[] = rawResults.map(r => ({
          filePath: r.file_path,
          fileName: r.file_name,
          line: r.line,
          lineContent: r.line_content,
        }))

        setSearchResults(results)
      } catch (error) {
        console.error('Search error:', error)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }

    const debounceTimer = setTimeout(handleSearch, 300)
    return () => clearTimeout(debounceTimer)
  }, [searchQuery, rootPath])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+P or Ctrl+Shift+F to focus search
      if ((e.ctrlKey && e.key === 'p') || (e.ctrlKey && e.shiftKey && e.key === 'F')) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      // Escape to close dropdown
      if (e.key === 'Escape') {
        setShowDropdown(false)
        searchInputRef.current?.blur()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.titlebar-search-container')) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleResultClick = (result: SearchResult) => {
    // Convert relative path back to absolute path
    const separator = rootPath.includes('\\') ? '\\' : '/'
    const absolutePath = result.filePath.startsWith(rootPath)
      ? result.filePath
      : `${rootPath}${separator}${result.filePath}`

    onSearchResultClick(absolutePath, result.fileName, result.line)
    setShowDropdown(false)
    setSearchQuery('')
  }

  const handleGuideClick = (guideName: 'shortcuts' | 'markdown') => {
    if (onGuideOpen) {
      onGuideOpen(guideName)
    }
    setShowDropdown(false)
    setSearchQuery('')
  }

  // Determine what to show in dropdown
  const shouldShowQuickActions = showDropdown && searchQuery.trim().length < 2 && !isSearching
  const shouldShowSearchResults = showDropdown && searchQuery.trim().length >= 2

  return (
    <div className="titlebar">
      {/* Logo */}
      <div className="titlebar-logo">
        <img src="/logo.svg" alt="Conceptualize" />
      </div>

      {/* Drag Region (left) - uses native Tauri drag for 1:1 performance */}
      <div
        className="titlebar-drag-region"
        data-tauri-drag-region
        onDoubleClick={handleMaximize}
      ></div>

      {/* Search Bar */}
      <div className="titlebar-search-container">
        <input
          ref={searchInputRef}
          type="text"
          className="titlebar-search-input"
          placeholder="Search files by name or content (min 2 chars, Ctrl+P)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setShowDropdown(true)}
        />

        {/* Search Dropdown */}
        {showDropdown && (
          <div className="titlebar-search-dropdown">
            {shouldShowQuickActions ? (
              <div className="search-quick-actions">
                <div
                  className="quick-action-item"
                  onClick={() => handleGuideClick('shortcuts')}
                >
                  <FileText size={14} className="file-icon" />
                  <span className="file-name">Shortcuts.md</span>
                </div>
                <div
                  className="quick-action-item"
                  onClick={() => handleGuideClick('markdown')}
                >
                  <FileText size={14} className="file-icon" />
                  <span className="file-name">Note Syntax.md</span>
                </div>
              </div>
            ) : shouldShowSearchResults ? (
              isSearching ? (
                <div className="search-loading">
                  <div className="loading-spinner"></div>
                  <span>Searching...</span>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="search-results">
                  {searchResults.map((result, index) => (
                    <div
                      key={`${result.filePath}-${index}`}
                      className="search-result-item"
                      onClick={() => handleResultClick(result)}
                    >
                      <div className="result-filename">{result.fileName}</div>
                      <div className="result-path">{result.filePath}</div>
                      {result.lineContent && (
                        <div className="result-line">
                          <span className="line-number">Line {result.line}:</span>
                          <span className="line-content">{result.lineContent}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="search-no-results">
                  <span>No results found</span>
                </div>
              )
            ) : null}
          </div>
        )}
      </div>

      {/* Drag Region (right) - uses native Tauri drag for 1:1 performance */}
      <div
        className="titlebar-drag-region-right"
        data-tauri-drag-region
        onDoubleClick={handleMaximize}
      ></div>

      {/* Window Controls - using onPointerUp for better Mac trackpad support */}
      <div className="titlebar-controls">
        <button
          className="titlebar-button minimize"
          onPointerUp={(e) => { e.stopPropagation(); handleMinimize(); }}
          title="Minimize"
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <rect x="2" y="6" width="10" height="2" fill="currentColor" />
          </svg>
        </button>
        <button
          className="titlebar-button maximize"
          onPointerUp={(e) => { e.stopPropagation(); handleMaximize(); }}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            // Restore icon - two separate windows
            <svg width="14" height="14" viewBox="0 0 14 14">
              <g fill="none" stroke="currentColor" strokeWidth="1.2">
                <rect x="1.5" y="3.5" width="5" height="5" />
                <rect x="7.5" y="5.5" width="5" height="5" />
              </g>
            </svg>
          ) : (
            // Maximize icon - single square
            <svg width="14" height="14" viewBox="0 0 14 14">
              <rect x="2" y="2" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>

        <button
          className="titlebar-button close"
          onPointerUp={(e) => { e.stopPropagation(); handleClose(); }}
          title="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default TitleBar
