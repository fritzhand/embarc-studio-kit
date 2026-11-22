/* prompts.mjs: the kit's workflows as MCP prompts, step-by-step guides an assistant starts from (Claude Code lists
   them as slash commands, Claude Desktop under the + button). They follow AGENTS.md: prepare, record, transcribe,
   storyboard, then cut, with the founder's own words and nothing invented. */

/** An argument as a prompt uses it: one line, 100 characters at most, or `fallback`. */
const arg = (value, fallback = '') => {
  const s = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 100) : '';
  return s || fallback;
};
const RULES = 'Use only my exact words. Put no name, figure, or claim on screen that I did not give you, and give every figure its source. Stop and ask me whenever something is unclear.';

export const PROMPTS = [
  {
    name: 'founder_video',
    title: 'Make my founder video',
    description: 'From the studio recording to a finished founder video: transcribe, storyboard, record the website, cut, and check the contact sheet, in 9:16 and 16:9.',
    arguments: [
      { name: 'project', description: 'The project, such as "acme" (a new one is started if it does not exist).', required: false },
      { name: 'website', description: 'The company website to show, such as acme.com.', required: false },
      { name: 'length', description: 'How long, such as 60 seconds (default) or 90 seconds.', required: false },
    ],
    text: (a) => {
      const project = arg(a.project);
      const website = arg(a.website);
      const length = arg(a.length, '60 seconds');
      return `Make my founder video${project ? ` in the project "${project}"` : ''} with the embarc-studio tools, about ${length} long. ${RULES}

1. Start with get_status. ${project ? `If "${project}" does not exist, create_project it.` : 'Ask me for a short project name, and create_project it if it is new.'}
2. The recording. If footage/ has no interview, ask me where the file is and bring it in with import_media (name it interview.<ext>). If I have not recorded yet, we use the prepare_session prompt first.
3. transcribe it, then read every sentence with list_soundbites. Check names and figures with me: speech recognition mishears.
4. The storyboard. If storyboard.md has scenes, follow it. If not, draft one as engines/cut/STORYBOARD.md describes: the sentence or run of sentences that best answers each part, in order: who I am, what we build, why, who it is for, why they should care, and the ask (five or six soundbites for 60 seconds). Tell me what the videos in my market have in common (research.md, if I made one) and how mine will differ. Wait for my yes, then save it with write_file.
5. The product. ${website ? `Record ${website} scrolling with record_website and screenshot what a how-to step or the site card needs.` : 'Ask me for our website, record it scrolling with record_website, and screenshot what a how-to step or the site card needs.'} Look at every frame and picture the tools return. Ask me for screen recordings of anything that needs clicks, and for photographs.
6. Write cut.json with write_file (read_file engines/cut/README.md is the schema). A title card; a lower third with my name and role on my first soundbite; the website or app in a browser or phone frame whenever I describe the product; stills, a how-to step, and a figure card with its source between soundbites; then the website with a QR code and the end card with the URL and the music credit. Give the music's bpm so cards land on the beat.
7. cut_video, then look at every frame of the contact sheet: captions readable, nothing cropped badly, the right picture over the right words. Fix and render again until it is right, then render the other shape (format 16x9).
8. Hand over the paths of both videos and their contact sheets, with a list of anything you could not confirm.`;
    },
  },
  {
    name: 'prepare_session',
    title: 'Prepare for my studio session',
    description: 'The week before recording: watch what your market posts, write your answers to the seeded questions in your own words, practice them out loud, and learn your opening line and your close.',
    arguments: [
      { name: 'company', description: 'Your company.', required: false },
      { name: 'project', description: 'The project, to save your research notes in it.', required: false },
    ],
    text: (a) => {
      const company = arg(a.company);
      const project = arg(a.project);
      return `Help me prepare for my studio session${company ? ` about ${company}` : ''}. Read the kit's preparation guide (read_file engines/interview/PREP.md) and the questions (read_file engines/interview/QUESTIONS.md) first.

1. Watch my market. Ask me for links to videos from companies in my space and from founders my customers follow. For each one, help me note how it opens, how long it runs, what is on screen while the founder talks, and what everyone seems to say.${project ? ` Save the notes to projects/${project}/research.md with write_file.` : ''}
2. Write my answers. Go through the questions one part at a time. I answer in my own words, and you help me shorten them. Never add a figure, a customer, or a claim I did not give you. Keep each answer to 30 to 90 seconds read aloud (about 150 words a minute).
3. My two fixed lines: one sentence on what the company does, and my close (our website, and what people should do next). Help me get each one short enough to learn word for word.
4. Practice. Ask me to read each answer out loud and time it, and tell me which ones run long.
5. Remind me to send my host the questions, but not my answers, a day ahead.

Do not write a script for me to read on camera. The aim is that I know my points and say them in my own words.`;
    },
  },
  {
    name: 'storyboard',
    title: 'Storyboard my video',
    description: 'After the first session: find what the videos in your market have in common, choose how yours will differ, and plan the video scene by scene from your transcript.',
    arguments: [{ name: 'project', description: 'The project, such as "acme".', required: true }],
    text: (a) => {
      const project = arg(a.project, '<the project>');
      return `Draft the storyboard for "${project}" with the embarc-studio tools. Read engines/cut/STORYBOARD.md first (read_file).

1. Read the transcript with list_soundbites, and projects/${project}/research.md if it exists.
2. Write down what the videos in my market have in common: how they open, how they show the product, the music, the length, the words everyone uses. Then propose two or three ways mine can be different, using the questions in STORYBOARD.md.
3. Draft the scenes. For each: what is on screen (me, the website, the app, a photo, a figure, a card) and what is heard (a sentence id, a voiceover line, or music), in the order: who I am, what we build, why, who it is for, why they should care, the ask. Mark any scene that has no recording yet.
4. Show me the draft. Save it to projects/${project}/storyboard.md with write_file only after I agree.

Use only sentences I actually said, by their ids.`;
    },
  },
  {
    name: 'product_video',
    title: 'Make a product video',
    description: 'A short narrated video of your website or app: record it scrolling and running, write and record a voiceover, and cut it with your URL at the end.',
    arguments: [
      { name: 'project', description: 'The project, such as "acme".', required: true },
      { name: 'website', description: 'The website or web app, such as https://acme.com.', required: false },
    ],
    text: (a) => {
      const project = arg(a.project, '<the project>');
      const website = arg(a.website);
      return `Make a short product video for "${project}"${website ? ` of ${website}` : ''} with the embarc-studio tools. ${RULES}

1. get_status, and create_project if the project is new.
2. Record ${website || 'the website (ask me for the address)'} scrolling with record_website (mode scroll), and a page that moves on its own, such as the app, with mode live (device phone for a phone view). Look at the frame each recording returns.
3. Write the voiceover lines in vo.json with write_file: a few short lines on what the viewer sees, in plain words, with no claim or figure I did not give you. Show me the lines before you record them.
4. record_voiceover (engine say makes a quick draft on a Mac; the default open-source voice is the one to post).
5. Write cut.json: the recordings in browser or phone frames, each with its voiceover line ("vo": "vo/<id>.mp3", "audio": "mute"), and an end card with the URL. cut_video, and look at the contact sheet before you hand it over.`;
    },
  },
  {
    name: 'short_clips',
    title: 'Cut short clips',
    description: 'Clips of 15 to 30 seconds for social, each one or two soundbites that make sense on their own, in 9:16 with captions.',
    arguments: [
      { name: 'project', description: 'The project, such as "acme".', required: true },
      { name: 'count', description: 'How many clips (default 3).', required: false },
    ],
    text: (a) => {
      const project = arg(a.project, '<the project>');
      const count = arg(a.count, '3');
      return `Cut ${count} short clips from "${project}" with the embarc-studio tools. Each is one soundbite, or two, of 15 to 30 seconds, in 9:16 with captions, and makes sense to someone who did not hear the question. ${RULES}

1. Read the sentences with list_soundbites and propose the clips: their sentence ids, and why each one stands alone. Wait for my pick.
2. Write each as projects/${project}/cut-<topic>.json with write_file (the video is named after the file), with a title card only if it helps.
3. Render each with cut_video (cut: "cut-<topic>.json") and look at every contact sheet before you hand them over.`;
    },
  },
];

/** A prompt as MCP's prompts/get returns it, or null when there is none by that name. */
export function getPrompt(name, args = {}) {
  const prompt = PROMPTS.find((p) => p.name === name);
  if (!prompt) return null;
  return { description: prompt.description, messages: [{ role: 'user', content: { type: 'text', text: prompt.text(args ?? {}) } }] };
}
