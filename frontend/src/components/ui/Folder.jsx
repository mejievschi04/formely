import { useState } from 'react';
import './Folder.css';

const darkenColor = (hex, percent) => {
	let color = hex.startsWith('#') ? hex.slice(1) : hex;
	if (color.length === 3) {
		color = color
			.split('')
			.map((c) => c + c)
			.join('');
	}

	const num = parseInt(color, 16);
	let r = (num >> 16) & 0xff;
	let g = (num >> 8) & 0xff;
	let b = num & 0xff;

	r = Math.max(0, Math.min(255, Math.floor(r * (1 - percent))));
	g = Math.max(0, Math.min(255, Math.floor(g * (1 - percent))));
	b = Math.max(0, Math.min(255, Math.floor(b * (1 - percent))));

	return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
};

const Folder = ({ color = '#5227FF', size = 1, items = [], frontImage = null, className = '' }) => {
	const maxItems = 3;
	const papers = items.slice(0, maxItems);
	while (papers.length < maxItems) {
		papers.push(null);
	}

	const [open, setOpen] = useState(false);
	const [paperOffsets, setPaperOffsets] = useState(
		Array.from({ length: maxItems }, () => ({ x: 0, y: 0 }))
	);

	const folderBackColor = darkenColor(color, 0.08);
	const paper1 = darkenColor('#ffffff', 0.1);
	const paper2 = darkenColor('#ffffff', 0.05);
	const paper3 = '#ffffff';

	const handleClick = () => {
		setOpen((prev) => !prev);
		if (open) {
			setPaperOffsets(Array.from({ length: maxItems }, () => ({ x: 0, y: 0 })));
		}
	};

	const handlePaperMouseMove = (event, index) => {
		if (!open) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		const offsetX = (event.clientX - centerX) * 0.15;
		const offsetY = (event.clientY - centerY) * 0.15;

		setPaperOffsets((prev) => {
			const nextOffsets = [...prev];
			nextOffsets[index] = { x: offsetX, y: offsetY };
			return nextOffsets;
		});
	};

	const handlePaperMouseLeave = (_event, index) => {
		setPaperOffsets((prev) => {
			const nextOffsets = [...prev];
			nextOffsets[index] = { x: 0, y: 0 };
			return nextOffsets;
		});
	};

	const folderStyle = {
		'--rb-folder-color': color,
		'--rb-folder-back-color': folderBackColor,
		'--rb-paper-1': paper1,
		'--rb-paper-2': paper2,
		'--rb-paper-3': paper3,
		...(frontImage ? { '--rb-folder-front-image': `url("${frontImage}")` } : {}),
	};

	const folderClassName = `rb-folder ${open ? 'open' : ''} ${frontImage ? 'rb-folder--has-cover' : ''}`.trim();
	const scaleStyle = { transform: `scale(${size})` };
	const wrapperClassName = ['rb-folder-wrap', className].filter(Boolean).join(' ');

	return (
		<div style={scaleStyle} className={wrapperClassName}>
			<div className={folderClassName} style={folderStyle} onClick={handleClick}>
				<div className="rb-folder__back">
					{papers.map((item, index) => (
						<div
							key={index}
							className={`rb-paper rb-paper-${index + 1}`}
							onMouseMove={(event) => handlePaperMouseMove(event, index)}
							onMouseLeave={(event) => handlePaperMouseLeave(event, index)}
							style={
								open
									? {
											'--rb-magnet-x': `${paperOffsets[index]?.x || 0}px`,
											'--rb-magnet-y': `${paperOffsets[index]?.y || 0}px`,
										}
									: {}
							}
						>
							{item}
						</div>
					))}
					{frontImage ? (
						<div className="rb-folder__front rb-folder__front--image rb-folder__front--lid" aria-hidden />
					) : (
						<>
							<div className="rb-folder__front" />
							<div className="rb-folder__front right" />
						</>
					)}
				</div>
			</div>
		</div>
	);
};

export default Folder;
