# Storyboard

Plan the video before anyone cuts it. A storyboard is a list of scenes, each with what is on screen and what is
heard. It is also where the founder decides how their video will differ from everything else in their customers'
feeds. Every new project starts with a blank one in `projects/<name>/storyboard.md` (`npm run new`).

## Look at your market again

Open the links saved while preparing (`projects/<name>/research.md`, from
[`../interview/PREP.md`](../interview/PREP.md)). With the transcript beside you, write down what the videos in your
space have in common: how they open, how they show the product, the music, the length, and the words everyone uses.
That list shows you where you can do something different.

## Questions to find your angle

- Does every video in your space open on the problem? You could open on a customer, or on the product working.
- Is it all founders talking to the camera? Show the product in use, your team at work, or your customer's world.
- What have you seen or built that nobody else in your space could talk about? Lead with it.
- Does everyone sound polished? You can sound like yourself.
- Where do you work? Footage from your workshop, your office, or a customer's site shows what a stock photo cannot.

## Sketch it scene by scene

Use the numbered sentences in the transcript (`npm run soundbites`). For each scene, write what is on screen (you,
your website, your app, a photo, a figure, or a card) and what is heard (a sentence number, a voiceover line, or
music). The Example Co. video has twelve scenes in 65 seconds:

| # | On screen | Heard |
|---|---|---|
| 1 | Title card: "Why I built Example Co." | Music |
| 2 | Sam on camera, with name and role | S1 to S2: who I am |
| 3 | Sam, then the website scrolling in a browser frame | S3 to S4: what we build |
| 4 | Sam on camera | S5: why |
| 5 | A figure card, with its source | Music |
| 6 | A screenshot of the app, with a caption | Music |
| 7 | Sam, then the app running in a phone frame | S6 to S7: who it is for, and why they should care |
| 8 | The app in a phone frame, with a title | A voiceover line |
| 9 | A how-to step, with a callout | Music |
| 10 | Sam on camera | S8: the ask |
| 11 | The website, with a QR code | Music |
| 12 | End card with the website and the music credit | Music |

`projects/example/cut.json` is the same plan, written for the editor.

## Record what is missing

A storyboard often shows a gap: a line the founder never said, or a product shot nobody has. Record the product
with the screen engine (`npm run record`, `npm run shoot`), or book a short second session for the missing lines.

## For the agent

When `storyboard.md` has scenes, follow it: one segment per scene, in its order, with its sentence numbers. Where a
scene has no recording yet, leave it out of the cut and list it for the founder. When it is blank, draft a
storyboard from the transcript and show it to the founder before you write `cut.json`.

## Blank storyboard

```markdown
# Storyboard: <video name>

Format: 9:16 / 16:9    Length: about 60 seconds

What everyone in our space does:
-

How ours is different:
-

| # | On screen | Heard | Have it? |
|---|---|---|---|
| 1 | Title card: | Music | |
| 2 | Me on camera, with name and role | S | |
| 3 | | | |
```
