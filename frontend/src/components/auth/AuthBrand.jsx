import React from 'react';

export default function AuthBrand({ elevated = false, animateIn = true }) {
	return (
		<div
			className={`auth-brand ${elevated ? 'auth-brand--elevated' : ''} ${animateIn ? 'auth-brand--animate-in' : ''}`}
			aria-label="Formely"
		>
			<img
				className="auth-brand-logo-img"
				src="/logo.png"
				alt="Formely"
				width={320}
				height={96}
			/>
		</div>
	);
}
