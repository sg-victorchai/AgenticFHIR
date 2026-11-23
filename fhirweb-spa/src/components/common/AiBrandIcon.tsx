export default function AiBrandIcon({
  size = 'small',
}: {
  size?: 'small' | 'large';
}) {
  const isLarge = size === 'large';

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-cyan-400 text-slate-950 ${isLarge ? 'h-9 w-9' : 'h-7 w-7'}`}
    >
      <svg
        viewBox="0 0 24 24"
        className={isLarge ? 'h-5 w-5' : 'h-4 w-4'}
        fill="none"
      >
        <path
          d="M10.8 3.5 12.4 9l5.5 1.6-5.5 1.6-1.6 5.5-1.6-5.5-5.5-1.6L9.2 9l1.6-5.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="m18.5 14.5.8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
