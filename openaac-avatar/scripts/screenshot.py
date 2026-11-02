"""Screenshot an HTML file (full page) with the pre-installed Chromium. Dev helper for visual checks."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

src, out = Path(sys.argv[1]).resolve(), sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 960
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": width, "height": 400})
    pg.goto(src.as_uri())
    pg.wait_for_timeout(300)
    pg.screenshot(path=out, full_page=True)
    b.close()
