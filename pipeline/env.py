"""Load keys from server/.env (Bookedz) and the project root .env into os.environ,
without overriding values that are already set. server/.env comes first so the API server
and the pipeline share one set of keys."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATHS = (ROOT / "server" / ".env", ROOT / ".env")
ENV_PATH = ENV_PATHS[-1]


def load_env(path=ENV_PATH):
    """Set KEY=VALUE pairs from path, skipping keys that are already set."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("export "):
            line = line[len("export "):].strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


for _path in ENV_PATHS:
    load_env(_path)
