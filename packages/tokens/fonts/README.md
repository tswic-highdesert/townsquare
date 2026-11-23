# Typefaces

`packages/tokens` self-hosts every typeface the shell and the guest frame use,
so no third party sits in the load path (the reasoning is in DEVELOPING.md).
Each face is under the SIL Open Font License 1.1, and its license text sits
next to it.

| File | Family | Source | License |
| --- | --- | --- | --- |
| `newsreader.woff2` | Newsreader | https://github.com/productiontype/Newsreader | `newsreader-OFL.txt` |
| `dm-sans.woff2` | DM Sans | https://github.com/googlefonts/dm-fonts | `dm-sans-OFL.txt` |
| `dm-mono-400.woff2`, `dm-mono-500.woff2` | DM Mono | https://github.com/googlefonts/dm-mono | `dm-mono-OFL.txt` |
| `libre-baskerville.woff2` | Libre Baskerville | https://github.com/impallari/Libre-Baskerville | `libre-baskerville-OFL.txt` |
| `nunito-sans.woff2` | Nunito Sans | https://github.com/googlefonts/NunitoSans | `nunito-sans-OFL.txt` |

The same DM Sans, DM Mono and Newsreader files are copied into
`design/hifi-v2/fonts/` and `coalition/site/fonts/` for the static mockups
and the coalition site; this folder holds their license texts. The brand
lockup generator in `brand/` carries its own copy of Libre Baskerville with
`brand/_fonts/OFL.txt`, and the design system keeps Nunito Sans with
`design/system/assets/nunito-sans-OFL.txt`.

Icons in the shell are [Phosphor](https://phosphoricons.com) via
`@phosphor-icons/react` (MIT); the license copy the design system was built
from is `design/system/assets/Phosphor-LICENSE.txt`. The Town Square mark
and wordmark in `brand/` are the project's own.
