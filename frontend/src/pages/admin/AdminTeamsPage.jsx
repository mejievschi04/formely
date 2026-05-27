import React, { useState, useEffect, useRef } from 'react';
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { adminService } from '../../services/api';
import { coursesService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { logger } from '../../utils/logger';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useAuth } from '../../contexts/AuthContext';
import {
	TEAM_ACCENT_COLORS,
	teamAccentByListIndex,
	teamAccentByTeamId,
} from '../../utils/teamAccent';
import { normalizeColorInputToHex } from '../../utils/color';
import { useScrollResetOnOpen } from '../../hooks/useScrollResetOnOpen';
import { Books, PencilSimple, Plus, Trash, UsersThree } from '@phosphor-icons/react';
import { DragGripIcon } from '../../components/common/DragGripIcon';

const teamIconSm = { size: 16, weight: 'bold', 'aria-hidden': true };
const teamIconMd = { size: 18, weight: 'bold', 'aria-hidden': true };

function SortableTeamCard({ team, index, canMutate, children }) {
	const sortId = `team-${team.id}`;
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: sortId,
		disabled: !canMutate,
	});
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.92 : 1,
	};
	const accent = teamAccentByListIndex(team, index);
	return (
		<div
			ref={setNodeRef}
			style={{ ...style, borderLeft: `8px solid ${accent}` }}
			className="admin-card admin-team-card-compact admin-team-card-sortable"
		>
			{canMutate && (
				<button
					type="button"
					className="admin-team-drag-handle"
					{...attributes}
					{...listeners}
					aria-label="Trage pentru a reordona echipa"
					title="Reordonare"
				>
					<DragGripIcon size={14} />
				</button>
			)}
			{children}
		</div>
	);
}

const AdminTeamsPage = () => {
	const { canMutateInAdminArea } = useAuth();
	const { success: showSuccess, error: showError } = useToast();
	const [teams, setTeams] = useState([]);
	const [users, setUsers] = useState([]);
	const [courses, setCourses] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [showModal, setShowModal] = useState(false);
	const [showUsersModal, setShowUsersModal] = useState(false);
	const [showCoursesModal, setShowCoursesModal] = useState(false);
	const [editingTeam, setEditingTeam] = useState(null);
	const [selectedTeam, setSelectedTeam] = useState(null);
	const [deleteConfirmTeamId, setDeleteConfirmTeamId] = useState(null);
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [orderedTeams, setOrderedTeams] = useState([]);
	const [memberCourseModal, setMemberCourseModal] = useState(null);
	const teamColorInputRef = useRef(null);
	const openTeamColorPicker = () => teamColorInputRef.current?.click();
	const anyTeamModalOpen =
		showModal || showUsersModal || showCoursesModal || Boolean(memberCourseModal);
	useScrollResetOnOpen(anyTeamModalOpen);
	const [formData, setFormData] = useState({
		name: '',
		accent_color: TEAM_ACCENT_COLORS[0],
	});

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	useEffect(() => {
		fetchTeams();
		fetchUsers();
		fetchCourses();
	}, []);

	const fetchTeams = async ({ silent = false } = {}) => {
		try {
			if (!silent) setLoading(true);
			const data = await adminService.getTeams();
			const list = Array.isArray(data) ? data : [];
			setTeams(list);
			setOrderedTeams([...list]);
		} catch (err) {
			console.error('Error fetching teams:', err);
			setError('Nu s-au putut încărca echipele');
		} finally {
			if (!silent) setLoading(false);
		}
	};

	const fetchUsers = async () => {
		try {
			const data = await adminService.getUsers();
			setUsers(data);
		} catch (err) {
			console.error('Error fetching users:', err);
		}
	};

	const fetchCourses = async () => {
		try {
			const data = await coursesService.getAll();
			setCourses(data);
		} catch (err) {
			console.error('Error fetching courses:', err);
		}
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		try {
			const payload = {
				name: formData.name,
				accent_color: formData.accent_color ? normalizeColorInputToHex(formData.accent_color, null) : TEAM_ACCENT_COLORS[0],
			};
			if (editingTeam) {
				await adminService.updateTeam(editingTeam.id, payload);
			} else {
				await adminService.createTeam(payload);
			}

			setShowModal(false);
			setEditingTeam(null);
			setFormData({ name: '', accent_color: TEAM_ACCENT_COLORS[0] });
			fetchTeams({ silent: true });
			showSuccess('Echipă salvată cu succes!');
		} catch (err) {
			logger.error('Error saving team:', err);
			showError('Eroare la salvarea echipei: ' + (err.response?.data?.message || err.message));
		}
	};

	const handleEdit = (team) => {
		setEditingTeam(team);
		setFormData({
			name: team.name,
			accent_color: team.accent_color || TEAM_ACCENT_COLORS[0],
		});
		setShowModal(true);
	};

	const handleTeamsDragEnd = async (event) => {
		if (!canMutateInAdminArea) return;
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = orderedTeams.findIndex((t) => `team-${t.id}` === active.id);
		const newIndex = orderedTeams.findIndex((t) => `team-${t.id}` === over.id);
		if (oldIndex < 0 || newIndex < 0) return;
		const next = arrayMove(orderedTeams, oldIndex, newIndex);
		setOrderedTeams(next);
		try {
			await adminService.reorderTeams(next.map((t) => t.id));
			showSuccess('Ordinea echipelor a fost salvată');
			fetchTeams({ silent: true });
		} catch (err) {
			showError(err?.response?.data?.message || 'Nu s-a putut salva ordinea');
			setOrderedTeams(Array.isArray(teams) ? [...teams] : []);
		}
	};

	const handleDeleteClick = (id) => {
		setDeleteConfirmTeamId(id);
	};

	const handleConfirmDeleteTeam = async () => {
		if (!deleteConfirmTeamId) return;
		setDeleteLoading(true);
		try {
			await adminService.deleteTeam(deleteConfirmTeamId);
			setDeleteConfirmTeamId(null);
			fetchTeams({ silent: true });
			showSuccess('Echipă ștearsă cu succes!');
		} catch (err) {
			logger.error('Error deleting team:', err);
			showError('Eroare la ștergerea echipei: ' + (err.response?.data?.message || err.message));
		} finally {
			setDeleteLoading(false);
		}
	};

	const handleAttachUsers = async (userIds) => {
		try {
			await adminService.attachUsersToTeam(selectedTeam.id, userIds);
			setShowUsersModal(false);
			setSelectedTeam(null);
			fetchTeams({ silent: true });
			showSuccess('Utilizatori atașați cu succes!');
		} catch (err) {
			logger.error('Error attaching users:', err);
			showError('Eroare la atașarea utilizatorilor: ' + (err.response?.data?.message || err.message));
		}
	};

	const handleAttachCourses = async (courseIds) => {
		try {
			await adminService.attachCoursesToTeam(selectedTeam.id, courseIds);
			setShowCoursesModal(false);
			setSelectedTeam(null);
			fetchTeams({ silent: true });
			showSuccess('Cursuri atașate cu succes!');
		} catch (err) {
			logger.error('Error attaching courses:', err);
			showError('Eroare la atașarea cursurilor: ' + (err.response?.data?.message || err.message));
		}
	};

	if (loading) {
		return (
			<div className="admin-container">
				<div className="lms-dashboard-loading">
					<div className="lms-spinner"></div>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-container">
			<div className="admin-page-header">
				<div className="admin-page-header-content">
					<h1 className="admin-page-title">Gestionare Echipe</h1>
					<p className="admin-page-subtitle">Gestionează echipele și atribuie-le cursuri</p>
				</div>
				{canMutateInAdminArea && (
				<button
					className="lms-btn-primary"
					onClick={() => {
						setEditingTeam(null);
						setFormData({ name: '', accent_color: TEAM_ACCENT_COLORS[0] });
						setShowModal(true);
					}}
				>
					<Plus {...teamIconSm} />
					<span>Adaugă Echipă</span>
				</button>
				)}
			</div>

			{error && (
				<div className="lms-error-message">
					{error}
				</div>
			)}

			{teams.length > 0 ? (
				<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTeamsDragEnd}>
					<SortableContext items={orderedTeams.map((t) => `team-${t.id}`)} strategy={rectSortingStrategy}>
						<div className="admin-grid admin-teams-page-grid">
							{orderedTeams.map((team, index) => (
								<SortableTeamCard key={team.id} team={team} index={index} canMutate={canMutateInAdminArea}>
							<div className="admin-card-body">
								{/* Header with icon and actions */}
								<div className="admin-team-card-compact__header">
									<div className="admin-team-card-compact__header-main">
										<div className="admin-team-card-compact__avatar" aria-hidden>
											<UsersThree size={20} weight="duotone" aria-hidden />
										</div>
										<div className="admin-team-card-compact__title-wrap">
											<span
												className="admin-team-card-title-swatch"
												style={{ background: teamAccentByListIndex(team, index) }}
												aria-hidden
											/>
											<h3 className="admin-card-title admin-team-card-compact__title">
												{team.name}
											</h3>
										</div>
									</div>
									{/* Action icons */}
									{canMutateInAdminArea && (
									<div className="admin-team-card-compact__header-actions">
										<button
											className="admin-btn admin-btn-sm admin-btn-ghost admin-team-card-compact__icon-btn"
											onClick={() => handleEdit(team)}
											title="Editează echipă"
											aria-label="Editează echipă"
											type="button"
										>
											<PencilSimple {...teamIconSm} />
										</button>
										<button
											className="admin-btn admin-btn-sm admin-btn-danger admin-team-card-compact__icon-btn"
											onClick={() => handleDeleteClick(team.id)}
											title="Șterge echipă"
											aria-label="Șterge echipă"
											type="button"
										>
											<Trash {...teamIconMd} />
										</button>
									</div>
									)}
								</div>
								
								{/* Stats */}
								<div className="admin-team-card-compact__stats">
									<div className="admin-team-card-compact__stat-cell">
										<div className="admin-team-card-compact__stat-value">
											{team.users?.length || 0}
										</div>
										<div className="admin-team-card-compact__stat-label">
											Membri
										</div>
									</div>
									<div className="admin-team-card-compact__stat-cell">
										<div className="admin-team-card-compact__stat-value">
											{team.courses?.length || 0}
										</div>
										<div className="admin-team-card-compact__stat-label">
											Cursuri
										</div>
									</div>
								</div>

								{/* Actions */}
								{canMutateInAdminArea && (
								<div className="admin-card-actions">
									<button
										className="admin-btn admin-btn-sm admin-btn-secondary"
										onClick={() => {
											setSelectedTeam(team);
											setShowUsersModal(true);
										}}
									>
										<span className="admin-btn-icon">
											<UsersThree size={16} weight="bold" aria-hidden />
										</span>
										<span>Membri</span>
									</button>
									<button
										className="admin-btn admin-btn-sm admin-btn-secondary"
										onClick={() => {
											setSelectedTeam(team);
											setShowCoursesModal(true);
										}}
									>
										<span className="admin-btn-icon">
											<Books size={16} weight="bold" aria-hidden />
										</span>
										<span>Cursuri</span>
									</button>
								</div>
								)}
							</div>
								</SortableTeamCard>
							))}
						</div>
					</SortableContext>
				</DndContext>
			) : (
				<div className="lms-empty-state">
					<div className="lms-empty-icon">
						<UsersThree size={26} weight="duotone" aria-hidden />
					</div>
					<h3 className="lms-empty-title">Nu există echipe</h3>
					<p className="lms-empty-description">
						Începe prin a crea prima echipă
					</p>
					{canMutateInAdminArea && (
					<button
						className="lms-btn-primary"
						onClick={() => {
							setEditingTeam(null);
							setFormData({ name: '', accent_color: TEAM_ACCENT_COLORS[0] });
							setShowModal(true);
						}}
					>
						<Plus {...teamIconSm} />
						<span>Adaugă Echipă</span>
					</button>
					)}
				</div>
			)}

			{/* Team Form Modal */}
			{showModal && canMutateInAdminArea && (
				<div className="admin-team-modal-overlay" onClick={(e) => {
					if (e.target === e.currentTarget) {
						setShowModal(false);
					}
				}}>
					<div className="admin-team-modal" onClick={(e) => e.stopPropagation()}>
						<div className="admin-team-modal-header">
							<div className="admin-team-modal-title-wrap">
								<span
									className="admin-team-modal-title-swatch"
									style={{ background: formData.accent_color || TEAM_ACCENT_COLORS[0] }}
									aria-hidden
								/>
								<h2 className="admin-team-modal-title">{editingTeam ? 'Editează Echipă' : 'Adaugă Echipă Nouă'}</h2>
							</div>
							<button
								type="button"
								className="admin-team-modal-close"
								onClick={() => setShowModal(false)}
								title="Închide"
							>
								×
							</button>
						</div>
						<div className="admin-team-modal-body">
							<form onSubmit={handleSubmit} className="admin-team-modal-form">
								<div className="admin-form-group">
									<label className="admin-form-label">Nume</label>
									<input
										type="text"
										className="admin-form-input"
										value={formData.name}
										onChange={(e) => setFormData({ ...formData, name: e.target.value })}
										required
									/>
								</div>
								<div className="admin-form-group">
									<label className="admin-form-label">Culoare echipă</label>
									<div
										className="admin-course-map-palette-preview"
										role="button"
										tabIndex={0}
										aria-label="Deschide selectorul de culori"
										title="Deschide selectorul de culori"
										style={{ cursor: 'pointer' }}
										onClick={openTeamColorPicker}
										onKeyDown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												openTeamColorPicker();
											}
										}}
									>
										<span
											className="admin-course-map-palette-preview-swatch"
											style={{ '--swatch-color': normalizeColorInputToHex(formData.accent_color, TEAM_ACCENT_COLORS[0]) }}
											aria-hidden="true"
										/>
										<span className="admin-course-map-palette-preview-label">{formData.accent_color || TEAM_ACCENT_COLORS[0]}</span>
									</div>
									<div className="admin-course-map-color-control">
										<input
											ref={teamColorInputRef}
											type="color"
											className="admin-course-map-color-input-native"
											value={normalizeColorInputToHex(formData.accent_color, TEAM_ACCENT_COLORS[0])}
											onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
											aria-label="Alege culoarea echipei"
										/>
									</div>
								</div>
								<div className="admin-team-modal-footer">
									<button
										type="button"
										className="lms-btn-secondary"
										onClick={() => setShowModal(false)}
									>
										Anulează
									</button>
									<button type="submit" className="lms-btn-primary">
										Salvează
									</button>
								</div>
							</form>
						</div>
					</div>
				</div>
			)}

			{/* Users Modal */}
			{showUsersModal && selectedTeam && (
				<TeamUsersModal
					team={selectedTeam}
					users={users}
					onClose={() => {
						setShowUsersModal(false);
						setSelectedTeam(null);
					}}
					onSave={handleAttachUsers}
					onOpenMemberCourses={(u) => {
						if (selectedTeam) setMemberCourseModal({ team: selectedTeam, user: u });
					}}
				/>
			)}

			{memberCourseModal && (
				<TeamMemberAssignCoursesModal
					team={memberCourseModal.team}
					member={memberCourseModal.user}
					courses={courses}
					onClose={() => setMemberCourseModal(null)}
					onSaved={() => {
						fetchTeams({ silent: true });
						setMemberCourseModal(null);
					}}
				/>
			)}

			{/* Courses Modal */}
			{showCoursesModal && selectedTeam && (
				<TeamCoursesModal
					team={selectedTeam}
					courses={courses}
					onClose={() => {
						setShowCoursesModal(false);
						setSelectedTeam(null);
					}}
					onSave={handleAttachCourses}
				/>
			)}

			<ConfirmModal
				open={!!deleteConfirmTeamId}
				onClose={() => setDeleteConfirmTeamId(null)}
				onConfirm={handleConfirmDeleteTeam}
				title="Șterge echipă"
				message="Sigur dorești să ștergi această echipă?"
				confirmLabel="Șterge"
				cancelLabel="Anulare"
				variant="danger"
				loading={deleteLoading}
			/>
		</div>
	);
};

const TeamUsersModal = ({ team, users, onClose, onSave, onOpenMemberCourses }) => {
	const [selectedUserIds, setSelectedUserIds] = useState(team.users?.map(u => u.id) || []);

	const handleSubmit = (e) => {
		e.preventDefault();
		onSave(selectedUserIds);
	};

	return (
		<div className="admin-team-modal-overlay" onClick={(e) => {
			if (e.target === e.currentTarget) {
				onClose();
			}
		}}>
			<div className="admin-team-modal" onClick={(e) => e.stopPropagation()}>
				<div className="admin-team-modal-header">
					<div className="admin-team-modal-title-wrap">
						<span
							className="admin-team-modal-title-swatch"
							style={{ background: teamAccentByTeamId(team) }}
							aria-hidden
						/>
						<h2 className="admin-team-modal-title">Gestionează Membri — {team.name}</h2>
					</div>
					<button
						type="button"
						className="admin-team-modal-close"
						onClick={onClose}
						title="Închide"
					>
						×
					</button>
				</div>
				<div className="admin-team-modal-body">
					<form onSubmit={handleSubmit} className="admin-team-modal-form">
						{team.users?.length > 0 && onOpenMemberCourses && (
							<div className="admin-form-group">
								<label className="admin-form-label">Membri — cursuri pe persoană</label>
								<ul className="admin-team-member-assign-list">
									{team.users.map((u) => (
										<li key={u.id} className="admin-team-member-assign-row">
											<span className="admin-team-member-assign-name">{u.name}</span>
											<button
												type="button"
												className="admin-btn admin-btn-sm admin-btn-secondary"
												onClick={() => onOpenMemberCourses(u)}
											>
												Cursuri
											</button>
										</li>
									))}
								</ul>
							</div>
						)}
						<div className="admin-form-group">
							<label className="admin-form-label">Selectează Membri</label>
							<div className="admin-team-modal-list">
								{users.map((user) => (
									<label 
										key={user.id}
										className={`admin-team-modal-list-item ${selectedUserIds.includes(user.id) ? 'selected' : ''}`}
									>
										<input
											type="checkbox"
											checked={selectedUserIds.includes(user.id)}
											onChange={(e) => {
												if (e.target.checked) {
													setSelectedUserIds([...selectedUserIds, user.id]);
												} else {
													setSelectedUserIds(selectedUserIds.filter(id => id !== user.id));
												}
											}}
										/>
										<div className="admin-team-modal-list-item-content">
											<div className={`admin-team-modal-list-item-label ${selectedUserIds.includes(user.id) ? 'selected' : ''}`}>
												{user.name}
											</div>
											<div className="admin-team-modal-list-item-sublabel">
												{user.email} • {user.role}
											</div>
										</div>
									</label>
								))}
							</div>
						</div>
						<div className="admin-team-modal-footer">
							<button type="button" className="lms-btn-secondary" onClick={onClose}>
								Anulează
							</button>
							<button type="submit" className="lms-btn-primary">
								Salvează
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
};

const TeamMemberAssignCoursesModal = ({ team, member, courses, onClose, onSaved }) => {
	const { success: showSuccess, error: showError } = useToast();
	const [selectedIds, setSelectedIds] = useState([]);
	const [initialIds, setInitialIds] = useState([]);
	const [loadingUser, setLoadingUser] = useState(true);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			setLoadingUser(true);
			try {
				const data = await adminService.getUser(member.id);
				const assigned = data?.assigned_courses || data?.assignedCourses || [];
				const ids = Array.isArray(assigned) ? assigned.map((c) => c.id) : [];
				if (!cancelled) {
					setInitialIds(ids);
					setSelectedIds(ids);
				}
			} catch (err) {
				logger.error('Team member courses load', err);
				if (!cancelled) showError('Nu s-au putut încărca cursurile utilizatorului');
				if (!cancelled) onClose();
			} finally {
				if (!cancelled) setLoadingUser(false);
			}
		};
		load();
		return () => { cancelled = true; };
	// eslint-disable-next-line react-hooks/exhaustive-deps -- încă o dată per membru
	}, [member.id]);

	const toggle = (courseId) => {
		setSelectedIds((prev) => (prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId]));
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		const toAdd = selectedIds.filter((id) => !initialIds.includes(id));
		const toRemove = initialIds.filter((id) => !selectedIds.includes(id));
		setSaving(true);
		try {
			if (toAdd.length > 0) {
				await adminService.attachCoursesToTeamMember(team.id, member.id, toAdd);
			}
			for (const cid of toRemove) {
				await adminService.removeCourse(member.id, cid);
			}
			showSuccess('Cursurile membrului au fost actualizate');
			onSaved();
		} catch (err) {
			logger.error('Team member courses save', err);
			showError(err?.response?.data?.message || 'Eroare la salvare');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="admin-team-modal-overlay" onClick={(e) => {
			if (e.target === e.currentTarget) onClose();
		}}>
			<div className="admin-team-modal admin-team-modal-lg" onClick={(e) => e.stopPropagation()}>
				<div className="admin-team-modal-header">
					<div className="admin-team-modal-title-wrap">
						<span
							className="admin-team-modal-title-swatch"
							style={{ background: teamAccentByTeamId(team) }}
							aria-hidden
						/>
						<h2 className="admin-team-modal-title">Cursuri pentru {member.name} — {team.name}</h2>
					</div>
					<button type="button" className="admin-team-modal-close" onClick={onClose} title="Închide">×</button>
				</div>
				<div className="admin-team-modal-body">
					{loadingUser ? (
						<p className="admin-text-muted">Se încarcă…</p>
					) : (
						<form onSubmit={handleSubmit} className="admin-team-modal-form">
							<div className="admin-form-group">
								<label className="admin-form-label">Selectează cursuri atribuite acestui membru</label>
								<div className="admin-team-modal-list">
									{courses.map((course) => (
										<label
											key={course.id}
											className={`admin-team-modal-list-item ${selectedIds.includes(course.id) ? 'selected' : ''}`}
										>
											<input
												type="checkbox"
												checked={selectedIds.includes(course.id)}
												onChange={() => toggle(course.id)}
											/>
											<div className={`admin-team-modal-list-item-label ${selectedIds.includes(course.id) ? 'selected' : ''}`}>
												{course.title}
											</div>
										</label>
									))}
								</div>
							</div>
							<div className="admin-team-modal-footer">
								<button type="button" className="lms-btn-secondary" onClick={onClose} disabled={saving}>Anulează</button>
								<button type="submit" className="lms-btn-primary" disabled={saving}>{saving ? 'Se salvează…' : 'Salvează'}</button>
							</div>
						</form>
					)}
				</div>
			</div>
		</div>
	);
};

const TeamCoursesModal = ({ team, courses, onClose, onSave }) => {
	const [selectedCourseIds, setSelectedCourseIds] = useState(team.courses?.map(c => c.id) || []);

	const handleSubmit = (e) => {
		e.preventDefault();
		onSave(selectedCourseIds);
	};

	return (
		<div className="admin-team-modal-overlay" onClick={(e) => {
			if (e.target === e.currentTarget) {
				onClose();
			}
		}}>
			<div className="admin-team-modal" onClick={(e) => e.stopPropagation()}>
				<div className="admin-team-modal-header">
					<div className="admin-team-modal-title-wrap">
						<span
							className="admin-team-modal-title-swatch"
							style={{ background: teamAccentByTeamId(team) }}
							aria-hidden
						/>
						<h2 className="admin-team-modal-title">Atribuie Cursuri — {team.name}</h2>
					</div>
					<button
						type="button"
						className="admin-team-modal-close"
						onClick={onClose}
						title="Închide"
					>
						×
					</button>
				</div>
				<div className="admin-team-modal-body">
					<form onSubmit={handleSubmit} className="admin-team-modal-form">
						<div className="admin-form-group">
							<label className="admin-form-label">Selectează Cursuri</label>
							<div className="admin-team-modal-list">
								{courses.map((course) => (
									<label 
										key={course.id}
										className={`admin-team-modal-list-item ${selectedCourseIds.includes(course.id) ? 'selected' : ''}`}
									>
										<input
											type="checkbox"
											checked={selectedCourseIds.includes(course.id)}
											onChange={(e) => {
												if (e.target.checked) {
													setSelectedCourseIds([...selectedCourseIds, course.id]);
												} else {
													setSelectedCourseIds(selectedCourseIds.filter(id => id !== course.id));
												}
											}}
										/>
										<div className={`admin-team-modal-list-item-label ${selectedCourseIds.includes(course.id) ? 'selected' : ''}`}>
											{course.title}
										</div>
									</label>
								))}
							</div>
						</div>
						<div className="admin-team-modal-footer">
							<button type="button" className="lms-btn-secondary" onClick={onClose}>
								Anulează
							</button>
							<button type="submit" className="lms-btn-primary">
								Salvează
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
};

export default AdminTeamsPage;
