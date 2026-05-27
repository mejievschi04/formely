import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Archive,
  FolderPlus,
  Folders,
  ListChecks,
  MoveRight,
  Plus,
  RefreshCcw,
  Search,
  X,
} from 'lucide-react';
import Modal from '../../components/common/Modal';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import FolderCard from '../../components/admin/question-banks/FolderCard';
import { useAuth } from '../../contexts/AuthContext';
import './AdminQuestionBanksPage.css';

function stripHtmlPreview(raw, maxLen = 160) {
  if (raw == null || raw === '') return '';
  const plain = String(raw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen)}...`;
}

const QUESTION_TYPE_LABELS = {
  multiple_choice: 'Răspuns multiplu',
  single_choice: 'Răspuns unic',
  true_false: 'Adevărat/Fals',
  matching: 'Potrivire',
  ordering: 'Ordonare',
  fill_in_blank: 'Completare',
  open: 'Deschis',
};

function typeLabel(type) {
  const t = String(type || '').trim();
  return QUESTION_TYPE_LABELS[t] || t || '-';
}

function isOrphanTestQuestion(row) {
  if (!row || row.question_bank_id != null) return false;
  return row.test_id != null;
}

function getQuestionOrigin(row) {
  const usage = row?.usage || {};
  const source = usage.source;
  const bank = row?.question_bank || row?.questionBank;
  const testMeta = Array.isArray(usage.tests) && usage.tests[0] ? usage.tests[0] : null;

  if (source === 'bank' && bank?.id) {
    return {
      kind: 'bank',
      label: bank.title || `Banca #${bank.id}`,
      href: `/admin/question-banks/${bank.id}`,
    };
  }

  if (source === 'direct' && testMeta) {
    return {
      kind: 'test',
      label: testMeta.title || `Test #${testMeta.id}`,
      href: '/admin/content?tab=tests',
    };
  }

  return null;
}

const AdminQuestionBanksPage = ({ embedded = false }) => {
  const { canMutateInAdminArea } = useAuth();
  const { success, error } = useToast();
  const [hubTab, setHubTab] = useState('folders');
  const [loading, setLoading] = useState(false);
  const [folders, setFolders] = useState([]);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', description: '', tagsText: '' });
  const [createLoading, setCreateLoading] = useState(false);

  const [catalogSearchInput, setCatalogSearchInput] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPerPage, setCatalogPerPage] = useState(20);
  const [catalogScope, setCatalogScope] = useState('all');
  const [catalogTick, setCatalogTick] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogResponse, setCatalogResponse] = useState(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [createFromSelectionOpen, setCreateFromSelectionOpen] = useState(false);
  const [createFromSelectionForm, setCreateFromSelectionForm] = useState({ title: '', description: '', tagsText: '' });
  const [createFromSelectionLoading, setCreateFromSelectionLoading] = useState(false);
  const [moveToExistingOpen, setMoveToExistingOpen] = useState(false);
  const [moveTargetBankId, setMoveTargetBankId] = useState('');
  const [moveToExistingLoading, setMoveToExistingLoading] = useState(false);
  const catalogSelectAllRef = useRef(null);

  const fetchFolders = useCallback(async (query = '') => {
    setLoading(true);
    try {
      const normalizedQuery = String(query || '').trim();
      const data = await adminService.getQuestionBanks(normalizedQuery ? { search: normalizedQuery } : {});
      setFolders(Array.isArray(data) ? data : []);
    } catch {
      error('Nu am putut încărca folderele.');
    } finally {
      setLoading(false);
    }
  }, [error]);

  const loadFolders = useCallback(() => fetchFolders(search), [fetchFolders, search]);

  useEffect(() => {
    fetchFolders('');
  }, [fetchFolders]);

  useEffect(() => {
    const id = setTimeout(() => fetchFolders(search), 250);
    return () => clearTimeout(id);
  }, [fetchFolders, search]);

  useEffect(() => {
    const id = setTimeout(() => setCatalogSearch(catalogSearchInput), 300);
    return () => clearTimeout(id);
  }, [catalogSearchInput]);

  useEffect(() => {
    setCatalogPage(1);
  }, [catalogSearch, catalogScope]);

  useEffect(() => {
    if (hubTab !== 'catalog') return undefined;
    let cancelled = false;
    const run = async () => {
      setCatalogLoading(true);
      try {
        const res = await adminService.listQuestions({
          search: catalogSearch.trim() || undefined,
          page: catalogPage,
          per_page: catalogPerPage,
          ...(catalogScope === 'test_no_folder' ? { test_attached_no_folder: 1 } : {}),
        });
        if (!cancelled) setCatalogResponse(res);
      } catch {
        if (!cancelled) {
          error('Nu am putut încărca catalogul de întrebări.');
          setCatalogResponse(null);
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [hubTab, catalogSearch, catalogPage, catalogPerPage, catalogScope, catalogTick, error]);

  useEffect(() => {
    setSelectedQuestionIds([]);
  }, [catalogScope, catalogSearch]);

  useEffect(() => {
    if (hubTab !== 'catalog') setSelectedQuestionIds([]);
  }, [hubTab]);

  const catalogRows = useMemo(
    () => (Array.isArray(catalogResponse?.data) ? catalogResponse.data : []),
    [catalogResponse]
  );
  const catalogLastPage = Math.max(1, Number(catalogResponse?.last_page) || 1);
  const catalogTotalRaw = catalogResponse?.total;
  const catalogTotal =
    catalogTotalRaw != null && Number.isFinite(Number(catalogTotalRaw)) ? Number(catalogTotalRaw) : 0;
  const totalFolderQuestions = folders.reduce((sum, folder) => sum + (Number(folder?.questions_count) || 0), 0);
  const totalStarredQuestions = folders.reduce((sum, folder) => sum + (Number(folder?.starred_questions_count) || 0), 0);

  const normalizedTags = useMemo(
    () =>
      createForm.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    [createForm.tagsText]
  );

  const normalizedSelectionTags = useMemo(
    () =>
      createFromSelectionForm.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    [createFromSelectionForm.tagsText]
  );

  const selectableRowsOnPage = useMemo(
    () => catalogRows.filter((r) => isOrphanTestQuestion(r)),
    [catalogRows]
  );

  const moveTargetFolders = useMemo(
    () => folders.filter((folder) => folder && folder.id != null),
    [folders]
  );

  useEffect(() => {
    const el = catalogSelectAllRef.current;
    if (!el || hubTab !== 'catalog') return;
    const selectIds = new Set(selectableRowsOnPage.map((r) => r.id));
    const selectedOnPage = selectedQuestionIds.filter((id) => selectIds.has(id));
    el.indeterminate = selectedOnPage.length > 0 && selectedOnPage.length < selectIds.size;
  }, [hubTab, selectedQuestionIds, selectableRowsOnPage]);

  const toggleQuestionSelected = (id) => {
    setSelectedQuestionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllOnPage = () => {
    const ids = selectableRowsOnPage.map((r) => r.id);
    if (ids.length === 0) return;
    const allSelected = ids.every((id) => selectedQuestionIds.includes(id));
    if (allSelected) {
      setSelectedQuestionIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedQuestionIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const openCreateFromSelectionModal = () => {
    if (selectedQuestionIds.length < 1) {
      error('Selectează cel puțin o întrebare din catalog.');
      return;
    }
    setCreateFromSelectionForm((prev) => ({
      ...prev,
      title:
        prev.title.trim() ||
        `Întrebări din teste - ${new Date().toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    }));
    setCreateFromSelectionOpen(true);
  };

  const openMoveToExistingModal = () => {
    if (selectedQuestionIds.length < 1) {
      error('Selectează cel puțin o întrebare din catalog.');
      return;
    }
    if (!moveTargetFolders.length) {
      error('Nu există niciun folder disponibil.');
      return;
    }
    setMoveTargetBankId((prev) => {
      if (prev && moveTargetFolders.some((folder) => String(folder.id) === String(prev))) {
        return prev;
      }
      return String(moveTargetFolders[0].id);
    });
    setMoveToExistingOpen(true);
  };

  const createFolderFromSelection = async () => {
    if (!createFromSelectionForm.title.trim()) {
      error('Numele folderului este obligatoriu.');
      return;
    }
    if (selectedQuestionIds.length < 1) {
      error('Selectează cel puțin o întrebare.');
      return;
    }
    setCreateFromSelectionLoading(true);
    try {
      const created = await adminService.createQuestionBank({
        title: createFromSelectionForm.title.trim(),
        description: createFromSelectionForm.description.trim() || null,
        tags: normalizedSelectionTags,
      });
      const bankId = created?.bank?.id;
      if (!bankId) {
        error('Răspuns neașteptat de la server.');
        return;
      }
      await adminService.moveQuestionsToFolderBulk(selectedQuestionIds, bankId);
      success(`Folder creat: ${selectedQuestionIds.length} întrebări mutate în bancă.`);
      setCreateFromSelectionOpen(false);
      setCreateFromSelectionForm({ title: '', description: '', tagsText: '' });
      setSelectedQuestionIds([]);
      await loadFolders();
      setCatalogTick((t) => t + 1);
    } catch (e) {
      error(e?.response?.data?.error || e?.response?.data?.message || 'Operațiunea a eșuat.');
    } finally {
      setCreateFromSelectionLoading(false);
    }
  };

  const moveSelectionToExistingFolder = async () => {
    if (!moveTargetBankId) {
      error('Selectează un folder existent.');
      return;
    }
    if (selectedQuestionIds.length < 1) {
      error('Selectează cel puțin o întrebare.');
      return;
    }
    setMoveToExistingLoading(true);
    try {
      await adminService.moveQuestionsToFolderBulk(selectedQuestionIds, Number(moveTargetBankId));
      const targetFolder = moveTargetFolders.find((folder) => String(folder.id) === String(moveTargetBankId));
      success(`Au fost mutate ${selectedQuestionIds.length} întrebări${targetFolder?.title ? ` în ${targetFolder.title}` : ''}.`);
      setMoveToExistingOpen(false);
      setSelectedQuestionIds([]);
      setCatalogTick((t) => t + 1);
      await loadFolders();
    } catch (e) {
      error(e?.response?.data?.error || e?.response?.data?.message || 'Operațiunea a eșuat.');
    } finally {
      setMoveToExistingLoading(false);
    }
  };

  const createFolder = async () => {
    if (!createForm.title.trim()) {
      error('Numele folderului este obligatoriu.');
      return;
    }
    setCreateLoading(true);
    try {
      await adminService.createQuestionBank({
        title: createForm.title.trim(),
        description: createForm.description.trim() || null,
        tags: normalizedTags,
      });
      success('Folder creat.');
      setCreateOpen(false);
      setCreateForm({ title: '', description: '', tagsText: '' });
      await loadFolders();
    } catch (e) {
      error(e?.response?.data?.error || 'Nu am putut crea folderul.');
    } finally {
      setCreateLoading(false);
    }
  };

  const renderFolderContent = () => (
    <>
      <div className="qb-panel-header">
        <div className="qb-search-field">
          <Search size={18} aria-hidden />
          <label className="qb-sr-only" htmlFor="qb-folder-search">
            Caută foldere
          </label>
          <input
            id="qb-folder-search"
            className="admin-form-input qb-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută folder"
          />
        </div>
        {canMutateInAdminArea ? (
          <button type="button" className="lms-btn-primary qb-action-button" onClick={() => setCreateOpen(true)}>
            <FolderPlus size={18} aria-hidden />
            Folder nou
          </button>
        ) : null}
      </div>

      <section className="qb-folder-list" aria-label="Lista folderelor">
        {loading ? (
          <div className="qb-catalog-loading qb-catalog-loading--inline">
            <span className="qb-spinner" aria-hidden />
            Se încarcă folderele...
          </div>
        ) : folders.length ? (
          folders.map((folder) => <FolderCard key={folder.id} folder={folder} />)
        ) : (
          <div className="qb-empty">
            <Archive size={30} aria-hidden />
            <p className="qb-empty-title">Nu există foldere pentru filtrul curent</p>
            <p className="qb-empty-hint">Creează un folder sau mută întrebări din catalog.</p>
          </div>
        )}
      </section>
    </>
  );

  const renderCatalogContent = () => (
    <>
      <div className="qb-catalog-topbar">
        <div className="qb-search-field">
          <Search size={18} aria-hidden />
          <label className="qb-sr-only" htmlFor="qb-catalog-search">
            Caută în catalog
          </label>
          <input
            id="qb-catalog-search"
            className="admin-form-input qb-search-input"
            value={catalogSearchInput}
            onChange={(e) => setCatalogSearchInput(e.target.value)}
            placeholder="Caută întrebare"
          />
        </div>
        <div className="qb-catalog-scope" role="group" aria-label="Filtru catalog">
          <button
            type="button"
            className={`qb-scope-chip ${catalogScope === 'all' ? 'is-active' : ''}`}
            onClick={() => setCatalogScope('all')}
          >
            Toate
          </button>
          <button
            type="button"
            className={`qb-scope-chip ${catalogScope === 'test_no_folder' ? 'is-active' : ''}`}
            onClick={() => setCatalogScope('test_no_folder')}
          >
            Din teste fără folder
          </button>
        </div>
      </div>

      {canMutateInAdminArea ? (
        <div className={`qb-selection-bar ${selectedQuestionIds.length ? 'is-active' : ''}`}>
          <div className="qb-selection-main">
            <strong>{selectedQuestionIds.length}</strong>
            <span>selectate</span>
          </div>
          <div className="qb-catalog-toolbar-actions">
            <button
              type="button"
              className="lms-btn-secondary qb-action-button"
              disabled={selectedQuestionIds.length === 0}
              onClick={() => setSelectedQuestionIds([])}
            >
              <X size={16} aria-hidden />
              Golește
            </button>
            <button
              type="button"
              className="lms-btn-primary qb-action-button"
              disabled={selectedQuestionIds.length === 0}
              onClick={openCreateFromSelectionModal}
            >
              <Plus size={16} aria-hidden />
              Folder din selecție
            </button>
            <button
              type="button"
              className="lms-btn-secondary qb-action-button"
              disabled={selectedQuestionIds.length === 0 || moveTargetFolders.length === 0}
              onClick={openMoveToExistingModal}
            >
              <MoveRight size={16} aria-hidden />
              Mută în folder
            </button>
          </div>
        </div>
      ) : null}

      {catalogLoading ? (
        <div className="qb-catalog-loading">
          <span className="qb-spinner" aria-hidden />
          Se încarcă catalogul...
        </div>
      ) : catalogRows.length === 0 ? (
        <div className="qb-empty qb-empty--soft">
          <ListChecks size={30} aria-hidden />
          <p className="qb-empty-title">Nicio întrebare găsită</p>
          <p className="qb-empty-hint">Schimbă filtrul sau termenul de căutare.</p>
        </div>
      ) : (
        <>
          <div className="qb-catalog-list" role="list" aria-label="Catalog întrebări">
            {canMutateInAdminArea ? (
              <div className="qb-catalog-select-all">
                <label className="qb-checkbox-label">
                  <input
                    ref={catalogSelectAllRef}
                    type="checkbox"
                    checked={
                      selectableRowsOnPage.length > 0 &&
                      selectableRowsOnPage.every((r) => selectedQuestionIds.includes(r.id))
                    }
                    onChange={toggleSelectAllOnPage}
                    disabled={selectableRowsOnPage.length === 0}
                  />
                  Selectează întrebările mutabile de pe pagină
                </label>
                <span>{selectableRowsOnPage.length} disponibile</span>
              </div>
            ) : null}

            {catalogRows.map((row) => {
              const origin = getQuestionOrigin(row);
              const orphan = isOrphanTestQuestion(row);
              const selected = selectedQuestionIds.includes(row.id);

              return (
                <article
                  key={row.id}
                  className={`qb-catalog-row ${orphan ? 'is-movable' : ''} ${selected ? 'is-selected' : ''}`}
                  role="listitem"
                >
                  {canMutateInAdminArea ? (
                    <div className="qb-catalog-check">
                      {orphan ? (
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleQuestionSelected(row.id)}
                          aria-label={`Selectează întrebarea #${row.id}`}
                        />
                      ) : (
                        <span className="qb-check-placeholder" title="Doar întrebările din teste fără folder pot fi mutate">
                          -
                        </span>
                      )}
                    </div>
                  ) : null}

                  <div className="qb-catalog-content">
                    <p className="qb-catalog-question">{stripHtmlPreview(row.content)}</p>
                    <div className="qb-catalog-meta">
                      <span className="qb-type-pill">{typeLabel(row.type)}</span>
                      <span>{row.points ?? '-'} puncte</span>
                      {origin ? (
                        <Link to={origin.href} className="qb-catalog-link">
                          {origin.kind === 'bank' ? 'Folder' : 'Test'}: {origin.label}
                        </Link>
                      ) : (
                        <span>Fără proveniență</span>
                      )}
                    </div>
                  </div>

                  {origin?.href ? (
                    <Link to={origin.href} className="qb-row-open" aria-label="Deschide sursa">
                      <ArrowRight size={18} aria-hidden />
                    </Link>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="qb-catalog-pagination">
            <span className="qb-catalog-page-meta">
              Pagina {catalogPage} din {catalogLastPage}
              {catalogTotal > 0 ? ` - ${catalogTotal} întrebări` : ''}
            </span>
            <div className="qb-catalog-pagination-actions">
              <label className="qb-catalog-per-page">
                Pe pagină
                <select
                  className="admin-form-input"
                  value={catalogPerPage}
                  onChange={(e) => {
                    setCatalogPerPage(Number(e.target.value));
                    setCatalogPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </label>
              <button
                type="button"
                className="lms-btn-secondary"
                disabled={catalogPage <= 1}
                onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="lms-btn-secondary"
                disabled={catalogPage >= catalogLastPage}
                onClick={() => setCatalogPage((p) => p + 1)}
              >
                Următor
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );

  return (
    <div className={`qb-page qb-page-v2 ${embedded ? 'qb-page-embedded' : ''}`}>
      <div className="qb-shell">
        <header className="qb-page-hero">
          <div className="qb-page-hero-text">
            <p className="qb-page-eyebrow">Bibliotecă evaluare</p>
            <h1>Întrebări</h1>
            <p className="qb-page-lead">
              Organizează întrebările în foldere reutilizabile și curăță rapid întrebările rămase direct în teste.
            </p>
          </div>
          <div className="qb-hero-actions">
            <button
              type="button"
              className={`qb-tab-button ${hubTab === 'folders' ? 'is-active' : ''}`}
              onClick={() => setHubTab('folders')}
            >
              <Folders size={18} aria-hidden />
              Foldere
            </button>
            <button
              type="button"
              className={`qb-tab-button ${hubTab === 'catalog' ? 'is-active' : ''}`}
              onClick={() => setHubTab('catalog')}
            >
              <ListChecks size={18} aria-hidden />
              Catalog
            </button>
          </div>
        </header>

        <section className="qb-overview-grid" aria-label="Rezumat întrebări">
          <div className="qb-overview-item">
            <Folders size={18} aria-hidden />
            <div>
              <strong>{loading ? '...' : folders.length}</strong>
              <span>foldere</span>
            </div>
          </div>
          <div className="qb-overview-item">
            <Archive size={18} aria-hidden />
            <div>
              <strong>{loading ? '...' : totalFolderQuestions}</strong>
              <span>întrebări în foldere</span>
            </div>
          </div>
          <div className="qb-overview-item">
            <ListChecks size={18} aria-hidden />
            <div>
              <strong>{hubTab === 'catalog' ? (catalogLoading ? '...' : catalogTotal) : totalStarredQuestions}</strong>
              <span>{hubTab === 'catalog' ? 'în catalog' : 'marcate cu stea'}</span>
            </div>
          </div>
          <button type="button" className="qb-overview-refresh" onClick={hubTab === 'folders' ? loadFolders : () => setCatalogTick((t) => t + 1)}>
            <RefreshCcw size={18} aria-hidden />
            Actualizează
          </button>
        </section>

        <main className="qb-workspace">
          {hubTab === 'folders' ? renderFolderContent() : renderCatalogContent()}
        </main>

        <Modal isOpen={createOpen && canMutateInAdminArea} onClose={() => !createLoading && setCreateOpen(false)}>
          <div className="qb-modal">
            <h3>Folder nou</h3>
            <label htmlFor="qb-new-folder-title">Nume</label>
            <input
              id="qb-new-folder-title"
              className="admin-form-input"
              value={createForm.title}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
            />
            <label htmlFor="qb-new-folder-description">Descriere</label>
            <textarea
              id="qb-new-folder-description"
              className="admin-form-input"
              rows={3}
              value={createForm.description}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
            />
            <label htmlFor="qb-new-folder-tags">Tag-uri separate prin virgulă</label>
            <input
              id="qb-new-folder-tags"
              className="admin-form-input"
              value={createForm.tagsText}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, tagsText: e.target.value }))}
            />
            <div className="qb-modal-actions">
              <button type="button" className="lms-btn-secondary" onClick={() => setCreateOpen(false)} disabled={createLoading}>
                Anulează
              </button>
              <button type="button" className="lms-btn-primary" onClick={createFolder} disabled={createLoading}>
                {createLoading ? 'Se salvează...' : 'Creează'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={createFromSelectionOpen && canMutateInAdminArea}
          onClose={() => !createFromSelectionLoading && setCreateFromSelectionOpen(false)}
        >
          <div className="qb-modal qb-modal-from-selection">
            <h3>Folder din selecție</h3>
            <p className="qb-modal-warning">
              Vor fi mutate <strong>{selectedQuestionIds.length}</strong> întrebări în folderul nou.
            </p>
            <label htmlFor="qb-from-sel-title">Nume folder</label>
            <input
              id="qb-from-sel-title"
              className="admin-form-input"
              value={createFromSelectionForm.title}
              onChange={(e) => setCreateFromSelectionForm((prev) => ({ ...prev, title: e.target.value }))}
            />
            <label htmlFor="qb-from-sel-desc">Descriere</label>
            <textarea
              id="qb-from-sel-desc"
              className="admin-form-input"
              rows={3}
              value={createFromSelectionForm.description}
              onChange={(e) => setCreateFromSelectionForm((prev) => ({ ...prev, description: e.target.value }))}
            />
            <label htmlFor="qb-from-sel-tags">Tag-uri separate prin virgulă</label>
            <input
              id="qb-from-sel-tags"
              className="admin-form-input"
              value={createFromSelectionForm.tagsText}
              onChange={(e) => setCreateFromSelectionForm((prev) => ({ ...prev, tagsText: e.target.value }))}
            />
            <div className="qb-modal-actions">
              <button
                type="button"
                className="lms-btn-secondary"
                onClick={() => setCreateFromSelectionOpen(false)}
                disabled={createFromSelectionLoading}
              >
                Anulează
              </button>
              <button type="button" className="lms-btn-primary" onClick={createFolderFromSelection} disabled={createFromSelectionLoading}>
                {createFromSelectionLoading ? 'Se creează...' : 'Creează și mută'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={moveToExistingOpen && canMutateInAdminArea}
          onClose={() => !moveToExistingLoading && setMoveToExistingOpen(false)}
        >
          <div className="qb-modal qb-modal-from-selection">
            <h3>Mută în folder</h3>
            <p className="qb-modal-warning">
              Vor fi mutate <strong>{selectedQuestionIds.length}</strong> întrebări în folderul ales.
            </p>
            <label htmlFor="qb-move-target-folder">Folder</label>
            <select
              id="qb-move-target-folder"
              className="admin-form-input"
              value={moveTargetBankId}
              onChange={(e) => setMoveTargetBankId(e.target.value)}
            >
              {moveTargetFolders.map((folder) => (
                <option key={folder.id} value={String(folder.id)}>
                  {folder.title || `Banca #${folder.id}`}
                </option>
              ))}
            </select>
            <div className="qb-modal-actions">
              <button
                type="button"
                className="lms-btn-secondary"
                onClick={() => setMoveToExistingOpen(false)}
                disabled={moveToExistingLoading}
              >
                Anulează
              </button>
              <button
                type="button"
                className="lms-btn-primary"
                onClick={moveSelectionToExistingFolder}
                disabled={moveToExistingLoading || moveTargetFolders.length === 0}
              >
                {moveToExistingLoading ? 'Se mută...' : 'Mută'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default AdminQuestionBanksPage;
