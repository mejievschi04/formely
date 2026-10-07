import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Image as ImageIcon } from '@phosphor-icons/react';
import LessonTipTapEditor from '../components/admin/lessons/LessonTipTapEditor';
import { libraryService } from '../services/api';

import { useAuth } from '../contexts/AuthContextShared.js';

import { useToast } from '../contexts/ToastContextShared.js';
import { logger } from '../utils/logger';
import { toImageUrl } from '../utils/imageUrl';
import '../styles/library-compose-page.css';

function stripHtml(html) {
	return String(html || '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

const LibraryComposePage = () => {
	const { itemId } = useParams();
	const navigate = useNavigate();
	const { user } = useAuth();
	const { success: showSuccess, error: showError } = useToast();
	const isEditing = Boolean(itemId);
	const coverInputRef = useRef(null);

	const actualRole = user?.actualRole ?? user?.role ?? 'student';
	const canWrite = actualRole === 'admin' || actualRole === 'instructor';

	const [loading, setLoading] = useState(isEditing);
	const [saving, setSaving] = useState(false);
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [body, setBody] = useState('');
	const [coverFile, setCoverFile] = useState(null);
	const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
	const [existingCoverUrl, setExistingCoverUrl] = useState('');
	const [removeCover, setRemoveCover] = useState(false);

	useEffect(() => {
		if (!canWrite) {
			navigate('/library', { replace: true });
		}
	}, [canWrite, navigate]);

	useEffect(() => {
		return () => {
			if (coverPreviewUrl.startsWith('blob:')) {
				URL.revokeObjectURL(coverPreviewUrl);
			}
		};
	}, [coverPreviewUrl]);

	useEffect(() => {
		if (!isEditing) return undefined;

		let active = true;
		const loadItem = async () => {
			setLoading(true);
			try {
				const response = await libraryService.getItem(itemId);
				const item = response?.item;
				if (!item?.is_text) {
					showError('Acest material nu poate fi editat ca text.');
					navigate(`/library/items/${itemId}`, { replace: true });
					return;
				}
				const canEdit =
					actualRole === 'admin' ||
					(actualRole === 'instructor' && item?.uploader?.id === user?.id);
				if (!canEdit) {
					showError('Nu poți edita acest material.');
					navigate(`/library/items/${itemId}`, { replace: true });
					return;
				}
				if (!active) return;
				setTitle(item.title || '');
				setDescription(item.description || '');
				setBody(item.body || '');
				const coverUrl = item.cover_image_url ? (toImageUrl(item.cover_image_url) || item.cover_image_url) : '';
				setExistingCoverUrl(coverUrl);
				setCoverPreviewUrl(coverUrl);
			} catch (err) {
				logger.error('Library compose load', err);
				showError(err?.response?.data?.message || 'Nu s-a putut încărca materialul.');
				navigate('/library', { replace: true });
			} finally {
				if (active) setLoading(false);
			}
		};

		loadItem();
		return () => {
			active = false;
		};
	}, [isEditing, itemId, navigate, showError, actualRole, user?.id]);

	const assignCoverFile = (file) => {
		if (!file) return;
		if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type || '')) {
			showError('Coperta trebuie să fie JPG, PNG sau WebP.');
			return;
		}
		if (coverPreviewUrl.startsWith('blob:')) {
			URL.revokeObjectURL(coverPreviewUrl);
		}
		setCoverFile(file);
		setRemoveCover(false);
		setCoverPreviewUrl(URL.createObjectURL(file));
	};

	const handleRemoveCover = () => {
		if (coverPreviewUrl.startsWith('blob:')) {
			URL.revokeObjectURL(coverPreviewUrl);
		}
		setCoverFile(null);
		setCoverPreviewUrl('');
		setRemoveCover(Boolean(existingCoverUrl));
		if (coverInputRef.current) coverInputRef.current.value = '';
	};

	const handleSave = async (e) => {
		e.preventDefault();
		const trimmedTitle = title.trim();
		const plainBody = stripHtml(body);

		if (!trimmedTitle) {
			showError('Titlul este obligatoriu.');
			return;
		}
		if (!plainBody) {
			showError('Scrie conținutul materialului.');
			return;
		}

		setSaving(true);
		try {
			const payload = {
				title: trimmedTitle,
				description: description.trim() || undefined,
				body,
				cover: coverFile || undefined,
				removeCover,
			};

			if (isEditing) {
				await libraryService.updateTextItem(itemId, payload);
				showSuccess('Materialul a fost actualizat.');
				navigate(`/library/items/${itemId}`);
			} else {
				const result = await libraryService.createTextItem(payload);
				showSuccess('Materialul a fost publicat în bibliotecă.');
				const newId = result?.item?.id;
				navigate(newId ? `/library/items/${newId}` : '/library');
			}
		} catch (err) {
			logger.error('Library compose save', err);
			showError(err?.response?.data?.message || 'Nu s-a putut salva materialul.');
		} finally {
			setSaving(false);
		}
	};

	if (!canWrite) {
		return null;
	}

	if (loading) {
		return (
			<div className="va-main library-compose-page">
				<p className="library-compose-loading">Se încarcă...</p>
			</div>
		);
	}

	const coverLabel = coverFile
		? coverFile.name
		: coverPreviewUrl
			? 'Copertă setată'
			: 'Fără copertă';

	return (
		<div className="va-main library-compose-page">
			<header className="library-compose-header">
				<div>
					<h1 className="library-compose-title">{isEditing ? 'Editează material' : 'Scrie material'}</h1>
					<p className="library-compose-lead">
						Compune direct în bibliotecă — articole, note sau ghiduri formatate, cu copertă opțională.
					</p>
				</div>
				<button type="button" className="library-btn library-btn--secondary" onClick={() => navigate('/library')}>
					Înapoi la bibliotecă
				</button>
			</header>

			<form className="library-compose-form" onSubmit={handleSave}>
				<div className="library-compose-field">
					<label htmlFor="library-compose-title">Titlu</label>
					<input
						id="library-compose-title"
						type="text"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Ex: Ghid de onboarding"
						required
					/>
				</div>

				<div className="library-compose-field">
					<label htmlFor="library-compose-description">Descriere scurtă (opțional)</label>
					<textarea
						id="library-compose-description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="O propoziție despre material..."
						rows={2}
					/>
				</div>

				<div className="library-compose-field">
					<div className="library-compose-cover-head">
						<label htmlFor="library-compose-cover">Copertă (opțional)</label>
						<span className="library-compose-cover-chip">{coverLabel}</span>
					</div>
					<div className="library-compose-cover-card">
						<div className="library-compose-cover-thumb">
							{coverPreviewUrl ? (
								<img src={coverPreviewUrl} alt="" className="library-compose-cover-thumb-img" />
							) : (
								<div className="library-compose-cover-thumb-placeholder" aria-hidden>
									<ImageIcon size={28} weight="duotone" />
								</div>
							)}
						</div>
						<div className="library-compose-cover-copy">
							<p>Imagine pentru cardul din bibliotecă — recomandat 3:4 (ex. 600×800 px).</p>
							<div className="library-compose-cover-actions">
								<button
									type="button"
									className="library-btn library-btn--secondary"
									onClick={() => coverInputRef.current?.click()}
								>
									{coverPreviewUrl ? 'Schimbă coperta' : 'Alege imagine'}
								</button>
								{coverPreviewUrl ? (
									<button
										type="button"
										className="library-btn library-btn--secondary"
										onClick={handleRemoveCover}
									>
										Elimină
									</button>
								) : null}
							</div>
							<input
								ref={coverInputRef}
								id="library-compose-cover"
								type="file"
								accept="image/jpeg,image/png,image/webp"
								className="library-compose-cover-input"
								onChange={(e) => assignCoverFile(e.target.files?.[0] || null)}
							/>
						</div>
					</div>
				</div>

				<div className="library-compose-field library-compose-field--editor">
					<span className="library-compose-label">Conținut</span>
					<div className="library-compose-editor">
						<LessonTipTapEditor
							allowVideo={false}
							value={body}
							onChange={setBody}
							uploadImage={libraryService.uploadImage}
							placeholder="Scrie materialul aici..."
						/>
					</div>
				</div>

				<div className="library-compose-actions">
					<button type="button" className="library-btn library-btn--secondary" onClick={() => navigate('/library')} disabled={saving}>
						Anulează
					</button>
					<button type="submit" className="va-btn-save library-btn lms-btn-primary library-btn--primary" disabled={saving}>
						{saving ? 'Se salvează...' : isEditing ? 'Salvează modificările' : 'Publică în bibliotecă'}
					</button>
				</div>
			</form>
		</div>
	);
};

export default LibraryComposePage;
