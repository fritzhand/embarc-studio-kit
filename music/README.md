# music/

Audio files are not committed. Each track has a download script and a row here with its license.

| Track | Artist | License | Fetch | Credit (required in the video and the post) |
|---|---|---|---|---|
| "Inspired" (first 150 s) | Kevin MacLeod, incompetech.com | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), checked 18-Nov-2026 | `node music/fetch-music.mjs` | "Inspired" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 https://creativecommons.org/licenses/by/4.0/ |

## Adding a track

Use music you have the right to use: CC0, public domain, CC BY (credit it), or a track you licensed. Check the license on the
artist's own page, add a row above with the date you checked, and name the track and its credit in your cut:

```json
"music": { "file": "../../music/your-track.mp3", "level": -21, "duck": 0.88, "credit": "..." }
```

`level` is how loud the bed sits between lines (LUFS; -21 is under a voice, -16 is a music-led reel). `duck` is how far it drops
under speech (0.88 leaves 12%).
