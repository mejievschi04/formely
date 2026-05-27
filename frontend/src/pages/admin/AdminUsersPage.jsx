import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PencilSimple, Plus, Trash, UsersThree, X } from '@phosphor-icons/react';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { logger } from '../../utils/logger';
import { toImageUrl } from '../../utils/imageUrl';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useAuth } from '../../contexts/AuthContext';
import { teamAccentNeutral as teamAccent } from '../../utils/teamAccent';

const AdminUsersPage = () => {
	const navigate = useNavigate();
	const { canMutateInAdminArea } = useAuth();
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
	const [usersView, setUsersView] = useState('active'); // 'active' | 'trash' (coș)
	const [confirmAction, setConfirmAction] = useState(null); // { type: 'trash'|'reject', userId }
	const [confirmLoading, setConfirmLoading] = useState(false);
	const [formData, setFormData] = useState({
		name: '',
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
		fetchUsers();
	}, [statusFilter, usersView, searchQuery]);

	useEffect(() => {
		applyFiltersAndSort();
	}, [users, sortBy, sortOrder, roleFilter]);

	const fetchUsers = async () => {
		try {
			setLoading(true);
			const params = {};
			if (statusFilter !== 'all') params.status = statusFilter;
			if (searchQuery.trim()) params.search = searchQuery.trim();
			if (usersView === 'trash') params.trashed = 1;
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

	const handleEdit = (user) => {
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

	const handleConfirmDelete = async () => {
		if (!confirmAction?.userId) return;
		setConfirmLoading(true);
		try {
			await adminService.deleteUser(confirmAction.userId);
			showSuccess('Utilizator mutat în coș');
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
		<div className="admin-container admin-container--wide">
			<div className="admin-page-header">
				<div className="admin-page-header-content">
					<h1 className="admin-page-title">Gestionare Utilizatori</h1>
					<p className="admin-page-subtitle">Gestionează toți utilizatorii din platformă</p>
				</div>
				{usersView === 'active' && canMutateInAdminArea && (
					<button
						className="lms-btn-primary"
						onClick={() => {
							setEditingUser(null);
							setFormData({ name: '', email: '', password: '', role: 'student', bio: '' });
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
						className={`admin-users-view-tab ${usersView === 'trash' ? 'active' : ''}`}
						onClick={() => setUsersView('trash')}
					>
						Coș
					</button>
				)}
			</nav>

			{/* Căutare și filtre */}
			<div className="admin-users-filters">
				<div className="admin-users-search-wrap">
					<input
						type="text"
						className="admin-users-search-input"
						placeholder="Caută după nume sau email..."
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
							<th className="admin-users-table-cell-center">Acțiuni</th>
						</tr>
					</thead>
					<tbody>
						{filteredUsers.length > 0 ? (
							filteredUsers.map((user) => {
								const isAdmin = user.role === 'admin';
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
											{(user.status || 'active') === 'pending' && (
												<span className="admin-users-status-badge admin-users-status-pending" title="Cerere în așteptare">
													În așteptare
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
										<td className="admin-users-table-cell-center">
											<div className="admin-users-actions" onClick={(e) => e.stopPropagation()}>
												{!canMutateInAdminArea ? (
													<span className="admin-users-table-cell-muted">—</span>
												) : usersView === 'trash' ? (
													<button
														className="lms-btn-primary lms-btn-sm"
														onClick={(e) => {
															e.stopPropagation();
															handleRestore(user.id);
														}}
													>
														Restabilește
													</button>
												) : (user.status || 'active') === 'pending' ? (
													<>
														<button
															className="lms-btn-primary lms-btn-sm"
															onClick={(e) => {
																e.stopPropagation();
																handleApprove(user.id);
															}}
														>
															Aprobă
														</button>
														<button
															className="lms-btn-secondary lms-btn-sm va-btn-danger"
															onClick={(e) => {
																e.stopPropagation();
																handleRejectClick(user.id);
															}}
														>
															Respinge
														</button>
													</>
												) : (
													<>
														<button
															className="lms-btn-secondary lms-btn-sm admin-users-action-compact"
															onClick={(e) => {
																e.stopPropagation();
																handleEdit(user);
															}}
														>
															<PencilSimple size={14} weight="bold" aria-hidden="true" />
															<span>Editare</span>
														</button>
														<button
															className="lms-btn-secondary lms-btn-sm va-btn-danger admin-users-action-compact"
															onClick={(e) => {
																e.stopPropagation();
																handleDeleteClick(user.id);
															}}
														>
															<Trash size={14} weight="bold" aria-hidden="true" />
															<span>În coș</span>
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
										<h3 className="lms-empty-title">Nu există utilizatori</h3>
										<p className="lms-empty-description">
											Nu există utilizatori care să corespundă filtrelor selectate.
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
				closeOnBackdropClick
				className="admin-users-modal-overlay"
			>
				<div className="admin-users-modal">
					<div className="admin-users-modal-header">
						<h2 id="admin-users-modal-title" className="admin-users-modal-title">{editingUser ? 'Editează Utilizator' : 'Adaugă Utilizator Nou'}</h2>
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
										<option value="student">Utilizator</option>
										<option value="admin">Administrator</option>
										<option value="instructor">Instructor</option>
										<option value="analyst">Analist</option>
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
				onConfirm={confirmAction?.type === 'reject' ? handleConfirmReject : handleConfirmDelete}
				title={confirmAction?.type === 'reject' ? 'Respinge cerere' : 'Mutare în coș'}
				message={confirmAction?.type === 'reject'
					? 'Sigur dorești să respingi această cerere? Utilizatorul va fi șters.'
					: 'Utilizatorul va fi mutat în coș și poate fi restabilit ulterior cu tot progresul. Continuă?'}
				confirmLabel={confirmAction?.type === 'reject' ? 'Respinge' : 'Mută în coș'}
				cancelLabel="Anulare"
				variant="danger"
				loading={confirmLoading}
			/>
		</div>
	);
};

export default AdminUsersPage;
