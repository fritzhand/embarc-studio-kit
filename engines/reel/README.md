# The reel engine

A vertical video (1080 x 1920) recorded from your live website or web app, frame by frame, with a voiceover,
captions timed to the words, music, and an end card. Use it for a product video that is the real product, and that
you can remake whenever the product changes.

It lives in [fritzhand/history-of-block-printing](https://github.com/fritzhand/history-of-block-printing)
(`reel/`, CC0), where it was built, and is documented there in
[`REUSE.md`](https://github.com/fritzhand/history-of-block-printing/blob/main/REUSE.md), section 3.

```bash
npm run engines:fetch          # copies it to vendor/history-of-block-printing/ (not committed)
```

## Making a product reel

1. **Script.** Write the lines in `reel/script.source.json`: a hook, three or four things the product does, the
   ask. Each line names what the page shows while it is spoken.
2. **Control API.** The recorder drives the page through `window.PrintApp` (scroll to a section, open a panel,
   move a slider). Give your page the few methods your script needs; `REUSE.md` section 2.3 lists them.
3. **Voice.** The reel uses the same Kokoro voice pipeline as [`../voice/`](../voice/).
4. **Record, align, assemble.** `record.mjs` captures the page at 30 fps with virtual time, so nothing stutters;
   `align.mjs` times the captions to the words with whisper.cpp; `assemble.mjs` mixes the voice and music at -14
   LUFS and writes the MP4.
5. **Use it.** Post the reel as it is, or drop it into a founder cut as a cutaway or a clip:
   `{ "type": "clip", "src": "../../vendor/.../reel/out/reel.mp4", "audio": "keep" }`.

Needs Node 20+, Chrome, Playwright 1.49 (`npm i playwright` in any folder), ffmpeg, whisper.cpp, and Kokoro.
Ask your agent: *"Read engines/reel/README.md and vendor/history-of-block-printing/REUSE.md, then make a 45-second
reel of https://our-product.com that shows the three things in our one-pager."*
