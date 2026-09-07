import os

from PyQt6.QtCore import QThread, QTimer, Qt, pyqtSignal
from PyQt6.QtGui import QIcon, QPixmap
from PyQt6.QtWidgets import (
    QComboBox,
    QFrame,
    QGraphicsDropShadowEffect,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from tracker.activity_tracker import ActivityTracker

_ASSETS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
_LOGO_PATH = os.path.join(_ASSETS_DIR, "logo.png")
_ICO_PATH = os.path.join(_ASSETS_DIR, "teler.ico")

PAGE = "#0B0D14"
SURFACE = "#151826"
INPUT = "#0F1220"
TEXT = "#F7F8FC"
MUTED = "#8A90A6"
ACCENT = "#5B5FEF"
ACCENT_HOVER = "#7074FF"


def _make_logo_label(height_px: int) -> QLabel | None:
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


class StopWorker(QThread):
    failed = pyqtSignal(str)

    def __init__(self, tracker, parent=None):
        super().__init__(parent)
        self.tracker = tracker

    def run(self):
        try:
            self.tracker.stop()
        except Exception as error:
            self.failed.emit(str(error))


class MainWindow(QMainWindow):
    logout_requested = pyqtSignal()

    def __init__(self, username="", organization_name="", job_role="general", organization_id="", employee_id=""):
        super().__init__()
        self._stop_worker = None
        self._after_stop = None
        self._stop_error = None
        self._pulse_on = False
        self._username = username or "TELER User"
        self._organization_name = organization_name

        self.setWindowTitle(f"TELER — {self._username}")
        self.resize(900, 650)
        self.setMinimumSize(760, 560)

        try:
            icon = QIcon(_ICO_PATH) if os.path.isfile(_ICO_PATH) else QIcon(QPixmap(_LOGO_PATH))
            if not icon.isNull():
                self.setWindowIcon(icon)
        except Exception:
            pass

        self.setStyleSheet(f"""
            QMainWindow {{ background: {PAGE}; color: {TEXT}; }}
            QWidget#root {{ background: {PAGE}; }}
            QWidget#card {{ background: {SURFACE}; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; }}
            QLabel#brand {{ color: {TEXT}; font-size: 16px; font-weight: 800; letter-spacing: 1px; }}
            QLabel#sectionTitle {{ color: {TEXT}; font-size: 14px; font-weight: 700; }}
            QLabel#muted {{ color: {MUTED}; font-size: 11px; }}
            QLabel#avatar {{ background: rgba(91,95,239,0.16); color: #C7C9FF; border: 1px solid rgba(91,95,239,0.35); border-radius: 14px; min-width: 28px; min-height: 28px; max-width: 28px; max-height: 28px; font-size: 11px; font-weight: 800; }}
            QLabel#identity {{ color: #D8DBE8; font-size: 11px; font-weight: 600; }}
            QLabel#status {{ background: rgba(138,144,166,0.10); color: #B1B6C8; border: 1px solid rgba(255,255,255,0.08); border-radius: 13px; padding: 5px 10px; font-size: 11px; font-weight: 650; }}
            QComboBox {{ background: {INPUT}; border: 1px solid rgba(255,255,255,0.09); border-radius: 11px; padding: 9px 12px; color: {TEXT}; font-size: 12px; }}
            QComboBox:focus {{ border: 1px solid {ACCENT}; background: #111528; }}
            QComboBox:disabled {{ color: #A4A9B8; background: #10131E; }}
            QPushButton#primary {{ background: {ACCENT}; border: 0; border-radius: 10px; padding: 10px 15px; color: white; font-size: 12px; font-weight: 700; }}
            QPushButton#primary:hover {{ background: {ACCENT_HOVER}; }}
            QPushButton#primary:disabled {{ background: #34384E; color: #777D93; }}
            QPushButton#secondary {{ background: transparent; border: 1px solid rgba(255,255,255,0.13); border-radius: 10px; padding: 10px 15px; color: #D6D9E6; font-size: 12px; font-weight: 650; }}
            QPushButton#secondary:hover {{ border-color: rgba(112,116,255,0.7); color: white; background: rgba(91,95,239,0.07); }}
            QPushButton#secondary:disabled {{ border-color: rgba(255,255,255,0.06); color: #565B70; background: rgba(255,255,255,0.015); }}
            QTextEdit {{ background: {INPUT}; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; color: #D9DCE8; padding: 12px; font-size: 11px; selection-background-color: {ACCENT}; }}
            QFrame#divider {{ background: rgba(255,255,255,0.07); max-height: 1px; border: 0; }}
        """)

        self.role_dropdown = QComboBox()
        self.role_dropdown.addItem(str(job_role or "general").replace("_", " ").title())
        self.role_dropdown.setEnabled(False)
        self.role_dropdown.setToolTip("Role is assigned to your account and can only be changed by an administrator")
        self.role_dropdown.setMinimumHeight(42)

        self.start_button = QPushButton("▶  Start Tracking", objectName="primary")
        self.start_button.setMinimumHeight(42)
        self.stop_button = QPushButton("■  Stop Tracking", objectName="secondary")
        self.stop_button.setMinimumHeight(42)
        self.stop_button.setEnabled(False)

        self.status_label = QLabel("●  Idle", objectName="status")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_label.setFixedHeight(28)

        self.report_area = QTextEdit()
        self.report_area.setReadOnly(True)
        self.report_area.document().setMaximumBlockCount(300)
        self.report_area.setPlaceholderText("No activity yet. Start tracking to see timestamped activity reports here.")

        root = QWidget(objectName="root")
        layout = QVBoxLayout(root)
        layout.setContentsMargins(28, 24, 28, 28)
        layout.setSpacing(18)

        divider = QFrame(objectName="divider")
        divider.setFixedHeight(1)
        layout.addWidget(divider)

        header = QHBoxLayout()
        header.setSpacing(10)
        logo = _make_logo_label(24)
        if logo is not None:
            header.addWidget(logo)
        header.addWidget(QLabel("TELER", objectName="brand"))
        header.addStretch()

        avatar_text = "".join(part[0] for part in self._username.split()[:2] if part)[:2].upper() or "T"
        avatar = QLabel(avatar_text, objectName="avatar")
        avatar.setAlignment(Qt.AlignmentFlag.AlignCenter)
        header.addWidget(avatar)

        identity_text = self._username
        if self._organization_name:
            identity_text += f"  ·  {self._organization_name}"
        identity = QLabel(identity_text, objectName="identity")
        header.addWidget(identity)

        logout_button = QPushButton("↗  Logout", objectName="secondary")
        logout_button.setMinimumHeight(34)
        logout_button.setToolTip("Sign out of TELER on this computer")
        logout_button.clicked.connect(self._logout)
        header.addWidget(logout_button)
        layout.addLayout(header)

        role_card, role_layout = self._make_card()
        role_layout.addWidget(QLabel("Assigned role", objectName="sectionTitle"))
        role_layout.addWidget(QLabel("Your role is managed by your TELER workspace administrator.", objectName="muted"))
        role_layout.addSpacing(6)
        role_layout.addWidget(self.role_dropdown)
        layout.addWidget(role_card)

        control_card, control_layout = self._make_card()
        control_header = QHBoxLayout()
        control_copy = QVBoxLayout()
        control_copy.setSpacing(2)
        control_copy.addWidget(QLabel("Tracking controls", objectName="sectionTitle"))
        control_copy.addWidget(QLabel("Start a secure activity session when you begin work.", objectName="muted"))
        control_header.addLayout(control_copy)
        control_header.addStretch()
        control_header.addWidget(self.status_label)
        control_layout.addLayout(control_header)
        control_layout.addSpacing(10)

        button_layout = QHBoxLayout()
        button_layout.setSpacing(10)
        button_layout.addWidget(self.start_button)
        button_layout.addWidget(self.stop_button)
        button_layout.addStretch()
        control_layout.addLayout(button_layout)
        layout.addWidget(control_card)

        report_card, report_layout = self._make_card(stretch=True)
        report_header = QHBoxLayout()
        report_title_box = QVBoxLayout()
        report_title_box.setSpacing(2)
        report_title_box.addWidget(QLabel("Activity Reports", objectName="sectionTitle"))
        report_title_box.addWidget(QLabel("Live session telemetry and saved activity updates.", objectName="muted"))
        report_header.addLayout(report_title_box)
        report_header.addStretch()
        empty_icon = QLabel("◌")
        empty_icon.setStyleSheet(f"color:{MUTED}; font-size:18px;")
        report_header.addWidget(empty_icon)
        report_layout.addLayout(report_header)
        report_layout.addSpacing(8)
        report_layout.addWidget(self.report_area, 1)
        layout.addWidget(report_card, 1)

        self.setCentralWidget(root)

        self.tracker = ActivityTracker(username=username, organization_id=organization_id, employee_id=employee_id)
        self.timer = QTimer()
        self.timer.timeout.connect(self.update_stats)
        self.pulse_timer = QTimer()
        self.pulse_timer.setInterval(650)
        self.pulse_timer.timeout.connect(self._pulse_status)

        self.start_button.clicked.connect(self.start_tracking)
        self.stop_button.clicked.connect(self.stop_tracking)

    def _make_card(self, stretch=False):
        card = QWidget(objectName="card")
        if stretch:
            card.setMinimumHeight(210)
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(18, 16, 18, 18)
        card_layout.setSpacing(6)
        shadow = QGraphicsDropShadowEffect(card)
        shadow.setBlurRadius(26)
        shadow.setOffset(0, 8)
        shadow.setColor(Qt.GlobalColor.transparent)
        card.setGraphicsEffect(shadow)
        return card, card_layout

    def _set_status(self, text, active=False, warning=False):
        if active:
            self.status_label.setText(f"●  {text}")
            self.status_label.setStyleSheet(
                "QLabel#status { background: rgba(85,201,140,0.10); color: #78D8A6; border: 1px solid rgba(85,201,140,0.22); border-radius: 13px; padding: 5px 10px; font-size: 11px; font-weight: 650; }"
            )
        elif warning:
            self.status_label.setText(f"●  {text}")
            self.status_label.setStyleSheet(
                "QLabel#status { background: rgba(230,174,85,0.10); color: #E8BD76; border: 1px solid rgba(230,174,85,0.22); border-radius: 13px; padding: 5px 10px; font-size: 11px; font-weight: 650; }"
            )
        else:
            self.status_label.setText(f"●  {text}")
            self.status_label.setStyleSheet(
                "QLabel#status { background: rgba(138,144,166,0.10); color: #B1B6C8; border: 1px solid rgba(255,255,255,0.08); border-radius: 13px; padding: 5px 10px; font-size: 11px; font-weight: 650; }"
            )

    def _pulse_status(self):
        if not self.tracker.running:
            return
        self._pulse_on = not self._pulse_on
        dot = "●" if self._pulse_on else "◉"
        self.status_label.setText(f"{dot}  Active tracking")

    def start_tracking(self):
        role = self.role_dropdown.currentText()
        try:
            self.tracker.set_metadata(role, "")
            self.tracker.start()
        except Exception as error:
            self._set_status("Could not start", warning=True)
            self.start_button.setEnabled(True)
            self.stop_button.setEnabled(False)
            self.report_area.append(f"Tracking start failed: {error}\n")
            QMessageBox.critical(self, "TELER tracking error", f"Tracking could not start.\n\n{error}")
            return

        self._set_status("Active tracking", active=True)
        self.report_area.append(f"Started tracking with role: {role}\n")
        self.start_button.setEnabled(False)
        self.stop_button.setEnabled(True)
        self.timer.start(1000)
        self.pulse_timer.start()

    def stop_tracking(self):
        if self._stop_worker is not None:
            return
        self._set_status("Saving session…", warning=True)
        self.start_button.setEnabled(False)
        self.stop_button.setEnabled(False)
        self.timer.stop()
        self.pulse_timer.stop()
        self._stop_worker = StopWorker(self.tracker, self)
        self._stop_error = None
        self._stop_worker.failed.connect(self._tracking_stop_failed)
        self._stop_worker.finished.connect(self._tracking_stopped)
        self._stop_worker.start()

    def _tracking_stop_failed(self, message):
        self._stop_error = message
        self.report_area.append(f"Stop failed: {message}")

    def _tracking_stopped(self):
        self._stop_worker.deleteLater()
        self._stop_worker = None
        self._set_status("Save failed", warning=True) if self._stop_error else self._set_status("Idle")
        if not self._stop_error:
            self.report_area.append("Session saved.\n")
        self.start_button.setEnabled(True)
        self.stop_button.setEnabled(False)
        action, self._after_stop = self._after_stop, None
        if action:
            action()

    def update_stats(self):
        stats = self.tracker.get_stats()
        self.report_area.append(
            f"Keys: {stats['keys']}, Clicks: {stats['clicks']}, "
            f"Idle: {stats['idle_seconds']}s, Active Window: {stats['active_window']}"
        )

    def _logout(self):
        if self.tracker.running or self._stop_worker is not None:
            self._after_stop = self.logout_requested.emit
            self.stop_tracking()
            return
        self.logout_requested.emit()

    def closeEvent(self, event):
        if self.tracker.running or self._stop_worker is not None:
            self._after_stop = self.close
            self.stop_tracking()
            event.ignore()
            return
        self.timer.stop()
        self.pulse_timer.stop()
        event.accept()