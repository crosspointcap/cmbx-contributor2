"""
System tray application for CMBX Contributor Bloomberg Agent.
Shows status icon and context menu. Runs in main thread.
"""

import os
import subprocess
import webbrowser
import logging
import threading
from PIL import Image, ImageDraw
import pystray
from pystray import MenuItem as item

logger = logging.getLogger('tray_app')

PORTAL_URL = os.getenv('PORTAL_URL', 'https://your-vercel-app.vercel.app')


def _make_icon(color: str) -> Image.Image:
    """Create a simple circle icon image."""
    size = 64
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    margin = 6
    draw.ellipse([margin, margin, size - margin, size - margin], fill=color)
    return img


ICON_GREEN = _make_icon('#66ff88')
ICON_RED = _make_icon('#ff6666')
ICON_AMBER = _make_icon('#f0c040')


class TrayApp:
    def __init__(self, publisher, listener):
        self.publisher = publisher
        self.listener = listener
        self._icon = None

    def _get_bbg_status(self) -> str:
        mode = os.getenv('BBG_MODE', 'stub').lower()
        if mode == 'stub':
            return 'STUB MODE'
        return 'CONNECTED' if self.publisher.connected else 'DISCONNECTED'

    def _get_db_status(self) -> str:
        return 'CONNECTED' if self.listener.connected else 'DISCONNECTED'

    def _get_icon_image(self) -> Image.Image:
        mode = os.getenv('BBG_MODE', 'stub').lower()
        if mode == 'stub':
            return ICON_RED
        if self.publisher.connected:
            return ICON_GREEN
        return ICON_RED

    def _get_tooltip(self) -> str:
        return f"CMBX Contributor | BBG: {self._get_bbg_status()} | DB: {self._get_db_status()}"

    def _open_portal(self, icon, item_):
        webbrowser.open(PORTAL_URL)

    def _open_log(self, icon, item_):
        log_path = os.path.abspath('bbg_publish_log.txt')
        if not os.path.exists(log_path):
            with open(log_path, 'w') as f:
                f.write('CMBX Contributor Bloomberg Publish Log\n')
        subprocess.Popen(['notepad.exe', log_path])

    def _restart_bbg(self, icon, item_):
        logger.info("User requested Bloomberg reconnect from tray menu")
        threading.Thread(target=self.publisher.reconnect, daemon=True).start()

    def _exit(self, icon, item_):
        logger.info("Exit requested from tray menu")
        self.publisher.disconnect()
        self.listener.stop()
        icon.stop()

    def _build_menu(self):
        return pystray.Menu(
            item('CMBX Contributor — Active', None, enabled=False),
            pystray.Menu.SEPARATOR,
            item(lambda text: f'Bloomberg: {self._get_bbg_status()}', None, enabled=False),
            item(lambda text: f'Supabase: {self._get_db_status()}', None, enabled=False),
            pystray.Menu.SEPARATOR,
            item('Open Web Portal', self._open_portal),
            item('View Publish Log', self._open_log),
            item('Restart Bloomberg Connection', self._restart_bbg),
            pystray.Menu.SEPARATOR,
            item('Exit', self._exit),
        )

    def _update_icon_loop(self):
        """Periodically update icon to reflect current status."""
        import time
        while True:
            time.sleep(5)
            if self._icon:
                try:
                    self._icon.icon = self._get_icon_image()
                    self._icon.title = self._get_tooltip()
                except Exception:
                    pass

    def run(self):
        icon_img = self._get_icon_image()
        self._icon = pystray.Icon(
            'cmbx_contributor',
            icon_img,
            title=self._get_tooltip(),
            menu=self._build_menu()
        )

        # Start icon update thread
        threading.Thread(target=self._update_icon_loop, daemon=True, name='tray-updater').start()

        logger.info("System tray running")
        self._icon.run()
