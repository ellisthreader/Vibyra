import { Component, type ErrorInfo, type ReactNode } from "react";

import { useAgentModeStore } from "../../state/agentModeStore";

/**
 * Keeps a crash in Agent or Chat Mode from taking the terminals with it.
 *
 * Code Mode is hidden rather than unmounted while another mode shows, so its
 * panes — live PTYs with scrollback — sit under the same React root as the
 * mode on screen. Without a boundary, one uncaught render error anywhere in
 * Agent Mode unmounts the whole tree and every terminal comes back blank.
 * That happened once, on a footer reading a field that was not there.
 *
 * The fallback offers the two honest ways out: try the same mode again, or
 * go back to Code, which was never touched.
 */
interface State {
  error: Error | null;
}

export class ModeErrorBoundary extends Component<{ children: ReactNode; label: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label} Mode crashed`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="agent-main">
        <div className="panel">
          <div className="panel__inner">
            <div className="empty">
              <h3>{this.props.label} Mode hit an error</h3>
              <p>Your terminals in Code Mode are untouched. {error.message}</p>
              <div className="settings-row-actions">
                <button
                  className="btn btn--secondary"
                  onClick={() => useAgentModeStore.getState().setMode("code")}
                >
                  Back to Code
                </button>
                <button className="btn btn--primary" onClick={() => this.setState({ error: null })}>
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }
}
