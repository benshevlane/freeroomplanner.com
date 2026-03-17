interface LogoProps {
  className?: string;
  size?: number;
}

export default function FreeRoomPlannerLogo({ className = "", size = 28 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Free Room Planner"
      className={className}
    >
      {/* Outer room outline */}
      <rect
        x="3"
        y="3"
        width="26"
        height="26"
        rx="2"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
      />
      {/* Internal wall - horizontal */}
      <line
        x1="3"
        y1="14"
        x2="20"
        y2="14"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* Internal wall - vertical */}
      <line
        x1="20"
        y1="14"
        x2="20"
        y2="29"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* Door arc in horizontal wall */}
      <path
        d="M 22 14 A 5 5 0 0 1 27 14"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Door arc in vertical wall */}
      <path
        d="M 20 20 A 4 4 0 0 0 20 24"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Dimension arrow/tick marks */}
      <line x1="8" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1" opacity="0.5" />
      <line x1="8" y1="6" x2="8" y2="8" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="15" y1="6" x2="15" y2="8" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}
