#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

IMPLEMENTATION_DOC="docs/IMPLEMENTATION.md"

if [ ! -f "$IMPLEMENTATION_DOC" ]; then
  echo "Missing required documentation file: $IMPLEMENTATION_DOC"
  exit 1
fi

# Stale-signature checks for unrelated content that should not exist in this repository.
if grep -Eiq "\.NET MAUI|Emotional App|FeedPage\.xaml|Post\.cs|Microsoft\.Maui" "$IMPLEMENTATION_DOC"; then
  echo "Stale documentation detected in $IMPLEMENTATION_DOC."
  echo "Found signatures from an unrelated .NET MAUI project."
  exit 1
fi

# Basic repository-consistency checks.
if ! grep -Eiq "Empathetic Communication|AWS CDK|Lambda|React|Bedrock" "$IMPLEMENTATION_DOC"; then
  echo "$IMPLEMENTATION_DOC does not appear to describe this repository's architecture."
  exit 1
fi

echo "Docs consistency checks passed."
