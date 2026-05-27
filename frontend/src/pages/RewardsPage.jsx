import React from 'react';
import { mockRewards, mockProfile } from '../data/mockData';

const RewardsPage = () => {
	const getRewardIcon = (id) => {
		const icons = {
			'streak-3': '🔥',
			'promo-champ': '🏆',
			'security-guardian': '🛡️',
			'sales-closer': '💼',
			'product-master': '⭐',
		};
		return icons[id] || '✨';
	};

	const getRewardGradient = (index) => {
		const gradients = [
			'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
			'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
			'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
			'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
			'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
		];
		return gradients[index % gradients.length];
	};

	return (
		<div className="va-stack">
			<div className="va-rewards-header">
				<h1 className="va-page-title">Recompense & Certificate</h1>
				<p className="va-muted">
					Colecția ta de realizări și certificate de competență. Fiecare recompensă reprezintă un pas important în
					progresul tău.
				</p>
			</div>

			<div className="va-certificates-grid">
				{mockRewards.map((reward, index) => (
					<div
						key={reward.id}
						className="va-certificate"
						style={{
							'--cert-gradient': getRewardGradient(index),
						}}
					>
						<div className="va-certificate-border">
							<div className="va-certificate-corner va-certificate-corner-tl"></div>
							<div className="va-certificate-corner va-certificate-corner-tr"></div>
							<div className="va-certificate-corner va-certificate-corner-bl"></div>
							<div className="va-certificate-corner va-certificate-corner-br"></div>
						</div>

						<div className="va-certificate-content">
							<div className="va-certificate-icon">{getRewardIcon(reward.id)}</div>
							<div className="va-certificate-header">
								<p className="va-certificate-label">Certificat de Competență</p>
								<h2 className="va-certificate-title">{reward.title}</h2>
							</div>
							<div className="va-certificate-body">
								<p className="va-certificate-description">{reward.description}</p>
							</div>
							<div className="va-certificate-footer">
								<div className="va-certificate-seal">
									<div className="va-certificate-seal-inner">
										<span>VA</span>
									</div>
								</div>
								<div className="va-certificate-signature">
									<p className="va-certificate-name">{mockProfile.name}</p>
									<p className="va-certificate-date">Formely</p>
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

export default RewardsPage;


