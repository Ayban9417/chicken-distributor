import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./ui";

export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error("Application render failure", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-6">
        <section className="w-full max-w-xl border border-rose-200 bg-white p-6 shadow-sm">
          <AlertTriangle className="mb-4 text-rose-600" size={30} />
          <h1 className="text-xl font-bold text-slate-950">This screen could not be displayed</h1>
          <p className="mt-2 text-slate-600">Your data was not changed. Reload the application and try again.</p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            <RefreshCw size={17} />Reload application
          </Button>
        </section>
      </main>
    );
  }
}
