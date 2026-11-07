#!/usr/bin/env bash
# Empaqueta Eco como Eco.exe para Windows (x64). Requiere Go 1.22+.
set -euo pipefail
cd "$(dirname "$0")"

# El ejecutable sirve la versión empaquetada del juego (siempre recién compilada)
(cd .. && node tools/build-web.mjs)
rm -rf game && mkdir -p game
cp -r ../dist/web/. game/
cp ../assets/icon-256.png ../assets/icon-32.png .

WINRES="$(go env GOPATH)/bin/go-winres"
[ -x "$WINRES" ] || go install github.com/tc-hib/go-winres@latest
"$WINRES" simply --arch amd64 --icon ../assets/icon-256.png --manifest gui \
  --product-name "Eco" --file-description "Eco - una historia contada en ecos" \
  --product-version 1.0.0.0 --file-version 1.0.0.0 --original-filename Eco.exe \
  --copyright "Hecho por Claude para pepe"

mkdir -p dist
# Cargador oficial de WebView2 (licencia BSD) junto al .exe: así no hace falta cargarlo desde memoria.
LOADER_DIR="$(go list -m -f '{{.Dir}}' github.com/jchv/go-webview2)/webviewloader/sdk"
install -m 0644 "$LOADER_DIR/x64/WebView2Loader.dll" dist/WebView2Loader.dll
install -m 0644 "$LOADER_DIR/LICENSE.txt" dist/WebView2Loader-LICENSE.txt
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o dist/Eco.exe .
echo "Listo: $(pwd)/dist/Eco.exe ($(du -h dist/Eco.exe | cut -f1))"
