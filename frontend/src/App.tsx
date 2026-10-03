import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './lib/ui';
import { router } from './router';

/**
 * One query cache for the whole product.
 *
 * `retry: 1` because a single failed read is usually a transient backend
 * restart, and `staleTime: 30s` because a stage page re-reads the same summary
 * several times while its user looks at it.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
