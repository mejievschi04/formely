import { useEffect, useRef, useState } from 'react';
import { logger } from '../utils/logger';

/**
 * Hook pentru auto-save cu debounce
 * @param {Object} data - Datele de salvat
 * @param {Function} saveFn - Funcția de salvare
 * @param {Number} debounceMs - Timpul de debounce în milisecunde
 * @param {Boolean} enabled - Activează/dezactivează auto-save
 */
export const useAutoSave = (data, saveFn, debounceMs = 2000, enabled = true) => {
	const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
	const timeoutRef = useRef(null);
	const lastSavedDataRef = useRef(null);
	const isInitialMount = useRef(true);

	useEffect(() => {
		// Skip auto-save on initial mount
		if (isInitialMount.current) {
			isInitialMount.current = false;
			lastSavedDataRef.current = JSON.stringify(data);
			return;
		}

		// Skip if auto-save is disabled
		if (!enabled) {
			return;
		}

		// Skip if data hasn't changed
		const currentDataString = JSON.stringify(data);
		if (currentDataString === lastSavedDataRef.current) {
			return;
		}

		// Clear existing timeout
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}

		// Set saving status
		setSaveStatus('saving');

		// Create new timeout
		timeoutRef.current = setTimeout(async () => {
			try {
				await saveFn(data);
				setSaveStatus('saved');
				lastSavedDataRef.current = currentDataString;
				
				// Reset to idle after 2 seconds
				setTimeout(() => {
					setSaveStatus('idle');
				}, 2000);
			} catch (error) {
				logger.error('Auto-save error:', error);
				setSaveStatus('error');
				
				// Reset to idle after 5 seconds on error
				setTimeout(() => {
					setSaveStatus('idle');
				}, 5000);
			}
		}, debounceMs);

		// Cleanup
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [data, saveFn, debounceMs, enabled]);

	// Manual save function
	const manualSave = async () => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}

		setSaveStatus('saving');
		try {
			await saveFn(data);
			setSaveStatus('saved');
			lastSavedDataRef.current = JSON.stringify(data);
			
			setTimeout(() => {
				setSaveStatus('idle');
			}, 2000);
		} catch (error) {
			logger.error('Manual save error:', error);
			setSaveStatus('error');
			
			setTimeout(() => {
				setSaveStatus('idle');
			}, 5000);
		}
	};

	return { saveStatus, manualSave };
};

