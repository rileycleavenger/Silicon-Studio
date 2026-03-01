import { app, BrowserWindow, screen, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';

let backendProcess: ChildProcess | null = null;

function startBackend() {
    const isDev = !app.isPackaged;
    let scriptPath: string;
    let command: string;
    let args: string[] = [];

    if (isDev) {
        // In development, handle virtual environments robustly
        scriptPath = path.join(__dirname, '../../backend/main.py');
        const venvPythonPath = path.join(__dirname, '../../backend/.venv/bin/python');

        // If we are already in an activated environment (conda or venv), use python directly.
        // Otherwise, attempt to run via the expected conda environment or local venv.
        if (process.env.VIRTUAL_ENV || process.env.CONDA_PREFIX || process.env.PYTHON_EXECUTABLE) {
            command = process.env.PYTHON_EXECUTABLE || 'python';
            args = [scriptPath];
        } else if (fs.existsSync(venvPythonPath)) {
            command = venvPythonPath;
            args = [scriptPath];
        } else {
            command = 'conda';
            args = ['run', '-n', 'silicon-studio', '--no-capture-output', 'python', scriptPath];
        }
        console.log('Starting backend in DEV mode:', command, args);
    } else {
        // In production, run the bundled executable
        // PyInstaller one-dir mode creates a directory 'silicon_server' containing the binary 'silicon_server'
        // electron-builder copied the full path 'backend/dist/silicon_server' to Resources
        const binaryName = 'silicon_server';
        scriptPath = path.join(process.resourcesPath, 'backend', 'dist', 'silicon_server', binaryName);
        command = scriptPath;
        console.log('Starting backend in PROD mode:', command);
    }

    try {
        backendProcess = spawn(command, args, {
            cwd: isDev ? path.join(__dirname, '../../backend') : path.join(process.resourcesPath, 'backend', 'dist', 'silicon_server'),
            stdio: ['ignore', 'pipe', 'pipe']
        });

        backendProcess.on('error', (err) => {
            console.error('Failed to spawn backend process:', err);
            dialog.showErrorBox('Backend Error', `Failed to start backend: ${err.message}\nPath: ${command}`);
        });

    } catch (e) {
        console.error('Exception spawning backend:', e);
        if (e instanceof Error) {
            dialog.showErrorBox('Backend Exception', `Exception starting backend: ${e.message}`);
        }
    }

    // Log to console only (debug file logging disabled for production)
    if (backendProcess && backendProcess.stdout) {
        backendProcess.stdout.on('data', (data) => {
            console.log(`[Backend]: ${data.toString()}`);
        });
    }

    if (backendProcess && backendProcess.stderr) {
        backendProcess.stderr.on('data', (data) => {
            console.error(`[Backend Error]: ${data.toString()}`);
        });
    }

    if (backendProcess) {
        backendProcess.on('close', (code) => {
            console.log(`Backend process exited with code ${code}`);
            backendProcess = null;
        });
    }
}

function stopBackend() {
    if (backendProcess) {
        console.log('Stopping backend process...');
        backendProcess.kill();
        backendProcess = null;
    }
}

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const mainWindow = new BrowserWindow({
        width: Math.floor(width * 0.8),
        height: Math.floor(height * 0.9),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        titleBarStyle: 'hiddenInset', // Apple Native feel
        vibrancy: 'under-window',     // Apple Native blur
        visualEffectState: 'active',
        backgroundColor: '#00000000', // Transparent for vibrancy
    });

    // Load the Vite dev server URL in development, or the local index.html in production
    const isDev = !app.isPackaged;
    if (isDev) {
        const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
        mainWindow.loadURL(devServerUrl);
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        // In production, the file structure is:
        // dist/main/main.js (Current file)
        // dist/renderer/index.html
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
}

app.whenReady().then(() => {
    // Start the Python Backend
    startBackend();

    ipcMain.handle('dialog:openFile', async (event) => {
        // Basic IPC validation: ensure the request comes from our main window frame
        if (!event.senderFrame) {
            console.warn('Blocked unauthorized dialog:openFile request');
            return null;
        }

        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'CSV/JSONL', extensions: ['csv', 'jsonl', 'json'] }]
        });
        if (result.canceled) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('dialog:openDirectory', async (event) => {
        if (!event.senderFrame) {
            console.warn('Blocked unauthorized dialog:openDirectory request');
            return null;
        }

        const result = await dialog.showOpenDialog({
            properties: ['openDirectory']
        });
        if (result.canceled) return null;
        return result.filePaths[0];
    });

    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('will-quit', () => {
    stopBackend();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
