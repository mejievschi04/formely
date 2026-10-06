import React, { useCallback, useEffect, useState } from 'react';
import {
	ArrowClockwise,
	Check,
	CircleNotch,
	Copy,
	EnvelopeSimple,
	Plus,
	Trash,
	X,
} from '@phosphor-icons/react';
import { adminService } from '../../../services/api';

import { useToast } from '../../../contexts/ToastContextShared.js';
import { logger } from '../../../utils/logger';
import Modal from '../../common/Modal';

// Reîncărcare cât timp emailurile de invitație sunt încă în coadă; oprită când tab-ul e ascuns.
const INVITATION_STATUS_POLL_MS = 8000;

const ROLE_LABELS = {
	student: 'Utilizator',
	instructor: 'Instructor',
	analyst: 'Analist',
};

const EMAIL_STATUS = {
	pending: { label: 'Se trimite…', className: 'is-pending' },
	sent: { label: 'Trimis', className: 'is-sent' },
	failed: { label: 'Eșec', className: 'is-failed' },
	skipped: { label: 'Dezactivat', className: 'is-skipped' },
};

const emptyInviteForm = {
	email: '',
	name: '',
	role: 'student',
	team_id: '',
};

const AdminUserInvitationsPanel = ({ teams = [], modalOpen, onModalOpenChange }) => {
	const { success: showSuccess, error: showError } = useToast();
	const [invitations, setInvitations] = useState([]);
	const [stats, setStats] = useState({ total: 0, pending_email: 0, sent: 0, failed: 0 });
	const [loading, setLoading] = useState(true);
	const [internalModalOpen, setInternalModalOpen] = useState(false);
	const [inviteLoading, setInviteLoading] = useState(false);
	const [actionId, setActionId] = useState(null);
	const [copiedId, setCopiedId] = useState(null);
	const [inviteForm, setInviteForm] = useState(emptyInviteForm);
	const [createdLink, setCreatedLink] = useState(null);

	const showModal = modalOpen ?? internalModalOpen;
	const setShowModal = onModalOpenChange ?? setInternalModalOpen;

	const fetchInvitations = useCallback(async (silent = false) => {
		try {
			if (!silent) setLoading(true);
			const payload = await adminService.getUserInvitations();
			setInvitations(Array.isArray(payload?.data) ? payload.data : []);
			setStats(payload?.stats || { total: 0, pending_email: 0, sent: 0, failed: 0 });
		} catch (err) {
			logger.error('Error fetching invitations:', err);
			if (!silent) showError('Nu s-au putut încărca invitațiile.');
		} finally {
			if (!silent) setLoading(false);
		}
	}, [showError]);

	useEffect(() => {
		fetchInvitations();
	}, [fetchInvitations]);

	useEffect(() => {
		if (!stats.pending_email) return undefined;
		const timer = window.setInterval(() => {
			if (!document.hidden) fetchInvitations(true);
		}, INVITATION_STATUS_POLL_MS);
		return () => window.clearInterval(timer);
	}, [stats.pending_email, fetchInvitations]);

	const copyText = async (text, id) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedId(id);
			showSuccess('Link copiat.');
			window.setTimeout(() => setCopiedId(null), 2000);
		} catch {
			showError('Nu s-a putut copia linkul.');
		}
	};

	const handleCopyLink = async (id) => {
		setActionId(`copy-${id}`);
		try {
			const result = await adminService.copyUserInvitationLink(id);
			if (result?.invite_url) {
				await copyText(result.invite_url, id);
			}
		} catch (err) {
			showError(err.response?.data?.message || 'Nu s-a putut obține linkul.');
		} finally {
			setActionId(null);
		}
	};

	const handleSendInvitation = async (e) => {
		e.preventDefault();
		setInviteLoading(true);
		try {
			const result = await adminService.sendUserInvitation({
				email: inviteForm.email,
				name: inviteForm.name || undefined,
				role: inviteForm.role,
				team_id: inviteForm.team_id || undefined,
			});
			setCreatedLink(result.invite_url || null);
			if (result.invitation) {
				setInvitations((prev) => [result.invitation, ...prev.filter((i) => i.id !== result.invitation.id)]);
				setStats((prev) => ({
					...prev,
					total: prev.total + 1,
					pending_email: result.invitation.email_status === 'pending' ? prev.pending_email + 1 : prev.pending_email,
				}));
			} else {
				fetchInvitations(true);
			}
			showSuccess(result.message || 'Invitație creată.');
			setInviteForm(emptyInviteForm);
		} catch (err) {
			showError(
				err.response?.data?.message
				|| err.response?.data?.errors?.email?.[0]
				|| 'Nu s-a putut crea invitația.'
			);
		} finally {
			setInviteLoading(false);
		}
	};

	const handleResendEmail = async (id) => {
		setActionId(`resend-${id}`);
		try {
			const result = await adminService.resendUserInvitation(id);
			if (result.invitation) {
				setInvitations((prev) => prev.map((inv) => (inv.id === id ? result.invitation : inv)));
			}
			showSuccess(result.message || 'Emailul se retrimite în fundal.');
			await fetchInvitations(true);
		} catch (err) {
			showError(err.response?.data?.message || 'Nu s-a putut retrimite emailul.');
		} finally {
			setActionId(null);
		}
	};

	const handleCancel = async (id) => {
		setActionId(`cancel-${id}`);
		try {
			await adminService.cancelUserInvitation(id);
			setInvitations((prev) => prev.filter((inv) => inv.id !== id));
			setStats((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
			showSuccess('Invitația a fost anulată.');
		} catch (err) {
			showError(err.response?.data?.message || 'Nu s-a putut anula invitația.');
		} finally {
			setActionId(null);
		}
	};

	const closeModal = () => {
		setShowModal(false);
		setCreatedLink(null);
		setInviteForm(emptyInviteForm);
	};

	if (loading) {
		return (
			<div className="admin-invitations-loading">
				<div className="lms-spinner" />
			</div>
		);
	}

	return (
		<>
			<div className="admin-invitations-kpi">
				<div className="admin-invitations-kpi-card">
					<span className="admin-invitations-kpi-value">{stats.total}</span>
					<span className="admin-invitations-kpi-label">Active</span>
				</div>
				<div className="admin-invitations-kpi-card">
					<span className="admin-invitations-kpi-value">{stats.sent}</span>
					<span className="admin-invitations-kpi-label">Email trimis</span>
				</div>
				<div className="admin-invitations-kpi-card">
					<span className="admin-invitations-kpi-value">{stats.pending_email}</span>
					<span className="admin-invitations-kpi-label">În trimitere</span>
				</div>
				<div className="admin-invitations-kpi-card">
					<span className="admin-invitations-kpi-value">{stats.failed}</span>
					<span className="admin-invitations-kpi-label">Eșuate</span>
				</div>
			</div>

			<div className="admin-users-table-wrapper">
				<table className="admin-users-table admin-invitations-table">
					<thead>
						<tr>
							<th>Email</th>
							<th>Rol</th>
							<th>Echipă</th>
							<th>Status email</th>
							<th>Expiră</th>
							<th className="admin-users-table-cell-center">Acțiuni</th>
						</tr>
					</thead>
					<tbody>
						{invitations.length === 0 ? (
							<tr>
								<td colSpan="6" className="admin-users-empty">
									<div className="lms-empty-state">
										<div className="lms-empty-icon">
											<EnvelopeSimple size={26} weight="duotone" aria-hidden />
										</div>
										<h3 className="lms-empty-title">Nicio invitație activă</h3>
										<p className="lms-empty-description">
											Trimite o invitație — linkul poate fi copiat imediat, fără a aștepta emailul.
										</p>
										<button type="button" className="lms-btn-primary" onClick={() => setShowModal(true)}>
											<Plus size={16} weight="bold" aria-hidden />
											Invitație nouă
										</button>
									</div>
								</td>
							</tr>
						) : (
							invitations.map((invitation) => {
								const status = EMAIL_STATUS[invitation.email_status] || EMAIL_STATUS.pending;
								const busy = actionId?.includes(String(invitation.id));
								return (
									<tr key={invitation.id}>
										<td>
											<div className="admin-invitation-cell-email">
												<strong>{invitation.email}</strong>
												{invitation.name ? (
													<span className="admin-users-table-cell-muted">{invitation.name}</span>
												) : null}
											</div>
										</td>
										<td>{ROLE_LABELS[invitation.role] || invitation.role}</td>
										<td>{invitation.team?.name || '—'}</td>
										<td>
											<span className={`admin-invitation-status ${status.className}`}>
												{status.label}
											</span>
											{invitation.email_status === 'failed' && invitation.email_last_error ? (
												<div className="admin-invitation-error">{invitation.email_last_error}</div>
											) : null}
										</td>
										<td>
											{invitation.expires_at
												? new Date(invitation.expires_at).toLocaleDateString('ro-RO')
												: '—'}
										</td>
										<td className="admin-users-table-cell-center">
											<div className="admin-users-actions admin-invitation-actions">
												<button title="Copiază linkul invitației" aria-label={`Copiază linkul invitației: ${invitation.email}`}
													type="button"
													className="lms-btn-secondary lms-btn-sm admin-users-action-compact"
													disabled={busy}
													onClick={() => handleCopyLink(invitation.id)}
												>
													{actionId === `copy-${invitation.id}` ? (
														<CircleNotch size={14} className="va-spin" aria-hidden />
													) : copiedId === invitation.id ? (
														<Check size={14} aria-hidden />
													) : (
														<Copy size={14} aria-hidden />
													)}

												</button>
												<button title="Retrimite emailul" aria-label={`Retrimite emailul: ${invitation.email}`}
													type="button"
													className="lms-btn-secondary lms-btn-sm admin-users-action-compact"
													disabled={busy}
													onClick={() => handleResendEmail(invitation.id)}
												>
													{actionId === `resend-${invitation.id}` ? (
														<CircleNotch size={14} className="va-spin" aria-hidden />
													) : (
														<ArrowClockwise size={14} weight="bold" aria-hidden />
													)}

												</button>
												<button title="Anulează invitația" aria-label={`Anulează invitația: ${invitation.email}`}
													type="button"
													className="lms-btn-secondary lms-btn-sm va-btn-delete va-btn-danger admin-users-action-compact"
													disabled={busy}
													onClick={() => handleCancel(invitation.id)}
												>
													{actionId === `cancel-${invitation.id}` ? (
														<CircleNotch size={14} className="va-spin" aria-hidden />
													) : (
														<Trash size={14} weight="bold" aria-hidden />
													)}

												</button>
											</div>
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>

			<Modal
				isOpen={showModal}
				onClose={closeModal}
				ariaLabelledby="admin-invite-modal-title"
				className="admin-users-modal-overlay"
			>
				<div className="admin-users-modal admin-invite-modal">
					<div className="admin-users-modal-header">
						<div className="admin-invite-modal-heading">
							<span className="admin-invite-modal-icon" aria-hidden>
								<EnvelopeSimple size={22} weight="duotone" />
							</span>
							<h2 id="admin-invite-modal-title" className="admin-users-modal-title">
								{createdLink ? 'Invitație creată' : 'Invitație nouă'}
							</h2>
						</div>
						<button type="button" className="admin-users-modal-close va-close-btn" onClick={closeModal} aria-label="Închide">
							<X size={18} weight="bold" aria-hidden="true" />
						</button>
					</div>

					{createdLink ? (
						<>
							<div className="admin-users-modal-body admin-invite-success-body">
								<p className="admin-invite-success-text">
									Invitația este activă. Copiază linkul mai jos sau lasă utilizatorul să primească emailul automat.
								</p>
								<label className="admin-form-label" htmlFor="admin-invite-link-copy">
									Link de activare
								</label>
								<div className="admin-invite-link-box">
									<input
										id="admin-invite-link-copy"
										type="text"
										className="admin-form-input admin-invite-link-input"
										value={createdLink}
										readOnly
										onFocus={(e) => e.target.select()}
									/>
									<button
										type="button"
										className="lms-btn-primary"
										onClick={() => copyText(createdLink, 'new')}
									>
										{copiedId === 'new' ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
										{copiedId === 'new' ? 'Copiat' : 'Copiază link'}
									</button>
								</div>
							</div>
							<div className="admin-users-modal-footer admin-invite-modal-footer">
								<button type="button" className="lms-btn-secondary" onClick={() => setCreatedLink(null)}>
									Invită alt email
								</button>
								<button type="button" className="lms-btn-primary" onClick={closeModal}>
									Gata
								</button>
							</div>
						</>
					) : (
						<>
							<div className="admin-users-modal-body">
								<p className="admin-invite-intro">
									Utilizatorul primește un link pe email pentru a-și crea contul. Poți copia linkul imediat după creare.
								</p>
								<form id="admin-invite-form" onSubmit={handleSendInvitation} className="admin-invite-form">
									<div className="admin-form-group">
										<label className="admin-form-label" htmlFor="invite-email">Email</label>
										<input
											id="invite-email"
											type="email"
											className="admin-form-input"
											value={inviteForm.email}
											onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
											required
											autoFocus
											placeholder="exemplu@firma.ro"
										/>
									</div>
									<div className="admin-form-group">
										<label className="admin-form-label" htmlFor="invite-name">Nume (opțional)</label>
										<input
											id="invite-name"
											type="text"
											className="admin-form-input"
											value={inviteForm.name}
											onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
											placeholder="Pre-completat la activare"
										/>
									</div>
									<div className="admin-invite-form-row">
										<div className="admin-form-group">
											<label className="admin-form-label" htmlFor="invite-role">Rol</label>
											<select
												id="invite-role"
												className="admin-form-input"
												value={inviteForm.role}
												onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
											>
												<option value="student">Utilizator</option>
												<option value="instructor">Instructor</option>
												<option value="analyst">Analist</option>
											</select>
										</div>
										<div className="admin-form-group">
											<label className="admin-form-label" htmlFor="invite-team">Echipă</label>
											<select
												id="invite-team"
												className="admin-form-input"
												value={inviteForm.team_id}
												onChange={(e) => setInviteForm({ ...inviteForm, team_id: e.target.value })}
											>
												<option value="">Fără echipă</option>
												{teams.map((team) => (
													<option key={team.id} value={team.id}>{team.name}</option>
												))}
											</select>
										</div>
									</div>
								</form>
							</div>
							<div className="admin-users-modal-footer admin-invite-modal-footer">
								<button type="button" className="lms-btn-secondary" onClick={closeModal}>
									Anulează
								</button>
								<button type="submit" form="admin-invite-form" className="lms-btn-primary" disabled={inviteLoading}>
									{inviteLoading ? (
										<>
											<CircleNotch size={16} className="va-spin" aria-hidden />
											Se creează…
										</>
									) : (
										'Creează invitația'
									)}
								</button>
							</div>
						</>
					)}
				</div>
			</Modal>
		</>
	);
};

export default AdminUserInvitationsPanel;
