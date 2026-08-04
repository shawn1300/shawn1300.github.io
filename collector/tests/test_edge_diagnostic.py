from __future__ import annotations

from types import SimpleNamespace

import collector.environment_collector.edge_diagnostic as edge_diagnostic
from collector.environment_collector.xiaomi_auth import (
    XiaomiBootstrapAuthenticationError,
)


def test_edge_diagnostic_continues_to_real_probe_when_session_is_complete(
    monkeypatch, capsys
) -> None:
    material = SimpleNamespace(
        user_id="diagnostic-user-secret",
        service_token="diagnostic-service-token-secret",
        ssecurity="diagnostic-ssecurity-secret",
    )
    client = SimpleNamespace()
    calls: list[object] = []
    monkeypatch.setattr(
        edge_diagnostic,
        "capture_edge_diagnostic",
        lambda **_kwargs: calls.append("diagnose-and-close") or material,
    )
    monkeypatch.setattr(
        edge_diagnostic,
        "hydrate_edge_session",
        lambda value: calls.append(value) or client,
    )
    monkeypatch.setattr(
        edge_diagnostic,
        "run_authenticated_bootstrap",
        lambda value: calls.append(value),
    )

    assert edge_diagnostic.main() == 0

    assert calls == ["diagnose-and-close", material, client]
    output = capsys.readouterr().out
    assert "complete cloud session was captured" in output
    for secret in (
        "diagnostic-user-secret",
        "diagnostic-service-token-secret",
        "diagnostic-ssecurity-secret",
    ):
        assert secret not in output


def test_edge_diagnostic_reports_only_sanitized_failure(monkeypatch, capsys) -> None:
    monkeypatch.setattr(
        edge_diagnostic,
        "capture_edge_diagnostic",
        lambda **_kwargs: (_ for _ in ()).throw(
            XiaomiBootstrapAuthenticationError("safe diagnostic failure")
        ),
    )

    assert edge_diagnostic.main() == 1

    output = capsys.readouterr().out
    assert "Edge diagnostic failed: safe diagnostic failure" in output


def test_edge_diagnostic_handles_keyboard_interrupt(monkeypatch, capsys) -> None:
    monkeypatch.setattr(
        edge_diagnostic,
        "capture_edge_diagnostic",
        lambda **_kwargs: (_ for _ in ()).throw(KeyboardInterrupt()),
    )

    assert edge_diagnostic.main() == 130
    assert "diagnostic cancelled; no credentials were saved" in (
        capsys.readouterr().out
    )
