/* jobs.mjs: the long engines (transcribe, record, voice, cut, the example) run as jobs.

   A cut takes minutes, and an MCP client stops waiting for a tool call after about a minute. So a tool starts a job
   and waits for it up to wait_seconds. A job that runs longer keeps going in the background, and job_status waits for
   it again. Each job keeps its own output, so a failure comes back with the lines that explain it. */
import { spawn } from 'node:child_process';

const MAX_LOG = 200_000;
const clean = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r(?!\n)/g, '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** The last `n` lines a job printed. */
export function tail(job, n = 40) {
  const lines = job.log.split('\n').map((l) => l.trimEnd()).filter(Boolean);
  return lines.slice(-n).join('\n');
}

/** A job runner for commands run in `cwd` with `env`. */
export function createJobs({ cwd, env }) {
  const jobs = new Map();
  let n = 0;

  /** Starts `cmd args` as a job. `finish(job)` builds the result once the command succeeds. A job with the same `key`
      as one still running is not started twice: the running one is returned. */
  function start({ label, cmd, args, key, finish }) {
    if (key) for (const j of jobs.values()) if (j.key === key && j.status === 'running') return j;
    const id = `job-${++n}`;
    const job = { id, key, label, started: Date.now(), ended: null, status: 'running', code: null, log: '', result: null, child: null };
    let settle;
    job.done = new Promise((r) => (settle = r));
    const add = (d) => { job.log = (job.log + clean(d.toString())).slice(-MAX_LOG); };
    let closed = false;
    const close = async (code) => {
      if (closed) return;
      closed = true;
      job.code = code;
      let status = job.cancelled ? 'cancelled' : code === 0 ? 'done' : 'failed';
      if (status === 'done' && finish) {
        try { job.result = await finish(job); }
        catch (e) { status = 'failed'; add(`\n✗ ${e.message}\n`); }
      }
      job.ended = Date.now();
      job.status = status;
      settle();
    };
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    job.child = child;
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    child.on('error', (e) => { add(`\n✗ could not start ${cmd}: ${e.message}\n`); close(-1); });
    child.on('close', (code) => close(code ?? -1));
    jobs.set(id, job);
    return job;
  }

  /** Waits for `job` up to `seconds`, calling `onTick(job)` about every five seconds while it runs. Stops early when
      `signal` aborts. */
  async function wait(job, seconds, { signal, onTick } = {}) {
    const end = Date.now() + seconds * 1000;
    while (job.status === 'running' && Date.now() < end && !signal?.aborted) {
      const aborted = signal ? new Promise((r) => signal.addEventListener('abort', r, { once: true })) : null;
      await Promise.race([job.done, sleep(Math.min(5000, end - Date.now())), aborted].filter(Boolean));
      if (job.status === 'running' && !signal?.aborted) await onTick?.(job);
    }
  }

  /** Stops a running job: SIGTERM, then SIGKILL after three seconds. */
  function cancel(job) {
    if (job.status !== 'running') return false;
    job.cancelled = true;
    job.child?.kill('SIGTERM');
    setTimeout(() => { if (job.status === 'running') job.child?.kill('SIGKILL'); }, 3000).unref();
    return true;
  }

  return {
    start,
    wait,
    cancel,
    get: (id) => jobs.get(id),
    list: () => [...jobs.values()],
    killAll: () => { for (const j of jobs.values()) if (j.status === 'running') j.child?.kill('SIGKILL'); },
  };
}
