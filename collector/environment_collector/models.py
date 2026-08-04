"""Pure models and validation for Xiaomi environment readings."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal


SensorRole = Literal["indoor", "outdoor"]
EXPECTED_MODEL = "miaomiaoce.sensor_ht.t2"


def masked_device_id(did: str) -> str:
    """Return a stable log-safe identifier that cannot reveal the Xiaomi DID."""

    digest = hashlib.sha256(did.encode("utf-8")).hexdigest()[:10]
    return f"device-{digest}"


@dataclass(frozen=True, slots=True)
class CloudDevice:
    did: str
    name: str
    model: str
    is_online: bool | None = None

    @property
    def log_id(self) -> str:
        return masked_device_id(self.did)


@dataclass(frozen=True, slots=True)
class SensorReading:
    role: SensorRole
    did: str
    temperature: float
    humidity: float
    battery: int | None
    source_online: bool | None
    source_observed_at: datetime | None = None
    collected_at: datetime | None = None

    def __post_init__(self) -> None:
        if self.role not in ("indoor", "outdoor"):
            raise ValueError("role must be indoor or outdoor")
        if not -30 <= self.temperature <= 100:
            raise ValueError("temperature is outside the MIoT model range")
        if not 0 <= self.humidity <= 100:
            raise ValueError("humidity must be between 0 and 100")
        if self.battery is not None and not 0 <= self.battery <= 100:
            raise ValueError("battery must be between 0 and 100")
        if self.source_observed_at is not None and self.source_observed_at.tzinfo is None:
            raise ValueError("source_observed_at must be timezone-aware")

        collected_at = self.collected_at
        if collected_at is None:
            object.__setattr__(self, "collected_at", datetime.now(timezone.utc))
        elif collected_at.tzinfo is None:
            raise ValueError("collected_at must be timezone-aware")

    @property
    def log_id(self) -> str:
        return masked_device_id(self.did)
