// RGB LED Control Plugin JavaScript
let customLedMode = false;
let lastColor = { r: 255, g: 255, b: 255 };
let lastBrightness = 100;

// Initialize plugin when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeRGBLEDControls();
    loadLEDList();
});

function initializeRGBLEDControls() {
    // Set up color picker
    const colorPicker = document.getElementById('rgb-color-picker');
    if (colorPicker) {
        colorPicker.addEventListener('input', (e) => {
            const hex = e.target.value;
            const rgb = hexToRgb(hex);
            if (rgb) {
                updateSlidersFromColor(rgb.r, rgb.g, rgb.b);
                lastColor = rgb;
            }
        });
    }
    
    // Set up RGB sliders
    ['red', 'green', 'blue'].forEach(color => {
        const slider = document.getElementById(`${color}-slider`);
        const valueDisplay = document.getElementById(`${color}-value`);
        
        if (slider && valueDisplay) {
            slider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                valueDisplay.textContent = value;
                
                // Update color picker
                const r = parseInt(document.getElementById('red-slider').value);
                const g = parseInt(document.getElementById('green-slider').value);
                const b = parseInt(document.getElementById('blue-slider').value);
                updateColorPickerFromSliders(r, g, b);
                lastColor = { r, g, b };
            });
        }
    });
    
    // Set up brightness slider
    const brightnessSlider = document.getElementById('brightness-slider');
    const brightnessValue = document.getElementById('brightness-value');
    if (brightnessSlider && brightnessValue) {
        brightnessSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            brightnessValue.textContent = value;
            lastBrightness = value;
        });
    }
    
    // Set up LED name selector
    const ledSelect = document.getElementById('led-name-select');
    if (ledSelect) {
        ledSelect.addEventListener('change', (e) => {
            if (!customLedMode) {
                // Update custom input if in custom mode
                const customInput = document.getElementById('led-name-custom');
                if (customInput) {
                    customInput.value = e.target.value;
                }
            }
        });
    }
}

// Load available LED objects from Moonraker
async function loadLEDList() {
    const ledSelect = document.getElementById('led-name-select');
    if (!ledSelect) return;
    
    // Show loading state
    ledSelect.innerHTML = '<option value="">Loading...</option>';
    ledSelect.disabled = true;
    
    try {
        const response = await fetch('/api/plugins/rgb_led/list');
        
        // Check if response is OK
        if (!response.ok) {
            if (response.status === 404) {
                ledSelect.innerHTML = '<option value="">Route not found (restart app?)</option>';
                showStatus('LED list endpoint not found. Please restart the Klipper UI application.', 'error');
                ledSelect.disabled = false;
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Response is not JSON. Server may need to be restarted.');
        }
        
        const result = await response.json();
        
        ledSelect.innerHTML = ''; // Clear loading option
        
        if (result.error) {
            ledSelect.innerHTML = '<option value="">Error loading LEDs</option>';
            showStatus(`Error: ${result.error}`, 'error');
            return;
        }
        
        const leds = result.leds || [];
        
        if (leds.length === 0) {
            // No LEDs found, but allow custom input
            ledSelect.innerHTML = '<option value="">No LEDs found (use Custom)</option>';
            // Don't show status for empty list - user can still use custom
        } else {
            // Populate with found LEDs
            leds.forEach(led => {
                const option = document.createElement('option');
                option.value = led;
                option.textContent = led;
                ledSelect.appendChild(option);
            });
            
            // Select first LED by default
            if (leds.length > 0) {
                ledSelect.value = leds[0];
            }
            
            // Only show success message if we found LEDs (quiet success)
            // Status will clear automatically after 3 seconds
        }
        
        ledSelect.disabled = false;
    } catch (error) {
        console.error('Error loading LED list:', error);
        ledSelect.innerHTML = '<option value="">Error loading LEDs</option>';
        
        // Provide helpful error message
        let errorMsg = error.message;
        if (error.message.includes('JSON') || error.message.includes('Unexpected token')) {
            errorMsg = 'Server returned HTML instead of JSON. Please restart the Klipper UI application.';
        }
        
        showStatus(`Error: ${errorMsg}`, 'error');
        ledSelect.disabled = false;
    }
}

// Refresh LED list
function rgbLedRefreshList() {
    loadLEDList();
}

// Convert hex color to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// Convert RGB to hex
function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    }).join("");
}

// Update sliders from color values
function updateSlidersFromColor(r, g, b) {
    const redSlider = document.getElementById('red-slider');
    const greenSlider = document.getElementById('green-slider');
    const blueSlider = document.getElementById('blue-slider');
    const redValue = document.getElementById('red-value');
    const greenValue = document.getElementById('green-value');
    const blueValue = document.getElementById('blue-value');
    
    if (redSlider) redSlider.value = r;
    if (greenSlider) greenSlider.value = g;
    if (blueSlider) blueSlider.value = b;
    if (redValue) redValue.textContent = r;
    if (greenValue) greenValue.textContent = g;
    if (blueValue) blueValue.textContent = b;
}

// Update color picker from slider values
function updateColorPickerFromSliders(r, g, b) {
    const colorPicker = document.getElementById('rgb-color-picker');
    if (colorPicker) {
        colorPicker.value = rgbToHex(r, g, b);
    }
}

// Toggle custom LED name input
function rgbLedToggleCustom() {
    customLedMode = !customLedMode;
    const customInput = document.getElementById('led-name-custom');
    const select = document.getElementById('led-name-select');
    const button = event.target;
    
    if (customLedMode) {
        if (customInput) {
            customInput.style.display = 'block';
            customInput.value = select ? select.value : '';
            customInput.focus();
        }
        if (select) select.style.display = 'none';
        if (button) button.textContent = 'Use Preset';
    } else {
        if (customInput) {
            if (customInput.value.trim()) {
                // Add custom value to select if not already there
                if (select) {
                    const option = Array.from(select.options).find(opt => opt.value === customInput.value.trim());
                    if (!option) {
                        const newOption = document.createElement('option');
                        newOption.value = customInput.value.trim();
                        newOption.textContent = customInput.value.trim();
                        select.appendChild(newOption);
                    }
                    select.value = customInput.value.trim();
                }
            }
            customInput.style.display = 'none';
        }
        if (select) select.style.display = 'block';
        if (button) button.textContent = 'Custom';
    }
}

// Get current LED name
function getLedName() {
    if (customLedMode) {
        const customInput = document.getElementById('led-name-custom');
        const name = customInput ? customInput.value.trim() : '';
        if (!name) {
            showStatus('Please enter an LED name', 'error');
            return null;
        }
        return name;
    } else {
        const select = document.getElementById('led-name-select');
        const name = select ? select.value : '';
        if (!name || name === '' || name === 'Loading...' || name.includes('Error') || name.includes('No LEDs')) {
            showStatus('Please select an LED or use Custom to enter a name', 'error');
            return null;
        }
        return name;
    }
}

// Get current color values
function getCurrentColor() {
    const r = parseInt(document.getElementById('red-slider').value);
    const g = parseInt(document.getElementById('green-slider').value);
    const b = parseInt(document.getElementById('blue-slider').value);
    return { r, g, b };
}

// Get current brightness
function getCurrentBrightness() {
    const brightnessSlider = document.getElementById('brightness-slider');
    return brightnessSlider ? parseInt(brightnessSlider.value) : 100;
}

// Apply LED color
async function rgbLedApply() {
    const ledName = getLedName();
    if (!ledName) return; // Validation failed
    
    const color = getCurrentColor();
    const brightness = getCurrentBrightness();
    
    showStatus('Applying color...', 'info');
    
    try {
        const response = await fetch('/api/plugins/rgb_led/set_color', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                led: ledName,
                red: color.r,
                green: color.g,
                blue: color.b,
                brightness: brightness
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showStatus(`Error: ${result.error}`, 'error');
        } else {
            showStatus(`Color applied to ${ledName}`, 'success');
            lastColor = color;
            lastBrightness = brightness;
        }
    } catch (error) {
        console.error('Error applying LED color:', error);
        showStatus(`Error: ${error.message}`, 'error');
    }
}

// Turn LED off
async function rgbLedOff() {
    const ledName = getLedName();
    if (!ledName) return; // Validation failed
    
    showStatus('Turning off LED...', 'info');
    
    try {
        const response = await fetch('/api/plugins/rgb_led/off', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ led: ledName })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showStatus(`Error: ${result.error}`, 'error');
        } else {
            showStatus(`${ledName} turned off`, 'success');
        }
    } catch (error) {
        console.error('Error turning off LED:', error);
        showStatus(`Error: ${error.message}`, 'error');
    }
}

// Turn LED on
async function rgbLedOn() {
    const ledName = getLedName();
    if (!ledName) return; // Validation failed
    
    const color = getCurrentColor();
    const brightness = getCurrentBrightness();
    
    showStatus('Turning on LED...', 'info');
    
    try {
        const response = await fetch('/api/plugins/rgb_led/on', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                led: ledName,
                red: color.r,
                green: color.g,
                blue: color.b,
                brightness: brightness
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showStatus(`Error: ${result.error}`, 'error');
        } else {
            showStatus(`${ledName} turned on`, 'success');
        }
    } catch (error) {
        console.error('Error turning on LED:', error);
        showStatus(`Error: ${error.message}`, 'error');
    }
}

// Set preset color
function rgbLedSetPreset(hexColor) {
    const rgb = hexToRgb(hexColor);
    if (rgb) {
        updateSlidersFromColor(rgb.r, rgb.g, rgb.b);
        updateColorPickerFromSliders(rgb.r, rgb.g, rgb.b);
        lastColor = rgb;
        
        // Auto-apply if desired (optional - you can remove this if you want manual apply)
        // rgbLedApply();
    }
}

// Show status message
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('led-status-message');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status-message status-${type}`;
        
        // Clear status after 3 seconds
        setTimeout(() => {
            if (statusEl.textContent === message) {
                statusEl.textContent = '';
                statusEl.className = 'status-message';
            }
        }, 3000);
    }
}

// Make functions globally available
window.rgbLedApply = rgbLedApply;
window.rgbLedOff = rgbLedOff;
window.rgbLedOn = rgbLedOn;
window.rgbLedSetPreset = rgbLedSetPreset;
window.rgbLedToggleCustom = rgbLedToggleCustom;
window.rgbLedRefreshList = rgbLedRefreshList;
