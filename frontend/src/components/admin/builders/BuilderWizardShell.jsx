import React from 'react';
import './builder-wizard.css';

export const WizardSaveStatus = ({ status, label }) => {
	if (!status && !label) return null;
	const text = label || (
		status === 'saving'
			? 'Se salveaza...'
			: status === 'saved'
				? 'Salvat'
				: status === 'error'
					? 'Eroare salvare'
					: ''
	);
	if (!text) return null;
	return (
		<span className="builder-wizard-save-status" data-state={status || 'idle'} role="status" aria-live="polite">
			{text}
		</span>
	);
};

export const BuilderWizardFooter = ({
	onBack,
	onNext,
	disableBack = false,
	disableNext = false,
	nextLabel = 'Urmatorul',
	backLabel = 'Inapoi',
	secondaryActions = null,
	primaryActions = null,
}) => (
	<footer className="builder-wizard-footer">
		<div className="builder-wizard-footer-left">
			<button type="button" className="admin-btn admin-btn-secondary" onClick={onBack} disabled={disableBack}>
				{backLabel}
			</button>
			{onNext && (
				<button type="button" className="admin-btn admin-btn-primary" onClick={onNext} disabled={disableNext}>
					{nextLabel}
				</button>
			)}
		</div>
		<div className="builder-wizard-footer-right">
			{secondaryActions}
			{primaryActions}
		</div>
	</footer>
);

const BuilderWizardShell = ({
	title,
	subtitle,
	steps,
	currentStep,
	onStepChange,
	canOpenStep,
	headerActions,
	saveStatus,
	children,
}) => {
	return (
		<div className="builder-wizard-shell">
			<header className="builder-wizard-header">
				<div>
					<h1 className="builder-wizard-title">{title}</h1>
					{subtitle ? <p className="builder-wizard-subtitle">{subtitle}</p> : null}
				</div>
				<div className="builder-wizard-header-actions">
					<WizardSaveStatus status={saveStatus} />
					{headerActions}
				</div>
			</header>

			<nav className="builder-wizard-stepper" aria-label="Wizard steps">
				{steps.map((step, index) => {
					const isActive = currentStep === step.id;
					const isDone = index < steps.findIndex((s) => s.id === currentStep);
					const blocked = typeof canOpenStep === 'function' ? !canOpenStep(step.id) : false;
					return (
						<button
							key={step.id}
							type="button"
							className={`builder-wizard-step ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}
							onClick={() => onStepChange?.(step.id)}
							disabled={blocked}
							aria-current={isActive ? 'step' : undefined}
						>
							<span className="builder-wizard-step-index">{isDone ? '✓' : index + 1}</span>
							<span className="builder-wizard-step-label">{step.label}</span>
						</button>
					);
				})}
			</nav>

			<section className="builder-wizard-content">
				{children}
			</section>
		</div>
	);
};

export default BuilderWizardShell;
