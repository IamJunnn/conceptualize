import React from 'react'
import { invoke } from '@tauri-apps/api/core'
import './SetupScreen.css'

interface SetupScreenProps {
  onFolderSelected: (path: string) => void
}

function SetupScreen({ onFolderSelected }: SetupScreenProps) {
  const handleChooseFolder = async () => {
    try {
      const selectedPath = await invoke<string | null>('select_folder')

      if (selectedPath) {
        // Save the selected path
        await invoke('save_root_folder', { folderPath: selectedPath })
        // Notify parent component
        onFolderSelected(selectedPath)
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
    }
  }

  return (
    <div className="setup-screen">
      <div className="setup-content">
        <div className="setup-title">
          <span>Welcome to </span>
          <img src="/main_logo.svg" alt="Conceptualize" className="setup-title-logo" />
        </div>
        <p className="setup-description">
          Choose a folder to store your knowledge base. This will be your Conceptualize root folder.
        </p>
        <button className="setup-button" onClick={handleChooseFolder}>
          Choose Your Conceptualize Folder
        </button>
      </div>
    </div>
  )
}

export default SetupScreen
