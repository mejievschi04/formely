import React, { useState, useRef, useEffect } from 'react';
import RichTextEditor from '../../../RichTextEditor';

const TextBlockEditor = ({ value, onChange }) => {
	const [fullscreenOpen, setFullscreenOpen] = useState(false);
	const openBtnRef = useRef(null);

	// Open fullscreen on first focus/click - user wants to type
	const handleOpenFullscreen = () => {
		setFullscreenOpen(true);
	};

	// Close and optionally restore focus
	const handleCloseFullscreen = () => {
		setFullscreenOpen(false);
		openBtnRef.current?.focus();
	};

	// Close on Escape
	useEffect(() => {
		if (!fullscreenOpen) return;
		const onKeyDown = (e) => {
			if (e.key === 'Escape') handleCloseFullscreen();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [fullscreenOpen]);

	if (fullscreenOpen) {
		return (
			<div className="text-block-editor-fullscreen-overlay">
				<div className="text-block-editor-fullscreen-modal">
					<div className="text-block-editor-fullscreen-header">
						<h3 className="text-block-editor-fullscreen-title">Editare conținut – așa va apărea în lecție</h3>
						<button
							type="button"
							className="text-block-editor-fullscreen-close"
							onClick={handleCloseFullscreen}
							aria-label="Închide"
						>
							× Închide
						</button>
					</div>
					<div className="text-block-editor-fullscreen-body">
						<RichTextEditor
							value={value || ''}
							onChange={onChange}
							placeholder="Scrie conținutul lecției..."
							style={{ minHeight: 'calc(100vh - 180px)' }}
						/>
					</div>
				</div>
			</div>
		);
	}

	// Inline trigger - click to open fullscreen editor
	const preview = value
		? String(value)
				.replace(/<[^>]+>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, 120)
		: '';
	return (
		<div className="text-block-editor-inline">
			<label className="admin-settings-label">Conținut text</label>
			<button
				ref={openBtnRef}
				type="button"
				className="text-block-editor-trigger"
				onClick={handleOpenFullscreen}
				title="Deschide editor – conținutul va arăta ca în lecție"
			>
				{preview ? (
					<span className="text-block-editor-trigger-preview">{preview}{preview.length >= 120 ? '…' : ''}</span>
				) : (
					<span className="text-block-editor-trigger-placeholder">Click pentru a scrie – așa va apărea în lecție</span>
				)}
			</button>
		</div>
	);
};

export default TextBlockEditor;

