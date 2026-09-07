"""Count macOS input with a read-only event tap; avoid Carbon keyboard decoding.

The dashboard stores counts/timestamps, so it does not need a keyboard layout
or typed characters. pynput's Carbon layout lookup crashes in a Qt worker
thread on recent macOS versions (upstream pynput issue #511).
"""
import threading

import Quartz


class MacInputListener:
    def __init__(self, on_key, on_click):
        self.on_key = on_key
        self.on_click = on_click
        self._ready = threading.Event()
        self._loop = None
        self._thread = None
        self._tap = None
        self._callback = self._handle_event

    def _handle_event(self, proxy, event_type, event, refcon):
        if event_type in (Quartz.kCGEventTapDisabledByTimeout, Quartz.kCGEventTapDisabledByUserInput):
            if self._tap:
                Quartz.CGEventTapEnable(self._tap, True)
        elif event_type == Quartz.kCGEventKeyDown:
            self.on_key(None)
        elif event_type in (Quartz.kCGEventLeftMouseDown, Quartz.kCGEventRightMouseDown, Quartz.kCGEventOtherMouseDown):
            self.on_click(0, 0, None, True)
        return event

    def start(self):
        mask = sum(1 << kind for kind in (
            Quartz.kCGEventKeyDown, Quartz.kCGEventLeftMouseDown,
            Quartz.kCGEventRightMouseDown, Quartz.kCGEventOtherMouseDown,
        ))
        self._tap = Quartz.CGEventTapCreate(
            Quartz.kCGSessionEventTap, Quartz.kCGHeadInsertEventTap,
            Quartz.kCGEventTapOptionListenOnly, mask, self._callback, None,
        )
        if self._tap is None:
            raise RuntimeError("macOS Input Monitoring permission is required for Python or the app launching TELER. Enable it in System Settings → Privacy & Security, then restart TELER.")
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        self._ready.wait(5)
        if not self._ready.is_set():
            self.stop()
            raise RuntimeError("macOS input listener did not start")

    def _run(self):
        self._loop = Quartz.CFRunLoopGetCurrent()
        source = Quartz.CFMachPortCreateRunLoopSource(None, self._tap, 0)
        Quartz.CFRunLoopAddSource(self._loop, source, Quartz.kCFRunLoopCommonModes)
        Quartz.CGEventTapEnable(self._tap, True)
        self._ready.set()
        Quartz.CFRunLoopRun()
        Quartz.CFRunLoopRemoveSource(self._loop, source, Quartz.kCFRunLoopCommonModes)

    def stop(self):
        if self._tap:
            Quartz.CGEventTapEnable(self._tap, False)
        if self._loop:
            Quartz.CFRunLoopStop(self._loop)
        if self._thread:
            self._thread.join(timeout=5)
        self._tap = None
