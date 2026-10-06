import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';


import { coursesService } from '../services/api';
import { Backspace, Books, MagnifyingGlass, X } from '@phosphor-icons/react';
import { useScrollResetOnOpen } from '../hooks/useScrollResetOnOpen';
import './GlobalSearch.css';

/** Primul rând selectabil (titlurile de categorie nu se pot selecta). */
const firstSelectableIndex = (items) => Math.max(0, items.findIndex((item) => item.type !== 'category'));

/** Următorul rând selectabil în direcția dată, sau poziția curentă dacă nu există. */
const nextSelectableIndex = (items, from, step) => {
	for (let i = from + step; i >= 0 && i < items.length; i += step) {
		if (items[i].type !== 'category') return i;
	}
	return from;
};

/**
 * GlobalSearch - Command Palette Style Search
 * 
 * Features:
 * - Keyboard-first UX (⌘K / Ctrl+K)
 * - Instant results with categories
 * - Global search across courses, lessons, tests, users
 * - Smooth animations
 */
const GlobalSearch = ({ isOpen, onClose }) => {
	const navigate = useNavigate();

	const [query, setQuery] = useState('');
	const [results, setResults] = useState([]);
	const [loading, setLoading] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef(null);
	const resultsRef = useRef(null);
	useScrollResetOnOpen(isOpen, resultsRef);



	// Focus input when opened
	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
			setQuery('');
			setResults([]);
			setSelectedIndex(0);
		}
	}, [isOpen]);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e) => {
			// Open search: Cmd/Ctrl + K
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				if (!isOpen) {
					// Trigger open (handled by parent)
					document.dispatchEvent(new CustomEvent('openGlobalSearch'));
				}
			}

			if (isOpen && e.key === 'Escape') {
				e.preventDefault();
				onClose();
				return;
			}

			// Navigate results: Arrow keys (sar peste titlurile de categorie)
			if (isOpen && results.length > 0) {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					setSelectedIndex((prev) => nextSelectableIndex(results, prev, 1));
				} else if (e.key === 'ArrowUp') {
					e.preventDefault();
					setSelectedIndex((prev) => nextSelectableIndex(results, prev, -1));
				} else if (e.key === 'Enter' && results[selectedIndex]) {
					e.preventDefault();
					handleSelectResult(results[selectedIndex]);
				}
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, results, selectedIndex, onClose]);

	// Search with debounce
	useEffect(() => {
		if (!query.trim()) {
			setResults([]);
			return;
		}

		const timeoutId = setTimeout(() => {
			performSearch(query);
		}, 200);

		return () => clearTimeout(timeoutId);
	}, [query]);

	// Scroll selected item into view
	useEffect(() => {
		if (resultsRef.current && selectedIndex >= 0) {
			const selectedElement = resultsRef.current.children[selectedIndex];
			if (selectedElement) {
				selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			}
		}
	}, [selectedIndex]);

	const performSearch = async (searchQuery) => {
		setLoading(true);
		try {
			const allResults = [];

			// Search courses
			try {
				const courses = await coursesService.getAll();
				const courseMatches = courses
					.filter((course) =>
						course.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
						course.description?.toLowerCase().includes(searchQuery.toLowerCase())
					)
					.slice(0, 5)
					.map((course) => ({
						id: course.id,
						title: course.title,
						description: course.description,
						type: 'course',
						url: `/courses/${course.id}`,
						icon: <Books size={18} weight="duotone" aria-hidden />,
					}));
				allResults.push(...courseMatches);
			} catch (err) {
				console.error('Error searching courses:', err);
			}

			// Group results by type
			const grouped = allResults.reduce((acc, result) => {
				if (!acc[result.type]) {
					acc[result.type] = [];
				}
				acc[result.type].push(result);
				return acc;
			}, {});

			// Flatten grouped results with category headers
			const flattened = [];
			Object.entries(grouped).forEach(([type, items]) => {
				flattened.push({ type: 'category', label: getCategoryLabel(type) });
				flattened.push(...items);
			});

			setResults(flattened);
			setSelectedIndex(firstSelectableIndex(flattened));
		} catch (err) {
			console.error('Search error:', err);
			setResults([]);
		} finally {
			setLoading(false);
		}
	};

	const getCategoryLabel = (type) => {
		const labels = {
			course: 'Cursuri',
			test: 'Teste',
			lesson: 'Lecții',
			user: 'Utilizatori',
		};
		return labels[type] || type;
	};

	const handleSelectResult = (result) => {
		if (result.type === 'category') return;
		navigate(result.url);
		onClose();
	};

	if (!isOpen) return null;

	return (
		<div className="global-search-overlay" onClick={onClose} role="presentation">
			<div
				className="global-search-modal"
				role="dialog"
				aria-modal="true"
				aria-label="Căutare"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Search Input */}
				<div className="global-search-input-wrapper">
					<MagnifyingGlass className="global-search-icon" size={20} weight="bold" aria-hidden />
					<input
						ref={inputRef}
						type="text"
						className="global-search-input"
						placeholder="Caută cursuri..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					{query && (
						<button
							type="button"
							className="global-search-clear"
							onClick={() => {
								setQuery('');
								setResults([]);
								inputRef.current?.focus();
							}}
							aria-label="Golește căutarea"
							title="Golește"
						>
							<Backspace size={18} weight="bold" aria-hidden />
						</button>
					)}
					<button
						type="button"
						className="global-search-close va-close-btn"
						onClick={onClose}
						aria-label="Închide căutarea"
					>
						<X size={18} weight="bold" aria-hidden="true" />
					</button>
					<div className="global-search-shortcut">
						<kbd>⌘</kbd>
						<kbd>K</kbd>
					</div>
				</div>

				{/* Results */}
				{query && (
					<div className="global-search-results" ref={resultsRef}>
						{loading ? (
							<div className="global-search-loading">
								<div className="skeleton" style={{ height: '40px', marginBottom: '8px' }} />
								<div className="skeleton" style={{ height: '40px', marginBottom: '8px' }} />
								<div className="skeleton" style={{ height: '40px' }} />
							</div>
						) : results.length === 0 ? (
							<div className="global-search-empty">
								<p>Nu s-au găsit rezultate pentru "{query}"</p>
							</div>
						) : (
							results.map((result, index) => {
								if (result.type === 'category') {
									return (
										<div key={`category-${result.label}`} className="global-search-category">
											{result.label}
										</div>
									);
								}
								return (
									<div
										key={`${result.type}-${result.id}`}
										className={`global-search-result ${index === selectedIndex ? 'selected' : ''}`}
										onClick={() => handleSelectResult(result)}
										onMouseEnter={() => setSelectedIndex(index)}
									>
										<div className="global-search-result-icon">{result.icon}</div>
										<div className="global-search-result-content">
											<div className="global-search-result-title">{result.title}</div>
											{result.description && (
												<div className="global-search-result-description">{result.description}</div>
											)}
										</div>
									</div>
								);
							})
						)}
					</div>
				)}

				{/* Empty State */}
				{!query && (
					<div className="global-search-empty-state">
						<p>Începe să scrii pentru a căuta...</p>
						<div className="global-search-hints">
							<div className="global-search-hint">
								<kbd>↑</kbd>
								<kbd>↓</kbd>
								<span>Navigare</span>
							</div>
							<div className="global-search-hint">
								<kbd>↵</kbd>
								<span>Selectare</span>
							</div>
							<div className="global-search-hint">
								<kbd>Esc</kbd>
								<span>Închidere</span>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default GlobalSearch;
