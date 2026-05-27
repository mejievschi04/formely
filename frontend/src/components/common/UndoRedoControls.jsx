import React from 'react';
import { ArrowCounterClockwise, ArrowClockwise } from '@phosphor-icons/react';

/**
 * Undo/Redo Controls Component - Conform defacut.md secțiunea 11
 * "Undo everywhere" - Reusable controls for undo/redo functionality
 */
const UndoRedoControls = ({ onUndo, onRedo, canUndo, canRedo, className = '' }) => {
	return (
		<div className={`undo-redo-controls ${className}`}>
			<button
				type="button"
				className="undo-redo-btn"
				onClick={onUndo}
				disabled={!canUndo}
				title="Undo (Ctrl+Z)"
			>
				<ArrowCounterClockwise size={16} weight="bold" aria-hidden />
				<span>Undo</span>
			</button>
			<button
				type="button"
				className="undo-redo-btn"
				onClick={onRedo}
				disabled={!canRedo}
				title="Redo (Ctrl+Shift+Z)"
			>
				<ArrowClockwise size={16} weight="bold" aria-hidden />
				<span>Redo</span>
			</button>
		</div>
	);
};

export default UndoRedoControls;
