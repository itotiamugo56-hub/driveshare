import { useParams } from 'react-router-dom';
import { useRef } from 'react';
import { useVehicle, useAddVehiclePhoto, useRemoveVehiclePhoto, useReorderVehiclePhotos } from '../hooks/useVehicleListing';
import { fileToBase64 } from '../lib/imageFile';
import { StatusBanner } from '../components/StatusBanner';

/**
 * Audit gap addressed: `addVehiclePhoto`/`removeVehiclePhoto`/`reorderVehiclePhotos`
 * had no frontend wrapper and, consequently, no UI could call them — the
 * single most feed-defining backend capability (vehicle photos) was
 * entirely unreachable. This is the first screen that calls all three.
 *
 * Ownership enforcement (403 for non-owners) is handled entirely by the
 * backend (`VehicleListingService.addVehiclePhoto` etc., unchanged here);
 * this page does not duplicate or loosen that check — a non-owner calling
 * these mutations gets the same 403 the backend already returns, surfaced
 * via the mutation's `isError`/`error` state.
 */
export function VehiclePhotoManagerPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const vehicleQuery = useVehicle(vehicleId);
  const addPhoto = useAddVehiclePhoto(vehicleId ?? '');
  const removePhoto = useRemoveVehiclePhoto(vehicleId ?? '');
  const reorderPhotos = useReorderVehiclePhotos(vehicleId ?? '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!vehicleId) return <StatusBanner kind="error" message="No vehicle selected." />;
  if (vehicleQuery.isLoading) return <StatusBanner kind="loading" message="Loading vehicle…" />;
  if (vehicleQuery.isError || !vehicleQuery.data) {
    return (
      <StatusBanner
        kind="error"
        message="Could not load this vehicle (sign-in as its owner is required — see JwtAuthGuard on vehicle-listing.controller.ts)."
      />
    );
  }

  const photos = [...vehicleQuery.data.photos].sort((a, b) => a.position - b.position);

  const handleFileSelected = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const { base64, mimeType } = await fileToBase64(file);
      await addPhoto.mutateAsync({ photoBase64: base64, mimeType });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const reordered = [...photos];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorderPhotos.mutate(reordered.map((p) => p.id));
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24, textAlign: 'left' }}>
      <h1 style={{ fontSize: 22 }}>
        Manage photos — {vehicleQuery.data.year} {vehicleQuery.data.make} {vehicleQuery.data.model}
      </h1>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleFileSelected(e.target.files)}
        disabled={addPhoto.isPending}
      />
      {addPhoto.isPending && <StatusBanner kind="loading" message="Uploading photo…" />}
      {addPhoto.isError && (
        <StatusBanner kind="error" message={`Upload failed: ${addPhoto.error instanceof Error ? addPhoto.error.message : 'unknown error'}`} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {photos.map((photo, i) => (
          <div key={photo.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
            <img src={photo.url} alt="" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 4 }} />
            <span style={{ fontSize: 12, color: 'var(--text)' }}>Position {photo.position}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <button onClick={() => move(i, -1)} disabled={i === 0 || reorderPhotos.isPending}>
                ↑
              </button>
              <button onClick={() => move(i, 1)} disabled={i === photos.length - 1 || reorderPhotos.isPending}>
                ↓
              </button>
              <button onClick={() => removePhoto.mutate(photo.id)} disabled={removePhoto.isPending}>
                Remove
              </button>
            </div>
          </div>
        ))}
        {photos.length === 0 && <StatusBanner kind="empty" message="No photos uploaded yet." />}
      </div>
    </div>
  );
}
