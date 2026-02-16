import { useState } from 'react';
import { ChevronDown, ChevronRight, Brain, FileText, Search, CheckCircle2, Loader2 } from 'lucide-react';
import { ResearchLoopProgress, ResearchLoopDetail } from '@/lib/llm';
import { Progress } from '@/components/ui/progress';

interface ResearchProgressBarProps {
  progress: ResearchLoopProgress;
  agentName: string;
}

function LoopDetailRow({ detail }: { detail: ResearchLoopDetail }) {
  const [expanded, setExpanded] = useState(false);
  const isDone = detail.status === 'done';

  return (
    <div className="border border-border/50 rounded bg-background/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left"
      >
        {isDone ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 text-accent animate-spin shrink-0" />
        )}
        <span className="text-xs font-medium text-foreground flex-1">
          Loop {detail.loopNumber}
        </span>
        <div className="flex items-center gap-1.5 mr-1">
          {detail.thoughts.length > 0 && (
            <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
              <Brain className="h-2.5 w-2.5" /> {detail.thoughts.length}
            </span>
          )}
          {detail.filesWritten.length > 0 && (
            <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
              <FileText className="h-2.5 w-2.5" /> {detail.filesWritten.length}
            </span>
          )}
          {detail.searches.length > 0 && (
            <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
              <Search className="h-2.5 w-2.5" /> {detail.searches.length}
            </span>
          )}
        </div>
        {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="px-2.5 pb-2 border-t border-border/30 space-y-1.5 animate-fade-in">
          {detail.thoughts.map((t, i) => (
            <div key={i} className="flex gap-1.5 mt-1.5">
              <Brain className="h-3 w-3 text-accent shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">{t}</p>
            </div>
          ))}
          {detail.filesWritten.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <FileText className="h-3 w-3 text-green-500 shrink-0" />
              <span className="text-[11px] text-foreground">{f.filename}</span>
              <span className="text-[9px] text-muted-foreground">({f.scope}, {f.category})</span>
            </div>
          ))}
          {detail.searches.map((s, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Search className="h-3 w-3 text-blue-500 shrink-0" />
                <span className="text-[11px] text-foreground">"{s.query}"</span>
              </div>
              {s.sources.length > 0 && (
                <div className="ml-[18px] space-y-0.5">
                  {s.sources.slice(0, 3).map((src, j) => (
                    <a key={j} href={src} target="_blank" rel="noopener noreferrer" className="block text-[9px] text-accent truncate hover:underline">
                      {src}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          {detail.thoughts.length === 0 && detail.filesWritten.length === 0 && detail.searches.length === 0 && (
            <p className="text-[10px] text-muted-foreground/60 italic mt-1.5">Processing...</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ResearchProgressBar({ progress, agentName }: ResearchProgressBarProps) {
  const percentage = Math.round((progress.currentLoop / progress.totalLoops) * 100);
  const isPreparingResponse = progress.activity === 'Preparing response...';

  return (
    <div className="border-t border-accent/20 bg-accent/5 px-4 py-2.5 space-y-2 animate-fade-in">
      <div className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 text-accent animate-spin shrink-0" />
        <span className="text-xs font-medium text-foreground flex-1">
          {agentName} — {isPreparingResponse ? 'Preparing response...' : `Research Loop ${progress.currentLoop}/${progress.totalLoops}`}
        </span>
        <span className="text-[10px] text-muted-foreground">{progress.activity}</span>
      </div>

      <Progress value={percentage} className="h-1.5" />

      {progress.completedLoops.length > 0 && (
        <div className="space-y-1 mt-1">
          {progress.completedLoops.map((detail) => (
            <LoopDetailRow key={detail.loopNumber} detail={detail} />
          ))}
        </div>
      )}
    </div>
  );
}
