# The cards engine

Titles, figures, quotes, captions, lower thirds, and end cards, drawn as HTML in your brand and saved as PNGs.
The cut engine calls it for you. Run it yourself to proof a card:

```bash
npm run cards -- --list                       # templates and their fields
npm run cards -- --sample brands/<brand>      # one of each, both formats, into build/cards-sample/
npm run cards -- jobs.json                    # [{ template, data, format, brand, out, theme }]
```

| Template | Fields |
|---|---|
| `title` | `eyebrow`, `title` (a `*word*` is highlighted), `sub` |
| `stat` | `eyebrow`, `n` (the figure), `label`, `source` (required; the card shows "Source needed" without it) |
| `quote` | `text` (the speaker's exact words), `name`, `role` |
| `image` | `src`, `caption`, `fit` |
| `end` | `line`, `url`, `qr` (`true` for a QR code to the url, or another link), `qrLabel`, `small` (the music credit goes here) |
| `site` | `eyebrow`, `title`, `body`, `url`, `shot` (a screenshot: `npm run shoot`), `qr` |
| `step` | `num`, `eyebrow`, `title`, `body`, `photo`, `callouts` (`[{ x, y, label, dir, len }]`: x and y in percent of the photo; `dir` left, right, up, or down) |
| `screen` | A browser or phone frame; the cut engine draws it for a `frame` and lays the recording into it |
| `lower` | `name`, `role` (transparent, over the speaker) |
| `caption` | `text` (transparent, over video), or `words` and `active`: the group, with the word being spoken lit in the accent (the cut makes one per word) |

QR codes need Python's `segno` (`pip3 install segno`). A screenshot for a `site` card or a step:
`npm run shoot -- <url> <out.png>` (`--device phone` for a phone's view).

The brand is the collateral builder's brand contract (`brands/README.md`): `brand.css` sets the colors, fonts and
logo; the cards use `--paper`, `--ink`, `--ink-muted`, `--accent`, `--font-display`, `--font-body`, and `.logo`.
A card in the `dark` or `accent` theme uses that theme's colors. Needs Chrome or Chromium (`CHROME_PATH`).
