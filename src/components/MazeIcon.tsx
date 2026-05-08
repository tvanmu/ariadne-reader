interface MazeIconProps {
  size?: number;
  className?: string;
}

export default function MazeIcon({ size = 16, className }: MazeIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4 4h16v16H4z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8 4v4h4v4H8v4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <path
        d="M16 20v-4h-4v-4h4V8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <path
        d="M4 12h4M16 12h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="square"
      />
    </svg>
  );
}
