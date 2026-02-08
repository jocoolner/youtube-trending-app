from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def _run(backend_dir: Path, script_name: str, extra_args: list[str] | None = None) -> None:
    script_path = backend_dir / "scripts" / script_name
    print(f"\n==> {script_name}")
    cmd = [sys.executable, str(script_path)]
    if extra_args:
        cmd.extend(extra_args)
    subprocess.run(cmd, cwd=str(backend_dir), check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="One-shot data refresh: download, rebuild DuckDB, rebuild analytics.")
    parser.add_argument(
        "--force-download",
        action="store_true",
        help="Force a fresh Kaggle download (ignores kagglehub cache).",
    )
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parents[1]  # .../backend

    dl_args = ["--force-download"] if args.force_download else None
    _run(backend_dir, "download_dataset.py", extra_args=dl_args)
    _run(backend_dir, "build_duckdb.py")
    _run(backend_dir, "create_analytics.py")
    _run(backend_dir, "create_tag_clean_analytics.py")

    print("\nDone. Restart the Flask app to pick up the updated DuckDB file.")


if __name__ == "__main__":
    main()
