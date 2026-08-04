"""Run a one-time, secret-safe Xiaomi Edge response diagnostic."""

from __future__ import annotations

from .bootstrap import run_authenticated_bootstrap
from .edge_auth import hydrate_edge_session
from .edge_diagnostic_auth import capture_edge_diagnostic
from .xiaomi_cloud import XiaomiCloudError


def main() -> int:
    print("Xiaomi temporary Edge diagnostic (China region)")
    print("Only sanitized metadata from the exact Xiaomi account origin is shown.")
    print("Enter credentials only in the official Xiaomi page opened by Edge.")
    try:
        material = capture_edge_diagnostic(print_fn=print)
    except KeyboardInterrupt:
        print("Edge diagnostic cancelled; no credentials were saved.")
        return 130
    except XiaomiCloudError as exc:
        print(f"Edge diagnostic failed: {exc}")
        return 1

    try:
        raw_client = hydrate_edge_session(material)
        print("A complete cloud session was captured; Edge was closed.")
        run_authenticated_bootstrap(raw_client)
        return 0
    except KeyboardInterrupt:
        print(
            "Device probing was cancelled; check whether "
            ".collector-credentials.json was created."
        )
        return 130
    except XiaomiCloudError as exc:
        print(f"Edge diagnostic failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
