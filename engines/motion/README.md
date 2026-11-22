# The motion engine

Cards that move. With `"motion": true` in a cut, the title, figure, quote, how-to step, website, and end cards play as
short animations instead of still pictures, and the lower third slides in over the speaker. They are drawn from the
same templates and the same brand folder as the still cards, so nothing about your brand changes except that it moves.

```json
{ "name": "founder-story", "motion": true, "segments": [ ... ] }
```

`"motion": false` on a segment, or on its `lower`, keeps that one still.

The animations are rendered by [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0), an open-source
framework that turns HTML and CSS animation into video by seeking every frame in headless Chrome, so the same cut
always gives the same frames. It runs on your computer, uses your own Chrome and ffmpeg, and downloads with npx the
first time a cut asks for motion (about a minute). The kit turns its usage telemetry off. Without it, or offline, the
cut uses the still cards and says so.

```bash
npm run motion -- --check                            # is HyperFrames available?
npm run motion -- --sample brands/your-brand         # one of each animated card, into build/motion-sample/
npm run motion -- --sample brands/your-brand --format 16x9
```

## What moves, and how

The moves follow the motion defaults HyperFrames measured from its own films:

| Card | Its move |
|---|---|
| Title | The logo and eyebrow blur in, then the headline arrives one word at a time (67 ms apart) and stays still |
| Figure | The number settles into place, then the label and the source |
| Quote | Each word goes from light gray to full ink at reading pace, then the name |
| How-to step | The photo settles, then each callout's ring opens and its label appears |
| Website | The browser settles into place beside the words, then the QR code |
| End card | The logo, the line word by word, the address, then the QR code |
| Lower third | Slides in with a blur and holds, as a transparent overlay on the speaker |

Every card leaves with a quick blur in its last fifth of a second. Arrivals land on a long ease, exits are shorter,
and nothing loops, floats, or bounces: a title that has landed stays still.

## Your own motion graphics

For anything the kit's cards do not draw (a chart, kinetic type, a map), build a HyperFrames project and render it:
its own [skills](https://github.com/heygen-com/hyperframes#skills) teach a coding agent how (`npx skills add
heygen-com/hyperframes`), and its catalog has ready-made blocks (`npx hyperframes add data-chart`). Keep it in the
project, such as `projects/<name>/motion/chart/`, then:

```bash
npx hyperframes render projects/<name>/motion/chart --output projects/<name>/footage/chart.mp4
npx hyperframes render projects/<name>/motion/chart --format webm --output projects/<name>/footage/chart.webm
```

An MP4 plays as a clip or a cutaway. A WebM keeps its transparency, so it can lie over the picture:

```json
"over": [ { "src": "footage/chart.webm", "overlay": true, "at": 2, "dur": 4 } ]
```

Through the kit's MCP server, the `render_motion` tool does the same and shows a frame of the result.

## Why HyperFrames, and not Remotion

[Remotion](https://www.remotion.dev) renders video from React and is the older, larger project. Its license is free
for individuals, non-profits, and companies of up to three people; a larger company needs a paid company license.
Founders' companies grow past three people, and this kit is meant for them, so the kit uses HyperFrames, which is
Apache-2.0 with no fees or company-size threshold, and plain HTML, the same as the kit's cards.
