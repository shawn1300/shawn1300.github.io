export function MusicIcon({ className }: { className?: string }) {
  return (
    <svg
      width="800px"
      height="800px"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeMiterlimit="10"
      strokeWidth="1.91"
    >
      <circle cx="12" cy="12" r="10.5" />
      <circle cx="11.05" cy="13.91" r="1.91" />
      <polyline points="15.82 8.18 12.96 8.18 12.96 13.91" />
    </svg>
  );
}
