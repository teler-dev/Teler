import json
import os

from PyQt6.QtCore import QObject, QSettings, QUrl, pyqtSignal
from PyQt6.QtNetwork import QNetworkAccessManager, QNetworkReply, QNetworkRequest


DEFAULT_API_BASE = os.environ.get(
    "TELER_API_BASE", "https://148-116-79-191.sslip.io"
).rstrip("/")


class AuthClient(QObject):
    """Asynchronous TELER authentication client for the desktop application."""

    auth_succeeded = pyqtSignal(dict)
    request_failed = pyqtSignal(str, int)
    logout_finished = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._network = QNetworkAccessManager(self)
        self._settings = QSettings("TELER", "Desktop")
        self._replies = set()

    @property
    def api_base(self):
        return str(self._settings.value("api_base", DEFAULT_API_BASE)).rstrip("/")

    @property
    def token(self):
        return str(self._settings.value("auth_token", ""))

    def configure(self, api_base):
        value = str(api_base or "").strip().rstrip("/")
        if value:
            self._settings.setValue("api_base", value)

    def clear_session(self):
        self._settings.remove("auth_token")
        self._settings.remove("account")
        self._settings.sync()

    def saved_account(self):
        raw = self._settings.value("account", "")
        try:
            return json.loads(raw) if raw else None
        except (TypeError, json.JSONDecodeError):
            return None

    def login(self, email, password):
        self._request("POST", "/api/auth/login", {"email": email, "password": password}, "auth")

    def signup(self, display_name, email, password, organization_name, job_role):
        self._request(
            "POST", "/api/auth/signup",
            {"displayName": display_name, "email": email, "password": password,
             "organizationName": organization_name, "jobRole": job_role},
            "auth",
        )

    def restore_session(self):
        if not self.token:
            self.request_failed.emit("", 401)
            return
        self._request("GET", "/api/auth/me", None, "auth")

    def logout(self):
        old_token = self.token
        self.clear_session()
        if not old_token:
            self.logout_finished.emit()
            return
        self._request("POST", "/api/auth/logout", {}, "logout", token=old_token)

    def _request(self, method, path, payload, purpose, token=None):
        request = QNetworkRequest(QUrl(f"{self.api_base}{path}"))
        request.setHeader(QNetworkRequest.KnownHeaders.ContentTypeHeader, "application/json")
        bearer = self.token if token is None else token
        if bearer:
            request.setRawHeader(b"Authorization", f"Bearer {bearer}".encode("utf-8"))
        body = json.dumps(payload or {}).encode("utf-8")
        reply = self._network.get(request) if method == "GET" else self._network.post(request, body)
        self._replies.add(reply)
        reply.finished.connect(lambda r=reply, p=purpose: self._finished(r, p))

    def _finished(self, reply, purpose):
        self._replies.discard(reply)
        status = int(reply.attribute(QNetworkRequest.Attribute.HttpStatusCodeAttribute) or 0)
        raw = bytes(reply.readAll()).decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {}
        if reply.error() == QNetworkReply.NetworkError.NoError and 200 <= status < 300:
            if purpose == "logout":
                self.logout_finished.emit()
            else:
                token = payload.get("token")
                account = payload.get("user") or {}
                if token:
                    self._settings.setValue("auth_token", token)
                if account:
                    self._settings.setValue("account", json.dumps(account))
                self._settings.sync()
                self.auth_succeeded.emit(account)
        else:
            if purpose == "auth" and status == 401 and self.token:
                self.clear_session()
            message = payload.get("error") or reply.errorString() or "Request failed"
            if purpose == "logout":
                self.logout_finished.emit()
            else:
                self.request_failed.emit(message, status)
        reply.deleteLater()
