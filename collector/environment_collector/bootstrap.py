"""One-time local Xiaomi login and secret material bootstrap."""

from __future__ import annotations

import getpass
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from .models import CloudDevice, EXPECTED_MODEL
from .xiaomi_auth import login_interactive
from .xiaomi_cloud import XiaomiCloudClient, XiaomiCloudError


DEFAULT_OUTPUT = Path(".collector-credentials.json")


@dataclass(frozen=True, slots=True)
class BootstrapSession:
    user_id: str
    service_token: str
    ssecurity: str


def print_device_choices(devices: Sequence[CloudDevice]) -> None:
    for index, device in enumerate(devices, start=1):
        state = "online" if device.is_online is True else "offline/unknown"
        print(f"[{index}] {device.name} · {device.log_id} · {state}")


def select_device(
    prompt: str, devices: Sequence[CloudDevice], *, input_fn=input
) -> CloudDevice:
    while True:
        value = input_fn(prompt).strip()
        try:
            index = int(value) - 1
        except ValueError:
            index = -1
        if 0 <= index < len(devices):
            return devices[index]
        print(f"Please enter a number from 1 to {len(devices)}.")


def write_credentials(
    output: Path,
    session: BootstrapSession,
    *,
    indoor: CloudDevice,
    outdoor: CloudDevice,
) -> None:
    if indoor.did == outdoor.did:
        raise ValueError("indoor and outdoor must be different devices")

    values = {
        "MI_USER_ID": session.user_id,
        "MI_SERVICE_TOKEN": session.service_token,
        "MI_SSECURITY": session.ssecurity,
        "MI_INDOOR_DID": indoor.did,
        "MI_OUTDOOR_DID": outdoor.did,
        "MI_COUNTRY": "cn",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    descriptor = os.open(output, flags, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as file:
        json.dump(values, file, ensure_ascii=False, indent=2)
        file.write("\n")
    try:
        os.chmod(output, 0o600)
    except OSError:
        pass


def _login(username: str, password: str):
    cloud = login_interactive(username, password)
    if not cloud.user_id or not cloud.service_token or not cloud.ssecurity:
        raise XiaomiCloudError("Xiaomi login did not return complete session material")
    cloud.password = None
    return cloud


def main() -> int:
    print("Xiaomi environment collector bootstrap (China region)")
    print("Credentials stay on this computer and are never written to the repository.")
    username = input("Xiaomi account email/phone/ID: ").strip()
    password = getpass.getpass("Xiaomi account password: ")

    try:
        raw_client = _login(username, password)
        session = BootstrapSession(
            user_id=str(raw_client.user_id),
            service_token=str(raw_client.service_token),
            ssecurity=str(raw_client.ssecurity),
        )
        cloud = XiaomiCloudClient(
            user_id=session.user_id,
            service_token=session.service_token,
            ssecurity=session.ssecurity,
            client=raw_client,
        )
        devices = [
            device for device in cloud.list_devices() if device.model == EXPECTED_MODEL
        ]
        if len(devices) < 2:
            raise XiaomiCloudError(
                f"expected at least two {EXPECTED_MODEL} devices, found {len(devices)}"
            )

        print("Matching thermometers (full Xiaomi IDs remain hidden):")
        print_device_choices(devices)
        indoor = select_device("Select the indoor device number: ", devices)
        outdoor = select_device("Select the outdoor device number: ", devices)
        if indoor.did == outdoor.did:
            raise XiaomiCloudError("indoor and outdoor selections must be different")

        indoor_reading = cloud.read_environment("indoor", indoor)
        outdoor_reading = cloud.read_environment("outdoor", outdoor)
        print(
            "Read probe succeeded: "
            f"indoor {indoor_reading.temperature:.1f}°C/{indoor_reading.humidity:.1f}%, "
            f"outdoor {outdoor_reading.temperature:.1f}°C/{outdoor_reading.humidity:.1f}%"
        )
        write_credentials(
            DEFAULT_OUTPUT,
            session,
            indoor=indoor,
            outdoor=outdoor,
        )
        print(f"Xiaomi session material was saved locally to {DEFAULT_OUTPUT}.")
        print("Do not commit or send this file. Follow docs/environment-operations.md.")
        return 0
    except XiaomiCloudError as exc:
        print(f"Bootstrap failed: {exc}")
        return 1
    finally:
        password = ""


if __name__ == "__main__":
    raise SystemExit(main())
