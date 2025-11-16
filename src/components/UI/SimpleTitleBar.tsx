// Simple Title Bar for auth screens - just window controls
import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './SimpleTitleBar.css';

function SimpleTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  // Check initial maximized state
  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
  }, [appWindow]);

  const handleMinimize = () => {
    appWindow.minimize();
  };

  const handleMaximize = async () => {
    const maximized = await appWindow.isMaximized();
    if (maximized) {
      appWindow.unmaximize();
      setIsMaximized(false);
    } else {
      appWindow.maximize();
      setIsMaximized(true);
    }
  };

  const handleClose = () => {
    appWindow.close();
  };

  return (
    <div className="simple-title-bar" data-tauri-drag-region>
      <div className="simple-title-bar-title" data-tauri-drag-region>
        Conceptualize
      </div>

      <div className="simple-title-bar-controls">
        <button
          className="simple-title-bar-button minimize"
          onClick={handleMinimize}
          title="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="0" y="5" width="12" height="2" fill="currentColor" />
          </svg>
        </button>

        <button
          className="simple-title-bar-button maximize"
          onClick={handleMaximize}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="2.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
              <rect x="0.5" y="2.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>

        <button
          className="simple-title-bar-button close"
          onClick={handleClose}
          title="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path
              d="M1 1L11 11M11 1L1 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default SimpleTitleBar;
