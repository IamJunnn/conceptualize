import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import SetupScreen from './components/SetupScreen'
import MainUI from './components/MainUI'
import TeamMainUI from './components/Team/TeamMainUI'
import LoginScreen from './components/Auth/LoginScreen'
import ModeSelectionScreen from './components/Auth/ModeSelectionScreen'
import TeamActionSelectionScreen from './components/Auth/TeamActionSelectionScreen'
import InviteAcceptScreen from './components/Auth/InviteAcceptScreen'
import CreateWorkspaceModal from './components/Workspace/CreateWorkspaceModal'
// TODO: Re-enable for full release
// import AIChat from './components/AI/AIChat'
import { DragDropProvider } from './contexts/DragDropContext'
import { GraphVisibilityProvider } from './contexts/GraphVisibilityContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { getAppMode, setAppMode, AppMode } from './services/appModeService'
import { getUserWorkspace, createWorkspace } from './services/workspaceService'
import {
  initializeDeepLinkListener,
  getPendingInvitation,
  acceptPendingInvitation,
  clearPendingInvitation,
  DeepLinkInvitation
} from './services/deepLinkService'
import './App.css'

// Import test helpers in development
if (import.meta.env.DEV) {
  import('./utils/testHelpers')
  import('./utils/clearData')
  import('./utils/resetForTesting')
}

function AppContent() {
  const { user, loading: authLoading } = useAuth()
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showSetup, setShowSetup] = useState(false)
  const [appMode, setAppModeState] = useState<AppMode>(null)
  const [modeLoading, setModeLoading] = useState(true)
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false)
  const [hasWorkspace, setHasWorkspace] = useState<boolean | null>(null)
  const [pendingInvitation, setPendingInvitation] = useState<DeepLinkInvitation | null>(null)
  const [teamAction, setTeamAction] = useState<'create' | 'join' | null>(null)

  // Check for app mode and saved root folder on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        // Check app mode first
        const mode = await getAppMode()
        setAppModeState(mode)
        setModeLoading(false)

        // If mode is selected, check for root folder
        if (mode) {
          const savedFolder = await invoke<string | null>('get_root_folder')
          if (savedFolder) {
            setRootPath(savedFolder)
          } else {
            setShowSetup(true)
          }
        }
      } catch (error) {
        console.error('Error initializing app:', error)
        setModeLoading(false)
      } finally {
        setIsLoading(false)
      }
    }

    initialize()
  }, [])

  // Initialize deep link listener on mount
  useEffect(() => {
    // Check for existing pending invitation
    const existing = getPendingInvitation()
    if (existing) {
      setPendingInvitation(existing)
      // Automatically switch to team mode
      setAppMode('team').then(() => setAppModeState('team'))
    }

    // Initialize deep link listener
    initializeDeepLinkListener((invitation) => {
      console.log('Received invitation via deep link:', invitation)
      setPendingInvitation(invitation)
      // Automatically switch to team mode
      setAppMode('team').then(() => setAppModeState('team'))
    })
  }, [])

  // Check if user has a workspace when they log in
  useEffect(() => {
    const checkWorkspace = async () => {
      if (user && appMode === 'team') {
        try {
          // If there's a pending invitation, accept it first
          if (pendingInvitation) {
            try {
              await acceptPendingInvitation(user.uid, user.email, user.displayName)
              setPendingInvitation(null)
              // Reload workspace after accepting invitation
              const workspace = await getUserWorkspace(user.uid)
              setHasWorkspace(!!workspace)
              return
            } catch (error) {
              console.error('Error accepting invitation:', error)
              alert('Failed to accept invitation. Please try again.')
              clearPendingInvitation()
              setPendingInvitation(null)
            }
          }

          const workspace = await getUserWorkspace(user.uid)
          setHasWorkspace(!!workspace)

          // If no workspace, show create workspace modal
          if (!workspace) {
            setShowCreateWorkspace(true)
          }
        } catch (error) {
          console.error('Error checking workspace:', error)
          setHasWorkspace(false)
        }
      }
    }

    checkWorkspace()
  }, [user, appMode, pendingInvitation])

  const handleFolderSelected = (path: string) => {
    setShowSetup(false)
    // Small delay to allow fade-out animation
    setTimeout(() => {
      setRootPath(path)
    }, 300)
  }

  const handleRootPathChange = (newPath: string) => {
    setRootPath(newPath)
  }

  const handleModeSelected = async (mode: 'local' | 'team') => {
    console.log('🎯 Mode selected:', mode)
    try {
      await setAppMode(mode)
      console.log('✅ App mode set successfully to:', mode)
      setAppModeState(mode)
      console.log('✅ App mode state updated to:', mode)
    } catch (error) {
      console.error('❌ Error setting app mode:', error)
    }
  }

  const handleBackToModeSelection = async () => {
    try {
      const { clearAppMode } = await import('./services/appModeService')
      await clearAppMode()
      setAppModeState(null)
    } catch (error) {
      console.error('Error clearing app mode:', error)
    }
  }

  const handleCreateWorkspace = async (workspaceName: string) => {
    if (!user) {
      throw new Error('User not authenticated')
    }

    try {
      await createWorkspace(
        workspaceName,
        user.uid,
        user.email,
        user.displayName
      )
      setHasWorkspace(true)
      setShowCreateWorkspace(false)
    } catch (error: any) {
      console.error('Error creating workspace:', error)
      throw error
    }
  }

  // Show loading state while checking mode, auth, and initial setup
  if (modeLoading || isLoading) {
    console.log('⏳ Loading... modeLoading:', modeLoading, 'isLoading:', isLoading)
    return (
      <div className="app">
        <div className="welcome-screen">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  console.log('🔍 Current state:', {
    appMode,
    user: user ? `${user.email} (${user.uid})` : null,
    authLoading,
    pendingInvitation
  })

  // Show invite accept screen if there's a pending invitation (before mode selection)
  if (pendingInvitation && !user) {
    return (
      <InviteAcceptScreen
        invitation={pendingInvitation}
        onSignIn={() => {
          // User will be redirected to login, invitation will be accepted after auth
        }}
        onCancel={() => {
          clearPendingInvitation()
          setPendingInvitation(null)
          setAppModeState(null)
        }}
      />
    )
  }

  // Show mode selection if no mode is set and no pending invitation
  if (!appMode) {
    console.log('📋 Showing mode selection screen (no app mode set)')
    return <ModeSelectionScreen onModeSelected={handleModeSelected} />
  }

  // Show team action selection if in team mode and no action chosen yet
  if (appMode === 'team' && !teamAction && !user) {
    console.log('🎯 Showing team action selection screen')
    return (
      <TeamActionSelectionScreen
        onCreateTeam={() => {
          console.log('✅ User chose to create a team')
          setTeamAction('create')
        }}
        onJoinTeam={() => {
          console.log('✅ User chose to join a team')
          setTeamAction('join')
        }}
        onBack={handleBackToModeSelection}
      />
    )
  }

  // Show login screen if in team mode, action chosen, and user is not authenticated
  if (appMode === 'team' && teamAction && !user && !authLoading) {
    console.log('🔐 Showing login screen (team mode, action chosen, no user)')
    return <LoginScreen onLoginSuccess={() => {}} onBack={() => setTeamAction(null)} />
  }

  // TEAM MODE: Show TeamMainUI (Google Drive based)
  if (appMode === 'team' && user) {
    console.log('👥 Showing TeamMainUI (team mode + authenticated user)')
    return <TeamMainUI user={user} />
  }

  // LOCAL MODE: Show setup screen if no root path is configured
  if (showSetup || !rootPath) {
    return <SetupScreen onFolderSelected={handleFolderSelected} />
  }

  // LOCAL MODE: Main application UI (file-based)
  return (
    <GraphVisibilityProvider>
      <DragDropProvider>
        <div className="app-transition fade-in">
          <MainUI rootPath={rootPath} onRootPathChange={handleRootPathChange} />
          {/* <AIChat rootPath={rootPath} /> */}

          {/* Show create workspace modal if user is authenticated but has no workspace */}
          {showCreateWorkspace && user && (
            <CreateWorkspaceModal
              onClose={() => setShowCreateWorkspace(false)}
              onCreate={handleCreateWorkspace}
            />
          )}
        </div>
      </DragDropProvider>
    </GraphVisibilityProvider>
  )
}

// Wrap AppContent with AuthProvider
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
