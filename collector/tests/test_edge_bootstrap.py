from __future__ import annotations

from types import SimpleNamespace

import collector.environment_collector.edge_bootstrap as edge_bootstrap
from collector.environment_collector.xiaomi_auth import (
    XiaomiBootstrapAuthenticationError,
)


def test_edge_bootstrap_closes_browser_before_real_device_probe(
    monkeypatch, capsys
) -> None:
    material = SimpleNamespace(
        user_id="edge-user-secret",
        service_token="edge-service-token-secret",
        ssecurity="edge-ssecurity-secret",
    )
    client = SimpleNamespace()
    calls: list[object] = []
    monkeypatch.setattr(
        edge_bootstrap,
        "capture_edge_session",
        lambda: calls.append("capture-and-close") or material,
    )
    monkeypatch.setattr(
        edge_bootstrap,
        "hydrate_edge_session",
        lambda value: calls.append(value) or client,
    )
    monkeypatch.setattr(
        edge_bootstrap,
        "run_authenticated_bootstrap",
        lambda value: calls.append(value),
    )

    assert edge_bootstrap.main() == 0

    assert calls == ["capture-and-close", material, client]
    output = capsys.readouterr().out
    assert "Microsoft Edge was closed; probing thermometers" in output
    for secret in (
        "edge-user-secret",
        "edge-service-token-secret",
        "edge-ssecurity-secret",
    ):
        assert secret not in output


def test_edge_bootstrap_reports_only_sanitized_failure(monkeypatch, capsys) -> None:
    monkeypatch.setattr(
        edge_bootstrap,
        "capture_edge_session",
        lambda: (_ for _ in ()).throw(
            XiaomiBootstrapAuthenticationError("safe Edge login failure")
        ),
    )

    assert edge_bootstrap.main() == 1

    output = capsys.readouterr().out
    assert "Edge bootstrap failed: safe Edge login failure" in output


def test_edge_bootstrap_handles_keyboard_interrupt_without_traceback(
    monkeypatch, capsys
) -> None:
    monkeypatch.setattr(
        edge_bootstrap,
        "capture_edge_session",
        lambda: (_ for _ in ()).throw(KeyboardInterrupt()),
    )

    assert edge_bootstrap.main() == 130
    assert "Edge bootstrap cancelled; no credentials were saved" in (
        capsys.readouterr().out
    )


def test_edge_bootstrap_reports_probe_interrupt_truthfully(monkeypatch, capsys) -> None:
    monkeypatch.setattr(edge_bootstrap, "capture_edge_session", lambda: object())
    monkeypatch.setattr(edge_bootstrap, "hydrate_edge_session", lambda _value: object())
    monkeypatch.setattr(
        edge_bootstrap,
        "run_authenticated_bootstrap",
        lambda _value: (_ for _ in ()).throw(KeyboardInterrupt()),
    )

    assert edge_bootstrap.main() == 130
    assert "check whether .collector-credentials.json was created" in (
        capsys.readouterr().out
    )
