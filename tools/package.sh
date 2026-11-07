#!/usr/bin/env bash
# Crea los .zip de entrega en release/: el juego para Windows y el código fuente.
# Requiere Node, Go 1.22+ y zip.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="$(node -p "require('./package.json').version")"

bash launcher/build.sh

OUT=release
STAGE="$OUT/stage/Eco"
rm -rf "$OUT/stage"
mkdir -p "$STAGE/licencias" "$STAGE/version-navegador"

cp launcher/dist/Eco.exe launcher/dist/WebView2Loader.dll launcher/extra/LEEME.txt "$STAGE/"
cp -r dist/web/. "$STAGE/version-navegador/"

# Licencias de todo lo que va dentro del ejecutable y de las fuentes
mod_dir() { (cd launcher && go list -m -f '{{.Dir}}' "$1"); }
cp assets/fonts/OFL-cormorant-garamond.txt "$STAGE/licencias/fuente-cormorant-garamond-OFL.txt"
cp assets/fonts/OFL-space-grotesk.txt "$STAGE/licencias/fuente-space-grotesk-OFL.txt"
cp launcher/dist/WebView2Loader-LICENSE.txt "$STAGE/licencias/WebView2Loader.txt"
cp "$(mod_dir github.com/jchv/go-webview2)/LICENSE" "$STAGE/licencias/go-webview2.txt"
cp "$(mod_dir github.com/jchv/go-winloader)/LICENSE.md" "$STAGE/licencias/go-winloader.txt"
cp "$(mod_dir golang.org/x/sys)/LICENSE" "$STAGE/licencias/golang-x-sys.txt"
cp "$(go env GOROOT)/LICENSE" "$STAGE/licencias/go.txt"
chmod -R u+rw,go+r "$STAGE"

WIN_ZIP="Eco-v$VERSION-Windows.zip"
SRC_ZIP="Eco-v$VERSION-codigo.zip"
rm -f "$OUT/$WIN_ZIP" "$OUT/$SRC_ZIP"
(cd "$OUT/stage" && zip -rq -X -9 "../$WIN_ZIP" Eco)

# Código fuente sin dependencias ni archivos generados
zip -rq -X -9 "$OUT/$SRC_ZIP" \
  README.md .gitignore package.json package-lock.json index.html styles.css \
  src tests tools assets dev docs \
  launcher/go.mod launcher/go.sum launcher/build.sh launcher/extra \
  launcher/server.go launcher/main_windows.go launcher/main_other.go

rm -rf "$OUT/stage"
ls -l "$OUT"
