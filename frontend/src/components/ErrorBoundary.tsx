import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught unhandled render error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-container-lowest text-on-surface flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-surface-container rounded-3xl p-8 border border-outline-variant/30 text-center space-y-5 shadow-lg">
            <div className="w-16 h-16 rounded-full bg-error-container/40 text-error flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-4xl">warning</span>
            </div>
            <div>
              <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
                Something went wrong
              </h2>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              An unexpected error occurred while rendering this view. Please reload the application or try again.
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="w-full py-3.5 px-6 rounded-xl bg-primary text-on-primary font-label-md text-label-md font-bold shadow-md hover:bg-primary-container transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
