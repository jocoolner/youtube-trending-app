import os
from pathlib import Path
from contextlib import contextmanager
import duckdb

def _resolve_db_path() -> Path:
    """
    Resolve DUCKDB_PATH relative to the backend/ folder, not the current working directory.
    This makes it stable no matter how you run Flask.
    """
    backend_dir = Path(__file__).resolve().parents[2]  # .../backend
    db_rel = os.getenv("DUCKDB_PATH", "../data/processed/trending.duckdb")
    return (backend_dir / db_rel).resolve()

@contextmanager
def get_conn(read_only: bool = True):
    db_path = _resolve_db_path()
    con = duckdb.connect(str(db_path), read_only=read_only)
    try:
        yield con
    finally:
        con.close()
