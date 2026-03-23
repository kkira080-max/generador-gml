import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught an error in MapViewer:', error, info);
  }

  componentDidUpdate(prevProps) {
    // Reset error boundary when parcels change (user loaded new file)
    if (this.state.hasError && prevProps.parcels !== this.props.parcels) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#020617',
          color: '#38bdf8',
          fontFamily: 'Inter, system-ui, sans-serif',
          gap: '16px'
        }}>
          <div style={{ fontSize: '2rem' }}>⚠️</div>
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>El mapa tuvo un error temporal</div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', maxWidth: '300px', textAlign: 'center' }}>
            {this.state.error?.message || 'Error desconocido'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: '8px',
              padding: '10px 24px',
              background: '#38bdf8',
              color: '#000',
              border: 'none',
              borderRadius: '0',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem'
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
