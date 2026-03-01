from app.monitor.system import SystemMonitor


def test_system_stats_structure():
    stats = SystemMonitor.get_system_stats()

    assert "memory" in stats
    assert "disk" in stats
    assert "cpu" in stats
    assert "platform" in stats


def test_memory_stats():
    stats = SystemMonitor.get_system_stats()
    mem = stats["memory"]

    assert mem["total"] > 0
    assert mem["available"] > 0
    assert mem["used"] > 0
    assert 0 <= mem["percent"] <= 100
    assert mem["used"] <= mem["total"]


def test_cpu_stats():
    stats = SystemMonitor.get_system_stats()
    cpu = stats["cpu"]

    assert cpu["cores"] > 0
    assert isinstance(cpu["percent"], (int, float))
    assert cpu["percent"] >= 0


def test_disk_stats():
    stats = SystemMonitor.get_system_stats()
    disk = stats["disk"]

    assert disk["total"] > 0
    assert disk["free"] >= 0
    assert disk["used"] >= 0
    assert 0 <= disk["percent"] <= 100


def test_platform_info():
    stats = SystemMonitor.get_system_stats()
    plat = stats["platform"]

    assert isinstance(plat["system"], str)
    assert len(plat["system"]) > 0
    assert isinstance(plat["processor"], str)
