/* The MCP server's tests: node --test mcp/ (npm test). They run the server on a copy of the kit in a temporary folder,
   so nothing in your projects changes, and they need only Node: no Chrome, ffmpeg, or whisper. */
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { writeProject } from '../engines/motion/motion.mjs';
import { checkCut } from './tools.mjs';
import { createJobs } from './jobs.mjs';
import { ROOT, createServer } from './server.mjs';

const textOf = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('the MCP server', () => {
  let root;
  let client;
  const call = (name, args = {}) => client.callTool({ name, arguments: args });

  before(async () => {
    root = mkdtempSync(join(tmpdir(), 'studio-kit-'));
    for (const p of ['package.json', 'AGENTS.md', 'README.md', 'engines', 'scripts', 'lib', 'brands', 'music/README.md']) cpSync(join(ROOT, p), join(root, p), { recursive: true });
    mkdirSync(join(root, 'projects', 'example'), { recursive: true });
    for (const f of ['cut.json', 'transcript.json', 'vo.json']) cpSync(join(ROOT, 'projects', 'example', f), join(root, 'projects', 'example', f));
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(root).connect(serverSide);
    client = new Client({ name: 'test', version: '0' });
    await client.connect(clientSide);
  });
  after(async () => {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('introduces itself with the kit\'s rules', () => {
    assert.equal(client.getServerVersion().name, 'embarc-studio');
    assert.match(client.getInstructions(), /Never invent a fact/);
    assert.match(client.getInstructions(), /exact words/);
    assert.match(client.getInstructions(), /job_status/);
  });

  it('lists every tool with a JSON Schema and annotations', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of ['get_status', 'create_project', 'import_media', 'read_file', 'write_file', 'transcribe', 'list_soundbites', 'record_website', 'screenshot', 'record_voiceover', 'cut_video', 'run_example', 'job_status']) assert.ok(names.includes(n), n);
    for (const t of tools) assert.equal(t.inputSchema.type, 'object', t.name);
    assert.equal(tools.find((t) => t.name === 'get_status').annotations.readOnlyHint, true);
    assert.equal(tools.find((t) => t.name === 'write_file').annotations.destructiveHint, true);
    assert.deepEqual(tools.find((t) => t.name === 'write_file').inputSchema.required, ['path', 'content']);
  });

  it('offers the workflows as prompts, filled in with their arguments', async () => {
    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map((p) => p.name), ['founder_video', 'prepare_session', 'storyboard', 'product_video', 'short_clips']);
    const { messages } = await client.getPrompt({ name: 'founder_video', arguments: { project: 'acme', website: 'acme.com' } });
    assert.equal(messages[0].role, 'user');
    assert.match(messages[0].content.text, /project "acme"/);
    assert.match(messages[0].content.text, /Record acme\.com scrolling/);
    assert.match(messages[0].content.text, /Use only my exact words/);
    await assert.rejects(client.getPrompt({ name: 'no_such_prompt', arguments: {} }), /No prompt named/);
  });

  it('serves the guides as resources', async () => {
    const { resources } = await client.listResources();
    assert.ok(resources.some((r) => r.uri === 'studio-kit://guide/AGENTS.md'));
    const { contents } = await client.readResource({ uri: 'studio-kit://guide/engines/interview/QUESTIONS.md' });
    assert.match(contents[0].text, /Who you are|who you are/);
    await assert.rejects(client.readResource({ uri: 'studio-kit://guide/../../etc/passwd' }), /No guide/);
  });

  it('reports the setup and each project with its next step', async () => {
    const r = await call('get_status');
    assert.match(textOf(r), /Setup \(npm run doctor\)/);
    assert.match(textOf(r), /example\/[\s\S]*transcript\.json: 8 sentences/);
    assert.match(textOf(r), /next: /);
  });

  it('starts a project with a blank storyboard, once', async () => {
    const r = await call('create_project', { name: 'acme' });
    assert.ok(!r.isError, textOf(r));
    assert.ok(existsSync(join(root, 'projects', 'acme', 'storyboard.md')));
    assert.ok(existsSync(join(root, 'projects', 'acme', 'cut.json')));
    const again = await call('create_project', { name: 'acme' });
    assert.equal(again.isError, true);
    assert.match(textOf(again), /already exists/);
    assert.equal((await call('create_project', { name: 'Not A Name' })).isError, true);
  });

  it('writes only inside projects/ and brands/, and only text', async () => {
    for (const [path, why] of [['../escape.json', /outside the kit/], ['AGENTS.md', /Only files inside projects/], ['projects/nope/cut.json', /no project "nope"/], ['projects/acme/footage/x.mp4', /Only .json/]]) {
      const r = await call('write_file', { path, content: '{}' });
      assert.equal(r.isError, true, path);
      assert.match(textOf(r), why, path);
    }
    const ok = await call('write_file', { path: 'projects/acme/research.md', content: '# Research\n' });
    assert.ok(!ok.isError, textOf(ok));
    assert.equal(readFileSync(join(root, 'projects', 'acme', 'research.md'), 'utf8'), '# Research\n');
  });

  it('refuses a cut that would break or put an unsourced figure or a false quote on screen, writing nothing', async () => {
    const base = JSON.parse(readFileSync(join(root, 'projects', 'example', 'cut.json'), 'utf8'));
    const tryCut = (segments) => call('write_file', { path: 'projects/example/cut-test.json', content: JSON.stringify({ ...base, segments }) });
    const stat = await tryCut([{ type: 'card', template: 'stat', data: { n: '40%', label: 'faster' } }]);
    assert.match(textOf(stat), /needs data\.source/);
    const quote = await tryCut([{ type: 'card', template: 'quote', data: { text: 'We double revenue every week.' } }]);
    assert.match(textOf(quote), /not in the transcript word for word/);
    const id = await tryCut([{ type: 'clip', src: 'footage/interview.mp4', from: 'S99' }]);
    assert.match(textOf(id), /"S99" is not a sentence/);
    const kind = await tryCut([{ type: 'slide' }]);
    assert.match(textOf(kind), /type is clip, card, or image/);
    const json = await call('write_file', { path: 'projects/example/cut-test.json', content: '{ not json' });
    assert.match(textOf(json), /not valid JSON/);
    assert.ok(!existsSync(join(root, 'projects', 'example', 'cut-test.json')));
    const good = await tryCut([{ type: 'card', template: 'quote', data: { text: 'I watched empty chairs cost our clinic real money every single week.', name: 'Sam Rivera' } }, ...base.segments]);
    assert.ok(!good.isError, textOf(good));
    assert.match(textOf(good), /Render it with cut_video/);
  });

  it('notes a card too short to read, without refusing it', () => {
    const { problems, notes } = checkCut({ segments: [{ type: 'card', template: 'title', dur: 1.5, data: { title: 'Why I built a scheduling app for dental clinics', sub: 'Sam Rivera, founder' } }] }, join(root, 'projects', 'acme', 'cut.json'));
    assert.deepEqual(problems, []);
    assert.match(notes.join(' '), /12 words need about 4\.1 s/);
  });

  it('renders a motion graphic only from a HyperFrames project', async () => {
    mkdirSync(join(root, 'projects', 'acme', 'motion', 'empty'), { recursive: true });
    const r = await call('render_motion', { project: 'acme', composition: 'projects/acme/motion/empty', file: 'chart' });
    assert.equal(r.isError, true);
    assert.match(textOf(r), /has no index\.html/);
    assert.match(textOf(await call('render_motion', { project: 'acme', composition: '../outside', file: 'chart' })), /outside the kit/);
  });

  it('checks a voiceover script', async () => {
    const bad = await call('write_file', { path: 'projects/acme/vo.json', content: JSON.stringify({ steps: [{ id: 'a b', text: '' }] }) });
    assert.equal(bad.isError, true);
    const good = await call('write_file', { path: 'projects/acme/vo.json', content: JSON.stringify({ voice: { engine: 'Kokoro-82M', voice: 'af_heart' }, steps: [{ id: 'intro', text: 'This is the waiting list.' }] }) });
    assert.ok(!good.isError, textOf(good));
  });

  it('reads guides, project files, and folders, and nothing outside the kit', async () => {
    assert.match(textOf(await call('read_file', { path: 'engines/interview/QUESTIONS.md' })), /\?/);
    assert.match(textOf(await call('read_file', { path: 'projects' })), /acme\/[\s\S]*example\//);
    assert.equal((await call('read_file', { path: '../../etc/hosts' })).isError, true);
    assert.equal((await call('read_file', { path: 'projects/acme/missing.md' })).isError, true);
  });

  it('brings a picture into a project, and refuses what the engines cannot read', async () => {
    const src = join(root, '..', `${Date.now()}-logo.png`);
    writeFileSync(src, PNG);
    try {
      const r = await call('import_media', { project: 'acme', source: src, name: 'logo.png' });
      assert.ok(!r.isError, textOf(r));
      assert.ok(existsSync(join(root, 'projects', 'acme', 'assets', 'logo.png')));
      assert.match(textOf(await call('import_media', { project: 'acme', source: src, name: 'logo.png' })), /already exists/);
      const exe = join(root, '..', `${Date.now()}-tool.exe`);
      writeFileSync(exe, 'x');
      assert.match(textOf(await call('import_media', { project: 'acme', source: exe })), /not a video, a sound file, or a picture/);
      rmSync(exe, { force: true });
    } finally {
      rmSync(src, { force: true });
    }
  });

  it('lists soundbites and card templates', async () => {
    assert.match(textOf(await call('list_soundbites', { project: 'example', find: 'chairs' })), /S5/);
    assert.match(textOf(await call('list_card_templates')), /stat\s+eyebrow/);
  });

  it('checks arguments before a tool runs', async () => {
    const r = await call('screenshot', { project: 'acme', url: 'ftp://example.com', file: 'site' });
    assert.match(textOf(r), /http or https/);
    assert.match(textOf(await call('cut_video', { project: 'acme', format: '4x3' })), /format must be one of/);
    assert.match(textOf(await call('get_status', { colour: 'red' })), /not an argument/);
    assert.match(textOf(await call('job_status', { job_id: 'job-999' })), /There is no job-999/);
  });
});

describe('the motion engine', () => {
  it('writes a HyperFrames project from a card, with the brand and its pictures copied in', () => {
    const dir = mkdtempSync(join(tmpdir(), 'motion-test-'));
    try {
      const photo = join(dir, 'step photo.png');
      writeFileSync(photo, PNG);
      writeProject({ template: 'step', format: '9x16', brand: join(ROOT, 'brands', 'example-co'), dur: 3.5, data: { num: 1, title: 'Send the opening', photo, callouts: [{ x: 50, y: 40, label: 'One tap' }] } }, join(dir, 'p'));
      const html = readFileSync(join(dir, 'p', 'index.html'), 'utf8');
      assert.match(html, /data-composition-id="root"[^>]*data-duration="3.5"/);
      assert.match(html, /<body class="motion /);
      assert.match(html, /href="brand\/brand\.css"/);
      assert.doesNotMatch(html, /file:\/\//);
      assert.ok(existsSync(join(dir, 'p', 'brand', 'brand.css')));
      assert.match(html, /src="media\/[0-9a-f]{8}-step-photo\.png"/);
      assert.throws(() => writeProject({ template: 'caption', format: '9x16', brand: join(ROOT, 'brands', 'example-co'), dur: 2, data: {} }, join(dir, 'q')), /no motion for "caption"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('jobs', () => {
  const jobs = createJobs({ cwd: tmpdir(), env: process.env });
  it('waits for a job, and hands it back still running when the wait runs out', async () => {
    const job = jobs.start({ label: 'sleep', cmd: process.execPath, args: ['-e', 'console.log("start"); setTimeout(() => console.log("end"), 600)'], finish: async () => ({ content: [{ type: 'text', text: 'finished' }] }) });
    await jobs.wait(job, 0.1);
    assert.equal(job.status, 'running');
    await jobs.wait(job, 10);
    assert.equal(job.status, 'done');
    assert.match(job.log, /start[\s\S]*end/);
    assert.equal(job.result.content[0].text, 'finished');
  });
  it('reports a failed command with its output', async () => {
    const job = jobs.start({ label: 'fail', cmd: process.execPath, args: ['-e', 'console.error("broken"); process.exit(3)'] });
    await jobs.wait(job, 10);
    assert.equal(job.status, 'failed');
    assert.equal(job.code, 3);
    assert.match(job.log, /broken/);
  });
  it('does not start the same job twice, and stops one on request', async () => {
    const a = jobs.start({ label: 'long', key: 'k', cmd: process.execPath, args: ['-e', 'setTimeout(() => {}, 30000)'] });
    const b = jobs.start({ label: 'long', key: 'k', cmd: process.execPath, args: ['-e', 'setTimeout(() => {}, 30000)'] });
    assert.equal(a, b);
    assert.ok(jobs.cancel(a));
    await jobs.wait(a, 10);
    assert.equal(a.status, 'cancelled');
  });
});

describe('the server over stdio', () => {
  it('starts from the command line and lists its tools, with nothing else on stdout', async () => {
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'mcp', 'server.mjs')], stderr: 'ignore' }));
    try {
      const { tools } = await client.listTools();
      assert.ok(tools.length >= 15);
    } finally {
      await client.close();
    }
  });
});
