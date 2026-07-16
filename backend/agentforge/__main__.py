"""``python -m agentforge`` — the $0, offline, no-key smoke of the agent core."""

from __future__ import annotations

from .agent import demo

if __name__ == "__main__":
    raise SystemExit(demo())
