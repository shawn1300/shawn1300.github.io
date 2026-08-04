from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

import collector.environment_collector.bootstrap as bootstrap
from collector.environment_collector.bootstrap import (
    BootstrapSession,
    print_device_choices,
    run_authenticated_bootstrap,
    write_credentials,
)
from collector.environment_collector.models import CloudDevice
from collector.environment_collector.xiaomi_cloud import XiaomiCloudError


def test_write_credentials_never_persists_the_account_password(tmp_path: Path) -> None:
    output = tmp_path / ".collector-credentials.json"
    session = BootstrapSession(
        user_id="user-secret",
        service_token="token-secret",
        ssecurity="ssecurity-secret",
    )

    write_credentials(
        output,
        session,
        indoor=CloudDevice("indoor-sensitive-did", "室内", "miaomiaoce.sensor_ht.t2"),
        outdoor=CloudDevice("outdoor-sensitive-did", "室外", "miaomiaoce.sensor_ht.t2"),
    )

    values = json.loads(output.read_text(encoding="utf-8"))
    assert values == {
        "MI_USER_ID": "user-secret",
        "MI_SERVICE_TOKEN": "token-secret",
        "MI_SSECURITY": "ssecurity-secret",
        "MI_INDOOR_DID": "indoor-sensitive-did",
        "MI_OUTDOOR_DID": "outdoor-sensitive-did",
        "MI_COUNTRY": "cn",
    }
    assert "password" not in output.read_text(encoding="utf-8").lower()


def test_device_choices_show_names_and_masked_ids_only(capsys) -> None:
    device = CloudDevice(
        did="sensitive-device-id",
        name="室内",
        model="miaomiaoce.sensor_ht.t2",
        is_online=True,
    )

    print_device_choices([device])

    output = capsys.readouterr().out
    assert "室内" in output
    assert device.log_id in output
    assert device.did not in output


def test_login_reports_only_missing_session_field_names(monkeypatch) -> None:
    class IncompleteCloud:
        user_id = "user-secret"
        service_token = "service-token-secret"
        ssecurity = None
        password = "password-secret"

    monkeypatch.setattr(
        bootstrap,
        "login_interactive",
        lambda _username, _password: IncompleteCloud(),
    )

    with pytest.raises(XiaomiCloudError) as caught:
        bootstrap._login("user-secret", "password-secret")

    message = str(caught.value)
    assert "ssecurity" in message
    assert "user-secret" not in message
    assert "service-token-secret" not in message
    assert "password-secret" not in message


def test_authenticated_bootstrap_reuses_probe_and_writes_credentials(
    tmp_path: Path,
) -> None:
    class RawClient:
        user_id = "user-secret"
        service_token = "service-token-secret"
        ssecurity = "ssecurity-secret"
        password = None

    devices = [
        CloudDevice("indoor-sensitive-did", "室内", "miaomiaoce.sensor_ht.t2"),
        CloudDevice("outdoor-sensitive-did", "室外", "miaomiaoce.sensor_ht.t2"),
    ]

    class FakeCloud:
        def list_devices(self):
            return devices

        def read_environment(self, role, _device):
            values = {
                "indoor": SimpleNamespace(temperature=23.4, humidity=52.0),
                "outdoor": SimpleNamespace(temperature=18.7, humidity=68.0),
            }
            return values[role]

    factory_calls: list[dict] = []
    choices = iter(["1", "2"])
    messages: list[str] = []
    output = tmp_path / ".collector-credentials.json"

    run_authenticated_bootstrap(
        RawClient(),
        output=output,
        cloud_factory=lambda **kwargs: factory_calls.append(kwargs) or FakeCloud(),
        input_fn=lambda _prompt: next(choices),
        print_fn=messages.append,
    )

    values = json.loads(output.read_text(encoding="utf-8"))
    assert values["MI_USER_ID"] == "user-secret"
    assert values["MI_INDOOR_DID"] == "indoor-sensitive-did"
    assert values["MI_OUTDOOR_DID"] == "outdoor-sensitive-did"
    assert factory_calls[0]["client"].service_token == "service-token-secret"
    rendered = "\n".join(messages)
    assert "Read probe succeeded" in rendered
    assert "indoor-sensitive-did" not in rendered
    assert "outdoor-sensitive-did" not in rendered
    assert "service-token-secret" not in rendered
