from __future__ import annotations

import json

import pytest

from collector.environment_collector.xiaomi_auth import (
    XiaomiBootstrapAuthenticator,
    XiaomiCredentialsRejected,
    XiaomiImageCaptchaRequired,
    XiaomiInvalidVerificationUrl,
    XiaomiVerificationOpenError,
    XiaomiVerificationRequired,
    login_interactive,
    validate_verification_url,
)


class FakeResponse:
    def __init__(
        self,
        payload: dict | None = None,
        *,
        status_code: int = 200,
        cookies: dict[str, str] | None = None,
        url: str = "https://account.xiaomi.com/",
    ) -> None:
        self.text = "&&&START&&&" + json.dumps(payload or {})
        self.status_code = status_code
        self.cookies = cookies or {}
        self.url = url
        self.reason = "OK"


class FakeSession:
    def __init__(self, password_response: dict) -> None:
        self.password_response = password_response
        self.cookies: dict[str, str] = {}
        self.posts: list[tuple[str, dict]] = []
        self.gets: list[str] = []

    def post(self, url: str, **kwargs):
        self.posts.append((url, kwargs))
        if url.endswith("/pass/serviceLoginAuth2"):
            return FakeResponse(self.password_response)
        if url.endswith("/identity/auth/verifyPhone"):
            return FakeResponse(
                {"code": 0, "location": "https://sts.api.io.mi.com/sts/verified"}
            )
        raise AssertionError(f"unexpected POST {url}")

    def get(self, url: str, **kwargs):
        self.gets.append(url)
        if "/identity/list" in url:
            return FakeResponse(
                {"flag": 4, "options": [4]},
                cookies={"identity_session": "identity-session-secret"},
            )
        if url in {
            "https://sts.api.io.mi.com/sts/normal",
            "https://sts.api.io.mi.com/sts/verified",
        }:
            return FakeResponse(
                status_code=200,
                cookies={"serviceToken": "service-token-secret", "userId": "12345"},
                url=url,
            )
        raise AssertionError(f"unexpected GET {url}")


class FakeCloud:
    def __init__(self, password_response: dict) -> None:
        self.username = "12345"
        self.password = "password-secret"
        self.user_id = None
        self.service_token = None
        self.ssecurity = None
        self.cuser_id = None
        self.pass_token = None
        self.session = FakeSession(password_response)

    def _init_session(self) -> None:
        pass

    def _login_step1(self) -> str:
        return "sign-secret"


def verification_response(url: str) -> dict:
    return {
        "result": "failed",
        "code": 81003,
        "notificationUrl": url,
    }


def test_verification_url_must_use_exact_xiaomi_https_origin() -> None:
    full_url, safe_display = validate_verification_url(
        "https://account.xiaomi.com/fe/service/identity/authStart?token=challenge-secret"
    )

    assert full_url.endswith("token=challenge-secret")
    assert safe_display == "https://account.xiaomi.com/fe/service/identity/authStart"
    assert "challenge-secret" not in safe_display

    rejected = [
        "http://account.xiaomi.com/fe/service/identity/authStart",
        "https://account.xiaomi.com.evil.example/fe/service/identity/authStart",
        "https://account.xiaomi.com:444/fe/service/identity/authStart",
        "https://user@account.xiaomi.com/fe/service/identity/authStart",
    ]
    for url in rejected:
        with pytest.raises(XiaomiInvalidVerificationUrl):
            validate_verification_url(url)


def test_password_login_surfaces_verification_without_logging_response() -> None:
    url = (
        "https://account.xiaomi.com/fe/service/identity/authStart"
        "?token=challenge-secret"
    )
    cloud = FakeCloud(verification_response(url))
    auth = XiaomiBootstrapAuthenticator(cloud)

    with pytest.raises(XiaomiVerificationRequired) as caught:
        auth.begin_login()

    assert caught.value.url == url
    assert caught.value.safe_display.endswith("/fe/service/identity/authStart")
    assert "challenge-secret" not in str(caught.value)


def test_standard_password_login_still_returns_complete_cloud_client() -> None:
    cloud = FakeCloud(
        {
            "result": "ok",
            "code": 0,
            "location": "https://sts.api.io.mi.com/sts/normal",
            "userId": "12345",
            "cUserId": "c-user-secret",
            "ssecurity": "ssecurity-secret",
            "passToken": "pass-token-secret",
        }
    )

    result = XiaomiBootstrapAuthenticator(cloud).begin_login()

    assert result is cloud
    assert result.user_id == "12345"
    assert result.ssecurity == "ssecurity-secret"
    assert result.service_token == "service-token-secret"


def test_password_login_classifies_credentials_and_image_captcha() -> None:
    rejected = FakeCloud({"result": "failed", "code": 70016})
    with pytest.raises(XiaomiCredentialsRejected):
        XiaomiBootstrapAuthenticator(rejected).begin_login()

    captcha = FakeCloud(
        {
            "result": "failed",
            "code": 87001,
            "captchaUrl": "/pass/getCode?ick=captcha-secret",
        }
    )
    with pytest.raises(XiaomiImageCaptchaRequired) as caught:
        XiaomiBootstrapAuthenticator(captcha).begin_login()
    assert "captcha-secret" not in str(caught.value)


def test_verification_code_completes_login_in_the_same_session() -> None:
    url = (
        "https://account.xiaomi.com/fe/service/identity/authStart"
        "?token=challenge-secret"
    )
    cloud = FakeCloud(verification_response(url))
    auth = XiaomiBootstrapAuthenticator(cloud)
    with pytest.raises(XiaomiVerificationRequired):
        auth.begin_login()

    result = auth.complete_verification("246810")

    assert result is cloud
    assert result.service_token == "service-token-secret"
    verify_url, verify_kwargs = cloud.session.posts[-1]
    assert verify_url == "https://account.xiaomi.com/identity/auth/verifyPhone"
    assert verify_kwargs["data"]["ticket"] == "246810"
    assert verify_kwargs["cookies"] == {
        "identity_session": "identity-session-secret"
    }


def test_interactive_login_opens_full_url_but_prints_only_safe_path() -> None:
    url = (
        "https://account.xiaomi.com/fe/service/identity/authStart"
        "?token=challenge-secret"
    )
    cloud = FakeCloud(verification_response(url))
    opened: list[str] = []
    messages: list[str] = []

    result = login_interactive(
        "12345",
        "password-secret",
        client_factory=lambda **_kwargs: cloud,
        browser_open=lambda value: opened.append(value) or True,
        verification_prompt=lambda _prompt: "246810",
        print_fn=messages.append,
    )

    output = "\n".join(messages)
    assert result is cloud
    assert opened == [url]
    assert "https://account.xiaomi.com/fe/service/identity/authStart" in output
    for secret in (
        "challenge-secret",
        "password-secret",
        "246810",
        "service-token-secret",
    ):
        assert secret not in output


def test_interactive_login_stops_when_official_page_cannot_be_opened() -> None:
    url = (
        "https://account.xiaomi.com/fe/service/identity/authStart"
        "?token=challenge-secret"
    )
    cloud = FakeCloud(verification_response(url))

    with pytest.raises(XiaomiVerificationOpenError) as caught:
        login_interactive(
            "12345",
            "password-secret",
            client_factory=lambda **_kwargs: cloud,
            browser_open=lambda _value: False,
            verification_prompt=lambda _prompt: pytest.fail(
                "verification must not be prompted after browser failure"
            ),
            print_fn=lambda _message: None,
        )

    assert "challenge-secret" not in str(caught.value)
