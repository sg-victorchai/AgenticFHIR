import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { FHIRProvider } from './contexts/FHIRContext';
import { store } from './store';
import App from './App.tsx';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter basename="/smartapp">
        <QueryClientProvider client={queryClient}>
          <FHIRProvider>
            <App />
            <ReactQueryDevtools initialIsOpen={false} />
          </FHIRProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
