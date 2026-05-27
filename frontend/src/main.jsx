import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Note: Modern design system CSS files are imported in App.jsx
// to ensure proper loading order with other styles

// Filter out browser extension errors that are harmless
const isExtensionError = (error) => {
	if (typeof error === 'string') {
		return error.includes('message channel closed') ||
		       error.includes('Extension context invalidated') ||
		       error.includes('Receiving end does not exist');
	}
	if (error?.message) {
		return error.message.includes('message channel closed') ||
		       error.message.includes('Extension context invalidated') ||
		       error.message.includes('Receiving end does not exist');
	}
	return false;
};

// Handle unhandled promise rejections (common from browser extensions)
window.addEventListener('unhandledrejection', (event) => {
	if (isExtensionError(event.reason)) {
		event.preventDefault(); // Prevent error from appearing in console
		return;
	}
	// Let other errors through normally
});

// Handle general errors (filter extension-related ones)
const originalErrorHandler = window.onerror;
window.onerror = (message, source, lineno, colno, error) => {
	if (isExtensionError(message) || isExtensionError(error)) {
		return true; // Suppress the error
	}
	// Call original handler if it exists
	if (originalErrorHandler) {
		return originalErrorHandler(message, source, lineno, colno, error);
	}
	return false;
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
