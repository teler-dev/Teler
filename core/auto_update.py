"""Safe, opt-in Windows updates for the packaged TELER desktop app.

The client only accepts HTTPS manifests from the TELER update channel, verifies
the downloaded executable against the SHA-256 supplied by that manifest, then
uses a short-lived cmd helper to replace the executable after TELER exits.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from PyQt6.QtCore import QThread, pyqtSignal


DESKTOP_VERSION = "2026.9.20"
MANIFEST_URL = os.environ.get(
    "TELER_UPDATE_MANIFEST_URL", "https://teler-pi.vercel.app/desktop/latest.json"
).strip()
MAX_UPDATE_BYTES = 800 * 1024 * 1024
TRUSTED_DOWNLOAD_HOSTS = {
    "teler-pi.vercel.app",
    "204-216-105-57.sslip.io",
    "github.com",
    "objects.githubusercontent.com",
    "github-releases.githubusercontent.com",
    "release-assets.githubusercontent.com",
}


@dataclass(frozen=True)
class UpdateInfo:
    version: str
    download_url: str
    sha256: str
    notes: str = ""
    mandatory: bool = False


def _version_parts(value: str) -> tuple[int, int, int]:
    parts = str(value).strip().split(".")
    if len(parts) != 3 or any(not part.isdigit() for part in parts):
        raise ValueError("Version must use major.minor.patch numeric format")
    return tuple(int(part) for part in parts)  # type: ignore[return-value]


def is_newer_version(candidate: str, current: str = DESKTOP_VERSION) -> bool:
    return _version_parts(candidate) > _version_parts(current)


def _validated_update(data: object, current: str = DESKTOP_VERSION) -> UpdateInfo | None:
    if not isinstance(data, dict):
        raise ValueError("Update manifest must be an object")
    version = str(data.get("version", "")).strip()
    if not is_newer_version(version, current):
        return None
    download_url = str(data.get("download_url", "")).strip()
    parsed = urllib.parse.urlparse(download_url)
    if parsed.scheme != "https" or parsed.hostname not in TRUSTED_DOWNLOAD_HOSTS:
        raise ValueError("Update download host is not trusted")
    checksum = str(data.get("sha256", "")).lower().strip()
    if len(checksum) != 64 or any(char not in "0123456789abcdef" for char in checksum):
        raise ValueError("Update manifest has no valid SHA-256 checksum")
    return UpdateInfo(
        version=version,
        download_url=download_url,
        sha256=checksum,
        notes=str(data.get("notes", "")).strip()[:1_000],
        mandatory=bool(data.get("mandatory", False)),
    )


def fetch_update(current: str = DESKTOP_VERSION, manifest_url: str = MANIFEST_URL) -> UpdateInfo | None:
    request = urllib.request.Request(manifest_url, headers={"Accept": "application/json", "User-Agent": f"TELER/{current}"})
    with urllib.request.urlopen(request, timeout=12) as response:
        if response.status != 200:
            raise RuntimeError(f"Update server returned HTTP {response.status}")
        raw = response.read(32 * 1024)
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("Update manifest is not valid JSON") from error
    return _validated_update(data, current)


def download_update(info: UpdateInfo) -> Path:
    update_dir = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / "TELER" / "updates"
    update_dir.mkdir(parents=True, exist_ok=True)
    target = update_dir / f"TELER-{info.version}.exe"
    partial = target.with_suffix(".part")
    digest = hashlib.sha256()
    total = 0
    request = urllib.request.Request(info.download_url, headers={"User-Agent": f"TELER/{DESKTOP_VERSION}"})
    try:
        with urllib.request.urlopen(request, timeout=45) as response, open(partial, "wb") as output:
            if response.status != 200:
                raise RuntimeError(f"Update download returned HTTP {response.status}")
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPDATE_BYTES:
                    raise ValueError("Update exceeds the allowed size")
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest().lower() != info.sha256:
            raise ValueError("Downloaded update did not match its SHA-256 checksum")
        os.replace(partial, target)
        return target
    except Exception:
        partial.unlink(missing_ok=True)
        raise


def apply_update_and_restart(downloaded_file: Path) -> bool:
    """Start a helper after TELER closes; it replaces and starts the EXE."""
    if os.name != "nt" or not getattr(sys, "frozen", False):
        return False
    target = Path(sys.executable).resolve()
    if not downloaded_file.is_file() or not os.access(target.parent, os.W_OK):
        return False
    script = Path(tempfile.gettempdir()) / f"teler-update-{os.getpid()}.cmd"
    # Quoted paths prevent command injection even when TELER was launched from
    # a directory that contains spaces. The helper runs only after this process exits.
    script.write_text(
        "@echo off\r\n"
        "timeout /t 2 /nobreak >nul\r\n"
        f'copy /y "{downloaded_file}" "{target}.new" >nul || goto :done\r\n'
        f'move /y "{target}.new" "{target}" >nul || goto :done\r\n'
        f'start "" "{target}"\r\n'
        f'del /q "{downloaded_file}" >nul 2>&1\r\n'
        ":done\r\n"
        "del /q \"%~f0\" >nul 2>&1\r\n",
        encoding="utf-8",
    )
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    subprocess.Popen(["cmd.exe", "/c", str(script)], creationflags=flags, close_fds=True)
    return True


class UpdateCheckThread(QThread):
    update_ready = pyqtSignal(object)
    check_failed = pyqtSignal(str)

    def run(self) -> None:
        try:
            update = fetch_update()
            if update:
                self.update_ready.emit(update)
        except Exception as error:
            # Update checks are non-critical. The running tracker must not be
            # interrupted by a temporary release-server problem.
            self.check_failed.emit(str(error))


class UpdateDownloadThread(QThread):
    download_ready = pyqtSignal(object)
    download_failed = pyqtSignal(str)

    def __init__(self, update: UpdateInfo, parent=None):
        super().__init__(parent)
        self.update = update

    def run(self) -> None:
        try:
            self.download_ready.emit(download_update(self.update))
        except Exception as error:
            self.download_failed.emit(str(error))
