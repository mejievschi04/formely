import React from 'react';
import { logger } from '../../utils/logger';

const CHUNK_RELOAD_KEY = 'va:chunk-reload';

function isStaleChunkError(error) {
	const message = String(error?.message || error || '');
	return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

function reloadOnceForStaleChunk() {
	try {
		if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') return false;
		sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
	} catch {
		return false;
	}
	window.location.reload();
	return true;
}

/**
 * Default fallback UI for ErrorBoundary (functional component, no inline styles).
 */
function ErrorBoundaryFallback({ error, errorInfo, showDetails, onReset }) {
	return (
		<div className="error-boundary">
			<div className="error-boundary-card">
				<div className="error-boundary-icon" aria-hidden>⚠️</div>
				<h2 className="error-boundary-title">Ceva nu a mers bine</h2>
				<p className="error-boundary-message">
					A apărut o eroare neașteptată. Te rugăm să reîncarci pagina sau să contactezi suportul dacă problema persistă.
				</p>
				{showDetails && error && (
					<details className="error-boundary-details">
						<summary className="error-boundary-details-summary">Detalii tehnice</summary>
						<pre className="error-boundary-details-pre">
							{error.toString()}
							{errorInfo?.componentStack}
						</pre>
					</details>
				)}
				<div className="error-boundary-actions">
					<button type="button" className="error-boundary-btn lms-btn-primary error-boundary-btn-primary" onClick={onReset}>
						Încearcă din nou
					</button>
					<button
						type="button"
						className="error-boundary-btn error-boundary-btn-secondary"
						onClick={() => window.location.reload()}
					>
						Reîncarcă pagina
					</button>
				</div>
			</div>
		</div>
	);
}

/**
 * Error Boundary – must remain a class component (React only supports componentDidCatch in classes).
 * Catches React errors and displays fallback UI; uses CSS classes from common-components.css.
 */
class ErrorBoundary extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
		};
	}

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error, errorInfo) {
		if (isStaleChunkError(error) && reloadOnceForStaleChunk()) return;
		logger.error('Error Boundary caught an error:', {
			error,
			errorInfo,
			componentStack: errorInfo?.componentStack,
		});
		this.setState({ error, errorInfo });
	}

	handleReset = () => {
		if (isStaleChunkError(this.state.error)) {
			try {
				sessionStorage.removeItem(CHUNK_RELOAD_KEY);
			} catch {
				/* ignore */
			}
			window.location.reload();
			return;
		}
		this.setState({ hasError: false, error: null, errorInfo: null });
	};

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback(this.state.error, this.handleReset);
			}
			return (
				<ErrorBoundaryFallback
					error={this.state.error}
					errorInfo={this.state.errorInfo}
					showDetails={this.props.showDetails}
					onReset={this.handleReset}
				/>
			);
		}
		return this.props.children;
	}
}

export default ErrorBoundary;
