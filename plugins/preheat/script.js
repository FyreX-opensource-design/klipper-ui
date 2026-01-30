// Preheat Plugin JavaScript
let currentToolhead = null;
let pluginConfig = null;

// Initialize plugin when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializePreheatPlugin();
});

async function initializePreheatPlugin() {
    await loadConfig();
    await loadToolheads();
}

// Load plugin configuration
async function loadConfig() {
    try {
        const response = await fetch('/api/plugins/preheat/config');
        
        if (!response.ok) {
            console.error('Failed to load preheat config');
            return;
        }
        
        const result = await response.json();
        if (result.status === 'ok' && result.config) {
            pluginConfig = result.config;
        }
    } catch (error) {
        console.error('Error loading preheat config:', error);
    }
}

// Load available toolheads from Moonraker
async function loadToolheads() {
    const toolheadSelect = document.getElementById('preheat-toolhead-select');
    if (!toolheadSelect) return;
    
    // Show loading state
    toolheadSelect.innerHTML = '<option value="">Loading...</option>';
    toolheadSelect.disabled = true;
    
    try {
        const response = await fetch('/api/plugins/preheat/toolheads');
        
        if (!response.ok) {
            if (response.status === 404) {
                toolheadSelect.innerHTML = '<option value="">Route not found (restart app?)</option>';
                showPreheatStatus('Toolhead list endpoint not found. Please restart the Klipper UI application.', 'error');
                toolheadSelect.disabled = false;
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Response is not JSON. Server may need to be restarted.');
        }
        
        const result = await response.json();
        
        toolheadSelect.innerHTML = '';
        
        if (result.error) {
            toolheadSelect.innerHTML = '<option value="">Error loading toolheads</option>';
            showPreheatStatus(`Error: ${result.error}`, 'error');
            return;
        }
        
        const toolheads = result.toolheads || [];
        
        if (toolheads.length === 0) {
            toolheadSelect.innerHTML = '<option value="">No toolheads found</option>';
        } else {
            toolheads.forEach(toolhead => {
                const option = document.createElement('option');
                option.value = toolhead;
                option.textContent = toolhead;
                toolheadSelect.appendChild(option);
            });
            
            // Select first toolhead by default
            if (toolheads.length > 0) {
                toolheadSelect.value = toolheads[0];
                currentToolhead = toolheads[0];
            }
        }
        
        toolheadSelect.disabled = false;
    } catch (error) {
        console.error('Error loading toolheads:', error);
        toolheadSelect.innerHTML = '<option value="">Error loading toolheads</option>';
        
        let errorMsg = error.message;
        if (error.message.includes('JSON') || error.message.includes('Unexpected token')) {
            errorMsg = 'Server returned HTML instead of JSON. Please restart the Klipper UI application.';
        }
        
        showPreheatStatus(`Error: ${errorMsg}`, 'error');
        toolheadSelect.disabled = false;
    }
}

// Refresh toolhead list
function preheatRefreshToolheads() {
    loadToolheads();
}

// Get current toolhead selection
function getCurrentToolhead() {
    const toolheadSelect = document.getElementById('preheat-toolhead-select');
    if (!toolheadSelect) {
        return pluginConfig?.default_toolhead || 'extruder';
    }
    
    const selected = toolheadSelect.value;
    if (!selected || selected === '' || selected === 'Loading...' || selected.includes('Error')) {
        return pluginConfig?.default_toolhead || 'extruder';
    }
    
    return selected;
}

// Execute preheat from button click (reads preset from data attribute)
function preheatExecutePresetFromButton(button) {
    const presetJson = button.getAttribute('data-preset');
    if (!presetJson) {
        showPreheatStatus('Error: Preset data not found', 'error');
        return;
    }
    try {
        // Decode HTML entities back to JSON
        const decodedJson = presetJson.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        const preset = JSON.parse(decodedJson);
        preheatExecutePreset(preset);
    } catch (error) {
        console.error('Error parsing preset data:', error);
        showPreheatStatus('Error: Invalid preset data', 'error');
    }
}

// Execute preheat with preset values
// preset is an object containing all preset fields (name, hotend_temp, bed_temp, temps, etc.)
async function preheatExecutePreset(preset) {
    const toolhead = getCurrentToolhead();
    const macroName = pluginConfig?.macro_name || 'PREHEAT';
    const presetName = preset.name || 'Unknown';
    
    showPreheatStatus(`Preheating ${presetName}...`, 'info');
    
    // Build request body with toolhead, macro_name, and all preset fields (except name)
    const requestBody = {
        toolhead: toolhead,
        macro_name: macroName
    };
    
    // Add all preset fields except 'name' as macro arguments
    for (const [key, value] of Object.entries(preset)) {
        if (key !== 'name' && value !== null && value !== undefined) {
            requestBody[key] = value;
        }
    }
    
    try {
        const response = await fetch('/api/plugins/preheat/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        const result = await response.json();
        
        if (result.error) {
            showPreheatStatus(`Error: ${result.error}`, 'error');
        } else {
            const hotendTemp = preset.hotend_temp || 'N/A';
            const bedTemp = preset.bed_temp || 'N/A';
            showPreheatStatus(
                `Preheating ${presetName} - Toolhead: ${toolhead}, Hotend: ${hotendTemp}°C, Bed: ${bedTemp}°C`,
                'success'
            );
        }
    } catch (error) {
        console.error('Error executing preheat:', error);
        showPreheatStatus(`Error: ${error.message}`, 'error');
    }
}

// Execute preheat with custom temperatures
async function preheatExecuteCustom() {
    const toolhead = getCurrentToolhead();
    const macroName = pluginConfig?.macro_name || 'PREHEAT';
    
    const hotendTempInput = document.getElementById('preheat-hotend-temp');
    const bedTempInput = document.getElementById('preheat-bed-temp');
    
    if (!hotendTempInput || !bedTempInput) {
        showPreheatStatus('Temperature inputs not found', 'error');
        return;
    }
    
    const hotendTemp = parseInt(hotendTempInput.value);
    const bedTemp = parseInt(bedTempInput.value);
    
    if (isNaN(hotendTemp) || isNaN(bedTemp)) {
        showPreheatStatus('Please enter valid temperatures', 'error');
        return;
    }
    
    if (hotendTemp < 0 || hotendTemp > 400) {
        showPreheatStatus('Hotend temperature must be between 0 and 400°C', 'error');
        return;
    }
    
    if (bedTemp < 0 || bedTemp > 150) {
        showPreheatStatus('Bed temperature must be between 0 and 150°C', 'error');
        return;
    }
    
    showPreheatStatus('Preheating with custom temperatures...', 'info');
    
    try {
        const response = await fetch('/api/plugins/preheat/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                toolhead: toolhead,
                macro_name: macroName,
                hotend_temp: hotendTemp,
                bed_temp: bedTemp
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showPreheatStatus(`Error: ${result.error}`, 'error');
        } else {
            showPreheatStatus(
                `Preheating - Toolhead: ${toolhead}, Hotend: ${hotendTemp}°C, Bed: ${bedTemp}°C`,
                'success'
            );
        }
    } catch (error) {
        console.error('Error executing preheat:', error);
        showPreheatStatus(`Error: ${error.message}`, 'error');
    }
}

// Show status message
function showPreheatStatus(message, type = 'info') {
    const statusEl = document.getElementById('preheat-status-message');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status-message status-${type}`;
        
        // Clear status after 5 seconds for success/info, 10 seconds for errors
        const timeout = type === 'error' ? 10000 : 5000;
        setTimeout(() => {
            if (statusEl.textContent === message) {
                statusEl.textContent = '';
                statusEl.className = 'status-message';
            }
        }, timeout);
    }
}

// Make functions globally available
window.preheatExecutePreset = preheatExecutePreset;
window.preheatExecutePresetFromButton = preheatExecutePresetFromButton;
window.preheatExecuteCustom = preheatExecuteCustom;
window.preheatRefreshToolheads = preheatRefreshToolheads;
