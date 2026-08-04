from __future__ import annotations

import logging

import pytest

from collector.miservice_probe import (
    ProbeDataError,
    SecretSafeFailureClassifier,
    bounded_account_class,
    select_target_dids,
    validate_environment_values,
)


def test_select_target_dids_filters_exact_model_without_returning_other_fields() -> None:
    devices = [
        {
            "did": "target-b",
            "model": "miaomiaoce.sensor_ht.t2",
            "name": "sensitive-name",
            "token": "sensitive-token",
        },
        {"did": "ignored", "model": "other.model"},
        {"did": "target-a", "model": "miaomiaoce.sensor_ht.t2"},
    ]

    result = select_target_dids(devices)

    assert sorted(result) == ["target-a", "target-b"]
    assert "sensitive-name" not in result
    assert "sensitive-token" not in result


def test_validate_environment_values_accepts_numeric_strings_and_optional_battery() -> None:
    assert validate_environment_values(["22.4", 58, None]) == (22.4, 58.0, None)
    assert validate_environment_values([22.4, "58", "79.6"]) == (22.4, 58.0, 80)


@pytest.mark.parametrize(
    "values",
    ([True, 50, 80], [22, -1, 80], [101, 50, 80], [22, 50], None),
)
def test_validate_environment_values_rejects_invalid_or_implausible_data(values) -> None:
    with pytest.raises(ProbeDataError):
        validate_environment_values(values)


@pytest.mark.parametrize(
    ("error", "category"),
    [
        ("Login response missing 'ssecurity': secret-body", "missing_ssecurity"),
        ("Rate limited: sensitive-tip", "rate_limited"),
        ("Xiaomi requested captcha at secret-url", "captcha_required"),
        (
            "OTP verification succeeded but login resume failed: secret-body",
            "otp_resume_failed",
        ),
        ("Failed to send OTP SMS: secret-body", "otp_failed"),
        ("serviceToken missing: secret-body", "session_incomplete"),
    ],
)
def test_failure_classifier_keeps_only_fixed_category(error: str, category: str) -> None:
    classifier = SecretSafeFailureClassifier()
    record = logging.LogRecord(
        "miservice",
        logging.ERROR,
        __file__,
        1,
        "Exception on login %s: %s",
        ("sensitive-account", RuntimeError(error)),
        None,
    )

    classifier.emit(record)

    assert classifier.category == category
    assert "sensitive" not in classifier.category


def test_bounded_account_allows_only_one_upstream_login_call() -> None:
    class FakeAccount:
        calls = 0

        async def login(self, sid: str) -> bool:
            self.calls += 1
            return True

    account = bounded_account_class(FakeAccount)()

    import asyncio

    assert asyncio.run(account.login("xiaomiio")) is True
    assert asyncio.run(account.login("xiaomiio")) is False
    assert account.calls == 1
