import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MagnifyingGlass, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react';
import { DragHandle } from '../../components/common/DragHandle';
import { adminService } from '../../services/api';

import { useToast } from '../../contexts/ToastContextShared.js';
import ConfirmModal from '../../components/common/ConfirmModal';
import Modal from '../../components/common/Modal';

import { useAuth } from '../../contexts/AuthContextShared.js';
import { mapFolderCardImageUrl, toImageUrl } from '../../utils/imageUrl';
import CourseMapFolderTile from '../../components/ui/CourseMapFolderTile';
import MapCoverFocusEditor from '../../components/admin/course-maps/MapCoverFocusEditor';
import { normalizeColorInputToHex } from '../../utils/color';
import { DEFAULT_COVER_FOCUS, normalizeCoverFocus } from '../../utils/coverFocus';

const COURSE_MAP_ACCENT_COLORS = [
	'#6366f1', '#ec4899', '#14b8a6', '#ea580c', '#8b5cf6', '#06b6d4', '#84cc16', '#f43f5e', '#0ea5e9'
];

function sortableMapId(mapId) {
	return `admin-course-map-${mapId}`;
}

/** Descrierea de pe card; mapele de sistem (private) sunt marcate, fiind invizibile cursanților. */
function adminMapSubtitle(map, courseCount) {
	const text = map.description
		? (map.description.length > 120 ? `${map.description.slice(0, 120)}…` : map.description)
		: `${courseCount} cursuri`;
	return map.visibility === 'private' ? `Mapă de sistem · ${text}` : text;
}

function isRealMapId(id) {
	return id !== 'unassigned' && id != null;
}

function MapColorRow({ id, label, value, fallback, onChange, onClear, canClear }) {
	const hex = normalizeColorInputToHex(value?.trim() ? value : fallback, fallback);
	return (
		<div className="va-field">
			<label htmlFor={id}>{label}</label>
			<div className="va-color-input">
				<input type="color" value={hex} onChange={(e) => onChange(e.target.value)} aria-label={`${label} — alege culoarea`} />
				<input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={fallback} maxLength={7} />
				{canClear && value?.trim() ? (
					<button type="button" className="lms-btn-secondary lms-btn-sm" onClick={onClear} aria-label={`Resetează ${label.toLowerCase()}`}>
						Resetează
					</button>
				) : null}
			</div>
		</div>
	);
}

function SortableAdminMapShowcase({
	map,
	index,
	canMutate,
	onOpenMap,
	onEdit,
	onDelete,
}) {
	const sid = sortableMapId(map.id);
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: sid,
		disabled: !canMutate || !isRealMapId(map.id),
	});
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.9 : 1,
		zIndex: isDragging ? 2 : undefined,
	};
	const accentColor = map.accent_color || COURSE_MAP_ACCENT_COLORS[index % COURSE_MAP_ACCENT_COLORS.length];
	const courseCount = map.courses_count ?? map.courses?.length ?? 0;
	const subtitle = adminMapSubtitle(map, courseCount);

	const dragHandle =
		canMutate && isRealMapId(map.id) ? (
			<DragHandle attributes={attributes} listeners={listeners} label="Trage pentru a reordona mapa" />
		) : null;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`admin-course-map-showcase-wrap${canMutate && isRealMapId(map.id) ? ' admin-course-map-showcase-wrap--sortable' : ''}`}
		>
			<CourseMapFolderTile
				title={map.name || '—'}
				subtitle={subtitle}
				count={courseCount}
				color={accentColor}
				imageUrl={mapFolderCardImageUrl(map)}
				coverFocus={map.cover_focus}
				onOpen={() => onOpenMap(map)}
				ctaLabel="Deschide mapa"
				topLeftSlot={dragHandle}
				topRightSlot={
					canMutate ? (
						<>
							<div className="admin-course-map-footer-actions" onClick={(e) => e.stopPropagation()}>
								<button type="button" className="admin-course-map-edit-btn va-card-icon-btn" onClick={(e) => { e.stopPropagation(); onEdit(map); }} aria-label="Editează mapa">
									<PencilSimple size={16} weight="bold" aria-hidden />
								</button>
							</div>
							<button
								type="button"
								className="admin-course-map-delete-btn va-card-icon-btn va-card-icon-btn--danger"
								onClick={(e) => {
									e.stopPropagation();
									onDelete(map);
								}}
								aria-label="Șterge mapa"
							>
								<Trash size={16} weight="bold" aria-hidden />
							</button>
						</>
					) : null
				}
			/>
		</div>
	);
}

function StaticAdminMapShowcase({ map, index, canMutate, onOpenMap, onEdit, onDelete }) {
	const accentColor = map.accent_color || COURSE_MAP_ACCENT_COLORS[index % COURSE_MAP_ACCENT_COLORS.length];
	const courseCount = map.courses_count ?? map.courses?.length ?? 0;
	const subtitle = adminMapSubtitle(map, courseCount);
	return (
		<div className="admin-course-map-showcase-wrap">
			<CourseMapFolderTile
				title={map.name || '—'}
				subtitle={subtitle}
				count={courseCount}
				color={accentColor}
				imageUrl={mapFolderCardImageUrl(map)}
				coverFocus={map.cover_focus}
				onOpen={() => onOpenMap(map)}
				ctaLabel="Deschide mapa"
				topRightSlot={
					canMutate ? (
						<>
							<div className="admin-course-map-footer-actions" onClick={(e) => e.stopPropagation()}>
								<button type="button" className="admin-course-map-edit-btn va-card-icon-btn" onClick={(e) => { e.stopPropagation(); onEdit(map); }} aria-label="Editează mapa">
									<PencilSimple size={16} weight="bold" aria-hidden />
								</button>
							</div>
							<button
								type="button"
								className="admin-course-map-delete-btn va-card-icon-btn va-card-icon-btn--danger"
								onClick={(e) => {
									e.stopPropagation();
									onDelete(map);
								}}
								aria-label="Șterge mapa"
							>
								<Trash size={16} weight="bold" aria-hidden />
							</button>
						</>
					) : null
				}
			/>
		</div>
	);
}

const AdminCourseMapsPage = ({  onOpenMap, autoOpenCreate = false, headerActions = null }) => {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const { canMutateInAdminArea, user } = useAuth();
	const isAdmin = (user?.actualRole ?? user?.role) === 'admin';
	const [maps, setMaps] = useState([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState('');
	const [showCreateModal, setShowCreateModal] = useState(false);
	// fereastra de editare are două file: aspectul mapei și cursurile din ea
	const [mapDialogTab, setMapDialogTab] = useState('aspect');
	const [editingMap, setEditingMap] = useState(null);
	const [managingMap, setManagingMap] = useState(null);
	const [allCourses, setAllCourses] = useState([]);
	const [formName, setFormName] = useState('');
	const [formDescription, setFormDescription] = useState('');
	const [addCourseIds, setAddCourseIds] = useState([]);
	const [deleteConfirmMap, setDeleteConfirmMap] = useState(null);
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [formAccent, setFormAccent] = useState(COURSE_MAP_ACCENT_COLORS[0]);
	const [formHeaderText, setFormHeaderText] = useState('');
	const [formVisibility, setFormVisibility] = useState('public');
	const [coverBusy, setCoverBusy] = useState(false);
	const [pendingMapCoverFile, setPendingMapCoverFile] = useState(null);
	const [pendingMapCoverPreviewUrl, setPendingMapCoverPreviewUrl] = useState(null);
	const [formCoverFocus, setFormCoverFocus] = useState(DEFAULT_COVER_FOCUS);
	const mapCoverInputRef = useRef(null);
	const [orderedMaps, setOrderedMaps] = useState([]);
	const openMapCoverPicker = () => mapCoverInputRef.current?.click();

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	const fetchMaps = useCallback(async () => {
		try {
			setLoading(true);
			const res = await adminService.getCourseMaps({
				search: searchQuery || undefined,
				per_page: 200,
				include_virtual: 1,
			});
			const list = res?.data ?? (Array.isArray(res) ? res : []);
			const arr = Array.isArray(list) ? list : [];
			setMaps(arr);
			setOrderedMaps(arr.filter((m) => m && isRealMapId(m.id)));
		} catch (err) {
			console.error('Error fetching course maps:', err);
			showToast('Nu s-au putut încărca mapele de curs', 'error');
			setMaps([]);
			setOrderedMaps([]);
		} finally {
			setLoading(false);
		}
	}, [searchQuery, showToast]);

	useEffect(() => {
		fetchMaps();
	}, [fetchMaps]);

	useEffect(() => {
		if (autoOpenCreate && canMutateInAdminArea) {
			openCreate();
		}

	}, [autoOpenCreate, canMutateInAdminArea]);

	useEffect(() => {
		if (!pendingMapCoverFile) {
			setPendingMapCoverPreviewUrl(null);
			return undefined;
		}
		const url = URL.createObjectURL(pendingMapCoverFile);
		setPendingMapCoverPreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [pendingMapCoverFile]);

	const fetchCourses = useCallback(async () => {
		try {
			const data = await adminService.getCourses({ per_page: 500 });
			setAllCourses(Array.isArray(data) ? data : (data?.data ?? []));
		} catch  {
			setAllCourses([]);
		}
	}, []);

	const closeCreateModal = useCallback(() => {
		setShowCreateModal(false);
		setPendingMapCoverFile(null);
		setPendingMapCoverPreviewUrl(null);
		setFormCoverFocus(DEFAULT_COVER_FOCUS);
		setCoverBusy(false);
	}, []);

	const openCreate = () => {
		setEditingMap(null);
		setFormName('');
		setFormDescription('');
		setFormAccent(COURSE_MAP_ACCENT_COLORS[0]);
		setFormHeaderText('');
		setFormVisibility('public');
		setPendingMapCoverFile(null);
		setPendingMapCoverPreviewUrl(null);
		setFormCoverFocus(DEFAULT_COVER_FOCUS);
		setCoverBusy(false);
		setMapDialogTab('aspect');
		setShowCreateModal(true);
	};

	const openEdit = async (map) => {
		try {
			const full = await adminService.getCourseMap(map.id);
			setEditingMap(full);
			setFormName(full.name || '');
			setFormDescription(full.description || '');
			setFormVisibility(full.visibility === 'private' ? 'private' : 'public');
			setFormAccent(full.accent_color || COURSE_MAP_ACCENT_COLORS[0]);
			setFormHeaderText(full.header_text_color || '');
			setPendingMapCoverFile(null);
			setPendingMapCoverPreviewUrl(null);
			setFormCoverFocus(normalizeCoverFocus(full.cover_focus));
			setCoverBusy(false);
			setAddCourseIds([]);
			fetchCourses();
			setMapDialogTab('aspect');
			setShowCreateModal(true);
		} catch  {
			showToast('Nu s-a putut încărca mapa', 'error');
		}
	};

	const saveMap = async () => {
		const name = (formName || '').trim();
		if (!name) {
			showToast('Numele mapei este obligatoriu', 'error');
			return;
		}
		const normalizedAccent = normalizeColorInputToHex(formAccent, COURSE_MAP_ACCENT_COLORS[0]);
		const normalizedHeaderText = formHeaderText.trim()
			? normalizeColorInputToHex(formHeaderText, null)
			: null;
		const payload = {
			name,
			description: formDescription || null,
			accent_color: normalizedAccent,
			header_bg_color: normalizedAccent,
			header_text_color: normalizedHeaderText,
			cover_focus: normalizeCoverFocus(formCoverFocus),
		};
		if (isAdmin) {
			payload.visibility = formVisibility === 'private' ? 'private' : 'public';
		}
		try {
			if (editingMap) {
				await adminService.updateCourseMap(editingMap.id, payload);
				showToast('Mapa a fost actualizată', 'success');
			} else {
				const created = await adminService.createCourseMap(payload);
				const createdId = created?.id ?? created?.data?.id ?? null;
				if (pendingMapCoverFile && createdId) {
					try {
						await adminService.uploadCourseMapCover(createdId, pendingMapCoverFile, normalizeCoverFocus(formCoverFocus));
					} catch (coverErr) {
						console.warn('Map created but cover upload failed', coverErr);
						showToast('Mapa a fost creată, dar coperta nu s-a încărcat', 'error');
					}
				}
				showToast('Mapa a fost creată', 'success');
			}
			closeCreateModal();
			fetchMaps();
		} catch (err) {
			showToast(err?.response?.data?.message || 'Eroare la salvare', 'error');
		}
	};

	const coverPreviewSrc =
		pendingMapCoverPreviewUrl ||
		(editingMap ? toImageUrl(editingMap.cover_image_url) || editingMap.cover_image_url : null);
	const previewAccent = normalizeColorInputToHex(formAccent, COURSE_MAP_ACCENT_COLORS[0]);
	const previewName = formName.trim() || 'Mapă nouă';
	const previewCourseCount = editingMap?.courses?.length ?? 0;

	const handleCoverFileChange = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		setPendingMapCoverFile(file);
		setFormCoverFocus(DEFAULT_COVER_FOCUS);
		if (!editingMap) {
			return;
		}
		setCoverBusy(true);
		try {
			const updated = await adminService.uploadCourseMapCover(editingMap.id, file, DEFAULT_COVER_FOCUS);
			// răspunsul nu conține lista de cursuri: fără îmbinare, „În mapă” apărea gol
			setEditingMap((prev) => ({ ...prev, ...updated, courses: updated?.courses ?? prev?.courses }));
			showToast('Coperta a fost încărcată', 'success');
			fetchMaps();
		} catch (err) {
			showToast(err?.response?.data?.message || 'Eroare la încărcarea copertei', 'error');
		} finally {
			setCoverBusy(false);
			setPendingMapCoverFile(null);
		}
	};

	const handleCoverRemove = async () => {
		if (!editingMap) {
			setPendingMapCoverFile(null);
			setFormCoverFocus(DEFAULT_COVER_FOCUS);
			return;
		}
		if (!editingMap.cover_image_url) return;
		setCoverBusy(true);
		try {
			const updated = await adminService.deleteCourseMapCover(editingMap.id);
			setEditingMap((prev) => ({ ...prev, ...updated, courses: updated?.courses ?? prev?.courses }));
			setFormCoverFocus(DEFAULT_COVER_FOCUS);
			showToast('Coperta a fost eliminată', 'success');
			fetchMaps();
		} catch (err) {
			showToast(err?.response?.data?.message || 'Eroare', 'error');
		} finally {
			setCoverBusy(false);
		}
	};

	const deleteMap = async (map) => {
		if (!map) return;
		setDeleteLoading(true);
		try {
			await adminService.deleteCourseMap(map.id);
			showToast('Mapa a fost ștearsă', 'success');
			setDeleteConfirmMap(null);
			if (managingMap?.id === map.id) setManagingMap(null);
			fetchMaps();
		} catch (err) {
			showToast(err?.response?.data?.message || 'Eroare la ștergere', 'error');
		} finally {
			setDeleteLoading(false);
		}
	};

	const handleConfirmDeleteMap = () => {
		if (deleteConfirmMap) deleteMap(deleteConfirmMap);
	};



	const addCoursesToMap = async (fromEditModal = false) => {
		const mapContext = fromEditModal ? editingMap : managingMap;
		if (!mapContext || addCourseIds.length === 0) return;
		try {
			await adminService.attachCoursesToMap(mapContext.id, addCourseIds);
			showToast('Cursurile au fost adăugate', 'success');
			setAddCourseIds([]);
			const updated = await adminService.getCourseMap(mapContext.id);
			if (fromEditModal) setEditingMap(updated);
			else setManagingMap(updated);
			fetchMaps();
		} catch  {
			showToast('Eroare la adăugare cursuri', 'error');
		}
	};

	const removeCourseFromMap = async (courseId, fromEditModal = false) => {
		const mapContext = fromEditModal ? editingMap : managingMap;
		if (!mapContext) return;
		try {
			await adminService.detachCourseFromMap(mapContext.id, courseId);
			const updated = await adminService.getCourseMap(mapContext.id);
			if (fromEditModal) setEditingMap(updated);
			else setManagingMap(updated);
			fetchMaps();
		} catch  {
			showToast('Eroare la scoaterea cursului', 'error');
		}
	};

	const inMapIds = (managingMap?.courses || []).map((c) => c.id);
	const availableCourses = allCourses.filter((c) => !inMapIds.includes(c.id));
	const editMapCourseIds = (editingMap?.courses || []).map((c) => c.id);
	const availableCoursesForEdit = allCourses.filter((c) => !editMapCourseIds.includes(c.id));

	const handleOpenMapCourses = (map) => {
		if (onOpenMap) {
			onOpenMap(map);
			return;
		}
		navigate(`/admin/maps/${map.id}`);
	};

	const mapsDndEnabled = canMutateInAdminArea && !searchQuery.trim();

	const handleMapsDragEnd = async (event) => {
		if (!mapsDndEnabled) return;
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const sortableRows = orderedMaps.filter((m) => isRealMapId(m.id));
		const oldIndex = sortableRows.findIndex((m) => sortableMapId(m.id) === active.id);
		const newIndex = sortableRows.findIndex((m) => sortableMapId(m.id) === over.id);
		if (oldIndex < 0 || newIndex < 0) return;
		const next = arrayMove(sortableRows, oldIndex, newIndex);
		setOrderedMaps(next);
		try {
			await adminService.reorderCourseMaps(next.map((m) => m.id));
			setMaps(next);
			showToast('Ordinea mapelor a fost salvată', 'success');
		} catch (err) {
			showToast(err?.response?.data?.message || 'Nu s-a putut salva ordinea', 'error');
			setOrderedMaps((Array.isArray(maps) ? maps : []).filter((m) => m && isRealMapId(m.id)));
		}
	};

	return (
		<div className="admin-container">
			<div className="admin-courses-page-header">
				<div className="admin-courses-header-content">
					<div className="admin-courses-header-text">
						<h1 className="admin-courses-title">Mape</h1>
						<p className="admin-courses-subtitle">Grupează cursurile în mape</p>
					</div>
					{canMutateInAdminArea && (
					<div className="admin-courses-header-actions">
						{headerActions}
						<button type="button" className="lms-btn-primary admin-btn-create-course" onClick={openCreate}>
							<Plus size={18} weight="bold" aria-hidden />
							Creează mapă
						</button>
					</div>
					)}
				</div>
				<div className="admin-courses-toolbar">
					<div className="admin-courses-search-wrapper">
						<div className="admin-courses-search">
							<MagnifyingGlass size={18} weight="regular" aria-hidden />
							<input
								type="text"
								placeholder="Caută mape..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="admin-courses-search-input"
								aria-label="Caută mape de curs"
							/>
						</div>
					</div>
				</div>
			</div>

			{searchQuery.trim() ? (
				<p className="admin-course-maps-dnd-hint">Golirea căutării activează reordonarea cu drag and drop.</p>
			) : null}

			{loading && maps.length === 0 ? (
				<div className="admin-courses-loading">
					<div className="va-spinner va-spinner-lg"></div>
					<p>Se încarcă mapele...</p>
				</div>
			) : maps.length === 0 ? (
				<div className="lms-empty-state">
					<p>Nu există mape de curs. Creează una pentru a grupa cursuri.</p>
					{canMutateInAdminArea && (
					<button type="button" className="lms-btn-primary" onClick={openCreate}>
						+ Creează prima mapă
					</button>
					)}
				</div>
			) : mapsDndEnabled ? (
				<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMapsDragEnd}>
					<SortableContext
						items={orderedMaps.filter((m) => isRealMapId(m.id)).map((m) => sortableMapId(m.id))}
						strategy={rectSortingStrategy}
					>
						<div className="admin-courses-grid admin-courses-grid-maps">
							<div className="admin-courses-grid-container admin-courses-grid-container-maps">
								{orderedMaps.map((map, index) => (
									<SortableAdminMapShowcase
										key={map.id}
										map={map}
										index={index}
										canMutate={canMutateInAdminArea}
										onOpenMap={handleOpenMapCourses}
										onEdit={openEdit}
										onDelete={setDeleteConfirmMap}
									/>
								))}
							</div>
						</div>
					</SortableContext>
				</DndContext>
			) : (
				<div className="admin-courses-grid admin-courses-grid-maps">
					<div className="admin-courses-grid-container admin-courses-grid-container-maps">
						{maps.map((map, index) => (
							<StaticAdminMapShowcase
								key={map.id}
								map={map}
								index={index}
								canMutate={canMutateInAdminArea}
								onOpenMap={handleOpenMapCourses}
								onEdit={openEdit}
								onDelete={setDeleteConfirmMap}
							/>
						))}
					</div>
				</div>
			)}

			<Modal
				isOpen={showCreateModal && canMutateInAdminArea}
				onClose={closeCreateModal}
				closeOnBackdropClick
				closeOnEscape
				ariaLabelledby="course-map-dialog-title"
				className="va-dialog-overlay"
				unstyledContent
			>
				<div className="va-dialog va-dialog--wide admin-course-map-dialog">
					<header className="va-dialog__header">
						<h2 id="course-map-dialog-title" className="va-dialog__title">{editingMap ? 'Editează mapa' : 'Mapă nouă'}</h2>
						{editingMap ? (
							<div className="va-dialog__tabs" role="tablist" aria-label="Secțiuni mapă">
								{[
									['aspect', 'Aspect'],
									['courses', `Cursuri (${(editingMap.courses || []).length})`],
								].map(([id, label]) => (
									<button
										key={id}
										type="button"
										role="tab"
										id={`course-map-tab-${id}`}
										aria-controls={`course-map-panel-${id}`}
										aria-selected={mapDialogTab === id}
										className={`va-dialog__tab${mapDialogTab === id ? ' is-active' : ''}`}
										onClick={() => setMapDialogTab(id)}
									>
										{label}
									</button>
								))}
							</div>
						) : null}
						<button type="button" className="va-close-btn" onClick={closeCreateModal} aria-label="Închide">
							<X size={18} weight="bold" aria-hidden="true" />
						</button>
					</header>
					<div className="va-dialog__body">
						<div
							className="admin-course-map-dialog__grid"
							id="course-map-panel-aspect"
							role={editingMap ? 'tabpanel' : undefined}
							aria-labelledby={editingMap ? 'course-map-tab-aspect' : undefined}
							hidden={Boolean(editingMap) && mapDialogTab !== 'aspect'}
						>
							<div className="va-field-stack">
								<div className="va-field">
									<label htmlFor="course-map-name">Nume</label>
									<input
										id="course-map-name"
										type="text"
										value={formName}
										onChange={(e) => setFormName(e.target.value)}
										placeholder="Numele mapei"
										aria-required="true"
										data-modal-initial-focus
									/>
								</div>
								<div className="va-field">
									<label htmlFor="course-map-desc">
										Descriere <span className="va-field__optional">(opțională)</span>
									</label>
									<textarea
										id="course-map-desc"
										value={formDescription}
										onChange={(e) => setFormDescription(e.target.value)}
										placeholder="Despre ce sunt cursurile din mapă"
										rows={3}
									/>
								</div>
							{isAdmin ? (
								<div className="va-field va-field--full">
									<div className="va-checks">
										<label className="va-check">
											<input
												type="checkbox"
												checked={formVisibility === 'private'}
												onChange={(e) => setFormVisibility(e.target.checked ? 'private' : 'public')}
											/>
											<span>Mapă de sistem (invizibilă pentru cursanți)</span>
										</label>
									</div>
									<p className="va-field__hint">
										Cursanții nu văd mapa; cursurile atribuite din ea le apar direct în pagina Cursuri.
									</p>
								</div>
							) : null}
								<MapColorRow
									id="course-map-accent"
									label="Culoarea mapei"
									value={formAccent}
									fallback={COURSE_MAP_ACCENT_COLORS[0]}
									onChange={setFormAccent}
								/>
								<MapColorRow
									id="course-map-text"
									label="Culoarea textului din antet"
									value={formHeaderText}
									fallback="#f8fafc"
									onChange={setFormHeaderText}
									canClear
									onClear={() => setFormHeaderText('')}
								/>
							</div>

							<div className="va-field-stack">
								<div className="va-field" aria-label="Previzualizare mapă">
									<span className="va-field__label">Așa va arăta</span>
									<div className="admin-course-map-dialog__preview">
										<CourseMapFolderTile
											className="admin-course-map-modal__tile"
											title={previewName}
											subtitle={formDescription.trim() || `${previewCourseCount} ${previewCourseCount === 1 ? 'curs' : 'cursuri'}`}
											count={previewCourseCount}
											color={previewAccent}
											imageUrl={coverPreviewSrc}
											coverFocus={formCoverFocus}
											onOpen={() => {}}
											ctaLabel="Deschide mapa"
										/>
									</div>
								</div>
								<div className="va-field admin-course-map-dialog__cover">
									<span className="va-field__label">Copertă</span>
									{coverPreviewSrc ? (
										<MapCoverFocusEditor
											src={coverPreviewSrc}
											value={formCoverFocus}
											onChange={setFormCoverFocus}
											disabled={coverBusy}
										/>
									) : (
										<p className="va-field__hint">Fără copertă — mapa folosește doar culoarea.</p>
									)}
									<div className="va-media-field__actions">
										<button type="button" className="lms-btn-secondary lms-btn-sm" onClick={openMapCoverPicker} disabled={coverBusy}>
											{coverBusy ? 'Se încarcă…' : coverPreviewSrc ? 'Schimbă imaginea' : 'Alege imaginea'}
										</button>
										{(pendingMapCoverFile || editingMap?.cover_image_url) ? (
											<button type="button" className="lms-btn-secondary lms-btn-sm" onClick={handleCoverRemove} disabled={coverBusy}>
												Șterge coperta
											</button>
										) : null}
									</div>
									<input
										ref={mapCoverInputRef}
										type="file"
										accept="image/jpeg,image/png,image/gif,image/webp"
										onChange={handleCoverFileChange}
										hidden
									/>
								</div>
							</div>

						</div>
						{editingMap ? (
							<section
								className="admin-course-map-dialog__courses"
								id="course-map-panel-courses"
								role="tabpanel"
								aria-labelledby="course-map-tab-courses"
								hidden={mapDialogTab !== 'courses'}
							>
								<div className="admin-course-map-dialog__courses-grid">
									<div className="va-field">
										<h3 className="va-dialog__section-title">În mapă</h3>
										{(editingMap.courses || []).length === 0 ? (
											<p className="va-list__empty">Niciun curs.</p>
										) : (
											<ul className="va-list va-list--scroll">
												{(editingMap.courses || []).map((c) => (
													<li key={c.id}>
														<span>{c.title}</span>
														<button
															type="button"
															className="lms-btn-secondary lms-btn-sm"
															onClick={() => removeCourseFromMap(c.id, true)}
															aria-label={`Scoate ${c.title} din mapă`}
														>
															Scoate
														</button>
													</li>
												))}
											</ul>
										)}
									</div>
									<div className="va-field">
										<h3 className="va-dialog__section-title">Adaugă cursuri</h3>
										{availableCoursesForEdit.length === 0 ? (
											<p className="va-list__empty">Nu mai sunt cursuri disponibile.</p>
										) : (
											<ul className="va-list va-list--scroll" role="group" aria-label="Selectează cursuri de adăugat">
												{availableCoursesForEdit.map((c) => (
													<li key={c.id}>
														<label className="va-check">
															<input
																type="checkbox"
																checked={addCourseIds.includes(c.id)}
																onChange={(e) => {
																	if (e.target.checked) {
																		setAddCourseIds((prev) => [...prev, c.id]);
																	} else {
																		setAddCourseIds((prev) => prev.filter((id) => id !== c.id));
																	}
																}}
															/>
															<span>{c.title}</span>
														</label>
													</li>
												))}
											</ul>
										)}
										<div className="va-media-field__actions">
											<button
												type="button"
												className="lms-btn-primary lms-btn-sm"
												onClick={() => addCoursesToMap(true)}
												disabled={addCourseIds.length === 0}
											>
												Adaugă în mapă{addCourseIds.length > 0 ? ` (${addCourseIds.length})` : ''}
											</button>
										</div>
									</div>
								</div>
							</section>
						) : null}
					</div>
					<footer className="va-dialog__footer">
						<button type="button" className="lms-btn-secondary" onClick={closeCreateModal}>
							Anulează
						</button>
						<button type="button" className="va-btn-save lms-btn-primary" onClick={saveMap} disabled={!formName?.trim()}>
							{editingMap ? 'Salvează' : 'Creează'}
						</button>
					</footer>
				</div>
			</Modal>

			{/* Manage courses modal */}
			{managingMap && canMutateInAdminArea && (
				<div className="admin-modal-overlay">
					<div className="admin-modal admin-modal-create admin-modal-lg" onClick={(e) => e.stopPropagation()}>
						<h2 className="admin-modal-title">Cursuri în „{managingMap.name}”</h2>
						<div className="admin-modal-body">
							<section className="admin-form-section" aria-label="Cursuri în mapă">
								<h3 className="admin-form-section-title">Cursuri curente</h3>
								<div className="admin-course-map-courses-list">
									{(managingMap.courses || []).length === 0 ? (
										<p className="admin-text-muted">Niciun curs în această mapă. Selectează cursuri mai jos și apasă Adaugă.</p>
									) : (
										<ul className="admin-course-map-current-list">
											{(managingMap.courses || []).map((c) => (
												<li key={c.id} className="admin-course-map-current-item">
													<span>{c.title}</span>
													<button
														type="button"
														className="admin-course-map-remove-btn"
														onClick={() => removeCourseFromMap(c.id)}
														aria-label={`Scoate ${c.title} din mapă`}
													>
														Scoate
													</button>
												</li>
											))}
										</ul>
									)}
								</div>
								<label className="admin-form-label">Adaugă cursuri</label>
								<div className="admin-course-map-picker" role="group" aria-label="Selectează cursuri de adăugat">
									{availableCourses.length === 0 ? (
										<p className="admin-text-muted">Toate cursurile sunt deja în mapă.</p>
									) : (
										<ul className="admin-course-map-checkbox-list">
											{availableCourses.map((c) => (
												<li key={c.id} className="admin-course-map-checkbox-item">
													<label className="admin-checkbox-label">
														<input
															type="checkbox"
															checked={addCourseIds.includes(c.id)}
															onChange={(e) => {
																if (e.target.checked) {
																	setAddCourseIds((prev) => [...prev, c.id]);
																} else {
																	setAddCourseIds((prev) => prev.filter((id) => id !== c.id));
																}
															}}
														/>
														<span>{c.title}</span>
													</label>
												</li>
											))}
										</ul>
									)}
								</div>
								<button
									type="button"
									className="lms-btn-primary lms-btn-sm"
									onClick={addCoursesToMap}
									disabled={addCourseIds.length === 0}
								>
									Adaugă cursurile selectate {addCourseIds.length > 0 && `(${addCourseIds.length})`}
								</button>
							</section>
						</div>
						<div className="admin-modal-actions">
							<button type="button" className="lms-btn-primary" onClick={() => setManagingMap(null)}>
								Închide
							</button>
						</div>
					</div>
				</div>
			)}

			<ConfirmModal
				open={!!deleteConfirmMap}
				onClose={() => setDeleteConfirmMap(null)}
				onConfirm={handleConfirmDeleteMap}
				title="Șterge mapa"
				message={deleteConfirmMap ? `Ștergi mapa „${deleteConfirmMap.name}”? Cursurile nu sunt șterse, doar gruparea.` : ''}
				confirmLabel="Șterge"
				cancelLabel="Anulare"
				variant="danger"
				loading={deleteLoading}
			/>
		</div>
	);
};

export default AdminCourseMapsPage;
