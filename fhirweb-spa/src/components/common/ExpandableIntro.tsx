import { useId, useState, type ReactNode } from 'react';

export default function ExpandableIntro({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const paragraphId = useId();

  return (
    <div className="mb-4 max-w-5xl">
      <p
        id={paragraphId}
        className={`text-sm leading-relaxed text-slate-600 ${expanded ? '' : 'line-clamp-3 sm:line-clamp-none'}`}
      >
        {children}
      </p>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={paragraphId}
        onClick={() => setExpanded((value) => !value)}
        className="mt-1 text-xs font-semibold text-cyan-800 underline decoration-cyan-300 underline-offset-2 hover:text-cyan-950 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 sm:hidden"
      >
        {expanded ? 'Show less' : 'Read more'}
      </button>
    </div>
  );
}
