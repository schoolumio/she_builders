export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-4 px-4 py-10" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-1/3 rounded bg-violet-100" />
      <div className="h-32 rounded-[var(--radius-card)] bg-violet-50" />
      <div className="h-32 rounded-[var(--radius-card)] bg-violet-50" />
    </div>
  );
}
