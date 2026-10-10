#!/usr/bin/env bash
# Build server.mcpb for Smithery from a gen-image-mcp checkout (default: repo root, i.e. parent of smithery/).
# Does not modify the repo. Output: ./out/server.mcpb
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="${1:-$(cd "$HERE/.." && pwd)}"
STAGE="$HERE/out/stage"
rm -rf "$HERE/out" && mkdir -p "$STAGE"
(cd "$REPO" && npm run build >/dev/null)
mkdir -p "$STAGE/dist"
(cd "$REPO/dist" && find . -name '*.js' -exec cp --parents {} "$STAGE/dist/" \;)
cp "$REPO/package.json" "$REPO/package-lock.json" "$REPO/LICENSE" "$REPO/README.en.md" "$STAGE/"
cp "$HERE/manifest.json" "$STAGE/manifest.json"
mkdir -p "$STAGE/server" && cp "$HERE/server/launch.js" "$STAGE/server/launch.js"
# version in manifest must match package.json
PKGV=$(node -p "require('$STAGE/package.json').version"); MANV=$(node -p "require('$STAGE/manifest.json').version")
[ "$PKGV" = "$MANV" ] || { echo "version mismatch: package $PKGV vs manifest $MANV"; exit 1; }
(cd "$STAGE" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null)
# Smithery's serverCard requires tools[].inputSchema, but `mcpb pack` rejects keys beyond
# name/description. Pack with a stripped manifest, then swap the full manifest into the zip.
cp "$STAGE/manifest.json" "$HERE/out/manifest.full.json"
node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1]));m.tools=m.tools.map(t=>({name:t.name,description:t.description}));fs.writeFileSync(process.argv[1],JSON.stringify(m,null,2))' "$STAGE/manifest.json"
npx -y @anthropic-ai/mcpb@2.1.2 pack "$STAGE" "$HERE/out/server.mcpb"
python3 - "$HERE/out/server.mcpb" "$HERE/out/manifest.full.json" <<'PY'
import sys, zipfile, shutil
src, full = sys.argv[1], sys.argv[2]
tmp = src + ".tmp"
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = open(full, "rb").read() if item.filename == "manifest.json" else zin.read(item.filename)
        zout.writestr(item, data)
shutil.move(tmp, src)
PY
ls -la "$HERE/out/server.mcpb"
