"""Secret-safe diagnostics for Xiaomi's current browser login responses."""

from __future__ import annotations

import json
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from .edge_auth import (
    EDGE_LOGIN_URL,
    EdgeDriver,
    EdgeLoginMaterial,
    EdgeSessionMaterial,
    PlaywrightEdgeDriver,
    _session_from_restricted_cookies,
)
from .xiaomi_auth import (
    MAX_BROWSER_RESPONSE_BYTES,
    XiaomiBootstrapAuthenticationError,
    _validate_login_completion_url,
)


JSON_MEDIA_TYPES = frozenset({"application/json", "text/json"})
SAFE_PATH = re.compile(r"/[A-Za-z0-9._/-]{0,159}\Z")
LONG_NUMBER = re.compile(r"\d{4,}")
POLL_INTERVAL_MS = 250


@dataclass(frozen=True, slots=True)
class DiagnosticHTTPResponse:
    url: str
    status: int
    body: bytes


@dataclass(frozen=True, slots=True)
class DiagnosticLayerFlags:
    code_zero: bool = False
    user_id: bool = False
    ssecurity: bool = False
    location: bool = False
    pass_token: bool = False

    def render(self) -> str:
        names = [
            name
            for enabled, name in (
                (self.code_zero, "code0"),
                (self.user_id, "userId"),
                (self.ssecurity, "ssecurity"),
                (self.location, "location"),
                (self.pass_token, "passToken"),
            )
            if enabled
        ]
        return ",".join(names) if names else "-"


@dataclass(frozen=True, slots=True)
class DiagnosticObservation:
    path: str
    status: int
    root: DiagnosticLayerFlags
    data: DiagnosticLayerFlags
    candidate: EdgeLoginMaterial | None = None

    def render(self, sequence: int) -> str:
        return (
            f"Diagnostic #{sequence}: {self.path} · status={self.status} · "
            f"root[{self.root.render()}] · data[{self.data.render()}]"
        )


def _is_exact_account_origin(value: str) -> bool:
    try:
        parsed = urlparse(value)
        port = parsed.port
    except (TypeError, ValueError):
        return False
    return bool(
        isinstance(value, str)
        and value == value.strip()
        and not any(character in value for character in "\r\n\t")
        and parsed.scheme == "https"
        and parsed.hostname == "account.xiaomi.com"
        and parsed.username is None
        and parsed.password is None
        and port in (None, 443)
        and not parsed.fragment
    )


def _sanitized_path(url: str) -> str:
    path = urlparse(url).path
    if len(path) > 160 or SAFE_PATH.fullmatch(path) is None:
        return "[redacted-path]"
    return LONG_NUMBER.sub("[number]", path)


def _layer_flags(values: Any) -> DiagnosticLayerFlags:
    if not isinstance(values, dict):
        return DiagnosticLayerFlags()
    return DiagnosticLayerFlags(
        code_zero=values.get("code") == 0,
        user_id="userId" in values,
        ssecurity="ssecurity" in values,
        location="location" in values,
        pass_token="passToken" in values,
    )


def _candidate_from_layer(values: Any) -> EdgeLoginMaterial | None:
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
    try:
        validated_location = _validate_login_completion_url(location)
    except XiaomiBootstrapAuthenticationError:
        return None
    return EdgeLoginMaterial(
        user_id=str(user_id),
        ssecurity=ssecurity,
        location=validated_location,
    )


def parse_diagnostic_observation(
    response: DiagnosticHTTPResponse,
) -> DiagnosticObservation | None:
    """Parse only fixed metadata from one exact Xiaomi account JSON response."""

    if not _is_exact_account_origin(response.url):
        return None
    if (
        not isinstance(response.body, bytes)
        or len(response.body) > MAX_BROWSER_RESPONSE_BYTES
    ):
        return None
    try:
        text = response.body.decode("utf-8").strip()
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
    if not isinstance(values, dict):
        return None
    data = values.get("data")
    candidate = _candidate_from_layer(values) or _candidate_from_layer(data)
    return DiagnosticObservation(
        path=_sanitized_path(response.url),
        status=int(response.status),
        root=_layer_flags(values),
        data=_layer_flags(data),
        candidate=candidate,
    )


class PlaywrightDiagnosticDriver(PlaywrightEdgeDriver):
    """Read only bounded JSON responses from Xiaomi's exact account origin."""

    def start(
        self,
        response_callback: Callable[[DiagnosticHTTPResponse], None],
    ) -> None:
        def handle_response(response: Any) -> None:
            if not _is_exact_account_origin(response.url):
                return
            try:
                headers = response.headers
                media_type = str(headers.get("content-type") or "").split(";", 1)[0]
                media_type = media_type.strip().lower()
                if media_type not in JSON_MEDIA_TYPES and not media_type.endswith(
                    "+json"
                ):
                    return
                declared_length = headers.get("content-length")
                if declared_length is not None:
                    try:
                        if int(declared_length) > MAX_BROWSER_RESPONSE_BYTES:
                            return
                    except (TypeError, ValueError):
                        pass
                body = response.body()
            except Exception:
                return
            if not isinstance(body, bytes) or len(body) > MAX_BROWSER_RESPONSE_BYTES:
                return
            response_callback(
                DiagnosticHTTPResponse(
                    url=response.url,
                    status=int(response.status),
                    body=body,
                )
            )

        self._launch(handle_response)


def _has_restricted_service_token(cookies: list[dict[str, Any]]) -> bool:
    for cookie in cookies:
        if not isinstance(cookie, dict):
            continue
        domain = str(cookie.get("domain") or "").lower().lstrip(".")
        if domain not in {"api.io.mi.com", "sts.api.io.mi.com"}:
            continue
        if cookie.get("name") == "serviceToken" and isinstance(
            cookie.get("value"), str
        ) and cookie.get("value"):
            return True
    return False


def capture_edge_diagnostic(
    *,
    driver_factory: Callable[[], EdgeDriver] = PlaywrightDiagnosticDriver,
    print_fn: Callable[[str], None] = print,
    timeout_seconds: float = 10 * 60,
    cookie_grace_seconds: float = 5,
    redirect_grace_seconds: float = 5,
    monotonic: Callable[[], float] = time.monotonic,
) -> EdgeSessionMaterial:
    """Diagnose official responses and return only a complete matched cloud session."""

    driver: EdgeDriver | None = None
    candidate: EdgeLoginMaterial | None = None
    candidate_seen_at: float | None = None
    cookie_seen_at: float | None = None
    sequence = 0
    completion_consumed = False
    started_at = monotonic()

    def handle_response(response: DiagnosticHTTPResponse) -> None:
        nonlocal candidate, candidate_seen_at, sequence
        observation = parse_diagnostic_observation(response)
        if observation is None:
            return
        sequence += 1
        print_fn(observation.render(sequence))
        if candidate is None and observation.candidate is not None:
            candidate = observation.candidate
            candidate_seen_at = monotonic()

    try:
        driver = driver_factory()
        try:
            driver.start(handle_response)
            driver.open(EDGE_LOGIN_URL)
        except XiaomiBootstrapAuthenticationError:
            raise
        except Exception as exc:
            raise XiaomiBootstrapAuthenticationError(
                "Xiaomi diagnostic could not start Microsoft Edge"
            ) from exc

        while True:
            now = monotonic()
            cookies = driver.restricted_cookies()
            if candidate is not None:
                session = _session_from_restricted_cookies(cookies, login=candidate)
                if session is not None:
                    return session
                if (
                    not completion_consumed
                    and candidate_seen_at is not None
                    and now - candidate_seen_at >= redirect_grace_seconds
                ):
                    completion_consumed = True
                    driver.navigate(candidate.location)
                    cookies = driver.restricted_cookies()
                    session = _session_from_restricted_cookies(
                        cookies,
                        login=candidate,
                    )
                    if session is not None:
                        return session
            if _has_restricted_service_token(cookies):
                if cookie_seen_at is None:
                    cookie_seen_at = now
                    print_fn(
                        "Diagnostic: Xiaomi cloud cookie observed; "
                        "waiting 5 seconds for matching response."
                    )
                elif now - cookie_seen_at >= cookie_grace_seconds:
                    raise XiaomiBootstrapAuthenticationError(
                        "Xiaomi Edge diagnostic found a cloud cookie but no complete "
                        "login response"
                    )
            if driver.is_closed():
                raise XiaomiBootstrapAuthenticationError(
                    "Xiaomi Edge diagnostic window was closed before completion"
                )
            if now - started_at >= timeout_seconds:
                raise XiaomiBootstrapAuthenticationError(
                    "Xiaomi Edge diagnostic timed out without complete session material"
                )
            driver.wait(POLL_INTERVAL_MS)
    except KeyboardInterrupt:
        raise
    except XiaomiBootstrapAuthenticationError:
        raise
    except Exception as exc:
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi Edge diagnostic could not be completed"
        ) from exc
    finally:
        if driver is not None:
            try:
                driver.close()
            except Exception:
                pass
