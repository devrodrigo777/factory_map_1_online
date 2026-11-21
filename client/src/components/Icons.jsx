const paths = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  back: 'M15 5l-7 7 7 7',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  cursor: 'M5 3l14 7-6 2-2 6z',
  polygon: 'M12 3l8 6-3 11H7L4 9z',
  square: 'M4 5h16v14H4z',
  check: 'M5 12l5 5 9-10',
  close: 'M6 6l12 12M18 6L6 18',
  star: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  swap: 'M4 8h13l-3-3M20 16H7l3 3',
  open: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z',
  chart: 'M4 20h16M7 20v-7M12 20V5M17 20v-10',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  unlock: 'M7 11V8a5 5 0 019.6-2M5 11h14v10H5z',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  image: 'M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm18 11l-5-5-4 4-3-3-6 6M8.5 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  download: 'M12 4v12m0 0l-4-4m4 4l4-4M4 20h16',
  save: 'M5 4h12l3 3v13H5zM8 4v6h8V4M8 20v-6h8v6',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  magnet: 'M6 4v7a6 6 0 0 0 12 0V4M6 8h4M14 8h4M4 4h6M14 4h6',
  undo: 'M3 7v6h6M3 13a9 9 0 102.16-5.74L3 13',
  redo: 'M21 7v6h-6M21 13a9 9 0 11-2.16-5.74L21 13',
  play: 'M5 3l14 9-14 9V3z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  alert: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  info: 'M12 16v-4m0-4h.01M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0z',
  search: 'M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  qr: 'M4 4h4v4H4zm12 0h4v4h-4zm-12 12h4v4H4zm12 4h4v-4h-4zm0-8h1v2h-1zm3 0h1v2h-1zm-3 3h2v2h-2zm3 3h1v2h-1zm-3 2h1v1h-1zM4 9v2h2V9zm7-5v7h2V4zm-2 9h2v2H9zm2 3h2v2h-2zm-2 2h2v2H9z',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M18 15l-6-6-6 6',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
};

export default function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
