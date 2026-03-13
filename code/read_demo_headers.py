from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from demoparser2 import DemoParser

ROOT_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT_DIR / "data" / "raw"
PROCESSED_DIR = ROOT_DIR / "data" / "processed"


def normalize_event_names(events: Any) -> list[str]:
    names: set[str] = set()

    if isinstance(events, dict):
        for key in events.keys():
            names.add(str(key))
    elif isinstance(events, list):
        for item in events:
            if isinstance(item, str):
                names.add(item)
            elif isinstance(item, dict):
                for key in item.keys():
                    names.add(str(key))

    return sorted(names)


def collect_processed_files(map_name: str) -> list[str]:
    map_dir = PROCESSED_DIR / map_name
    if not map_dir.exists():
        return []
    return sorted(path.name for path in map_dir.iterdir() if path.is_file())


def collect_demo_summary(demo_path: Path) -> dict[str, Any]:
    parser = DemoParser(str(demo_path))
    header = parser.parse_header()
    event_names = normalize_event_names(parser.list_game_events())
    map_name = str(header.get("map_name", "unknown"))

    return {
        "file_name": demo_path.name,
        "file_size_mb": round(demo_path.stat().st_size / (1024 * 1024), 2),
        "header": header,
        "event_count": len(event_names),
        "event_names": event_names,
        "processed_files": collect_processed_files(map_name),
    }


def print_text_report(summaries: list[dict[str, Any]], event_sample_size: int) -> None:
    print(f"Found {len(summaries)} demo files in {RAW_DIR}")

    for summary in summaries:
        header = summary["header"]
        print("\n" + "=" * 72)
        print(summary["file_name"])
        print("=" * 72)
        print(f"file_size_mb: {summary['file_size_mb']}")
        print("header:")
        for key in sorted(header.keys()):
            print(f"  {key}: {header[key]}")
        print(f"event_count: {summary['event_count']}")
        print(f"event_sample: {summary['event_names'][:event_sample_size]}")
        print(f"processed_files: {summary['processed_files']}")


def main() -> None:
    arg_parser = argparse.ArgumentParser()
    arg_parser.add_argument("--json", action="store_true", dest="as_json")
    arg_parser.add_argument("--event-sample-size", type=int, default=20)
    args = arg_parser.parse_args()

    demo_paths = sorted(RAW_DIR.glob("*.dem"))
    if not demo_paths:
        raise FileNotFoundError(f"No .dem files found in {RAW_DIR}")

    summaries = [collect_demo_summary(path) for path in demo_paths]

    if args.as_json:
        print(json.dumps(summaries, indent=2, ensure_ascii=False))
        return

    print_text_report(summaries, args.event_sample_size)


if __name__ == "__main__":
    main()
