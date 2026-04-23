"""
Supabase realtime listener.
Subscribes to prices and trades tables. Triggers BBG publish on changes.
Reconnects automatically with exponential backoff.
"""

import os
import time
import logging
import threading
from dotenv import load_dotenv

load_dotenv('agent_config.env')
logger = logging.getLogger('supabase_listener')


class SupabaseListener:
    def __init__(self, publisher):
        self.publisher = publisher
        self.connected = False
        self._supabase = None
        self._channel_prices = None
        self._channel_trades = None
        self._stop_event = threading.Event()
        self._retry_delay = 2
        self._max_retry_delay = 60

    def _init_client(self):
        from supabase import create_client
        url = os.getenv('SUPABASE_URL', '')
        key = os.getenv('SUPABASE_KEY', '')
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in agent_config.env")
        self._supabase = create_client(url, key)
        logger.info("Supabase client initialized")

    def start(self):
        while not self._stop_event.is_set():
            try:
                self._init_client()
                self._subscribe()
                self.connected = True
                self._retry_delay = 2
                logger.info("Supabase realtime connected")
                # Keep alive — the realtime subscription runs via async internals
                while not self._stop_event.is_set():
                    time.sleep(30)
                    # Heartbeat: just poll for disconnection
                    if not self.connected:
                        break
            except Exception as e:
                logger.error(f"Supabase listener error: {e}. Retrying in {self._retry_delay}s...")
                self.connected = False
                time.sleep(self._retry_delay)
                self._retry_delay = min(self._retry_delay * 2, self._max_retry_delay)

    def _subscribe(self):
        # Prices: listen for all changes
        self._channel_prices = (
            self._supabase
            .channel('prices-changes')
            .on(
                'postgres_changes',
                event='*',
                schema='public',
                table='prices',
                callback=self._on_prices_change
            )
            .subscribe()
        )

        # Trades: listen for inserts (hit/lift events)
        self._channel_trades = (
            self._supabase
            .channel('trades-inserts')
            .on(
                'postgres_changes',
                event='INSERT',
                schema='public',
                table='trades',
                callback=self._on_trade_insert
            )
            .subscribe()
        )

        logger.info("Subscribed to prices and trades realtime channels")

    def _on_prices_change(self, payload):
        try:
            record = payload.get('new', {})
            series_number = record.get('series_number')
            if not series_number:
                return

            logger.info(f"Prices change for CMBX.{series_number}.{record.get('tranche_name')}")

            # Fetch full price page for this series
            result = self._supabase.table('prices').select('*').eq('series_number', series_number).execute()
            prices_list = result.data if result.data else []
            self.publisher.publish_prices(prices_list, series_number)

        except Exception as e:
            logger.error(f"Error handling prices change: {e}")

    def _on_trade_insert(self, payload):
        try:
            record = payload.get('new', {})
            logger.info(f"Trade insert: {record}")
            self.publisher.publish_trade(record)
        except Exception as e:
            logger.error(f"Error handling trade insert: {e}")

    def stop(self):
        self._stop_event.set()
        self.connected = False
        if self._supabase and self._channel_prices:
            try:
                self._supabase.remove_channel(self._channel_prices)
                self._supabase.remove_channel(self._channel_trades)
            except Exception:
                pass
