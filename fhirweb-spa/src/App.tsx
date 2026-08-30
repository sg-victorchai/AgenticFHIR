import React, { Suspense } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from './store';
import AppRoutes from './routes';
import Header from './components/common/Header';
import Footer from './components/common/Footer';

// Simple error boundary component
class ErrorBoundaryComponent extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error to an error reporting service
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-container p-4">
          Something went wrong. Please try again later.
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC = () => {
  const isAuthenticated = useSelector(
    (state: RootState) => state.auth.isAuthenticated,
  );

  return (
    <div className="flex flex-col min-h-screen">
      <ErrorBoundaryComponent>
        {isAuthenticated && <Header />}
        <main className="flex-grow container mx-auto px-4 py-8">
          <Suspense fallback={<div>Loading...</div>}>
            <AppRoutes />
          </Suspense>
        </main>
        {isAuthenticated && <Footer />}
      </ErrorBoundaryComponent>
    </div>
  );
};

export default App;
