import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Culori lizibile pe fundal deschis; „Implicită” scoate culoarea și textul revine la culoarea temei. */
const LESSON_TEXT_COLORS = [
	{ id: 'gray', label: 'Gri', color: '#64748b' },
	{ id: 'red', label: 'Roșu', color: '#dc2626' },
	{ id: 'orange', label: 'Portocaliu', color: '#ea580c' },
	{ id: 'amber', label: 'Galben', color: '#ca8a04' },
	{ id: 'green', label: 'Verde', color: '#16a34a' },
	{ id: 'teal', label: 'Turcoaz', color: '#0d9488' },
	{ id: 'blue', label: 'Albastru', color: '#2563eb' },
	{ id: 'violet', label: 'Violet', color: '#7c3aed' },
	{ id: 'pink', label: 'Roz', color: '#db2777' },
];

const PANEL_WIDTH = 236;

function normalizeHex(value) {
	const color = String(value || '').trim().toLowerCase();
	if (/^#[0-9a-f]{6}$/.test(color)) return color;
	if (/^#[0-9a-f]{3}$/.test(color)) return `#${color.slice(1).split('').map((c) => c + c).join('')}`;
	const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
	if (rgb) return `#${rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
	return null;
}

export default function LessonTextColorButton({ editor, onOpen }) {
	const [panel, setPanel] = useState(null);
	const buttonRef = useRef(null);
	const panelRef = useRef(null);
	const current = editor ? normalizeHex(editor.getAttributes('textStyle').color) : null;

	useEffect(() => {
		if (!panel) return undefined;
		const onKey = (event) => {
			if (event.key === 'Escape') setPanel(null);
		};
		const onPointer = (event) => {
			if (panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
			setPanel(null);
		};
		const close = () => setPanel(null);
		window.addEventListener('keydown', onKey);
		document.addEventListener('mousedown', onPointer);
		window.addEventListener('resize', close);
		return () => {
			window.removeEventListener('keydown', onKey);
			document.removeEventListener('mousedown', onPointer);
			window.removeEventListener('resize', close);
		};
	}, [panel]);

	const toggle = () => {
		if (panel) {
			setPanel(null);
			return;
		}
		const rect = buttonRef.current.getBoundingClientRect();
		setPanel({
			x: Math.max(12, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 12)),
			y: rect.bottom + 6,
		});
		onOpen?.();
	};

	const apply = (color) => {
		if (!editor) return;
		if (color) editor.chain().focus().setColor(color).run();
		else editor.chain().focus().unsetColor().run();
		setPanel(null);
	};

	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				className={`lesson-tiptap-btn${panel ? ' is-active' : ''}`}
				aria-label="Culoare text"
				title="Culoare text"
				aria-haspopup="dialog"
				aria-expanded={Boolean(panel)}
				disabled={!editor}
				onMouseDown={(event) => event.preventDefault()}
				onClick={toggle}
			>
				<span
					className={`lesson-text-color-dot${current ? '' : ' is-default'}`}
					style={current ? { '--tc': current } : undefined}
					aria-hidden
				/>
			</button>
			{panel ? createPortal(
				<div
					ref={panelRef}
					className="lesson-text-color-panel"
					style={{ left: panel.x, top: panel.y, width: PANEL_WIDTH }}
					role="dialog"
					aria-label="Culoare text"
				>
					<div className="lesson-text-color-swatches" role="group" aria-label="Culori">
						{LESSON_TEXT_COLORS.map((item) => (
							<button
								key={item.id}
								type="button"
								className={`lesson-text-color-swatch${current === item.color ? ' is-selected' : ''}`}
								style={{ '--tc': item.color }}
								aria-label={item.label}
								aria-pressed={current === item.color}
								title={item.label}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => apply(item.color)}
							/>
						))}
					</div>
					<div className="lesson-text-color-actions">
						<label className="lesson-text-color-custom">
							<input
								type="color"
								value={current || '#0f172a'}
								aria-label="Altă culoare"
								// fără focus(): selectorul nativ de culoare rămâne deschis cât timp alegi
								onChange={(event) => editor?.chain().setColor(event.target.value).run()}
							/>
							<span>Altă culoare</span>
						</label>
						<button
							type="button"
							className="lesson-text-color-reset"
							disabled={!current}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => apply(null)}
						>
							Implicită
						</button>
					</div>
				</div>,
				document.body,
			) : null}
		</>
	);
}
