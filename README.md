# Hemi Hi‑Lo (USDC.e)

Provably-fair range (Hi‑Lo/Dice) betting on Hemi using BTC block hashes via Hemi's Bitcoin Kit (hBK).

RNG = keccak256(BTC block hash @ recorded height, serverSeedReveal, playerSeed, betId)


## Prereqs
- Node 18+
- Foundry (forge, cast): https://book.getfoundry.sh/


## Setup
```bash
# root
cp .env.example .env
# fill .env with RPC & addresses


# contracts
cd contracts
forge install foundry-rs/forge-std
forge build