/**
 * Remove credentials from text that can be copied from the diagnostics output.
 *
 * Runtime probes normally return a generic error, but provider and future
 * transport errors can include request headers, URLs, or environment values.
 * Diagnostics should remain useful without becoming a second secret store.
 */
export function redactDiagnostics(value: string): string {
	return value
		.replace(
			/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi,
			'$1[REDACTED]:[REDACTED]@',
		)
		.replace(
			/\b(authorization\s*:\s*)(?:Bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,"'}\]]+)/gi,
			'$1[REDACTED]',
		)
		.replace(
			/(["'](?:api[_-]?key|token|secret|password)["']\s*:\s*)(?:"[^"]*"|'[^']*'|[^\s,"'}\]&]+)/gi,
			'$1[REDACTED]',
		)
		.replace(
			/\b((?:(?:[A-Z][A-Z0-9_]*_)?(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)|api[_-]?key|token|secret|password)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,"'}\]&]+)/gi,
			'$1[REDACTED]',
		)
		.replace(
			/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
			'$1[REDACTED]',
		)
		.replace(
			/([?&](?:api[_-]?key|token|secret|password)=)[^&#\s]+/gi,
			'$1[REDACTED]',
		)
		.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
}
