import React, { lazy, Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lightning, X } from '@phosphor-icons/react';
import ErrorBoundary from '../common/ErrorBoundary';
import { applyVoltCoursePlan } from '../../utils/voltCoursePlan';
import { describeVoltPageContext, getVoltPageContext } from '../../utils/getVoltPageContext';
import './VoltAssistantWidget.css';

const AICourseChat = lazy(() => import('../admin/ai/AICourseChat'));

const VoltAssistantWidget = () => {
	const [open, setOpen] = useState(false);
	const location = useLocation();
	const navigate = useNavigate();
	const pageContext = getVoltPageContext(location);
	const courseId = pageContext.courseId;
	const testId = pageContext.testId;
	const mapId = pageContext.mapId;

	return createPortal(
		<div className="volt-widget-root">
			{open && (
				<div
					className="volt-widget-overlay"
					role="presentation"
					onClick={(e) => {
						if (e.target === e.currentTarget) setOpen(false);
					}}
				>
					<div className="volt-widget-panel" role="dialog" aria-modal="true" aria-label="Asistentul Formely AI">
						<header className="volt-widget-header">
							<div className="volt-widget-header-title">
								<span className="volt-widget-header-icon" aria-hidden>
									<Lightning size={18} weight="fill" />
								</span>
								<div>
									<h2>Formely AI</h2>
									<p>{describeVoltPageContext(pageContext)}</p>
								</div>
							</div>
							<button
								type="button"
								className="volt-widget-icon-btn"
								onClick={() => setOpen(false)}
								title="Închide"
								aria-label="Închide"
							>
								<X size={18} weight="bold" />
							</button>
						</header>
						<div className="volt-widget-chat">
							<ErrorBoundary fallback={() => (
								<p className="volt-widget-loading">Formely AI nu a putut porni. Închide și deschide din nou.</p>
							)}>
								<Suspense fallback={<p className="volt-widget-loading">Se încarcă Formely AI…</p>}>
									<AICourseChat
								embed
								mode="workspace"
								title="Formely AI"
								initialCourseId={courseId}
								initialTestId={testId}
								initialMapId={mapId}
								autoApplyPlan={false}
								onApplyPlan={courseId ? (plan) => applyVoltCoursePlan(courseId, plan) : null}
								onClose={() => setOpen(false)}
								onCourseGenerated={(course) => {
									if (course?.id) {
										setOpen(false);
										navigate(`/admin/courses/${course.id}/builder`);
									}
								}}
								onTestGenerated={(test) => {
									if (test?.id) {
										setOpen(false);
										navigate(`/admin/tests/${test.id}/builder?section=questions`);
									}
								}}
								onMapGenerated={(map) => {
									setOpen(false);
									const mapIdValue = map?.id ?? mapId;
									if (mapIdValue) {
										navigate(`/admin/maps/${mapIdValue}`);
										return;
									}
									navigate('/admin/content?tab=courses&view=maps');
								}}
								/>
								</Suspense>
							</ErrorBoundary>
						</div>
					</div>
				</div>
			)}

			<button
				type="button"
				className={`volt-widget-launcher ${open ? 'is-open' : ''}`}
				onClick={() => setOpen((prev) => !prev)}
				aria-label={open ? 'Închide Formely AI' : 'Deschide Formely AI'}
				title="Formely AI"
			>
				{open ? <X size={24} weight="bold" /> : <Lightning size={24} weight="fill" />}
			</button>
		</div>,
		document.body
	);
};

export default VoltAssistantWidget;
