import React from 'react';

/**
 * Shell comun login / register — același layout, indiferent de tema aplicației.
 */
export default function AuthFormCard({ title, subtitle, children, footer }) {
	return (
		<div className="modern-auth-card">
			<div className="modern-auth-header modern-auth-header--compact">
				<h1 className="modern-auth-title">{title}</h1>
				{subtitle ? <p className="modern-auth-subtitle">{subtitle}</p> : null}
			</div>
			{children}
			{footer ? <div className="modern-auth-footer">{footer}</div> : null}
		</div>
	);
}
