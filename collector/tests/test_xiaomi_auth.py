from __future__ import annotations

import json

import pytest

import collector.environment_collector.xiaomi_auth as xiaomi_auth

from collector.environment_collector.xiaomi_auth import (
    MAX_CAPTCHA_BYTES,
    XiaomiBootstrapAuthenticator,
    XiaomiCaptchaOpenError,
    XiaomiCredentialsRejected,
    XiaomiImageCaptchaRequired,
    XiaomiImageCaptchaRejected,
    XiaomiInvalidCaptchaImage,
    XiaomiInvalidVerificationUrl,
    XiaomiVerificationOpenError,
    XiaomiVerificationRequired,
    login_interactive,
    solve_image_captcha,
    validate_verification_url,
)


class FakeResponse:
    def __init__(
        self,
        payload: dict | None = None,
        *,
        status_code: int = 200,
        cookies: dict[str, str] | None = None,
        content: bytes | None = None,
        content_type: str = "application/json",
        url: str = "https://account.xiaomi.com/",
    ) -> None:
        self.text = "&&&START&&&" + json.dumps(payload or {})
        self.content = content if content is not None else self.text.encode()
        self.status_code = status_code
        self.cookies = cookies or {}
        self.headers = {"Content-Type": content_type}
        self.url = url
        self.reason = "OK"


class FakeSession:
    def __init__(
        self,
        password_response: dict | list[dict],
        *,
        captcha_content: bytes = b"\xff\xd8\xffcaptcha-image",
        captcha_content_type: str = "image/jpeg",
    ) -> None:
        self.password_responses = (
            list(password_response)
            if isinstance(password_response, list)
            else [password_response]
        )
        self.captcha_content = captcha_content
        self.captcha_content_type = captcha_content_type
        self.cookies: dict[str, str] = {}
        self.posts: list[tuple[str, dict]] = []
        self.gets: list[str] = []

    def post(self, url: str, **kwargs):
        self.posts.append((url, kwargs))
        if url.endswith("/pass/serviceLoginAuth2"):
            if not self.password_responses:
                raise AssertionError("unexpected extra password login")
            return FakeResponse(self.password_responses.pop(0))
        if url.endswith("/identity/auth/verifyPhone"):
            return FakeResponse(
                {"code": 0, "location": "https://sts.api.io.mi.com/sts/verified"}
            )
        raise AssertionError(f"unexpected POST {url}")

    def get(self, url: str, **kwargs):
        self.gets.append(url)
        if "/pass/getCode" in url:
            return FakeResponse(
                content=self.captcha_content,
                content_type=self.captcha_content_type,
                cookies={"ick": "captcha-cookie-secret"},
                url=url,
            )
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
    def __init__(
        self,
        password_response: dict | list[dict],
        **session_kwargs,
    ) -> None:
        self.username = "12345"
        self.password = "password-secret"
        self.user_id = None
        self.service_token = None
        self.ssecurity = None
        self.cuser_id = None
        self.pass_token = None
        self.session = FakeSession(password_response, **session_kwargs)

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


def captcha_response(url: str = "/pass/getCode?ick=captcha-secret") -> dict:
    return {
        "result": "failed",
        "code": 87001,
        "captchaUrl": url,
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

    captcha = FakeCloud(captcha_response())
    with pytest.raises(XiaomiImageCaptchaRequired) as caught:
        XiaomiBootstrapAuthenticator(captcha).begin_login()
    assert caught.value.image == b"\xff\xd8\xffcaptcha-image"
    assert "captcha-secret" not in str(caught.value)


def test_captcha_requires_exact_xiaomi_image_response() -> None:
    invalid_url = FakeCloud(captcha_response("https://evil.example/captcha.jpg"))
    with pytest.raises(XiaomiInvalidVerificationUrl):
        XiaomiBootstrapAuthenticator(invalid_url).begin_login()

    html = FakeCloud(
        captcha_response(),
        captcha_content=b"<html>not an image</html>",
        captcha_content_type="text/html",
    )
    with pytest.raises(XiaomiInvalidCaptchaImage, match="non-image media type"):
        XiaomiBootstrapAuthenticator(html).begin_login()

    disguised_html = FakeCloud(
        captcha_response(),
        captcha_content=b"<html>mislabeled</html>",
        captcha_content_type="image/jpeg",
    )
    with pytest.raises(XiaomiInvalidCaptchaImage, match="signature did not match"):
        XiaomiBootstrapAuthenticator(disguised_html).begin_login()

    svg = FakeCloud(
        captcha_response(),
        captcha_content=b"<svg><script/></svg>",
        captcha_content_type="image/svg+xml",
    )
    with pytest.raises(XiaomiInvalidCaptchaImage, match="unsupported image media type"):
        XiaomiBootstrapAuthenticator(svg).begin_login()

    oversized = FakeCloud(
        captcha_response(),
        captcha_content=b"x" * (MAX_CAPTCHA_BYTES + 1),
    )
    with pytest.raises(XiaomiInvalidCaptchaImage, match="exceeded 1048576 bytes"):
        XiaomiBootstrapAuthenticator(oversized).begin_login()


@pytest.mark.parametrize("media_type", ["image/jpg", "image/pjpeg"])
def test_captcha_accepts_safe_jpeg_media_type_aliases(media_type: str) -> None:
    cloud = FakeCloud(captcha_response(), captcha_content_type=media_type)

    with pytest.raises(XiaomiImageCaptchaRequired) as caught:
        XiaomiBootstrapAuthenticator(cloud).begin_login()

    assert caught.value.media_type == "image/jpeg"


def test_captcha_code_reuses_session_and_can_continue_to_sms_verification() -> None:
    verify_url = (
        "https://account.xiaomi.com/fe/service/identity/authStart"
        "?token=challenge-secret"
    )
    cloud = FakeCloud([captcha_response(), verification_response(verify_url)])
    auth = XiaomiBootstrapAuthenticator(cloud)
    with pytest.raises(XiaomiImageCaptchaRequired):
        auth.begin_login()

    with pytest.raises(XiaomiVerificationRequired):
        auth.complete_captcha("ABCD")

    password_url, password_kwargs = cloud.session.posts[1]
    assert password_url.endswith("/pass/serviceLoginAuth2")
    assert password_kwargs["data"]["captCode"] == "ABCD"
    assert password_kwargs["cookies"] == {"ick": "captcha-cookie-secret"}
    assert "_dc" in password_kwargs["params"]


def test_second_image_captcha_stops_without_another_attempt() -> None:
    cloud = FakeCloud([captcha_response(), captcha_response()])
    auth = XiaomiBootstrapAuthenticator(cloud)
    with pytest.raises(XiaomiImageCaptchaRequired):
        auth.begin_login()

    with pytest.raises(XiaomiImageCaptchaRejected):
        auth.complete_captcha("WRONG")

    assert len(cloud.session.posts) == 2


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


def test_interactive_login_handles_image_then_sms_without_logging_secrets() -> None:
    verify_url = (
        "https://account.xiaomi.com/fe/service/identity/authStart"
        "?token=challenge-secret"
    )
    cloud = FakeCloud([captcha_response(), verification_response(verify_url)])
    messages: list[str] = []
    seen_images: list[bytes] = []

    result = login_interactive(
        "12345",
        "password-secret",
        client_factory=lambda **_kwargs: cloud,
        captcha_solver=lambda challenge: seen_images.append(challenge.image) or "ABCD",
        browser_open=lambda _value: True,
        verification_prompt=lambda _prompt: "246810",
        print_fn=messages.append,
    )

    output = "\n".join(messages)
    assert result is cloud
    assert seen_images == [b"\xff\xd8\xffcaptcha-image"]
    for secret in (
        "captcha-secret",
        "captcha-cookie-secret",
        "ABCD",
        "challenge-secret",
        "246810",
        "service-token-secret",
    ):
        assert secret not in output


@pytest.mark.parametrize("prompt_fails", [False, True])
def test_captcha_temp_file_is_removed_on_every_prompt_path(
    tmp_path, prompt_fails: bool
) -> None:
    challenge = XiaomiImageCaptchaRequired(
        image=b"\xff\xd8\xffcaptcha-image",
        media_type="image/jpeg",
    )

    def prompt(_message: str) -> str:
        assert len(list(tmp_path.iterdir())) == 1
        if prompt_fails:
            raise RuntimeError("prompt failed")
        return "ABCD"

    if prompt_fails:
        with pytest.raises(RuntimeError, match="prompt failed"):
            solve_image_captcha(
                challenge,
                browser_open=lambda _url: True,
                captcha_prompt=prompt,
                print_fn=lambda _message: None,
                temp_directory=tmp_path,
            )
    else:
        assert (
            solve_image_captcha(
                challenge,
                browser_open=lambda _url: True,
                captcha_prompt=prompt,
                print_fn=lambda _message: None,
                temp_directory=tmp_path,
            )
            == "ABCD"
        )

    assert list(tmp_path.iterdir()) == []


def test_captcha_temp_file_is_removed_when_viewer_cannot_open(tmp_path) -> None:
    challenge = XiaomiImageCaptchaRequired(
        image=b"\xff\xd8\xffcaptcha-image",
        media_type="image/jpeg",
    )

    with pytest.raises(XiaomiCaptchaOpenError):
        solve_image_captcha(
            challenge,
            browser_open=lambda _url: False,
            captcha_prompt=lambda _message: pytest.fail("must not prompt"),
            print_fn=lambda _message: None,
            temp_directory=tmp_path,
        )

    assert list(tmp_path.iterdir()) == []


def test_captcha_cleanup_failure_registers_exit_retry(
    tmp_path, monkeypatch
) -> None:
    challenge = XiaomiImageCaptchaRequired(
        image=b"\xff\xd8\xffcaptcha-image",
        media_type="image/jpeg",
    )
    registered: list[tuple] = []
    messages: list[str] = []
    monkeypatch.setattr(xiaomi_auth, "_remove_temp_file", lambda _path: False)
    monkeypatch.setattr(
        xiaomi_auth.atexit,
        "register",
        lambda function, *args: registered.append((function, *args)),
    )

    result = solve_image_captcha(
        challenge,
        browser_open=lambda _url: True,
        captcha_prompt=lambda _message: "ABCD",
        print_fn=messages.append,
        temp_directory=tmp_path,
    )

    assert result == "ABCD"
    assert len(registered) == 1
    assert "cleanup will be retried" in "\n".join(messages)
