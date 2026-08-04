"""Bootstrap Xiaomi cloud credentials from an official browser response."""

from __future__ import annotations

import getpass

from .bootstrap import run_authenticated_bootstrap
from .xiaomi_auth import login_from_browser_response
from .xiaomi_cloud import XiaomiCloudError


def main() -> int:
    print("Xiaomi browser-response bootstrap (China region)")
    print("The pasted response is hidden and is never written to the repository.")
    raw_response = ""
    try:
        raw_response = getpass.getpass(
            "Paste the complete Xiaomi JSON response: "
        )
        raw_client = login_from_browser_response(raw_response)
        raw_response = ""
        print("Official Xiaomi response accepted; probing thermometers.")
        run_authenticated_bootstrap(raw_client)
        return 0
    except XiaomiCloudError as exc:
        print(f"Browser bootstrap failed: {exc}")
        return 1
    finally:
        raw_response = ""
        print("Clear the copied Xiaomi response from the clipboard now.")


if __name__ == "__main__":
    raise SystemExit(main())
