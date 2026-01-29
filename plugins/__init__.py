"""
Plugin system for Klipper UI
"""
import os
import importlib.util
import logging
from typing import Dict, List, Any

logger = logging.getLogger(__name__)


class Plugin:
    """Base class for all plugins"""
    
    def __init__(self, name: str, path: str):
        self.name = name
        self.path = path
        self.enabled = True
        self.metadata = {}
        self.routes = []
        self.static_files = []
    
    def get_info(self) -> Dict[str, Any]:
        """Get plugin information"""
        return {
            'name': self.name,
            'enabled': self.enabled,
            'metadata': self.metadata,
            'routes': self.routes,
            'static_files': self.static_files
        }
    
    def register_route(self, endpoint: str, handler, methods: List[str] = None):
        """Register a custom API route for this plugin"""
        if methods is None:
            methods = ['GET']
        self.routes.append({
            'endpoint': endpoint,
            'handler': handler,
            'methods': methods
        })
    
    def get_html(self) -> str:
        """Return HTML content for the plugin panel"""
        return ""
    
    def get_css(self) -> List[str]:
        """Return list of CSS file paths relative to plugin directory"""
        return []
    
    def get_js(self) -> List[str]:
        """Return list of JavaScript file paths relative to plugin directory"""
        return []
    
    def initialize(self, app, moonraker_client):
        """Initialize the plugin with Flask app and Moonraker client"""
        pass


class PluginManager:
    """Manages loading and registration of plugins"""
    
    def __init__(self, plugins_dir: str = None):
        if plugins_dir is None:
            plugins_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'plugins')
        self.plugins_dir = plugins_dir
        self.plugins: Dict[str, Plugin] = {}
        self._ensure_plugins_dir()
    
    def _ensure_plugins_dir(self):
        """Ensure plugins directory exists"""
        if not os.path.exists(self.plugins_dir):
            os.makedirs(self.plugins_dir)
            # Create __init__.py if it doesn't exist
            init_file = os.path.join(self.plugins_dir, '__init__.py')
            if not os.path.exists(init_file):
                with open(init_file, 'w') as f:
                    f.write('# Plugins directory\n')
    
    def load_plugins(self):
        """Load all plugins from the plugins directory"""
        if not os.path.exists(self.plugins_dir):
            logger.warning(f"Plugins directory not found: {self.plugins_dir}")
            return
        
        for item in os.listdir(self.plugins_dir):
            plugin_path = os.path.join(self.plugins_dir, item)
            
            # Skip if not a directory or if it's __pycache__
            if not os.path.isdir(plugin_path) or item.startswith('_'):
                continue
            
            # Check if it's a plugin (has plugin.py)
            plugin_file = os.path.join(plugin_path, 'plugin.py')
            if not os.path.exists(plugin_file):
                continue
            
            try:
                plugin = self._load_plugin(item, plugin_path)
                if plugin:
                    self.plugins[plugin.name] = plugin
                    logger.info(f"Loaded plugin: {plugin.name}")
            except Exception as e:
                logger.error(f"Error loading plugin {item}: {e}", exc_info=True)
    
    def _load_plugin(self, plugin_name: str, plugin_path: str) -> Plugin:
        """Load a single plugin"""
        plugin_file = os.path.join(plugin_path, 'plugin.py')
        
        # Load the plugin module
        spec = importlib.util.spec_from_file_location(f"plugin_{plugin_name}", plugin_file)
        if spec is None or spec.loader is None:
            raise ImportError(f"Could not load plugin {plugin_name}")
        
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        
        # Look for Plugin class - find any class that inherits from Plugin but is not the base Plugin class
        plugin_class = None
        
        # Get the module's own namespace (not imported items)
        # Check __dict__ to see what's actually defined in this module
        module_dict = getattr(module, '__dict__', {})
        
        # First, try to find a class named 'Plugin' that's defined in this module
        if 'Plugin' in module_dict:
            potential_class = module_dict['Plugin']
            if (isinstance(potential_class, type) and 
                issubclass(potential_class, Plugin) and 
                potential_class is not Plugin and
                potential_class.__module__ == module.__name__):  # Must be defined in this module
                plugin_class = potential_class
        
        # If not found, look for any class that inherits from Plugin and is defined in this module
        if plugin_class is None:
            for attr_name, attr_value in module_dict.items():
                if (isinstance(attr_value, type) and 
                    issubclass(attr_value, Plugin) and 
                    attr_value is not Plugin and
                    attr_value.__module__ == module.__name__):  # Must be defined in this module
                    plugin_class = attr_value
                    break
        
        if plugin_class is None:
            raise ImportError(f"Plugin {plugin_name} does not define a Plugin class (must inherit from Plugin and be defined in plugin.py)")
        
        plugin = plugin_class(plugin_name, plugin_path)
        
        return plugin
    
    def register_plugins(self, app, moonraker_client):
        """Register all plugins with the Flask app"""
        for plugin in self.plugins.values():
            if not plugin.enabled:
                continue
            
            try:
                # Initialize plugin first (this may register routes)
                plugin.initialize(app, moonraker_client)
                
                # Register custom routes
                for route_info in plugin.routes:
                    endpoint = f"/api/plugins/{plugin.name}{route_info['endpoint']}"
                    handler = route_info['handler']
                    methods = route_info.get('methods', ['GET'])
                    
                    # Bind moonraker_client to handler if it needs it
                    if hasattr(handler, '__code__'):
                        # Check if handler needs moonraker_client
                        import inspect
                        sig = inspect.signature(handler)
                        if 'moonraker' in sig.parameters:
                            def make_handler(h, m):
                                def wrapper(*args, **kwargs):
                                    return h(*args, moonraker=m, **kwargs)
                                return wrapper
                            handler = make_handler(handler, moonraker_client)
                    
                    app.route(endpoint, methods=methods)(handler)
                    logger.info(f"Registered route: {endpoint}")
            except Exception as e:
                logger.error(f"Error registering plugin {plugin.name}: {e}", exc_info=True)
    
    def get_plugins_info(self) -> Dict[str, Any]:
        """Get information about all loaded plugins"""
        return {
            name: plugin.get_info()
            for name, plugin in self.plugins.items()
        }
    
    def get_plugin(self, name: str) -> Plugin:
        """Get a specific plugin by name"""
        return self.plugins.get(name)
