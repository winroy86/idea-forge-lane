import { Puzzle } from 'lucide-react';

export default function SkillsPage() {
  return (
    <div className="animate-fade-in p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Skills</h1>
          <p className="text-sm text-muted-foreground mt-1">Install and manage agent skills and tools.</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Puzzle className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-medium text-foreground mb-1">Coming Soon</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          The Skills marketplace will let you install tools from local ZIPs, Git URLs, or a marketplace feed.
          Skills follow an OpenAPI-style manifest format with sandboxed execution.
        </p>
      </div>
    </div>
  );
}
