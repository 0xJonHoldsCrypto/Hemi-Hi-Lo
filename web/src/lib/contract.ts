// web/src/lib/contract.ts
import {
  BrowserProvider,
  JsonRpcProvider,
  Contract,
  parseUnits,
  formatUnits,
  ethers,
} from 'ethers'
import { MAINNET, TESTNET, type NetworkConfig } from './networks'

// ── RUNTIME NETWORK (default: mainnet) ───────────────────────────
let NET: NetworkConfig = MAINNET
export function setNetwork(cfg: NetworkConfig) { NET = cfg }
export function getNetwork(): NetworkConfig { return NET }

function requireAddress(name: string, val?: string) {
  if (!val || !/^0x[0-9a-fA-F]{40}$/.test(val)) {
    throw new Error(`${name} not set for ${NET.key}`)
  }
  return val
}
function gameAddress() { return requireAddress('GAME', NET.contracts.game) }
function usdcAddress() { return requireAddress('USDC.e', NET.contracts.usdcE) }
function hbkAddress()  { return requireAddress('HBK', NET.contracts.hbk) }

// ── STATE ────────────────────────────────────────────────────────
let injectedProvider: BrowserProvider | null = null
let cachedSigner: ethers.Signer | null = null
let cachedAccount: string | null = null
let cachedUsdcDecimals: number | null = null

// ── ABIs ─────────────────────────────────────────────────────────
const HiLoAbi = [
  // reads
  'function houseEdgeBps() view returns (uint256)',
  'function btcDelay() view returns (uint256)',
  'function owner() view returns (address)',
  'function nextBetId() view returns (uint256)',
  'function bets(uint256) view returns (address player, uint128 wager, uint16 low, uint16 high, uint64 placedAt, uint32 btcHeight, bool settled, bool won, uint16 roll)',
  // extra config reads
  'function paused() view returns (bool)',
  'function maxBet() view returns (uint256)',
  'function maxProfit() view returns (uint256)',

  // writes
  'function placeBet(uint16 low, uint16 high, string playerSeed, uint256 suggestedDelay, uint128 amount) external',
  'function settle(uint256 betId, string playerSeed) external',
  'function setBtcDelay(uint256 d) external',
] as const

const ERC20Abi = [
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
] as const

const HBKAbi = [
  'function getLastHeader() view returns (tuple(uint32 height, bytes32 blockHash, uint32 a, uint32 b, uint32 c, uint32 d, uint32 e, uint32 f))',
  'function getHeaderN(uint32 height) view returns (tuple(uint32 height, bytes32 blockHash, uint32 a, uint32 b, uint32 c, uint32 d, uint32 e, uint32 f))',
] as const

const PlacedEvent =
  'event Placed(uint256 indexed betId, address indexed player, uint128 wager, uint16 low, uint16 high, uint32 btcHeight)'

const GameIface = new ethers.Interface([...HiLoAbi, PlacedEvent])

// ── Types ────────────────────────────────────────────────────────
export type BetView = {
  id: number
  player: string
  wager: bigint
  low: number
  high: number
  placedAt: number
  btcHeight: number
  settled: boolean
  won: boolean
  roll: number
}

export type ConfigView = {
  paused: boolean
  houseEdgeBps: number
  maxBet: bigint
  maxProfit: bigint
  btcDelay: number
  usdcDecimals: number
}

// ── Wallet helpers ───────────────────────────────────────────────
export function hasInjectedWallet(): boolean {
  return typeof (window as any).ethereum !== 'undefined'
}

export async function connectWallet(): Promise<string> {
  if (!hasInjectedWallet()) throw new Error('No wallet detected (install MetaMask/Brave)')
  injectedProvider = new BrowserProvider((window as any).ethereum)
  await injectedProvider.send('eth_requestAccounts', [])
  cachedSigner = await injectedProvider.getSigner()
  cachedAccount = await cachedSigner.getAddress()
  return cachedAccount!
}

export function getConnectedAccount(): string | null { return cachedAccount }

// ── Providers & Contracts (network-aware) ────────────────────────
function getReadProvider() {
  return new JsonRpcProvider(NET.rpcUrl, { chainId: NET.chainIdDec, name: NET.label })
}
function requireSigner(): ethers.Signer {
  if (!cachedSigner) throw new Error('Wallet not connected')
  return cachedSigner
}
function gameWithSigner() { return new Contract(gameAddress(), HiLoAbi, requireSigner()) }
function usdcWithSigner() { return new Contract(usdcAddress(), ERC20Abi, requireSigner()) }
function gameRead()       { return new Contract(gameAddress(), HiLoAbi, injectedProvider ?? getReadProvider()) }
function usdcRead()       { return new Contract(usdcAddress(), ERC20Abi, injectedProvider ?? getReadProvider()) }
function hbkRead()        { return new Contract(hbkAddress(),  HBKAbi, injectedProvider ?? getReadProvider()) }

// ── Network helper ───────────────────────────────────────────────
export async function ensureNetwork43111() {
  const eth = (window as any).ethereum
  if (!eth) throw new Error('No wallet detected')
  const current = await eth.request({ method: 'eth_chainId' })
  if (current === NET.chainIdHex) return
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: NET.chainIdHex }] })
  } catch (e: any) {
    if (e?.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: NET.chainIdHex,
          chainName: NET.label,
          nativeCurrency: { name: 'HEMI', symbol: 'HEMI', decimals: 18 },
          rpcUrls: [NET.rpcUrl],
          blockExplorerUrls: [NET.explorerUrl],
        }],
      })
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: NET.chainIdHex }] })
    } else {
      throw e
    }
  }
}

// ── USDC decimals (cached) ───────────────────────────────────────
async function getUsdcDecimals(): Promise<number> {
  if (cachedUsdcDecimals !== null) return cachedUsdcDecimals
  const dec: number = await usdcRead().decimals()
  cachedUsdcDecimals = dec
  return dec
}

// ── Reads used by UI ─────────────────────────────────────────────
export async function getNextBetId(): Promise<bigint> { return await gameRead().nextBetId() }
export async function getHouseEdgeBps(): Promise<bigint> { return await gameRead().houseEdgeBps() }
export async function getBtcDelay(): Promise<bigint> { return await gameRead().btcDelay() }
export async function getOwner(): Promise<string> { return await gameRead().owner() }

export async function getConfig(): Promise<ConfigView> {
  const [paused, he, maxBet, maxProfit, delay, dec] = await Promise.all([
    gameRead().paused(),
    gameRead().houseEdgeBps(),
    gameRead().maxBet(),
    gameRead().maxProfit(),
    gameRead().btcDelay(),
    getUsdcDecimals(),
  ])
  return {
    paused: Boolean(paused),
    houseEdgeBps: Number(he),
    maxBet: maxBet as bigint,
    maxProfit: maxProfit as bigint,
    btcDelay: Number(delay),
    usdcDecimals: dec,
  }
}

export async function getHBKHeight(): Promise<number> {
  const header: any = await hbkRead().getLastHeader()
  const h = header?.height ?? header?.[0]
  return Number(h)
}

export async function getHBKHeaderN(height: number): Promise<{ height: number } | null> {
  if (!Number.isFinite(height) || height < 0) return null
  try {
    const header: any = await hbkRead().getHeaderN(height)
    const h = header?.height ?? header?.[0]
    if (h === undefined || h === null) return null
    return { height: Number(h) }
  } catch { return null }
}

export async function readBet(betId: number): Promise<BetView> {
  const b: any = await gameRead().bets(betId)
  return {
    id: betId,
    player: b.player ?? b[0],
    wager: b.wager ?? b[1],
    low: Number(b.low ?? b[2]),
    high: Number(b.high ?? b[3]),
    placedAt: Number(b.placedAt ?? b[4]),
    btcHeight: Number(b.btcHeight ?? b[5]),
    settled: Boolean(b.settled ?? b[6]),
    won: Boolean(b.won ?? b[7]),
    roll: Number(b.roll ?? b[8]),
  }
}

export async function readBetOrNull(betId: number): Promise<BetView | null> {
  try {
    const b: any = await gameRead().bets(betId)
    const player = (b.player ?? b[0]) as string
    if (!player || player === '0x0000000000000000000000000000000000000000') return null
    return {
      id: betId,
      player,
      wager: b.wager ?? b[1],
      low: Number(b.low ?? b[2]),
      high: Number(b.high ?? b[3]),
      placedAt: Number(b.placedAt ?? b[4]),
      btcHeight: Number(b.btcHeight ?? b[5]),
      settled: Boolean(b.settled ?? b[6]),
      won: Boolean(b.won ?? b[7]),
      roll: Number(b.roll ?? b[8]),
    }
  } catch { return null }
}

export async function betExists(betId: number): Promise<boolean> {
  const b = await readBetOrNull(betId)
  return !!b
}

export async function getRecentBets(limit = 30, onlyFor?: string): Promise<BetView[]> {
  const next: bigint = await getNextBetId()
  const lastId = Number(next) - 1
  const firstId = Math.max(0, lastId - (limit - 1))
  const out: BetView[] = []
  for (let i = lastId; i >= firstId; i--) {
    const b = await readBetOrNull(i)
    if (!b) continue
    if (!onlyFor || b.player.toLowerCase() === onlyFor.toLowerCase()) out.push(b)
  }
  return out
}

// ── USDC & simulate helpers ──────────────────────────────────────
export async function readUsdcState(owner?: string) {
  const acct = owner || getConnectedAccount()
  if (!acct) throw new Error('No wallet connected')
  const usdc = usdcRead()
  const [dec, bal, alw] = await Promise.all([
    getUsdcDecimals(),
    usdc.balanceOf(acct),
    usdc.allowance(acct, gameAddress()),
  ])
  return { decimals: dec, balance: bal as bigint, allowance: alw as bigint }
}

/** Pure helpers that mirror solidity checks for placeBet */
function calcPotentialPayout(amount: bigint, houseEdgeBps: number, low: number, high: number) {
  const rangeSize = BigInt(high - low + 1)
  return (amount * BigInt(10_000 - houseEdgeBps)) / rangeSize
}

export async function precheckPlace(
  low: number, high: number, amountUSDCe: string
): Promise<{ ok: true } | { ok: false, reason: string }> {
  const cfg = await getConfig()
  if (cfg.paused) return { ok: false, reason: 'paused' }
  if (!(Number.isFinite(low) && Number.isFinite(high))) return { ok: false, reason: 'bad range' }
  if (high < low || high > 9999) return { ok: false, reason: 'bad range' }

  const dec = cfg.usdcDecimals
  const amt = parseUnits(amountUSDCe, dec)

  if (amt <= 0n) return { ok: false, reason: 'bad amount (<=0)' }
  if (amt > cfg.maxBet) {
    return { ok: false, reason: `bad amount (> maxBet ${formatUnits(cfg.maxBet, dec)})` }
  }

  const payout = calcPotentialPayout(amt, cfg.houseEdgeBps, low, high)
  if (payout - amt > cfg.maxProfit) {
    return { ok: false, reason: `profit cap (maxProfit ${formatUnits(cfg.maxProfit, dec)})` }
  }

  return { ok: true }
}

export async function simulatePlace(
  low: number,
  high: number,
  amountUSDCe: string,
  _playerSeed: string,
  _suggestedDelay = 0
): Promise<{ ok: true, variant: 'precheck-only' } | { ok: false, error: string }> {
  const [cfg, usdc] = await Promise.all([getConfig(), readUsdcState()])

  if (cfg.paused) return { ok: false, error: 'paused' }
  if (!(Number.isFinite(low) && Number.isFinite(high))) return { ok: false, error: 'bad range (NaN)' }
  if (high < low || high > 9999 || low < 0) return { ok: false, error: 'bad range' }

  let amt: bigint
  try { amt = parseUnits(amountUSDCe, cfg.usdcDecimals) } catch { return { ok: false, error: 'invalid amount string' } }
  if (amt <= 0n) return { ok: false, error: 'amount must be > 0' }
  if (amt > cfg.maxBet) return { ok: false, error: 'amount > maxBet' }

  const rangeSize = BigInt(high - low + 1)
  const edge = BigInt(10_000 - cfg.houseEdgeBps)
  const payout = (amt * edge) / rangeSize
  const profit = payout > amt ? (payout - amt) : 0n
  if (profit > cfg.maxProfit) return { ok: false, error: 'profit exceeds maxProfit' }

  if (usdc.balance < amt) return { ok: false, error: 'insufficient USDC balance' }
  if (usdc.allowance < amt) return { ok: false, error: 'insufficient allowance' }

  return { ok: true, variant: 'precheck-only' }
}

// ── Allowance & actions ──────────────────────────────────────────
export async function ensureAllowance(amountUSDCe: string) {
  const signer = requireSigner()
  const owner = await signer.getAddress()
  const usdc = usdcWithSigner()
  const dec = await getUsdcDecimals()
  const amount = parseUnits(amountUSDCe, dec)
  const current: bigint = await usdc.allowance(owner, gameAddress())
  if (current < amount) {
    const tx = await usdc.approve(gameAddress(), amount)
    await tx.wait()
  }
}

export async function placeBet(
  low: number,
  high: number,
  amountUSDCe: string,
  playerSeed: string,
  suggestedDelay = 0
) {
  await ensureNetwork43111()
  await ensureAllowance(amountUSDCe)

  const sim = await simulatePlace(low, high, amountUSDCe, playerSeed, suggestedDelay)
  if (!sim.ok) throw new Error(`placeBet precheck failed: ${sim.error}`)

  const game = gameWithSigner()
  const dec = await getUsdcDecimals()
  const amt = parseUnits(amountUSDCe, dec)
  const tx = await game.placeBet(low, high, playerSeed, suggestedDelay, amt)
  return await tx.wait()
}

export async function placeBetAndGetId(
  low: number,
  high: number,
  amountUSDCe: string,
  playerSeed: string,
  suggestedDelay = 0
): Promise<number> {
  await ensureNetwork43111()
  await ensureAllowance(amountUSDCe)
  const game = gameWithSigner()
  const dec = await getUsdcDecimals()
  const amt = parseUnits(amountUSDCe, dec)
  const tx = await game.placeBet(low, high, playerSeed, suggestedDelay, amt)
  const rcpt = await tx.wait()
  for (const log of rcpt.logs) {
    try {
      const parsed = GameIface.parseLog(log)
      if (parsed?.name === 'Placed') return Number(parsed.args.betId)
    } catch {}
  }
  const n = await gameRead().nextBetId()
  return Number(n) - 1
}

export async function settle(betId: number, playerSeed: string) {
  await ensureNetwork43111()
  const game = gameWithSigner()
  const tx = await game.settle(betId, playerSeed)
  return await tx.wait()
}

export async function simulateSettle(betId: number, playerSeed: string): Promise<void> {
  const game = gameWithSigner()
  // @ts-expect-error v6 exposes per-function helpers
  await game.settle.staticCall(betId, playerSeed)
}

export async function setBtcDelay(delay: number) {
  await ensureNetwork43111()
  const game = gameWithSigner()
  const tx = await game.setBtcDelay(delay)
  return await tx.wait()
}
