# The narrated tour overlay

A **Demo** button for your website: a launcher card, then a spotlight tour of the page with a voice, captions, and
a music bed. The page scrolls and changes on cue while the narrator explains each part. Visitors hear your product
explained on the product itself.

It lives in [fritzhand/history-of-block-printing](https://github.com/fritzhand/history-of-block-printing)
(`js/demo.js`, `css/demo.css`, `tools/demo-*.mjs`; CC0) and is documented in
[`REUSE.md`](https://github.com/fritzhand/history-of-block-printing/blob/main/REUSE.md), section 2.

```bash
npm run engines:fetch          # copies it to vendor/history-of-block-printing/ (not committed)
```

## Adding it to your site

1. Mark what the tour can point at: `data-tour="pricing"` on a section.
2. Write the steps (`data/demo/script.source.json`): each step's words, its target, and what the page does.
3. Record the voice with [`../voice/`](../voice/) (the tour uses the same pipeline and script format).
4. Copy `js/demo.js` and `css/demo.css` into your site, rename the `Print*` names, and add a button that loads them.
5. Run `tools/validate-demo.mjs`: it fails if a step points at something that is not on the page.

A screen recording of the tour, played through once, also makes a ready product walkthrough for a founder cut.
Ask your agent: *"Read engines/tour/README.md and the REUSE guide, then add a narrated Demo tour to our homepage
covering the four sections of our product."*
