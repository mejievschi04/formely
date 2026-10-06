import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FloppyDisk, Trash } from '@phosphor-icons/react';

function joinClass(...parts) {
	return parts.filter(Boolean).join(' ');
}

function ActionLabel({ icon: Icon, children }) {
	return (
		<>
			<Icon size={18} weight="bold" aria-hidden />
			{children != null && children !== false ? <span>{children}</span> : null}
		</>
	);
}

export const SaveButton = forwardRef(function SaveButton({
	children = 'Salvează',
	loading = false,
	loadingLabel = 'Se salvează...',
	className,
	type = 'button',
	disabled,
	...props
}, ref) {
	return (
		<button
			ref={ref}
			type={type}
			className={joinClass('va-btn', 'va-btn-save', 'lms-btn-primary', className)}
			disabled={disabled || loading}
			{...props}
		>
			<ActionLabel icon={FloppyDisk}>{loading ? loadingLabel : children}</ActionLabel>
		</button>
	);
});

export const BackButton = forwardRef(function BackButton({
	to,
	children = 'Înapoi',
	className,
	type = 'button',
	...props
}, ref) {
	const classNames = joinClass('va-btn', 'va-btn-back', 'admin-back-btn', className);
	const content = <ActionLabel icon={ArrowLeft}>{children}</ActionLabel>;
	if (to) {
		return (
			<Link ref={ref} to={to} className={classNames} {...props}>
				{content}
			</Link>
		);
	}
	return (
		<button ref={ref} type={type} className={classNames} {...props}>
			{content}
		</button>
	);
});

export const DeleteButton = forwardRef(function DeleteButton({
	children = 'Șterge',
	iconOnly = false,
	className,
	type = 'button',
	...props
}, ref) {
	return (
		<button
			ref={ref}
			type={type}
			className={joinClass('va-btn', 'va-btn-delete', 'va-btn-danger', iconOnly ? 'va-btn-icon' : '', className)}
			{...props}
		>
			<ActionLabel icon={Trash}>{iconOnly ? null : children}</ActionLabel>
		</button>
	);
});
