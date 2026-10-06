import React, { useRef } from 'react';
import { coverFocusImgStyle, normalizeCoverFocus } from '../../../utils/coverFocus';
import './MapCoverFocusEditor.css';

const MapCoverFocusEditor = ({ src, value, onChange, disabled = false }) => {
	const stageRef = useRef(null);
	const dragRef = useRef(null);
	const focus = normalizeCoverFocus(value);

	const update = (next) => {
		onChange?.(normalizeCoverFocus({ ...focus, ...next }));
	};

	const onPointerDown = (event) => {
		if (disabled || event.button != null && event.button !== 0) return;
		event.preventDefault();
		const stage = stageRef.current;
		if (!stage) return;
		stage.setPointerCapture?.(event.pointerId);
		dragRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			origin: { ...focus },
			width: stage.getBoundingClientRect().width || 1,
			height: stage.getBoundingClientRect().height || 1,
		};
	};

	const onPointerMove = (event) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const zoom = drag.origin.zoom || 1;
		const dx = ((event.clientX - drag.startX) / drag.width) * (100 / zoom);
		const dy = ((event.clientY - drag.startY) / drag.height) * (100 / zoom);
		update({
			x: drag.origin.x - dx,
			y: drag.origin.y - dy,
			zoom,
		});
	};

	const endDrag = (event) => {
		if (dragRef.current?.pointerId !== event.pointerId) return;
		stageRef.current?.releasePointerCapture?.(event.pointerId);
		dragRef.current = null;
	};

	return (
		<div className="map-cover-focus-editor">
			<div
				ref={stageRef}
				className={`map-cover-focus-editor__stage${disabled ? ' is-disabled' : ''}`}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				role="presentation"
			>
				<img src={src} alt="" draggable={false} style={coverFocusImgStyle(focus)} />
				<span className="map-cover-focus-editor__hint">Trage ca să alegi zona vizibilă</span>
			</div>
			<label className="map-cover-focus-editor__zoom">
				<span>Mărime</span>
				<input
					type="range"
					min="1"
					max="2.5"
					step="0.05"
					value={focus.zoom}
					disabled={disabled}
					onChange={(e) => update({ zoom: Number(e.target.value) })}
					aria-label="Mărește sau micșorează coperta"
				/>
				<span className="map-cover-focus-editor__zoom-ends">
					<span>Micșorează</span>
					<span>Mărește</span>
				</span>
			</label>
		</div>
	);
};

export default MapCoverFocusEditor;
