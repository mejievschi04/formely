import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CircleNotch, EnvelopeSimple, PaperPlaneTilt, Trash, UsersThree } from '@phosphor-icons/react';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../../components/common/ConfirmModal';
import { ASSIGNABLE_ROLES } from '../../constants/staffRoles';
import { canAssignAnalyst, getEntitlements, formatSeatCap } from '../../utils/entitlements';

export default function AdminInviteUsersPage() {
	const { canMutateInAdminArea, user } = useAuth();
	const { success: showSuccess, error: showError } = useToast();
	const ROLE_OPTIONS = ASSIGNABLE_ROLES.filter((r) =>
		['employee', 'manager', 'hr_admin', 'instructor', 'analyst'].includes(r.value)
	).filter((r) => r.value !== 'analyst' || canAssignAnalyst(user));
	const [teams, setTeams] = useState([]);
	const [invitations, setInvitations] = useState([]);
	const [loading, setLoading] = useState(true);
	const [sending, setSending] = useState(false);
	const [cancelId, setCancelId] = useState(null);
	const [form, setForm] = useState({
		email: '',
		name: '',
		emails: '',
		role: 'employee',
		team_id: '',
	});
	const [bulkMode, setBulkMode] = useState(false);
	const [liveEntitlements, setLiveEntitlements] = useState(null);
	const entitlements = liveEntitlements || getEntitlements(user);
	const invitingLearner = form.role === 'employee' || form.role === 'student';
	const seatPool = invitingLearner ? entitlements?.seats?.learners : entitlements?.seats?.staff;
	const seatBlocked = seatPool?.available === false;

	const fetchEntitlements = async () => {
		try {
			const data = await adminService.getCompanyEntitlements();
			if (data?.entitlements) setLiveEntitlements(data.entitlements);
		} catch {
			/* fallback: login payload */
		}
	};

	const fetchInvitations = async () => {
		try {
			const data = await adminService.getUserInvitations();
			const rows = data?.data ?? (Array.isArray(data) ? data : []);
			setInvitations(rows);
		} catch (err) {
			showError('Nu s-au putut încărca invitațiile');
		}
	};

	useEffect(() => {
		(async () => {
			setLoading(true);
			try {
				const teamsData = await adminService.getTeams();
				setTeams(Array.isArray(teamsData) ? teamsData : teamsData?.data || []);
				await Promise.all([fetchInvitations(), fetchEntitlements()]);
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!canMutateInAdminArea) return;
		if (seatBlocked) {
			showError('Nu mai sunt locuri disponibile pe acest plan pentru rolul selectat.');
			return;
		}

		setSending(true);
		try {
			const payload = {
				role: form.role,
				team_id: form.team_id || undefined,
			};

			if (bulkMode) {
				payload.emails = form.emails;
			} else {
				payload.email = form.email;
				if (form.name.trim()) payload.name = form.name.trim();
			}

			const result = await adminService.sendUserInvitations(payload);
			const failed = result?.failed || [];
			const sent = result?.sent || [];

			if (sent.length > 0) {
				showSuccess(result?.message || `${sent.length} invitații trimise`);
				setForm((f) => ({ ...f, email: '', name: '', emails: '' }));
				await Promise.all([fetchInvitations(), fetchEntitlements()]);
			}

			if (failed.length > 0) {
				const detail = failed.map((f) => `${f.email}: ${f.message}`).join('; ');
				showError(
					sent.length > 0
						? `Unele invitații au eșuat: ${detail}`
						: detail || 'Nu s-a trimis nicio invitație'
				);
			} else if (sent.length === 0 && !result?.message) {
				showError('Nu s-a trimis nicio invitație');
			}
		} catch (err) {
			const data = err.response?.data;
			showError(data?.message || data?.errors?.email?.[0] || 'Eroare la trimiterea invitațiilor');
		} finally {
			setSending(false);
		}
	};

	const handleResend = async (id) => {
		try {
			await adminService.resendUserInvitation(id);
			showSuccess('Invitație retrimisă');
			await Promise.all([fetchInvitations(), fetchEntitlements()]);
		} catch (err) {
			showError(err.response?.data?.message || 'Nu s-a putut retrimite invitația');
		}
	};

	const handleCancel = async () => {
		if (!cancelId) return;
		try {
			await adminService.cancelUserInvitation(cancelId);
			showSuccess('Invitație anulată');
			setCancelId(null);
			await Promise.all([fetchInvitations(), fetchEntitlements()]);
		} catch (err) {
			showError(err.response?.data?.message || 'Eroare la anulare');
		}
	};

	const formatDate = (iso) => {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleString('ro-RO');
		} catch {
			return iso;
		}
	};

	if (loading) {
		return (
			<div className="admin-container">
				<div className="lms-dashboard-loading">
					<div className="lms-spinner" />
				</div>
			</div>
		);
	}

	return (
		<div className="admin-container admin-container--wide">
			<div className="admin-page-header">
				<div className="admin-page-header-content">
					<Link to="/admin/users" className="admin-invite-back">
						<ArrowLeft size={18} weight="bold" aria-hidden />
						Utilizatori
					</Link>
					<h1 className="admin-page-title">Invită utilizatori</h1>
					<p className="admin-page-subtitle">
						Trimite invitații Formely pe email și urmărește statusul trimiterii.
						{seatPool ? (
							<>
								{' '}
								Locuri {invitingLearner ? 'cursanți' : 'staff'}: {seatPool.used ?? 0}/{formatSeatCap(seatPool.max)}
								{typeof seatPool.pending_invites === 'number' && seatPool.pending_invites > 0
									? ` · ${seatPool.pending_invites} invitații în așteptare`
									: ''}
							</>
						) : null}
					</p>
				</div>
			</div>

			<div className="admin-invite-layout">
				<section className="admin-invite-form-card">
					<h2 className="admin-invite-section-title">
						<EnvelopeSimple size={22} weight="duotone" aria-hidden />
						Invitație nouă
					</h2>

					<div className="admin-invite-mode-tabs">
						<button
							type="button"
							className={`admin-invite-mode-tab ${!bulkMode ? 'active' : ''}`}
							onClick={() => setBulkMode(false)}
						>
							Un utilizator
						</button>
						<button
							type="button"
							className={`admin-invite-mode-tab ${bulkMode ? 'active' : ''}`}
							onClick={() => setBulkMode(true)}
						>
							Mai mulți (listă)
						</button>
					</div>

					<form onSubmit={handleSubmit} className="admin-invite-form">
						{bulkMode ? (
							<div className="admin-form-group">
								<label htmlFor="invite-emails" className="admin-form-label">
									Emailuri (câte unul pe linie)
								</label>
								<textarea
									id="invite-emails"
									className="admin-invite-textarea"
									rows={6}
									placeholder={'maria@firma.ro\nion@firma.ro\nAna Popescu <ana@firma.ro>'}
									value={form.emails}
									onChange={(e) => setForm({ ...form, emails: e.target.value })}
									required
									disabled={!canMutateInAdminArea}
								/>
								<p className="admin-invite-hint">Max. 50 adrese per trimitere</p>
							</div>
						) : (
							<>
								<div className="admin-form-group">
									<label htmlFor="invite-email" className="admin-form-label">
										Email
									</label>
									<input
										id="invite-email"
										type="email"
										className="admin-form-input"
										value={form.email}
										onChange={(e) => setForm({ ...form, email: e.target.value })}
										required
										disabled={!canMutateInAdminArea}
									/>
								</div>
								<div className="admin-form-group">
									<label htmlFor="invite-name" className="admin-form-label">
										Nume (opțional)
									</label>
									<input
										id="invite-name"
										type="text"
										className="admin-form-input"
										value={form.name}
										onChange={(e) => setForm({ ...form, name: e.target.value })}
										placeholder="Se poate completa la acceptare"
										disabled={!canMutateInAdminArea}
									/>
								</div>
							</>
						)}

						<div className="admin-invite-form-row">
							<div className="admin-form-group">
								<label htmlFor="invite-role" className="admin-form-label">
									Rol
								</label>
								<select
									id="invite-role"
									className="admin-form-input"
									value={form.role}
									onChange={(e) => setForm({ ...form, role: e.target.value })}
									disabled={!canMutateInAdminArea}
								>
									{ROLE_OPTIONS.map((o) => (
										<option key={o.value} value={o.value}>
											{o.label}
										</option>
									))}
								</select>
							</div>
							<div className="admin-form-group">
								<label htmlFor="invite-team" className="admin-form-label">
									Echipă (opțional)
								</label>
								<select
									id="invite-team"
									className="admin-form-input"
									value={form.team_id}
									onChange={(e) => setForm({ ...form, team_id: e.target.value })}
									disabled={!canMutateInAdminArea}
								>
									<option value="">— Fără echipă —</option>
									{teams.map((t) => (
										<option key={t.id} value={t.id}>
											{t.name}
										</option>
									))}
								</select>
							</div>
						</div>

						{seatBlocked ? (
							<p className="admin-invite-seat-warning" role="status">
								Nu mai sunt locuri disponibile pe acest plan pentru rolul selectat.
							</p>
						) : null}

						{canMutateInAdminArea && (
							<button type="submit" className="lms-btn-primary admin-invite-submit" disabled={sending || seatBlocked}>
								{sending ? (
									<>
										<CircleNotch className="modern-auth-spinner" size={18} weight="bold" aria-hidden />
										Se trimite...
									</>
								) : (
									<>
										<PaperPlaneTilt size={18} weight="bold" aria-hidden />
										Trimite invitația
									</>
								)}
							</button>
						)}
					</form>
				</section>

				<section className="admin-invite-list-card">
					<h2 className="admin-invite-section-title">
						<UsersThree size={22} weight="duotone" aria-hidden />
						Invitații în așteptare ({invitations.length})
					</h2>

					{invitations.length === 0 ? (
						<p className="admin-invite-empty">Nu există invitații active.</p>
					) : (
						<div className="admin-invite-table-wrap">
							<table className="admin-invite-table">
								<thead>
									<tr>
										<th>Email</th>
										<th>Rol</th>
										<th>Echipă</th>
										<th>Expiră</th>
										<th aria-label="Acțiuni" />
									</tr>
								</thead>
								<tbody>
									{invitations.map((inv) => (
										<tr key={inv.id}>
											<td>
												<strong>{inv.email}</strong>
												{inv.name ? <span className="admin-invite-name">{inv.name}</span> : null}
											</td>
											<td>{ROLE_OPTIONS.find((r) => r.value === inv.role)?.label || inv.role}</td>
											<td>{inv.team?.name || '—'}</td>
											<td>{formatDate(inv.expires_at)}</td>
											<td className="admin-invite-actions">
												{canMutateInAdminArea && (
													<>
														<button
															type="button"
															className="lms-btn-secondary lms-btn-sm"
															onClick={() => handleResend(inv.id)}
														>
															Retrimite
														</button>
														<button
															type="button"
															className="lms-btn-danger lms-btn-sm"
															onClick={() => setCancelId(inv.id)}
															aria-label="Anulează invitația"
														>
															<Trash size={16} weight="bold" aria-hidden />
														</button>
													</>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>
			</div>

			<ConfirmModal
				open={Boolean(cancelId)}
				title="Anulează invitația"
				message="Utilizatorul nu va mai putea folosi linkul din email."
				confirmLabel="Anulează"
				cancelLabel="Înapoi"
				variant="danger"
				onConfirm={handleCancel}
				onClose={() => setCancelId(null)}
			/>
		</div>
	);
}
