#!/usr/bin/env bash
# Скачивает минимальный набор файлов Swiss Ephemeris для pyswisseph
set -euo pipefail

EPHE_DIR="${1:-$(dirname "$0")/../ephe}"
mkdir -p "$EPHE_DIR"
cd "$EPHE_DIR"

BASE="https://www.astro.com/ftp/swisseph/ephe"

for file in sepl_18.se1 semo_18.se1 seasm18.se1; do
  if [ ! -f "$file" ]; then
    echo "Downloading $file ..."
    curl -fsSL "$BASE/$file" -o "$file"
  else
    echo "Already exists: $file"
  fi
done

echo "Ephemeris files ready in $EPHE_DIR"
