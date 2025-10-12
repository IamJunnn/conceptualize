import { useState, useRef, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './TitleBar.css'

interface SearchResult {
  filePath: string
  fileName: string
  line?: number
  lineContent?: string
  matchType: 'filename' | 'content'
}

interface TitleBarProps {
  onSearchResultClick: (filePath: string, fileName: string, line?: number) => void
  rootPath: string
}

function TitleBar({ onSearchResultClick, rootPath }: TitleBarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const appWindow = getCurrentWindow()

  // Handle window controls
  const handleMinimize = () => {
    appWindow.minimize()
  }

  const handleMaximize = async () => {
    const isMaximized = await appWindow.isMaximized()
    if (isMaximized) {
      appWindow.unmaximize()
    } else {
      appWindow.maximize()
    }
  }

  const handleClose = () => {
    appWindow.close()
  }

  // Handle dragging
  const handleDragStart = () => {
    appWindow.startDragging()
  }

  // Handle search
  useEffect(() => {
    const handleSearch = async () => {
      if (searchQuery.trim() === '') {
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
          query: searchQuery.trim()
        })

        // Convert snake_case from Rust to camelCase for TypeScript
        const results: SearchResult[] = rawResults.map(r => ({
          filePath: r.file_path,
          fileName: r.file_name,
          line: r.line,
          lineContent: r.line_content,
          matchType: r.match_type
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

  return (
    <div className="titlebar">
      {/* Logo */}
      <div className="titlebar-logo">
        <img src="/logo.svg" alt="Conceptualize" />
      </div>

      {/* Drag Region (left) */}
      <div className="titlebar-drag-region" data-tauri-drag-region onMouseDown={handleDragStart}></div>

      {/* Search Bar */}
      <div className="titlebar-search-container">
        <input
          ref={searchInputRef}
          type="text"
          className="titlebar-search-input"
          placeholder="Search files by name or content (Ctrl+P)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => searchQuery.trim() !== '' && setShowDropdown(true)}
        />

        {/* Search Dropdown */}
        {showDropdown && (
          <div className="titlebar-search-dropdown">
            {isSearching ? (
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
            )}
          </div>
        )}
      </div>

      {/* Drag Region (right) */}
      <div className="titlebar-drag-region-right" data-tauri-drag-region onMouseDown={handleDragStart}></div>

      {/* Window Controls */}
      <div className="titlebar-controls">
        <button className="titlebar-button minimize" onClick={handleMinimize} title="Minimize">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="0" y="5" width="12" height="2" fill="currentColor" />
          </svg>
        </button>
        <button className="titlebar-button maximize" onClick={handleMaximize} title="Maximize">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <button className="titlebar-button close" onClick={handleClose} title="Close">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M1 1 L11 11 M11 1 L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default TitleBar
