import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import vm from 'node:vm';

const PORT = Number(process.env.LOCAL_MCP_PORT || 8787);
const ROOT_DIR = path.resolve(process.env.LOCAL_MCP_ROOT || process.cwd());
const AUTH_TOKEN = process.env.LOCAL_MCP_TOKEN || '';

const serverInfo = { name: 'local-agent-tools', version: '1.0.0' };

const tools = [
  {
    name: 'read_file',
    description: 'Read a UTF-8 text file from the local machine within configured root directory.',
    inputSchema: {
      type: 'object',
      properties: { relative_path: { type: 'string' } },
      required: ['relative_path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write UTF-8 text content to a local file within configured root directory.',
    inputSchema: {
      type: 'object',
      properties: { relative_path: { type: 'string' }, content: { type: 'string' } },
      required: ['relative_path', 'content'],
    },
  },
  {
    name: 'run_javascript',
    description: 'Execute JavaScript code in a sandboxed VM context and return stdout-like logs.',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string' } },
      required: ['code'],
    },
  },
  {
    name: 'run_python',
    description: 'Execute Python code using local python3 runtime and return output.',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string' } },
      required: ['code'],
    },
  },
];

function checkAuth(req) {
  if (!AUTH_TOKEN) return true;
  const header = req.headers.authorization || '';
  return header === `Bearer ${AUTH_TOKEN}`;
}

function resolveSafe(relativePath) {
  const safePath = path.resolve(ROOT_DIR, relativePath);
  if (!safePath.startsWith(ROOT_DIR)) throw new Error('Path escapes allowed root directory');
  return safePath;
}

function toTextResult(text) {
  return { content: [{ type: 'text', text }] };
}

async function runPython(code) {
  return await new Promise((resolve) => {
    const child = spawn('python3', ['-c', code], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', chunk => { out += String(chunk); });
    child.stderr.on('data', chunk => { err += String(chunk); });
    child.on('close', (exitCode) => {
      if (exitCode === 0) resolve(out.trim() || '(no output)');
      else resolve(`Python exited with ${exitCode}\n${err || out}`.trim());
    });
    child.on('error', (e) => resolve(`Failed to start python3: ${e.message}`));
  });
}

async function handleToolCall(name, args) {
  if (name === 'read_file') {
    const filePath = resolveSafe(String(args.relative_path || ''));
    const content = await fs.readFile(filePath, 'utf8');
    return toTextResult(content);
  }

  if (name === 'write_file') {
    const filePath = resolveSafe(String(args.relative_path || ''));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, String(args.content || ''), 'utf8');
    return toTextResult(`Wrote ${filePath}`);
  }

  if (name === 'run_javascript') {
    const logs = [];
    const sandbox = {
      console: {
        log: (...xs) => logs.push(xs.map(String).join(' ')),
        error: (...xs) => logs.push(`ERROR: ${xs.map(String).join(' ')}`),
      },
      Math,
      JSON,
      Date,
    };
    vm.createContext(sandbox);
    const script = new vm.Script(String(args.code || ''), { timeout: 3000 });
    const result = script.runInContext(sandbox, { timeout: 3000 });
    const resultText = result === undefined ? '' : `\n=> ${typeof result === 'object' ? JSON.stringify(result) : String(result)}`;
    return toTextResult(`${logs.join('\n')}${resultText}`.trim() || '(no output)');
  }

  if (name === 'run_python') {
    const output = await runPython(String(args.code || ''));
    return toTextResult(output);
  }

  return toTextResult(`Unknown tool: ${name}`);
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, mcp-session-id');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!checkAuth(req)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  let raw = '';
  req.on('data', chunk => { raw += String(chunk); });
  req.on('end', async () => {
    try {
      const body = JSON.parse(raw || '{}');
      const { id, method, params } = body;

      if (!id && method === 'notifications/initialized') {
        res.statusCode = 202;
        res.end('');
        return;
      }

      let result;
      if (method === 'initialize') {
        result = {
          protocolVersion: '2025-03-26',
          capabilities: { tools: { listChanged: false } },
          serverInfo,
        };
      } else if (method === 'tools/list') {
        result = { tools };
      } else if (method === 'tools/call') {
        result = await handleToolCall(params?.name, params?.arguments || {});
      } else {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }));
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    } catch (error) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: String(error) } }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Local MCP server listening on http://localhost:${PORT}`);
  console.log(`Allowed root directory: ${ROOT_DIR}`);
});
