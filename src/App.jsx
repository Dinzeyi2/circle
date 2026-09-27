import { useEffect, useState } from 'react'
import {
  Bell, Bot, Check, ChevronRight, CircleDollarSign, Clock3, CreditCard,
  LayoutGrid, LockKeyhole, MoreHorizontal, Plus, ReceiptText, Search,
  Settings, ShieldCheck, Sparkles, WalletCards, X, Send, Target, LoaderCircle,
} from 'lucide-react'

const subscriptions = [
  { name: 'Netflix', category: 'Entertainment', amount: 22.99, due: 'Oct 2', mark: 'N', color: '#e50914', mode: 'Always allow' },
  { name: 'Equinox', category: 'Fitness', amount: 195, due: 'Today', mark: 'E', color: '#111111', mode: 'Ask me' },
  { name: 'Spotify', category: 'Entertainment', amount: 11.99, due: 'Oct 8', mark: '●', color: '#1ed760', mode: 'Always allow' },
  { name: 'Adobe', category: 'Software', amount: 59.99, due: 'Oct 12', mark: 'A', color: '#ed2224', mode: 'Ask me' },
]

function Logo() {
  return <div className="brand"><div className="brand-mark"><span /></div><b>extech</b></div>
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('extech_token') || '')
  const [authMode, setAuthMode] = useState('register')
  const [authError, setAuthError] = useState('')
  const [pending, setPending] = useState(true)
  const [decision, setDecision] = useState(null)
  const [aiOn, setAiOn] = useState(true)
  const [toast, setToast] = useState('')
  const [state, setState] = useState(null)
  const [chat, setChat] = useState([{ role: 'ai', text: 'Tell me what you’re planning. I’ll help protect the money for it.' }])
  const [message, setMessage] = useState('')
  const [thinking, setThinking] = useState(false)
  const [recommendation, setRecommendation] = useState({ action: 'decline', confidence: .94, summary: 'This charge would leave $127 in your spending account until payday. You also haven’t visited this gym in 47 days.' })
  const apiFetch = (url, options={}) => fetch(url,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`} : {}),...options.headers}})

  useEffect(() => {
    if(!token)return
    const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'}
    fetch('/api/state',{headers}).then(r => r.ok ? r.json() : Promise.reject()).then(setState).catch(() => {localStorage.removeItem('extech_token');setToken('')})
    fetch('/api/recommend', { method: 'POST', headers, body: JSON.stringify({ merchant: 'Equinox', amount: 195, lastUsedDays: 47, mode: 'ask' }) })
      .then(r => r.ok ? r.json() : Promise.reject()).then(setRecommendation).catch(() => {})
  }, [token])

  const authenticate=async(event)=>{event.preventDefault();setAuthError('');const data=Object.fromEntries(new FormData(event.currentTarget));try{const response=await fetch(`/api/auth/${authMode}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error);localStorage.setItem('extech_token',result.token);setToken(result.token)}catch(error){setAuthError(error.message||'Unable to sign in')}}

  const decide = async (choice) => {
    setDecision(choice)
    setPending(false)
    setToast(choice === 'approved' ? 'Payment approved. We’ll handle the retry.' : 'Charge blocked. Your money stays put.')
    window.setTimeout(() => setToast(''), 3500)
    try { await apiFetch('/api/decisions', { method: 'POST', body: JSON.stringify({ merchant: 'Equinox', amount: 195, action: choice }) }) } catch { /* Optimistic UI remains usable offline. */ }
  }

  const askAI = async (event) => {
    event.preventDefault()
    const text = message.trim()
    if (!text || thinking) return
    setChat(items => [...items, { role: 'user', text }]); setMessage(''); setThinking(true)
    try {
      const response = await apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ message: text }) })
      if (!response.ok) throw new Error()
      const data = await response.json(); setChat(items => [...items, { role: 'ai', text: data.reply }])
    } catch { setChat(items => [...items, { role: 'ai', text: 'I couldn’t reach the secure assistant. Please try again in a moment.' }]) }
    finally { setThinking(false) }
  }

  const toggleRule = async (rule) => {
    setState(current => ({ ...current, rules: current.rules.map(item => item.id === rule.id ? { ...item, enabled: !item.enabled } : item) }))
    try { await apiFetch(`/api/rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !rule.enabled }) }) } catch { setToast('Saved locally. We’ll sync when you reconnect.') }
  }

  if(!token)return <div className="auth-page"><div className="auth-visual"><Logo/><div><span>YOUR MONEY, YOUR RULES</span><h1>Nothing gets charged without your OK.</h1><p>Protect your balance, pause forgotten subscriptions, and plan ahead with Extech AI.</p></div><small>Bank-grade session security · AI with human control</small></div><div className="auth-wrap"><form className="auth-card" onSubmit={authenticate}><div className="mobile-auth-logo"><Logo/></div><h2>{authMode==='register'?'Create your Extech account':'Welcome back'}</h2><p>{authMode==='register'?'Start protecting your subscriptions.':'Sign in to manage your approvals.'}</p>{authMode==='register'&&<label>Full name<input name="name" required autoComplete="name" placeholder="Maya Kim"/></label>}<label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@example.com"/></label><label>Password<input name="password" type="password" minLength="10" required autoComplete={authMode==='register'?'new-password':'current-password'} placeholder="At least 10 characters"/></label>{authError&&<div className="auth-error">{authError}</div>}<button type="submit">{authMode==='register'?'Create secure account':'Sign in'}</button><small>{authMode==='register'?'Already registered?':'New to Extech?'} <button type="button" onClick={()=>{setAuthMode(authMode==='register'?'login':'register');setAuthError('')}}>{authMode==='register'?'Sign in':'Create account'}</button></small></form></div></div>

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <nav>
          <a className="active" href="#overview"><LayoutGrid size={19} />Overview</a>
          <a href="#subscriptions"><ReceiptText size={19} />Subscriptions <span className="nav-count">4</span></a>
          <a href="#card"><CreditCard size={19} />Extech card</a>
          <a href="#activity"><Clock3 size={19} />Activity</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><ShieldCheck size={20} /></div>
            <b>You’re protected</b>
            <p>Extech has blocked $195 in unwanted charges this month.</p>
            <a href="#report">View protection report <ChevronRight size={14} /></a>
          </div>
          <a className="settings" href="#settings"><Settings size={19} />Settings</a>
          <button className="profile" onClick={async()=>{await apiFetch('/api/auth/logout',{method:'POST'});localStorage.removeItem('extech_token');setToken('')}}><div className="avatar">{state?.profile?.name?.split(' ').map(x=>x[0]).join('').slice(0,2)||'EX'}</div><div><b>{state?.profile?.name||'Extech user'}</b><span>Sign out securely</span></div><MoreHorizontal size={18} /></button>
        </div>
      </aside>

      <main>
        <header>
          <div className="mobile-brand"><Logo /></div>
          <label className="search"><Search size={18} /><input aria-label="Search" placeholder="Search subscriptions" /></label>
          <button className="icon-button" aria-label="Notifications"><Bell size={19} /><i /></button>
          <div className="header-avatar">MK</div>
        </header>

        <div className="content" id="overview">
          <section className="welcome">
            <div><p>Saturday, September 26</p><h1>Good morning, Maya</h1><span>Here’s what’s happening with your money.</span></div>
            <button className="primary"><Plus size={17} /> Add subscription</button>
          </section>

          <section className="stats-grid">
            <article className="stat-card">
              <div className="stat-head"><span className="soft-icon green"><WalletCards size={19} /></span><span className="positive">+2.4%</span></div>
              <p>Available balance</p><h2>$2,847.63</h2><small>Across 2 linked accounts</small>
            </article>
            <article className="stat-card">
              <div className="stat-head"><span className="soft-icon blue"><ReceiptText size={19} /></span><MoreHorizontal size={19} /></div>
              <p>Monthly subscriptions</p><h2>$289.97</h2><small>4 active subscriptions</small>
            </article>
            <article className="stat-card saved">
              <div className="stat-head"><span className="soft-icon amber"><ShieldCheck size={19} /></span><span className="saved-pill">This month</span></div>
              <p>Money protected</p><h2>$195.00</h2><small>1 unwanted charge blocked</small>
            </article>
          </section>

          {pending && <section className="approval-card">
            <div className="approval-top">
              <div className="merchant-logo">E</div>
              <div className="merchant-copy"><span className="eyebrow">APPROVAL NEEDED</span><h2>Equinox tried to charge <strong>$195.00</strong></h2><p>Monthly membership · Card ending in 4821</p></div>
              <span className="time">Just now</span>
            </div>
            <div className="ai-note"><Sparkles size={19} /><div><b>Extech AI recommends {recommendation.action === 'approve' ? 'approving' : recommendation.action === 'ask' ? 'asking you' : 'declining'}</b><p>{recommendation.summary}</p></div><span>{Math.round(recommendation.confidence * 100)}% confident</span></div>
            <div className="approval-actions">
              <button className="decline" onClick={() => decide('declined')}><X size={18} /> Decline charge</button>
              <button className="approve" onClick={() => decide('approved')}><Check size={18} /> Approve $195</button>
              <button className="more" aria-label="More options"><MoreHorizontal size={20} /></button>
            </div>
          </section>}

          {!pending && <section className={`decision-card ${decision}`}><div>{decision === 'approved' ? <Check /> : <LockKeyhole />}</div><span><b>{decision === 'approved' ? 'Charge approved' : 'Charge declined'}</b><small>{decision === 'approved' ? 'Equinox can retry this payment now.' : 'We’ll keep blocking retries from Equinox.'}</small></span><button onClick={() => { setPending(true); setDecision(null) }}>Undo</button></section>}

          <div className="dashboard-grid">
            <section className="panel subscriptions" id="subscriptions">
              <div className="panel-title"><div><h3>Your subscriptions</h3><p>Manage who can charge your card</p></div><a href="#all">View all <ChevronRight size={15} /></a></div>
              <div className="sub-list">
                {subscriptions.map((sub) => <div className="sub-row" key={sub.name}>
                  <div className="sub-logo" style={{ background: sub.color }}>{sub.mark}</div>
                  <div className="sub-name"><b>{sub.name}</b><span>{sub.category}</span></div>
                  <div className="sub-price"><b>${sub.amount.toFixed(2)}</b><span>due {sub.due}</span></div>
                  <button className={sub.mode === 'Ask me' ? 'mode ask' : 'mode allow'}><i />{sub.mode}</button>
                  <button className="row-more" aria-label={`Options for ${sub.name}`}><MoreHorizontal size={19} /></button>
                </div>)}
              </div>
            </section>

            <section className="panel ai-panel">
              <div className="ai-title"><span><Bot size={21} /></span><div><h3>Smart decisions</h3><p>Powered by Extech AI</p></div><button onClick={() => setAiOn(!aiOn)} className={`switch ${aiOn ? 'on' : ''}`} aria-label="Toggle smart decisions"><i /></button></div>
              <div className="insight"><div className="insight-icon"><CircleDollarSign size={21} /></div><div><b>You’re on track this month</b><p>After upcoming bills, you’ll have about <strong>$1,420</strong> left to spend.</p></div></div>
              <div className="ai-features">
                <div><Check size={14} /><span><b>Balance-aware approvals</b><small>Protects your essential spending</small></span></div>
                <div><Check size={14} /><span><b>Usage monitoring</b><small>Spots subscriptions you don’t use</small></span></div>
                <div><Check size={14} /><span><b>Price change alerts</b><small>Flags increases before you pay</small></span></div>
              </div>
              <button className="manage-ai">Manage AI preferences <ChevronRight size={15} /></button>
            </section>
          </div>
          <div className="automation-grid">
            <section className="panel rules-panel">
              <div className="panel-title"><div><h3>Your automatic guardrails</h3><p>You stay in control. Change these at any time.</p></div><ShieldCheck size={20} /></div>
              <div className="rules-list">
                {(state?.rules || [
                  { id: 'low-balance', label: 'Protect my safety balance', detail: 'Decline optional charges below $250.', enabled: true },
                  { id: 'unused', label: 'Pause unused subscriptions', detail: 'Ask me after 30 days without use.', enabled: true },
                  { id: 'price-rise', label: 'Catch price increases', detail: 'Ask me before paying more than last month.', enabled: true },
                ]).map(rule => <button className="rule" key={rule.id} onClick={() => state && toggleRule(rule)}>
                  <span><b>{rule.label}</b><small>{rule.detail}</small></span><i className={`switch ${rule.enabled ? 'on' : ''}`}><em /></i>
                </button>)}
              </div>
            </section>
            <section className="panel planner-panel">
              <div className="panel-title"><div><h3>Plan with Extech AI</h3><p>Ask how to protect money for your week.</p></div><Target size={20} /></div>
              {state?.goals?.[0] && <div className="goal"><span><b>{state.goals[0].title}</b><small>${state.goals[0].saved} of ${state.goals[0].target} protected</small></span><strong>{Math.round(state.goals[0].saved / state.goals[0].target * 100)}%</strong><div><i style={{ width: `${Math.min(100, state.goals[0].saved / state.goals[0].target * 100)}%` }} /></div></div>}
              <div className="chat-log">{chat.slice(-3).map((item, index) => <div className={`bubble ${item.role}`} key={`${item.role}-${index}`}>{item.text}</div>)}{thinking && <div className="bubble ai thinking"><LoaderCircle size={15} /> Thinking with your preferences…</div>}</div>
              <div className="prompts"><button onClick={() => setMessage('I have plans this weekend. What can I pause to save $150?')}>Plan my weekend</button><button onClick={() => setMessage('Which subscriptions should always be declined until I cancel them?')}>Find safe pauses</button></div>
              <form className="chat-form" onSubmit={askAI}><input value={message} onChange={e => setMessage(e.target.value)} placeholder="Tell Extech about a goal or upcoming plan…" aria-label="Message Extech AI" /><button aria-label="Send message" disabled={thinking}><Send size={16} /></button></form>
              <small className="ai-disclaimer">AI suggestions can be wrong. You make the final payment decision.</small>
            </section>
          </div>
          <footer><LockKeyhole size={14} /> Your card details are encrypted and secured by Stripe. <a href="#security">Learn about security</a></footer>
        </div>
      </main>
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  )
}

export default App
