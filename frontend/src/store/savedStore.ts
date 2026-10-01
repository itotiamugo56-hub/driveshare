import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SavedCar { id: string; title: string; price: string; place: string }
interface SavedState { cars: Record<string, SavedCar>; toggle: (c: SavedCar) => void; remove: (id: string) => void }

/** Saved cars live on the device (no account needed), so window-shoppers can shortlist before signing up. */
export const useSavedStore = create<SavedState>()(
  persist(
    (set) => ({
      cars: {},
      toggle: (c) => set((s) => {
        const next = { ...s.cars };
        if (next[c.id]) delete next[c.id]; else next[c.id] = c;
        return { cars: next };
      }),
      remove: (id) => set((s) => { const next = { ...s.cars }; delete next[id]; return { cars: next }; }),
    }),
    { name: 'ds-saved-cars' },
  ),
);
