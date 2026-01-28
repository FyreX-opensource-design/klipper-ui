# Klipper UI - Flask Web Interface for Klipper Printers

A Flask-based web interface for controlling 3D printers running Klipper firmware, similar to Mainsail and Fluidd. This application connects to your printer via Moonraker API.

## Features

- **Printer Status Monitoring**: Real-time printer status, print progress, and temperature monitoring
- **Temperature Control**: Control hotend and bed temperatures
- **Printer Control**: Home axes, move printer, emergency stop
- **File Management**: Upload, list, and delete G-code files
- **Print Control**: Start, pause, resume, and cancel prints
- **G-code Console**: Send custom G-code commands directly to the printer
- **Real-time Updates**: WebSocket-based real-time status updates
- **Modern UI**: Responsive, modern web interface

## Prerequisites

- Python 3.7 or higher
- A 3D printer running Klipper firmware
- Moonraker API server running (typically on port 7125)

## Installation

1. Clone or download this repository

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## Configuration

The application uses environment variables for configuration:

- `MOONRAKER_URL`: Moonraker API URL (default: `http://localhost:7125`)
- `MOONRAKER_WS_URL`: Moonraker WebSocket URL (default: `ws://localhost:7125/websocket`)
- `SECRET_KEY`: Flask secret key for sessions (default: development key)

You can set these in your environment or create a `.env` file:

```bash
export MOONRAKER_URL=http://your-printer-ip:7125
export MOONRAKER_WS_URL=ws://your-printer-ip:7125/websocket
```

## Running the Application

Start the Flask application:

```bash
python app.py
```

The web interface will be available at `http://localhost:5000`

To run on a different host/port:

```bash
python app.py
# Then modify the socketio.run() call in app.py to change host/port
```

Or use Flask's built-in server:

```bash
export FLASK_APP=app.py
flask run --host=0.0.0.0 --port=5000
```

## Usage

1. **Connect to Printer**: Ensure Moonraker is running and accessible. The connection status indicator in the top-right shows if the connection is active.

2. **Monitor Status**: The Printer Status panel shows current print state, progress, and file information.

3. **Control Temperature**: 
   - Set hotend and bed target temperatures
   - Adjust fan speed using the slider

4. **Control Printer**:
   - Home axes (all, X, Y, or Z individually)
   - Move printer using relative movements
   - Emergency stop button for immediate halt

5. **File Management**:
   - Upload G-code files
   - View list of available files
   - Start printing a file
   - Delete files

6. **Print Control**:
   - Pause/resume prints
   - Cancel ongoing prints

7. **G-code Console**:
   - Send custom G-code commands
   - View command history

## API Endpoints

The application provides REST API endpoints:

- `GET /api/printer/info` - Get printer information
- `GET /api/printer/status` - Get printer status
- `POST /api/printer/gcode` - Send G-code command
- `POST /api/printer/temperature` - Set heater temperature
- `POST /api/printer/fan` - Set fan speed
- `POST /api/printer/home` - Home axes
- `POST /api/printer/move` - Move printer
- `POST /api/printer/emergency_stop` - Emergency stop
- `GET /api/files/list` - List G-code files
- `POST /api/files/upload` - Upload G-code file
- `POST /api/files/delete` - Delete G-code file
- `POST /api/print/start` - Start printing
- `POST /api/print/pause` - Pause print
- `POST /api/print/resume` - Resume print
- `POST /api/print/cancel` - Cancel print

## WebSocket Events

- `request_status` - Request printer status update
- `status_update` - Receive status update
- `connect` - Client connected
- `disconnect` - Client disconnected

## Security Notes

- This application is designed for local network use
- Change the `SECRET_KEY` in production environments
- Consider adding authentication for production deployments
- Moonraker should be properly secured with API keys if exposed to the internet

## Troubleshooting

**Connection Issues**:
- Verify Moonraker is running: `curl http://localhost:7125/printer/info`
- Check firewall settings
- Verify Moonraker URL in environment variables

**File Upload Fails**:
- Check Moonraker file permissions
- Verify G-code file format
- Check Moonraker logs for errors

**Status Not Updating**:
- Check browser console for WebSocket errors
- Verify Moonraker WebSocket endpoint is accessible
- Check network connectivity

## License

This project is provided as-is for educational and personal use.

## Credits

Inspired by Mainsail and Fluidd interfaces for Klipper.
