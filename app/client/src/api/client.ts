export type ApiIssue = { path?: Array<string | number>; message: string };

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly issues: ApiIssue[] = [],
	) {
		super(message);
		this.name = "ApiError";
	}
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

async function call<T>(
	method: Method,
	path: string,
	body?: unknown,
): Promise<T> {
	const response = await fetch(path, {
		method,
		credentials: "same-origin",
		headers: body === undefined ? {} : { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});

	if (response.status === 204) {
		return undefined as T;
	}

	const payload = await response.json().catch(() => undefined);

	if (!response.ok) {
		const envelope = (payload ?? {}) as {
			code?: string;
			message?: string;
			issues?: ApiIssue[];
		};
		throw new ApiError(
			response.status,
			envelope.code ?? "UNKNOWN",
			envelope.message ?? `Request failed (${response.status}).`,
			envelope.issues ?? [],
		);
	}

	return payload as T;
}

export const api = {
	get: <T>(path: string) => call<T>("GET", path),
	post: <T>(path: string, body?: unknown) => call<T>("POST", path, body),
	patch: <T>(path: string, body?: unknown) => call<T>("PATCH", path, body),
	delete: <T>(path: string) => call<T>("DELETE", path),
};
