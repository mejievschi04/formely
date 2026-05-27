import React, { useState } from 'react';

/**
 * Inline AI suggestion component - Conform defacut.md secțiunea 11
 * Non-intrusive AI suggestions that appear inline
 */
const InlineAISuggestion = ({ 
	suggestion, 
	onAccept, 
	onDismiss, 
	onEdit,
	position = 'bottom' // 'top', 'bottom', 'inline'
}) => {
	const [isExpanded, setIsExpanded] = useState(false);

	if (!suggestion) return null;

	return (
		<div className={`inline-ai-suggestion inline-ai-suggestion-${position}`}>
			<div className="inline-ai-suggestion-header">
				<span className="inline-ai-suggestion-icon">✨</span>
				<span className="inline-ai-suggestion-label">Sugestie AI</span>
				<button
					type="button"
					className="inline-ai-suggestion-expand"
					onClick={() => setIsExpanded(!isExpanded)}
				>
					{isExpanded ? '▼' : '▲'}
				</button>
			</div>
			
			{isExpanded && (
				<div className="inline-ai-suggestion-content">
					<p>{suggestion.text || suggestion}</p>
					
					<div className="inline-ai-suggestion-actions">
						{onAccept && (
							<button
								type="button"
								className="inline-ai-suggestion-btn accept"
								onClick={() => {
									onAccept(suggestion);
									setIsExpanded(false);
								}}
							>
								✓ Acceptă
							</button>
						)}
						{onEdit && (
							<button
								type="button"
								className="inline-ai-suggestion-btn edit"
								onClick={() => {
									onEdit(suggestion);
									setIsExpanded(false);
								}}
							>
								✏️ Editează
							</button>
						)}
						{onDismiss && (
							<button
								type="button"
								className="inline-ai-suggestion-btn dismiss"
								onClick={() => {
									onDismiss();
									setIsExpanded(false);
								}}
							>
								× Ignoră
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default InlineAISuggestion;
