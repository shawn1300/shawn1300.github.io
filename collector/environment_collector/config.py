"""Secret-safe collector configuration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


class CollectorConfigError(ValueError):
    """Configuration is incomplete or internally inconsistent."""


_REQUIRED_KEYS = (
    "MI_USER_ID",
    "MI_SERVICE_TOKEN",
    "MI_SSECURITY",
    "MI_INDOOR_DID",
    "MI_OUTDOOR_DID",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
)


@dataclass(frozen=True, slots=True)
class CollectorConfig:
    """Values needed by a non-interactive scheduled collection run."""

    mi_user_id: str
    mi_service_token: str
    mi_ssecurity: str
    indoor_did: str
    outdoor_did: str
    supabase_url: str
    supabase_service_role_key: str
    mi_country: str = "cn"

    @classmethod
    def from_mapping(cls, values: Mapping[str, str | None]) -> "CollectorConfig":
        missing = [key for key in _REQUIRED_KEYS if not str(values.get(key) or "").strip()]
        if missing:
            raise CollectorConfigError(
                "Missing required environment variables: " + ", ".join(missing)
            )

        indoor_did = str(values["MI_INDOOR_DID"]).strip()
        outdoor_did = str(values["MI_OUTDOOR_DID"]).strip()
        if indoor_did == outdoor_did:
            raise CollectorConfigError(
                "MI_INDOOR_DID and MI_OUTDOOR_DID must identify different devices"
            )

        country = str(values.get("MI_COUNTRY") or "cn").strip().lower()
        if country != "cn":
            raise CollectorConfigError("MI_COUNTRY must be cn for this installation")

        supabase_url = str(values["SUPABASE_URL"]).strip().rstrip("/")
        if not supabase_url.startswith("https://"):
            raise CollectorConfigError("SUPABASE_URL must use https")

        return cls(
            mi_user_id=str(values["MI_USER_ID"]).strip(),
            mi_service_token=str(values["MI_SERVICE_TOKEN"]).strip(),
            mi_ssecurity=str(values["MI_SSECURITY"]).strip(),
            indoor_did=indoor_did,
            outdoor_did=outdoor_did,
            supabase_url=supabase_url,
            supabase_service_role_key=str(values["SUPABASE_SERVICE_ROLE_KEY"]).strip(),
            mi_country=country,
        )
