#!/bin/zsh
# _render.sh <input.svg|html> <out.png> <W> <H>
IN="$1"; OUT="$2"; W="${3:-600}"; H="${4:-600}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 \
  --default-background-color=00000000 \
  --screenshot="$OUT" --window-size="$W,$H" "file://$IN" >/dev/null 2>&1
echo "rendered $OUT ($(du -h "$OUT" 2>/dev/null|cut -f1))"
