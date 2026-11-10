"""One-off script to strip Hindi keys, values, and Devanagari characters from seed JSON files.

Removes:
    - Keys ending with 'Hi' or '_hi', or equal to 'hi' (case-insensitive).
    - Replaces {en, hi} objects with the English value.
    - Strips parenthesized Devanagari expressions and stray Devanagari characters
      (U+0900 to U+097F) from English string values (e.g. 'Basal Dose (बुवाई के समय)').

Features:
    - Dry-run by default: reports how many keys would be removed without writing.
    - Writes files back only with the `--apply` flag (UTF-8, indent=2, ensure_ascii=False).
    - Pre-write safety audit: scans processed data and refuses to write if ANY Devanagari
      character (U+0900 to U+097F) would remain in any file, reporting file and path.
    - Final summary report.
    - Uses only the Python standard library.

Usage:
    Dry run (default):
        python -m backend.scripts.strip_hindi_from_seed
        # or: python backend/scripts/strip_hindi_from_seed.py

    Apply changes:
        python -m backend.scripts.strip_hindi_from_seed --apply
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple


def is_devanagari_char(c: str) -> bool:
    """Check if a character falls within the Devanagari Unicode block (U+0900 to U+097F)."""
    return "\u0900" <= c <= "\u097f"


def has_devanagari(text: str) -> bool:
    """Check if a string contains any character in the Devanagari Unicode block."""
    return any(is_devanagari_char(c) for c in text)


def is_hindi_key(key: str) -> bool:
    """Determine whether a dictionary key represents Hindi content."""
    k_lower = key.lower()
    return (
        key.endswith("Hi")
        or key.endswith("_hi")
        or k_lower.endswith("_hi")
        or k_lower in ("hi", "hi-in", "hi_in", "namehi", "soilhi", "idealsoilhi", "descriptionhi", "introtiphi")
        or has_devanagari(key)
    )


def clean_string_value(s: str) -> str:
    """Clean Hindi/Devanagari text out of an otherwise English string.

    Removes parenthesized expressions containing Devanagari (e.g. 'Basal Dose (बुवाई के समय)'
    becomes 'Basal Dose') as well as any isolated Devanagari characters, normalizing spaces.
    """
    if not has_devanagari(s):
        return s

    # 1. Remove parenthesized chunks that contain Devanagari characters
    cleaned = re.sub(r"\s*\([^)]*[\u0900-\u097f]+[^)]*\)", "", s)

    # 2. Strip any stray remaining Devanagari characters
    cleaned = re.sub(r"[\u0900-\u097f]+", "", cleaned)

    # 3. Collapse multiple spaces and trim
    cleaned = re.sub(r"  +", " ", cleaned).strip()
    return cleaned


def clean_node(node: Any) -> Tuple[Any, int]:
    """Recursively clean an object, removing Hindi keys and Devanagari content.

    Args:
        node: JSON data structure (dict, list, str, or scalar).

    Returns:
        Tuple[Any, int]: (cleaned_data, count_of_removed_keys).
    """
    if isinstance(node, dict):
        # Case: {en, hi} language pair dictionary
        en_keys = [k for k in node if k.lower() in ("en", "en-in", "en_in")]
        hi_keys = [k for k in node if is_hindi_key(k) or k.lower() in ("hi", "hi-in", "hi_in")]
        if en_keys and hi_keys and len(node) <= len(en_keys) + len(hi_keys):
            sub_val, sub_rem = clean_node(node[en_keys[0]])
            return sub_val, sub_rem + len(hi_keys)

        cleaned_dict: Dict[str, Any] = {}
        removed_count = 0
        for key, val in node.items():
            if is_hindi_key(key):
                removed_count += 1
                continue
            cleaned_val, sub_rem = clean_node(val)
            cleaned_dict[key] = cleaned_val
            removed_count += sub_rem
        return cleaned_dict, removed_count

    elif isinstance(node, list):
        cleaned_list: List[Any] = []
        removed_count = 0
        for item in node:
            cleaned_item, sub_rem = clean_node(item)
            cleaned_list.append(cleaned_item)
            removed_count += sub_rem
        return cleaned_list, removed_count

    elif isinstance(node, str):
        return clean_string_value(node), 0

    return node, 0


def find_devanagari_leftovers(obj: Any, path: str = "$") -> List[Tuple[str, str]]:
    """Scan data structure and return list of (path, snippet) containing Devanagari characters."""
    leftovers: List[Tuple[str, str]] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            curr = f"{path}.{k}"
            if has_devanagari(k):
                leftovers.append((curr, f"[key: {k}]"))
            leftovers.extend(find_devanagari_leftovers(v, curr))
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            curr = f"{path}[{idx}]"
            leftovers.extend(find_devanagari_leftovers(item, curr))
    elif isinstance(obj, str):
        if has_devanagari(obj):
            leftovers.append((path, obj))
    return leftovers


def collect_seed_files(seed_dir: Path) -> List[Path]:
    """Collect all JSON files in the seed directory and subdirectories."""
    files: List[Path] = []
    # Direct json files in seed_dir (e.g. states.json)
    for p in sorted(seed_dir.glob("*.json")):
        if p.is_file():
            files.append(p)
    # Crop json files in seed_dir / crops
    crops_dir = seed_dir / "crops"
    if crops_dir.is_dir():
        for p in sorted(crops_dir.glob("*.json")):
            if p.is_file():
                files.append(p)
    return files


def run(seed_dir: Path, apply_changes: bool) -> int:
    """Execute the seed cleanup workflow.

    Args:
        seed_dir: Path to backend/data/seed directory.
        apply_changes: True to write changes to disk; False for dry-run.

    Returns:
        int: Exit code (0 for success, 1 on error/leftovers).
    """
    if not seed_dir.is_dir():
        print(f"Error: Seed directory not found: {seed_dir}", file=sys.stderr)
        return 1

    files = collect_seed_files(seed_dir)
    if not files:
        print(f"Error: No JSON seed files found in {seed_dir}", file=sys.stderr)
        return 1

    mode_label = "APPLY MODE" if apply_changes else "DRY-RUN MODE (pass --apply to write files)"
    print(f"=== KisanSathi Seed Cleanup [{mode_label}] ===")
    print(f"Target directory: {seed_dir}")
    print(f"Found {len(files)} JSON files.\n")

    cleaned_payloads: Dict[Path, Any] = {}
    total_removed_keys = 0
    all_leftovers: List[Tuple[Path, str, str]] = []

    for fpath in files:
        with open(fpath, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

        cleaned_data, removed_keys = clean_node(raw_data)
        cleaned_payloads[fpath] = cleaned_data
        total_removed_keys += removed_keys

        # Check for remaining Devanagari characters
        leftovers = find_devanagari_leftovers(cleaned_data)
        for pth, snip in leftovers:
            all_leftovers.append((fpath, pth, snip))

        action_text = f"would remove {removed_keys} keys" if not apply_changes else f"removed {removed_keys} keys"
        print(f"  [{fpath.relative_to(seed_dir)}] {action_text}")

    print()
    if all_leftovers:
        print("ERROR: Leftover Devanagari (U+0900 to U+097F) character(s) detected after processing!", file=sys.stderr)
        print("Refusing to write any files to preserve data integrity.\n", file=sys.stderr)
        for fpath, pth, snip in all_leftovers:
            print(f"  File: {fpath.relative_to(seed_dir)}", file=sys.stderr)
            print(f"  Path: {pth}", file=sys.stderr)
            print(f"  Snippet: {snip!r}\n", file=sys.stderr)
        return 1

    # If apply_changes, write files back
    if apply_changes:
        for fpath, data in cleaned_payloads.items():
            with open(fpath, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write("\n")
        print(f"SUCCESS: Successfully cleaned and wrote {len(cleaned_payloads)} seed files.")
    else:
        print(f"DRY-RUN COMPLETE: Verified clean output for {len(cleaned_payloads)} files.")
        print("No files were written. Re-run with `--apply` to commit changes.")

    print(f"Summary: {len(files)} files processed, {total_removed_keys} Hindi keys/values stripped.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Strip Hindi keys, values, and Devanagari characters from KisanSathi seed files."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write cleaned output back to seed JSON files (default is dry-run).",
    )
    parser.add_argument(
        "--seed-dir",
        type=Path,
        default=None,
        help="Override path to seed directory (defaults to backend/data/seed).",
    )
    args = parser.parse_args()

    if args.seed_dir:
        seed_dir = args.seed_dir.resolve()
    else:
        # Default: <repo_root>/backend/data/seed
        seed_dir = Path(__file__).resolve().parent.parent / "data" / "seed"

    sys.exit(run(seed_dir, apply_changes=args.apply))


if __name__ == "__main__":
    main()
