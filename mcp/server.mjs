#!/usr/bin/env node
/* server.mjs: the studio kit's MCP server. It lets an AI assistant (Claude Desktop, Claude Code, Cursor, any MCP client)
   run the kit's engines through tools (mcp/tools.mjs), start from the kit's workflows (mcp/prompts.mjs), and read the
   kit's guides as resources, over stdio. Setup and the list of tools: mcp/README.md.

     node mcp/server.mjs          serve (an MCP client starts it)
     node mcp/server.mjs --list   print the tools, prompts, and guides, and exit

   It works on the kit it lives in, whatever the working directory. stdout carries the protocol, so nothing else is
   written to it while serving. */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema, ErrorCode, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema, ListToolsRequestSchema, McpError, ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PROMPTS, getPrompt } from './prompts.mjs';
import { INSTRUCTIONS, Refused, checkInput, mcpAnnotations, studioTools } from './tools.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The kit's guides, offered as resources. */
export const GUIDES = [
  ['AGENTS.md', 'The kit\'s manual', 'How the kit works, the workflows, and the rules an agent keeps'],
  ['engines/interview/PREP.md', 'Prepare for the studio', 'Watch your market, write your answers, practice, memorize'],
  ['engines/interview/QUESTIONS.md', 'The interview questions', 'Eighteen seeded questions in six parts'],
  ['engines/interview/RUN-OF-SHOW.md', 'The studio session', 'The session minute by minute, and the extra footage worth shooting'],
  ['engines/cut/STORYBOARD.md', 'Storyboard', 'How to plan the video scene by scene, with a blank storyboard'],
  ['engines/cut/README.md', 'The editor', 'The cut.json schema: soundbites, cutaways, cards, frames, captions, music'],
  ['engines/cards/README.md', 'The cards', 'Titles, figures, quotes, how-to steps, the website card, end cards'],
  ['engines/screen/README.md', 'Recording a website', 'Scrolling and live recordings, desktop or phone, and screenshots'],
  ['engines/voice/README.md', 'The voiceover', 'The open-source voice, and checking each take'],
  ['engines/interview/README.md', 'The transcriber', 'Setting up whisper.cpp, and how the times are made'],
  ['brands/README.md', 'Your brand', 'The brand folder that styles cards and collateral'],
  ['music/README.md', 'Music', 'The example soundtrack and its license'],
  ['README.md', 'The kit', 'What the kit is and how to start'],
];
const uri = (path) => `studio-kit://guide/${path}`;
const failed = (message) => ({ isError: true, content: [{ type: 'text', text: message }] });

/** The MCP server for the kit at `root`, not yet connected to a transport. */
export function createServer(root = ROOT) {
  root = realpathSync(root); // the engines compare their own path with the one they were started with
  const tools = studioTools(root);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const server = new Server(
    { name: 'embarc-studio', title: 'Embarc Collective Studio kit', version },
    { capabilities: { tools: {}, prompts: {}, resources: {} }, instructions: INSTRUCTIONS },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: mcpAnnotations(t) })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = byName.get(request.params.name);
    if (!tool) return failed(`No tool named "${request.params.name}".`);
    const input = { ...(request.params.arguments ?? {}) };
    const problems = checkInput(tool.inputSchema, input);
    if (problems.length) return failed(`${tool.name}: ${problems.join('; ')}.`);
    try {
      return await tool.run(input, { request, extra });
    } catch (e) {
      // A refusal or a failed engine is the assistant's to fix: it goes back as the tool's result.
      return failed(e instanceof Refused ? e.message : `${tool.name} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PROMPTS.map(({ name, title, description, arguments: args }) => ({ name, title, description, arguments: args })),
  }));
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const prompt = getPrompt(request.params.name, request.params.arguments);
    if (!prompt) throw new McpError(ErrorCode.InvalidParams, `No prompt named "${request.params.name}".`);
    return prompt;
  });
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: GUIDES.filter(([path]) => existsSync(join(root, path))).map(([path, title, description]) => ({ uri: uri(path), name: path, title, description, mimeType: 'text/markdown' })),
  }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const guide = GUIDES.find(([path]) => uri(path) === request.params.uri);
    if (!guide || !existsSync(join(root, guide[0]))) throw new McpError(ErrorCode.InvalidParams, `No guide at ${request.params.uri}.`);
    return { contents: [{ uri: request.params.uri, mimeType: 'text/markdown', text: readFileSync(join(root, guide[0]), 'utf8') }] };
  });
  server.onclose = () => tools.jobs.killAll();
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--list')) {
    for (const t of studioTools(ROOT)) console.log(`${t.name.padEnd(22)} ${t.title}`);
    for (const p of PROMPTS) console.log(`${p.name.padEnd(22)} ${p.title} (a prompt)`);
    for (const [path, title] of GUIDES) console.log(`${uri(path).padEnd(48)} ${title} (a guide)`);
  } else {
    const server = createServer();
    const stop = () => { server.close().catch(() => {}).finally(() => process.exit(0)); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    process.stdin.on('end', stop);
    await server.connect(new StdioServerTransport());
    console.error(`embarc-studio MCP server: serving ${ROOT} over stdio`);
  }
}
