import os
import re
import sys

from PyQt6.QtCore import QObject, QTimer, Qt
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import (
    QApplication, QDialog, QHBoxLayout, QLabel, QLineEdit, QPushButton,
    QScrollArea, QVBoxLayout, QWidget,
)

from core.auth import AuthClient
from core.tracker import MainWindow
from tracker.activity_tracker import recover_incomplete_sessions


_LOGO_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "logo.png")


def _make_logo_label(height_px):
    try:
        pixmap = QPixmap(_LOGO_PATH)
        if pixmap.isNull():
            return None
        scaled = pixmap.scaledToHeight(height_px, Qt.TransformationMode.SmoothTransformation)
        label = QLabel()
        label.setPixmap(scaled)
        label.setFixedSize(scaled.width(), scaled.height())
        return label
    except Exception:
        return None


class AuthDialog(QDialog):
    def __init__(self, client, parent=None):
        super().__init__(parent)
        self.client = client
        self.account = None
        self.mode = "login"
        self.setWindowTitle("TELER - Sign in")
        self.resize(500, 700)
        self.setMinimumSize(440, 560)
        self._build_ui()
        self.client.auth_succeeded.connect(self._auth_succeeded)
        self.client.request_failed.connect(self._request_failed)
        if self.client.token:
            self._set_busy(True, "Restoring your session…")
            QTimer.singleShot(0, self.client.restore_session)

    def _build_ui(self):
        self.setStyleSheet("""
            QDialog { background: #111827; }
            QScrollArea { background: #111827; border: 0; }
            QScrollArea > QWidget > QWidget { background: #111827; }
            QWidget#card { background: #172033; border: 1px solid #334155; border-radius: 16px; }
            QLabel#title { color: #F8FAFC; font-size: 24px; font-weight: 700; }
            QLabel#subtitle, QLabel#field { color: #94A3B8; font-size: 12px; }
            QLabel#error { color: #FCA5A5; font-size: 12px; }
            QLineEdit { background: #0F172A; border: 1px solid #334155; border-radius: 9px;
                        padding: 10px 12px; color: #F8FAFC; font-size: 13px; }
            QLineEdit:focus { border-color: #6366F1; }
            QPushButton#primary { background: #4F46E5; border: 0; border-radius: 9px;
                                  padding: 11px; color: white; font-weight: 700; }
            QPushButton#primary:hover { background: #6366F1; }
            QPushButton#mode { background: transparent; border: 0; padding: 6px; color: #A5B4FC; }
            QPushButton#mode[active="true"] { color: white; border-bottom: 2px solid #6366F1; }
        """)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(28, 28, 28, 28)
        card = QWidget(objectName="card")
        card.setMinimumWidth(380)
        form = QVBoxLayout(card)
        form.setContentsMargins(30, 26, 30, 26)
        form.setSpacing(10)

        brand = QHBoxLayout()
        brand.setAlignment(Qt.AlignmentFlag.AlignCenter)
        logo = _make_logo_label(32)
        if logo:
            brand.addWidget(logo)
        brand.addWidget(QLabel("TELER", objectName="title"))
        form.addLayout(brand)

        self.subtitle = QLabel("Sign in to start secure tracking", objectName="subtitle")
        self.subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        form.addWidget(self.subtitle)

        modes = QHBoxLayout()
        self.login_mode = QPushButton("Sign in", objectName="mode")
        self.signup_mode = QPushButton("Create account", objectName="mode")
        self.login_mode.clicked.connect(lambda: self._set_mode("login"))
        self.signup_mode.clicked.connect(lambda: self._set_mode("signup"))
        modes.addWidget(self.login_mode)
        modes.addWidget(self.signup_mode)
        form.addLayout(modes)

        self.name_label, self.name = self._field(form, "Full name", "Abdul Quddus")
        self.workspace_label, self.workspace = self._field(form, "Workspace", "My company")
        self.email_label, self.email = self._field(form, "Email", "name@company.com")
        self.password_label, self.password = self._field(form, "Password", "Minimum 8 characters")
        self.password.setEchoMode(QLineEdit.EchoMode.Password)
        self.confirm_label, self.confirm = self._field(form, "Confirm password", "Repeat your password")
        self.confirm.setEchoMode(QLineEdit.EchoMode.Password)
        self.confirm.returnPressed.connect(self._submit)
        self.password.returnPressed.connect(self._submit)

        self.error = QLabel("", objectName="error")
        self.error.setWordWrap(True)
        self.error.hide()
        form.addWidget(self.error)

        self.submit = QPushButton("Sign in", objectName="primary")
        self.submit.clicked.connect(self._submit)
        form.addWidget(self.submit)

        self.server_label, self.server = self._field(form, "Server", self.client.api_base)
        self.server.setText(self.client.api_base)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setWidget(card)
        outer.addWidget(scroll)
        self._set_mode("login")

    def _field(self, layout, label_text, placeholder):
        label = QLabel(label_text, objectName="field")
        edit = QLineEdit()
        edit.setMinimumHeight(42)
        edit.setPlaceholderText(placeholder)
        layout.addWidget(label)
        layout.addWidget(edit)
        return label, edit

    def _set_mode(self, mode):
        self.mode = mode
        signup = mode == "signup"
        for widget in (self.name_label, self.name, self.workspace_label, self.workspace,
                       self.confirm_label, self.confirm):
            widget.setVisible(signup)
        self.submit.setText("Create account" if signup else "Sign in")
        self.submit.setMinimumHeight(44)
        self.subtitle.setText("Create your TELER workspace" if signup else "Sign in to start secure tracking")
        self.login_mode.setProperty("active", not signup)
        self.signup_mode.setProperty("active", signup)
        for button in (self.login_mode, self.signup_mode):
            button.style().unpolish(button)
            button.style().polish(button)
        self.error.hide()

    def _submit(self):
        email = self.email.text().strip()
        password = self.password.text()
        server = self.server.text().strip()
        if not email or not password or not server:
            return self._show_error("Email, password and server are required.")
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            return self._show_error("Enter a valid email address, for example name@company.com.")
        self.client.configure(server)
        if self.mode == "signup":
            name = self.name.text().strip()
            workspace = self.workspace.text().strip()
            if not name or not workspace:
                return self._show_error("Name and workspace are required.")
            if password != self.confirm.text():
                return self._show_error("Passwords do not match.")
            if len(password) < 8:
                return self._show_error("Password must contain at least 8 characters.")
            self._set_busy(True, "Creating account…")
            self.client.signup(name, email, password, workspace)
        else:
            self._set_busy(True, "Signing in…")
            self.client.login(email, password)

    def _set_busy(self, busy, message=""):
        self.submit.setEnabled(not busy)
        self.login_mode.setEnabled(not busy)
        self.signup_mode.setEnabled(not busy)
        if message:
            self.error.setText(message)
            self.error.setStyleSheet("color: #94A3B8;")
            self.error.show()

    def _show_error(self, message):
        self.error.setStyleSheet("color: #FCA5A5;")
        self.error.setText(message)
        self.error.show()

    def _auth_succeeded(self, account):
        self.account = account
        self.accept()

    def _request_failed(self, message, status):
        self._set_busy(False)
        if not message and status == 401:
            self.error.hide()
            return
        if status == 503:
            message = "Server authentication database is not configured yet."
        elif status == 401 and self.mode == "signup" and message == "Unauthorized":
            message = "Oracle server is still running the old TELER API. Deploy the auth update first."
        elif status == 0:
            message = f"Cannot reach TELER server: {message}"
        self._show_error(message)


class ApplicationController(QObject):
    def __init__(self, app):
        super().__init__()
        self.app = app
        self.client = AuthClient(self)
        self.window = None

    def start(self):
        recover_incomplete_sessions()
        self.show_login()

    def show_login(self):
        dialog = AuthDialog(self.client)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            self.app.quit()
            return
        account = dialog.account or self.client.saved_account() or {}
        display_name = account.get("displayName") or account.get("email") or "TELER User"
        organization = account.get("organization") or {}
        self.window = MainWindow(username=display_name, organization_name=organization.get("name", ""))
        self.window.logout_requested.connect(self.logout)
        self.window.show()

    def logout(self):
        self.client.logout()
        if self.window:
            self.window.close()
            self.window.deleteLater()
            self.window = None
        QTimer.singleShot(0, self.show_login)


if __name__ == "__main__":
    application = QApplication(sys.argv)
    application.setQuitOnLastWindowClosed(False)
    controller = ApplicationController(application)
    QTimer.singleShot(0, controller.start)
    sys.exit(application.exec())
