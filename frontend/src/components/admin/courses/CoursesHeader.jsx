import React, { useState } from 'react';
import { Funnel, GridFour, List, Plus, Trash, X } from '@phosphor-icons/react';

const CoursesHeader = ({
	searchQuery,
	onSearchChange,
	filters,
	onFilterChange,
	sortBy,
	onSortChange,
	onCreateCourse,
	onCreateAiCourse,
	selectedCount,
	onBulkAction,
	loading,
	viewMode = 'grid',
	onViewModeChange
}) => {
	const [showFilters, setShowFilters] = useState(false);

	return (
		<>
			{/* Header Section */}
			<div className="admin-courses-page-header">
				<div className="admin-courses-header-content">
					<div className="admin-courses-header-text">
						<h1 className="admin-courses-title">Gestionare Cursuri</h1>
						<p className="admin-courses-subtitle">
							<span className="admin-courses-subtitle-underline">GestioneazДѓ</span> И™i monitorizeazДѓ cursurile
						</p>
					</div>
					<div className="admin-courses-header-actions">
						<button
							className="lms-btn-primary"
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								if (!loading && onCreateCourse) {
									onCreateCourse();
								}
							}}
							disabled={loading}
							type="button"
						>
							<Plus size={16} weight="bold" aria-hidden />
							CreeazДѓ curs
						</button>
					</div>
				</div>

				{/* Search and Filters Bar */}
				<div className="admin-courses-toolbar">
					<div className="admin-courses-search-wrapper">
						<input
							type="text"
							placeholder="CautДѓ dupДѓ titlu..."
							value={searchQuery}
							onChange={(e) => onSearchChange(e.target.value)}
							className="admin-courses-search-input"
						/>
						{searchQuery && (
							<button
								className="admin-search-clear-btn"
								onClick={() => onSearchChange('')}
								aria-label="GoleИ™te cДѓutarea"
							>
								<X size={14} weight="bold" aria-hidden />
							</button>
						)}
					</div>

					<div className="admin-courses-toolbar-actions">
						{/* View Mode Toggle */}
						{onViewModeChange && (
							<div className="admin-view-mode-toggle">
								<button
									className={`admin-view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
									onClick={() => onViewModeChange('grid')}
									title="Vizualizare Grid"
									aria-label="Vizualizare grilДѓ"
								>
									<GridFour size={12} weight="fill" aria-hidden />
								</button>
								<button
									className={`admin-view-mode-btn ${viewMode === 'list' || viewMode === 'table' ? 'active' : ''}`}
									onClick={() => onViewModeChange(viewMode === 'table' ? 'table' : 'list')}
									title="Vizualizare ListДѓ"
									aria-label="Vizualizare listДѓ"
								>
									<List size={12} weight="bold" aria-hidden />
								</button>
							</div>
						)}

						<button
							className={`admin-btn-filter ${showFilters ? 'active' : ''}`}
							onClick={() => setShowFilters(!showFilters)}
							aria-label="Comutare filtre"
						>
							<Funnel size={16} weight="bold" aria-hidden />
							Filtre
							{filters.activeCount > 0 && (
								<span className="admin-filter-badge">{filters.activeCount}</span>
							)}
						</button>
					</div>
				</div>
			</div>

			{/* Expanded Filters Panel */}
			{showFilters && (
				<div className="admin-courses-filters-panel">
					<div className="admin-filters-content">
						<div className="admin-filter-group">
							<label className="admin-filter-label">Status</label>
							<div className="admin-filter-buttons">
								{['all', 'published', 'draft'].map(status => (
									<button
										key={status}
										className={`admin-filter-btn ${filters.status === status ? 'active' : ''}`}
										onClick={() => onFilterChange('status', status)}
									>
										{status === 'all' ? 'Toate' : 
										 status === 'published' ? 'Publicate' :
										 status === 'draft' ? 'CiornДѓ' : 'Arhivate'}
									</button>
								))}
							</div>
						</div>

					</div>

					<button
						className="lms-btn-secondary lms-btn-sm"
						onClick={() => {
							onFilterChange('status', 'all');
						}}
					>
						ReseteazДѓ filtrele
					</button>
				</div>
			)}

			{/* Bulk Actions Bar */}
			{selectedCount > 0 && (
				<div className="admin-bulk-actions-bar">
					<div className="admin-bulk-actions-info">
						<strong>{selectedCount}</strong> cursuri selectate
					</div>
					<div className="admin-bulk-actions-buttons">
						<button
							className="lms-btn-secondary lms-btn-sm"
							onClick={() => onBulkAction('publish')}
						>
							Publish
						</button>
						<button
							className="lms-btn-secondary lms-btn-sm va-btn-danger"
							onClick={() => onBulkAction('delete')}
						>
							<Trash size={14} weight="bold" aria-hidden /> Șterge
						</button>
					</div>
				</div>
			)}
		</>
	);
};

export default CoursesHeader;
