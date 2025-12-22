import { useEffect, useState } from 'react';
import { Download, X, Sparkles, Loader2, ExternalLink } from 'lucide-react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { open } from '@tauri-apps/plugin-shell';

const MANUAL_DOWNLOAD_URL = 'https://conceptualize-c9a41.web.app/downloads/conceptualize_1.0.5_x64-setup.exe';
const UPDATE_CHECK_URL = 'https://conceptualize-c9a41.web.app/updates/latest.json';

// Compare semantic versions: returns true if v1 > v2
function isNewerVersion(v1: string, v2: string): boolean {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return true;
    if (p1 < p2) return false;
  }
  return false;
}

export function UpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; date: string; body: string } | null>(null);
  const [, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [manualUpdateRequired, setManualUpdateRequired] = useState(false);

  const checkForUpdates = async () => {
    try {
      setChecking(true);
      const update = await check();

      if (update) {
        setUpdateAvailable(true);
        setUpdateInfo({
          version: update.version,
          date: update.date || '',
          body: update.body || 'Bug fixes and performance improvements.'
        });
      }
    } catch (error: any) {
      console.error('Failed to check for updates:', error);

      // If update check fails for any reason (including signature verification),
      // check if there's actually a newer version available and prompt for manual download
      try {
        const response = await fetch(UPDATE_CHECK_URL);
        const data = await response.json();
        const currentVersion = await import('@tauri-apps/api/app').then(m => m.getVersion());

        // Compare versions to see if update is available
        if (data.version && data.version !== currentVersion && isNewerVersion(data.version, currentVersion)) {
          console.log('Manual update available:', data.version, 'Current:', currentVersion);
          setManualUpdateRequired(true);
          setUpdateAvailable(true);
          setUpdateInfo({
            version: data.version,
            date: data.pub_date || '',
            body: data.notes || 'Bug fixes and performance improvements.'
          });
        }
      } catch (fetchError) {
        console.error('Failed to fetch update info:', fetchError);
      }
    } finally {
      setChecking(false);
    }
  };

  const downloadAndInstall = async () => {
    try {
      setDownloading(true);
      setProgress(0);
      const update = await check();

      if (update) {
        // Download with progress tracking
        let downloaded = 0;
        let total = 0;
        await update.downloadAndInstall((event: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => {
          if (event.event === 'Started' && event.data?.contentLength) {
            total = event.data.contentLength;
            setProgress(0);
          } else if (event.event === 'Progress' && event.data?.chunkLength) {
            downloaded += event.data.chunkLength;
            if (total > 0) {
              setProgress(Math.round((downloaded / total) * 100));
            }
          } else if (event.event === 'Finished') {
            setProgress(100);
          }
        });
        // Relaunch the app to apply the update
        await relaunch();
      }
    } catch (error) {
      console.error('Failed to download and install update:', error);
      setDownloading(false);
      setProgress(0);
    }
  };

  const openManualDownload = async () => {
    try {
      await open(MANUAL_DOWNLOAD_URL);
    } catch (error) {
      console.error('Failed to open download URL:', error);
      // Fallback: try window.open
      window.open(MANUAL_DOWNLOAD_URL, '_blank');
    }
  };

  // Check for updates on mount
  useEffect(() => {
    // Small delay to let the app fully load first
    const timer = setTimeout(() => {
      checkForUpdates();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  if (!updateAvailable) {
    return null;
  }

  return (
    <div className="update-modal-overlay">
      <div className="update-modal">
        {/* Header */}
        <div className="update-modal-header">
          <div className="update-icon">
            <Sparkles size={24} />
          </div>
          <div className="update-title-section">
            <h2>Update Available</h2>
            <p className="update-version">Version {updateInfo?.version}</p>
          </div>
          {!downloading && (
            <button
              className="update-close-btn"
              onClick={() => setUpdateAvailable(false)}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="update-modal-content">
          <p className="update-message">
            {manualUpdateRequired
              ? 'A new version of Conceptualize is available! Please download and install manually to get the latest features.'
              : 'A new version of Conceptualize is available! Update now to get the latest features and improvements.'
            }
          </p>

          {updateInfo?.body && (
            <div className="update-notes">
              <h4>What's new:</h4>
              <p>{updateInfo.body}</p>
            </div>
          )}

          {manualUpdateRequired && (
            <div className="update-manual-notice">
              <p>This update requires a one-time manual download. Future updates will be automatic.</p>
            </div>
          )}

          {downloading && !manualUpdateRequired && (
            <div className="update-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="progress-text">
                {progress < 100 ? 'Downloading update...' : 'Installing...'}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="update-modal-actions">
          {manualUpdateRequired ? (
            <>
              <button
                className="update-later-btn"
                onClick={() => setUpdateAvailable(false)}
              >
                Remind me later
              </button>
              <button
                className="update-now-btn"
                onClick={openManualDownload}
              >
                <ExternalLink size={16} />
                Download Update
              </button>
            </>
          ) : !downloading ? (
            <>
              <button
                className="update-later-btn"
                onClick={() => setUpdateAvailable(false)}
              >
                Remind me later
              </button>
              <button
                className="update-now-btn"
                onClick={downloadAndInstall}
              >
                <Download size={16} />
                Update Now
              </button>
            </>
          ) : (
            <button className="update-now-btn" disabled>
              <Loader2 size={16} className="spinning" />
              {progress < 100 ? 'Downloading...' : 'Installing...'}
            </button>
          )}
        </div>
      </div>

      <style>{`
        .update-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .update-modal {
          background: #2a2a2a;
          border: 1px solid #3d3d3d;
          border-radius: 12px;
          width: 90%;
          max-width: 420px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          animation: slideUp 0.3s ease-out;
          overflow: hidden;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .update-modal-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px;
          background: linear-gradient(135deg, rgba(100, 200, 202, 0.1) 0%, rgba(196, 79, 196, 0.1) 100%);
          border-bottom: 1px solid #3d3d3d;
        }

        .update-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: linear-gradient(135deg, #64c8ca, #c44fc4);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          flex-shrink: 0;
        }

        .update-title-section {
          flex: 1;
        }

        .update-title-section h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #e0e0e0;
        }

        .update-version {
          margin: 4px 0 0 0;
          font-size: 13px;
          color: #64c8ca;
          font-weight: 500;
        }

        .update-close-btn {
          background: transparent;
          border: none;
          color: #888;
          cursor: pointer;
          padding: 8px;
          border-radius: 6px;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .update-close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #e0e0e0;
        }

        .update-modal-content {
          padding: 20px;
        }

        .update-message {
          margin: 0 0 16px 0;
          font-size: 14px;
          color: #ccc;
          line-height: 1.5;
        }

        .update-notes {
          background: #333;
          border-radius: 8px;
          padding: 12px 14px;
          margin-bottom: 16px;
        }

        .update-notes h4 {
          margin: 0 0 8px 0;
          font-size: 12px;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .update-notes p {
          margin: 0;
          font-size: 13px;
          color: #ccc;
          line-height: 1.5;
          white-space: pre-line;
        }

        .update-manual-notice {
          background: rgba(255, 193, 7, 0.1);
          border: 1px solid rgba(255, 193, 7, 0.3);
          border-radius: 8px;
          padding: 12px 14px;
          margin-bottom: 16px;
        }

        .update-manual-notice p {
          margin: 0;
          font-size: 12px;
          color: #ffc107;
          line-height: 1.5;
        }

        .update-progress {
          margin-top: 16px;
        }

        .progress-bar {
          height: 6px;
          background: #333;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #64c8ca, #c44fc4);
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .progress-text {
          font-size: 12px;
          color: #888;
        }

        .update-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 16px 20px;
          border-top: 1px solid #3d3d3d;
          background: #252525;
        }

        .update-later-btn {
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 500;
          color: #aaa;
          background: transparent;
          border: 1px solid #444;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .update-later-btn:hover {
          background: #333;
          border-color: #555;
          color: #e0e0e0;
        }

        .update-now-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          font-size: 13px;
          font-weight: 500;
          color: #fff;
          background: linear-gradient(135deg, #64c8ca, #52b6b8);
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .update-now-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(100, 200, 202, 0.3);
        }

        .update-now-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
