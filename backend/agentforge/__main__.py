"""``python -m agentforge`` — subcommand dispatch: ``demo`` (default) + ``watch``.

Bare ``python -m agentforge`` runs the $0 offline demo smoke (unchanged); ``python -m agentforge
watch`` streams live sharp-money signals. All wiring lives in ``cli.main`` (thin transport).
"""

from __future__ import annotations

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
