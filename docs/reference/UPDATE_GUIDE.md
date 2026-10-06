# How to Update Conceptualize

## Automatic Updates (Recommended)

Starting with v0.1.0, Conceptualize includes an automatic update checker:

1. **Notification**: When a new version is available, you'll see a notification in the bottom-right corner of the app
2. **Review Changes**: Click "What's new?" to see release notes
3. **Install**: Click "Update Now" to download and install the update
4. **Relaunch**: The app will automatically restart with the new version

Your data and settings are preserved during updates.

## Manual Updates

If you prefer to update manually or if automatic updates aren't working:

### Option 1: Run the New Installer
1. Go to [GitHub Releases](https://github.com/IamJunnn/conceptualize/releases)
2. Download the latest `conceptualize_x.x.x_x64-setup.exe` file
3. Run the installer
4. The new version will be installed over the old one
5. Your data and settings will be preserved

### Option 2: Portable Installation
If you're using a portable installation:
1. Download the new release
2. Extract to a new folder
3. Copy your data from `%APPDATA%\com.conceptualize.app\` (optional, as data is stored separately)

## What Gets Updated

When you update Conceptualize:

✅ **Preserved:**
- Your notes folder (never touched by the app)
- App settings (stored in `%APPDATA%\com.conceptualize.app\config.json`)
- Todo lists (stored in `%APPDATA%\com.conceptualize.app\todos.json`)
- Archived todos (stored in `%APPDATA%\com.conceptualize.app\todo-archive.json`)

✅ **Updated:**
- Application binary and UI
- Bug fixes and performance improvements
- New features

## Checking Your Current Version

To check which version you're currently running:
1. Look at the window title or about screen
2. Check the tauri.conf.json file in your installation directory

## Troubleshooting Updates

### Update Check Fails
- Check your internet connection
- Verify you're not behind a firewall blocking GitHub
- Try manual update instead

### Update Installation Fails
- Close all instances of Conceptualize
- Run the installer as Administrator
- Check you have write permissions to `C:\Program Files\`

### Data Loss Concerns
Your notes are stored in the folder you selected, NOT in the app installation directory. Updates will never modify your notes folder.

For extra safety, you can:
1. Back up your notes folder before updating
2. Export your todo lists (coming in future update)

## Update Frequency

We recommend checking for updates monthly. Critical security updates will be released as needed.

## Need Help?

If you experience issues with updates:
- Email: user-a@example.com
- GitHub Issues: https://github.com/IamJunnn/conceptualize/issues

---

**Questions about auto-updates?** The auto-updater is built using Tauri's official updater plugin and uses secure HTTPS connections to check for updates from GitHub Releases.
