import type { ReactNode } from "react";

export function Panel({
  title,
  meta,
  children,
  className = "",
  accent,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  accent?: "phosphor" | "magenta" | "amber" | "cyan";
}) {
  const accentBar = {
    phosphor: "bg-[var(--color-phosphor)]",
    magenta: "bg-[var(--color-magenta)]",
    amber: "bg-[var(--color-amber)]",
    cyan: "bg-[var(--color-cyan)]",
  }[accent ?? "phosphor"];

  return (
    <div className={`panel ${className}`}>
      <div className="panel-header">
        <div className="flex items-center gap-2.5">
          {accent && <div className={`w-1 h-3 ${accentBar}`} />}
          <span className="panel-title">{title}</span>
        </div>
        {meta && <div className="panel-meta">{meta}</div>}
      </div>
      {children}
    </div>
  );
}
