import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useLogin, useMe, useSetupStatus } from "@/api/hooks";
import { ErrorNote } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
	const me = useMe();
	const setup = useSetupStatus();
	const login = useLogin();
	const navigate = useNavigate();
	const location = useLocation();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");

	if (setup.data?.needed) {
		return <Navigate to="/setup" replace />;
	}
	if (me.data) {
		return <Navigate to="/" replace />;
	}

	const from = (location.state as { from?: string } | null)?.from ?? "/";

	return (
		<div className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
			<section className="hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
				<span className="font-display text-2xl font-bold text-sidebar-primary">
					ShelfLife
				</span>
				<div className="space-y-3">
					<p className="font-display max-w-md text-3xl font-semibold leading-snug">
						The whole store, in one honest ledger.
					</p>
					<p className="max-w-sm text-sm text-sidebar-foreground/70">
						Stock, prices, suppliers, credit, and profit — each number accounted
						for, each role seeing exactly what it should.
					</p>
				</div>
				<p className="text-xs text-sidebar-foreground/50">
					ShelfLife · store management
				</p>
			</section>

			<section className="flex items-center justify-center p-6">
				<form
					className="w-full max-w-sm space-y-6"
					onSubmit={(event) => {
						event.preventDefault();
						login.mutate(
							{ username, password },
							{ onSuccess: () => navigate(from, { replace: true }) },
						);
					}}
				>
					<div className="space-y-1">
						<h1 className="font-display text-2xl font-semibold lg:hidden">
							ShelfLife
						</h1>
						<h2 className="text-lg font-medium">Sign in</h2>
						<p className="text-sm text-muted-foreground">
							Use the account your store admin gave you.
						</p>
					</div>

					<Field>
						<FieldLabel htmlFor="username">Username</FieldLabel>
						<Input
							id="username"
							autoComplete="username"
							autoFocus
							required
							value={username}
							onChange={(event) => setUsername(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="password">Password</FieldLabel>
						<Input
							id="password"
							type="password"
							autoComplete="current-password"
							required
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
					</Field>

					{login.isError ? <ErrorNote message={login.error.message} /> : null}

					<Button type="submit" className="w-full" disabled={login.isPending}>
						{login.isPending ? "Signing in…" : "Sign in"}
					</Button>
				</form>
			</section>
		</div>
	);
}
