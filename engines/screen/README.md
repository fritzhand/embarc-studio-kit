# The screen engine

Videos and screenshots of your website or web app, made by Chrome on your own computer, with no screen-recording
software. Put them in a browser or phone frame in the cut, among your interview soundbites and stills.

```bash
npm run record -- https://yoursite.com projects/<name>/footage/site-scroll.mp4                       # the page scrolling, top to bottom
npm run record -- https://yourapp.com/demo projects/<name>/footage/app.mp4 --mode live --seconds 6   # the page as it moves on its own
npm run record -- https://yoursite.com projects/<name>/footage/site-phone.mp4 --device phone         # a phone's view
npm run shoot -- https://yoursite.com projects/<name>/assets/site.png                                # a screenshot (--device phone too)
```

| Mode | Makes | Use it for |
|---|---|---|
| `scroll` (default) | The page scrolling smoothly from the top to the bottom (or `--to <px>`), holding a moment at each end. Every frame is placed exactly, so it never stutters | Your website, a landing page, a long product page |
| `live` | The page as it plays: frames captured as fast as the computer allows, each with its time, laid back at their real pace | An animation, a map turning, a dashboard filling in, a demo that runs on its own |

`--device desktop` is 1440 x 900; `--device phone` is 390 x 844 at 2x, with a phone's user agent, so a responsive
site shows its phone layout. `--wait` is how long to let the page settle first (2.5 s by default).

## In the cut

```json
{ "type": "clip", "src": "footage/interview.mp4", "from": "S3", "to": "S4",
  "over": [ { "src": "footage/site-scroll.mp4", "at": 3.8, "dur": 6.5,
              "frame": { "device": "browser", "url": "yoursite.com", "eyebrow": "The website", "title": "What we do", "caption": "One line about it." } } ] }
```

The founder keeps talking while the site scrolls in a browser frame, with a title and a caption beside it. A phone
recording goes in `"device": "phone"`. A clip or an image can carry a `frame` too.

For clicks and typing, record the screen yourself (QuickTime on a Mac, the Xbox Game Bar on Windows; notifications
off) and frame that recording the same way, or use the reel engine to script the page. A page behind a login, a
cookie banner, or a bot check records as that: watch every recording before you use it.

This is how the Embarc Collective Studio's own videos show live sites: a map turning in real time, a page scrolling
through its sections, each in a browser frame.
