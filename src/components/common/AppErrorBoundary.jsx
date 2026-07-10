import React from "react";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message ?? "Unknown render error" };
  }

  componentDidCatch(error) {
    console.error("DroneOps UI error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-state">
          <h1>DroneOps could not render this view.</h1>
          <p>Refresh the page and try again. If this keeps happening, the last action likely needs UI review.</p>
          <code>{this.state.message}</code>
        </main>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
