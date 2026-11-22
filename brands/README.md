# Brands

A brand is one folder, and it is the same format as the
[collateral builder](https://github.com/fritzhand/collateral-builder)'s, so one folder styles your video cards and
your posts.

```
brands/<brand>/
├── brand.css      colors, fonts, weights, logo files, for three themes: light, dark, accent
├── BRAND.md       the rules, and where each value came from
└── assets/        logo files, and fonts/ (woff2, fonts.css, licenses)
```

`example-co/` is a fictional brand that ships with the kit so everything renders out of the box.

## Adding yours

The fastest way is the collateral builder's: `npm run engines:fetch`, then in `vendor/collateral-builder/` run
`npm run brand:from-site -- https://yoursite.com yourbrand` (or `npm run new -- brand yourbrand` to start from
files), and copy the finished folder back here. Or copy `example-co/` and change its values.

What the video cards use from `brand.css`:

| Token | For |
|---|---|
| `--paper`, `--ink`, `--ink-muted` | backgrounds and text, per theme |
| `--accent` | eyebrows, highlighted words, the big figure on a stat card |
| `--font-display`, `--font-body` | headlines, and everything else |
| `.logo` (`--logo-ratio`) | the logo on title and end cards; `.theme-dark .logo` for the dark theme |
| `--scrim` | the shade behind a caption on a photograph |

Check it with `npm run cards -- --sample brands/<brand>` and open `build/cards-sample/`.
