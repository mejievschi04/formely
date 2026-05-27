import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../../services/api';
import { coursesService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { logger } from '../../utils/logger';
import ConfirmModal from '../../components/common/ConfirmModal';
import { toImageUrl } from '../../utils/imageUrl';
import { useAuth } from '../../contexts/AuthContext';
import { teamAccentNeutral as teamAccent } from '../../utils/teamAccent';

const AdminTeamMembersPage = () => {
	const navigate = useNavigate();
	const { canMutateInAdminArea } = useAuth();
	const { success: showSuccess, error: showError } = useToast();
	const [members, setMembers] = useState([]);
	const [courses, setCourses] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [filters, setFilters] = useState({
		role: 'all',
		status: 'all',
	});
	const [selectedMember, setSelectedMember] = useState(null);
	const [showRoleModal, setShowRoleModal] = useState(false);
	const [showCoursesModal, setShowCoursesModal] = useState(false);
	const [showSuspendModal, setShowSuspendModal] = useState(false);
	const [actionLoading, setActionLoading] = useState(null);
	const [removeMemberId, setRemoveMemberId] = useState(null);

	useEffect(() => {
		fetchTeamMembers();
		fetchCourses();
	}, [filters, searchQuery]);

	const fetchTeamMembers = async () => {
		try {
			setLoading(true);
			const params = {
				search: searchQuery || undefined,
				role: filters.role !== 'all' ? filters.role : undefined,
				status: filters.status !== 'all' ? filters.status : undefined,
			};
			const data = await adminService.getTeamMembers(params);
			setMembers(Array.isArray(data) ? data : (data.data || []));
		} catch (err) {
			console.error('Error fetching team members:', err);
			setError('Nu s-au putut încărca membrii echipei');
		} finally {
			setLoading(false);
		}
	};

	const fetchCourses = async () => {
		try {
			const data = await coursesService.getAll();
			setCourses(Array.isArray(data) ? data : []);
		} catch (err) {
			console.error('Error fetching courses:', err);
		}
	};

	const formatDate = (dateString) => {
		if (!dateString) return 'N/A';
		const date = new Date(dateString);
		return date.toLocaleDateString('ro-RO', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	};

	const getRoleLabel = (role) => {
		const labels = {
			admin: 'Administrator',
			instructor: 'Instructor',
			analyst: 'Analist',
		};
		return labels[role] || role;
	};

	const getRoleColor = (role) => {
		const colors = {
			admin: '#ef4444',
			instructor: '#10b981',
			analyst: '#6366f1',
		};
		return colors[role] || '#6b7280';
	};

	const getStatusBadge = (status) => {
		if (!status || status === 'active') {
			return { label: 'Activ', color: '#10b981' };
		}
		return { label: 'Suspendat', color: '#f97316' };
	};

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
			showSuccess('Acțiune realizată cu succes!');
		} catch (err) {
			logger.error(`Error ${action}:`, err);
			showError(err.response?.data?.message || `Eroare la ${action}`);
		} finally {
			setActionLoading(null);
		}
	};

	const handleConfirmRemoveMember = async () => {
		if (!removeMemberId) return;
		await handleQuickAction(removeMemberId, 'removeFromTeam');
		setRemoveMemberId(null);
	};

	const handleUpdateRole = async (memberId, role, permissions) => {
		setActionLoading(memberId);
		try {
			await adminService.updateRoleAndPermissions(memberId, role, permissions);
			await fetchTeamMembers();
			setShowRoleModal(false);
			setSelectedMember(null);
			showSuccess('Rol și permisiuni actualizate cu succes!');
		} catch (err) {
			logger.error('Error updating role:', err);
			showError(err.response?.data?.message || 'Eroare la actualizarea rolului');
		} finally {
			setActionLoading(null);
		}
	};

	const handleAssignCourses = async (memberId, courseIds) => {
		const target = members.find((member) => member.id === memberId);
		if (target && ['admin', 'analyst'].includes(target.role)) {
			showError('Nu atribuim cursuri pentru administrator sau analist.');
			return;
		}
		setActionLoading(memberId);
		try {
			await adminService.assignCourses(memberId, courseIds);
			await fetchTeamMembers();
			setShowCoursesModal(false);
			setSelectedMember(null);
			showSuccess('Cursuri atribuite cu succes!');
		} catch (err) {
			logger.error('Error assigning courses:', err);
			showError(err.response?.data?.message || 'Eroare la atribuirea cursurilor');
		} finally {
			setActionLoading(null);
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
					<h1 className="admin-page-title">Membri Echipă</h1>
					<p className="admin-page-subtitle">
						Gestionează membrii echipei interne: administratori, instructori și analiști
					</p>
				</div>
				{canMutateInAdminArea && (
				<button
					className="lms-btn-primary"
					onClick={() => navigate('/admin/users')}
				>
					+ Adaugă Membru
				</button>
				)}
			</div>

			{error && (
				<div className="lms-error-message">
					{error}
				</div>
			)}

			{/* Filters */}
			<div className="admin-team-members-filters">
				<input
					type="text"
					className="admin-team-members-search"
					placeholder="Caută după nume sau email..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
				/>
				<select
					className="admin-team-members-filter-select"
					value={filters.role}
					onChange={(e) => setFilters({ ...filters, role: e.target.value })}
				>
					<option value="all">Toate rolurile</option>
					<option value="admin">Admin</option>
					<option value="instructor">Instructor</option>
					<option value="analyst">Analist</option>
				</select>
				<select
					className="admin-team-members-filter-select"
					value={filters.status}
					onChange={(e) => setFilters({ ...filters, status: e.target.value })}
				>
					<option value="all">Toate statusurile</option>
					<option value="active">Activ</option>
					<option value="suspended">Suspendat</option>
				</select>
			</div>

			{/* Members List */}
			{members.length > 0 ? (
				<div className="admin-team-members-grid">
					{members.map((member) => {
						const statusBadge = getStatusBadge(member.status);
						const roleColor = getRoleColor(member.role);
						
						return (
							<div
								key={member.id}
								className="admin-team-member-card"
								onClick={() => navigate(`/admin/users/${member.id}`)}
							>
								<div className="admin-team-member-card-body">
									<div className="admin-team-member-card-content">
										{/* Avatar */}
										<div 
											className="admin-team-member-avatar"
											style={{ background: `linear-gradient(135deg, ${roleColor}, ${roleColor}dd)` }}
										>
											{member.avatar ? (
												<img 
													src={toImageUrl(member.avatar) || member.avatar} 
													alt={member.name}
													loading="lazy"
													decoding="async"
												/>
											) : (
												(member.name?.charAt(0) || 'U').toUpperCase()
											)}
										</div>

										{/* Member Info */}
										<div className="admin-team-member-info">
											<div className="admin-team-member-header">
												<div>
													<h3 className="admin-team-member-name">
														{member.name}
													</h3>
													<p className="admin-team-member-email">
														{member.email}
													</p>
												</div>
												<div className="admin-team-member-badges">
													<span 
														className="admin-team-member-role-badge"
														style={{ background: roleColor }}
													>
														{getRoleLabel(member.role)}
													</span>
													<span 
														className="admin-team-member-status-badge"
														style={{ background: statusBadge.color }}
													>
														{statusBadge.label}
													</span>
												</div>
											</div>

											{/* Additional Info */}
											<div className="admin-team-member-meta">
												<div className="admin-team-member-meta-item">
													<strong>Cursuri asignate:</strong>{' '}
													{member.assigned_courses_count || 0}
												</div>
												<div className="admin-team-member-meta-item admin-team-member-meta-item--teams">
													<strong>Echipe:</strong>
													{Array.isArray(member.teams) && member.teams.length > 0 ? (
														<div className="admin-users-team-chips" style={{ marginTop: 6 }}>
															{member.teams.map((t) => (
																<span key={t.id} className="admin-users-team-chip">
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
														<span className="admin-team-member-meta-muted"> —</span>
													)}
												</div>
												<div className="admin-team-member-meta-item">
													<strong>Ultima autentificare:</strong>{' '}
													{formatDate(member.last_login_at)}
												</div>
												{member.recent_activity && member.recent_activity.length > 0 && (
													<div className="admin-team-member-meta-item">
														<strong>Activitate recentă:</strong>{' '}
														{member.recent_activity.map((act, idx) => (
															<span key={idx}>
																{act.count} {act.label}
																{idx < member.recent_activity.length - 1 ? ', ' : ''}
															</span>
														))}
													</div>
												)}
											</div>
										</div>

										{/* Quick Actions */}
										{canMutateInAdminArea && (
										<div 
											className="admin-team-member-actions"
											onClick={(e) => e.stopPropagation()}
										>
											<button
												className="lms-btn-secondary lms-btn-sm admin-team-member-action-btn admin-team-member-action-btn-role"
												onClick={() => {
													setSelectedMember(member);
													setShowRoleModal(true);
												}}
												disabled={actionLoading === member.id}
											>
												✏️ Rol & Permisiuni
											</button>
											<button
												className="lms-btn-secondary lms-btn-sm admin-team-member-action-btn admin-team-member-action-btn-courses"
												onClick={() => {
													if (['admin', 'analyst'].includes(member.role)) {
														showError('Nu atribuim cursuri pentru administrator sau analist.');
														return;
													}
													setSelectedMember(member);
													setShowCoursesModal(true);
												}}
												disabled={actionLoading === member.id}
											>
												📚 Cursuri
											</button>
											{member.status === 'suspended' ? (
												<button
													className="lms-btn-secondary lms-btn-sm admin-team-member-action-btn admin-team-member-action-btn-activate"
													onClick={() => handleQuickAction(member.id, 'activate')}
													disabled={actionLoading === member.id}
												>
													✓ Activează
												</button>
											) : (
												<button
													className="lms-btn-secondary lms-btn-sm admin-team-member-action-btn admin-team-member-action-btn-suspend"
													onClick={() => {
														setSelectedMember(member);
														setShowSuspendModal(true);
													}}
													disabled={actionLoading === member.id}
												>
													⏸️ Suspendă
												</button>
											)}
											<button
												className="lms-btn-secondary lms-btn-sm admin-team-member-action-btn admin-team-member-action-btn-reset"
												onClick={() => handleQuickAction(member.id, 'resetAccess')}
												disabled={actionLoading === member.id}
											>
												🔑 Reset Acces
											</button>
											<button
												className="lms-btn-secondary lms-btn-sm admin-team-member-action-btn admin-team-member-action-btn-delete"
												onClick={() => setRemoveMemberId(member.id)}
												disabled={actionLoading === member.id}
											>
												🗑️ Elimină
											</button>
										</div>
										)}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<div className="lms-empty-state">
					<div className="lms-empty-icon">👥</div>
					<h3 className="lms-empty-title">Nu există membri</h3>
					<p className="lms-empty-description">
						Nu există membri ai echipei care să corespundă filtrelor selectate.
					</p>
				</div>
			)}

			{/* Role & Permissions Modal */}
			{showRoleModal && selectedMember && (
				<RolePermissionsModal
					key={selectedMember.id}
					member={selectedMember}
					onClose={() => {
						setShowRoleModal(false);
						setSelectedMember(null);
					}}
					onSave={handleUpdateRole}
					loading={actionLoading === selectedMember.id}
				/>
			)}

			{/* Courses Assignment Modal */}
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

			{/* Suspend Modal */}
			{showSuspendModal && selectedMember && (
				<SuspendModal
					member={selectedMember}
					onClose={() => {
						setShowSuspendModal(false);
						setSelectedMember(null);
					}}
					onSave={(reason, suspendedUntil) => handleQuickAction(selectedMember.id, 'suspend', { reason, suspendedUntil })}
					loading={actionLoading === selectedMember.id}
				/>
			)}

			<ConfirmModal
				open={!!removeMemberId}
				onClose={() => setRemoveMemberId(null)}
				onConfirm={handleConfirmRemoveMember}
				title="Elimină membru din echipă"
				message="Sigur dorești să elimini acest membru din echipă?"
				confirmLabel="Elimină"
				cancelLabel="Anulare"
				variant="danger"
				loading={actionLoading === removeMemberId}
			/>
		</div>
	);
};

// Role & Permissions Modal Component
const normalizeTeamRole = (r) => {
	if (r === 'teacher') return 'instructor';
	if (r === 'manager') return 'admin';
	if (['admin', 'instructor', 'analyst'].includes(r)) return r;
	return 'instructor';
};

const RolePermissionsModal = ({ member, onClose, onSave, loading }) => {
	const [role, setRole] = useState(() => normalizeTeamRole(member.role));
	const [permissions, setPermissions] = useState(member.permissions || {});

	const defaultPermissions = {
		can_manage_courses: false,
		can_manage_users: false,
		can_manage_events: false,
		can_view_analytics: false,
		can_manage_settings: false,
	};

	const currentPermissions = { ...defaultPermissions, ...permissions };

	const handlePermissionChange = (key, value) => {
		setPermissions({ ...currentPermissions, [key]: value });
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		onSave(member.id, role, permissions);
	};

	return (
		<div className="admin-team-members-modal-overlay" onClick={(e) => {
			if (e.target === e.currentTarget) onClose();
		}}>
			<div className="admin-team-members-modal" onClick={(e) => e.stopPropagation()}>
				<div className="admin-team-members-modal-header">
					<h2 className="admin-team-members-modal-title">Editare rol și permisiuni - {member.name}</h2>
					<button
						type="button"
						className="admin-team-members-modal-close"
						onClick={onClose}
					>
						×
					</button>
				</div>
				<div className="admin-team-members-modal-body">
					<form onSubmit={handleSubmit} className="admin-team-members-modal-form">
						<div className="admin-form-group">
							<label className="admin-form-label">Rol</label>
							<select
								className="admin-form-input"
								value={role}
								onChange={(e) => setRole(e.target.value)}
								required
							>
								<option value="admin">Admin</option>
								<option value="instructor">Instructor</option>
								<option value="analyst">Analist</option>
							</select>
						</div>

						<div className="admin-form-group">
							<label className="admin-form-label">Permisiuni</label>
							<div className="admin-team-members-permissions-list">
								{Object.keys(defaultPermissions).map((key) => (
									<label key={key} className="admin-team-members-permission-item">
										<input
											type="checkbox"
											checked={currentPermissions[key] || false}
											onChange={(e) => handlePermissionChange(key, e.target.checked)}
										/>
										<span>
											{key.replace(/_/g, ' ').replace(/can /g, '')}
										</span>
									</label>
								))}
							</div>
						</div>

						<div className="admin-team-members-modal-footer">
							<button type="button" className="lms-btn-secondary" onClick={onClose} disabled={loading}>
								Anulează
							</button>
							<button type="submit" className="lms-btn-primary" disabled={loading}>
								{loading ? 'Se salvează...' : 'Salvează'}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
};

// Courses Assignment Modal Component
const CoursesAssignmentModal = ({ member, courses, onClose, onSave, loading }) => {
	const [selectedCourseIds, setSelectedCourseIds] = useState(
		member.assignedCourses?.map(c => c.id) || []
	);
	const isAssignmentRestricted = ['admin', 'analyst'].includes(member.role);

	const handleSubmit = (e) => {
		e.preventDefault();
		onSave(member.id, selectedCourseIds);
	};

	return (
		<div className="admin-team-members-modal-overlay" onClick={(e) => {
			if (e.target === e.currentTarget) onClose();
		}}>
			<div className="admin-team-members-modal" onClick={(e) => e.stopPropagation()}>
				<div className="admin-team-members-modal-header">
					<h2 className="admin-team-members-modal-title">Atribuie Cursuri - {member.name}</h2>
					<button
						type="button"
						className="admin-team-members-modal-close"
						onClick={onClose}
					>
						×
					</button>
				</div>
				<div className="admin-team-members-modal-body">
					<form onSubmit={handleSubmit} className="admin-team-members-modal-form">
						<div className="admin-form-group">
							<label className="admin-form-label">Selectează Cursuri</label>
							{isAssignmentRestricted && (
								<p className="admin-form-hint">
									Acest rol nu primește atribuiri de cursuri, teste sau examene.
								</p>
							)}
							<div className="admin-team-members-courses-list">
								{courses.map((course) => (
									<label 
										key={course.id} 
										className={`admin-team-members-course-item ${selectedCourseIds.includes(course.id) ? 'selected' : ''} ${isAssignmentRestricted ? 'is-disabled' : ''}`}
									>
										<input
											type="checkbox"
											checked={selectedCourseIds.includes(course.id)}
											disabled={isAssignmentRestricted}
											onChange={(e) => {
												if (e.target.checked) {
													setSelectedCourseIds([...selectedCourseIds, course.id]);
												} else {
													setSelectedCourseIds(selectedCourseIds.filter(id => id !== course.id));
												}
											}}
										/>
										<span>{course.title}</span>
									</label>
								))}
							</div>
						</div>
						<div className="admin-team-members-modal-footer">
							<button type="button" className="lms-btn-secondary" onClick={onClose} disabled={loading}>
								Anulează
							</button>
							<button type="submit" className="lms-btn-primary" disabled={loading || isAssignmentRestricted}>
								{loading ? 'Se salvează...' : isAssignmentRestricted ? 'Nu este permis' : 'Salvează'}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
};

// Suspend Modal Component
const SuspendModal = ({ member, onClose, onSave, loading }) => {
	const [reason, setReason] = useState('');
	const [suspendedUntil, setSuspendedUntil] = useState('');

	const handleSubmit = (e) => {
		e.preventDefault();
		onSave(reason || null, suspendedUntil || null);
	};

	return (
		<div className="admin-team-members-modal-overlay" onClick={(e) => {
			if (e.target === e.currentTarget) onClose();
		}}>
			<div className="admin-team-members-modal" onClick={(e) => e.stopPropagation()}>
				<div className="admin-team-members-modal-header">
					<h2 className="admin-team-members-modal-title">Suspendă Membru - {member.name}</h2>
					<button
						type="button"
						className="admin-team-members-modal-close"
						onClick={onClose}
					>
						×
					</button>
				</div>
				<div className="admin-team-members-modal-body">
					<form onSubmit={handleSubmit} className="admin-team-members-modal-form">
						<div className="admin-form-group">
							<label className="admin-form-label">Motiv (opțional)</label>
							<textarea
								className="admin-form-input"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								rows={3}
								placeholder="Motiv scurt"
							/>
						</div>
						<div className="admin-form-group">
							<label className="admin-form-label">Suspendat până la (opțional)</label>
							<input
								type="datetime-local"
								className="admin-form-input"
								value={suspendedUntil}
								onChange={(e) => setSuspendedUntil(e.target.value)}
							/>
						</div>
						<div className="admin-team-members-modal-footer">
							<button type="button" className="lms-btn-secondary" onClick={onClose} disabled={loading}>
								Anulează
							</button>
							<button type="submit" className="lms-btn-secondary admin-team-members-suspend-btn" disabled={loading}>
								{loading ? 'Se suspendă...' : 'Suspendă'}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
};

export default AdminTeamMembersPage;
