"""Open Agent Protocol — Python worker helper.

The worker never self-authorizes. It asks AJ for each tool.
It cannot certify a mission.
"""
from __future__ import annotations

import json
import sys
from typing import Any, Callable


MANIFEST = {
    "name": "oap-python-worker",
    "version": "1.0.0",
    "capabilities": ["fs.read"],
    "cannotCertify": True,
    "languages": ["python"],
}


def send(msg: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def request_tool(name: str, args: dict[str, Any]) -> None:
    send({"type": "tool.request", "name": name, "args": args})


def heartbeat(note: str, progress: float) -> None:
    send({"type": "heartbeat", "note": note, "progress": progress})


def run(handler: Callable[[dict[str, Any]], None]) -> None:
    send({"type": "manifest", **MANIFEST})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        msg = json.loads(line)
        handler(msg)
