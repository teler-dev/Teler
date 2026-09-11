import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Grid3X3, Images, Maximize2, X } from 'lucide-react';
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
        <span className="w-8 h-8 rounded-xl bg-accent-soft border border-accent flex items-center justify-center shrink-0">
          <Images className="w-4 h-4 text-accent" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-primary">{title}</h3>
          <p className="text-[11px] text-secondary mt-0.5">Session visual evidence</p>
        </div>
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
          className="group relative text-left overflow-hidden rounded-xl border border-subtle bg-surface-raised hover:border-accent transition-all"
        >
          <div className="relative overflow-hidden">
            <img src={url} alt={`Screenshot ${index + 1} from this session`} loading="lazy" className="block w-full aspect-video object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
            <span className="absolute top-2 left-2 rounded-full bg-surface-card/90 backdrop-blur px-2 py-1 text-[10px] font-semibold text-primary border border-subtle">
              {String(index + 1).padStart(2, '0')}
            </span>
          </div>
          <span className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs text-secondary">
            <span>Screenshot {index + 1}</span>
            {index === visible.length - 1 && remaining > 0 && <span className="rounded-full border border-accent bg-accent-soft px-2 py-0.5 text-accent font-semibold">+{remaining} more</span>}
          </span>
        </button>)}
      </div>
    </section>

    {open && <OverlaySurface
      label="Evidence studio"
      onClose={close}
      kind="center"
      className="w-[calc(100vw-2rem)] max-w-[1540px] h-[calc(100vh-2rem)] max-h-[940px] bg-surface-card border border-strong rounded-[26px] shadow-2xl overflow-hidden flex flex-col"
    >
      <header className="shrink-0 flex items-center justify-between gap-4 px-4 md:px-6 py-4 border-b border-subtle bg-surface-card/95 backdrop-blur-xl">
        <div className="min-w-0 flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-accent-soft border border-accent flex items-center justify-center shrink-0">
            <Images className="w-5 h-5 text-accent" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-semibold text-primary truncate">{title} Studio</h2>
              <span className="hidden sm:inline-flex rounded-full border border-subtle bg-surface-raised px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-secondary">
                Review mode
              </span>
            </div>
            <p className="text-xs text-secondary mt-1">
              {previewIndex == null ? `${imageUrls.length} captured screenshots` : `Screenshot ${previewIndex + 1} of ${imageUrls.length}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {previewIndex != null && <Button variant="secondary" size="sm" onClick={() => setPreviewIndex(null)}>
            <Grid3X3 className="w-4 h-4" /> <span className="hidden sm:inline">Grid</span>
          </Button>}
          <IconButton label="Close evidence studio" size="sm" variant="ghost" onClick={close}><X className="w-4 h-4" /></IconButton>
        </div>
      </header>

      {previewIndex == null ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 bg-surface-page">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-accent">Evidence board</p>
              <h3 className="text-lg font-semibold text-primary mt-1">Captured session frames</h3>
            </div>
            <span className="text-xs text-secondary">{imageUrls.length} total</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {imageUrls.map((url, index) => <button
              key={url}
              type="button"
              onClick={() => setPreviewIndex(index)}
              className="group text-left overflow-hidden rounded-2xl border border-subtle bg-surface-card hover:border-accent hover:-translate-y-0.5 transition-all shadow-card"
            >
              <div className="relative overflow-hidden bg-surface-raised">
                <img src={url} alt={`Screenshot ${index + 1}`} loading="lazy" className="block w-full aspect-video object-cover transition-transform duration-300 group-hover:scale-[1.025]" />
                <span className="absolute top-2.5 left-2.5 rounded-full bg-surface-card/92 backdrop-blur px-2 py-1 text-[10px] font-semibold text-primary border border-subtle">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full bg-surface-card/92 backdrop-blur border border-subtle flex items-center justify-center text-secondary opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="px-3.5 py-3">
                <p className="text-sm font-semibold text-primary">Screenshot {index + 1}</p>
                <p className="text-[11px] text-secondary mt-1">Open studio preview</p>
              </div>
            </button>)}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col bg-surface-page">
          <div
            className="flex-1 min-h-0 relative flex items-center justify-center px-3 md:px-5 py-3 md:py-4 overflow-hidden"
            style={{
              backgroundImage:
                'radial-gradient(circle at 50% 42%, rgba(34,211,238,0.08), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.012), transparent)',
            }}
          >
            <div className="absolute top-4 left-4 md:top-5 md:left-5 inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-card/85 backdrop-blur px-3 py-1.5 text-[11px] text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Studio preview
            </div>

            <div className="relative w-full h-full flex items-center justify-center px-10 md:px-16">
              <div className="relative w-full h-full max-w-[1420px] max-h-full p-2 md:p-3 rounded-[24px] border border-subtle bg-surface-card/65 backdrop-blur-sm shadow-2xl flex items-center justify-center">
                <img
                  src={imageUrls[previewIndex]}
                  alt={`Screenshot ${previewIndex + 1} full preview`}
                  className="block max-w-full max-h-[calc(100vh-180px)] object-contain rounded-2xl bg-surface-card"
                />
              </div>
            </div>

            {imageUrls.length > 1 && <>
              <IconButton
                label="Previous screenshot"
                onClick={previous}
                className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-2xl bg-surface-card/90 backdrop-blur border-strong shadow-2xl hover:bg-surface-raised"
              >
                <ChevronLeft className="w-5 h-5" />
              </IconButton>
              <IconButton
                label="Next screenshot"
                onClick={next}
                className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-2xl bg-surface-card/90 backdrop-blur border-strong shadow-2xl hover:bg-surface-raised"
              >
                <ChevronRight className="w-5 h-5" />
              </IconButton>
            </>}
          </div>

          <footer className="shrink-0 border-t border-subtle bg-surface-card/96 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5">
              <span className="text-[11px] text-secondary">Use ← and → to navigate</span>
              <span className="rounded-full border border-subtle bg-surface-raised px-2.5 py-1 text-[11px] font-semibold text-primary">
                {previewIndex + 1} / {imageUrls.length}
              </span>
            </div>
          </footer>
        </div>
      )}
    </OverlaySurface>}
  </>;
};