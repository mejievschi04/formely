import React from 'react';
import { DragGripIcon } from './DragGripIcon';
import './DragHandle.css';

/**
 * Butonul de mutare (drag and drop) de pe cardurile de cursuri, mape și echipe: același aspect peste tot.
 * Primește attributes/listeners de la useSortable. Tastele trebuie să urce până la document (acolo le
 * ascultă dnd-kit în timpul mutării); cardurile ignoră tastele care nu vin de la ele.
 */
export function DragHandle({ attributes, listeners, label, className = '' }) {
	return (
		<span
			{...attributes}
			{...listeners}
			className={`va-drag-handle${className ? ` ${className}` : ''}`}
			aria-label={label}
			title="Trage pentru a muta"
			onClick={(e) => e.stopPropagation()}
		>
			<DragGripIcon size={18} />
		</span>
	);
}

export default DragHandle;
