import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	Books,
	EnvelopeSimple,
	Key,
	Pause,
	PencilSimple,
	Play,
	Plus,
	Trash,
	UsersThree,
} from '@phosphor-icons/react';
import { adminService, coursesService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { logger } from '../../utils/logger';
import ConfirmModal from '../../components/common/ConfirmModal';
import Modal from '../../components/common/Modal';
import { toImageUrl } from '../../utils/imageUrl';
import { useAuth } from '../../contexts/AuthContext';
import { teamAccentNeutral as teamAccent } from '../../utils/teamAccent';
import { canAssignAnalyst } from '../../utils/entitlements';
import {
	STAFF_ADMIN_ROLES,
	getRoleLabel,
	normalizeRole,
} from '../../constants/staffRoles';

const STAFF_ROLE_OPTIONS = STAFF_ADMIN_ROLES.map((value) => ({
	value,
	label: getRoleLabel(value),
}));

const STAFF_EDITABLE_ROLES = STAFF_ROLE_OPTIONS.filter(
	(r) => !['admin'].includes(r.value)
);

const NO_DIRECT_COURSE_ASSIGN = new Set([
	'company_owner',
	'hr_admin',
	'admin',
	'analyst',
	'manager',
]);

function formatLastLogin(dateString) {
	if (!dateString) return '—';
	return new Date(dateString).toLocaleString('ro-RO', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function StatusBadge({ status }) {
	const s = status || 'active';
	if (s === 'suspended') {
		return (
			<span className="admin-users-status-badge admin-users-status-suspended">Suspendat</span>
		);
	}
	if (s === 'inactive') {
		return (
			<span className="admin-users-status-badge admin-users-status-inactive">Inactiv</span>
		);
	}
	return null;
}

const AdminTeamMembersPage = () => {
	const navigate = useNavigate();
	const { canMutateInAdminArea } = useAuth();
	const { success: showSuccess, error: showError } = useToast();
	const [members, setMembers] = useState([]);
	const [courses, setCourses] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [roleFilter, setRoleFilter] = useState('all');
	const [statusFilter, setStatusFilter] = useState('all');
	const [selectedMember, setSelectedMember] = useState(null);
	const [showRoleModal, setShowRoleModal] = useState(false);
	const [showCoursesModal, setShowCoursesModal] = useState(false);
	const [showSuspendModal, setShowSuspendModal] = useState(false);
	const [actionLoading, setActionLoading] = useState(null);
	const [removeMemberId, setRemoveMemberId] = useState(null);

	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
		return () => clearTimeout(t);
	}, [searchQuery]);

	const fetchTeamMembers = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await adminService.getTeamMembers({
				search: debouncedSearch || undefined,
				role: roleFilter !== 'all' ? roleFilter : undefined,
				status: statusFilter !== 'all' ? statusFilter : undefined,
				per_page: 100,
			});
			const list = Array.isArray(data) ? data : data?.data ?? [];
			setMembers(list);
		} catch (err) {
			logger.error('Error fetching team members:', err);
			setError('Nu s-a putut încărca personalul');
			setMembers([]);
		} finally {
			setLoading(false);
		}
	}, [debouncedSearch, roleFilter, statusFilter]);

	useEffect(() => {
		fetchTeamMembers();
	}, [fetchTeamMembers]);

	useEffect(() => {
		coursesService.getAll().then((data) => {
			setCourses(Array.isArray(data) ? data : []);
		}).catch(() => setCourses([]));
	}, []);

	const memberCountLabel = useMemo(() => {
		const n = members.length;
		return n === 1 ? '1 persoană' : `${n} persoane`;
	}, [members.length]);

	const handleQuickAction = async (memberId, action, data = {}) => {
		setActionLoading(memberId);
		try {
			switch (action) {
				case 'activate':
					await adminService.activateTeamMember(memberId);
					break;
				case 'suspend':
					await adminService.suspendTeamMember(memberId, data.reason, data.suspendedUntil);
					break;
				case 'resetAccess':
					await adminService.resetTeamMemberAccess(memberId);
					break;
				case 'removeFromTeam':
					await adminService.removeTeamMemberFromTeam(memberId);
					break;
				default:
					break;
			}
			await fetchTeamMembers();
			showSuccess('Acțiune realizată cu succes');
		} catch (err) {
			showError(err.response?.data?.message || 'Eroare la acțiune');
		} finally {
			setActionLoading(null);
		}
	};

	const handleUpdateRole = async (memberId, role, permissions) => {
		setActionLoading(memberId);
		try {
			await adminService.updateRoleAndPermissions(memberId, role, permissions);
			await fetchTeamMembers();
			setShowRoleModal(false);
			setSelectedMember(null);
			showSuccess('Rol actualizat');
		} catch (err) {
			showError(err.response?.data?.message || 'Eroare la actualizarea rolului');
		} finally {
			setActionLoading(null);
		}
	};

	const handleAssignCourses = async (memberId, courseIds) => {
		const target = members.find((m) => m.id === memberId);
		if (target && NO_DIRECT_COURSE_ASSIGN.has(normalizeRole(target.role))) {
			showError('Acest rol nu primește cursuri atribuite individual.');
			return;
		}
		setActionLoading(memberId);
		try {
			await adminService.assignCourses(memberId, courseIds);
			await fetchTeamMembers();
			setShowCoursesModal(false);
			setSelectedMember(null);
			showSuccess('Cursuri actualizate');
		} catch (err) {
			showError(err.response?.data?.message || 'Eroare la atribuirea cursurilor');
		} finally {
			setActionLoading(null);
		}
	};

	if (loading && members.length === 0) {
		return (
			<div className="admin-container admin-container--wide">
				<div className="lms-dashboard-loading">
					<div className="lms-spinner" />
					<p>Se încarcă personalul…</p>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-container admin-container--wide admin-staff-page">
			<div className="admin-page-header">
				<div className="admin-page-header-content">
					<h1 className="admin-page-title">Personal</h1>
					<p className="admin-page-subtitle">
						Echipa internă Formely — administratori, instructori și analiști.
					</p>
				</div>
				{canMutateInAdminArea && (
					<div className="admin-page-header-actions">
						<button
							type="button"
							className="lms-btn-secondary"
							onClick={() => navigate('/admin/users/invite')}
						>
							<EnvelopeSimple size={16} weight="bold" aria-hidden />
							Invită
						</button>
						<button
							type="button"
							className="lms-btn-primary"
							onClick={() => navigate('/admin/users')}
						>
							<Plus size={16} weight="bold" aria-hidden />
							Adaugă utilizator
						</button>
					</div>
				)}
			</div>

			{error && <div className="lms-error-message">{error}</div>}

			<div className="admin-staff-summary" aria-live="polite">
				<span className="admin-staff-summary-count">{memberCountLabel}</span>
				<span className="admin-staff-summary-hint">
					Pentru structura departamente/echipe, folosește{' '}
					<button type="button" className="admin-staff-inline-link" onClick={() => navigate('/admin/teams')}>
						Organizație
					</button>
					. Pentru toți utilizatorii (inclusiv cursanți),{' '}
					<button type="button" className="admin-staff-inline-link" onClick={() => navigate('/admin/users')}>
						Utilizatori
					</button>
					.
				</span>
			</div>

			<div className="admin-users-filters">
				<div className="admin-users-search-wrap">
					<input
						type="search"
						className="admin-users-search-input"
						placeholder="Caută după nume, email sau funcție…"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						aria-label="Caută personal"
					/>
				</div>
				<div className="admin-users-filter-group">
					<label className="admin-users-filter-label">Rol</label>
					<select
						className="admin-users-filter-select"
						value={roleFilter}
						onChange={(e) => setRoleFilter(e.target.value)}
					>
						<option value="all">Toate rolurile de personal</option>
						{STAFF_ROLE_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</div>
				<div className="admin-users-filter-group">
					<label className="admin-users-filter-label">Status</label>
					<select
						className="admin-users-filter-select"
						value={statusFilter}
						onChange={(e) => setStatusFilter(e.target.value)}
					>
						<option value="all">Toți</option>
						<option value="active">Activi</option>
						<option value="suspended">Suspendați</option>
						<option value="inactive">Inactivi</option>
					</select>
				</div>
			</div>

			<div className="admin-users-table-wrapper">
				<table className="admin-users-table">
					<thead>
						<tr>
							<th>Persoană</th>
							<th>Email</th>
							<th>Rol</th>
							<th>Echipe</th>
							<th>Cursuri</th>
							<th>Ultima autentificare</th>
							<th className="admin-users-table-cell-center">Acțiuni</th>
						</tr>
					</thead>
					<tbody>
						{members.length > 0 ? (
							members.map((member) => {
								const roleKey = normalizeRole(member.role);
								const initials =
									member.name
										?.split(' ')
										.map((n) => n[0])
										.join('')
										.toUpperCase()
										.slice(0, 2) || 'U';
								const canAssignCourses = !NO_DIRECT_COURSE_ASSIGN.has(roleKey);
								const isSuspended = (member.status || 'active') === 'suspended';

								return (
									<tr
										key={member.id}
										className="admin-staff-table-row"
										onClick={() => navigate(`/admin/users/${member.id}/profile`)}
									>
										<td>
											<div className="admin-users-table-cell-user">
												<div className="admin-users-table-avatar">
													{member.avatar ? (
														<img
															src={toImageUrl(member.avatar) || member.avatar}
															alt=""
															loading="lazy"
														/>
													) : (
														initials
													)}
												</div>
												<div>
													<div className="admin-users-table-cell-name">{member.name}</div>
													{member.job_title && (
														<div className="admin-users-table-cell-job-title">
															{member.job_title}
														</div>
													)}
												</div>
											</div>
										</td>
										<td className="admin-users-table-cell-email">{member.email}</td>
										<td>
											<span className={`admin-users-role-badge staff-role-${roleKey}`}>
												{getRoleLabel(member.role)}
											</span>
											<StatusBadge status={member.status} />
										</td>
										<td>
											{Array.isArray(member.teams) && member.teams.length > 0 ? (
												<div className="admin-users-team-chips">
													{member.teams.map((t) => (
														<span key={t.id} className="admin-users-team-chip" title={t.name}>
															<span
																className="admin-users-team-swatch"
																style={{ background: teamAccent(t) }}
																aria-hidden
															/>
															<span className="admin-users-team-chip-name">{t.name}</span>
														</span>
													))}
												</div>
											) : (
												<span className="admin-users-table-cell-muted">—</span>
											)}
										</td>
										<td>
											<span className="admin-users-table-cell-value">
												{member.assigned_courses_count ?? member.assignedCourses?.length ?? 0}
											</span>
										</td>
										<td>
											<span className="admin-users-table-cell-muted">
												{formatLastLogin(member.last_login_at)}
											</span>
										</td>
										<td className="admin-users-table-cell-center">
											<div className="admin-users-actions" onClick={(e) => e.stopPropagation()}>
												{!canMutateInAdminArea ? (
													<span className="admin-users-table-cell-muted">—</span>
												) : (
													<>
														<button
															type="button"
															className="lms-btn-secondary lms-btn-sm admin-users-action-compact"
															title="Rol și permisiuni"
															disabled={actionLoading === member.id}
															onClick={() => {
																setSelectedMember(member);
																setShowRoleModal(true);
															}}
														>
															<PencilSimple size={14} weight="bold" aria-hidden />
															<span className="sr-only">Rol</span>
														</button>
														{canAssignCourses && (
															<button
																type="button"
																className="lms-btn-secondary lms-btn-sm admin-users-action-compact"
																title="Cursuri atribuite"
																disabled={actionLoading === member.id}
																onClick={() => {
																	setSelectedMember(member);
																	setShowCoursesModal(true);
																}}
															>
																<Books size={14} weight="bold" aria-hidden />
																<span className="sr-only">Cursuri</span>
															</button>
														)}
														{isSuspended ? (
															<button
																type="button"
																className="lms-btn-primary lms-btn-sm admin-users-action-compact"
																title="Activează contul"
																disabled={actionLoading === member.id}
																onClick={() => handleQuickAction(member.id, 'activate')}
															>
																<Play size={14} weight="bold" aria-hidden />
																<span className="sr-only">Activează</span>
															</button>
														) : (
															<button
																type="button"
																className="lms-btn-secondary lms-btn-sm admin-users-action-compact"
																title="Suspendă"
																disabled={actionLoading === member.id}
																onClick={() => {
																	setSelectedMember(member);
																	setShowSuspendModal(true);
																}}
															>
																<Pause size={14} weight="bold" aria-hidden />
																<span className="sr-only">Suspendă</span>
															</button>
														)}
														<button
															type="button"
															className="lms-btn-secondary lms-btn-sm admin-users-action-compact"
															title="Reset parolă / acces"
															disabled={actionLoading === member.id}
															onClick={() => handleQuickAction(member.id, 'resetAccess')}
														>
															<Key size={14} weight="bold" aria-hidden />
															<span className="sr-only">Reset acces</span>
														</button>
														<button
															type="button"
															className="lms-btn-secondary lms-btn-sm va-btn-danger admin-users-action-compact"
															title="Elimină din echipe"
															disabled={actionLoading === member.id}
															onClick={() => setRemoveMemberId(member.id)}
														>
															<Trash size={14} weight="bold" aria-hidden />
															<span className="sr-only">Elimină din echipe</span>
														</button>
													</>
												)}
											</div>
										</td>
									</tr>
								);
							})
						) : (
							<tr>
								<td colSpan={7} className="admin-users-empty">
									<div className="lms-empty-state">
										<div className="lms-empty-icon">
											<UsersThree size={26} weight="duotone" aria-hidden />
										</div>
										<h3 className="lms-empty-title">Niciun membru al personalului</h3>
										<p className="lms-empty-description">
											Invită sau adaugă persoane cu rol de administrator, HR, instructor etc.
										</p>
									</div>
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{showRoleModal && selectedMember && (
				<RolePermissionsModal
					member={selectedMember}
					onClose={() => {
						setShowRoleModal(false);
						setSelectedMember(null);
					}}
					onSave={handleUpdateRole}
					loading={actionLoading === selectedMember.id}
				/>
			)}

			{showCoursesModal && selectedMember && (
				<CoursesAssignmentModal
					member={selectedMember}
					courses={courses}
					onClose={() => {
						setShowCoursesModal(false);
						setSelectedMember(null);
					}}
					onSave={handleAssignCourses}
					loading={actionLoading === selectedMember.id}
				/>
			)}

			{showSuspendModal && selectedMember && (
				<SuspendModal
					member={selectedMember}
					onClose={() => {
						setShowSuspendModal(false);
						setSelectedMember(null);
					}}
					onSave={(reason, suspendedUntil) =>
						handleQuickAction(selectedMember.id, 'suspend', { reason, suspendedUntil })
					}
					loading={actionLoading === selectedMember.id}
				/>
			)}

			<ConfirmModal
				open={!!removeMemberId}
				onClose={() => setRemoveMemberId(null)}
				onConfirm={async () => {
					if (!removeMemberId) return;
					await handleQuickAction(removeMemberId, 'removeFromTeam');
					setRemoveMemberId(null);
				}}
				title="Elimină din echipe"
				message="Persoana rămâne în platformă, dar este scoasă din toate echipele LMS. Continui?"
				confirmLabel="Elimină din echipe"
				cancelLabel="Anulare"
				variant="danger"
				loading={actionLoading === removeMemberId}
			/>
		</div>
	);
};

function RolePermissionsModal({ member, onClose, onSave, loading }) {
	const { user } = useAuth();
	const [role, setRole] = useState(() => normalizeRole(member.role));
	const roleOptions = STAFF_EDITABLE_ROLES.filter(
		(r) => r.value !== 'analyst' || canAssignAnalyst(user)
	);

	const handleSubmit = (e) => {
		e.preventDefault();
		onSave(member.id, role, member.permissions || {});
	};

	return (
		<Modal
			isOpen
			onClose={onClose}
			ariaLabelledby="staff-role-modal-title"
			className="admin-users-modal-overlay"
		>
			<div className="admin-users-modal">
				<div className="admin-users-modal-header">
					<h2 id="staff-role-modal-title" className="admin-users-modal-title">
						Rol personal — {member.name}
					</h2>
					<button type="button" className="admin-users-modal-close" onClick={onClose} aria-label="Închide">
						×
					</button>
				</div>
				<form onSubmit={handleSubmit} className="admin-users-modal-form">
					<div className="admin-form-group">
						<label className="admin-form-label" htmlFor="staff-role-select">
							Rol
						</label>
						<select
							id="staff-role-select"
							className="admin-form-input"
							value={role}
							onChange={(e) => setRole(e.target.value)}
							required
						>
							{roleOptions.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
						<p className="admin-form-hint">
							Permisiunile se aplică automat în funcție de rol.
						</p>
					</div>
					<div className="admin-users-modal-footer">
						<button type="button" className="lms-btn-secondary" onClick={onClose} disabled={loading}>
							Anulează
						</button>
						<button type="submit" className="lms-btn-primary" disabled={loading}>
							{loading ? 'Se salvează…' : 'Salvează'}
						</button>
					</div>
				</form>
			</div>
		</Modal>
	);
}

function CoursesAssignmentModal({ member, courses, onClose, onSave, loading }) {
	const initialIds =
		member.assignedCourses?.map((c) => c.id) ||
		member.assigned_courses?.map((c) => c.id) ||
		[];
	const [selectedCourseIds, setSelectedCourseIds] = useState(initialIds);
	const roleKey = normalizeRole(member.role);
	const isRestricted = NO_DIRECT_COURSE_ASSIGN.has(roleKey);

	const handleSubmit = (e) => {
		e.preventDefault();
		onSave(member.id, selectedCourseIds);
	};

	return (
		<Modal
			isOpen
			onClose={onClose}
			ariaLabelledby="staff-courses-modal-title"
			className="admin-users-modal-overlay"
		>
			<div className="admin-users-modal admin-users-modal--wide">
				<div className="admin-users-modal-header">
					<h2 id="staff-courses-modal-title" className="admin-users-modal-title">
						Cursuri — {member.name}
					</h2>
					<button type="button" className="admin-users-modal-close" onClick={onClose} aria-label="Închide">
						×
					</button>
				</div>
				<form onSubmit={handleSubmit} className="admin-users-modal-form">
					{isRestricted ? (
						<p className="admin-form-hint">Acest rol nu primește cursuri atribuite individual.</p>
					) : (
						<div className="admin-team-members-courses-list">
							{courses.length === 0 ? (
								<p className="admin-form-hint">Nu există cursuri disponibile.</p>
							) : (
								courses.map((course) => (
									<label
										key={course.id}
										className={`admin-team-members-course-item ${selectedCourseIds.includes(course.id) ? 'selected' : ''}`}
									>
										<input
											type="checkbox"
											checked={selectedCourseIds.includes(course.id)}
											onChange={(e) => {
												if (e.target.checked) {
													setSelectedCourseIds((prev) => [...prev, course.id]);
												} else {
													setSelectedCourseIds((prev) =>
														prev.filter((id) => id !== course.id)
													);
												}
											}}
										/>
										<span>{course.title}</span>
									</label>
								))
							)}
						</div>
					)}
					<div className="admin-users-modal-footer">
						<button type="button" className="lms-btn-secondary" onClick={onClose} disabled={loading}>
							Anulează
						</button>
						<button
							type="submit"
							className="lms-btn-primary"
							disabled={loading || isRestricted}
						>
							{loading ? 'Se salvează…' : 'Salvează'}
						</button>
					</div>
				</form>
			</div>
		</Modal>
	);
}

function SuspendModal({ member, onClose, onSave, loading }) {
	const [reason, setReason] = useState('');
	const [suspendedUntil, setSuspendedUntil] = useState('');

	const handleSubmit = (e) => {
		e.preventDefault();
		onSave(reason || null, suspendedUntil || null);
		onClose();
	};

	return (
		<Modal
			isOpen
			onClose={onClose}
			ariaLabelledby="staff-suspend-modal-title"
			className="admin-users-modal-overlay"
		>
			<div className="admin-users-modal">
				<div className="admin-users-modal-header">
					<h2 id="staff-suspend-modal-title" className="admin-users-modal-title">
						Suspendă — {member.name}
					</h2>
					<button type="button" className="admin-users-modal-close" onClick={onClose} aria-label="Închide">
						×
					</button>
				</div>
				<form onSubmit={handleSubmit} className="admin-users-modal-form">
					<div className="admin-form-group">
						<label className="admin-form-label" htmlFor="suspend-reason">
							Motiv (opțional)
						</label>
						<textarea
							id="suspend-reason"
							className="admin-form-input"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							rows={3}
						/>
					</div>
					<div className="admin-form-group">
						<label className="admin-form-label" htmlFor="suspend-until">
							Până la (opțional)
						</label>
						<input
							id="suspend-until"
							type="datetime-local"
							className="admin-form-input"
							value={suspendedUntil}
							onChange={(e) => setSuspendedUntil(e.target.value)}
						/>
					</div>
					<div className="admin-users-modal-footer">
						<button type="button" className="lms-btn-secondary" onClick={onClose} disabled={loading}>
							Anulează
						</button>
						<button type="submit" className="lms-btn-secondary va-btn-danger" disabled={loading}>
							{loading ? 'Se suspendă…' : 'Suspendă'}
						</button>
					</div>
				</form>
			</div>
		</Modal>
	);
}

export default AdminTeamMembersPage;
