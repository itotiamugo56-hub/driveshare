import { useState } from 'react';
import type { VehiclePhoto } from '../api/schemas/vehicleListing.schemas';

interface PhotoGalleryProps {
  photos: VehiclePhoto[];
  altText: string;
}

/**
 * Audit gap addressed: "no image-rendering component exists anywhere in
 * the codebase, despite the backend's `VehiclePhoto` model and mock
 * `data:`-URI photo storage being fully implemented and ready to
 * consume." Renders `VehiclePhoto.url` directly — in mock mode this is a
 * `data:` URI (see `PhotoStorageProvider`), in live mode an object-store
 * URL; both are valid `<img src>` values, so no mode-specific handling is
 * needed here.
 */
export function PhotoGallery({ photos, altText }: PhotoGalleryProps) {
  const ordered = [...photos].sort((a, b) => a.position - b.position);
  const [activeIndex, setActiveIndex] = useState(0);

  if (ordered.length === 0) {
    return (
      <div
        style={{
          aspectRatio: '4 / 3',
          borderRadius: 8,
          border: '1px dashed var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text)',
          fontSize: 13,
        }}
      >
        No photos yet
      </div>
    );
  }

  const active = ordered[Math.min(activeIndex, ordered.length - 1)];

  return (
    <div>
      <img
        src={active.url}
        alt={altText}
        style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8, display: 'block' }}
      />
      {ordered.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, overflowX: 'auto' }}>
          {ordered.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => setActiveIndex(i)}
              style={{
                padding: 0,
                border: i === activeIndex ? '2px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 6,
                background: 'none',
                cursor: 'pointer',
                flex: '0 0 auto',
              }}
              aria-label={`Show photo ${i + 1}`}
            >
              <img
                src={photo.url}
                alt=""
                style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 4, display: 'block' }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Single-photo variant used on the compact feed card (see VehicleCard.tsx). */
export function CoverPhoto({ photo, altText }: { photo: VehiclePhoto | undefined; altText: string }) {
  if (!photo) {
    return (
      <div
        style={{
          aspectRatio: '4 / 3',
          borderRadius: 8,
          border: '1px dashed var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text)',
          fontSize: 12,
        }}
      >
        No photo
      </div>
    );
  }
  return (
    <img
      src={photo.url}
      alt={altText}
      style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8, display: 'block' }}
    />
  );
}
