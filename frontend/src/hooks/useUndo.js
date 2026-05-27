/**
 * @deprecated Use useUndoRedo instead. This is kept for backward compatibility.
 * 
 * Undo Hook - Alias for useUndoRedo
 * Provides undo/redo functionality for any state
 * 
 * This hook is now an alias for useUndoRedo to maintain backward compatibility.
 * All new code should use useUndoRedo directly.
 */
import { useUndoRedo } from './useUndoRedo';

/**
 * @deprecated Use useUndoRedo instead
 */
export const useUndo = (initialState, maxHistory = 50) => {
	const undoRedo = useUndoRedo(initialState, maxHistory);
	
	// Add clearHistory alias for backward compatibility
	return {
		...undoRedo,
		clearHistory: () => undoRedo.reset(undoRedo.state)
	};
};

export default useUndo;
