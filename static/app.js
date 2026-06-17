/* ===================================================
   BigQuery Release Notes — app.js
   =================================================== */

"use strict";

// ——— State ———
let allEntries = [];
let activeFilter = "all";
let tweetText   = "";

// ——— DOM refs ———
const refreshBtn   = document.getElementById("refreshBtn");
const spinnerIcon  = document.getElementById("spinnerIcon");
const feedMetaEl   = document.getElementById("feedMeta");
const skeletonGrid = document.getElementById("skeletonGrid");
const cardsGrid    = document.getElementById("cardsGrid");
const errorBox     = document.getElementById("errorBox");
const errorMsg     = document.getElementById("errorMsg");
const filterBar    = document.getElementById("filterBar");
const chipGroup    = document.getElementById("chipGroup");
const searchInput  = document.getElementById("searchInput");
const noResults    = document.getElementById("noResults");
const tweetModal   = document.getElementById("tweetModal");
const tweetTextarea= document.getElementById("tweetTextarea");
const charCount    = document.getElementById("charCount");
const charRingFill = document.getElementById("charRingFill");

// ——— Category tag detection ———
const CATEGORY_PATTERNS = [
  { key: "feature",      label: "Feature",      pattern: /<h3[^>]*>\s*Feature\s*<\/h3>/i },
  { key: "announcement", label: "Announcement",  pattern: /<h3[^>]*>\s*Announcement\s*<\/h3>/i },
  { key: "issue",        label: "Issue",         pattern: /<h3[^>]*>\s*Issue\s*<\/h3>/i },
  { key: "deprecation",  label: "Deprecation",   pattern: /<h3[^>]*>\s*Deprecation\s*<\/h3>/i },
  { key: "fix",          label: "Fix",           pattern: /<h3[^>]*>\s*Fix\s*<\/h3>/i },
  { key: "changed",      label: "Changed",       pattern: /<h3[^>]*>\s*Changed\s*<\/h3>/i },
];

function getCategories(html) {
  return CATEGORY_PATTERNS.filter(c => c.pattern.test(html)).map(c => c.key);
}

// ——— Helpers ———
function formatDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function relativeDate(isoString) {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30)  return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ——— Fetch ———
async function loadReleases() {
  setLoading(true);
  hideAll();
  skeletonGrid.style.display = "grid";

  try {
    const res  = await fetch("/api/releases");
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Unknown error");

    allEntries = json.data.entries;
    const updated = json.data.feed_updated;

    feedMetaEl.textContent = updated
      ? `Last updated: ${formatDate(updated)}`
      : "";

    buildChips();
    renderCards();
    filterBar.style.display = "block";
  } catch (err) {
    hideAll();
    errorBox.style.display = "flex";
    errorMsg.textContent   = err.message;
  } finally {
    setLoading(false);
    skeletonGrid.style.display = "none";
  }
}

function setLoading(val) {
  refreshBtn.disabled = val;
  if (val) {
    refreshBtn.classList.add("spinning");
  } else {
    refreshBtn.classList.remove("spinning");
  }
}

function hideAll() {
  skeletonGrid.style.display = "none";
  cardsGrid.style.display    = "none";
  errorBox.style.display     = "none";
  noResults.style.display    = "none";
}

// ——— Chips ———
function buildChips() {
  const counts = { all: allEntries.length };
  allEntries.forEach(e => {
    getCategories(e.html_content).forEach(k => {
      counts[k] = (counts[k] || 0) + 1;
    });
  });

  const orderedKeys = ["all", ...CATEGORY_PATTERNS.map(c => c.key).filter(k => counts[k])];
  chipGroup.innerHTML = orderedKeys.map(k => {
    const label = k === "all" ? "All" : CATEGORY_PATTERNS.find(c => c.key === k)?.label || k;
    return `<button class="chip${k === activeFilter ? " active" : ""}" data-key="${k}" onclick="setFilter('${k}')">${label} <span style="opacity:.6">${counts[k] || 0}</span></button>`;
  }).join("");
}

function setFilter(key) {
  activeFilter = key;
  document.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.key === key));
  renderCards();
}

// ——— Render ———
function filterCards() {
  renderCards();
}

function renderCards() {
  const query = (searchInput.value || "").toLowerCase();
  const filtered = allEntries.filter(e => {
    const matchesFilter = activeFilter === "all" || getCategories(e.html_content).includes(activeFilter);
    const matchesSearch = !query ||
      e.title.toLowerCase().includes(query) ||
      stripHtmlSimple(e.html_content).toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  hideAll();

  if (filtered.length === 0) {
    noResults.style.display = "flex";
    return;
  }

  cardsGrid.innerHTML = filtered.map((e, idx) => buildCard(e, idx)).join("");
  cardsGrid.style.display = "grid";

  // Stagger animation
  cardsGrid.querySelectorAll(".card").forEach((el, i) => {
    el.style.opacity    = "0";
    el.style.transform  = "translateY(16px)";
    el.style.transition = `opacity .3s ease ${i * 40}ms, transform .3s ease ${i * 40}ms, border-color .2s ease, box-shadow .2s ease`;
    requestAnimationFrame(() => {
      el.style.opacity   = "1";
      el.style.transform = "translateY(0)";
    });
  });
}

function buildCard(entry, idx) {
  const cats = getCategories(entry.html_content);
  const tagsHtml = cats.length
    ? cats.map(k => {
        const info = CATEGORY_PATTERNS.find(c => c.key === k);
        return `<span class="tag tag-${k}">${info ? info.label : k}</span>`;
      }).join("")
    : `<span class="tag tag-other">Update</span>`;

  const encodedTweet = encodeURIComponent(entry.tweet_text);
  const relDate = relativeDate(entry.updated);

  return `
  <article class="card" id="card-${idx}">
    <div class="card-header">
      <div>
        <div class="card-date">${escHtml(entry.title)}</div>
        ${relDate ? `<div class="card-date-sub">${relDate}</div>` : ""}
      </div>
      <a href="${escHtml(entry.link)}" target="_blank" rel="noopener noreferrer" class="card-link-btn" title="View on Google Cloud docs">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        Docs
      </a>
    </div>
    <div class="card-tags">${tagsHtml}</div>
    <div class="card-content" id="content-${idx}">${entry.html_content}</div>
    <div class="card-actions">
      <button class="expand-btn" id="expand-${idx}" onclick="toggleExpand(${idx})">Show more</button>
      <span class="spacer"></span>
      <button class="tweet-btn" onclick="openTweetModal(${idx})" title="Tweet this update">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.732-8.84L1.254 2.25H8.08l4.271 5.647 5.893-5.647Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"/>
        </svg>
        Tweet this
      </button>
    </div>
  </article>`;
}

// ——— Expand/collapse ———
function toggleExpand(idx) {
  const contentEl = document.getElementById(`content-${idx}`);
  const expandBtn = document.getElementById(`expand-${idx}`);
  const isExpanded = contentEl.classList.contains("expanded");
  contentEl.classList.toggle("expanded", !isExpanded);
  expandBtn.textContent = isExpanded ? "Show more" : "Show less";
}

// ——— Tweet modal ———
function openTweetModal(idx) {
  const entry = getVisibleEntries()[idx];
  if (!entry) return;
  tweetText = entry.tweet_text;
  tweetTextarea.value = tweetText;
  updateCharCount();
  tweetModal.style.display = "flex";
  requestAnimationFrame(() => tweetTextarea.focus());
}

function getVisibleEntries() {
  const query = (searchInput.value || "").toLowerCase();
  return allEntries.filter(e => {
    const matchesFilter = activeFilter === "all" || getCategories(e.html_content).includes(activeFilter);
    const matchesSearch = !query ||
      e.title.toLowerCase().includes(query) ||
      stripHtmlSimple(e.html_content).toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });
}

function closeTweetModal() {
  tweetModal.style.display = "none";
}

function openTwitter() {
  const text = encodeURIComponent(tweetTextarea.value.trim());
  window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank", "noopener,noreferrer");
}

function updateCharCount() {
  const len = tweetTextarea.value.length;
  const max = 280;
  const remaining = max - len;
  charCount.textContent = remaining;

  // Ring progress
  const circumference = 2 * Math.PI * 15; // r=15 → ~94.2
  const filled = (len / max) * circumference;
  charRingFill.setAttribute("stroke-dasharray", `${filled} ${circumference}`);

  // Color shift near limit
  if (remaining < 0) {
    charRingFill.style.stroke = "#ef4444";
    charCount.style.color     = "#ef4444";
  } else if (remaining < 20) {
    charRingFill.style.stroke = "#f59e0b";
    charCount.style.color     = "#f59e0b";
  } else {
    charRingFill.style.stroke = "var(--blue-500)";
    charCount.style.color     = "var(--text-2)";
  }
}

// Close modal on overlay click
tweetModal.addEventListener("click", function(e) {
  if (e.target === tweetModal) closeTweetModal();
});

// Close modal on Escape
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape" && tweetModal.style.display !== "none") closeTweetModal();
});

// ——— Utilities ———
function escHtml(str) {
  return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function stripHtmlSimple(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ——— Bootstrap ———
loadReleases();
