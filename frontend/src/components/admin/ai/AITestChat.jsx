import React, { useState, useRef, useEffect } from 'react';
import { openaiService } from '../../../services/openaiService';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import './AIChat.css';

const AITestChat = ({ courseId = null, onTestGenerated, onClose }) => {
	const { showToast } = useToast();
	const [messages, setMessages] = useState([
		{
			role: 'assistant',
			content: 'Bună! Sunt asistentul AI pentru crearea testelor. Spune-mi tipul de test, numărul de întrebări și subiectul pe care îl acoperă.',
		},
	]);
	const [input, setInput] = useState('');
	const [isGenerating, setIsGenerating] = useState(false);
	const [generatedTest, setGeneratedTest] = useState(null);
	const messagesEndRef = useRef(null);
	const chatContainerRef = useRef(null);

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	};

	const handleSend = async (e) => {
		e.preventDefault();
		if (!input.trim() || isGenerating) return;

		const userMessage = { role: 'user', content: input.trim() };
		setMessages(prev => [...prev, userMessage]);
		setInput('');
		setIsGenerating(true);

		try {
			let assistantResponse = '';
			const assistantMessage = { role: 'assistant', content: '' };
			setMessages(prev => [...prev, assistantMessage]);

			// Stream the response
			await openaiService.streamTestGeneration(
				userMessage.content,
				messages.map(m => ({ role: m.role, content: m.content })),
				courseId,
				(chunk) => {
					assistantResponse += chunk;
					setMessages(prev => {
						const newMessages = [...prev];
						newMessages[newMessages.length - 1] = {
							...newMessages[newMessages.length - 1],
							content: assistantResponse,
						};
						return newMessages;
					});
				}
			);

			// Check if the response contains test data
			try {
				const testData = parseTestFromResponse(assistantResponse);
				if (testData) {
					setGeneratedTest(testData);
				}
			} catch (e) {
				console.error('Error parsing test data:', e);
			}
		} catch (error) {
			console.error('Error generating test:', error);
			showToast('Eroare la generarea testului. Te rugăm să încerci din nou.', 'error');
			setMessages(prev => {
				const newMessages = [...prev];
				newMessages[newMessages.length - 1] = {
					...newMessages[newMessages.length - 1],
					content: 'Îmi pare rău, am întâmpinat o eroare. Te rugăm să încerci din nou sau să reformulezi cererea.',
				};
				return newMessages;
			});
		} finally {
			setIsGenerating(false);
		}
	};

	const parseTestFromResponse = (response) => {
		// Try to extract JSON from the response
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			try {
				return JSON.parse(jsonMatch[0]);
			} catch (e) {
				// If JSON parsing fails, try to extract structured data
			}
		}

		// Fallback: extract test information from text
		const titleMatch = response.match(/Titlu[:\s]+(.+?)(?:\n|$)/i) || 
			response.match(/Title[:\s]+(.+?)(?:\n|$)/i);
		const descMatch = response.match(/Descriere[:\s]+(.+?)(?:\n|$)/i) ||
			response.match(/Description[:\s]+(.+?)(?:\n|$)/i);

		if (titleMatch || descMatch) {
			return {
				title: titleMatch ? titleMatch[1].trim() : 'Test generat cu AI',
				description: descMatch ? descMatch[1].trim() : response.substring(0, 200),
				type: 'final',
				status: 'draft',
			};
		}

		return null;
	};

	const handleCreateTest = async () => {
		if (!generatedTest) return;

		try {
			const testData = {
				title: generatedTest.title || 'Test generat cu AI',
				description: generatedTest.description || '',
				type: 'final',
				status: 'draft',
				course_id: courseId,
			};

			const result = await adminService.createTest(testData);
			showToast('Test creat cu succes!', 'success');
			
			if (onTestGenerated) {
				onTestGenerated(result.test || result);
			}
			
			if (onClose) {
				onClose();
			}
		} catch (error) {
			console.error('Error creating test:', error);
			showToast('Eroare la crearea testului. Te rugăm să încerci din nou.', 'error');
		}
	};

	return (
		<div className="ai-chat-container">
			<div className="ai-chat-header">
				<h2>🤖 Creator test AI</h2>
				{onClose && (
					<button className="ai-chat-close" onClick={onClose}>
						×
					</button>
				)}
			</div>

			<div className="ai-chat-messages" ref={chatContainerRef}>
				{messages.map((message, index) => (
					<div
						key={index}
						className={`ai-chat-message ${message.role === 'user' ? 'ai-chat-message-user' : 'ai-chat-message-assistant'}`}
					>
						<div className="ai-chat-message-content">
							{message.content}
						</div>
					</div>
				))}
				{isGenerating && (
					<div className="ai-chat-message ai-chat-message-assistant">
						<div className="ai-chat-message-content">
							<span className="ai-chat-typing-indicator">●</span>
						</div>
					</div>
				)}
				<div ref={messagesEndRef} />
			</div>

			{generatedTest && (
				<div className="ai-chat-preview">
					<h3>📋 Preview Test Generat</h3>
					<div className="ai-chat-preview-content">
						<p><strong>Titlu:</strong> {generatedTest.title}</p>
						{generatedTest.description && (
							<p><strong>Descriere:</strong> {generatedTest.description}</p>
						)}
					</div>
					<button className="ai-chat-btn ai-chat-btn-primary" onClick={handleCreateTest}>
						✓ Creează Test
					</button>
				</div>
			)}

			<form className="ai-chat-input-form" onSubmit={handleSend}>
				<input
					type="text"
					className="ai-chat-input"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="Scrie aici ce fel de test vrei să creezi..."
					disabled={isGenerating}
				/>
				<button
					type="submit"
					className="ai-chat-btn ai-chat-btn-send"
					disabled={!input.trim() || isGenerating}
				>
					{isGenerating ? '⏳' : '➤'}
				</button>
			</form>
		</div>
	);
};

export default AITestChat;
