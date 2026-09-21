import React from 'react';
import Folder from './Folder';
import { toImageUrl } from '../../utils/imageUrl';
import './CourseMapFolderTile.css';

const CourseMapFolderTile = ({
	title,
	subtitle,
	count,
	color = 'var(--formely-shadow)',
	imageUrl = null,
	coverFocus = null,
	progress = null,
	ctaLabel = 'Deschide mapa',
	onOpen,
	topLeftSlot = null,
	topRightSlot = null,
	className = '',
	style,
}) => {
	const hasProgress = progress != null && progress !== '';
	const normalizedProgress = hasProgress && Number.isFinite(Number(progress))
		? Math.min(100, Math.max(0, Number(progress)))
		: null;
	const courseCount = Number.isFinite(Number(count)) ? Number(count) : 0;
	const folderImage = imageUrl ? toImageUrl(imageUrl) || imageUrl : null;
	const classes = ['course-map-folder-tile', className].filter(Boolean).join(' ');
	const tileStyle = { '--color-primary': color, ...style };
	const itemNodes = [
		<span className="course-map-folder-tile__paper-value">{courseCount}</span>,
		normalizedProgress !== null ? (
			<span className="course-map-folder-tile__paper-value">{normalizedProgress}%</span>
		) : null,
		<span className="course-map-folder-tile__paper-label">Mapa</span>,
	];

	const handleKeyDown = (event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onOpen?.();
		}
	};

	return (
		<div className={classes} style={tileStyle}>
			<div
				className="course-map-folder-tile__hit"
				role="button"
				tabIndex={0}
				onClick={onOpen}
				onKeyDown={handleKeyDown}
				aria-label={ctaLabel}
			>
				<div className="course-map-folder-tile__stage">
					{topLeftSlot ? <span className="course-map-folder-tile__tl">{topLeftSlot}</span> : null}
					{topRightSlot ? <span className="course-map-folder-tile__tr">{topRightSlot}</span> : null}
					<span className="course-map-folder-tile__count" aria-hidden>
						{courseCount} {courseCount === 1 ? 'curs' : 'cursuri'}
					</span>
					<div className="course-map-folder-tile__visual" aria-hidden>
						<Folder size={2.72} color={color} items={itemNodes} frontImage={folderImage} coverFocus={coverFocus} interactive={false} />
					</div>
				</div>

				<div className="course-map-folder-tile__meta">
					<h3 className="course-map-folder-tile__title">{title || 'Mapa'}</h3>
					{subtitle ? <p className="course-map-folder-tile__subtitle">{subtitle}</p> : null}
					{normalizedProgress !== null ? (
						<div className="course-map-folder-tile__progress">
							<span style={{ width: `${normalizedProgress}%` }} />
						</div>
					) : null}
					<div className="course-map-folder-tile__footer" aria-hidden>
						<span>{ctaLabel}</span>
						<span>-&gt;</span>
					</div>
				</div>
			</div>
		</div>
	);
};

export default CourseMapFolderTile;
