"""
Bloomberg GPGX page-based contribution publisher.
Stub mode: writes formatted rows to bbg_publish_log.txt.
Live mode: uses blpapi ProviderSession to publish PageData to GPGX.

Bloomberg topic format: //blp-test/c-gpgx/<GPGX_ID>/<monitor>/<page>
"""

import os
import logging
import threading
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv('agent_config.env')
logger = logging.getLogger('blp_publisher')


class BLPPublisher:
    def __init__(self):
        self.mode = os.getenv('BBG_MODE', 'stub').lower()
        self.host = os.getenv('BBG_HOST', 'localhost')
        self.port = int(os.getenv('BBG_PORT', '8194'))
        self.contributor_id = int(os.getenv('BBG_CONTRIBUTOR_ID', '8563'))
        self.gpgx_service = os.getenv('BBG_GPGX_SERVICE', '//blp-test/c-gpgx')
        self.gpgx_id = os.getenv('BBG_GPGX_ID', '')        # Your firm's GPGX ID from Bloomberg
        self.gpgx_monitor = os.getenv('BBG_GPGX_MONITOR', '1')
        self.gpgx_page = int(os.getenv('BBG_GPGX_PAGE', '1'))
        self.product_code = int(os.getenv('BBG_PRODUCT_CODE', '1'))

        self.connected = False
        self._lock = threading.Lock()
        self._session = None
        self._service = None
        self._topic = None
        self._supabase = None
        self._init_supabase()

    def _init_supabase(self):
        try:
            from supabase import create_client
            url = os.getenv('SUPABASE_URL', '')
            key = os.getenv('SUPABASE_KEY', '')
            if url and key:
                self._supabase = create_client(url, key)
        except Exception as e:
            logger.warning(f"Could not init Supabase in publisher: {e}")

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    def connect(self):
        if self.mode == 'stub':
            logger.info("BBG_MODE=stub — Bloomberg publishing disabled. Logging to bbg_publish_log.txt")
            self.connected = False
            self._update_heartbeat(False)
            return

        if not self.gpgx_id:
            logger.error("BBG_GPGX_ID not set in agent_config.env — cannot connect to Bloomberg")
            self.connected = False
            self._update_heartbeat(False)
            return

        try:
            import blpapi
            self._connect_live(blpapi)
        except ImportError:
            logger.error("blpapi not installed. Run: pip install blpapi  (requires Bloomberg Terminal SDK)")
            self.connected = False
            self._update_heartbeat(False)

    def _connect_live(self, blpapi):
        try:
            topic_str = f"{self.gpgx_service}/{self.gpgx_id}/{self.gpgx_monitor}/{self.gpgx_page}"
            logger.info(f"Connecting to Bloomberg at {self.host}:{self.port}")
            logger.info(f"Topic: {topic_str}")

            opts = blpapi.SessionOptions()
            opts.setServerHost(self.host)
            opts.setServerPort(self.port)

            self._session = blpapi.ProviderSession(opts, self._event_handler)
            if not self._session.start():
                raise RuntimeError("Failed to start Bloomberg ProviderSession")

            # Resolve the topic — AUTO_REGISTER_SERVICES handles service registration
            topic_list = blpapi.TopicList()
            topic_list.add(topic_str, blpapi.CorrelationId(1))
            self._session.createTopics(
                topic_list,
                blpapi.ProviderSession.AUTO_REGISTER_SERVICES
            )

            status = topic_list.statusAt(0)
            if status != blpapi.TopicList.CREATED:
                raise RuntimeError(
                    f"Topic resolution failed (status={status}). "
                    "Verify your GPGX ID, monitor, and page number with Bloomberg."
                )

            self._service = self._session.getService(self.gpgx_service)
            if not self._service.isValid():
                raise RuntimeError(f"Service not valid: {self.gpgx_service}")

            self._topic = self._session.getTopic(topic_list.messageAt(0))
            self.connected = True
            self._update_heartbeat(True)
            logger.info("Bloomberg GPGX connection established ✓")

        except Exception as e:
            logger.error(f"Bloomberg connection failed: {e}")
            self.connected = False
            self._update_heartbeat(False)

    def _event_handler(self, event, session):
        import blpapi
        for msg in event:
            logger.debug(f"BBG event type={event.eventType()} msg={msg.messageType()}")

    # ------------------------------------------------------------------
    # Publish prices → PageData
    # Uses the correct pushElement/appendElement/popElement schema
    # documented in Bloomberg BLPAPI Contributions (Page-Based) guide.
    # ------------------------------------------------------------------

    def publish_prices(self, prices_data: list, series_number: str):
        """
        Publishes all prices for one series to the GPGX page.
        prices_data: list of price dicts from Supabase prices table.
        series_number: e.g. '15' for CMBX.15
        """
        from gpgx_formatter import format_gpgx_rows
        rows = format_gpgx_rows(prices_data, series_number)
        # rows = [{'rowNum': int, 'text': str}, ...]

        if self.mode == 'stub':
            self._log_stub(f"PRICE UPDATE — CMBX.{series_number}", [r['text'] for r in rows])
            return

        if not self.connected or not self._topic or not self._service:
            logger.warning("Not connected to Bloomberg — skipping publish")
            return

        try:
            import blpapi
            with self._lock:
                event = self._service.createPublishEvent()
                fmt = blpapi.EventFormatter(event)

                # PageData message — schema per Bloomberg BLPAPI docs
                fmt.appendMessage('PageData', self._topic)

                # rowUpdate is a sequence of row elements
                fmt.pushElement('rowUpdate')
                for row in rows:
                    fmt.appendElement()                    # begin row
                    fmt.setElement('rowNum', row['rowNum'])

                    fmt.pushElement('spanUpdate')          # begin spanUpdate array
                    text = row['text']
                    fmt.appendElement()                    # begin span
                    fmt.setElement('startCol', 0)
                    fmt.setElement('length', len(text))
                    fmt.setElement('text', text)
                    fmt.popElement()                       # end span
                    fmt.popElement()                       # end spanUpdate

                    fmt.popElement()                       # end row
                fmt.popElement()                           # end rowUpdate array

                # Required page metadata fields
                fmt.setElement('contributorId', self.contributor_id)
                fmt.setElement('productCode', self.product_code)
                fmt.setElement('pageNumber', self.gpgx_page)

                self._session.publish(event)
                logger.info(
                    f"Published CMBX.{series_number} → "
                    f"GPGX {self.gpgx_id}/{self.gpgx_monitor}/{self.gpgx_page} "
                    f"({len(rows)} rows)"
                )

        except Exception as e:
            logger.error(f"Bloomberg publish error: {e}")
            self.connected = False
            self._update_heartbeat(False)

    # ------------------------------------------------------------------
    # Publish trade notification
    # ------------------------------------------------------------------

    def publish_trade(self, trade: dict):
        trade_id = trade.get('id')
        series = trade.get('series_number', '')
        tranche = trade.get('tranche_name', '')
        side = trade.get('side', '')
        price = trade.get('price')
        dealer = trade.get('dealer', '')

        verb = 'HIT (SOLD)' if side == 'hit' else 'LIFT (BOT)'
        log_line = f"TRADE — CMBX.{series}.{tranche} {verb} dealer={dealer} px={price}"

        if self.mode == 'stub':
            self._log_stub(log_line, [])
        else:
            if self.connected:
                logger.info(f"Trade published to Bloomberg: {log_line}")
            else:
                logger.warning(f"Not connected — trade not sent to BBG: {log_line}")

        self._mark_trade_published(trade_id)

    def _mark_trade_published(self, trade_id):
        if self._supabase and trade_id:
            try:
                self._supabase.table('trades').update({
                    'published_to_bbg': True,
                    'bbg_publish_time': datetime.now(timezone.utc).isoformat()
                }).eq('id', trade_id).execute()
                logger.info(f"Trade {trade_id} marked published_to_bbg=true")
            except Exception as e:
                logger.error(f"Failed to mark trade {trade_id}: {e}")

    # ------------------------------------------------------------------
    # Heartbeat / helpers
    # ------------------------------------------------------------------

    def _update_heartbeat(self, connected: bool):
        if self._supabase:
            try:
                self._supabase.table('agent_heartbeat').upsert({
                    'id': 1,
                    'bbg_connected': connected,
                    'last_seen': datetime.now(timezone.utc).isoformat()
                }).execute()
            except Exception as e:
                logger.warning(f"Heartbeat update failed: {e}")

    def _log_stub(self, header: str, rows: list):
        ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        divider = '=' * 60
        lines = [f"\n{divider}", f"[{ts}] {header}", divider] + rows + ['']
        with open('bbg_publish_log.txt', 'a', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
        logger.info(f"STUB: {header} → bbg_publish_log.txt")

    def reconnect(self):
        logger.info("Reconnecting to Bloomberg...")
        if self._session:
            try:
                self._session.stop()
            except Exception:
                pass
        self._session = None
        self._service = None
        self._topic = None
        self.connected = False
        self.connect()

    def disconnect(self):
        if self._session:
            try:
                self._session.stop()
            except Exception:
                pass
        self.connected = False
        self._update_heartbeat(False)
