import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';

import { useAuth } from '../../contexts/AuthContextShared.js';
import AdminCoursesPage from './AdminCoursesPage';
import AdminCourseMapsPage from './AdminCourseMapsPage';
import AdminQuestionBanksPage from './AdminQuestionBanksPage';
import AdminExamsPage from './AdminExamsPage';
import AdminTestsPage from './AdminTestsPage';
import AdminManualReviewPage from './AdminManualReviewPage';
import AdminMediaLibraryPage from './AdminMediaLibraryPage';

const AdminContentPage = () => {
	const { user, canMutateInAdminArea } = useAuth();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const tab = searchParams.get('tab') || 'courses';
	const rawView = searchParams.get('view') || '';
	const isInstructor = user?.actualRole === 'instructor';
	const view = isInstructor
		? 'list'
		: rawView === 'list'
			? 'list'
			: 'maps';
	const shouldOpenNewMap = searchParams.get('new') === '1';
	const activeTab = ['courses', 'tests', 'banks', 'exams', 'manual-review', 'media'].includes(tab) ? tab : 'courses';
	const showCourseMaps = activeTab === 'courses' && view === 'maps';

	useEffect(() => {
		if (!isInstructor || rawView !== 'maps') return;
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.delete('view');
			next.delete('new');
			return next;
		}, { replace: true });
	}, [isInstructor, rawView, setSearchParams]);

	return (
		<div className="admin-container admin-content-page">
			<div className="admin-content-tab-panel" role="tabpanel">
				{activeTab === 'courses' && (
					showCourseMaps
						? (
							<AdminCourseMapsPage
								embedded
								autoOpenCreate={shouldOpenNewMap}
								headerActions={canMutateInAdminArea ? (
									<button
										type="button"
										className="lms-btn-primary admin-btn-create-course"
										onClick={() => navigate('/admin/courses/new')}
									>
										<Plus size={18} weight="bold" aria-hidden />
										Creează curs
									</button>
								) : null}
							/>
						)
						: <AdminCoursesPage embedded />
				)}
				{activeTab === 'tests' && <AdminTestsPage />}
				{activeTab === 'exams' && <AdminExamsPage />}
				{activeTab === 'manual-review' && <AdminManualReviewPage />}
				{activeTab === 'banks' && <AdminQuestionBanksPage embedded />}
				{activeTab === 'media' && <AdminMediaLibraryPage />}
			</div>
		</div>
	);
};

export default AdminContentPage;
