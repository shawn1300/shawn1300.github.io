"""Capture Xiaomi cloud session material from an ephemeral Microsoft Edge login."""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import parse_qsl, urlparse

from .xiaomi_auth import (
    MAX_BROWSER_RESPONSE_BYTES,
    PASSWORD_LOGIN_URL,
    SERVICE_LOGIN_URL,
    XiaomiBootstrapAuthenticationError,
    _validate_login_completion_url,
)


EDGE_LOGIN_URL = f"{SERVICE_LOGIN_URL}?sid=xiaomiio"
COOKIE_URLS = ("https://sts.api.io.mi.com", "https://api.io.mi.com")
ALLOWED_COOKIE_DOMAINS = frozenset({"sts.api.io.mi.com", "api.io.mi.com"})
POLL_INTERVAL_MS = 250


@dataclass(frozen=True, slots=True)
class EdgeLoginMaterial:
    user_id: str
    ssecurity: str
    location: str


@dataclass(frozen=True, slots=True)
class EdgeSessionMaterial:
    user_id: str
    service_token: str
    ssecurity: str


class EdgeDriver(Protocol):
    def start(self, response_callback: Callable[[str, bytes], None]) -> None: ...

    def open(self, url: str) -> None: ...

    def restricted_cookies(self) -> list[dict[str, Any]]: ...

    def navigate(self, url: str) -> None: ...

    def is_closed(self) -> bool: ...

    def wait(self, milliseconds: int) -> None: ...

    def close(self) -> None: ...


def _is_allowed_login_response_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        port = parsed.port
    except (TypeError, ValueError):
        return False
    if (
        not isinstance(value, str)
        or value != value.strip()
        or any(character in value for character in "\r\n\t")
        or parsed.scheme != "https"
        or parsed.hostname != "account.xiaomi.com"
        or parsed.username is not None
        or parsed.password is not None
        or port not in (None, 443)
        or parsed.fragment
    ):
        return False
    if parsed.path == "/pass/serviceLoginAuth2":
        return not parsed.params and not parsed.query
    if parsed.path != "/pass/serviceLogin" or parsed.params:
        return False
    query = sorted(parse_qsl(parsed.query, keep_blank_values=True))
    return query in (
        [("sid", "xiaomiio")],
        [("_json", "true"), ("sid", "xiaomiio")],
    )


def parse_edge_login_response(
    response_url: str,
    body: bytes | str,
) -> EdgeLoginMaterial | None:
    """Return complete Xiaomi login material from one exact official response."""

    if not _is_allowed_login_response_url(response_url):
        return None
    if isinstance(body, str):
        raw = body.encode("utf-8")
    elif isinstance(body, bytes):
        raw = body
    else:
        return None
    if len(raw) > MAX_BROWSER_RESPONSE_BYTES:
        return None
    try:
        text = raw.decode("utf-8").strip()
    except UnicodeDecodeError:
        return None
    prefix = "&&&START&&&"
    if text.startswith(prefix):
        text = text[len(prefix) :]
    if not text.startswith("{"):
        return None
    try:
        values = json.loads(text)
    except (TypeError, ValueError):
        return None
    if not isinstance(values, dict) or values.get("code") != 0:
        return None

    user_id = values.get("userId")
    ssecurity = values.get("ssecurity")
    location = values.get("location")
    if (
        isinstance(user_id, bool)
        or not isinstance(user_id, (str, int))
        or not str(user_id).strip()
        or not isinstance(ssecurity, str)
        or not ssecurity.strip()
        or not isinstance(location, str)
        or not location.strip()
    ):
        return None
    return EdgeLoginMaterial(
        user_id=str(user_id),
        ssecurity=ssecurity,
        location=_validate_login_completion_url(location),
    )


class PlaywrightEdgeDriver:
    """Thin Playwright adapter that never opens an existing browser profile."""

    def __init__(self, *, playwright_start: Callable[[], Any] | None = None) -> None:
        self._playwright_start = playwright_start or self._start_playwright
        self._playwright: Any | None = None
        self._browser: Any | None = None
        self._context: Any | None = None
        self._page: Any | None = None

    @staticmethod
    def _start_playwright() -> Any:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise XiaomiBootstrapAuthenticationError(
                "Playwright is not installed; install collector/requirements.txt"
            ) from exc
        return sync_playwright().start()

    def start(self, response_callback: Callable[[str, bytes], None]) -> None:
        def handle_response(response: Any) -> None:
            if not _is_allowed_login_response_url(response.url):
                return
            try:
                body = response.body()
            except Exception:
                return
            response_callback(response.url, body)

        self._launch(handle_response)

    def _launch(self, response_handler: Callable[[Any], None]) -> None:
        self._playwright = self._playwright_start()
        self._browser = self._playwright.chromium.launch(
            channel="msedge",
            headless=False,
            args=["--disable-extensions"],
        )
        self._context = self._browser.new_context(accept_downloads=False)
        self._page = self._context.new_page()
        self._page.on("response", response_handler)

    def open(self, url: str) -> None:
        self._page.goto(url, wait_until="domcontentloaded", timeout=60_000)

    def restricted_cookies(self) -> list[dict[str, Any]]:
        return list(self._context.cookies(list(COOKIE_URLS)))

    def navigate(self, url: str) -> None:
        self._page.goto(url, wait_until="domcontentloaded", timeout=60_000)

    def is_closed(self) -> bool:
        try:
            return self._page.is_closed() or not self._browser.is_connected()
        except Exception:
            return True

    def wait(self, milliseconds: int) -> None:
        self._page.wait_for_timeout(milliseconds)

    def close(self) -> None:
        for resource in (self._page, self._context, self._browser, self._playwright):
            if resource is None:
                continue
            try:
                if resource is self._playwright:
                    resource.stop()
                else:
                    resource.close()
            except Exception:
                continue
        self._page = None
        self._context = None
        self._browser = None
        self._playwright = None


def _session_from_restricted_cookies(
    cookies: list[dict[str, Any]],
    *,
    login: EdgeLoginMaterial,
) -> EdgeSessionMaterial | None:
    service_tokens: set[str] = set()
    cookie_user_ids: set[str] = set()
    for cookie in cookies:
        if not isinstance(cookie, dict):
            continue
        domain = str(cookie.get("domain") or "").lower().lstrip(".")
        if domain not in ALLOWED_COOKIE_DOMAINS:
            continue
        name = cookie.get("name")
        value = cookie.get("value")
        if not isinstance(value, str) or not value:
            continue
        if name == "serviceToken":
            service_tokens.add(value)
        elif name == "userId":
            cookie_user_ids.add(value)
    if len(service_tokens) > 1:
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi Edge login returned conflicting cloud sessions"
        )
    if any(user_id != login.user_id for user_id in cookie_user_ids):
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi Edge login identity did not match the cloud session"
        )
    if not service_tokens:
        return None
    return EdgeSessionMaterial(
        user_id=login.user_id,
        service_token=next(iter(service_tokens)),
        ssecurity=login.ssecurity,
    )


def capture_edge_session(
    *,
    driver_factory: Callable[[], EdgeDriver] = PlaywrightEdgeDriver,
    timeout_seconds: float = 10 * 60,
    redirect_grace_seconds: float = 5,
    monotonic: Callable[[], float] = time.monotonic,
) -> EdgeSessionMaterial:
    """Capture one cloud session, closing the ephemeral browser on every path."""

    driver: EdgeDriver | None = None
    login: EdgeLoginMaterial | None = None
    captured_at: float | None = None
    fatal_error: XiaomiBootstrapAuthenticationError | None = None
    completion_consumed = False
    started_at = monotonic()

    def handle_response(url: str, body: bytes) -> None:
        nonlocal login, captured_at, fatal_error
        if login is not None or fatal_error is not None:
            return
        try:
            candidate = parse_edge_login_response(url, body)
        except XiaomiBootstrapAuthenticationError as exc:
            fatal_error = exc
            return
        if candidate is not None:
            login = candidate
            captured_at = monotonic()

    try:
        driver = driver_factory()
        try:
            driver.start(handle_response)
            driver.open(EDGE_LOGIN_URL)
        except XiaomiBootstrapAuthenticationError:
            raise
        except Exception as exc:
            raise XiaomiBootstrapAuthenticationError(
                "Xiaomi bootstrap could not start Microsoft Edge"
            ) from exc

        while True:
            if fatal_error is not None:
                raise fatal_error
            now = monotonic()
            if login is not None:
                session = _session_from_restricted_cookies(
                    driver.restricted_cookies(),
                    login=login,
                )
                if session is not None:
                    return session
                if (
                    not completion_consumed
                    and captured_at is not None
                    and now - captured_at >= redirect_grace_seconds
                ):
                    completion_consumed = True
                    driver.navigate(login.location)
                    if fatal_error is not None:
                        raise fatal_error
                    session = _session_from_restricted_cookies(
                        driver.restricted_cookies(),
                        login=login,
                    )
                    if session is not None:
                        return session
                    raise XiaomiBootstrapAuthenticationError(
                        "Xiaomi Edge login did not return a cloud session"
                    )
            if driver.is_closed():
                raise XiaomiBootstrapAuthenticationError(
                    "Xiaomi Edge login window was closed before completion"
                )
            if now - started_at >= timeout_seconds:
                raise XiaomiBootstrapAuthenticationError(
                    "Xiaomi Edge login timed out without complete session material"
                )
            driver.wait(POLL_INTERVAL_MS)
    except KeyboardInterrupt:
        raise
    except XiaomiBootstrapAuthenticationError:
        raise
    except Exception as exc:
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi Edge login could not be completed"
        ) from exc
    finally:
        if driver is not None:
            try:
                driver.close()
            except Exception:
                pass


def _default_client_factory(
    *, username: str | None = None, password: str | None = None
) -> Any:
    try:
        from micloud import MiCloud
    except ImportError as exc:
        raise XiaomiBootstrapAuthenticationError(
            "micloud is not installed; install collector/requirements.txt"
        ) from exc
    return MiCloud(username=username, password=password)


def hydrate_edge_session(
    material: EdgeSessionMaterial,
    *,
    client_factory: Callable[..., Any] = _default_client_factory,
) -> Any:
    """Create a password-free MiCloud client after Edge has been closed."""

    client = client_factory(username=None, password=None)
    client.username = None
    client.password = None
    client.user_id = material.user_id
    client.service_token = material.service_token
    client.ssecurity = material.ssecurity
    client.pass_token = None
    return client
