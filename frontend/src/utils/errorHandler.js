/**
 * Error Handler Utility
 * Standardized error handling for API errors and application errors
 */

import { logger } from './logger';

/**
 * Extract error message from various error formats
 * @param {Error|Object} error - Error object from API or application
 * @returns {string} - User-friendly error message
 */
export const getErrorMessage = (error) => {
	if (!error) {
		return 'A apărut o eroare necunoscută';
	}

	// API error with response
	if (error.response) {
		const { data, status } = error.response;
		
		// Check for validation errors (Laravel format)
		if (data?.errors && typeof data.errors === 'object') {
			const firstError = Object.values(data.errors)[0];
			if (Array.isArray(firstError) && firstError.length > 0) {
				return firstError[0];
			}
		}
		
		// Check for message field
		if (data?.message) {
			return data.message;
		}
		
		// Status-based messages
		switch (status) {
			case 400:
				return 'Cerere invalidă. Verifică datele introduse.';
			case 401:
				return 'Nu ești autentificat. Te rugăm să te conectezi.';
			case 403:
				return 'Nu ai permisiunea de a efectua această acțiune.';
			case 404:
				return 'Resursa solicitată nu a fost găsită.';
			case 422:
				return 'Datele introduse nu sunt valide.';
			case 429:
				return 'Prea multe cereri. Te rugăm să încerci mai târziu.';
			case 500:
				return 'Eroare internă a serverului. Te rugăm să încerci mai târziu.';
			case 503:
				return 'Serviciul este temporar indisponibil.';
			default:
				return data?.error || `Eroare server (${status})`;
		}
	}
	
	// Network error
	if (error.request) {
		return 'Nu s-a primit răspuns de la server. Verifică conexiunea la internet.';
	}
	
	// Timeout error
	if (error.code === 'ECONNABORTED') {
		return 'Cererea a expirat. Te rugăm să încerci din nou.';
	}
	
	// Network error code
	if (error.code === 'ERR_NETWORK') {
		return 'Eroare de rețea. Verifică dacă backend-ul rulează.';
	}
	
	// Standard Error object
	if (error.message) {
		return error.message;
	}
	
	// Fallback
	return 'A apărut o eroare necunoscută';
};

/**
 * Handle API error with logging
 * @param {Error|Object} error - Error object
 * @param {string} context - Context where error occurred (e.g., 'saveCourse', 'deleteUser')
 * @returns {string} - User-friendly error message
 */
export const handleApiError = (error, context = 'operation') => {
	const message = getErrorMessage(error);
	
	// Log error for debugging
	logger.error(`API Error [${context}]:`, {
		message,
		error: error.response?.data || error.message || error,
		status: error.response?.status,
		url: error.config?.url,
	});
	
	return message;
};

/**
 * Handle validation errors
 * @param {Object} errors - Validation errors object (from Laravel)
 * @returns {Object} - Formatted errors object with field names as keys
 */
export const formatValidationErrors = (errors) => {
	if (!errors || typeof errors !== 'object') {
		return {};
	}
	
	const formatted = {};
	
	// Laravel validation errors format: { field: ['error1', 'error2'] }
	Object.keys(errors).forEach(field => {
		const fieldErrors = errors[field];
		if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
			formatted[field] = fieldErrors[0]; // Take first error
		} else if (typeof fieldErrors === 'string') {
			formatted[field] = fieldErrors;
		}
	});
	
	return formatted;
};

/**
 * Check if error is a network error
 * @param {Error|Object} error - Error object
 * @returns {boolean}
 */
export const isNetworkError = (error) => {
	return error.code === 'ERR_NETWORK' || 
		   error.code === 'ECONNABORTED' || 
		   (error.request && !error.response);
};

/**
 * Check if error is an authentication error
 * @param {Error|Object} error - Error object
 * @returns {boolean}
 */
export const isAuthError = (error) => {
	return error.response?.status === 401 || error.response?.status === 403;
};

export default {
	getErrorMessage,
	handleApiError,
	formatValidationErrors,
	isNetworkError,
	isAuthError,
};
