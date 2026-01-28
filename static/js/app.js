// Socket.IO connection
const socket = io();

// API base URL
const API_BASE = '';

// Store printer configuration
let printerConfig = {
    heaters: [],
    fans: [],
    extruders: []
};

// Load printer configuration and generate UI
async function loadPrinterConfig() {
    try {
        const response = await fetch(`${API_BASE}/api/printer/config`);
        const result = await response.json();
        
        if (result.error) {
            console.error('Error loading printer config:', result.error);
            document.getElementById('tempControls').innerHTML = 
                `<p style="color: red;">Error loading printer configuration: ${result.error}</p>`;
            return;
        }
        
        printerConfig = result.result || result;
        generateTemperatureControls();
    } catch (error) {
        console.error('Error loading printer config:', error);
        document.getElementById('tempControls').innerHTML = 
            `<p style="color: red;">Failed to load printer configuration</p>`;
    }
}

// Generate temperature and fan controls dynamically
function generateTemperatureControls() {
    const container = document.getElementById('tempControls');
    let html = '';
    
    // Generate heater controls
    if (printerConfig.heaters && printerConfig.heaters.length > 0) {
        printerConfig.heaters.forEach(heater => {
            const heaterId = heater.replace(/[^a-zA-Z0-9]/g, '_');
            const displayName = getHeaterDisplayName(heater);
            const maxTemp = heater.includes('bed') ? 150 : 300;
            
            html += `
                <div class="temp-control" data-heater="${heater}">
                    <label>${displayName}:</label>
                    <div class="temp-display">
                        <span id="temp_${heaterId}">0</span>°C / <span id="target_${heaterId}">0</span>°C
                    </div>
                    <div class="temp-input-group">
                        <input type="number" id="input_${heaterId}" placeholder="Target" min="0" max="${maxTemp}">
                        <button onclick="setTemperature('${heater}', 'input_${heaterId}')">Set</button>
                    </div>
                </div>
            `;
        });
    }
    
    // Generate fan controls
    if (printerConfig.fans && printerConfig.fans.length > 0) {
        printerConfig.fans.forEach(fan => {
            const fanId = fan.replace(/[^a-zA-Z0-9]/g, '_');
            const displayName = getFanDisplayName(fan);
            
            html += `
                <div class="temp-control" data-fan="${fan}">
                    <label>${displayName}:</label>
                    <div class="temp-display">
                        <span id="fan_${fanId}">0</span>%
                    </div>
                    <div class="temp-input-group">
                        <input type="range" id="fanInput_${fanId}" min="0" max="100" value="0" 
                               oninput="updateFanDisplay('${fan}', this.value)">
                        <span id="fanDisplay_${fanId}">0%</span>
                        <button onclick="setFanSpeed('${fan}', 'fanInput_${fanId}')">Set</button>
                    </div>
                </div>
            `;
        });
    }
    
    if (!html) {
        html = '<p>No heaters or fans detected. Check printer connection.</p>';
    }
    
    container.innerHTML = html;
}

// Get display name for heater
function getHeaterDisplayName(heater) {
    if (heater === 'heater_bed') return 'Bed';
    if (heater.startsWith('extruder')) {
        const match = heater.match(/extruder(\d+)/);
        if (match) {
            return `Extruder ${parseInt(match[1]) + 1}`;
        }
        return 'Extruder';
    }
    if (heater.startsWith('heater_generic')) {
        const match = heater.match(/heater_generic\s+(\w+)/);
        if (match) {
            return match[1].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
        return heater.replace(/heater_generic\s+/, '').replace(/_/g, ' ');
    }
    return heater.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Get display name for fan
function getFanDisplayName(fan) {
    if (fan === 'fan') return 'Fan';
    if (fan.startsWith('fan')) {
        const match = fan.match(/fan(\d+)/);
        if (match) {
            return `Fan ${parseInt(match[1]) + 1}`;
        }
        return fan.replace(/fan/, 'Fan ').replace(/_/g, ' ');
    }
    if (fan.includes('controller_fan')) return 'Controller Fan';
    if (fan.includes('heater_fan')) return 'Heater Fan';
    return fan.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Connection status
socket.on('connect', () => {
    updateConnectionStatus(true);
    requestStatus();
});

socket.on('disconnect', () => {
    updateConnectionStatus(false);
});

socket.on('status_update', (data) => {
    updatePrinterStatus(data);
});

socket.on('error', (data) => {
    console.error('Socket error:', data);
    addConsoleMessage(`Error: ${data.message}`, 'error');
});

// Update connection status indicator
function updateConnectionStatus(connected) {
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    if (connected) {
        indicator.className = 'status-indicator connected';
        statusText.textContent = 'Connected';
    } else {
        indicator.className = 'status-indicator disconnected';
        statusText.textContent = 'Disconnected';
    }
}

// Request status update
function requestStatus() {
    socket.emit('request_status');
}

// Update printer status display
function updatePrinterStatus(data) {
    if (!data || data.error) {
        console.error('Status update error:', data);
        return;
    }

    // Update print stats
    if (data.result && data.result.status) {
        const status = data.result.status;
        
        // Print stats
        if (status.print_stats) {
            const printStats = status.print_stats;
            document.getElementById('printerState').textContent = printStats.state || '-';
            document.getElementById('currentFile').textContent = printStats.filename || '-';
            
            // Show/hide print controls
            const printPanel = document.getElementById('printPanel');
            if (printStats.state === 'printing' || printStats.state === 'paused') {
                printPanel.style.display = 'block';
            } else {
                printPanel.style.display = 'none';
            }
            
            // Calculate print progress
            if (status.virtual_sdcard && status.virtual_sdcard.progress !== undefined) {
                const progress = (status.virtual_sdcard.progress * 100).toFixed(1);
                document.getElementById('printProgress').textContent = `${progress}%`;
            }
            
            // Print time
            if (printStats.print_duration) {
                const duration = printStats.print_duration;
                const hours = Math.floor(duration / 3600);
                const minutes = Math.floor((duration % 3600) / 60);
                const seconds = Math.floor(duration % 60);
                document.getElementById('printTime').textContent = 
                    `${hours}h ${minutes}m ${seconds}s`;
            }
        }
        
        // Temperature updates - handle all heaters dynamically
        if (printerConfig.heaters) {
            printerConfig.heaters.forEach(heater => {
                if (status[heater]) {
                    const heaterData = status[heater];
                    const heaterId = heater.replace(/[^a-zA-Z0-9]/g, '_');
                    const tempElement = document.getElementById(`temp_${heaterId}`);
                    const targetElement = document.getElementById(`target_${heaterId}`);
                    
                    if (tempElement) {
                        tempElement.textContent = Math.round(heaterData.temperature || 0);
                    }
                    if (targetElement) {
                        targetElement.textContent = Math.round(heaterData.target || 0);
                    }
                }
            });
        }
        
        // Fan speed updates - handle all fans dynamically
        if (printerConfig.fans) {
            printerConfig.fans.forEach(fan => {
                if (status[fan]) {
                    const fanData = status[fan];
                    const fanId = fan.replace(/[^a-zA-Z0-9]/g, '_');
                    const fanElement = document.getElementById(`fan_${fanId}`);
                    const fanDisplayElement = document.getElementById(`fanDisplay_${fanId}`);
                    
                    // Fan speed can be 0-1 or 0-255, normalize to percentage
                    let fanSpeed = fanData.speed || 0;
                    if (fanSpeed > 1) {
                        fanSpeed = fanSpeed / 255;
                    }
                    const fanPercent = Math.round(fanSpeed * 100);
                    
                    if (fanElement) {
                        fanElement.textContent = fanPercent;
                    }
                    if (fanDisplayElement && document.getElementById(`fanInput_${fanId}`)) {
                        document.getElementById(`fanInput_${fanId}`).value = fanPercent;
                        fanDisplayElement.textContent = `${fanPercent}%`;
                    }
                }
            });
        }
    }
}

// Set temperature
async function setTemperature(heater, inputId) {
    const input = document.getElementById(inputId);
    const target = parseFloat(input.value);
    
    if (isNaN(target)) {
        alert('Please enter a valid temperature');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/printer/temperature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ heater, target })
        });
        
        const result = await response.json();
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addConsoleMessage(`Set ${heater} temperature to ${target}°C`, 'command');
            setTimeout(requestStatus, 500);
        }
    } catch (error) {
        console.error('Error setting temperature:', error);
        alert('Failed to set temperature');
    }
}

// Set fan speed
function updateFanDisplay(fan, value) {
    const fanId = fan.replace(/[^a-zA-Z0-9]/g, '_');
    const displayElement = document.getElementById(`fanDisplay_${fanId}`);
    if (displayElement) {
        displayElement.textContent = `${value}%`;
    }
}

async function setFanSpeed(fan, inputId) {
    const input = document.getElementById(inputId);
    const speed = parseInt(input.value);
    const speedValue = speed / 100; // Convert to 0-1 range
    
    try {
        const response = await fetch(`${API_BASE}/api/printer/fan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fan: fan, speed: Math.round(speedValue * 255) })
        });
        
        const result = await response.json();
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addConsoleMessage(`Set ${getFanDisplayName(fan)} speed to ${speed}%`, 'command');
            setTimeout(requestStatus, 500);
        }
    } catch (error) {
        console.error('Error setting fan speed:', error);
        alert('Failed to set fan speed');
    }
}

// Home printer
async function homePrinter(axis) {
    try {
        const response = await fetch(`${API_BASE}/api/printer/home`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ axis })
        });
        
        const result = await response.json();
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addConsoleMessage(`Homing ${axis} axis`, 'command');
        }
    } catch (error) {
        console.error('Error homing:', error);
        alert('Failed to home printer');
    }
}

// Move printer relative
async function moveRelative(axis, distance) {
    const input = document.getElementById(axis.toLowerCase() + 'Move');
    const distanceToMove = input.value ? parseFloat(input.value) : distance;
    const speed = parseInt(document.getElementById('moveSpeed').value) || 100;
    
    const moveData = { type: 'relative', speed };
    moveData[axis.toLowerCase()] = distanceToMove;
    
    try {
        const response = await fetch(`${API_BASE}/api/printer/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(moveData)
        });
        
        const result = await response.json();
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addConsoleMessage(`Move ${axis} ${distanceToMove > 0 ? '+' : ''}${distanceToMove}mm`, 'command');
            input.value = '';
        }
    } catch (error) {
        console.error('Error moving printer:', error);
        alert('Failed to move printer');
    }
}

// Emergency stop
async function emergencyStop() {
    if (!confirm('Are you sure you want to emergency stop?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/printer/emergency_stop`, {
            method: 'POST'
        });
        
        const result = await response.json();
        addConsoleMessage('EMERGENCY STOP activated', 'error');
    } catch (error) {
        console.error('Error emergency stop:', error);
        alert('Failed to emergency stop');
    }
}

// File management
async function loadFileList() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '<p>Loading files...</p>';
    
    try {
        const response = await fetch(`${API_BASE}/api/files/list`);
        const result = await response.json();
        
        if (result.error) {
            fileList.innerHTML = `<p style="color: red;">Error: ${result.error}</p>`;
            return;
        }
        
        if (!result.result || result.result.length === 0) {
            fileList.innerHTML = '<p>No files found</p>';
            return;
        }
        
        fileList.innerHTML = result.result
            .filter(file => file.path.endsWith('.gcode') || file.path.endsWith('.g'))
            .map(file => {
                const filename = file.path.split('/').pop();
                return `
                    <div class="file-item">
                        <span class="file-name">${filename}</span>
                        <div class="file-actions-buttons">
                            <button class="btn btn-success btn-small" onclick="startPrint('${filename}')">Print</button>
                            <button class="btn btn-danger btn-small" onclick="deleteFile('${filename}')">Delete</button>
                        </div>
                    </div>
                `;
            }).join('');
    } catch (error) {
        console.error('Error loading files:', error);
        fileList.innerHTML = '<p style="color: red;">Failed to load files</p>';
    }
}

async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(`${API_BASE}/api/files/upload`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addConsoleMessage(`Uploaded file: ${file.name}`, 'response');
            loadFileList();
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        alert('Failed to upload file');
    }
    
    fileInput.value = '';
}

async function deleteFile(filename) {
    if (!confirm(`Delete ${filename}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/files/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        
        const result = await response.json();
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addConsoleMessage(`Deleted file: ${filename}`, 'response');
            loadFileList();
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        alert('Failed to delete file');
    }
}

async function startPrint(filename) {
    if (!confirm(`Start printing ${filename}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/print/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        
        const result = await response.json();
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addConsoleMessage(`Started printing: ${filename}`, 'response');
            setTimeout(requestStatus, 500);
        }
    } catch (error) {
        console.error('Error starting print:', error);
        alert('Failed to start print');
    }
}

async function pausePrint() {
    try {
        const response = await fetch(`${API_BASE}/api/print/pause`, {
            method: 'POST'
        });
        
        const result = await response.json();
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addConsoleMessage('Print paused', 'response');
            setTimeout(requestStatus, 500);
        }
    } catch (error) {
        console.error('Error pausing print:', error);
        alert('Failed to pause print');
    }
}

async function resumePrint() {
    try {
        const response = await fetch(`${API_BASE}/api/print/resume`, {
            method: 'POST'
        });
        
        const result = await response.json();
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addConsoleMessage('Print resumed', 'response');
            setTimeout(requestStatus, 500);
        }
    } catch (error) {
        console.error('Error resuming print:', error);
        alert('Failed to resume print');
    }
}

async function cancelPrint() {
    if (!confirm('Cancel current print?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/print/cancel`, {
            method: 'POST'
        });
        
        const result = await response.json();
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addConsoleMessage('Print cancelled', 'response');
            setTimeout(requestStatus, 500);
        }
    } catch (error) {
        console.error('Error cancelling print:', error);
        alert('Failed to cancel print');
    }
}

// G-code console
function addConsoleMessage(message, type = 'response') {
    const console = document.getElementById('consoleOutput');
    const timestamp = new Date().toLocaleTimeString();
    const className = type === 'command' ? 'command' : type === 'error' ? 'error' : 'response';
    console.innerHTML += `<div class="${className}">[${timestamp}] ${message}</div>`;
    console.scrollTop = console.scrollHeight;
}

async function sendGcode() {
    const input = document.getElementById('gcodeInput');
    const command = input.value.trim();
    
    if (!command) {
        return;
    }
    
    addConsoleMessage(`> ${command}`, 'command');
    input.value = '';
    
    try {
        const response = await fetch(`${API_BASE}/api/printer/gcode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        
        const result = await response.json();
        if (result.error) {
            addConsoleMessage(`Error: ${result.error}`, 'error');
        } else {
            addConsoleMessage('Command sent', 'response');
        }
    } catch (error) {
        console.error('Error sending G-code:', error);
        addConsoleMessage(`Error: ${error.message}`, 'error');
    }
}

function handleGcodeKeyPress(event) {
    if (event.key === 'Enter') {
        sendGcode();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadPrinterConfig().then(() => {
        loadFileList();
        // Request status updates every 2 seconds
        setInterval(requestStatus, 2000);
        addConsoleMessage('Klipper UI initialized', 'response');
    });
});
