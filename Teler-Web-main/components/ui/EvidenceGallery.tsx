import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Grid3X3, Images, X } from 'lucide-react';
import { OverlaySurface } from './Overlay';
import { IconButton } from './IconButton';
import { Button } from './Button';

interface EvidenceGalleryProps {
  imageUrls: string[];
  title?: string;
}

export const EvidenceGallery: React.FC<EvidenceGalleryProps> = ({ imageUrls, title = 'Evidence' }) => {
  const [open, setOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const visible = useMemo(() => imageUrls.slice(0, 4), [imageUrls]);
  const remaining = Math.max(0, imageUrls.length - visible.length);

  const close = () => {
    setPreviewIndex(null);
    setOpen(false);
  };

  const openGrid = () => {
    setPreviewIndex(null);
    setOpen(true);
  };

  const openPreview = (index: number) => {
    setPreviewIndex(index);
    setOpen(true);
  };

  const previous = () => {
    setPreviewIndex(index => index == null ? 0 : (index - 1 + imageUrls.length) % imageUrls.length);
  };

  const next = () => {
    setPreviewIndex(index => index == null ? 0 : (index + 1) % imageUrls.length);
  };

  useEffect(() => {
    if (!open || previewIndex == null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        previous();
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, previewIndex, imageUrls.length]);

  if (!imageUrls.length) return null;

  return <>
    <section className="bg-surface-card border border-subtle rounded-2xl p-5 md:p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Images className="w-4 h-4 text-accent" />
        <h3 className="font-semibold">{title}</h3>
        <button type="button" onClick={openGrid} className="ml-auto inline-flex items-center gap-2 text-xs text-secondary hover:text-primary transition-colors">
          <span>{imageUrls.length} screenshot{imageUrls.length === 1 ? '' : 's'}</span>
          <span className="text-accent font-semibold">View all</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4">
        {visible.map((url, index) => <button
          key={url}
          type="button"
          onClick={() => openPreview(index)}
          className="group relative text-left overflow-hidden rounded-xl border border-subtle bg-surface-raised hover:border-accent transition-colors"
        >
          <img src={url} alt={`Screenshot ${index + 1} from this session`} loading="lazy" className="block w-full aspect-video object-cover" />
          <span className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs text-secondary">
            <span>Screenshot {index + 1}</span>
            {index === visible.length - 1 && remaining > 0 && <span className="rounded-full border border-accent bg-accent-soft px-2 py-0.5 text-accent font-semibold">+{remaining} more</span>}
          </span>
        </button>)}
      </div>
    </section>

    {open && <OverlaySurface
      label="Evidence gallery"
      onClose={close}
      className="w-full max-w-7xl h-[88vh] bg-surface-card border border-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col"
    >
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 md:px-5 py-3.5 border-b border-subtle bg-surface-card">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Images className="w-4 h-4 text-accent" />
            <h2 className="font-semibold text-primary">{title}</h2>
          </div>
          <p className="text-xs text-secondary mt-1">
            {previewIndex == null ? `${imageUrls.length} screenshots` : `Screenshot ${previewIndex + 1} of ${imageUrls.length}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {previewIndex != null && <Button variant="secondary" size="sm" onClick={() => setPreviewIndex(null)}>
            <Grid3X3 className="w-4 h-4" /> Back to grid
          </Button>}
          <IconButton label="Close evidence gallery" size="sm" variant="ghost" onClick={close}><X className="w-4 h-4" /></IconButton>
        </div>
      </header>

      {previewIndex == null ? <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-5">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {imageUrls.map((url, index) => <button
            key={url}
            type="button"
            onClick={() => setPreviewIndex(index)}
            className="group text-left overflow-hidden rounded-xl border border-subtle bg-surface-raised hover:border-accent hover:bg-surface-hover transition-all"
          >
            <img src={url} alt={`Screenshot ${index + 1}`} loading="lazy" className="block w-full aspect-video object-cover" />
            <div className="px-3 py-2.5">
              <p className="text-sm font-medium text-primary">Screenshot {index + 1}</p>
              <p className="text-[11px] text-secondary mt-0.5">Open full preview</p>
            </div>
          </button>)}
        </div>
      </div> : <div className="flex-1 min-h-0 flex flex-col bg-surface-page">
        <div className="flex-1 min-h-0 relative flex items-center justify-center p-3 md:p-5">
          <img
            src={imageUrls[previewIndex]}
            alt={`Screenshot ${previewIndex + 1} full preview`}
            className="max-w-full max-h-full object-contain rounded-xl border border-subtle bg-surface-card shadow-card"
          />
          {imageUrls.length > 1 && <>
            <IconButton
              label="Previous screenshot"
              onClick={previous}
              className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 bg-surface-card/95 backdrop-blur border-strong shadow-card"
            >
              <ChevronLeft className="w-5 h-5" />
            </IconButton>
            <IconButton
              label="Next screenshot"
              onClick={next}
              className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 bg-surface-card/95 backdrop-blur border-strong shadow-card"
            >
              <ChevronRight className="w-5 h-5" />
            </IconButton>
          </>}
        </div>
        <footer className="shrink-0 px-4 md:px-5 py-3 border-t border-subtle bg-surface-card flex items-center justify-between gap-3">
          <span className="text-xs text-secondary">Use ← and → to navigate</span>
          <span className="text-xs font-semibold text-primary">Screenshot {previewIndex + 1} / {imageUrls.length}</span>
        </footer>
      </div>}
    </OverlaySurface>}
  </>;
};