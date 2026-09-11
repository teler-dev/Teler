import time
import threading
import os
import json
import re
import hashlib
from datetime import datetime
from collections import Counter
import platform
import shutil
import pytesseract
pytesseract.pytesseract.tesseract_cmd = os.environ.get("TELER_TESSERACT_CMD") or shutil.which("tesseract") or (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe" if platform.system() == "Windows" else "tesseract"
)

from pynput import keyboard, mouse
import pyautogui
import cv2

pyautogui.PAUSE = 0

DATA_BASE = os.environ.get(
    "TELER_DATA_BASE",
    os.path.join(os.path.expanduser("~"), "Documents", "TELER", "data")
)

COMPANY_ID = "COMP_DEV_001"

ROLE_TO_EMPLOYEE_ID = {
    "developer": "EMP_DEV", "designer": "EMP_DES", "manager": "EMP_MGR",
    "accountant": "EMP_ACC", "qa": "EMP_QA", "general": "EMP_GEN",
}

def resolve_employee_id(role: str) -> str:
    return ROLE_TO_EMPLOYEE_ID.get((role or "").lower(), "EMP_UNKNOWN")

def make_employee_uid(employee_id: str) -> str:
    return f"{COMPANY_ID}_{employee_id}"


def _atomic_write_json(filepath: str, data: object) -> None:
    tmp = filepath + ".tmp"
    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, filepath)
    except Exception as e:
        print(f"[Tracker] Atomic write error ({filepath}): {e}")
        try: os.unlink(tmp)
        except Exception: pass


def _recover_sessions_in_date_dir(date_dir: str, recovered: list) -> None:
    for session_entry in os.listdir(date_dir):
        if not session_entry.startswith("Session_"): continue
        session_dir = os.path.join(date_dir, session_entry)
        master_path = os.path.join(session_dir, "master.json")
        if not os.path.isfile(master_path): continue
        try:
            with open(master_path, "r", encoding="utf-8") as fh: data = json.load(fh)
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
                                if not raw_line: continue
                                try:
                                    obj = json.loads(raw_line)
                                    if obj.get("timestamp"): last_ts = obj["timestamp"]
                                except json.JSONDecodeError: pass
                    except Exception: pass
                    if last_ts: data.setdefault("summary", {})["session_end"] = last_ts[11:19]
                _atomic_write_json(master_path, data)
                recovered.append(master_path)
                print(f"[Tracker] Recovered incomplete session: {master_path}")
        except Exception as e:
            print(f"[Tracker] Recovery scan error ({master_path}): {e}")


def recover_incomplete_sessions(data_base: str = DATA_BASE) -> list:
    recovered = []
    companies_root = os.path.join(data_base, "companies")
    if os.path.isdir(companies_root):
        for comp_entry in os.listdir(companies_root):
            employees_dir = os.path.join(companies_root, comp_entry, "employees")
            if not os.path.isdir(employees_dir): continue
            for emp_entry in os.listdir(employees_dir):
                sessions_dir = os.path.join(employees_dir, emp_entry, "sessions")
                if not os.path.isdir(sessions_dir): continue
                for date_entry in os.listdir(sessions_dir):
                    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_entry): continue
                    date_dir = os.path.join(sessions_dir, date_entry)
                    if os.path.isdir(date_dir): _recover_sessions_in_date_dir(date_dir, recovered)
    logs_root = os.path.join(data_base, "logs")
    if os.path.isdir(logs_root):
        for date_entry in os.listdir(logs_root):
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_entry): continue
            date_dir = os.path.join(logs_root, date_entry)
            if os.path.isdir(date_dir): _recover_sessions_in_date_dir(date_dir, recovered)
    return recovered


class ActivityTracker:
    MODIFIER_KEYS = {
        keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r,
        keyboard.Key.shift, keyboard.Key.shift_l, keyboard.Key.shift_r,
        keyboard.Key.alt, keyboard.Key.alt_l, keyboard.Key.alt_r, keyboard.Key.alt_gr,
        keyboard.Key.cmd, keyboard.Key.cmd_l, keyboard.Key.cmd_r,
    }
    SPECIAL_NAME_MAP = {
        keyboard.Key.enter: "[ENTER]", keyboard.Key.space: "[SPACE]",
        keyboard.Key.backspace: "[BACKSPACE]", keyboard.Key.tab: "[TAB]",
        keyboard.Key.esc: "[ESC]", keyboard.Key.delete: "[DELETE]",
        keyboard.Key.up: "[UP]", keyboard.Key.down: "[DOWN]",
        keyboard.Key.left: "[LEFT]", keyboard.Key.right: "[RIGHT]",
    }

    def __init__(self, idle_threshold=30, screenshot_interval=60, camera_interval=120,
                 camera_enabled=False, ocr_enabled=True, username="", organization_id="", employee_id=""):
        self.idle_threshold = idle_threshold
        self.screenshot_interval = screenshot_interval
        self.camera_interval = camera_interval
        self.camera_enabled = camera_enabled
        self.ocr_enabled = ocr_enabled
        self.username = username or os.environ.get("TELER_USER", platform.node() or "unknown")
        self.organization_id = organization_id
        self.company_id = organization_id or COMPANY_ID
        self.account_employee_id = employee_id
        self.is_tracking = False
        self.running = False
        self.paused = False
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
        self.role = "Unspecified"
        self.task = "Unspecified"
        self.employee_id = self.account_employee_id or resolve_employee_id(self.role)
        self.employee_uid = f"{self.company_id}_{self.employee_id}"
        self.lock = threading.Lock()
        self.start_time = None
        self.today = None
        self.stamp = None
        self.end_time = None
        self._stop_event = threading.Event()
        self._workers = []
        self._session_dir = self._events_path = self._master_path = None
        self._screenshot_dir = self._ocr_path = self._keystroke_json_path = self._camera_folder = None
        self.session_logs = []
        self.ai_logs = []
        self._snapshots = []
        self._pending_screenshots = []
        self._uploading_screenshot_paths = set()
        self.server_session_id = ""
        self._ks_timestamps = []
        self._last_ocr_hash = None
        self._modifiers_down = set()
        self._minute_anchor = None
        self._minute_buffer = []

    def set_metadata(self, role, task):
        self.role = role or "Unspecified"
        self.task = task or "Unspecified"
        self.employee_id = self.account_employee_id or resolve_employee_id(self.role)
        self.employee_uid = f"{self.company_id}_{self.employee_id}"
        self.ai_logs.append({"timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "event": "Role/Task Changed", "role": self.role, "task": self.task})

    def set_server_session_id(self, session_id):
        """Associate newly captured screenshots with the server-authoritative session."""
        with self.lock:
            self.server_session_id = str(session_id or "")

    def claim_pending_screenshots(self, limit=2):
        """Return captures that may be uploaded now, marking them in-flight safely."""
        with self.lock:
            claimed = []
            for snapshot in self._pending_screenshots:
                filepath = snapshot.get("screenshot_path")
                if not filepath or filepath in self._uploading_screenshot_paths:
                    continue
                self._uploading_screenshot_paths.add(filepath)
                claimed.append(dict(snapshot))
                if len(claimed) >= limit:
                    break
            return claimed

    def mark_screenshot_uploaded(self, local_path, storage_path, screenshot_id=None):
        """Keep only server metadata after a confirmed upload; the local image is removed."""
        with self.lock:
            self._uploading_screenshot_paths.discard(local_path)
            self._pending_screenshots = [item for item in self._pending_screenshots if item.get("screenshot_path") != local_path]
            for snapshot in self._snapshots:
                if snapshot.get("screenshot_path") == local_path:
                    snapshot["screenshot_path"] = storage_path
                    snapshot["screenshot_id"] = screenshot_id
                    snapshot["uploaded"] = True
                    break
        try:
            if local_path and os.path.isfile(local_path):
                os.remove(local_path)
        except OSError as error:
            print(f"[Tracker] Uploaded screenshot cleanup error: {error}")

    def mark_screenshot_upload_failed(self, local_path):
        with self.lock:
            self._uploading_screenshot_paths.discard(local_path)

    def set_idle_threshold(self, seconds): self.idle_threshold = int(seconds)
    def set_screenshot_interval(self, seconds): self.screenshot_interval = max(10, int(seconds))
    def set_camera_enabled(self, enabled: bool): self.camera_enabled = bool(enabled)
    def set_camera_interval(self, seconds): self.camera_interval = max(10, int(seconds))

    def get_active_window(self):
        try:
            if platform.system() == "Windows":
                import win32gui
                hwnd = win32gui.GetForegroundWindow()
                return win32gui.GetWindowText(hwnd) or "Unknown"
            if platform.system() == "Darwin":
                from AppKit import NSWorkspace
                app = NSWorkspace.sharedWorkspace().frontmostApplication()
                return app.localizedName() if app else "Unknown"
            return "Active window not supported"
        except Exception: return "Unknown"

    def _extract_url_from_ocr(self, text: str):
        match = re.search(r"(https?://[^\s]+)", text)
        return match.group(1) if match else ""

    def _atomic_write_json(self, filepath: str, data: object) -> None:
        _atomic_write_json(filepath, data)

    def _on_click(self, x, y, button, pressed):
        if not self.is_tracking or self.paused: return
        if pressed:
            with self.lock:
                self.click_count += 1
                self.last_input_time = time.time()

    def _format_key_token(self, key):
        mods = []
        if any(k in self._modifiers_down for k in [keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r]): mods.append("CTRL")
        if any(k in self._modifiers_down for k in [keyboard.Key.shift, keyboard.Key.shift_l, keyboard.Key.shift_r]): mods.append("SHIFT")
        if any(k in self._modifiers_down for k in [keyboard.Key.alt, keyboard.Key.alt_l, keyboard.Key.alt_r, keyboard.Key.alt_gr]): mods.append("ALT")
        if any(k in self._modifiers_down for k in [keyboard.Key.cmd, keyboard.Key.cmd_l, keyboard.Key.cmd_r]): mods.append("CMD")
        if hasattr(key, "char") and key.char: return f"[{'+'.join(mods)}+{key.char.upper()}]" if mods else key.char
        if isinstance(key, keyboard.Key):
            token = self.SPECIAL_NAME_MAP.get(key, f"[{str(key).split('.')[-1].upper()}]")
            return f"[{'+'.join(mods)}+{token.strip('[]')}]" if mods else token
        return str(key)

    def _on_key_press(self, key):
        if not self.is_tracking or self.paused: return
        with self.lock:
            if key in self.MODIFIER_KEYS: self._modifiers_down.add(key)
            self.key_count += 1
            self.last_input_time = time.time()
            self._append_keystroke_token(self._format_key_token(key))
            self._ks_timestamps.append(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

    def _on_key_release(self, key):
        if not self.is_tracking or self.paused: return
        with self.lock:
            if key in self.MODIFIER_KEYS: self._modifiers_down.discard(key)

    def _append_keystroke_token(self, token):
        now_minute = datetime.now().strftime("%H:%M")
        if self._minute_anchor is None: self._minute_anchor = now_minute
        if now_minute != self._minute_anchor:
            self._flush_minute_buffer(); self._minute_anchor = now_minute
        self._minute_buffer.append(token)

    def _flush_minute_buffer(self, force=False):
        if not self._minute_buffer and not force: return
        self._minute_buffer = []

    def _flush_keystroke_json(self):
        if not self._keystroke_json_path: return
        with self.lock:
            events = [{"timestamp": ts} for ts in self._ks_timestamps]
        self._atomic_write_json(self._keystroke_json_path, {"total_keystrokes": len(events), "detailed_keystrokes": events})

    def _build_master(self, status: str) -> dict:
        now_str = datetime.now().strftime("%H:%M:%S")
        with self.lock:
            duration = len(self.session_logs); idle_acc = self.idle_accumulated
            key_cnt = self.key_count; click_cnt = self.click_count; win_sw = self._window_switches
        idle_pct = round(idle_acc / max(1, duration) * 100, 1)
        return {
            "meta": {"user_name": self.username, "company_id": self.company_id, "organization_id": self.organization_id or None, "employee_id": self.employee_id, "employee_uid": self.employee_uid},
            "summary": {"session_start": self.stamp.replace("-", ":") if self.stamp else None, "session_end": now_str if status != "in_progress" else None, "duration_seconds": duration, "idle_percent": idle_pct, "key_count": key_cnt, "mouse_clicks": click_cnt, "window_switches": win_sw, "role": self.role, "task": self.task, "client": "", "description": ""},
            "snapshots": list(self._snapshots), "status": status, "paused": self.paused, "checkpoint_at": datetime.now().isoformat(),
        }

    def _write_master(self, status: str):
        if self._master_path: self._atomic_write_json(self._master_path, self._build_master(status))

    def start(self):
        if self.is_tracking: return
        self.today = datetime.now().strftime("%Y-%m-%d")
        self.stamp = datetime.now().strftime("%H-%M-%S")
        self.start_time = f"{self.today}_{self.stamp}"
        _emp_base = os.path.join(DATA_BASE, "companies", self.company_id, "employees", self.employee_id)
        self._session_dir = os.path.join(_emp_base, "sessions", self.today, f"Session_{self.stamp}")
        os.makedirs(self._session_dir, exist_ok=True)
        self._events_path = os.path.join(self._session_dir, "events.jsonl")
        self._master_path = os.path.join(self._session_dir, "master.json")
        self._screenshot_dir = os.path.join(self._session_dir, "screenshots"); os.makedirs(self._screenshot_dir, exist_ok=True)
        ocr_dir = os.path.join(_emp_base, "ocr", self.today); os.makedirs(ocr_dir, exist_ok=True)
        self._ocr_path = os.path.join(ocr_dir, f"{self.stamp}-ocr-hour0.jsonl")
        ks_dir = os.path.join(_emp_base, "keystroke", self.today); os.makedirs(ks_dir, exist_ok=True)
        self._keystroke_json_path = os.path.join(ks_dir, f"{self.stamp}-keystroke-hour0.json")
        self._camera_folder = os.path.join("camera_report", self.today); os.makedirs(self._camera_folder, exist_ok=True)
        self.is_tracking = self.running = True; self.paused = False; self._stop_event.clear()
        self.key_count = self.click_count = self.idle_seconds = self.idle_accumulated = self._window_switches = 0
        self._last_window = ""; self.last_input_time = time.time(); self.session_logs = []; self.ai_logs = []; self._snapshots = []; self._pending_screenshots = []; self._uploading_screenshot_paths = set(); self._ks_timestamps = []
        self._minute_anchor = None; self._minute_buffer = []; self._last_ocr_hash = None; self.last_ocr_snippet = ""; self.active_url = ""
        self.screenshots_taken = self.snapshots_taken = 0; self.end_time = None
        self._write_master("in_progress")
        self.keyboard_listener = self.mouse_listener = None
        try:
            if platform.system() == "Darwin":
                from tracker.macos_input import MacInputListener
                self.keyboard_listener = MacInputListener(self._on_key_press, self._on_click)
            else:
                self.keyboard_listener = keyboard.Listener(on_press=self._on_key_press, on_release=self._on_key_release)
                self.mouse_listener = mouse.Listener(on_click=self._on_click)
            self.keyboard_listener.start()
            if self.mouse_listener: self.mouse_listener.start()
        except Exception:
            self.stop(); raise
        targets = [self._run, self._checkpoint_loop, self._capture_screenshots]
        if self.camera_enabled: targets.append(self._capture_camera)
        self._workers = [threading.Thread(target=target, daemon=True) for target in targets]
        for worker in self._workers: worker.start()
        print("[Tracker] Started")

    def pause(self):
        if not self.is_tracking or self.paused: return
        self.paused = True
        self.running = False
        self._write_master("in_progress")
        print("[Tracker] Paused")

    def resume(self):
        if not self.is_tracking or not self.paused: return
        self.paused = False
        self.running = True
        self.last_input_time = time.time()
        self._write_master("in_progress")
        print("[Tracker] Resumed")

    def stop(self):
        if not self.is_tracking: return
        self.is_tracking = self.running = self.paused = False
        self._stop_event.set()
        self.end_time = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        try:
            if self.keyboard_listener: self.keyboard_listener.stop()
            if self.mouse_listener: self.mouse_listener.stop()
        except Exception: pass
        for worker in self._workers: worker.join()
        self._workers = []
        self._flush_minute_buffer(force=True); self._flush_keystroke_json(); self._write_master("completed")
        print("[Tracker] Stopped")

    def _run(self):
        while not self._stop_event.wait(1):
            if self.paused: continue
            now = time.time(); idle_now = int(now - self.last_input_time)
            self.idle_seconds = idle_now if idle_now > self.idle_threshold else 0
            if self.idle_seconds > 0: self.idle_accumulated += 1
            self.active_window = self.get_active_window()
            with self.lock:
                if self.active_window != self._last_window and self._last_window: self._window_switches += 1
                self._last_window = self.active_window
            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            log_entry = {"timestamp": ts, "window_title": self.active_window, "active_window": self.active_window, "active_url": self.active_url, "keys": self.key_count, "clicks": self.click_count, "idle_seconds": self.idle_seconds, "idle_minutes_total": round(self.idle_accumulated / 60, 1), "role": self.role, "task": self.task, "last_ocr_snippet": self.last_ocr_snippet[:200]}
            self.session_logs.append(log_entry); self.ai_logs.append(log_entry)
            if self._events_path:
                try:
                    with open(self._events_path, "a", encoding="utf-8") as ef:
                        ef.write(json.dumps({"timestamp": ts, "window_title": log_entry["window_title"], "active_url": log_entry["active_url"], "keys": log_entry["keys"], "clicks": log_entry["clicks"], "idle_seconds": log_entry["idle_seconds"]}) + "\n")
                except Exception as e: print(f"[Tracker] events.jsonl write error: {e}")

    def _checkpoint_loop(self):
        elapsed = 0
        while not self._stop_event.wait(1):
            if self.paused: continue
            elapsed += 1
            if elapsed >= 60:
                elapsed = 0
                if self.is_tracking: self._write_master("in_progress"); self._flush_keystroke_json()

    def _capture_screenshots(self):
        while not self._stop_event.is_set():
            if self.paused:
                time.sleep(1); continue
            try:
                ts = datetime.now().strftime("%H-%M-%S"); filename = f"{self.today}_{ts}.png"; filepath = os.path.join(self._screenshot_dir, filename)
                img = pyautogui.screenshot(); img.save(filepath); self.screenshots_taken += 1
                snapshot_entry = {"screenshot_path": filepath, "screenshot_type": "image", "active_window": self.active_window, "active_url": self.active_url, "idle_seconds_this_period": self.idle_seconds, "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "process_name": ""}
                if self.ocr_enabled:
                    top_crop = img.crop((0, 0, img.width, 80)); text = pytesseract.image_to_string(top_crop, timeout=5); text_raw = text or ""; text_norm = re.sub(r"\s+", " ", text_raw).strip().lower()
                    if text_norm:
                        text_hash = hashlib.sha1(text_norm.encode("utf-8")).hexdigest()
                        if text_hash != self._last_ocr_hash:
                            self.last_ocr_snippet = text_raw.strip()[:500]; url = self._extract_url_from_ocr(text_raw)
                            if url: self.active_url = url; snapshot_entry["active_url"] = url
                            if self._ocr_path:
                                try:
                                    with open(self._ocr_path, "a", encoding="utf-8") as of: of.write(json.dumps({"timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "ocr_text": text_raw.strip(), "active_window": self.active_window, "active_url": self.active_url}) + "\n")
                                except Exception as fe: print(f"[Tracker] OCR append error: {fe}")
                            self._last_ocr_hash = text_hash
                    else: snapshot_entry["screenshot_type"] = "duplicate"
                with self.lock:
                    self._snapshots.append(snapshot_entry)
                    if self.server_session_id:
                        snapshot_entry["server_session_id"] = self.server_session_id
                        self._pending_screenshots.append(snapshot_entry)
            except Exception as e: print(f"[Tracker] Screenshot error: {e}")
            for _ in range(self.screenshot_interval):
                if self._stop_event.is_set() or self.paused: break
                time.sleep(1)

    def _capture_camera(self):
        cap = cv2.VideoCapture(0)
        if not cap.isOpened(): print("[Tracker] Camera not available."); return
        while not self._stop_event.is_set() and self.camera_enabled:
            if self.paused:
                time.sleep(1); continue
            ret, frame = cap.read()
            if ret:
                ts = datetime.now().strftime("%H-%M-%S"); filepath = os.path.join(self._camera_folder, f"cam_{ts}.jpg"); cv2.imwrite(filepath, frame); self.snapshots_taken += 1
            else:
                print("[Tracker] Camera read failed, retrying..."); cap.release(); time.sleep(5); cap = cv2.VideoCapture(0)
            for _ in range(self.camera_interval):
                if self._stop_event.is_set() or self.paused: break
                time.sleep(1)
        cap.release()

    def get_stats(self):
        return {"keys": self.key_count, "clicks": self.click_count, "idle_seconds": self.idle_seconds, "idle_threshold": self.idle_threshold, "active_window": self.active_window, "active_url": self.active_url, "screenshots": self.screenshots_taken, "screenshot_interval": self.screenshot_interval, "camera_enabled": self.camera_enabled, "camera_interval": self.camera_interval, "snapshots": self.snapshots_taken, "role": self.role, "task": self.task, "last_ocr_snippet": self.last_ocr_snippet[:100], "paused": self.paused}
