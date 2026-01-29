"""
Flask application for Klipper printer control via Moonraker API
Similar to Mainsail/Fluidd functionality
"""
import os
import json
import requests
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit
import logging
from plugins import PluginManager

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# SocketIO will auto-detect available async mode (threading is default, eventlet if available)
socketio = SocketIO(app, cors_allowed_origins="*")

# Moonraker configuration
MOONRAKER_URL = os.environ.get('MOONRAKER_URL', 'http://localhost:7125')
MOONRAKER_WS_URL = os.environ.get('MOONRAKER_WS_URL', 'ws://localhost:7125/websocket')

# Camera configuration
CAMERA_CONFIG_PATH = os.environ.get('CAMERA_CONFIG_PATH', os.path.join(os.path.dirname(__file__), 'camera_config.json'))

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MoonrakerClient:
    """Client for interacting with Moonraker API"""
    
    def __init__(self, base_url):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.timeout = 5
        # Increase connection pool size to avoid warnings
        adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20)
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)
    
    def _request(self, method, endpoint, **kwargs):
        """Make HTTP request to Moonraker"""
        url = f"{self.base_url}{endpoint}"
        try:
            response = self.session.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Moonraker request failed: {e}")
            return {"error": str(e)}
    
    def get_printer_info(self):
        """Get printer information"""
        return self._request('GET', '/printer/info')
    
    def get_printer_status(self):
        """Get current printer status"""
        return self._request('GET', '/printer/status')
    
    def get_available_objects(self):
        """Get list of all available printer objects"""
        return self._request('GET', '/printer/objects/list')
    
    def get_printer_config(self):
        """Get printer configuration and available hardware"""
        # Get list of available objects
        objects_result = self.get_available_objects()
        if objects_result.get('error'):
            logger.warning(f"Could not get printer objects list: {objects_result.get('error')}")
            # Return empty config if we can't get the list
            return {
                'heaters': [],
                'fans': [],
                'extruders': [],
                'temperature_sensors': [],
                'all_objects': []
            }
        
        # Moonraker returns objects in result.objects array
        available_objects = objects_result.get('result', {}).get('objects', [])
        if not available_objects:
            # Fallback: try to query common objects directly
            logger.info("No objects from list, trying direct query")
            fallback_objects = [
                "heater_bed", "extruder", "fan", "temperature_sensor",
                "motion_report", "display_status", "virtual_sdcard",
                "print_stats", "toolhead", "gcode_move"
            ]
            params = {'objects': ','.join(fallback_objects)}
            status_result = self._request('GET', '/printer/objects/query', params=params)
            if status_result.get('result') and status_result['result'].get('status'):
                available_objects = list(status_result['result']['status'].keys())
        
        # Filter for heaters, fans, and extruders
        heaters = []
        fans = []
        extruders = []
        temperature_sensors = []
        qgl_object = None
        z_tilt_object = None
        
        for obj in available_objects:
            # Handle heater_bed
            if obj == 'heater_bed' or obj.startswith('heater_bed '):
                heaters.append(obj)
            # Handle extruders (they are heaters too)
            elif obj.startswith('extruder'):
                extruders.append(obj)
                heaters.append(obj)  # Extruders are also heaters
            # Handle generic heaters
            elif obj.startswith('heater_generic'):
                heaters.append(obj)
            # Handle fans (fan, fan_generic are user-controllable; heater_fan and controller_fan are automatic)
            elif (obj.startswith('fan ') or obj == 'fan' or 
                  obj.startswith('fan_generic') or
                  obj.startswith('controller_fan') or 
                  obj.startswith('heater_fan')):
                fans.append(obj)
            # Handle temperature sensors
            elif obj.startswith('temperature_sensor'):
                temperature_sensors.append(obj)
            # Handle QGL/Z_TILT objects
            elif obj.startswith('quad_gantry_level'):
                qgl_object = obj
            elif obj.startswith('z_tilt'):
                z_tilt_object = obj
        
        # Remove duplicates while preserving order
        heaters = sorted(list(dict.fromkeys(heaters)))
        fans = sorted(list(dict.fromkeys(fans)))
        extruders = sorted(list(dict.fromkeys(extruders)))
        temperature_sensors = sorted(list(dict.fromkeys(temperature_sensors)))
        
        return {
            'heaters': heaters,
            'fans': fans,
            'extruders': extruders,
            'temperature_sensors': temperature_sensors,
            'qgl_object': qgl_object,
            'z_tilt_object': z_tilt_object,
            'all_objects': available_objects
        }
    
    def get_printer_objects(self, objects=None):
        """Get printer objects status"""
        config = None
        if objects is None:
            # First try to get available objects, fall back to defaults
            config = self.get_printer_config()
            if not config.get('error'):
                # Build object list from detected hardware
                objects = []
                objects.extend(config.get('heaters', []))
                # Only include user-controllable fans (fan and fan_generic)
                # Exclude heater_fan and controller_fan (they're automatically controlled)
                controllable_fans = [
                    f for f in config.get('fans', []) 
                    if f == 'fan' or f.startswith('fan ') or f.startswith('fan_generic')
                ]
                objects.extend(controllable_fans)
                objects.extend(config.get('temperature_sensors', []))
                objects.extend([
                    "motion_report", "display_status", "virtual_sdcard",
                    "print_stats", "toolhead", "gcode_move"
                ])
                # Add QGL/Z_TILT objects if they exist
                if config.get('qgl_object'):
                    objects.append(config['qgl_object'])
                if config.get('z_tilt_object'):
                    objects.append(config['z_tilt_object'])
            else:
                # Fallback to defaults
                objects = [
                    "heater_bed", "extruder", "fan", "temperature_sensor",
                    "motion_report", "display_status", "virtual_sdcard",
                    "print_stats", "toolhead", "gcode_move"
                ]
        
        # Build query parameters - specify fields for each object type
        # Moonraker requires field specification to return actual data
        params = {}
        
        # Add objects list
        params['objects'] = ','.join(objects)
        
        # Get config if we don't have it yet
        if config is None:
            config = self.get_printer_config()
        
        # Specify fields for heaters (temperature and target)
        heaters = config.get('heaters', []) if not config.get('error') else ['heater_bed', 'extruder']
        for heater in heaters:
            if heater in objects:
                params[heater] = 'temperature,target'
        
        # Specify fields for fans (speed) - only user-controllable fans (fan and fan_generic)
        fans = config.get('fans', []) if not config.get('error') else ['fan']
        controllable_fans = [
            f for f in fans 
            if f == 'fan' or f.startswith('fan ') or f.startswith('fan_generic')
        ]
        for fan in controllable_fans:
            if fan in objects:
                params[fan] = 'speed'
        
        # Specify fields for temperature sensors (temperature)
        sensors = config.get('temperature_sensors', []) if not config.get('error') else []
        for sensor in sensors:
            if sensor in objects:
                params[sensor] = 'temperature'
        
        # Specify fields for common objects
        common_objects_fields = {
            'motion_report': 'live_position,live_velocity',
            'display_status': 'progress',
            'virtual_sdcard': 'progress',
            'print_stats': 'state,filename,print_duration',
            'toolhead': 'homed_axes,position,extruder',
            'gcode_move': 'gcode_position,absolute_coordinates'
        }
        
        for obj, fields in common_objects_fields.items():
            if obj in objects:
                params[obj] = fields
        
        # Specify fields for QGL/Z_TILT objects
        if config and not config.get('error'):
            if config.get('qgl_object') and config['qgl_object'] in objects:
                params[config['qgl_object']] = 'applied'
            if config.get('z_tilt_object') and config['z_tilt_object'] in objects:
                params[config['z_tilt_object']] = 'applied'
        
        return self._request('GET', '/printer/objects/query', params=params)
    
    def gcode_command(self, command):
        """Send G-code command"""
        # Use the script endpoint which returns any immediate response
        result = self._request('POST', '/printer/gcode/script', json={'script': command})
        return result
    
    def set_temperature(self, heater, target):
        """Set target temperature for a heater"""
        return self.gcode_command(f'SET_HEATER_TEMPERATURE HEATER={heater} TARGET={target}')
    
    def set_fan_speed(self, fan, speed):
        """Set fan speed (0-255)"""
        return self.gcode_command(f'SET_FAN_SPEED FAN={fan} SPEED={speed}')
    
    def home_axis(self, axis='XYZ'):
        """Home specified axes"""
        return self.gcode_command(f'G28 {axis}')
    
    def move_relative(self, x=None, y=None, z=None, e=None, speed=None, extrude_speed=None):
        """Move printer relative to current position"""
        cmd = 'G91\n'
        # Use extrusion feedrate for E moves, regular speed for others
        # G-code F is in mm/min, so convert from mm/s
        if e is not None and extrude_speed:
            # For extrusion, set feedrate in mm/min (extrude_speed is in mm/s)
            feedrate = int(extrude_speed * 60)
            cmd += f'G1 F{feedrate}\n'
        elif speed:
            # Convert speed from mm/s to mm/min
            feedrate = int(speed * 60)
            cmd += f'G1 F{feedrate}\n'
        moves = []
        if x is not None:
            moves.append(f'X{x}')
        if y is not None:
            moves.append(f'Y{y}')
        if z is not None:
            moves.append(f'Z{z}')
        if e is not None:
            moves.append(f'E{e}')
        if moves:
            cmd += f'G1 {" ".join(moves)}\n'
        cmd += 'G90'
        return self.gcode_command(cmd)
    
    def move_absolute(self, x=None, y=None, z=None, e=None, speed=None, extrude_speed=None):
        """Move printer to absolute position"""
        cmd = 'G90\n'
        # Use extrusion feedrate for E moves, regular speed for others
        # G-code F is in mm/min, so convert from mm/s
        if e is not None and extrude_speed:
            # For extrusion, set feedrate in mm/min (extrude_speed is in mm/s)
            feedrate = int(extrude_speed * 60)
            cmd += f'G1 F{feedrate}\n'
        elif speed:
            # Convert speed from mm/s to mm/min
            feedrate = int(speed * 60)
            cmd += f'G1 F{feedrate}\n'
        moves = []
        if x is not None:
            moves.append(f'X{x}')
        if y is not None:
            moves.append(f'Y{y}')
        if z is not None:
            moves.append(f'Z{z}')
        if e is not None:
            moves.append(f'E{e}')
        if moves:
            cmd += f'G1 {" ".join(moves)}'
        return self.gcode_command(cmd)
    
    def emergency_stop(self):
        """Emergency stop - try multiple methods to ensure it works"""
        # Try Moonraker's machine emergency stop endpoint first
        result = self._request('POST', '/machine/emergency_stop')
        if not result.get('error'):
            return result
        
        # Try printer emergency stop endpoint
        result = self._request('POST', '/printer/emergency_stop')
        if not result.get('error'):
            return result
        
        # Fall back to M112 gcode command (most reliable)
        logger.warning("Using M112 as fallback for emergency stop")
        return self.gcode_command('M112')
    
    def select_tool(self, tool_number):
        """Select tool/extruder (T0, T1, etc.)"""
        return self.gcode_command(f'T{tool_number}')
    
    def get_file_list(self):
        """Get list of G-code files"""
        return self._request('GET', '/server/files/list', params={'root': 'gcodes'})
    
    def get_file_metadata(self, filename):
        """Get file metadata including thumbnails"""
        # Moonraker metadata endpoint format
        return self._request('GET', '/server/files/metadata', params={'filename': filename})
    
    def upload_file(self, file_data, filename):
        """Upload a G-code file"""
        files = {'file': (filename, file_data, 'application/octet-stream')}
        return self._request('POST', '/server/files/upload', files=files, data={'root': 'gcodes', 'path': filename})
    
    def delete_file(self, filename):
        """Delete a G-code file"""
        return self._request('DELETE', f'/server/files/gcodes/{filename}')
    
    def print_file(self, filename):
        """Start printing a file"""
        return self._request('POST', '/printer/print/start', json={'filename': filename})
    
    def cancel_print(self):
        """Cancel current print"""
        return self._request('POST', '/printer/print/cancel')
    
    def pause_print(self):
        """Pause current print"""
        return self._request('POST', '/printer/print/pause')
    
    def resume_print(self):
        """Resume paused print"""
        return self._request('POST', '/printer/print/resume')
    
    def restart_printer(self):
        """Restart Klipper (RESTART command)"""
        return self.gcode_command('RESTART')
    
    def firmware_restart(self):
        """Firmware restart (FIRMWARE_RESTART command)"""
        return self.gcode_command('FIRMWARE_RESTART')
    
    def get_job_queue_status(self):
        """Get job queue status"""
        return self._request('GET', '/server/job_queue/status')
    
    def add_job_to_queue(self, filename):
        """Add a job to the print queue"""
        return self._request('POST', '/server/job_queue/job', json={'filename': filename})
    
    def remove_job_from_queue(self, job_id):
        """Remove a job from the queue"""
        return self._request('DELETE', f'/server/job_queue/job/{job_id}')
    
    def clear_job_queue(self):
        """Clear all jobs from the queue"""
        return self._request('DELETE', '/server/job_queue/all')
    
    def get_macros(self, ignored_macros=None):
        """Get list of available macros from printer objects"""
        if ignored_macros is None:
            ignored_macros = []
        
        objects_result = self.get_available_objects()
        if objects_result.get('error'):
            return []
        
        available_objects = objects_result.get('result', {}).get('objects', [])
        # Filter for gcode_macro objects and extract macro names
        macros = []
        for obj in available_objects:
            if obj.startswith('gcode_macro '):
                macro_name = obj.replace('gcode_macro ', '').strip()
                # Filter out macros starting with underscore
                if macro_name.startswith('_'):
                    continue
                # Filter out ignored macros (case-insensitive)
                if macro_name.upper() in [m.upper() for m in ignored_macros]:
                    continue
                macros.append(macro_name)
        
        return sorted(macros)


# Initialize Moonraker client
moonraker = MoonrakerClient(MOONRAKER_URL)

# Initialize plugin manager
plugin_manager = PluginManager()
plugin_manager.load_plugins()


@app.route('/')
def index():
    """Main page"""
    # Get plugin HTML and static files
    plugins_html = []
    plugins_css = []
    plugins_js = []
    
    for plugin in plugin_manager.plugins.values():
        if plugin.enabled:
            html = plugin.get_html()
            if html:
                plugins_html.append(html)
            
            # Get CSS files
            for css_file in plugin.get_css():
                css_path = os.path.join(plugin.path, css_file)
                if os.path.exists(css_path):
                    plugins_css.append(f'/api/plugins/{plugin.name}/static/{css_file}')
            
            # Get JS files
            for js_file in plugin.get_js():
                js_path = os.path.join(plugin.path, js_file)
                if os.path.exists(js_path):
                    plugins_js.append(f'/api/plugins/{plugin.name}/static/{js_file}')
    
    return render_template(
        'index.html',
        MOONRAKER_WS_URL=MOONRAKER_WS_URL,
        plugins_html=plugins_html,
        plugins_css=plugins_css,
        plugins_js=plugins_js
    )


@app.route('/api/printer/info')
def printer_info():
    """Get printer information"""
    return jsonify(moonraker.get_printer_info())


@app.route('/api/printer/config')
def printer_config():
    """Get printer configuration (available heaters, fans, etc.)"""
    result = moonraker.get_printer_config()
    return jsonify(result)


@app.route('/api/printer/status')
def printer_status():
    """Get printer status"""
    result = moonraker.get_printer_objects()
    return jsonify(result)


@app.route('/api/printer/gcode', methods=['POST'])
def send_gcode():
    """Send G-code command"""
    data = request.json
    command = data.get('command', '')
    if not command:
        return jsonify({'error': 'No command provided'}), 400
    result = moonraker.gcode_command(command)
    return jsonify(result)


@app.route('/api/printer/temperature', methods=['POST'])
def set_temperature():
    """Set heater temperature"""
    data = request.json
    heater = data.get('heater', 'extruder')
    target = data.get('target', 0)
    result = moonraker.set_temperature(heater, target)
    return jsonify(result)


@app.route('/api/printer/fan', methods=['POST'])
def set_fan():
    """Set fan speed"""
    data = request.json
    fan = data.get('fan', 'fan')
    speed = data.get('speed', 0)
    result = moonraker.set_fan_speed(fan, speed)
    return jsonify(result)


@app.route('/api/printer/home', methods=['POST'])
def home_axis():
    """Home axes"""
    data = request.json
    axis = data.get('axis', 'XYZ')
    result = moonraker.home_axis(axis)
    return jsonify(result)


@app.route('/api/printer/move', methods=['POST'])
def move_printer():
    """Move printer"""
    data = request.json
    move_type = data.get('type', 'relative')  # 'relative' or 'absolute'
    x = data.get('x')
    y = data.get('y')
    z = data.get('z')
    e = data.get('e')
    speed = data.get('speed')
    extrude_speed = data.get('extrude_speed')
    
    if move_type == 'absolute':
        result = moonraker.move_absolute(x=x, y=y, z=z, e=e, speed=speed, extrude_speed=extrude_speed)
    else:
        result = moonraker.move_relative(x=x, y=y, z=z, e=e, speed=speed, extrude_speed=extrude_speed)
    
    return jsonify(result)


@app.route('/api/printer/emergency_stop', methods=['POST'])
def emergency_stop():
    """Emergency stop"""
    try:
        result = moonraker.emergency_stop()
        # Log the emergency stop
        logger.warning("Emergency stop activated")
        return jsonify(result)
    except Exception as e:
        logger.error(f"Emergency stop error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/printer/tool', methods=['POST'])
def select_tool():
    """Select tool/extruder"""
    data = request.json
    tool_number = data.get('tool', 0)
    try:
        tool_number = int(tool_number)
        if tool_number < 0:
            return jsonify({'error': 'Tool number must be >= 0'}), 400
        result = moonraker.select_tool(tool_number)
        return jsonify(result)
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid tool number'}), 400


@app.route('/api/files/list')
def file_list():
    """Get list of G-code files with metadata"""
    result = moonraker.get_file_list()
    
    # Enhance file list with thumbnail information
    if result.get('result'):
        files = result['result']
        for file_info in files:
            if file_info.get('path', '').endswith(('.gcode', '.g')):
                filename = file_info.get('path', '').split('/')[-1]
                # Try to get metadata for thumbnail
                try:
                    metadata = moonraker.get_file_metadata(filename)
                    if metadata.get('result'):
                        # Moonraker metadata may contain thumbnail paths
                        file_info['metadata'] = metadata['result']
                        
                        # Construct thumbnail URL
                        thumbnail_url = None
                        metadata_result = metadata['result']
                        
                        # Check for thumbnails in metadata
                        if metadata_result.get('thumbnails') and len(metadata_result['thumbnails']) > 0:
                            # Use the first thumbnail
                            thumb = metadata_result['thumbnails'][0]
                            if thumb.get('relative_path'):
                                thumbnail_url = f"{MOONRAKER_URL}/server/files/gcodes/{thumb['relative_path']}"
                            elif thumb.get('path'):
                                thumbnail_url = f"{MOONRAKER_URL}/server/files/gcodes/{thumb['path']}"
                        
                        # Fallback: try standard thumbnail location
                        if not thumbnail_url:
                            # Standard location: .thumbs directory
                            base_name = filename.rsplit('.', 1)[0] if '.' in filename else filename
                            thumbnail_url = f"{MOONRAKER_URL}/server/files/gcodes/.thumbs/{base_name}.png"
                        
                        file_info['thumbnail_url'] = thumbnail_url
                except Exception as e:
                    logger.debug(f"Could not get metadata for {filename}: {e}")
                    # Still try standard thumbnail location
                    base_name = filename.rsplit('.', 1)[0] if '.' in filename else filename
                    file_info['thumbnail_url'] = f"{MOONRAKER_URL}/server/files/gcodes/.thumbs/{base_name}.png"
    
    return jsonify(result)


@app.route('/api/files/upload', methods=['POST'])
def upload_file():
    """Upload G-code file"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    result = moonraker.upload_file(file.read(), file.filename)
    return jsonify(result)


@app.route('/api/files/delete', methods=['POST'])
def delete_file():
    """Delete G-code file"""
    data = request.json
    filename = data.get('filename')
    if not filename:
        return jsonify({'error': 'No filename provided'}), 400
    result = moonraker.delete_file(filename)
    return jsonify(result)


@app.route('/api/print/start', methods=['POST'])
def start_print():
    """Start printing a file"""
    data = request.json
    filename = data.get('filename')
    if not filename:
        return jsonify({'error': 'No filename provided'}), 400
    result = moonraker.print_file(filename)
    return jsonify(result)


@app.route('/api/print/cancel', methods=['POST'])
def cancel_print():
    """Cancel current print"""
    result = moonraker.cancel_print()
    return jsonify(result)


@app.route('/api/print/pause', methods=['POST'])
def pause_print():
    """Pause current print"""
    result = moonraker.pause_print()
    return jsonify(result)


@app.route('/api/print/resume', methods=['POST'])
def resume_print():
    """Resume paused print"""
    result = moonraker.resume_print()
    return jsonify(result)


@app.route('/api/queue/status')
def get_queue_status():
    """Get job queue status"""
    result = moonraker.get_job_queue_status()
    return jsonify(result)


@app.route('/api/queue/add', methods=['POST'])
def add_to_queue():
    """Add a file to the print queue"""
    data = request.json
    filename = data.get('filename')
    if not filename:
        return jsonify({'error': 'No filename provided'}), 400
    result = moonraker.add_job_to_queue(filename)
    return jsonify(result)


@app.route('/api/queue/remove', methods=['POST'])
def remove_from_queue():
    """Remove a job from the queue"""
    data = request.json
    job_id = data.get('job_id')
    if job_id is None:
        return jsonify({'error': 'No job_id provided'}), 400
    result = moonraker.remove_job_from_queue(job_id)
    return jsonify(result)


@app.route('/api/queue/clear', methods=['POST'])
def clear_queue():
    """Clear all jobs from the queue"""
    result = moonraker.clear_job_queue()
    return jsonify(result)


@app.route('/api/printer/restart', methods=['POST'])
def restart_printer():
    """Restart Klipper"""
    result = moonraker.restart_printer()
    return jsonify(result)


@app.route('/api/printer/firmware_restart', methods=['POST'])
def firmware_restart():
    """Firmware restart"""
    result = moonraker.firmware_restart()
    return jsonify(result)


def load_camera_config():
    """Load camera configuration from config file"""
    try:
        with open(CAMERA_CONFIG_PATH, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning(f"Camera config not found at {CAMERA_CONFIG_PATH}, using defaults")
        return {
            "cameras": [],
            "default_stream_type": "stream"
        }
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing camera config: {e}")
        return {
            "cameras": [],
            "default_stream_type": "stream"
        }


@app.route('/api/cameras')
def get_cameras():
    """Get camera configuration"""
    try:
        config = load_camera_config()
        return jsonify(config)
    except Exception as e:
        logger.error(f"Error getting cameras: {e}")
        return jsonify({'error': str(e)}), 500


def load_macro_categories():
    """Load macro categories from config file"""
    config_path = os.path.join(os.path.dirname(__file__), 'macro_categories.json')
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning(f"Macro categories config not found at {config_path}, using defaults")
        return {
            "categories": {"Other": {"macros": []}},
            "default_category": "Other"
        }
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing macro categories config: {e}")
        return {
            "categories": {"Other": {"macros": []}},
            "default_category": "Other"
        }


def categorize_macros(macros, categories_config):
    """Categorize macros based on config"""
    categorized = {}
    default_category = categories_config.get('default_category', 'Other')
    categories = categories_config.get('categories', {})
    
    # Initialize all categories
    for cat_name in categories.keys():
        categorized[cat_name] = []
    
    # Add default category if not present
    if default_category not in categorized:
        categorized[default_category] = []
    
    # Categorize each macro
    for macro in macros:
        macro_upper = macro.upper()
        categorized_flag = False
        
        # Check each category for this macro
        for cat_name, cat_data in categories.items():
            cat_macros = cat_data.get('macros', [])
            if macro_upper in [m.upper() for m in cat_macros] or macro in cat_macros:
                categorized[cat_name].append(macro)
                categorized_flag = True
                break
        
        # If not found in any category, add to default
        if not categorized_flag:
            categorized[default_category].append(macro)
    
    # Remove empty categories
    categorized = {k: sorted(v) for k, v in categorized.items() if v}
    
    return categorized


@app.route('/api/macros')
def get_macros():
    """Get categorized list of macros"""
    try:
        categories_config = load_macro_categories()
        ignored_macros = categories_config.get('ignored_macros', [])
        macros = moonraker.get_macros(ignored_macros=ignored_macros)
        categorized = categorize_macros(macros, categories_config)
        return jsonify({
            'macros': macros,
            'categorized': categorized
        })
    except Exception as e:
        logger.error(f"Error getting macros: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/plugins')
def get_plugins():
    """Get list of all loaded plugins"""
    return jsonify(plugin_manager.get_plugins_info())


@app.route('/api/plugins/<plugin_name>/static/<path:filename>')
def serve_plugin_static(plugin_name, filename):
    """Serve static files from plugins"""
    plugin = plugin_manager.get_plugin(plugin_name)
    if not plugin:
        return jsonify({'error': 'Plugin not found'}), 404
    
    file_path = os.path.join(plugin.path, filename)
    if not os.path.exists(file_path) or not file_path.startswith(plugin.path):
        return jsonify({'error': 'File not found'}), 404
    
    return send_from_directory(plugin.path, filename)


@socketio.on('connect')
def handle_connect():
    """Handle WebSocket connection"""
    logger.info('Client connected')
    emit('status', {'connected': True})


@socketio.on('disconnect')
def handle_disconnect():
    """Handle WebSocket disconnection"""
    logger.info('Client disconnected')


@socketio.on('request_status')
def handle_status_request():
    """Handle status update request"""
    try:
        status = moonraker.get_printer_objects()
        # Log temperature sensors found in status for debugging
        if status.get('result') and status['result'].get('status'):
            temp_sensors = [k for k in status['result']['status'].keys() if k.startswith('temperature_sensor')]
            if temp_sensors:
                logger.debug(f"Temperature sensors in status: {temp_sensors}")
        emit('status_update', status)
    except Exception as e:
        logger.error(f"Error getting status: {e}")
        emit('error', {'message': str(e)})


# Register plugins with Flask app
plugin_manager.register_plugins(app, moonraker)

if __name__ == '__main__':
    logger.info(f"Starting Flask app, connecting to Moonraker at {MOONRAKER_URL}")
    logger.info(f"Loaded {len(plugin_manager.plugins)} plugin(s)")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
