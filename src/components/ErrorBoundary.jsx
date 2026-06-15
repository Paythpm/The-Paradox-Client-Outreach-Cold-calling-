import React from 'react';

/**
 * ErrorBoundary — catches runtime errors in child components
 * Prevents a chart/widget crash from killing the entire page
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          gap: 16,
          padding: 32,
        }}>
          <p style={{ fontSize: 32 }}>⚠️</p>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Something went wrong
          </p>
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0, maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: 'white',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              marginTop: 8,
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
