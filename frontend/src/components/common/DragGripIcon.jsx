import React from 'react';
import { ArrowsLeftRight } from '@phosphor-icons/react';

/** Pictogramă reordonare drag — săgeți stânga/dreapta. */
export function DragGripIcon({ size = 20, className, ...rest }) {
	return <ArrowsLeftRight size={size} weight="bold" className={className} aria-hidden {...rest} />;
}
