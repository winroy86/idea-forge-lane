import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function line(status, label, detail = '') {
  const icon = status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '❌';
  console.log(`${icon} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function checkCommand(command, args, label, required = true) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 7000 });
    line('pass', label, (stdout || stderr).trim().split('\n')[0]);
    return true;
  } catch (err) {
    if (required) line('fail', label, err.message);
    else line('warn', label, err.message);
    return false;
  }
}

async function checkMcpServer() {
  const url = process.env.LOCAL_MCP_URL || 'http://localhost:8787';
  try {
    const init = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'doctor', version: '1.0.0' } } }),
    });
    if (!init.ok) throw new Error(`initialize failed: HTTP ${init.status}`);
    const list = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    if (!list.ok) throw new Error(`tools/list failed: HTTP ${list.status}`);
    const payload = await list.json();
    const toolCount = payload?.result?.tools?.length ?? 0;
    line('pass', 'MCP server reachable', `${url} (${toolCount} tools discovered)`);
    return true;
  } catch (err) {
    line('warn', 'MCP server reachable', `${url} not reachable (${err.message})`);
    return false;
  }
}

async function checkWeb() {
  try {
    const res = await fetch('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    line('pass', 'Outbound web access', 'Wikipedia API reachable');
  } catch (err) {
    line('warn', 'Outbound web access', err.message);
  }
}

console.log('Local capability doctor\n');
await checkCommand('node', ['--version'], 'Node.js runtime');
await checkCommand('npm', ['--version'], 'npm');
await checkCommand('python3', ['--version'], 'Python 3 runtime', false);
await checkCommand('supabase', ['--version'], 'Supabase CLI', false);
await checkMcpServer();
await checkWeb();
