import asyncio
import psutil
import socketio
from aiohttp import web
import aiohttp_cors
import socket
import os
import json
import requests
import subprocess
import logging
import time
from datetime import datetime, timezone, timedelta

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load Configuration
CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'config.json')
with open(CONFIG_PATH, 'r') as f:
    config = json.load(f)

# Discovery Server URL - extract base URL from config
SERVER_URL = config.get('server_url', 'http://localhost:5000')
# Remove any path suffixes to get base URL
if '/api/' in SERVER_URL:
    DISCOVERY_URL = SERVER_URL.split('/api/')[0]
else:
    DISCOVERY_URL = SERVER_URL.rstrip('/')

AGENT_PORT = 5001
VM_ID = config.get('vm_id')
HOSTNAME = config.get('hostname', socket.gethostname())  # Use config hostname, fallback to system hostname
BROADCAST_INTERVAL = config.get('broadcast_interval', 0.5)  # Real-time updates
STORAGE_INTERVAL = config.get('storage_interval', 5)  # Database storage
SERVICES_MONITOR = config.get('services_to_monitor', [])

# Counters for interval management
broadcast_counter = 0
storage_counter = 0

# Create Socket.IO Server (Async) for direct dashboard connections
sio = socketio.AsyncServer(
    async_mode='aiohttp',
    cors_allowed_origins='*',
    cors_credentials=True
)

# Create aiohttp app with CORS support
app = web.Application()

# Configure CORS for all routes
cors = aiohttp_cors.setup(app, defaults={
    "*": aiohttp_cors.ResourceOptions(
        allow_credentials=True,
        expose_headers="*",
        allow_headers="*",
        allow_methods="*"
    )
})

# Attach Socket.IO to app
sio.attach(app)

# Create Socket.IO Client for server connection (storage path)
server_sio = socketio.AsyncClient()
server_connected = False

def get_cpu_metrics():
    return {
        'usage': psutil.cpu_percent(interval=None),
        'cores': psutil.cpu_percent(interval=None, percpu=True)
    }

def get_load_average():
    """Get system load average (1, 5, 15 minutes)"""
    try:
        return os.getloadavg()  # Returns tuple (1min, 5min, 15min)
    except (AttributeError, OSError):
        return None

def get_memory_metrics():
    mem = psutil.virtual_memory()
    return {
        'total': mem.total,
        'used': mem.used,
        'percent': mem.percent
    }

def get_swap_metrics():
    """Get swap memory usage"""
    try:
        swap = psutil.swap_memory()
        return {
            'total': swap.total,
            'used': swap.used,
            'percent': swap.percent
        }
    except Exception:
        return None

def get_disk_metrics():
    disk = psutil.disk_usage('/')
    
    # Get inode information (Linux only)
    inodes_percent = None
    try:
        if hasattr(os, 'statvfs'):
            st = os.statvfs('/')
            total_inodes = st.f_files
            free_inodes = st.f_ffree
            if total_inodes > 0:
                used_inodes = total_inodes - free_inodes
                inodes_percent = (used_inodes / total_inodes) * 100
    except Exception as e:
        logger.debug(f"Could not get inode info: {e}")
    
    # Get I/O wait percentage (Linux only)
    io_wait = None
    try:
        # Get CPU times to calculate I/O wait
        cpu_times = psutil.cpu_times_percent(interval=0.1)
        if hasattr(cpu_times, 'iowait'):
            io_wait = cpu_times.iowait
    except Exception as e:
        logger.debug(f"Could not get I/O wait: {e}")
    
    result = {
        'total': disk.total,
        'used': disk.used,
        'percent': disk.percent
    }
    
    if inodes_percent is not None:
        result['inodesPercent'] = inodes_percent
    
    if io_wait is not None:
        result['ioWait'] = io_wait
    
    return result

def get_top_processes(n=5):
    processes = []
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
        try:
            processes.append(proc.info)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    processes.sort(key=lambda p: p['cpu_percent'], reverse=True)
    return processes[:n]

class ServiceHealthChecker:
    """
    Robust service health checker with multi-signal health model.
    Implements plugin-based checks: HTTP, Command, Socket, Systemd, Port
    """
    
    # Health states
    HEALTHY = "healthy"      # Functional check passes
    DEGRADED = "degraded"    # Running but failing functional check
    DOWN = "down"            # Cannot connect at all
    UNKNOWN = "unknown"      # Insufficient permissions / missing deps
    
    def __init__(self, service_configs):
        self.service_configs = service_configs
    
    def check_http(self, config, timeout=3):
        """HTTP/HTTPS health check - most reliable for web services"""
        try:
            import requests
            url = config.get('url', 'http://127.0.0.1')
            expected_status = config.get('expected_status', [200, 204])
            
            response = requests.get(url, timeout=timeout, allow_redirects=False)
            
            if response.status_code in expected_status:
                return True, f"HTTP {response.status_code}"
            else:
                return False, f"HTTP {response.status_code} (expected {expected_status})"
                
        except requests.exceptions.Timeout:
            return False, "HTTP timeout"
        except requests.exceptions.ConnectionError:
            return False, "Connection refused"
        except Exception as e:
            return False, f"HTTP error: {str(e)[:50]}"
    
    def check_tcp_port(self, config, timeout=3):
        """TCP port connectivity check"""
        try:
            host = config.get('host', '127.0.0.1')
            port = config.get('port')
            
            if not port:
                return False, "No port specified"
            
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex((host, port))
            sock.close()
            
            if result == 0:
                return True, f"Port {port} open"
            else:
                return False, f"Port {port} closed"
                
        except socket.timeout:
            return False, "Port check timeout"
        except Exception as e:
            return False, f"Port error: {str(e)[:50]}"
    
    def check_unix_socket(self, config, timeout=3):
        """Unix socket check"""
        try:
            socket_path = config.get('socket_path')
            
            if not socket_path:
                return False, "No socket path specified"
            
            if not os.path.exists(socket_path):
                return False, f"Socket not found"
            
            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            sock.connect(socket_path)
            sock.close()
            
            return True, "Socket accessible"
            
        except socket.timeout:
            return False, "Socket timeout"
        except Exception as e:
            return False, f"Socket error: {str(e)[:50]}"
    
    def check_command(self, config, timeout=5):
        """Execute custom command for health check"""
        try:
            cmd = config.get('command')
            
            if not cmd:
                return False, "No command specified"
            
            # Support both string and list commands
            if isinstance(cmd, str):
                cmd = cmd.split()
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            if result.returncode == 0:
                return True, "Command succeeded"
            else:
                return False, f"Command failed (exit {result.returncode})"
                
        except subprocess.TimeoutExpired:
            return False, "Command timeout"
        except FileNotFoundError:
            return False, "Command not found"
        except Exception as e:
            return False, f"Command error: {str(e)[:50]}"
    
    def check_systemd(self, service_name, timeout=5):
        """Check systemd service status"""
        try:
            # Check if service is active
            result = subprocess.run(
                ['systemctl', 'is-active', service_name],
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            is_active = result.returncode == 0
            
            # Get detailed state
            show_result = subprocess.run(
                ['systemctl', 'show', service_name, '--property=SubState,ActiveState'],
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            state_info = show_result.stdout.strip()
            
            return is_active, state_info if state_info else "active" if is_active else "inactive"
            
        except subprocess.TimeoutExpired:
            return False, "systemd timeout"
        except FileNotFoundError:
            return None, "systemd not available"
        except Exception as e:
            return None, f"systemd error: {str(e)[:50]}"
    
    def check_process(self, service_name):
        """Fallback: Check if process is running by name"""
        try:
            for proc in psutil.process_iter(['name', 'cmdline', 'username']):
                try:
                    proc_name = proc.info.get('name', '').lower()
                    cmdline = ' '.join(proc.info.get('cmdline', [])).lower()
                    
                    if service_name.lower() in proc_name or service_name.lower() in cmdline:
                        return True, f"Process found (PID: {proc.pid})"
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            
            return False, "Process not found"
            
        except Exception as e:
            return False, f"Process check error: {str(e)[:50]}"
    
    def check_pm2(self, service_name=None):
        """Check PM2 managed Node.js processes"""
        try:
            # Try to run pm2 jlist (JSON output)
            result = subprocess.run(
                ['pm2', 'jlist'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode != 0:
                return None, "PM2 not available or no processes"
            
            import json
            try:
                processes = json.loads(result.stdout)
                
                if not processes:
                    return False, "No PM2 processes running"
                
                # If checking for specific service, look for it
                if service_name:
                    for proc in processes:
                        if service_name.lower() in proc.get('name', '').lower():
                            status = proc.get('pm2_env', {}).get('status', 'unknown')
                            if status == 'online':
                                return True, f"PM2: {proc['name']} online (PID: {proc.get('pid')})"
                            else:
                                return False, f"PM2: {proc['name']} {status}"
                    return False, f"Service '{service_name}' not found in PM2"
                else:
                    # Just check if any PM2 processes are online
                    online_count = sum(1 for p in processes if p.get('pm2_env', {}).get('status') == 'online')
                    if online_count > 0:
                        return True, f"PM2: {online_count} process(es) online"
                    else:
                        return False, "PM2: No processes online"
                        
            except json.JSONDecodeError:
                return None, "PM2 output parse error"
                
        except FileNotFoundError:
            return None, "PM2 not installed"
        except subprocess.TimeoutExpired:
            return None, "PM2 check timeout"
        except Exception as e:
            return None, f"PM2 check error: {str(e)[:50]}"
    
    def check_nodejs_processes(self):
        """Check for Node.js/npm processes using multiple methods"""
        try:
            # Method 1: Check for node processes via ps command (works across users)
            result = subprocess.run(
                ['ps', 'aux'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                lines = result.stdout.lower().split('\n')
                node_processes = []
                
                for line in lines:
                    # Look for node, npm, or nodejs in the command
                    if any(keyword in line for keyword in ['node ', 'npm ', 'nodejs']):
                        # Exclude grep itself and system processes
                        if 'grep' not in line and 'node.mojom' not in line:
                            # Extract PID (second column)
                            parts = line.split()
                            if len(parts) >= 2:
                                try:
                                    pid = int(parts[1])
                                    node_processes.append(pid)
                                except ValueError:
                                    continue
                
                if node_processes:
                    return True, f"Found {len(node_processes)} Node.js process(es)"
            
            # Method 2: Try pgrep as fallback
            result = subprocess.run(
                ['pgrep', '-f', 'node|npm'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0 and result.stdout.strip():
                pids = result.stdout.strip().split('\n')
                return True, f"Found {len(pids)} Node.js process(es) via pgrep"
            
            return False, "No Node.js processes found"
            
        except FileNotFoundError:
            return None, "ps/pgrep command not available"
        except subprocess.TimeoutExpired:
            return None, "Process check timeout"
        except Exception as e:
            return None, f"Process check error: {str(e)[:50]}"
    
    def check_service(self, service_name, config):
        """
        Perform multi-signal health check on a service.
        Returns: {state, checks: {check_name: result}}
        """
        checks = {}
        
        # 1. Functional/Protocol checks (highest priority)
        functional_passed = False
        
        check_type = config.get('check_type', 'auto')
        
        if check_type == 'http' or (check_type == 'auto' and 'url' in config):
            passed, msg = self.check_http(config)
            checks['http'] = {'passed': passed, 'message': msg}
            functional_passed = passed
            
        elif check_type == 'tcp' or (check_type == 'auto' and 'port' in config):
            passed, msg = self.check_tcp_port(config)
            checks['tcp_port'] = {'passed': passed, 'message': msg}
            functional_passed = passed
            
        elif check_type == 'socket' or (check_type == 'auto' and 'socket_path' in config):
            passed, msg = self.check_unix_socket(config)
            checks['unix_socket'] = {'passed': passed, 'message': msg}
            functional_passed = passed
            
        elif check_type == 'command' or (check_type == 'auto' and 'command' in config):
            passed, msg = self.check_command(config)
            checks['command'] = {'passed': passed, 'message': msg}
            functional_passed = passed
        
        # 2. Systemd check (secondary signal)
        systemd_passed, systemd_msg = self.check_systemd(service_name)
        if systemd_passed is not None:
            checks['systemd'] = {'passed': systemd_passed, 'message': systemd_msg}
        
        # 3. Special handling for Node.js services
        if service_name.lower() in ['node', 'nodejs']:
            # Check PM2 first (production environment)
            pm2_passed, pm2_msg = self.check_pm2()
            if pm2_passed is not None:
                checks['pm2'] = {'passed': pm2_passed, 'message': pm2_msg}
                if pm2_passed:
                    functional_passed = True
            
            # Check for Node.js processes (npm start, node app.js, etc.)
            node_proc_passed, node_proc_msg = self.check_nodejs_processes()
            if node_proc_passed is not None:
                checks['nodejs_processes'] = {'passed': node_proc_passed, 'message': node_proc_msg}
                if node_proc_passed:
                    functional_passed = True
        
        # 4. Process check (fallback for other services)
        # Always run process check if:
        # - No functional check was performed, OR
        # - Systemd is not available, OR
        # - Systemd says service is down (to catch manually started processes)
        if not functional_passed and (not checks or systemd_passed is None or systemd_passed is False):
            proc_passed, proc_msg = self.check_process(service_name)
            checks['process'] = {'passed': proc_passed, 'message': proc_msg}
        
        # Determine overall state based on multi-signal model
        state = self._determine_state(checks, functional_passed, systemd_passed)
        
        return {
            'state': state,
            'checks': checks
        }
    
    def _determine_state(self, checks, functional_passed, systemd_passed):
        """Determine overall health state from multiple signals"""
        
        # If no checks were performed
        if not checks:
            return self.UNKNOWN
        
        # If functional check exists and passed -> HEALTHY
        if functional_passed:
            return self.HEALTHY
        
        # If functional check exists but failed, check if service is running
        if 'http' in checks or 'tcp_port' in checks or 'unix_socket' in checks or 'command' in checks:
            # Functional check was attempted
            if not functional_passed:
                # Check if service is at least running (degraded state)
                if systemd_passed or checks.get('process', {}).get('passed'):
                    return self.DEGRADED
                else:
                    return self.DOWN
        
        # No functional check, rely on systemd/process
        if systemd_passed or checks.get('process', {}).get('passed'):
            return self.HEALTHY
        elif systemd_passed is False or checks.get('process', {}).get('passed') is False:
            return self.DOWN
        
        return self.UNKNOWN
    
    def check_all_services(self):
        """Check all configured services"""
        results = {}
        
        for service_name, config in self.service_configs.items():
            try:
                results[service_name] = self.check_service(service_name, config)
            except Exception as e:
                logger.error(f"Error checking service {service_name}: {e}")
                results[service_name] = {
                    'state': self.UNKNOWN,
                    'checks': {'error': {'passed': False, 'message': str(e)[:100]}}
                }
        
        return results

def get_service_status():
    """Get status of monitored services using robust multi-signal health checks"""
    
    # Auto-detect service configurations
    service_configs = {}
    
    for service in SERVICES_MONITOR:
        service_configs[service] = _get_default_service_config(service)
    
    checker = ServiceHealthChecker(service_configs)
    return checker.check_all_services()

def _get_default_service_config(service_name):
    """Get default configuration for common services"""
    
    # Common service configurations with functional checks
    defaults = {
        'nginx': {
            'check_type': 'http',
            'url': 'http://127.0.0.1:80',
            'expected_status': [200, 301, 302, 404]  # Any response means nginx is working
        },
        'apache2': {
            'check_type': 'http',
            'url': 'http://127.0.0.1:80',
            'expected_status': [200, 301, 302, 404]
        },
        'mysql': {
            'check_type': 'command',
            'command': ['mysqladmin', 'ping', '-h', '127.0.0.1']
        },
        'mariadb': {
            'check_type': 'command',
            'command': ['mysqladmin', 'ping', '-h', '127.0.0.1']
        },
        'postgresql': {
            'check_type': 'tcp',
            'host': '127.0.0.1',
            'port': 5432
        },
        'mongodb': {
            'check_type': 'tcp',
            'host': '127.0.0.1',
            'port': 27017
        },
        'redis': {
            'check_type': 'command',
            'command': ['redis-cli', 'ping']  # Returns PONG if healthy
        },
        'redis-server': {
            'check_type': 'command',
            'command': ['redis-cli', 'ping']
        },
        'elasticsearch': {
            'check_type': 'http',
            'url': 'http://127.0.0.1:9200/_cluster/health',
            'expected_status': [200]  # Cluster health API
        },
        'php-fpm': {
            'check_type': 'socket',
            'socket_path': '/run/php/php-fpm.sock'  # Common socket path
        },
        'php7.4-fpm': {
            'check_type': 'socket',
            'socket_path': '/run/php/php7.4-fpm.sock'
        },
        'php8.0-fpm': {
            'check_type': 'socket',
            'socket_path': '/run/php/php8.0-fpm.sock'
        },
        'php8.1-fpm': {
            'check_type': 'socket',
            'socket_path': '/run/php/php8.1-fpm.sock'
        },
        'php8.2-fpm': {
            'check_type': 'socket',
            'socket_path': '/run/php/php8.2-fpm.sock'
        },
        'php8.3-fpm': {
            'check_type': 'socket',
            'socket_path': '/run/php/php8.3-fpm.sock'
        },
        'node': {
            'check_type': 'auto'  # Will use systemd/process check
        },
        'nodejs': {
            'check_type': 'auto'
        },
        'docker': {
            'check_type': 'socket',
            'socket_path': '/var/run/docker.sock'
        },
        'ssh': {
            'check_type': 'tcp',
            'host': '127.0.0.1',
            'port': 22
        },
        'sshd': {
            'check_type': 'tcp',
            'host': '127.0.0.1',
            'port': 22
        }
    }
    
    return defaults.get(service_name, {'check_type': 'auto'})

def get_ist_timestamp():
    """Get current timestamp in IST (Indian Standard Time)"""
    # IST is UTC+5:30
    ist_offset = timedelta(hours=5, minutes=30)
    ist_timezone = timezone(ist_offset)
    
    # Get current time in IST
    ist_time = datetime.now(ist_timezone)
    
    # Return as milliseconds timestamp
    return int(ist_time.timestamp() * 1000)

def collect_metrics():
    cpu_metrics = get_cpu_metrics()
    load_avg = get_load_average()
    
    metrics = {
        'vmId': VM_ID,
        'hostname': HOSTNAME,
        'cpu': cpu_metrics,
        'memory': get_memory_metrics(),
        'disk': get_disk_metrics(),
        'processes': get_top_processes(),
        'services': get_service_status(),
        'timestamp': get_ist_timestamp()
    }
    
    # Add load average if available
    if load_avg:
        metrics['loadAverage'] = load_avg
    
    # Add swap metrics if available
    swap = get_swap_metrics()
    if swap:
        metrics['swap'] = swap
    
    return metrics

async def registration_loop():
    """ Periodically register with discovery server """
    while True:
        try:
            # Get the actual IP address of this machine
            # Check for explicitly configured external IP first
            local_ip = config.get('external_ip')
            if not local_ip:
                try:
                    # Create a socket to determine which interface would be used to reach the server
                    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                    # Extract hostname from DISCOVERY_URL
                    server_host = DISCOVERY_URL.replace('http://', '').replace('https://', '').split(':')[0]
                    s.connect((server_host, 80))
                    local_ip = s.getsockname()[0]
                    s.close()
                except Exception as e:
                    logger.warning(f"Could not determine local IP: {e}, using hostname")
                    # Fallback to getting hostname IP
                    local_ip = socket.gethostbyname(socket.gethostname())
            
            payload = {
                'vmId': VM_ID,
                'hostname': HOSTNAME,
                'ip': f'http://{local_ip}',  # Use actual IP instead of localhost
                'port': AGENT_PORT,
                'broadcastInterval': BROADCAST_INTERVAL,
                'storageInterval': STORAGE_INTERVAL
            }
            
            # Register with discovery server
            response = requests.post(f"{DISCOVERY_URL}/api/register", json=payload, timeout=5)
            if response.status_code == 200:
                logger.debug(f"Successfully registered with discovery server at {local_ip}:{AGENT_PORT}")
            else:
                logger.warning(f"Registration failed with status: {response.status_code}")
            
            # Try to reconnect to server if disconnected
            if not server_connected:
                logger.info("Server connection lost, attempting to reconnect...")
                await connect_to_server()
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Registration request failed: {e}")
        except Exception as e:
            logger.error(f"Registration failed: {e}")
            
        await asyncio.sleep(30)  # Register every 30s

async def connect_to_server():
    """Connect to server for storage path"""
    global server_connected
    
    max_retries = 3
    retry_delay = 2  # seconds
    
    for attempt in range(max_retries):
        try:
            logger.info(f"Attempting to connect to server at {DISCOVERY_URL} (attempt {attempt + 1}/{max_retries})")
            
            await server_sio.connect(DISCOVERY_URL)
            server_connected = True
            logger.info(f"✓ Successfully connected to server at {DISCOVERY_URL}")
            return
            
        except Exception as e:
            logger.error(f"Connection attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                logger.info(f"Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
            else:
                logger.error("Max connection attempts reached. Will retry during registration loop.")
                server_connected = False

@server_sio.event
async def connect():
    global server_connected
    server_connected = True
    logger.info("✓ Connected to server for storage")

@server_sio.event
async def disconnect():
    global server_connected
    server_connected = False
    logger.warning("✗ Disconnected from server")

@server_sio.event
async def connect_error(data):
    global server_connected
    server_connected = False
    logger.error(f"✗ Server connection error: {data}")

async def send_to_server_for_storage(data):
    """Send metrics to server for database storage (WebSocket)"""
    global server_connected
    
    if not server_connected:
        logger.debug("Not connected to server, skipping storage")
        return
        
    try:
        await server_sio.emit('agent:metrics', data)
        logger.debug(f"✓ Sent data to server for storage")
    except Exception as e:
        logger.error(f"✗ Error sending to server: {e}")
        server_connected = False

async def metric_broadcast_loop():
    global broadcast_counter, storage_counter
    
    # Prime CPU
    psutil.cpu_percent(interval=None)
    
    # Calculate how many broadcast cycles per storage cycle
    storage_cycles = int(STORAGE_INTERVAL / BROADCAST_INTERVAL)
    
    while True:
        try:
            # Collect metrics
            data = collect_metrics()
            
            # Path 1: Always broadcast to dashboard clients (direct, low latency)
            await sio.emit('metrics:update', data)
            
            # Path 2: Send to server for storage (only when storage interval is reached)
            if broadcast_counter % storage_cycles == 0:
                # Send to server for database storage via WebSocket
                await send_to_server_for_storage(data)
                storage_counter += 1
                logger.debug(f"Sent data to server for storage (cycle {storage_counter})")
            
            broadcast_counter += 1
            
        except Exception as e:
            logger.error(f"Broadcast error: {e}")
        
        await asyncio.sleep(BROADCAST_INTERVAL)

async def start_background_tasks(app):
    # Wait a bit for the agent server to be ready
    await asyncio.sleep(2)
    
    # Connect to server for storage path
    await connect_to_server()
    
    # Start background tasks
    sio.start_background_task(registration_loop)
    sio.start_background_task(metric_broadcast_loop)

# Socket.IO event handlers for configuration updates
@sio.event
async def config_update(sid, data):
    """Handle configuration updates from server"""
    global BROADCAST_INTERVAL, STORAGE_INTERVAL, broadcast_counter, storage_counter
    
    if data.get('vmId') == VM_ID:
        logger.info(f"Received configuration update: {data}")
        
        if 'broadcastInterval' in data:
            BROADCAST_INTERVAL = data['broadcastInterval']
        if 'storageInterval' in data:
            STORAGE_INTERVAL = data['storageInterval']
            
        # Reset counters to apply new intervals immediately
        broadcast_counter = 0
        storage_counter = 0
        
        logger.info(f"Updated intervals - Broadcast: {BROADCAST_INTERVAL}s, Storage: {STORAGE_INTERVAL}s")

# Server socket.io event handlers
@server_sio.event
async def config_update(data):
    """Handle configuration updates from server via storage connection"""
    global BROADCAST_INTERVAL, STORAGE_INTERVAL, broadcast_counter, storage_counter
    
    if data.get('vmId') == VM_ID:
        logger.info(f"Received configuration update from server: {data}")
        
        if 'broadcastInterval' in data:
            BROADCAST_INTERVAL = data['broadcastInterval']
        if 'storageInterval' in data:
            STORAGE_INTERVAL = data['storageInterval']
            
        # Reset counters to apply new intervals immediately
        broadcast_counter = 0
        storage_counter = 0
        
        logger.info(f"Updated intervals - Broadcast: {BROADCAST_INTERVAL}s, Storage: {STORAGE_INTERVAL}s")

app.on_startup.append(start_background_tasks)

if __name__ == "__main__":
    print(f"Starting Agent Server on 0.0.0.0:{AGENT_PORT}")
    print(f"Agent will be accessible from any network interface")
    web.run_app(app, host='0.0.0.0', port=AGENT_PORT)
