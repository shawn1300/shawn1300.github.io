from __future__ import annotations

import json

import pytest

import collector.environment_collector.browser_bootstrap as browser_bootstrap
from collector.environment_collector.xiaomi_auth import (
    MAX_BROWSER_RESPONSE_BYTES,
    XiaomiBootstrapAuthenticationError,
    login_from_browser_response,
)


class FakeResponse:
    def __init__(self, cookies: dict[str, str] | None = None) -> None:
        self.cookies = cookies or {}
        self.status_code = 200


class FakeSession:
    def __init__(self, *, return_token: bool = True) -> None:
        self.cookies: dict[str, str] = {}
        self.return_token = return_token
        self.gets: list[tuple[str, dict]] = []

    def get(self, url: str, **kwargs):
        self.gets.append((url, kwargs))
        cookies = (
            {"serviceToken": "service-token-secret", "userId": "browser-user-secret"}
            if self.return_token
            else {}
        )
        return FakeResponse(cookies)


class FakeCloud:
    def __init__(self, *, return_token: bool = True) -> None:
        self.username = None
        self.password = None
        self.user_id = None
        self.service_token = None
        self.ssecurity = None
        self.cuser_id = None
        self.pass_token = None
        self.session = FakeSession(return_token=return_token)
        self.session_initialized = False

    def _init_session(self) -> None:
        self.session_initialized = True


def official_response(**changes) -> str:
    values = {
        "code": 0,
        "userId": "browser-user-secret",
        "ssecurity": "browser-ssecurity-secret",
        "location": "https://sts.api.io.mi.com/sts?ticket=location-secret",
        "passToken": "browser-pass-token-secret",
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
    assert result.ssecurity == "browser-ssecurity-secret"
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
    assert result.ssecurity == "browser-ssecurity-secret"
    assert result.service_token == "service-token-secret"
    assert result.pass_token is None
    assert result.password is None
    assert result.session.gets == [
        (
            "https://sts.api.io.mi.com/sts?ticket=location-secret",
            {"allow_redirects": True},
        )
    ]


@pytest.mark.parametrize(
    ("response", "error"),
    [
        ("not-an-official-response", "official JSON object"),
        ("&&&START&&&not-json", "could not be parsed"),
        ("{}", "not authenticated"),
        (official_response(code=81003), "not authenticated"),
        (official_response(userId=""), "missing: userId"),
        (official_response(ssecurity=""), "missing: ssecurity"),
        (official_response(location=""), "missing: location"),
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
        "browser-ssecurity-secret",
        "location-secret",
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
            official_response(location=location),
            client_factory=lambda **_kwargs: FakeCloud(),
        )

    assert "invalid login completion address" in str(caught.value)
    assert "ticket=secret" not in str(caught.value)


def test_browser_response_reports_used_location_without_leaking_it() -> None:
    location = "https://sts.api.io.mi.com/sts?ticket=used-location-secret"

    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        login_from_browser_response(
            official_response(location=location),
            client_factory=lambda **_kwargs: FakeCloud(return_token=False),
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
