# The interview engine

Record the conversation, then turn it into numbered sentences an agent can pick from.

| File | Is |
|---|---|
| [`PREP.md`](./PREP.md) | How the founder prepares in the week before: watch the market, write, practice, memorize |
| [`QUESTIONS.md`](./QUESTIONS.md) | The seeded interview: 18 questions in six parts (who you are, what you build, why, who it is for, why they should care, closing) |
| [`RUN-OF-SHOW.md`](./RUN-OF-SHOW.md) | The 45-minute studio session, minute by minute, and the extra footage worth shooting |
| `transcribe.mjs` | A recording in, `transcript.json` out: every sentence (`S1`, `S2`…) and word, with times |
| `soundbites.mjs` | The transcript as a numbered list, with `--find` to search it |

```bash
npm run transcribe -- projects/<name>/footage/interview.mp4 projects/<name>/transcript.json --list
npm run soundbites -- projects/<name>/transcript.json --find "customer"
```

## Set up

Transcription runs on your computer with [whisper.cpp](https://github.com/ggml-org/whisper.cpp); nothing is uploaded.

- macOS: `brew install whisper-cpp ffmpeg`
- Then a model: `mkdir -p ~/.cache/whisper && curl -L -o ~/.cache/whisper/ggml-small.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin`
- `npm run doctor` checks both.

`--model` (or `WHISPER_MODEL`) points at another model; `ggml-medium.en.bin` hears names better and runs slower.

## How the times are made

Whisper places the start of a sentence well and its end late, sometimes by a second. `transcribe.mjs` snaps each
sentence's start to the end of the silence just before it, and ends the sentence at the last real silence before
the next one starts, measured from the sound itself. A soundbite cut by sentence therefore starts and ends in a
pause. Words move with their sentence, so captions stay in step.

**It is a machine transcript.** It mishears names, and it can put a word in someone's mouth. Check every name,
figure and quote against the recording before it goes on screen.
