from pathlib import Path
import shutil
import argparse
import kagglehub

DATASET = "canerkonuk/youtube-trending-videos-global"

def main():
    parser = argparse.ArgumentParser(description="Download the Kaggle trending dataset into data/raw/.")
    parser.add_argument(
        "--force-download",
        action="store_true",
        help="Re-download from Kaggle even if already present in the local kagglehub cache.",
    )
    args = parser.parse_args()

    # Where we want raw data to live in *our* project
    project_root = Path(__file__).resolve().parents[2]  # youtube-trending-app/
    raw_dir = project_root / "data" / "raw" / "youtube_trending_global"
    raw_dir.mkdir(parents=True, exist_ok=True)

    print(f"Downloading Kaggle dataset: {DATASET}")
    downloaded_path = Path(kagglehub.dataset_download(DATASET, force_download=args.force_download))
    print(f"Kagglehub cache location: {downloaded_path}")

    # Copy files from kagglehub cache -> our raw folder
    # (We do this so our project is self-contained and predictable)
    for item in downloaded_path.rglob("*"):
        if item.is_file():
            rel = item.relative_to(downloaded_path)
            dest = raw_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, dest)

    print(f"\nCopied raw files into: {raw_dir}")
    print("Files found:")
    for f in sorted(raw_dir.rglob("*")):
        if f.is_file():
            print(" -", f.relative_to(raw_dir))

if __name__ == "__main__":
    main()
