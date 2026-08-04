from __future__ import annotations

from datetime import datetime, timezone

import pytest

from collector.environment_collector.models import CloudDevice, SensorReading


def test_cloud_device_uses_a_stable_masked_log_identifier() -> None:
    device = CloudDevice(
        did="sensitive-device-id",
        name="室内",
        model="miaomiaoce.sensor_ht.t2",
        is_online=True,
    )

    assert device.log_id.startswith("device-")
    assert "sensitive-device-id" not in device.log_id
    assert device.log_id == CloudDevice(
        did="sensitive-device-id",
        name="another name",
        model=device.model,
    ).log_id


def test_reading_accepts_valid_values_and_sets_a_utc_collection_time() -> None:
    reading = SensorReading(
        role="indoor",
        did="sensitive-device-id",
        temperature=23.4,
        humidity=52.1,
        battery=86,
        source_online=True,
    )

    assert reading.collected_at is not None
    assert reading.collected_at.tzinfo is not None
    assert reading.log_id.startswith("device-")


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("temperature", -30.1),
        ("temperature", 100.1),
        ("humidity", -0.1),
        ("humidity", 100.1),
        ("battery", -1),
        ("battery", 101),
    ],
)
def test_reading_rejects_values_outside_the_miot_contract(field: str, value: float) -> None:
    values = {
        "role": "outdoor",
        "did": "sensitive-device-id",
        "temperature": 18.7,
        "humidity": 68.0,
        "battery": 74,
        "source_online": True,
        "collected_at": datetime.now(timezone.utc),
    }
    values[field] = value

    with pytest.raises(ValueError):
        SensorReading(**values)


def test_reading_rejects_naive_timestamps() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        SensorReading(
            role="indoor",
            did="sensitive-device-id",
            temperature=23.4,
            humidity=52.1,
            battery=None,
            source_online=None,
            collected_at=datetime(2026, 8, 4, 10, 0),
        )
