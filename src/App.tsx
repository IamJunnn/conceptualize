import React, { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import SetupScreen from './components/SetupScreen'
import MainUI from './components/MainUI'
import './App.css'

function App() {
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showSetup, setShowSetup] = useState(false)

  // Check for saved root folder on mount
  useEffect(() => {
    const checkSavedFolder = async () => {
      try {
        const savedFolder = await invoke<string | null>('get_root_folder')
        if (savedFolder) {
          setRootPath(savedFolder)
        } else {
          setShowSetup(true)
        }
      } catch (error) {
        console.error('Error loading saved folder:', error)
        setShowSetup(true)
      } finally {
        setIsLoading(false)
      }
    }

    checkSavedFolder()
  }, [])

  const handleFolderSelected = (path: string) => {
    setShowSetup(false)
    // Small delay to allow fade-out animation
    setTimeout(() => {
      setRootPath(path)
    }, 300)
  }

  // Show loading state briefly
  if (isLoading) {
    return (
      <div className="app">
        <div className="welcome-screen">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  // Show setup screen if no root path is configured
  if (showSetup || !rootPath) {
    return (
      <div className={`app-transition ${showSetup && !rootPath ? 'fade-in' : 'fade-out'}`}>
        <SetupScreen onFolderSelected={handleFolderSelected} />
      </div>
    )
  }

  // Main application UI
  return (
    <div className="app-transition fade-in">
      <MainUI rootPath={rootPath} />
    </div>
  )
}

export default App
