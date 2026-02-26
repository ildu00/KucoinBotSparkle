import { useState } from "react";
import { ChevronDown, ChevronUp, Bug } from "lucide-react";

interface DebugPanelProps {
  data: unknown;
}

export function DebugPanel({ data }: DebugPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card-trading border-warning/30">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-warning hover:text-warning/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4" />
          <span className="font-medium">Raw API Debug (click to expand)</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          <pre className="text-xs font-mono text-muted-foreground overflow-auto max-h-96 bg-secondary rounded-lg p-3 leading-relaxed">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
