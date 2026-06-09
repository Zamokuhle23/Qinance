import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBatchCollect, submitBatchPayment, reorderLoans } from '../api/agent'
import { useAuth } from '../context/AuthContext'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, useSortable, verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const STORE_KEY = (agentId) => `mf_collect_${agentId}_${new Date().toISOString().slice(0, 10)}`

export default function BatchCollect() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const storeKey = useMemo(() => STORE_KEY(user?.agent_id), [user?.agent_id])

  const [allLoans, setAllLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [selOrder, setSelOrder] = useState([])
  const [amounts, setAmounts] = useState({})
  const [search, setSearch] = useState('')
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [restored, setRestored] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Route order mode
  const [routeMode, setRouteMode] = useState(false)
  const [routeLoans, setRouteLoans] = useState([])
  const [orderDirty, setOrderDirty] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  useEffect(() => {
    if (!storeKey) return

    setLoading(true)
    getBatchCollect().then(res => {
      const loans = res.data
      setAllLoans(loans)
      const defaultAmts = {}
      loans.forEach(l => { defaultAmts[l.id] = l.daily_payment })
      setAmounts(defaultAmts)
      try {
        const saved = JSON.parse(localStorage.getItem(storeKey))
        if (saved?.selOrder?.length) {
          const validIds = new Set(loans.map(l => l.id))
          const sel = saved.selOrder.filter(id => validIds.has(id))
          setSelOrder(sel)
          setAmounts(a => ({ ...a, ...saved.amounts }))
          setRestored(true)
        }
      } catch {}
    }).finally(() => {
      setHydrated(true)
      setLoading(false)
    })
  }, [storeKey])

  useEffect(() => {
    if (!hydrated || !storeKey) return
    localStorage.setItem(storeKey, JSON.stringify({ selOrder, amounts }))
  }, [storeKey, selOrder, amounts, hydrated])

  const isSelected = (id) => selOrder.includes(id)
  const selectLoan = (id) => { if (!isSelected(id)) setSelOrder(p => [...p, id]) }
  const deselectLoan = (id) => setSelOrder(p => p.filter(x => x !== id))
  const toggleLoan = (id) => isSelected(id) ? deselectLoan(id) : selectLoan(id)

  const getTotal = () =>
    selOrder.reduce((s, id) => {
      const v = parseFloat(amounts[id])
      return s + (isNaN(v) ? 0 : v)
    }, 0)

  const handleAmountChange = (id, val) => setAmounts(a => ({ ...a, [id]: val }))
  const handleAmountBlur = (id, val) => {
    const v = parseFloat(val)
    if (!isNaN(v) && v > 0 && !isSelected(id)) selectLoan(id)
  }

  const matches = (l) => {
    if (!search) return true
    const q = search.toLowerCase()
    return l.customer_name.toLowerCase().includes(q) || l.customer_phone.includes(q)
  }

  const handleSubmit = async () => {
    if (!selOrder.length) return
    const bad = selOrder.find(id => { const v = parseFloat(amounts[id]); return isNaN(v) || v <= 0 })
    if (bad) { setResult({ type: 'danger', msg: 'One or more amounts are invalid.' }); return }

    setSubmitting(true)
    try {
      const payload = selOrder.map(id => ({ loan_id: id, amount: parseFloat(amounts[id]).toFixed(2) }))
      const { data } = await submitBatchPayment(payload)
      const ok = data.results.filter(r => r.status === 'ok')
      const skipped = data.results.filter(r => r.status === 'skipped')
      const errors = data.results.filter(r => r.status === 'error')
      const okIds = new Set(ok.map(r => r.loan_id))
      setSelOrder(prev => prev.filter(id => !okIds.has(id)))
      let msg = ''
      if (ok.length) msg += `${ok.length} payment(s) recorded — ${data.total_amount} SZL. `
      if (skipped.length) msg += `${skipped.length} skipped (cooldown). `
      if (errors.length) msg += `${errors.length} failed.`
      setResult({ type: ok.length ? 'success' : 'warning', msg })
      if (selOrder.filter(id => !okIds.has(id)).length === 0) {
        setTimeout(() => navigate('/dashboard'), 1800)
      }
    } catch {
      setResult({ type: 'danger', msg: 'Network error. Selections saved locally.' })
    } finally {
      setSubmitting(false)
    }
  }

  // --- Route order mode ---

  const enterRouteMode = () => {
    setRouteLoans([...allLoans])
    setOrderDirty(false)
    setRouteMode(true)
  }

  const cancelRouteMode = () => {
    setRouteMode(false)
    setOrderDirty(false)
  }

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    setRouteLoans(prev => {
      const oldIdx = prev.findIndex(l => l.id === active.id)
      const newIdx = prev.findIndex(l => l.id === over.id)
      return arrayMove(prev, oldIdx, newIdx)
    })
    setOrderDirty(true)
  }

  const saveOrder = async () => {
    setSavingOrder(true)
    try {
      const order = routeLoans.map((l, i) => ({ loan_id: l.id, display_order: i }))
      await reorderLoans(order)
      setAllLoans([...routeLoans])
      setRouteMode(false)
      setOrderDirty(false)
      setResult({ type: 'success', msg: 'Route order saved. Loans will always appear in this order.' })
    } catch {
      setResult({ type: 'danger', msg: 'Failed to save order.' })
    } finally {
      setSavingOrder(false)
    }
  }

  if (loading) return <div className="text-center mt-5"><div className="spinner-border text-primary" /></div>

  // --- Route order mode UI ---
  if (routeMode) {
    return (
      <div className="container py-3" style={{ paddingBottom: 90 }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h4 className="mb-0">Edit Route Order</h4>
            <small className="text-muted">Hold and drag the ⠿ handle to reorder</small>
          </div>
          <button className="btn btn-sm btn-outline-secondary" onClick={cancelRouteMode}>Cancel</button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={routeLoans.map(l => l.id)} strategy={verticalListSortingStrategy}>
            {routeLoans.map((loan, idx) => (
              <SortableRouteItem key={loan.id} loan={loan} idx={idx} />
            ))}
          </SortableContext>
        </DndContext>

        <div className="fixed-bottom bg-white border-top shadow-sm px-3 py-2">
          <div className="container d-flex justify-content-between align-items-center">
            <span className="text-muted small">{routeLoans.length} loans</span>
            <button
              className="btn btn-primary px-4"
              onClick={saveOrder}
              disabled={!orderDirty || savingOrder}
            >
              {savingOrder ? 'Saving…' : 'Save Route Order'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Normal batch collect UI ---
  const selLoans = selOrder.map(id => allLoans.find(l => l.id === id)).filter(Boolean).filter(matches)
  const remLoans = allLoans.filter(l => !isSelected(l.id)).filter(matches)

  return (
    <div className="container py-3" style={{ paddingBottom: 90 }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="mb-0">Batch Collection</h4>
          <small className="text-muted">{new Date().toDateString()}</small>
        </div>
        <button className="btn btn-sm btn-outline-primary" onClick={enterRouteMode}>
          ⠿ Route Order
        </button>
      </div>

      {restored && (
        <div className="alert alert-info alert-dismissible">
          Previous selections restored.
          <button className="btn-close" onClick={() => setRestored(false)} />
        </div>
      )}

      {result && (
        <div className={`alert alert-${result.type} alert-dismissible`}>
          {result.msg}
          <button className="btn-close" onClick={() => setResult(null)} />
        </div>
      )}

      {allLoans.length === 0 ? (
        <div className="text-center py-5 text-muted">No loans due today.</div>
      ) : (
        <>
          <div className="mb-3">
            <input
              type="search"
              className="form-control"
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {selLoans.length > 0 && (
            <div className="mb-4">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0 fw-bold text-success">Selected — {selLoans.length} loan(s)</h6>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setSelOrder([])}>Deselect All</button>
              </div>
              {selLoans.map(loan => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  selected
                  amount={amounts[loan.id] ?? loan.daily_payment}
                  onToggle={() => deselectLoan(loan.id)}
                  onAmountChange={(v) => handleAmountChange(loan.id, v)}
                  onAmountBlur={(v) => handleAmountBlur(loan.id, v)}
                />
              ))}
            </div>
          )}

          {remLoans.length > 0 && (
            <div>
              <h6 className="mb-2 fw-bold text-muted">Due Today — {remLoans.length} loan(s)</h6>
              {remLoans.map(loan => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  selected={false}
                  amount={amounts[loan.id] ?? loan.daily_payment}
                  onToggle={() => selectLoan(loan.id)}
                  onAmountChange={(v) => handleAmountChange(loan.id, v)}
                  onAmountBlur={(v) => handleAmountBlur(loan.id, v)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {selOrder.length > 0 && (
        <div className="fixed-bottom bg-white border-top shadow-sm px-3 py-2">
          <div className="container d-flex justify-content-between align-items-center">
            <div>
              <strong>{selOrder.length} payment{selOrder.length !== 1 ? 's' : ''}</strong>
              <div className="text-muted small">Total: {getTotal().toFixed(2)} SZL</div>
            </div>
            <button className="btn btn-success btn-lg px-4" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit All'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SortableRouteItem({ loan, idx }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: loan.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 999 : 'auto',
      }}
      className="card mb-2 border"
    >
      <div className="card-body py-2 px-3">
        <div className="d-flex align-items-center gap-2">
          <span className="text-muted fw-bold" style={{ minWidth: 24, textAlign: 'center' }}>
            {idx + 1}
          </span>
          <span
            className="text-muted me-1"
            style={{ fontSize: '1.4rem', cursor: 'grab', touchAction: 'none', lineHeight: 1, userSelect: 'none' }}
            {...attributes}
            {...listeners}
          >
            ⠿
          </span>
          <div className="flex-grow-1">
            <div className="fw-bold">{loan.customer_name}</div>
            <div className="text-muted small">{loan.customer_phone}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LoanCard({ loan, selected, amount, onToggle, onAmountChange, onAmountBlur }) {
  const d = loan.days_remaining
  const badgeCls = d <= 0 ? 'bg-danger' : d <= 5 ? 'bg-warning text-dark' : 'bg-secondary'
  const badgeText = d <= 0 ? 'Overdue' : `${d}d left`

  return (
    <div className={`card mb-2 border ${selected ? 'border-success' : 'border-light'}`}>
      <div className="card-body py-2 px-3">
        <div className="d-flex align-items-center gap-3">
          <div className="flex-shrink-0">
            <input
              className="form-check-input"
              type="checkbox"
              checked={selected}
              onChange={onToggle}
              style={{ width: 22, height: 22, cursor: 'pointer' }}
            />
          </div>
          <div className="flex-grow-1" style={{ minWidth: 0 }}>
            <div className="fw-bold">{loan.customer_name}</div>
            <div className="text-muted small">
              {loan.customer_phone} &nbsp;
              <span className={`badge ${badgeCls}`}>{badgeText}</span>
            </div>
          </div>
          <div className="flex-shrink-0" style={{ width: 96 }}>
            <input
              type="number"
              className="form-control form-control-sm text-center"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              onBlur={(e) => onAmountBlur(e.target.value)}
            />
            <div className="text-muted text-center" style={{ fontSize: '0.68rem' }}>SZL</div>
          </div>
        </div>
      </div>
    </div>
  )
}
