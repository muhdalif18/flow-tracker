import { useEffect, useState } from 'react';

interface Props {
  images: string[];
  initialIndex: number;
  onClose: () => void;
  onDelete?: (idx: number) => void;
  canEdit?: boolean;
}

export default function EvidenceModal({ images, initialIndex, onClose, onDelete, canEdit }: Props) {
  const [idx, setIdx] = useState(Math.min(initialIndex, images.length - 1));
  const [copied, setCopied] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const prev = () => setIdx(i => (i - 1 + images.length) % images.length);
  const next = () => setIdx(i => (i + 1) % images.length);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Reset zoom when navigating
  useEffect(() => { setZoomed(false); }, [idx]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(images[idx]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const handleDelete = () => {
    if (!onDelete) return;
    onDelete(idx);
    if (images.length <= 1) { onClose(); return; }
    setIdx(i => Math.min(i, images.length - 2));
  };

  const url = images[idx];

  return (
    <div className="ev-overlay" onClick={onClose}>
      <div className="ev-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ev-header">
          <span className="ev-counter">{idx + 1} / {images.length}</span>
          <div className="ev-header-actions">
            <button className="ev-action-btn" onClick={copyUrl} title="Copy image URL">
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
              <span>{copied ? 'Copied!' : 'Copy URL'}</span>
            </button>
            <a className="ev-action-btn" href={url} target="_blank" rel="noreferrer" title="Open in new tab">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              <span>Open</span>
            </a>
            {canEdit && onDelete && (
              <button className="ev-action-btn ev-delete-btn" onClick={handleDelete} title="Remove screenshot">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
                <span>Delete</span>
              </button>
            )}
            <button className="ev-close-btn" onClick={onClose} title="Close (Esc)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Image area */}
        <div className="ev-img-area">
          {images.length > 1 && (
            <button className="ev-nav ev-nav-prev" onClick={prev} title="Previous (←)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}

          <div className={`ev-img-wrap ${zoomed ? 'zoomed' : ''}`} onClick={() => setZoomed(z => !z)} title={zoomed ? 'Click to fit' : 'Click to zoom'}>
            <img src={url} alt={`Screenshot ${idx + 1}`} className="ev-img" draggable={false} />
          </div>

          {images.length > 1 && (
            <button className="ev-nav ev-nav-next" onClick={next} title="Next (→)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </div>

        {/* Thumbnails strip */}
        {images.length > 1 && (
          <div className="ev-thumbs">
            {images.map((u, i) => (
              <button
                key={i}
                className={`ev-thumb ${i === idx ? 'active' : ''}`}
                onClick={() => setIdx(i)}
              >
                <img src={u} alt={`thumb ${i + 1}`} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
