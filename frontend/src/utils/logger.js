/**
 * Logger utility - Conditional logging based on environment
 * Only logs in development mode, silent in production
 */

const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

export const logger = {
	log: (...args) => {
		if (isDevelopment) {
			console.log(...args);
		}
	},
	
	error: (...args) => {
		// Always log errors, but can be filtered in production
		if (isDevelopment) {
			console.error(...args);
		} else {
			// In production, you might want to send to error tracking service
			// Example: Sentry, LogRocket, etc.
			console.error(...args);
		}
	},
	
	warn: (...args) => {
		if (isDevelopment) {
			console.warn(...args);
		}
	},
	
	info: (...args) => {
		if (isDevelopment) {
			console.info(...args);
		}
	},
	
	debug: (...args) => {
		if (isDevelopment) {
			console.debug(...args);
		}
	},
	
	// API specific logger - can be disabled even in dev
	api: {
		log: (...args) => {
			if (isDevelopment && import.meta.env.VITE_ENABLE_API_LOGGING !== 'false') {
				console.log('[API]', ...args);
			}
		},
		error: (...args) => {
			if (isDevelopment || import.meta.env.VITE_ENABLE_API_LOGGING === 'true') {
				console.error('[API Error]', ...args);
			}
		}
	}
};

export default logger;
