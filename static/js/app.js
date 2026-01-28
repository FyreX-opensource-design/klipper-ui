// Socket.IO connection
const socket = io();

// API base URL
const API_BASE = '';

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
        
        // Temperature updates
        if (status.extruder) {
            const extruder = status.extruder;
            document.getElementById('hotendTemp').textContent = 
                Math.round(extruder.temperature || 0);
            document.getElementById('hotendTarget').textContent = 
                Math.round(extruder.target || 0);
        }
        
        if (status.heater_bed) {
            const bed = status.heater_bed;
            document.getElementById('bedTemp').textContent = 
                Math.round(bed.temperature || 0);
            document.getElementById('bedTarget').textContent = 
                Math.round(bed.target || 0);
        }
        
        // Fan speed
        if (status.fan) {
            const fanSpeed = status.fan.speed || 0;
            const fanPercent = Math.round(fanSpeed * 100);
            document.getElementById('fanSpeed').textContent = fanPercent;
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
function updateFanDisplay(value) {
    document.getElementById('fanSpeedDisplay').textContent = `${value}%`;
}

async function setFanSpeed() {
    const speed = parseInt(document.getElementById('fanSpeedInput').value);
    const speedValue = speed / 100; // Convert to 0-1 range
    
    try {
        const response = await fetch(`${API_BASE}/api/printer/fan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fan: 'fan', speed: Math.round(speedValue * 255) })
        });
        
        const result = await response.json();
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addConsoleMessage(`Set fan speed to ${speed}%`, 'command');
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
    loadFileList();
    // Request status updates every 2 seconds
    setInterval(requestStatus, 2000);
    addConsoleMessage('Klipper UI initialized', 'response');
});
