import { cn } from "../../lib/cn";

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-slate-800", className)} />;
}
