import { Skill, SkillStep, SkillCodeFile, Agent } from '@/types';

const SKILLS_KEY = 'skills';

// ---- CRUD ----

export function getSkills(): Skill[] {
  const raw = localStorage.getItem(SKILLS_KEY);
  if (!raw) {
    const builtIns = getBuiltInSkills();
    localStorage.setItem(SKILLS_KEY, JSON.stringify(builtIns));
    return builtIns;
  }
  // Migrate older skills that lack codeFiles
  const skills = JSON.parse(raw) as Skill[];
  return skills.map(s => ({ ...s, codeFiles: s.codeFiles || [] }));
}

export function getSkill(id: string): Skill | undefined {
  return getSkills().find(s => s.id === id);
}

export function upsertSkill(skill: Skill): void {
  const skills = getSkills();
  const idx = skills.findIndex(s => s.id === skill.id);
  if (idx >= 0) skills[idx] = skill;
  else skills.push(skill);
  localStorage.setItem(SKILLS_KEY, JSON.stringify(skills));
}

export function deleteSkill(id: string): void {
  const skills = getSkills().filter(s => s.id !== id);
  localStorage.setItem(SKILLS_KEY, JSON.stringify(skills));
}

export function getAgentSkills(agent: Agent): Skill[] {
  if (!agent.skills || agent.skills.length === 0) return [];
  const all = getSkills();
  return agent.skills.map(id => all.find(s => s.id === id)).filter(Boolean) as Skill[];
}

// ---- Import from JSON ----

export function importSkillFromJSON(json: string): Skill {
  const parsed = JSON.parse(json);
  if (!parsed.name || !parsed.steps || !Array.isArray(parsed.steps)) {
    throw new Error('Invalid skill manifest: missing name or steps');
  }
  const skill: Skill = {
    id: parsed.id || `skill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: parsed.name,
    description: parsed.description || '',
    version: parsed.version || '1.0.0',
    author: parsed.author || 'Unknown',
    icon: parsed.icon || '🔧',
    category: parsed.category || 'General',
    triggers: parsed.triggers || [],
    requiredPermissions: parsed.requiredPermissions || [],
    inputSchema: parsed.inputSchema || [],
    steps: parsed.steps.map((s: any, i: number) => ({
      id: s.id || `step-${i + 1}`,
      instruction: s.instruction || '',
      toolHint: s.toolHint,
      outputKey: s.outputKey,
      code: s.code,
      codeLanguage: s.codeLanguage || (s.code ? 'javascript' : undefined),
      codeMode: s.codeMode || (s.code ? 'auto-execute' : undefined),
    })),
    codeFiles: (parsed.codeFiles || []).map((f: any) => ({
      filename: f.filename || 'untitled.js',
      language: f.language || 'javascript',
      content: f.content || '',
      description: f.description,
    })),
    outputFormat: parsed.outputFormat || '',
    installedAt: new Date().toISOString(),
    isBuiltIn: false,
  };
  return skill;
}

// ---- Import from ZIP ----

export async function importSkillFromZip(file: File): Promise<Skill> {
  const JSZipModule = await import('jszip');
  const JSZip = JSZipModule.default;
  const zip = await JSZip.loadAsync(file);

  // Find manifest.json
  let manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    const jsonFiles = zip.file(/manifest\.json$/);
    if (jsonFiles.length > 0) manifestFile = jsonFiles[0];
  }
  if (!manifestFile) throw new Error('No manifest.json found in ZIP');

  const manifestText = await manifestFile.async('string');
  const skill = importSkillFromJSON(manifestText);

  // Extract code files
  const codeExtensions = ['.js', '.ts', '.py', '.mjs', '.cjs'];
  const filePromises: Promise<void>[] = [];
  
  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    if (relativePath.endsWith('manifest.json')) return;
    const ext = relativePath.substring(relativePath.lastIndexOf('.'));
    if (codeExtensions.includes(ext)) {
      const filename = relativePath.split('/').pop() || relativePath;
      if (!skill.codeFiles.find(f => f.filename === filename)) {
        filePromises.push(
          zipEntry.async('string').then(content => {
            const lang = ext === '.py' ? 'python' as const : 'javascript' as const;
            skill.codeFiles.push({ filename, language: lang, content, description: '' });
          })
        );
      }
    }
  });

  await Promise.all(filePromises);
  return skill;
}

// ---- Create empty skill template ----

export function createEmptySkill(): Skill {
  return {
    id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    description: '',
    version: '1.0.0',
    author: '',
    icon: '🔧',
    category: 'General',
    triggers: [],
    requiredPermissions: [],
    inputSchema: [],
    steps: [{ id: 'step-1', instruction: '' }],
    codeFiles: [],
    outputFormat: '',
    installedAt: new Date().toISOString(),
    isBuiltIn: false,
  };
}

// ---- Built-in Starter Skills ----

function getBuiltInSkills(): Skill[] {
  return [
    {
      id: 'builtin-deep-research',
      name: 'Deep Research',
      description: 'Multi-step web research with cross-referencing and synthesis into a structured report.',
      version: '1.0.0',
      author: 'System',
      icon: '🔬',
      category: 'Research',
      triggers: ['research', 'investigate', 'deep dive', 'find out', 'look into'],
      requiredPermissions: ['webSearch'],
      inputSchema: [{ name: 'topic', type: 'string', description: 'The topic to research', required: true }],
      steps: [
        { id: 'r1', instruction: 'Define 3-5 specific research questions about the topic. Write your research plan to memory as "research-plan.md".', toolHint: 'memory_write' },
        { id: 'r2', instruction: 'Search for information on each research question. Use multiple search queries to get diverse perspectives.', toolHint: 'web_search' },
        { id: 'r3', instruction: 'Cross-reference findings across sources. Identify agreements, contradictions, and gaps. Note source credibility.', toolHint: 'code_execution' },
        { id: 'r4', instruction: 'Synthesize findings into a structured report with sections: Overview, Key Findings, Analysis, Confidence Assessment, and Sources.', toolHint: 'memory_write' },
      ],
      codeFiles: [],
      outputFormat: '## Research Report: {topic}\n\n### Overview\n...\n\n### Key Findings\n...\n\n### Analysis\n...\n\n### Confidence Assessment\n...\n\n### Sources\n...',
      installedAt: new Date().toISOString(),
      isBuiltIn: true,
    },
    {
      id: 'builtin-code-analyzer',
      name: 'Code Analyzer',
      description: 'Analyze code from documents for patterns, bugs, and improvement suggestions.',
      version: '1.0.0',
      author: 'System',
      icon: '🔍',
      category: 'Development',
      triggers: ['analyze code', 'code review', 'review this code', 'find bugs'],
      requiredPermissions: ['codeExecution', 'fileRead'],
      inputSchema: [{ name: 'focus', type: 'string', description: 'What aspect to focus on (bugs, performance, style)', required: false }],
      steps: [
        { id: 'c1', instruction: 'Read and parse the code from the provided documents. Identify the language, framework, and architecture patterns used.', toolHint: 'memory_read' },
        { id: 'c2', instruction: 'Analyze the code for: potential bugs, security issues, performance bottlenecks, and style inconsistencies. Use code execution to test logic if possible.', toolHint: 'code_execution' },
        { id: 'c3', instruction: 'Generate specific improvement suggestions with code examples. Prioritize by impact (critical → minor).', toolHint: 'code_execution' },
        { id: 'c4', instruction: 'Write a structured review report to memory with categorized findings.', toolHint: 'memory_write' },
      ],
      codeFiles: [],
      outputFormat: '## Code Review\n\n### Summary\n...\n\n### 🔴 Critical Issues\n...\n\n### 🟡 Improvements\n...\n\n### 🟢 Good Practices Found\n...',
      installedAt: new Date().toISOString(),
      isBuiltIn: true,
    },
    {
      id: 'builtin-fact-checker',
      name: 'Fact Checker',
      description: 'Verify claims using web search, rate confidence, and provide evidence.',
      version: '1.0.0',
      author: 'System',
      icon: '✅',
      category: 'Research',
      triggers: ['fact check', 'verify', 'is it true', 'check if', 'validate claim'],
      requiredPermissions: ['webSearch'],
      inputSchema: [{ name: 'claim', type: 'string', description: 'The claim to verify', required: true }],
      steps: [
        { id: 'f1', instruction: 'Break down the claim into individual verifiable statements. List each statement clearly.', toolHint: 'memory_write' },
        { id: 'f2', instruction: 'Search for evidence for and against each statement. Prioritize authoritative sources (academic, official, reputable news).', toolHint: 'web_search' },
        { id: 'f3', instruction: 'Rate each statement: ✅ Verified, ⚠️ Partially True, ❌ False, ❓ Unverifiable. Provide confidence percentage and reasoning.', toolHint: 'code_execution' },
        { id: 'f4', instruction: 'Compile a fact-check report with overall verdict and detailed evidence per claim.', toolHint: 'memory_write' },
      ],
      codeFiles: [],
      outputFormat: '## Fact Check Report\n\n### Overall Verdict: {verdict}\n\n### Claim Breakdown\n...\n\n### Evidence\n...\n\n### Sources\n...',
      installedAt: new Date().toISOString(),
      isBuiltIn: true,
    },
    {
      id: 'builtin-swot-analysis',
      name: 'SWOT Analysis',
      description: 'Structured Strengths, Weaknesses, Opportunities, and Threats framework analysis.',
      version: '1.0.0',
      author: 'System',
      icon: '📊',
      category: 'Strategy',
      triggers: ['swot', 'strengths and weaknesses', 'strategic analysis', 'competitive analysis'],
      requiredPermissions: [],
      inputSchema: [{ name: 'subject', type: 'string', description: 'The subject to analyze', required: true }],
      steps: [
        { id: 's1', instruction: 'Identify and list internal Strengths — what the subject does well, unique resources, competitive advantages.', toolHint: 'memory_write' },
        { id: 's2', instruction: 'Identify and list internal Weaknesses — limitations, resource gaps, areas needing improvement.', toolHint: 'memory_write' },
        { id: 's3', instruction: 'Identify external Opportunities — market trends, unmet needs, emerging technologies, partnerships. Use web search if available for current data.', toolHint: 'web_search' },
        { id: 's4', instruction: 'Identify external Threats — competition, regulations, market shifts, risks. Synthesize into actionable strategic recommendations.', toolHint: 'memory_write' },
      ],
      codeFiles: [],
      outputFormat: '## SWOT Analysis: {subject}\n\n### 💪 Strengths\n...\n\n### 😟 Weaknesses\n...\n\n### 🌟 Opportunities\n...\n\n### ⚠️ Threats\n...\n\n### 📋 Strategic Recommendations\n...',
      installedAt: new Date().toISOString(),
      isBuiltIn: true,
    },
  ];
}

// ---- Skill prompt injection ----

export function buildSkillsPromptBlock(agent: Agent, latestUserMessage?: string): string {
  const skills = getAgentSkills(agent);
  if (skills.length === 0) return '';

  const triggered: Skill[] = [];
  const available: Skill[] = [];

  for (const skill of skills) {
    const missingPerms = skill.requiredPermissions.filter(p => !agent.permissions[p]);
    if (missingPerms.length > 0) continue;

    if (latestUserMessage) {
      const msg = latestUserMessage.toLowerCase();
      const isTriggered = skill.triggers.some(t => msg.includes(t.toLowerCase()));
      if (isTriggered) triggered.push(skill);
      else available.push(skill);
    } else {
      available.push(skill);
    }
  }

  if (triggered.length === 0 && available.length === 0) return '';

  let block = '\n\n--- AVAILABLE SKILLS ---\n';

  if (triggered.length > 0) {
    block += '🎯 ACTIVATED SKILLS (the user message matches these — follow the workflow steps):\n\n';
    for (const skill of triggered) {
      block += formatSkillBlock(skill, true);
    }
  }

  if (available.length > 0) {
    block += '\n📦 OTHER AVAILABLE SKILLS (use if relevant):\n';
    for (const skill of available) {
      block += `- ${skill.icon} ${skill.name}: ${skill.description} (triggers: ${skill.triggers.join(', ')})\n`;
    }
  }

  block += '\n--- END SKILLS ---\n';
  return block;
}

function formatSkillBlock(skill: Skill, detailed: boolean): string {
  let block = `[${skill.icon} Skill: ${skill.name}]\n`;
  block += `Description: ${skill.description}\n`;
  block += `Triggers: ${skill.triggers.join(', ')}\n`;
  if (detailed) {
    block += `Workflow Steps:\n`;
    for (const step of skill.steps) {
      const hint = step.toolHint ? ` (use ${step.toolHint})` : '';
      block += `  ${step.id}. ${step.instruction}${hint}\n`;
      if (step.outputKey) block += `     → Store result as: ${step.outputKey}\n`;
      // Include embedded code
      if (step.code) {
        const mode = step.codeMode || 'auto-execute';
        if (mode === 'auto-execute') {
          block += `     ⚡ AUTO-EXECUTE this ${step.codeLanguage || 'javascript'} code and use its output:\n`;
          block += `     \`\`\`${step.codeLanguage || 'javascript'}\n`;
          block += `     ${step.code.split('\n').join('\n     ')}\n`;
          block += `     \`\`\`\n`;
        } else {
          block += `     📄 Reference code (${step.codeLanguage || 'javascript'}):\n`;
          block += `     \`\`\`${step.codeLanguage || 'javascript'}\n`;
          block += `     ${step.code.split('\n').join('\n     ')}\n`;
          block += `     \`\`\`\n`;
        }
      }
    }
    // Include standalone code files
    if (skill.codeFiles.length > 0) {
      block += `\nBundled Code Files:\n`;
      for (const cf of skill.codeFiles) {
        block += `  📁 ${cf.filename} (${cf.language})${cf.description ? ` — ${cf.description}` : ''}\n`;
        block += `  \`\`\`${cf.language}\n`;
        block += `  ${cf.content.split('\n').join('\n  ')}\n`;
        block += `  \`\`\`\n`;
      }
      block += `  ⚡ Execute these code files via code_execution when referenced by a step.\n`;
    }
    if (skill.outputFormat) {
      block += `Output Format:\n${skill.outputFormat}\n`;
    }
  }
  block += '\n';
  return block;
}
