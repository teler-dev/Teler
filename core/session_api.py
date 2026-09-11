import json
import uuid
import base64
from pathlib import Path

from PyQt6.QtCore import QObject, QTimer, QUrl, pyqtSignal
from PyQt6.QtNetwork import QNetworkAccessManager, QNetworkReply, QNetworkRequest


class SessionClient(QObject):
    """Server-authoritative tracking session client using the existing AuthClient bearer session."""

    succeeded = pyqtSignal(str, object)
    failed = pyqtSignal(str, str, int)
    retrying = pyqtSignal(str, int)
    screenshot_uploaded = pyqtSignal(object, object)
    screenshot_failed = pyqtSignal(object, str)

    def __init__(self, auth_client, parent=None):
        super().__init__(parent)
        self.auth_client = auth_client
        self._network = QNetworkAccessManager(self)
        self._replies = set()

    def _event_id(self):
        return str(uuid.uuid4())

    def _request(self, action, method, path, payload=None, attempt=0, failovered=False):
        request = QNetworkRequest(QUrl(self.auth_client.request_url(path)))
        request.setTransferTimeout(12_000)
        request.setHeader(QNetworkRequest.KnownHeaders.ContentTypeHeader, "application/json")
        if self.auth_client.token:
            request.setRawHeader(b"Authorization", f"Bearer {self.auth_client.token}".encode("utf-8"))
        body = json.dumps(payload or {}).encode("utf-8")
        reply = self._network.get(request) if method == "GET" else self._network.post(request, body)
        self._replies.add(reply)
        reply.finished.connect(
            lambda r=reply, a=action, m=method, p=path, b=payload, n=attempt, f=failovered:
                self._finished(r, a, m, p, b, n, f)
        )

    def _finished(self, reply, action, method, path, payload, attempt, failovered):
        self._replies.discard(reply)
        status = int(reply.attribute(QNetworkRequest.Attribute.HttpStatusCodeAttribute) or 0)
        raw = bytes(reply.readAll()).decode("utf-8", errors="replace")
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {}

        ok = reply.error() == QNetworkReply.NetworkError.NoError and 200 <= status < 300
        if ok:
            self.succeeded.emit(action, body)
            reply.deleteLater()
            return

        if status == 0 and not failovered and self.auth_client.switch_to_desktop_relay():
            reply.deleteLater()
            self._request(action, method, path, payload, attempt, failovered=True)
            return

        retryable = status == 0 or status >= 500
        if retryable and attempt < 2:
            next_attempt = attempt + 1
            self.retrying.emit(action, next_attempt)
            delay = 400 * (2 ** attempt)
            QTimer.singleShot(delay, lambda: self._request(action, method, path, payload, next_attempt, failovered))
            reply.deleteLater()
            return

        message = body.get("error") if isinstance(body, dict) else None
        if not message:
            message = reply.errorString() or "Tracking request failed"
        if status == 401 and self.auth_client.token:
            if str(message).strip().lower() == "unauthorized":
                message = "Tracking API rejected the signed-in session. The server may still be running the legacy shared-token auth path."
            elif str(message).strip().lower() in {"session expired", "authentication required"}:
                message = "Your TELER session expired. Sign in again, then retry tracking."
        self.failed.emit(action, str(message), status)
        reply.deleteLater()

    def current(self):
        self._request("current", "GET", "/api/v1/tracking-sessions/current")

    def list_sessions(self, limit=30, offset=0):
        self._request("list", "GET", f"/api/v1/tracking-sessions?limit={int(limit)}&offset={int(offset)}")

    def start(self, role):
        self._request("start", "POST", "/api/v1/tracking-sessions/start", {
            "role_at_time": role,
            "client_source": "desktop",
            "client_event_id": self._event_id(),
        })

    def pause(self, session_id):
        self._request("pause", "POST", f"/api/v1/tracking-sessions/{session_id}/pause", {
            "client_source": "desktop",
            "client_event_id": self._event_id(),
        })

    def resume(self, session_id):
        self._request("resume", "POST", f"/api/v1/tracking-sessions/{session_id}/resume", {
            "client_source": "desktop",
            "client_event_id": self._event_id(),
        })

    def stop(self, session_id):
        self._request("stop", "POST", f"/api/v1/tracking-sessions/{session_id}/stop", {
            "client_source": "desktop",
            "client_event_id": self._event_id(),
        })

    @staticmethod
    def _metadata_header(value):
        return base64.urlsafe_b64encode(str(value or "").encode("utf-8")).rstrip(b"=")

    def upload_screenshot(self, screenshot, attempt=0, failovered=False):
        """Upload one locally captured image with the signed-in user's bearer session."""
        if not screenshot.get("_upload_event_id"):
            screenshot = {**screenshot, "_upload_event_id": self._event_id()}
        session_id = str(screenshot.get("server_session_id") or "")
        local_path = str(screenshot.get("screenshot_path") or "")
        if not session_id or not local_path:
            self.screenshot_failed.emit(screenshot, "Screenshot is missing its server session or local file")
            return
        try:
            image = Path(local_path).read_bytes()
        except OSError as error:
            self.screenshot_failed.emit(screenshot, f"Could not read screenshot: {error}")
            return

        upload_path = f"/api/v1/tracking-sessions/{session_id}/screenshots"
        request = QNetworkRequest(QUrl(self.auth_client.request_url(upload_path)))
        request.setTransferTimeout(30_000)
        request.setHeader(QNetworkRequest.KnownHeaders.ContentTypeHeader, "image/png")
        request.setRawHeader(b"X-Client-Event-Id", str(screenshot["_upload_event_id"]).encode("ascii"))
        request.setRawHeader(b"X-Captured-At", str(screenshot.get("timestamp") or "").encode("utf-8"))
        request.setRawHeader(b"X-Active-Window", self._metadata_header(screenshot.get("active_window")))
        request.setRawHeader(b"X-Active-App", self._metadata_header(screenshot.get("process_name")))
        if self.auth_client.token:
            request.setRawHeader(b"Authorization", f"Bearer {self.auth_client.token}".encode("utf-8"))
        reply = self._network.post(request, image)
        self._replies.add(reply)
        reply.finished.connect(
            lambda r=reply, item=dict(screenshot), n=attempt, f=failovered:
                self._screenshot_finished(r, item, n, f)
        )

    def _screenshot_finished(self, reply, screenshot, attempt, failovered):
        self._replies.discard(reply)
        status = int(reply.attribute(QNetworkRequest.Attribute.HttpStatusCodeAttribute) or 0)
        raw = bytes(reply.readAll()).decode("utf-8", errors="replace")
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {}
        ok = reply.error() == QNetworkReply.NetworkError.NoError and 200 <= status < 300
        if ok:
            self.screenshot_uploaded.emit(screenshot, body.get("data") if isinstance(body, dict) else {})
        elif status == 0 and not failovered and self.auth_client.switch_to_desktop_relay():
            reply.deleteLater()
            self.upload_screenshot(screenshot, attempt, failovered=True)
            return
        elif (status == 0 or status >= 500) and attempt < 2:
            QTimer.singleShot(
                800 * (2 ** attempt),
                lambda: self.upload_screenshot(screenshot, attempt + 1, failovered),
            )
        else:
            message = body.get("error") if isinstance(body, dict) else None
            self.screenshot_failed.emit(screenshot, str(message or reply.errorString() or "Screenshot upload failed"))
        reply.deleteLater()
