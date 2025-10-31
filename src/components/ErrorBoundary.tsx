import React from "react";

type State = { hasError: boolean; error?: any };

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    console.error("[ErrorBoundary] error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: "sans-serif" }}>
          <h2>Se produjo un error al renderizar.</h2>
          <pre style={{ whiteSpace: "pre-wrap", color: "#b91c1c", marginTop: 12 }}>
            {String(this.state.error)}
          </pre>
          <p style={{ marginTop: 12 }}>
            Revisa la consola del navegador para más detalles.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
