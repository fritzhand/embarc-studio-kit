# The cut engine

Plan the video first in a storyboard ([`STORYBOARD.md`](./STORYBOARD.md)). `cut.py` then turns one `cut.json` into
a finished video: founder soundbites, product walkthroughs, screenshots and photos, and cards for the title,
figures, quotes and the close, with captions, a voiceover where you want one, and a music bed that ducks under
every spoken line.

```bash
npm run cut -- projects/<name>/cut.json                  # the cut's own format
npm run cut -- projects/<name>/cut.json --format 16x9    # the same cut, the other shape
npm run cut -- projects/<name>/cut.json --proof          # also a contact sheet: one frame per scene and cutaway
```

Output: `projects/<name>/out/<name>-<format>.mp4` (H.264, 30 fps, AAC, -14 LUFS), and with `--proof` a
`-proof.jpg` beside it. `build/` holds the drawn cards (reused between runs) and each scene's pieces.

## cut.json

```json
{
  "name": "founder-story",
  "format": "9x16",
  "brand": "../../brands/your-brand",
  "transcript": "transcript.json",
  "captions": true,
  "music": { "file": "../../music/inspired-kevin-macleod.mp3", "level": -21, "duck": 0.88, "credit": "..." },
  "segments": [ ... ]
}
```

| Key | Default | Is |
|---|---|---|
| `format` | `9x16` | `9x16` (1080 x 1920: Reels, Shorts, TikTok, Stories) or `16x9` (1920 x 1080: YouTube, LinkedIn, your site) |
| `brand` | `brands/example-co` | A brand folder: the same one the collateral builder uses |
| `transcript` | none | From `npm run transcribe`. Needed to pick soundbites by sentence and for captions |
| `captions` | on, with a transcript | Burned-in captions on every spoken soundbite, a few words at a time, with the word being spoken lit in the brand's accent. `{ "style": "plain" }` drops the highlight; `{ "words": 4 }` changes the group size (3 in 9:16, 6 in 16:9). Groups end at a sentence, at a pause, or at the limit, never leave one word on its own, and sit where Reels, Shorts, and TikTok leave room |
| `motion` | off | `true` animates the cards and the lower third ([`../motion/`](../motion/)); `false` on a segment keeps it still |
| `music` | none | `file`, `level` (LUFS between lines), `duck` (how far it drops under speech), `credit` (required for CC BY), `bpm` (below) |
| `loudness` | `-14` | The finished mix, in LUFS |
| `out` | `out/<name>-{format}.mp4` | Where the file goes |

## Segments

Segments play in order, joined by a short dissolve (a quicker one between two soundbites).

### `clip`: a soundbite or a piece of footage

```json
{ "type": "clip", "src": "footage/interview.mp4", "from": "S12", "to": "S14",
  "lower": { "name": "Sam Rivera", "role": "Founder, Example Co." },
  "over": [ { "src": "footage/walkthrough.mp4", "in": 3, "at": 2.5, "dur": 4 } ] }
```

| Key | Is |
|---|---|
| `src` | A video file |
| `from`, `to` | Sentence ids from the transcript (`npm run soundbites`). The clip runs from the start of `from` to the end of `to`, with a little air each side |
| `tighten` | On by default: a gap of more than 0.7 s between the picked sentences (a pause, or the host's next question) is cut out, on a jump cut. `false` keeps everything between |
| `in`, `out` | Seconds, in place of `from` and `to`, for footage that is not in the transcript |
| `audio` | `voice` (cleaned, leveled, music ducks; the default for soundbites), `room` (a low murmur; the default otherwise), `keep` (the clip's own sound), `mute` |
| `fit` | `cover` (fill the frame; the default) or `contain` (whole picture, on the brand's paper color or with `"bg": "blur"`) |
| `crop_x`, `crop_y` | Where a `cover` crop sits, 0 to 1 (0.5 is the middle). Move it if the founder is off-center in a 9:16 crop |
| `lower` | A name and role in the lower third: `name`, `role`, `at` (s, default 0.6), `dur` (default 4) |
| `over` | Cutaways: pictures that replace the founder on screen while the voice carries on (below) |
| `vo` | A voiceover file to play over this segment (from `npm run voice`); `vo_at` delays it |
| `captions` | `false` turns captions off for this clip |
| `frame` | Plays the clip inside a browser or phone frame, with words beside it (below) |

### Cutaways (`over`)

The founder keeps talking while the product is on screen. Most of a founder video is built this way.

| Key | Is |
|---|---|
| `src` | A video (a screen recording, product footage) or a picture (a screenshot, a photograph) |
| `card` | Instead of `src`: a card, for example `{ "template": "stat", "data": { ... } }` |
| `at`, `dur` | When it starts, in seconds from the start of the segment, and how long it stays |
| `in` | For a video: where in the file to start |
| `fit`, `bg` | `contain` by default, on a blurred copy of itself (`blur`) for video, the paper color for pictures |
| `zoom` | For a picture: `in` (the default), `out`, or `false` |
| `frame` | Shows it inside a browser or phone frame (below) |
| `overlay` | For a video with transparency (a WebM or ProRes 4444 MOV, such as a HyperFrames motion graphic): laid over the picture as it is, instead of filling the frame |

### `card`: a title, a figure, a quote, the close

```json
{ "type": "card", "template": "stat", "dur": 3,
  "data": { "eyebrow": "Since launch", "n": "1,200", "label": "clinics on the waiting list", "source": "Company records, Oct 2026" } }
```

`npm run cards -- --list` shows each template and its fields: `title`, `stat`, `quote`, `image`, `site` (a
screenshot of your website in a browser frame, with a QR code), `step` (a how-to step: a photo or screenshot with
callouts), and `end` (with `"qr": true`, a QR code to your URL).
`theme` picks the brand's `light`, `dark` or `accent` theme. A `*word*` in a title is set as a highlight. With
`vo`, a card lasts as long as its voiceover line.

### `image`: a photograph or screenshot on its own

```json
{ "type": "image", "src": "assets/team.jpg", "dur": 3, "fit": "cover", "caption": "The team in Tampa" }
```

Every still moves slowly: `zoom` is `in` (the default), `out`, or `false`; `zoom_amount` is how far, 0.06 by
default (6% over the hold). The caption stays still while the picture moves.

### Frames: your website and app on screen

```json
"frame": { "device": "browser", "url": "yoursite.com", "eyebrow": "The website", "title": "What we do", "caption": "One line about it." }
```

On a clip, an image, or a cutaway, `frame` lays the recording or picture into the screen of a browser (`"device":
"browser"`, the address bar shows `url`) or a phone (`"device": "phone"`), with the eyebrow, title, and caption
beside it in 16:9 and above it in 9:16. Make the recordings with the screen engine (`npm run record`, `npm run shoot`;
[`../screen/`](../screen/)). This is how the founder video mixes the interview with the website and the app.

### On the beat

With the music's tempo in the cut (`"bpm": 120` for the example track), every card and still is held a little
longer, never more than one beat, so the next scene comes in on a beat of the music. Soundbites keep their length.
`"downbeat"` (seconds into the track of the first beat, default 0) and `"snap": false` (off) fine-tune it.

## The checks it makes

The cut prints a warning, and still renders, when:

- a `stat` card has no `source`;
- a `quote` card's words are not in the transcript (a quote is the speaker's exact words);
- the music has no `credit`;
- a cutaway starts after its segment ends, or a clip has no sound;
- a card is not on screen long enough to read: about 0.5 s plus 0.3 s a word, and the last one at least 2 s (the hold
  HyperFrames measured from its own films).

Watch the whole video before you post it. The checks catch what a script can; they cannot hear a mumbled word
or see a bad frame.

## How it works

Each segment is rendered on its own (cards and captions are HTML drawn by Chrome in your brand, then laid over the
footage), the segments are joined with `xfade`, and the sound is assembled in numpy, sample by sample, so every
voice sits exactly under its picture. A still's slow push-in is rescaled every frame and eased at both ends. The
voice chain is a high-pass, light noise reduction, a presence lift, compression, and loudness normalization; the
music is leveled by measurement, not by ear. The Embarc Collective Studio cuts its highlight reels with this
editor.
