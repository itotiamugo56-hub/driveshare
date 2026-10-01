import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SavedCar } from './savedStore';

interface RecentState { cars: SavedCar[]; view: (c: SavedCar) => void }

/** Last six cars the renter opened, newest first, kept on this device. */
export const useRecentStore = create<RecentState>()(
  persist(
    (set) => ({
      cars: [],
      view: (c) => set((s) => ({ cars: [c, ...s.cars.filter((x) => x.id !== c.id)].slice(0, 6) })),
    }),
    { name: 'ds-recent-cars' },
  ),
);
