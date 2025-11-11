import React, { useEffect, useMemo, useRef, useState } from 'react'
import './styles.css'
import Slider from './components/Slider'
import RangeSlider from './components/RangeSlider'
import {
  connectWallet,
  placeBet,
  settle,
  ensureNetwork43111,
  getHBKHeight,
  getBtcDelay,
  getOwner,
  getNextBetId,
  readBet,
  getRecentBets,
  getHBKHeaderN,
  simulateSettle,
  setBtcDelay,
  simulatePlace,
  readUsdcState,
  getConfig,
  BetView,
  setNetwork as setLibNetwork,
  getNetwork as getLibNetwork,
} from './lib/contract'
import { MAINNET, TESTNET, type NetworkConfig } from './lib/networks'
import { formatUnits } from 'ethers'

/* ---------- Compact hex-logo (size-enforced) ---------- */
function LogoMark(
  { size = 40, className = '' }: { size?: number; className?: string }
) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, flex: '0 0 auto' }}
      aria-label="Hemi Hi-Lo"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="hh" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#76f1ff"/>
          <stop offset="1" stopColor="#5a7bff"/>
        </linearGradient>
      </defs>
      {/* Hex outline */}
      <path
        d="M32 4l20 12v24L32 52 12 40V16z"
        fill="none"
        stroke="url(#hh)"
        strokeWidth="3"
        opacity="0.9"
      />
      {/* Stylized H */}
      <path
        d="M22 22v20M42 22v20M22 32h20"
        stroke="url(#hh)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

/* ---------- Social Icons ---------- */
function GitHubIcon({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.42c.58.11.78-.25.78-.56l-.02-2.02c-3.17.69-3.84-1.53-3.84-1.53-.53-1.35-1.3-1.71-1.3-1.71-1.07-.73.08-.72.08-.72 1.18.08 1.8 1.22 1.8 1.22 1.05 1.8 2.76 1.28 3.43.98.11-.77.41-1.28.75-1.57-2.53-.29-5.2-1.27-5.2-5.64 0-1.25.45-2.27 1.2-3.07-.12-.29-.52-1.45.11-3.02 0 0 .98-.31 3.2 1.17a11.1 11.1 0 0 1 5.82 0c2.22-1.48 3.2-1.17 3.2-1.17.63 1.57.23 2.73.11 3.02.75.8 1.2 1.82 1.2 3.07 0 4.38-2.67 5.35-5.22 5.63.42.36.8 1.08.8 2.18l-.02 3.23c0 .31.2.68.79.56A11.5 11.5 0 0 0 12 .5Z"/>
    </svg>
  )
}
function DiscordIcon({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M20.317 4.37A19.79 19.79 0 0 0 16.558 3c-.2.35-.43.82-.59 1.2a18.27 18.27 0 0 0-7.936 0c-.16-.38-.39-.85-.59-1.2-1.32.24-2.62.64-3.76 1.37C.533 9.24-.32 14 0 18.71a19.96 19.96 0 0 0 6.062 3.02c.47-.64.89-1.33 1.25-2.05-.69-.26-1.35-.6-1.96-.99.17-.12.34-.25.5-.38 3.77 1.77 7.86 1.77 11.6 0 .17.13.34.26.5.38-.61.4-1.27.73-1.96.99.36.72.78 1.41 1.25 2.05a19.96 19.96 0 0 0 6.062-3.02c.27-3.76-.46-8.49-3.88-14.34ZM8.51 15.28c-1.01 0-1.84-.93-1.84-2.07 0-1.13.82-2.06 1.84-2.06 1.03 0 1.85.93 1.84 2.06 0 1.14-.82 2.07-1.84 2.07Zm6.98 0c-1.01 0-1.84-.93-1.84-2.07 0-1.13.82-2.06 1.84-2.06 1.03 0 1.85.93 1.84 2.06 0 1.14-.82 2.07-1.84 2.07Z"/>
    </svg>
  )
}
function XIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M18.244 2H21l-6.61 7.548L22 22h-6.828l-4.73-6.18L5.1 22H2.343l7.06-8.067L2 2h6.914l4.308 5.73L18.244 2Zm-2.39 18h1.32L8.22 4h-1.4l9.034 16Z"/>
    </svg>
  )
}

/* ---------- Local seed vault ---------- */
const SEED_VAULT_KEY = 'hilo.seedsById'
function loadSeedVault(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SEED_VAULT_KEY) || '{}') } catch { return {} }
}
function saveSeedFor(betId: number, seed: string) {
  const m = loadSeedVault()
  m[String(betId)] = seed
  localStorage.setItem(SEED_VAULT_KEY, JSON.stringify(m))
}
function getSeedFor(betId: number): string | undefined {
  const m = loadSeedVault()
  return m[String(betId)]
}
function randomSeedHex(bytes = 16): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('')
}

function App() {
  /* ---------- Network switcher ---------- */
  const [net, setNet] = useState<NetworkConfig>(() => getLibNetwork() ?? MAINNET)
  function switchNet(next: NetworkConfig) {
    setNet(next)
    setLibNetwork(next)
    // reset view-scoped state
    setBetId('')
    setPlayerSeed('')
    setHbkHeight(null)
    setTargetHeight(null)
    setLastError('')
    setDebugLine('')
    if (account) {
      refreshUSDC(account).catch(() => {})
      refreshHistory(account).catch(() => {})
    }
  }

  /* ---------- Wager inputs ---------- */
  const [percent, setPercent] = useState(50)
  const [mode, setMode] = useState<'low' | 'high' | 'custom'>('custom')
  const [amount, setAmount] = useState('1')
  const [playerSeed, setPlayerSeed] = useState('')
  const [betId, setBetId] = useState('')

  /* ---------- Wallet ---------- */
  const [account, setAccount] = useState<string | null>(null)

  /* ---------- USDC state ---------- */
  const [usdcDecimals, setUsdcDecimals] = useState<number>(6)
  const [usdcBal, setUsdcBal] = useState<bigint>(0n)
  const [usdcAllowance, setUsdcAllowance] = useState<bigint>(0n)
  async function refreshUSDC(owner?: string) {
    try {
      const { decimals, balance, allowance } = await readUsdcState(owner)
      setUsdcDecimals(decimals)
      setUsdcBal(balance)
      setUsdcAllowance(allowance)
    } catch {}
  }

  async function onConnect() {
    try {
      const addr = await connectWallet()
      setAccount(addr)
      await Promise.all([
        refreshOwnerAndDelay(),
        refreshHistory(addr),
        refreshUSDC(addr),
      ])
    } catch (e: any) {
      alert(e?.message || 'Wallet connect failed (is MetaMask installed & unlocked?)')
    }
  }

  function ensureSeed(s: string): string {
    const t = (s ?? '').trim()
    if (t.length) return t
    const gen = randomSeedHex()
    setPlayerSeed(gen)
    return gen
  }

  /* ---------- Dual range (custom mode) ---------- */
  const [customLow, setCustomLow] = useState(0)
  const [customHigh, setCustomHigh] = useState(4999)

  /* ---------- Derived range ---------- */
  const { low, high } = useMemo(() => {
    if (mode === 'custom') return { low: customLow, high: customHigh }
    const size = Math.floor(percent * 100) // 0..10000
    if (mode === 'low') return { low: 0, high: Math.max(0, size - 1) }
    return { low: Math.max(0, 10000 - size), high: 9999 }
  }, [mode, percent, customLow, customHigh])

  const impliedMultiplier = useMemo(() => {
    const rangeSize = high - low + 1
    const edgeBps = 100
    const mult = (10000 - edgeBps) / rangeSize
    return mult.toFixed(4)
  }, [low, high])

  /* ---------- HBK / settle readiness ---------- */
  const [hbkHeight, setHbkHeight] = useState<number | null>(null)
  const [targetHeight, setTargetHeight] = useState<number | null>(null)
  const ready = hbkHeight !== null && targetHeight !== null && hbkHeight >= targetHeight

  /* ---------- Debug ---------- */
  const [targetHeaderPresent, setTargetHeaderPresent] = useState<'yes'|'no'|'—'>('—')
  const [lastError, setLastError] = useState<string>('')
  const [debugLine, setDebugLine] = useState<string>('')

  /* ---------- btcDelay readout ---------- */
  const [btcDelayNow, setBtcDelayNow] = useState<number | null>(null)

  // --- UI effects & preview state ---
  const [houseEdgeBps, setHouseEdgeBps] = useState<number>(100)
  const lastThreshold = useRef<number | null>(null)
  const [bumpKey, setBumpKey] = useState<number>(0) // toggles bump animation

  async function refreshStatus(idOverride?: number) {
    try {
      setLastError('')
      const idRaw = Number.isFinite(idOverride as number) ? Number(idOverride) : Number(betId)
      if (!Number.isFinite(idRaw) || idRaw < 0) return

      const [b, hh, delay] = await Promise.all([
        readBet(idRaw),
        getHBKHeight(),
        getBtcDelay().then(x => Number(x)).catch(() => null),
      ])
      setBtcDelayNow(delay)

      const btcHeightNum = b?.btcHeight != null ? Number(b.btcHeight) : NaN
      setTargetHeight(Number.isFinite(btcHeightNum) ? btcHeightNum : null)
      setHbkHeight(hh)

      const stored = getSeedFor(idRaw)
      if (stored && !playerSeed) setPlayerSeed(stored)

      if (!betId) setBetId(String(idRaw))

      if (Number.isFinite(btcHeightNum)) {
        const hdr = await getHBKHeaderN(btcHeightNum)
        setTargetHeaderPresent(hdr ? 'yes' : 'no')
      } else {
        setTargetHeaderPresent('—')
      }

      setDebugLine(
        `HBK=${hh} • bet#${idRaw} target=${Number.isFinite(btcHeightNum) ? btcHeightNum : '—'} ` +
        `settled=${String(b?.settled)} won=${String(b?.won)} roll=${String(b?.roll)} ` +
        `btcDelay=${delay ?? '—'} • USDC bal=${formatUnits(usdcBal, usdcDecimals)} ` +
        `allow=${formatUnits(usdcAllowance, usdcDecimals)}`
      )
    } catch (e: any) {
      const msg = e?.shortMessage || e?.reason || e?.message || String(e)
      setLastError(msg)
      setDebugLine(`refreshStatus error: ${msg}`)
    }
  }

  async function onSimulatePlace() {
    try {
      setLastError('')
      await refreshUSDC(account || undefined)
      const cfg = await getConfig()
      setBtcDelayNow(cfg.btcDelay)
      setHouseEdgeBps(cfg.houseEdgeBps)

      const seed = playerSeed.trim() || randomSeedHex()
      if (!playerSeed.trim()) setPlayerSeed(seed)

      const sim = await simulatePlace(low, high, amount, seed)

      const cfgLine =
        `cfg: paused=${cfg.paused} edge=${cfg.houseEdgeBps}bps ` +
        `maxBet=${formatUnits(cfg.maxBet, cfg.usdcDecimals)} ` +
        `maxProfit=${formatUnits(cfg.maxProfit, cfg.usdcDecimals)} ` +
        `btcDelay=${cfg.btcDelay}`

      if (sim.ok) {
        setDebugLine(
          `simulatePlace: OK (abi=${sim.variant}) • ${cfgLine} • ` +
          `bal=${formatUnits(usdcBal, usdcDecimals)} allow=${formatUnits(usdcAllowance, usdcDecimals)} • ` +
          `low=${low} high=${high} amount=${amount} seedLen=${seed.length}`
        )
        alert('Simulation: would succeed')
      } else {
        setDebugLine(
          `simulatePlace: REVERT (${sim.error}) • ${cfgLine} • ` +
          `bal=${formatUnits(usdcBal, usdcDecimals)} allow=${formatUnits(usdcAllowance, usdcDecimals)} • ` +
          `low=${low} high=${high} amount=${amount} seedLen=${seed.length}`
        )
        alert(`Simulation reverted: ${sim.error}`)
      }
    } catch (e: any) {
      const msg = e?.shortMessage || e?.reason || e?.message || String(e)
      setLastError(msg)
      setDebugLine(`simulatePlace error: ${msg}`)
    }
  }

  async function onSimulateSettle() {
    try {
      setLastError('')
      const id = Number(betId)
      if (!Number.isFinite(id) || id < 0) return alert('Enter a valid bet id')
      const seed = ensureSeed(playerSeed) || getSeedFor(id) || ''
      if (!seed) return alert('Missing player seed (cannot simulate).')
      await simulateSettle(id, seed)
      alert('Simulation: would succeed (no revert)')
    } catch (e: any) {
      const msg = e?.shortMessage || e?.reason || e?.message || String(e)
      setLastError(`simulateSettle reverted: ${msg}`)
      alert(`Simulation reverted: ${msg}`)
    }
  }

  async function onPlace() {
    try {
      await ensureNetwork43111()
      const nextId = Number(await getNextBetId())
      const seed = ensureSeed(playerSeed)
      setPlayerSeed(seed)
      await placeBet(low, high, amount, seed)
      saveSeedFor(nextId, seed)
      setBetId(String(nextId))
      await Promise.all([refreshStatus(nextId), refreshUSDC(account || undefined)])
      alert(`Bet #${nextId} placed!`)
      if (account) refreshHistory(account)
    } catch (e: any) {
      alert(`Place failed: ${e?.message || e}`)
    }
  }

  async function onSettle() {
    try {
      await ensureNetwork43111()
      const id = Number(betId)
      if (!Number.isFinite(id) || id < 0) return alert('Enter a valid bet id')
      if (!ready) return alert('HBK has not reached the target Bitcoin height yet.')
      const seed = ensureSeed(playerSeed) || getSeedFor(id) || ''
      if (!seed) return alert('Missing player seed.')
      await settle(id, seed)
      alert(`Bet #${id} settled.`)
      if (account) refreshHistory(account)
      await refreshStatus(id)
      await refreshUSDC(account || undefined)
    } catch (e: any) {
      alert(`Settle failed: ${e?.message || e}`)
    }
  }

  /* ---------- Auto-settle poll ---------- */
  const [autoSettle, setAutoSettle] = useState(false)
  const pollRef = useRef<number | null>(null)
  useEffect(() => {
    if (!autoSettle) { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; return }
    const id = Number(betId)
    if (!Number.isFinite(id) || id < 0) return
    async function tick() {
      await refreshStatus(id)
      if (ready) {
        const seed = getSeedFor(id) || playerSeed
        if (seed) { try { await onSettle() } catch {} }
      }
    }
    tick()
    const h = window.setInterval(tick, 7_500)
    pollRef.current = h as unknown as number
    return () => { clearInterval(h) }
  }, [autoSettle, betId, playerSeed, ready])

  /* ---------- Admin ---------- */
  const [ownerAddr, setOwnerAddr] = useState<string | null>(null)
  const [currentDelay, setCurrentDelay] = useState<string>('—')
  const [delayInput, setDelayInput] = useState<string>('1')
  const isOwner = account && ownerAddr && account.toLowerCase() === ownerAddr.toLowerCase()

  async function refreshOwnerAndDelay() {
    try {
      const [own, d] = await Promise.all([getOwner().catch(() => null), getBtcDelay().catch(() => null)])
      if (own) setOwnerAddr(own)
      if (d != null) setCurrentDelay(String(d))
    } catch {}
  }

  async function onSetDelay() {
    try {
      await ensureNetwork43111()
      const val = parseInt(delayInput || '0', 10)
      if (Number.isNaN(val)) return alert('Enter a number')
      await setBtcDelay(val)
      const d = await getBtcDelay()
      setCurrentDelay(String(d))
      setBtcDelayNow(Number(d))
      alert(`btcDelay set to ${String(d)}`)
    } catch (e: any) {
      alert(e?.message || String(e))
    }
  }

  /* ---------- History ---------- */
  const [history, setHistory] = useState<BetView[]>([])
  async function refreshHistory(acct?: string | null) {
    try {
      const me = (acct || account || '').toLowerCase()
      if (!me) return setHistory([])
      const items = await getRecentBets(30, me)
      setHistory(items)
    } catch {}
  }

  useEffect(() => { if (account) refreshHistory(account) }, [account])
  useEffect(() => {
    const id = Number(betId)
    if (Number.isFinite(id) && id >= 0) refreshStatus(id)
  }, [betId])
  useEffect(() => {
    if (!account) return
    const h = window.setInterval(() => refreshUSDC(account), 20_000)
    return () => clearInterval(h)
  }, [account])
  useEffect(() => {
    getConfig().then(c => setHouseEdgeBps(c.houseEdgeBps)).catch(() => {})
  }, [])

  const year = new Date().getFullYear()

  // ---- payout preview & UI helpers ----
  function computePayoutPreview() {
    const amt = Number((amount || '0').trim())
    if (!Number.isFinite(amt) || amt <= 0) return { payout: '—', winPct: '—' }
    const rangeSize = Math.max(1, high - low + 1)           // 1..10000
    const edge = Math.max(0, 10000 - (houseEdgeBps || 0))   // bps complement
    const payout = (amt * edge) / rangeSize / 100           // edge is in bps
    const winPct = ((rangeSize / 10000) * 100).toFixed(2) + '%'
    return { payout: payout.toFixed(4), winPct }
  }
  const { payout: payoutPreview, winPct } = computePayoutPreview()

  function currentThreshold() {
    // For custom mode, probability% = rangeSize/100 ; otherwise, the single slider %.
    const p = (mode === 'custom') ? ((high - low + 1) / 100) : percent
    const pivots = [25, 50, 75]
    let hit: number | null = null
    for (const t of pivots) {
      if (Math.abs(p - t) < 0.8) { hit = t; break }
    }
    return hit
  }

  function burstConfetti(containerId: string) {
    const root = document.getElementById(containerId)
    if (!root) return
    const N = 24
    for (let i = 0; i < N; i++) {
      const p = document.createElement('span')
      const angle = (i / N) * 2 * Math.PI
      const dx = Math.cos(angle), dy = Math.sin(angle)
      const dist = 60 + Math.random() * 40
      p.className = 'confetti-p'
      p.style.setProperty('--tx', `${dx * dist}px`)
      p.style.setProperty('--ty', `${dy * dist}px`)
      p.style.left = '50%'
      p.style.top = '50%'
      p.style.background = `hsl(${Math.floor(Math.random()*20)+25}, 95%, 55%)`
      root.appendChild(p)
      setTimeout(() => p.remove(), 900)
    }
  }

  function maybeBumpAndConfetti(containerId: string) {
    const hit = currentThreshold()
    if (hit != null && hit !== lastThreshold.current) {
      lastThreshold.current = hit
      setBumpKey(Date.now())
      burstConfetti(containerId)
    }
  }

return (
<div className="mx-auto p-4 md:p-6 has-topnav hemi-dark">
      {/* Sticky Dapp Top-Nav */}
      <nav role="navigation" className="topnav">
        <div className="inner">
          <div className="nav-top">
            <div className="nav-left">
              <LogoMark size={30} className="logo-mark mr-1" />
              <h1 className="title-web3 text-base md:text-lg font-semibold text-hemi leading-tight truncate">
                HEMI Hi‑Lo: Bitcoin‑backed RNG
              </h1>
            </div>
            <div className="nav-right">
              <select
                className="input !py-1.5 !px-2 text-xs nav-gap"
                value={net.key}
                onChange={(e) => {
                  const k = e.target.value as 'mainnet' | 'testnet'
                  switchNet(k === 'mainnet' ? MAINNET : TESTNET)
                }}
                title="Network"
              >
                <option value="mainnet">Mainnet</option>
                <option value="testnet">Testnet</option>
              </select>
              <label className="hidden sm:flex items-center text-xs text-gray-400 nav-gap">
                <input
                  type="checkbox"
                  checked={autoSettle}
                  onChange={e => setAutoSettle(e.target.checked)}
                />
                <span className="ml-1">Auto‑settle</span>
              </label>
              {account ? (
                <span
                  className="text-[11px] md:text-xs text-green-400 truncate max-w-[160px] md:max-w-[220px]"
                  title={account}
                >
                  {account}
                </span>
              ) : (
                <button className="btn btn-primary text-xs px-3 py-1" onClick={onConnect}>
                  {typeof (window as any).ethereum !== 'undefined' ? 'Connect Wallet' : 'No Wallet'}
                </button>
              )}
            </div>
          </div>
          <div className="nav-bottom">
            <span className="badge-test">⚠️ <b>TEST MODE</b></span>
            <span className="badge-warn">Contracts/feeds may change — <b>funds at risk</b></span>
          </div>
        </div>
      </nav>

      {/* Unified app shell */}
      <main className="app-shell space-y-4">
        {/* Single-module container with internal segments */}
        <section className="module">
          {/* Segment 1: Mode & Slider */}
          <div className="segment centered">
            <div className="center-wrap">
              {/* FOCAL SLIDER ON TOP */}
              <div className="focal-slider mx-auto">
                <div className={`focal-slider-inner ${bumpKey ? 'bump' : ''}`}>
                  <div className="focal-slider-head">
                    <span className="label">Range Selector</span>
                    <span className="percent-badge">
                      {mode === 'custom'
                        ? `${customLow}–${customHigh}`
                        : `${percent}%`}
                    </span>
                  </div>

                  {/* Show single slider in low/high mode, dual in custom */}
                  {mode !== 'custom' ? (
                    <div className="focal-slider-body">
                      <Slider
                        value={percent}
                        onChange={(v: number) => {
                          setPercent(v)
                          maybeBumpAndConfetti('focal-confetti')
                        }}
                      />
                      <div className="focal-slider-glow" aria-hidden="true"></div>
                      <div id="focal-confetti" style={{position:'absolute', inset:0, pointerEvents:'none'}} />
                    </div>
                  ) : (
                    <div className="focal-slider-body">
                      <RangeSlider
                        min={0}
                        max={9999}
                        low={customLow}
                        high={customHigh}
                        onChange={(lo, hi) => {
                          const clampedLo = Math.max(0, Math.min(9999, lo))
                          const clampedHi = Math.max(0, Math.min(9999, hi))
                          setCustomLow(Math.min(clampedLo, clampedHi))
                          setCustomHigh(Math.max(clampedLo, clampedHi))
                          maybeBumpAndConfetti('focal-confetti')
                        }}
                      />
                      <div className="focal-slider-glow" aria-hidden="true"></div>
                      <div id="focal-confetti" style={{position:'absolute', inset:0, pointerEvents:'none'}} />
                    </div>
                  )}
                  <div className="focal-slider-foot">
                    <span className="hint-left">Bottom</span>
                    <span className="hint-right">Top</span>
                  </div>
                  <div className="text-sm text-gray-300 mt-2 text-center">
                    Potential payout: <b>{payoutPreview}</b> USDC • Win chance: <b>{winPct}</b>
                  </div>
                </div>
              </div>

              <div className="gap-after-slider" />
              {/* MODE BUTTONS + QUICK STATS */}
              <div className="mt-4 flex items-center justify-center flex-wrap mode-buttons">
                <div className="flex mode-buttons">
                  <button
                    className={`btn btn-primary ${mode === 'low' ? 'ring-2 ring-hemi/60' : ''}`}
                    onClick={() => setMode('low')}
                  >Bottom</button>
                  <button
                    className={`btn btn-primary ${mode === 'high' ? 'ring-2 ring-hemi/60' : ''}`}
                    onClick={() => setMode('high')}
                  >Top</button>
                  <button
                    className={`btn btn-primary ${mode === 'custom' ? 'ring-2 ring-hemi/60' : ''}`}
                    onClick={() => setMode('custom')}
                  >Custom</button>
                </div>
                <div className="gap-after-modes" />
                <div className="text-sm text-gray-300">
                  Range: <b>{low}</b>–<b>{high}</b> (size {high - low + 1}) • Multiplier ≈ <b>{impliedMultiplier}×</b>
                </div>
              </div>
            </div>
          </div>

          <hr className="divider" />

          {/* Segment 2: Amount & Place */}
          <div className="segment centered">
            <div className="center-wrap grid md:grid-cols-2 gap-6 justify-items-center">
              <div className="space-y-3 w-full max-w-sm">
                <div className="amount-accent">
                  <span className="label-pill">Amount (USDC.e)</span>
                  <input className="input w-full" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                <div className="text-xs text-gray-500">
                  Bal: {formatUnits(usdcBal, usdcDecimals)} • Allow: {formatUnits(usdcAllowance, usdcDecimals)}
                </div>
                <div className="text-[11px] text-gray-500">
                  Tip: amount ≤ maxBet & profit ≤ maxProfit. Use “Simulate” to see the exact reason if blocked.
                </div>
                <div className="flex gap-2 pt-1">
                  <button className="btn btn-secondary flex-1" onClick={onSimulatePlace}>Simulate</button>
                  <button className="btn btn-primary flex-1" onClick={onPlace}>Place Bet</button>
                </div>
              </div>

              <div className="space-y-3 w-full max-w-sm">
                <label className="block mb-1 text-sm text-gray-400">Player seed (optional)</label>
                <input className="input w-full" placeholder="(auto-generated if empty)" value={playerSeed} onChange={e => setPlayerSeed(e.target.value)} />
                <div className="text-xs text-gray-500">btcDelay now: {btcDelayNow ?? '—'}</div>

                <div className="grid grid-cols-[1fr_auto] gap-3 items-end pt-2">
                  <div>
                    <label className="block mb-1 text-sm text-gray-400">Bet ID</label>
                    <input className="input w-full" placeholder="(auto)" value={betId} onChange={e => setBetId(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button className="btn" onClick={() => refreshStatus()}>Refresh</button>
                    <button className="btn btn-secondary" onClick={onSimulateSettle}>Simulate</button>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={onSettle} disabled={!ready}>Settle Bet</button>
              </div>
            </div>
          </div>

          <hr className="divider" />

          {/* Segment 3: Status & Debug */}
          <div className="segment centered">
            <div className="center-wrap">
              <details open>
                <summary className="cursor-pointer text-sm text-gray-300 border-b border-white/5 pb-2">Status & Debug</summary>
                <div className="mt-2 text-sm text-gray-400 grid grid-cols-2 gap-2">
                  <div>HBK latest height: <b>{hbkHeight ?? '—'}</b></div>
                  <div>Bet target height: <b>{targetHeight ?? '—'}</b></div>
                  <div>Target header present: <b>{targetHeaderPresent}</b></div>
                  <div>Status: <b className={ready ? 'text-green-400' : 'text-amber-400'}>{ready ? 'Ready to settle' : 'Waiting for header'}</b></div>
                </div>
                {lastError && <div className="text-rose-400 text-xs mt-2 break-all">debug: {lastError}</div>}
                <pre className="debug-pre">{debugLine}</pre>
              </details>
            </div>
          </div>

          {/* Admin (owner-only) */}
          {isOwner && (
            <>
              <hr className="divider" />
              <div className="segment centered">
                <div className="center-wrap">
                  <div className="text-sm text-gray-400">
                    <div>Owner: <b className="break-all">{ownerAddr}</b></div>
                    <div>Current btcDelay: <b>{currentDelay}</b></div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-3 items-end mt-3">
                    <div>
                      <label className="block mb-1 text-sm text-gray-400">Set btcDelay</label>
                      <input
                        className="input w-full"
                        type="number"
                        min={0}
                        value={delayInput}
                        onChange={e => setDelayInput(e.target.value)}
                      />
                    </div>
                    <button className="btn" onClick={onSetDelay}>Set</button>
                  </div>
                  <button className="btn mt-2" onClick={() => { setDelayInput('1'); }}>Quick set to 1 (fast local test)</button>
                </div>
              </div>
            </>
          )}

          {/* Recent bets */}
          <hr className="divider" />
          <div className="segment centered">
            <div className="center-wrap">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Your Recent Bets</h2>
                <button className="btn" onClick={() => refreshHistory(account)}>Refresh</button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-white/5 mt-2">
                <table className="text-sm w-full recent-table">
                  <thead className="text-gray-300/90">
                    <tr>
                      <th>ID</th>
                      <th>Range</th>
                      <th>Wager</th>
                      <th>BTC Height</th>
                      <th>Roll</th>
                      <th>Result</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(b => {
                      const btcH = b.btcHeight != null ? Number(b.btcHeight) : 0
                      const isReady = hbkHeight != null && btcH > 0 && hbkHeight >= btcH
                      const result = b.settled ? (b.won ? 'WIN' : 'LOSE') : (isReady ? 'Ready' : 'Pending')
                      return (
                        <tr key={b.id}>
                          <td>{b.id}</td>
                          <td>{b.low}–{b.high}</td>
                          <td>{String(b.wager)}</td>
                          <td>{b.btcHeight ?? '—'}</td>
                          <td>{b.settled ? b.roll : '—'}</td>
                          <td className={`${b.settled ? (b.won ? 'text-green-400' : 'text-rose-400') : (isReady ? 'text-green-300' : 'text-amber-300')}`}>
                            {result}
                          </td>
                          <td>
                            {!b.settled && (
                              <button
                                className="btn btn-xs btn-primary"
                                onClick={async () => {
                                  setBetId(String(b.id))
                                  await refreshStatus(b.id)
                                  const seed = getSeedFor(b.id) || playerSeed
                                  if (seed) setPlayerSeed(seed)
                                  if (isReady && seed) await onSettle()
                                }}
                              >
                                Settle
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {history.length === 0 && (
                      <tr><td colSpan={7} className="text-gray-500 py-2">No recent bets for this wallet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <footer className="site-footer app-shell" role="contentinfo">
          <div className="row">
            <div className="left">
              <div className="brand">
                <LogoMark size={18} className="mr-2" />
                <span className="title-web3">HEMI Hi‑Lo</span>
              </div>
              <p className="tagline">
                Provably‑fair: keccak256(BTC header @ height, serverSeedReveal, playerSeed, betId). • Built on Hemi.
              </p>
              <p className="copy">© {year} HEMI Hi‑Lo. All rights reserved.</p>
            </div>
            <div className="right icons" aria-label="Social links">
              <a href="https://github.com/0xJonHoldsCrypto/Hemi-Hi-Lo" target="_blank" rel="noreferrer" aria-label="GitHub">
                <GitHubIcon />
              </a>
              <a href="https://discord.gg/" target="_blank" rel="noreferrer" aria-label="Discord">
                <DiscordIcon />
              </a>
              <a href="https://x.com/" target="_blank" rel="noreferrer" aria-label="X (Twitter)">
                <XIcon />
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}

export default App