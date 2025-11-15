import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export function UpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; date: string; body: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const checkForUpdates = async () => {
    try {
      setChecking(true);
      const update = await check();

      if (update) {
        setUpdateAvailable(true);
        setUpdateInfo({
          version: update.version,
          date: update.date,
          body: update.body || 'No release notes available.'
        });
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      setChecking(false);
    }
  };

  const downloadAndInstall = async () => {
    try {
      setDownloading(true);
      const update = await check();

      if (update) {
        await update.downloadAndInstall();
        // Relaunch the app to apply the update
        await relaunch();
      }
    } catch (error) {
      console.error('Failed to download and install update:', error);
      alert('Failed to install update. Please try again later.');
    } finally {
      setDownloading(false);
    }
  };

  // Check for updates on mount
  useEffect(() => {
    checkForUpdates();
  }, []);

  if (!updateAvailable) {
    return null; // Don't render anything if no update is available
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg p-4 max-w-md">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Update Available
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            Version {updateInfo?.version} is now available
          </p>
          {updateInfo?.body && (
            <details className="mt-2">
              <summary className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                What's new?
              </summary>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-line">
                {updateInfo.body}
              </p>
            </details>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={downloadAndInstall}
              disabled={downloading}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? 'Installing...' : 'Update Now'}
            </button>
            <button
              onClick={() => setUpdateAvailable(false)}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
