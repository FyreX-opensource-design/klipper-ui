const API_BASE = '';
const CONFIG_MESSAGE_TYPE = 'klipper-printer-config-saved';

const params = new URLSearchParams(window.location.search);
const filePath = params.get('path') || '';

const titleEl = document.getElementById('editorTitle');
const filenameEl = document.getElementById('editorFilename');
const editorEl = document.getElementById('configEditor');
const statusEl = document.getElementById('editorStatus');
const saveBtn = document.getElementById('saveConfigBtn');
const downloadBtn = document.getElementById('downloadConfigBtn');

let savedRaw = '';

function setStatus(message, type = 'info') {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = `config-editor-status status-${type}`;
}

function fileNameFromPath(path) {
    return path.split('/').pop() || path;
}

function notifyMainWindow() {
    const payload = { type: CONFIG_MESSAGE_TYPE, path: filePath };
    try {
        const channel = new BroadcastChannel('klipper-ui-config');
        channel.postMessage(payload);
        channel.close();
        return;
    } catch (error) {
        console.debug('BroadcastChannel unavailable:', error);
    }
    if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, window.location.origin);
    }
}

async function loadFile() {
    if (!filePath) {
        setStatus('No file selected. Close this window and choose a config file from the main UI.', 'error');
        editorEl.disabled = true;
        saveBtn.disabled = true;
        downloadBtn.disabled = true;
        return;
    }

    titleEl.textContent = fileNameFromPath(filePath);
    filenameEl.textContent = filePath;
    document.title = `${fileNameFromPath(filePath)} — Klipper Config`;

    try {
        const response = await fetch(`${API_BASE}/api/klipper-config/contents?path=${encodeURIComponent(filePath)}`);
        const result = await response.json();
        if (!response.ok || result.error) {
            throw new Error(result.error || `Failed to load file (${response.status})`);
        }
        editorEl.value = result.content ?? '';
        savedRaw = editorEl.value;
        setStatus('Loaded from printer. Save writes the file; it does not restart Klipper.', 'info');
    } catch (error) {
        console.error('Error loading Klipper config:', error);
        setStatus(`Error: ${error.message}`, 'error');
        editorEl.disabled = true;
        saveBtn.disabled = true;
    }
}

async function saveFile() {
    saveBtn.disabled = true;
    try {
        const response = await fetch(`${API_BASE}/api/klipper-config/contents`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: filePath,
                content: editorEl.value
            })
        });
        const result = await response.json();
        if (!response.ok || result.error) {
            throw new Error(result.error || `Failed to save (${response.status})`);
        }
        savedRaw = editorEl.value;
        notifyMainWindow();
        setStatus('Saved on the printer. Restart Klipper separately to apply.', 'success');
    } catch (error) {
        console.error('Error saving Klipper config:', error);
        setStatus(`Error: ${error.message}`, 'error');
    } finally {
        saveBtn.disabled = false;
    }
}

function downloadFile() {
    window.location.href = `${API_BASE}/api/klipper-config/download?path=${encodeURIComponent(filePath)}`;
}

if (saveBtn) {
    saveBtn.addEventListener('click', saveFile);
}
if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadFile);
}

window.addEventListener('beforeunload', (event) => {
    if (editorEl && editorEl.value !== savedRaw) {
        event.preventDefault();
        event.returnValue = '';
    }
});

document.addEventListener('DOMContentLoaded', loadFile);
