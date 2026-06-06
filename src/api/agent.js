import client from './client'

export const getDashboard = () => client.get('/agent/dashboard/')
export const markPayment = (loanId, amount) => client.post(`/loans/${loanId}/mark-payment/`, { amount })
export const reversePayment = (loanId) => client.post(`/loans/${loanId}/reverse-payment/`)
export const getCustomers = () => client.get('/customers/')
export const createCustomer = (data) => client.post('/customers/new/', data)
export const addLoanExisting = (data) => client.post('/customers/add-loan/', data)
export const getLoanQualification = (customerId) => client.get(`/customers/${customerId}/qualification/`)
export const getLoanOffers = (customerId, amount) => client.get(`/customers/${customerId}/offer/`, { params: { amount } })
export const createLoanFromOffer = (customerId, data) => client.post(`/customers/${customerId}/offer/`, data)
export const getCustomerHistory = (customerId, loanId) => {
  const url = loanId
    ? `/customers/${customerId}/history/${loanId}/`
    : `/customers/${customerId}/history/`
  return client.get(url)
}
export const getBatchCollect = () => client.get('/batch-collect/')
export const reorderLoans = (order) => client.post('/loans/reorder/', order)
export const submitBatchPayment = (payments) => client.post('/batch-payment/', { payments })
export const calcLoan = (data) => client.post('/loan-calculator/', data)
export const sendToAdmin = (amount) => client.post('/send-to-admin/', { amount })
export const requestWithdraw = (agentId, amount, note) => client.post(`/admin/agents/${agentId}/withdraw/`, { amount, note })
