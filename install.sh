#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

CODE="${CODE:-/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code}"
NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
PUBLISHER=$(node -p "require('./package.json').publisher")
VSIX="${NAME}-${VERSION}.vsix"

npx --yes @vscode/vsce package --out "$VSIX"

"$CODE" --uninstall-extension "${PUBLISHER}.${NAME}" || true
"$CODE" --install-extension "$VSIX" --force

echo "Reinstalled ${PUBLISHER}.${NAME}@${VERSION}. Reload your VS Code window."
