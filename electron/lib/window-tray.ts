import { app, autoUpdater, BrowserWindow, Menu, nativeImage, Tray } from 'electron';

let tray: Tray | undefined;
let quitting = false;

app.on('before-quit', () => { quitting = true; });
autoUpdater.on('before-quit-for-update', () => { quitting = true; });

export function showWindow(win?: BrowserWindow) {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
}

export function minimizeWindow(win: BrowserWindow | null) {
    if (!win) return;
    if (tray) win.hide();
    else win.minimize();
}

export function watchTrayWindow(win: BrowserWindow) {
    win.on('close', (event) => {
        if (!tray || quitting) return;
        event.preventDefault();
        win.hide();
    });
    // The Linux app button calls minimizeWindow. The compositor still owns
    // ordinary taskbar minimizes and can restore them without the tray.
    if (process.platform === 'linux') return;
    win.on('minimize', () => {
        if (tray) win.hide();
    });
}

export function setTrayMinimize(enabled: boolean, iconPath: string): boolean {
    if (!enabled) {
        tray?.destroy();
        tray = undefined;
        return false;
    }
    if (tray) return true;

    try {
        const icon = nativeImage.createFromPath(iconPath).resize({ width: 20 });
        if (icon.isEmpty()) return false;
        const window = () => BrowserWindow.getAllWindows()[0];
        const show = () => showWindow(window());
        tray = new Tray(icon);
        tray.setToolTip('Zeta');
        tray.on('click', show);
        tray.setContextMenu(Menu.buildFromTemplate([
            { label: 'Show Zeta', click: show },
            { label: 'Play / Pause', click: () => window()?.webContents.send('zeta:media-command', { type: 'playpause' }) },
            { type: 'separator' },
            { label: 'Quit Zeta', click: () => app.quit() },
        ]));
        return true;
    } catch {
        tray?.destroy();
        tray = undefined;
        return false;
    }
}
