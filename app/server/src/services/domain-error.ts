export type DomainErrorStatus = 400 | 403 | 404 | 409;

export class DomainError extends Error {
	constructor(
		readonly status: DomainErrorStatus,
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "DomainError";
	}
}
