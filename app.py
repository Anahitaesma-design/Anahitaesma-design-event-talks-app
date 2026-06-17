import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template
import urllib.request
import re
from html.parser import HTMLParser

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
ATOM_NS = "http://www.w3.org/2005/Atom"


class MLStripper(HTMLParser):
    """Simple HTML tag stripper for plain-text tweet generation."""
    def __init__(self):
        super().__init__()
        self.reset()
        self.fed = []

    def handle_data(self, d):
        self.fed.append(d)

    def get_data(self):
        return " ".join(self.fed)


def strip_html(html: str) -> str:
    s = MLStripper()
    s.feed(html)
    raw = s.get_data()
    # Collapse whitespace
    return re.sub(r"\s+", " ", raw).strip()


def fetch_entries():
    req = urllib.request.Request(FEED_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as response:
        raw = response.read()

    root = ET.fromstring(raw)
    feed_updated = root.findtext(f"{{{ATOM_NS}}}updated", "")

    entries = []
    for entry in root.findall(f"{{{ATOM_NS}}}entry"):
        title = entry.findtext(f"{{{ATOM_NS}}}title", "")
        updated = entry.findtext(f"{{{ATOM_NS}}}updated", "")
        link_el = entry.find(f"{{{ATOM_NS}}}link[@rel='alternate']")
        link = link_el.get("href", "") if link_el is not None else ""
        content_el = entry.find(f"{{{ATOM_NS}}}content")
        html_content = content_el.text if content_el is not None else ""

        # Build a short plain-text summary for tweet composition
        plain = strip_html(html_content or "")
        tweet_text = f"📢 BigQuery Update – {title}: {plain}"
        # Twitter/X limit is 280 chars; leave room for the URL
        max_len = 280 - len(link) - 2  # 2 for space + newline
        if len(tweet_text) > max_len:
            tweet_text = tweet_text[: max_len - 3] + "..."
        tweet_text += f"\n{link}"

        entries.append(
            {
                "title": title,
                "updated": updated,
                "link": link,
                "html_content": html_content,
                "tweet_text": tweet_text,
            }
        )

    return {"feed_updated": feed_updated, "entries": entries}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/releases")
def releases():
    try:
        data = fetch_entries()
        return jsonify({"ok": True, "data": data})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
