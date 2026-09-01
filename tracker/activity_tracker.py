import time
import threading
import os
import json
import re
import hashlib
from datetime import datetime
from collections import Counter
import platform
import pytesseract
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

from pynput import keyboard, mouse
import pyautogui
import cv2

pyautogui.PAUSE = 0

# ---- Data root: must match api/server.js BASE ----
# Override via environment variable TELER_DATA_BASE if deploying elsewhere.
DATA_BASE = os.environ.get(
    "TELER_DATA_BASE",
    os.path.join(os.path.expanduser("~"), "Documents", "TELER", "data")
)

# ── Temporary identity layer (replaced when multi-tenant auth ships) ──────────
COMPANY_ID = "COMP_DEV_001"

ROLE_TO_EMPLOYEE_ID = {
    "developer":  "EMP_DEV",
    "designer":   "EMP_DES",
    "manager":    "EMP_MGR",
    "accountant": "EMP_ACC",
    "qa":         "EMP_QA",
    "general":    "EMP_GEN",
}

def resolve_employee_id(role: str) -> str:
    return ROLE_TO_EMPLOYEE_ID.get((role or "").lower(), "EMP_UNKNOWN")

def make_employee_uid(employee_id: str) -> str:
    return f"{COMPANY_ID}_{employee_id}"


# ── Module-level atomic write helper ──────────────────────────────────────────

def _atomic_write_json(filepath: str, data: object) -> None:
    """Write JSON atomically: write to .tmp then os.replace() (same-filesystem rename)."""
    tmp = filepath + ".tmp"
    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, filepath)
    except Exception as e:
        print(f"[Tracker] Atomic write error ({filepath}): {e}")
        try:
            os.unlink(tmp)
        except Exception:
            pass


# ── Startup recovery scan ─────────────────────────────────────────────────────

def _recover_sessions_in_date_dir(date_dir: str, recovered: list) -> None:
    """Scan one date directory for in_progress sessions and mark them recovered."""
    for session_entry in os.listdir(date_dir):
        if not session_entry.startswith("Session_"):
            continue
        session_dir = os.path.join(date_dir, session_entry)
        master_path = os.path.join(session_dir, "master.json")
        if not os.path.isfile(master_path):
            continue
        try:
            with open(master_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if data.get("status") == "in_progress":
                data["status"] = "recovered"
                data["recovered_at"] = datetime.now().isoformat()

                events_path = os.path.join(session_dir, "events.jsonl")
                if os.path.isfile(events_path):
                    last_ts = None
                    try:
                        with open(events_path, "r", encoding="utf-8") as ef:
                            for raw_line in ef:
                                raw_line = raw_line.strip()
                                if not raw_line:
                                    continue
                                try:
                                    obj = json.loads(raw_line)
                                    if obj.get("timestamp"):
                                        last_ts = obj["timestamp"]
                                except json.JSONDecodeError:
                                    pass
                    except Exception:
                        pass
                    if last_ts:
                        data.setdefault("summary", {})["session_end"] = last_ts[11:19]

                _atomic_write_json(master_path, data)
                recovered.append(master_path)
                print(f"[Tracker] Recovered incomplete session: {master_path}")
        except Exception as e:
            print(f"[Tracker] Recovery scan error ({master_path}): {e}")


def recover_incomplete_sessions(data_base: str = DATA_BASE) -> list:
    """
    Scan all session directories for master.json files with status='in_progress'.
    Rewrite them as status='recovered' so the API surfaces them as partial sessions
    rather than losing them. Scans both the new companies/ structure and old logs/
    structure. Call once at app startup before creating a new session.
    Returns list of recovered session directory paths.
    """
    recovered = []

    # New structure: companies/{company_id}/employees/{employee_id}/sessions/{date}/Session_{stamp}/
    companies_root = os.path.join(data_base, "companies")
    if os.path.isdir(companies_root):
        for comp_entry in os.listdir(companies_root):
            employees_dir = os.path.join(companies_root, comp_entry, "employees")
            if not os.path.isdir(employees_dir):
                continue
            for emp_entry in os.listdir(employees_dir):
                sessions_dir = os.path.join(employees_dir, emp_entry, "sessions")
                if not os.path.isdir(sessions_dir):
                    continue
                for date_entry in os.listdir(sessions_dir):
                    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_entry):
                        continue
                    date_dir = os.path.join(sessions_dir, date_entry)
                    if os.path.isdir(date_dir):
                        _recover_sessions_in_date_dir(date_dir, recovered)

    # Old structure: logs/{date}/Session_{stamp}/
    logs_root = os.path.join(data_base, "logs")
    if os.path.isdir(logs_root):
        for date_entry in os.listdir(logs_root):
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_entry):
                continue
            date_dir = os.path.join(logs_root, date_entry)
            if os.path.isdir(date_dir):
                _recover_sessions_in_date_dir(date_dir, recovered)

    return recovered


# ── ActivityTracker ───────────────────────────────────────────────────────────

class ActivityTracker:
    """
    TELER activity tracker — crash-safe, format-unified.

    Session data is written continuously to disk in the new TELER format:
      DATA_BASE/logs/<date>/Session_<stamp>/master.json    checkpoint + final summary
      DATA_BASE/logs/<date>/Session_<stamp>/events.jsonl   live append, one JSON line/sec
      DATA_BASE/screenshots/<date>/Session_<stamp>/        one PNG per screenshot interval
      DATA_BASE/ocr/<date>/<stamp>-ocr-hour0.jsonl         unique OCR blocks (JSONL)
      DATA_BASE/keystroke/<date>/<stamp>-keystroke-hour0.json  per-keystroke timestamps

    On crash: master.json is left with status='in_progress' and events.jsonl contains
    all data up to the last second before the crash. recover_incomplete_sessions()
    marks them as 'recovered' on next startup.
    """

    MODIFIER_KEYS = {
        keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r,
        keyboard.Key.shift, keyboard.Key.shift_l, keyboard.Key.shift_r,
        keyboard.Key.alt, keyboard.Key.alt_l, keyboard.Key.alt_r, keyboard.Key.alt_gr,
        keyboard.Key.cmd, keyboard.Key.cmd_l, keyboard.Key.cmd_r,
    }

    SPECIAL_NAME_MAP = {
        keyboard.Key.enter:     "[ENTER]",
        keyboard.Key.space:     "[SPACE]",
        keyboard.Key.backspace: "[BACKSPACE]",
        keyboard.Key.tab:       "[TAB]",
        keyboard.Key.esc:       "[ESC]",
        keyboard.Key.delete:    "[DELETE]",
        keyboard.Key.up:        "[UP]",
        keyboard.Key.down:      "[DOWN]",
        keyboard.Key.left:      "[LEFT]",
        keyboard.Key.right:     "[RIGHT]",
    }

    def __init__(self, idle_threshold=30, screenshot_interval=60, camera_interval=120,
                 camera_enabled=False, ocr_enabled=True, username=""):
        # ---- Config ----
        self.idle_threshold = idle_threshold
        self.screenshot_interval = screenshot_interval
        self.camera_interval = camera_interval
        self.camera_enabled = camera_enabled
        self.ocr_enabled = ocr_enabled

        # ---- Employee identity ----
        self.username = username or os.environ.get("TELER_USER", platform.node() or "unknown")

        # ---- Runtime state ----
        self.is_tracking = False
        self.running = False
        self.last_input_time = time.time()

        self.key_count = 0
        self.click_count = 0
        self.idle_seconds = 0
        self.idle_accumulated = 0
        self.active_window = "Unknown"
        self.active_url = ""
        self._last_window = ""
        self._window_switches = 0

        self.screenshots_taken = 0
        self.snapshots_taken = 0
        self.last_ocr_snippet = ""

        # ---- Metadata ----
        self.role = "Unspecified"
        self.task = "Unspecified"
        self.employee_id  = resolve_employee_id(self.role)
        self.employee_uid = make_employee_uid(self.employee_id)

        # ---- Session identifiers ----
        self.lock = threading.Lock()
        self.start_time = None   # "YYYY-MM-DD_HH-MM-SS" kept for UI compatibility
        self.today = None        # "YYYY-MM-DD"
        self.stamp = None        # "HH-MM-SS"
        self.end_time = None

        self._stop_event = threading.Event()

        # ---- Active file paths (set in start()) ----
        self._session_dir = None
        self._events_path = None
        self._master_path = None
        self._screenshot_dir = None
        self._ocr_path = None
        self._keystroke_json_path = None
        self._camera_folder = None

        # ---- In-memory buffers ----
        self.session_logs = []   # kept for get_stats() compatibility
        self.ai_logs = []
        self._snapshots = []     # list of snapshot metadata dicts → written into master.json
        self._ks_timestamps = [] # ISO timestamp per keypress → written into keystroke JSON

        # ---- OCR dedup ----
        self._last_ocr_hash = None

        # ---- Keystroke per-minute (kept for compatibility, no longer written to a .log file) ----
        self._modifiers_down = set()
        self._minute_anchor = None
        self._minute_buffer = []

    # ---------------------------
    # Metadata
    # ---------------------------
    def set_metadata(self, role, task):
        self.role = role or "Unspecified"
        self.task = task or "Unspecified"
        self.employee_id  = resolve_employee_id(self.role)
        self.employee_uid = make_employee_uid(self.employee_id)
        self.ai_logs.append({
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "event": "Role/Task Changed",
            "role": self.role,
            "task": self.task,
        })

    # ---------------------------
    # Config setters
    # ---------------------------
    def set_idle_threshold(self, seconds):      self.idle_threshold      = int(seconds)
    def set_screenshot_interval(self, seconds): self.screenshot_interval = max(10, int(seconds))
    def set_camera_enabled(self, enabled: bool): self.camera_enabled     = bool(enabled)
    def set_camera_interval(self, seconds):     self.camera_interval     = max(10, int(seconds))

    # ---------------------------
    # Helpers
    # ---------------------------
    def get_active_window(self):
        try:
            if platform.system() == "Windows":
                import win32gui
                hwnd = win32gui.GetForegroundWindow()
                return win32gui.GetWindowText(hwnd) or "Unknown"
            return "Active window not supported"
        except Exception:
            return "Unknown"

    def _extract_url_from_ocr(self, text: str):
        match = re.search(r"(https?://[^\s]+)", text)
        return match.group(1) if match else ""

    # ---------------------------
    # Atomic write
    # ---------------------------
    def _atomic_write_json(self, filepath: str, data: object) -> None:
        _atomic_write_json(filepath, data)

    # ---------------------------
    # Mouse
    # ---------------------------
    def _on_click(self, x, y, button, pressed):
        if pressed:
            with self.lock:
                self.click_count += 1
                self.last_input_time = time.time()

    # ---------------------------
    # Keystrokes
    # ---------------------------
    def _format_key_token(self, key):
        mods = []
        if any(k in self._modifiers_down for k in [keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r]):
            mods.append("CTRL")
        if any(k in self._modifiers_down for k in [keyboard.Key.shift, keyboard.Key.shift_l, keyboard.Key.shift_r]):
            mods.append("SHIFT")
        if any(k in self._modifiers_down for k in [keyboard.Key.alt, keyboard.Key.alt_l, keyboard.Key.alt_r, keyboard.Key.alt_gr]):
            mods.append("ALT")
        if any(k in self._modifiers_down for k in [keyboard.Key.cmd, keyboard.Key.cmd_l, keyboard.Key.cmd_r]):
            mods.append("CMD")
        if hasattr(key, "char") and key.char:
            return f"[{'+'.join(mods)}+{key.char.upper()}]" if mods else key.char
        if isinstance(key, keyboard.Key):
            token = self.SPECIAL_NAME_MAP.get(key, f"[{str(key).split('.')[-1].upper()}]")
            return f"[{'+'.join(mods)}+{token.strip('[]')}]" if mods else token
        return str(key)

    def _on_key_press(self, key):
        with self.lock:
            if key in self.MODIFIER_KEYS:
                self._modifiers_down.add(key)
            self.key_count += 1
            self.last_input_time = time.time()
            self._append_keystroke_token(self._format_key_token(key))
            self._ks_timestamps.append(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

    def _on_key_release(self, key):
        with self.lock:
            if key in self.MODIFIER_KEYS:
                self._modifiers_down.discard(key)

    # ---------------------------
    # Keystroke per-minute
    # ---------------------------
    def _append_keystroke_token(self, token):
        now_minute = datetime.now().strftime("%H:%M")
        if self._minute_anchor is None:
            self._minute_anchor = now_minute
        if now_minute != self._minute_anchor:
            self._flush_minute_buffer()
            self._minute_anchor = now_minute
        self._minute_buffer.append(token)

    def _flush_minute_buffer(self, force=False):
        if not self._minute_buffer and not force:
            return
        self._minute_buffer = []

    def _flush_keystroke_json(self):
        """Write keystroke JSON atomically. Safe to call multiple times (checkpoint + stop)."""
        if not self._keystroke_json_path:
            return
        with self.lock:
            events = [{"timestamp": ts} for ts in self._ks_timestamps]
            total = len(events)
        self._atomic_write_json(
            self._keystroke_json_path,
            {"total_keystrokes": total, "detailed_keystrokes": events}
        )

    # ---------------------------
    # Master JSON
    # ---------------------------
    def _build_master(self, status: str) -> dict:
        """Build master.json payload. Called on checkpoint and on stop."""
        now_str = datetime.now().strftime("%H:%M:%S")
        with self.lock:
            duration    = len(self.session_logs)
            idle_acc    = self.idle_accumulated
            key_cnt     = self.key_count
            click_cnt   = self.click_count
            win_sw      = self._window_switches
        idle_pct = round(idle_acc / max(1, duration) * 100, 1)

        return {
            "meta": {
                "user_name":    self.username,
                "company_id":   COMPANY_ID,
                "employee_id":  self.employee_id,
                "employee_uid": self.employee_uid,
            },
            "summary": {
                "session_start":    self.stamp.replace("-", ":"),
                "session_end":      now_str if status != "in_progress" else None,
                "duration_seconds": duration,
                "idle_percent":     idle_pct,
                "key_count":        key_cnt,
                "mouse_clicks":     click_cnt,
                "window_switches":  win_sw,
                "role":             self.role,
                "task":             self.task,
                "client":           "",
                "description":      "",
            },
            "snapshots":      list(self._snapshots),
            "status":         status,
            "checkpoint_at":  datetime.now().isoformat(),
        }

    def _write_master(self, status: str) -> None:
        if self._master_path:
            self._atomic_write_json(self._master_path, self._build_master(status))

    # ---------------------------
    # Start / Stop
    # ---------------------------
    def start(self):
        if self.is_tracking:
            return

        # Session timestamps — today is locked to session-start date for the entire session.
        # A session that crosses midnight will have post-midnight events but the folder
        # and all file paths use the start date, which is correct: the API derives the
        # session start from the folder date + stamp, and the actual wall-clock end time
        # from the last event timestamp in events.jsonl.
        self.today     = datetime.now().strftime("%Y-%m-%d")
        self.stamp     = datetime.now().strftime("%H-%M-%S")
        self.start_time = f"{self.today}_{self.stamp}"

        # ---- Build session directory tree ----
        _emp_base = os.path.join(
            DATA_BASE, "companies", COMPANY_ID, "employees", self.employee_id
        )
        self._session_dir = os.path.join(
            _emp_base, "sessions", self.today, f"Session_{self.stamp}"
        )
        os.makedirs(self._session_dir, exist_ok=True)

        self._events_path  = os.path.join(self._session_dir, "events.jsonl")
        self._master_path  = os.path.join(self._session_dir, "master.json")

        self._screenshot_dir = os.path.join(self._session_dir, "screenshots")
        os.makedirs(self._screenshot_dir, exist_ok=True)

        ocr_dir = os.path.join(_emp_base, "ocr", self.today)
        os.makedirs(ocr_dir, exist_ok=True)
        self._ocr_path = os.path.join(ocr_dir, f"{self.stamp}-ocr-hour0.jsonl")

        ks_dir = os.path.join(_emp_base, "keystroke", self.today)
        os.makedirs(ks_dir, exist_ok=True)
        self._keystroke_json_path = os.path.join(ks_dir, f"{self.stamp}-keystroke-hour0.json")

        # Camera writes outside DATA_BASE (not read by the API).
        self._camera_folder = os.path.join("camera_report", self.today)
        os.makedirs(self._camera_folder, exist_ok=True)

        # ---- Reset runtime state ----
        self.is_tracking = self.running = True
        self._stop_event.clear()
        self.key_count        = 0
        self.click_count      = 0
        self.idle_seconds     = 0
        self.idle_accumulated = 0
        self._window_switches = 0
        self._last_window     = ""
        self.last_input_time  = time.time()
        self.session_logs     = []
        self.ai_logs          = []
        self._snapshots       = []
        self._ks_timestamps   = []
        self._minute_anchor   = None
        self._minute_buffer   = []
        self._last_ocr_hash   = None
        self.last_ocr_snippet = ""
        self.active_url       = ""
        self.screenshots_taken = 0
        self.snapshots_taken  = 0
        self.end_time         = None

        # Write initial master.json immediately.
        # If the app is killed before stop(), this file exists on disk with
        # status='in_progress' and recover_incomplete_sessions() will mark it recovered.
        self._write_master("in_progress")

        # ---- Input listeners ----
        self.keyboard_listener = keyboard.Listener(
            on_press=self._on_key_press, on_release=self._on_key_release
        )
        self.mouse_listener = mouse.Listener(on_click=self._on_click)
        self.keyboard_listener.start()
        self.mouse_listener.start()

        # ---- Worker threads ----
        threading.Thread(target=self._run,               daemon=True).start()
        threading.Thread(target=self._checkpoint_loop,   daemon=True).start()
        threading.Thread(target=self._capture_screenshots, daemon=True).start()
        if self.camera_enabled:
            threading.Thread(target=self._capture_camera, daemon=True).start()

        print("[Tracker] Started")

    def stop(self):
        if not self.is_tracking:
            return
        self.is_tracking = self.running = False
        self._stop_event.set()
        self.end_time = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

        try:
            if self.keyboard_listener: self.keyboard_listener.stop()
            if self.mouse_listener:    self.mouse_listener.stop()
        except Exception:
            pass

        self._flush_minute_buffer(force=True)
        self._flush_keystroke_json()
        self._write_master("completed")  # atomic, status → completed
        print("[Tracker] Stopped")

    # ---------------------------
    # Worker threads
    # ---------------------------
    def _run(self):
        """Main 1-second telemetry loop. Appends one event line to events.jsonl per tick."""
        while not self._stop_event.is_set():
            time.sleep(1)
            now = time.time()
            idle_now = int(now - self.last_input_time)
            self.idle_seconds = idle_now if idle_now > self.idle_threshold else 0
            if self.idle_seconds > 0:
                self.idle_accumulated += 1

            self.active_window = self.get_active_window()

            with self.lock:
                if self.active_window != self._last_window and self._last_window:
                    self._window_switches += 1
                self._last_window = self.active_window

            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            log_entry = {
                "timestamp":          ts,
                "window_title":       self.active_window,
                "active_window":      self.active_window,  # kept for backward compat
                "active_url":         self.active_url,
                "keys":               self.key_count,
                "clicks":             self.click_count,
                "idle_seconds":       self.idle_seconds,
                "idle_minutes_total": round(self.idle_accumulated / 60, 1),
                "role":               self.role,
                "task":               self.task,
                "last_ocr_snippet":   self.last_ocr_snippet[:200],
            }
            self.session_logs.append(log_entry)
            self.ai_logs.append(log_entry)

            # Append event to events.jsonl immediately — crash-safe live log
            if self._events_path:
                try:
                    with open(self._events_path, "a", encoding="utf-8") as ef:
                        ef.write(json.dumps({
                            "timestamp":    ts,
                            "window_title": log_entry["window_title"],
                            "active_url":   log_entry["active_url"],
                            "keys":         log_entry["keys"],
                            "clicks":       log_entry["clicks"],
                            "idle_seconds": log_entry["idle_seconds"],
                        }) + "\n")
                except Exception as e:
                    print(f"[Tracker] events.jsonl write error: {e}")

    def _checkpoint_loop(self):
        """Write master.json + keystroke JSON every 60 seconds during tracking."""
        elapsed = 0
        while not self._stop_event.is_set():
            time.sleep(1)
            elapsed += 1
            if elapsed >= 60:
                elapsed = 0
                if self.is_tracking:
                    self._write_master("in_progress")
                    self._flush_keystroke_json()

    def _capture_screenshots(self):
        while not self._stop_event.is_set():
            try:
                ts = datetime.now().strftime("%H-%M-%S")
                filename = f"{self.today}_{ts}.png"
                filepath = os.path.join(self._screenshot_dir, filename)
                img = pyautogui.screenshot()
                img.save(filepath)
                self.screenshots_taken += 1

                snapshot_entry = {
                    "screenshot_path":        filepath,
                    "screenshot_type":        "image",
                    "active_window":          self.active_window,
                    "active_url":             self.active_url,
                    "idle_seconds_this_period": self.idle_seconds,
                    "timestamp":              datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "process_name":           "",
                }

                if self.ocr_enabled:
                    top_crop = img.crop((0, 0, img.width, 80))
                    text = pytesseract.image_to_string(top_crop)
                    text_raw = text or ""
                    text_norm = re.sub(r"\s+", " ", text_raw).strip().lower()

                    if text_norm:
                        text_hash = hashlib.sha1(text_norm.encode("utf-8")).hexdigest()
                        if text_hash != self._last_ocr_hash:
                            self.last_ocr_snippet = text_raw.strip()[:500]
                            url = self._extract_url_from_ocr(text_raw)
                            if url:
                                self.active_url = url
                                snapshot_entry["active_url"] = url

                            if self._ocr_path:
                                try:
                                    ocr_entry = {
                                        "timestamp":    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                        "ocr_text":     text_raw.strip(),
                                        "active_window": self.active_window,
                                        "active_url":   self.active_url,
                                    }
                                    with open(self._ocr_path, "a", encoding="utf-8") as of:
                                        of.write(json.dumps(ocr_entry) + "\n")
                                except Exception as fe:
                                    print(f"[Tracker] OCR append error: {fe}")

                            self._last_ocr_hash = text_hash
                    else:
                        snapshot_entry["screenshot_type"] = "duplicate"

                with self.lock:
                    self._snapshots.append(snapshot_entry)

            except Exception as e:
                print(f"[Tracker] Screenshot error: {e}")

            for _ in range(self.screenshot_interval):
                if self._stop_event.is_set():
                    break
                time.sleep(1)

    def _capture_camera(self):
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("[Tracker] Camera not available.")
            return
        while not self._stop_event.is_set() and self.camera_enabled:
            ret, frame = cap.read()
            if ret:
                ts = datetime.now().strftime("%H-%M-%S")
                filepath = os.path.join(self._camera_folder, f"cam_{ts}.jpg")
                cv2.imwrite(filepath, frame)
                self.snapshots_taken += 1
            else:
                print("[Tracker] Camera read failed, retrying...")
                cap.release()
                time.sleep(5)
                cap = cv2.VideoCapture(0)
            for _ in range(self.camera_interval):
                if self._stop_event.is_set():
                    break
                time.sleep(1)
        cap.release()

    # ---------------------------
    # Stats for UI
    # ---------------------------
    def get_stats(self):
        return {
            "keys":               self.key_count,
            "clicks":             self.click_count,
            "idle_seconds":       self.idle_seconds,
            "idle_threshold":     self.idle_threshold,
            "active_window":      self.active_window,
            "active_url":         self.active_url,
            "screenshots":        self.screenshots_taken,
            "screenshot_interval": self.screenshot_interval,
            "camera_enabled":     self.camera_enabled,
            "camera_interval":    self.camera_interval,
            "snapshots":          self.snapshots_taken,
            "role":               self.role,
            "task":               self.task,
            "last_ocr_snippet":   self.last_ocr_snippet[:100],
        }
