from __future__ import annotations

import json

import pytest

import collector.environment_collector.browser_bootstrap as browser_bootstrap
from collector.environment_collector.xiaomi_auth import (
    MAX_BROWSER_RESPONSE_BYTES,
    SERVICE_LOGIN_URL,
    XiaomiBootstrapAuthenticationError,
    login_from_browser_response,
)


class FakeResponse:
    def __init__(
        self,
        cookies: dict[str, str] | None = None,
        *,
        text: str = "",
    ) -> None:
        self.cookies = cookies or {}
        self.status_code = 200
        self.text = text


class FakeSession:
    def __init__(
        self,
        *,
        return_token: bool = True,
        refresh_response: str | None = None,
    ) -> None:
        self.cookies: dict[str, str] = {}
        self.return_token = return_token
        self.refresh_response = refresh_response or refreshed_response()
        self.gets: list[tuple[str, dict]] = []

    def get(self, url: str, **kwargs):
        self.gets.append((url, kwargs))
        if url == SERVICE_LOGIN_URL:
            self.cookies.update(
                {
                    "userId": "browser-user-secret",
                    "passToken": "rotated-pass-token-secret",
                }
            )
            return FakeResponse(text=self.refresh_response)
        cookies = (
            {"serviceToken": "service-token-secret", "userId": "browser-user-secret"}
            if self.return_token
            else {}
        )
        return FakeResponse(cookies)


class FakeCloud:
    def __init__(
        self,
        *,
        return_token: bool = True,
        refresh_response: str | None = None,
    ) -> None:
        self.username = None
        self.password = None
        self.user_id = None
        self.service_token = None
        self.ssecurity = None
        self.cuser_id = None
        self.pass_token = None
        self.session = FakeSession(
            return_token=return_token,
            refresh_response=refresh_response,
        )
        self.session_initialized = False

    def _init_session(self) -> None:
        self.session_initialized = True


def official_response(**changes) -> str:
    values = {
        "code": 0,
        "userId": "browser-user-secret",
        "passToken": "browser-pass-token-secret",
        "ssecurity": "stale-browser-ssecurity-secret",
        "location": "https://sts.api.io.mi.com/sts?ticket=stale-location-secret",
    }
    values.update(changes)
    return "&&&START&&&" + json.dumps(values)


def refreshed_response(**changes) -> str:
    values = {
        "code": 0,
        "userId": "browser-user-secret",
        "ssecurity": "refreshed-ssecurity-secret",
        "location": "https://sts.api.io.mi.com/sts?ticket=fresh-location-secret",
        "passToken": "rotated-pass-token-secret",
    }
    values.update(changes)
    return "&&&START&&&" + json.dumps(values)


def test_browser_response_accepts_json_object_without_xssi_prefix() -> None:
    client = FakeCloud()
    response = official_response().removeprefix("&&&START&&&")

    result = login_from_browser_response(
        response,
        client_factory=lambda **_kwargs: client,
    )

    assert result is client
    assert result.ssecurity == "refreshed-ssecurity-secret"
    assert result.service_token == "service-token-secret"


def test_browser_response_extracts_only_required_session_material() -> None:
    client = FakeCloud()

    result = login_from_browser_response(
        official_response(),
        client_factory=lambda **_kwargs: client,
    )

    assert result is client
    assert result.session_initialized is True
    assert result.user_id == "browser-user-secret"
    assert result.ssecurity == "refreshed-ssecurity-secret"
    assert result.service_token == "service-token-secret"
    assert result.pass_token is None
    assert result.password is None
    assert result.session.gets == [
        (
            SERVICE_LOGIN_URL,
            {
                "params": {"sid": "xiaomiio", "_json": "true"},
                "cookies": {
                    "userId": "browser-user-secret",
                    "passToken": "browser-pass-token-secret",
                },
            },
        ),
        (
            "https://sts.api.io.mi.com/sts?ticket=fresh-location-secret",
            {"allow_redirects": True},
        ),
    ]
    assert result.session.cookies == {}


@pytest.mark.parametrize(
    ("refresh", "error"),
    [
        (refreshed_response(code=70016), "browser session expired"),
        (refreshed_response(userId=""), "refresh missing: userId"),
        (refreshed_response(ssecurity=""), "refresh missing: ssecurity"),
        (refreshed_response(location=""), "refresh missing: location"),
    ],
)
def test_browser_response_rejects_invalid_refresh_without_leaking_it(
    refresh: str, error: str
) -> None:
    client = FakeCloud(refresh_response=refresh)

    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        login_from_browser_response(
            official_response(),
            client_factory=lambda **_kwargs: client,
        )

    assert error in str(caught.value)
    assert client.pass_token is None
    assert client.session.cookies == {}
    for secret in (
        "browser-user-secret",
        "refreshed-ssecurity-secret",
        "fresh-location-secret",
        "rotated-pass-token-secret",
    ):
        assert secret not in str(caught.value)


def test_browser_response_rejects_refreshed_identity_mismatch() -> None:
    client = FakeCloud(
        refresh_response=refreshed_response(userId="different-user-secret")
    )

    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        login_from_browser_response(
            official_response(),
            client_factory=lambda **_kwargs: client,
        )

    assert "identity did not match" in str(caught.value)
    assert "different-user-secret" not in str(caught.value)
    assert client.pass_token is None
    assert client.session.cookies == {}


@pytest.mark.parametrize(
    ("response", "error"),
    [
        ("not-an-official-response", "official JSON object"),
        ("&&&START&&&not-json", "could not be parsed"),
        ("{}", "not authenticated"),
        (official_response(code=81003), "not authenticated"),
        (official_response(userId=""), "missing: userId"),
        (official_response(passToken=""), "missing: passToken"),
    ],
)
def test_browser_response_rejects_invalid_input_without_echoing_it(
    response: str, error: str
) -> None:
    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        login_from_browser_response(
            response,
            client_factory=lambda **_kwargs: pytest.fail(
                "client must not be created for invalid input"
            ),
        )

    message = str(caught.value)
    assert error in message
    for secret in (
        "browser-user-secret",
        "stale-browser-ssecurity-secret",
        "stale-location-secret",
        "browser-pass-token-secret",
    ):
        assert secret not in message


def test_browser_response_rejects_overlong_input_before_json_parsing() -> None:
    secret = "sensitive-overlong-input"
    response = "&&&START&&&" + secret + ("x" * MAX_BROWSER_RESPONSE_BYTES)

    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        login_from_browser_response(response)

    assert "exceeded 65536 bytes" in str(caught.value)
    assert secret not in str(caught.value)


@pytest.mark.parametrize(
    "location",
    [
        "http://sts.api.io.mi.com/sts?ticket=secret",
        "https://user@sts.api.io.mi.com/sts?ticket=secret",
        "https://sts.api.io.mi.com:444/sts?ticket=secret",
        "https://sts.api.io.mi.com.evil.example/sts?ticket=secret",
        "https://evil.example/sts?ticket=secret",
    ],
)
def test_browser_response_rejects_hostile_completion_location(location: str) -> None:
    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        login_from_browser_response(
            official_response(),
            client_factory=lambda **_kwargs: FakeCloud(
                refresh_response=refreshed_response(location=location)
            ),
        )

    assert "invalid login completion address" in str(caught.value)
    assert "ticket=secret" not in str(caught.value)


def test_browser_response_reports_used_location_without_leaking_it() -> None:
    location = "https://sts.api.io.mi.com/sts?ticket=used-location-secret"

    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        login_from_browser_response(
            official_response(),
            client_factory=lambda **_kwargs: FakeCloud(
                return_token=False,
                refresh_response=refreshed_response(location=location),
            ),
        )

    assert "without returning a cloud session" in str(caught.value)
    assert "used-location-secret" not in str(caught.value)


def test_browser_bootstrap_main_never_prints_source_response(monkeypatch, capsys) -> None:
    source = official_response()
    client = FakeCloud()
    seen: list[object] = []
    monkeypatch.setattr(browser_bootstrap.getpass, "getpass", lambda _prompt: source)
    monkeypatch.setattr(
        browser_bootstrap,
        "login_from_browser_response",
        lambda value: seen.append(value) or client,
    )
    monkeypatch.setattr(
        browser_bootstrap,
        "run_authenticated_bootstrap",
        lambda value: seen.append(value),
    )

    assert browser_bootstrap.main() == 0

    output = capsys.readouterr().out
    assert seen == [source, client]
    assert "Clear the copied Xiaomi response from the clipboard" in output
    for secret in (
        "browser-user-secret",
        "browser-ssecurity-secret",
        "location-secret",
        "browser-pass-token-secret",
    ):
        assert secret not in output


def test_browser_bootstrap_main_reminds_clipboard_cleanup_after_failure(
    monkeypatch, capsys
) -> None:
    source = official_response()
    monkeypatch.setattr(browser_bootstrap.getpass, "getpass", lambda _prompt: source)
    monkeypatch.setattr(
        browser_bootstrap,
        "login_from_browser_response",
        lambda _value: (_ for _ in ()).throw(
            XiaomiBootstrapAuthenticationError("safe browser import failure")
        ),
    )

    assert browser_bootstrap.main() == 1

    output = capsys.readouterr().out
    assert "Browser bootstrap failed: safe browser import failure" in output
    assert "Clear the copied Xiaomi response from the clipboard" in output
    assert "browser-pass-token-secret" not in output
