import * as React from "react";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "./ui/button";

type Props = {
  content: string;
  defaultCollapsed?: boolean;
  collapsedMaxHeightPx?: number;
  components?: Components;
  className?: string;
};

export function CollapsibleMarkdown({
  content,
  defaultCollapsed = true,
  collapsedMaxHeightPx = 220,
  components,
  className,
}: Props) {
  const [collapsed, setCollapsed] = React.useState<boolean>(defaultCollapsed);

  // If the content changes (rare for chat cards), reset to default.
  React.useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [content, defaultCollapsed]);

  const canCollapse = content.trim().length > 0;

  if (!canCollapse) return null;

  return (
    <div className={className}>
      <div
        className={
          "relative " +
          (collapsed ? "overflow-hidden" : "")
        }
        style={collapsed ? { maxHeight: collapsedMaxHeightPx } : undefined}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>

        {collapsed ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-950/90 to-transparent" />
        ) : null}
      </div>

      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          {collapsed ? "See more" : "Collapse"}
        </Button>
      </div>
    </div>
  );
}
