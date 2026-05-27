import { useState, useCallback, useRef } from 'react';

/**
 * Undo/Redo Hook - Conform defacut.md secțiunea 11
 * Provides undo/redo functionality for any state
 * "Undo everywhere" - can be used in any component
 */
export const useUndoRedo = (initialState, maxHistory = 50) => {
	const [state, setState] = useState(initialState);
	const historyRef = useRef([initialState]);
	const historyIndexRef = useRef(0);

	const setStateWithHistory = useCallback((newState) => {
		// If new state is a function, call it
		const actualNewState = typeof newState === 'function' 
			? newState(historyRef.current[historyIndexRef.current])
			: newState;

		// Remove any future history if we're not at the end
		if (historyIndexRef.current < historyRef.current.length - 1) {
			historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
		}

		// Add new state to history
		historyRef.current.push(actualNewState);

		// Limit history size
		if (historyRef.current.length > maxHistory) {
			historyRef.current.shift();
		} else {
			historyIndexRef.current++;
		}

		setState(actualNewState);
	}, [maxHistory]);

	const undo = useCallback(() => {
		if (historyIndexRef.current > 0) {
			historyIndexRef.current--;
			setState(historyRef.current[historyIndexRef.current]);
		}
	}, []);

	const redo = useCallback(() => {
		if (historyIndexRef.current < historyRef.current.length - 1) {
			historyIndexRef.current++;
			setState(historyRef.current[historyIndexRef.current]);
		}
	}, []);

	const canUndo = historyIndexRef.current > 0;
	const canRedo = historyIndexRef.current < historyRef.current.length - 1;

	const reset = useCallback((newInitialState) => {
		const resetState = newInitialState !== undefined ? newInitialState : initialState;
		historyRef.current = [resetState];
		historyIndexRef.current = 0;
		setState(resetState);
	}, [initialState]);

	return {
		state,
		setState: setStateWithHistory,
		undo,
		redo,
		canUndo,
		canRedo,
		reset,
		historyLength: historyRef.current.length,
		currentIndex: historyIndexRef.current
	};
};

export default useUndoRedo;
