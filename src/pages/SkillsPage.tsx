import { useState, useEffect } from 'react';
import { Puzzle, Plus, Trash2, ChevronDown, ChevronUp, Download, Upload, Wand2, FileCode, Archive, X, GripVertical } from 'lucide-react';
import { Skill, SkillPermission, SkillStep, SkillToolHint, SkillCodeFile } from '@/types';
import { getSkills, upsertSkill, deleteSkill, importSkillFromJSON, importSkillFromZip, createEmptySkill } from '@/lib/skillStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

const PERM_LABELS: Record<SkillPermission, { label: string; icon: string }> = {
  webSearch: { label: 'Web Search', icon: '🌐' },
  codeExecution: { label: 'Code Exec', icon: '💻' },
  fileRead: { label: 'File Read', icon: '📖' },
  fileWrite: { label: 'File Write', icon: '📝' },
};

const CATEGORY_COLORS: Record<string, string> = {
  Research: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Development: 'bg-green-500/10 text-green-400 border-green-500/20',
  Strategy: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  General: 'bg-muted text-muted-foreground border-border',
};

const TOOL_HINTS: { value: SkillToolHint; label: string }[] = [
  { value: 'code_execution', label: '💻 Code Execution' },
  { value: 'web_search', label: '🌐 Web Search' },
  { value: 'memory_write', label: '📝 Memory Write' },
  { value: 'memory_read', label: '📖 Memory Read' },
  { value: 'mcp_call', label: '🔌 MCP Call' },
];

const ICON_OPTIONS = ['🔧', '🔬', '🔍', '✅', '📊', '🚀', '💡', '📋', '🎯', '⚡', '🧪', '📐', '🔮', '🛡️', '🎨', '📦'];
const CATEGORY_OPTIONS = ['General', 'Research', 'Development', 'Strategy', 'Data', 'Automation', 'Creative'];

// ---- Skill Wizard Component ----

function SkillWizard({ skill: initialSkill, onSave, onClose }: {
  skill: Skill | null;
  onSave: (skill: Skill) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Skill>(initialSkill || createEmptySkill());
  const [triggerInput, setTriggerInput] = useState('');
  const [wizardStep, setWizardStep] = useState(0); // 0=basics, 1=steps, 2=code files, 3=output

  const update = (patch: Partial<Skill>) => setForm(prev => ({ ...prev, ...patch }));

  const addStep = () => {
    const newStep: SkillStep = { id: `step-${form.steps.length + 1}`, instruction: '' };
    update({ steps: [...form.steps, newStep] });
  };

  const updateStep = (idx: number, patch: Partial<SkillStep>) => {
    const steps = [...form.steps];
    steps[idx] = { ...steps[idx], ...patch };
    update({ steps });
  };

  const removeStep = (idx: number) => {
    if (form.steps.length <= 1) return;
    update({ steps: form.steps.filter((_, i) => i !== idx) });
  };

  const addCodeFile = () => {
    const newFile: SkillCodeFile = { filename: `script-${form.codeFiles.length + 1}.js`, language: 'javascript', content: '', description: '' };
    update({ codeFiles: [...form.codeFiles, newFile] });
  };

  const updateCodeFile = (idx: number, patch: Partial<SkillCodeFile>) => {
    const files = [...form.codeFiles];
    files[idx] = { ...files[idx], ...patch };
    update({ codeFiles: files });
  };

  const removeCodeFile = (idx: number) => {
    update({ codeFiles: form.codeFiles.filter((_, i) => i !== idx) });
  };

  const addTrigger = () => {
    if (!triggerInput.trim()) return;
    if (!form.triggers.includes(triggerInput.trim())) {
      update({ triggers: [...form.triggers, triggerInput.trim()] });
    }
    setTriggerInput('');
  };

  const togglePerm = (perm: SkillPermission) => {
    const perms = form.requiredPermissions.includes(perm)
      ? form.requiredPermissions.filter(p => p !== perm)
      : [...form.requiredPermissions, perm];
    update({ requiredPermissions: perms });
  };

  const canSave = form.name.trim() && form.steps.length > 0 && form.steps.every(s => s.instruction.trim());

  const WIZARD_TABS = ['Basics', 'Steps', 'Code Files', 'Output'];

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-accent" />
          {initialSkill ? 'Edit Skill' : 'Create Skill'}
        </DialogTitle>
        <DialogDescription>
          Build a skill step by step using the visual wizard.
        </DialogDescription>
      </DialogHeader>

      {/* Wizard tabs */}
      <div className="flex border-b border-border mb-4">
        {WIZARD_TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setWizardStep(i)}
            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
              wizardStep === i
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
            {i === 1 && ` (${form.steps.length})`}
            {i === 2 && form.codeFiles.length > 0 && ` (${form.codeFiles.length})`}
          </button>
        ))}
      </div>

      {/* Step 0: Basics */}
      {wizardStep === 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-[auto_1fr] gap-3">
            {/* Icon picker */}
            <div>
              <Label className="text-xs">Icon</Label>
              <div className="flex flex-wrap gap-1 mt-1 max-w-[140px]">
                {ICON_OPTIONS.map(ico => (
                  <button
                    key={ico}
                    onClick={() => update({ icon: ico })}
                    className={`w-7 h-7 rounded text-sm flex items-center justify-center transition-colors ${
                      form.icon === ico ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-muted'
                    }`}
                  >
                    {ico}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={e => update({ name: e.target.value })} placeholder="My Custom Skill" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => update({ description: e.target.value })} rows={2} placeholder="What this skill does..." />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => update({ category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Version</Label>
              <Input value={form.version} onChange={e => update({ version: e.target.value })} placeholder="1.0.0" />
            </div>
            <div>
              <Label>Author</Label>
              <Input value={form.author} onChange={e => update({ author: e.target.value })} placeholder="Your name" />
            </div>
          </div>

          {/* Triggers */}
          <div>
            <Label>Trigger Keywords</Label>
            <p className="text-[10px] text-muted-foreground mb-1.5">Words/phrases that activate this skill when found in user messages</p>
            <div className="flex gap-2 mb-2">
              <Input
                value={triggerInput}
                onChange={e => setTriggerInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTrigger())}
                placeholder="Type trigger and press Enter..."
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={addTrigger} disabled={!triggerInput.trim()}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {form.triggers.map((t, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs">
                  "{t}"
                  <button onClick={() => update({ triggers: form.triggers.filter((_, j) => j !== i) })} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Required Permissions */}
          <div>
            <Label>Required Permissions</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {(Object.keys(PERM_LABELS) as SkillPermission[]).map(perm => (
                <button
                  key={perm}
                  onClick={() => togglePerm(perm)}
                  className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                    form.requiredPermissions.includes(perm)
                      ? 'bg-accent/20 text-accent border-accent/30'
                      : 'bg-muted text-muted-foreground border-border hover:border-foreground/30'
                  }`}
                >
                  {PERM_LABELS[perm].icon} {PERM_LABELS[perm].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Workflow Steps */}
      {wizardStep === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Define the step-by-step workflow. Each step can optionally include code to auto-execute.</p>
          {form.steps.map((step, i) => (
            <div key={i} className="rounded-lg border border-border p-3 bg-card space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
                  {i + 1}
                </span>
                <span className="text-xs font-medium text-foreground flex-1">Step {i + 1}</span>
                {form.steps.length > 1 && (
                  <button onClick={() => removeStep(i)} className="text-muted-foreground hover:text-destructive p-0.5">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Textarea
                value={step.instruction}
                onChange={e => updateStep(i, { instruction: e.target.value })}
                rows={2}
                placeholder="Describe what the agent should do in this step..."
                className="text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Tool Hint</Label>
                  <Select value={step.toolHint || 'none'} onValueChange={v => updateStep(i, { toolHint: v === 'none' ? undefined : v as SkillToolHint })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {TOOL_HINTS.map(th => <SelectItem key={th.value} value={th.value}>{th.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">Output Key (optional)</Label>
                  <Input
                    value={step.outputKey || ''}
                    onChange={e => updateStep(i, { outputKey: e.target.value || undefined })}
                    placeholder="result_name"
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Embedded code */}
              <div className="border-t border-border pt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-[10px] flex items-center gap-1"><FileCode className="h-3 w-3" /> Embedded Code</Label>
                  {!step.code && (
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => updateStep(i, { code: '', codeLanguage: 'javascript', codeMode: 'auto-execute' })}>
                      + Add Code
                    </Button>
                  )}
                </div>
                {step.code !== undefined && (
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <Select value={step.codeLanguage || 'javascript'} onValueChange={v => updateStep(i, { codeLanguage: v as any })}>
                        <SelectTrigger className="h-7 text-[10px] w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="javascript">JavaScript</SelectItem>
                          <SelectItem value="python">Python</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={step.codeMode || 'auto-execute'} onValueChange={v => updateStep(i, { codeMode: v as any })}>
                        <SelectTrigger className="h-7 text-[10px] w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto-execute">⚡ Auto-execute</SelectItem>
                          <SelectItem value="reference">📄 Reference only</SelectItem>
                        </SelectContent>
                      </Select>
                      <button onClick={() => updateStep(i, { code: undefined, codeLanguage: undefined, codeMode: undefined })} className="text-muted-foreground hover:text-destructive ml-auto">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Textarea
                      value={step.code}
                      onChange={e => updateStep(i, { code: e.target.value })}
                      rows={4}
                      placeholder={step.codeLanguage === 'python' ? '# Python code here...\nimport json\nresult = {"key": "value"}\nprint(json.dumps(result))' : '// JavaScript code here...\nconst result = { key: "value" };\nconsole.log(JSON.stringify(result));'}
                      className="font-mono text-[11px]"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addStep} className="w-full gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Step
          </Button>
        </div>
      )}

      {/* Step 2: Code Files */}
      {wizardStep === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Attach standalone code files that steps can reference and execute. These are bundled with the skill and injected into the agent's context.
          </p>
          {form.codeFiles.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No code files yet</p>
              <p className="text-[10px]">Add code files that your steps can reference</p>
            </div>
          )}
          {form.codeFiles.map((cf, i) => (
            <div key={i} className="rounded-lg border border-border p-3 bg-card space-y-2">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-accent shrink-0" />
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <Input
                    value={cf.filename}
                    onChange={e => updateCodeFile(i, { filename: e.target.value })}
                    placeholder="script.js"
                    className="h-7 text-xs font-mono"
                  />
                  <Select value={cf.language} onValueChange={v => updateCodeFile(i, { language: v as any })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="javascript">JavaScript</SelectItem>
                      <SelectItem value="python">Python</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <button onClick={() => removeCodeFile(i)} className="text-muted-foreground hover:text-destructive p-0.5">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                value={cf.description || ''}
                onChange={e => updateCodeFile(i, { description: e.target.value })}
                placeholder="Description (optional)"
                className="h-7 text-xs"
              />
              <Textarea
                value={cf.content}
                onChange={e => updateCodeFile(i, { content: e.target.value })}
                rows={6}
                placeholder="Paste or write code here..."
                className="font-mono text-[11px]"
              />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addCodeFile} className="w-full gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Code File
          </Button>
        </div>
      )}

      {/* Step 3: Output */}
      {wizardStep === 3 && (
        <div className="space-y-4">
          <div>
            <Label>Output Format Template</Label>
            <p className="text-[10px] text-muted-foreground mb-1.5">Markdown template the agent should follow for its final output</p>
            <Textarea
              value={form.outputFormat}
              onChange={e => update({ outputFormat: e.target.value })}
              rows={8}
              placeholder="## Result: {topic}&#10;&#10;### Summary&#10;...&#10;&#10;### Details&#10;...&#10;&#10;### Sources&#10;..."
              className="font-mono text-xs"
            />
          </div>

          {/* Preview */}
          <div className="border border-border rounded-lg p-3 bg-muted/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Skill Preview</p>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{form.icon}</span>
              <div>
                <p className="text-sm font-medium text-foreground">{form.name || 'Untitled Skill'}</p>
                <p className="text-[10px] text-muted-foreground">{form.category} · v{form.version} · {form.steps.length} steps · {form.codeFiles.length} code files</p>
              </div>
            </div>
            {form.triggers.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {form.triggers.map(t => <span key={t} className="text-[10px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5">"{t}"</span>)}
              </div>
            )}
            {form.requiredPermissions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {form.requiredPermissions.map(p => <span key={p} className="text-[10px] bg-accent/10 text-accent rounded px-1.5 py-0.5">{PERM_LABELS[p].icon} {PERM_LABELS[p].label}</span>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-2 pt-2 border-t border-border">
        {wizardStep > 0 && (
          <Button variant="outline" onClick={() => setWizardStep(wizardStep - 1)} className="flex-1">Back</Button>
        )}
        {wizardStep < 3 ? (
          <Button onClick={() => setWizardStep(wizardStep + 1)} className="flex-1">Next</Button>
        ) : (
          <Button onClick={() => canSave && onSave(form)} className="flex-1" disabled={!canSave}>
            {initialSkill ? 'Save Changes' : 'Create Skill'}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </DialogContent>
  );
}

// ---- Main Skills Page ----

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const refresh = () => setSkills(getSkills());
  useEffect(refresh, []);

  const handleInstall = () => {
    try {
      const skill = importSkillFromJSON(jsonInput);
      upsertSkill(skill);
      refresh();
      setShowInstall(false);
      setJsonInput('');
      toast({ title: `✅ Installed "${skill.name}"` });
    } catch (err: any) {
      toast({ title: 'Invalid manifest', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = (id: string, name: string) => {
    deleteSkill(id);
    refresh();
    toast({ title: `Removed "${name}"` });
  };

  const handleExport = (skill: Skill) => {
    const { installedAt, isBuiltIn, ...exportData } = skill;
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skill-${skill.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        let skill: Skill;
        if (file.name.endsWith('.zip')) {
          skill = await importSkillFromZip(file);
        } else {
          const text = await file.text();
          skill = importSkillFromJSON(text);
        }
        upsertSkill(skill);
        refresh();
        toast({ title: `✅ Imported "${skill.name}"${skill.codeFiles.length > 0 ? ` with ${skill.codeFiles.length} code file(s)` : ''}` });
      } catch (err: any) {
        toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const handleWizardSave = (skill: Skill) => {
    upsertSkill({ ...skill, installedAt: skill.installedAt || new Date().toISOString() });
    setShowWizard(false);
    setEditSkill(null);
    refresh();
    toast({ title: `✅ ${editSkill ? 'Updated' : 'Created'} "${skill.name}"` });
  };

  const categoryColor = (cat: string) => CATEGORY_COLORS[cat] || CATEGORY_COLORS.General;

  return (
    <div className="animate-fade-in p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Skills</h1>
          <p className="text-sm text-muted-foreground mt-1">Install and manage agent workflow skills.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleImportFile} disabled={importing} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> {importing ? 'Importing...' : 'Import'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowInstall(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> JSON
          </Button>
          <Button size="sm" onClick={() => { setEditSkill(null); setShowWizard(true); }} className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" /> Create Skill
          </Button>
        </div>
      </div>

      {skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Puzzle className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-1">No skills installed</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            Create skills visually or import from JSON/ZIP files. Skills guide agents through
            multi-step workflows with code execution support.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowInstall(true)}>Import JSON</Button>
            <Button onClick={() => { setEditSkill(null); setShowWizard(true); }}>
              <Wand2 className="h-4 w-4 mr-1.5" /> Create Skill
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {skills.map((skill) => {
            const isExpanded = expandedId === skill.id;
            const hasCode = skill.codeFiles.length > 0 || skill.steps.some(s => s.code);
            return (
              <div key={skill.id} className="rounded-lg border border-border bg-card shadow-soft overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : skill.id)}
                  className="w-full text-left p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors"
                >
                  <span className="text-2xl leading-none mt-0.5">{skill.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium text-foreground">{skill.name}</h3>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium border ${categoryColor(skill.category)}`}>
                        {skill.category}
                      </span>
                      {skill.isBuiltIn && (
                        <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">Built-in</span>
                      )}
                      {hasCode && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-accent bg-accent/10 rounded px-1.5 py-0.5">
                          <FileCode className="h-2.5 w-2.5" /> Code
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{skill.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {skill.requiredPermissions.map(p => (
                        <span key={p} className="inline-flex items-center gap-0.5 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                          {PERM_LABELS[p]?.icon} {PERM_LABELS[p]?.label}
                        </span>
                      ))}
                      {skill.requiredPermissions.length === 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          No special permissions
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-1">
                        {skill.steps.length} steps
                      </span>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-border p-4 bg-muted/10 space-y-4">
                    {/* Triggers */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Triggers</p>
                      <div className="flex flex-wrap gap-1.5">
                        {skill.triggers.map(t => (
                          <span key={t} className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs">"{t}"</span>
                        ))}
                      </div>
                    </div>

                    {/* Steps */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Workflow Steps</p>
                      <div className="space-y-2">
                        {skill.steps.map((step, i) => (
                          <div key={step.id} className="flex gap-2">
                            <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-medium mt-0.5">
                              {i + 1}
                            </span>
                            <div className="flex-1">
                              <p className="text-xs text-foreground">{step.instruction}</p>
                              <div className="flex gap-2 mt-0.5 flex-wrap">
                                {step.toolHint && (
                                  <span className="text-[10px] text-accent font-mono">→ {step.toolHint}</span>
                                )}
                                {step.outputKey && (
                                  <span className="text-[10px] text-muted-foreground font-mono">📦 {step.outputKey}</span>
                                )}
                                {step.code && (
                                  <span className="text-[10px] text-accent font-mono">
                                    {step.codeMode === 'reference' ? '📄' : '⚡'} {step.codeLanguage || 'js'} code
                                  </span>
                                )}
                              </div>
                              {step.code && (
                                <pre className="text-[10px] text-muted-foreground bg-muted rounded p-1.5 mt-1 overflow-x-auto whitespace-pre-wrap font-mono max-h-24 overflow-y-auto">
                                  {step.code}
                                </pre>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Code Files */}
                    {skill.codeFiles.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Bundled Code Files</p>
                        <div className="space-y-1.5">
                          {skill.codeFiles.map((cf, i) => (
                            <div key={i} className="rounded border border-border p-2 bg-muted/20">
                              <div className="flex items-center gap-2 mb-1">
                                <FileCode className="h-3 w-3 text-accent" />
                                <span className="text-xs font-mono text-foreground">{cf.filename}</span>
                                <span className="text-[10px] text-muted-foreground">({cf.language})</span>
                                {cf.description && <span className="text-[10px] text-muted-foreground">— {cf.description}</span>}
                              </div>
                              <pre className="text-[10px] text-muted-foreground bg-muted rounded p-1.5 overflow-x-auto whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                                {cf.content}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Output Format */}
                    {skill.outputFormat && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Output Format</p>
                        <pre className="text-[11px] text-muted-foreground bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono">{skill.outputFormat}</pre>
                      </div>
                    )}

                    {/* Meta */}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <div className="text-[10px] text-muted-foreground">
                        v{skill.version} · by {skill.author}
                      </div>
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => { setEditSkill(skill); setShowWizard(true); }} className="h-7 text-xs gap-1">
                          <Wand2 className="h-3 w-3" /> Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleExport(skill)} className="h-7 text-xs gap-1">
                          <Download className="h-3 w-3" /> Export
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(skill.id, skill.name)}
                          className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Install JSON Dialog */}
      <Dialog open={showInstall} onOpenChange={setShowInstall}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Install from JSON</DialogTitle>
            <DialogDescription>
              Paste a skill manifest (JSON) with optional embedded code in steps and codeFiles.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Textarea
              value={jsonInput}
              onChange={e => setJsonInput(e.target.value)}
              rows={12}
              placeholder={`{
  "name": "My Skill",
  "description": "What this skill does",
  "icon": "🚀",
  "category": "General",
  "triggers": ["keyword1"],
  "requiredPermissions": ["codeExecution"],
  "steps": [
    {
      "id": "1",
      "instruction": "Process the data",
      "toolHint": "code_execution",
      "code": "const result = data.map(x => x * 2);\\nconsole.log(result);",
      "codeLanguage": "javascript",
      "codeMode": "auto-execute"
    }
  ],
  "codeFiles": [
    {
      "filename": "helpers.js",
      "language": "javascript",
      "content": "function helper() { return 42; }",
      "description": "Utility functions"
    }
  ],
  "outputFormat": "## Result\\n..."
}`}
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowInstall(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleInstall} className="flex-1" disabled={!jsonInput.trim()}>Install</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Skill Wizard */}
      <Dialog open={showWizard} onOpenChange={v => { if (!v) { setShowWizard(false); setEditSkill(null); } }}>
        {showWizard && (
          <SkillWizard
            skill={editSkill}
            onSave={handleWizardSave}
            onClose={() => { setShowWizard(false); setEditSkill(null); }}
          />
        )}
      </Dialog>
    </div>
  );
}
