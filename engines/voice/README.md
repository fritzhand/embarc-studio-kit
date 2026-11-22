# The voice engine

An open-source narrator for product videos, walkthroughs, and cards: one checked MP3 per line of a script.

```bash
npm run voice -- projects/<name>/vo.json            # speak the lines that changed
npm run voice -- projects/<name>/vo.json --check    # list lines with no current take
npm run voice -- projects/<name>/vo.json --engine say   # a quick draft in the computer's own voice (macOS)
```

```json
{
  "voice": { "engine": "Kokoro-82M", "voice": "af_heart", "speed": 1.0 },
  "pronounce": { "SaaS": "sass", "Tampa": "Tam-pa" },
  "steps": [ { "id": "walkthrough", "text": "Here is the waiting list. One tap sends the opening to everyone on it." } ]
}
```

Takes go to `vo/<id>.mp3` beside `vo.json`. Use one on a segment: `"vo": "vo/walkthrough.mp3"`.

- **The voice** is [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)'s `af_heart` (Apache-2.0 code and
  weights): it runs on a laptop and is not a copy of anyone's voice. Other voices: `am_michael`, `af_bella`,
  `bf_emma` (British); the model card lists them all.
- **Only changed lines are re-recorded.** A take carries a hash of its words and voice.
- **Each take is checked**: transcribed back with whisper.cpp and compared with its line, letters only. The check
  catches a dropped or changed word, not a wrong emphasis. Listen to every take.
- **Write numbers as you want them said** ("twelve hundred", "two thousand twenty-six"); `pronounce` respells names.

## Set up Kokoro (once)

```bash
python3.11 -m venv .venv
.venv/bin/pip install kokoro soundfile
.venv/bin/python -m spacy download en_core_web_sm
```

If Kokoro asks for `espeak-ng`, install it (`brew install espeak-ng`). To use a Python elsewhere, set
`VOICE_PYTHON=/path/to/python`.

`speak.py` and `voice-script.mjs` come from
[fritzhand/history-of-block-printing](https://github.com/fritzhand/history-of-block-printing) (CC0), where this
pipeline narrates a guided tour and a reel; see [`../reel/`](../reel/) and [`../tour/`](../tour/).
