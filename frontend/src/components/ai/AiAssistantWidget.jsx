import React, { lazy, Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lightning, X } from '@phosphor-icons/react';
import ErrorBoundary from '../common/ErrorBoundary';
import { applyAiCoursePlan } from '../../utils/aiCoursePlan';
import { describeAiPageContext, getAiPageContext } from '../../utils/getAiPageContext';
import './AiAssistantWidget.css';

const AICourseChat = lazy(() => import('../admin/ai/AICourseChat'));

const AiAssistantWidget = () => {
	const [open, setOpen] = useState(false);
	const location = useLocation();
	const navigate = useNavigate();
	const pageContext = getAiPageContext(location);
	const courseId = pageContext.courseId;
	const testId = pageContext.testId;
	const mapId = pageContext.mapId;

	return createPortal(
		<div className="ai-widget-root">
			{open && (
				<div
					className="ai-widget-overlay"
					role="presentation"
					onClick={(e) => {
						if (e.target === e.currentTarget) setOpen(false);
					}}
				>
					<div className="ai-widget-panel" role="dialog" aria-modal="true" aria-label="Asistentul Formely AI">
						<header className="ai-widget-header">
							<div className="ai-widget-header-title">
								<span className="ai-widget-header-icon" aria-hidden>
									<Lightning size={18} weight="fill" />
								</span>
								<div>
									<h2>Formely AI</h2>
									<p>{describeAiPageContext(pageContext)}</p>
								</div>
							</div>
							<button
								type="button"
								className="ai-widget-icon-btn"
								onClick={() => setOpen(false)}
								title="Închide"
								aria-label="Închide"
							>
								<X size={18} weight="bold" />
							</button>
						</header>
						<div className="ai-widget-chat">
							<ErrorBoundary fallback={() => (
								<p className="ai-widget-loading">Formely AI nu a putut porni. Închide și deschide din nou.</p>
							)}>
								<Suspense fallback={<p className="ai-widget-loading">Se încarcă Formely AI…</p>}>
									<AICourseChat
								embed
								mode="workspace"
								title="Formely AI"
								initialCourseId={courseId}
								initialTestId={testId}
								initialMapId={mapId}
								autoApplyPlan={false}
								onApplyPlan={courseId ? (plan) => applyAiCoursePlan(courseId, plan) : null}
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
				className={`ai-widget-launcher ${open ? 'is-open' : ''}`}
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

export default AiAssistantWidget;
