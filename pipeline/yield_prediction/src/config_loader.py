"""Load project config.yaml."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def load_config() -> dict:
    with (ROOT / "config.yaml").open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def path(key: str) -> Path:
    cfg = load_config()
    return ROOT / cfg["paths"][key]
