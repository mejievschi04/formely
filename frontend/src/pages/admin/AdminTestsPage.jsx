import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import AdminContentItemCard from '../../components/admin/content/AdminContentItemCard';
import '../../styles/admin-content-list.css';
import './AdminTestsPage.css';

const normalizeTests = (raw) => (Array.isArray(raw) ? raw : []);
const normalizeTestStatus = (status) => (String(status || 'draft').toLowerCase() === 'published' ? 'published' : 'draft');

function testStatusLabel(status) {
  return normalizeTestStatus(status) === 'published' ? 'Publicat' : 'Draft';
}

function testTypeLabel(type) {
  const t = String(type || 'final').toLowerCase();
  if (t === 'practice') return 'Practică';
  if (t === 'graded') return 'Notat';
  return 'Final';
}

function buildTestMetaLine(item) {
  const questions = item.questions_count ?? item.questions?.length ?? 0;
  const parts = [
    `${questions} întrebări`,
    `${Number(item.passing_score ?? 70)}% prag`,
    item.max_attempts != null ? `${item.max_attempts} încercări` : null,
    item.time_limit_minutes ? `${item.time_limit_minutes} min` : 'Timp nelimitat',
  ].filter(Boolean);
  return parts.join(' · ');
}

export default function AdminTestsPage() {
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();
  const { canMutateInAdminArea } = useAuth();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [deleteConfirmTest, setDeleteConfirmTest] = useState(null);

  const listStats = useMemo(() => {
    const counts = { all: tests.length, draft: 0, published: 0 };
    tests.forEach((item) => {
      const status = normalizeTestStatus(item?.status);
      if (status in counts) counts[status] += 1;
    });
    return counts;
  }, [tests]);

  const loadTests = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await adminService.getTests();
      setTests(normalizeTests(data));
    } catch (e) {
      console.error('Failed to load tests:', e);
      setTests([]);
      setError('Nu s-a putut încărca lista de teste.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTests();
  }, [loadTests]);

  const filteredTests = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = tests.map((item) => ({ ...item, status: normalizeTestStatus(item?.status) }));
    if (!needle) return rows;
    return rows.filter((row) => {
      const title = String(row?.title || '').toLowerCase();
      const description = String(row?.description || '').toLowerCase();
      return title.includes(needle) || description.includes(needle);
    });
  }, [tests, query]);

  const openBuilder = (item, section = 'questions') => {
    if (!item?.id) return;
    navigate(`/admin/tests/${item.id}/builder?section=${section}`);
  };

  const handlePublish = async (item) => {
    if (!item?.id) return;
    setBusyId(item.id);
    try {
      await adminService.publishTest(item.id);
      setTests((prev) => prev.map((row) => (
        row.id === item.id ? { ...row, status: 'published' } : row
      )));
      showSuccess('Test publicat.');
    } catch (e) {
      console.error('Failed to publish test:', e);
      showError(e?.response?.data?.message || 'Nu s-a putut publica testul.');
    } finally {
      setBusyId(null);
    }
  };

  const patchTestStatus = async (item, status) => {
    if (!item?.id) return;
    setBusyId(item.id);
    try {
      await adminService.updateTest(item.id, { status: status === 'published' ? 'published' : 'draft' });
      showSuccess(status === 'published' ? 'Test publicat.' : 'Test mutat în draft.');
      setTests((prev) => prev.map((row) => (
        row.id === item.id ? { ...row, status: status === 'published' ? 'published' : 'draft' } : row
      )));
    } catch (e) {
      console.error('Failed to update test status:', e);
      showError(e?.response?.data?.message || 'Nu s-a putut actualiza statusul.');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDeleteTest = async () => {
    if (!deleteConfirmTest?.id) return;
    setBusyId(deleteConfirmTest.id);
    try {
      await adminService.deleteTest(deleteConfirmTest.id);
      showSuccess('Test șters.');
      setTests((prev) => prev.filter((row) => row.id !== deleteConfirmTest.id));
      setDeleteConfirmTest(null);
    } catch (e) {
      console.error('Failed to delete test:', e);
      showError(e?.response?.data?.message || 'Nu s-a putut șterge testul.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-tests-page admin-content-list-page">
      <header className="admin-content-list-header">
        <div className="admin-content-list-header__copy">
          <p className="admin-content-list-header__kicker">Conținut</p>
          <h1>Teste</h1>
          <p className="admin-content-list-header__lead">
            Setări și întrebări în același builder ca la cursuri.
          </p>
          <div className="admin-content-list-stats" aria-label="Rezumat">
            <span>Total<strong>{listStats.all}</strong></span>
            <span>Draft<strong>{listStats.draft}</strong></span>
            <span>Publicate<strong>{listStats.published}</strong></span>
          </div>
        </div>
      </header>

      <div className="admin-content-list-toolbar">
        <div className="admin-content-list-search">
          <input
            type="search"
            placeholder="Caută test..."
            aria-label="Caută teste"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="admin-content-list-skeleton" aria-busy="true" aria-label="Se încarcă testele">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-content-list-skeleton__card" />
          ))}
        </div>
      ) : error ? (
        <div className="admin-content-list-empty">{error}</div>
      ) : filteredTests.length === 0 ? (
        <div className="admin-content-list-empty">
          {tests.length === 0 ? 'Niciun test încă. Creează unul din constructorul de curs.' : 'Niciun rezultat pentru căutare.'}
        </div>
      ) : (
        <div className="admin-content-list-grid">
          {filteredTests.map((item) => {
            const status = normalizeTestStatus(item.status);
            const busy = busyId === item.id;

            const secondaryActions = canMutateInAdminArea
              ? [
                  { label: 'Setări', onClick: () => openBuilder(item, 'settings'), disabled: busy },
                  status === 'draft'
                    ? { label: busy ? 'Se publică…' : 'Publică', onClick: () => handlePublish(item), disabled: busy, emphasis: true }
                    : { label: 'Draft', onClick: () => patchTestStatus(item, 'draft'), disabled: busy },
                  { label: 'Șterge', onClick: () => setDeleteConfirmTest(item), disabled: busy, danger: true },
                ]
              : [];

            return (
              <AdminContentItemCard
                key={item.id}
                title={item.title || 'Test fără titlu'}
                badge={`Test ${testTypeLabel(item.type).toLowerCase()}`}
                status={status}
                statusLabel={testStatusLabel(status)}
                metaLine={buildTestMetaLine(item)}
                primaryAction={{
                  label: 'Deschide builder-ul',
                  onClick: () => openBuilder(item, 'questions'),
                  disabled: busy,
                }}
                actions={secondaryActions}
              />
            );
          })}
        </div>
      )}

      {deleteConfirmTest ? (
        <div
          className="admin-tests-modal-overlay"
          role="presentation"
          onClick={() => !busyId && setDeleteConfirmTest(null)}
        >
          <div
            className="admin-tests-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="test-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="test-delete-title">Ștergi testul?</h3>
            <p className="admin-tests-delete-lead">
              <strong>{deleteConfirmTest.title || 'Test'}</strong> va fi eliminat. Legăturile din cursuri pot înceta să funcționeze.
            </p>
            <p className="admin-tests-delete-hint">Pentru a ascunde testul de elevi, mută-l în draft.</p>
            <div className="admin-tests-delete-actions">
              <button type="button" disabled={busyId} onClick={() => setDeleteConfirmTest(null)}>
                Anulează
              </button>
              <button type="button" className="is-danger-solid" disabled={busyId} onClick={handleConfirmDeleteTest}>
                {busyId ? 'Se șterge…' : 'Șterge'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
