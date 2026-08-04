from __future__ import annotations

import json

import pytest

from collector.environment_collector.edge_auth import EDGE_LOGIN_URL
from collector.environment_collector.edge_diagnostic_auth import (
    DiagnosticHTTPResponse,
    DiagnosticLayerFlags,
    PlaywrightDiagnosticDriver,
    capture_edge_diagnostic,
    parse_diagnostic_observation,
)
from collector.environment_collector.xiaomi_auth import (
    XiaomiBootstrapAuthenticationError,
)


def diagnostic_body(*, nested: bool = False, **changes) -> bytes:
    values = {
        "code": 0,
        "userId": "diagnostic-user-secret",
        "ssecurity": "diagnostic-ssecurity-secret",
        "location": "https://sts.api.io.mi.com/sts?ticket=diagnostic-location-secret",
        "passToken": "diagnostic-pass-token-secret",
        "unrelatedSecret": "diagnostic-body-secret",
    }
    values.update(changes)
    if nested:
        values = {
            "code": 0,
            "data": {key: value for key, value in values.items() if key != "code"},
        }
    return ("&&&START&&&" + json.dumps(values)).encode()


def response(
    *,
    url: str = "https://account.xiaomi.com/pass/serviceLoginTicketAuth",
    status: int = 200,
    body: bytes | None = None,
) -> DiagnosticHTTPResponse:
    return DiagnosticHTTPResponse(
        url=url,
        status=status,
        body=body if body is not None else diagnostic_body(),
    )


def test_diagnostic_parser_reports_fixed_flags_without_values() -> None:
    observation = parse_diagnostic_observation(response())

    assert observation is not None
    assert observation.path == "/pass/serviceLoginTicketAuth"
    assert observation.status == 200
    assert observation.root == DiagnosticLayerFlags(
        code_zero=True,
        user_id=True,
        ssecurity=True,
        location=True,
        pass_token=True,
    )
    assert observation.data == DiagnosticLayerFlags()
    assert observation.candidate is not None
    rendered = observation.render(1)
    assert "Diagnostic #1" in rendered
    assert "root[code0,userId,ssecurity,location,passToken]" in rendered
    for secret in (
        "diagnostic-user-secret",
        "diagnostic-ssecurity-secret",
        "diagnostic-location-secret",
        "diagnostic-pass-token-secret",
        "diagnostic-body-secret",
    ):
        assert secret not in rendered


def test_diagnostic_parser_reports_one_data_layer_without_recursive_search() -> None:
    nested = diagnostic_body(nested=True)
    observation = parse_diagnostic_observation(response(body=nested))

    assert observation is not None
    assert observation.root.code_zero is True
    assert observation.root.ssecurity is False
    assert observation.data.user_id is True
    assert observation.data.ssecurity is True
    assert observation.data.location is True
    assert observation.candidate is None

    recursive = (
        "&&&START&&&"
        + json.dumps({"code": 0, "data": {"code": 0, "data": json.loads(
            diagnostic_body().decode().removeprefix("&&&START&&&")
        )}})
    ).encode()
    recursive_observation = parse_diagnostic_observation(response(body=recursive))
    assert recursive_observation is not None
    assert recursive_observation.data.ssecurity is False
    assert recursive_observation.candidate is None


@pytest.mark.parametrize(
    "url",
    [
        "http://account.xiaomi.com/pass/serviceLoginTicketAuth",
        "https://user@account.xiaomi.com/pass/serviceLoginTicketAuth",
        "https://account.xiaomi.com:444/pass/serviceLoginTicketAuth",
        "https://account.xiaomi.com.evil.example/pass/serviceLoginTicketAuth",
        "https://evil.example/pass/serviceLoginTicketAuth",
    ],
)
def test_diagnostic_parser_rejects_non_exact_account_origin(url: str) -> None:
    assert parse_diagnostic_observation(response(url=url)) is None


def test_diagnostic_parser_redacts_unsafe_long_and_numeric_paths() -> None:
    numbered = parse_diagnostic_observation(
        response(
            url=(
                "https://account.xiaomi.com/pass/session/"
                "123456/finish?secret=query"
            )
        )
    )
    encoded = parse_diagnostic_observation(
        response(url="https://account.xiaomi.com/pass/%E7%A7%98%E5%AF%86")
    )
    overlong = parse_diagnostic_observation(
        response(url="https://account.xiaomi.com/" + ("a" * 200))
    )

    assert numbered is not None
    assert numbered.path == "/pass/session/[number]/finish"
    assert "query" not in numbered.render(1)
    assert encoded is not None and encoded.path == "[redacted-path]"
    assert overlong is not None and overlong.path == "[redacted-path]"


@pytest.mark.parametrize(
    "body",
    [
        b"not-json",
        b"[]",
        b"{" + (b"x" * (64 * 1024)),
    ],
    ids=["malformed", "array", "overlong"],
)
def test_diagnostic_parser_ignores_invalid_or_overlong_bodies(body: bytes) -> None:
    assert parse_diagnostic_observation(response(body=body)) is None


class FakeClock:
    def __init__(self) -> None:
        self.value = 0.0

    def __call__(self) -> float:
        return self.value


class FakeDiagnosticDriver:
    def __init__(
        self,
        *,
        responses: list[DiagnosticHTTPResponse] | None = None,
        cookies: list[dict] | None = None,
        window_closed: bool = False,
    ) -> None:
        self.responses = responses or []
        self.cookies = cookies or []
        self.window_closed = window_closed
        self.callback = None
        self.opened: list[str] = []
        self.navigated: list[str] = []
        self.cleaned = False
        self.clock: FakeClock | None = None

    def start(self, callback) -> None:
        self.callback = callback

    def open(self, url: str) -> None:
        self.opened.append(url)
        for item in self.responses:
            self.callback(item)

    def restricted_cookies(self) -> list[dict]:
        return self.cookies

    def navigate(self, url: str) -> None:
        self.navigated.append(url)

    def is_closed(self) -> bool:
        return self.window_closed

    def wait(self, milliseconds: int) -> None:
        if self.clock is not None:
            self.clock.value += milliseconds / 1000

    def close(self) -> None:
        self.cleaned = True


def service_cookies() -> list[dict]:
    return [
        {
            "name": "serviceToken",
            "value": "diagnostic-service-token-secret",
            "domain": ".api.io.mi.com",
        },
        {
            "name": "userId",
            "value": "diagnostic-user-secret",
            "domain": ".api.io.mi.com",
        },
    ]


def capture_with(driver: FakeDiagnosticDriver, messages: list[str], **changes):
    clock = FakeClock()
    driver.clock = clock
    return capture_edge_diagnostic(
        driver_factory=lambda: driver,
        print_fn=messages.append,
        monotonic=clock,
        timeout_seconds=changes.pop("timeout_seconds", 10),
        cookie_grace_seconds=changes.pop("cookie_grace_seconds", 5),
        redirect_grace_seconds=changes.pop("redirect_grace_seconds", 0),
        **changes,
    )


def test_diagnostic_capture_reuses_complete_session_and_cleans_output() -> None:
    driver = FakeDiagnosticDriver(
        responses=[response()],
        cookies=service_cookies(),
    )
    messages: list[str] = []

    result = capture_with(driver, messages)

    assert result.user_id == "diagnostic-user-secret"
    assert result.ssecurity == "diagnostic-ssecurity-secret"
    assert result.service_token == "diagnostic-service-token-secret"
    assert driver.opened == [EDGE_LOGIN_URL]
    assert driver.cleaned is True
    rendered = "\n".join(messages)
    assert "/pass/serviceLoginTicketAuth" in rendered
    for secret in (
        "diagnostic-user-secret",
        "diagnostic-ssecurity-secret",
        "diagnostic-service-token-secret",
        "diagnostic-location-secret",
        "diagnostic-pass-token-secret",
        "diagnostic-body-secret",
    ):
        assert secret not in rendered


def test_diagnostic_capture_fails_five_seconds_after_cookie_only() -> None:
    driver = FakeDiagnosticDriver(cookies=service_cookies())
    messages: list[str] = []

    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        capture_with(driver, messages)

    assert "cloud cookie but no complete login response" in str(caught.value)
    assert driver.cleaned is True
    assert any("waiting 5 seconds" in message for message in messages)
    rendered = "\n".join(messages) + str(caught.value)
    assert "diagnostic-service-token-secret" not in rendered
    assert "diagnostic-user-secret" not in rendered


def test_diagnostic_capture_reports_close_and_always_cleans() -> None:
    driver = FakeDiagnosticDriver(window_closed=True)
    messages: list[str] = []

    with pytest.raises(XiaomiBootstrapAuthenticationError) as caught:
        capture_with(driver, messages)

    assert "window was closed" in str(caught.value)
    assert driver.cleaned is True


def test_diagnostic_driver_reads_only_small_json_from_exact_origin() -> None:
    calls: list[tuple] = []

    class FakeResponse:
        def __init__(
            self,
            url: str,
            *,
            content_type: str = "application/json;charset=UTF-8",
            content_length: str | None = None,
        ) -> None:
            self.url = url
            self.status = 200
            self.headers = {"content-type": content_type}
            if content_length is not None:
                self.headers["content-length"] = content_length
            self.body_calls = 0

        def body(self) -> bytes:
            self.body_calls += 1
            return diagnostic_body()

    class FakePage:
        def on(self, _event, handler) -> None:
            self.handler = handler

        def close(self) -> None:
            calls.append(("page.close",))

    page = FakePage()

    class FakeContext:
        def new_page(self):
            return page

        def close(self) -> None:
            calls.append(("context.close",))

    class FakeBrowser:
        def new_context(self, **_kwargs):
            return FakeContext()

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

    seen: list[DiagnosticHTTPResponse] = []
    driver = PlaywrightDiagnosticDriver(playwright_start=lambda: FakePlaywright())
    driver.start(seen.append)

    unrelated = FakeResponse("https://evil.example/pass/serviceLoginTicketAuth")
    html = FakeResponse(
        "https://account.xiaomi.com/fe/service/login",
        content_type="text/html",
    )
    declared_large = FakeResponse(
        "https://account.xiaomi.com/pass/large",
        content_length=str((64 * 1024) + 1),
    )
    allowed = FakeResponse(
        "https://account.xiaomi.com/pass/serviceLoginTicketAuth",
        content_length=str(len(diagnostic_body())),
    )
    for item in (unrelated, html, declared_large, allowed):
        page.handler(item)
    driver.close()

    assert unrelated.body_calls == 0
    assert html.body_calls == 0
    assert declared_large.body_calls == 0
    assert allowed.body_calls == 1
    assert len(seen) == 1
    assert seen[0].url.endswith("/pass/serviceLoginTicketAuth")
    assert (
        "launch",
        {"channel": "msedge", "headless": False, "args": ["--disable-extensions"]},
    ) in calls
