import React from 'react';
import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	pointerWithin,
	useSensor,
	useSensors,
	useDroppable,
} from '@dnd-kit/core';
import {
	SortableContext,
	sortableKeyboardCoordinates,
	rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Books, Buildings, PencilSimple, Plus, Trash, UsersThree } from '@phosphor-icons/react';
import { teamAccentByListIndex } from '../../../utils/teamAccent';
import { toContainerDroppableId, toTeamKey } from './orgDnd';

const teamIconSm = { size: 16, weight: 'bold', 'aria-hidden': true };
const teamIconMd = { size: 18, weight: 'bold', 'aria-hidden': true };

/** Oprește tragerea cardului când utilizatorul apasă pe butoane din card. */
const stopDragFromCard = (e) => e.stopPropagation();

function SortableTeamCard({ team, index, canMutate, children }) {
	const sortId = toTeamKey(team.id);
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: sortId,
		disabled: !canMutate,
	});
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.92 : 1,
	};
	const accent = teamAccentByListIndex(team, index);
	return (
		<div
			ref={setNodeRef}
			style={{ ...style, borderLeft: `8px solid ${accent}` }}
			className={`admin-card admin-team-card-compact admin-team-card-sortable${canMutate ? ' admin-team-card-sortable--grabbable' : ''}${isDragging ? ' admin-team-card-sortable--dragging' : ''}`}
			{...(canMutate ? { ...attributes, ...listeners } : {})}
			{...(canMutate
				? {
						'aria-label': `Echipă ${team.name}. Trage cardul pentru a muta în alt departament.`,
						title: 'Trage cardul pentru reordonare sau mutare',
					}
				: {})}
		>
			{children}
		</div>
	);
}

function TeamCardBody({ team, index, canMutate, onEditTeam, onDeleteTeam, onAttachUsers, onAttachCourses }) {
	return (
		<div className="admin-card-body">
			<div className="admin-team-card-compact__header">
				<div className="admin-team-card-compact__header-main">
					<div className="admin-team-card-compact__avatar" aria-hidden>
						<UsersThree size={20} weight="duotone" aria-hidden />
					</div>
					<div className="admin-team-card-compact__title-wrap">
						<span
							className="admin-team-card-title-swatch"
							style={{ background: teamAccentByListIndex(team, index) }}
							aria-hidden
						/>
						<h3 className="admin-card-title admin-team-card-compact__title">{team.name}</h3>
					</div>
				</div>
				{canMutate && (
					<div className="admin-team-card-compact__header-actions" onPointerDown={stopDragFromCard}>
						<button
							type="button"
							className="admin-btn admin-btn-sm admin-btn-ghost admin-team-card-compact__icon-btn"
							onPointerDown={stopDragFromCard}
							onClick={() => onEditTeam(team)}
							title="Editează echipă"
							aria-label="Editează echipă"
						>
							<PencilSimple {...teamIconSm} />
						</button>
						<button
							type="button"
							className="admin-btn admin-btn-sm admin-btn-danger admin-team-card-compact__icon-btn"
							onPointerDown={stopDragFromCard}
							onClick={() => onDeleteTeam(team.id)}
							title="Șterge echipă"
							aria-label="Șterge echipă"
						>
							<Trash {...teamIconMd} />
						</button>
					</div>
				)}
			</div>
			<div className="admin-team-card-compact__stats">
				<div className="admin-team-card-compact__stat-cell">
					<div className="admin-team-card-compact__stat-value">{team.users?.length || 0}</div>
					<div className="admin-team-card-compact__stat-label">Membri</div>
				</div>
				<div className="admin-team-card-compact__stat-cell">
					<div className="admin-team-card-compact__stat-value">{team.courses?.length || 0}</div>
					<div className="admin-team-card-compact__stat-label">Cursuri</div>
				</div>
			</div>
			{canMutate && (
				<div className="admin-card-actions" onPointerDown={stopDragFromCard}>
					<button
						type="button"
						className="admin-btn admin-btn-sm admin-btn-secondary"
						onPointerDown={stopDragFromCard}
						onClick={() => onAttachUsers(team)}
					>
						<UsersThree size={16} weight="bold" aria-hidden />
						<span>Membri</span>
					</button>
					<button
						type="button"
						className="admin-btn admin-btn-sm admin-btn-secondary"
						onPointerDown={stopDragFromCard}
						onClick={() => onAttachCourses(team)}
					>
						<Books size={16} weight="bold" aria-hidden />
						<span>Cursuri</span>
					</button>
				</div>
			)}
		</div>
	);
}

function DepartmentDropZone({ orderKey, teams, canMutate, onEditTeam, onDeleteTeam, onAttachUsers, onAttachCourses }) {
	const droppableId = toContainerDroppableId(orderKey);
	const { setNodeRef, isOver } = useDroppable({ id: droppableId });

	return (
		<div
			ref={setNodeRef}
			className={`admin-org-drop-zone${isOver ? ' admin-org-drop-zone--over' : ''}${!teams?.length ? ' admin-org-drop-zone--empty' : ''}`}
		>
			{!teams?.length ? (
				<p className="admin-org-empty-teams">Trage aici o echipă sau adaugă una nouă.</p>
			) : (
				<SortableContext items={teams.map((t) => toTeamKey(t.id))} strategy={rectSortingStrategy}>
					<div className="admin-grid admin-teams-page-grid">
						{teams.map((team, index) => (
							<SortableTeamCard key={team.id} team={team} index={index} canMutate={canMutate}>
								<TeamCardBody
									team={team}
									index={index}
									canMutate={canMutate}
									onEditTeam={onEditTeam}
									onDeleteTeam={onDeleteTeam}
									onAttachUsers={onAttachUsers}
									onAttachCourses={onAttachCourses}
								/>
							</SortableTeamCard>
						))}
					</div>
				</SortableContext>
			)}
		</div>
	);
}

function DepartmentSection({
	dept,
	orderKey,
	teams,
	accent,
	canMutate,
	onAddTeam,
	onEditDepartment,
	onDeleteDepartment,
	onEditTeam,
	onDeleteTeam,
	onAttachUsers,
	onAttachCourses,
}) {
	return (
		<section className="admin-org-dept-section">
			<header className="admin-org-dept-header" style={{ borderLeftColor: accent }}>
				<div className="admin-org-dept-header-main">
					<Buildings size={22} weight="duotone" aria-hidden />
					<div>
						<h2 className="admin-org-dept-title">{dept.name}</h2>
						{dept.description ? <p className="admin-org-dept-desc">{dept.description}</p> : null}
						<p className="admin-org-dept-meta">
							{teams.length} {teams.length === 1 ? 'echipă' : 'echipe'}
							{canMutate ? ' · trage cardurile între departamente' : ''}
						</p>
					</div>
				</div>
				{canMutate && (
					<div className="admin-org-dept-actions">
						<button
							type="button"
							className="admin-org-icon-btn"
							onClick={() => onAddTeam(dept.id)}
							title="Adaugă echipă în acest departament"
							aria-label="Adaugă echipă în acest departament"
						>
							<Plus {...teamIconSm} />
						</button>
						<button
							type="button"
							className="admin-org-icon-btn"
							onClick={() => onEditDepartment(dept)}
							aria-label="Editează departamentul"
							title="Editează"
						>
							<PencilSimple {...teamIconSm} />
						</button>
						<button
							type="button"
							className="admin-org-icon-btn admin-org-icon-btn--danger"
							onClick={() => onDeleteDepartment(dept.id)}
							aria-label="Șterge departamentul"
							title="Șterge"
						>
							<Trash {...teamIconSm} />
						</button>
					</div>
				)}
			</header>
			<DepartmentDropZone
				orderKey={orderKey}
				teams={teams}
				canMutate={canMutate}
				onEditTeam={onEditTeam}
				onDeleteTeam={onDeleteTeam}
				onAttachUsers={onAttachUsers}
				onAttachCourses={onAttachCourses}
			/>
		</section>
	);
}

export default function OrganizationTeamsLayout({
	departments,
	teamOrders,
	canMutate,
	activeDragTeam,
	onDragStart,
	onDragEnd,
	onEditTeam,
	onDeleteTeam,
	onAttachUsers,
	onAttachCourses,
	onAddTeam,
	onEditDepartment,
	onDeleteDepartment,
	onAddDepartment,
}) {
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	const hasContent = (departments?.length ?? 0) > 0;

	if (!hasContent) {
		return (
			<div className="lms-empty-state admin-org-empty-state">
				<div className="lms-empty-icon">
					<Buildings size={26} weight="duotone" aria-hidden />
				</div>
				<h3 className="lms-empty-title">Structură goală</h3>
				<p className="lms-empty-description">
					Creează departamente (ex. Vânzări, HR), apoi adaugă echipe în fiecare departament. Poți muta echipe între departamente prin drag and drop.
				</p>
				{canMutate && (
					<button type="button" className="lms-btn-primary" onClick={onAddDepartment}>
						<Plus size={18} weight="bold" aria-hidden />
						Adaugă departament
					</button>
				)}
			</div>
		);
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={pointerWithin}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
		>
			<div className="admin-org-structure">
				{canMutate && (
					<p className="admin-org-dnd-hint">
						Prinde cardul unei echipe și trage-l — reordonează în același departament sau mută în altul.
					</p>
				)}

				{departments.map((dept) => {
					const orderKey = `dept-${dept.id}`;
					const teams = teamOrders[orderKey] || [];
					return (
						<DepartmentSection
							key={dept.id}
							dept={dept}
							orderKey={orderKey}
							teams={teams}
							accent={dept.accent_color || '#64748b'}
							canMutate={canMutate}
							onAddTeam={onAddTeam}
							onEditDepartment={onEditDepartment}
							onDeleteDepartment={onDeleteDepartment}
							onEditTeam={onEditTeam}
							onDeleteTeam={onDeleteTeam}
							onAttachUsers={onAttachUsers}
							onAttachCourses={onAttachCourses}
						/>
					);
				})}
			</div>

			<DragOverlay dropAnimation={null}>
				{activeDragTeam ? (
					<div
						className="admin-card admin-team-card-compact admin-team-card-drag-overlay"
						style={{ borderLeft: `8px solid ${activeDragTeam.accent || '#64748b'}` }}
					>
						<div className="admin-card-body">
							<h3 className="admin-card-title admin-team-card-compact__title">{activeDragTeam.name}</h3>
						</div>
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

/** Export pentru header pagină */
export function OrganizationPageAddMenu({ canMutate, onAddDepartment }) {
	if (!canMutate) return null;
	return (
		<button type="button" className="lms-btn-primary" onClick={onAddDepartment}>
			<Plus size={18} weight="bold" aria-hidden />
			Adaugă departament
		</button>
	);
}
