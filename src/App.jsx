import { useMemo, useState } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './App.css'

GlobalWorkerOptions.workerSrc = pdfWorker

const orders = [
  { token: 'DX-2048', name: 'Digital Marketing Notes.pdf', detail: '12 pages · B&W · Single-sided', status: 'Ready for pickup', tone: 'green' },
  { token: 'DX-2047', name: 'Research Methods.pdf', detail: '28 pages · Colour · Spiral bound', status: 'Printing now', tone: 'yellow' },
  { token: 'DX-2046', name: 'Studio Brief.pdf', detail: '6 pages · B&W · Double-sided', status: 'Collected', tone: 'grey' },
]

const newFile = (file, index, pages = 1) => ({ id: `${file.name}-${index}-${Date.now()}`, name: file.name, pages, copies: 1, sides: 'Single-sided', size: 'A4' })
const money = (value) => `₹${value}`
const maskPhone = (phone) => phone.length >= 4 ? `******${phone.slice(-4)}` : phone
const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

function assistantReply(text, files, paid) {
  const input = text.toLowerCase()
  if (paid) return 'Your order is already paid. Show the pickup token in this chat at the counter.'
  if (/price|cost|charge|rate|how much/.test(input)) return 'I charge ₹3 per page for single-sided printing and ₹4 per page for double-sided printing. I’ll show the exact total for every file before payment.'
  if (/bulk|all together|multiple/.test(input)) return files.length ? 'Great, I’ll apply the same settings to all your files. You can still change any file before you finalize.' : 'Upload your files first and I’ll group them into one order.'
  if (/one by one|separate|individual|custom/.test(input)) return files.length ? 'Absolutely. I’ll keep each file separate so you can customize its pages, copies, and sides.' : 'Upload two or more files and I’ll let you customize them one by one.'
  if (/delete|privacy|secure/.test(input)) return 'Your uploaded files are private and scheduled for automatic deletion 24 hours after the order is created.'
  if (/hello|hi|hey/.test(input)) return 'Hey! Upload one or more files and I’ll take care of the rest. You can say “bulk” or “one by one” after that.'
  return files.length ? 'I’m with you. Check the file settings below, then tell me when you’re ready to finalize the order.' : 'Tell me what you need printed, or upload your files to get started.'
}

async function getAssistantReply(text, files, paid) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, files, paid }) })
    if (response.ok) {
      const data = await response.json()
      if (data.reply) return data.reply
    }
  } catch {
    // The local fallback keeps the frontend usable before the FastAPI service is connected.
  }
  return assistantReply(text, files, paid)
}

function App() {
  const [view, setView] = useState('customer')
  const [messages, setMessages] = useState([{ from: 'doxie', text: 'Hey! I’m Doxie. Upload one or more files and I’ll help you print them without the queue.', time: 'Now' }])
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState([])
  const [mode, setMode] = useState(null)
  const [stage, setStage] = useState('upload')
  const [paid, setPaid] = useState(false)
  const [mobile, setMobile] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [token, setToken] = useState('')
  const [paymentError, setPaymentError] = useState('')

  const total = useMemo(() => files.reduce((sum, file) => sum + (file.pages * file.copies * (file.sides === 'Single-sided' ? 3 : 4)), 0), [files])
  const fileCount = files.length

  function addMessage(from, text) {
    setMessages((current) => [...current, { from, text, time: 'Now' }])
  }

  function handleFiles(event) {
    const selected = Array.from(event.target.files || [])
    if (!selected.length) return
    const added = selected.map((file, index) => newFile(file, index))
    setFiles((current) => [...current, ...added])
    setStage(files.length ? 'customize' : 'choice')
    addMessage('user', `${added.length} file${added.length > 1 ? 's' : ''} uploaded`)
    addMessage('doxie', `${added.length > 1 ? 'I have all your files.' : 'I have your file.'} Do you want to print them in bulk with the same settings, or customize each file one by one?`)
    selected.forEach(async (file, index) => {
      if (file.type !== 'application/pdf') return
      try {
        const buffer = await file.arrayBuffer()
        const document = await getDocument({ data: buffer }).promise
        setFiles((current) => current.map((item) => item.id === added[index].id ? { ...item, pages: document.numPages } : item))
      } catch {
        addMessage('doxie', `I couldn’t read the page count for ${file.name}. You can enter it manually below.`)
      }
    })
    event.target.value = ''
  }

  function chooseMode(nextMode) {
    setMode(nextMode)
    setStage('customize')
    addMessage('user', nextMode === 'bulk' ? 'Print in bulk' : 'Customize one by one')
    addMessage('doxie', nextMode === 'bulk' ? 'Nice. Set the options once below and I’ll apply them to every file.' : 'Got it. Each file has its own controls below. I’ll keep the charges separate.')
  }

  function updateFile(id, key, value) {
    setFiles((current) => current.map((file) => file.id === id ? { ...file, [key]: key === 'copies' && value === '' ? '' : key === 'pages' || key === 'copies' ? Math.min(999, Math.max(1, Number(value) || 1)) : value } : file))
  }

  function normalizeCopies(id) {
    setFiles((current) => current.map((file) => file.id === id ? { ...file, copies: Math.min(999, Math.max(1, Number(file.copies) || 1)) } : file))
  }

  function applyBulk(key, value) {
    setFiles((current) => current.map((file) => ({ ...file, [key]: value })))
  }

  function finalize() {
    setFiles((current) => current.map((file) => ({ ...file, copies: Math.min(999, Math.max(1, Number(file.copies) || 1)) })))
    setStage('payment')
    addMessage('user', 'Finalize the order')
    addMessage('doxie', `Your ${fileCount}-file order comes to ${money(total)}. Review the breakdown and tap Pay securely when you’re ready.`)
  }

  async function pay() {
    if (paid) return
    if (!/^\d{10}$/.test(mobile)) {
      setPaymentError('Enter a valid 10-digit mobile number to receive your pickup token by SMS.')
      return
    }
    setPaymentError('')
    let token = 'DX-2049'
    try {
      const response = await fetch(`${API_BASE_URL}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile, total, files }) })
      if (response.ok) {
        const data = await response.json()
        token = data.token || token
      }
    } catch {
      // Keep mock checkout available while the FastAPI service is offline.
    }
    setToken(token)
    setPaid(true)
    setStage('complete')
  }

  function sendMessage(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft('')
    addMessage('user', text)
    window.setTimeout(async () => addMessage('doxie', await getAssistantReply(text, files, paid)), 220)
  }

  const priceFor = (file) => file.pages * file.copies * (file.sides === 'Single-sided' ? 3 : 4)

  return (
    <div className="app-shell">
      {view === 'customer' ? (
        <main className="chat-only-page">
          <section className="chat-card">
            <div className="chat-head"><div className="bot-avatar">D</div><div><strong>Doxie</strong><span><i /> Online · your print assistant</span></div><div className="chat-menu-wrap"><button type="button" className="chat-menu-button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>•••</button>{menuOpen && <div className="chat-menu"><button type="button" onClick={() => { setView('owner'); setMenuOpen(false) }}>Owner login <span>↗</span></button></div>}</div></div>
            <div className="chat-body"><div className="chat-welcome"><span className="spark">✳</span><strong>Print it. Pick it up.</strong></div><div className="date-divider"><span>Today</span></div>{messages.map((message, index) => <div className={`message-row ${message.from}`} key={`${message.text}-${index}`}><div className="bubble">{message.text}<small>{message.time} {message.from === 'user' && <b>✓✓</b>}</small></div></div>)}
              {stage === 'choice' && <div className="quick-replies"><button type="button" onClick={() => chooseMode('bulk')}>Print in bulk</button><button type="button" onClick={() => chooseMode('individual')}>One by one</button></div>}
              {(stage === 'customize' || stage === 'payment' || stage === 'complete') && <div className="file-settings"><div className="settings-title"><span>{mode === 'bulk' ? 'BULK SETTINGS' : 'FILE SETTINGS'}</span><b>{fileCount} file{fileCount > 1 ? 's' : ''}</b></div>{files.map((file) => <div className="file-setting" key={file.id}><div className="file-setting-head"><span className="file-icon">PDF</span><div><strong>{file.name}</strong><small>{file.pages} page{file.pages > 1 ? 's' : ''} · {money(priceFor(file))}</small></div></div><div className="file-controls"><label>Total pages<input type="number" min="1" value={file.pages} readOnly aria-label={`Total pages in ${file.name}`} /></label><label>Copies<input type="number" min="1" max="999" value={file.copies} disabled={stage === 'complete'} onChange={(event) => mode === 'bulk' ? applyBulk('copies', event.target.value) : updateFile(file.id, 'copies', event.target.value)} onBlur={() => normalizeCopies(file.id)} /></label><label>Sides<select value={file.sides} disabled={stage === 'complete'} onChange={(event) => mode === 'bulk' ? applyBulk('sides', event.target.value) : updateFile(file.id, 'sides', event.target.value)}><option>Single-sided</option><option>Double-sided</option></select></label></div></div>)}{stage === 'customize' && <><div className="charge-note">Single-sided <b>₹3/page</b> · Double-sided <b>₹4/page</b></div><button className="finalize-button" type="button" onClick={finalize}>Shall I finalize this order? <span>→</span></button></>}</div>}
              {stage === 'complete' && <><div className="token-box"><span>Paid · pickup token</span><strong>{token}</strong><small>Show this token at the counter · expires in 24h</small></div><div className="order-confirmation"><strong>Order details sent by SMS</strong><p>Your pickup token and order summary were sent to <b>{maskPhone(mobile)}</b>.</p><small>{fileCount} file{fileCount > 1 ? 's' : ''} · {money(total)} total · Files auto-delete after 24 hours</small></div></>}
              {paymentError && <div className="payment-error payment-error-below-settings">{paymentError}</div>}
            </div>
            <div className="chat-foot">{stage === 'upload' && <div className="chat-action-card"><p>Start with your document</p><label className="big-upload"><span>＋</span><strong>Upload files</strong><small>PDF, DOC, DOCX · select one or many</small><input type="file" multiple accept=".pdf,.doc,.docx" onChange={handleFiles} /></label></div>}{stage === 'payment' && <div className="payment-card"><div><span className="section-kicker">ORDER TOTAL</span><strong>{money(total)}</strong><small>{fileCount} file{fileCount > 1 ? 's' : ''} · includes every page and copy</small><label className="mobile-label">Mobile number<input type="tel" inputMode="numeric" maxLength="10" value={mobile} onChange={(event) => { setMobile(event.target.value.replace(/\D/g, '')); setPaymentError('') }} placeholder="10-digit number" aria-label="Mobile number for pickup token" />{paymentError && <em className="payment-error">{paymentError}</em>}</label></div><button className="pay-button" type="button" onClick={pay}>Pay securely <span>→</span></button><p>Mock payment now · token SMS ready · Razorpay integration ready</p></div>}<div className="composer-row"><label className="upload-button" title="Upload more documents"><span>＋</span><input type="file" multiple accept=".pdf,.doc,.docx" onChange={handleFiles} /> Add files</label><form onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask Doxie anything..." aria-label="Message Doxie" /><button type="submit" aria-label="Send message">↑</button></form></div>
            </div>
          </section>
        </main>
      ) : (
        <main className="owner-layout"><div className="owner-title"><div><span className="section-kicker">STORE OPERATIONS</span><h1>Good morning, Arjun.</h1><p>Here’s what’s happening at Doxie today.</p></div><button className="outline-button" type="button">＋ New order</button></div><div className="stat-grid"><div><span>Orders today</span><strong>24</strong><small className="up">↗ 18% vs yesterday</small></div><div><span>In progress</span><strong>07</strong><small>2 need attention</small></div><div><span>Revenue today</span><strong>₹2,840</strong><small className="up">↗ 12% vs yesterday</small></div><div><span>Avg. turnaround</span><strong>18<span> min</span></strong><small>Last 7 days</small></div></div><div className="owner-grid"><section className="orders-table"><div className="table-head"><div><span className="section-kicker">LIVE QUEUE</span><h2>Recent orders</h2></div><button className="filter-button" type="button">Today⌄</button></div>{orders.map((order) => <div className="order-row" key={order.token}><div className="order-token">{order.token}</div><div className="order-name"><strong>{order.name}</strong><span>{order.detail}</span></div><span className={`status-badge ${order.tone}`}><i /> {order.status}</span><button className="dots-button" type="button">•••</button></div>)}</section><section className="verify-panel"><span className="section-kicker">COUNTER TOOL</span><h2>Verify a token</h2><p>Confirm a student's order before handing it over.</p><div className="token-input"><input placeholder="e.g. DX-2048" aria-label="Token to verify" /><button type="button">Check</button></div><div className="verification-card"><span className="verified-icon">✓</span><div><strong>DX-2048 is ready</strong><span>Digital Marketing Notes.pdf · 12 pages</span></div></div></section></div></main>
      )}
    </div>
  )
}

export default App
