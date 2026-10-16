import formelyLogo from '../../../assets/Formely logo.png';
import './AIGenerationStatus.css';

export default function AIGenerationStatus({ title, description, percent = null }) {
	return (
		<div className="ai-generation-status" role="status" aria-live="polite" aria-atomic="true">
			<div className="ai-generation-status-main">
				<span className="ai-generation-status-brand" aria-hidden="true"><img src={formelyLogo} alt="" /></span>
				<div className="ai-generation-status-copy">
					<span className="ai-generation-status-name">Formely AI</span>
					<p className="ai-generation-status-title">{title}</p>
					<p className="ai-generation-status-description">{description}</p>
				</div>
				<span className="ai-generation-status-badge">În lucru</span>
			</div>
			{percent === null
				? <div className="ai-chat-build-progress ai-generation-status-track" aria-hidden="true"><span className="ai-chat-build-progress-bar" /></div>
				: <progress className="ai-generation-status-progress" value={percent} max="100" aria-label="Progresul generării cursului" />}
		</div>
	);
}
