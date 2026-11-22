# The MCP server

The kit's engines as tools for an AI assistant. With the server connected, you can ask Claude Desktop, Claude Code,
Cursor, or any [MCP](https://modelcontextprotocol.io) client to transcribe your interview, draft the storyboard,
record your website, and cut the video, and it runs the kit on your computer. You never open a terminal.

The server runs the same scripts as the npm commands, so a tool does exactly what its command does. Your recordings
stay on your computer. Your assistant sees the transcripts, the files it reads, and the pictures the tools return,
under the terms of the assistant you use.

## Set it up

You need the kit's tools installed first (the [README](../README.md#what-it-needs), then `npm run doctor`), Node 22
or later, and `npm install` once in the kit's folder. Then point your client at `mcp/server.mjs`. It works on the kit
it lives in, whatever folder the client starts it from.

- **Claude Code.** Open the kit's folder: its `.mcp.json` names the server, and Claude Code asks to turn it on the
  first time. Or, from anywhere: `claude mcp add embarc-studio -- node /path/to/embarc-studio-kit/mcp/server.mjs`.
- **Claude Desktop.** Settings, Developer, Edit Config, and add the server:

  ```json
  { "mcpServers": { "embarc-studio": { "command": "node", "args": ["/path/to/embarc-studio-kit/mcp/server.mjs"] } } }
  ```

  Claude Desktop does not read your terminal's settings, so if it cannot find `node`, give its full path as
  `command` (`which node` prints it, often `/opt/homebrew/bin/node` on a Mac). Restart Claude Desktop afterward.
- **Cursor, VS Code, and others.** The same command and argument in their MCP settings.
- **Codex.** In `~/.codex/config.toml`:

  ```toml
  [mcp_servers.embarc-studio]
  command = "node"
  args = ["/path/to/embarc-studio-kit/mcp/server.mjs"]
  ```

`npm run mcp -- --list` prints the tools, prompts, and guides without starting the server. `npm test` runs its tests.

## The tools

| Tool | What it does |
|---|---|
| `get_status` | Start here. What is installed (the kit's doctor), the projects with what each one has, and the next step for each. |
| `create_project` | Starts `projects/<name>/` with a blank storyboard, a cut to fill in, and a voiceover script (`npm run new`). |
| `import_media` | Copies a recording, a screen recording, a photo, or a logo from your computer into a project, and shows a frame of it. |
| `read_file` | Reads a guide, a project's files, or a picture. |
| `write_file` | Writes a cut, a storyboard, a voiceover script, research notes, or a brand's files, inside `projects/` and `brands/` only. |
| `transcribe` | The interview as numbered sentences with times (`npm run transcribe`). |
| `list_soundbites` | The sentences, or only those holding some words (`npm run soundbites`). |
| `record_website` | A video of a website scrolling, or of a page as it moves, desktop or phone (`npm run record`), and a frame of it. |
| `screenshot` | A screenshot of a page, desktop or phone (`npm run shoot`), returned as a picture. |
| `list_card_templates` | The card templates and their fields (`npm run cards -- --list`). |
| `record_voiceover` | Speaks each line of a voiceover script and checks each take (`npm run voice`). |
| `cut_video` | Renders a cut in 9:16 or 16:9 with its contact sheet (`npm run cut -- --proof`), returned as a picture. With `"motion": true` in the cut, the cards animate. |
| `run_example` | The whole pipeline on the fictional founder (`npm run example`). |
| `render_motion` | Renders a HyperFrames project the assistant built (a chart, kinetic type) into footage: MP4, or WebM with transparency to lie over the picture. |
| `job_status`, `cancel_job` | Wait for a long job, or stop one. |
| `fetch_music`, `fetch_engines`, `share_brand` | The example soundtrack, the collateral and reel and tour engines, and a brand shared with the collateral builder. |

## The prompts

Step-by-step guides an assistant starts from. In Claude Code they are slash commands, such as
`/mcp__embarc-studio__founder_video acme acme.com`; in Claude Desktop they are under the + button.

| Prompt | What it does |
|---|---|
| `founder_video` | From the studio recording to the finished founder video: transcribe, storyboard, record the website, cut, and check, in both shapes. |
| `prepare_session` | The week before recording: watch your market, write your answers in your own words, practice, and learn your opening line and your close. |
| `storyboard` | After the first session: what the videos in your market have in common, how yours will differ, and the plan scene by scene. |
| `product_video` | A short narrated video of your website or app. |
| `short_clips` | Clips of 15 to 30 seconds, each one or two soundbites that make sense on their own. |

The kit's guides (the manual, the preparation, the questions, the storyboard, the cut's schema) are also offered as
resources, so you can attach one to a conversation.

## What the server guarantees

- **Files change only where they should.** `write_file` writes text files inside `projects/<name>/` and
  `brands/<name>/`, and nothing else in the kit. `import_media` copies into a project's `footage/` or `assets/` and
  never replaces a file unless asked.
- **A cut is checked before it is saved.** A cut that names a sentence the transcript does not have, a stat card with
  no source, or a quote card whose words are not in the transcript is refused, and nothing is written. `cut_video`
  checks again before it renders.
- **The assistant sees what it made.** Screenshots, a frame of every recording, and the contact sheet of every cut come
  back as pictures, so it can look before it hands anything over.
- **Long jobs do not stall.** A cut or a transcript can take minutes, longer than a client waits for one tool call.
  Each long tool waits up to `wait_seconds` (45 by default, or `STUDIO_MCP_WAIT`), then hands back a job id while the
  work carries on, and `job_status` waits for it again. Clients that ask for progress get it as the job runs.

What no tool can check, the server's instructions ask of the assistant: never invent a fact, keep a quote word for
word, check names and figures with the founder, and look at every contact sheet.

## A session, start to finish

1. "Help me prepare for my studio session about Acme." (`prepare_session`)
2. After the session: "My recording is ~/Downloads/acme-interview.mov. Start a project called acme." (`create_project`,
   `import_media`)
3. "Transcribe it." (`transcribe`)
4. "Storyboard a 60-second founder video. Here are three videos from companies in our space." (`storyboard`,
   `write_file`)
5. "Record acme.com scrolling, and our app on a phone at app.acme.com." (`record_website`)
6. "Cut it, show me the contact sheet, then make the 16:9 version." (`write_file`, `cut_video`, `job_status`)
