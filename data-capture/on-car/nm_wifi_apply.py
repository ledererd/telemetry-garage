"""
Apply WiFi access points from device config to NetworkManager on Raspberry Pi OS.

Uses nmcli to add/replace profiles (no direct .nmconnection writes). For each
configured network, any existing connection with the same name is removed, then a
new WiFi (WPA-PSK) profile is created. Tracks managed connection names in
.telemetry_wifi_nm_managed.json next to config.json.
"""

from __future__ import annotations

import json
import logging
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

STATE_FILENAME = ".telemetry_wifi_nm_managed.json"
WLAN_IFACE = "wlan0"

_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")


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


def _run_nmcli(args: List[str], timeout: int = 120) -> Tuple[int, str, str]:
    """Run nmcli with given args (after 'nmcli'). Returns (code, stdout, stderr)."""
    try:
        r = subprocess.run(
            ["nmcli", *args],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()
    except FileNotFoundError:
        return -1, "", "nmcli not found"
    except subprocess.TimeoutExpired:
        return -1, "", "nmcli timed out"
    except OSError as e:
        return -1, "", str(e)


def _nmcli_connection_names() -> Set[str]:
    code, out, err = _run_nmcli(["-t", "-f", "NAME", "connection", "show"], timeout=30)
    if code != 0:
        logger.warning("nmcli could not list connections (%s): %s", code, err or out)
        return set()
    return {line.strip() for line in out.splitlines() if line.strip()}


def _delete_connection(connection_id: str) -> bool:
    code, out, err = _run_nmcli(["connection", "delete", connection_id])
    if code == 0:
        logger.info("Removed NetworkManager connection %r", connection_id)
        return True
    # nmcli returns 10 if the connection does not exist
    if "unknown connection" in (err + out).lower() or "no such" in (err + out).lower():
        return True
    logger.warning(
        "nmcli connection delete %r failed (%s): %s %s",
        connection_id,
        code,
        err,
        out,
    )
    return False


def _modify_wifi_connection(connection_id: str, ssid: str, psk: str) -> bool:
    """Update an existing saved WiFi profile in place (same property set as add)."""
    args = [
        "connection",
        "modify",
        connection_id,
        "ssid",
        ssid,
        "wifi-sec.key-mgmt",
        "wpa-psk",
        "wifi-sec.psk",
        psk,
        "ipv4.method",
        "auto",
        "ipv6.method",
        "auto",
        "connection.autoconnect",
        "yes",
    ]
    code, out, err = _run_nmcli(args)
    if code == 0:
        logger.info(
            "Updated NetworkManager WiFi connection %r (SSID %r)",
            connection_id,
            ssid,
        )
        return True
    logger.warning(
        "nmcli connection modify failed for %r (%s): %s %s",
        connection_id,
        code,
        err,
        out,
    )
    return False


def _add_wifi_connection(connection_id: str, ssid: str, psk: str) -> bool:
    """
    Add a saved WiFi profile (WPA2-PSK), autoconnect on, DHCP IPv4/IPv6.
    Uses property names compatible with NetworkManager 1.14+ (wifi-sec.*).
    """
    args = [
        "connection",
        "add",
        "type",
        "wifi",
        "con-name",
        connection_id,
        "ifname",
        WLAN_IFACE,
        "ssid",
        ssid,
        "wifi-sec.key-mgmt",
        "wpa-psk",
        "wifi-sec.psk",
        psk,
        "ipv4.method",
        "auto",
        "ipv6.method",
        "auto",
        "connection.autoconnect",
        "yes",
    ]
    code, out, err = _run_nmcli(args)
    if code == 0:
        logger.info("Added NetworkManager WiFi connection %r (SSID %r)", connection_id, ssid)
        return True
    logger.warning(
        "nmcli connection add failed for %r (%s): %s %s",
        connection_id,
        code,
        err,
        out,
    )
    return False


def _replace_wifi_profile(connection_id: str, ssid: str, psk: str) -> bool:
    """
    Ensure a single saved profile for connection_id with the given SSID/PSK.
    Prefer delete + add when the name exists; if delete fails, fall back to modify.
    """
    names = _nmcli_connection_names()
    if connection_id in names:
        if _delete_connection(connection_id):
            return _add_wifi_connection(connection_id, ssid, psk)
        return _modify_wifi_connection(connection_id, ssid, psk)
    return _add_wifi_connection(connection_id, ssid, psk)


def _connection_reload() -> None:
    code, out, err = _run_nmcli(["connection", "reload"], timeout=30)
    if code != 0:
        logger.warning(
            "nmcli connection reload failed (%s): %s %s",
            code,
            err,
            out,
        )
    else:
        logger.info("NetworkManager connection reload completed")


def apply_networkmanager_wifi(config: Dict, config_path: Path) -> None:
    """
    Create or replace NetworkManager WiFi profiles from config['wifi_networks'] using nmcli.

    Each item: {"id": "my_wifi", "ssid": "...", "psk": "..."}.
    Requires nmcli and permission to manage system connections (typically root).

    If the key is omitted but this device previously applied profiles (state file),
    treats the list as empty. If the key is omitted and there is no state file, does nothing.
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

    code, _, verr = _run_nmcli(["--version"], timeout=5)
    if code != 0:
        logger.info(
            "nmcli not usable (%s); skipping WiFi apply. Install network-manager or run with appropriate privileges.",
            verr or "unknown error",
        )
        return

    previous = _load_managed_ids(state_path)
    current_ids = {e[0] for e in entries}

    for connection_id, ssid, psk in entries:
        _replace_wifi_profile(connection_id, ssid, psk)

    _save_managed_ids(state_path, current_ids)

    if not current_ids and not (previous - current_ids):
        return

    _connection_reload()

