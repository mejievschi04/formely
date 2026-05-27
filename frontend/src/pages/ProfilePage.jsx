import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { profileService, adminService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ConfirmModal from '../components/common/ConfirmModal';
import { toImageUrl } from '../utils/imageUrl';

const AVATAR_EDITOR_SIZE = 280;
const AVATAR_OUTPUT_SIZE = 512;

const ProfilePage = () => {
	const { userId } = useParams(); // Optional user ID from URL
	const navigate = useNavigate();
	const { user: currentUser, checkAuth } = useAuth();
	const { showToast } = useToast();
	const fileInputRef = useRef(null);
	const [profileData, setProfileData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [uploadingAvatar, setUploadingAvatar] = useState(false);
	const [showRemoveAvatarConfirm, setShowRemoveAvatarConfirm] = useState(false);
	const [avatarEditorState, setAvatarEditorState] = useState(null);
	const isViewingOtherUser = userId && currentUser?.role === 'admin';

	useEffect(() => {
		const fetchData = async () => {
			try {
				setLoading(true);
				let profile;
				
				if (isViewingOtherUser) {
					// Admin viewing another user's profile
					const userData = await adminService.getUser(userId);
					// Construct profile from user data
					profile = {
						user: userData,
						stats: {
							completedCourses: Array.isArray(userData.courses_completed)
								? userData.courses_completed.length
								: (userData.completed_courses || 0),
							completedQuizzes: userData.completed_quizzes || 0,
							inProgressCourses: userData.in_progress_courses
								?? (Array.isArray(userData.courses_in_progress) ? userData.courses_in_progress.length : 0),
							progressPercentage: userData.completion_percentage || 0,
						},
						coursesInProgress: userData.courses_in_progress || [],
						coursesCompleted: userData.courses_completed || [],
					};
				} else {
					// Current user viewing their own profile
					profile = await profileService.getProfile();
				}
				
				setProfileData(profile);
			} catch (err) {
				console.error('Error fetching profile:', err);
				setError('Nu s-a putut încărca profilul');
			} finally {
				setLoading(false);
			}
		};
		fetchData();
	}, [userId, isViewingOtherUser]);

	const handleAvatarChange = (e) => {
		const file = e.target?.files?.[0];
		if (!file || !file.type.startsWith('image/')) {
			showToast('Alege o imagine (JPG, PNG, GIF sau WebP)', 'error');
			if (fileInputRef.current) fileInputRef.current.value = '';
			return;
		}
		if (file.size > 2 * 1024 * 1024) {
			showToast('Imaginea trebuie să aibă maxim 2 MB', 'error');
			return;
		}
		setAvatarEditorState({
			fileName: file.name,
			imageUrl: URL.createObjectURL(file),
		});
		return;
	};

	const handleSaveAvatar = async (file) => {
		try {
			setUploadingAvatar(true);
			const data = await profileService.uploadAvatar(file);
			if (data?.user) {
				setProfileData((prev) => prev ? { ...prev, user: { ...prev.user, avatar: data.user.avatar } } : prev);
				await checkAuth();
				setAvatarEditorState(null);
				showToast('Poza de profil a fost actualizată', 'success');
			}
		} catch (err) {
			showToast(err?.response?.data?.message || 'Eroare la încărcarea pozei', 'error');
		} finally {
			setUploadingAvatar(false);
			if (fileInputRef.current) fileInputRef.current.value = '';
		}
	};

	const handleRemoveAvatarClick = () => {
		setShowRemoveAvatarConfirm(true);
	};

	const handleConfirmRemoveAvatar = async () => {
		try {
			setUploadingAvatar(true);
			await profileService.removeAvatar();
			setShowRemoveAvatarConfirm(false);
			setProfileData((prev) => prev ? { ...prev, user: { ...prev.user, avatar: null } } : prev);
			await checkAuth();
			showToast('Poza de profil a fost ștearsă', 'success');
		} catch (err) {
			showToast('Eroare la ștergerea pozei', 'error');
		} finally {
			setUploadingAvatar(false);
		}
	};

	if (loading) { return null; }

		if (error || !profileData) {
		return (
			<div className="va-profile-container">
				<div className="va-profile-error">
					{error || 'Eroare la încărcarea profilului'}
				</div>
			</div>
		);
	}

	const stats = profileData.stats;
	const coursesInProgress = profileData.coursesInProgress || [];
	const coursesCompleted = profileData.coursesCompleted || [];

	return (
		<div className="va-profile-container">
			{/* Back Button for Admin */}
			{isViewingOtherUser && (
				<div className="va-profile-back-button">
					<button
						onClick={() => navigate('/admin/users')}
						className="lms-btn-secondary"
					>
						<span>←</span>
						<span>Înapoi la Utilizatori</span>
					</button>
				</div>
			)}
			{/* Profile Header */}
			<div className="va-profile-header">
				<div className="va-profile-cover"></div>
				<div className="va-profile-info">
					<div className="va-profile-avatar-wrap">
						<div className="va-profile-avatar">
							{profileData.user.avatar ? (
								<img
									src={toImageUrl(profileData.user.avatar) || profileData.user.avatar}
									alt={profileData.user.name}
									className="va-profile-avatar-img"
								/>
							) : (
								<div className="va-profile-avatar-inner">
									{profileData.user.name
										.split(' ')
										.map((n) => n[0])
										.join('')
										.toUpperCase()}
								</div>
							)}
						</div>
						{!isViewingOtherUser && (
							<div className="va-profile-avatar-actions">
								<input
									ref={fileInputRef}
									type="file"
									accept="image/jpeg,image/png,image/gif,image/webp"
									className="va-profile-avatar-input"
									onChange={handleAvatarChange}
									disabled={uploadingAvatar}
								/>
								<button
									type="button"
									className="va-profile-avatar-btn"
									onClick={() => fileInputRef.current?.click()}
									disabled={uploadingAvatar}
								>
									{uploadingAvatar ? 'Se încarcă...' : 'Schimbă poza'}
								</button>
								{profileData.user.avatar && (
									<button
										type="button"
										className="va-profile-avatar-btn va-profile-avatar-btn-remove"
										onClick={handleRemoveAvatarClick}
										disabled={uploadingAvatar}
									>
										Șterge poza
									</button>
								)}
							</div>
						)}
					</div>
					<div className="va-profile-details">
						<h1 className="va-profile-name">{profileData.user.name}</h1>
						<p className="va-profile-role">
							{isViewingOtherUser 
								? (profileData.user.role === 'admin' ? 'Administrator' : 'Utilizator')
								: 'Student'
							}
						</p>
						{isViewingOtherUser && (
							<div className="va-profile-badges">
								<span className="va-profile-badge va-profile-badge-email">
									👤 {profileData.user.email}
								</span>
							</div>
						)}
					</div>
				</div>
			</div>

			{!isViewingOtherUser && (
				<div className="va-profile-activity-cta">
					<Link to="/profile/activity" className="lms-btn-secondary">
						Vezi activitatea mea
					</Link>
				</div>
			)}

			{/* Stats Grid */}
			<div className="va-profile-stats">
				<div className="va-stat-card">
					<div className="va-stat-icon">📚</div>
					<div className="va-stat-content">
						<div className="va-stat-value">{stats.completedCourses ?? 0}</div>
						<div className="va-stat-label">Cursuri finalizate</div>
					</div>
				</div>
				<div className="va-stat-card">
					<div className="va-stat-icon">🎯</div>
					<div className="va-stat-content">
						<div className="va-stat-value">{stats.completedQuizzes}</div>
						<div className="va-stat-label">Teste promovate</div>
					</div>
				</div>
				<div className="va-stat-card">
					<div className="va-stat-icon">🚀</div>
					<div className="va-stat-content">
						<div className="va-stat-value">{stats.inProgressCourses}</div>
						<div className="va-stat-label">Cursuri în progres</div>
					</div>
				</div>
				<div className="va-stat-card va-stat-card-progress">
					<div className="va-stat-icon">⭐</div>
					<div className="va-stat-content">
						<div className="va-stat-value">{stats.progressPercentage}%</div>
						<div className="va-stat-label">Progres general</div>
						<div className="va-stat-progress-bar">
							<div
								className="va-stat-progress-fill"
								style={{ width: `${stats.progressPercentage}%` }}
							></div>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content Grid */}
			<div className="va-profile-grid">
				{/* Courses In Progress */}
				<div className="va-profile-section">
					<div className="va-section-header">
						<h2 className="va-section-title">Cursuri în progres</h2>
						<span className="va-section-count">{coursesInProgress.length}</span>
					</div>
					<div className="va-courses-list">
						{coursesInProgress.length > 0 ? (
							coursesInProgress.map((course) => (
								<div className="va-course-card" key={course.id}>
									<div className="va-course-card-header">
										<h3 className="va-course-card-title">{course.title}</h3>
										<span className="va-course-card-progress">{course.progress}%</span>
									</div>
									<p className="va-course-card-description">{course.description}</p>
									<div className="va-course-card-progress-bar">
										<div
											className="va-course-card-progress-fill"
											style={{ width: `${course.progress}%` }}
										></div>
									</div>
									<div className="va-course-card-meta">
										<span>Progres parcurs: {course.progress}%</span>
									</div>
									<Link
										to={`/courses/${course.id}`}
										className="lms-btn-primary lms-btn-sm"
									>
										{(course.progress || 0) >= 100 ? 'Vezi cursul' : 'Continuă cursul'}
									</Link>
								</div>
							))
						) : (
							<div className="lms-empty-state">
								<p className="lms-empty-description">Nu ai cursuri în progres momentan.</p>
								<Link to="/courses" className="lms-btn-secondary">
									Explorează cursuri
								</Link>
							</div>
						)}
					</div>
				</div>

				{/* Completed Courses */}
				<div className="va-profile-section">
					<div className="va-section-header">
						<div className="va-section-title-group">
							<h2 className="va-section-title">Cursuri finalizate</h2>
							{coursesCompleted.length > 3 && (
								<Link
									to="/completed-courses"
									className="va-section-more-btn"
									title="Vezi toate cursurile finalizate"
								>
									⋯
								</Link>
							)}
						</div>
						<span className="va-section-count">{coursesCompleted.length}</span>
					</div>
					<div className="va-completed-courses-list">
						{coursesCompleted.length > 0 ? (
							coursesCompleted.slice(0, 3).map((course) => (
								<div className="va-completed-course-item" key={course.id}>
									<div className="va-completed-course-content">
										<span className="va-completed-course-title">{course.title}</span>
										<span className="va-completed-course-badge">✓ Completat</span>
									</div>
									<div className="va-completed-course-meta">
										<span>Quiz: {course.quizPassed ? 'Promovat ✓' : 'Nepromovat'}</span>
									</div>
								</div>
							))
						) : (
							<div className="lms-empty-state">
								<p className="lms-empty-description">Nu ai finalizat niciun curs încă.</p>
							</div>
						)}
					</div>
				</div>

			</div>

			<ConfirmModal
				open={showRemoveAvatarConfirm}
				onClose={() => setShowRemoveAvatarConfirm(false)}
				onConfirm={handleConfirmRemoveAvatar}
				title="Șterge poza de profil"
				message="Ștergi poza de profil?"
				confirmLabel="Șterge"
				cancelLabel="Anulare"
				variant="danger"
				loading={uploadingAvatar}
			/>
			<AvatarEditorModal
				open={Boolean(avatarEditorState)}
				imageUrl={avatarEditorState?.imageUrl || ''}
				fileName={avatarEditorState?.fileName || 'avatar.jpg'}
				busy={uploadingAvatar}
				onClose={() => {
					setAvatarEditorState(null);
					if (fileInputRef.current) fileInputRef.current.value = '';
				}}
				onSave={handleSaveAvatar}
			/>
		</div>
	);
};

const AvatarEditorModal = ({ open, imageUrl, fileName, busy, onClose, onSave }) => {
	const [imageElement, setImageElement] = useState(null);
	const [zoom, setZoom] = useState(1);
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const dragStateRef = useRef(null);

	useEffect(() => {
		if (!open || !imageUrl) return undefined;
		let active = true;
		const img = new Image();
		img.onload = () => {
			if (!active) return;
			setImageElement(img);
			const minZoom = Math.max(AVATAR_EDITOR_SIZE / img.width, AVATAR_EDITOR_SIZE / img.height);
			setZoom(minZoom);
			setPosition({ x: 0, y: 0 });
		};
		img.src = imageUrl;
		return () => {
			active = false;
		};
	}, [open, imageUrl]);

	useEffect(() => {
		if (!imageUrl) return undefined;
		return () => {
			if (imageUrl.startsWith('blob:')) {
				URL.revokeObjectURL(imageUrl);
			}
		};
	}, [imageUrl]);

	const clampPosition = (nextPosition, nextZoom = zoom) => {
		if (!imageElement) return nextPosition;
		const scaledWidth = imageElement.width * nextZoom;
		const scaledHeight = imageElement.height * nextZoom;
		const limitX = Math.max(0, (scaledWidth - AVATAR_EDITOR_SIZE) / 2);
		const limitY = Math.max(0, (scaledHeight - AVATAR_EDITOR_SIZE) / 2);
		return {
			x: Math.min(limitX, Math.max(-limitX, nextPosition.x)),
			y: Math.min(limitY, Math.max(-limitY, nextPosition.y)),
		};
	};

	const handlePointerDown = (e) => {
		if (!imageElement) return;
		e.preventDefault();
		dragStateRef.current = {
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			startPosition: position,
		};
		e.currentTarget.setPointerCapture?.(e.pointerId);
	};

	const handlePointerMove = (e) => {
		const dragState = dragStateRef.current;
		if (!dragState || dragState.pointerId !== e.pointerId) return;
		setPosition(clampPosition({
			x: dragState.startPosition.x + (e.clientX - dragState.startX),
			y: dragState.startPosition.y + (e.clientY - dragState.startY),
		}));
	};

	const handlePointerUp = (e) => {
		if (dragStateRef.current?.pointerId === e.pointerId) {
			dragStateRef.current = null;
		}
	};

	const handleZoomChange = (nextZoom) => {
		setZoom(nextZoom);
		setPosition((prev) => clampPosition(prev, nextZoom));
	};

	const handleSave = async () => {
		if (!imageElement) return;
		const canvas = document.createElement('canvas');
		canvas.width = AVATAR_OUTPUT_SIZE;
		canvas.height = AVATAR_OUTPUT_SIZE;
		const context = canvas.getContext('2d');
		if (!context) return;

		const scale = AVATAR_OUTPUT_SIZE / AVATAR_EDITOR_SIZE;
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.save();
		context.beginPath();
		context.arc(AVATAR_OUTPUT_SIZE / 2, AVATAR_OUTPUT_SIZE / 2, AVATAR_OUTPUT_SIZE / 2, 0, Math.PI * 2);
		context.closePath();
		context.clip();
		context.translate(AVATAR_OUTPUT_SIZE / 2 + position.x * scale, AVATAR_OUTPUT_SIZE / 2 + position.y * scale);
		context.scale(zoom * scale, zoom * scale);
		context.drawImage(imageElement, -imageElement.width / 2, -imageElement.height / 2);
		context.restore();

		const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
		if (!blob) return;
		const nextFileName = fileName.replace(/\.[^.]+$/, '') + '.jpg';
		await onSave(new File([blob], nextFileName, { type: 'image/jpeg' }));
	};

	if (!open) return null;

	const minZoom = imageElement ? Math.max(AVATAR_EDITOR_SIZE / imageElement.width, AVATAR_EDITOR_SIZE / imageElement.height) : 1;
	const maxZoom = Math.max(3, minZoom * 3);

	return (
		<div className="va-avatar-editor-overlay" onClick={() => !busy && onClose()}>
			<div className="va-avatar-editor-modal" onClick={(e) => e.stopPropagation()}>
				<div className="va-avatar-editor-header">
					<div>
						<h3>Poziționează poza de profil</h3>
						<p>Mută imaginea și ajustează zoom-ul până arată exact cum vrei.</p>
					</div>
					<button type="button" className="va-avatar-editor-close" onClick={onClose} disabled={busy}>×</button>
				</div>
				<div className="va-avatar-editor-stage-wrap">
					<div
						className="va-avatar-editor-stage"
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerCancel={handlePointerUp}
					>
						{imageElement ? (
							<img
								src={imageUrl}
								alt="Previzualizare avatar"
								className="va-avatar-editor-image"
								style={{ transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${zoom})` }}
							/>
						) : null}
						<div className="va-avatar-editor-mask" />
					</div>
				</div>
				<div className="va-avatar-editor-controls">
					<label htmlFor="va-avatar-editor-zoom">Zoom</label>
					<input
						id="va-avatar-editor-zoom"
						type="range"
						min={minZoom}
						max={maxZoom}
						step="0.01"
						value={zoom}
						onChange={(e) => handleZoomChange(Number(e.target.value))}
						disabled={!imageElement || busy}
					/>
				</div>
				<div className="va-avatar-editor-actions">
					<button type="button" className="va-profile-avatar-btn" onClick={onClose} disabled={busy}>Anulează</button>
					<button type="button" className="va-profile-avatar-btn va-avatar-editor-save" onClick={handleSave} disabled={!imageElement || busy}>
						{busy ? 'Se salvează...' : 'Salvează poza'}
					</button>
				</div>
			</div>
		</div>
	);
};

export default ProfilePage;
