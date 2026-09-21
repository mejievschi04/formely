import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
	ArrowCounterClockwise,
	Check,
	EnvelopeSimple,
	PencilSimple,
	Plus,
	Trash,
	UsersThree,
	X,
} from '@phosphor-icons/react';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { logger } from '../../utils/logger';
import { toImageUrl } from '../../utils/imageUrl';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import AdminUserInvitationsPanel from '../../components/admin/users/AdminUserInvitationsPanel';
import { useAuth } from '../../contexts/AuthContext';
import { teamAccentNeutral as teamAccent } from '../../utils/teamAccent';
import { canAssignAnalyst, seatSummary, formatSeatCap } from '../../utils/entitlements';
import {
	ASSIGNABLE_ROLES,
	STAFF_ADMIN_ROLES,
	getRoleLabel,
	isStaffAdminRole,
} from '../../constants/staffRoles';

const STAFF_ROLE_OPTIONS = STAFF_ADMIN_ROLES.map((value) => ({
	value,
	label: getRoleLabel(value),
}));

const ICON = 18;

function UserActionIconButton({ label, onClick, variant = 'default', children }) {
	return (
		<button
			type="button"
			className={`admin-users-icon-btn${variant === 'danger' ? ' admin-users-icon-btn--danger' : ''}${variant === 'success' ? ' admin-users-icon-btn--success' : ''}`}
			onClick={onClick}
			title={label}
			aria-label={label}
		>
			{children}
		</button>
	);
}

function UserTableActions({
	user,
	usersView,
	onApprove,
	onReject,
	onEdit,
	onTrash,
	onRestore,
	onForceDelete,
}) {
	const status = user.status || 'active';

	if (usersView === 'trash') {
		return (
			<div className="admin-users-action-bar" role="group" aria-label="Acțiuni coș">
				<UserActionIconButton
					label="Restabilește utilizatorul"
					variant="success"
					onClick={(e) => {
						e.stopPropagation();
						onRestore(user.id);
					}}
				>
					<ArrowCounterClockwise size={ICON} weight="bold" aria-hidden />
				</UserActionIconButton>
				<UserActionIconButton
					label="Șterge definitiv"
					variant="danger"
					onClick={(e) => {
						e.stopPropagation();
						onForceDelete(user);
					}}
				>
					<Trash size={ICON} weight="bold" aria-hidden />
				</UserActionIconButton>
			</div>
		);
	}

	if (status === 'pending') {
		return (
			<div className="admin-users-action-bar" role="group" aria-label="Acțiuni cerere">
				<UserActionIconButton
					label="Aprobă cererea"
					variant="success"
					onClick={(e) => {
						e.stopPropagation();
						onApprove(user.id);
					}}
				>
					<Check size={ICON} weight="bold" aria-hidden />
				</UserActionIconButton>
				<UserActionIconButton
					label="Respinge cererea"
					variant="danger"
					onClick={(e) => {
						e.stopPropagation();
						onReject(user.id);
					}}
				>
					<X size={ICON} weight="bold" aria-hidden />
				</UserActionIconButton>
			</div>
		);
	}

	return (
		<div className="admin-users-action-bar" role="group" aria-label="Acțiuni utilizator">
			<UserActionIconButton
				label="Editează"
				onClick={(e) => {
					e.stopPropagation();
					onEdit(user);
				}}
			>
				<PencilSimple size={ICON} weight="bold" aria-hidden />
			</UserActionIconButton>
			<UserActionIconButton
				label="Mută în coș"
				variant="danger"
				onClick={(e) => {
					e.stopPropagation();
					onTrash(user.id);
				}}
			>
				<Trash size={ICON} weight="bold" aria-hidden />
			</UserActionIconButton>
		</div>
	);
}

const AdminUsersPage = () => {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const audienceTab = searchParams.get('tab') === 'staff' ? 'staff' : 'users';
	const { canMutateInAdminArea, user } = useAuth();
	const seats = seatSummary(user);
	const { success: showSuccess, error: showError } = useToast();
	const [users, setUsers] = useState([]);
	const [teams, setTeams] = useState([]);
	const [filteredUsers, setFilteredUsers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [showModal, setShowModal] = useState(false);
	const [editingUser, setEditingUser] = useState(null);
	const [sortBy, setSortBy] = useState('role');
	const [sortOrder, setSortOrder] = useState('asc');
	const [roleFilter, setRoleFilter] = useState('all');
	const [statusFilter, setStatusFilter] = useState('all');
	const [searchQuery, setSearchQuery] = useState('');
	const [usersView, setUsersView] = useState('active'); // 'active' | 'trash' | 'invitations'
	const [inviteModalOpen, setInviteModalOpen] = useState(false);
	const [confirmAction, setConfirmAction] = useState(null); // { type: 'trash'|'reject'|'forceDelete', userId, userName? }
	const [confirmLoading, setConfirmLoading] = useState(false);
	const [formData, setFormData] = useState({
		name: '',
		job_title: '',
		email: '',
		password: '',
		role: 'student',
		bio: '',
		team_id: '',
	});

	useEffect(() => {
		fetchTeams();
	}, []);

	useEffect(() => {
		if (usersView === 'invitations') return;
		fetchUsers();
	}, [statusFilter, usersView, searchQuery, audienceTab]);

	useEffect(() => {
		if (audienceTab === 'staff' && !['all', ...STAFF_ADMIN_ROLES].includes(roleFilter)) {
			setRoleFilter('all');
		}
		if (audienceTab === 'users' && isStaffAdminRole(roleFilter)) {
			setRoleFilter('all');
		}
	}, [audienceTab, roleFilter]);

	useEffect(() => {
		applyFiltersAndSort();
	}, [users, sortBy, sortOrder, roleFilter, audienceTab]);

	const setAudienceTab = (tab) => {
		const next = new URLSearchParams(searchParams);
		if (tab === 'staff') {
			next.set('tab', 'staff');
		} else {
			next.delete('tab');
		}
		setSearchParams(next, { replace: true });
	};

	const roleFilterOptions = useMemo(() => {
		if (audienceTab === 'staff') {
			return [{ value: 'all', label: 'Toate rolurile de personal' }, ...STAFF_ROLE_OPTIONS];
		}
		return [
			{ value: 'all', label: 'Toți cursanții' },
			{ value: 'employee', label: getRoleLabel('employee') },
			{ value: 'student', label: `${getRoleLabel('student')} (cont vechi)` },
		];
	}, [audienceTab]);

	const modalRoleOptions = useMemo(() => {
		const base = audienceTab === 'staff'
			? ASSIGNABLE_ROLES.filter((r) => isStaffAdminRole(r.value))
			: ASSIGNABLE_ROLES.filter((r) => !isStaffAdminRole(r.value));
		return base.filter((r) => r.value !== 'analyst' || canAssignAnalyst(user));
	}, [audienceTab, user]);

	const fetchUsers = async () => {
		try {
			setLoading(true);
			const params = {};
			if (statusFilter !== 'all') params.status = statusFilter;
			if (searchQuery.trim()) params.search = searchQuery.trim();
			if (usersView === 'trash') params.trashed = 1;
			params.per_page = 100;
			if (audienceTab === 'staff') {
				params.team_members_only = 1;
			} else {
				params.learners_only = 1;
			}
			const data = await adminService.getUsers(params);
			setUsers(Array.isArray(data) ? data : []);
		} catch (err) {
			console.error('Error fetching users:', err);
			setError('Nu s-au putut încărca utilizatorii');
		} finally {
			setLoading(false);
		}
	};

	const fetchTeams = async () => {
		try {
			const data = await adminService.getTeams();
			setTeams(Array.isArray(data) ? data : (data.data || []));
		} catch (err) {
			console.error('Error fetching teams:', err);
		}
	};

	const applyFiltersAndSort = () => {
		let filtered = [...users];

		if (audienceTab === 'staff') {
			filtered = filtered.filter((user) => isStaffAdminRole(user.role));
		} else {
			filtered = filtered.filter((user) => !isStaffAdminRole(user.role));
		}

		// Filter by role
		if (roleFilter !== 'all') {
			filtered = filtered.filter(user => user.role === roleFilter);
		}

		// Filter by status (pending = cereri în așteptare)
		if (statusFilter !== 'all') {
			filtered = filtered.filter(user => (user.status || 'active') === statusFilter);
		}

		// Sort
		filtered.sort((a, b) => {
			let aValue, bValue;

			switch (sortBy) {
				case 'team':
					// Use first team name alphabetically or empty string if none
					aValue = Array.isArray(a.teams) && a.teams.length > 0
						? [...a.teams].map(t => (t?.name || '').toLowerCase()).sort()[0] || ''
						: '';
					bValue = Array.isArray(b.teams) && b.teams.length > 0
						? [...b.teams].map(t => (t?.name || '').toLowerCase()).sort()[0] || ''
						: '';
					break;
				case 'role':
					aValue = a.role;
					bValue = b.role;
					break;
				case 'name':
					aValue = a.name.toLowerCase();
					bValue = b.name.toLowerCase();
					break;
				case 'email':
					aValue = a.email.toLowerCase();
					bValue = b.email.toLowerCase();
					break;
				default:
					return 0;
			}

			if (sortOrder === 'asc') {
				return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
			} else {
				return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
			}
		});

		setFilteredUsers(filtered);
	};

	const handleSort = (field) => {
		if (sortBy === field) {
			setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
		} else {
			setSortBy(field);
			setSortOrder('asc');
		}
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		try {
			const dataToSend = { ...formData };
			if (!dataToSend.password || dataToSend.password === '') {
				delete dataToSend.password;
			}

			if (editingUser) {
				// Do not change team on update in this flow
				delete dataToSend.team_id;
				await adminService.updateUser(editingUser.id, dataToSend);
			} else {
				// Parola nu este obligatorie - va fi setată automat la "formely2025" în backend
				await adminService.createUser(dataToSend);
			}

			setShowModal(false);
			setEditingUser(null);
			setFormData({ name: '', job_title: '', email: '', password: '', role: 'student', bio: '', team_id: '' });
			fetchUsers();
		} catch (err) {
			logger.error('Error saving user:', err);
			const data = err.response?.data;
			let msg = data?.message || err.message;
			if (data?.errors && typeof data.errors === 'object') {
				const parts = Object.entries(data.errors).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map(m => `${k}: ${m}`));
				if (parts.length > 0) msg = parts.join(parts.length > 1 ? '; ' : '');
			}
			showError('Eroare la salvarea utilizatorului: ' + (msg || 'Eroare necunoscută'));
		}
	};

	const normalizeFormRole = (r) => {
		if (r === 'teacher') return 'instructor';
		if (r === 'manager') return 'student';
		return r;
	};

	const handleEdit = (user) => {
		setEditingUser(user);
		setFormData({
			name: user.name,
			job_title: user.job_title || '',
			email: user.email,
			password: '',
			role: normalizeFormRole(user.role),
			bio: user.bio || '',
			team_id: (Array.isArray(user.teams) && user.teams[0]?.id) || '',
		});
		setShowModal(true);
	};

	const handleDeleteClick = (id) => {
		setConfirmAction({ type: 'trash', userId: id });
	};

	const handleForceDeleteClick = (user) => {
		setConfirmAction({ type: 'forceDelete', userId: user.id, userName: user.name });
	};

	const handleConfirmForceDelete = async () => {
		if (!confirmAction?.userId || confirmAction?.type !== 'forceDelete') return;
		setConfirmLoading(true);
		try {
			await adminService.forceDeleteUser(confirmAction.userId);
			showSuccess('Utilizator șters definitiv');
			setConfirmAction(null);
			fetchUsers();
		} catch (err) {
			logger.error('Error force deleting user:', err);
			showError(err.response?.data?.message || 'Eroare la ștergerea definitivă');
		} finally {
			setConfirmLoading(false);
		}
	};

	const handleConfirmDelete = async () => {
		if (!confirmAction?.userId) return;
		setConfirmLoading(true);
		try {
			await adminService.deleteUser(confirmAction.userId);
			showSuccess('Utilizator mutat în coș și dezactivat');
			setConfirmAction(null);
			fetchUsers();
		} catch (err) {
			logger.error('Error deleting user:', err);
			showError('Eroare: ' + (err.response?.data?.message || err.message));
		} finally {
			setConfirmLoading(false);
		}
	};

	const handleRestore = async (id) => {
		try {
			await adminService.restoreUser(id);
			showSuccess('Utilizator restabilit și reactivat');
			fetchUsers();
		} catch (err) {
			logger.error('Error restoring user:', err);
			showError('Eroare la restabilire: ' + (err.response?.data?.message || err.message));
		}
	};

	const handleApprove = async (id) => {
		try {
			await adminService.approveUser(id);
			showSuccess('Cererea a fost aprobată');
			fetchUsers();
		} catch (err) {
			logger.error('Error approving user:', err);
			showError('Eroare la aprobare: ' + (err.response?.data?.message || err.message));
		}
	};

	const handleRejectClick = (id) => {
		setConfirmAction({ type: 'reject', userId: id });
	};

	const handleConfirmReject = async () => {
		if (!confirmAction?.userId || confirmAction?.type !== 'reject') return;
		setConfirmLoading(true);
		try {
			await adminService.rejectUser(confirmAction.userId);
			showSuccess('Cererea a fost respinsă');
			setConfirmAction(null);
			fetchUsers();
		} catch (err) {
			logger.error('Error rejecting user:', err);
			showError('Eroare la respingere: ' + (err.response?.data?.message || err.message));
		} finally {
			setConfirmLoading(false);
		}
	};

	const getStatusBadge = (status, inTrash = false) => {
		if (inTrash) {
			return (
				<span className="admin-users-status-badge admin-users-status-inactive" title="Cont în coș — fără acces">
					În coș
				</span>
			);
		}
		const s = status || 'active';
		if (s === 'pending') {
			return (
				<span className="admin-users-status-badge admin-users-status-pending" title="Cerere în așteptare">
					În așteptare
				</span>
			);
		}
		return null;
	};


	if (loading && usersView !== 'invitations') {
		return (
			<div className="admin-container">
				<div className="lms-dashboard-loading">
					<div className="lms-spinner"></div>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-container admin-container--wide">
			<div className="admin-page-header">
				<div className="admin-page-header-content">
					<h1 className="admin-page-title">Gestionare Utilizatori</h1>
					<p className="admin-page-subtitle">
						{usersView === 'invitations'
							? 'Invită colegi în Formely pe email și urmărește statusul trimiterii.'
							: 'Conturi, roluri și acces în organizația ta Formely.'}
					</p>
					{seats && (
						<p className="admin-users-seats" aria-label="Locuri plan">
							{seats.planLabel ? `${seats.planLabel} · ` : ''}
							Cursanți {seats.learnersUsed}/{formatSeatCap(seats.learnersMax)}
							{' · '}
							Staff {seats.staffUsed}/{formatSeatCap(seats.staffMax)}
						</p>
					)}
				</div>
				{usersView === 'invitations' && canMutateInAdminArea && (
					<div className="admin-page-header-actions">
						<button
							type="button"
							className="lms-btn-primary"
							onClick={() => setInviteModalOpen(true)}
						>
							<EnvelopeSimple size={16} weight="duotone" aria-hidden />
							Invitație nouă
						</button>
					</div>
				)}
				{usersView === 'active' && canMutateInAdminArea && (
					<div className="admin-page-header-actions">
						<button
							type="button"
							className="lms-btn-secondary"
							onClick={() => {
								setUsersView('invitations');
								setInviteModalOpen(true);
							}}
						>
							<EnvelopeSimple size={16} weight="bold" aria-hidden /> Invită
						</button>
						<button
							type="button"
							className="lms-btn-primary"
							onClick={() => {
								setEditingUser(null);
								setFormData({
									name: '',
									job_title: '',
									email: '',
									password: '',
									role: audienceTab === 'staff' ? 'hr_admin' : 'employee',
									bio: '',
									team_id: '',
								});
								setShowModal(true);
							}}
						>
							<Plus size={16} weight="bold" aria-hidden />
							{audienceTab === 'staff' ? 'Adaugă personal' : 'Adaugă utilizator'}
						</button>
					</div>
				)}
			</div>

			{error && (
				<div className="lms-error-message">
					{error}
				</div>
			)}

			{/* View toggle: Utilizatori | Personal | Coș */}
			<nav className="admin-users-view-tabs" aria-label="Segment listă utilizatori">
				<button
					type="button"
					className={`admin-users-view-tab ${usersView === 'active' && audienceTab === 'users' ? 'active' : ''}`}
					onClick={() => {
						setUsersView('active');
						setAudienceTab('users');
					}}
				>
					Utilizatori
				</button>
				<button
					type="button"
					className={`admin-users-view-tab ${usersView === 'active' && audienceTab === 'staff' ? 'active' : ''}`}
					onClick={() => {
						setUsersView('active');
						setAudienceTab('staff');
					}}
				>
					Personal
				</button>
				{canMutateInAdminArea && (
					<button
						type="button"
						className={`admin-users-view-tab ${usersView === 'invitations' ? 'active' : ''}`}
						onClick={() => setUsersView('invitations')}
					>
						<EnvelopeSimple size={16} weight="duotone" aria-hidden />
						Invitații
					</button>
				)}
				{canMutateInAdminArea && (
					<button
						type="button"
						className={`admin-users-view-tab ${usersView === 'trash' ? 'active' : ''}`}
						onClick={() => {
							setUsersView('trash');
							if (statusFilter !== 'all' && statusFilter !== 'pending' && statusFilter !== 'active') {
								setStatusFilter('all');
							}
						}}
					>
						Coș
					</button>
				)}
			</nav>

			{usersView === 'invitations' && canMutateInAdminArea ? (
				<AdminUserInvitationsPanel
					teams={teams}
					modalOpen={inviteModalOpen}
					onModalOpenChange={setInviteModalOpen}
				/>
			) : (
			<>
			{audienceTab === 'staff' && usersView === 'active' && (
				<p className="admin-users-audience-hint">
					Structura departamente și echipe se gestionează din{' '}
					<button type="button" className="admin-staff-inline-link" onClick={() => navigate('/admin/teams')}>
						Organizație
					</button>
					.
				</p>
			)}

			{usersView === 'trash' && (
				<p className="admin-users-audience-hint admin-users-trash-hint">
					În coș conturile sunt dezactivate (fără autentificare). Poți restabili sau șterge definitiv — aceasta din urmă este ireversibilă.
				</p>
			)}

			{/* Căutare și filtre */}
			<div className="admin-users-filters">
				<div className="admin-users-search-wrap">
					<input
						type="text"
						className="admin-users-search-input"
						placeholder="Caută după nume, email sau funcție..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						aria-label="Caută utilizatori"
					/>
				</div>
				<div className="admin-users-filter-group">
					<label className="admin-users-filter-label">Cereri / Status:</label>
					<select
						className="admin-users-filter-select"
						value={statusFilter}
						onChange={(e) => setStatusFilter(e.target.value)}
						disabled={usersView === 'trash'}
					>
						<option value="all">Toți utilizatorii</option>
						<option value="pending">Cereri în așteptare</option>
						<option value="active">Activi</option>
					</select>
				</div>
				<div className="admin-users-filter-group">
					<label className="admin-users-filter-label">Filtrează după rol:</label>
					<select
						className="admin-users-filter-select"
						value={roleFilter}
						onChange={(e) => setRoleFilter(e.target.value)}
					>
						{roleFilterOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Table */}
			<div className="admin-users-table-wrapper">
				<table className="admin-users-table">
					<thead>
						<tr>
							<th className={`sortable ${sortBy === 'name' ? (sortOrder === 'asc' ? 'sort-asc' : 'sort-desc') : ''}`} onClick={() => handleSort('name')}>
								Utilizator
							</th>
							<th className={`sortable ${sortBy === 'email' ? (sortOrder === 'asc' ? 'sort-asc' : 'sort-desc') : ''}`} onClick={() => handleSort('email')}>
								Email
							</th>
							<th className={`sortable ${sortBy === 'role' ? (sortOrder === 'asc' ? 'sort-asc' : 'sort-desc') : ''}`} onClick={() => handleSort('role')}>
								Rol
							</th>
							<th className={`sortable ${sortBy === 'team' ? (sortOrder === 'asc' ? 'sort-asc' : 'sort-desc') : ''}`} onClick={() => handleSort('team')}>
								Echipă
							</th>
							<th>Cursuri Finalizate</th>
							<th>Module Finalizate</th>
							<th>Procentaj</th>
							<th className="admin-users-col-actions">Acțiuni</th>
						</tr>
					</thead>
					<tbody>
						{filteredUsers.length > 0 ? (
							filteredUsers.map((user) => {
								const isAdmin = ['admin', 'company_owner'].includes(user.role);
								const totalCourses = user.total_courses || 0;
								const completedCourses = user.completed_courses || 0;
								const totalModules = user.total_modules || 0;
								const completedModules = user.completed_modules || 0;
								const percentage = user.completion_percentage || 0;
								const progressClass = percentage >= 80 ? 'high' : percentage >= 50 ? 'medium' : 'low';
								const initials = user.name?.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || 'U';
								
								return (
									<tr
										key={user.id}
										onClick={() => usersView === 'active' && navigate(`/admin/users/${user.id}/profile`)}
										className={usersView === 'trash' ? 'admin-users-row-trash' : ''}
									>
										<td>
											<div className="admin-users-table-cell-user">
												<div className="admin-users-table-avatar">
													{user.avatar ? (
														<img src={toImageUrl(user.avatar) || user.avatar} alt={user.name} loading="lazy" decoding="async" />
													) : (
														initials
													)}
												</div>
												<div>
													<div className="admin-users-table-cell-name">{user.name}</div>
													{user.job_title && (
														<div className="admin-users-table-cell-job-title">{user.job_title}</div>
													)}
													{user.bio && (
														<div className="admin-users-table-cell-bio">
															{user.bio.substring(0, 50)}{user.bio.length > 50 ? '...' : ''}
														</div>
													)}
												</div>
											</div>
										</td>
										<td className="admin-users-table-cell-email">{user.email}</td>
										<td>
											<span className={`admin-users-role-badge ${user.role}`}>
												{getRoleLabel(user.role)}
											</span>
											{getStatusBadge(user.status, usersView === 'trash')}
										</td>
										<td>
											{Array.isArray(user.teams) && user.teams.length > 0 ? (
												<div className="admin-users-team-chips">
													{user.teams.filter((t) => t?.name).map((t) => (
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
											{isAdmin ? (
												<span className="admin-users-table-cell-muted">-</span>
											) : (
												<span className="admin-users-table-cell-value">
													{completedCourses}/{totalCourses}
												</span>
											)}
										</td>
										<td>
											{isAdmin ? (
												<span className="admin-users-table-cell-muted">-</span>
											) : (
												<span className="admin-users-table-cell-value">
													{completedModules}/{totalModules}
												</span>
											)}
										</td>
										<td>
											{isAdmin ? (
												<span className="admin-users-table-cell-muted">-</span>
											) : (
												<div className="admin-users-progress-container">
													<div className="admin-users-progress-bar">
														<div
															className={`admin-users-progress-fill ${progressClass}`}
															style={{ width: `${percentage}%` }}
														/>
													</div>
													<span className={`admin-users-progress-text ${progressClass}`}>
														{percentage}%
													</span>
												</div>
											)}
										</td>
										<td className="admin-users-col-actions">
											{!canMutateInAdminArea ? (
												<span className="admin-users-table-cell-muted">—</span>
											) : (
												<div onClick={(e) => e.stopPropagation()}>
													<UserTableActions
														user={user}
														usersView={usersView}
														onApprove={handleApprove}
														onReject={handleRejectClick}
														onEdit={handleEdit}
														onTrash={handleDeleteClick}
														onRestore={handleRestore}
														onForceDelete={handleForceDeleteClick}
													/>
												</div>
											)}
										</td>
									</tr>
								);
							})
						) : (
							<tr>
								<td colSpan="8" className="admin-users-empty">
									<div className="lms-empty-state">
										<div className="lms-empty-icon">
											<UsersThree size={26} weight="duotone" aria-hidden />
										</div>
										<h3 className="lms-empty-title">
											{audienceTab === 'staff' ? 'Niciun membru al personalului' : 'Niciun utilizator'}
										</h3>
										<p className="lms-empty-description">
											{audienceTab === 'staff'
												? 'Nu există membri ai personalului care să corespundă filtrelor selectate.'
												: 'Nu există cursanți care să corespundă filtrelor selectate.'}
										</p>
									</div>
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
			</>

			)}

			{/* Modal – componentă accesibilă (focus trap, Escape, ARIA) */}
			<Modal
				isOpen={showModal}
				onClose={() => setShowModal(false)}
				ariaLabelledby="admin-users-modal-title"
				closeOnBackdropClick
				className="admin-users-modal-overlay"
			>
				<div className="admin-users-modal">
					<div className="admin-users-modal-header">
						<h2 id="admin-users-modal-title" className="admin-users-modal-title">
							{editingUser
								? audienceTab === 'staff'
									? 'Editează membru personal'
									: 'Editează utilizator'
								: audienceTab === 'staff'
									? 'Adaugă membru personal'
									: 'Adaugă utilizator nou'}
						</h2>
						<button
							type="button"
							className="admin-users-modal-close"
							onClick={() => setShowModal(false)}
							title="Închide"
							aria-label="Închide"
						>
							<X size={18} weight="bold" aria-hidden />
						</button>
					</div>
						<div className="admin-users-modal-body">
							<form onSubmit={handleSubmit} className="admin-users-modal-form">
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
									<label className="admin-form-label">Funcție</label>
									<input
										type="text"
										className="admin-form-input"
										value={formData.job_title}
										onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
										placeholder="ex. Manager vânzări"
									/>
								</div>
								<div className="admin-form-group">
									<label className="admin-form-label">Echipă</label>
									{editingUser ? (
										<>
											{Array.isArray(editingUser.teams) && editingUser.teams.length > 0 ? (
												<div className="admin-users-team-chips admin-users-team-chips--readonly">
													{editingUser.teams.filter((t) => t?.name).map((t) => (
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
												<p className="admin-users-table-cell-muted" style={{ margin: 0 }}>Fără echipă</p>
											)}
											<p className="admin-form-hint" style={{ marginTop: 8, marginBottom: 0 }}>
												Echipa se modifică din pagina <strong>Echipe</strong> (atașare membri).
											</p>
										</>
									) : (
										<>
											<select
												className="admin-form-input"
												value={formData.team_id}
												onChange={(e) => setFormData({ ...formData, team_id: e.target.value })}
												aria-label="Echipă la creare utilizator"
											>
												<option value="">Fără echipă</option>
												{teams.map((team) => (
													<option key={team.id} value={team.id}>{team.name}</option>
												))}
											</select>
											{formData.team_id ? (
												<div className="admin-users-team-select-preview">
													{(() => {
														const t = teams.find((x) => String(x.id) === String(formData.team_id));
														if (!t) return null;
														return (
															<>
																<span
																	className="admin-users-team-swatch admin-users-team-swatch--lg"
																	style={{ background: teamAccent(t) }}
																	aria-hidden
																/>
																<span className="admin-users-team-select-preview-label">Echipă selectată: {t.name}</span>
															</>
														);
													})()}
												</div>
											) : null}
											<p className="admin-form-hint" style={{ marginTop: 8, marginBottom: 0 }}>
												{formData.team_id
													? 'Utilizatorul va fi asociat echipei alese la creare (poți lăsa gol).'
													: 'Opțional — utilizatorul poate fi adăugat într-o echipă din pagina Echipe.'}
											</p>
										</>
									)}
								</div>
								<div className="admin-form-group">
									<label className="admin-form-label">Email</label>
									<input
										type="email"
										className="admin-form-input"
										value={formData.email}
										onChange={(e) => setFormData({ ...formData, email: e.target.value })}
										required
									/>
								</div>
								<div className="admin-form-group">
									<label className="admin-form-label">
										Parolă {!editingUser ? <span className="admin-form-label-hint">(opțională)</span> : <span className="admin-form-label-hint">(lasă gol pentru a nu schimba)</span>}
									</label>
									<input
										type="password"
										className="admin-form-input"
										value={formData.password}
										onChange={(e) => setFormData({ ...formData, password: e.target.value })}
										placeholder={!editingUser ? 'Lasă gol pentru parola implicită: formely2025' : 'Lasă gol pentru a păstra parola actuală'}
										minLength={formData.password ? 6 : undefined}
									/>
								</div>
								<div className="admin-form-group">
									<label className="admin-form-label">Rol</label>
									<select
										className="admin-form-input"
										value={formData.role}
										onChange={(e) => setFormData({ ...formData, role: e.target.value })}
										required
									>
										{modalRoleOptions.map((r) => (
											<option key={r.value} value={r.value}>
												{r.label}
											</option>
										))}
									</select>
								</div>
								{!editingUser && (
									<div className="admin-form-group" style={{ gridColumn: '1 / -1' }}>
										<p className="admin-form-hint">
											Dacă nu specifici o parolă, utilizatorul va primi automat parola: <strong>formely2025</strong> și va trebui să o schimbe la prima autentificare.
										</p>
									</div>
								)}
								<div className="admin-users-modal-footer">
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
			</Modal>

			<ConfirmModal
				open={!!confirmAction}
				onClose={() => setConfirmAction(null)}
				onConfirm={
					confirmAction?.type === 'reject'
						? handleConfirmReject
						: confirmAction?.type === 'forceDelete'
							? handleConfirmForceDelete
							: handleConfirmDelete
				}
				title={
					confirmAction?.type === 'reject'
						? 'Respinge cerere'
						: confirmAction?.type === 'forceDelete'
							? 'Ștergere definitivă'
							: 'Mutare în coș'
				}
				message={
					confirmAction?.type === 'reject'
						? 'Sigur dorești să respingi această cerere? Utilizatorul va fi șters.'
						: confirmAction?.type === 'forceDelete'
							? `Sigur dorești ștergerea definitivă${confirmAction?.userName ? ` a utilizatorului „${confirmAction.userName}"` : ' a acestui utilizator'}? Acțiunea nu poate fi anulată.`
							: 'Utilizatorul va fi mutat în coș, contul va fi dezactivat și poate fi restabilit ulterior. Continuă?'
				}
				confirmLabel={
					confirmAction?.type === 'reject'
						? 'Respinge'
						: confirmAction?.type === 'forceDelete'
							? 'Șterge definitiv'
							: 'Mută în coș'
				}
				cancelLabel="Anulare"
				variant="danger"
				loading={confirmLoading}
			/>
		</div>
	);
};

export default AdminUsersPage;
