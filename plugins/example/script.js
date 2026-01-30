// Example Plugin JavaScript - Printer Statistics Panel
let autoRefreshEnabled = false;
let autoRefreshInterval = null;
const REFRESH_INTERVAL = 2000; // 2 seconds

// Initialize plugin when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Load initial data
    loadPrinterStats();
    
    // Set up auto-refresh if enabled
    updateAutoRefreshButton();
});

// Load printer statistics from plugin API
async function loadPrinterStats() {
    try {
        const response = await fetch('/api/plugins/example/stats');
        
        // Check if response is OK
        if (!response.ok) {
            if (response.status === 404) {
                console.warn('Stats endpoint not found - plugin may need app restart');
                updateDisplayWithError('Endpoint not found');
                return;
            }
            if (response.status === 415) {
                console.warn('Unsupported media type - route may not be registered');
                updateDisplayWithError('Route not registered');
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 100));
            updateDisplayWithError('Invalid response format');
            return;
        }
        
        const result = await response.json();
        
        if (result.error) {
            console.error('Error loading stats:', result.error);
            updateDisplayWithError(result.error);
            return;
        }
        
        if (result.status === 'ok') {
            updateDisplay(result);
            updateLastUpdateTime();
        }
    } catch (error) {
        console.error('Error loading printer stats:', error);
        if (error.message && error.message.includes('JSON')) {
            updateDisplayWithError('Server error - restart app?');
        } else {
            updateDisplayWithError('Connection error');
        }
    }
}

// Update display with printer statistics
function updateDisplay(data) {
    // Update print time
    const printTimeEl = document.getElementById('current-print-time');
    if (printTimeEl && data.print_time !== undefined) {
        const time = formatTime(data.print_time);
        printTimeEl.textContent = time;
    }
    
    // Update print progress
    const progressEl = document.getElementById('print-progress');
    if (progressEl && data.print_progress !== undefined) {
        const progress = Math.round(data.print_progress * 10) / 10;
        progressEl.textContent = `${progress}%`;
    }
    
    // Update printer state
    const stateEl = document.getElementById('printer-state-display');
    if (stateEl && data.printer_state) {
        stateEl.textContent = data.printer_state.toUpperCase();
        // Color code the state
        stateEl.className = `state-${data.printer_state.toLowerCase()}`;
    }
    
    // Update filename
    const filenameEl = document.getElementById('current-filename');
    if (filenameEl) {
        if (data.filename) {
            // Truncate long filenames
            const maxLength = 30;
            const displayName = data.filename.length > maxLength 
                ? '...' + data.filename.slice(-maxLength)
                : data.filename;
            filenameEl.textContent = displayName;
            filenameEl.title = data.filename; // Full name on hover
        } else {
            filenameEl.textContent = 'None';
            filenameEl.title = '';
        }
    }
    
    // Update position
    const positionEl = document.getElementById('position-display');
    if (positionEl && data.position && Array.isArray(data.position)) {
        const [x, y, z] = data.position;
        positionEl.textContent = `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`;
    }
    
    // Update velocity
    const velocityEl = document.getElementById('velocity-display');
    if (velocityEl && data.velocity !== undefined) {
        velocityEl.textContent = `${data.velocity.toFixed(2)} mm/s`;
    }
}

// Update display with error message
function updateDisplayWithError(error) {
    const stateEl = document.getElementById('printer-state-display');
    if (stateEl) {
        stateEl.textContent = 'ERROR';
        stateEl.className = 'state-error';
    }
}

// Format time in HH:MM:SS
function formatTime(seconds) {
    if (!seconds || seconds < 0) return '00:00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Update last update time
function updateLastUpdateTime() {
    const lastUpdateEl = document.getElementById('last-update');
    if (lastUpdateEl) {
        const now = new Date();
        lastUpdateEl.textContent = now.toLocaleTimeString();
    }
}

// Refresh data manually
function examplePluginRefresh() {
    loadPrinterStats();
}

// Toggle auto-refresh
function examplePluginToggleAuto() {
    autoRefreshEnabled = !autoRefreshEnabled;
    
    if (autoRefreshEnabled) {
        // Start auto-refresh
        autoRefreshInterval = setInterval(loadPrinterStats, REFRESH_INTERVAL);
    } else {
        // Stop auto-refresh
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
    }
    
    updateAutoRefreshButton();
}

// Update auto-refresh button text
function updateAutoRefreshButton() {
    const labelEl = document.getElementById('auto-refresh-label');
    if (labelEl) {
        labelEl.textContent = autoRefreshEnabled ? 'Disable' : 'Enable';
    }
}

// Make functions globally available
window.examplePluginRefresh = examplePluginRefresh;
window.examplePluginToggleAuto = examplePluginToggleAuto;
