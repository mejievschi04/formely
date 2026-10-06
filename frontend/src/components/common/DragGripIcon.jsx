import React from 'react';
import { DotsSixVertical } from '@phosphor-icons/react';

/** Pictogramă reordonare drag — puncte verticale. */
export function DragGripIcon({ size = 20, className, ...rest }) {
	return <DotsSixVertical size={size} weight="bold" className={className} aria-hidden {...rest} />;
}
