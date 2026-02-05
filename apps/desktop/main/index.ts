import { app, BrowserWindow, dialog, Menu, shell, nativeImage } from 'electron';
import * as path from 'path';
import { setupIpcHandlers } from './ipc';
import { createMenu } from './menu';
import { initDatabase, closeDatabase, backupDatabase } from './database';
import { initRAG } from './rag';

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

// Get the correct icon path for both dev and packaged modes
function getIconPath(): string {
  if (isDev) {
    return path.join(__dirname, '../../assets/icon.ico');
  }
  // In packaged app, assets are in resources/assets
  return path.join(process.resourcesPath, 'assets/icon.ico');
}

function createWindow(): void {
  // Create native image for icon
  const iconPath = getIconPath();
  let appIcon;
  try {
    appIcon = nativeImage.createFromPath(iconPath);
    if (appIcon.isEmpty()) {
      console.warn('Icon image is empty, using default');
    }
  } catch (err) {
    console.error('Failed to load icon:', err);
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Drasill Finance',
    icon: appIcon || iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Setup application menu
function setupMenu(): void {
  const menu = createMenu(mainWindow);
  Menu.setApplicationMenu(menu);
}

// App lifecycle
app.whenReady().then(() => {
  initDatabase();
  initRAG();
  setupIpcHandlers();
  createWindow();
  setupMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Graceful shutdown - backup and close database
app.on('before-quit', () => {
  try {
    // Create backup before quitting
    backupDatabase();
  } catch (err) {
    console.error('Failed to backup database on quit:', err);
  }
});

app.on('will-quit', () => {
  try {
    closeDatabase();
  } catch (err) {
    console.error('Failed to close database:', err);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Attempt to save database before showing error
  try {
    closeDatabase();
  } catch {}
  dialog.showErrorBox('Error', `An unexpected error occurred: ${error.message}\n\nThe application will now close.`);
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
