import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("Render error:", error, info.componentStack);
	}

	render() {
		if (this.state.error) {
			return (
				<div className="grid min-h-svh place-items-center p-6">
					<div className="max-w-md space-y-3">
						<h1 className="font-display text-xl font-semibold">
							Something went wrong
						</h1>
						<p className="text-sm text-muted-foreground">
							The screen failed to load. Refreshing usually fixes it; if it
							keeps happening, tell your store admin.
						</p>
						<pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
							{this.state.error.message}
						</pre>
						<button
							type="button"
							className="text-sm underline"
							onClick={() => window.location.assign("/")}
						>
							Reload
						</button>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}
