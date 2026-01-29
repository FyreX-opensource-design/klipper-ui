// Socket.IO connection
const socket = io();

// API base URL
const API_BASE = '';

// Store printer configuration
let printerConfig = {
    heaters: [],
    fans: [],
    extruders: [],
    temperature_sensors: []
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
            updateConnectionStatus(false);
            return;
        }
        
        printerConfig = result.result || result;
        generateTemperatureControls();
        generateFanControls();
        generateToolSelection();
        
        // Show/hide QGL/Z_TILT status items based on config
        const qglItem = document.getElementById('qglStatusItem');
        const zTiltItem = document.getElementById('zTiltStatusItem');
        if (qglItem) {
            qglItem.style.display = printerConfig.qgl_object ? 'flex' : 'none';
        }
        if (zTiltItem) {
            zTiltItem.style.display = printerConfig.z_tilt_object ? 'flex' : 'none';
        }
        
        // Don't set Connected here - config can be empty when Moonraker is unreachable.
        // Connection status is set from status_update responses.
    } catch (error) {
        console.error('Error loading printer config:', error);
        document.getElementById('tempControls').innerHTML = 
            `<p style="color: red;">Failed to load printer configuration</p>`;
        updateConnectionStatus(false);
    }
}

// Generate temperature controls dynamically
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
    
    // Generate temperature sensor displays (read-only)
    if (printerConfig.temperature_sensors && printerConfig.temperature_sensors.length > 0) {
        printerConfig.temperature_sensors.forEach(sensor => {
            const sensorId = sensor.replace(/[^a-zA-Z0-9]/g, '_');
            const displayName = getTemperatureSensorDisplayName(sensor);
            
            html += `
                <div class="temp-control" data-sensor="${sensor}">
                    <label>${displayName}:</label>
                    <div class="temp-display">
                        <span id="sensor_${sensorId}">-</span>°C
                    </div>
                </div>
            `;
        });
    }
    
    if (!html) {
        html = '<p>No heaters or temperature sensors detected. Check printer connection.</p>';
    }
    
    container.innerHTML = html;
}

// Generate fan controls dynamically (only user-controllable fans: fan and fan_generic)
function generateFanControls() {
    const container = document.getElementById('fanControls');
    let html = '';
    
    // Filter for only user-controllable fans (fan and fan_generic)
    // Exclude heater_fan and controller_fan (they're automatically controlled)
    if (printerConfig.fans && printerConfig.fans.length > 0) {
        const controllableFans = printerConfig.fans.filter(fan => 
            fan === 'fan' || 
            fan.startsWith('fan ') || 
            fan.startsWith('fan_generic')
        );
        
        if (controllableFans.length > 0) {
            controllableFans.forEach(fan => {
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
    }
    
    if (!html) {
        html = '<p>No controllable fans detected.</p>';
    }
    
    container.innerHTML = html;
}

// Generate tool selection buttons
function generateToolSelection() {
    const section = document.getElementById('toolSelectionSection');
    const statusItem = document.getElementById('toolSelectionItem');
    const container = document.getElementById('toolButtons');
    
    if (!section || !container) {
        return;
    }
    
    // Get list of extruders from config
    const extruders = printerConfig.extruders || [];
    
    // If only one extruder, don't show tool selection
    if (extruders.length <= 1) {
        section.style.display = 'none';
        if (statusItem) {
            statusItem.style.display = 'none';
        }
        return;
    }
    
    // Show tool selection section
    section.style.display = 'block';
    if (statusItem) {
        statusItem.style.display = 'flex';
    }
    
    // Generate buttons for each tool
    let html = '';
    extruders.forEach((extruder, index) => {
        const toolNumber = index;
        const displayName = getHeaterDisplayName(extruder);
        html += `
            <button class="btn btn-primary tool-btn" onclick="selectTool(${toolNumber})" id="toolBtn${toolNumber}">
                Tool ${toolNumber} (${displayName})
            </button>
        `;
    });
    
    container.innerHTML = html;
}

// Select tool/extruder
async function selectTool(toolNumber) {
    try {
        const response = await fetch(`${API_BASE}/api/printer/tool`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: toolNumber })
        });
        
        const result = await response.json();
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            addConsoleMessage(`Selected Tool ${toolNumber}`, 'command');
            // Update button states
            updateToolButtonStates();
            setTimeout(requestStatus, 500);
        }
    } catch (error) {
        console.error('Error selecting tool:', error);
        alert('Failed to select tool');
    }
}

// Update tool button states based on current tool
function updateToolButtonStates() {
    // This will be called after status update to highlight the active tool
    // The actual highlighting will be done in updatePrinterStatus
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

// Get display name for temperature sensor
function getTemperatureSensorDisplayName(sensor) {
    // Remove "temperature_sensor" prefix and format the name
    let name = sensor.replace(/^temperature_sensor\s*/, '');
    if (!name) {
        name = 'Temperature Sensor';
    } else {
        // Capitalize words and replace underscores with spaces
        name = name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return name;
}

// Connection status reflects PRINTER (Moonraker) connectivity, not Socket.IO to our server
socket.on('connect', () => {
    // Don't set Connected here - we're only connected to our Flask app.
    // Request status; we'll set Connected/Disconnected when we get the response.
    requestStatus();
});

socket.on('disconnect', () => {
    updateConnectionStatus(false);
});

socket.on('status_update', (data) => {
    statusRequestPending = false; // Clear pending flag when we receive response
    updatePrinterStatus(data);
    // Update connection indicator based on whether we got valid printer data
    if (data && data.error) {
        updateConnectionStatus(false);
    } else if (data && data.result && data.result.status) {
        updateConnectionStatus(true);
    }
});

socket.on('error', (data) => {
    statusRequestPending = false; // Clear pending flag on error
    console.error('Socket error:', data);
    addConsoleMessage(`Error: ${data.message}`, 'error');
    updateConnectionStatus(false);
});

// Update connection status indicator (printer/Moonraker connectivity)
function updateConnectionStatus(connected) {
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    if (connected) {
        indicator.className = 'status-indicator connected';
        statusText.textContent = 'Printer connected';
    } else {
        indicator.className = 'status-indicator disconnected';
        statusText.textContent = 'Printer disconnected';
    }
}

// Request status update with throttling to prevent too many requests
let statusRequestPending = false;
let lastStatusRequest = 0;
const STATUS_REQUEST_INTERVAL = 1000; // Minimum 1 second between requests

function requestStatus() {
    const now = Date.now();
    // Throttle requests - don't send if one is pending or too soon
    if (statusRequestPending || (now - lastStatusRequest) < STATUS_REQUEST_INTERVAL) {
        return;
    }
    
    statusRequestPending = true;
    lastStatusRequest = now;
    
    // Use a timeout to clear pending flag if no response comes
    setTimeout(() => {
        statusRequestPending = false;
    }, 5000);
    
    socket.emit('request_status');
}

// Update printer status display
function updatePrinterStatus(data) {
    if (!data || data.error) {
        if (data && data.error) {
            console.error('Status update error:', data.error);
        }
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
        
        // Fan speed updates - handle only user-controllable fans (fan and fan_generic)
        if (printerConfig.fans) {
            const controllableFans = printerConfig.fans.filter(fan => 
                fan === 'fan' || 
                fan.startsWith('fan ') || 
                fan.startsWith('fan_generic')
            );
            
            controllableFans.forEach(fan => {
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
        
        // Update axis homing status
        if (status.toolhead && status.toolhead.homed_axes !== undefined) {
            const homedAxes = status.toolhead.homed_axes.toLowerCase();
            const axes = ['x', 'y', 'z'];
            
            axes.forEach(axis => {
                const isHomed = homedAxes.includes(axis);
                const dotElement = document.getElementById(`axisDot${axis.toUpperCase()}`);
                const textElement = document.getElementById(`axisText${axis.toUpperCase()}`);
                
                if (dotElement && textElement) {
                    dotElement.className = `status-dot ${isHomed ? 'homed' : 'not-homed'}`;
                    textElement.textContent = isHomed ? 'Homed' : 'Not Homed';
                }
            });
        }
        
        // Update toolhead position (X, Y, Z only - exclude extruder E)
        if (status.toolhead && status.toolhead.position && Array.isArray(status.toolhead.position)) {
            const position = status.toolhead.position;
            const xElement = document.getElementById('positionX');
            const yElement = document.getElementById('positionY');
            const zElement = document.getElementById('positionZ');
            
            if (xElement && position[0] !== undefined) {
                xElement.textContent = position[0].toFixed(2);
            }
            if (yElement && position[1] !== undefined) {
                yElement.textContent = position[1].toFixed(2);
            }
            if (zElement && position[2] !== undefined) {
                zElement.textContent = position[2].toFixed(2);
            }
            
            // Update movement input fields with current position (only if empty and in absolute mode)
            const movementMode = window.currentMovementMode || 'relative';
            if (movementMode === 'absolute') {
                const xInput = document.getElementById('xMove');
                const yInput = document.getElementById('yMove');
                const zInput = document.getElementById('zMove');
                const eInput = document.getElementById('eMove');
                
                // Only update if input is empty or has placeholder value
                if (xInput && (!xInput.value || xInput.value === '')) {
                    xInput.placeholder = position[0].toFixed(2);
                }
                if (yInput && (!yInput.value || yInput.value === '')) {
                    yInput.placeholder = position[1].toFixed(2);
                }
                if (zInput && (!zInput.value || zInput.value === '')) {
                    zInput.placeholder = position[2].toFixed(2);
                }
                if (eInput && position[3] !== undefined && (!eInput.value || eInput.value === '')) {
                    eInput.placeholder = position[3].toFixed(2);
                }
            }
        }
        
        // Update coordinate mode (absolute/relative)
        if (status.gcode_move && status.gcode_move.absolute_coordinates !== undefined) {
            const modeElement = document.getElementById('coordinateModeText');
            if (modeElement) {
                modeElement.textContent = status.gcode_move.absolute_coordinates ? 'Absolute (G90)' : 'Relative (G91)';
            }
        }
        
        // Update active tool/extruder
        if (status.toolhead && status.toolhead.extruder !== undefined) {
            const toolText = document.getElementById('toolText');
            const toolSection = document.getElementById('toolSelectionSection');
            const toolStatusItem = document.getElementById('toolSelectionItem');
            
            if (toolText) {
                const extruderName = status.toolhead.extruder;
                // Extract tool number from extruder name (e.g., "extruder1" -> "Tool 1")
                const match = extruderName.match(/extruder(\d+)/);
                if (match) {
                    const toolNumber = parseInt(match[1]);
                    toolText.textContent = `Tool ${toolNumber}`;
                    
                    // Update button states
                    const toolButtons = document.querySelectorAll('.tool-btn');
                    toolButtons.forEach((btn, index) => {
                        if (index === toolNumber) {
                            btn.classList.add('active');
                            btn.style.background = '#10b981';
                        } else {
                            btn.classList.remove('active');
                            btn.style.background = '';
                        }
                    });
                } else {
                    toolText.textContent = extruderName;
                }
            }
            
            // Show tool selection if we have multiple extruders
            if (toolSection && printerConfig.extruders && printerConfig.extruders.length > 1) {
                toolSection.style.display = 'block';
                if (toolStatusItem) {
                    toolStatusItem.style.display = 'flex';
                }
            }
        }
        
        // Update active tool/extruder
        if (status.toolhead && status.toolhead.extruder !== undefined) {
            const toolText = document.getElementById('toolText');
            const toolSection = document.getElementById('toolSelectionSection');
            const toolStatusItem = document.getElementById('toolSelectionItem');
            
            if (toolText) {
                const extruderName = status.toolhead.extruder;
                // Extract tool number from extruder name (e.g., "extruder1" -> "Tool 1")
                const match = extruderName.match(/extruder(\d+)/);
                if (match) {
                    const toolNumber = parseInt(match[1]);
                    toolText.textContent = `Tool ${toolNumber}`;
                    
                    // Update button states
                    const toolButtons = document.querySelectorAll('.tool-btn');
                    toolButtons.forEach((btn, index) => {
                        if (index === toolNumber) {
                            btn.classList.add('active');
                            btn.style.background = '#10b981';
                        } else {
                            btn.classList.remove('active');
                            btn.style.background = '';
                        }
                    });
                } else {
                    toolText.textContent = extruderName;
                }
            }
            
            // Show tool selection if we have multiple extruders
            if (toolSection && printerConfig.extruders && printerConfig.extruders.length > 1) {
                toolSection.style.display = 'block';
                if (toolStatusItem) {
                    toolStatusItem.style.display = 'flex';
                }
            }
        }
        
        // Update QGL status
        const qglObjects = Object.keys(status).filter(key => key.startsWith('quad_gantry_level'));
        if (qglObjects.length > 0) {
            const qglItem = document.getElementById('qglStatusItem');
            if (qglItem) {
                qglItem.style.display = 'flex';
            }
            
            qglObjects.forEach(qglKey => {
                const qglData = status[qglKey];
                if (qglData && qglData.applied !== undefined) {
                    const dotElement = document.getElementById('qglDot');
                    const textElement = document.getElementById('qglText');
                    
                    if (dotElement && textElement) {
                        const isApplied = qglData.applied === true;
                        dotElement.className = `status-dot ${isApplied ? 'applied' : 'not-applied'}`;
                        textElement.textContent = isApplied ? 'Applied' : 'Not Applied';
                    }
                }
            });
        }
        
        // Update Z_TILT status
        const zTiltObjects = Object.keys(status).filter(key => key.startsWith('z_tilt'));
        if (zTiltObjects.length > 0) {
            const zTiltItem = document.getElementById('zTiltStatusItem');
            if (zTiltItem) {
                zTiltItem.style.display = 'flex';
            }
            
            zTiltObjects.forEach(zTiltKey => {
                const zTiltData = status[zTiltKey];
                if (zTiltData && zTiltData.applied !== undefined) {
                    const dotElement = document.getElementById('zTiltDot');
                    const textElement = document.getElementById('zTiltText');
                    
                    if (dotElement && textElement) {
                        const isApplied = zTiltData.applied === true;
                        dotElement.className = `status-dot ${isApplied ? 'applied' : 'not-applied'}`;
                        textElement.textContent = isApplied ? 'Applied' : 'Not Applied';
                    }
                }
            });
        }
        
        // Temperature sensor updates - handle all temperature sensors dynamically
        // Get all temperature sensor keys from status
        const statusTempSensorKeys = Object.keys(status).filter(key => key.startsWith('temperature_sensor'));
        
        // Update each temperature sensor found in status
        statusTempSensorKeys.forEach(sensorKey => {
            const sensorData = status[sensorKey];
            if (!sensorData || sensorData.temperature === undefined) {
                return;
            }
            
            // Find the matching DOM element by checking all sensor elements
            const sensorElements = document.querySelectorAll('[data-sensor]');
            let tempElement = null;
            
            for (const element of sensorElements) {
                const elementSensorName = element.getAttribute('data-sensor');
                if (!elementSensorName || !elementSensorName.startsWith('temperature_sensor')) {
                    continue;
                }
                
                // Check if this element matches the status sensor key
                // Normalize both names for comparison (handle spaces, case)
                const normalizedElementName = elementSensorName.replace(/\s+/g, ' ').trim().toLowerCase();
                const normalizedStatusKey = sensorKey.replace(/\s+/g, ' ').trim().toLowerCase();
                
                if (elementSensorName === sensorKey || normalizedElementName === normalizedStatusKey) {
                    // Found matching element, get the temperature span
                    const sensorId = elementSensorName.replace(/[^a-zA-Z0-9]/g, '_');
                    tempElement = document.getElementById(`sensor_${sensorId}`);
                    break;
                }
            }
            
            // If not found by data-sensor attribute, try direct ID lookup
            if (!tempElement) {
                const sensorId = sensorKey.replace(/[^a-zA-Z0-9]/g, '_');
                tempElement = document.getElementById(`sensor_${sensorId}`);
            }
            
            // Update the temperature display
            if (tempElement) {
                const tempValue = Math.round(sensorData.temperature * 10) / 10;
                tempElement.textContent = tempValue;
            } else {
                // Only log warning once per sensor to avoid console spam
                if (!window._tempSensorWarnings) {
                    window._tempSensorWarnings = new Set();
                }
                if (!window._tempSensorWarnings.has(sensorKey)) {
                    console.warn(`Could not find element for temperature sensor: ${sensorKey}`);
                    console.log(`  Config sensors:`, printerConfig.temperature_sensors);
                    console.log(`  Status sensors:`, statusTempSensorKeys);
                    window._tempSensorWarnings.add(sensorKey);
                }
            }
        });
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

// Set movement mode (relative or absolute)
let currentMovementMode = 'relative';

function setMovementMode(mode) {
    currentMovementMode = mode;
    window.currentMovementMode = mode;
    
    const relativeBtn = document.getElementById('relativeModeBtn');
    const absoluteBtn = document.getElementById('absoluteModeBtn');
    
    if (relativeBtn && absoluteBtn) {
        if (mode === 'relative') {
            relativeBtn.classList.add('active');
            absoluteBtn.classList.remove('active');
            // Clear placeholders
            ['xMove', 'yMove', 'zMove', 'eMove'].forEach(id => {
                const input = document.getElementById(id);
                if (input) input.placeholder = 'mm';
            });
        } else {
            absoluteBtn.classList.add('active');
            relativeBtn.classList.remove('active');
            // Update placeholders with current position
            requestStatus();
        }
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
            addConsoleMessage(`Move ${axis} ${distanceToMove > 0 ? '+' : ''}${distanceToMove}mm (relative)`, 'command');
            input.value = '';
            setTimeout(requestStatus, 500);
        }
    } catch (error) {
        console.error('Error moving printer:', error);
        alert('Failed to move printer');
    }
}

// Move to absolute position
async function moveToPosition(axis) {
    const input = document.getElementById(axis.toLowerCase() + 'Move');
    const targetPosition = parseFloat(input.value);
    
    if (isNaN(targetPosition)) {
        alert(`Please enter a valid ${axis} position`);
        return;
    }
    
    const speed = parseInt(document.getElementById('moveSpeed').value) || 100;
    const moveData = { type: 'absolute', speed };
    moveData[axis.toLowerCase()] = targetPosition;
    
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
            addConsoleMessage(`Move ${axis} to ${targetPosition}mm (absolute)`, 'command');
            input.value = '';
            setTimeout(requestStatus, 500);
        }
    } catch (error) {
        console.error('Error moving printer:', error);
        alert('Failed to move printer');
    }
}

// Handle Enter key press in movement inputs
function handleMoveKeyPress(event, axis) {
    if (event.key === 'Enter') {
        if (currentMovementMode === 'absolute') {
            moveToPosition(axis);
        } else {
            const input = document.getElementById(axis.toLowerCase() + 'Move');
            const value = parseFloat(input.value);
            if (!isNaN(value)) {
                moveRelative(axis, value);
            }
        }
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
    
    await sendGcodeCommand(command);
}

function handleGcodeKeyPress(event) {
    if (event.key === 'Enter') {
        sendGcode();
    }
}

// Load and display macros
async function loadMacros() {
    const container = document.getElementById('macrosContainer');
    if (!container) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/macros`);
        const result = await response.json();
        
        if (result.error) {
            container.innerHTML = `<p style="color: red;">Error loading macros: ${result.error}</p>`;
            return;
        }
        
        const categorized = result.categorized || {};
        
        if (Object.keys(categorized).length === 0) {
            container.innerHTML = '<p>No macros found</p>';
            return;
        }
        
        let html = '';
        for (const [category, macros] of Object.entries(categorized)) {
            if (macros.length === 0) continue;
            
            html += `<div class="macro-category">`;
            html += `<h4 class="macro-category-title">${category}</h4>`;
            html += `<div class="macro-buttons">`;
            
            macros.forEach(macro => {
                html += `<button class="btn btn-small macro-btn" onclick="runMacro('${macro}')">${macro}</button>`;
            });
            
            html += `</div></div>`;
        }
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading macros:', error);
        container.innerHTML = '<p style="color: red;">Failed to load macros</p>';
    }
}

// Run a macro
async function runMacro(macroName) {
    addConsoleMessage(`Running macro: ${macroName}`, 'command');
    await sendGcodeCommand(macroName);
}

// Send G-code command (extracted from sendGcode for reuse)
async function sendGcodeCommand(command) {
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set default movement mode to relative
    setMovementMode('relative');
    
    loadPrinterConfig().then(() => {
        loadFileList();
        loadMacros();
        // Request status updates every 2 seconds (throttled internally)
        setInterval(requestStatus, 2000);
        addConsoleMessage('Klipper UI initialized', 'response');
    });
});
