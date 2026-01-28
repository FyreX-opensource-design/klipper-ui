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

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# SocketIO will auto-detect available async mode (threading is default, eventlet if available)
socketio = SocketIO(app, cors_allowed_origins="*")

# Moonraker configuration
MOONRAKER_URL = os.environ.get('MOONRAKER_URL', 'http://localhost:7125')
MOONRAKER_WS_URL = os.environ.get('MOONRAKER_WS_URL', 'ws://localhost:7125/websocket')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MoonrakerClient:
    """Client for interacting with Moonraker API"""
    
    def __init__(self, base_url):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.timeout = 5
    
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
    
    def get_printer_objects(self, objects=None):
        """Get printer objects status"""
        if objects is None:
            objects = [
                "heater_bed", "extruder", "fan", "temperature_sensor",
                "motion_report", "display_status", "virtual_sdcard",
                "print_stats", "toolhead", "gcode_move"
            ]
        params = {'objects': ','.join(objects)}
        return self._request('GET', '/printer/objects/query', params=params)
    
    def gcode_command(self, command):
        """Send G-code command"""
        return self._request('POST', '/printer/gcode/script', json={'script': command})
    
    def set_temperature(self, heater, target):
        """Set target temperature for a heater"""
        return self.gcode_command(f'SET_HEATER_TEMPERATURE HEATER={heater} TARGET={target}')
    
    def set_fan_speed(self, fan, speed):
        """Set fan speed (0-255)"""
        return self.gcode_command(f'SET_FAN_SPEED FAN={fan} SPEED={speed}')
    
    def home_axis(self, axis='XYZ'):
        """Home specified axes"""
        return self.gcode_command(f'G28 {axis}')
    
    def move_relative(self, x=None, y=None, z=None, e=None, speed=None):
        """Move printer relative to current position"""
        cmd = 'G91\n'
        if speed:
            cmd += f'G1 F{speed}\n'
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
    
    def move_absolute(self, x=None, y=None, z=None, e=None, speed=None):
        """Move printer to absolute position"""
        cmd = 'G90\n'
        if speed:
            cmd += f'G1 F{speed}\n'
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
        """Emergency stop"""
        return self.gcode_command('M112')
    
    def get_file_list(self):
        """Get list of G-code files"""
        return self._request('GET', '/server/files/list', params={'root': 'gcodes'})
    
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


# Initialize Moonraker client
moonraker = MoonrakerClient(MOONRAKER_URL)


@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')


@app.route('/api/printer/info')
def printer_info():
    """Get printer information"""
    return jsonify(moonraker.get_printer_info())


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
    
    if move_type == 'absolute':
        result = moonraker.move_absolute(x=x, y=y, z=z, e=e, speed=speed)
    else:
        result = moonraker.move_relative(x=x, y=y, z=z, e=e, speed=speed)
    
    return jsonify(result)


@app.route('/api/printer/emergency_stop', methods=['POST'])
def emergency_stop():
    """Emergency stop"""
    result = moonraker.emergency_stop()
    return jsonify(result)


@app.route('/api/files/list')
def file_list():
    """Get list of G-code files"""
    result = moonraker.get_file_list()
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
        emit('status_update', status)
    except Exception as e:
        logger.error(f"Error getting status: {e}")
        emit('error', {'message': str(e)})


if __name__ == '__main__':
    logger.info(f"Starting Flask app, connecting to Moonraker at {MOONRAKER_URL}")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
