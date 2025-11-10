// web/src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import './styles.css'
import Slider from './components/Slider'
import RangeSlider from './components/RangeSlider'
import {
  connectWallet,
  placeBet,             // uses resolveSuggestedDelay inside lib
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
  getConfig,           // <-- added
  BetView,
} from './lib/contract'

import { formatUnits } from 'ethers'  // for pretty USDC numbers

// ---- local seed vault (per-bet) -------------------------------
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
  // wager mode + inputs
  const [percent, setPercent] = useState(50)
  const [mode, setMode] = useState<'low' | 'high' | 'custom'>('low')
  const [amount, setAmount] = useState('1')
  const [playerSeed, setPlayerSeed] = useState('') // auto-generate if empty
  const [betId, setBetId] = useState('')          // auto-fill after place

  // wallet
  const [account, setAccount] = useState<string | null>(null)

  // USDC state (for debug/UX)
  const [usdcDecimals, setUsdcDecimals] = useState<number>(6)
  const [usdcBal, setUsdcBal] = useState<bigint>(0n)
  const [usdcAllowance, setUsdcAllowance] = useState<bigint>(0n)

  async function refreshUSDC(owner?: string) {
    try {
      const { decimals, balance, allowance } = await readUsdcState(owner)
      setUsdcDecimals(decimals)
      setUsdcBal(balance)
      setUsdcAllowance(allowance)
    } catch {/* ignore */}
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

  // helper: ensure non-empty seed (also reflect in UI if we generate)
  function ensureSeed(s: string): string {
    const t = (s ?? '').trim()
    if (t.length) return t
    const gen = randomSeedHex()
    setPlayerSeed(gen)
    return gen
  }

  // custom range for dual slider
  const [customLow, setCustomLow] = useState(0)
  const [customHigh, setCustomHigh] = useState(4999)

  // computed bet range
  const { low, high } = useMemo(() => {
    if (mode === 'custom') return { low: customLow, high: customHigh }
    const size = Math.floor(percent * 100) // 0..10000
    if (mode === 'low') return { low: 0, high: Math.max(0, size - 1) }
    return { low: Math.max(0, 10000 - size), high: 9999 }
  }, [mode, percent, customLow, customHigh])

  const impliedMultiplier = useMemo(() => {
    const rangeSize = high - low + 1
    const edgeBps = 100 // 1.00%
    const mult = (10000 - edgeBps) / rangeSize
    return mult.toFixed(4)
  }, [low, high])

  // HBK status (for settle readiness)
  const [hbkHeight, setHbkHeight] = useState<number | null>(null)
  const [targetHeight, setTargetHeight] = useState<number | null>(null)
  const ready = hbkHeight !== null && targetHeight !== null && hbkHeight >= targetHeight

  // extra probes + debug
  const [targetHeaderPresent, setTargetHeaderPresent] = useState<'yes'|'no'|'—'>('—')
  const [lastError, setLastError] = useState<string>('')
  const [debugLine, setDebugLine] = useState<string>('')

  // keep latest btcDelay for display (the lib passes it when sending/simulating)
  const [btcDelayNow, setBtcDelayNow] = useState<number | null>(null)

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

      // auto-fill seed from local storage if present
      const stored = getSeedFor(idRaw)
      if (stored && !playerSeed) setPlayerSeed(stored)

      // reflect betId field if empty
      if (!betId) setBetId(String(idRaw))

      // direct HBK probe: does headerN(target) exist yet?
      if (Number.isFinite(btcHeightNum)) {
        const hdr = await getHBKHeaderN(btcHeightNum)
        setTargetHeaderPresent(hdr ? 'yes' : 'no')
      } else {
        setTargetHeaderPresent('—')
      }

      // debug line
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

    // keep USDC state current for the debug line
    await refreshUSDC(account || undefined)

    // pull full config so we can show *why* it fails (paused/maxBet/maxProfit/edge/delay)
    const cfg = await getConfig()
    setBtcDelayNow(cfg.btcDelay)

    // ensure a seed exists for simulation (doesn't have to match a stored one)
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

  // place & settle
  async function onPlace() {
    try {
      await ensureNetwork43111()

      // get next id BEFORE placing
      const nextId = Number(await getNextBetId())

      // ensure a seed
      const seed = ensureSeed(playerSeed)
      setPlayerSeed(seed)

      // IMPORTANT: lib fetches btcDelay internally
      await placeBet(low, high, amount, seed)

      // persist seed → betId
      saveSeedFor(nextId, seed)

      // update UI + status
      setBetId(String(nextId))
      await Promise.all([
        refreshStatus(nextId),
        refreshUSDC(account || undefined),
      ])
      alert(`Bet #${nextId} placed! It will resolve after the recorded BTC height is available.`)

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
      if (!seed) return alert('Missing player seed (cannot settle without the same seed).')

      await settle(id, seed)
      alert(`Bet #${id} settled (check explorer).`)
      if (account) refreshHistory(account)
      await refreshStatus(id)
      await refreshUSDC(account || undefined)
    } catch (e: any) {
      alert(`Settle failed: ${e?.message || e}`)
    }
  }

  // ---- Auto-settle mode (poll every N seconds) ------------------
  const [autoSettle, setAutoSettle] = useState(true)
  const pollRef = useRef<number | null>(null)
  useEffect(() => {
    if (!autoSettle) { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; return }
    const id = Number(betId)
    if (!Number.isFinite(id) || id < 0) return
    async function tick() {
      await refreshStatus(id)
      if (ready) {
        const seed = getSeedFor(id) || playerSeed
        if (seed) {
          try { await onSettle() } catch {}
        }
      }
    }
    tick()
    const h = window.setInterval(tick, 7_500)
    pollRef.current = h as unknown as number
    return () => { clearInterval(h) }
  }, [autoSettle, betId, playerSeed, ready])

  // ---- Admin (owner) -------------------------------------------
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

  // ---- History (for this wallet) --------------------------------
  const [history, setHistory] = useState<BetView[]>([])
  async function refreshHistory(acct?: string | null) {
    try {
      const me = (acct || account || '').toLowerCase()
      if (!me) return setHistory([])
      const items = await getRecentBets(30, me)
      setHistory(items)
    } catch {}
  }

  // auto refresh history + initial HBK line if we have a bet id
  useEffect(() => { if (account) refreshHistory(account) }, [account])
  useEffect(() => {
    const id = Number(betId)
    if (Number.isFinite(id) && id >= 0) refreshStatus(id)
  }, [betId])

  // keep USDC fresh every 20s when connected
  useEffect(() => {
    if (!account) return
    const h = window.setInterval(() => refreshUSDC(account), 20_000)
    return () => clearInterval(h)
  }, [account])

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6 hemi-dark">
      {/* Test Warning Banner */}
<div className="bg-red-700/90 text-white text-sm md:text-base px-4 py-3 rounded-lg shadow-md text-center mb-4">
  ⚠️ <strong>TEST MODE:</strong> This app is in active testing on the Hemi network.
  Do <u>NOT</u> use unless you are prepared to lose funds. 
  Smart contracts and randomness sources may fail or change at any time.
</div>

            {/* header with Connect */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-hemi">Hemi Hi-Lo (USDC.e)</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={autoSettle} onChange={e => setAutoSettle(e.target.checked)} />
            Auto-settle
          </label>
          {account ? (
            <span className="text-xs text-green-400 truncate max-w-[220px]" title={account}>
              {account}
            </span>
          ) : (
            <button className="btn" onClick={onConnect}>
              {typeof (window as any).ethereum !== 'undefined' ? 'Connect Wallet' : 'No Wallet Detected'}
            </button>
          )}
        </div>
      </div>

      {/* wager card */}
      <div className="card space-y-3">
        <div className="flex gap-2">
          <button className={`btn ${mode === 'low' ? 'ring-2 ring-hemi/60' : ''}`} onClick={() => setMode('low')}>Bottom</button>
          <button className={`btn ${mode === 'high' ? 'ring-2 ring-hemi/60' : ''}`} onClick={() => setMode('high')}>Top</button>
          <button className={`btn ${mode === 'custom' ? 'ring-2 ring-hemi/60' : ''}`} onClick={() => setMode('custom')}>Custom</button>
        </div>

        {mode !== 'custom' && <Slider value={percent} onChange={setPercent} />}

        {mode === 'custom' && (
          <>
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
              }}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 text-sm text-gray-400">Low (0..9999)</label>
                <input
                  className="input w-full"
                  type="number"
                  min={0}
                  max={9999}
                  value={customLow}
                  onChange={e => {
                    const v = parseInt(e.target.value || '0', 10)
                    setCustomLow(Math.max(0, Math.min(9999, Math.min(v, customHigh))))
                  }}
                />
              </div>
              <div>
                <label className="block mb-1 text-sm text-gray-400">High (0..9999)</label>
                <input
                  className="input w-full"
                  type="number"
                  min={0}
                  max={9999}
                  value={customHigh}
                  onChange={e => {
                    const v = parseInt(e.target.value || '0', 10)
                    setCustomHigh(Math.max(0, Math.min(9999, Math.max(v, customLow))))
                  }}
                />
              </div>
            </div>
          </>
        )}

        <div className="text-sm text-gray-400">
          Range: <b>{low}</b> – <b>{high}</b> (size {high - low + 1}) • Implied multiplier ~ <b>{impliedMultiplier}×</b>
        </div>
      </div>

      {/* amount + place */}
      <div className="card grid grid-cols-2 gap-3">
        <div>
          <label className="block mb-1 text-sm text-gray-400">Amount (USDC.e)</label>
          <input className="input w-full" value={amount} onChange={e => setAmount(e.target.value)} />
          <div className="text-xs text-gray-500 mt-1">
            Bal: {formatUnits(usdcBal, usdcDecimals)} • Allow: {formatUnits(usdcAllowance, usdcDecimals)}
          </div>
        </div>
        <div>
          <label className="block mb-1 text-sm text-gray-400">Player seed (optional)</label>
          <input className="input w-full" placeholder="(auto-generated if empty)" value={playerSeed} onChange={e => setPlayerSeed(e.target.value)} />
          <div className="text-xs text-gray-500 mt-1">
            btcDelay now: {btcDelayNow ?? '—'}
          </div>
        </div>
        <div className="col-span-2 flex gap-2">
          <button className="btn flex-1" onClick={onSimulatePlace}>Simulate</button>
          <button className="btn flex-1" onClick={onPlace}>Place Bet</button>
        </div>
      </div>
<div className="text-xs text-gray-500 mt-1">
  Bal: {formatUnits(usdcBal, usdcDecimals)} • Allow: {formatUnits(usdcAllowance, usdcDecimals)}
</div>
<div className="text-[11px] text-gray-500">
  Tip: amount ≤ maxBet & profit ≤ maxProfit, edge=houseEdgeBps. Use “Simulate” to see exact reason if blocked.
</div>
      {/* settle */}
      <div className="card grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="block mb-1 text-sm text-gray-400">Bet ID</label>
          <input className="input w-full" placeholder="(auto)" value={betId} onChange={e => setBetId(e.target.value)} />
        </div>
        <div className="flex items-end gap-2">
          <button className="btn w-full" onClick={() => refreshStatus()}>Refresh</button>
          <button className="btn w-full" onClick={onSimulateSettle}>Simulate</button>
        </div>
        <button className="btn col-span-3" onClick={onSettle} disabled={!ready}>Settle Bet</button>
      </div>

      {/* HBK status */}
      <div className="card space-y-2">
        <div className="text-sm text-gray-400">
          <div>HBK latest height: <b>{hbkHeight ?? '—'}</b></div>
          <div>Bet target height: <b>{targetHeight ?? '—'}</b></div>
          <div>Target header present: <b>{targetHeaderPresent}</b></div>
          <div>Status: <b className={ready ? 'text-green-400' : 'text-amber-400'}>{ready ? 'Ready to settle' : 'Waiting for header'}</b></div>
          {lastError && <div className="text-red-400 break-all mt-1">debug: {lastError}</div>}
        </div>
        <pre className="text-xs text-gray-500 overflow-x-auto">{debugLine}</pre>
      </div>

      {/* Admin (owner-only) */}
      {isOwner && (
        <div className="card space-y-3">
          <div className="text-sm text-gray-400">
            <div>Owner: <b className="break-all">{ownerAddr}</b></div>
            <div>Current btcDelay: <b>{currentDelay}</b></div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
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
          <button className="btn" onClick={() => { setDelayInput('1'); }}>Quick set to 1 (fast local test)</button>
        </div>
      )}

      {/* Your Recent Bets */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Your Recent Bets</h2>
          <button className="btn" onClick={() => refreshHistory(account)}>Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm w-full">
            <thead className="text-gray-400">
              <tr>
                <th className="text-left py-1">ID</th>
                <th className="text-left py-1">Range</th>
                <th className="text-left py-1">Wager</th>
                <th className="text-left py-1">BTC Height</th>
                <th className="text-left py-1">Roll</th>
                <th className="text-left py-1">Result</th>
                <th className="text-left py-1"></th>
              </tr>
            </thead>
            <tbody>
              {history.map(b => {
                const btcH = b.btcHeight != null ? Number(b.btcHeight) : 0
                const isReady = hbkHeight != null && btcH > 0 && hbkHeight >= btcH
                const result = b.settled ? (b.won ? 'WIN' : 'LOSE') : (isReady ? 'Ready' : 'Pending')
                return (
                  <tr key={b.id} className="border-t border-white/5">
                    <td className="py-1">{b.id}</td>
                    <td className="py-1">{b.low}–{b.high}</td>
                    <td className="py-1">{String(b.wager)}</td>
                    <td className="py-1">{b.btcHeight ?? '—'}</td>
                    <td className="py-1">{b.settled ? b.roll : '—'}</td>
                    <td className={`py-1 ${b.settled ? (b.won ? 'text-green-400' : 'text-rose-400') : (isReady ? 'text-green-300' : 'text-amber-300')}`}>
                      {result}
                    </td>
                    <td className="py-1">
                      {!b.settled && (
                        <button
                          className="btn btn-xs"
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

      <p className="text-xs text-gray-500">
        Provably-fair: RNG = keccak256(BTC block hash @ recorded height, serverSeedReveal, playerSeed, betId)
      </p>
    </div>
  )
}

export default App
