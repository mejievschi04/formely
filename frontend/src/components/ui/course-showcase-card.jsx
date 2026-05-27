import * as React from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import { cn } from '@/lib/cn';
import { toImageUrl } from '../../utils/imageUrl';
import courseMapPlaceholder from '../../assets/course-map-placeholder.svg';
import './course-showcase-card.css';

/** Copertă implicită când lipsește URL-ul sau încărcarea eșuează. */
export const COURSE_SHOWCASE_FALLBACK_IMAGE = courseMapPlaceholder;

function resolveCardImageUrl(value) {
	if (value == null || value === '') return null;
	const s = typeof value === 'string' ? value.trim() : String(value).trim();
	if (!s) return null;
	if (s.startsWith('data:') || s.startsWith('blob:')) return s;
	if (s.startsWith('/assets/') || s.startsWith('./') || s.startsWith('../')) return s;
	return toImageUrl(s) ?? s;
}

function cssUrl(value) {
	return `url(${JSON.stringify(String(value))})`;
}

const CourseShowcaseCard = React.forwardRef(
	(
		{
			className,
			imageUrl,
			title,
			subtitle,
			themeHsl,
			onOpen,
			ctaLabel = 'Deschide',
			progress,
			topLeftSlot,
			topRightSlot,
			showAccentRibbon = false,
			density = 'default',
			style,
			...rest
		},
		ref
	) => {
		const resolved = React.useMemo(() => resolveCardImageUrl(imageUrl), [imageUrl]);
		const [coverBroken, setCoverBroken] = React.useState(false);

		React.useEffect(() => {
			setCoverBroken(false);
		}, [resolved]);

		const showUrl = resolved && !coverBroken ? resolved : COURSE_SHOWCASE_FALLBACK_IMAGE;
		const normalizedProgress = Number.isFinite(Number(progress))
			? Math.min(100, Math.max(0, Number(progress)))
			: null;

		return (
			<div
				ref={ref}
				className={cn(
					'course-showcase-card',
					density === 'compact' && 'course-showcase-card--compact',
					className
				)}
				tabIndex={0}
				role="group"
				aria-label={title}
				style={{ ...style, '--theme-color': themeHsl }}
				{...rest}
			>
				<div
					className="course-showcase-card__hit va-card-shell va-card-shell--interactive"
					role="button"
					tabIndex={0}
					onClick={onOpen}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							onOpen();
						}
					}}
					aria-label={ctaLabel}
				>
					{showAccentRibbon ? <span className="course-showcase-card__accent-ribbon" aria-hidden /> : null}
					<div className="course-showcase-card__media va-card-media-16x9">
						<div
							className="course-showcase-card__cover"
							style={{ backgroundImage: cssUrl(showUrl) }}
							aria-hidden
						/>
						{resolved ? (
							<img
								className="course-showcase-card__cover-probe"
								src={resolved}
								alt=""
								decoding="async"
								onError={() => setCoverBroken(true)}
							/>
						) : null}
						<div className="course-showcase-card__shade" aria-hidden />
					</div>
					<div className="course-showcase-card__inner va-card-content">
						<h3 className="course-showcase-card__title va-card-title">{title}</h3>
						<p className="course-showcase-card__subtitle va-card-subtitle">{subtitle}</p>
						{normalizedProgress !== null ? (
							<div className="course-showcase-card__progress va-card-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={normalizedProgress}>
								<div className="course-showcase-card__progress-track va-card-progress-track">
									<div className="course-showcase-card__progress-fill va-card-progress-fill" style={{ width: `${normalizedProgress}%` }} />
								</div>
								<span className="course-showcase-card__progress-value va-card-progress-value">{normalizedProgress}%</span>
							</div>
						) : null}
						<div className="course-showcase-card__footer va-card-footer">
							<span className="course-showcase-card__cta-label va-card-cta-label">{ctaLabel}</span>
							<ArrowRight size={18} weight="bold" className="course-showcase-card__cta-icon va-card-cta-icon" aria-hidden />
						</div>
					</div>
					{topLeftSlot ? <div className="course-showcase-card__tl">{topLeftSlot}</div> : null}
					{topRightSlot ? <div className="course-showcase-card__tr">{topRightSlot}</div> : null}
				</div>
			</div>
		);
	}
);

CourseShowcaseCard.displayName = 'CourseShowcaseCard';

export { CourseShowcaseCard };
