import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** Renders a page at a URL inside a fresh query client (no retries, so failures surface at once). */
export function renderAt(ui: ReactElement, path: string, route = path.split('?')[0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={ui} />
          <Route path="*" element={<div>elsewhere: {'{location}'}</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
