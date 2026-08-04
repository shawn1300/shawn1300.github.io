from __future__ import annotations

import json

import pytest

from collector.environment_collector.edge_auth import (
    EDGE_LOGIN_URL,
    EdgeLoginMaterial,
    PlaywrightEdgeDriver,
    capture_edge_session,
    hydrate_edge_session,
    parse_edge_login_response,
)
from collector.environment_collector.xiaomi_auth import (
    PASSWORD_LOGIN_URL,
    XiaomiBootstrapAuthenticationError,
)


def login_response(**changes) -> bytes:
    values = {
        "code": 0,
        "userId": "edge-user-secret",
        "ssecurity": "edge-ssecurity-secret",
        "location": "https://sts.api.io.mi.com/sts?ticket=edge-location-secret",
        "passToken": "ignored-pass-token-secret",
    }
    values.update(changes)
    return ("&&&START&&&" + json.dumps(values)).encode()


@pytest.mark.parametrize(
    "url",
    [
        PASSWORD_LOGIN_URL,
        EDGE_LOGIN_URL,
        "https://account.xiaomi.com/pass/serviceLogin?_json=true&sid=xiaomiio",
    ],
)
def test_edge_parser_accepts_only_complete_official_login_material(url: str) -> None:
    result = parse_edge_login_response(url, login_response())

    assert result == EdgeLoginMaterial(
        user_id="edge-user-secret",
        ssecurity="edge-ssecurity-secret",
        location="https://sts.api.io.mi.com/sts?ticket=edge-location-secret",
    )
    assert not hasattr(result, "pass_token")


@pytest.mark.parametrize(
    "url",
    [
        "http://account.xiaomi.com/pass/serviceLoginAuth2",
        "https://user@account.xiaomi.com/pass/serviceLoginAuth2",
        "https://account.xiaomi.com:444/pass/serviceLoginAuth2",
        "https://account.xiaomi.com.evil.example/pass/serviceLoginAuth2",
        "https://account.xiaomi.com/pass/serviceLoginAuth2/extra",
        "https://account.xiaomi.com/pass/serviceLogin?sid=wrong&_json=true",
        "https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true&extra=1",
    ],
)
def test_edge_parser_ignores_non_exact_response_addresses(url: str) -> None:
    assert parse_edge_login_response(url, login_response()) is None


@pytest.mark.parametrize(
    "body",
    [
        b"not-json",
        b"{}",
        login_response(code=70016),
        login_response(userId=""),
        login_response(ssecurity=""),
        login_response(location=""),
        pytest.param(b"{" + (b"x" * (64 * 1024)), id="overlong"),
    ],
)
def test_edge_parser_ignores_incomplete_or_unreadable_candidates(body: bytes) -> None:
    assert parse_edge_login_response(PASSWORD_LOGIN_URL, body) is None


def test_edge_parser_rejects_hostile_location_without_leaking_it() -> None:
    location = "https://evil.example/sts?ticket=hostile-location-secret"

    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        parse_edge_login_response(
            PASSWORD_LOGIN_URL,
            login_response(location=location),
        )

    assert "invalid login completion address" in str(caught.value)
    assert "hostile-location-secret" not in str(caught.value)


class FakeClock:
    def __init__(self) -> None:
        self.value = 0.0

    def __call__(self) -> float:
        return self.value


class FakeEdgeDriver:
    def __init__(
        self,
        *,
        response: bytes | None = None,
        cookies_before_navigation: list[dict] | None = None,
        cookies_after_navigation: list[dict] | None = None,
        window_closed: bool = False,
    ) -> None:
        self.response = response
        self.cookies_before_navigation = cookies_before_navigation or []
        self.cookies_after_navigation = cookies_after_navigation or []
        self.window_closed = window_closed
        self.callback = None
        self.started = False
        self.cleaned = False
        self.opened: list[str] = []
        self.navigated: list[str] = []
        self.waits: list[int] = []
        self.clock: FakeClock | None = None

    def start(self, callback) -> None:
        self.started = True
        self.callback = callback

    def open(self, url: str) -> None:
        self.opened.append(url)
        if self.response is not None:
            self.callback(PASSWORD_LOGIN_URL, self.response)

    def restricted_cookies(self) -> list[dict]:
        if self.navigated:
            return self.cookies_after_navigation
        return self.cookies_before_navigation

    def navigate(self, url: str) -> None:
        self.navigated.append(url)

    def is_closed(self) -> bool:
        return self.window_closed

    def wait(self, milliseconds: int) -> None:
        self.waits.append(milliseconds)
        if self.clock is not None:
            self.clock.value += milliseconds / 1000

    def close(self) -> None:
        self.cleaned = True


def service_cookies(*, user_id: str = "edge-user-secret") -> list[dict]:
    return [
        {
            "name": "serviceToken",
            "value": "edge-service-token-secret",
            "domain": ".api.io.mi.com",
        },
        {"name": "userId", "value": user_id, "domain": ".api.io.mi.com"},
        {
            "name": "unrelatedCookie",
            "value": "unrelated-cookie-secret",
            "domain": ".api.io.mi.com",
        },
    ]


def capture_with(driver: FakeEdgeDriver, **changes):
    clock = FakeClock()
    driver.clock = clock
    return capture_edge_session(
        driver_factory=lambda: driver,
        monotonic=clock,
        timeout_seconds=changes.pop("timeout_seconds", 2),
        redirect_grace_seconds=changes.pop("redirect_grace_seconds", 0),
        **changes,
    )


def test_edge_capture_reuses_existing_service_cookie_without_navigation() -> None:
    driver = FakeEdgeDriver(
        response=login_response(),
        cookies_before_navigation=service_cookies(),
    )

    result = capture_with(driver)

    assert result.user_id == "edge-user-secret"
    assert result.ssecurity == "edge-ssecurity-secret"
    assert result.service_token == "edge-service-token-secret"
    assert driver.opened == [EDGE_LOGIN_URL]
    assert driver.navigated == []
    assert driver.cleaned is True


def test_edge_capture_consumes_location_exactly_once_in_same_context() -> None:
    driver = FakeEdgeDriver(
        response=login_response(),
        cookies_after_navigation=service_cookies(),
    )

    result = capture_with(driver)

    assert result.service_token == "edge-service-token-secret"
    assert driver.navigated == [
        "https://sts.api.io.mi.com/sts?ticket=edge-location-secret"
    ]
    assert driver.cleaned is True


def test_edge_capture_rejects_cookie_identity_conflict_and_cleans_up() -> None:
    driver = FakeEdgeDriver(
        response=login_response(),
        cookies_before_navigation=service_cookies(user_id="different-user-secret"),
    )

    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        capture_with(driver)

    assert "identity did not match" in str(caught.value)
    assert "different-user-secret" not in str(caught.value)
    assert driver.cleaned is True


def test_edge_capture_reports_user_closed_window_and_cleans_up() -> None:
    driver = FakeEdgeDriver(window_closed=True)

    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        capture_with(driver)

    assert "window was closed" in str(caught.value)
    assert driver.cleaned is True


def test_edge_capture_times_out_without_retrying_and_cleans_up() -> None:
    driver = FakeEdgeDriver()

    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        capture_with(driver, timeout_seconds=0.5)

    assert "timed out" in str(caught.value)
    assert driver.opened == [EDGE_LOGIN_URL]
    assert driver.navigated == []
    assert driver.cleaned is True


def test_edge_capture_cleans_up_after_driver_start_failure() -> None:
    class FailingDriver(FakeEdgeDriver):
        def start(self, _callback) -> None:
            raise RuntimeError("driver-internal-secret")

    driver = FailingDriver()

    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        capture_with(driver)

    assert "could not start Microsoft Edge" in str(caught.value)
    assert "driver-internal-secret" not in str(caught.value)
    assert driver.cleaned is True


def test_edge_cleanup_failure_does_not_mask_the_login_error() -> None:
    class CleanupFailingDriver(FakeEdgeDriver):
        def close(self) -> None:
            raise RuntimeError("cleanup-internal-secret")

    driver = CleanupFailingDriver(window_closed=True)

    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        capture_with(driver)

    assert "window was closed" in str(caught.value)
    assert "cleanup-internal-secret" not in str(caught.value)


def test_hydrate_edge_session_never_retains_password_or_pass_token() -> None:
    class FakeCloud:
        def __init__(self) -> None:
            self.username = "unexpected"
            self.password = "unexpected"
            self.user_id = None
            self.service_token = None
            self.ssecurity = None
            self.pass_token = "unexpected"

    client = FakeCloud()
    result = hydrate_edge_session(
        capture_with(
            FakeEdgeDriver(
                response=login_response(),
                cookies_before_navigation=service_cookies(),
            )
        ),
        client_factory=lambda **_kwargs: client,
    )

    assert result is client
    assert result.username is None
    assert result.password is None
    assert result.pass_token is None
    assert result.user_id == "edge-user-secret"
    assert result.service_token == "edge-service-token-secret"
    assert result.ssecurity == "edge-ssecurity-secret"


def test_playwright_driver_uses_installed_edge_and_reads_only_allowed_responses(
) -> None:
    calls: list[tuple] = []

    class FakeResponse:
        def __init__(self, url: str) -> None:
            self.url = url
            self.body_calls = 0

        def body(self) -> bytes:
            self.body_calls += 1
            return b"response-body"

    class FakePage:
        def __init__(self) -> None:
            self.handler = None

        def on(self, event: str, handler) -> None:
            calls.append(("on", event))
            self.handler = handler

        def goto(self, url: str, **kwargs) -> None:
            calls.append(("goto", url, kwargs))

        def is_closed(self) -> bool:
            return False

        def wait_for_timeout(self, milliseconds: int) -> None:
            calls.append(("wait", milliseconds))

        def close(self) -> None:
            calls.append(("page.close",))

    page = FakePage()

    class FakeContext:
        def new_page(self):
            return page

        def cookies(self, urls):
            calls.append(("cookies", urls))
            return []

        def close(self) -> None:
            calls.append(("context.close",))

    class FakeBrowser:
        def new_context(self, **kwargs):
            calls.append(("new_context", kwargs))
            return FakeContext()

        def is_connected(self) -> bool:
            return True

        def close(self) -> None:
            calls.append(("browser.close",))

    class FakeChromium:
        def launch(self, **kwargs):
            calls.append(("launch", kwargs))
            return FakeBrowser()

    class FakePlaywright:
        chromium = FakeChromium()

        def stop(self) -> None:
            calls.append(("playwright.stop",))

    seen: list[tuple[str, bytes]] = []
    driver = PlaywrightEdgeDriver(playwright_start=lambda: FakePlaywright())
    driver.start(lambda url, body: seen.append((url, body)))

    unrelated = FakeResponse("https://evil.example/pass/serviceLoginAuth2")
    allowed = FakeResponse(PASSWORD_LOGIN_URL)
    page.handler(unrelated)
    page.handler(allowed)
    driver.open(EDGE_LOGIN_URL)
    driver.restricted_cookies()
    driver.wait(250)
    driver.close()

    assert unrelated.body_calls == 0
    assert allowed.body_calls == 1
    assert seen == [(PASSWORD_LOGIN_URL, b"response-body")]
    assert (
        "launch",
        {"channel": "msedge", "headless": False, "args": ["--disable-extensions"]},
    ) in calls
    assert ("new_context", {"accept_downloads": False}) in calls
    assert calls[-4:] == [
        ("page.close",),
        ("context.close",),
        ("browser.close",),
        ("playwright.stop",),
    ]
