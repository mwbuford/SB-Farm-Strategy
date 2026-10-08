"""End-to-end v1 pipeline: weather → train → ranch forecast."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


def run(script: str, *args: str) -> None:
    cmd = [sys.executable, str(SRC / script), *args]
    print(f"\n>> {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=ROOT)


def main() -> None:
    run("build_weather_features.py", "--tag", "ca_statewide_proxy")
    run("build_training_table.py", "--weather-tag", "ca_statewide_proxy")
    run("train_model.py")
    run("predict_ranch.py")


if __name__ == "__main__":
    main()
