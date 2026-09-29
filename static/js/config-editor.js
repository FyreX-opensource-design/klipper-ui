const API_BASE = '';
const CONFIG_MESSAGE_TYPE = 'klipper-config-applied';

const params = new URLSearchParams(window.location.search);
const configId = params.get('id') || '';

const titleEl = document.getElementById('editorTitle');
const subtitleEl = document.getElementById('editorSubtitle');
const filenameEl = document.getElementById('editorFilename');
const languageEl = document.getElementById('editorLanguage');
const editorEl = document.getElementById('configEditor');
const editorHost = document.querySelector('.config-editor-host');
const statusEl = document.getElementById('editorStatus');
const saveBtn = document.getElementById('saveConfigBtn');
const applyBtn = document.getElementById('applyConfigBtn');

let savedRaw = '';
let highlighted = null;

function setStatus(message, type = 'info') {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = `config-editor-status status-${type}`;
}

function updateWindowTitle(name) {
    document.title = name ? `${name} — Config Editor` : 'Config Editor';
}

function getEditorValue() {
    return getHighlightedEditorValue(highlighted?.editor, editorEl);
}

function setEditorValue(value) {
    setHighlightedEditorValue(highlighted?.editor, editorEl, value);
}

function parseEditorContent() {
    const raw = getEditorValue();
    try {
        return { content: JSON.parse(raw), error: null };
    } catch (error) {
        return { content: null, error: error.message };
    }
}

function markValidity() {
    const { error } = parseEditorContent();
    editorEl?.classList.toggle('invalid', Boolean(error));
    editorHost?.classList.toggle('invalid', Boolean(error));
    if (error) {
        setStatus(`Invalid JSON: ${error}`, 'error');
    } else if (statusEl.classList.contains('status-error')) {
        setStatus('');
    }
}

function notifyMainWindow(appliedId) {
    const payload = { type: CONFIG_MESSAGE_TYPE, configId: appliedId };
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

async function loadConfig() {
    if (!configId) {
        setStatus('No config selected. Close this window and choose a config from the main UI.', 'error');
        if (editorEl) editorEl.disabled = true;
        saveBtn.disabled = true;
        applyBtn.disabled = true;
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/configs/${configId}`);
        const result = await response.json();
        if (!response.ok || result.error) {
            throw new Error(result.error || `Failed to load config (${response.status})`);
        }

        titleEl.textContent = result.name || 'Config Editor';
        subtitleEl.textContent = result.description || 'Edit JSON, then save and apply to reload the UI.';
        filenameEl.textContent = result.filename || configId;
        updateWindowTitle(result.name);

        highlighted = createHighlightedEditor(editorEl, result.filename || 'config.json');
        if (languageEl) {
            languageEl.textContent = highlighted?.language.label || 'JSON';
        }
        highlighted?.editor.on('change', markValidity);

        const raw = JSON.stringify(result.content ?? {}, null, 2);
        setEditorValue(raw);
        savedRaw = raw;
        setStatus('Loaded current config.', 'info');
        requestAnimationFrame(() => highlighted?.editor.refresh());
    } catch (error) {
        console.error('Error loading config:', error);
        setStatus(`Error: ${error.message}`, 'error');
        if (highlighted?.editor) {
            highlighted.editor.setOption('readOnly', true);
        } else if (editorEl) {
            editorEl.disabled = true;
        }
        saveBtn.disabled = true;
        applyBtn.disabled = true;
    }
}

async function saveConfig() {
    const { content, error } = parseEditorContent();
    if (error) {
        setStatus(`Cannot save: ${error}`, 'error');
        return null;
    }

    saveBtn.disabled = true;
    applyBtn.disabled = true;
    try {
        const response = await fetch(`${API_BASE}/api/configs/${configId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        const result = await response.json();
        if (!response.ok || result.error) {
            throw new Error(result.error || `Failed to save (${response.status})`);
        }
        savedRaw = JSON.stringify(content, null, 2);
        if (getEditorValue().trim() !== savedRaw) {
            setEditorValue(savedRaw);
        }
        setStatus('Saved.', 'success');
        return content;
    } catch (error) {
        console.error('Error saving config:', error);
        setStatus(`Error: ${error.message}`, 'error');
        return null;
    } finally {
        saveBtn.disabled = false;
        applyBtn.disabled = false;
    }
}

async function applyConfig() {
    const { content, error } = parseEditorContent();
    if (error) {
        setStatus(`Cannot apply: ${error}`, 'error');
        return;
    }

    saveBtn.disabled = true;
    applyBtn.disabled = true;
    try {
        const response = await fetch(`${API_BASE}/api/configs/${configId}/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        const result = await response.json();
        if (!response.ok || result.error) {
            throw new Error(result.error || `Failed to apply (${response.status})`);
        }
        savedRaw = JSON.stringify(content, null, 2);
        if (getEditorValue().trim() !== savedRaw) {
            setEditorValue(savedRaw);
        }
        notifyMainWindow(result.id || configId);
        setStatus('Saved and applied. Main UI configs reloaded.', 'success');
    } catch (error) {
        console.error('Error applying config:', error);
        setStatus(`Error: ${error.message}`, 'error');
    } finally {
        saveBtn.disabled = false;
        applyBtn.disabled = false;
    }
}

if (editorEl) {
    editorEl.addEventListener('input', markValidity);
}
if (saveBtn) {
    saveBtn.addEventListener('click', saveConfig);
}
if (applyBtn) {
    applyBtn.addEventListener('click', applyConfig);
}

document.addEventListener('DOMContentLoaded', loadConfig);
