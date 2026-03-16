// ============================================
// CENTRINSIC NPT NEWS APP - FULLY UPDATED
// Share: screenshot card with html2canvas
// 4 Tabs: AI-S | AI-D | 60 Sec | Current Affairs
// ============================================

const API_BASE     = "https://centrinsicnpt.com";
const API_ARTICLES = `${API_BASE}/api/articles`;
const API_SAVE_EMAIL = `${API_BASE}/api/save-email`;

console.log("🔌 API Base:", API_BASE);

let currentUser    = null;
let currentArticle = null;
let isOnline       = false;
let toastTimeout   = null;
let articlesCache  = new Map();
let lastUpdatedTime = null;
let allArticles    = [];
let currentTab     = 'gnews';

// ── TRANSLATE STATE ──────────────────────────
let originalArticleContent = null; // { body: '', title: '' }

/* ============================================
   INITIALIZATION
============================================ */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

function initApp() {
    if (window.appInitialized) return;
    window.appInitialized = true;
    console.log("🚀 Centrinsic NPT News App Starting...");
    initializeApp();
    exportAllFunctions();
    setTimeout(setupAllEventListeners, 100);
}

function initializeApp() {
    checkLoginStatus();
    updateUserDisplay();

    if (localStorage.getItem("theme") === "dark") {
        document.body.classList.add("dark");
        const toggle = document.getElementById('darkToggle');
        if (toggle) toggle.checked = true;
    }

    const savedSize = localStorage.getItem("font_size");
    if (savedSize) applyFontSize(savedSize);

    showScreen("splash");

    setTimeout(() => {
        if (currentUser && currentUser.loggedIn) {
            showScreen("home");
            loadNews();
        } else {
            showScreen("about");
        }
    }, 2000);
}

/* ============================================
   EXPORT ALL FUNCTIONS TO WINDOW
============================================ */
function exportAllFunctions() {
    window.showScreen            = showScreen;
    window.goToLogin             = goToLogin;
    window.skipLoginFromAbout    = skipLoginFromAbout;
    window.skipToHome            = skipToHome;
    window.goBackToAbout         = goBackToAbout;
    window.goBack                = goBack;
    window.goHome                = goHome;
    window.logout                = logout;
    window.clearAll              = clearAll;
    window.loadNews              = loadNews;
    window.openArticle           = openArticle;
    window.saveCurrentArticle    = saveCurrentArticle;
    window.refreshFeed           = refreshFeed;
    window.changeTextSize        = changeTextSize;
    window.toggleDark            = toggleDark;
    window.showToast             = showToast;
    window.shareCurrentArticle   = shareCurrentArticle;
    window.openExternalLink      = openExternalLink;
    window.handleArticleClick    = handleArticleClick;
    window.switchTab             = switchTab;
    window.translateArticle      = translateArticle;
    window.highlightTranslateBtn = highlightTranslateBtn;
    window.copyToClipboard       = copyToClipboard;
    window.fallbackCopy          = fallbackCopy;
}

/* ============================================
   EVENT LISTENERS
============================================ */
function setupAllEventListeners() {
    attachLogoutListener();
    setTimeout(attachLogoutListener, 500);
    attachClearAllListener();
    setTimeout(attachClearAllListener, 500);
    attachDarkModeListener();
    setTimeout(attachDarkModeListener, 500);
    setupOtherListeners();
}

function attachDarkModeListener() {
    const darkToggle = document.getElementById('darkToggle');
    if (!darkToggle) return;
    const newToggle = darkToggle.cloneNode(true);
    darkToggle.parentNode.replaceChild(newToggle, darkToggle);
    newToggle.addEventListener('change', function () { toggleDark(this.checked); });
}

function attachLogoutListener() {
    const logoutBtn = document.getElementById('logoutButton');
    if (!logoutBtn) return;
    const newBtn = logoutBtn.cloneNode(true);
    logoutBtn.parentNode.replaceChild(newBtn, logoutBtn);
    newBtn.addEventListener('click',    (e) => { e.preventDefault(); e.stopPropagation(); logout(); });
    newBtn.addEventListener('touchend', (e) => { e.preventDefault(); logout(); });
}

function attachClearAllListener() {
    const clearBtn = document.querySelector('.btn-danger');
    if (!clearBtn) return;
    const newBtn = clearBtn.cloneNode(true);
    clearBtn.parentNode.replaceChild(newBtn, clearBtn);
    newBtn.addEventListener('click',    (e) => { e.preventDefault(); e.stopPropagation(); clearAll(); });
    newBtn.addEventListener('touchend', (e) => { e.preventDefault(); clearAll(); });
}

function setupOtherListeners() {
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', function () { changeTextSize(this.getAttribute('data-size')); });
    });
    const sendOtpBtn   = document.getElementById('sendOtpBtn');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    if (sendOtpBtn)   sendOtpBtn.addEventListener('click', sendOTP);
    if (verifyOtpBtn) verifyOtpBtn.addEventListener('click', verifyOTP);
}

/* ============================================
   NAVIGATION
============================================ */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = 'none';
    });

    const target = document.getElementById(screenId);
    if (!target) return;

    target.classList.add('active');
    target.style.display = screenId === 'splash' ? 'flex' : 'block';

    const showNav = ['home', 'saved', 'preferences'].includes(screenId);
    document.querySelectorAll('.bottom-nav').forEach(nav => {
        nav.style.display = showNav ? 'flex' : 'none';
    });

    if (screenId === 'home')        { updateSavedFolder(); setTimeout(loadNews, 100); }
    if (screenId === 'saved')       setTimeout(loadSavedArticles, 100);
    if (screenId === 'preferences') {
        setTimeout(() => { attachLogoutListener(); attachClearAllListener(); attachDarkModeListener(); }, 300);
        updateUserDisplay();
        highlightSizeButton(localStorage.getItem("font_size") || "medium");
    }

    window.scrollTo(0, 0);
    setTimeout(bindMobileButtons, 200);
}

function goToLogin()          { resetLoginForm(); showScreen("login"); }
function skipLoginFromAbout() { showScreen("home"); loadNews(); }
function skipToHome()         { showScreen("home"); loadNews(); }
function goBackToAbout()      { showScreen("about"); }
function goBack()             { showScreen("home"); }
function goHome()             { showScreen("home"); }

/* ============================================
   USER MANAGEMENT
============================================ */
function checkLoginStatus() {
    const isLoggedIn = localStorage.getItem("centrinsic_logged") === "true";
    const userEmail  = localStorage.getItem("user_email");
    const userName   = localStorage.getItem("user_name");
    if (isLoggedIn && userEmail) {
        currentUser = { email: userEmail, loggedIn: true, name: userName || userEmail.split('@')[0] };
    } else {
        currentUser = null;
    }
}

function updateUserDisplay() {
    const userNameEl  = document.getElementById("userDisplayName");
    const userEmailEl = document.getElementById("userDisplayEmail");
    const logoutBtn   = document.getElementById("logoutButton");
    if (!userNameEl || !userEmailEl) return;
    if (currentUser && currentUser.loggedIn) {
        userNameEl.textContent  = currentUser.name || currentUser.email.split('@')[0];
        userEmailEl.textContent = currentUser.email;
        if (logoutBtn) logoutBtn.style.display = 'block';
    } else {
        userNameEl.textContent  = "Guest User";
        userEmailEl.textContent = "Not signed in";
        if (logoutBtn) logoutBtn.style.display = 'none';
    }
}

function logout() {
    if (!confirm("Are you sure you want to logout?")) return;
    localStorage.removeItem("centrinsic_logged");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_name");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("temp_email");
    currentUser = null;
    showToast("Logged out successfully");
    setTimeout(() => showScreen("about"), 500);
}

function clearAll() {
    if (!confirm("Clear all saved data?")) return;
    localStorage.clear();
    showToast("All data cleared");
    setTimeout(() => location.reload(), 600);
}

/* ============================================
   THEME
============================================ */
function toggleDark(checked) {
    const checkbox     = document.getElementById('darkToggle');
    const shouldBeDark = typeof checked === 'boolean' ? checked : !document.body.classList.contains('dark');
    if (shouldBeDark) {
        document.body.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    }
    if (checkbox) checkbox.checked = shouldBeDark;
    if (allArticles.length > 0) renderTabView();
}

/* ============================================
   FONT SIZE
============================================ */
function changeTextSize(size) {
    localStorage.setItem("font_size", size);
    applyFontSize(size);
    highlightSizeButton(size);
    showToast("Text size: " + size);
}

function applyFontSize(size) {
    document.body.setAttribute('data-font-size', size);
    const sizes = { small: '14px', medium: '16px', large: '18px' };
    document.body.style.fontSize = sizes[size] || '16px';
}

function highlightSizeButton(size) {
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-size') === size);
    });
}

/* ============================================
   OTP LOGIN
============================================ */
let otpTimer             = null;
let otpCountdown         = 60;
let otpRequestInProgress = false;

function sendOTP() {
    if (otpRequestInProgress) return;
    const emailInput = document.getElementById("loginEmail");
    const email      = emailInput.value.trim();
    const btn        = document.getElementById("sendOtpBtn");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("Please enter a valid email"); return; }
    otpRequestInProgress = true;
    btn.classList.add("loading");
    btn.disabled  = true;
    btn.innerText = "Sending...";
    localStorage.setItem("temp_email", email);
    fetch(`${API_BASE}/api/auth/send-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
    })
    .then(r => r.json())
    .then(data => {
        otpRequestInProgress = false;
        btn.classList.remove("loading");
        btn.disabled  = false;
        btn.innerText = "Send OTP";
        if (data.success) { showOTPStep(email); showToast("📧 OTP sent!"); }
        else showToast(data.message || "Failed to send OTP");
    })
    .catch(() => {
        otpRequestInProgress = false;
        btn.classList.remove("loading");
        btn.disabled  = false;
        btn.innerText = "Send OTP";
        showToast("Network error");
    });
}

function showOTPStep(email) {
    document.getElementById("emailStep")?.classList.add("hidden");
    document.getElementById("otpStep")?.classList.remove("hidden");
    const otpDisplay = document.getElementById("otpEmailDisplay");
    if (otpDisplay) otpDisplay.textContent = email;
    document.getElementById("loginFooter")?.classList.add("hidden");
    const firstInput = document.querySelector('.otp-input[data-index="0"]');
    if (firstInput) firstInput.focus();
    startOTPTimer();
    setupOTPInputs();
}

function setupOTPInputs() {
    document.querySelectorAll('.otp-input').forEach(input => input.replaceWith(input.cloneNode(true)));
    const newInputs = document.querySelectorAll('.otp-input');
    newInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            if (!/^\d*$/.test(e.target.value)) { e.target.value = ''; return; }
            if (e.target.value.length === 1) {
                e.target.classList.add('filled');
                if (index < 5) newInputs[index + 1].focus();
                else verifyOTP();
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) newInputs[index - 1].focus();
        });
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const numbers = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            numbers.split('').forEach((num, i) => {
                if (newInputs[i]) { newInputs[i].value = num; newInputs[i].classList.add('filled'); }
            });
            if (newInputs[Math.min(numbers.length, 5)]) newInputs[Math.min(numbers.length, 5)].focus();
            if (numbers.length === 6) setTimeout(verifyOTP, 100);
        });
    });
}

function startOTPTimer() {
    otpCountdown = 60;
    const timerSpan = document.getElementById("otpTimer");
    const resendBtn = document.getElementById("resendBtn");
    if (resendBtn) resendBtn.classList.add("hidden");
    if (timerSpan) timerSpan.classList.remove("hidden");
    if (otpTimer)  clearInterval(otpTimer);
    otpTimer = setInterval(() => {
        otpCountdown--;
        if (timerSpan) timerSpan.textContent = `Resend OTP in ${otpCountdown}s`;
        if (otpCountdown <= 0) {
            clearInterval(otpTimer);
            if (timerSpan) timerSpan.classList.add("hidden");
            if (resendBtn) resendBtn.classList.remove("hidden");
        }
    }, 1000);
}

function verifyOTP() {
    const inputs = document.querySelectorAll('.otp-input');
    const email  = localStorage.getItem("temp_email");
    let enteredOTP = '';
    inputs.forEach(input => enteredOTP += input.value);
    if (enteredOTP.length !== 6) { showToast("Enter complete OTP"); return; }
    const btn = document.getElementById("verifyOtpBtn");
    btn.classList.add("loading");
    btn.disabled = true;
    fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, otp: enteredOTP })
    })
    .then(r => r.json())
    .then(data => {
        btn.classList.remove("loading");
        btn.disabled = false;
        if (data.success) {
            const userName = data.user?.name || email.split('@')[0];
            localStorage.setItem("centrinsic_logged", "true");
            localStorage.setItem("user_email", email);
            localStorage.setItem("auth_token", data.token || '');
            localStorage.setItem("user_name", userName);
            currentUser = { email, loggedIn: true, name: userName, token: data.token };
            updateUserDisplay();
            showToast("✅ Welcome!");
            localStorage.removeItem("temp_email");
            showScreen("home");
            loadNews();
        } else {
            showToast(data.message || "Invalid OTP");
            inputs.forEach(input => { input.value = ''; input.classList.remove('filled'); });
            if (inputs[0]) inputs[0].focus();
        }
    })
    .catch(() => {
        btn.classList.remove("loading");
        btn.disabled = false;
        showToast("Network error");
    });
}

function resetLoginForm() {
    document.getElementById("emailStep")?.classList.remove("hidden");
    document.getElementById("otpStep")?.classList.add("hidden");
    document.getElementById("loginFooter")?.classList.remove("hidden");
    const emailInput = document.getElementById("loginEmail");
    if (emailInput) emailInput.value = '';
    document.querySelectorAll('.otp-input').forEach(input => { input.value = ''; input.classList.remove('filled'); });
    if (otpTimer) clearInterval(otpTimer);
}

/* ============================================
   NEWS LOADING
============================================ */
async function loadNews() {
    const container = document.getElementById("newsFeed");
    if (!container) return;
    container.innerHTML = `
        <div class="loading" style="padding:60px 20px;text-align:center;">
            <div class="spinner"></div>
            <p style="margin-top:16px;font-weight:600;">Loading news...</p>
            <p style="color:#888;font-size:13px;margin-top:8px;">First load may take 30 seconds.<br>Please wait...</p>
        </div>`;
    try {
        const response  = await fetch(API_ARTICLES);
        const data      = await response.json();
        const newsArray = data.articles || data.data || data;
        if (!Array.isArray(newsArray)) throw new Error('Invalid response format');
        if (data.meta?.lastUpdated) lastUpdatedTime = data.meta.lastUpdated;
        allArticles = newsArray;
        articlesCache.clear();
        newsArray.forEach(article => {
            const id = article._id || article.articleId || article.id;
            if (id) articlesCache.set(String(id), article);
        });
        localStorage.setItem("news_backup", JSON.stringify(newsArray));
        localStorage.setItem("news_meta",   JSON.stringify(data.meta || {}));
        isOnline = true;
        console.log(`📊 Loaded ${newsArray.length} total articles`);
        renderTabView();
        updateSavedFolder();
    } catch (error) {
        console.error('Load news error:', error);
        const backup = localStorage.getItem("news_backup");
        if (backup) {
            allArticles = JSON.parse(backup);
            renderTabView();
            showToast("Offline mode");
        } else {
            container.innerHTML = `
                <div style="text-align:center;padding:60px 20px;">
                    <div style="font-size:48px;margin-bottom:16px;">📵</div>
                    <h3>Unable to load news</h3>
                    <p style="color:#888;">Check your internet connection</p>
                    <button onclick="loadNews()" style="margin-top:16px;padding:12px 24px;background:#4CAF50;color:white;border:none;border-radius:20px;font-size:14px;cursor:pointer;">Try Again</button>
                </div>`;
        }
    }
}

function switchTab(tab) {
    currentTab = tab;
    renderTabView();
    window.scrollTo(0, 0);
}

/* ============================================
   TAB CONFIG
============================================ */
const TAB_CONFIG = {
    gnews: {
        label:     'AI-S',
        title:     'Short AI Card',
        icon:      '🟢',
        color:     '#4CAF50',
        shadow:    'rgba(76,175,80,0.35)',
        emptyIcon: '📭',
        emptyMsg:  'Check back later for news',
        filter:    (articles) => articles.filter(a => !a.isManual)
    },
    manual: {
        label:     'AI-D',
        title:     'Detailed AI Card',
        icon:      '🔵',
        color:     '#667eea',
        shadow:    'rgba(102,126,234,0.35)',
        emptyIcon: '✍️',
        emptyMsg:  'Detailed articles coming soon',
        filter:    (articles) => articles.filter(a =>
            a.isManual && !['60sec','currentaffairs'].includes((a.category || '').toLowerCase())
        )
    },
    '60sec': {
        label:     '60 Sec',
        title:     '60 Second News',
        icon:      '⚡',
        color:     '#FF9800',
        shadow:    'rgba(255,152,0,0.35)',
        emptyIcon: '⏱️',
        emptyMsg:  '60-second stories coming soon',
        filter:    (articles) => articles.filter(a =>
            a.isManual && (a.category || '').toLowerCase() === '60sec'
        )
    },
    currentaffairs: {
        label:     'Current',
        title:     'Current Affairs',
        icon:      '🔴',
        color:     '#e53935',
        shadow:    'rgba(229,57,53,0.35)',
        emptyIcon: '🗞️',
        emptyMsg:  'Current affairs coming soon',
        filter:    (articles) => articles.filter(a =>
            a.isManual && (a.category || '').toLowerCase() === 'currentaffairs'
        )
    }
};

const TAB_ORDER = ['gnews', 'manual', '60sec', 'currentaffairs'];

/* ============================================
   RENDER TAB VIEW — 4 TABS, LIGHT/DARK AWARE
============================================ */
function renderTabView() {
    const container = document.getElementById("newsFeed");
    if (!container) return;

    const isDark = document.body.classList.contains('dark');
    const theme  = {
        headerBg:          isDark ? '#000'    : '#ffffff',
        headerBorder:      isDark ? '#222'    : '#e0e0e0',
        inactiveTabBg:     isDark ? '#1a1a1a' : '#f0f0f0',
        inactiveTabText:   isDark ? '#888'    : '#555',
        updatedColor:      isDark ? '#666'    : '#999',
        sectionTitleColor: isDark ? '#fff'    : '#111',
        emptyTitleColor:   isDark ? '#fff'    : '#111',
        emptyTextColor:    isDark ? '#666'    : '#999',
    };

    const cfg            = TAB_CONFIG[currentTab] || TAB_CONFIG.gnews;
    const activeArticles = cfg.filter(allArticles);

    const tabButtons = TAB_ORDER.map(tabKey => {
        const t        = TAB_CONFIG[tabKey];
        const isActive = currentTab === tabKey;
        const count    = t.filter(allArticles).length;
        return `
            <button onclick="switchTab('${tabKey}')" style="
                flex:1;padding:10px 4px;border-radius:22px;border:none;
                font-weight:600;font-size:12px;cursor:pointer;transition:all 0.3s;
                background:${isActive ? t.color       : theme.inactiveTabBg};
                color:     ${isActive ? '#fff'         : theme.inactiveTabText};
                box-shadow:${isActive ? `0 2px 8px ${t.shadow}` : 'none'};
                position:relative;">
                ${t.label}
                ${count > 0 ? `<span style="
                    position:absolute;top:-4px;right:-2px;
                    background:${isActive ? 'rgba(255,255,255,0.3)' : t.color};
                    color:white;font-size:9px;font-weight:700;
                    padding:1px 5px;border-radius:8px;min-width:14px;line-height:16px;">
                    ${count}</span>` : ''}
            </button>`;
    }).join('');

    let html = `
        <div style="position:sticky;top:0;z-index:100;background:${theme.headerBg};padding:10px 16px;border-bottom:1px solid ${theme.headerBorder};">
            <div style="display:flex;gap:8px;margin-bottom:10px;">${tabButtons}</div>
            ${lastUpdatedTime ? `<div style="text-align:center;color:${theme.updatedColor};font-size:11px;">
                🕐 Updated ${new Date(lastUpdatedTime).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true})}
            </div>` : ''}
        </div>
        <div style="margin:20px 16px 12px 16px;display:flex;align-items:center;gap:10px;">
            <div style="width:4px;height:24px;background:${cfg.color};border-radius:2px;"></div>
            <h2 style="color:${theme.sectionTitleColor};font-size:20px;font-weight:700;margin:0;">${cfg.icon} ${cfg.title}</h2>
            <span style="background:${cfg.color};color:white;font-size:12px;padding:4px 12px;border-radius:12px;margin-left:auto;">${activeArticles.length}</span>
        </div>`;

    if (activeArticles.length > 0) {
        if (currentTab === '60sec') {
            html += `<div style="padding:0 16px 20px 16px;">${render60SecCards(activeArticles)}</div>`;
        } else {
            html += `<div class="articles-list" style="padding:0 16px 20px 16px;">${renderArticleCards(activeArticles)}</div>`;
        }
    } else {
        html += `
            <div style="text-align:center;padding:60px 20px;">
                <div style="font-size:48px;margin-bottom:16px;">${cfg.emptyIcon}</div>
                <h3 style="color:${theme.emptyTitleColor};margin-bottom:8px;">Nothing here yet</h3>
                <p style="color:${theme.emptyTextColor};">${cfg.emptyMsg}</p>
            </div>`;
    }

    container.innerHTML = html;
}

/* ============================================
   60 SEC SPECIAL CARD
============================================ */
function render60SecCards(articles) {
    const isDark     = document.body.classList.contains('dark');
    const cardBg     = isDark ? '#1a1a1a' : '#fff';
    const cardBorder = isDark ? '#2a2a2a' : '#e8e8e8';
    const titleColor = isDark ? '#fff'    : '#111';
    const metaColor  = isDark ? '#888'    : '#666';
    const bodyColor  = isDark ? '#ccc'    : '#333';

    return articles.map((item, index) => {
        const id       = String(item._id || item.articleId || item.id || index).replace(/[^a-zA-Z0-9-]/g, '');
        const date     = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : "Recent";
        const title    = item.title   || "Untitled";
        const content  = item.content || item.description || '';
        const imageUrl = getImageUrl(item.image);
        const isSaved  = getSavedArticles().some(s => String(s._id || s.id || s.articleId) === id);
        const sentences = content.split(/\n|(?<=\.)\s+/).filter(s => s.trim().length > 10).slice(0, 4);
        const bullets   = sentences.map(s => `<li style="margin-bottom:6px;line-height:1.5;color:${bodyColor};font-size:14px;">${escapeHtml(s.trim())}</li>`).join('');

        return `
            <article style="background:${cardBg};border-radius:16px;margin-bottom:14px;border:1px solid ${cardBorder};overflow:hidden;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.08);"
                data-article-id="${escapeHtml(id)}"
                data-article-title="${escapeHtml(title)}"
                data-article-source="${escapeHtml(item.source || 'Unknown')}"
                onclick="handleArticleClick(this)">
                ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" style="width:100%;height:160px;object-fit:cover;display:block;" loading="lazy" onerror="this.style.display='none'" alt="">` : ''}
                <div style="padding:14px 16px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                        <span style="background:#FF9800;color:white;font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;">⚡ 60 SEC</span>
                        <span style="color:${metaColor};font-size:12px;">${escapeHtml(item.source || 'Unknown')}</span>
                        <span style="color:${metaColor};font-size:12px;margin-left:auto;">${escapeHtml(date)}</span>
                    </div>
                    <h3 style="color:${titleColor};font-size:16px;font-weight:700;margin:0 0 10px 0;line-height:1.4;">
                        ${isSaved ? '🔖 ' : ''}${escapeHtml(title)}
                    </h3>
                    ${bullets ? `<ul style="margin:0;padding-left:18px;">${bullets}</ul>` : `<p style="color:${bodyColor};font-size:14px;margin:0;">${escapeHtml(content.substring(0,120))}...</p>`}
                </div>
            </article>`;
    }).join('');
}

/* ============================================
   RENDER STANDARD ARTICLE CARDS
============================================ */
function renderArticleCards(articles) {
    if (!articles || articles.length === 0) return '';
    return articles.map((item, index) => {
        const id       = String(item._id || item.articleId || item.id || index).replace(/[^a-zA-Z0-9-]/g, '');
        const date     = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : "Recent";
        const excerpt  = item.content ? item.content.substring(0, 100) + "..." : "No content";
        const title    = item.title || "Untitled";
        const isSaved  = getSavedArticles().some(s => String(s._id || s.id || s.articleId) === id);
        const imageUrl = getImageUrl(item.image);
        const isCA     = (item.category || '').toLowerCase() === 'currentaffairs';

        return `
            <article class="news-card"
                data-article-id="${escapeHtml(id)}"
                data-article-title="${escapeHtml(title)}"
                data-article-source="${escapeHtml(item.source || 'Unknown')}"
                onclick="handleArticleClick(this)">
                <div class="news-content">
                    ${isCA ? `<span style="background:#e53935;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px;display:inline-block;margin-bottom:6px;">🔴 CURRENT AFFAIRS</span>` : ''}
                    <h3 class="news-title">${isSaved ? '🔖 ' : ''}${escapeHtml(title)}</h3>
                    <p class="news-excerpt">${escapeHtml(excerpt)}</p>
                    <div class="news-meta">
                        <span>${escapeHtml(item.source || 'Unknown')}</span>
                        <span>•</span>
                        <span>${escapeHtml(date)}</span>
                    </div>
                </div>
                ${imageUrl
                    ? `<img src="${escapeHtml(imageUrl)}" class="news-thumb" loading="lazy" onerror="this.style.display='none'" alt="">`
                    : '<div class="news-thumb" style="background:var(--border);"></div>'
                }
            </article>`;
    }).join('');
}

function getImageUrl(imagePath) {
    if (!imagePath) return null;
    if (imagePath.startsWith('http')) return imagePath;
    if (imagePath.startsWith('/uploads/')) return API_BASE + imagePath;
    return `${API_BASE}/uploads/${imagePath}`;
}

function handleArticleClick(element) {
    const articleId     = element.getAttribute('data-article-id');
    const articleTitle  = element.getAttribute('data-article-title');
    const articleSource = element.getAttribute('data-article-source');
    if (articlesCache.has(articleId)) { currentArticle = articlesCache.get(articleId); displayArticleDetail(); return; }
    const foundByTitle = allArticles.find(a => a.title === articleTitle && a.source === articleSource);
    if (foundByTitle) { currentArticle = foundByTitle; displayArticleDetail(); return; }
    if (!articleId.startsWith('gnews_')) {
        fetch(`${API_ARTICLES}/${articleId}`)
            .then(r => r.json())
            .then(article => { currentArticle = article; displayArticleDetail(); })
            .catch(() => showToast("Failed to load article"));
    } else {
        showToast("Article expired. Please refresh.");
    }
}

function getSavedArticles() {
    try { return JSON.parse(localStorage.getItem("saved_articles") || "[]"); }
    catch (e) { return []; }
}

function updateSavedFolder() {
    const folder  = document.getElementById("savedFolder");
    const countEl = document.getElementById("savedCount");
    const saved   = getSavedArticles();
    if (folder) {
        folder.style.display = saved.length > 0 ? 'flex' : 'none';
        if (countEl) countEl.textContent = `${saved.length} saved`;
    }
}

function loadSavedArticles() {
    const container = document.getElementById("savedList");
    if (!container) return;
    const saved = getSavedArticles();
    if (saved.length === 0) { container.innerHTML = `<div class="empty"><div>📁</div><h3>No saved</h3></div>`; return; }
    container.innerHTML = saved.map(item => {
        const id    = String(item._id || item.articleId || item.id).replace(/[^a-zA-Z0-9-]/g, '');
        const date  = item.savedAt ? new Date(item.savedAt).toLocaleDateString() : "Saved";
        const title = item.title || "Untitled";
        return `
            <article class="news-card"
                data-article-id="${escapeHtml(id)}"
                data-article-title="${escapeHtml(title)}"
                data-article-source="${escapeHtml(item.source || 'Unknown')}"
                onclick="handleArticleClick(this)">
                <div class="news-content">
                    <h3 class="news-title">🔖 ${escapeHtml(title)}</h3>
                    <p class="news-meta"><span>${escapeHtml(date)}</span></p>
                </div>
            </article>`;
    }).join('');
}

/* ============================================
   ARTICLE DETAIL
============================================ */
function openArticle(id) {
    const cleanId = String(id).replace(/[^a-zA-Z0-9-]/g, '');
    if (articlesCache.has(cleanId)) { currentArticle = articlesCache.get(cleanId); displayArticleDetail(); return; }
    if (!cleanId.startsWith('gnews_')) {
        fetch(`${API_ARTICLES}/${cleanId}`)
            .then(r => r.json())
            .then(article => { currentArticle = article; displayArticleDetail(); })
            .catch(() => showToast("Failed to load article"));
    } else { showToast("Article expired. Please refresh."); }
}

function displayArticleDetail() {
    const articleBody = document.getElementById("articleBody");
    const saveBtn     = document.getElementById("saveBtn");
    if (!articleBody || !currentArticle) { showToast("Article not found"); return; }

    originalArticleContent = null;

    const articleId = currentArticle._id || currentArticle.id || currentArticle.articleId;
    const isSaved   = getSavedArticles().some(s => String(s._id || s.id || s.articleId) === String(articleId));
    if (saveBtn) { saveBtn.innerHTML = isSaved ? '✓ Saved' : '💾 Save'; saveBtn.classList.toggle('saved', isSaved); }

    let date = "Recent";
    if (currentArticle.createdAt || currentArticle.publishedAt) {
        date = new Date(currentArticle.createdAt || currentArticle.publishedAt)
            .toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true})
            .toLowerCase();
    }

    const imageUrl  = getImageUrl(currentArticle.image);
    const source    = currentArticle.source   || 'Unknown';
    const category  = currentArticle.category || 'General';

    let originalLink = '#';
    if      (currentArticle.originalLink)     originalLink = currentArticle.originalLink;
    else if (currentArticle['original link']) originalLink = currentArticle['original link'];
    else if (currentArticle.original_link)   originalLink = currentArticle.original_link;
    else if (currentArticle.url)             originalLink = currentArticle.url;

    const isDark       = document.body.classList.contains('dark');
    const detailBorder = isDark ? '#2a2a2a' : '#e0e0e0';
    const metaColor    = isDark ? '#888'    : '#666';
    const bodyColor    = isDark ? '#ccc'    : '#222';
    const cardBg       = isDark ? '#1a1a1a' : '#f8f8f8';
    const labelColor   = isDark ? '#888'    : '#666';
    const linkBg       = isDark ? '#1a1a1a' : '#f0f0f0';
    const linkBorder   = isDark ? '#333'    : '#ddd';
    const linkColor    = isDark ? '#fff'    : '#111';
    const transBg      = isDark ? '#1a1a1a' : '#f5f5f5';
    const selectBg     = isDark ? '#111'    : '#ffffff';
    const selectColor  = isDark ? '#ccc'    : '#333';
    const selectBorder = isDark ? '#333'    : '#ccc';

    const catLower  = category.toLowerCase();
    const catColor  = catLower === '60sec' ? '#FF9800' : catLower === 'currentaffairs' ? '#e53935' : '#4CAF50';
    const catLabel  = catLower === '60sec' ? '⚡ 60 Sec' : catLower === 'currentaffairs' ? '🔴 Current Affairs' : category;

    articleBody.innerHTML = `
        ${imageUrl ? `<div class="article-image-container"><img src="${escapeHtml(imageUrl)}" class="article-image" loading="lazy" onerror="this.style.display='none'"></div>` : ''}
        <div class="article-text-content">
            <h1 class="article-headline">${escapeHtml(currentArticle.title || "Untitled")}</h1>

            <!-- Date + Share Row -->
            <div class="article-meta-row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:10px 0;border-bottom:1px solid ${detailBorder};">
                <span class="article-date" style="color:${metaColor};font-size:14px;">${escapeHtml(date)}</span>
                <button onclick="shareCurrentArticle()" id="shareBtn" style="background:#4CAF50;border:none;border-radius:8px;color:white;padding:8px 16px;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:5px;">
                    📤 Share
                </button>
            </div>

            <!-- TRANSLATE BAR -->
            <div id="translateBar" style="margin-bottom:16px;padding:10px 14px;background:${transBg};border-radius:12px;border:1px solid ${detailBorder};display:flex;align-items:center;gap:10px;">
                <span style="font-size:13px;color:${metaColor};white-space:nowrap;">🌐 Translate:</span>
                <select id="translateSelect" onchange="translateArticle(this.value)"
                    style="flex:1;background:${selectBg};color:${selectColor};border:1px solid ${selectBorder};border-radius:20px;padding:8px 14px;font-size:13px;font-family:inherit;cursor:pointer;outline:none;">
                    <option value="en">↩ Original (English)</option>
                    <optgroup label="── Indian Languages ──">
                        <option value="hi">🇮🇳 Hindi</option>
                        <option value="te">తె Telugu</option>
                        <option value="ta">த Tamil</option>
                        <option value="kn">ಕ Kannada</option>
                        <option value="ml">മ Malayalam</option>
                        <option value="bn">বাং Bengali</option>
                        <option value="mr">म Marathi</option>
                        <option value="gu">ગુ Gujarati</option>
                        <option value="pa">ਪ Punjabi</option>
                        <option value="ur">اردو Urdu</option>
                        <option value="or">ଓ Odia</option>
                        <option value="as">অ Assamese</option>
                        <option value="ne">ने Nepali</option>
                        <option value="si">සි Sinhala</option>
                    </optgroup>
                    <optgroup label="── World Languages ──">
                        <option value="zh">🇨🇳 Chinese</option>
                        <option value="ar">🇸🇦 Arabic</option>
                        <option value="fr">🇫🇷 French</option>
                        <option value="de">🇩🇪 German</option>
                        <option value="es">🇪🇸 Spanish</option>
                        <option value="ja">🇯🇵 Japanese</option>
                        <option value="ko">🇰🇷 Korean</option>
                        <option value="pt">🇵🇹 Portuguese</option>
                        <option value="ru">🇷🇺 Russian</option>
                        <option value="tr">🇹🇷 Turkish</option>
                        <option value="it">🇮🇹 Italian</option>
                        <option value="th">🇹🇭 Thai</option>
                        <option value="vi">🇻🇳 Vietnamese</option>
                        <option value="id">🇮🇩 Indonesian</option>
                        <option value="ms">🇲🇾 Malay</option>
                        <option value="sw">🌍 Swahili</option>
                    </optgroup>
                </select>
            </div>

            <!-- Article Body -->
            <div class="article-body-text" style="color:${bodyColor};line-height:1.8;margin-bottom:20px;font-size:16px;">${escapeHtml(currentArticle.content || currentArticle.description || "No content available")}</div>

            <!-- Source / Category / Published -->
            <div style="background:${cardBg};border-radius:12px;padding:20px;margin:20px 0;border:1px solid ${detailBorder};">
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="color:${labelColor};font-size:14px;min-width:80px;">Source:</span>
                        <span style="color:#667eea;font-size:14px;font-weight:600;">${escapeHtml(source)}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="color:${labelColor};font-size:14px;min-width:80px;">Category:</span>
                        <span style="background:${catColor};color:white;font-size:12px;font-weight:600;padding:3px 10px;border-radius:10px;">${escapeHtml(catLabel)}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="color:${labelColor};font-size:14px;min-width:80px;">Published:</span>
                        <span style="color:${metaColor};font-size:14px;">${escapeHtml(date)}</span>
                    </div>
                </div>
            </div>

            <!-- AI Summary Card -->
            <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border-radius:16px;padding:20px;margin-bottom:20px;border:1px solid #2a2a4a;position:relative;overflow:hidden;">
                <div style="position:absolute;top:-50px;right:-50px;width:100px;height:100px;background:radial-gradient(circle,rgba(102,126,234,0.3) 0%,transparent 70%);border-radius:50%;"></div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;position:relative;z-index:1;">
                    <div style="width:40px;height:40px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                        <svg viewBox="0 0 24 24" fill="white" style="width:24px;height:24px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                    </div>
                    <div>
                        <h3 style="color:#fff;font-size:16px;font-weight:600;margin:0;">AI-Generated Summary</h3>
                        <p style="color:#888;font-size:12px;margin:4px 0 0 0;">Powered by Advanced AI</p>
                    </div>
                </div>
                <p style="color:#ccc;font-size:14px;line-height:1.6;margin:0;position:relative;z-index:1;">This article has been processed by our AI to provide you with key insights and a concise summary of the main points.</p>
            </div>

            <!-- Read Full Original -->
            <div style="margin-bottom:30px;">
                ${originalLink !== '#' ? `
                <button onclick="openExternalLink('${escapeHtml(originalLink)}')" style="display:flex;align-items:center;justify-content:center;gap:10px;background:${linkBg};border:1px solid ${linkBorder};border-radius:12px;padding:16px;color:${linkColor};font-size:15px;font-weight:500;width:100%;cursor:pointer;">
                    <span>📰</span><span>Read Full Original Article</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;margin-left:auto;">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </button>` : `<p style="color:${metaColor};text-align:center;font-size:14px;">Original link not available</p>`}
            </div>
        </div>`;

    showScreen("detail");
    const detailContent = document.getElementById("detailContent");
    if (detailContent) detailContent.scrollTop = 0;
}

/* ============================================
   TRANSLATE
============================================ */
async function translateArticle(targetLang) {
    const bodyEl     = document.querySelector('.article-body-text');
    const headlineEl = document.querySelector('.article-headline');
    if (!bodyEl || !currentArticle) return;

    if (targetLang === 'en') {
        if (originalArticleContent) {
            bodyEl.textContent = originalArticleContent.body;
            if (headlineEl) headlineEl.textContent = originalArticleContent.title;
            originalArticleContent = null;
        }
        highlightTranslateBtn('en');
        return;
    }

    if (!originalArticleContent) {
        originalArticleContent = { body: bodyEl.textContent, title: headlineEl ? headlineEl.textContent : '' };
    }

    bodyEl.innerHTML = '<span style="color:#888;font-size:14px;">🌐 Translating...</span>';
    if (headlineEl) headlineEl.style.opacity = '0.5';

    try {
        const bodyRes  = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(originalArticleContent.body)}`);
        const bodyData = await bodyRes.json();
        let translated = '';
        if (bodyData && bodyData[0]) bodyData[0].forEach(seg => { if (seg[0]) translated += seg[0]; });
        bodyEl.textContent = translated || 'Translation not available.';

        if (headlineEl && originalArticleContent.title) {
            const titleRes  = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(originalArticleContent.title)}`);
            const titleData = await titleRes.json();
            let translatedTitle = '';
            if (titleData && titleData[0]) titleData[0].forEach(seg => { if (seg[0]) translatedTitle += seg[0]; });
            if (translatedTitle) headlineEl.textContent = translatedTitle;
        }
        if (headlineEl) headlineEl.style.opacity = '1';

    } catch (err) {
        console.error('Translation error:', err);
        bodyEl.textContent = originalArticleContent.body;
        if (headlineEl) { headlineEl.textContent = originalArticleContent.title; headlineEl.style.opacity = '1'; }
        originalArticleContent = null;
        const select = document.getElementById('translateSelect');
        if (select) select.value = 'en';
        showToast('⚠️ Translation failed.');
    }
}

function highlightTranslateBtn(lang) {
    const select = document.getElementById('translateSelect');
    if (select) select.value = lang;
}

/* ============================================
   EXTERNAL LINK
============================================ */
function openExternalLink(url) {
    if (!url || url === '#') { showToast("Link not available"); return; }
    if (window.Capacitor?.Plugins?.Browser) {
        window.Capacitor.Plugins.Browser.open({ url });
    } else if (window.cordova?.InAppBrowser) {
        window.cordova.InAppBrowser.open(url, '_system');
    } else {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}

/* ============================================
   SAVE / BOOKMARK
============================================ */
function saveCurrentArticle() {
    if (!currentArticle) return;
    const saveBtn     = document.getElementById("saveBtn");
    let savedArticles = getSavedArticles();
    const articleId   = currentArticle._id || currentArticle.id || currentArticle.articleId;
    const index       = savedArticles.findIndex(s => String(s._id || s.id || s.articleId) === String(articleId));
    if (index !== -1) {
        savedArticles.splice(index, 1);
        if (saveBtn) { saveBtn.innerHTML = '💾 Save'; saveBtn.classList.remove('saved'); }
        showToast("Removed from saved");
    } else {
        savedArticles.unshift({ ...currentArticle, savedAt: new Date().toISOString() });
        if (saveBtn) { saveBtn.innerHTML = '✓ Saved'; saveBtn.classList.add('saved'); }
        showToast("Saved!");
    }
    localStorage.setItem("saved_articles", JSON.stringify(savedArticles));
    updateSavedFolder();
    const homeScreen = document.getElementById('home');
    if (homeScreen?.classList.contains('active')) loadNews();
}

/* ============================================
   ✅ SHARE — SCREENSHOT CARD + NATIVE SHARE
   Uses html2canvas to generate a branded image
   then shares via Capacitor / Web Share API
============================================ */
async function shareCurrentArticle() {
    if (!currentArticle) return;

    const title    = currentArticle.title || "Check out this article";
    const appLink  = "https://centrinsicnpt.com";
    const shareText = `${title}\n\n📲 Read on Centrinsic NPT:\n${appLink}`;

    // ── Update share button to show loading ──
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) { shareBtn.innerHTML = '⏳ Preparing...'; shareBtn.disabled = true; }

    showToast('📸 Creating share image...');

    try {
        const imageUrl = getImageUrl(currentArticle.image);
        const source   = currentArticle.source   || 'Centrinsic NPT';
        const category = currentArticle.category || 'General';
        const content  = (currentArticle.content || '').substring(0, 280) + '...';

        let date = '';
        if (currentArticle.createdAt || currentArticle.publishedAt) {
            date = new Date(currentArticle.createdAt || currentArticle.publishedAt)
                .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        }

        // ── Build off-screen share card ──
        const card = document.createElement('div');
        card.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: 420px;
            background: #0a0a0a;
            color: #ffffff;
            font-family: Arial, sans-serif;
            border-radius: 0;
            overflow: hidden;
            z-index: -1;
        `;

        card.innerHTML = `
            <!-- Branding header -->
            <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:16px 20px;display:flex;align-items:center;gap:12px;">
                <div style="width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">📰</div>
                <div>
                    <div style="font-weight:800;font-size:16px;letter-spacing:0.3px;color:#fff;">Centrinsic NPT</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.75);">Know The Truth</div>
                </div>
            </div>

            <!-- Article image -->
            ${imageUrl
                ? `<div style="width:100%;height:210px;overflow:hidden;"><img src="${imageUrl}" crossorigin="anonymous" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>`
                : `<div style="width:100%;height:100px;background:linear-gradient(135deg,#1a1a2e,#16213e);display:flex;align-items:center;justify-content:center;font-size:48px;">📰</div>`
            }

            <!-- Content area -->
            <div style="padding:20px;background:#111;">
                <!-- Badges -->
                <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
                    <span style="background:#667eea;color:white;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;">${escapeHtml(category)}</span>
                    <span style="background:#1a1a2e;color:#aaa;font-size:11px;padding:4px 12px;border-radius:20px;border:1px solid #333;">${escapeHtml(source)}</span>
                    ${date ? `<span style="color:#666;font-size:11px;padding:4px 0;">${escapeHtml(date)}</span>` : ''}
                </div>

                <!-- Title -->
                <div style="font-size:19px;font-weight:800;line-height:1.4;color:#ffffff;margin-bottom:14px;">${escapeHtml(title)}</div>

                <!-- Content preview -->
                <div style="font-size:13px;color:#999;line-height:1.7;margin-bottom:18px;">${escapeHtml(content)}</div>

                <!-- Divider -->
                <div style="height:1px;background:#222;margin-bottom:14px;"></div>

                <!-- Footer -->
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <div style="font-size:12px;color:#555;">Read the full story on</div>
                    <div style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;font-size:12px;font-weight:700;padding:7px 16px;border-radius:20px;">centrinsicnpt.com</div>
                </div>
            </div>

            <!-- Bottom bar -->
            <div style="background:#0a0a0a;padding:10px 20px;text-align:center;">
                <div style="font-size:11px;color:#444;">Shared via Centrinsic NPT App</div>
            </div>
        `;

        document.body.appendChild(card);

        // ── Wait for article image to load ──
        if (imageUrl) {
            await new Promise(resolve => {
                const img = card.querySelector('img');
                if (!img) return resolve();
                if (img.complete && img.naturalHeight !== 0) return resolve();
                img.onload  = resolve;
                img.onerror = resolve;
                setTimeout(resolve, 4000);
            });
        }

        // ── Check if html2canvas is available ──
        if (typeof html2canvas === 'undefined') {
            console.warn('html2canvas not loaded, falling back to text share');
            document.body.removeChild(card);
            throw new Error('html2canvas not available');
        }

        // ── Generate screenshot ──
        const canvas = await html2canvas(card, {
            useCORS:         true,
            allowTaint:      true,
            backgroundColor: '#0a0a0a',
            scale:           2,
            logging:         false,
            imageTimeout:    5000
        });

        document.body.removeChild(card);

        // ── Convert canvas to blob ──
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        const file = new File([blob], 'centrinsic-news.jpg', { type: 'image/jpeg' });

        // ── SHARE METHOD 1: Capacitor (Android app) ──
        if (window.Capacitor?.Plugins?.Share && window.Capacitor?.Plugins?.Filesystem) {
            try {
                const { Filesystem, Share } = window.Capacitor.Plugins;
                const base64 = await new Promise((resolve, reject) => {
                    const reader   = new FileReader();
                    reader.onload  = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                const fileName = `centrinsic_${Date.now()}.jpg`;
                await Filesystem.writeFile({ path: fileName, data: base64, directory: 'CACHE' });
                const { uri } = await Filesystem.getUri({ path: fileName, directory: 'CACHE' });
                await Share.share({ title, text: shareText, url: appLink, files: [uri] });
                return;
            } catch (capErr) {
                if (capErr?.message?.includes('cancel') || capErr?.errorMessage?.includes('cancel')) return;
                console.warn('Capacitor share failed, trying Web Share:', capErr);
            }
        }

        // ── SHARE METHOD 2: Web Share API with file (Android Chrome) ──
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ title, text: shareText, files: [file] });
                return;
            } catch (webErr) {
                if (webErr.name === 'AbortError') return;
                console.warn('Web Share with file failed:', webErr);
            }
        }

        // ── SHARE METHOD 3: Web Share text only ──
        if (navigator.share) {
            try {
                await navigator.share({ title, text: shareText });
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
            }
        }

        // ── SHARE METHOD 4: Download image + copy link (desktop fallback) ──
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = 'centrinsic-news.jpg';
        a.click();
        URL.revokeObjectURL(url);
        copyToClipboard(shareText);
        showToast('📥 Image saved + link copied!');

    } catch (err) {
        console.error('Share error:', err);
        // Final fallback — just copy link
        copyToClipboard(shareText);
        showToast('🔗 Link copied to clipboard!');
    } finally {
        // Restore share button
        if (shareBtn) { shareBtn.innerHTML = '📤 Share'; shareBtn.disabled = false; }
        // Clean up card if still in DOM
        const leftover = document.querySelector('div[style*="-9999px"]');
        if (leftover) document.body.removeChild(leftover);
    }
}

/* ============================================
   CLIPBOARD HELPERS
============================================ */
function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => showToast("✅ Link copied!"))
            .catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast("✅ Link copied!");
}

/* ============================================
   REFRESH
============================================ */
function refreshFeed() {
    isOnline = false;
    loadNews();
    showToast("Refreshing...");
}

/* ============================================
   UTILS
============================================ */
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id        = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    if (toastTimeout) clearTimeout(toastTimeout);
    toast.textContent = msg;
    toast.classList.add('show');
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

function bindMobileButtons() {
    const logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) logoutBtn.onpointerup = () => logout();
    const deleteBtn = document.getElementById("deleteDataButton");
    if (deleteBtn) deleteBtn.onpointerup = () => clearAll();
}

console.log("✅ Centrinsic NPT — screenshot share + 4 tabs + translate + light/dark");