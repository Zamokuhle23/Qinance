import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboard, markPayment, reversePayment, sendToAdmin, requestWithdraw, getCustomers } from '../api/agent'
import { useAuth } from '../context/AuthContext'

function DaysLeftBadge({ days }) {
  if (days <= 0) return <span className="badge bg-danger">Overdue</span>
  if (days === 1) return <span className="badge bg-warning text-dark">1 day</span>
  if (days <= 5) return <span className="badge bg-warning text-dark">{days} days</span>
  return <span className="badge bg-secondary">{days} days</span>
}

function StatusBadge({ color }) {
  if (color === 'green') return <span className="badge badge-status-green">OK</span>
  if (color === 'yellow') return <span className="badge badge-status-yellow">Warning</span>
  return <span className="badge badge-status-red">Default</span>
}

function rowClass(color) {
  if (color === 'green') return 'status-green'
  if (color === 'yellow') return 'status-yellow'
  return 'status-red'
}

export default function AgentDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState(null)
  const [search, setSearch] = useState('')
  const [payAmounts, setPayAmounts] = useState({})
  const [sendAmount, setSendAmount] = useState('')
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', note: '' })
  const [formBusy, setFormBusy] = useState(false)
  const [paidOpen, setPaidOpen] = useState(false)
  const [takenOpen, setTakenOpen] = useState(false)
  const [custSearch, setCustSearch] = useState({ name: '', phone: '' })
  const [custResults, setCustResults] = useState(null)
  const [custSearched, setCustSearched] = useState(false)

  const load = async () => {
    try {
      const res = await getDashboard()
      setData(res.data)
      const amts = {}
      res.data.due_loans.forEach(l => { amts[l.id] = String(l.daily_payment) })
      res.data.loans_paid.forEach(l => { amts[l.id] = String(l.daily_payment) })
      setPayAmounts(prev => ({ ...amts, ...prev }))
    } catch {
      setAlert({ type: 'danger', msg: 'Failed to load dashboard.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleMark = async (loan) => {
    const amount = payAmounts[loan.id] ?? loan.daily_payment
    try {
      await markPayment(loan.id, amount)
      setAlert({ type: 'success', msg: `Payment of ${amount} SZL recorded for ${loan.customer_name}. Remaining: ${(parseFloat(loan.remaining_balance) - parseFloat(amount)).toFixed(2)} SZL` })
      load()
    } catch (err) {
      setAlert({ type: 'danger', msg: err.response?.data?.error || 'Payment failed.' })
    }
  }

  const handleReverse = async (loan) => {
    if (!window.confirm(`Reverse latest payment for ${loan.customer_name}?`)) return
    try {
      await reversePayment(loan.id)
      setAlert({ type: 'success', msg: 'Payment reversed.' })
      load()
    } catch (err) {
      setAlert({ type: 'danger', msg: err.response?.data?.error || 'Reversal failed.' })
    }
  }

  const handleSendToAdmin = async (e) => {
    e.preventDefault()
    setFormBusy(true)
    try {
      await sendToAdmin(sendAmount)
      setAlert({ type: 'success', msg: 'Request submitted. Admin must approve before your balance is reduced.' })
      setSendAmount('')
    } catch (err) {
      setAlert({ type: 'danger', msg: err.response?.data?.error || 'Failed to submit request.' })
    } finally {
      setFormBusy(false)
    }
  }

  const handleWithdraw = async (e) => {
    e.preventDefault()
    setFormBusy(true)
    try {
      await requestWithdraw(user.agent_id, withdrawForm.amount, withdrawForm.note)
      setAlert({ type: 'success', msg: 'Withdrawal request submitted.' })
      setWithdrawForm({ amount: '', note: '' })
    } catch (err) {
      setAlert({ type: 'danger', msg: err.response?.data?.error || 'Failed to submit withdrawal.' })
    } finally {
      setFormBusy(false)
    }
  }

  const handleCustSearch = async (e) => {
    e.preventDefault()
    setCustSearched(true)
    try {
      const res = await getCustomers()
      const q = custSearch.name.toLowerCase()
      const p = custSearch.phone.toLowerCase()
      const filtered = res.data.filter(c => {
        const nameOk = !q || c.name.toLowerCase().includes(q)
        const phoneOk = !p || c.phone.includes(p)
        return nameOk && phoneOk
      })
      setCustResults(filtered)
    } catch {
      setCustResults([])
    }
  }

  const filterDue = (loans) => {
    if (!search) return loans
    const q = search.toLowerCase()
    return loans.filter(l => l.customer_name.toLowerCase().includes(q) || l.customer_phone.includes(q))
  }

  if (loading) return <div className="text-center mt-5"><div className="spinner-border text-primary" /></div>

  const { metrics, due_loans, loans_paid, loans_taken_today } = data
  const amtColPct = metrics.amount_to_collect > 0
    ? Math.min(100, (parseFloat(metrics.amount_collected) / parseFloat(metrics.amount_to_collect)) * 100).toFixed(1)
    : 0
  const loanColPct = metrics.total_due_loans > 0
    ? Math.min(100, (metrics.loans_collected_count / metrics.total_due_loans) * 100).toFixed(1)
    : 0
  const totalTakenToday = loans_taken_today.reduce((s, l) => s + parseFloat(l.principal_amount), 0)

  return (
    <div className="container mt-4">
      {alert && (
        <div className={`alert alert-${alert.type} alert-dismissible`}>
          {alert.msg}
          <button className="btn-close" onClick={() => setAlert(null)} />
        </div>
      )}

      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 className="mb-0">{user?.username}'s Dashboard</h3>
          <small className="text-muted">Today's overview</small>
        </div>
        <div className="text-end">
          <div className="mb-1">Performance today</div>
          <div className="h4 mb-0">{metrics.performance}%</div>
        </div>
      </div>

      {/* Daily Collection Overview */}
      <div className="row mb-4">
        <div className="col-md-4">
          <div className="card">
            <div className="card-body">
              <h6 className="card-subtitle mb-2 text-muted">Amount Collected Today</h6>
              <p className="mb-1">
                {parseFloat(metrics.amount_collected).toFixed(2)} / {parseFloat(metrics.amount_to_collect).toFixed(2)} SZL
              </p>
              <div className="progress" style={{ height: 20 }}>
                <div className="progress-bar bg-success" role="progressbar" style={{ width: `${amtColPct}%` }}
                  aria-valuenow={amtColPct} aria-valuemin="0" aria-valuemax="100">
                  {amtColPct}%
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card bg-light border">
            <div className="card-body text-center">
              <h6 className="card-subtitle mb-2 text-muted">Amount in Hand</h6>
              <h4 className="fw-bold text-success">{parseFloat(metrics.amount_in_hand).toFixed(2)} SZL</h4>
              <small className="text-muted">Total unremitted funds currently held</small>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card">
            <div className="card-body">
              <h6 className="card-subtitle mb-2 text-muted">Loans Collected Today</h6>
              <p className="mb-1">{metrics.loans_collected_count} / {metrics.total_due_loans} loans</p>
              <div className="progress" style={{ height: 20 }}>
                <div className="progress-bar bg-info" role="progressbar" style={{ width: `${loanColPct}%` }}
                  aria-valuenow={loanColPct} aria-valuemin="0" aria-valuemax="100">
                  {loanColPct}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Send to Admin + Withdraw */}
      <div className="row g-4 mb-4">
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="mb-3">Send Money to Admin</h5>
              <form onSubmit={handleSendToAdmin}>
                <div className="mb-3">
                  <label className="form-label">Amount to Send</label>
                  <input type="number" step="0.01" min="0" className="form-control"
                    value={sendAmount} onChange={e => setSendAmount(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-primary w-100" disabled={formBusy}>Send</button>
              </form>
              <p className="mt-3 text-muted small">
                Note: Once submitted, the admin must approve before your balance is reduced.
              </p>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="mb-3">Withdraw Money</h5>
              <form onSubmit={handleWithdraw}>
                <div className="mb-3">
                  <label className="form-label">Note</label>
                  <textarea className="form-control" rows={2} placeholder="Enter a note (optional)"
                    value={withdrawForm.note} onChange={e => setWithdrawForm({ ...withdrawForm, note: e.target.value })} />
                </div>
                <div className="mb-3">
                  <label className="form-label">Amount to Withdraw</label>
                  <input type="number" step="0.01" min="0" className="form-control"
                    value={withdrawForm.amount} onChange={e => setWithdrawForm({ ...withdrawForm, amount: e.target.value })} required />
                </div>
                <button type="submit" className="btn btn-warning w-100" disabled={formBusy}>Withdraw</button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Search */}
      <div className="card mb-4">
        <div className="card-body">
          <h5 className="card-title">Search Customer</h5>
          <form onSubmit={handleCustSearch} className="row g-2 mb-3">
            <div className="col-md-5">
              <input type="text" className="form-control" placeholder="Search by name"
                value={custSearch.name} onChange={e => setCustSearch({ ...custSearch, name: e.target.value })} />
            </div>
            <div className="col-md-5">
              <input type="text" className="form-control" placeholder="Search by phone"
                value={custSearch.phone} onChange={e => setCustSearch({ ...custSearch, phone: e.target.value })} />
            </div>
            <div className="col-md-2">
              <button type="submit" className="btn btn-primary w-100">Search</button>
            </div>
          </form>
          {custSearched && custResults !== null && (
            custResults.length > 0 ? (
              <div className="table-responsive scrollable-table">
                <table className="table table-bordered loan-table">
                  <thead className="table-light">
                    <tr><th>Name</th><th>Phone</th><th>Total Loans</th><th>Location</th><th>Loan Qualification</th></tr>
                  </thead>
                  <tbody>
                    {custResults.map(c => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>{c.phone}</td>
                        <td>{c.total_loans ?? '—'}</td>
                        <td>{c.location || '—'}</td>
                        <td>
                          <Link to={`/customers/${c.id}/qualification`} className="btn btn-sm btn-outline-primary">
                            View Qualification
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div>
                <p className="text-muted mb-0">No customer found with that name/phone.</p>
                <Link to="/customers/new" className="btn btn-primary mt-2">Add New Customer &amp; Loan</Link>
              </div>
            )
          )}
        </div>
      </div>

      {/* Loans Due Today */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h5 className="card-title mb-0">Loans Due Today</h5>
            <Link to="/batch-collect" className="btn btn-primary btn-sm">Batch Collect</Link>
          </div>
          <input
            type="search"
            className="form-control form-control-sm mb-2"
            placeholder="Search by name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {filterDue(due_loans).length > 0 ? (
            <div className="table-responsive">
              <table className="table table-bordered loan-table">
                <thead className="table-light">
                  <tr>
                    <th>Customer</th>
                    <th className="d-none d-md-table-cell">Loan</th>
                    <th className="d-none d-md-table-cell">Daily</th>
                    <th>Remaining</th>
                    <th className="d-none d-md-table-cell">Days Left</th>
                    <th className="d-none d-md-table-cell">Status</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filterDue(due_loans).map(loan => (
                    <tr key={loan.id} className={rowClass(loan.payment_status_color)}>
                      <td>
                        <Link to={`/customers/${loan.customer_id}/history`}>
                          <strong>{loan.customer_name}</strong>
                        </Link><br />
                        <small className="text-muted">{loan.customer_phone}</small>
                      </td>
                      <td className="d-none d-md-table-cell">{parseFloat(loan.principal_amount).toFixed(2)} SZL</td>
                      <td className="d-none d-md-table-cell">{parseFloat(loan.daily_payment).toFixed(2)} SZL</td>
                      <td>{parseFloat(loan.remaining_balance).toFixed(2)} SZL</td>
                      <td className="d-none d-md-table-cell"><DaysLeftBadge days={loan.days_remaining} /></td>
                      <td className="d-none d-md-table-cell"><StatusBadge color={loan.payment_status_color} /></td>
                      <td>
                        <div className="d-flex align-items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="form-control form-control-sm text-center"
                            style={{ width: 80 }}
                            value={payAmounts[loan.id] ?? loan.daily_payment}
                            onChange={e => setPayAmounts(a => ({ ...a, [loan.id]: e.target.value }))}
                          />
                          <button className="btn btn-sm btn-success text-nowrap" onClick={() => handleMark(loan)}>
                            Mark Paid
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted mb-0">No loans due today.</p>
          )}

          {/* Show Loans Paid Today — collapsible */}
          <div className="mt-2">
            <button
              className="btn btn-outline-primary"
              type="button"
              onClick={() => setPaidOpen(o => !o)}
            >
              {paidOpen ? 'Hide' : 'Show'} Loans Paid Today
            </button>
          </div>
          {paidOpen && (
            <div className="mt-3">
              {loans_paid.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-bordered loan-table">
                    <thead className="table-light">
                      <tr>
                        <th>Customer</th>
                        <th className="d-none d-md-table-cell">Loan</th>
                        <th className="d-none d-md-table-cell">Daily</th>
                        <th className="d-none d-md-table-cell">Paid Today</th>
                        <th>Remaining</th>
                        <th className="d-none d-md-table-cell">Days Left</th>
                        <th className="d-none d-md-table-cell">Status</th>
                        <th className="text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loans_paid.map(loan => (
                        <tr key={loan.id} className={rowClass(loan.payment_status_color)}>
                          <td>
                            <Link to={`/customers/${loan.customer_id}/history`}>
                              <strong>{loan.customer_name}</strong>
                            </Link><br />
                            <small className="text-muted">{loan.customer_phone}</small>
                          </td>
                          <td className="d-none d-md-table-cell">{parseFloat(loan.principal_amount).toFixed(2)} SZL</td>
                          <td className="d-none d-md-table-cell">{parseFloat(loan.daily_payment).toFixed(2)} SZL</td>
                          <td className="d-none d-md-table-cell">{parseFloat(loan.amount_paid_today).toFixed(2)} SZL</td>
                          <td>{parseFloat(loan.remaining_balance).toFixed(2)} SZL</td>
                          <td className="d-none d-md-table-cell"><DaysLeftBadge days={loan.days_remaining} /></td>
                          <td className="d-none d-md-table-cell"><StatusBadge color={loan.payment_status_color} /></td>
                          <td>
                            <div className="d-flex flex-column gap-1">
                              <div className="d-flex align-items-center gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="form-control form-control-sm text-center"
                                  style={{ width: 80 }}
                                  value={payAmounts[loan.id] ?? loan.daily_payment}
                                  onChange={e => setPayAmounts(a => ({ ...a, [loan.id]: e.target.value }))}
                                />
                                <button className="btn btn-sm btn-success text-nowrap" onClick={() => handleMark(loan)}>
                                  Mark Paid
                                </button>
                              </div>
                              <button className="btn btn-sm btn-danger w-100" onClick={() => handleReverse(loan)}>
                                Reverse Today
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted mb-0">No active loans paid today.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Show Loans Taken Today — collapsible */}
      <div className="mt-2 mb-3">
        <button
          className="btn btn-outline-success"
          type="button"
          onClick={() => setTakenOpen(o => !o)}
        >
          {takenOpen ? 'Hide' : 'Show'} Loans Taken Today
        </button>
      </div>
      {takenOpen && (
        <div className="collapse-content mt-3 mb-4">
          {loans_taken_today.length > 0 ? (
            <>
              <p><strong>Total Given Today:</strong> {totalTakenToday.toFixed(2)} SZL</p>
              <div className="table-responsive scrollable-table">
                <table className="table table-bordered loan-table">
                  <thead className="table-light">
                    <tr><th>Customer</th><th>Loan Amount</th><th>Daily Payment</th><th>Start Date</th></tr>
                  </thead>
                  <tbody>
                    {loans_taken_today.map(loan => (
                      <tr key={loan.id}>
                        <td>
                          <strong>{loan.customer_name}</strong><br />
                          <small className="text-muted">{loan.customer_phone}</small>
                        </td>
                        <td>{parseFloat(loan.principal_amount).toFixed(2)} SZL</td>
                        <td>{parseFloat(loan.daily_payment).toFixed(2)} SZL</td>
                        <td>{loan.start_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-muted mb-0">No loans taken today.</p>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="row mb-4">
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <h6 className="card-subtitle mb-2 text-muted">Total Customers</h6>
              <div className="h4">{metrics.total_customers}</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <h6 className="card-subtitle mb-2 text-muted">Active Loans</h6>
              <div className="h4">{loans_paid.length + due_loans.length}</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <h6 className="card-subtitle mb-2 text-muted">Performance Today</h6>
              <div className="h4">{metrics.performance}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
