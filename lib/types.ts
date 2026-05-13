export interface SeriesConfig {
  id: number
  series_number: string
  label: string
  active: boolean
  gpgx_page_id: string | null
  gpgx_monitor: string
  gpgx_page_number: string
  sort_order: number | null
  created_at: string
}

export interface TrancheConfig {
  id: number
  tranche_name: string
  sort_order: number
  active: boolean
}

export interface Price {
  id: number
  series_number: string
  tranche_name: string
  bid: number | null
  ask: number | null
  bid_size: string | null
  ask_size: string | null
  bid_dealer: string | null
  ask_dealer: string | null
  mode: string
  last_trade_px: number | null
  last_trade_time: string | null
  updated_at: string
}

export interface Trade {
  id: number
  series_number: string
  tranche_name: string
  side: 'hit' | 'lift'
  price: number | null
  size: number | null
  dealer: string
  trader_id: string | null
  published_to_bbg: boolean
  bbg_publish_time: string | null
  created_at: string
}

export interface Dealer {
  id: number
  dealer_code: string
  full_name: string | null
  active: boolean
}

export interface Profile {
  id: string
  role: 'trader' | 'dealer'
  dealer_code: string | null
  full_name: string | null
}

export interface AgentHeartbeat {
  id: number
  bbg_connected: boolean
  last_seen: string
}

export interface TradeLogEntry {
  id: number
  time: string
  action: 'HIT' | 'LIFT'
  series: string
  tranche: string
  dealer: string
  price: number | null
  size: number | null
  bbgPublished: boolean
  blotterDone: boolean
}
