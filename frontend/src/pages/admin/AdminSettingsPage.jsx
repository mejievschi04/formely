import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../../components/common/ConfirmModal';
import ThemePreferenceControl from '../../components/ThemePreferenceControl';

const AdminSettingsPage = () => {
	const { canMutateInAdminArea } = useAuth();
	const readOnly = !canMutateInAdminArea;
	const { success, error: showError } = useToast();
	const [settings, setSettings] = useState({
		maintenance_mode: false,
		registration_enabled: true,
		email_notifications: true,
		backup_enabled: true,
		backup_frequency: 'daily',
	});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [activeTab, setActiveTab] = useState('general');
	const [confirmAction, setConfirmAction] = useState(null); // 'clearCache' | { type: 'importBackup', file }
	const [confirmLoading, setConfirmLoading] = useState(false);

	useEffect(() => {
		fetchSettings();
	}, []);

	const fetchSettings = async () => {
		try {
			setLoading(true);
			const data = await adminService.getSettings();
			setSettings(prev => ({
				...prev,
				maintenance_mode: data.maintenance_mode?.value === '1' || data.maintenance_mode?.value === true || prev.maintenance_mode,
				registration_enabled: data.registration_enabled?.value !== '0' && data.registration_enabled?.value !== false || prev.registration_enabled,
				email_notifications: data.email_notifications?.value !== '0' && data.email_notifications?.value !== false || prev.email_notifications,
				backup_enabled: data.backup_enabled?.value !== '0' && data.backup_enabled?.value !== false || prev.backup_enabled,
				backup_frequency: data.backup_frequency?.value || prev.backup_frequency,
			}));
		} catch (err) {
			console.error('Error fetching settings:', err);
		} finally {
			setLoading(false);
		}
	};

	const handleSave = async () => {
		try {
			setSaving(true);
			await adminService.updateSettings(settings);
			success('Setările au fost salvate cu succes');
		} catch (err) {
			console.error('Error saving settings:', err);
			showError('Eroare la salvarea setărilor');
		} finally {
			setSaving(false);
		}
	};


	const handleInputChange = (key, value) => {
		if (readOnly) return;
		setSettings(prev => ({
			...prev,
			[key]: value,
		}));
	};

	const handleToggle = (key) => {
		if (readOnly) return;
		setSettings(prev => ({
			...prev,
			[key]: !prev[key],
		}));
	};

	const handleExportData = async () => {
		try {
			const data = await adminService.exportData();
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `formely-backup-${new Date().toISOString().split('T')[0]}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			success('Datele au fost exportate cu succes');
		} catch (err) {
			console.error('Error exporting data:', err);
			showError('Eroare la exportarea datelor');
		}
	};

	const handleClearCacheClick = () => {
		setConfirmAction('clearCache');
	};

	const handleConfirmClearCache = async () => {
		setConfirmLoading(true);
		try {
			await adminService.clearCache();
			setConfirmAction(null);
			success('Cache-ul a fost șters cu succes');
		} catch (err) {
			console.error('Error clearing cache:', err);
			showError('Eroare la ștergerea cache-ului');
		} finally {
			setConfirmLoading(false);
		}
	};

	const handleImportBackupSelect = (event) => {
		const file = event.target.files[0];
		if (!file) return;
		if (!file.name.endsWith('.json')) {
			showError('Fișierul trebuie să fie de tip JSON');
			event.target.value = '';
			return;
		}
		setConfirmAction({ type: 'importBackup', file });
		event.target.value = '';
	};

	const handleConfirmImportBackup = async () => {
		if (!confirmAction?.file) return;
		const file = confirmAction.file;
		setConfirmLoading(true);
		try {
			const result = await adminService.importBackup(file);
			setConfirmAction(null);
			success(`Backup-ul a fost importat cu succes! Data backup: ${result.imported_date || 'necunoscută'}`);
		} catch (err) {
			console.error('Error importing backup:', err);
			showError(err.response?.data?.message || 'Eroare la importarea backup-ului');
		} finally {
			setConfirmLoading(false);
		}
	};

	if (loading) {
		return (
			<div className="admin-container">
				<div className="lms-dashboard-loading">
					<div className="lms-spinner"></div>
					<p>Se încarcă setările...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-container">
			<div className="admin-page-header">
				<div>
					<h1 className="admin-page-title">Setări</h1>
					<p className="admin-page-subtitle">
						Configurări generale, sistem și backup pentru organizația ta Formely.
					</p>
					{readOnly && (
						<p className="admin-page-subtitle" style={{ marginTop: 'var(--space-2)', color: 'var(--text-secondary)' }}>
							Vizualizare doar în citire (rol analist).
						</p>
					)}
				</div>
			</div>

			<div className="admin-settings-content">
				{/* Tabs */}
				<div className="admin-settings-tabs">
					<button
						className={`admin-settings-tab ${activeTab === 'general' ? 'active' : ''}`}
						onClick={() => setActiveTab('general')}
					>
						⚙️ General
					</button>
					<button
						className={`admin-settings-tab ${activeTab === 'system' ? 'active' : ''}`}
						onClick={() => setActiveTab('system')}
					>
						🔧 Sistem
					</button>
					<button
						className={`admin-settings-tab ${activeTab === 'backup' ? 'active' : ''}`}
						onClick={() => setActiveTab('backup')}
					>
						💾 Backup
					</button>
				</div>

				{/* General Settings */}
				{activeTab === 'general' && (
					<div className="admin-settings-section">
						<div className="admin-settings-section-header">
							<h2 className="admin-settings-section-title">
								<span className="admin-settings-section-icon">⚙️</span>
								<span>Setări Generale</span>
							</h2>
						</div>

						<div className="admin-settings-form">
							<ThemePreferenceControl className="admin-settings-theme-preference" />

							<div className="admin-settings-toggle-group">
								<div className="admin-settings-toggle">
									<div className="admin-settings-toggle-info">
										<label className="admin-settings-toggle-label">
											Înregistrări active
										</label>
									</div>
									<button
										type="button"
										className={`admin-settings-toggle-switch ${settings.registration_enabled ? 'active' : ''}`}
										onClick={() => handleToggle('registration_enabled')}
										disabled={readOnly}
										aria-disabled={readOnly}
									>
										<div className="admin-settings-toggle-slider" />
									</button>
								</div>

								<div className="admin-settings-toggle">
									<div className="admin-settings-toggle-info">
										<label className="admin-settings-toggle-label">
											Notificări Email
										</label>
									</div>
									<button
										type="button"
										className={`admin-settings-toggle-switch ${settings.email_notifications ? 'active' : ''}`}
										onClick={() => handleToggle('email_notifications')}
										disabled={readOnly}
										aria-disabled={readOnly}
									>
										<div className="admin-settings-toggle-slider" />
									</button>
								</div>
							</div>
						</div>
					</div>
				)}


				{/* System Settings */}
				{activeTab === 'system' && (
					<div className="admin-settings-section">
						<div className="admin-settings-section-header">
							<h2 className="admin-settings-section-title">
								<span className="admin-settings-section-icon">🔧</span>
								<span>Setări Sistem</span>
							</h2>
						</div>

						<div className="admin-settings-form">
							<div className="admin-settings-toggle">
								<div className="admin-settings-toggle-info">
									<label className="admin-settings-toggle-label">
										Mod Mentenanță
									</label>
								</div>
								<button
									type="button"
									className={`admin-settings-toggle-switch ${settings.maintenance_mode ? 'active' : ''}`}
									onClick={() => handleToggle('maintenance_mode')}
									disabled={readOnly}
									aria-disabled={readOnly}
								>
									<div className="admin-settings-toggle-slider" />
								</button>
							</div>

							{!readOnly && (
							<div className="admin-settings-actions-grid">
								<button
									className="admin-settings-action-btn"
									onClick={handleClearCacheClick}
								>
									<span className="admin-settings-action-icon">🗑️</span>
									<div className="admin-settings-action-content">
										<div className="admin-settings-action-title">Șterge Cache</div>
									</div>
								</button>
							</div>
							)}
						</div>
					</div>
				)}

				{/* Backup Settings */}
				{activeTab === 'backup' && (
					<div className="admin-settings-section">
						<div className="admin-settings-section-header">
							<h2 className="admin-settings-section-title">
								<span className="admin-settings-section-icon">💾</span>
								<span>Backup și export</span>
							</h2>
						</div>

						<div className="admin-settings-form">
							<div className="admin-settings-toggle">
								<div className="admin-settings-toggle-info">
									<label className="admin-settings-toggle-label">
										Backup Automat
									</label>
								</div>
								<button
									type="button"
									className={`admin-settings-toggle-switch ${settings.backup_enabled ? 'active' : ''}`}
									onClick={() => handleToggle('backup_enabled')}
									disabled={readOnly}
									aria-disabled={readOnly}
								>
									<div className="admin-settings-toggle-slider" />
								</button>
							</div>

							{settings.backup_enabled && (
								<div className="admin-settings-form-group">
									<label className="admin-settings-label">Frecvență Backup</label>
									<select
										className="admin-settings-select"
										value={settings.backup_frequency}
										onChange={(e) => handleInputChange('backup_frequency', e.target.value)}
										disabled={readOnly}
									>
										<option value="daily">Zilnic</option>
										<option value="weekly">Săptămânal</option>
										<option value="monthly">Lunar</option>
									</select>
								</div>
							)}

							{!readOnly && (
							<div className="admin-settings-actions-grid">
								<button
									className="admin-settings-action-btn"
									onClick={handleExportData}
								>
									<span className="admin-settings-action-icon">📥</span>
									<div className="admin-settings-action-content">
										<div className="admin-settings-action-title">Exportă Date</div>
									</div>
								</button>
								
								<label className="admin-settings-action-btn" style={{ cursor: 'pointer' }}>
									<input
										type="file"
										accept=".json"
										onChange={handleImportBackupSelect}
										disabled={saving}
										style={{ display: 'none' }}
									/>
									<span className="admin-settings-action-icon">📤</span>
									<div className="admin-settings-action-content">
										<div className="admin-settings-action-title">Importă Backup</div>
									</div>
								</label>
							</div>
							)}
						</div>
					</div>
				)}

				{/* Save Button */}
				{!readOnly && (
				<div className="admin-settings-actions">
					<button
						className="lms-btn-primary"
						onClick={handleSave}
						disabled={saving}
						style={{ 
							display: 'flex', 
							alignItems: 'center', 
							gap: 'var(--space-2)',
							opacity: saving ? 0.7 : 1,
							cursor: saving ? 'not-allowed' : 'pointer'
						}}
					>
						{saving ? (
							<>
								<div className="lms-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
								<span>Se salvează...</span>
							</>
						) : (
							<>
								<span>💾</span>
								<span>Salvează Setările</span>
							</>
						)}
					</button>
				</div>
				)}
			</div>

			<ConfirmModal
				open={confirmAction === 'clearCache' || confirmAction?.type === 'importBackup'}
				onClose={() => setConfirmAction(null)}
				onConfirm={confirmAction === 'clearCache' ? handleConfirmClearCache : handleConfirmImportBackup}
				title={confirmAction === 'clearCache' ? 'Șterge cache' : 'Importare backup'}
				message={confirmAction === 'clearCache'
					? 'Sigur dorești să ștergi cache-ul? Această acțiune nu poate fi anulată.'
					: 'ATENȚIE! Importarea backup-ului va suprascrie datele existente. Ești sigur că vrei să continui?'}
				confirmLabel={confirmAction === 'clearCache' ? 'Șterge cache' : 'Importă'}
				cancelLabel="Anulare"
				variant="danger"
				loading={confirmLoading}
			/>
		</div>
	);
};

export default AdminSettingsPage;

