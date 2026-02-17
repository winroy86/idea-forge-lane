import { useState, useEffect } from 'react';
import { Puzzle, Plus, Trash2, ChevronDown, ChevronUp, Download, Upload, Shield, AlertTriangle } from 'lucide-react';
import { Skill, SkillPermission } from '@/types';
import { getSkills, upsertSkill, deleteSkill, importSkillFromJSON } from '@/lib/skillStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
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
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const skill = importSkillFromJSON(ev.target?.result as string);
          upsertSkill(skill);
          refresh();
          toast({ title: `✅ Imported "${skill.name}"` });
        } catch (err: any) {
          toast({ title: 'Invalid file', description: err.message, variant: 'destructive' });
        }
      };
      reader.readAsText(file);
    };
    input.click();
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
          <Button variant="outline" size="sm" onClick={handleImportFile} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Import File
          </Button>
          <Button size="sm" onClick={() => setShowInstall(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Install Skill
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
            Install skills to give your agents structured workflows. Skills guide agents through
            multi-step processes using their existing tools.
          </p>
          <Button onClick={() => setShowInstall(true)}>Install Skill</Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {skills.map((skill) => {
            const isExpanded = expandedId === skill.id;
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
                              <div className="flex gap-2 mt-0.5">
                                {step.toolHint && (
                                  <span className="text-[10px] text-accent font-mono">→ {step.toolHint}</span>
                                )}
                                {step.outputKey && (
                                  <span className="text-[10px] text-muted-foreground font-mono">📦 {step.outputKey}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

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

      {/* Install Dialog */}
      <Dialog open={showInstall} onOpenChange={setShowInstall}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Install Skill</DialogTitle>
            <DialogDescription>
              Paste a skill manifest (JSON) to install a new workflow skill for your agents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Skill Manifest (JSON)</Label>
              <Textarea
                value={jsonInput}
                onChange={e => setJsonInput(e.target.value)}
                rows={12}
                placeholder={`{
  "name": "My Skill",
  "description": "What this skill does",
  "icon": "🚀",
  "category": "General",
  "triggers": ["keyword1", "keyword2"],
  "requiredPermissions": ["webSearch"],
  "steps": [
    { "id": "1", "instruction": "Step 1 instructions", "toolHint": "web_search" },
    { "id": "2", "instruction": "Step 2 instructions", "toolHint": "memory_write" }
  ],
  "outputFormat": "## Result\\n..."
}`}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowInstall(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleInstall} className="flex-1" disabled={!jsonInput.trim()}>Install</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
