const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const ICONS: Record<string, React.ReactNode> = {
  ticket: (
    <path fill="currentColor" d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.2a2.8 2.8 0 0 0 0 5.6V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.2a2.8 2.8 0 0 0 0-5.6Zm11 0v2h1.5V7Zm0 4v2h1.5v-2Zm0 4v2h1.5v-2Z" />
  ),
  check: <path {...P} strokeWidth={3} d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: <path {...P} strokeWidth={2.4} d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v5m0 3.2v.1" />,
  passport: (
    <>
      <path {...P} d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <circle {...P} cx="11.5" cy="10" r="3.2" />
      <path {...P} d="M8.5 17h6" />
    </>
  ),
  hall: <path {...P} d="M3 20h18M5 20V10m14 10V10M9 20v-6h6v6M2.5 10 12 4l9.5 6Z" />,
  trophy: <path {...P} d="M8 4h8v5a4 4 0 0 1-8 0Zm0 1.5H4.5A3.5 3.5 0 0 0 8 10m8-4.5h3.5A3.5 3.5 0 0 1 16 10M12 13v3.5M8.5 20h7l-1-3.5h-5Z" />,
  key: (
    <>
      <circle {...P} cx="8" cy="15" r="4" />
      <path {...P} d="m11 12 8-8m-3 3 2.5 2.5M14 9l2 2" />
    </>
  ),
  chart: <path {...P} d="M4 20V10m6 10V4m6 16v-7m4 7H3" />,
  booth: <path {...P} d="M4 9h16l-1.5-5h-13Zm0 0a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M5 11.5V20h14v-8.5M10 20v-5h4v5" />,
  game: (
    <>
      <path {...P} d="M7 8h10a4 4 0 0 1 4 4.5l-.6 3.4a2 2 0 0 1-3.5.9L15 15H9l-1.9 1.8a2 2 0 0 1-3.5-.9L3 12.5A4 4 0 0 1 7 8Z" />
      <path {...P} d="M8 10.5v3M6.5 12h3" />
      <circle cx="16" cy="11" r="1" fill="currentColor" />
      <circle cx="17.5" cy="13" r="1" fill="currentColor" />
    </>
  ),
  tool: <path {...P} d="M14.5 6.5a4 4 0 0 0 5 5l-8.8 8.8a2.1 2.1 0 0 1-3-3l8.8-8.8a4 4 0 0 0-2 0ZM4 4l3 3" />,
  share: (
    <>
      <rect {...P} x="4" y="4" width="16" height="16" rx="2" />
      <path {...P} d="M8 10.5V16m0-8.5v.1M11.5 16v-3.2a2.3 2.3 0 0 1 4.5 0V16m-4.5-5.5V16" />
    </>
  ),
  camera: (
    <>
      <rect {...P} x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle {...P} cx="12" cy="12" r="3.8" />
      <circle cx="17" cy="7" r="1" fill="currentColor" />
    </>
  ),
  clock: (
    <>
      <circle {...P} strokeWidth={2.2} cx="12" cy="12" r="9" />
      <path {...P} strokeWidth={2.2} d="M12 7v5l3 2" />
    </>
  ),
  logout: <path {...P} d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" />,
  google: (
    <>
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2Z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1Z" />
    </>
  ),
};

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {ICONS[name] ?? ICONS.passport}
    </svg>
  );
}
