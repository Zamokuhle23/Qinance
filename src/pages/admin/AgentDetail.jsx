import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { getAgentDetail, giveAgentMoney, getAgentTransactions, getAgentLoans } from '../../api/admin'

function statusLabel(color) {
  if (color === 'green') return <span className="badge badge-status-green">OK</span>
  if (color === 'yellow') return <span className="badge badge-status-yellow">Warning</span>
  return <span className="badge badge-status-red">Default</span>
}

export default function AgentDetail() {
  const { agentId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [giveAmount, setGiveAmount] = useState('')
  const [alert, setAlert] = useState(null)
  const [loansView, setLoansView] = useState({ type: null, rows: null, loading: false })

  const load = () =>
    getAgentDetail(agentId)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [agentId])

  const handleGiveMoney = async (e) => {
    e.preventDefault()
    if (!giveAmount) return
    try {
      await giveAgentMoney(agentId, giveAmount)
      setAlert({ type: 'success', msg: `${giveAmount} SZL given to agent.` })
      setGiveAmount('')
      load()
    } catch (err) {
      setAlert({ type: 'danger', msg: err.response?.data?.error || 'Failed.' })
    }
  }

  const toggleLoans = async (type) => {
    if (loansView.type === type) {
      setLoansView({ type: null, rows: null, loading: false })
      return
    }
    setLoansView({ type, rows: null, loading: true })
    try {
      const res = await getAgentLoans(agentId, type)
      setLoansView({ type, rows: res.data, loading: false })
    } catch {
      setLoansView({ type, rows: [], loading: false })
    }
  }

  if (loading) return <div className="text-center mt-5"><div className="spinner-border text-primary" /></div>
  if (!data) return null

  const { agent, weekly_performance, weekly_totals, recent_transactions } = data

  return (
    <div className="container mt-4">

      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h4 className="mb-0">{agent.username}</h4>
          <small className="text-muted">@{agent.username}</small>
        </div>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate(-1)}>&larr; Back</button>
      </div>

      {alert && (
        <div className={`alert alert-${alert.type} alert-dismissible fade show`}>
          {alert.msg}
          <button className="btn-close" onClick={() => setAlert(null)} />
        </div>
      )}

      {/* Agent Info + Balances */}
      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <h6 className="card-title text-muted mb-3">Agent Info</h6>
              <p className="mb-1"><strong>Email:</strong> {agent.email || '—'}</p>
              <p className="mb-1"><strong>Phone:</strong> {agent.phone || '—'}</p>
              <p className="mb-0"><strong>Address:</strong> {agent.address || '—'}</p>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card h-100 text-center">
            <div className="card-body d-flex flex-column justify-content-center">
              <h6 className="card-subtitle mb-2 text-muted">Amount in Hand</h6>
              <h4 className="text-success fw-bold mb-0">{parseFloat(agent.amount_in_hand).toFixed(2)} SZL</h4>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card h-100 text-center">
            <div className="card-body d-flex flex-column justify-content-center">
              <h6 className="card-subtitle mb-2 text-muted">Active Balance Owed</h6>
              <h4 className="text-primary fw-bold mb-0">{parseFloat(data.total_active_balance).toFixed(2)} SZL</h4>
              <small className="text-muted">of {parseFloat(data.total_active_amount_loaned).toFixed(2)} SZL loaned</small>
            </div>
          </div>
        </div>
      </div>

      {/* Loan Performance */}
      <div className="card mb-4">
        <div className="card-body">
          <h6 className="card-title mb-3">Loan Performance</h6>
          <table className="table table-bordered mb-0">
            <thead className="table-light">
              <tr><th>Category</th><th>Count</th><th>Rate</th><th></th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Completed</td>
                <td>{data.completed_loans} / {data.total_loans}</td>
                <td><span className="text-success fw-bold">{data.completed_pct}%</span></td>
                <td>
                  <button
                    className={`btn btn-sm ${loansView.type === 'completed' ? 'btn-success' : 'btn-outline-success'}`}
                    onClick={() => toggleLoans('completed')}
                  >{loansView.type === 'completed' ? 'Hide' : 'View'}</button>
                </td>
              </tr>
              <tr>
                <td>Active</td>
                <td>{data.active_loans_count} / {data.total_loans}</td>
                <td><span className="text-primary fw-bold">{data.active_pct}%</span></td>
                <td>
                  <button
                    className={`btn btn-sm ${loansView.type === 'active' ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => toggleLoans('active')}
                  >{loansView.type === 'active' ? 'Hide' : 'View'}</button>
                </td>
              </tr>
              <tr>
                <td>Default</td>
                <td>{data.default_loans} / {data.active_loans_count}</td>
                <td><span className="text-danger fw-bold">{data.default_pct}%</span></td>
                <td>
                  <button
                    className={`btn btn-sm ${loansView.type === 'default' ? 'btn-danger' : 'btn-outline-danger'}`}
                    onClick={() => toggleLoans('default')}
                  >{loansView.type === 'default' ? 'Hide' : 'View'}</button>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Expandable loans table */}
          {loansView.type && (
            <div className="mt-3">
              {loansView.loading ? (
                <div className="text-center py-2"><div className="spinner-border spinner-border-sm text-primary" /></div>
              ) : loansView.rows && loansView.rows.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-striped table-sm mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Customer</th><th>Loan Date</th><th>Principal</th>
                        <th>Total Due</th><th>Paid</th><th>Balance</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loansView.rows.map(l => (
                        <tr key={l.id}>
                          <td><strong>{l.customer_name}</strong></td>
                          <td>{l.start_date}</td>
                          <td>{parseFloat(l.principal_amount).toFixed(2)} SZL</td>
                          <td>{parseFloat(l.total_due).toFixed(2)} SZL</td>
                          <td>{parseFloat(l.total_paid).toFixed(2)} SZL</td>
                          <td>{parseFloat(l.remaining_balance).toFixed(2)} SZL</td>
                          <td><span className="badge bg-secondary">{l.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted mb-0">No loans found.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Weekly Performance */}
      <div className="card mb-4">
        <div className="card-body">
          <h6 className="card-title mb-3">Performance — This Week</h6>
          {weekly_performance.length > 0 ? (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr><th>Date</th><th>Gross Interest</th><th>Withdrawn</th><th>Net</th><th>Performance</th></tr>
                </thead>
                <tbody>
                  {weekly_performance.map(p => (
                    <tr key={p.id}>
                      <td className="text-nowrap">{new Date(p.date).toLocaleDateString('en-ZA', { weekday: 'short', day: '2-digit', month: 'short' })}</td>
                      <td className="text-success">{parseFloat(p.gross_interest).toFixed(2)} SZL</td>
                      <td className="text-danger">{parseFloat(p.total_withdrawn).toFixed(2)} SZL</td>
                      <td>
                        <span className={`fw-bold ${parseFloat(p.net) >= 0 ? 'text-success' : 'text-danger'}`}>
                          {parseFloat(p.net).toFixed(2)} SZL
                        </span>
                      </td>
                      <td>
                        {p.collection_percentage >= 80
                          ? <span className="badge bg-success">{p.collection_percentage}%</span>
                          : p.collection_percentage >= 50
                            ? <span className="badge bg-warning text-dark">{p.collection_percentage}%</span>
                            : <span className="badge bg-danger">{p.collection_percentage}%</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="table-light fw-bold">
                  <tr>
                    <td>Total</td>
                    <td className="text-success">{weekly_totals.total_gross.toFixed(2)} SZL</td>
                    <td className="text-danger">{weekly_totals.total_withdrawn.toFixed(2)} SZL</td>
                    <td>
                      <span className={weekly_totals.total_net >= 0 ? 'text-success' : 'text-danger'}>
                        {weekly_totals.total_net.toFixed(2)} SZL
                      </span>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-muted mb-0">No performance recorded this week yet.</p>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h6 className="card-title mb-0">Recent Transactions</h6>
            <Link to={`/admin/agents/${agentId}/transactions`} className="btn btn-sm btn-outline-secondary">
              View All &rarr;
            </Link>
          </div>
          {recent_transactions.length > 0 ? (
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr><th>Date</th><th>Type</th><th>Requested</th><th>Actual</th><th>Approved By</th></tr>
              </thead>
              <tbody>
                {recent_transactions.map(tx => (
                  <tr key={tx.id}>
                    <td className="text-nowrap text-muted small">
                      {new Date(tx.approved_at).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      {tx.transaction_type === 'withdraw'
                        ? <span className="badge bg-danger">Withdraw</span>
                        : <span className="badge bg-primary">Send to Admin</span>
                      }
                    </td>
                    <td>{parseFloat(tx.requested_amount).toFixed(2)} SZL</td>
                    <td>
                      {parseFloat(tx.actual_amount).toFixed(2)} SZL
                      {tx.actual_amount !== tx.requested_amount && <small className="text-muted"> (adjusted)</small>}
                    </td>
                    <td className="small">{tx.approved_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-muted mb-0">No transactions recorded yet.</p>
          )}
        </div>
      </div>

      {/* Give Money to Agent */}
      <div className="card mb-4">
        <div className="card-body">
          <h6 className="card-title mb-3">Give Money to Agent</h6>
          <form onSubmit={handleGiveMoney}>
            <div className="row g-2 align-items-end">
              <div className="col-sm-6">
                <label className="form-label">Amount (SZL)</label>
                <input
                  type="number" step="0.01" className="form-control"
                  value={giveAmount} onChange={e => setGiveAmount(e.target.value)} required
                />
              </div>
              <div className="col-sm-auto">
                <button type="submit" className="btn btn-success">Send Money</button>
              </div>
            </div>
          </form>
        </div>
      </div>

    </div>
  )
}
