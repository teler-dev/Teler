import os
import re
import sys

from PyQt6.QtCore import QObject, QEasingCurve, QPropertyAnimation, QRect, QTimer, Qt
from PyQt6.QtGui import QColor, QFont, QFontMetrics, QIcon, QPainter, QPixmap
from PyQt6.QtWidgets import (
    QApplication,
    QCheckBox,
    QDialog,
    QFrame,
    QGraphicsDropShadowEffect,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from core.auth import AuthClient
from core.tracker import MainWindow
from tracker.activity_tracker import recover_incomplete_sessions


_LOGO_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "logo.png")
ACCENT = "#5B5FEF"
ACCENT_HOVER = "#7074FF"
PAGE = "#0B0D14"
SURFACE = "#151826"
INPUT = "#0F1220"
TEXT = "#F7F8FC"
MUTED = "#8A90A6"
BORDER = "rgba(255,255,255,0.08)"


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


def _glyph_icon(glyph: str, color: str = MUTED) -> QIcon:
    pixmap = QPixmap(18, 18)
    pixmap.fill(Qt.GlobalColor.transparent)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.setPen(QColor(color))
    font = QFont()
    font.setPixelSize(13)
    font.setWeight(QFont.Weight.DemiBold)
    painter.setFont(font)
    painter.drawText(pixmap.rect(), Qt.AlignmentFlag.AlignCenter, glyph)
    painter.end()
    return QIcon(pixmap)


class AuthDialog(QDialog):
    def __init__(self, client, parent=None):
        super().__init__(parent)
        self.client = client
        self.account = None
        self.mode = "login"
        self._tab_animation = None
        self.setWindowTitle("TELER — Sign in")
        self.resize(560, 760)
        self.setMinimumSize(500, 650)
        self._build_ui()
        self.client.auth_succeeded.connect(self._auth_succeeded)
        self.client.request_failed.connect(self._request_failed)
        if self.client.token:
            self._set_busy(True, "Restoring your session…")
            QTimer.singleShot(0, self.client.restore_session)

    def _build_ui(self):
        self.setStyleSheet(f"""
            QDialog {{ background: {PAGE}; color: {TEXT}; }}
            QScrollArea {{ background: transparent; border: 0; }}
            QScrollArea > QWidget > QWidget {{ background: transparent; }}
            QWidget#card {{ background: {SURFACE}; border: 1px solid {BORDER}; border-radius: 20px; }}
            QLabel#brand {{ color: {TEXT}; font-size: 25px; font-weight: 800; letter-spacing: 1px; }}
            QLabel#headline {{ color: {TEXT}; font-size: 22px; font-weight: 750; }}
            QLabel#subtitle {{ color: {MUTED}; font-size: 12px; }}
            QLabel#field {{ color: #A9AFC2; font-size: 11px; font-weight: 600; }}
            QLabel#helper {{ color: {MUTED}; font-size: 10px; }}
            QLabel#error {{ color: #F6A6AE; font-size: 11px; background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.18); border-radius: 9px; padding: 8px 10px; }}
            QLineEdit {{ background: {INPUT}; border: 1px solid rgba(255,255,255,0.09); border-radius: 11px; padding: 11px 13px; color: {TEXT}; font-size: 13px; selection-background-color: {ACCENT}; }}
            QLineEdit:focus {{ border: 1px solid {ACCENT}; background: #111528; }}
            QPushButton#primary {{ background: {ACCENT}; border: 0; border-radius: 11px; padding: 12px 16px; color: white; font-size: 13px; font-weight: 700; }}
            QPushButton#primary:hover {{ background: {ACCENT_HOVER}; }}
            QPushButton#primary:disabled {{ background: #33374F; color: #777D93; }}
            QPushButton#mode {{ background: transparent; border: 0; color: {MUTED}; padding: 9px 14px; font-size: 12px; font-weight: 650; }}
            QPushButton#mode[active="true"] {{ color: {TEXT}; }}
            QPushButton#link {{ background: transparent; border: 0; color: #8C90FF; padding: 0; font-size: 11px; font-weight: 600; text-align: right; }}
            QPushButton#link:hover {{ color: #B5B7FF; text-decoration: underline; }}
            QCheckBox {{ color: {MUTED}; spacing: 8px; font-size: 10px; }}
            QCheckBox::indicator {{ width: 15px; height: 15px; border: 1px solid rgba(255,255,255,0.18); border-radius: 4px; background: {INPUT}; }}
            QCheckBox::indicator:checked {{ background: {ACCENT}; border-color: {ACCENT}; }}
            QProgressBar {{ background: #0D101B; border: 0; border-radius: 3px; height: 6px; text-align: center; color: transparent; }}
            QProgressBar::chunk {{ border-radius: 3px; background: #A1A7B8; }}
            QFrame#divider {{ background: rgba(255,255,255,0.07); max-height: 1px; border: 0; }}
        """)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(34, 28, 34, 34)
        outer.setSpacing(0)
        title_rule = QFrame(objectName="divider")
        title_rule.setFixedHeight(1)
        outer.addWidget(title_rule)
        outer.addSpacing(24)

        card = QWidget(objectName="card")
        card.setMinimumWidth(420)
        card.setMaximumWidth(460)
        shadow = QGraphicsDropShadowEffect(card)
        shadow.setBlurRadius(44)
        shadow.setOffset(0, 14)
        shadow.setColor(QColor(42, 45, 91, 115))
        card.setGraphicsEffect(shadow)

        form = QVBoxLayout(card)
        form.setContentsMargins(34, 30, 34, 32)
        form.setSpacing(9)

        brand = QHBoxLayout()
        brand.setAlignment(Qt.AlignmentFlag.AlignCenter)
        brand.setSpacing(9)
        logo = _make_logo_label(34)
        if logo:
            brand.addWidget(logo)
        brand.addWidget(QLabel("TELER", objectName="brand"))
        form.addLayout(brand)
        form.addSpacing(6)

        self.headline = QLabel("Welcome back", objectName="headline")
        self.headline.setAlignment(Qt.AlignmentFlag.AlignCenter)
        form.addWidget(self.headline)

        secure_row = QHBoxLayout()
        secure_row.setAlignment(Qt.AlignmentFlag.AlignCenter)
        secure_row.setSpacing(6)
        shield = QLabel("◈")
        shield.setStyleSheet(f"color: {ACCENT}; font-size: 13px;")
        secure_row.addWidget(shield)
        self.subtitle = QLabel("Sign in to start secure tracking", objectName="subtitle")
        secure_row.addWidget(self.subtitle)
        form.addLayout(secure_row)
        form.addSpacing(14)

        self.tabs = QWidget()
        self.tabs.setFixedHeight(40)
        tabs_layout = QHBoxLayout(self.tabs)
        tabs_layout.setContentsMargins(0, 0, 0, 3)
        tabs_layout.setSpacing(0)
        self.login_mode = QPushButton("Sign in", objectName="mode")
        self.signup_mode = QPushButton("Create account", objectName="mode")
        self.login_mode.clicked.connect(lambda: self._set_mode("login"))
        self.signup_mode.clicked.connect(lambda: self._set_mode("signup"))
        tabs_layout.addWidget(self.login_mode)
        tabs_layout.addWidget(self.signup_mode)
        self.tab_indicator = QFrame(self.tabs)
        self.tab_indicator.setStyleSheet(f"background: {ACCENT}; border-radius: 1px;")
        self.tab_indicator.setFixedHeight(2)
        form.addWidget(self.tabs)
        form.addSpacing(7)

        self.name_label, self.name = self._field(form, "Full name", "Your full name", "A")
        self.email_label, self.email = self._field(form, "Email", "name@company.com", "✉")
        self.password_label, self.password = self._field(form, "Password", "Minimum 8 characters", "●")
        self.password.setEchoMode(QLineEdit.EchoMode.Password)

        self.forgot = QPushButton("Forgot password?", objectName="link")
        self.forgot.clicked.connect(self._forgot_password)
        forgot_row = QHBoxLayout()
        forgot_row.addStretch()
        forgot_row.addWidget(self.forgot)
        form.addLayout(forgot_row)
        self.forgot_gap = QWidget()
        self.forgot_gap.setFixedHeight(12)
        form.addWidget(self.forgot_gap)

        self.strength_wrap = QWidget()
        strength_layout = QHBoxLayout(self.strength_wrap)
        strength_layout.setContentsMargins(0, 0, 0, 0)
        strength_layout.setSpacing(10)
        self.strength = QProgressBar()
        self.strength.setRange(0, 3)
        self.strength.setValue(0)
        self.strength.setTextVisible(False)
        self.strength_label = QLabel("Password strength", objectName="helper")
        strength_layout.addWidget(self.strength, 1)
        strength_layout.addWidget(self.strength_label)
        form.addWidget(self.strength_wrap)
        self.password.textChanged.connect(self._update_password_strength)

        self.confirm_label, self.confirm = self._field(form, "Confirm password", "Repeat your password", "●")
        self.confirm.setEchoMode(QLineEdit.EchoMode.Password)

        self.server_label, self.server = self._field(form, "Server", "https://your-teler-server", "◇")
        self.server.setText(self.client.api_base)

        self.terms = QCheckBox("I agree to the Terms and Privacy Policy")
        self.terms.setToolTip("Required to create a TELER account")
        form.addWidget(self.terms)

        self.error = QLabel("", objectName="error")
        self.error.setWordWrap(True)
        self.error.hide()
        form.addWidget(self.error)

        form.addSpacing(3)
        self.submit = QPushButton("Sign in", objectName="primary")
        self.submit.setMinimumHeight(46)
        self.submit.clicked.connect(self._submit)
        form.addWidget(self.submit)

        helper = QLabel("Secure telemetry • encrypted session • privacy-first", objectName="helper")
        helper.setAlignment(Qt.AlignmentFlag.AlignCenter)
        form.addSpacing(4)
        form.addWidget(helper)

        self.confirm.returnPressed.connect(self._submit)
        self.password.returnPressed.connect(self._submit)
        self.server.returnPressed.connect(self._submit)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        scroll_content = QWidget()
        scroll_content.setStyleSheet("background: transparent;")
        scroll_layout = QVBoxLayout(scroll_content)
        scroll_layout.setContentsMargins(0, 0, 0, 0)
        scroll_layout.setSpacing(0)
        scroll_layout.addWidget(card, 0, Qt.AlignmentFlag.AlignHCenter | Qt.AlignmentFlag.AlignTop)
        scroll_layout.addStretch()
        scroll.setWidget(scroll_content)
        outer.addWidget(scroll)
        self._set_mode("login", animate=False)

    def _field(self, layout, label_text, placeholder, glyph):
        label = QLabel(label_text, objectName="field")
        edit = QLineEdit()
        edit.setMinimumHeight(44)
        edit.setPlaceholderText(placeholder)
        edit.addAction(_glyph_icon(glyph), QLineEdit.ActionPosition.LeadingPosition)
        layout.addWidget(label)
        layout.addWidget(edit)
        return label, edit

    def _set_mode(self, mode, animate=True):
        self.mode = mode
        signup = mode == "signup"
        for widget in (self.name_label, self.name, self.confirm_label, self.confirm, self.strength_wrap, self.terms):
            widget.setVisible(signup)
        self.forgot.setVisible(not signup)
        self.forgot_gap.setVisible(not signup)
        self.submit.setText("Create account" if signup else "Sign in")
        self.headline.setText("Create your account" if signup else "Welcome back")
        self.subtitle.setText("Join TELER with the same secure workspace" if signup else "Sign in to start secure tracking")
        self.setWindowTitle("TELER — Create account" if signup else "TELER — Sign in")
        self.login_mode.setProperty("active", not signup)
        self.signup_mode.setProperty("active", signup)
        for button in (self.login_mode, self.signup_mode):
            button.style().unpolish(button)
            button.style().polish(button)
        self.error.hide()
        QTimer.singleShot(0, lambda: self._move_tab_indicator(signup, animate))

    def _move_tab_indicator(self, signup, animate=True):
        target_button = self.signup_mode if signup else self.login_mode
        metrics = QFontMetrics(target_button.font())
        indicator_width = max(1, metrics.horizontalAdvance(target_button.text()))
        indicator_x = target_button.x() + (target_button.width() - indicator_width) // 2
        target = QRect(indicator_x, self.tabs.height() - 3, indicator_width, 2)
        if not animate or self.tab_indicator.geometry().width() <= 0:
            self.tab_indicator.setGeometry(target)
            return
        self._tab_animation = QPropertyAnimation(self.tab_indicator, b"geometry", self)
        self._tab_animation.setDuration(190)
        self._tab_animation.setStartValue(self.tab_indicator.geometry())
        self._tab_animation.setEndValue(target)
        self._tab_animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        self._tab_animation.start()

    def _update_password_strength(self, value):
        score = 0
        if len(value) >= 8:
            score += 1
        if re.search(r"[A-Z]", value) and re.search(r"[a-z]", value):
            score += 1
        if re.search(r"\d", value) and re.search(r"[^A-Za-z0-9]", value):
            score += 1
        self.strength.setValue(score)
        if score <= 1:
            color, label = "#EF6A78", "Weak"
        elif score == 2:
            color, label = "#E6AE55", "Medium"
        else:
            color, label = "#55C98C", "Strong"
        self.strength.setStyleSheet(
            f"QProgressBar {{ background:#0D101B; border:0; border-radius:3px; }} "
            f"QProgressBar::chunk {{ background:{color}; border-radius:3px; }}"
        )
        self.strength_label.setText(label if value else "Password strength")

    def _forgot_password(self):
        QMessageBox.information(
            self,
            "TELER password recovery",
            "Password recovery is not enabled in this desktop client yet. Contact your TELER workspace administrator for access recovery.",
        )

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
            if not name:
                return self._show_error("Full name is required.")
            if password != self.confirm.text():
                return self._show_error("Passwords do not match.")
            if len(password) < 8:
                return self._show_error("Password must contain at least 8 characters.")
            if not self.terms.isChecked():
                return self._show_error("Please agree to the Terms and Privacy Policy to continue.")
            self._set_busy(True, "Creating account…")
            self.client.signup(name, email, password, f"{name}'s workspace", "general")
        else:
            self._set_busy(True, "Signing in…")
            self.client.login(email, password)

    def _set_busy(self, busy, message=""):
        self.submit.setEnabled(not busy)
        self.login_mode.setEnabled(not busy)
        self.signup_mode.setEnabled(not busy)
        if message:
            self.error.setText(message)
            self.error.setStyleSheet(
                f"color:{MUTED}; background:rgba(91,95,239,0.06); border:1px solid rgba(91,95,239,0.18); border-radius:9px; padding:8px 10px;"
            )
            self.error.show()

    def _show_error(self, message):
        self.error.setStyleSheet(
            "color:#F6A6AE; background:rgba(239,68,68,0.07); border:1px solid rgba(239,68,68,0.18); border-radius:9px; padding:8px 10px;"
        )
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
        self.window = MainWindow(
            username=display_name,
            organization_name=organization.get("name", ""),
            job_role=account.get("jobRole") or "general",
            organization_id=organization.get("id", ""),
            employee_id=account.get("id", ""),
        )
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
    application.setApplicationName("TELER")
    application.setOrganizationName("TELER")
    application.setQuitOnLastWindowClosed(False)
    controller = ApplicationController(application)
    QTimer.singleShot(0, controller.start)
    sys.exit(application.exec())