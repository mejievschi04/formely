import React from 'react';

/** Așezarea imaginii față de text, ca în Word: cu text pe lângă (stânga / dreapta) sau pe rând separat. */
const LAYOUTS = [
	{ id: 'wrap-left', label: 'Imagine în stânga, text în dreapta' },
	{ id: 'wrap-right', label: 'Imagine în dreapta, text în stânga' },
	{ id: 'center', label: 'Imagine pe rând separat, text deasupra și dedesubt' },
	{ id: 'full', label: 'Imagine pe toată lățimea' },
];

/* Mini-desene: dreptunghiul plin e imaginea, liniile sunt textul. */
function LayoutIcon({ id }) {
	const line = (x, y, w) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height="1.6" rx="0.8" />;
	let content;
	if (id === 'wrap-left') {
		content = [<rect key="img" x="2" y="4" width="8" height="8" rx="1.5" opacity="0.9" />, line(12, 4.5, 10), line(12, 8, 10), line(12, 11.5, 10), line(2, 15, 20), line(2, 18.5, 14)];
	} else if (id === 'wrap-right') {
		content = [<rect key="img" x="14" y="4" width="8" height="8" rx="1.5" opacity="0.9" />, line(2, 4.5, 10), line(2, 8, 10), line(2, 11.5, 10), line(2, 15, 20), line(2, 18.5, 14)];
	} else if (id === 'center') {
		content = [line(2, 3, 20), <rect key="img" x="7" y="6.5" width="10" height="8" rx="1.5" opacity="0.9" />, line(2, 17.5, 20), line(2, 21, 14)];
	} else {
		content = [line(2, 3, 20), <rect key="img" x="2" y="6.5" width="20" height="9" rx="1.5" opacity="0.9" />, line(2, 18.5, 20)];
	}
	return (
		<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
			{content}
		</svg>
	);
}

export default function LessonImageLayoutToolbar({ alignment, onChange }) {
	return (
		<div className="lesson-image-toolbar" role="toolbar" aria-label="Așezare imagine" contentEditable={false}>
			{LAYOUTS.map((layout) => (
				<button
					key={layout.id}
					type="button"
					className={`lesson-image-toolbar-btn${alignment === layout.id ? ' is-active' : ''}`}
					aria-label={layout.label}
					aria-pressed={alignment === layout.id}
					title={layout.label}
					onMouseDown={(event) => {
						event.preventDefault();
						event.stopPropagation();
					}}
					onClick={(event) => {
						event.stopPropagation();
						onChange(layout.id);
					}}
				>
					<LayoutIcon id={layout.id} />
				</button>
			))}
		</div>
	);
}
