import time

from fastapi import APIRouter

router = APIRouter()

_started = time.monotonic()

try:
    import psutil

    _HAS_PSUTIL = True
except Exception:  # pragma: no cover
    _HAS_PSUTIL = False


@router.get("/health")
def health():
    now = time.monotonic()
    uptime_s = round(now - _started, 1)
    payload = {
        "status": "ok",
        "service": "ecomind-ai",
        "uptime_s": uptime_s,
    }
    if _HAS_PSUTIL:
        cpu = psutil.cpu_percent(interval=0.2)
        mem = psutil.virtual_memory()
        payload["system"] = {
            "cpu_percent": round(cpu, 1),
            "memory_percent": round(mem.percent, 1),
            "memory_used_mb": round(mem.used / 1024 / 1024, 1),
            "memory_total_mb": round(mem.total / 1024 / 1024, 1),
            "python_cpu_percent": round(psutil.Process().cpu_percent(interval=0.1), 1),
            "python_memory_mb": round(psutil.Process().memory_info().rss / 1024 / 1024, 1),
        }
    return payload
