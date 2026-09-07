import os

from PyQt6.QtCore import (
    QEasingCurve,
    QParallelAnimationGroup,
    QPropertyAnimation,
    QRect,
    QThread,
    QTimer,
    Qt,
    pyqtSignal,
)
from PyQt6.QtGui import QColor, QIcon, QPixmap
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
            QWidget#statusPill {{ background: rgba(138,144,166,0.10); border: 1px solid rgba(255,255,255,0.08); border-radius: 13px; }}
            QLabel#statusDot {{ color: #8A90A6; background: transparent; border: 0; font-size: 10px; }}
            QLabel#statusText {{ color: #B1B6C8; background: transparent; border: 0; font-size: 11px; font-weight: 650; }}
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

        self.status_pill = QWidget(objectName="statusPill")
        self.status_pill.setFixedHeight(28)
        status_layout = QHBoxLayout(self.status_pill)
        status_layout.setContentsMargins(10, 0, 10, 0)
        status_layout.setSpacing(6)

        self.status_dot_wrap = QWidget()
        self.status_dot_wrap.setFixedSize(14, 14)
        self.status_dot = QLabel("●", self.status_dot_wrap, objectName="statusDot")
        self.status_dot.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_dot.setGeometry(2, 2, 10, 10)
        self.status_dot_effect = QGraphicsDropShadowEffect(self.status_dot)
        self.status_dot_effect.setOffset(0, 0)
        self.status_dot_effect.setBlurRadius(4)
        self.status_dot_effect.setColor(QColor(0, 0, 0, 0))
        self.status_dot.setGraphicsEffect(self.status_dot_effect)

        self.status_text = QLabel("Idle", objectName="statusText")
        status_layout.addWidget(self.status_dot_wrap)
        status_layout.addWidget(self.status_text)

        self.report_area = QTextEdit()
        self.report_area.setReadOnly(True)
        self.report_area.document().setMaximumBlockCount(300)
        self.report_area.hide()

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
        layout.addSpacing(8)

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
        control_header.addWidget(self.status_pill)
        control_layout.addLayout(control_header)
        control_layout.addSpacing(10)

        button_layout = QHBoxLayout()
        button_layout.setSpacing(10)
        button_layout.addWidget(self.start_button)
        button_layout.addWidget(self.stop_button)
        button_layout.addStretch()
        control_layout.addLayout(button_layout)
        layout.addWidget(control_card)

        self.report_card, report_layout = self._make_card()
        self.report_card.setMinimumHeight(280)
        self.report_card.setMaximumHeight(400)

        report_header = QHBoxLayout()
        report_title_box = QVBoxLayout()
        report_title_box.setSpacing(2)
        report_title_box.addWidget(QLabel("Activity Reports", objectName="sectionTitle"))
        report_title_box.addWidget(QLabel("Live session telemetry and saved activity updates.", objectName="muted"))
        report_header.addLayout(report_title_box)
        report_header.addStretch()
        report_layout.addLayout(report_header)
        report_layout.addSpacing(8)

        self.report_empty_state = QWidget()
        empty_layout = QVBoxLayout(self.report_empty_state)
        empty_layout.setContentsMargins(0, 0, 0, 0)
        empty_layout.setSpacing(8)
        empty_layout.addStretch()

        empty_icon = QLabel("◷")
        empty_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        empty_icon.setStyleSheet(f"color:{MUTED}; font-size:24px;")
        empty_text = QLabel("No activity yet. Start tracking to see timestamped activity reports here.", objectName="muted")
        empty_text.setAlignment(Qt.AlignmentFlag.AlignCenter)
        empty_text.setWordWrap(True)
        empty_layout.addWidget(empty_icon)
        empty_layout.addWidget(empty_text)
        empty_layout.addStretch()

        report_layout.addWidget(self.report_empty_state, 1)
        report_layout.addWidget(self.report_area, 1)
        layout.addWidget(self.report_card, 0)
        self.main_layout = layout

        self.setCentralWidget(root)

        self.tracker = ActivityTracker(username=username, organization_id=organization_id, employee_id=employee_id)
        self.timer = QTimer()
        self.timer.timeout.connect(self.update_stats)

        self._status_pulse_group = QParallelAnimationGroup(self)
        dot_scale = QPropertyAnimation(self.status_dot, b"geometry", self)
        dot_scale.setDuration(1200)
        dot_scale.setKeyValueAt(0.0, QRect(2, 2, 10, 10))
        dot_scale.setKeyValueAt(0.5, QRect(1, 1, 12, 12))
        dot_scale.setKeyValueAt(1.0, QRect(2, 2, 10, 10))
        dot_scale.setEasingCurve(QEasingCurve.Type.InOutSine)

        glow = QPropertyAnimation(self.status_dot_effect, b"blurRadius", self)
        glow.setDuration(1200)
        glow.setKeyValueAt(0.0, 4.0)
        glow.setKeyValueAt(0.5, 10.0)
        glow.setKeyValueAt(1.0, 4.0)
        glow.setEasingCurve(QEasingCurve.Type.InOutSine)

        self._status_pulse_group.addAnimation(dot_scale)
        self._status_pulse_group.addAnimation(glow)
        self._status_pulse_group.setLoopCount(-1)

        self.start_button.clicked.connect(self.start_tracking)
        self.stop_button.clicked.connect(self.stop_tracking)

    def _make_card(self, stretch=False):
        card = QWidget(objectName="card")
        if stretch:
            card.setMinimumHeight(210)
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(16, 16, 16, 16)
        card_layout.setSpacing(8)
        shadow = QGraphicsDropShadowEffect(card)
        shadow.setBlurRadius(26)
        shadow.setOffset(0, 8)
        shadow.setColor(Qt.GlobalColor.transparent)
        card.setGraphicsEffect(shadow)
        return card, card_layout

    def _stop_status_pulse(self):
        self._status_pulse_group.stop()
        self.status_dot.setGeometry(2, 2, 10, 10)
        self.status_dot_effect.setBlurRadius(4)

    def _set_status(self, text, active=False, warning=False):
        self.status_text.setText(text)
        if active:
            self.status_pill.setStyleSheet(
                "QWidget#statusPill { background: rgba(85,201,140,0.10); border: 1px solid rgba(85,201,140,0.22); border-radius: 13px; }"
            )
            self.status_text.setStyleSheet(
                "color:#78D8A6; background:transparent; border:0; font-size:11px; font-weight:650;"
            )
            self.status_dot.setStyleSheet(
                "color:#55C98C; background:transparent; border:0; font-size:10px;"
            )
            self.status_dot_effect.setColor(QColor(85, 201, 140, 150))
            self._status_pulse_group.start()
        elif warning:
            self._stop_status_pulse()
            self.status_pill.setStyleSheet(
                "QWidget#statusPill { background: rgba(230,174,85,0.10); border: 1px solid rgba(230,174,85,0.22); border-radius: 13px; }"
            )
            self.status_text.setStyleSheet(
                "color:#E8BD76; background:transparent; border:0; font-size:11px; font-weight:650;"
            )
            self.status_dot.setStyleSheet(
                "color:#E6AE55; background:transparent; border:0; font-size:10px;"
            )
            self.status_dot_effect.setColor(QColor(0, 0, 0, 0))
        else:
            self._stop_status_pulse()
            self.status_pill.setStyleSheet(
                "QWidget#statusPill { background: rgba(138,144,166,0.10); border: 1px solid rgba(255,255,255,0.08); border-radius: 13px; }"
            )
            self.status_text.setStyleSheet(
                "color:#B1B6C8; background:transparent; border:0; font-size:11px; font-weight:650;"
            )
            self.status_dot.setStyleSheet(
                "color:#8A90A6; background:transparent; border:0; font-size:10px;"
            )
            self.status_dot_effect.setColor(QColor(0, 0, 0, 0))

    def _append_report(self, message):
        if self.report_area.isHidden():
            self.report_empty_state.hide()
            self.report_area.show()
            self.report_card.setMaximumHeight(16777215)
            self.main_layout.setStretchFactor(self.report_card, 1)
        self.report_area.append(message)

    def start_tracking(self):
        role = self.role_dropdown.currentText()
        try:
            self.tracker.set_metadata(role, "")
            self.tracker.start()
        except Exception as error:
            self._set_status("Could not start", warning=True)
            self.start_button.setEnabled(True)
            self.stop_button.setEnabled(False)
            self._append_report(f"Tracking start failed: {error}\n")
            QMessageBox.critical(self, "TELER tracking error", f"Tracking could not start.\n\n{error}")
            return

        self._set_status("Active tracking", active=True)
        self._append_report(f"Started tracking with role: {role}\n")
        self.start_button.setEnabled(False)
        self.stop_button.setEnabled(True)
        self.timer.start(1000)

    def stop_tracking(self):
        if self._stop_worker is not None:
            return
        self._set_status("Saving session…", warning=True)
        self.start_button.setEnabled(False)
        self.stop_button.setEnabled(False)
        self.timer.stop()
        self._stop_status_pulse()
        self._stop_worker = StopWorker(self.tracker, self)
        self._stop_error = None
        self._stop_worker.failed.connect(self._tracking_stop_failed)
        self._stop_worker.finished.connect(self._tracking_stopped)
        self._stop_worker.start()

    def _tracking_stop_failed(self, message):
        self._stop_error = message
        self._append_report(f"Stop failed: {message}")

    def _tracking_stopped(self):
        self._stop_worker.deleteLater()
        self._stop_worker = None
        self._set_status("Save failed", warning=True) if self._stop_error else self._set_status("Idle")
        if not self._stop_error:
            self._append_report("Session saved.\n")
        self.start_button.setEnabled(True)
        self.stop_button.setEnabled(False)
        action, self._after_stop = self._after_stop, None
        if action:
            action()

    def update_stats(self):
        stats = self.tracker.get_stats()
        self._append_report(
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
        self._stop_status_pulse()
        event.accept()