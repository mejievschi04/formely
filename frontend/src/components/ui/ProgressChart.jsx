import React from 'react';

// Lightweight sparkline / progress chart using SVG (no extra deps)
const ProgressChart = React.memo(({ data = [], height = 48, color = '#004643' }) => {
	if (!data || data.length === 0) {
		return <svg className="pro-sparkline" height={height}></svg>;
	}
	const w = Math.max(120, data.length * 8);
	const max = Math.max(...data);
	const min = Math.min(...data);
	const points = data
		.map((d, i) => {
			const x = (i / (data.length - 1)) * w;
			const y = ((max - d) / (max - min || 1)) * height;
			return `${x},${y}`;
		})
		.join(' ');

	return (
		<svg className="pro-sparkline" width={w} height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden>
			<polyline fill="none" stroke={color} strokeWidth="2" points={points} strokeLinecap="round" strokeLinejoin="round" />
			{/* subtle area */}
			<polyline fill={color + '11'} stroke="none" points={`${points} ${w},${height} 0,${height}`} />
		</svg>
	);
});

ProgressChart.displayName = 'ProgressChart';

export default ProgressChart;
