"""
Example plugin for Klipper UI
This plugin demonstrates how to create a custom panel
"""
import os
from plugins import Plugin


class ExamplePlugin(Plugin):
    """Example plugin that shows system information"""
    
    def __init__(self, name: str, path: str):
        super().__init__(name, path)
        self.metadata = {
            'version': '1.0.0',
            'description': 'Example plugin demonstrating plugin system',
            'author': 'Klipper UI'
        }
    
    def get_html(self) -> str:
        """Return HTML for the example panel"""
        return """
        <section class="panel plugin-panel" id="example-plugin-panel">
            <h2>📊 Printer Statistics</h2>
            <div class="plugin-content">
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">⏱️</div>
                        <div class="stat-info">
                            <label>Current Print Time</label>
                            <span id="current-print-time">--:--:--</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📈</div>
                        <div class="stat-info">
                            <label>Print Progress</label>
                            <span id="print-progress">0%</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🎯</div>
                        <div class="stat-info">
                            <label>Printer State</label>
                            <span id="printer-state-display">Unknown</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📄</div>
                        <div class="stat-info">
                            <label>Current File</label>
                            <span id="current-filename" class="filename-display">None</span>
                        </div>
                    </div>
                </div>
                
                <div class="detailed-stats">
                    <h3>Detailed Information</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Position (X, Y, Z):</label>
                            <span id="position-display">--, --, --</span>
                        </div>
                        <div class="info-item">
                            <label>Velocity:</label>
                            <span id="velocity-display">-- mm/s</span>
                        </div>
                        <div class="info-item">
                            <label>Last Update:</label>
                            <span id="last-update">Never</span>
                        </div>
                    </div>
                </div>
                
                <div class="plugin-actions">
                    <button class="btn btn-primary" onclick="examplePluginRefresh()">🔄 Refresh Data</button>
                    <button class="btn btn-secondary" onclick="examplePluginToggleAuto()">
                        <span id="auto-refresh-label">Enable</span> Auto-Refresh
                    </button>
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
        """Initialize the plugin"""
        # Register a custom API endpoint that gets printer statistics
        def get_printer_stats(moonraker=None):
            """Get printer statistics for the plugin"""
            from flask import jsonify
            if not moonraker:
                return jsonify({'error': 'Moonraker not available'}), 503
            
            try:
                # Get printer status
                status = moonraker.get_printer_objects()
                
                # Extract relevant information
                result = {
                    'status': 'ok',
                    'printer_state': 'unknown',
                    'print_time': 0,
                    'print_progress': 0,
                    'filename': None,
                    'position': [0, 0, 0],
                    'velocity': 0
                }
                
                if status and status.get('result') and status['result'].get('status'):
                    printer_status = status['result']['status']
                    
                    # Get print stats
                    if printer_status.get('print_stats'):
                        print_stats = printer_status['print_stats']
                        result['printer_state'] = print_stats.get('state', 'unknown')
                        result['print_time'] = print_stats.get('print_duration', 0)
                        result['filename'] = print_stats.get('filename')
                    
                    # Get print progress
                    if printer_status.get('virtual_sdcard'):
                        result['print_progress'] = printer_status['virtual_sdcard'].get('progress', 0) * 100
                    
                    # Get position and velocity
                    if printer_status.get('motion_report'):
                        motion = printer_status['motion_report']
                        if motion.get('live_position'):
                            result['position'] = motion['live_position'][:3]  # X, Y, Z only
                        if motion.get('live_velocity'):
                            result['velocity'] = motion['live_velocity']
                
                return jsonify(result)
            except Exception as e:
                return jsonify({'error': str(e)}), 500
        
        self.register_route('/stats', get_printer_stats, methods=['GET'])
