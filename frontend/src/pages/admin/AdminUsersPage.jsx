import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PencilSimple, Plus, Trash, UsersThree, X, EnvelopeSimple, ArrowCounterClockwise, Check } from '@phosphor-icons/react';
import AdminUserInvitationsPanel from '../../components/admin/users/AdminUserInvitationsPanel';
import { adminService } from '../../services/api';

import { useToast } from '../../contexts/ToastContextShared.js';
import { logger } from '../../utils/logger';
import { toImageUrl } from '../../utils/imageUrl';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';

import { useAuth } from '../../contexts/AuthContextShared.js';
import { teamAccent } from '../../utils/teamAccent';
import { matchesDirectorySearch } from '../../utils/directorySearch';

const AdminUsersPage = () => {
	const navigate = useNavigate();
	const { canMutateInAdminArea, user: currentUser } = useAuth();
	const { success: showSuccess, error: showError } = useToast();
	const [users, setUsers] = useState([]);
	const [invitingIds, setInvitingIds] = useState([]);
	const [teams, setTeams] = useState([]);
	const requestVersion = useRef(0);
	const [hasLoadedUsers, setHasLoadedUsers] = useState(false);
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
	const [confirmAction, setConfirmAction] = useState(null); // { type: 'trash'|'reject', userId }
	const [confirmLoading, setConfirmLoading] = useState(false);
	// Acces cont (în fereastra de editare): 'suspend' = se cere confirmarea suspendării
	const [accessStep, setAccessStep] = useState(null);
	const [accessBusy, setAccessBusy] = useState(false);
	const [suspendReason, setSuspendReason] = useState('');
	const [inviteModalOpen, setInviteModalOpen] = useState(false);
	const [formData, setFormData] = useState({
		name: '',
		email: '',
		password: '',
		role: 'student',
		bio: '',
		team_id: '',
	});

	const fetchUsers = useCallback(async () => {
		const version = ++requestVersion.current;
		try {
			setLoading(true);
			setError(null);
			const params = { all: true };
			if (statusFilter !== 'all') params.status = statusFilter;
			if (usersView === 'trash') params.trashed = 1;
			const data = await adminService.getUsers(params);
			if (version === requestVersion.current) setUsers(Array.isArray(data) ? data : []);
		} catch (err) {
			console.error('Error fetching users:', err);
			if (version === requestVersion.current) setError('Nu s-au putut încărca utilizatorii');
		} finally {
            if (version === requestVersion.current) {
                setLoading(false);
                setHasLoadedUsers(true);
            }
		}
	}, [statusFilter, usersView]);

	const fetchTeams = useCallback(async () => {
		try {
			const data = await adminService.getTeams();
			setTeams(Array.isArray(data) ? data : (data.data || []));
		} catch (err) {
			console.error('Error fetching teams:', err);
		}
	}, []);

    useEffect(() => { fetchTeams(); }, [fetchTeams]);
    useEffect(() => {
        if (usersView === 'invitations') return;
        fetchUsers();
    }, [fetchUsers, usersView]);

	const filteredUsers = useMemo(() => {
		let filtered = [...users];

		// Filter by role
		if (roleFilter !== 'all') {
			filtered = filtered.filter(user => user.role === roleFilter);
		}

		// Filter by status (pending = cereri în așteptare)
		if (statusFilter !== 'all') {
			filtered = filtered.filter(user => (user.status || 'active') === statusFilter);
		}

		const query = searchQuery.trim();
		if (query) {
			filtered = filtered.filter((user) => matchesDirectorySearch(user, query));
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
					aValue = (a.name || '').toLowerCase();
					bValue = (b.name || '').toLowerCase();
					break;
				case 'email':
					aValue = (a.email || '').toLowerCase();
					bValue = (b.email || '').toLowerCase();
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

		return filtered;
	}, [users, sortBy, sortOrder, roleFilter, statusFilter, searchQuery]);

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
			if (!dataToSend.team_id) {
				delete dataToSend.team_id;
			}
			if (!dataToSend.bio) {
				delete dataToSend.bio;
			}

			if (editingUser) {
				// Do not change team on update in this flow
				delete dataToSend.team_id;
				await adminService.updateUser(editingUser.id, dataToSend);
			} else {
				// Parola nu este obligatorie - va fi setată automat la "formely2025" în backend
				await adminService.createUser(dataToSend);
			}

			showSuccess(editingUser ? 'Utilizatorul a fost actualizat.' : 'Utilizatorul a fost creat.');
			setShowModal(false);
			setEditingUser(null);
			setFormData({ name: '', email: '', password: '', role: 'student', bio: '', team_id: '' });
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

	const runAccessAction = async (action) => {
		if (!editingUser) return;
		setAccessBusy(true);
		try {
			const result = action === 'suspend'
				? await adminService.suspendUser(editingUser.id, suspendReason.trim() || null)
				: action === 'activate'
					? await adminService.activateUser(editingUser.id)
					: await adminService.resetUserAccess(editingUser.id);
			if (result?.user) setEditingUser((prev) => ({ ...prev, ...result.user }));
			showSuccess(result?.message || 'Acces actualizat.');
			setAccessStep(null);
			setSuspendReason('');
			fetchUsers();
		} catch (err) {
			showError(err.response?.data?.message || 'Nu am putut actualiza accesul contului.');
		} finally {
			setAccessBusy(false);
		}
	};

	const handleEdit = (user) => {
		setAccessStep(null);
		setSuspendReason('');
		setEditingUser(user);
		setFormData({
			name: user.name,
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

	const handleForceDeleteClick = (id) => {
		setConfirmAction({ type: 'force', userId: id });
	};

	const handleConfirmDelete = async () => {
		if (!confirmAction?.userId) return;
		const isForce = confirmAction.type === 'force';
		setConfirmLoading(true);
		try {
			if (isForce) {
				await adminService.forceDeleteUser(confirmAction.userId);
			} else {
				await adminService.deleteUser(confirmAction.userId);
			}
			showSuccess(isForce ? 'Utilizator șters definitiv' : 'Utilizator mutat în coș');
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
			showSuccess('Utilizator restabilit cu succes');
			fetchUsers();
		} catch (err) {
			logger.error('Error restoring user:', err);
			showError('Eroare la restabilire: ' + (err.response?.data?.message || err.message));
		}
	};

	const handleSendInvitation = async (id) => {
        if (invitingIds.includes(id)) return;
        setInvitingIds((ids) => [...ids, id]);
        try {
            const result = await adminService.sendExistingUserInvitation(id);
            showSuccess(result.message);
        } catch (err) {
            showError(err.response?.data?.message || 'Invitația nu a putut fi trimisă.');
        } finally {
            setInvitingIds((ids) => ids.filter((value) => value !== id));
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

	const getRoleLabel = (role) => {
		const roles = {
			admin: 'Administrator',
			instructor: 'Instructor',
			analyst: 'Analist',
			student: 'Utilizator',
		};
		return roles[role] || role || 'Utilizator';
	};

	if (loading && !hasLoadedUsers && usersView !== 'invitations') {
		return (
			<div className="admin-container">
				<div className="lms-dashboard-loading">
					<div className="lms-spinner"></div>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-container admin-container--wide admin-users-page">
			<div className="admin-page-header">
				<div className="admin-page-header-content">
					<h1 className="admin-page-title">Gestionare Utilizatori</h1>
					<p className="admin-page-subtitle">
						{usersView === 'invitations'
							? 'Invită utilizatori pe email și urmărește statusul trimiterii.'
							: 'Gestionează toți utilizatorii din platformă'}
					</p>
				</div>
				{usersView === 'invitations' && canMutateInAdminArea && (
					<button
						type="button"
						className="lms-btn-primary"
						onClick={() => setInviteModalOpen(true)}
					>
						<EnvelopeSimple size={16} weight="duotone" aria-hidden />
						Invitație nouă
					</button>
				)}
				{usersView === 'active' && canMutateInAdminArea && (
					<button
						className="lms-btn-primary"
						onClick={() => {
							setEditingUser(null);
							setFormData({ name: '', email: '', password: '', role: 'student', bio: '', team_id: '' });
							setShowModal(true);
						}}
					>
						<Plus size={16} weight="bold" aria-hidden /> Adaugă Utilizator
					</button>
				)}
			</div>

			{error && (
				<div className="lms-error-message">
					{error}
				</div>
			)}

			{/* View toggle: Utilizatori | Coș */}
			<nav className="admin-users-view-tabs" aria-label="Listă utilizatori sau coș">
				<button
					type="button"
					className={`admin-users-view-tab ${usersView === 'active' ? 'active' : ''}`}
					onClick={() => setUsersView('active')}
				>
					Utilizatori
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
						onClick={() => setUsersView('trash')}
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
			{/* Căutare și filtre */}
			<div className="admin-users-filters">
				<div className="admin-users-search-wrap">
					<input
						type="text"
						className="admin-users-search-input"
						placeholder="Caută după nume, prenume sau email..."
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
					>
						<option value="all">Toți utilizatorii</option>
						<option value="pending">Cereri în așteptare</option>
						<option value="active">Aprobați</option>
						<option value="suspended">Suspendați</option>
					</select>
				</div>
				<div className="admin-users-filter-group">
					<label className="admin-users-filter-label">Filtrează după rol:</label>
					<select
						className="admin-users-filter-select"
						value={roleFilter}
						onChange={(e) => setRoleFilter(e.target.value)}
					>
						<option value="all">Toate</option>
						<option value="student">Utilizatori</option>
						<option value="admin">Administratori</option>
						<option value="instructor">Instructori</option>
						<option value="analyst">Analiști</option>
					</select>
				</div>
			</div>

			{/* Table */}
			<div className="admin-users-table-wrapper" aria-busy={loading}>
				<table className="admin-users-table admin-users-table--directory">
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
							<th>Procentaj</th>
							<th className="admin-users-table-cell-center">Acțiuni</th>
						</tr>
					</thead>
					<tbody>
						{filteredUsers.length > 0 ? (
							filteredUsers.map((user) => {
								const isAdmin = user.role === 'admin';
								const totalCourses = user.total_courses || 0;
								const completedCourses = user.completed_courses || 0;
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
													<div className="admin-users-table-cell-name" title={user.name}>{user.name}</div>
													<div className="admin-users-table-cell-email-stacked" title={user.email}>{user.email}</div>
													{user.bio && (
														<div className="admin-users-table-cell-bio">
															{user.bio.substring(0, 50)}{user.bio.length > 50 ? '...' : ''}
														</div>
													)}
												</div>
											</div>
										</td>
										<td className="admin-users-table-cell-email" title={user.email}>{user.email}</td>
										<td>
											<span className={`admin-users-role-badge ${user.role}`}>
												{getRoleLabel(user.role)}
											</span>
											{(user.status || 'active') === 'pending' && (
												<span className="admin-users-status-badge admin-users-status-pending" title="Cerere în așteptare">
													În așteptare
												</span>
											)}
											{user.status === 'suspended' && (
												<span className="admin-users-status-badge admin-users-status-suspended" title={user.suspended_reason || 'Cont suspendat'}>
													Suspendat
												</span>
											)}
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
										<td className="admin-users-table-cell-center">
											<div className="admin-users-actions" onClick={(e) => e.stopPropagation()}>
                                                {currentUser?.role === 'admin' && usersView === 'active' && !user.last_login_at && (user.status || 'active') === 'active' && (
                                                    <button type="button" className="lms-btn-secondary lms-btn-sm admin-users-invite-button admin-users-action-compact"
                                                        title={invitingIds.includes(user.id) ? 'Se trimite…' : 'Trimite invitație'}
                                                        aria-label={`Trimite invitație: ${user.name}`}
                                                        aria-busy={invitingIds.includes(user.id) || undefined}
                                                        disabled={invitingIds.includes(user.id)}
                                                        onClick={() => handleSendInvitation(user.id)}>
                                                        <EnvelopeSimple size={18} weight="bold" aria-hidden="true" />
                                                    </button>
                                                )}
												{!canMutateInAdminArea ? (
													<span className="admin-users-table-cell-muted">—</span>
												) : usersView === 'trash' ? (
													<>
														<button title="Restabilește utilizatorul" aria-label={`Restabilește utilizatorul: ${user.name}`}
															type="button"
															className="lms-btn-primary lms-btn-sm admin-users-action-compact"
															onClick={(e) => {
																e.stopPropagation();
																handleRestore(user.id);
															}}
														>
															<ArrowCounterClockwise size={18} weight="bold" aria-hidden="true" />
														</button>
														<button title="Șterge definitiv" aria-label={`Șterge definitiv utilizatorul: ${user.name}`}
															type="button"
															className="lms-btn-secondary lms-btn-sm va-btn-delete va-btn-danger admin-users-action-compact"
															onClick={(e) => {
																e.stopPropagation();
																handleForceDeleteClick(user.id);
															}}
														>
															<Trash size={18} weight="bold" aria-hidden="true" />
														</button>
													</>
												) : (user.status || 'active') === 'pending' ? (
													<>
														<button title="Aprobă utilizatorul" aria-label={`Aprobă utilizatorul: ${user.name}`}
															type="button"
														className="lms-btn-primary lms-btn-sm admin-users-action-compact"
															onClick={(e) => {
																e.stopPropagation();
																handleApprove(user.id);
															}}
														>
															<Check size={18} weight="bold" aria-hidden="true" />
														</button>
														<button title="Respinge cererea" aria-label={`Respinge cererea: ${user.name}`}
															type="button"
														className="lms-btn-secondary lms-btn-sm va-btn-delete va-btn-danger admin-users-action-compact"
															onClick={(e) => {
																e.stopPropagation();
																handleRejectClick(user.id);
															}}
														>
															<X size={18} weight="bold" aria-hidden="true" />
														</button>
													</>
												) : (
													<>
														<button title="Editează utilizatorul" aria-label={`Editează utilizatorul: ${user.name}`}
															className="lms-btn-secondary lms-btn-sm admin-users-action-compact"
															onClick={(e) => {
																e.stopPropagation();
																handleEdit(user);
															}}
														>
															<PencilSimple size={18} weight="bold" aria-hidden="true" />

														</button>
														<button title="Mută utilizatorul în coș" aria-label={`Mută utilizatorul în coș: ${user.name}`}
															className="lms-btn-secondary lms-btn-sm va-btn-delete va-btn-danger admin-users-action-compact"
															onClick={(e) => {
																e.stopPropagation();
																handleDeleteClick(user.id);
															}}
														>
															<Trash size={18} weight="bold" aria-hidden="true" />

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
								<td colSpan="8" className="admin-users-empty">
									<div className="lms-empty-state">
										<div className="lms-empty-icon">
											<UsersThree size={26} weight="duotone" aria-hidden />
										</div>
										<h3 className="lms-empty-title">{searchQuery.trim() ? 'Niciun rezultat' : 'Nu există utilizatori'}</h3>
										<p className="lms-empty-description">
											{searchQuery.trim()
												? 'Niciun utilizator nu corespunde numelui, prenumelui sau emailului căutat.'
												: 'Nu există utilizatori care să corespundă filtrelor selectate.'}
										</p>
									</div>
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* Modal – componentă accesibilă (focus trap, Escape, ARIA) */}
			<Modal
				isOpen={showModal}
				onClose={() => setShowModal(false)}
				ariaLabelledby="admin-users-modal-title"
				className="admin-users-modal-overlay va-dialog-overlay"
				unstyledContent
			>
				<form onSubmit={handleSubmit} className="va-dialog" autoComplete="off">
					<header className="va-dialog__header">
						<h2 id="admin-users-modal-title" className="va-dialog__title">{editingUser ? 'Editează utilizatorul' : 'Adaugă utilizator nou'}</h2>
						<button
							type="button"
							className="admin-users-modal-close va-close-btn"
							onClick={() => setShowModal(false)}
							aria-label="Închide"
						>
							<X size={18} weight="bold" aria-hidden="true" />
						</button>
					</header>
					<div className="va-dialog__body">
						<div className="va-form-grid">
							<div className="va-field">
								<label htmlFor="admin-users-field-name">Nume</label>
								<input
									id="admin-users-field-name"
									type="text"
									className="admin-form-input"
									value={formData.name}
									onChange={(e) => setFormData({ ...formData, name: e.target.value })}
									required
									data-modal-initial-focus
								/>
							</div>
							<div className="va-field">
								<label htmlFor="admin-users-field-role">Rol</label>
								<select
									id="admin-users-field-role"
									className="admin-form-input"
									value={formData.role}
									onChange={(e) => setFormData({ ...formData, role: e.target.value })}
									required
								>
									<option value="student">Utilizator</option>
									<option value="admin">Administrator</option>
									<option value="instructor">Instructor</option>
									<option value="analyst">Analist</option>
								</select>
							</div>
							<div className="va-field">
								<label htmlFor="admin-users-field-email">Email</label>
								<input
									id="admin-users-field-email"
									type="email"
									name="managed-user-email"
									autoComplete="off"
									data-lpignore="true"
									data-1p-ignore="true"
									readOnly
									onFocus={(event) => event.currentTarget.removeAttribute('readonly')}
									onBlur={(event) => event.currentTarget.setAttribute('readonly', '')}
									className="admin-form-input"
									value={formData.email}
									onChange={(e) => setFormData({ ...formData, email: e.target.value })}
									required
								/>
							</div>
							<div className="va-field">
								<label htmlFor="admin-users-field-password">
									Parolă <span className="va-field__optional">{editingUser ? '(lasă gol pentru a nu o schimba)' : '(opțională)'}</span>
								</label>
								<input
									id="admin-users-field-password"
									type="password"
									name="managed-user-password"
									autoComplete="new-password"
									data-lpignore="true"
									data-1p-ignore="true"
									readOnly
									onFocus={(event) => event.currentTarget.removeAttribute('readonly')}
									onBlur={(event) => event.currentTarget.setAttribute('readonly', '')}
									className="admin-form-input"
									value={formData.password}
									onChange={(e) => setFormData({ ...formData, password: e.target.value })}
									placeholder={!editingUser ? 'Implicit: formely2025' : 'Neschimbată'}
									minLength={formData.password ? 6 : undefined}
								/>
								{!editingUser ? (
									<p className="va-field__hint">
										Dacă rămâne goală, utilizatorul primește parola <strong>formely2025</strong> și o schimbă la prima autentificare.
									</p>
								) : null}
							</div>
							<div className="va-field va-field--full">
								<label htmlFor={editingUser ? undefined : 'admin-users-field-team'}>Echipă</label>
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
											<p className="va-field__hint">Fără echipă</p>
										)}
										<p className="va-field__hint">
											Echipa se modifică din pagina <strong>Echipe</strong> (atașare membri).
										</p>
									</>
								) : (
									<>
										<select
											id="admin-users-field-team"
											className="admin-form-input"
											value={formData.team_id}
											onChange={(e) => setFormData({ ...formData, team_id: e.target.value })}
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
										<p className="va-field__hint">
											{formData.team_id
												? 'Utilizatorul va fi asociat echipei alese la creare (poți lăsa gol).'
												: 'Opțional — utilizatorul poate fi adăugat într-o echipă din pagina Echipe.'}
										</p>
									</>
								)}
							</div>
							{editingUser && currentUser?.role === 'admin' && editingUser.id !== currentUser?.id && (
								<section className="admin-users-access va-field va-field--full" aria-labelledby="admin-users-access-title">
									<h3 id="admin-users-access-title" className="admin-users-access-title">Acces cont</h3>
									<p className="admin-users-access-status">
										Status:{' '}
										<strong>{editingUser.status === 'suspended' ? 'Suspendat' : editingUser.status === 'pending' ? 'În așteptare' : 'Activ'}</strong>
										{editingUser.status === 'suspended' && editingUser.suspended_reason ? ` — ${editingUser.suspended_reason}` : ''}
									</p>
									{editingUser.must_change_password ? (
										<p className="admin-form-hint">Va trebui să-și schimbe parola la următoarea autentificare.</p>
									) : null}

									{accessStep === 'suspend' ? (
										<div className="admin-users-access-confirm">
											<label className="admin-form-label" htmlFor="admin-users-suspend-reason">
												Motiv <span className="admin-form-label-hint">(opțional, vizibil doar adminilor)</span>
											</label>
											<input
												id="admin-users-suspend-reason"
												className="admin-form-input"
												value={suspendReason}
												onChange={(e) => setSuspendReason(e.target.value)}
												maxLength={1000}
											/>
											<p className="admin-form-hint">Contul nu se va mai putea autentifica până la reactivare. Progresul rămâne.</p>
											<div className="admin-users-access-actions">
												<button type="button" className="lms-btn-secondary" onClick={() => setAccessStep(null)} disabled={accessBusy}>
													Renunță
												</button>
												<button type="button" className="lms-btn-secondary va-btn-delete va-btn-danger" onClick={() => runAccessAction('suspend')} disabled={accessBusy}>
													{accessBusy ? 'Se suspendă…' : 'Confirmă suspendarea'}
												</button>
											</div>
										</div>
									) : (
										<div className="admin-users-access-actions">
											{editingUser.status === 'suspended' ? (
												<button type="button" className="lms-btn-secondary" onClick={() => runAccessAction('activate')} disabled={accessBusy}>
													Reactivează contul
												</button>
											) : (
												<button type="button" className="lms-btn-secondary va-btn-delete va-btn-danger" onClick={() => setAccessStep('suspend')} disabled={accessBusy}>
													Suspendă contul
												</button>
											)}
											<button
												type="button"
												className="lms-btn-secondary"
												onClick={() => runAccessAction('reset')}
												disabled={accessBusy || Boolean(editingUser.must_change_password)}
											>
												Cere schimbarea parolei
											</button>
										</div>
									)}
								</section>
							)}
						</div>
					</div>
					<footer className="va-dialog__footer">
						<button type="button" className="lms-btn-secondary" onClick={() => setShowModal(false)}>
							Anulează
						</button>
						<button type="submit" className="va-btn-save lms-btn-primary">
							Salvează
						</button>
					</footer>
				</form>
			</Modal>
			</>
			)}

			<ConfirmModal
				open={!!confirmAction}
				onClose={() => setConfirmAction(null)}
				onConfirm={confirmAction?.type === 'reject' ? handleConfirmReject : handleConfirmDelete}
				title={confirmAction?.type === 'reject'
					? 'Respinge cerere'
					: confirmAction?.type === 'force' ? 'Ștergere definitivă' : 'Mutare în coș'}
				message={confirmAction?.type === 'reject'
					? 'Sigur dorești să respingi această cerere? Utilizatorul va fi șters.'
					: confirmAction?.type === 'force'
						? 'Utilizatorul și tot progresul lui (rezultate, lecții, mesaje) vor fi șterse definitiv. Cursurile, testele și echipele create de el trec pe contul tău. Acțiunea nu poate fi anulată.'
						: 'Utilizatorul va fi mutat în coș și poate fi restabilit ulterior cu tot progresul. Continuă?'}
				confirmLabel={confirmAction?.type === 'reject'
					? 'Respinge'
					: confirmAction?.type === 'force' ? 'Șterge definitiv' : 'Mută în coș'}
				cancelLabel="Anulare"
				variant="danger"
				loading={confirmLoading}
			/>
		</div>
	);
};

export default AdminUsersPage;
