import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckSquare,
  FileText,
  NotebookPen,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
} from '../../api/plans.ts'
import type { PlanItem } from '../../api/plans.ts'
import type { ApiError } from '../../api/client.ts'
import { useAuth } from '../../context/AuthContext.tsx'
import {
  formatYmd,
  getTodayInTimezone,
  getTomorrowInTimezone,
} from '../../utils/date.ts'

type FilterMode = 'all' | 'tomorrow' | 'today' | 'pinned'
type EditorMode = 'write' | 'checklist'
type SaveState = 'idle' | 'saving' | 'saved' | 'unsaved' | 'error'

interface ParsedLine {
  index: number
  raw: string
  isTask: boolean
  checked: boolean
  text: string
}

function parseContentLines(content: string): ParsedLine[] {
  if (!content) return []
  return content.split('\n').map((raw, index) => {
    const match = raw.match(/^\s*-\s*\[( |x|X)\]\s*(.*)$/)
    if (match) {
      return {
        index,
        raw,
        isTask: true,
        checked: match[1].toLowerCase() === 'x',
        text: match[2],
      }
    }
    return {
      index,
      raw,
      isTask: false,
      checked: false,
      text: raw,
    }
  })
}

function getChecklistStats(content: string | null): { total: number; done: number } {
  if (!content) return { total: 0, done: 0 }
  const lines = parseContentLines(content).filter((l) => l.isTask)
  return {
    total: lines.length,
    done: lines.filter((l) => l.checked).length,
  }
}

export function PlansPage() {
  const { user } = useAuth()
  const userTz = user?.timezone
  const todayYmd = useMemo(() => getTodayInTimezone(userTz), [userTz])
  const tomorrowYmd = useMemo(() => getTomorrowInTimezone(userTz), [userTz])

  const [plans, setPlans] = useState<PlanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<FilterMode>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mobileEditing, setMobileEditing] = useState(false)

  // Active draft fields
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [draftDate, setDraftDate] = useState<string>('')
  const [draftPinned, setDraftPinned] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>('write')
  const [newTaskLine, setNewTaskLine] = useState('')

  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const saveTimerRef = useRef<number | null>(null)
  const pendingPayloadRef = useRef<{
    id: number
    title: string
    content: string
    plan_date: string | null
    is_pinned: boolean
  } | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const sortPlans = useCallback((items: PlanItem[]) => {
    return [...items].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
      const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0
      const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0
      if (timeB !== timeA) return timeB - timeA
      return b.id - a.id
    })
  }, [])

  const applyPlanToDraft = useCallback((plan: PlanItem | null) => {
    if (!plan) {
      setDraftTitle('')
      setDraftContent('')
      setDraftDate('')
      setDraftPinned(false)
      setSaveState('idle')
      setSaveError(null)
      setConfirmDeleteId(null)
      return
    }
    setDraftTitle(plan.title)
    setDraftContent(plan.content || '')
    setDraftDate(plan.plan_date || '')
    setDraftPinned(plan.is_pinned)
    setSaveState('saved')
    setSaveError(null)
    setConfirmDeleteId(null)
  }, [])

  const applyLoadedPlans = useCallback(
    (data: PlanItem[], currentSelectedId: number | null) => {
      const sorted = sortPlans(data)
      setPlans(sorted)
      if (sorted.length > 0) {
        const existing = currentSelectedId
          ? sorted.find((p) => p.id === currentSelectedId)
          : null
        const target = existing || sorted[0]
        setSelectedId(target.id)
        applyPlanToDraft(target)
      } else {
        setSelectedId(null)
        applyPlanToDraft(null)
      }
    },
    [sortPlans, applyPlanToDraft]
  )

  const fetchPlans = useCallback(() => {
    setLoading(true)
    setError(null)
    getPlans()
      .then((data) => {
        applyLoadedPlans(data, selectedId)
        setLoading(false)
      })
      .catch((err: unknown) => {
        const apiErr = err as ApiError
        setError(apiErr.message || 'Failed to load plans.')
        setLoading(false)
      })
  }, [applyLoadedPlans, selectedId])

  useEffect(() => {
    let ignore = false
    getPlans()
      .then((data) => {
        if (!ignore) {
          applyLoadedPlans(data, null)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          const apiErr = err as ApiError
          setError(apiErr.message || 'Failed to load plans.')
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [applyLoadedPlans])

  const commitSave = useCallback(
    async (payload: {
      id: number
      title: string
      content: string
      plan_date: string | null
      is_pinned: boolean
    }) => {
      const trimmedTitle = payload.title.trim()
      if (!trimmedTitle) {
        setSaveState('error')
        setSaveError('Title is required before saving.')
        return
      }

      setSaveState('saving')
      setSaveError(null)
      try {
        const updated = await updatePlan(payload.id, {
          title: trimmedTitle,
          content: payload.content || null,
          plan_date: payload.plan_date || null,
          is_pinned: payload.is_pinned,
        })
        setPlans((prev) => sortPlans(prev.map((p) => (p.id === updated.id ? updated : p))))
        // Only mark saved if no newer edits happened for the same plan while request was in flight
        if (!pendingPayloadRef.current || pendingPayloadRef.current.id !== payload.id) {
          setSaveState('saved')
        }
      } catch (err: unknown) {
        const apiErr = err as ApiError
        setSaveState('error')
        setSaveError(apiErr.message || 'Failed to save changes.')
      }
    },
    [sortPlans]
  )

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (pendingPayloadRef.current) {
      const toSave = pendingPayloadRef.current
      pendingPayloadRef.current = null
      void commitSave(toSave)
    }
  }, [commitSave])

  useEffect(() => {
    return () => {
      flushPendingSave()
    }
  }, [flushPendingSave])

  const scheduleAutoSave = (next: {
    id: number
    title: string
    content: string
    plan_date: string | null
    is_pinned: boolean
  }) => {
    pendingPayloadRef.current = next
    setSaveState('unsaved')
    setSaveError(null)

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      const payload = pendingPayloadRef.current
      pendingPayloadRef.current = null
      if (payload) {
        void commitSave(payload)
      }
    }, 650)
  }

  const handleSelectPlan = (plan: PlanItem) => {
    if (plan.id !== selectedId) {
      flushPendingSave()
      setSelectedId(plan.id)
      applyPlanToDraft(plan)
    }
    setMobileEditing(true)
  }

  const handleCreateNew = async (preset: 'tomorrow' | 'today' | 'note') => {
    if (creating) return
    flushPendingSave()
    setCreating(true)
    setError(null)

    const planDate =
      preset === 'tomorrow' ? tomorrowYmd : preset === 'today' ? todayYmd : null
    const defaultTitle =
      preset === 'tomorrow'
        ? `Tomorrow's Plan (${formatYmd(tomorrowYmd, { month: 'short', day: 'numeric' })})`
        : preset === 'today'
          ? `Today's Plan (${formatYmd(todayYmd, { month: 'short', day: 'numeric' })})`
          : 'Untitled Note'

    try {
      const created = await createPlan({
        title: defaultTitle,
        content: '',
        plan_date: planDate,
        is_pinned: false,
      })
      setPlans((prev) => sortPlans([created, ...prev]))
      setSelectedId(created.id)
      applyPlanToDraft(created)
      setFilter('all')
      setSearchQuery('')
      setEditorMode('write')
      setMobileEditing(true)

      window.setTimeout(() => {
        textareaRef.current?.focus()
      }, 40)
    } catch (err: unknown) {
      const apiErr = err as ApiError
      setError(apiErr.message || 'Could not create plan.')
    } finally {
      setCreating(false)
    }
  }

  const updateDraftFields = (
    updates: Partial<{
      title: string
      content: string
      planDate: string
      isPinned: boolean
    }>,
    immediate = false
  ) => {
    if (selectedId === null) return

    const nextTitle = updates.title !== undefined ? updates.title : draftTitle
    const nextContent = updates.content !== undefined ? updates.content : draftContent
    const nextDate = updates.planDate !== undefined ? updates.planDate : draftDate
    const nextPinned = updates.isPinned !== undefined ? updates.isPinned : draftPinned

    if (updates.title !== undefined) setDraftTitle(nextTitle)
    if (updates.content !== undefined) setDraftContent(nextContent)
    if (updates.planDate !== undefined) setDraftDate(nextDate)
    if (updates.isPinned !== undefined) setDraftPinned(nextPinned)

    const payload = {
      id: selectedId,
      title: nextTitle,
      content: nextContent,
      plan_date: nextDate || null,
      is_pinned: nextPinned,
    }

    if (immediate) {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      pendingPayloadRef.current = null
      void commitSave(payload)
    } else {
      scheduleAutoSave(payload)
    }
  }

  const handleToggleChecklistLine = (lineIndex: number) => {
    const lines = draftContent.split('\n')
    const line = lines[lineIndex]
    if (line === undefined) return
    const match = line.match(/^(\s*-\s*\[)( |x|X)(\]\s*.*)$/)
    if (!match) return
    const nextMark = match[2].toLowerCase() === 'x' ? ' ' : 'x'
    lines[lineIndex] = `${match[1]}${nextMark}${match[3]}`
    const updated = lines.join('\n')
    updateDraftFields({ content: updated }, true)
  }

  const handleAppendChecklistItem = () => {
    const text = newTaskLine.trim()
    if (!text) {
      const prefix = draftContent && !draftContent.endsWith('\n') ? '\n' : ''
      const updated = `${draftContent}${prefix}- [ ] `
      setEditorMode('write')
      updateDraftFields({ content: updated })
      window.setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(updated.length, updated.length)
        }
      }, 20)
      return
    }
    const prefix = draftContent && !draftContent.endsWith('\n') ? '\n' : ''
    const updated = `${draftContent}${prefix}- [ ] ${text}`
    setNewTaskLine('')
    updateDraftFields({ content: updated }, true)
  }

  const handleDeletePlan = async (id: number) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    pendingPayloadRef.current = null

    try {
      await deletePlan(id)
      const remaining = plans.filter((p) => p.id !== id)
      setPlans(remaining)
      setConfirmDeleteId(null)

      if (remaining.length > 0) {
        setSelectedId(remaining[0].id)
        applyPlanToDraft(remaining[0])
      } else {
        setSelectedId(null)
        applyPlanToDraft(null)
        setMobileEditing(false)
      }
    } catch (err: unknown) {
      const apiErr = err as ApiError
      setSaveError(apiErr.message || 'Failed to delete note.')
    }
  }

  const filteredPlans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return plans.filter((p) => {
      if (filter === 'tomorrow' && p.plan_date !== tomorrowYmd) return false
      if (filter === 'today' && p.plan_date !== todayYmd) return false
      if (filter === 'pinned' && !p.is_pinned) return false
      if (q) {
        const hay = `${p.title} ${p.content || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [plans, filter, searchQuery, tomorrowYmd, todayYmd])

  const counts = useMemo(() => {
    return {
      all: plans.length,
      tomorrow: plans.filter((p) => p.plan_date === tomorrowYmd).length,
      today: plans.filter((p) => p.plan_date === todayYmd).length,
      pinned: plans.filter((p) => p.is_pinned).length,
    }
  }, [plans, tomorrowYmd, todayYmd])

  const formatPlanDateLabel = (ymd: string | null) => {
    if (!ymd) return null
    if (ymd === todayYmd) return { label: 'Today', className: 'is-today' }
    if (ymd === tomorrowYmd) return { label: 'Tomorrow', className: 'is-tomorrow' }
    return { label: formatYmd(ymd, { month: 'short', day: 'numeric' }), className: '' }
  }

  const selectedPlan = plans.find((p) => p.id === selectedId) || null
  const parsedLines = useMemo(() => parseContentLines(draftContent), [draftContent])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">PLANNER &amp; NOTES</p>
          <h1>Plans</h1>
          <p className="muted">
            Jot down your plan for tomorrow, organize today&apos;s notes, or save quick ideas.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button secondary"
            onClick={() => void handleCreateNew('tomorrow')}
            disabled={creating}
          >
            <Sparkles size={16} />
            Plan Tomorrow
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => void handleCreateNew('note')}
            disabled={creating}
          >
            <Plus size={18} />
            New Note
          </button>
        </div>
      </header>

      <div className="plans-toolbar">
        <div className="plans-filters">
          {(
            [
              { id: 'all', label: 'All', count: counts.all },
              { id: 'tomorrow', label: 'Tomorrow', count: counts.tomorrow },
              { id: 'today', label: 'Today', count: counts.today },
              { id: 'pinned', label: 'Pinned', count: counts.pinned },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`plans-filter-pill ${filter === tab.id ? 'active' : ''}`}
              onClick={() => setFilter(tab.id)}
            >
              <span>{tab.label}</span>
              <span style={{ opacity: 0.75, fontSize: '11px' }}>{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="plans-search">
          <Search size={15} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search plans & notes..."
            aria-label="Search plans and notes"
          />
        </div>
      </div>

      {loading ? (
        <div className="panel" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }}
          />
          <p className="muted" style={{ margin: 0, fontSize: '14px' }}>
            Loading your plans...
          </p>
        </div>
      ) : error ? (
        <div className="panel" style={{ textAlign: 'center', padding: '36px 20px' }}>
          <p style={{ color: 'var(--status-missed)', marginBottom: '16px', fontSize: '14px' }}>
            {error}
          </p>
          <button type="button" className="button secondary" onClick={fetchPlans}>
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      ) : plans.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: '56px 24px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
              color: 'var(--accent)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 14px',
            }}
          >
            <NotebookPen size={24} />
          </div>
          <h2 style={{ margin: '0 0 8px' }}>No plans or notes yet</h2>
          <p className="muted" style={{ maxWidth: '420px', margin: '0 auto 22px', fontSize: '14px' }}>
            Write out what you want to tackle tomorrow, keep a scratchpad for today, or turn lines into checkable items.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => void handleCreateNew('tomorrow')}
              disabled={creating}
            >
              <Sparkles size={16} /> Plan Tomorrow
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => void handleCreateNew('note')}
              disabled={creating}
            >
              <Plus size={18} /> Create First Note
            </button>
          </div>
        </div>
      ) : (
        <div className={`plans-layout ${mobileEditing && selectedPlan ? 'mobile-editing' : ''}`}>
          {/* Left pane: Plan/Note cards */}
          <div className="plans-list-column">
            {filteredPlans.length === 0 ? (
              <div className="panel" style={{ padding: '28px 18px', textAlign: 'center' }}>
                <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
                  No notes match this filter.
                </p>
              </div>
            ) : (
              <div className="plans-list">
                {filteredPlans.map((plan) => {
                  const dateInfo = formatPlanDateLabel(plan.plan_date)
                  const stats = getChecklistStats(plan.content)
                  const isActive = plan.id === selectedId
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      className={`plan-card ${isActive ? 'active' : ''}`}
                      onClick={() => handleSelectPlan(plan)}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                      >
                        <h3 className="plan-card-title">{plan.title}</h3>
                        {plan.is_pinned && (
                          <Pin size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        )}
                      </div>

                      <p className="plan-card-preview">
                        {plan.content?.trim() ? plan.content : 'Empty note — tap to write...'}
                      </p>

                      {(dateInfo || stats.total > 0) && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                            marginTop: '10px',
                          }}
                        >
                          {dateInfo && (
                            <span className={`plan-date-badge ${dateInfo.className}`}>
                              <Calendar size={11} />
                              {dateInfo.label}
                            </span>
                          )}
                          {stats.total > 0 && (
                            <span className="plan-date-badge">
                              <CheckSquare size={11} />
                              {stats.done}/{stats.total}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right pane: Note editor */}
          <div className="plans-editor-column">
            {selectedPlan ? (
              <div className="plan-editor">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    className="button secondary plan-mobile-back"
                    onClick={() => {
                      flushPendingSave()
                      setMobileEditing(false)
                    }}
                    style={{ height: '34px', padding: '0 10px', fontSize: '13px' }}
                  >
                    <ArrowLeft size={15} /> All Plans
                  </button>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginLeft: 'auto',
                      fontSize: '12px',
                    }}
                  >
                    {saveState === 'saving' && (
                      <span className="muted">Saving...</span>
                    )}
                    {saveState === 'saved' && (
                      <span
                        style={{
                          color: 'var(--status-completed)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Check size={13} /> Saved
                      </span>
                    )}
                    {saveState === 'unsaved' && (
                      <span className="muted">Unsaved changes...</span>
                    )}
                    {saveState === 'error' && (
                      <span style={{ color: 'var(--status-missed)' }}>
                        {saveError || 'Save failed'}
                      </span>
                    )}
                  </div>
                </div>

                <input
                  ref={titleInputRef}
                  type="text"
                  className="plan-title-input"
                  value={draftTitle}
                  onChange={(e) => updateDraftFields({ title: e.target.value })}
                  onBlur={flushPendingSave}
                  placeholder="Plan or note title..."
                  maxLength={255}
                  aria-label="Plan title"
                />

                {/* Toolbar: Date tags, Pin, Mode switch, Delete */}
                <div className="plan-editor-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`plans-filter-pill ${draftDate === todayYmd ? 'active' : ''}`}
                      onClick={() =>
                        updateDraftFields(
                          { planDate: draftDate === todayYmd ? '' : todayYmd },
                          true
                        )
                      }
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className={`plans-filter-pill ${draftDate === tomorrowYmd ? 'active' : ''}`}
                      onClick={() =>
                        updateDraftFields(
                          { planDate: draftDate === tomorrowYmd ? '' : tomorrowYmd },
                          true
                        )
                      }
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      Tomorrow
                    </button>
                    <input
                      type="date"
                      value={draftDate}
                      onChange={(e) => updateDraftFields({ planDate: e.target.value }, true)}
                      aria-label="Plan date"
                      style={{
                        height: '30px',
                        padding: '0 8px',
                        borderRadius: '999px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        fontSize: '12px',
                      }}
                    />
                    {draftDate && (
                      <button
                        type="button"
                        className="plans-filter-pill"
                        onClick={() => updateDraftFields({ planDate: '' }, true)}
                        style={{ padding: '4px 9px', fontSize: '11.5px' }}
                        title="Remove date tag"
                      >
                        Clear date
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`plans-filter-pill ${editorMode === 'write' ? 'active' : ''}`}
                      onClick={() => setEditorMode('write')}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      <FileText size={13} /> Write
                    </button>
                    <button
                      type="button"
                      className={`plans-filter-pill ${editorMode === 'checklist' ? 'active' : ''}`}
                      onClick={() => setEditorMode('checklist')}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      <CheckSquare size={13} /> Checklist
                    </button>

                    <button
                      type="button"
                      className={`plans-filter-pill ${draftPinned ? 'active' : ''}`}
                      onClick={() => updateDraftFields({ isPinned: !draftPinned }, true)}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      title={draftPinned ? 'Unpin note' : 'Pin note to top'}
                    >
                      {draftPinned ? <PinOff size={13} /> : <Pin size={13} />}
                      {draftPinned ? 'Pinned' : 'Pin'}
                    </button>

                    {confirmDeleteId === selectedPlan.id ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          className="plans-filter-pill"
                          onClick={() => void handleDeletePlan(selectedPlan.id)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            color: 'var(--status-missed)',
                            borderColor: 'color-mix(in srgb, var(--status-missed) 40%, transparent)',
                          }}
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          className="plans-filter-pill"
                          onClick={() => setConfirmDeleteId(null)}
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="plans-filter-pill"
                        onClick={() => setConfirmDeleteId(selectedPlan.id)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          color: 'var(--status-missed)',
                        }}
                        title="Delete note"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    )}
                  </div>
                </div>

                {editorMode === 'write' ? (
                  <>
                    <textarea
                      ref={textareaRef}
                      className="plan-textarea"
                      value={draftContent}
                      onChange={(e) => updateDraftFields({ content: e.target.value })}
                      onBlur={flushPendingSave}
                      placeholder={
                        "Write your plan freely here...\n\nTip: Lines starting with '- [ ] ' become interactive checkboxes in Checklist view."
                      }
                      aria-label="Plan content"
                    />
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        className="button secondary"
                        onClick={handleAppendChecklistItem}
                        style={{ height: '34px', padding: '0 12px', fontSize: '12.5px' }}
                      >
                        <CheckSquare size={14} /> + Add checklist line
                      </button>
                      <span className="muted" style={{ fontSize: '12px' }}>
                        Auto-saves as you write
                      </span>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '16px',
                      minHeight: '310px',
                    }}
                  >
                    {parsedLines.length === 0 ? (
                      <p className="muted" style={{ margin: '8px 0', fontSize: '13.5px' }}>
                        Nothing written yet. Add an item below or switch to Write mode for freeform notes.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {parsedLines.map((line) =>
                          line.isTask ? (
                            <label
                              key={line.index}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px',
                                padding: '8px 10px',
                                borderRadius: '9px',
                                background: 'var(--card)',
                                border: '1px solid var(--border)',
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={line.checked}
                                onChange={() => handleToggleChecklistLine(line.index)}
                                style={{
                                  width: '17px',
                                  height: '17px',
                                  marginTop: '2px',
                                  accentColor: 'var(--accent)',
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: '14px',
                                  lineHeight: 1.45,
                                  color: line.checked ? 'var(--muted)' : 'var(--text)',
                                  textDecoration: line.checked ? 'line-through' : 'none',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {line.text || 'Untitled item'}
                              </span>
                            </label>
                          ) : line.raw.trim() ? (
                            <p
                              key={line.index}
                              style={{
                                margin: '2px 0',
                                fontSize: '14px',
                                lineHeight: 1.55,
                                color: 'var(--text)',
                                padding: '0 4px',
                              }}
                            >
                              {line.raw}
                            </p>
                          ) : (
                            <div key={line.index} style={{ height: '6px' }} />
                          )
                        )}
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        marginTop: 'auto',
                        paddingTop: '12px',
                        borderTop: '1px solid var(--border)',
                      }}
                    >
                      <input
                        type="text"
                        value={newTaskLine}
                        onChange={(e) => setNewTaskLine(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAppendChecklistItem()
                          }
                        }}
                        placeholder="Add a checkable item (e.g. Call Alex at 3pm)..."
                        style={{
                          flex: 1,
                          height: '38px',
                          padding: '0 12px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--text)',
                          fontSize: '13.5px',
                        }}
                      />
                      <button
                        type="button"
                        className="button primary"
                        onClick={handleAppendChecklistItem}
                        style={{ height: '38px', padding: '0 14px', fontSize: '13px' }}
                      >
                        <Plus size={15} /> Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="plan-editor" style={{ justifyContent: 'center', alignItems: 'center' }}>
                <p className="muted" style={{ fontSize: '14px' }}>
                  Select a note on the left or create a new plan.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
