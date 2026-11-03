import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line/80 bg-surface p-6 shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function CardTitle({ className, as: Tag = "h2", ...props }: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" }) {
  return <Tag className={cn("text-[1.05rem] font-semibold tracking-[-0.01em] text-plum-900", className)} {...props} />;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-2 text-gold-600">{eyebrow}</p>}
        <h1 className="font-serif text-[1.85rem] font-medium leading-tight text-plum-900 sm:text-[2.25rem]">{title}</h1>
        {description && <div className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-plum-700/20 bg-surface/70 px-6 py-14 text-center">
      <span aria-hidden className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-violet-100 text-plum-700">✦</span>
      <p className="font-semibold text-plum-900">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "success" | "danger"; title?: string; children?: React.ReactNode; className?: string }) {
  const tones = {
    info: "border-violet-100 bg-violet-50 text-plum-900",
    warning: "border-warning/20 bg-warning-bg text-warning",
    success: "border-success/20 bg-success-bg text-success",
    danger: "border-danger/20 bg-danger-bg text-danger",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-2 font-serif text-[1.75rem] font-medium leading-none text-plum-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
