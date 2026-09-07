"""Start the Coin Checker web app.

    python run.py          local only -- reachable from this PC
    python run.py --lan    also reachable from your phone on the same Wi-Fi

Then open the printed address in a browser.
"""

import socket
import sys
import webbrowser
from threading import Timer

from app import create_app

PORT = 5000


def lan_ip():
    """This machine's address on the local network, or None if offline."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Nothing is actually sent -- this just asks the OS which interface it
        # would route through, which is the one the phone can reach.
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return None
    finally:
        probe.close()


app = create_app()

if __name__ == "__main__":
    share = "--lan" in sys.argv
    host = "0.0.0.0" if share else "127.0.0.1"
    local_url = f"http://127.0.0.1:{PORT}"

    print(f"\n  Coin Checker")
    print(f"    On this PC:  {local_url}")

    if share:
        ip = lan_ip()
        if ip:
            print(f"    On your phone:  http://{ip}:{PORT}")
            print("\n    Phone and PC must be on the same Wi-Fi, and this window")
            print("    must stay open. If Windows asks about firewall access,")
            print("    allow it on Private networks.")
            print("\n    Note: there is no password on the app, so anyone else on")
            print("    your network could open it too.")
        else:
            print("    Could not detect a network address -- are you online?")
    else:
        print("    (run with --lan to reach it from your phone)")

    print("\n  Your data lives in the 'instance' folder. Ctrl+C to stop.\n")

    Timer(1.0, lambda: webbrowser.open(local_url)).start()
    app.run(host=host, port=PORT, debug=False)
