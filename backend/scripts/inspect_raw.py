from pathlib import Path
import pandas as pd

def main():
    project_root = Path(__file__).resolve().parents[2]
    csv_path = project_root / "data" / "raw" / "youtube_trending_global" / "youtube_trending_videos_global.csv"

    print("Reading:", csv_path)
    df = pd.read_csv(csv_path, nrows=200)  # sample first 200 rows (fast)

    print("\n--- Columns ---")
    for c in df.columns:
        print("-", c)

    print("\n--- dtypes (sample-based) ---")
    print(df.dtypes)

    print("\n--- Head (5) ---")
    print(df.head(5))

    print("\n--- Missing values (top 15) ---")
    na = df.isna().mean().sort_values(ascending=False).head(15)
    print((na * 100).round(2).astype(str) + "%")

if __name__ == "__main__":
    main()
