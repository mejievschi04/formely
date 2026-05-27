import React, { useMemo, useState } from 'react';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';

const inferTypeFromFile = (file) => {
	const mime = (file?.type || '').toLowerCase();
	if (mime.startsWith('image/')) return 'image';
	if (mime.startsWith('video/')) return 'video';
	if (mime.startsWith('audio/')) return 'audio';
	if (mime === 'application/pdf') return 'document';
	return 'other';
};

const MediaUploader = ({ courseId, accept, suggestedType, onUploaded, disabled }) => {
	const { showToast } = useToast();
	const [file, setFile] = useState(null);
	const [uploading, setUploading] = useState(false);

	const label = useMemo(() => {
		if (!file) return 'Alege fișier…';
		return `${file.name} (${Math.round(file.size / 1024)} KB)`;
	}, [file]);

	const upload = async () => {
		if (!file || !courseId) return;
		try {
			setUploading(true);
			const formData = new FormData();
			formData.append('file', file);
			formData.append('type', suggestedType || inferTypeFromFile(file));
			const res = await adminService.builderUploadContentFile(courseId, formData);
			showToast('Fișier încărcat', 'success');
			onUploaded?.(res);
			setFile(null);
		} catch (e) {
			console.error('Upload failed:', e);
			showToast('Încărcare eșuată', 'error');
		} finally {
			setUploading(false);
		}
	};

	return (
		<div style={{ display: 'grid', gap: 'var(--space-2)' }}>
			<div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
				<input
					type="file"
					accept={accept}
					disabled={disabled || uploading}
					onChange={(e) => setFile(e.target.files?.[0] || null)}
				/>
				<button
					type="button"
					className="admin-btn admin-btn-secondary"
					disabled={disabled || uploading || !file}
					onClick={upload}
				>
					{uploading ? 'Se încarcă…' : 'Încarcă'}
				</button>
				<div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
					{label}
				</div>
			</div>
			<div className="admin-settings-hint">Încărcare pe server (recomandat). După încărcare, URL-ul se salvează automat în bloc.</div>
		</div>
	);
};

export default MediaUploader;

