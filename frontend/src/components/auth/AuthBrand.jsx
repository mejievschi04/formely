import React from 'react';

const LETTERS = 'FORMELY'.split('');

export default function AuthBrand({ elevated = false, animateIn = true }) {
	return (
		<div
			className={`auth-brand ${elevated ? 'auth-brand--elevated' : ''} ${animateIn ? 'auth-brand--animate-in' : ''}`}
			aria-label="Formely"
		>
			<div className="auth-brand-wordmark">
				{LETTERS.map((ch, i) => (
					<span
						key={`${ch}-${i}`}
						className="auth-brand-letter"
						style={{ '--i': i }}
						aria-hidden="true"
					>
						{ch}
					</span>
				))}
			</div>
		</div>
	);
}
