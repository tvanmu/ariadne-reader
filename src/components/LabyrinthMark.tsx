interface LabyrinthMarkProps {
  size?: number;
  spinning?: boolean;
  className?: string;
}

export default function LabyrinthMark({
  size = 40,
  spinning = false,
  className,
}: LabyrinthMarkProps) {
  const classes = ['labyrinth-mark', spinning ? 'is-spinning' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classes}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className="labyrinth-rings" stroke="currentColor" strokeLinecap="round">
          <circle cx="32" cy="32" r="26" strokeWidth="0.9" opacity="0.55" />
          <path
            d="M32 10 A22 22 0 0 1 54 32"
            strokeWidth="0.9"
            opacity="0.55"
          />
          <path
            d="M54 32 A22 22 0 0 1 32 54"
            strokeWidth="0.9"
            opacity="0.55"
          />
          <path
            d="M10 32 A22 22 0 0 1 26 11.5"
            strokeWidth="0.9"
            opacity="0.55"
          />
          <circle cx="32" cy="32" r="18" strokeWidth="0.8" opacity="0.42" />
          <path
            d="M14 32 A18 18 0 0 1 32 14"
            strokeWidth="0.8"
            opacity="0.42"
          />
          <circle cx="32" cy="32" r="11" strokeWidth="0.7" opacity="0.32" />
          <path
            d="M32 43 A11 11 0 0 1 21 32"
            strokeWidth="0.7"
            opacity="0.32"
          />
        </g>
        <g className="labyrinth-letter" stroke="currentColor" fill="none">
          <path
            d="M21 50 L32 14 L43 50"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M25.5 38 L38.5 38" strokeWidth="2" strokeLinecap="round" />
        </g>
        <circle cx="32" cy="32" r="1.4" fill="currentColor" opacity="0.85" />
      </svg>
    </span>
  );
}
