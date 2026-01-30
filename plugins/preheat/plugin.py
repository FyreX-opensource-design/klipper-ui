"""
Preheat Plugin for Klipper UI
Allows preheating with toolhead selection and preset temperatures
"""
import os
import json
from plugins import Plugin


class PreheatPlugin(Plugin):
    """Preheat Plugin for executing preheat macros with toolhead options"""
    
    def __init__(self, name: str, path: str):
        super().__init__(name, path)
        self.metadata = {
            'version': '1.0.0',
            'description': 'Preheat your printer with toolhead selection',
            'author': 'Klipper UI'
        }
        self.config = self._load_config()
    
    def _load_config(self):
        """Load configuration from config.json"""
        config_path = os.path.join(self.path, 'config.json')
        default_config = {
            "macro_name": "PREHEAT",
            "presets": [
                {
                    "name": "PLA",
                    "hotend_temp": 210,
                    "bed_temp": 60
                },
                {
                    "name": "PETG",
                    "hotend_temp": 240,
                    "bed_temp": 80
                }
            ],
            "default_toolhead": "extruder"
        }
        
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r') as f:
                    config = json.load(f)
                    # Merge with defaults to ensure all keys exist
                    default_config.update(config)
                    return default_config
            except Exception as e:
                print(f"Error loading preheat config: {e}")
                return default_config
        else:
            # Create default config file
            try:
                with open(config_path, 'w') as f:
                    json.dump(default_config, f, indent=2)
            except Exception as e:
                print(f"Error creating default config: {e}")
            return default_config
    
    def get_html(self) -> str:
        """Return HTML content for the preheat panel"""
        presets_html = ""
        for idx, preset in enumerate(self.config.get('presets', [])):
            preset_name = preset.get('name', 'Unknown')
            hotend_temp = preset.get('hotend_temp', 0)
            bed_temp = preset.get('bed_temp', 0)
            # Store preset data in data attribute as JSON (escape quotes and HTML entities)
            preset_json = json.dumps(preset).replace('"', '&quot;').replace("'", "&#39;")
            presets_html += f"""
                <button class="preset-btn" data-preset="{preset_json}" onclick="preheatExecutePresetFromButton(this)">
                    <div class="preset-name">{preset_name}</div>
                    <div class="preset-temps">
                        <span class="temp-label">Hotend:</span> <span class="temp-value">{hotend_temp}°C</span>
                        <span class="temp-separator">|</span>
                        <span class="temp-label">Bed:</span> <span class="temp-value">{bed_temp}°C</span>
                    </div>
                </button>
            """
        
        return f"""
        <section class="panel plugin-panel" id="preheat-plugin-panel">
            <h2>🔥 Preheat</h2>
            <div class="plugin-content">
                <div class="preheat-control-section">
                    <div class="toolhead-selector">
                        <label for="preheat-toolhead-select">Toolhead:</label>
                        <select id="preheat-toolhead-select" class="toolhead-select">
                            <option value="">Loading...</option>
                        </select>
                        <button class="btn btn-small" onclick="preheatRefreshToolheads()" title="Refresh toolhead list">🔄</button>
                    </div>
                </div>
                
                <div class="preheat-control-section">
                    <div class="custom-temp-controls">
                        <h3>Custom Temperature</h3>
                        <div class="temp-input-group">
                            <label for="preheat-hotend-temp">Hotend Temperature (°C):</label>
                            <input type="number" id="preheat-hotend-temp" class="temp-input" min="0" max="400" value="210" step="5">
                        </div>
                        <div class="temp-input-group">
                            <label for="preheat-bed-temp">Bed Temperature (°C):</label>
                            <input type="number" id="preheat-bed-temp" class="temp-input" min="0" max="150" value="60" step="5">
                        </div>
                        <button class="btn btn-primary" onclick="preheatExecuteCustom()">Preheat Custom</button>
                    </div>
                </div>
                
                <div class="preheat-control-section">
                    <div class="preset-controls">
                        <h3>Preset Materials</h3>
                        <div class="presets-grid">
                            {presets_html}
                        </div>
                    </div>
                </div>
                
                <div class="preheat-control-section">
                    <div class="preheat-status">
                        <div id="preheat-status-message" class="status-message"></div>
                    </div>
                </div>
            </div>
        </section>
        """
    
    def get_css(self) -> list:
        """Return CSS files for this plugin"""
        css_file = os.path.join(self.path, 'style.css')
        if os.path.exists(css_file):
            return ['style.css']
        return []
    
    def get_js(self) -> list:
        """Return JavaScript files for this plugin"""
        js_file = os.path.join(self.path, 'script.js')
        if os.path.exists(js_file):
            return ['script.js']
        return []
    
    def initialize(self, app, moonraker_client):
        """Initialize the plugin and register API endpoints"""
        def execute_preheat(moonraker=None):
            """Execute preheat macro with toolhead option and all preset arguments"""
            from flask import jsonify, request
            if not moonraker:
                return jsonify({'error': 'Moonraker not available'}), 503
            
            data = request.json
            toolhead = data.get('toolhead', self.config.get('default_toolhead', 'extruder'))
            macro_name = data.get('macro_name', self.config.get('macro_name', 'PREHEAT'))
            
            # Build macro command with toolhead parameter and all other arguments
            # Format: MACRO_NAME TOOLHEAD=extruder HOTEND_TEMP=210 BED_TEMP=60 TEMPS=210/60 ...
            gcode_parts = [macro_name]
            
            if toolhead:
                gcode_parts.append(f'TOOLHEAD={toolhead}')
            
            # Pass all other fields from the request as macro arguments
            # Exclude internal fields like 'toolhead' and 'macro_name'
            excluded_fields = {'toolhead', 'macro_name'}
            for key, value in data.items():
                if key not in excluded_fields and value is not None:
                    # Format the argument: KEY=VALUE
                    # Handle different value types
                    if isinstance(value, (int, float)):
                        gcode_parts.append(f'{key.upper()}={value}')
                    elif isinstance(value, bool):
                        gcode_parts.append(f'{key.upper()}={1 if value else 0}')
                    elif isinstance(value, str):
                        # Escape spaces and special characters if needed
                        if ' ' in value:
                            gcode_parts.append(f'{key.upper()}="{value}"')
                        else:
                            gcode_parts.append(f'{key.upper()}={value}')
            
            gcode = ' '.join(gcode_parts)
            
            # Execute the macro
            result = moonraker.gcode_command(gcode)
            
            if result.get('error'):
                return jsonify({'error': result['error']}), 500
            
            return jsonify({
                'status': 'ok',
                'toolhead': toolhead,
                'macro': macro_name,
                'gcode': gcode,
                'arguments': {k: v for k, v in data.items() if k not in excluded_fields}
            })
        
        def get_available_toolheads(moonraker=None):
            """Get list of available toolheads/extruders"""
            from flask import jsonify
            if not moonraker:
                return jsonify({'error': 'Moonraker not available'}), 503
            
            try:
                # Get printer config to find extruders
                config = moonraker.get_printer_config()
                if config.get('error'):
                    return jsonify({'error': config['error']}), 500
                
                extruders = config.get('extruders', [])
                
                # Format extruder names (remove 'extruder' prefix if it's just 'extruder')
                toolheads = []
                for ext in extruders:
                    if ext == 'extruder':
                        toolheads.append('extruder')
                    elif ext.startswith('extruder'):
                        # Extract name: "extruder1" -> "extruder1" or "extruder my_extruder" -> "my_extruder"
                        parts = ext.split(' ', 1)
                        if len(parts) > 1:
                            toolheads.append(parts[1])
                        else:
                            toolheads.append(ext)
                    else:
                        toolheads.append(ext)
                
                # Remove duplicates and sort
                toolheads = sorted(list(set(toolheads)))
                
                # If no toolheads found, return default
                if not toolheads:
                    toolheads = [self.config.get('default_toolhead', 'extruder')]
                
                return jsonify({
                    'status': 'ok',
                    'toolheads': toolheads
                })
            except Exception as e:
                return jsonify({'error': str(e)}), 500
        
        def get_config(moonraker=None):
            """Get plugin configuration"""
            from flask import jsonify
            return jsonify({
                'status': 'ok',
                'config': self.config
            })
        
        # Register API endpoints
        self.register_route('/execute', execute_preheat, methods=['POST'])
        self.register_route('/toolheads', get_available_toolheads, methods=['GET'])
        self.register_route('/config', get_config, methods=['GET'])
