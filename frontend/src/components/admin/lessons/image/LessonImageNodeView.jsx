import React, { useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import LessonImageResizeHandles from './LessonImageResizeHandles.jsx';
import { LESSON_IMAGE_MIN_WIDTH, nextLessonImageWidth, normalizeLessonImageAlignment } from './lessonImageAttrs.js';
import './LessonImage.css';

export default function LessonImageNodeView({ node, updateAttributes, selected, editor, getPos }) {
	const imageRef = useRef(null);
	const frameRef = useRef(null);
	const [liveWidth, setLiveWidth] = useState(null);
	const alignment = normalizeLessonImageAlignment(node.attrs.alignment);
	const savedWidth = Number(node.attrs.width) || null;
	const displayWidth = liveWidth ?? (alignment === 'full' ? null : savedWidth);

	const startResize = (event, direction) => {
		event.preventDefault();
		event.stopPropagation();
		const image = imageRef.current;
		const frame = frameRef.current;
		if (!image || !frame) return;

		const bounds = frame.getBoundingClientRect();
		const startWidth = bounds.width;
		const ratio = image.naturalWidth > 0
			? image.naturalHeight / image.naturalWidth
			: (Number(node.attrs.height) > 0 && startWidth > 0 ? Number(node.attrs.height) / startWidth : 0.75);
		const editorWidth = editor?.view?.dom?.clientWidth || startWidth;
		const max = Math.max(LESSON_IMAGE_MIN_WIDTH, editorWidth - 8);
		const startX = event.clientX;
		const startY = event.clientY;
		const handle = event.currentTarget;
		handle.setPointerCapture?.(event.pointerId);
		const previousUserSelect = document.body.style.userSelect;
		document.body.style.userSelect = 'none';

		const move = (pointerEvent) => {
			const next = nextLessonImageWidth({
				startWidth,
				dx: pointerEvent.clientX - startX,
				dy: pointerEvent.clientY - startY,
				direction,
				ratio,
				max,
			});
			setLiveWidth(next);
		};

		const finish = (pointerEvent) => {
			handle.releasePointerCapture?.(pointerEvent.pointerId);
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', finish);
			window.removeEventListener('pointercancel', finish);
			document.body.style.userSelect = previousUserSelect;
			const next = nextLessonImageWidth({
				startWidth,
				dx: pointerEvent.clientX - startX,
				dy: pointerEvent.clientY - startY,
				direction,
				ratio,
				max,
			});
			setLiveWidth(null);
			updateAttributes({
				width: next,
				height: Math.max(1, Math.round(next * ratio)),
				alignment: alignment === 'full' ? 'center' : alignment,
			});
		};

		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', finish);
		window.addEventListener('pointercancel', finish);
	};

	return (
		<NodeViewWrapper
			className={`lesson-image is-${alignment}${selected ? ' is-selected' : ''}${liveWidth ? ' is-resizing' : ''}`}
			data-drag-handle=""
		>
			<div
				ref={frameRef}
				className={`lesson-image-frame${displayWidth ? ' is-sized' : ''}`}
				style={displayWidth ? { width: `${displayWidth}px` } : undefined}
			>
				<img
					ref={imageRef}
					src={node.attrs.src}
					alt={node.attrs.alt || ''}
					title={node.attrs.title || undefined}
					draggable
					data-drag-handle=""
					onMouseDown={() => {
						const pos = getPos?.();
						if (typeof pos === 'number') editor.commands.setNodeSelection(pos);
					}}
				/>
				{selected ? <LessonImageResizeHandles onResizeStart={startResize} /> : null}
			</div>
		</NodeViewWrapper>
	);
}
