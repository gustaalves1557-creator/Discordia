import { Component } from 'react';

// Captura erros de render e mostra tela de erro em vez de cinza
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, _info) {
    try {
      const msg = `${new Date().toISOString()} PAGE ${this.props.name || ''}: ${error?.stack || error?.message || error}\n`;
      const key = 'discordia_ui_errors';
      const prev = localStorage.getItem(key) || '';
      localStorage.setItem(key, (prev + msg).slice(-4000));
    } catch {}
  }
  render() {
    if (this.state.error) {
      return (
        <div className="empty-state" style={{ minHeight: '100vh' }}>
          <div className="big-ic">⚠️</div>
          <b>Algo quebrou nesta tela</b>
          <p style={{ wordBreak: 'break-word' }}>{String(this.state.error?.message || this.state.error)}</p>
          <button
            className="primary-btn"
            style={{ width: 220 }}
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
