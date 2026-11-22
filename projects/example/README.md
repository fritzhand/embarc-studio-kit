# The example project

A **fictional** founder of the fictional Example Co., so every engine can run before you record anything. No real
person, company, or figure appears in it.

`npm run example` makes it all: it speaks `founder-lines.json` into a stand-in interview, records Example Co.'s
fictional website and app (`site/`) scrolling and running, takes screenshots of both (`footage/`), transcribes the
interview (`transcript.json`), records the voiceover in `vo.json`, and renders `cut.json` in 9:16 and 16:9 with a
contact sheet each (`out/`).

`cut.json` shows each kind of segment: a title card, soundbites picked by sentence (two of them tightened across a
pause), a lower third, the website scrolling in a browser frame and the app running in a phone frame over the
founder's voice, a figure card with its source, a captioned screenshot with a slow push-in, the app with a
voiceover, a how-to step with a callout, the website with a QR code, and an end card with a QR code and the music
credit. The music's tempo is set, so the cards land on the beat. `"motion": true` animates the cards and the lower
third (HyperFrames, downloaded the first time), and the captions light up each word as it is spoken.
