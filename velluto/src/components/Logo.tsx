// Velluto mark: a play triangle folded like a ribbon of velvet.
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <defs>
          <linearGradient id="vg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f2cd7c" />
            <stop offset="1" stopColor="#c2456b" />
          </linearGradient>
        </defs>
        <path d="M7 4.5c0-1.2 1.3-1.9 2.3-1.3l17.4 11.2c.9.6.9 2 0 2.6L9.3 28.2C8.3 28.8 7 28.1 7 26.9z" fill="url(#vg)" />
        <path d="M7 4.5c4.5 4 6.5 7.8 6.5 11.5S11.5 23.5 7 27" fill="none" stroke="#120b14" strokeOpacity=".45" strokeWidth="1.6" />
      </svg>
      <span className="font-serif text-2xl font-semibold tracking-tight">velluto</span>
    </span>
  );
}
