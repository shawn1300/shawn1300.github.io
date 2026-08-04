"""Bootstrap Xiaomi cloud credentials through an ephemeral Edge login."""

from __future__ import annotations

from .bootstrap import run_authenticated_bootstrap
from .edge_auth import capture_edge_session, hydrate_edge_session
from .xiaomi_cloud import XiaomiCloudError


def main() -> int:
    print("Xiaomi temporary Edge bootstrap (China region)")
    print("Enter credentials only in the official Xiaomi page opened by Edge.")
    print("The temporary login window will close before device probing begins.")
    try:
        material = capture_edge_session()
    except KeyboardInterrupt:
        print("Edge bootstrap cancelled; no credentials were saved.")
        return 130
    except XiaomiCloudError as exc:
        print(f"Edge bootstrap failed: {exc}")
        return 1

    try:
        raw_client = hydrate_edge_session(material)
        print("Microsoft Edge was closed; probing thermometers.")
        run_authenticated_bootstrap(raw_client)
        return 0
    except KeyboardInterrupt:
        print(
            "Device probing was cancelled; check whether "
            ".collector-credentials.json was created."
        )
        return 130
    except XiaomiCloudError as exc:
        print(f"Edge bootstrap failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
