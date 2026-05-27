import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { ensureApiCsrfCookie } from '../api';
import { authService } from '../services/api';

export const AuthContext = createContext(null);

const STORAGE_VIEW_KEY = 'formelyAdminViewMode';

function readStoredAdminView() {
	try {
		return sessionStorage.getItem(STORAGE_VIEW_KEY) === 'student' ? 'student' : 'admin';
	} catch {
		return 'admin';
	}
}

function writeStoredAdminView(mode) {
	try {
		sessionStorage.setItem(STORAGE_VIEW_KEY, mode);
	} catch {
		/* ignore */
	}
}

/** Contul real rămâne admin; `role` devine efectiv (admin | student) când comuți vizualizarea. */
function buildContextUser(rawUser, adminViewMode) {
	if (!rawUser) return null;
	const actualRole = rawUser.role ?? 'student';
	if (actualRole !== 'admin') {
		return { ...rawUser, actualRole };
	}
	const effectiveRole = adminViewMode === 'student' ? 'student' : 'admin';
	return { ...rawUser, role: effectiveRole, actualRole: 'admin' };
}

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error('useAuth must be used within AuthProvider');
	}
	return context;
};

export const AuthProvider = ({ children }) => {
	const [rawUser, setRawUser] = useState(null);
	const [loading, setLoading] = useState(true);
	const [adminViewMode, setAdminViewModeState] = useState(readStoredAdminView);

	const setAdminViewMode = useCallback((mode) => {
		if (mode !== 'admin' && mode !== 'student') return;
		setAdminViewModeState(mode);
		writeStoredAdminView(mode);
	}, []);

	const user = useMemo(
		() => buildContextUser(rawUser, adminViewMode),
		[rawUser, adminViewMode]
	);

	const canMutateInAdminArea = useMemo(() => {
		if (!user) return false;
		const ar = user.actualRole ?? 'student';
		if (ar === 'analyst') return false;
		if (ar === 'admin') return user.role === 'admin';
		if (ar === 'instructor') return true;
		return false;
	}, [user]);

	/** Admin în preview „student” sau instructor: poate deschide builder / editează curs, fără a depinde de canMutateInAdminArea. */
	const canEditCoursesAsStaff = useMemo(() => {
		if (!user) return false;
		const ar = user.actualRole ?? user.role ?? 'student';
		if (ar === 'analyst') return false;
		return ar === 'admin' || ar === 'instructor';
	}, [user]);

	useEffect(() => {
		(async () => {
			try {
				await ensureApiCsrfCookie();
			} catch {
				/* rețea / backend indisponibil */
			}
			await checkAuth();
		})();
	}, []);

	const checkAuth = async () => {
		try {
			const data = await authService.me();
			setRawUser(data?.user ?? null);
		} catch {
			// Rețea / 5xx pe /auth/me: nu ștergem sesiunea din UI (evită logout fals).
			// 401 e tratat în authService.me() → { user: null }, fără throw.
		} finally {
			setLoading(false);
		}
	};

	const login = async (email, password) => {
		const data = await authService.login(email, password);
		setRawUser(data.user);
		return data;
	};

	const changePassword = async (currentPassword, newPassword, newPasswordConfirmation) => {
		const data = await authService.changePassword(currentPassword, newPassword, newPasswordConfirmation);
		setRawUser(data.user);
		return data;
	};

	const register = async (name, email, password) => {
		const data = await authService.register(name, email, password);
		if (!data.pending_approval && data.user) {
			setRawUser(data.user);
		}
		return data;
	};

	const logout = async () => {
		await authService.logout();
		setRawUser(null);
	};

	return (
		<AuthContext.Provider
			value={{
				user,
				rawUser,
				loading,
				login,
				register,
				logout,
				checkAuth,
				changePassword,
				adminViewMode,
				setAdminViewMode,
				canMutateInAdminArea,
				canEditCoursesAsStaff,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
};
