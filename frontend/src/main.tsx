import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { queryClient } from './api/queryClient';
// Audit finding: index.css (the design-token stylesheet) was never imported anywhere,
// so it had no effect on any rendered page.
import './index.css';

// App.tsx renders <RouterProvider router={router} /> (see router.tsx, using
// createBrowserRouter) — no separate <BrowserRouter> wrapper is needed here.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
