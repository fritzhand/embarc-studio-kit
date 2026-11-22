# AGENTS.md: operating manual for the Embarc Collective Studio kit

You are working in a repo that turns a founder's studio recording into finished content: a founder video, short
clips for social, product videos with a voiceover, and the posts and one-pagers that go with them. Read this file
before you touch anything. *(`CLAUDE.md` and any other agent file point here; this is the single source.)*

The person you are working for is probably a founder, not an editor or a developer. They will say what they want in
plain words. Do the work, show them pictures of the result (the `-proof.jpg` contact sheets), and say plainly what
is finished and what is not.

## The engines

| Engine | Folder | Makes | Run |
|---|---|---|---|
| Interview | `engines/interview/` | The seeded questions and the run of show; a recording into numbered sentences with times | `npm run transcribe`, `npm run soundbites` |
| Cut | `engines/cut/` | The finished video from `cut.json`: soundbites, cutaways, cards, captions, voiceover, music | `npm run cut` |
| Cards | `engines/cards/` | Titles, figures, quotes, how-to steps with callouts, the website with a QR code, captions, lower thirds, end cards, in the brand (the cut calls it) | `npm run cards` |
| Screen | `engines/screen/` | Videos of a website or web app (scrolling, or live) and screenshots, desktop or phone, for browser and phone frames | `npm run record`, `npm run shoot` |
| Voice | `engines/voice/` | An open-source voiceover, one checked take per line | `npm run voice` |
| Reel | `engines/reel/` → `vendor/` | A vertical video recorded from a live website | see its README |
| Tour | `engines/tour/` → `vendor/` | A narrated Demo button for a website | see its README |
| Collateral | `engines/collateral/` → `vendor/` | Posts, slides, flyers, one-pagers in five formats | see its README |

`npm run doctor` checks the tools. `npm run example` runs the whole video pipeline on a fictional founder; run it
once on a new machine to see that everything works.

## Where things go

```
brands/<brand>/            brand.css, BRAND.md, assets/: one brand drives video cards and collateral alike
projects/<name>/
├── footage/               the recordings (not committed: video is large and may show people)
├── assets/                screenshots, photos, logos for this project
├── transcript.json        from npm run transcribe (not committed by default: it holds what people said)
├── cut.json               the edit: you write this
├── vo.json, vo/           voiceover lines, and their takes
├── build/                 working files (not committed)
└── out/                   the finished videos and contact sheets (not committed)
music/                     download scripts and licenses; the audio itself is not committed
vendor/                    the collateral builder and the reel and tour engines (npm run engines:fetch)
```

Start a project with `npm run new -- <name> --brand <brand>`.

## Workflows

### Founder video (the main one)

1. **Record.** The founder books a studio and records the seeded interview
   (`engines/interview/QUESTIONS.md`, `RUN-OF-SHOW.md`). Footage goes in `projects/<name>/footage/`.
2. **Transcribe.** `npm run transcribe -- projects/<name>/footage/interview.mp4 projects/<name>/transcript.json --list`
3. **Pick soundbites.** Read the whole transcript (`npm run soundbites -- projects/<name>/transcript.json`). For each
   part of the story, pick the sentence or run of sentences that says it best and stands alone:
   who they are → what they build → why → who it is for → why those people should care → the ask.
   A 60-second cut is five or six soundbites; a 2-minute cut is ten or twelve.
4. **Record the product.** `npm run record` the website (scrolling) and the app (live, or a phone view), and
   `npm run shoot` the screenshots a step or the site card needs. Ask the founder for their own screen recordings
   of anything that needs clicks, and for photographs.
5. **Write `cut.json`** (`engines/cut/README.md` is the schema). Mix the interview with the product: open with a
   title card, put a lower third on the first soundbite, and wherever the founder describes the product, lay the
   website or app recording over the voice in a browser or phone frame (`frame`). Between soundbites, use stills
   (they move slowly), a step with a callout, a figure card with its source, and close on the website with a QR
   code and an end card with the URL and the music credit. Give the music's `bpm` so cards land on the beat.
6. **Render and look.** `npm run cut -- projects/<name>/cut.json --proof`, then open the `-proof.jpg` and check
   every frame: captions readable, nothing cropped badly, the right picture over the right words.
7. **Both shapes.** `--format 16x9` makes the landscape version from the same cut.
8. **Hand over** the MP4s and the contact sheets, with a list of anything you could not confirm.

### Short clips

One soundbite, or two, per clip: 15 to 30 seconds, 9:16, captions on, a title card only if it helps. Write each as
its own `cut-<topic>.json` beside `cut.json`; the output is named after the file.

### Product or service deep dive

Three to five minutes on one product or service: what it is, who it is for, how it works step by step, and what it
costs or how to start. Pick the founder's soundbites about it, record the product in use (`npm run record`, or the
founder's own screen recording), make a `step` card for each step with a callout on the screenshot, and narrate any
gaps with a voiceover. 16:9 for YouTube, LinkedIn, and the website; a 60-second 9:16 version for social.

### Podcast episodes (a tutorial on the way)

The full conversation as an episode for podcast platforms and YouTube: an opening card, chapters at each question,
the founder's best line as the cover quote, and three or four clips. The engines here already do the parts (the
transcript gives the chapters and the clips); the workflow is being written.

### Product video with a voiceover

Write the lines in `vo.json`, record them (`npm run voice`), and put each take on a segment over a walkthrough or
screenshot (`"vo": "vo/<id>.mp3"`, `"audio": "mute"` on the walkthrough). For a video recorded from the live site,
use the reel engine. For a guided tour on the site itself, the tour engine.

### Collateral

Share the brand (`node scripts/share-brand.mjs <brand>`) and work in `vendor/collateral-builder/` by its own
`AGENTS.md`. Quote cards and carousels come from the transcript, in the founder's exact words.

## The rules

1. **Never invent a fact.** Every name, title, figure, date, and claim on screen comes from the recording, from the
   founder, or from a file they gave you. A `stat` card needs a `source`; the cut warns without one. If you do not
   have a fact, leave the card out and say so.
2. **Quotes are exact words.** A quote card or caption repeats what the person said, as they said it. Never tidy a
   quote or attach a name to words the person did not say. The cut warns when a quote card is not in the transcript.
3. **Check the transcript against the recording** for names and numbers before they go on screen. Speech
   recognition mishears.
4. **Rights.** Use music, photos, and footage the founder has the right to use. Credit CC BY music on the end card
   and in the post. Show customers, logos, or other people only with permission.
5. **Look before you hand over.** Render with `--proof` and look at the contact sheet. Say what you checked and what
   you did not.
6. **Keep footage out of git.** `.gitignore` already excludes footage, builds, outputs, transcripts, and audio.
   Commit cut files, voiceover scripts, and brands.
7. **Plain language** on screen and in captions. Short lines. No jargon the founder did not use.

## Commands

```bash
npm run doctor                                   # what is installed
npm run example                                  # the full pipeline on a fictional founder
npm run new -- <name> --brand <brand>            # a new project folder
npm run transcribe -- <video> <transcript.json> --list
npm run soundbites -- <transcript.json> [--find words]
npm run voice -- <vo.json> [--engine say]
npm run cards -- --list | --sample <brand dir>
npm run record -- <url> <out.mp4> [--mode scroll|live] [--device phone]
npm run shoot -- <url> <out.png> [--device phone]
npm run cut -- <cut.json> [--format 16x9] [--proof]
npm run music                                    # the example soundtrack (CC BY 4.0)
npm run engines:fetch                            # the collateral builder, the reel and tour engines, into vendor/
```
