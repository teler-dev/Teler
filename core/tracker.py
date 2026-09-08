import os
import time
from datetime import datetime

from PyQt6.QtCore import (
    QEasingCurve,
    QEvent,
    QParallelAnimationGroup,
    QPropertyAnimation,
    QRect,
    QThread,
    QTimer,
    Qt,
    pyqtSignal,
)
from PyQt6.QtGui import QColor, QFont, QIcon, QPixmap
from PyQt6.QtWidgets import (
    QComboBox,
    QFrame,
    QGraphicsDropShadowEffect,
    QGraphicsOpacityEffect,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from core.session_api import SessionClient
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
GREEN = "#55C98C"
AMBER = "#E6AE55"


def _make_logo_label(height_px: int) -> QLabel | None:
    try:
        pm = QPixmap(_LOGO_PATH)
        if pm.isNull():
            return None
        scaled = pm.scaledToHeight(height_px, Qt.TransformationMode.SmoothTransformation)
        lbl = QLabel()
        lbl.setPixmap(scaled)
        lbl.setFixedSize(scaled.width(), scaled.height())
        lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl.setStyleSheet("background: transparent; border: none;")
        return lbl
    except Exception:
        return None


def _format_duration(seconds):
    value = max(0, int(seconds or 0))
    hours, remainder = divmod(value, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def _local_parts(value):
    if not value:
        return "—", "—"
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone()
        return parsed.strftime("%b %d, %Y"), parsed.strftime("%I:%M %p").lstrip("0")
    except (TypeError, ValueError):
        return "—", "—"


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

    def __init__(self, username="", organization_name="", job_role="general", organization_id="",
                 employee_id="", auth_client=None):
        super().__init__()
        self._username = username or "TELER User"
        self._organization_name = organization_name
        self._job_role = str(job_role or "general")
        self._stop_worker = None
        self._after_stop = None
        self._stop_error = None
        self._pending_action = None
        self._server_session = None
        self._server_sync_monotonic = time.monotonic()
        self._out_of_sync = False
        self._fade_animation = None

        self.setWindowTitle(f"TELER — {self._username}")
        self.resize(900, 700)
        self.setMinimumSize(760, 610)
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
            QWidget#statusPill {{ background: rgba(138,144,166,0.08); border: 1px solid rgba(255,255,255,0.08); border-radius: 13px; }}
            QLabel#statusDot {{ color: #8A90A6; background: transparent; border: 0; font-size: 10px; }}
            QLabel#statusText {{ color: #B1B6C8; background: transparent; border: 0; font-size: 11px; font-weight: 650; }}
            QLabel#timer {{ color: {TEXT}; font-size: 38px; font-weight: 700; letter-spacing: 1.6px; background: transparent; border: 0; }}
            QLabel#stateHint {{ color: {MUTED}; font-size: 10px; font-weight: 600; letter-spacing: 0.4px; background: transparent; border: 0; }}
            QWidget#timerPanel {{ background: #090C16; border: 1px solid rgba(255,255,255,0.10); border-radius: 18px; }}
            QLabel#error {{ color: #F6A6AE; font-size: 10px; background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.18); border-radius: 8px; padding: 6px 8px; }}
            QComboBox {{ background: {INPUT}; border: 1px solid rgba(255,255,255,0.09); border-radius: 11px; padding: 9px 12px; color: {TEXT}; font-size: 12px; }}
            QComboBox:disabled {{ color: #A4A9B8; background: #10131E; }}
            QPushButton#primary {{ background: qlineargradient(x1:0,y1:0,x2:0,y2:1, stop:0 #6A6EFF, stop:1 #5155E8); border: 1px solid rgba(255,255,255,0.16); border-radius: 12px; padding: 11px 16px; color: white; font-size: 12px; font-weight: 750; }}
            QPushButton#primary:hover {{ background: qlineargradient(x1:0,y1:0,x2:0,y2:1, stop:0 #777BFF, stop:1 #5B5FEF); border-color: rgba(255,255,255,0.24); }}
            QPushButton#primary:pressed {{ background: qlineargradient(x1:0,y1:0,x2:0,y2:1, stop:0 #5559EC, stop:1 #474BD3); padding-top: 12px; padding-bottom: 10px; }}
            QPushButton#primary:disabled {{ background: #34384E; color: #777D93; }}
            QPushButton#secondary {{ background: transparent; border: 1px solid rgba(255,255,255,0.13); border-radius: 10px; padding: 10px 15px; color: #D6D9E6; font-size: 12px; font-weight: 650; }}
            QPushButton#secondary:hover {{ border-color: rgba(112,116,255,0.7); color: white; background: rgba(91,95,239,0.07); }}
            QPushButton#secondary:pressed {{ background: rgba(91,95,239,0.12); border-color: rgba(112,116,255,0.85); padding-top: 11px; padding-bottom: 9px; }}
            QPushButton#secondary:disabled {{ border-color: rgba(255,255,255,0.06); color: #565B70; background: rgba(255,255,255,0.015); }}
            QScrollArea#reports {{ background: transparent; border: 0; }}
            QWidget#reportViewport {{ background: transparent; }}
            QWidget#reportRow {{ background: {INPUT}; border: 1px solid rgba(255,255,255,0.06); border-radius: 9px; }}
            QWidget#reportRow:hover {{ background: #111528; border-color: rgba(91,95,239,0.20); }}
            QFrame#reportAccent {{ background: {ACCENT}; border: 0; border-radius: 1px; }}
            QFrame#divider {{ background: rgba(255,255,255,0.07); max-height: 1px; border: 0; }}
        """)

        self.role_dropdown = QComboBox()
        self.role_dropdown.addItem(self._job_role.replace("_", " ").title())
        self.role_dropdown.setEnabled(False)
        self.role_dropdown.setToolTip("Role is assigned to your account and can only be changed by an administrator")
        self.role_dropdown.setMinimumHeight(42)

        self.start_button = QPushButton("▶  Start Tracking", objectName="primary")
        self.pause_button = QPushButton("Ⅱ  Pause", objectName="secondary")
        self.stop_button = QPushButton("■  Stop Tracking", objectName="secondary")
        self._button_effects = {}
        for button in (self.start_button, self.pause_button, self.stop_button):
            button.setMinimumHeight(44)
            button.setCursor(Qt.CursorShape.PointingHandCursor)
            effect = QGraphicsDropShadowEffect(button)
            effect.setOffset(0, 4)
            effect.setBlurRadius(12)
            effect.setColor(QColor(15, 18, 36, 120))
            button.setGraphicsEffect(effect)
            button.installEventFilter(self)
            self._button_effects[button] = effect
        self.pause_button.hide()
        self.stop_button.setEnabled(False)

        self.timer_label = QLabel("00:00:00", objectName="timer")
        timer_font = QFont("SF Mono")
        timer_font.setStyleHint(QFont.StyleHint.Monospace)
        timer_font.setPointSize(29)
        timer_font.setWeight(QFont.Weight.Bold)
        self.timer_label.setFont(timer_font)
        self.timer_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.timer_label.setMinimumHeight(66)
        self.timer_text_effect = QGraphicsOpacityEffect(self.timer_label)
        self.timer_text_effect.setOpacity(1.0)
        self.timer_label.setGraphicsEffect(self.timer_text_effect)

        self.state_hint = QLabel("Ready to track", objectName="stateHint")
        self.state_hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.state_hint_effect = QGraphicsOpacityEffect(self.state_hint)
        self.state_hint_effect.setOpacity(1.0)
        self.state_hint.setGraphicsEffect(self.state_hint_effect)

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

        self.action_error = QLabel("", objectName="error")
        self.action_error.setWordWrap(True)
        self.action_error.hide()

        root = QWidget(objectName="root")
        layout = QVBoxLayout(root)
        layout.setContentsMargins(28, 24, 28, 28)
        layout.setSpacing(0)

        master_card = QWidget(objectName="card")
        master_card.setMinimumWidth(660)
        master_card.setMaximumWidth(760)
        self.master_card_effect = QGraphicsDropShadowEffect(master_card)
        self.master_card_effect.setOffset(0, 12)
        self.master_card_effect.setBlurRadius(42)
        self.master_card_effect.setColor(QColor(0, 0, 0, 105))
        master_card.setGraphicsEffect(self.master_card_effect)
        master_layout = QVBoxLayout(master_card)
        master_layout.setContentsMargins(20, 18, 20, 20)
        master_layout.setSpacing(14)

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
        identity_text = self._username + (f"  ·  {self._organization_name}" if self._organization_name else "")
        header.addWidget(QLabel(identity_text, objectName="identity"))
        logout_button = QPushButton("↗  Logout", objectName="secondary")
        logout_button.setMinimumHeight(34)
        logout_button.clicked.connect(self._logout)
        header.addWidget(logout_button)
        master_layout.addLayout(header)

        header_divider = QFrame(objectName="divider")
        header_divider.setFixedHeight(1)
        master_layout.addWidget(header_divider)

        role_section = QWidget()
        role_layout = QVBoxLayout(role_section)
        role_layout.setContentsMargins(0, 0, 0, 0)
        role_layout.setSpacing(8)
        role_layout.addWidget(QLabel("Assigned role", objectName="sectionTitle"))
        role_layout.addWidget(QLabel("Your role is managed by your TELER workspace administrator.", objectName="muted"))
        role_layout.addWidget(self.role_dropdown)
        master_layout.addWidget(role_section)

        role_divider = QFrame(objectName="divider")
        role_divider.setFixedHeight(1)
        master_layout.addWidget(role_divider)

        control_section = QWidget()
        control_layout = QVBoxLayout(control_section)
        control_layout.setContentsMargins(0, 0, 0, 0)
        control_layout.setSpacing(8)
        control_header = QHBoxLayout()
        control_copy = QVBoxLayout()
        control_copy.setSpacing(2)
        control_copy.addWidget(QLabel("Tracking controls", objectName="sectionTitle"))
        control_copy.addWidget(QLabel("Server-confirmed state stays synchronized across TELER clients.", objectName="muted"))
        control_header.addLayout(control_copy)
        control_header.addStretch()
        control_header.addWidget(self.status_pill)
        control_layout.addLayout(control_header)
        control_layout.addSpacing(6)

        controls_module = QWidget()
        controls_module.setMaximumWidth(520)
        controls_module.setMinimumWidth(440)
        controls_module_layout = QVBoxLayout(controls_module)
        controls_module_layout.setContentsMargins(0, 0, 0, 0)
        controls_module_layout.setSpacing(10)

        timer_panel = QWidget(objectName="timerPanel")
        self.timer_panel = timer_panel
        self.timer_panel_effect = QGraphicsDropShadowEffect(timer_panel)
        self.timer_panel_effect.setOffset(0, 2)
        self.timer_panel_effect.setBlurRadius(22)
        self.timer_panel_effect.setColor(QColor(91, 95, 239, 32))
        timer_panel.setGraphicsEffect(self.timer_panel_effect)
        timer_panel_layout = QVBoxLayout(timer_panel)
        timer_panel_layout.setContentsMargins(20, 16, 20, 16)
        timer_panel_layout.setSpacing(4)
        timer_panel_layout.addWidget(self.timer_label)
        timer_panel_layout.addWidget(self.state_hint)
        controls_module_layout.addWidget(timer_panel)

        button_layout = QHBoxLayout()
        button_layout.setSpacing(8)
        button_layout.addWidget(self.start_button, 1)
        button_layout.addWidget(self.pause_button, 1)
        button_layout.addWidget(self.stop_button, 1)
        controls_module_layout.addLayout(button_layout)

        controls_center_row = QHBoxLayout()
        controls_center_row.setContentsMargins(24, 0, 24, 0)
        controls_center_row.addStretch()
        controls_center_row.addWidget(controls_module)
        controls_center_row.addStretch()
        control_layout.addLayout(controls_center_row)
        control_layout.addWidget(self.action_error)
        master_layout.addWidget(control_section)

        control_divider = QFrame(objectName="divider")
        control_divider.setFixedHeight(1)
        master_layout.addWidget(control_divider)

        self.report_card = QWidget()
        report_layout = QVBoxLayout(self.report_card)
        report_layout.setContentsMargins(0, 0, 0, 0)
        report_layout.setSpacing(8)
        self.report_card.setMinimumHeight(200)
        self.report_card.setMaximumHeight(320)
        report_header = QVBoxLayout()
        report_header.setSpacing(2)
        report_header.addWidget(QLabel("Activity Reports", objectName="sectionTitle"))
        report_header.addWidget(QLabel("Your saved tracking sessions, most recent first.", objectName="muted"))
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
        empty_text = QLabel("No activity yet. Start tracking to create a session.", objectName="muted")
        empty_text.setAlignment(Qt.AlignmentFlag.AlignCenter)
        empty_layout.addWidget(empty_icon)
        empty_layout.addWidget(empty_text)
        empty_layout.addStretch()
        report_layout.addWidget(self.report_empty_state, 1)

        self.report_scroll = QScrollArea(objectName="reports")
        self.report_scroll.setWidgetResizable(True)
        self.report_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.report_scroll.hide()
        self.report_viewport = QWidget(objectName="reportViewport")
        self.report_list = QVBoxLayout(self.report_viewport)
        self.report_list.setContentsMargins(0, 0, 4, 0)
        self.report_list.setSpacing(8)
        self.report_list.addStretch()
        self.report_scroll.setWidget(self.report_viewport)
        report_layout.addWidget(self.report_scroll, 1)
        master_layout.addWidget(self.report_card, 1)

        layout.addWidget(master_card, 0, Qt.AlignmentFlag.AlignHCenter | Qt.AlignmentFlag.AlignTop)
        layout.addStretch(1)
        self.main_layout = master_layout
        self.setCentralWidget(root)

        self.tracker = ActivityTracker(username=username, organization_id=organization_id, employee_id=employee_id)
        self.session_client = SessionClient(auth_client, self) if auth_client is not None else None
        if self.session_client:
            self.session_client.succeeded.connect(self._session_succeeded)
            self.session_client.failed.connect(self._session_failed)
            self.session_client.retrying.connect(self._session_retrying)

        self.ui_timer = QTimer(self)
        self.ui_timer.setInterval(1000)
        self.ui_timer.timeout.connect(self._update_timer_display)
        self.ui_timer.start()
        self.current_poll = QTimer(self)
        self.current_poll.setInterval(5000)
        self.current_poll.timeout.connect(lambda: self.session_client and self.session_client.current())
        self.current_poll.start()
        self.report_poll = QTimer(self)
        self.report_poll.setInterval(30000)
        self.report_poll.timeout.connect(lambda: self.session_client and self.session_client.list_sessions())
        self.report_poll.start()
        self.saved_timer = QTimer(self)
        self.saved_timer.setSingleShot(True)
        self.saved_timer.timeout.connect(lambda: self._apply_state("idle"))

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
        timer_glow = QPropertyAnimation(self.timer_panel_effect, b"blurRadius", self)
        timer_glow.setDuration(1200)
        timer_glow.setKeyValueAt(0.0, 20.0)
        timer_glow.setKeyValueAt(0.5, 30.0)
        timer_glow.setKeyValueAt(1.0, 20.0)
        timer_glow.setEasingCurve(QEasingCurve.Type.InOutSine)
        self._status_pulse_group.addAnimation(timer_glow)
        self._status_pulse_group.setLoopCount(-1)

        self.start_button.clicked.connect(self.start_tracking)
        self.pause_button.clicked.connect(self.pause_or_resume_tracking)
        self.stop_button.clicked.connect(self.stop_tracking)
        self._apply_state("idle")
        if self.session_client:
            QTimer.singleShot(0, self.session_client.current)
            QTimer.singleShot(100, self.session_client.list_sessions)

    def _make_card(self):
        card = QWidget(objectName="card")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(16, 16, 16, 16)
        card_layout.setSpacing(8)
        return card, card_layout

    def eventFilter(self, obj, event):
        effect = self._button_effects.get(obj) if hasattr(self, "_button_effects") else None
        if effect is not None and obj.isEnabled():
            if event.type() == QEvent.Type.Enter:
                effect.setBlurRadius(18)
                effect.setOffset(0, 6)
                effect.setColor(QColor(52, 55, 110, 135))
            elif event.type() == QEvent.Type.Leave:
                effect.setBlurRadius(12)
                effect.setOffset(0, 4)
                effect.setColor(QColor(15, 18, 36, 120))
            elif event.type() == QEvent.Type.MouseButtonPress:
                effect.setBlurRadius(6)
                effect.setOffset(0, 2)
            elif event.type() == QEvent.Type.MouseButtonRelease:
                effect.setBlurRadius(16)
                effect.setOffset(0, 5)
                QTimer.singleShot(110, lambda e=effect: (e.setBlurRadius(12), e.setOffset(0, 4)))
        return super().eventFilter(obj, event)

    def _fade_controls(self):
        effect = self.timer_label.graphicsEffect()
        if not isinstance(effect, QGraphicsOpacityEffect):
            effect = QGraphicsOpacityEffect(self.timer_label)
            self.timer_label.setGraphicsEffect(effect)
        effect.setOpacity(0.7)
        self._fade_animation = QPropertyAnimation(effect, b"opacity", self)
        self._fade_animation.setDuration(200)
        self._fade_animation.setStartValue(0.7)
        self._fade_animation.setEndValue(1.0)
        self._fade_animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        self._fade_animation.start()

    def _crossfade_label(self, label, effect, text):
        if label.text() == text:
            return
        fade_out = QPropertyAnimation(effect, b"opacity", self)
        fade_out.setDuration(80)
        fade_out.setStartValue(effect.opacity())
        fade_out.setEndValue(0.25)
        fade_out.setEasingCurve(QEasingCurve.Type.OutCubic)

        def swap_text():
            label.setText(text)
            fade_in = QPropertyAnimation(effect, b"opacity", self)
            fade_in.setDuration(120)
            fade_in.setStartValue(0.25)
            fade_in.setEndValue(1.0)
            fade_in.setEasingCurve(QEasingCurve.Type.OutCubic)
            self._label_fade_in = fade_in
            fade_in.start()

        fade_out.finished.connect(swap_text)
        self._label_fade_out = fade_out
        fade_out.start()

    def _stop_status_pulse(self):
        self._status_pulse_group.stop()
        self.status_dot.setGeometry(2, 2, 10, 10)
        self.status_dot_effect.setBlurRadius(4)
        self.timer_panel_effect.setBlurRadius(22)

    def _style_status(self, state):
        self._stop_status_pulse()
        if state == "running":
            bg, border, text, dot, label = "rgba(85,201,140,0.10)", "rgba(85,201,140,0.22)", "#78D8A6", GREEN, "Running"
            self.status_dot_effect.setColor(QColor(85, 201, 140, 150))
            self.timer_panel_effect.setColor(QColor(85, 201, 140, 70))
            self._status_pulse_group.start()
        elif state == "paused":
            bg, border, text, dot, label = "rgba(230,174,85,0.10)", "rgba(230,174,85,0.22)", "#E8BD76", AMBER, "Paused"
            self.status_dot_effect.setColor(QColor(0, 0, 0, 0))
            self.timer_panel_effect.setColor(QColor(230, 174, 85, 32))
        elif state == "saved":
            bg, border, text, dot, label = "rgba(138,144,166,0.10)", "rgba(255,255,255,0.08)", "#C6CAD8", "#8A90A6", "✓ Saved"
            self.status_dot_effect.setColor(QColor(0, 0, 0, 0))
            self.timer_panel_effect.setColor(QColor(138, 144, 166, 24))
        elif state == "warning":
            bg, border, text, dot, label = "rgba(239,68,68,0.08)", "rgba(239,68,68,0.18)", "#F6A6AE", "#EF6A78", "Out of sync"
            self.status_dot_effect.setColor(QColor(0, 0, 0, 0))
            self.timer_panel_effect.setColor(QColor(239, 106, 120, 28))
        else:
            bg, border, text, dot, label = "rgba(138,144,166,0.10)", "rgba(255,255,255,0.08)", "#B1B6C8", "#8A90A6", "Idle"
            self.status_dot_effect.setColor(QColor(0, 0, 0, 0))
            self.timer_panel_effect.setColor(QColor(91, 95, 239, 28))
        self.status_pill.setStyleSheet(f"QWidget#statusPill {{ background:{bg}; border:1px solid {border}; border-radius:13px; }}")
        self.status_text.setStyleSheet(f"color:{text}; background:transparent; border:0; font-size:11px; font-weight:650;")
        self.status_dot.setStyleSheet(f"color:{dot}; background:transparent; border:0; font-size:10px;")
        self.status_text.setText(label)

    def _apply_state(self, state):
        self._fade_controls()
        self._style_status(state)
        active_request = self._pending_action is not None
        if state == "running":
            self.start_button.hide()
            self.pause_button.show()
            self.pause_button.setText("Ⅱ  Pause")
            self.pause_button.setObjectName("secondary")
            self.pause_button.setEnabled(not active_request)
            self.stop_button.setEnabled(not active_request)
            self.timer_label.setStyleSheet(f"color:{TEXT}; background:transparent; border:0;")
            self._crossfade_label(self.state_hint, self.state_hint_effect, "Running")
            self.state_hint.setStyleSheet(f"color:{GREEN}; background:transparent; border:0; font-size:10px; font-weight:600;")
        elif state == "paused":
            self.start_button.hide()
            self.pause_button.show()
            self.pause_button.setText("▶  Resume")
            self.pause_button.setObjectName("primary")
            self.pause_button.setEnabled(not active_request)
            self.stop_button.setEnabled(not active_request)
            self.timer_label.setStyleSheet(f"color:{MUTED}; background:transparent; border:0;")
            self._crossfade_label(self.state_hint, self.state_hint_effect, "Paused")
            self.state_hint.setStyleSheet(f"color:{AMBER}; background:transparent; border:0; font-size:10px; font-weight:600;")
        else:
            self.pause_button.hide()
            self.start_button.show()
            self.start_button.setText("▶  Start Tracking")
            self.start_button.setEnabled(not active_request and state != "saved")
            self.stop_button.setEnabled(False)
            self.timer_label.setStyleSheet(f"color:{TEXT}; background:transparent; border:0;")
            if state in ("idle", "saved"):
                self.timer_label.setText("00:00:00")
            if state == "saved":
                self._crossfade_label(self.state_hint, self.state_hint_effect, "Session saved")
                self.state_hint.setStyleSheet(f"color:{MUTED}; background:transparent; border:0; font-size:10px; font-weight:600;")
            else:
                self._crossfade_label(self.state_hint, self.state_hint_effect, "Ready to track")
                self.state_hint.setStyleSheet(f"color:{MUTED}; background:transparent; border:0; font-size:10px; font-weight:600;")
        for button in (self.start_button, self.pause_button, self.stop_button):
            button.style().unpolish(button)
            button.style().polish(button)

    def _current_state(self):
        if self._out_of_sync:
            return "warning"
        if not self._server_session:
            return "idle"
        return self._server_session.get("status") or "idle"

    def _update_timer_display(self):
        if not self._server_session:
            return
        base = int(self._server_session.get("total_duration_seconds") or 0)
        if self._server_session.get("status") == "running":
            base += max(0, int(time.monotonic() - self._server_sync_monotonic))
        self.timer_label.setText(_format_duration(base))

    def _set_pending(self, action):
        self._pending_action = action
        self.action_error.hide()
        state = self._current_state()
        if state == "warning":
            state = self._server_session.get("status", "idle") if self._server_session else "idle"
        self._apply_state(state)
        labels = {"start": "Starting…", "pause": "Pausing…", "resume": "Resuming…", "stop": "Saving…"}
        if action == "start":
            self.start_button.setText(labels[action])
        elif action in ("pause", "resume"):
            self.pause_button.setText(labels[action])
        elif action == "stop":
            self.stop_button.setText(labels[action])

    def _clear_pending(self):
        self._pending_action = None
        self.stop_button.setText("■  Stop Tracking")

    def start_tracking(self):
        if self._pending_action:
            return
        if not self.session_client:
            self._show_action_error("Tracking server is not connected.")
            return
        self._set_pending("start")
        self.session_client.start(self._job_role)

    def pause_or_resume_tracking(self):
        if self._pending_action or not self._server_session:
            return
        session_id = self._server_session.get("id")
        if self._server_session.get("status") == "running":
            self._set_pending("pause")
            self.session_client.pause(session_id)
        elif self._server_session.get("status") == "paused":
            self._set_pending("resume")
            self.session_client.resume(session_id)

    def stop_tracking(self):
        if self._pending_action or not self._server_session:
            return
        self._set_pending("stop")
        self.session_client.stop(self._server_session.get("id"))

    def _ensure_local_tracker(self, session):
        status = session.get("status")
        role = session.get("role_at_time") or self._job_role
        if not self.tracker.is_tracking:
            self.tracker.set_metadata(role, "")
            self.tracker.start()
        if status == "paused" and not self.tracker.paused:
            self.tracker.pause()
        elif status == "running" and self.tracker.paused:
            self.tracker.resume()

    def _reconcile_current(self, session):
        if session is None:
            if self.tracker.is_tracking and not self._pending_action:
                self._out_of_sync = True
                self._style_status("warning")
                self._show_action_error("Session may be out of sync: local tracking is active but the server has no active session. Retry or stop from another TELER client.")
                return
            self._server_session = None
            self._server_sync_monotonic = time.monotonic()
            self._out_of_sync = False
            self._apply_state("idle")
            return

        if self.tracker.is_tracking and self._server_session and self._server_session.get("id") != session.get("id"):
            self._out_of_sync = True
            self._style_status("warning")
            self._show_action_error("Session may be out of sync: another active session was found. TELER will not overwrite local state silently.")
            return

        try:
            self._ensure_local_tracker(session)
        except Exception as error:
            self._out_of_sync = True
            self._style_status("warning")
            self._show_action_error(f"Server session is active, but local telemetry could not start: {error}")
            return

        self._server_session = session
        self._server_sync_monotonic = time.monotonic()
        self._out_of_sync = False
        self._apply_state(session.get("status", "idle"))
        self._update_timer_display()

    def _session_succeeded(self, action, payload):
        data = payload.get("data") if isinstance(payload, dict) else None
        if action == "current":
            if not self._pending_action:
                self._reconcile_current(data)
            return
        if action == "list":
            self._render_sessions(data or [])
            return

        self._clear_pending()
        if action in ("start", "pause", "resume"):
            try:
                self._reconcile_current(data)
            except Exception as error:
                self._show_action_error(str(error))
                if data and self.session_client:
                    self.session_client.stop(data.get("id"))
            return

        if action == "stop":
            self._server_session = None
            self._server_sync_monotonic = time.monotonic()
            self._out_of_sync = False
            self._start_local_stop()
            self._apply_state("saved")
            self.saved_timer.start(1400)
            if self.session_client:
                self.session_client.list_sessions()

    def _session_retrying(self, action, attempt):
        self.action_error.setText(f"Connection interrupted. Retrying {action} ({attempt + 1}/3)…")
        self.action_error.show()

    def _session_failed(self, action, message, status):
        self._clear_pending()
        self._show_action_error(f"{message}  ·  Retry by using the same control again.")
        if status == 409:
            self._out_of_sync = True
            self._style_status("warning")
            if self.session_client:
                self.session_client.current()
        else:
            state = self._server_session.get("status", "idle") if self._server_session else "idle"
            self._apply_state(state)

    def _show_action_error(self, message):
        self.action_error.setText(message)
        self.action_error.show()

    def _start_local_stop(self):
        if not self.tracker.is_tracking or self._stop_worker is not None:
            action, self._after_stop = self._after_stop, None
            if action:
                action()
            return
        self._stop_error = None
        self._stop_worker = StopWorker(self.tracker, self)
        self._stop_worker.failed.connect(self._tracking_stop_failed)
        self._stop_worker.finished.connect(self._tracking_stopped)
        self._stop_worker.start()

    def _tracking_stop_failed(self, message):
        self._stop_error = message
        self._show_action_error(f"Session was saved on the server, but local telemetry cleanup failed: {message}")

    def _tracking_stopped(self):
        self._stop_worker.deleteLater()
        self._stop_worker = None
        action, self._after_stop = self._after_stop, None
        if action:
            action()

    def _clear_report_rows(self):
        while self.report_list.count() > 1:
            item = self.report_list.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()

    def _render_sessions(self, sessions):
        self._clear_report_rows()
        if not sessions:
            self.report_scroll.hide()
            self.report_empty_state.show()
            self.report_card.setMaximumHeight(400)
            self.main_layout.setStretchFactor(self.report_card, 0)
            return
        self.report_empty_state.hide()
        self.report_scroll.show()
        self.report_card.setMaximumHeight(16777215)
        self.main_layout.setStretchFactor(self.report_card, 1)
        for session in sessions:
            self.report_list.insertWidget(self.report_list.count() - 1, self._session_row(session))

    def _session_row(self, session):
        row = QWidget(objectName="reportRow")
        outer = QHBoxLayout(row)
        outer.setContentsMargins(0, 0, 10, 0)
        outer.setSpacing(10)
        accent = QFrame(objectName="reportAccent")
        accent.setFixedWidth(3)
        outer.addWidget(accent)
        copy = QVBoxLayout()
        copy.setContentsMargins(0, 10, 0, 10)
        copy.setSpacing(4)
        top = QHBoxLayout()
        role = QLabel(str(session.get("role_at_time") or "General").replace("_", " ").title())
        role.setStyleSheet(f"color:{TEXT}; font-size:11px; font-weight:700; background:transparent; border:0;")
        duration = QLabel(_format_duration(session.get("total_duration_seconds")))
        duration.setStyleSheet(f"color:{TEXT}; font-size:11px; font-family:'SF Mono'; background:transparent; border:0;")
        top.addWidget(role)
        top.addStretch()
        top.addWidget(duration)
        copy.addLayout(top)
        date_text, start_text = _local_parts(session.get("start_ts"))
        _, end_text = _local_parts(session.get("end_ts"))
        timing = QLabel(f"{date_text}  ·  {start_text} → {end_text}", objectName="muted")
        copy.addWidget(timing)
        pauses = int(session.get("pause_count") or 0)
        if pauses:
            paused_minutes = round(int(session.get("total_paused_seconds") or 0) / 60)
            pause_text = QLabel(f"Includes {pauses} pause{'s' if pauses != 1 else ''} · {paused_minutes}m paused time.", objectName="muted")
            copy.addWidget(pause_text)
        outer.addLayout(copy, 1)
        return row

    def _logout(self):
        if self._server_session:
            self._after_stop = self.logout_requested.emit
            self.stop_tracking()
            return
        if self.tracker.is_tracking or self._stop_worker is not None:
            self._after_stop = self.logout_requested.emit
            self._start_local_stop()
            return
        self.logout_requested.emit()

    def closeEvent(self, event):
        if self._server_session:
            self._after_stop = self.close
            self.stop_tracking()
            event.ignore()
            return
        if self.tracker.is_tracking or self._stop_worker is not None:
            self._after_stop = self.close
            self._start_local_stop()
            event.ignore()
            return
        self.ui_timer.stop()
        self.current_poll.stop()
        self.report_poll.stop()
        self._stop_status_pulse()
        event.accept()