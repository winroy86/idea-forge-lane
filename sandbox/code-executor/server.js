import express from 'express';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/execute', async (req, res) => {
  const code = String(req.body?.code || '');
  const timeoutMs = Math.min(Number(req.body?.timeoutMs || 10000), 20000);
  if (!code.trim()) return res.status(400).send('Missing code');

  const dir = mkdtempSync(path.join(tmpdir(), 'agent-code-'));
  const file = path.join(dir, 'run.js');

  try {
    writeFileSync(file, `${code}\n`, 'utf8');

    const child = spawn('node', [file], {
      cwd: dir,
      env: { ...process.env, npm_config_loglevel: 'error' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += String(d); });
    child.stderr.on('data', (d) => { stderr += String(d); });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      const output = `${stdout}${stderr}`.trim();
      res.json({
        exitCode: code,
        stdout: output || '(no output)',
        result: output || '(no output)',
      });
      rmSync(dir, { recursive: true, force: true });
    });
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    res.status(500).send(err instanceof Error ? err.message : 'Execution failed');
  }
});

app.listen(8787, '0.0.0.0', () => {
  console.log('Sandbox code executor listening on :8787');
});
