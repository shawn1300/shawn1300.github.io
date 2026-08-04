"""Secret-safe, one-shot probe for the unmodified MiService 3.0.2 package."""

from __future__ import annotations

import asyncio
import getpass
import hashlib
import logging
import math
import os
import stat
from collections.abc import Sequence
from pathlib import Path
from typing import Any


EXPECTED_VERSION = "3.0.2"
EXPECTED_MODEL = "miaomiaoce.sensor_ht.t2"
PROPERTY_IIDS = ((2, 1), (2, 2), (3, 1))


class ProbeDataError(ValueError):
    """A response did not contain plausible environment values."""


class SecretSafeFailureClassifier(logging.Handler):
    """Reduce upstream exceptions to a fixed category without retaining details."""

    category = "authentication_failed"

    def emit(self, record: logging.LogRecord) -> None:
        candidate: BaseException | None = None
        if isinstance(record.args, tuple):
            for value in reversed(record.args):
                if isinstance(value, BaseException):
                    candidate = value
                    break
        text = str(candidate).lower() if candidate is not None else ""
        if "missing 'ssecurity'" in text:
            self.category = "missing_ssecurity"
        elif "70022" in text or "rate limited" in text:
            self.category = "rate_limited"
        elif "captcha" in text or "87001" in text:
            self.category = "captcha_required"
        elif "otp verification succeeded but login resume failed" in text:
            self.category = "otp_resume_failed"
        elif "otp" in text or "verifyphone" in text or "verifyemail" in text:
            self.category = "otp_failed"
        elif "service token" in text or "servicetoken" in text:
            self.category = "session_incomplete"


def configure_secret_safe_upstream_logging() -> SecretSafeFailureClassifier:
    """Suppress MiService response logging and retain only a fixed failure class."""

    classifier = SecretSafeFailureClassifier()
    logger = logging.getLogger("miservice")
    logger.handlers.clear()
    logger.addHandler(classifier)
    logger.setLevel(logging.WARNING)
    logger.propagate = False
    return classifier


def validation_token_path() -> Path:
    """Return a repository-external token location under local application data."""

    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        raise RuntimeError("LOCALAPPDATA is unavailable")
    return Path(local_app_data) / "shawn1300-miservice-validation" / ".mi.token"


def select_target_dids(devices: Any) -> list[str]:
    """Select exact target models and return their DIDs in a stable private order."""

    if not isinstance(devices, list):
        raise ProbeDataError("device_list_invalid")
    dids: list[str] = []
    for device in devices:
        if not isinstance(device, dict) or device.get("model") != EXPECTED_MODEL:
            continue
        did = device.get("did")
        if isinstance(did, str) and did:
            dids.append(did)
    return sorted(set(dids), key=lambda did: hashlib.sha256(did.encode()).digest())


def _number(value: Any, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool):
        raise ProbeDataError("property_not_numeric")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ProbeDataError("property_not_numeric") from exc
    if not math.isfinite(result) or not minimum <= result <= maximum:
        raise ProbeDataError("property_out_of_range")
    return result


def validate_environment_values(values: Any) -> tuple[float, float, int | None]:
    """Validate temperature, humidity, and optional battery from MiService."""

    if not isinstance(values, Sequence) or isinstance(values, (str, bytes)):
        raise ProbeDataError("property_result_invalid")
    if len(values) != len(PROPERTY_IIDS):
        raise ProbeDataError("property_result_incomplete")
    temperature = _number(values[0], minimum=-30, maximum=100)
    humidity = _number(values[1], minimum=0, maximum=100)
    battery = None
    if values[2] is not None:
        battery = round(_number(values[2], minimum=0, maximum=100))
    return temperature, humidity, battery


async def hidden_otp_input(method: str) -> str:
    """Read one OTP without echoing or persisting it."""

    label = "email" if method.lower() == "email" else "SMS"
    print(f"Xiaomi requested one {label} verification code.")
    return await asyncio.to_thread(
        getpass.getpass, "Xiaomi one-time verification code (hidden): "
    )


def bounded_account_class(base_class):
    """Wrap the upstream account so it cannot start a second network login."""

    class BoundedMiAccount(base_class):
        _probe_login_attempts = 0

        async def login(self, sid: str) -> bool:
            if self._probe_login_attempts >= 1:
                return False
            self._probe_login_attempts += 1
            return await super().login(sid)

    return BoundedMiAccount


def _protect_token_file(path: Path) -> None:
    if path.is_file():
        try:
            path.chmod(stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass


async def run_probe() -> int:
    """Run exactly one original MiService validation attempt."""

    try:
        import miservice
        from miservice import MiAccount, MiIOService
    except ImportError:
        print("Probe setup failed: MiService is not installed in this interpreter.")
        return 2

    if getattr(miservice, "__version__", None) != EXPECTED_VERSION:
        print("Probe setup failed: installed MiService version is not 3.0.2.")
        return 2

    try:
        token_path = validation_token_path()
        token_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        print("Probe setup failed: isolated session directory is unavailable.")
        return 2

    print("MiService 3.0.2 original authentication probe (China region)")
    print("No account, device identifier, token, or complete response will be shown.")
    username = getpass.getpass("Shared Xiaomi account (hidden): ").strip()
    password = getpass.getpass("Xiaomi account password (hidden): ")
    if not username or (not password and not token_path.is_file()):
        print("Probe cancelled: account or password was blank.")
        return 2
    if input("Start one bounded Xiaomi login attempt? Type YES: ").strip() != "YES":
        print("Probe cancelled before contacting Xiaomi.")
        return 2

    classifier = configure_secret_safe_upstream_logging()
    BoundedMiAccount = bounded_account_class(MiAccount)
    try:
        async with BoundedMiAccount(
            None,
            username,
            password,
            str(token_path),
            otp_callback=hidden_otp_input,
        ) as account:
            service = MiIOService(account, region="cn")
            try:
                devices = await service.device_list("full")
            except Exception:
                print(f"Probe stopped: {classifier.category}.")
                return 3

            try:
                homes = await service.home_list("full")
                home_data_visible = isinstance(homes, list) and bool(homes)
            except Exception:
                home_data_visible = False

            try:
                target_dids = select_target_dids(devices)
            except ProbeDataError:
                print("Probe stopped: Xiaomi device listing was invalid.")
                return 4
            print("MiService cloud login: success")
            print(f"Home metadata visible: {'yes' if home_data_visible else 'no'}")
            print(f"Exact {EXPECTED_MODEL} matches: {len(target_dids)}")
            if len(target_dids) != 2:
                print("Probe stopped: shared target device count was not exactly two.")
                return 4

            readings: list[tuple[float, float, int | None]] = []
            for did in target_dids:
                try:
                    values = await service.miot_get_props(did, PROPERTY_IIDS)
                    readings.append(validate_environment_values(values))
                except Exception:
                    print("Probe stopped: target environment properties were unavailable.")
                    return 5
    except (KeyboardInterrupt, EOFError):
        print("Probe cancelled locally.")
        return 2
    except Exception:
        print(f"Probe stopped: {classifier.category}.")
        return 3

    _protect_token_file(token_path)
    for index, (temperature, humidity, battery) in enumerate(readings, start=1):
        battery_text = "unavailable" if battery is None else f"{battery}%"
        print(
            f"Sensor {index}: temperature={temperature:.1f} C, "
            f"humidity={humidity:.1f}%, battery={battery_text}"
        )
    print("Probe result: success; both shared sensors returned environment data.")
    return 0


def main() -> int:
    try:
        return asyncio.run(run_probe())
    except (KeyboardInterrupt, EOFError):
        print("Probe cancelled locally.")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
