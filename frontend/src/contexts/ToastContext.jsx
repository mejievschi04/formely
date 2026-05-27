import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import Toast from '../components/common/Toast';
import { setApiErrorNotifier } from '../api';

const ToastContext = createContext(null);

export const useToast = () => {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error('useToast must be used within ToastProvider');
	}
	return context;
};

export const ToastProvider = ({ children }) => {
	const [toasts, setToasts] = useState([]);

	const showToast = useCallback((message, type = 'info', duration = 4000) => {
		const id = Date.now() + Math.random();
		const toast = { id, message, type, duration };
		
		setToasts(prev => [...prev, toast]);

		// Auto remove after duration
		setTimeout(() => {
			setToasts(prev => prev.filter(t => t.id !== id));
		}, duration);

		return id;
	}, []);

	const removeToast = useCallback((id) => {
		setToasts(prev => prev.filter(t => t.id !== id));
	}, []);

	const success = useCallback((message, duration) => {
		return showToast(message, 'success', duration);
	}, [showToast]);

	const error = useCallback((message, duration) => {
		return showToast(message, 'error', duration);
	}, [showToast]);

	const info = useCallback((message, duration) => {
		return showToast(message, 'info', duration);
	}, [showToast]);

	const warning = useCallback((message, duration) => {
		return showToast(message, 'warning', duration);
	}, [showToast]);

	// Wire API interceptor to show toast on 5xx/network errors
	useEffect(() => {
		setApiErrorNotifier((msg, type, duration) => showToast(msg, type || 'error', duration));
		return () => setApiErrorNotifier(null);
	}, [showToast]);

	return (
		<ToastContext.Provider value={{ showToast, success, error, info, warning, removeToast }}>
			{children}
			<div className="toast-container va-toast-container">
				{toasts.map(toast => (
					<Toast
						key={toast.id}
						message={toast.message}
						type={toast.type}
						onClose={() => removeToast(toast.id)}
					/>
				))}
			</div>
		</ToastContext.Provider>
	);
};

