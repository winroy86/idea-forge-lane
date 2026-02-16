import { useState } from 'react';
import { ChevronDown, ChevronRight, Terminal, Copy, Check, Code2 } from 'lucide-react';

export interface CodeBlock {
  code: string;
  language: string;
  output?: string;
  label?: string;
  context: 'public' | 'inner'; // whether agent shared this or it's inner-only
}

function SyntaxLine({ line, lineNum }: { line: string; lineNum: number }) {
  // Simple keyword-based highlighting
  const highlighted = line
    .replace(/\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|typeof|instanceof|class|extends|import|export|default|from|async|await|try|catch|throw|finally|yield)\b/g, '<kw>$1</kw>')
    .replace(/\b(true|false|null|undefined|NaN|Infinity)\b/g, '<lit>$1</lit>')
    .replace(/\b(\d+\.?\d*(?:n|e[+-]?\d+)?)\b/g, '<num>$1</num>')
    .replace(/(["'`])(?:(?!\1).)*\1/g, '<str>$&</str>')
    .replace(/\/\/.*/g, '<cmt>$&</cmt>')
    .replace(/(console)\.(log|error|warn)/g, '<bi>$1</bi>.<fn>$2</fn>')
    .replace(/\.(\w+)\(/g, '.<fn>$1</fn>(');

  return (
    <div className="flex">
      <span className="select-none w-8 text-right pr-3 text-muted-foreground/40 text-[10px] leading-5">{lineNum}</span>
      <span
        className="flex-1 leading-5"
        dangerouslySetInnerHTML={{
          __html: highlighted
            .replace(/<kw>/g, '<span class="text-[hsl(var(--accent))]">')
            .replace(/<\/kw>/g, '</span>')
            .replace(/<lit>/g, '<span class="text-orange-400">')
            .replace(/<\/lit>/g, '</span>')
            .replace(/<num>/g, '<span class="text-cyan-400">')
            .replace(/<\/num>/g, '</span>')
            .replace(/<str>/g, '<span class="text-emerald-400">')
            .replace(/<\/str>/g, '</span>')
            .replace(/<cmt>/g, '<span class="text-muted-foreground/60 italic">')
            .replace(/<\/cmt>/g, '</span>')
            .replace(/<bi>/g, '<span class="text-yellow-400">')
            .replace(/<\/bi>/g, '</span>')
            .replace(/<fn>/g, '<span class="text-blue-400">')
            .replace(/<\/fn>/g, '</span>')
        }}
      />
    </div>
  );
}

function CodeBlockView({ block }: { block: CodeBlock }) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const lines = block.code.split('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(block.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-md border border-border overflow-hidden my-2">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-b border-border">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Code2 className="h-3 w-3" />
          <span className="font-medium">{block.label || block.language}</span>
        </button>
        <div className="flex-1" />
        {block.context === 'inner' && (
          <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">inner thought</span>
        )}
        {block.context === 'public' && (
          <span className="text-[9px] bg-accent/15 text-accent px-1.5 py-0.5 rounded font-medium">shared</span>
        )}
        <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>

      {expanded && (
        <>
          {/* Code */}
          <div className="bg-[hsl(var(--card))] px-2 py-2 overflow-x-auto font-mono text-xs">
            {lines.map((line, i) => (
              <SyntaxLine key={i} line={line} lineNum={i + 1} />
            ))}
          </div>

          {/* Output */}
          {block.output && (
            <div className="border-t border-border bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Terminal className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Output</span>
              </div>
              <pre className="text-xs text-foreground font-mono whitespace-pre-wrap break-all leading-5">
                {block.output}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function CodeExecutionPanel({ blocks }: { blocks: CodeBlock[] }) {
  if (blocks.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {blocks.map((block, i) => (
        <CodeBlockView key={i} block={block} />
      ))}
    </div>
  );
}
