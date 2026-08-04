"""Minimal, token-based Xiaomi cloud adapter for LYWSD03MMC sensors."""

from __future__ import annotations

import json
from typing import Any, Callable

from .models import CloudDevice, EXPECTED_MODEL, SensorReading, SensorRole


class XiaomiCloudError(RuntimeError):
    """A Xiaomi cloud request failed without exposing request secrets."""


class XiaomiAuthenticationError(XiaomiCloudError):
    """The stored Xiaomi cloud session is no longer accepted."""


class XiaomiDeviceError(XiaomiCloudError):
    """The selected device is absent or has the wrong model."""


class XiaomiPropertyError(XiaomiCloudError):
    """Required sensor properties were not returned successfully."""


def _default_client_factory() -> Any:
    try:
        from micloud import MiCloud
    except ImportError as exc:  # pragma: no cover - exercised only without dependencies
        raise XiaomiCloudError(
            "micloud is not installed; install collector/requirements.txt"
        ) from exc
    return MiCloud()


class XiaomiCloudClient:
    """Use pre-existing session material to read Xiaomi MIoT properties."""

    def __init__(
        self,
        *,
        user_id: str,
        service_token: str,
        ssecurity: str,
        country: str = "cn",
        client: Any | None = None,
        client_factory: Callable[[], Any] = _default_client_factory,
    ) -> None:
        if country != "cn":
            raise XiaomiCloudError("only the cn Xiaomi cloud region is supported")

        self.country = country
        self._client = client if client is not None else client_factory()
        self._client.user_id = user_id
        self._client.service_token = service_token
        self._client.ssecurity = ssecurity
        self._client.default_server = country
        self._client.locale = "zh_CN"
        self._client.timezone = "GMT+08:00"

    def _raise_request_failure(self, operation: str) -> None:
        if not getattr(self._client, "service_token", None):
            raise XiaomiAuthenticationError("Xiaomi cloud session expired")
        raise XiaomiCloudError(f"Xiaomi cloud {operation} failed")

    def list_devices(self) -> list[CloudDevice]:
        try:
            raw_devices = self._client.get_devices(country=self.country)
        except Exception:
            self._raise_request_failure("device listing")

        if raw_devices is None:
            self._raise_request_failure("device listing")
        if not isinstance(raw_devices, list):
            raise XiaomiCloudError("Xiaomi cloud device listing returned invalid data")

        devices: list[CloudDevice] = []
        for item in raw_devices:
            if not isinstance(item, dict):
                continue
            did = item.get("did")
            model = item.get("model")
            if not isinstance(did, str) or not isinstance(model, str):
                continue
            online = item.get("isOnline")
            devices.append(
                CloudDevice(
                    did=did,
                    name=str(item.get("name") or item.get("desc") or "Unnamed device"),
                    model=model,
                    is_online=online if isinstance(online, bool) else None,
                )
            )
        return devices

    def selected_devices(
        self, indoor_did: str, outdoor_did: str
    ) -> dict[SensorRole, CloudDevice]:
        devices = {device.did: device for device in self.list_devices()}
        selected: dict[SensorRole, CloudDevice] = {}
        missing: list[str] = []
        for role, did in (("indoor", indoor_did), ("outdoor", outdoor_did)):
            device = devices.get(did)
            if device is None:
                from .models import masked_device_id

                missing.append(masked_device_id(did))
            else:
                selected[role] = device
        if missing:
            raise XiaomiDeviceError(
                "selected Xiaomi devices were not found: " + ", ".join(missing)
            )
        return selected

    def read_environment(
        self, role: SensorRole, device: CloudDevice
    ) -> SensorReading:
        if device.model != EXPECTED_MODEL:
            raise XiaomiDeviceError(
                f"{device.log_id} has model {device.model}, expected {EXPECTED_MODEL}"
            )

        property_requests = [
            {"did": device.did, "siid": 2, "piid": 1},
            {"did": device.did, "siid": 2, "piid": 2},
            {"did": device.did, "siid": 3, "piid": 1},
        ]
        params = {
            "data": json.dumps(
                {"params": property_requests},
                ensure_ascii=False,
                separators=(",", ":"),
            )
        }

        try:
            raw_response = self._client.request_country(
                "/miotspec/prop/get", self.country, params
            )
        except Exception:
            self._raise_request_failure("property request")

        if raw_response is None:
            self._raise_request_failure("property request")

        try:
            response = (
                json.loads(raw_response)
                if isinstance(raw_response, str)
                else raw_response
            )
        except (TypeError, ValueError) as exc:
            raise XiaomiCloudError(
                "Xiaomi cloud property request returned invalid JSON"
            ) from exc

        if not isinstance(response, dict) or response.get("code") not in (None, 0):
            if not getattr(self._client, "service_token", None):
                raise XiaomiAuthenticationError("Xiaomi cloud session expired")
            raise XiaomiPropertyError(f"property request failed for {device.log_id}")

        result = response.get("result")
        if not isinstance(result, list):
            raise XiaomiPropertyError(f"property result missing for {device.log_id}")

        values: dict[tuple[int, int], Any] = {}
        for item in result:
            if not isinstance(item, dict) or item.get("code") != 0:
                continue
            siid = item.get("siid")
            piid = item.get("piid")
            if isinstance(siid, int) and isinstance(piid, int):
                values[(siid, piid)] = item.get("value")

        temperature = values.get((2, 1))
        humidity = values.get((2, 2))
        battery = values.get((3, 1))
        if not isinstance(temperature, (int, float)) or not isinstance(
            humidity, (int, float)
        ):
            raise XiaomiPropertyError(
                f"required temperature or humidity missing for {device.log_id}"
            )
        if not isinstance(battery, (int, float)):
            battery = None

        return SensorReading(
            role=role,
            did=device.did,
            temperature=float(temperature),
            humidity=float(humidity),
            battery=round(float(battery)) if battery is not None else None,
            source_online=device.is_online,
        )
