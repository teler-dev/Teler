import sys
import os
from PyQt6.QtWidgets import (
    QApplication, QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QWidget
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QIcon, QPixmap

_LOGO_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "logo.png")

def _make_logo_label(height_px: int) -> QLabel | None:
    """Return a QLabel containing the scaled logo, or None if asset is missing."""
    try:
        pm = QPixmap(_LOGO_PATH)
        if pm.isNull():
            return None
        scaled = pm.scaledToHeight(height_px, Qt.TransformationMode.SmoothTransformation)
        lbl = QLabel()
        lbl.setPixmap(scaled)
        lbl.setFixedSize(scaled.width(), scaled.height())
        lbl.setAlignment(Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignHCenter)
        lbl.setStyleSheet("background: transparent; border: none;")
        return lbl
    except Exception:
        return None

from core.tracker import MainWindow
from tracker.activity_tracker import ActivityTracker, recover_incomplete_sessions


# ──────────────────────────────────────────────
# Login Dialog (username-only, any name accepted)
# ──────────────────────────────────────────────
class LoginDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("AI Timer - Login")
        self.setFixedSize(420, 360)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self._username = ""
        self._build_ui()

    def _build_ui(self):
        self.setStyleSheet("""
            QDialog {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 #1e1b4b, stop:0.5 #1e3a8a, stop:1 #312e81);
            }
            QWidget#card {
                background: rgba(17, 24, 39, 0.65);
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 16px;
            }
            QLabel#title    { color: #E5E7EB; font-size: 22px; font-weight: bold; }
            QLabel#subtitle { color: #9CA3AF; font-size: 13px; }
            QLabel#field_label { color: #D1D5DB; font-size: 13px; }
            QLabel#error    { color: #F87171; font-size: 12px; }
            QLineEdit {
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.18);
                border-radius: 10px;
                padding: 10px 14px;
                color: #F9FAFB;
                font-size: 14px;
            }
            QLineEdit:focus {
                border: 1px solid #6366F1;
                background: rgba(255,255,255,0.12);
            }
            QPushButton#login_btn {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #6366F1, stop:1 #4F46E5);
                border: none;
                border-radius: 10px;
                padding: 12px;
                color: #fff;
                font-size: 14px;
                font-weight: bold;
            }
            QPushButton#login_btn:hover  { background: #818CF8; }
            QPushButton#login_btn:pressed { background: #4338CA; }
        """)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(30, 30, 30, 30)

        card = QWidget()
        card.setObjectName("card")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(30, 30, 30, 30)
        card_layout.setSpacing(16)

        # Logo + title row (logo left of text, vertically centered)
        title_row = QHBoxLayout()
        title_row.setSpacing(10)
        title_row.setContentsMargins(0, 0, 0, 0)
        title_row.setAlignment(Qt.AlignmentFlag.AlignHCenter | Qt.AlignmentFlag.AlignVCenter)

        logo_lbl = _make_logo_label(32)  # 32px height, aspect-ratio preserved
        if logo_lbl is not None:
            title_row.addWidget(logo_lbl)

        title = QLabel("TELER")
        title.setObjectName("title")
        title.setAlignment(Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft)
        title_row.addWidget(title)

        card_layout.addLayout(title_row)  # add layout directly — no QWidget wrapper (avoids white bg on Windows)

        subtitle = QLabel("Enter your name to start a session")
        subtitle.setObjectName("subtitle")
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(subtitle)

        card_layout.addSpacing(8)

        field_label = QLabel("Username")
        field_label.setObjectName("field_label")
        card_layout.addWidget(field_label)

        self.username_input = QLineEdit()
        self.username_input.setPlaceholderText("e.g. John Doe")
        self.username_input.returnPressed.connect(self._on_login)
        card_layout.addWidget(self.username_input)

        self.error_label = QLabel("")
        self.error_label.setObjectName("error")
        self.error_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.error_label.hide()
        card_layout.addWidget(self.error_label)

        card_layout.addSpacing(4)

        login_btn = QPushButton("Continue →")
        login_btn.setObjectName("login_btn")
        login_btn.clicked.connect(self._on_login)
        card_layout.addWidget(login_btn)

        outer.addWidget(card)

    def _on_login(self):
        username = self.username_input.text().strip()
        if not username:
            self.error_label.setText("Please enter a username to continue.")
            self.error_label.show()
            return
        self._username = username
        self.accept()

    def get_username(self):
        return self._username


# ──────────────────────────────────────────────
# App entry point
# ──────────────────────────────────────────────
if __name__ == "__main__":
    app = QApplication(sys.argv)

    # Show login screen first
    login = LoginDialog()
    if login.exec() != QDialog.DialogCode.Accepted:
        sys.exit(0)

    username = login.get_username()

    # Mark any sessions that were abandoned without a clean stop as 'recovered'
    # so the dashboard surfaces them as partial sessions instead of losing them.
    recover_incomplete_sessions()

    # Launch main window with username
    window = MainWindow(username=username)
    window.show()

    sys.exit(app.exec())
