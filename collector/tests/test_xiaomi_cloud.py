from __future__ import annotations

import json

import pytest

from collector.environment_collector.models import CloudDevice
from collector.environment_collector.xiaomi_cloud import (
    XiaomiAuthenticationError,
    XiaomiCloudClient,
    XiaomiDeviceError,
    XiaomiPropertyError,
)


class FakeMiCloud:
    def __init__(self) -> None:
        self.user_id = None
        self.service_token = None
        self.ssecurity = None
        self.default_server = None
        self.locale = None
        self.timezone = None
        self.devices = [
            {
                "did": "indoor-sensitive-did",
                "name": "室内",
                "model": "miaomiaoce.sensor_ht.t2",
                "isOnline": True,
            },
            {
                "did": "outdoor-sensitive-did",
                "name": "室外",
                "model": "miaomiaoce.sensor_ht.t2",
                "isOnline": False,
            },
        ]
        self.property_response = {
            "code": 0,
            "result": [
                {"did": "indoor-sensitive-did", "siid": 2, "piid": 1, "code": 0, "value": 23.4},
                {"did": "indoor-sensitive-did", "siid": 2, "piid": 2, "code": 0, "value": 52.1},
                {"did": "indoor-sensitive-did", "siid": 3, "piid": 1, "code": 0, "value": 86},
            ],
        }
        self.requests: list[tuple[str, str, dict[str, str]]] = []

    def get_devices(self, country: str):
        assert country == "cn"
        return self.devices

    def request_country(self, path: str, country: str, params: dict[str, str]):
        self.requests.append((path, country, params))
        return json.dumps(self.property_response)


def make_client(fake: FakeMiCloud) -> XiaomiCloudClient:
    return XiaomiCloudClient(
        user_id="user-secret",
        service_token="token-secret",
        ssecurity="ssecurity-secret",
        country="cn",
        client=fake,
    )


def test_client_hydrates_an_existing_cloud_session_without_password() -> None:
    fake = FakeMiCloud()
    make_client(fake)

    assert fake.user_id == "user-secret"
    assert fake.service_token == "token-secret"
    assert fake.ssecurity == "ssecurity-secret"
    assert fake.default_server == "cn"
    assert fake.locale == "zh_CN"
    assert fake.timezone == "GMT+08:00"


def test_list_devices_normalizes_online_state() -> None:
    devices = make_client(FakeMiCloud()).list_devices()

    assert [(device.name, device.is_online) for device in devices] == [
        ("室内", True),
        ("室外", False),
    ]


def test_read_environment_requests_the_three_miot_properties() -> None:
    fake = FakeMiCloud()
    cloud = make_client(fake)
    device = cloud.list_devices()[0]

    reading = cloud.read_environment("indoor", device)

    assert reading.temperature == 23.4
    assert reading.humidity == 52.1
    assert reading.battery == 86
    assert reading.source_online is True
    path, country, params = fake.requests[0]
    assert path == "/miotspec/prop/get"
    assert country == "cn"
    assert json.loads(params["data"]) == {
        "params": [
            {"did": "indoor-sensitive-did", "siid": 2, "piid": 1},
            {"did": "indoor-sensitive-did", "siid": 2, "piid": 2},
            {"did": "indoor-sensitive-did", "siid": 3, "piid": 1},
        ]
    }


def test_read_environment_allows_missing_battery() -> None:
    fake = FakeMiCloud()
    fake.property_response["result"][2] = {
        "did": "indoor-sensitive-did",
        "siid": 3,
        "piid": 1,
        "code": -1,
    }
    cloud = make_client(fake)

    reading = cloud.read_environment("indoor", cloud.list_devices()[0])

    assert reading.battery is None


def test_read_environment_rejects_a_wrong_model_without_echoing_did() -> None:
    cloud = make_client(FakeMiCloud())
    sensitive_did = "wrong-model-sensitive-did"
    device = CloudDevice(
        did=sensitive_did,
        name="not a thermometer",
        model="other.model",
    )

    with pytest.raises(XiaomiDeviceError) as error:
        cloud.read_environment("indoor", device)

    assert sensitive_did not in str(error.value)
    assert device.log_id in str(error.value)


def test_read_environment_rejects_missing_temperature_without_echoing_did() -> None:
    fake = FakeMiCloud()
    fake.property_response["result"][0]["code"] = -1
    cloud = make_client(fake)
    device = cloud.list_devices()[0]

    with pytest.raises(XiaomiPropertyError) as error:
        cloud.read_environment("indoor", device)

    assert device.did not in str(error.value)
    assert device.log_id in str(error.value)


def test_list_devices_classifies_an_expired_service_token() -> None:
    fake = FakeMiCloud()
    fake.devices = None
    cloud = make_client(fake)
    fake.service_token = None

    with pytest.raises(XiaomiAuthenticationError, match="session expired"):
        cloud.list_devices()


def test_selected_devices_requires_both_dids_without_echoing_them() -> None:
    cloud = make_client(FakeMiCloud())

    with pytest.raises(XiaomiDeviceError) as error:
        cloud.selected_devices("indoor-sensitive-did", "missing-sensitive-did")

    assert "missing-sensitive-did" not in str(error.value)
    assert "indoor-sensitive-did" not in str(error.value)
