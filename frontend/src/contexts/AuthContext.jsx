import { setVoltCapabilities } from '../utils/voltAvailability';
import { AuthContext } from './AuthContextShared.js';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ensureApiCsrfCookie } from '../api';
import { authService } from '../services/api';



const STORAGE_VIEW_KEY = 'voltaAdminViewMode';

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



export const AuthProvider = ({ children }) => {
	const [rawUser, setRawUser] = useState(null);
	const [loading, setLoading] = useState(true);
	const [adminViewMode, setAdminViewModeState] = useState(readStoredAdminView);
	const authCheckId = useRef(0);

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

	const checkAuth = useCallback(async () => {
		const id = ++authCheckId.current;
		try {
			const data = await authService.me();
			if (id !== authCheckId.current) return;
			setVoltCapabilities(data?.user?.capabilities, data?.user?.entitlements);
			setRawUser(data?.user ?? null);
		} catch {
			// Rețea / 5xx pe /auth/me: nu ștergem sesiunea din UI (evită logout fals).
			// 401 e tratat în authService.me() → { user: null }, fără throw.
		} finally {
			if (id === authCheckId.current) {
				setLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				await ensureApiCsrfCookie();
			} catch {
				/* rețea / backend indisponibil */
			}
			// Rulare anulată (demontare / dublul efect din StrictMode): nu marcăm încărcarea ca terminată
			// fără utilizator, altfel rutele protejate redirecționează la /login deși sesiunea e validă.
			if (cancelled) {
				return;
			}
			await checkAuth();
		})();
		return () => {
			cancelled = true;
			authCheckId.current += 1;
		};
	}, [checkAuth]);

	const login = async (email, password) => {
		authCheckId.current += 1;
		const data = await authService.login(email, password);
		setVoltCapabilities(data.user?.capabilities, data.user?.entitlements);
		setRawUser(data.user);
		setLoading(false);
		return data;
	};

	const changePassword = async (currentPassword, newPassword, newPasswordConfirmation) => {
		const data = await authService.changePassword(currentPassword, newPassword, newPasswordConfirmation);
		setVoltCapabilities(data.user?.capabilities, data.user?.entitlements);
		setRawUser(data.user);
		return data;
	};

	const register = async (name, email, password) => {
		const data = await authService.register(name, email, password);
		if (!data.pending_approval && data.user) {
			setVoltCapabilities(data.user?.capabilities, data.user?.entitlements);
			setRawUser(data.user);
		}
		return data;
	};

	const logout = async () => {
		await authService.logout();
		setVoltCapabilities(null);
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
