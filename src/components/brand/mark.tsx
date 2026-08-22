export function Mark({ className, pulse = false }: { className?: string; pulse?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <g className={pulse ? "origin-center animate-pulse" : undefined}>
        <g stroke="currentColor" strokeWidth="1.2" fill="none" className="text-accent opacity-70">
          <line x1="32" y1="14" x2="32" y2="6" />
          <line x1="47.6" y1="23" x2="55" y2="18.5" />
          <line x1="47.6" y1="41" x2="55" y2="45.5" />
          <line x1="32" y1="50" x2="32" y2="58" />
          <line x1="16.4" y1="41" x2="9" y2="45.5" />
          <line x1="16.4" y1="23" x2="9" y2="18.5" />
        </g>
        <circle cx="32" cy="6" r="1.7" fill="currentColor" className="text-accent" />
        <circle cx="55" cy="18.5" r="1.7" fill="currentColor" className="text-accent" />
        <circle cx="55" cy="45.5" r="1.7" fill="currentColor" className="text-accent" />
        <circle cx="32" cy="58" r="1.7" fill="currentColor" className="text-accent" />
        <circle cx="9" cy="45.5" r="1.7" fill="currentColor" className="text-accent" />
        <circle cx="9" cy="18.5" r="1.7" fill="currentColor" className="text-accent" />
        <path d="M32 16L45 23.5V38.5L32 46L19 38.5V23.5L32 16Z" fill="currentColor" className="text-accent" />
        <path d="M32 22L39 26V34L32 38L25 34V26L32 22Z" fill="currentColor" className="text-bg" />
      </g>
    </svg>
  );
}
