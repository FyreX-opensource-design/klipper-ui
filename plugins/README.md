# Klipper UI Plugin System

This directory contains plugins that extend the functionality of Klipper UI. Plugins can add new panels, API endpoints, and custom functionality.

## Plugin Structure

Each plugin should be in its own directory with the following structure:

```
plugins/
  your_plugin/
    plugin.py      # Required: Plugin class definition
    __init__.py    # Optional: Package initialization
    style.css      # Optional: Plugin-specific CSS
    script.js      # Optional: Plugin-specific JavaScript
    ...            # Other files as needed
```

## Creating a Plugin

### 1. Create Plugin Directory

Create a new directory in the `plugins/` folder:

```bash
mkdir plugins/my_plugin
```

### 2. Create plugin.py

Create a `plugin.py` file that defines your plugin class:

```python
from plugins import Plugin
import os

class MyPlugin(Plugin):
    """Your plugin description"""
    
    def __init__(self, name: str, path: str):
        super().__init__(name, path)
        self.metadata = {
            'version': '1.0.0',
            'description': 'Description of your plugin',
            'author': 'Your Name'
        }
    
    def get_html(self) -> str:
        """Return HTML content for the plugin panel"""
        return """
        <section class="panel plugin-panel" id="my-plugin-panel">
            <h2>My Plugin</h2>
            <div class="plugin-content">
                <p>Your plugin content here</p>
            </div>
        </section>
        """
    
    def get_css(self) -> list:
        """Return list of CSS files (relative to plugin directory)"""
        css_file = os.path.join(self.path, 'style.css')
        if os.path.exists(css_file):
            return ['style.css']
        return []
    
    def get_js(self) -> list:
        """Return list of JavaScript files (relative to plugin directory)"""
        js_file = os.path.join(self.path, 'script.js')
        if os.path.exists(js_file):
            return ['script.js']
        return []
    
    def initialize(self, app, moonraker_client):
        """Initialize the plugin"""
        # Register custom API endpoints here
        def my_api_endpoint(moonraker=None):
            from flask import jsonify
            return jsonify({'status': 'ok', 'data': 'your data'})
        
        self.register_route('/my-endpoint', my_api_endpoint, methods=['GET'])
```

### 3. Add Static Files (Optional)

- **style.css**: Plugin-specific CSS styles
- **script.js**: Plugin-specific JavaScript code

These files will be automatically loaded when the plugin is enabled.

## Plugin API

### Plugin Class Methods

- `get_html()`: Return HTML string for the plugin panel
- `get_css()`: Return list of CSS file paths
- `get_js()`: Return list of JavaScript file paths
- `initialize(app, moonraker_client)`: Initialize plugin and register routes
- `register_route(endpoint, handler, methods)`: Register a custom API endpoint

### Accessing Moonraker API

In your plugin's `initialize` method, you receive the `moonraker_client` object which provides access to all Moonraker API methods:

```python
def initialize(self, app, moonraker_client):
    def get_printer_status(moonraker=None):
        from flask import jsonify
        if moonraker:
            status = moonraker.get_printer_status()
            return jsonify(status)
        return jsonify({'error': 'Moonraker not available'})
    
    self.register_route('/status', get_printer_status, methods=['GET'])
```

### Custom API Endpoints

Plugins can register custom API endpoints that will be available at:

```
/api/plugins/{plugin_name}{endpoint}
```

For example, if your plugin is named `my_plugin` and registers a route `/data`, it will be accessible at:

```
/api/plugins/my_plugin/data
```

### Frontend JavaScript

Your plugin's JavaScript files have access to:

- `API_BASE`: Base API URL (usually empty string)
- `fetch()`: For making API calls
- All global functions from `app.js`

Example:

```javascript
// In your plugin's script.js
async function loadPluginData() {
    try {
        const response = await fetch('/api/plugins/my_plugin/data');
        const result = await response.json();
        console.log('Plugin data:', result);
    } catch (error) {
        console.error('Error:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadPluginData();
});
```

## Example Plugin

See the `example/` directory for a complete example plugin that demonstrates:

- HTML panel creation
- CSS styling
- JavaScript functionality
- Custom API endpoint
- Accessing Moonraker client

## Plugin Loading

Plugins are automatically loaded when the application starts. The plugin system:

1. Scans the `plugins/` directory
2. Looks for directories containing `plugin.py`
3. Loads and initializes each plugin
4. Registers plugin routes with Flask
5. Injects plugin HTML/CSS/JS into the main template

## Disabling Plugins

To disable a plugin, you can:

1. Remove or rename the plugin directory
2. Set `plugin.enabled = False` in the plugin's `__init__` method
3. Move the plugin directory outside of `plugins/`

## Best Practices

1. **Use unique IDs**: Prefix your HTML element IDs with your plugin name to avoid conflicts
2. **Namespace JavaScript**: Use a namespace or prefix for your JavaScript functions
3. **Error handling**: Always handle errors gracefully in your plugin code
4. **Documentation**: Document your plugin's API endpoints and functionality
5. **Testing**: Test your plugin with the application before distributing

## Troubleshooting

- **Plugin not loading**: Check that `plugin.py` exists and defines a `Plugin` class
- **Routes not working**: Ensure routes are registered in `initialize()` method
- **Static files not loading**: Verify file paths in `get_css()` and `get_js()` methods
- **JavaScript errors**: Check browser console for errors and ensure functions are globally accessible if needed
