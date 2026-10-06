import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../services/api';
import PublishCourseModal from '../components/admin/courses/PublishCourseModal';

export function isCoursePublished(course) {
	return String(course?.status || 'draft').toLowerCase() === 'published';
}

export function useCoursePublishFromCard({ onCoursePatched, showToast }) {
	const navigate = useNavigate();
	const [publishModalCourse, setPublishModalCourse] = useState(null);
	const [publishValidationReport, setPublishValidationReport] = useState(null);
	const [statusBusyId, setStatusBusyId] = useState(null);

	const closePublishModal = useCallback(() => {
		setPublishModalCourse(null);
		setPublishValidationReport(null);
	}, []);

	const handleValidateForPublish = useCallback(async () => {
		if (!publishModalCourse?.id) return null;
		const report = await adminService.builderValidateCourse(publishModalCourse.id);
		setPublishValidationReport(report);
		return report;
	}, [publishModalCourse?.id]);

	const handlePublished = useCallback((_res, { catalogOutsideMap } = {}) => {
		if (publishModalCourse?.id) {
			onCoursePatched?.(publishModalCourse.id, {
				status: 'published',
				settings: {
					...(publishModalCourse.settings || {}),
					catalog_outside_map: Boolean(catalogOutsideMap),
				},
			});
		}
		showToast?.('Cursul a fost publicat.', 'success');
		closePublishModal();
	}, [closePublishModal, onCoursePatched, publishModalCourse?.id, publishModalCourse?.settings, showToast]);

	const handleCourseStatusQuick = useCallback(
		async (course) => {
			if (!course?.id || statusBusyId) return;

			if (isCoursePublished(course)) {
				setStatusBusyId(course.id);
				try {
					await adminService.updateCourse(course.id, { status: 'draft' });
					onCoursePatched?.(course.id, { status: 'draft' });
					showToast?.('Cursul a fost retras din publicare.', 'success');
				} catch (err) {
					console.error('Course unpublish failed:', err);
					showToast?.(err?.response?.data?.message || 'Nu am putut retrage cursul din publicare.', 'error');
				} finally {
					setStatusBusyId(null);
				}
				return;
			}

			setPublishModalCourse(course);
			setPublishValidationReport(null);
			try {
				const report = await adminService.builderValidateCourse(course.id);
				setPublishValidationReport(report);
			} catch (err) {
				console.error('Course validation failed:', err);
				showToast?.(err?.response?.data?.message || 'Nu am putut valida cursul.', 'error');
			}
		},
		[onCoursePatched, showToast, statusBusyId]
	);

	const handleFixPublishIssue = useCallback((issue) => {
		const courseId = publishModalCourse?.id;
		if (!courseId || !issue?.kind || !issue.id) return;
		const params = new URLSearchParams({ focus: issue.kind === 'test' ? 'test' : issue.kind, id: String(issue.id) });
		closePublishModal();
		navigate(`/admin/courses/${courseId}/builder?${params.toString()}`);
	}, [closePublishModal, navigate, publishModalCourse?.id]);

	const publishModal = (
		<PublishCourseModal
			open={Boolean(publishModalCourse)}
			course={publishModalCourse}
			validationReport={publishValidationReport}
			onValidate={handleValidateForPublish}
			onPublished={handlePublished}
			onClose={closePublishModal}
			onFixIssue={handleFixPublishIssue}
		/>
	);

	return {
		handleCourseStatusQuick,
		statusBusyId,
		publishModal,
	};
}
