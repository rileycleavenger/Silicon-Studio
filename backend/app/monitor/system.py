import psutil
import platform
import shutil
from pathlib import Path

class SystemMonitor:
    @staticmethod
    def get_system_stats():
        # RAM Usage
        mem = psutil.virtual_memory()
        
        # Disk Usage (where the app runs)
        du = shutil.disk_usage(str(Path.home()))
        
        # CPU Usage
        cpu_percent = psutil.cpu_percent(interval=None)
        
        # Basic GPU/Unified Mem heuristic (placeholder until MLX provides direct queries or via specialized tool)
        # On M-series, System RAM = VRAM mostly.
        
        return {
            "memory": {
                "total": mem.total,
                "available": mem.available,
                "used": mem.used,
                "percent": round((mem.used / mem.total) * 100)
            },
            "disk": {
                "total": du.total,
                "free": du.free,
                "used": du.used,
                "percent": (du.used / du.total) * 100
            },
            "cpu": {
                "percent": cpu_percent,
                "cores": psutil.cpu_count(logical=True)
            },
            "platform": {
                "system": platform.system(),
                "processor": platform.processor(),
                "release": platform.release()
            }
        }
