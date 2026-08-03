#!/bin/zsh
# exact-size render (device-scale 1): _render1.sh <in.svg> <out.png> <size>
IN="$1"; OUT="$2"; S="$3"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --default-background-color=00000000 --screenshot="$OUT" --window-size="$S,$S" "file://$IN" >/dev/null 2>&1
