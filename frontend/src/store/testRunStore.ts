import { create } from 'zustand';

export type LogLevel = 'pass' | 'fail' | 'skip' | 'info';

export interface LogEntry {
  id: number;
  level: LogLevel;
  domain: string;
  message: string;
  details?: string;
  ts: number;
}

interface TestRunState {
  entries: LogEntry[];
  passCount: number;
  failCount: number;
  skipCount: number;
  running: boolean;
  nextId: number;
  addEntry: (e: Omit<LogEntry, 'id' | 'ts'>) => void;
  reset: () => void;
  setRunning: (running: boolean) => void;
}

export const useTestRunStore = create<TestRunState>((set, get) => ({
  entries: [],
  passCount: 0,
  failCount: 0,
  skipCount: 0,
  running: false,
  nextId: 1,
  addEntry: (e) => {
    const id = get().nextId;
    set((s) => ({
      entries: [...s.entries, { ...e, id, ts: Date.now() }],
      nextId: id + 1,
      passCount: s.passCount + (e.level === 'pass' ? 1 : 0),
      failCount: s.failCount + (e.level === 'fail' ? 1 : 0),
      skipCount: s.skipCount + (e.level === 'skip' ? 1 : 0),
    }));
  },
  reset: () => set({ entries: [], passCount: 0, failCount: 0, skipCount: 0, nextId: 1 }),
  setRunning: (running) => set({ running }),
}));
