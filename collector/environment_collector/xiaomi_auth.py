"""Interactive, secret-safe Xiaomi bootstrap authentication."""

from __future__ import annotations

import getpass
import hashlib
import json
import time
import webbrowser
from collections.abc import Callable
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse

import requests

from .xiaomi_cloud import XiaomiCloudError


ACCOUNT_ORIGIN = "https://account.xiaomi.com"
PASSWORD_LOGIN_URL = f"{ACCOUNT_ORIGIN}/pass/serviceLoginAuth2"
ALLOWED_LOGIN_RESULT_HOSTS = frozenset({"account.xiaomi.com", "sts.api.io.mi.com"})


class XiaomiBootstrapAuthenticationError(XiaomiCloudError):
    """A local Xiaomi bootstrap authentication step failed safely."""


class XiaomiCredentialsRejected(XiaomiBootstrapAuthenticationError):
    """Xiaomi explicitly rejected the supplied account credentials."""


class XiaomiVerificationRequired(XiaomiBootstrapAuthenticationError):
    """Xiaomi requires a one-time SMS or email verification code."""

    def __init__(self, url: str, safe_display: str) -> None:
        self.url = url
        self.safe_display = safe_display
        super().__init__(f"Xiaomi account verification required at {safe_display}")


class XiaomiVerificationRejected(XiaomiBootstrapAuthenticationError):
    """Xiaomi rejected or expired a one-time verification code."""


class XiaomiInvalidVerificationUrl(XiaomiBootstrapAuthenticationError):
    """A verification response did not point to Xiaomi's exact HTTPS origin."""


class XiaomiVerificationOpenError(XiaomiBootstrapAuthenticationError):
    """The official verification page could not be opened safely."""


class XiaomiImageCaptchaRequired(XiaomiBootstrapAuthenticationError):
    """Xiaomi requested an image captcha, which this bootstrap does not handle."""


class XiaomiAuthenticationNetworkError(XiaomiBootstrapAuthenticationError):
    """A network error interrupted Xiaomi authentication."""


def validate_verification_url(value: str) -> tuple[str, str]:
    """Return the usable URL and a query-free display form after strict validation."""

    full_url = urljoin(f"{ACCOUNT_ORIGIN}/", value)
    parsed = urlparse(full_url)
    if (
        parsed.scheme != "https"
        or parsed.netloc != "account.xiaomi.com"
        or not parsed.path.startswith("/")
    ):
        raise XiaomiInvalidVerificationUrl(
            "Xiaomi returned an invalid account verification address"
        )
    safe_display = urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", ""))
    return full_url, safe_display


def _decode_response(response: Any) -> dict[str, Any]:
    try:
        value = json.loads(str(response.text).replace("&&&START&&&", ""))
    except (TypeError, ValueError) as exc:
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi authentication returned an unreadable response"
        ) from exc
    if not isinstance(value, dict):
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi authentication returned an invalid response"
        )
    return value


def _cookie(response: Any, name: str) -> str | None:
    cookies = getattr(response, "cookies", None)
    return _cookie_from_jar(cookies, name)


def _cookie_from_jar(cookies: Any, name: str) -> str | None:
    if cookies is None:
        return None
    try:
        value = cookies.get(name)
    except requests.cookies.CookieConflictError:
        value = None
        for cookie in cookies:
            if getattr(cookie, "name", None) == name:
                value = getattr(cookie, "value", None)
    return str(value) if value else None


def _default_client_factory(*, username: str, password: str) -> Any:
    try:
        from micloud import MiCloud
    except ImportError as exc:
        raise XiaomiBootstrapAuthenticationError(
            "micloud is not installed; run pip install -r collector/requirements.txt"
        ) from exc
    return MiCloud(username=username, password=password)


def _default_browser_open(url: str) -> bool:
    return webbrowser.open(url, new=2)


class XiaomiBootstrapAuthenticator:
    """Perform password and optional verification steps in one HTTP session."""

    def __init__(self, client: Any) -> None:
        self.client = client
        self._verification_url: str | None = None

    def begin_login(self) -> Any:
        try:
            self.client._init_session()
            sign = self.client._login_step1()
            location = sign if str(sign).startswith("http") else self._password_step(sign)
            return self._finish_location(location)
        except XiaomiBootstrapAuthenticationError:
            raise
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            raise XiaomiAuthenticationNetworkError(
                "Xiaomi authentication could not reach the account service"
            ) from exc
        except Exception as exc:
            raise XiaomiBootstrapAuthenticationError(
                "Xiaomi authentication failed"
            ) from exc

    def _password_step(self, sign: str) -> str:
        password = getattr(self.client, "password", None)
        username = getattr(self.client, "username", None)
        if not username or not password:
            raise XiaomiCredentialsRejected("Xiaomi account or password is blank")

        post_data = {
            "sid": "xiaomiio",
            "hash": hashlib.md5(password.encode()).hexdigest().upper(),
            "callback": "https://sts.api.io.mi.com/sts",
            "qs": "%3Fsid%3Dxiaomiio%26_json%3Dtrue",
            "user": username,
            "_json": "true",
        }
        if sign:
            post_data["_sign"] = sign
        response = self.client.session.post(PASSWORD_LOGIN_URL, data=post_data)
        auth = _decode_response(response)
        self._hydrate_session_fields(auth)

        location = auth.get("location")
        if isinstance(location, str) and location:
            return location

        notification_url = auth.get("notificationUrl")
        if isinstance(notification_url, str) and notification_url:
            full_url, safe_display = validate_verification_url(notification_url)
            self._verification_url = full_url
            raise XiaomiVerificationRequired(full_url, safe_display)

        if auth.get("captchaUrl"):
            raise XiaomiImageCaptchaRequired(
                "Xiaomi requested an image captcha; this bootstrap does not expose it"
            )

        if auth.get("code") in (20003, 70002, 70016):
            raise XiaomiCredentialsRejected(
                "Xiaomi rejected the account identifier or password"
            )
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi rejected the login without a supported verification method"
        )

    def complete_verification(self, ticket: str) -> Any:
        if not self._verification_url:
            raise XiaomiVerificationRejected(
                "Xiaomi verification session is no longer available"
            )
        if not ticket.strip():
            raise XiaomiVerificationRejected("Xiaomi verification code was blank")

        try:
            options, identity_session = self._identity_options()
            last_code: Any = None
            for flag in options:
                endpoint = {
                    4: f"{ACCOUNT_ORIGIN}/identity/auth/verifyPhone",
                    8: f"{ACCOUNT_ORIGIN}/identity/auth/verifyEmail",
                }.get(flag)
                if not endpoint:
                    continue
                response = self.client.session.post(
                    endpoint,
                    params={"_dc": int(time.time() * 1000)},
                    data={
                        "_flag": flag,
                        "ticket": ticket.strip(),
                        "trust": "false",
                        "_json": "true",
                    },
                    cookies={"identity_session": identity_session},
                )
                result = _decode_response(response)
                last_code = result.get("code")
                if last_code != 0:
                    continue
                self._hydrate_session_fields(result)
                location = result.get("location")
                if not isinstance(location, str) or not location:
                    raise XiaomiVerificationRejected(
                        "Xiaomi verification did not complete the login"
                    )
                return self._finish_location(location)
        except XiaomiBootstrapAuthenticationError:
            raise
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            raise XiaomiAuthenticationNetworkError(
                "Xiaomi verification could not reach the account service"
            ) from exc
        except Exception as exc:
            raise XiaomiVerificationRejected(
                "Xiaomi verification could not be completed"
            ) from exc

        if last_code is not None:
            raise XiaomiVerificationRejected(
                "Xiaomi rejected or expired the verification code"
            )
        raise XiaomiVerificationRejected(
            "Xiaomi did not offer SMS or email verification"
        )

    def _identity_options(self) -> tuple[list[int], str]:
        full_url, _safe_display = validate_verification_url(self._verification_url or "")
        parsed = urlparse(full_url)
        marker = "/fe/service/identity/authStart"
        if marker not in parsed.path:
            raise XiaomiVerificationRejected(
                "Xiaomi returned an unsupported verification flow"
            )
        identity_path = parsed.path.replace(marker, "/identity/list", 1)
        identity_url = urlunparse(
            (parsed.scheme, parsed.netloc, identity_path, "", parsed.query, "")
        )
        response = self.client.session.get(identity_url)
        identity_session = _cookie(response, "identity_session")
        if not identity_session:
            raise XiaomiVerificationRejected(
                "Xiaomi verification session expired before code submission"
            )
        result = _decode_response(response)
        raw_options = result.get("options") or [result.get("flag", 4)]
        if not isinstance(raw_options, list):
            raw_options = [raw_options]
        options: list[int] = []
        for value in raw_options:
            try:
                options.append(int(value))
            except (TypeError, ValueError):
                continue
        return options, identity_session

    def _hydrate_session_fields(self, values: dict[str, Any]) -> None:
        mapping = {
            "user_id": "userId",
            "cuser_id": "cUserId",
            "ssecurity": "ssecurity",
            "pass_token": "passToken",
        }
        for attribute, key in mapping.items():
            value = values.get(key)
            if value is not None:
                setattr(self.client, attribute, str(value))

    def _finish_location(self, location: str) -> Any:
        parsed = urlparse(location)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_LOGIN_RESULT_HOSTS:
            raise XiaomiBootstrapAuthenticationError(
                "Xiaomi returned an invalid login completion address"
            )
        response = self.client.session.get(location, allow_redirects=True)
        if getattr(response, "status_code", None) == 403:
            raise XiaomiCredentialsRejected("Xiaomi rejected the completed login")

        service_token = _cookie(response, "serviceToken")
        if not service_token:
            session_cookies = getattr(self.client.session, "cookies", {})
            service_token = _cookie_from_jar(session_cookies, "serviceToken")
        if not service_token:
            raise XiaomiBootstrapAuthenticationError(
                "Xiaomi completed verification without returning a cloud session"
            )
        self.client.service_token = service_token
        user_id = _cookie(response, "userId")
        if user_id:
            self.client.user_id = user_id
        return self.client


def login_interactive(
    username: str,
    password: str,
    *,
    client_factory: Callable[..., Any] = _default_client_factory,
    browser_open: Callable[[str], bool] = _default_browser_open,
    verification_prompt: Callable[[str], str] = getpass.getpass,
    print_fn: Callable[[str], None] = print,
) -> Any:
    """Log in locally, handling a supported Xiaomi verification challenge once."""

    client = client_factory(username=username, password=password)
    authenticator = XiaomiBootstrapAuthenticator(client)
    try:
        return authenticator.begin_login()
    except XiaomiVerificationRequired as required:
        print_fn("Xiaomi requires SMS or email account verification.")
        print_fn(f"Opening official verification page: {required.safe_display}")
        if not browser_open(required.url):
            raise XiaomiVerificationOpenError(
                "Could not open the official Xiaomi verification page"
            ) from None
        code = verification_prompt("Xiaomi one-time verification code: ")
        return authenticator.complete_verification(code)
