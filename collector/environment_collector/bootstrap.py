"""One-time local Xiaomi login and secret material bootstrap."""

from __future__ import annotations

import getpass
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Sequence

from .models import CloudDevice, EXPECTED_MODEL
from .xiaomi_auth import login_interactive
from .xiaomi_cloud import XiaomiCloudClient, XiaomiCloudError


DEFAULT_OUTPUT = Path(".collector-credentials.json")


@dataclass(frozen=True, slots=True)
class BootstrapSession:
    user_id: str
    service_token: str
    ssecurity: str


def print_device_choices(
    devices: Sequence[CloudDevice], *, print_fn: Callable[[str], None] = print
) -> None:
    for index, device in enumerate(devices, start=1):
        state = "online" if device.is_online is True else "offline/unknown"
        print_fn(f"[{index}] {device.name} · {device.log_id} · {state}")


def select_device(
    prompt: str,
    devices: Sequence[CloudDevice],
    *,
    input_fn=input,
    print_fn: Callable[[str], None] = print,
) -> CloudDevice:
    while True:
        value = input_fn(prompt).strip()
        try:
            index = int(value) - 1
        except ValueError:
            index = -1
        if 0 <= index < len(devices):
            return devices[index]
        print_fn(f"Please enter a number from 1 to {len(devices)}.")


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
    _session_from_client(cloud)
    cloud.password = None
    return cloud


def _session_from_client(cloud: Any) -> BootstrapSession:
    missing = [
        name
        for name, value in (
            ("user_id", cloud.user_id),
            ("service_token", cloud.service_token),
            ("ssecurity", cloud.ssecurity),
        )
        if not value
    ]
    if missing:
        raise XiaomiCloudError(
            "Xiaomi login did not return complete session material; missing: "
            + ", ".join(missing)
        )
    return BootstrapSession(
        user_id=str(cloud.user_id),
        service_token=str(cloud.service_token),
        ssecurity=str(cloud.ssecurity),
    )


def run_authenticated_bootstrap(
    raw_client: Any,
    *,
    output: Path = DEFAULT_OUTPUT,
    cloud_factory: Callable[..., XiaomiCloudClient] = XiaomiCloudClient,
    input_fn=input,
    print_fn: Callable[[str], None] = print,
) -> None:
    """Probe and select devices after any supported authentication path."""

    session = _session_from_client(raw_client)
    if hasattr(raw_client, "password"):
        raw_client.password = None
    cloud = cloud_factory(
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

    print_fn("Matching thermometers (full Xiaomi IDs remain hidden):")
    print_device_choices(devices, print_fn=print_fn)
    indoor = select_device(
        "Select the indoor device number: ",
        devices,
        input_fn=input_fn,
        print_fn=print_fn,
    )
    outdoor = select_device(
        "Select the outdoor device number: ",
        devices,
        input_fn=input_fn,
        print_fn=print_fn,
    )
    if indoor.did == outdoor.did:
        raise XiaomiCloudError("indoor and outdoor selections must be different")

    indoor_reading = cloud.read_environment("indoor", indoor)
    outdoor_reading = cloud.read_environment("outdoor", outdoor)
    print_fn(
        "Read probe succeeded: "
        f"indoor {indoor_reading.temperature:.1f}°C/{indoor_reading.humidity:.1f}%, "
        f"outdoor {outdoor_reading.temperature:.1f}°C/{outdoor_reading.humidity:.1f}%"
    )
    write_credentials(
        output,
        session,
        indoor=indoor,
        outdoor=outdoor,
    )
    print_fn(f"Xiaomi session material was saved locally to {output}.")
    print_fn("Do not commit or send this file. Follow docs/environment-operations.md.")


def main() -> int:
    print("Xiaomi environment collector bootstrap (China region)")
    print("Credentials stay on this computer and are never written to the repository.")
    username = input("Xiaomi account email/phone/ID: ").strip()
    password = getpass.getpass("Xiaomi account password: ")

    try:
        raw_client = _login(username, password)
        run_authenticated_bootstrap(raw_client)
        return 0
    except XiaomiCloudError as exc:
        print(f"Bootstrap failed: {exc}")
        return 1
    finally:
        password = ""


if __name__ == "__main__":
    raise SystemExit(main())
