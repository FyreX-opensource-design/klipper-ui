"""
RGB LED Control Plugin for Klipper UI
Controls RGB LEDs via Moonraker G-code commands
"""
import os
from plugins import Plugin


class RGBLEDPlugin(Plugin):
    """RGB LED Control Plugin"""
    
    def __init__(self, name: str, path: str):
        super().__init__(name, path)
        self.metadata = {
            'version': '1.0.0',
            'description': 'Control RGB LEDs on your Klipper printer',
            'author': 'Klipper UI'
        }
    
    def get_html(self) -> str:
        """Return HTML content for the RGB LED control panel"""
        return """
        <section class="panel plugin-panel" id="rgb-led-plugin-panel">
            <h2>💡 RGB LED Control</h2>
            <div class="plugin-content">
                <div class="led-control-section">
                    <div class="led-selector">
                        <label for="led-name-select">LED Strip:</label>
                        <select id="led-name-select" class="led-select">
                            <option value="">Loading...</option>
                        </select>
                        <input type="text" id="led-name-custom" class="led-custom-input" placeholder="Custom name" style="display: none;">
                        <button class="btn btn-small" onclick="rgbLedToggleCustom()">Custom</button>
                        <button class="btn btn-small" onclick="rgbLedRefreshList()" title="Refresh LED list">🔄</button>
                    </div>
                </div>
                
                <div class="led-control-section">
                    <div class="color-picker-container">
                        <label>Color Picker:</label>
                        <input type="color" id="rgb-color-picker" class="color-picker" value="#ffffff">
                    </div>
                </div>
                
                <div class="led-control-section">
                    <div class="rgb-sliders">
                        <div class="slider-group">
                            <label for="red-slider">Red: <span id="red-value">255</span></label>
                            <input type="range" id="red-slider" class="color-slider red-slider" min="0" max="255" value="255">
                        </div>
                        <div class="slider-group">
                            <label for="green-slider">Green: <span id="green-value">255</span></label>
                            <input type="range" id="green-slider" class="color-slider green-slider" min="0" max="255" value="255">
                        </div>
                        <div class="slider-group">
                            <label for="blue-slider">Blue: <span id="blue-value">255</span></label>
                            <input type="range" id="blue-slider" class="color-slider blue-slider" min="0" max="255" value="255">
                        </div>
                    </div>
                </div>
                
                <div class="led-control-section">
                    <div class="brightness-control">
                        <label for="brightness-slider">Brightness: <span id="brightness-value">100</span>%</label>
                        <input type="range" id="brightness-slider" class="brightness-slider" min="0" max="100" value="100">
                    </div>
                </div>
                
                <div class="led-control-section">
                    <div class="preset-colors">
                        <label>Preset Colors:</label>
                        <div class="preset-grid">
                            <button class="preset-color" data-color="#ff0000" style="background: #ff0000;" onclick="rgbLedSetPreset('#ff0000')" title="Red"></button>
                            <button class="preset-color" data-color="#00ff00" style="background: #00ff00;" onclick="rgbLedSetPreset('#00ff00')" title="Green"></button>
                            <button class="preset-color" data-color="#0000ff" style="background: #0000ff;" onclick="rgbLedSetPreset('#0000ff')" title="Blue"></button>
                            <button class="preset-color" data-color="#ffff00" style="background: #ffff00;" onclick="rgbLedSetPreset('#ffff00')" title="Yellow"></button>
                            <button class="preset-color" data-color="#ff00ff" style="background: #ff00ff;" onclick="rgbLedSetPreset('#ff00ff')" title="Magenta"></button>
                            <button class="preset-color" data-color="#00ffff" style="background: #00ffff;" onclick="rgbLedSetPreset('#00ffff')" title="Cyan"></button>
                            <button class="preset-color" data-color="#ffffff" style="background: #ffffff; border: 1px solid #ccc;" onclick="rgbLedSetPreset('#ffffff')" title="White"></button>
                            <button class="preset-color" data-color="#ffa500" style="background: #ffa500;" onclick="rgbLedSetPreset('#ffa500')" title="Orange"></button>
                            <button class="preset-color" data-color="#800080" style="background: #800080;" onclick="rgbLedSetPreset('#800080')" title="Purple"></button>
                            <button class="preset-color" data-color="#ff69b4" style="background: #ff69b4;" onclick="rgbLedSetPreset('#ff69b4')" title="Pink"></button>
                            <button class="preset-color" data-color="#00ff88" style="background: #00ff88;" onclick="rgbLedSetPreset('#00ff88')" title="Mint"></button>
                            <button class="preset-color" data-color="#000000" style="background: #000000; border: 1px solid #ccc;" onclick="rgbLedSetPreset('#000000')" title="Off"></button>
                        </div>
                    </div>
                </div>
                
                <div class="led-control-section">
                    <div class="led-actions">
                        <button class="btn btn-primary" onclick="rgbLedApply()">Apply Color</button>
                        <button class="btn btn-secondary" onclick="rgbLedOff()">Turn Off</button>
                        <button class="btn btn-secondary" onclick="rgbLedOn()">Turn On</button>
                    </div>
                </div>
                
                <div class="led-control-section">
                    <div class="led-status">
                        <div id="led-status-message" class="status-message"></div>
                    </div>
                </div>
            </div>
        </section>
        """
    
    def get_css(self) -> list:
        """Return list of CSS files"""
        css_file = os.path.join(self.path, 'style.css')
        if os.path.exists(css_file):
            return ['style.css']
        return []
    
    def get_js(self) -> list:
        """Return list of JavaScript files"""
        js_file = os.path.join(self.path, 'script.js')
        if os.path.exists(js_file):
            return ['script.js']
        return []
    
    def initialize(self, app, moonraker_client):
        """Initialize the plugin and register API endpoints"""
        def set_led_color(moonraker=None):
            """Set LED color via G-code"""
            from flask import jsonify, request
            if not moonraker:
                return jsonify({'error': 'Moonraker not available'}), 503
            
            data = request.json
            led_name = data.get('led', 'led')
            red = data.get('red', 255)
            green = data.get('green', 255)
            blue = data.get('blue', 255)
            brightness = data.get('brightness', 100)
            
            # Apply brightness (0-100% to 0-1.0)
            brightness_factor = brightness / 100.0
            red = int(red * brightness_factor)
            green = int(green * brightness_factor)
            blue = int(blue * brightness_factor)
            
            # Clamp values to 0-255
            red = max(0, min(255, red))
            green = max(0, min(255, green))
            blue = max(0, min(255, blue))
            
            # Convert to 0-1.0 range for Klipper SET_LED command
            red_norm = red / 255.0
            green_norm = green / 255.0
            blue_norm = blue / 255.0
            
            # Send G-code command
            gcode = f'SET_LED LED={led_name} RED={red_norm:.3f} GREEN={green_norm:.3f} BLUE={blue_norm:.3f}'
            result = moonraker.gcode_command(gcode)
            
            if result.get('error'):
                return jsonify({'error': result['error']}), 500
            
            return jsonify({
                'status': 'ok',
                'led': led_name,
                'red': red,
                'green': green,
                'blue': blue,
                'brightness': brightness,
                'gcode': gcode
            })
        
        def turn_led_off(moonraker=None):
            """Turn LED off"""
            from flask import jsonify, request
            if not moonraker:
                return jsonify({'error': 'Moonraker not available'}), 503
            
            data = request.json
            led_name = data.get('led', 'led')
            
            # Send G-code to turn off LED
            gcode = f'SET_LED LED={led_name}'
            result = moonraker.gcode_command(gcode)
            
            if result.get('error'):
                return jsonify({'error': result['error']}), 500
            
            return jsonify({
                'status': 'ok',
                'led': led_name,
                'action': 'off',
                'gcode': gcode
            })
        
        def turn_led_on(moonraker=None):
            """Turn LED on with last color"""
            from flask import jsonify, request
            if not moonraker:
                return jsonify({'error': 'Moonraker not available'}), 503
            
            data = request.json
            led_name = data.get('led', 'led')
            red = data.get('red', 255)
            green = data.get('green', 255)
            blue = data.get('blue', 255)
            brightness = data.get('brightness', 100)
            
            # Apply brightness
            brightness_factor = brightness / 100.0
            red = int(red * brightness_factor)
            green = int(green * brightness_factor)
            blue = int(blue * brightness_factor)
            
            # Clamp values
            red = max(0, min(255, red))
            green = max(0, min(255, green))
            blue = max(0, min(255, blue))
            
            # Convert to 0-1.0 range
            red_norm = red / 255.0
            green_norm = green / 255.0
            blue_norm = blue / 255.0
            
            # Send G-code command
            gcode = f'SET_LED LED={led_name} RED={red_norm:.3f} GREEN={green_norm:.3f} BLUE={blue_norm:.3f}'
            result = moonraker.gcode_command(gcode)
            
            if result.get('error'):
                return jsonify({'error': result['error']}), 500
            
            return jsonify({
                'status': 'ok',
                'led': led_name,
                'action': 'on',
                'red': red,
                'green': green,
                'blue': blue,
                'brightness': brightness,
                'gcode': gcode
            })
        
        def get_available_leds(moonraker=None):
            """Get list of available LED objects from Klipper"""
            from flask import jsonify
            if not moonraker:
                return jsonify({'error': 'Moonraker not available'}), 503
            
            try:
                # Get list of all available objects
                objects_result = moonraker.get_available_objects()
                if objects_result.get('error'):
                    return jsonify({'error': objects_result['error']}), 500
                
                available_objects = objects_result.get('result', {}).get('objects', [])
                if not available_objects:
                    return jsonify({'leds': [], 'error': 'No objects found'})
                
                # Filter for LED-related objects
                # Klipper LED objects are typically:
                # - neopixel (or neopixel <name>)
                # - led (or led <name>)
                # - dotstar (or dotstar <name>)
                led_objects = []
                for obj in available_objects:
                    obj_lower = obj.lower()
                    # Check for neopixel LEDs
                    if obj_lower.startswith('neopixel'):
                        if obj_lower == 'neopixel':
                            led_objects.append('neopixel')
                        else:
                            # Extract name: "neopixel my_led" -> "my_led"
                            parts = obj.split(' ', 1)
                            if len(parts) > 1:
                                led_objects.append(parts[1])
                            else:
                                led_objects.append(obj)
                    # Check for generic LED objects
                    elif obj_lower.startswith('led '):
                        # Extract name: "led my_led" -> "my_led"
                        parts = obj.split(' ', 1)
                        if len(parts) > 1:
                            led_objects.append(parts[1])
                    elif obj_lower == 'led':
                        led_objects.append('led')
                    # Check for dotstar LEDs
                    elif obj_lower.startswith('dotstar'):
                        if obj_lower == 'dotstar':
                            led_objects.append('dotstar')
                        else:
                            parts = obj.split(' ', 1)
                            if len(parts) > 1:
                                led_objects.append(parts[1])
                            else:
                                led_objects.append(obj)
                
                # Remove duplicates and sort
                led_objects = sorted(list(set(led_objects)))
                
                # If no LEDs found, return empty list (user can still use custom)
                return jsonify({
                    'status': 'ok',
                    'leds': led_objects
                })
            except Exception as e:
                return jsonify({'error': str(e)}), 500
        
        # Register API endpoints
        self.register_route('/set_color', set_led_color, methods=['POST'])
        self.register_route('/off', turn_led_off, methods=['POST'])
        self.register_route('/on', turn_led_on, methods=['POST'])
        self.register_route('/list', get_available_leds, methods=['GET'])
