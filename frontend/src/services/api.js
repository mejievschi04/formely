import api, { ensureApiCsrfCookie } from '../api.js';
import { logger } from '../utils/logger';
import { assertAiEnabled } from '../utils/aiAvailability.js';

// Categories are no longer supported

export const coursesService = {
  getAll: async () => {
    const response = await api.get('/courses');
    // Normalize response: handle both array and { data: [] } shapes
    const raw = response?.data;
    const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
    if (!Array.isArray(list)) {
      logger.warn('coursesService.getAll: unexpected response shape', raw);
    }
    return list;
  },
  
  getById: async (id) => {
    const response = await api.get(`/courses/${id}`);
    return response.data?.data ?? response.data;
  },
  
  /**
   * @deprecated Preferă finishCourse. Alias pentru compatibilitate (autentificat).
   */
  complete: async (id) => {
    const response = await api.post(`/courses/${id}/finish`);
    return response.data;
  },

  /** Marchează cursul finalizat (după ultima lecție + teste obligatorii). Necesită autentificare. */
  finishCourse: async (id) => {
    const response = await api.post(`/courses/${id}/finish`);
    return response.data;
  },

  /** Cursuri publicate vizibile direct în catalog, fără mapă. */
  listStandalone: async () => {
    const response = await api.get('/courses/standalone');
    return response.data?.data ?? response.data ?? [];
  },
};

/** Mape de curs pentru studenți (foldere care grupează cursuri). */
export const courseMapsService = {
  getMaps: async () => {
    try {
      const response = await api.get('/course-maps');
      const data = response.data?.data ?? response.data;
      return Array.isArray(data) ? data : [];
    } catch (e) {
      logger.warn('courseMapsService.getMaps', e);
      return [];
    }
  },
  getMap: async (id) => {
    const response = await api.get(`/course-maps/${id}`);
    return response.data;
  },
};

export const lessonsService = {
  getAll: async (courseId = null) => {
    const params = courseId ? { course_id: courseId } : {};
    const response = await api.get('/lessons', { params });
    return response.data;
  },
  
  getById: async (id) => {
    const response = await api.get(`/lessons/${id}`);
    return response.data?.data ?? response.data;
  },
  
  complete: async (id) => {
    const response = await api.post(`/lessons/${id}/complete`);
    return response.data;
  },

  generateStudyTool: async (id, tool) => {
    assertAiEnabled();
    const response = await api.post(`/lessons/${id}/study-tools`, { tool }, {
      timeout: parseInt(import.meta.env.VITE_AI_API_TIMEOUT || '120000', 10),
    });
    return response.data;
  },
};

export const notificationsService = {
  getUnreadCount: async () => {
    const response = await api.get('/notifications/unread-count');
    return response.data?.count ?? 0;
  },
  list: async (params = {}) => {
    const response = await api.get('/notifications', { params });
    return response.data?.data ?? [];
  },
  markRead: async (id) => {
    const response = await api.patch(`/notifications/${id}/read`);
    return response.data;
  },
  markAllRead: async () => {
    const response = await api.post('/notifications/mark-all-read');
    return response.data;
  },
};

/** Extrage ID numeric din notificări persistate (student: stored_12, admin: 12). */
export function parseStoredNotificationId(notifId) {
  const raw = String(notifId ?? '');
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const m = raw.match(/^stored_(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export const dashboardService = {
  getDashboard: async () => {
    // Legacy endpoint - keep for compatibility
    try {
      const response = await api.get('/dashboard');
      return response.data;
    } catch (error) {
      logger.error('Dashboard API error:', error);
      if (error.response) {
        throw new Error(error.response.data?.message || `Server error: ${error.response.status}`);
      } else if (error.request) {
        throw new Error('Nu s-a primit răspuns de la server. Verifică dacă backend-ul rulează.');
      } else {
        throw new Error(error.message || 'Eroare necunoscută');
      }
    }
  },
  
  getStudentDashboard: async () => {
    try {
      const response = await api.get('/student/dashboard');
      return response.data;
    } catch (error) {
      logger.error('Student Dashboard API error:', error);
      if (error.response) {
        throw new Error(error.response.data?.message || `Server error: ${error.response.status}`);
      } else if (error.request) {
        throw new Error('Nu s-a primit răspuns de la server. Verifică dacă backend-ul rulează.');
      } else {
        throw new Error(error.message || 'Eroare necunoscută');
      }
    }
  },
  
  getProgress: async (courseId, userId) => {
    const response = await api.get(`/courses/${courseId}/progress/${userId}`);
    return response.data;
  },
};

/** Evenimente telemetrie (auth) — ore învățare, funnel teste etc. */
export const telemetryService = {
  track: async (eventName, payload = {}, modelType = null, modelId = null) => {
    try {
      await api.post('/telemetry/events', {
        event_name: eventName,
        payload: payload || {},
        model_type: modelType,
        model_id: modelId,
      });
    } catch (e) {
      logger.debug('telemetry.track', e?.message || e);
    }
  },
};

export const courseProgressService = {
  getCourseProgress: async (courseId) => {
    const response = await api.get(`/courses/${courseId}/progress`);
    return response.data;
  },

  enrollCourse: async (courseId) => {
    const response = await api.post(`/courses/${courseId}/enroll`);
    return response.data;
  },
  
  completeLesson: async (lessonId) => {
    const response = await api.post(`/lessons/${lessonId}/complete`);
    return response.data;
  },
  
  updateLessonProgress: async (lessonId, progressData) => {
    // Update progress without marking as completed
    const response = await api.put(`/lessons/${lessonId}/progress`, progressData);
    return response.data;
  },
  
  checkModuleAccess: async (moduleId) => {
    const response = await api.get(`/modules/${moduleId}/access`);
    return response.data;
  },
  
  checkLessonAccess: async (lessonId) => {
    const response = await api.get(`/lessons/${lessonId}/access`);
    return response.data;
  },
  
  checkExamAccess: async (examId, courseId = null) => {
    const params = courseId ? { course_id: courseId } : {};
    const response = await api.get(`/exams/${examId}/access`, { params });
    return response.data;
  },
  
};

/** Notițe personale per lecție (JSON), sincronizate pe server pentru utilizatorul autentificat */
export const lessonNotesService = {
  getNotes: async (lessonId) => {
    const response = await api.get(`/lessons/${lessonId}/notes`);
    return response.data;
  },
  saveNotes: async (lessonId, notes) => {
    const response = await api.put(`/lessons/${lessonId}/notes`, { notes });
    return response.data;
  },
};

export const examService = {
  /** Examene publicate (Admin → Examene), fără teste din curs */
  listStandaloneExams: async () => {
    const response = await api.get('/exams');
    return response.data?.data ?? response.data ?? [];
  },

  /** @param {{ newAttempt?: boolean }} [options] — newAttempt: încercare nouă (seed întrebări = următoarea), nu reconstruirea ultimei încercări */
  getExam: async (examId, courseId = null, options = {}) => {
    const params = courseId ? { course_id: courseId } : {};
    if (options.newAttempt) {
      params.new_attempt = 1;
    }
    const response = await api.get(`/exams/${examId}`, { params });
    return response.data;
  },

  submitExam: async (examId, answers, courseId = null, attemptMeta = null) => {
    const payload = { answers };
    if (courseId) payload.course_id = courseId;
    if (attemptMeta && typeof attemptMeta === 'object') {
      Object.assign(payload, attemptMeta);
    }
    const response = await api.post(`/exams/${examId}/submit`, payload);
    return response.data;
  },
};

export const testService = {
  // Get test for student (from course context)
  getTest: async (testId, courseId = null) => {
    const params = courseId ? { course_id: courseId } : {};
    const response = await api.get(`/tests/${testId}`, { params });
    return response.data;
  },
  
  submitTest: async (testId, answers, courseId = null) => {
    const payload = { answers };
    if (courseId) payload.course_id = courseId;
    const response = await api.post(`/tests/${testId}/submit`, payload);
    return response.data;
  },
  
  // Get available tests for a course
  getCourseTests: async (courseId) => {
    const response = await api.get(`/courses/${courseId}/tests`);
    return response.data;
  },
};

export const achievementsService = {
  getAchievements: async () => {
    const response = await api.get('/achievements');
    return response.data;
  },
};

export const studentActivityService = {
  getActivity: async (params = {}) => {
    const response = await api.get('/student/activity', { params });
    return response.data;
  },
};

export const profileService = {
  getProfile: async () => {
    const response = await api.get('/profile');
    return response.data;
  },

  updateProfile: async (payload) => {
    const response = await api.put('/profile', payload);
    return response.data;
  },

  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const response = await api.post('/profile/avatar', formData);
    return response.data;
  },

  removeAvatar: async () => {
    const response = await api.delete('/profile/avatar');
    return response.data;
  },
};

export const eventsService = {
  getAll: async (filters = {}) => {
    const response = await api.get('/events', { params: filters });
    return response.data;
  },
  
  getById: async (id) => {
    const response = await api.get(`/events/${id}`);
    return response.data;
  },
  
  getMyEvents: async (filter = 'all') => {
    const response = await api.get('/events/my', { params: { filter } });
    return response.data;
  },
  
  register: async (eventId) => {
    const response = await api.post(`/events/${eventId}/register`);
    return response.data;
  },
  
  cancelRegistration: async (eventId) => {
    const response = await api.post(`/events/${eventId}/cancel-registration`);
    return response.data;
  },
  
  markAttendance: async (eventId) => {
    const response = await api.post(`/events/${eventId}/mark-attendance`);
    return response.data;
  },
  
  markReplayWatched: async (eventId) => {
    const response = await api.post(`/events/${eventId}/mark-replay-watched`);
    return response.data;
  },
};

export const quizService = {
  getQuiz: async (courseId) => {
    const response = await api.get(`/courses/${courseId}/quiz`);
    return response.data;
  },
  
  submitQuiz: async (courseId, answers) => {
    const response = await api.post(`/courses/${courseId}/quiz/submit`, { answers });
    return response.data;
  },
};

export const examResultsService = {
  getAll: async () => {
    const response = await api.get('/exam-results');
    return response.data;
  },
  
  getById: async (id, type = null) => {
    const params = type ? { type } : {};
    const response = await api.get(`/exam-results/${id}`, { params });
    return response.data;
  },
};

export const catalogExamResultsService = {
  getAll: async () => {
    const response = await api.get('/catalog-exam-results');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/catalog-exam-results/${id}`);
    return response.data;
  },
};

export const libraryService = {
  listItems: async (params = {}) => {
    const response = await api.get('/library/items', { params });
    return response.data;
  },

  getItem: async (id) => {
    const response = await api.get(`/library/items/${id}`);
    return response.data;
  },

  uploadItem: async ({ file, title, description, cover }) => {
    await ensureApiCsrfCookie();
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    if (description) formData.append('description', description);
    if (cover instanceof Blob) {
      formData.append('cover', cover, 'cover.jpg');
    }
    const response = await api.post('/library/items', formData, {
      timeout: parseInt(import.meta.env.VITE_UPLOAD_TIMEOUT || "600000"),
    });
    return response.data;
  },

  deleteItem: async (id) => {
    const response = await api.delete(`/library/items/${id}`);
    return response.data;
  },

  createTextItem: async ({ title, description, body, cover, removeCover = false }) => {
    await ensureApiCsrfCookie();
    const formData = new FormData();
    formData.append('content_type', 'text');
    formData.append('title', title);
    if (description) formData.append('description', description);
    formData.append('body', body);
    if (cover instanceof Blob) {
      formData.append('cover', cover, cover.name || 'cover.jpg');
    }
    const response = await api.post('/library/items', formData, {
      timeout: parseInt(import.meta.env.VITE_UPLOAD_TIMEOUT || '600000'),
    });
    return response.data;
  },

  updateTextItem: async (id, { title, description, body, cover, removeCover = false }) => {
    await ensureApiCsrfCookie();
    const hasCoverChange = cover instanceof Blob || removeCover;

    if (hasCoverChange) {
      const formData = new FormData();
      formData.append('title', title);
      if (description) formData.append('description', description);
      formData.append('body', body);
      if (removeCover) formData.append('remove_cover', '1');
      if (cover instanceof Blob) {
        formData.append('cover', cover, cover.name || 'cover.jpg');
      }
      const response = await api.post(`/library/items/${id}`, formData, {
        timeout: parseInt(import.meta.env.VITE_UPLOAD_TIMEOUT || '600000'),
      });
      return response.data;
    }

    const response = await api.put(`/library/items/${id}`, {
      title,
      description: description || undefined,
      body,
    });
    return response.data;
  },

  /** Descarcă fișierul (blob); folosește numele din antet sau fallbackName. */
  downloadItemBlob: async (id, fallbackName = 'document') => {
    const response = await api.get(`/library/items/${id}/download`, {
      responseType: 'blob',
    });
    let name = fallbackName;
    const cd = response.headers['content-disposition'];
    if (cd && typeof cd === 'string') {
      const utf8 = /filename\*=UTF-8''([^;\s]+)/i.exec(cd);
      const plain = /filename="([^"]+)"/i.exec(cd);
      try {
        if (utf8?.[1]) name = decodeURIComponent(utf8[1]);
        else if (plain?.[1]) name = plain[1];
      } catch {
        /* păstrăm fallbackName */
      }
    }
    return { blob: response.data, filename: name };
  },
};


export const authService = {
  register: async (name, email, password) => {
    await ensureApiCsrfCookie();
    const response = await api.post('/auth/register', { name, email, password });
    return response.data;
  },
  
  login: async (email, password) => {
    await ensureApiCsrfCookie();
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },
  
  logout: async () => {
    await ensureApiCsrfCookie();
    const response = await api.post('/auth/logout');
    return response.data;
  },
  
  me: async () => {
    try {
      const response = await api.get('/auth/me');
      return response.data;
    } catch (error) {
      // 401 is expected when user is not authenticated
      // Return null user data instead of throwing
      if (error.response?.status === 401) {
        return { user: null };
      }
      if (error.response?.status === 403 && (error.response?.data?.access_blocked || error.response?.data?.suspended)) {
        return {
          user: null,
          access_blocked: true,
          suspended: Boolean(error.response?.data?.suspended),
          inactive: Boolean(error.response?.data?.inactive),
          message: error.response?.data?.message || 'Accesul la cont este restricționat.',
        };
      }
      throw error;
    }
  },
  
  changePassword: async (currentPassword, newPassword, newPasswordConfirmation) => {
    await ensureApiCsrfCookie();
    const response = await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
      new_password_confirmation: newPasswordConfirmation,
    });
    return response.data;
  },

  forgotPassword: async (email) => {
    await ensureApiCsrfCookie();
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async ({ token, email, password, password_confirmation }) => {
    await ensureApiCsrfCookie();
    const response = await api.post('/auth/reset-password', {
      token,
      email,
      password,
      password_confirmation,
    });
    return response.data;
  },

  validateInvitation: async (token) => {
    const response = await api.get('/auth/invitations/validate', { params: { token } });
    return response.data;
  },

  acceptInvitation: async ({ token, name, password, password_confirmation }) => {
    await ensureApiCsrfCookie();
    const response = await api.post('/auth/invitations/accept', {
      token,
      name,
      password,
      password_confirmation,
    });
    return response.data;
  },
};

export const adminService = {
  // Dashboard
  getDashboard: async (params = {}) => {
    const response = await api.get('/admin/dashboard', { params });
    return response.data;
  },

  dismissDashboardAlert: async (alertId) => {
    const response = await api.post('/admin/alerts/dismiss', { alert_id: alertId });
    return response.data;
  },

  // Courses
  getCourses: async (params = {}) => {
    const response = await api.get('/admin/courses', { params });
    // Handle paginated response (Laravel returns {data: [...], current_page, etc.})
    // or plain array response
    const data = response.data;
    logger.debug('adminService.getCourses: Raw response:', data);
    logger.debug('adminService.getCourses: Is array?', Array.isArray(data));
    logger.debug('adminService.getCourses: Has data property?', data?.data);
    
    // Laravel paginator returns {data: [...], current_page, per_page, total, ...}
    if (Array.isArray(data)) {
      return data;
    }
    
    // If it's a paginated response, extract the data array
    if (data && data.data && Array.isArray(data.data)) {
      return data.data;
    }
    
    // Fallback: return empty array
    logger.warn('adminService.getCourses: Unexpected response format, returning empty array');
    return [];
  },

  reorderCoursesList: async (courseIds) => {
    const response = await api.post('/admin/courses/reorder', { course_ids: courseIds });
    return response.data;
  },

  getCourse: async (id) => {
    const response = await api.get(`/admin/courses/${id}`);
    return response.data;
  },
  
  createCourse: async (courseData) => {
    const isFormData = courseData instanceof FormData;
    const config = isFormData
      ? {} // axios setează automat Content-Type cu boundary pentru FormData
      : {
          headers: { 'Content-Type': 'application/json' },
        };
    const payload = isFormData
      ? courseData
      : (() => {
          const { modules, ...rest } = courseData;
          return rest;
        })();
    const response = await api.post('/admin/courses', payload, config);
    return response.data;
  },
  
  updateCourse: async (id, courseData) => {
    const isFormData = courseData instanceof FormData;
    const config = isFormData
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
        };
    const method = isFormData ? 'post' : 'put';
    const response = await api[method](`/admin/courses/${id}`, courseData, config);
    return response.data;
  },
  
  deleteCourse: async (id) => {
    const response = await api.delete(`/admin/courses/${id}`);
    return response.data;
  },

  getTeachers: async () => {
    const response = await api.get('/admin/courses/teachers/list');
    return response.data;
  },

  // Modules
  getModules: async (courseId = null) => {
    const params = courseId ? { course_id: courseId } : {};
    const response = await api.get('/admin/modules', { params });
    return response.data;
  },
  
  getModule: async (id) => {
    const response = await api.get(`/admin/modules/${id}`);
    return response.data;
  },
  
  createModule: async (moduleData) => {
    const response = await api.post('/admin/modules', moduleData);
    return response.data;
  },
  
  updateModule: async (id, moduleData) => {
    const response = await api.put(`/admin/modules/${id}`, moduleData);
    return response.data;
  },
  
  deleteModule: async (id) => {
    const response = await api.delete(`/admin/modules/${id}`);
    return response.data;
  },

  // Lessons
  getLessons: async (moduleId = null, courseId = null) => {
    const params = {};
    if (moduleId) params.module_id = moduleId;
    if (courseId) params.course_id = courseId;
    const response = await api.get('/admin/lessons', { params });
    return response.data;
  },
  
  getLesson: async (id) => {
    const response = await api.get(`/admin/lessons/${id}`);
    return response.data;
  },
  
  createLesson: async (lessonData) => {
    const response = await api.post('/admin/lessons', lessonData);
    return response.data;
  },
  
  updateLesson: async (id, lessonData) => {
    const response = await api.put(`/admin/lessons/${id}`, lessonData);
    return response.data;
  },
  
  deleteLesson: async (id) => {
    const response = await api.delete(`/admin/lessons/${id}`);
    return response.data;
  },

  // Exams (Legacy - kept for backward compatibility)
  // ============================================
  // DEPRECATED: Exam Management (Legacy)
  // ============================================
  // These methods are kept for backward compatibility with existing exams.
  // For new development, use the Test Builder (getTests, createTest, etc.)
  // Migration path: Exams → Tests (standalone test builder)
  // ============================================
  
  /**
   * @deprecated Use getTests() instead. Kept for backward compatibility.
   */
  getExams: async (courseId = null) => {
    const params = courseId ? { course_id: courseId } : {};
    const response = await api.get('/admin/exams', { params });
    return response.data;
  },
  
  /**
   * @deprecated Use getTest() instead. Kept for backward compatibility.
   */
  getExam: async (id) => {
    const response = await api.get(`/admin/exams/${id}`);
    return response.data;
  },

  previewExam: async (id) => {
    const response = await api.get(`/admin/exams/${id}/preview`);
    return response.data;
  },

  getExamResults: async (id) => {
    const response = await api.get(`/admin/exams/${id}/results`);
    return response.data;
  },

  getExamQuestionAnalytics: async (id) => {
    const response = await api.get(`/admin/exams/${id}/question-analytics`);
    return response.data;
  },
  
  /**
   * @deprecated Use createTest() instead. Kept for backward compatibility.
   */
  createExam: async (examData) => {
    const response = await api.post('/admin/exams', examData);
    return response.data;
  },
  
  /**
   * @deprecated Use updateTest() instead. Kept for backward compatibility.
   */
  updateExam: async (id, examData) => {
    const response = await api.put(`/admin/exams/${id}`, examData);
    return response.data;
  },

  patchExamStatus: async (id, status) => {
    const response = await api.patch(`/admin/exams/${id}/status`, { status });
    return response.data;
  },

  duplicateExam: async (id, payload = {}) => {
    const response = await api.post(`/admin/exams/${id}/duplicate`, payload);
    return response.data;
  },

  uploadExamCover: async (id, formData) => {
    const response = await api.post(`/admin/exams/${id}/cover`, formData);
    return response.data;
  },
  
  /**
   * @deprecated Use deleteTest() instead. Kept for backward compatibility.
   */
  deleteExam: async (id) => {
    const response = await api.delete(`/admin/exams/${id}`);
    return response.data;
  },

  // Tests (Standalone Test Builder)
  getTests: async (params = {}) => {
    const response = await api.get('/admin/tests', { params });
    const data = response.data;
    return Array.isArray(data) ? data : (data?.data || []);
  },
  
  getTest: async (id) => {
    const response = await api.get(`/admin/tests/${id}`);
    return response.data;
  },

  getTestResults: async (id, params = {}) => {
    const response = await api.get(`/admin/tests/${id}/results`, { params });
    return response.data;
  },

  getTestQuestionAnalytics: async (id, params = {}) => {
    const response = await api.get(`/admin/tests/${id}/question-analytics`, { params });
    return response.data;
  },

  getTestStatisticsSummary: async (testId) => {
    const response = await api.get(`/admin/tests/${testId}/statistics`);
    return response.data;
  },

  getTestResultBreakdown: async (resultId) => {
    const response = await api.get(`/admin/test-results/${resultId}/breakdown`);
    return response.data;
  },

  updateTestResultScore: async (resultId, score, note = '') => {
    const response = await api.patch(`/admin/test-results/${resultId}/score`, {
      score,
      note: note || undefined,
    });
    return response.data;
  },

  exportTestResultsCsv: async (params = {}) => {
    const response = await api.get('/admin/test-results/export', {
      params,
      responseType: 'blob',
    });
    return response;
  },

  exportSingleTestResultsCsv: async (testId, params = {}) => {
    const response = await api.get(`/admin/tests/${testId}/results/export`, {
      params,
      responseType: 'blob',
    });
    return response;
  },
  
  createTest: async (testData) => {
    const response = await api.post('/admin/tests', testData);
    return response.data;
  },

  /** Creează examen independent (catalog elevi) dintr-un test existent */
  promoteTestToStandaloneExam: async (testId) => {
    const response = await api.post(`/admin/tests/${testId}/promote-to-exam`);
    return response.data;
  },
  
  updateTest: async (id, testData) => {
    const response = await api.put(`/admin/tests/${id}`, testData);
    return response.data;
  },
  
  deleteTest: async (id) => {
    const response = await api.delete(`/admin/tests/${id}`);
    return response.data;
  },

  publishTest: async (id) => {
    const response = await api.post(`/admin/tests/${id}/publish`);
    return response.data;
  },

  previewTestSelection: async (id, payload = {}) => {
    const response = await api.post(`/admin/tests/${id}/selection-preview`, payload);
    return response.data;
  },

  linkTestToCourse: async (testId, courseId, options = {}) => {
    const response = await api.post(`/admin/tests/${testId}/link-to-course`, {
      course_id: courseId,
      ...options,
    });
    return response.data;
  },

  unlinkTestFromCourse: async (testId, courseId, scope = null, scopeId = null) => {
    const response = await api.post(`/admin/tests/${testId}/unlink-from-course`, {
      course_id: courseId,
      scope,
      scope_id: scopeId,
    });
    return response.data;
  },

  // Questions
  getQuestions: async (testId) => {
    const response = await api.get(`/admin/tests/${testId}/questions`);
    return response.data;
  },

  createQuestion: async (testId, questionData) => {
    const response = await api.post(`/admin/tests/${testId}/questions`, questionData);
    return response.data;
  },

  reorderTestQuestions: async (testId, questionIds) => {
    const response = await api.post(`/admin/tests/${testId}/questions/reorder`, {
      question_ids: questionIds,
    });
    return response.data;
  },

  listQuestions: async (params = {}) => {
    const response = await api.get('/admin/questions', { params });
    return response.data;
  },

  moveQuestionsToFolderBulk: async (questionIds = [], targetBankId) => {
    const response = await api.post('/admin/questions/bulk-move', {
      question_ids: questionIds,
      target_bank_id: targetBankId,
    });
    return response.data;
  },

  getQuestionTagSuggestions: async (search = '') => {
    const response = await api.get('/admin/questions/tag-suggestions', {
      params: search ? { search } : {},
    });
    return Array.isArray(response?.data?.tags) ? response.data.tags : [];
  },

  updateQuestion: async (questionId, questionData) => {
    const response = await api.put(`/admin/questions/${questionId}`, questionData);
    return response.data;
  },

  toggleQuestionStar: async (questionId) => {
    const response = await api.post(`/admin/questions/${questionId}/toggle-star`);
    return response.data;
  },

  deleteQuestion: async (questionId) => {
    const response = await api.delete(`/admin/questions/${questionId}`);
    return response.data;
  },

  // Course maps (folders to group courses)
  getCourseMaps: async (params = {}) => {
    const response = await api.get('/admin/course-maps', { params });
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data?.data && Array.isArray(data.data)) return data.data;
    return [];
  },

  getCourseMap: async (id) => {
    const response = await api.get(`/admin/course-maps/${id}`);
    return response.data;
  },

  createCourseMap: async (payload) => {
    const response = await api.post('/admin/course-maps', payload);
    return response.data;
  },

  updateCourseMap: async (id, payload) => {
    const response = await api.put(`/admin/course-maps/${id}`, payload);
    return response.data;
  },

  deleteCourseMap: async (id) => {
    await api.delete(`/admin/course-maps/${id}`);
  },

  attachCoursesToMap: async (mapId, courseIds) => {
    const response = await api.post(`/admin/course-maps/${mapId}/courses`, { course_ids: courseIds });
    return response.data;
  },

  detachCourseFromMap: async (mapId, courseId) => {
    await api.delete(`/admin/course-maps/${mapId}/courses/${courseId}`);
  },

  reorderCourseMapCourses: async (mapId, order) => {
    const response = await api.post(`/admin/course-maps/${mapId}/courses/reorder`, { order });
    return response.data;
  },

  reorderCourseMaps: async (mapIds) => {
    const response = await api.post('/admin/course-maps/reorder', { map_ids: mapIds });
    return response.data;
  },

  uploadCourseMapCover: async (mapId, file, focus) => {
    const formData = new FormData();
    formData.append('cover', file);
    if (focus) {
      formData.append('cover_focus', JSON.stringify(focus));
    }
    const response = await api.post(`/admin/course-maps/${mapId}/cover`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deleteCourseMapCover: async (mapId) => {
    const response = await api.delete(`/admin/course-maps/${mapId}/cover`);
    return response.data;
  },

  // Question Banks
  getQuestionCatalogMaps: async (params = {}) => {
    const response = await api.get('/admin/question-catalog/maps', { params });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  getQuestionCatalogMapTests: async (mapId, params = {}) => {
    const response = await api.get(`/admin/question-catalog/maps/${mapId}/tests`, { params });
    return response.data;
  },

  getQuestionBanks: async (params = {}) => {
    const response = await api.get('/admin/question-banks', { params });
    const data = response.data;
    return Array.isArray(data) ? data : (data?.data || []);
  },
  
  getQuestionBank: async (id) => {
    const response = await api.get(`/admin/question-banks/${id}`);
    return response.data;
  },
  
  createQuestionBank: async (bankData) => {
    const response = await api.post('/admin/question-banks', bankData);
    return response.data;
  },
  
  updateQuestionBank: async (id, bankData) => {
    const response = await api.put(`/admin/question-banks/${id}`, bankData);
    return response.data;
  },
  
  deleteQuestionBank: async (id) => {
    const response = await api.delete(`/admin/question-banks/${id}`);
    return response.data;
  },

  getQuestionBankQuestions: async (bankId) => {
    const response = await api.get(`/admin/question-banks/${bankId}/questions`);
    return response.data;
  },

  reorderQuestionBankQuestions: async (bankId, questionIds) => {
    const response = await api.post(`/admin/question-banks/${bankId}/questions/reorder`, {
      question_ids: questionIds,
    });
    return response.data;
  },

  addQuestionToBank: async (bankId, questionData) => {
    const response = await api.post(`/admin/question-banks/${bankId}/questions`, questionData);
    return response.data;
  },

  updateQuestionInBank: async (bankId, questionId, questionData) => {
    const response = await api.put(`/admin/question-banks/${bankId}/questions/${questionId}`, questionData);
    return response.data;
  },

  removeQuestionFromBank: async (bankId, questionId) => {
    const response = await api.delete(`/admin/question-banks/${bankId}/questions/${questionId}`);
    return response.data;
  },

  addQuestionsToBankBulk: async (bankId, questions = []) => {
    const response = await api.post(`/admin/question-banks/${bankId}/questions/bulk`, {
      questions,
    });
    return response.data;
  },

  previewQuestionsWithAi: async (bankId, payload = {}) => {
    assertAiEnabled();
    const response = await api.post(`/admin/question-banks/${bankId}/ai/preview`, payload, {
      timeout: parseInt(import.meta.env.VITE_AI_API_TIMEOUT || '120000', 10),
    });
    return response.data;
  },

  improveQuestionWithAi: async (questionId, instruction = '') => {
    assertAiEnabled();
    const response = await api.post(
      `/admin/questions/${questionId}/improve`,
      {
        instruction,
      },
      {
        timeout: parseInt(import.meta.env.VITE_AI_API_TIMEOUT || '120000', 10),
      }
    );
    return response.data;
  },

  autoTagQuestionWithAi: async (questionId) => {
    assertAiEnabled();
    const response = await api.post(`/admin/questions/${questionId}/auto-tag`);
    return response.data;
  },

  generateQuestionsFromCourse: async (bankId, courseId, options = {}) => {
    assertAiEnabled();
    const response = await api.post(`/admin/question-banks/${bankId}/generate-from-course`, {
      course_id: courseId,
      ...options
    });
    return response.data;
  },

  generateQuestionsFromText: async (bankId, content, options = {}) => {
    const response = await api.post(`/admin/question-banks/${bankId}/generate-from-text`, {
      content: content,
      ...options
    });
    return response.data;
  },

  // Events
  getEvents: async (filters = {}) => {
    const response = await api.get('/admin/events', { params: filters });
    return response.data;
  },
  
  getEvent: async (id) => {
    const response = await api.get(`/admin/events/${id}`);
    return response.data;
  },
  
  createEvent: async (eventData) => {
    await ensureApiCsrfCookie();
    const response = await api.post('/admin/events', eventData);
    return response.data;
  },
  
  updateEvent: async (id, eventData) => {
    await ensureApiCsrfCookie();
    const response = await api.put(`/admin/events/${id}`, eventData);
    return response.data;
  },
  
  deleteEvent: async (id) => {
    await ensureApiCsrfCookie();
    const response = await api.delete(`/admin/events/${id}`);
    return response.data;
  },
  
  eventQuickAction: async (id, action) => {
    await ensureApiCsrfCookie();
    const response = await api.post(`/admin/events/${id}/actions/${action}`);
    return response.data;
  },
  
  eventBulkAction: async (action, eventIds) => {
    await ensureApiCsrfCookie();
    const response = await api.post('/admin/events/bulk-actions', {
      action,
      event_ids: eventIds,
    });
    return response.data;
  },
  
  getEventInsights: async () => {
    const response = await api.get('/admin/events/insights');
    return response.data;
  },
  
  getEventInstructors: async () => {
    const response = await api.get('/admin/events/instructors/list');
    return response.data;
  },

  setEventParticipantAttendance: async (eventId, userId, attended) => {
    await ensureApiCsrfCookie();
    const response = await api.put(`/admin/events/${eventId}/participants/${userId}/attendance`, {
      attended,
    });
    return response.data;
  },

  // Organization (departments + teams)
  getOrganizationTree: async () => {
    const response = await api.get('/admin/organization');
    return response.data;
  },

  getDepartments: async () => {
    const response = await api.get('/admin/departments');
    return response.data;
  },

  createDepartment: async (data) => {
    const response = await api.post('/admin/departments', data);
    return response.data;
  },

  updateDepartment: async (id, data) => {
    const response = await api.put(`/admin/departments/${id}`, data);
    return response.data;
  },

  deleteDepartment: async (id) => {
    const response = await api.delete(`/admin/departments/${id}`);
    return response.data;
  },

  reorderDepartments: async (departmentIds) => {
    const response = await api.post('/admin/departments/reorder', { department_ids: departmentIds });
    return response.data;
  },

  // Teams
  getTeams: async () => {
    const response = await api.get('/admin/teams');
    return response.data;
  },
  
  getTeam: async (id) => {
    const response = await api.get(`/admin/teams/${id}`);
    return response.data;
  },
  
  createTeam: async (teamData) => {
    const response = await api.post('/admin/teams', teamData);
    return response.data;
  },
  
  updateTeam: async (id, teamData) => {
    const response = await api.put(`/admin/teams/${id}`, teamData);
    return response.data;
  },
  
  deleteTeam: async (id) => {
    const response = await api.delete(`/admin/teams/${id}`);
    return response.data;
  },
  
  attachUsersToTeam: async (teamId, userIds) => {
    const response = await api.post(`/admin/teams/${teamId}/users`, { user_ids: userIds });
    return response.data;
  },
  
  attachCoursesToTeam: async (teamId, courseIds) => {
    const response = await api.post(`/admin/teams/${teamId}/courses`, { course_ids: courseIds });
    return response.data;
  },

  reorderTeams: async (teamIds) => {
    const response = await api.post('/admin/teams/reorder', { team_ids: teamIds });
    return response.data;
  },

  attachCoursesToTeamMember: async (teamId, userId, courseIds, options = {}) => {
    const response = await api.post(`/admin/teams/${teamId}/users/${userId}/courses/attach`, {
      course_ids: courseIds,
      ...options,
    });
    return response.data;
  },

  // Users
  getUsers: async (params = {}) => {
    const response = await api.get('/admin/users', { params });
    // Handle paginated response (Laravel returns {data: [...], current_page, etc.})
    // or plain array response
    const data = response.data;
    return Array.isArray(data) ? data : (data.data || []);
  },
  
  getUser: async (id) => {
    const response = await api.get(`/admin/users/${id}`);
    return response.data;
  },

  grantTestExtraAttempt: async (userId, testId, courseId) => {
    const response = await api.post(`/admin/users/${userId}/tests/${testId}/extra-attempt`, {
      course_id: courseId || undefined,
    });
    return response.data;
  },

  markCourseCompleted: async (userId, courseId) => {
    const response = await api.post(`/admin/users/${userId}/courses/${courseId}/complete`);
    return response.data;
  },
  
  createUser: async (userData) => {
    const response = await api.post('/admin/users', userData);
    return response.data;
  },
  
  updateUser: async (id, userData) => {
    const response = await api.put(`/admin/users/${id}`, userData);
    return response.data;
  },
  
  deleteUser: async (id) => {
    const response = await api.delete(`/admin/users/${id}`);
    return response.data;
  },

  restoreUser: async (id) => {
    const response = await api.post(`/admin/users/${id}/restore`);
    return response.data;
  },

  forceDeleteUser: async (id) => {
    const response = await api.delete(`/admin/users/${id}/force`);
    return response.data;
  },

  approveUser: async (id) => {
    const response = await api.post(`/admin/users/${id}/approve`);
    return response.data;
  },

  rejectUser: async (id) => {
    const response = await api.post(`/admin/users/${id}/reject`);
    return response.data;
  },

  activateUser: async (id) => {
    const response = await api.post(`/admin/users/${id}/activate`);
    return response.data;
  },

  deactivateUser: async (id) => {
    const response = await api.post(`/admin/users/${id}/deactivate`);
    return response.data;
  },

  getUserInvitations: async (params = {}) => {
    const response = await api.get('/admin/users/invitations', { params });
    return response.data;
  },

  sendUserInvitations: async (payload) => {
    const response = await api.post('/admin/users/invitations', payload);
    return response.data;
  },

  sendUserInvitation: async (payload) => {
    const response = await api.post('/admin/users/invitations', payload);
    return response.data;
  },

  copyUserInvitationLink: async (id) => {
    const response = await api.post(`/admin/users/invitations/${id}/copy-link`);
    return response.data;
  },

  cancelUserInvitation: async (id) => {
    const response = await api.delete(`/admin/users/invitations/${id}`);
    return response.data;
  },

  resendUserInvitation: async (id) => {
    const response = await api.post(`/admin/users/invitations/${id}/resend`);
    return response.data;
  },

  assignCourses: async (userId, courseIds, isMandatory = true) => {
    const response = await api.post(`/admin/users/${userId}/courses`, {
      course_ids: courseIds,
      is_mandatory: isMandatory,
    });
    return response.data;
  },

  removeCourse: async (userId, courseId) => {
    const response = await api.delete(`/admin/users/${userId}/courses/${courseId}`);
    return response.data;
  },

  // Team Members Management
  getTeamMembers: async (params = {}) => {
    const response = await api.get('/admin/team-members', { params });
    const data = response.data;
    return Array.isArray(data) ? data : (data.data || []);
  },

  updateRoleAndPermissions: async (userId, role, permissions) => {
    const response = await api.put(`/admin/team-members/${userId}/role-permissions`, {
      role,
      permissions,
    });
    return response.data;
  },

  activateTeamMember: async (userId) => {
    const response = await api.post(`/admin/team-members/${userId}/activate`);
    return response.data;
  },

  suspendTeamMember: async (userId, reason = null, suspendedUntil = null) => {
    const response = await api.post(`/admin/team-members/${userId}/suspend`, {
      reason,
      suspended_until: suspendedUntil,
    });
    return response.data;
  },

  resetTeamMemberAccess: async (userId) => {
    const response = await api.post(`/admin/team-members/${userId}/reset-access`);
    return response.data;
  },

  removeTeamMemberFromTeam: async (userId) => {
    const response = await api.post(`/admin/team-members/${userId}/remove-from-team`);
    return response.data;
  },

  // Course Teams
  attachTeamsToCourse: async (courseId, teamIds) => {
    const response = await api.post(`/admin/courses/${courseId}/teams`, { team_ids: teamIds });
    return response.data;
  },

  getAssignableTeamsForCourse: async (courseId) => {
    const response = await api.get(`/admin/courses/${courseId}/assignable-teams`);
    return response.data;
  },

  getAssignableLearnersForCourse: async (courseId, params = {}) => {
    const response = await api.get(`/admin/courses/${courseId}/assignable-learners`, { params });
    return response.data;
  },

  attachLearnersToCourse: async (courseId, userIds, options = {}) => {
    const response = await api.post(`/admin/courses/${courseId}/learners`, {
      user_ids: userIds,
      ...options,
    });
    return response.data;
  },

  detachLearnerFromCourse: async (courseId, userId) => {
    const response = await api.delete(`/admin/courses/${courseId}/learners/${userId}`);
    return response.data;
  },

  // Categories are no longer supported

  // Activity Logs
  getActivityLogs: async (params = {}) => {
    const response = await api.get('/admin/activity-logs', { params });
    return response.data;
  },
  
  getActivityLog: async (id) => {
    const response = await api.get(`/admin/activity-logs/${id}`);
    return response.data;
  },

  // Test Manual Review (Test model - standalone tests)
  getPendingTestReviews: async () => {
    const response = await api.get('/admin/tests/pending-reviews');
    return response.data;
  },

  clearPendingTestReviews: async (olderThanDays = 30) => {
    const response = await api.post('/admin/tests/pending-reviews/clear', {
      older_than_days: olderThanDays,
    });
    return response.data;
  },

  submitTestManualReview: async (resultId, reviewScores, overallFeedback = '') => {
    const response = await api.post(`/admin/test-results/${resultId}/manual-review`, {
      manual_review_scores: reviewScores,
      overall_feedback: overallFeedback || undefined,
    });
    return response.data;
  },

  getPendingExamReviews: async () => {
    const response = await api.get('/admin/exams/pending-reviews');
    return response.data;
  },

  clearPendingExamReviews: async (olderThanDays = 30) => {
    const response = await api.post('/admin/exams/pending-reviews/clear', {
      older_than_days: olderThanDays,
    });
    return response.data;
  },

  submitExamManualReview: async (resultId, reviewScores, overallFeedback = '') => {
    const response = await api.post(`/admin/exam-results/${resultId}/manual-review`, {
      manual_review_scores: reviewScores,
      overall_feedback: overallFeedback || undefined,
    });
    return response.data;
  },

  // Course Quick Actions
  courseQuickAction: async (courseId, action) => {
    const response = await api.post(`/admin/courses/${courseId}/actions/${action}`);
    return response.data;
  },

  // Course Bulk Actions
  courseBulkAction: async (courseIds, action) => {
    const response = await api.post('/admin/courses/bulk-actions', {
      course_ids: courseIds,
      action: action,
    });
    return response.data;
  },

  getStatisticsCourseTestDetail: async (params = {}) => {
    const response = await api.get('/admin/statistics/course-test-detail', { params });
    return response.data;
  },

  generateStatisticsExportWithAi: async (payload = {}) => {
    const response = await api.post('/admin/statistics/ai-export', payload);
    return response.data;
  },

  previewTestWithAi: async (payload = {}) => {
    assertAiEnabled();
    const response = await api.post('/admin/tests/ai/preview-from-course', payload, {
      timeout: parseInt(import.meta.env.VITE_AI_API_TIMEOUT || '120000', 10),
    });
    return response.data;
  },

  suggestTestBlueprintWithAi: async (payload = {}) => {
    assertAiEnabled();
    const response = await api.post('/admin/tests/ai/suggest-blueprint-from-course', payload, {
      timeout: parseInt(import.meta.env.VITE_AI_API_TIMEOUT || '120000', 10),
    });
    return response.data;
  },

  regenerateTestQuestionWithAi: async (payload = {}) => {
    assertAiEnabled();
    const response = await api.post('/admin/tests/ai/regenerate-question-from-course', payload, {
      timeout: parseInt(import.meta.env.VITE_AI_API_TIMEOUT || '120000', 10),
    });
    return response.data;
  },

  createTestWithAi: async (payload = {}) => {
    assertAiEnabled();
    const response = await api.post('/admin/tests/ai/create-from-course', payload, {
      timeout: parseInt(import.meta.env.VITE_AI_API_TIMEOUT || '120000', 10),
    });
    return response.data;
  },

  suggestManualReviewFeedbackWithAi: async (resultId) => {
    assertAiEnabled();
    const response = await api.post(`/admin/test-results/${resultId}/feedback-with-ai`);
    return response.data;
  },

  getStatisticsAiExportDatasets: async () => {
    const response = await api.get('/admin/statistics/ai-export/datasets');
    return response.data;
  },

  listPlatformCompanies: async (params = {}) => {
    const response = await api.get('/admin/platform/companies', { params });
    return response.data;
  },

  getPlatformOverview: async () => {
    const response = await api.get('/admin/platform/overview');
    return response.data;
  },

  getPlatformPlans: async () => {
    const response = await api.get('/admin/platform/plans');
    return response.data;
  },

  getPlatformCompany: async (id) => {
    const response = await api.get(`/admin/platform/companies/${id}`);
    return response.data;
  },

  createPlatformCompany: async (payload) => {
    const response = await api.post('/admin/platform/companies', payload);
    return response.data;
  },

  updatePlatformCompany: async (id, payload) => {
    const response = await api.put(`/admin/platform/companies/${id}`, payload);
    return response.data;
  },

  invitePlatformCompanyOwner: async (id, payload) => {
    const response = await api.post(`/admin/platform/companies/${id}/invite-owner`, payload);
    return response.data;
  },

  listPlatformLeads: async (params = {}) => {
    const response = await api.get('/admin/platform/leads', { params });
    return response.data;
  },

  updatePlatformLead: async (id, payload) => {
    const response = await api.put(`/admin/platform/leads/${id}`, payload);
    return response.data;
  },

  getCompanyEntitlements: async () => {
    const response = await api.get('/admin/company/entitlements');
    return response.data;
  },

  // Course Insights
  getCourseInsights: async () => {
    const response = await api.get('/admin/courses/insights');
    return response.data;
  },

  // Course Preview
  previewCourse: async (id) => {
    const response = await api.get(`/admin/courses/${id}/preview`);
    return response.data;
  },

  // ============================================================
  // Course Builder (Admin) - autosave + drag&drop orchestration
  // ============================================================
  getCourseBuilderStructure: async (courseId) => {
    const response = await api.get(`/admin/courses/${courseId}/builder/structure`, {
      params: { _t: Date.now() }, // evita cache-ul care poate returna ordinea veche
    });
    return response.data;
  },

  patchCourseBuilderStructure: async (courseId, ops) => {
    const response = await api.patch(`/admin/courses/${courseId}/builder/structure`, { ops });
    return response.data;
  },

  builderCreateModule: async (courseId, moduleData) => {
    const response = await api.post(`/admin/courses/${courseId}/builder/modules`, moduleData);
    return response.data;
  },

  builderCreateLesson: async (courseId, lessonData) => {
    const response = await api.post(`/admin/courses/${courseId}/builder/lessons`, lessonData);
    return response.data;
  },

  builderUpdateLesson: async (courseId, lessonId, lessonData) => {
    const response = await api.put(`/admin/courses/${courseId}/builder/lessons/${lessonId}`, lessonData);
    return response.data;
  },

  builderCreateContentBlock: async (courseId, lessonId, blockData) => {
    const response = await api.post(`/admin/courses/${courseId}/builder/lessons/${lessonId}/content-blocks`, blockData);
    return response.data;
  },

  builderUpdateContentBlock: async (courseId, blockId, blockData) => {
    const response = await api.put(`/admin/courses/${courseId}/builder/content-blocks/${blockId}`, blockData);
    return response.data;
  },

  builderDeleteContentBlock: async (courseId, blockId) => {
    const response = await api.delete(`/admin/courses/${courseId}/builder/content-blocks/${blockId}`);
    return response.data;
  },

  builderReorderContentBlocks: async (courseId, lessonId, contentBlockIds) => {
    const response = await api.patch(`/admin/courses/${courseId}/builder/lessons/${lessonId}/content-blocks/reorder`, {
      content_block_ids: contentBlockIds,
    });
    return response.data;
  },

  builderUploadContentFile: async (courseId, formData) => {
    const response = await api.post(`/admin/courses/${courseId}/builder/upload`, formData);
    return response.data;
  },

  listMediaAssets: async ({ courseId, type, q, page, perPage } = {}) => {
    const params = {};
    if (courseId) params.course_id = courseId;
    if (type) params.type = type;
    if (q) params.q = q;
    if (page) params.page = page;
    if (perPage) params.per_page = perPage;
    const response = await api.get('/admin/media', { params });
    return response.data;
  },

  deleteMediaAsset: async (id) => {
    const response = await api.delete(`/admin/media/${id}`);
    return response.data;
  },

  builderValidateCourse: async (courseId) => {
    const response = await api.post(`/admin/courses/${courseId}/builder/validate`);
    return response.data;
  },

  builderQualityAuditCourse: async (courseId) => {
    const response = await api.post(`/admin/courses/${courseId}/builder/quality-audit`);
    return response.data;
  },

  builderSubmitForReview: async (courseId) => {
    const response = await api.post(`/admin/courses/${courseId}/builder/submit-for-review`);
    return response.data;
  },

  builderPublishCourse: async (courseId, teamIds = [], options = {}) => {
    const response = await api.post(`/admin/courses/${courseId}/builder/publish`, {
      team_ids: teamIds,
      catalog_outside_map: Boolean(options.catalogOutsideMap),
    });
    return response.data;
  },

  builderCloneCourse: async (courseId, includeTeams = true) => {
    const response = await api.post(`/admin/courses/${courseId}/builder/clone`, {
      include_teams: includeTeams,
    });
    return response.data;
  },

  builderGetVersions: async (courseId) => {
    const response = await api.get(`/admin/courses/${courseId}/builder/versions`);
    return response.data;
  },

  builderRestoreVersion: async (courseId, versionId, includeTeams = true) => {
    const response = await api.post(`/admin/courses/${courseId}/builder/versions/${versionId}/restore`, {
      include_teams: includeTeams,
    });
    return response.data;
  },

  builderGetTests: async (courseId) => {
    const response = await api.get(`/admin/courses/${courseId}/builder/tests`);
    return response.data;
  },

  builderAttachTest: async (courseId, payload) => {
    const response = await api.post(`/admin/courses/${courseId}/builder/tests/attach`, payload);
    return response.data;
  },

  builderDetachTest: async (courseId, testId, payload = {}) => {
    const response = await api.post(`/admin/courses/${courseId}/builder/tests/${testId}/detach`, payload);
    return response.data;
  },

  // Module Management
  reorderModules: async (courseId, moduleIds) => {
    const response = await api.post(`/admin/courses/${courseId}/modules/reorder`, {
      module_ids: moduleIds,
    });
    return response.data;
  },

  toggleModuleLock: async (moduleId) => {
    const response = await api.post(`/admin/modules/${moduleId}/toggle-lock`);
    return response.data;
  },

  // Settings
  getSettings: async () => {
    const response = await api.get('/admin/settings');
    return response.data;
  },
  updateSettings: async (settingsData) => {
    const response = await api.put('/admin/settings', settingsData);
    return response.data;
  },

  getCompanyBranding: async () => {
    const response = await api.get('/admin/company/branding');
    return response.data;
  },
  updateCompanyBranding: async (payload) => {
    const response = await api.put('/admin/company/branding', payload);
    return response.data;
  },
  uploadCompanyLogo: async (file) => {
    const formData = new FormData();
    formData.append('logo', file);
    const response = await api.post('/admin/company/branding/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  deleteCompanyLogo: async () => {
    const response = await api.delete('/admin/company/branding/logo');
    return response.data;
  },

  // Export & Backup
  exportData: async () => {
    const response = await api.get('/admin/export', {
      responseType: 'json',
    });
    return response.data;
  },
  
  // System
  clearCache: async () => {
    const response = await api.post('/admin/system/clear-cache');
    return response.data;
  },
  
  // Import Backup
  importBackup: async (file) => {
    const formData = new FormData();
    formData.append('backup_file', file);
    const response = await api.post('/admin/import', formData);
    return response.data;
  },
};
