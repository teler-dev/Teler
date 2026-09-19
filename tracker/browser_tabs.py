"""Privacy-bounded Chromium tab discovery through a local DevTools endpoint."""

from __future__ import annotations

import json
import os
from urllib.parse import urlsplit, urlunsplit
from urllib.request import urlopen


def _safe_url(value: object) -> str:
    try:
        parts = urlsplit(str(value or ""))
    except ValueError:
        return ""
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        return ""
    # Query strings and fragments may contain search terms, tokens, or IDs.
    return urlunsplit((parts.scheme, parts.netloc, parts.path[:180], "", ""))[:260]


def list_browser_tabs(limit: int = 8) -> list[dict[str, str]]:
    """Read title + sanitized URL only from a user-enabled local endpoint."""
    try:
        port = int(os.environ.get("TELER_BROWSER_DEBUG_PORT", "9222"))
    except (TypeError, ValueError):
        return []
    if not 1024 <= port <= 65535:
        return []
    try:
        with urlopen(f"http://127.0.0.1:{port}/json/list", timeout=0.6) as response:
            pages = json.loads(response.read().decode("utf-8", errors="replace"))
    except Exception:
        return []
    seen, tabs = set(), []
    for page in pages if isinstance(pages, list) else []:
        if not isinstance(page, dict) or page.get("type") != "page":
            continue
        url = _safe_url(page.get("url"))
        if not url or url in seen:
            continue
        seen.add(url)
        title = " ".join(str(page.get("title") or "").split())[:120]
        tabs.append({"title": title or urlsplit(url).hostname or "Browser tab", "url": url})
        if len(tabs) >= max(1, min(limit, 12)):
            break
    return tabs
