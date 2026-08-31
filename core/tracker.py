# ui/main_window.py
import os
from PyQt6.QtWidgets import (
    QMainWindow, QLabel, QPushButton, QVBoxLayout, QWidget,
    QComboBox, QTextEdit, QHBoxLayout
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QIcon, QPixmap
from tracker.activity_tracker import ActivityTracker

_ASSETS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
_LOGO_PATH  = os.path.join(_ASSETS_DIR, "logo.png")
_ICO_PATH   = os.path.join(_ASSETS_DIR, "teler.ico")

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


class MainWindow(QMainWindow):
    def __init__(self, username=""):
        super().__init__()

        # ==== Window Setup ====
        title = f"AI Timer App  —  {username}" if username else "AI Timer App"
        self.setWindowTitle(title)
        self.setGeometry(200, 200, 500, 500)

        # Window icon — use .ico for correct Windows taskbar/title bar rendering
        try:
            icon = QIcon(_ICO_PATH) if os.path.isfile(_ICO_PATH) else QIcon(QPixmap(_LOGO_PATH))
            if not icon.isNull():
                self.setWindowIcon(icon)
        except Exception:
            pass

        # ==== Widgets ====
        self.role_dropdown = QComboBox()
        self.role_dropdown.addItems(["General", "Developer", "Designer", "Manager", "Accountant"])
        self.role_dropdown.setToolTip("Select Role")

        self.start_button = QPushButton("Start Tracking")
        self.stop_button = QPushButton("Stop Tracking")
        self.stop_button.setEnabled(False)

        self.status_label = QLabel("Status: Idle")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.report_area = QTextEdit()
        self.report_area.setReadOnly(True)
        self.report_area.setPlaceholderText("Reports will appear here...")

        # ==== Layout ====
        layout = QVBoxLayout()

        # Branding row: logo + app name (replaces OS title bar branding in content area)
        brand_row = QHBoxLayout()
        brand_row.setSpacing(8)
        brand_row.setContentsMargins(0, 0, 0, 0)

        brand_logo = _make_logo_label(20)  # 20px height keeps it compact
        if brand_logo is not None:
            brand_row.addWidget(brand_logo)

        brand_text = QLabel("TELER")
        brand_text.setStyleSheet("color: #6366F1; font-size: 14px; font-weight: bold;")
        brand_text.setAlignment(Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft)
        brand_row.addWidget(brand_text)
        brand_row.addStretch()

        if username:
            user_label = QLabel(f"Logged in as: {username}")
            user_label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
            user_label.setStyleSheet("color: #6366F1; font-size: 12px; padding: 2px 6px;")
            brand_row.addWidget(user_label)

        layout.addLayout(brand_row)

        layout.addWidget(QLabel("Role:"))
        layout.addWidget(self.role_dropdown)

        button_layout = QHBoxLayout()
        button_layout.addWidget(self.start_button)
        button_layout.addWidget(self.stop_button)
        layout.addLayout(button_layout)

        layout.addWidget(self.status_label)
        layout.addWidget(self.report_area)

        container = QWidget()
        container.setLayout(layout)
        self.setCentralWidget(container)

        # ==== Tracker backend ====
        self.tracker = ActivityTracker(username=username)

        # Timer for UI updates
        self.timer = QTimer()
        self.timer.timeout.connect(self.update_stats)

        # ==== Connections ====
        self.start_button.clicked.connect(self.start_tracking)
        self.stop_button.clicked.connect(self.stop_tracking)

    # ==== Functions ====
    def start_tracking(self):
        role = self.role_dropdown.currentText()
        self.status_label.setText(f"Status: Tracking ({role})")
        self.report_area.append(f"Started tracking with role: {role}\n")
        self.start_button.setEnabled(False)
        self.stop_button.setEnabled(True)

        self.tracker.set_metadata(role, "")
        self.tracker.start()
        self.timer.start(1000)  # update every second

    def stop_tracking(self):
        self.status_label.setText("Status: Stopped")
        self.report_area.append("Stopped tracking.\n")
        self.start_button.setEnabled(True)
        self.stop_button.setEnabled(False)

        self.tracker.stop()
        self.timer.stop()

    def update_stats(self):
        stats = self.tracker.get_stats()
        self.report_area.append(
            f"Keys: {stats['keys']}, Clicks: {stats['clicks']}, "
            f"Idle: {stats['idle_seconds']}s, Active Window: {stats['active_window']}"
        )
