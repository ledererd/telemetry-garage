"""
Apply WiFi access points from device config to NetworkManager on Raspberry Pi OS.

Writes one .nmconnection file per entry under /etc/NetworkManager/system-connections/
and reloads NetworkManager. Tracks previously written connection ids to remove stale files.
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

NM_SYSTEM_CONNECTIONS = Path("/etc/NetworkManager/system-connections")
STATE_FILENAME = ".telemetry_wifi_nm_managed.json"

# Stable UUID per (device_id, connection id) so we do not churn NM state on every boot.
_UUID_NS = uuid.UUID("a1b2c3d4-e5f6-4789-a012-3456789abcde")

_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")


def _escape_keyfile_value(value: str) -> str:
    """Escape a value for NetworkManager keyfile format."""
    if value == "":
        return '""'
    if "\n" in value or "\r" in value:
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    if any(c in value for c in "=#") or value.startswith(" ") or value.endswith(" "):
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return value


def _render_nmconnection(connection_id: str, conn_uuid: str, ssid: str, psk: str) -> str:
    return (
        "[connection]\n"
        f"id={_escape_keyfile_value(connection_id)}\n"
        f"uuid={conn_uuid}\n"
        "type=wifi\n"
        "interface-name=wlan0\n"
        "\n"
        "[wifi]\n"
        "mode=infrastructure\n"
        f"ssid={_escape_keyfile_value(ssid)}\n"
        "\n"
        "[wifi-security]\n"
        "key-mgmt=wpa-psk\n"
        f"psk={_escape_keyfile_value(psk)}\n"
        "\n"
        "[ipv4]\n"
        "method=auto\n"
        "\n"
        "[ipv6]\n"
        "addr-gen-mode=default\n"
        "method=auto\n"
        "\n"
        "[proxy]\n"
    )


def _validate_entry(entry: Any) -> Optional[Tuple[str, str, str]]:
    if not isinstance(entry, dict):
        return None
    cid = entry.get("id")
    ssid = entry.get("ssid")
    psk = entry.get("psk")
    if not isinstance(cid, str) or not isinstance(ssid, str) or not isinstance(psk, str):
        return None
    cid = cid.strip()
    ssid = ssid.strip()
    if not cid or not ssid or not psk:
        return None
    if not _ID_RE.match(cid):
        logger.warning(
            "Skipping WiFi entry: invalid id %r (use letters, digits, underscore, dot, hyphen)",
            cid,
        )
        return None
    return cid, ssid, psk


def _connection_uuid(device_id: str, connection_id: str) -> str:
    return str(uuid.uuid5(_UUID_NS, f"{device_id}:{connection_id}"))


def _load_managed_ids(state_path: Path) -> Set[str]:
    if not state_path.exists():
        return set()
    try:
        with open(state_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        ids = data.get("managed_connection_ids")
        if isinstance(ids, list):
            return {str(x) for x in ids if isinstance(x, str)}
    except (OSError, json.JSONDecodeError) as e:
        logger.warning("Could not read WiFi NM state file %s: %s", state_path, e)
    return set()


def _save_managed_ids(state_path: Path, ids: Set[str]) -> None:
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        with open(state_path, "w", encoding="utf-8") as f:
            json.dump({"managed_connection_ids": sorted(ids)}, f, indent=2)
    except OSError as e:
        logger.warning("Could not write WiFi NM state file %s: %s", state_path, e)


def apply_networkmanager_wifi(config: Dict, config_path: Path) -> None:
    """
    Create or update NetworkManager WiFi profiles from config['wifi_networks'].

    Each item: {"id": "my_wifi", "ssid": "...", "psk": "..."}.
    Requires write access to NM_SYSTEM_CONNECTIONS (typically root).

    If the key is omitted but this device previously applied profiles (state file),
    treats the list as empty and removes those profiles. If the key is omitted and
    there is no state file, does nothing (backward compatible).
    """
    state_path = config_path.parent / STATE_FILENAME
    raw = config.get("wifi_networks")
    if raw is None:
        if not _load_managed_ids(state_path):
            return
        raw = []
    if not isinstance(raw, list):
        logger.warning("wifi_networks must be a list; skipping NetworkManager WiFi apply")
        return

    entries: List[Tuple[str, str, str]] = []
    for item in raw:
        parsed = _validate_entry(item)
        if parsed:
            entries.append(parsed)

    if not NM_SYSTEM_CONNECTIONS.is_dir():
        logger.info(
            "NetworkManager system-connections directory not found (%s); skipping WiFi apply",
            NM_SYSTEM_CONNECTIONS,
        )
        return

    device_id = str(config.get("device_id") or "device")
    previous = _load_managed_ids(state_path)
    current_ids = {e[0] for e in entries}

    # Remove profiles we previously managed but are no longer in config
    # NOTE:  Removing this functionality for now because in testing we often want to keep old profiles.
    #for old_id in previous - current_ids:
    #    path = NM_SYSTEM_CONNECTIONS / f"{old_id}.nmconnection"
    #    try:
    #        if path.is_file():
    #            path.unlink()
    #            logger.info("Removed managed WiFi profile %s", path)
    #    except OSError as e:
    #        logger.warning("Could not remove %s: %s", path, e)

    for connection_id, ssid, psk in entries:
        conn_uuid = _connection_uuid(device_id, connection_id)
        content = _render_nmconnection(connection_id, conn_uuid, ssid, psk)
        out_path = NM_SYSTEM_CONNECTIONS / f"{connection_id}.nmconnection"
        try:
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(content)
            os.chmod(out_path, 0o600)
            logger.info("Wrote NetworkManager profile %s", out_path)
        except OSError as e:
            logger.warning(
                "Could not write WiFi profile %s (run as root to manage connections): %s",
                out_path,
                e,
            )
            continue

    _save_managed_ids(state_path, current_ids)

    if not current_ids and not (previous - current_ids):
        return

    try:
        result = subprocess.run(
            ["nmcli", "connection", "reload"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            logger.warning(
                "nmcli connection reload failed (%s): %s",
                result.returncode,
                (result.stderr or result.stdout or "").strip(),
            )
        else:
            logger.info("NetworkManager connection reload completed")
    except FileNotFoundError:
        logger.warning("nmcli not found; WiFi files written but NetworkManager not reloaded")
    except subprocess.TimeoutExpired:
        logger.warning("nmcli connection reload timed out")
    except OSError as e:
        logger.warning("Could not run nmcli connection reload: %s", e)
