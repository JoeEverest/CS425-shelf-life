import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useRunSetup, useSetupStatus } from "@/api/hooks";
import { ErrorNote } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function SetupPage() {
	const status = useSetupStatus();
	const setup = useRunSetup();
	const navigate = useNavigate();
	const [step, setStep] = useState<1 | 2>(1);
	const [storeName, setStoreName] = useState("");
	const [currency, setCurrency] = useState("USD");
	const [address, setAddress] = useState("");
	const [name, setName] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");

	if (status.data && !status.data.needed) {
		return <Navigate to="/login" replace />;
	}

	return (
		<div className="grid min-h-svh place-items-center bg-sidebar p-6">
			<div className="w-full max-w-md space-y-8 rounded-xl bg-background p-8 shadow-lg">
				<div className="space-y-2">
					<span className="font-display text-xl font-bold text-primary">
						ShelfLife
					</span>
					<h1 className="font-display text-2xl font-semibold">
						{step === 1 ? "Set up your store" : "Create the owner account"}
					</h1>
					<p className="text-sm text-muted-foreground">
						{step === 1
							? "This runs once, before anyone can sign in."
							: "This account holds full admin rights."}
					</p>
					<p className="text-xs text-muted-foreground" aria-live="polite">
						Step {step} of 2
					</p>
				</div>

				{step === 1 ? (
					<form
						className="space-y-5"
						onSubmit={(event) => {
							event.preventDefault();
							setStep(2);
						}}
					>
						<Field>
							<FieldLabel htmlFor="storeName">Store name</FieldLabel>
							<Input
								id="storeName"
								required
								autoFocus
								value={storeName}
								onChange={(event) => setStoreName(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="currency">Currency</FieldLabel>
							<Input
								id="currency"
								required
								maxLength={3}
								className="w-24 uppercase tabular-nums"
								value={currency}
								onChange={(event) =>
									setCurrency(event.target.value.toUpperCase())
								}
							/>
							<FieldDescription>
								Three-letter code, e.g. USD or TZS. It cannot change later.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="address">Address</FieldLabel>
							<Input
								id="address"
								required
								value={address}
								onChange={(event) => setAddress(event.target.value)}
							/>
						</Field>
						<Button type="submit" className="w-full">
							Continue
						</Button>
					</form>
				) : (
					<form
						className="space-y-5"
						onSubmit={(event) => {
							event.preventDefault();
							setup.mutate(
								{
									storeName,
									currency,
									address,
									admin: { name, username, password },
								},
								{ onSuccess: () => navigate("/", { replace: true }) },
							);
						}}
					>
						<Field>
							<FieldLabel htmlFor="name">Your name</FieldLabel>
							<Input
								id="name"
								required
								autoFocus
								value={name}
								onChange={(event) => setName(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="username">Username</FieldLabel>
							<Input
								id="username"
								required
								autoComplete="username"
								value={username}
								onChange={(event) => setUsername(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input
								id="password"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
							/>
							<FieldDescription>At least 8 characters.</FieldDescription>
						</Field>

						{setup.isError ? <ErrorNote message={setup.error.message} /> : null}

						<div className="flex gap-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => setStep(1)}
							>
								Back
							</Button>
							<Button
								type="submit"
								className="flex-1"
								disabled={setup.isPending}
							>
								{setup.isPending ? "Creating store…" : "Create store"}
							</Button>
						</div>
					</form>
				)}
			</div>
		</div>
	);
}
