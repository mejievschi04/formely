import React, { useState, useEffect, useRef } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { adminService } from '../../services/api';
import { coursesService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { logger } from '../../utils/logger';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useAuth } from '../../contexts/AuthContext';
import {
	TEAM_ACCENT_COLORS,
	teamAccentByTeamId,
} from '../../utils/teamAccent';
import { normalizeColorInputToHex } from '../../utils/color';
import { useScrollResetOnOpen } from '../../hooks/useScrollResetOnOpen';
import OrganizationTeamsLayout, {
	OrganizationPageAddMenu,
} from '../../components/admin/organization/OrganizationTeamsLayout';
import {
	departmentIdFromOrderKey,
	findOrderKeyForTeam,
	parseTeamKey,
	resolveTargetOrderKey,
	toTeamKey,
} from '../../components/admin/organization/orgDnd';

const AdminTeamsPage = () => {
	const { canMutateInAdminArea } = useAuth();
	const { success: showSuccess, error: showError } = useToast();
	const [departments, setDepartments] = useState([]);
	const [teamOrders, setTeamOrders] = useState({});
	const [users, setUsers] = useState([]);
	const [courses, setCourses] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [showDeptModal, setShowDeptModal] = useState(false);
	const [editingDepartment, setEditingDepartment] = useState(null);
	const [deleteDeptId, setDeleteDeptId] = useState(null);
	const [deptForm, setDeptForm] = useState({ name: '', description: '', accent_color: TEAM_ACCENT_COLORS[0] });
	const deptColorInputRef = useRef(null);
	const [showModal, setShowModal] = useState(false);
	const [showUsersModal, setShowUsersModal] = useState(false);
	const [showCoursesModal, setShowCoursesModal] = useState(false);
	const [editingTeam, setEditingTeam] = useState(null);
	const [selectedTeam, setSelectedTeam] = useState(null);
	const [deleteConfirmTeamId, setDeleteConfirmTeamId] = useState(null);
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [memberCourseModal, setMemberCourseModal] = useState(null);
	const teamColorInputRef = useRef(null);
	const openTeamColorPicker = () => teamColorInputRef.current?.click();
	const openDeptColorPicker = () => deptColorInputRef.current?.click();
	const anyTeamModalOpen =
		showModal ||
		showDeptModal ||
		showUsersModal ||
		showCoursesModal ||
		Boolean(memberCourseModal);
	useScrollResetOnOpen(anyTeamModalOpen);
	const [formData, setFormData] = useState({
		name: '',
		accent_color: TEAM_ACCENT_COLORS[0],
		department_id: '',
	});
	const [activeDragTeam, setActiveDragTeam] = useState(null);

	useEffect(() => {
		fetchOrganization();
		fetchUsers();
		fetchCourses();
	}, []);

	const buildTeamOrders = (data) => {
		const orders = {};
		(data.departments || []).forEach((dept) => {
			orders[`dept-${dept.id}`] = [...(dept.teams || [])];
		});
		return orders;
	};

	const fetchOrganization = async ({ silent = false } = {}) => {
		try {
			if (!silent) setLoading(true);
			const data = await adminService.getOrganizationTree();
			setDepartments(data.departments || []);
			setTeamOrders(buildTeamOrders(data));
		} catch (err) {
			console.error('Error fetching organization:', err);
			setError('Nu s-a putut încărca structura organizațională');
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
		if (!formData.department_id) {
			showError('Selectează un departament pentru echipă.');
			return;
		}
		try {
			const payload = {
				name: formData.name,
				accent_color: formData.accent_color ? normalizeColorInputToHex(formData.accent_color, null) : TEAM_ACCENT_COLORS[0],
				department_id: Number(formData.department_id),
			};
			if (editingTeam) {
				await adminService.updateTeam(editingTeam.id, payload);
			} else {
				await adminService.createTeam(payload);
			}

			setShowModal(false);
			setEditingTeam(null);
			setFormData({ name: '', accent_color: TEAM_ACCENT_COLORS[0], department_id: '' });
			fetchOrganization({ silent: true });
			showSuccess('Echipă salvată cu succes!');
		} catch (err) {
			logger.error('Error saving team:', err);
			showError('Eroare la salvarea echipei: ' + (err.response?.data?.message || err.message));
		}
	};

	const openCreateTeam = (departmentId = null) => {
		setEditingTeam(null);
		setFormData({
			name: '',
			accent_color: TEAM_ACCENT_COLORS[0],
			department_id: departmentId ? String(departmentId) : '',
		});
		setShowModal(true);
	};

	const handleEdit = (team) => {
		setEditingTeam(team);
		setFormData({
			name: team.name,
			accent_color: team.accent_color || TEAM_ACCENT_COLORS[0],
			department_id: team.department_id ? String(team.department_id) : '',
		});
		setShowModal(true);
	};

	const handleOrganizationDragStart = (event) => {
		const teamId = parseTeamKey(event.active.id);
		if (teamId == null) return;
		const key = findOrderKeyForTeam(teamOrders, teamId);
		const team = (teamOrders[key] || []).find((t) => t.id === teamId);
		if (team) {
			setActiveDragTeam({
				...team,
				accent: team.accent_color || TEAM_ACCENT_COLORS[0],
			});
		}
	};

	const handleOrganizationDragEnd = async (event) => {
		setActiveDragTeam(null);
		if (!canMutateInAdminArea) return;

		const { active, over } = event;
		if (!over) return;

		const teamId = parseTeamKey(active.id);
		if (teamId == null) return;

		const sourceKey = findOrderKeyForTeam(teamOrders, teamId);
		const targetKey = resolveTargetOrderKey(over.id, teamOrders);
		if (!sourceKey || !targetKey || targetKey === 'none') return;

		const sourceList = [...(teamOrders[sourceKey] || [])];
		const teamIndex = sourceList.findIndex((t) => t.id === teamId);
		if (teamIndex < 0) return;

		const prevOrders = teamOrders;

		if (sourceKey === targetKey) {
			if (active.id === over.id) return;
			let newIndex = sourceList.findIndex((t) => toTeamKey(t.id) === over.id);
			if (newIndex < 0) newIndex = sourceList.length - 1;
			if (teamIndex === newIndex) return;
			const next = arrayMove(sourceList, teamIndex, newIndex);
			setTeamOrders((o) => ({ ...o, [sourceKey]: next }));
			try {
				await adminService.reorderTeams(next.map((t) => t.id));
				showSuccess('Ordinea echipelor a fost salvată');
				fetchOrganization({ silent: true });
			} catch (err) {
				showError(err?.response?.data?.message || 'Nu s-a putut salva ordinea');
				setTeamOrders(prevOrders);
			}
			return;
		}

		// Mutare între departamente
		const [moved] = sourceList.splice(teamIndex, 1);
		const targetList = [...(teamOrders[targetKey] || [])];
		let insertIndex = targetList.length;
		const overTeamId = parseTeamKey(over.id);
		if (overTeamId != null) {
			const overIdx = targetList.findIndex((t) => t.id === overTeamId);
			if (overIdx >= 0) insertIndex = overIdx;
		}
		targetList.splice(insertIndex, 0, moved);

		const nextOrders = {
			...teamOrders,
			[sourceKey]: sourceList,
			[targetKey]: targetList,
		};
		setTeamOrders(nextOrders);

		const newDeptId = departmentIdFromOrderKey(targetKey);
		try {
			await adminService.updateTeam(teamId, { department_id: newDeptId });
			await adminService.reorderTeams(targetList.map((t) => t.id));
			if (sourceList.length > 0) {
				await adminService.reorderTeams(sourceList.map((t) => t.id));
			}
			showSuccess('Echipa a fost mutată');
			fetchOrganization({ silent: true });
		} catch (err) {
			showError(err?.response?.data?.message || 'Nu s-a putut muta echipa');
			setTeamOrders(prevOrders);
		}
	};

	const handleDeptSubmit = async (e) => {
		e.preventDefault();
		try {
			const payload = {
				name: deptForm.name,
				description: deptForm.description || null,
				accent_color: deptForm.accent_color
					? normalizeColorInputToHex(deptForm.accent_color, null)
					: TEAM_ACCENT_COLORS[0],
			};
			if (editingDepartment) {
				await adminService.updateDepartment(editingDepartment.id, payload);
			} else {
				await adminService.createDepartment(payload);
			}
			setShowDeptModal(false);
			setEditingDepartment(null);
			setDeptForm({ name: '', description: '', accent_color: TEAM_ACCENT_COLORS[0] });
			fetchOrganization({ silent: true });
			showSuccess('Departament salvat');
		} catch (err) {
			showError(err.response?.data?.message || 'Eroare la salvarea departamentului');
		}
	};

	const handleEditDepartment = (dept) => {
		setEditingDepartment(dept);
		setDeptForm({
			name: dept.name,
			description: dept.description || '',
			accent_color: dept.accent_color || TEAM_ACCENT_COLORS[0],
		});
		setShowDeptModal(true);
	};

	const handleConfirmDeleteDepartment = async () => {
		if (!deleteDeptId) return;
		const teamsInDept = (teamOrders[`dept-${deleteDeptId}`] || []).length;
		if (teamsInDept > 0) {
			showError('Mută sau șterge echipele din departament înainte de a-l șterge.');
			setDeleteDeptId(null);
			return;
		}
		try {
			await adminService.deleteDepartment(deleteDeptId);
			setDeleteDeptId(null);
			fetchOrganization({ silent: true });
			showSuccess('Departament șters');
		} catch (err) {
			showError(err.response?.data?.message || 'Eroare la ștergere');
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
			fetchOrganization({ silent: true });
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
			fetchOrganization({ silent: true });
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
			fetchOrganization({ silent: true });
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
					<h1 className="admin-page-title">Structură organizațională</h1>
					<p className="admin-page-subtitle">
						Departamente, echipe și atribuiri de cursuri în organizația ta Formely.
					</p>
				</div>
				{canMutateInAdminArea && (
					<div className="admin-page-header-actions">
						<OrganizationPageAddMenu
							canMutate={canMutateInAdminArea}
							onAddDepartment={() => {
								setEditingDepartment(null);
								setDeptForm({ name: '', description: '', accent_color: TEAM_ACCENT_COLORS[0] });
								setShowDeptModal(true);
							}}
						/>
					</div>
				)}
			</div>

			{error && <div className="lms-error-message">{error}</div>}

			<OrganizationTeamsLayout
				departments={departments}
				teamOrders={teamOrders}
				canMutate={canMutateInAdminArea}
				activeDragTeam={activeDragTeam}
				onDragStart={handleOrganizationDragStart}
				onDragEnd={handleOrganizationDragEnd}
				onEditTeam={handleEdit}
				onDeleteTeam={handleDeleteClick}
				onAttachUsers={(team) => {
					setSelectedTeam(team);
					setShowUsersModal(true);
				}}
				onAttachCourses={(team) => {
					setSelectedTeam(team);
					setShowCoursesModal(true);
				}}
				onAddTeam={openCreateTeam}
				onEditDepartment={handleEditDepartment}
				onDeleteDepartment={setDeleteDeptId}
				onAddDepartment={() => {
					setEditingDepartment(null);
					setDeptForm({ name: '', description: '', accent_color: TEAM_ACCENT_COLORS[0] });
					setShowDeptModal(true);
				}}
			/>

			<ConfirmModal
				open={Boolean(deleteDeptId)}
				title="Șterge departamentul"
				message={
					deleteDeptId && (teamOrders[`dept-${deleteDeptId}`] || []).length > 0
						? 'Departamentul încă are echipe. Mută sau șterge echipele înainte de a continua.'
						: 'Sigur vrei să ștergi acest departament? Acțiunea nu poate fi anulată.'
				}
				confirmLabel="Șterge"
				cancelLabel="Anulează"
				variant="danger"
				onConfirm={handleConfirmDeleteDepartment}
				onClose={() => setDeleteDeptId(null)}
			/>

			{/* Department modal */}
			{showDeptModal && canMutateInAdminArea && (
				<div
					className="admin-team-modal-overlay"
					onClick={(e) => {
						if (e.target === e.currentTarget) setShowDeptModal(false);
					}}
				>
					<div className="admin-team-modal" onClick={(e) => e.stopPropagation()}>
						<div className="admin-team-modal-header">
							<h2 className="admin-team-modal-title">
								{editingDepartment ? 'Editează departament' : 'Departament nou'}
							</h2>
							<button
								type="button"
								className="admin-team-modal-close"
								onClick={() => setShowDeptModal(false)}
							>
								×
							</button>
						</div>
						<div className="admin-team-modal-body">
							<form onSubmit={handleDeptSubmit} className="admin-team-modal-form">
								<div className="admin-form-group">
									<label className="admin-form-label">Nume departament</label>
									<input
										type="text"
										className="admin-form-input"
										value={deptForm.name}
										onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
										placeholder="ex. Sales"
										required
									/>
								</div>
								<div className="admin-form-group">
									<label className="admin-form-label">Descriere (opțional)</label>
									<textarea
										className="admin-form-input admin-org-textarea"
										rows={2}
										value={deptForm.description}
										onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
									/>
								</div>
								<div className="admin-form-group">
									<label className="admin-form-label">Culoare departament</label>
									<div
										className="admin-course-map-palette-preview"
										role="button"
										tabIndex={0}
										aria-label="Deschide selectorul de culori"
										title="Deschide selectorul de culori"
										style={{ cursor: 'pointer' }}
										onClick={openDeptColorPicker}
										onKeyDown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												openDeptColorPicker();
											}
										}}
									>
										<span
											className="admin-course-map-palette-preview-swatch"
											style={{
												'--swatch-color': normalizeColorInputToHex(
													deptForm.accent_color,
													TEAM_ACCENT_COLORS[0]
												),
											}}
											aria-hidden="true"
										/>
										<span className="admin-course-map-palette-preview-label">
											{deptForm.accent_color || TEAM_ACCENT_COLORS[0]}
										</span>
									</div>
									<div className="admin-course-map-color-control">
										<input
											ref={deptColorInputRef}
											type="color"
											className="admin-course-map-color-input-native"
											value={normalizeColorInputToHex(deptForm.accent_color, TEAM_ACCENT_COLORS[0])}
											onChange={(e) => setDeptForm({ ...deptForm, accent_color: e.target.value })}
											aria-label="Alege culoarea departamentului"
										/>
									</div>
									<div className="admin-course-map-palette" role="listbox" aria-label="Culori rapide">
										{TEAM_ACCENT_COLORS.map((color) => {
											const hex = normalizeColorInputToHex(color, TEAM_ACCENT_COLORS[0]);
											const selected =
												normalizeColorInputToHex(deptForm.accent_color, TEAM_ACCENT_COLORS[0]) === hex;
											return (
												<button
													key={hex}
													type="button"
													className={`admin-course-map-palette-swatch${selected ? ' admin-course-map-palette-swatch--active' : ''}`}
													style={{ '--swatch-color': hex }}
													aria-label={`Culoare ${hex}`}
													aria-selected={selected}
													onClick={() => setDeptForm({ ...deptForm, accent_color: hex })}
												/>
											);
										})}
									</div>
								</div>
								<div className="admin-team-modal-footer">
									<button type="button" className="lms-btn-secondary" onClick={() => setShowDeptModal(false)}>
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
									<label className="admin-form-label">Departament</label>
									<select
										className="admin-form-input"
										value={formData.department_id}
										onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
										required
									>
										<option value="" disabled>
											Alege departamentul
										</option>
										{departments.map((d) => (
											<option key={d.id} value={d.id}>
												{d.name}
											</option>
										))}
									</select>
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
						fetchOrganization({ silent: true });
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
