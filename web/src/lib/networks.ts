// web/src/lib/networks.ts
export type NetworkConfig = {
  key: 'mainnet' | 'testnet'
  label: string
  chainIdDec: number
  chainIdHex: string
  rpcUrl: string
  explorerUrl: string
  contracts: {
    game?: string   // optional – you may not have testnet game yet
    usdcE: string
    hbk: string
  }
}

// Pull from env for mainnet so current deploy functions
export const MAINNET: NetworkConfig = {
  key: 'mainnet',
  label: 'Hemi Mainnet',
  chainIdDec: 43111,
  chainIdHex: '0xA867',
  rpcUrl: import.meta.env.VITE_RPC_URL!,
  explorerUrl: import.meta.env.VITE_EXPLORER_URL || 'https://explorer.hemi.xyz',
  contracts: {
    game: import.meta.env.VITE_CONTRACT_ADDRESS,                  // your deployed game
    usdcE: import.meta.env.VITE_USDC_E_ADDRESS!,                  // canonical USDC.e
    hbk:   import.meta.env.VITE_HBK_ADDRESS!,                     // HBK (mainnet)
  },
}

// ✳️ Fill in correct testnet values once Hemi publishes them
export const TESTNET: NetworkConfig = {
  key: 'testnet',
  label: 'Hemi Testnet',
  chainIdDec: 743111,                 
  chainIdHex: '0xb56c7',             
  rpcUrl: import.meta.env.VITE_TESTNET_RPC_URL || 'https://testnet.rpc.hemi.network/rpc',
  explorerUrl: import.meta.env.VITE_TESTNET_EXPLORER_URL || 'https://testnet.explorer.hemi.xyz/',
  contracts: {
    game: import.meta.env.VITE_TESTNET_CONTRACT_ADDRESS || '',    // optional/unset for now
    usdcE: import.meta.env.VITE_TESTNET_USDC_E_ADDRESS || '0xD47971C7F5B1067d25cd45d30b2c9eb60de96443',
    hbk:   import.meta.env.VITE_TESTNET_HBK_ADDRESS || '0xeC9fa5daC1118963933e1A675a4EEA0009b7f215',
  },
}

export const NETWORKS = { mainnet: MAINNET, testnet: TESTNET }
export type NetworkKey = keyof typeof NETWORKS
