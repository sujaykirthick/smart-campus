'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showStack: boolean;
}

export default class MapErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showStack: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[MapErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showStack: false,
    });
  };

  render() {
    if (this.state.hasError) {
      const isDev = process.env.NODE_ENV !== 'production';

      return (
        <div className="w-full min-h-[500px] h-[calc(100vh-64px)] flex flex-col items-center justify-center p-6 bg-neutral-900 text-neutral-100">
          <div className="max-w-xl w-full bg-neutral-850 rounded-2xl border border-red-500/40 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-800/60">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {this.props.fallbackTitle || 'Campus Map Encountered an Error'}
                </h2>
                <p className="text-xs text-neutral-400">
                  The map rendering stopped unexpectedly. Details are shown below.
                </p>
              </div>
            </div>

            {/* Error Message */}
            <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-900/50 text-red-200 text-xs font-mono break-words leading-relaxed">
              <strong>Error:</strong> {this.state.error?.message || 'Unknown error occurred'}
            </div>

            {/* Stack trace toggle in dev */}
            {isDev && this.state.error?.stack && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => this.setState((prev) => ({ showStack: !prev.showStack }))}
                  className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  {this.state.showStack ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" /> Hide stack trace
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" /> Show developer stack trace
                    </>
                  )}
                </button>

                {this.state.showStack && (
                  <pre className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-neutral-300 max-h-56 overflow-auto leading-relaxed">
                    {this.state.error.stack}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition-colors shadow-md"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload Map Component
              </button>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl border border-neutral-700 hover:bg-neutral-800 text-neutral-300 text-xs transition-colors"
              >
                Refresh Entire Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
