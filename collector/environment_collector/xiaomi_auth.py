"""Interactive, secret-safe Xiaomi bootstrap authentication."""

from __future__ import annotations

import atexit
import getpass
import hashlib
import json
import os
import tempfile
import time
import webbrowser
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse

import requests

from .xiaomi_cloud import XiaomiCloudError


ACCOUNT_ORIGIN = "https://account.xiaomi.com"
SERVICE_LOGIN_URL = f"{ACCOUNT_ORIGIN}/pass/serviceLogin"
PASSWORD_LOGIN_URL = f"{ACCOUNT_ORIGIN}/pass/serviceLoginAuth2"
ALLOWED_LOGIN_RESULT_HOSTS = frozenset({"account.xiaomi.com", "sts.api.io.mi.com"})
MAX_BROWSER_RESPONSE_BYTES = 64 * 1024
MAX_CAPTCHA_BYTES = 1024 * 1024
ALLOWED_CAPTCHA_MEDIA_TYPES = frozenset(
    {"image/gif", "image/jpeg", "image/png", "image/webp"}
)
CAPTCHA_MEDIA_TYPE_ALIASES = {
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
}


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
    """Xiaomi requires one locally displayed image captcha."""

    def __init__(self, *, image: bytes, media_type: str) -> None:
        self.image = image
        self.media_type = media_type
        super().__init__("Xiaomi requires an image captcha")


class XiaomiImageCaptchaRejected(XiaomiBootstrapAuthenticationError):
    """Xiaomi rejected, expired, or repeated an image captcha challenge."""


class XiaomiInvalidCaptchaImage(XiaomiBootstrapAuthenticationError):
    """The captcha response was missing, too large, or not an image."""


class XiaomiCaptchaOpenError(XiaomiBootstrapAuthenticationError):
    """The temporary captcha image could not be opened locally."""


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


def _default_client_factory(
    *, username: str | None = None, password: str | None = None
) -> Any:
    try:
        from micloud import MiCloud
    except ImportError as exc:
        raise XiaomiBootstrapAuthenticationError(
            "micloud is not installed; run pip install -r collector/requirements.txt"
        ) from exc
    return MiCloud(username=username, password=password)


def _default_browser_open(url: str) -> bool:
    return webbrowser.open(url, new=2)


def _validate_login_completion_url(value: str) -> str:
    try:
        parsed = urlparse(value)
        port = parsed.port
    except (TypeError, ValueError) as exc:
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi returned an invalid login completion address"
        ) from exc
    if (
        value != value.strip()
        or any(character in value for character in "\r\n\t")
        or parsed.scheme != "https"
        or parsed.hostname not in ALLOWED_LOGIN_RESULT_HOSTS
        or parsed.username is not None
        or parsed.password is not None
        or port not in (None, 443)
        or not parsed.path.startswith("/")
        or parsed.fragment
    ):
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi returned an invalid login completion address"
        )
    return value


def _detect_supported_image_media_type(content: bytes) -> str | None:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if (
        len(content) >= 12
        and content.startswith(b"RIFF")
        and content[8:12] == b"WEBP"
    ):
        return "image/webp"
    return None


def _remove_temp_file(path: Path) -> bool:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        return False
    return True


def solve_image_captcha(
    challenge: XiaomiImageCaptchaRequired,
    *,
    browser_open: Callable[[str], bool] = _default_browser_open,
    captcha_prompt: Callable[[str], str] = getpass.getpass,
    print_fn: Callable[[str], None] = print,
    temp_directory: Path | None = None,
) -> str:
    """Show a captcha from a randomized temporary file and always clean it up."""

    suffixes = {
        "image/gif": ".gif",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    suffix = suffixes.get(challenge.media_type, ".jpg")
    descriptor, raw_path = tempfile.mkstemp(
        prefix="xiaomi-captcha-",
        suffix=suffix,
        dir=temp_directory,
    )
    path = Path(raw_path)
    try:
        with os.fdopen(descriptor, "wb") as image_file:
            image_file.write(challenge.image)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass

        print_fn("Opening the Xiaomi image captcha in the default viewer.")
        if not browser_open(path.resolve().as_uri()):
            raise XiaomiCaptchaOpenError(
                "Could not open the temporary Xiaomi captcha image"
            )
        return captcha_prompt("Xiaomi image captcha characters: ")
    finally:
        if not _remove_temp_file(path):
            atexit.register(_remove_temp_file, path)
            print_fn(
                "Warning: the temporary captcha image is in use; "
                "cleanup will be retried when bootstrap exits."
            )


class XiaomiBootstrapAuthenticator:
    """Perform password and optional verification steps in one HTTP session."""

    def __init__(self, client: Any) -> None:
        self.client = client
        self._verification_url: str | None = None
        self._password_sign: str | None = None
        self._captcha_cookie: str | None = None
        self._captcha_attempted = False

    def begin_login(self) -> Any:
        try:
            self.client._init_session()
            sign = self.client._login_step1()
            self._password_sign = str(sign)
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

    def _password_step(
        self,
        sign: str,
        *,
        captcha: str | None = None,
        captcha_cookie: str | None = None,
    ) -> str:
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
        params: dict[str, Any] = {}
        cookies: dict[str, str] = {}
        if captcha is not None:
            post_data["captCode"] = captcha
            params["_dc"] = int(time.time() * 1000)
            if captcha_cookie:
                cookies["ick"] = captcha_cookie
        response = self.client.session.post(
            PASSWORD_LOGIN_URL,
            data=post_data,
            params=params,
            cookies=cookies,
        )
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

        captcha_url = auth.get("captchaUrl")
        if isinstance(captcha_url, str) and captcha_url:
            if self._captcha_attempted:
                raise XiaomiImageCaptchaRejected(
                    "Xiaomi rejected or repeated the image captcha"
                )
            image, media_type, captcha_cookie = self._fetch_captcha(captcha_url)
            self._captcha_cookie = captcha_cookie
            raise XiaomiImageCaptchaRequired(image=image, media_type=media_type)

        if auth.get("code") in (20003, 70002, 70016):
            raise XiaomiCredentialsRejected(
                "Xiaomi rejected the account identifier or password"
            )
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi rejected the login without a supported verification method"
        )

    def _fetch_captcha(self, value: str) -> tuple[bytes, str, str]:
        full_url, _safe_display = validate_verification_url(value)
        response = self.client.session.get(full_url)
        if getattr(response, "status_code", None) != 200:
            raise XiaomiInvalidCaptchaImage(
                "Xiaomi captcha image request was not successful"
            )
        headers = getattr(response, "headers", {})
        raw_media_type = headers.get("Content-Type") or headers.get("content-type")
        media_type = str(raw_media_type or "").split(";", 1)[0].strip().lower()
        media_type = CAPTCHA_MEDIA_TYPE_ALIASES.get(media_type, media_type)
        content = getattr(response, "content", None)
        if not isinstance(content, (bytes, bytearray)) or not content:
            raise XiaomiInvalidCaptchaImage(
                "Xiaomi captcha response contained no image bytes"
            )
        if len(content) > MAX_CAPTCHA_BYTES:
            raise XiaomiInvalidCaptchaImage(
                f"Xiaomi captcha image exceeded {MAX_CAPTCHA_BYTES} bytes "
                f"(received {len(content)})"
            )
        detected_media_type = _detect_supported_image_media_type(bytes(content))
        if media_type in ("", "application/octet-stream"):
            if detected_media_type is None:
                raise XiaomiInvalidCaptchaImage(
                    "Xiaomi untyped captcha content did not have a supported "
                    "image signature"
                )
            media_type = detected_media_type
        if media_type not in ALLOWED_CAPTCHA_MEDIA_TYPES:
            if media_type.startswith("image/"):
                raise XiaomiInvalidCaptchaImage(
                    "Xiaomi captcha response used an unsupported image media type"
                )
            raise XiaomiInvalidCaptchaImage(
                "Xiaomi captcha response used a non-image media type"
            )
        if detected_media_type != media_type:
            raise XiaomiInvalidCaptchaImage(
                "Xiaomi captcha media type and image signature did not match"
            )
        captcha_cookie = _cookie(response, "ick")
        if not captcha_cookie:
            session_cookies = getattr(self.client.session, "cookies", {})
            captcha_cookie = _cookie_from_jar(session_cookies, "ick")
        if not captcha_cookie:
            raise XiaomiInvalidCaptchaImage(
                "Xiaomi captcha response did not include a challenge session"
            )
        return bytes(content), media_type, captcha_cookie

    def complete_captcha(self, value: str) -> Any:
        if self._captcha_attempted:
            raise XiaomiImageCaptchaRejected(
                "Only one Xiaomi image captcha attempt is allowed"
            )
        if self._password_sign is None or not self._captcha_cookie:
            raise XiaomiImageCaptchaRejected(
                "Xiaomi image captcha session is no longer available"
            )
        if not value.strip():
            raise XiaomiImageCaptchaRejected("Xiaomi image captcha was blank")

        self._captcha_attempted = True
        try:
            location = self._password_step(
                self._password_sign,
                captcha=value.strip(),
                captcha_cookie=self._captcha_cookie,
            )
            return self._finish_location(location)
        except XiaomiBootstrapAuthenticationError:
            raise
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            raise XiaomiAuthenticationNetworkError(
                "Xiaomi image captcha submission could not reach the account service"
            ) from exc
        except Exception as exc:
            raise XiaomiImageCaptchaRejected(
                "Xiaomi image captcha could not be submitted"
            ) from exc

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
        location = _validate_login_completion_url(location)
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
        if not getattr(self.client, "user_id", None) or not getattr(
            self.client, "ssecurity", None
        ):
            self._refresh_session_material()
        return self.client

    def _refresh_session_material(self) -> None:
        try:
            response = self.client.session.get(
                SERVICE_LOGIN_URL,
                params={"sid": "xiaomiio", "_json": "true"},
            )
            self._hydrate_session_fields(_decode_response(response))
        except XiaomiBootstrapAuthenticationError:
            raise
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            raise XiaomiAuthenticationNetworkError(
                "Xiaomi session material refresh could not reach the account service"
            ) from exc
        except Exception as exc:
            raise XiaomiBootstrapAuthenticationError(
                "Xiaomi session material could not be refreshed"
            ) from exc


def _parse_browser_service_response(raw_response: str) -> tuple[str, str, str]:
    if not isinstance(raw_response, str):
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi browser response must be text"
        )
    size = len(raw_response.encode("utf-8"))
    if size > MAX_BROWSER_RESPONSE_BYTES:
        raise XiaomiBootstrapAuthenticationError(
            f"Xiaomi browser response exceeded {MAX_BROWSER_RESPONSE_BYTES} bytes"
        )
    response = raw_response.strip()
    prefix = "&&&START&&&"
    if response.startswith(prefix):
        body = response[len(prefix) :]
    elif response.startswith("{"):
        body = response
    else:
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi browser response was not an official JSON object"
        )
    try:
        values = json.loads(body)
    except (TypeError, ValueError) as exc:
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi browser response could not be parsed"
        ) from exc
    if not isinstance(values, dict):
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi browser response could not be parsed"
        )
    if values.get("code") != 0:
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi browser response was not authenticated"
        )

    user_id = values.get("userId")
    ssecurity = values.get("ssecurity")
    location = values.get("location")
    missing: list[str] = []
    if isinstance(user_id, bool) or not isinstance(user_id, (str, int)) or not str(
        user_id
    ).strip():
        missing.append("userId")
    if not isinstance(ssecurity, str) or not ssecurity.strip():
        missing.append("ssecurity")
    if not isinstance(location, str) or not location.strip():
        missing.append("location")
    if missing:
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi browser response missing: " + ", ".join(missing)
        )
    return str(user_id), ssecurity, _validate_login_completion_url(location)


def login_from_browser_response(
    raw_response: str,
    *,
    client_factory: Callable[..., Any] = _default_client_factory,
) -> Any:
    """Exchange one official browser service-login response for cloud session data."""

    user_id, ssecurity, location = _parse_browser_service_response(raw_response)
    client = client_factory(username=None, password=None)
    client.user_id = user_id
    client.ssecurity = ssecurity
    client.pass_token = None
    client._init_session()
    authenticator = XiaomiBootstrapAuthenticator(client)
    try:
        return authenticator._finish_location(location)
    except XiaomiBootstrapAuthenticationError:
        raise
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
        raise XiaomiAuthenticationNetworkError(
            "Xiaomi browser session exchange could not reach the account service"
        ) from exc
    except Exception as exc:
        raise XiaomiBootstrapAuthenticationError(
            "Xiaomi browser session exchange failed"
        ) from exc


def login_interactive(
    username: str,
    password: str,
    *,
    client_factory: Callable[..., Any] = _default_client_factory,
    captcha_solver: Callable[[XiaomiImageCaptchaRequired], str] | None = None,
    browser_open: Callable[[str], bool] = _default_browser_open,
    verification_prompt: Callable[[str], str] = getpass.getpass,
    print_fn: Callable[[str], None] = print,
) -> Any:
    """Log in locally, handling a supported Xiaomi verification challenge once."""

    client = client_factory(username=username, password=password)
    authenticator = XiaomiBootstrapAuthenticator(client)
    try:
        return authenticator.begin_login()
    except XiaomiImageCaptchaRequired as required:
        print_fn("Xiaomi requires one image captcha before account verification.")
        solver = captcha_solver
        if solver is None:
            code = solve_image_captcha(
                required,
                browser_open=browser_open,
                print_fn=print_fn,
            )
        else:
            code = solver(required)
        try:
            return authenticator.complete_captcha(code)
        except XiaomiVerificationRequired as verification:
            return _complete_interactive_verification(
                authenticator,
                verification,
                browser_open=browser_open,
                verification_prompt=verification_prompt,
                print_fn=print_fn,
            )
    except XiaomiVerificationRequired as required:
        return _complete_interactive_verification(
            authenticator,
            required,
            browser_open=browser_open,
            verification_prompt=verification_prompt,
            print_fn=print_fn,
        )


def _complete_interactive_verification(
    authenticator: XiaomiBootstrapAuthenticator,
    required: XiaomiVerificationRequired,
    *,
    browser_open: Callable[[str], bool],
    verification_prompt: Callable[[str], str],
    print_fn: Callable[[str], None],
) -> Any:
    print_fn("Xiaomi requires SMS or email account verification.")
    print_fn(f"Opening official verification page: {required.safe_display}")
    if not browser_open(required.url):
        raise XiaomiVerificationOpenError(
            "Could not open the official Xiaomi verification page"
        ) from None
    code = verification_prompt("Xiaomi one-time verification code: ")
    return authenticator.complete_verification(code)
