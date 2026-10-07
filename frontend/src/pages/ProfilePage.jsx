import '../styles/profile-modern.css';
import { EnvelopeSimple, MagnifyingGlass, X } from '@phosphor-icons/react';
import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { profileService, adminService } from '../services/api';

import { useAuth } from '../contexts/AuthContextShared.js';

import { useToast } from '../contexts/ToastContextShared.js';
import ConfirmModal from '../components/common/ConfirmModal';
import { toImageUrl } from '../utils/imageUrl';
import { courseProgressLabel } from '../utils/courseProgressLabel.js';
import { nameInitials } from '../utils/initials';

const AVATAR_EDITOR_SIZE = 280;
const AVATAR_OUTPUT_SIZE = 512;

const COURSE_FILTERS = [
	{ id: 'all', label: 'Total atribuite', statKey: 'total_assigned' },
	{ id: 'completed', label: 'Finalizate', statKey: 'completed' },
	{ id: 'in_progress', label: 'Nefinalizate', statKey: 'in_progress' },
	{ id: 'not_accessed', label: 'Neaccesate', statKey: 'not_accessed' },
];

const COURSE_FILTER_TITLES = {
	all: 'Toate cursurile atribuite',
	completed: 'Cursuri finalizate',
	in_progress: 'Cursuri nefinalizate',
	not_accessed: 'Cursuri neaccesate',
};

/** Căutare fără diacritice și fără majuscule („Romana” găsește „Română”). */
const normalizeSearch = (value) => String(value || '')
	.normalize('NFD')
	.replace(/[\u0300-\u036f]/g, '')
	.toLowerCase()
	.trim();

const buildProfileFromCourseData = (user, data) => ({
	user,
	stats: {
		completedCourses: data.course_stats?.completed
			?? data.courseStats?.completed
			?? (Array.isArray(data.courses_completed || data.coursesCompleted) ? (data.courses_completed || data.coursesCompleted).length : 0),
		completedQuizzes: data.completed_quizzes ?? data.stats?.completedQuizzes ?? 0,
		inProgressCourses: data.course_stats?.in_progress
			?? data.courseStats?.in_progress
			?? data.in_progress_courses
			?? data.stats?.inProgressCourses
			?? 0,
		notAccessedCourses: data.course_stats?.not_accessed
			?? data.courseStats?.not_accessed
			?? data.stats?.notAccessedCourses
			?? 0,
		totalAssigned: data.course_stats?.total_assigned
			?? data.courseStats?.total_assigned
			?? data.stats?.totalAssigned
			?? 0,
		progressPercentage: data.completion_percentage ?? data.stats?.progressPercentage ?? 0,
	},
	courseStats: data.course_stats || data.courseStats || {
		total_assigned: 0,
		completed: 0,
		in_progress: 0,
		not_accessed: 0,
	},
	coursesAssigned: data.courses_assigned || data.coursesAssigned || [],
	coursesInProgress: data.courses_in_progress || data.coursesInProgress || [],
	coursesCompleted: data.courses_completed || data.coursesCompleted || [],
	coursesNotAccessed: data.courses_not_accessed || data.coursesNotAccessed || [],
});

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
	const [courseFilter, setCourseFilter] = useState('all');
	const [courseQuery, setCourseQuery] = useState('');
	const [completingCourseId, setCompletingCourseId] = useState(null);
	const [grantingAttemptKey, setGrantingAttemptKey] = useState(null);
	const viewerRole = currentUser?.actualRole ?? currentUser?.role;
	const isViewingOtherUser = Boolean(userId) && ['admin', 'instructor'].includes(viewerRole);

	const fetchData = async () => {
		try {
			setLoading(true);
			let profile;

			if (isViewingOtherUser) {
				const userData = await adminService.getUser(userId);
				profile = buildProfileFromCourseData(userData, userData);
			} else {
				const profileResponse = await profileService.getProfile();
				profile = buildProfileFromCourseData(profileResponse.user, profileResponse);
			}

			setProfileData(profile);
		} catch (err) {
			console.error('Error fetching profile:', err);
			setError('Nu s-a putut încărca profilul');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchData();
	}, [userId, isViewingOtherUser]);

	const handleMarkCourseCompleted = async (courseId) => {
		if (!userId || !courseId) return;
		setCompletingCourseId(courseId);
		try {
			await adminService.markCourseCompleted(userId, courseId);
			showToast('Curs marcat ca finalizat', 'success');
			await fetchData();
		} catch (err) {
			showToast(err?.response?.data?.message || 'Nu s-a putut marca cursul ca finalizat', 'error');
		} finally {
			setCompletingCourseId(null);
		}
	};

	const handleGrantExtraAttempt = async (courseId, testId) => {
		if (!userId || !testId) return;
		const key = `${courseId}-${testId}`;
		setGrantingAttemptKey(key);
		try {
			const granted = await adminService.grantTestExtraAttempt(userId, testId, courseId);
			showToast(granted?.message || 'A fost adăugată 1 încercare', 'success');
			await fetchData();
		} catch (err) {
			showToast(err?.response?.data?.message || 'Nu s-a putut adăuga încercarea', 'error');
		} finally {
			setGrantingAttemptKey(null);
		}
	};

	useEffect(() => {
		setCourseFilter('all');
		setCourseQuery('');
	}, [userId]);

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
		} catch  {
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

	const coursesInProgress = profileData.coursesInProgress || [];
	const coursesCompleted = profileData.coursesCompleted || [];
	const coursesNotAccessed = profileData.coursesNotAccessed || [];
	const coursesAssigned = profileData.coursesAssigned || [];
	const courseStats = profileData.courseStats || {};

	const filteredCourses = (() => {
		if (courseFilter === 'completed') return coursesCompleted;
		if (courseFilter === 'in_progress') return coursesInProgress;
		if (courseFilter === 'not_accessed') return coursesNotAccessed;
		return coursesAssigned;
	})();

	const roleLabel = isViewingOtherUser
		? ({ admin: 'Administrator', instructor: 'Instructor', analyst: 'Analist' }[profileData.user.role] || 'Utilizator')
		: 'Utilizator';
	const needle = normalizeSearch(courseQuery);
	const visibleCourses = needle
		? filteredCourses.filter((course) => normalizeSearch([
			course.title,
			course.description,
			...(Array.isArray(course.tests) ? course.tests.map((test) => test.title) : []),
		].filter(Boolean).join(' ')).includes(needle))
		: filteredCourses;

	const renderTestResult = (test) => {
		if (test.status === 'passed') return { label: `${test.percentage ?? 0}% · Promovat`, tone: 'passed' };
		if (test.status === 'pending') return { label: 'În corectare', tone: 'pending' };
		if (test.attempts_used > 0) return { label: `${test.percentage ?? 0}% · Nepromovat`, tone: 'failed' };
		return { label: 'Neînceput', tone: 'idle' };
	};

	const renderCourseCard = (course) => {
		const status = course.status || 'not_accessed';
		const courseLink = isViewingOtherUser ? `/admin/courses/${course.id}` : `/courses/${course.id}`;
		const actionLabel = isViewingOtherUser
			? 'Deschide'
			: status === 'not_accessed'
				? 'Începe cursul'
				: status === 'completed' || (course.progress || 0) >= 100
					? 'Vezi cursul'
					: 'Continuă';
		const progress = Math.max(0, Math.min(100, Number(course.progress) || 0));

		return (
			<article className={`va-up-card is-${status}`} key={course.id}>
				<div className="va-up-card-head">
					<h3 className="va-up-card-title" title={course.title}>{course.title}</h3>
					<span className={`va-up-status is-${status}`}>
						{status === 'completed' ? 'Finalizat' : status === 'in_progress' ? 'Nefinalizat' : 'Neaccesat'}
					</span>
				</div>
				{course.description ? <p className="va-up-card-desc">{course.description}</p> : null}

				{status === 'in_progress' ? (
					<div className="va-up-progress">
						<div className="va-up-progress-track" aria-hidden>
							<div className="va-up-progress-fill" style={{ width: `${progress}%` }} />
						</div>
						<span className="va-up-progress-label">
							{progress >= 100 ? 'Finalizat' : courseProgressLabel(course.progress)}
							{course.totalModules ? ` · ${course.completedModules ?? 0}/${course.totalModules} module` : ''}
						</span>
					</div>
				) : null}
				{status === 'completed' ? (
					<p className="va-up-card-note">Test: {course.quizPassed ? 'promovat ✓' : 'nepromovat'}</p>
				) : null}
				{status === 'not_accessed' ? (
					<p className="va-up-card-note">
						{isViewingOtherUser ? 'Nu a deschis încă acest curs.' : 'Nu ai deschis încă acest curs.'}
					</p>
				) : null}

				{isViewingOtherUser && Array.isArray(course.tests) && course.tests.length > 0 ? (
					<ul className="va-up-tests">
						{course.tests.map((test) => {
							const grantKey = `${course.id}-${test.id}`;
							const failed = test.status === 'failed' || (!test.passed && test.attempts_used > 0 && test.status !== 'pending');
							const result = renderTestResult(test);
							const canGrant = failed && test.max_attempts != null
								&& (viewerRole !== 'instructor' || Number(test.created_by) === Number(currentUser?.id));
							return (
								<li className="va-up-test" key={test.id}>
									<span className="va-up-test-title" title={test.title}>{test.title}</span>
									<span className={`va-up-test-result is-${result.tone}`}>{result.label}</span>
									{canGrant ? (
										<button
											type="button"
											className="va-up-test-grant"
											disabled={grantingAttemptKey === grantKey}
											onClick={() => handleGrantExtraAttempt(course.id, test.id)}
										>
											{grantingAttemptKey === grantKey ? 'Se adaugă…' : '+1 încercare'}
										</button>
									) : null}
								</li>
							);
						})}
					</ul>
				) : null}

				<div className="va-up-card-actions">
					<Link to={courseLink} className={isViewingOtherUser ? 'lms-btn-secondary lms-btn-sm' : 'lms-btn-primary lms-btn-sm'}>
						{actionLabel}
					</Link>
					{isViewingOtherUser && status !== 'completed' ? (
						<button
							type="button"
							className="lms-btn-primary lms-btn-sm"
							disabled={completingCourseId === course.id}
							onClick={() => handleMarkCourseCompleted(course.id)}
						>
							{completingCourseId === course.id ? 'Se marchează…' : 'Marchează finalizat'}
						</button>
					) : null}
				</div>
			</article>
		);
	};

	return (
		<div className="va-profile-container va-up-page">
			{isViewingOtherUser && (
				<div className="va-profile-back-button">
					<button
						type="button"
						onClick={() => navigate('/admin/users')}
						className="va-btn-back admin-back-btn"
					>
						<ArrowLeft size={18} aria-hidden />
						<span>Înapoi la Utilizatori</span>
					</button>
				</div>
			)}

			<header className="va-up-hero">
				<div className="va-up-avatar">
					{profileData.user.avatar ? (
						<img src={toImageUrl(profileData.user.avatar) || profileData.user.avatar} alt={profileData.user.name} />
					) : (
						<span>{nameInitials(profileData.user.name || profileData.user.email)}</span>
					)}
				</div>
				<div className="va-up-identity">
					<h1 className="va-up-name">{profileData.user.name}</h1>
					<div className="va-up-meta">
						<span className="va-up-role">{roleLabel}</span>
						{isViewingOtherUser && profileData.user.email ? (
							<span className="va-up-email">
								<EnvelopeSimple size={15} aria-hidden />
								{profileData.user.email}
							</span>
						) : null}
					</div>
				</div>
				<div className="va-up-progress-summary" aria-label="Progres general">
					<strong>{courseStats.completed ?? 0}<span>/{courseStats.total_assigned ?? 0}</span></strong>
					<span>cursuri finalizate</span>
				</div>
				{!isViewingOtherUser ? (
					<div className="va-up-hero-actions">
						<input
							ref={fileInputRef}
							type="file"
							accept="image/jpeg,image/png,image/gif,image/webp"
							className="va-profile-avatar-input"
							onChange={handleAvatarChange}
							disabled={uploadingAvatar}
						/>
						<button type="button" className="lms-btn-secondary lms-btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>
							{uploadingAvatar ? 'Se încarcă...' : 'Schimbă poza'}
						</button>
						{profileData.user.avatar ? (
							<button type="button" className="lms-btn-secondary lms-btn-sm va-btn-delete" onClick={handleRemoveAvatarClick} disabled={uploadingAvatar}>
								Șterge poza
							</button>
						) : null}
						<Link to="/settings" className="lms-btn-secondary lms-btn-sm">Setări</Link>
						{currentUser?.role === 'admin' || currentUser?.actualRole === 'admin' ? (
							<Link to="/profile/activity" className="lms-btn-secondary lms-btn-sm">Vezi activitatea</Link>
						) : null}
					</div>
				) : null}
			</header>

			<section className="va-up-courses" aria-labelledby="va-up-courses-title">
				<div className="va-up-courses-head">
					<h2 id="va-up-courses-title" className="va-up-courses-title">Cursuri</h2>
					<label className="va-up-search">
						<MagnifyingGlass size={17} aria-hidden />
						<input
							type="search"
							value={courseQuery}
							onChange={(event) => setCourseQuery(event.target.value)}
							placeholder="Caută curs sau test"
							aria-label="Caută curs sau test"
						/>
					</label>
				</div>
				<div className="va-up-tabs" role="group" aria-label="Filtru cursuri">
					{COURSE_FILTERS.map(({ id, label, statKey }) => (
						<button
							key={id}
							type="button"
							className={`va-up-tab${courseFilter === id ? ' is-active' : ''}`}
							onClick={() => setCourseFilter(id)}
							aria-pressed={courseFilter === id}
						>
							<span>{label}</span>
							<span className="va-up-tab-count">{courseStats[statKey] ?? 0}</span>
						</button>
					))}
				</div>

				{visibleCourses.length > 0 ? (
					<div className="va-up-grid">
						{visibleCourses.map(renderCourseCard)}
					</div>
				) : (
					<div className="va-up-empty">
						<p>
							{needle
								? `Niciun curs pentru „${courseQuery.trim()}”.`
								: courseFilter === 'all'
									? (isViewingOtherUser ? 'Niciun curs atribuit acestui utilizator.' : 'Nu ai cursuri atribuite momentan.')
									: 'Niciun curs în această categorie.'}
						</p>
						{!isViewingOtherUser && courseFilter === 'all' && !needle ? (
							<Link to="/courses" className="lms-btn-secondary lms-btn-sm">Explorează cursuri</Link>
						) : null}
					</div>
				)}
			</section>

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
		<div className="va-avatar-editor-overlay">
			<div className="va-avatar-editor-modal" onClick={(e) => e.stopPropagation()}>
				<div className="va-avatar-editor-header">
					<div>
						<h3>Poziționează poza de profil</h3>
						<p>Mută imaginea și ajustează zoom-ul până arată exact cum vrei.</p>
					</div>
					<button type="button" className="va-avatar-editor-close va-close-btn" onClick={onClose} disabled={busy} aria-label="Închide"><X size={18} weight="bold" aria-hidden="true" /></button>
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
