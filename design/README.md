# WAK brand assets

`references/` holds the files supplied by the creative owner:
- `wak-logo-badge.png` – the main badge logo (used directly in the app)
- `wak-moodboard-brand.png`, `wak-moodboard-app.png` – brand and app direction

`public/brand/` is generated from them by `npm run brand:extract`:
- **wak-badge.png** – the supplied logo with its background removed
- **wak-wordmark(-cream).png**, **wak-letters(-cream).png** – the W.A.K wordmark, cut from the moodboard
- **sticker-*.png**, **mascot.png** – stickers and the running-can mascot, cut from the moodboard sticker sheet

## Needed from the creative owner
The wordmark, stickers and mascot are cut from a moodboard image, so they are low resolution
(roughly 100–400 px) and slightly soft on large screens. Please supply, if they exist:
1. The logo badge, wordmark and "WEIRD, ART, KLUB" lettering as **SVG** (or AI/PDF).
2. The mascot and stickers (can, eyes, peace hand, star, W.A.K bubble) as SVG or large transparent PNGs.
3. The name of the typeface used for the wordmark/lettering, if it is a font (the app currently uses
   *Fredoka* for headings/UI and *Patrick Hand* as a hand-lettered accent, both open-source and self-hosted).

Drop them into `public/brand/` with the same file names and the app will pick them up.

## Tokens
| Token | Hex | Use |
| --- | --- | --- |
| cobalt | `#1015B9` | Primary, text, borders |
| orange | `#FF6500` | Calls to action (always with cobalt text, never white) |
| cream | `#FFF7E9` | Background |
| lavender | `#C8B4EB` | Secondary surfaces, selected states |

A live reference of all components is at `/stilguide` when running `npm run dev`.
