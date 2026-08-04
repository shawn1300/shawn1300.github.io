from __future__ import annotations

import pytest

from collector.environment_collector.config import CollectorConfig, CollectorConfigError


def valid_values() -> dict[str, str]:
    return {
        "MI_USER_ID": "user-secret-value",
        "MI_SERVICE_TOKEN": "service-token-secret-value",
        "MI_SSECURITY": "ssecurity-secret-value",
        "MI_INDOOR_DID": "indoor-secret-did",
        "MI_OUTDOOR_DID": "outdoor-secret-did",
        "SUPABASE_URL": "https://example.supabase.co/",
        "SUPABASE_SERVICE_ROLE_KEY": "service-role-secret-value",
    }


def test_config_normalizes_the_supported_region_and_url() -> None:
    config = CollectorConfig.from_mapping(valid_values())

    assert config.mi_country == "cn"
    assert config.supabase_url == "https://example.supabase.co"


def test_config_reports_variable_names_without_secret_values() -> None:
    values = valid_values()
    secret = values.pop("MI_SERVICE_TOKEN")

    with pytest.raises(CollectorConfigError) as error:
        CollectorConfig.from_mapping(values)

    assert "MI_SERVICE_TOKEN" in str(error.value)
    assert secret not in str(error.value)


def test_config_rejects_duplicate_devices_without_echoing_the_did() -> None:
    values = valid_values()
    secret_did = values["MI_INDOOR_DID"]
    values["MI_OUTDOOR_DID"] = secret_did

    with pytest.raises(CollectorConfigError) as error:
        CollectorConfig.from_mapping(values)

    assert secret_did not in str(error.value)


def test_config_rejects_a_non_china_region() -> None:
    values = valid_values()
    values["MI_COUNTRY"] = "sg"

    with pytest.raises(CollectorConfigError, match="must be cn"):
        CollectorConfig.from_mapping(values)
