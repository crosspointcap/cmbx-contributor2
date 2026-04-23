"""
CMBX Contributor Bloomberg Agent
Main entry point — starts Supabase listener, BBG publisher, and system tray.
"""

import threading
import logging
import sys
import os
from dotenv import load_dotenv

load_dotenv('agent_config.env')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('agent.log'),
    ]
)
logger = logging.getLogger('agent')


def main():
    from blp_publisher import BLPPublisher
    from supabase_listener import SupabaseListener
    from tray_app import TrayApp

    logger.info("Starting CMBX Contributor Bloomberg Agent")
    logger.info(f"BBG_MODE: {os.getenv('BBG_MODE', 'stub')}")

    publisher = BLPPublisher()
    listener = SupabaseListener(publisher)
    tray = TrayApp(publisher, listener)

    # Start listener in background thread
    listener_thread = threading.Thread(target=listener.start, daemon=True, name='supabase-listener')
    listener_thread.start()

    # Start publisher connection in background thread
    publisher_thread = threading.Thread(target=publisher.connect, daemon=True, name='blp-publisher')
    publisher_thread.start()

    logger.info("All components started. Running system tray (main thread).")
    # Tray runs in main thread (required on Windows)
    tray.run()


if __name__ == '__main__':
    main()
