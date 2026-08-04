from __future__ import annotations

import json
from pathlib import Path

from collector.environment_collector.bootstrap import (
    BootstrapSession,
    print_device_choices,
    write_credentials,
)
from collector.environment_collector.models import CloudDevice


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
