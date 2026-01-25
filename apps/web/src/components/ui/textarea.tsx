import * as React from "react";
import { cn } from "../../lib/cn";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[80px] w-full resize-none rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400",
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";
