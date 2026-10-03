import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { queryClient } from './api/queryClient';
import { bootSession } from './lib/session';
import './index.css';

// App.tsx renders <RouterProvider router={router} /> (see router.tsx).
// A returning person's session is restored from storage; if its access token went stale while the app was closed we
// renew it first (bounded to a few seconds, and skipped offline) so the first screen already knows who they are.
bootSession().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
});
