import { useState, type ReactNode } from 'react';

/**
 * A photo inside a ".media" box. Until the file exists in public/assets/images,
 * the box shows a green placeholder with the file path it expects.
 */
export function Photo({ src, alt = '', className = '', label, children }: {
  src: string; alt?: string; className?: string; label?: string; children?: ReactNode;
}) {
  // Remember which address failed, so a new photo (e.g. changed in the admin) gets a fresh try
  const [failedSrc, setFailedSrc] = useState('');
  const missing = !src || failedSrc === src;
  return (
    <div className={`media ${className} ${missing ? 'missing' : ''}`} data-ph={label ?? src.replace(/^\//, '')}>
      <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} onLoad={() => setFailedSrc('')} />
      {children}
    </div>
  );
}
