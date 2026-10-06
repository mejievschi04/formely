const HANDLES = [
	{ id: 'nw', label: 'Redimensionează din colțul stânga-sus' },
	{ id: 'ne', label: 'Redimensionează din colțul dreapta-sus' },
	{ id: 'se', label: 'Redimensionează din colțul dreapta-jos' },
	{ id: 'sw', label: 'Redimensionează din colțul stânga-jos' },
];

export default function LessonImageResizeHandles({ onResizeStart }) {
	return (
		<>
			{HANDLES.map((handle) => (
				<div
					key={handle.id}
					role="button"
					tabIndex={-1}
					className={`lesson-image-handle is-${handle.id}`}
					aria-label={handle.label}
					title={handle.label}
					onPointerDown={(event) => onResizeStart(event, handle.id)}
					onDragStart={(event) => {
						event.preventDefault();
						event.stopPropagation();
					}}
				/>
			))}
		</>
	);
}
