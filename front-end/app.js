// ============================================
// CENTRINSIC NPT NEWS APP - FULLY UPDATED
// FIX: 60sec routing — checks category AND title pattern
// 4 Tabs: AI-S | AI-D | 60 Sec | Current Affairs
// ============================================

const API_BASE       = "https://centrinsicnpt.com";
const API_ARTICLES   = `${API_BASE}/api/articles`;
const API_SAVE_EMAIL = `${API_BASE}/api/save-email`;

console.log("🔌 API Base:", API_BASE);

let currentUser     = null;
let currentArticle  = null;
let isOnline        = false;
let toastTimeout    = null;
let articlesCache   = new Map();
let lastUpdatedTime = null;
let allArticles     = [];
let currentTab      = 'gnews';

let originalArticleContent = null;
let original60SecContent   = {}; // Store original 60sec content for translation

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
        if (currentUser && currentUser.loggedIn) { showScreen("home"); loadNews(); }
        else showScreen("about");
    }, 2000);
    
    // ── Mobile Back Button Handler ──
    setupMobileBackButton();
}

/* ============================================
   ✅ SINGLE SOURCE OF TRUTH — which tab does this article belong to?
   Checks multiple fields to be robust against server variations
============================================ */
function getArticleTab(article) {
    // GNews articles — not manual
    if (!article.isManual) return 'gnews';

    // Check ALL possible fields the server might use
    const cat    = (article.category    || '').toLowerCase().trim();
    const type   = (article.type        || '').toLowerCase().trim();
    const tag    = (article.tag         || '').toLowerCase().trim();
    const source = (article.source      || '').toLowerCase().trim();

    // ── 60 Sec detection ──
    // Match any variation: '60sec', '60 sec', '60seconds', '60-sec', 'sixty'
    const is60sec =
        cat === '60sec' ||
        cat === '60 sec' ||
        cat === '60seconds' ||
        cat === '60-sec' ||
        cat === 'sixtysec' ||
        type === '60sec' ||
        tag === '60sec' ||
        article.is60sec === true ||
        article.bulletinDigest === true;

    if (is60sec) return '60sec';

    // ── Current Affairs detection ──
    const isCA =
        cat === 'currentaffairs' ||
        cat === 'current affairs' ||
        cat === 'current_affairs' ||
        type === 'currentaffairs' ||
        tag === 'currentaffairs' ||
        article.isCurrentAffairs === true;

    if (isCA) return 'currentaffairs';

    // ── Everything else = AI-D ──
    return 'manual';
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
    window.open60SecBulletin     = open60SecBulletin;
    window.share60SecDigest      = share60SecDigest;
    window.translate60SecDigest  = translate60SecDigest;
    window.getArticleTab         = getArticleTab;
    window.handleMobileBack      = handleMobileBack;
    window.setupMobileBackButton = setupMobileBackButton;
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
    // Debug: Log screen changes
    console.log("🖥️ Showing screen:", screenId);
    
    // Hide all screens first
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = 'none';
    });
    
    // Find and show target screen
    const target = document.getElementById(screenId);
    if (!target) {
        console.error("❌ Screen not found:", screenId);
        return;
    }
    
    target.classList.add('active');
    target.style.display = screenId === 'splash' ? 'flex' : 'block';
    
    // Show/hide navigation based on screen
    const showNav = ['home', 'saved', 'preferences'].includes(screenId);
    document.querySelectorAll('.bottom-nav').forEach(nav => {
        nav.style.display = showNav ? 'flex' : 'none';
    });
    
    // Load content for specific screens
    if (screenId === 'home')        { updateSavedFolder(); setTimeout(loadNews, 100); }
    if (screenId === 'saved')       setTimeout(loadSavedArticles, 100);
    if (screenId === 'preferences') {
        setTimeout(() => { attachLogoutListener(); attachClearAllListener(); attachDarkModeListener(); }, 300);
        updateUserDisplay();
        highlightSizeButton(localStorage.getItem("font_size") || "medium");
    }
    if (screenId === 'detail') {
        const detailContent = document.getElementById("detailContent");
        if (detailContent) detailContent.scrollTop = 0;
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

        // ── Debug: print all manual articles with their category ──
        console.log('📊 Manual articles routing:');
        newsArray.filter(a => a.isManual).forEach(a => {
            console.log(`  tab="${getArticleTab(a)}" | category="${a.category}" | title="${(a.title||'').substring(0,40)}"`);
        });

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
   TAB CONFIG — all filters use getArticleTab()
============================================ */
const TAB_CONFIG = {
    gnews: {
        label: 'AI-S', title: 'Short AI Card', icon: '🟢',
        color: '#4CAF50', shadow: 'rgba(76,175,80,0.35)',
        emptyIcon: '📭', emptyMsg: 'Check back later for news',
        filter: (a) => a.filter(x => getArticleTab(x) === 'gnews')
    },
    manual: {
        label: 'AI-D', title: 'Detailed AI Card', icon: '🔵',
        color: '#667eea', shadow: 'rgba(102,126,234,0.35)',
        emptyIcon: '✍️', emptyMsg: 'Detailed articles coming soon',
        filter: (a) => a.filter(x => getArticleTab(x) === 'manual')
    },
    '60sec': {
        label: '60 Sec', title: '60 Second Digest', icon: '⚡',
        color: '#FF9800', shadow: 'rgba(255,152,0,0.35)',
        emptyIcon: '⏱️', emptyMsg: '60-second digest coming soon',
        filter: (a) => a.filter(x => getArticleTab(x) === '60sec')
    },
    currentaffairs: {
        label: 'Current', title: 'Current Affairs', icon: '🔴',
        color: '#e53935', shadow: 'rgba(229,57,53,0.35)',
        emptyIcon: '🗞️', emptyMsg: 'Current affairs coming soon',
        filter: (a) => a.filter(x => getArticleTab(x) === 'currentaffairs')
    }
};

const TAB_ORDER = ['gnews', 'manual', '60sec', 'currentaffairs'];

/* ============================================
   RENDER TAB VIEW
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
                background:${isActive ? t.color : theme.inactiveTabBg};
                color:${isActive ? '#fff' : theme.inactiveTabText};
                box-shadow:${isActive ? `0 2px 8px ${t.shadow}` : 'none'};
                position:relative;">
                ${t.label}
                ${count > 0 ? `<span style="position:absolute;top:-4px;right:-2px;background:${isActive ? 'rgba(255,255,255,0.3)' : t.color};color:white;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;min-width:14px;line-height:16px;">${count}</span>` : ''}
            </button>`;
    }).join('');

    let html = `
        <div style="position:sticky;top:0;z-index:100;background:${theme.headerBg};padding:10px 16px;border-bottom:1px solid ${theme.headerBorder};">
            <div style="display:flex;gap:8px;margin-bottom:10px;">${tabButtons}</div>
            ${lastUpdatedTime ? `<div style="text-align:center;color:${theme.updatedColor};font-size:11px;">🕐 Updated ${new Date(lastUpdatedTime).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true})}</div>` : ''}
        </div>
        <div style="margin:20px 16px 12px 16px;display:flex;align-items:center;gap:10px;">
            <div style="width:4px;height:24px;background:${cfg.color};border-radius:2px;"></div>
            <h2 style="color:${theme.sectionTitleColor};font-size:20px;font-weight:700;margin:0;">${cfg.icon} ${cfg.title}</h2>
            <span style="background:${cfg.color};color:white;font-size:12px;padding:4px 12px;border-radius:12px;margin-left:auto;">${activeArticles.length}</span>
        </div>`;

    if (activeArticles.length > 0) {
        if (currentTab === '60sec') {
            html += `<div style="padding:0 16px 20px 16px;">${render60SecDigest(activeArticles)}</div>`;
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
   ⚡ 60 SEC — BULLETIN DIGEST VIEW
============================================ */
const SECTION_COLORS = [
    '#1a237e','#1b5e20','#4a148c','#b71c1c',
    '#e65100','#006064','#33691e','#880e4f',
    '#0d47a1','#37474f','#4e342e','#1a5c2a',
];

function parseBulletinContent(content) {
    if (!content) return [];
    const lines    = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const sections = [];
    let currentSection = null;

    for (const line of lines) {
        const isNumberedPoint = /^\d+[\.\)]\s/.test(line);
        const isBulletPoint   = /^[-•*]\s/.test(line);

        if (!isNumberedPoint && !isBulletPoint && line.length > 3) {
            currentSection = { header: line, points: [] };
            sections.push(currentSection);
        } else if (isNumberedPoint && currentSection) {
            const text = line.replace(/^\d+[\.\)]\s*/, '').trim();
            if (text) currentSection.points.push(text);
        } else if (isBulletPoint && currentSection) {
            const text = line.replace(/^[-•*]\s*/, '').trim();
            if (text) currentSection.points.push(text);
        } else if (currentSection && line.length > 5) {
            currentSection.points.push(line);
        } else if (!currentSection && line.length > 5) {
            currentSection = { header: '', points: [line] };
            sections.push(currentSection);
        }
    }
    return sections;
}

function render60SecDigest(articles) {
    const isDark     = document.body.classList.contains('dark');
    const cardText   = isDark ? '#ccc'    : '#222';
    const metaBg     = isDark ? '#1a1a1a' : '#fff';
    const metaBorder = isDark ? '#2a2a2a' : '#e0e0e0';

    const sorted = [...articles].sort((a, b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));

    return sorted.map((item, articleIndex) => {
        const id      = String(item._id || item.articleId || item.id || articleIndex).replace(/[^a-zA-Z0-9-]/g, '');
        const title   = item.title   || "Today's Digest";
        const content = item.content || item.description || '';
        const source  = item.source  || 'Centrinsic NPT';
        const date    = item.createdAt
            ? new Date(item.createdAt).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
            : 'Today';

        const sections    = parseBulletinContent(content);
        const totalPoints = sections.reduce((sum, s) => sum + s.points.length, 0);

        let digestHTML = '';

        if (sections.length > 0) {
            sections.forEach((section, sIdx) => {
                const color = SECTION_COLORS[sIdx % SECTION_COLORS.length];
                digestHTML += `
                    <div style="background:${color};padding:12px 16px;margin:${sIdx===0?'0':'20px'} -16px 14px -16px;display:flex;align-items:center;gap:10px;">
                        <div style="width:3px;height:20px;background:rgba(255,255,255,0.5);border-radius:2px;flex-shrink:0;"></div>
                        <span style="color:#fff;font-size:14px;font-weight:800;letter-spacing:0.3px;line-height:1.3;">${escapeHtml(section.header)}</span>
                    </div>`;
                section.points.forEach((point, pIdx) => {
                    const colonIdx = point.indexOf(':');
                    let boldPart = '', restPart = point;
                    if (colonIdx > 0 && colonIdx < 60) {
                        boldPart = point.substring(0, colonIdx);
                        restPart = point.substring(colonIdx + 1).trim();
                    }
                    digestHTML += `
                        <div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'};">
                            <span style="background:${color};color:white;font-size:11px;font-weight:800;min-width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">${pIdx+1}</span>
                            <span style="color:${cardText};font-size:14px;line-height:1.65;flex:1;">
                                ${boldPart ? `<strong style="color:${isDark?'#fff':'#111'};">${escapeHtml(boldPart)}:</strong> ` : ''}${escapeHtml(restPart)}
                            </span>
                        </div>`;
                });
            });
        } else {
            digestHTML = `<p style="color:${cardText};font-size:14px;line-height:1.7;padding:8px 0;">${escapeHtml(content)}</p>`;
        }

        return `
            <div style="background:${metaBg};border-radius:20px;margin-bottom:20px;overflow:hidden;border:1px solid ${metaBorder};box-shadow:0 2px 12px rgba(0,0,0,0.08);">
                <div style="background:linear-gradient(135deg,#FF9800,#F57C00);padding:18px 20px;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                        <span style="font-size:22px;">⚡</span>
                        <div>
                            <div style="color:#fff;font-size:17px;font-weight:800;line-height:1.3;">${escapeHtml(title)}</div>
                            <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:2px;">${escapeHtml(date)}</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <span style="background:rgba(255,255,255,0.2);color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;">${sections.length} sections</span>
                        <span style="background:rgba(255,255,255,0.2);color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;">${totalPoints} updates</span>
                        <span style="background:rgba(255,255,255,0.2);color:#fff;font-size:11px;padding:3px 10px;border-radius:12px;">📰 ${escapeHtml(source)}</span>
                    </div>
                </div>
                <div style="padding:0 16px 16px 16px;" id="digestContent_${id}">${digestHTML}</div>
                <div style="padding:12px 16px;border-top:1px solid ${metaBorder};display:flex;align-items:center;justify-content:space-between;background:${isDark?'#0a0a0a':'#fafafa'};flex-wrap:wrap;gap:8px;">
                    <span style="color:${isDark?'#555':'#aaa'};font-size:11px;">Centrinsic NPT • 60 Sec Digest</span>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <select id="digestTranslateSelect_${id}" onchange="translate60SecDigest('${id}', this.value)" style="background:#FF9800;color:white;border:none;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;outline:none;">
                            <option value="en" style="background:#333;color:#fff;">🌐 English</option>
                            <option value="hi" style="background:#333;color:#fff;">हिंदी</option>
                            <option value="te" style="background:#333;color:#fff;">తెలుగు</option>
                            <option value="ta" style="background:#333;color:#fff;">தமிழ்</option>
                            <option value="kn" style="background:#333;color:#fff;">ಕನ್ನಡ</option>
                            <option value="ml" style="background:#333;color:#fff;">മലയാളം</option>
                        </select>
                        <button onclick="share60SecDigest('${id}')" style="background:#FF9800;border:none;border-radius:8px;color:white;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;">📤 Share</button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

async function translate60SecDigest(articleId, targetLang) {
    const digestEl = document.getElementById(`digestContent_${articleId}`);
    const selectEl = document.getElementById(`digestTranslateSelect_${articleId}`);
    
    if (!digestEl || !targetLang) return;
    
    // Store original if not already stored
    if (!original60SecContent[articleId]) {
        original60SecContent[articleId] = digestEl.innerHTML;
    }
    
    // Reset to original if English selected
    if (targetLang === 'en') {
        digestEl.innerHTML = original60SecContent[articleId];
        if (selectEl) selectEl.value = 'en';
        return;
    }
    
    // Get text content to translate
    const textContent = digestEl.innerText;
    
    digestEl.innerHTML = '<div style="text-align:center;color:#FF9800;padding:20px;"><span>🌐 Translating to ' + targetLang.toUpperCase() + '...</span></div>';
    
    try {
        const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(textContent)}`);
        const data = await response.json();
        
        let translated = '';
        if (data && data[0]) {
            data[0].forEach(seg => {
                if (seg[0]) translated += seg[0];
            });
        }
        
        if (translated) {
            digestEl.innerHTML = `<p style="color:#222;font-size:14px;line-height:1.7;padding:8px 0;white-space:pre-wrap;">${escapeHtml(translated)}</p>`;
            showToast(`✅ Translated to ${targetLang.toUpperCase()}`);
        } else {
            digestEl.innerHTML = original60SecContent[articleId];
            if (selectEl) selectEl.value = 'en';
            showToast('⚠️ Translation not available');
        }
    } catch (err) {
        console.error('Translation error:', err);
        digestEl.innerHTML = original60SecContent[articleId];
        if (selectEl) selectEl.value = 'en';
        showToast('⚠️ Translation failed');
    }
}

async function share60SecDigest(articleId) {
    const article = articlesCache.get(articleId) || allArticles.find(a => String(a._id||a.id||a.articleId).replace(/[^a-zA-Z0-9-]/g,'') === articleId);
    if (!article) return;
    const title     = article.title || "Today's Digest";
    const shareText = `⚡ ${title}\n\n📲 Read today's digest on Centrinsic NPT:\nhttps://centrinsicnpt.com`;
    if (window.Capacitor?.Plugins?.Share) {
        try { await window.Capacitor.Plugins.Share.share({ title, text: shareText, url: 'https://centrinsicnpt.com' }); return; }
        catch(e) { if ((e?.message||'').toLowerCase().includes('cancel')) return; }
    }
    if (navigator.share) {
        try { await navigator.share({ title, text: shareText }); return; }
        catch(e) { if (e.name === 'AbortError') return; }
    }
    copyToClipboard(shareText);
    showToast('🔗 Link copied!');
}

function open60SecBulletin(articleId) {
    const article = articlesCache.get(articleId);
    if (article) { currentArticle = article; displayArticleDetail(); }
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
        const isSaved  = getSavedArticles().some(s => String(s._id||s.id||s.articleId) === id);
        const imageUrl = getImageUrl(item.image);
        const isCA     = getArticleTab(item) === 'currentaffairs';

        return `
            <article class="news-card"
                data-article-id="${escapeHtml(id)}"
                data-article-title="${escapeHtml(title)}"
                data-article-source="${escapeHtml(item.source||'Unknown')}"
                onclick="handleArticleClick(this)">
                <div class="news-content">
                    ${isCA ? `<span style="background:#e53935;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px;display:inline-block;margin-bottom:6px;">🔴 CURRENT AFFAIRS</span>` : ''}
                    <h3 class="news-title">${isSaved ? '🔖 ' : ''}${escapeHtml(title)}</h3>
                    <p class="news-excerpt">${escapeHtml(excerpt)}</p>
                    <div class="news-meta">
                        <span>${escapeHtml(item.source||'Unknown')}</span>
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
    const found = allArticles.find(a => a.title === articleTitle && a.source === articleSource);
    if (found) { currentArticle = found; displayArticleDetail(); return; }
    if (!articleId.startsWith('gnews_')) {
        fetch(`${API_ARTICLES}/${articleId}`).then(r => r.json()).then(a => { currentArticle = a; displayArticleDetail(); }).catch(() => showToast("Failed to load article"));
    } else { showToast("Article expired. Please refresh."); }
}

function getSavedArticles() {
    try { return JSON.parse(localStorage.getItem("saved_articles") || "[]"); } catch (e) { return []; }
}

function updateSavedFolder() {
    const folder  = document.getElementById("savedFolder");
    const countEl = document.getElementById("savedCount");
    const saved   = getSavedArticles();
    if (folder) { folder.style.display = saved.length > 0 ? 'flex' : 'none'; if (countEl) countEl.textContent = `${saved.length} saved`; }
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
        return `<article class="news-card" data-article-id="${escapeHtml(id)}" data-article-title="${escapeHtml(title)}" data-article-source="${escapeHtml(item.source||'Unknown')}" onclick="handleArticleClick(this)">
            <div class="news-content"><h3 class="news-title">🔖 ${escapeHtml(title)}</h3><p class="news-meta"><span>${escapeHtml(date)}</span></p></div>
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
        fetch(`${API_ARTICLES}/${cleanId}`).then(r => r.json()).then(a => { currentArticle = a; displayArticleDetail(); }).catch(() => showToast("Failed to load article"));
    } else { showToast("Article expired. Please refresh."); }
}

function displayArticleDetail() {
    const articleBody = document.getElementById("articleBody");
    const saveBtn     = document.getElementById("saveBtn");
    if (!articleBody || !currentArticle) { showToast("Article not found"); return; }

    originalArticleContent = null;

    const articleId  = currentArticle._id || currentArticle.id || currentArticle.articleId;
    const isSaved    = getSavedArticles().some(s => String(s._id||s.id||s.articleId) === String(articleId));
    if (saveBtn) { saveBtn.innerHTML = isSaved ? '✓ Saved' : '💾 Save'; saveBtn.classList.toggle('saved', isSaved); }

    let date = "Recent";
    if (currentArticle.createdAt || currentArticle.publishedAt) {
        date = new Date(currentArticle.createdAt || currentArticle.publishedAt)
            .toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).toLowerCase();
    }

    const imageUrl   = getImageUrl(currentArticle.image);
    const source     = currentArticle.source   || 'Unknown';
    const category   = currentArticle.category || 'General';
    const articleTab = getArticleTab(currentArticle);
    const is60sec    = articleTab === '60sec';
    const isCA       = articleTab === 'currentaffairs';

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
    const catColor     = is60sec ? '#FF9800' : isCA ? '#e53935' : '#4CAF50';
    const catLabel     = is60sec ? '⚡ 60 Sec' : isCA ? '🔴 Current Affairs' : category;

    let bodyContent = '';
    if (is60sec) {
        const sections = parseBulletinContent(currentArticle.content || '');
        if (sections.length > 0) {
            bodyContent = `<div class="article-body-text" style="color:${bodyColor};line-height:1.8;margin-bottom:20px;">`;
            sections.forEach((section, sIdx) => {
                const color = SECTION_COLORS[sIdx % SECTION_COLORS.length];
                bodyContent += `<div style="background:${color};padding:10px 14px;border-radius:10px;margin:${sIdx===0?'0':'16px'} 0 10px 0;"><span style="color:#fff;font-size:14px;font-weight:800;">${escapeHtml(section.header)}</span></div>`;
                section.points.forEach((point, pIdx) => {
                    const colonIdx = point.indexOf(':');
                    let boldPart = '', restPart = point;
                    if (colonIdx > 0 && colonIdx < 60) { boldPart = point.substring(0, colonIdx); restPart = point.substring(colonIdx+1).trim(); }
                    bodyContent += `
                        <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid ${detailBorder};">
                            <span style="background:${color};color:white;font-size:11px;font-weight:800;min-width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">${pIdx+1}</span>
                            <span style="color:${bodyColor};font-size:14px;line-height:1.65;flex:1;">${boldPart ? `<strong style="color:${isDark?'#fff':'#111'};">${escapeHtml(boldPart)}:</strong> ` : ''}${escapeHtml(restPart)}</span>
                        </div>`;
                });
            });
            bodyContent += `</div>`;
        } else {
            bodyContent = `<div class="article-body-text" style="color:${bodyColor};line-height:1.8;margin-bottom:20px;font-size:14px;">${escapeHtml(currentArticle.content||'')}</div>`;
        }
    } else {
        bodyContent = `<div class="article-body-text" style="color:${bodyColor};line-height:1.8;margin-bottom:20px;font-size:16px;">${escapeHtml(currentArticle.content || currentArticle.description || "No content available")}</div>`;
    }

    articleBody.innerHTML = `
        ${imageUrl && !is60sec ? `<div class="article-image-container"><img src="${escapeHtml(imageUrl)}" class="article-image" loading="lazy" onerror="this.style.display='none'"></div>` : ''}
        <div class="article-text-content">
            <h1 class="article-headline">${escapeHtml(currentArticle.title || "Untitled")}</h1>
            <div class="article-meta-row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:10px 0;border-bottom:1px solid ${detailBorder};">
                <span class="article-date" style="color:${metaColor};font-size:14px;">${escapeHtml(date)}</span>
                <button onclick="shareCurrentArticle()" id="shareBtn" style="background:#4CAF50;border:none;border-radius:8px;color:white;padding:8px 16px;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:5px;">📤 Share</button>
            </div>
            ${!is60sec ? `
            <div id="translateBar" style="margin-bottom:16px;padding:10px 14px;background:${transBg};border-radius:12px;border:1px solid ${detailBorder};display:flex;align-items:center;gap:10px;">
                <span style="font-size:13px;color:${metaColor};white-space:nowrap;">🌐 Translate:</span>
                <select id="translateSelect" onchange="translateArticle(this.value)" style="flex:1;background:${selectBg};color:${selectColor};border:1px solid ${selectBorder};border-radius:20px;padding:8px 14px;font-size:13px;font-family:inherit;cursor:pointer;outline:none;">
                    <option value="en">↩ Original (English)</option>
                    <optgroup label="── Indian Languages ──">
                        <option value="hi">🇮🇳 Hindi</option><option value="te">తె Telugu</option><option value="ta">த Tamil</option>
                        <option value="kn">ಕ Kannada</option><option value="ml">മ Malayalam</option><option value="bn">বাং Bengali</option>
                        <option value="mr">म Marathi</option><option value="gu">ગુ Gujarati</option><option value="pa">ਪ Punjabi</option>
                        <option value="ur">اردو Urdu</option><option value="or">ଓ Odia</option><option value="as">অ Assamese</option>
                        <option value="ne">ने Nepali</option><option value="si">සි Sinhala</option>
                    </optgroup>
                    <optgroup label="── World Languages ──">
                        <option value="zh">🇨🇳 Chinese</option><option value="ar">🇸🇦 Arabic</option><option value="fr">🇫🇷 French</option>
                        <option value="de">🇩🇪 German</option><option value="es">🇪🇸 Spanish</option><option value="ja">🇯🇵 Japanese</option>
                        <option value="ko">🇰🇷 Korean</option><option value="pt">🇵🇹 Portuguese</option><option value="ru">🇷🇺 Russian</option>
                        <option value="tr">🇹🇷 Turkish</option><option value="it">🇮🇹 Italian</option><option value="th">🇹🇭 Thai</option>
                        <option value="vi">🇻🇳 Vietnamese</option><option value="id">🇮🇩 Indonesian</option><option value="ms">🇲🇾 Malay</option>
                        <option value="sw">🌍 Swahili</option>
                    </optgroup>
                </select>
            </div>` : ''}
            ${bodyContent}
            <div style="background:${cardBg};border-radius:12px;padding:20px;margin:20px 0;border:1px solid ${detailBorder};">
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div style="display:flex;align-items:center;gap:10px;"><span style="color:${labelColor};font-size:14px;min-width:80px;">Source:</span><span style="color:#667eea;font-size:14px;font-weight:600;">${escapeHtml(source)}</span></div>
                    <div style="display:flex;align-items:center;gap:10px;"><span style="color:${labelColor};font-size:14px;min-width:80px;">Category:</span><span style="background:${catColor};color:white;font-size:12px;font-weight:600;padding:3px 10px;border-radius:10px;">${escapeHtml(catLabel)}</span></div>
                    <div style="display:flex;align-items:center;gap:10px;"><span style="color:${labelColor};font-size:14px;min-width:80px;">Published:</span><span style="color:${metaColor};font-size:14px;">${escapeHtml(date)}</span></div>
                </div>
            </div>
            ${originalLink !== '#' ? `
            <div style="margin-bottom:30px;">
                <button onclick="openExternalLink('${escapeHtml(originalLink)}')" style="display:flex;align-items:center;justify-content:center;gap:10px;background:${linkBg};border:1px solid ${linkBorder};border-radius:12px;padding:16px;color:${linkColor};font-size:15px;font-weight:500;width:100%;cursor:pointer;">
                    <span>📰</span><span>Read Full Original Article</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;margin-left:auto;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </button>
            </div>` : ''}
        </div>`;

    showScreen("detail");
    const detailContent = document.getElementById("detailContent");
    if (detailContent) detailContent.scrollTop = 0;
    console.log("📄 Article detail screen displayed - ready for back button");
}

/* ============================================
   TRANSLATE
============================================ */
async function translateArticle(targetLang) {
    const bodyEl     = document.querySelector('.article-body-text');
    const headlineEl = document.querySelector('.article-headline');
    if (!bodyEl || !currentArticle) return;
    if (targetLang === 'en') {
        if (originalArticleContent) { bodyEl.textContent = originalArticleContent.body; if (headlineEl) headlineEl.textContent = originalArticleContent.title; originalArticleContent = null; }
        highlightTranslateBtn('en'); return;
    }
    if (!originalArticleContent) { originalArticleContent = { body: bodyEl.textContent, title: headlineEl ? headlineEl.textContent : '' }; }
    bodyEl.innerHTML = '<span style="color:#888;font-size:14px;">🌐 Translating...</span>';
    if (headlineEl) headlineEl.style.opacity = '0.5';
    try {
        const bodyData = await (await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(originalArticleContent.body)}`)).json();
        let translated = ''; if (bodyData && bodyData[0]) bodyData[0].forEach(seg => { if (seg[0]) translated += seg[0]; });
        bodyEl.textContent = translated || 'Translation not available.';
        if (headlineEl && originalArticleContent.title) {
            const titleData = await (await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(originalArticleContent.title)}`)).json();
            let translatedTitle = ''; if (titleData && titleData[0]) titleData[0].forEach(seg => { if (seg[0]) translatedTitle += seg[0]; });
            if (translatedTitle) headlineEl.textContent = translatedTitle;
        }
        if (headlineEl) headlineEl.style.opacity = '1';
    } catch (err) {
        bodyEl.textContent = originalArticleContent.body;
        if (headlineEl) { headlineEl.textContent = originalArticleContent.title; headlineEl.style.opacity = '1'; }
        originalArticleContent = null;
        const select = document.getElementById('translateSelect'); if (select) select.value = 'en';
        showToast('⚠️ Translation failed.');
    }
}

function highlightTranslateBtn(lang) { const s = document.getElementById('translateSelect'); if (s) s.value = lang; }

function openExternalLink(url) {
    if (!url || url === '#') { showToast("Link not available"); return; }
    if (window.Capacitor?.Plugins?.Browser) { window.Capacitor.Plugins.Browser.open({ url }); }
    else if (window.cordova?.InAppBrowser)  { window.cordova.InAppBrowser.open(url, '_system'); }
    else window.open(url, '_blank', 'noopener,noreferrer');
}

function saveCurrentArticle() {
    if (!currentArticle) return;
    const saveBtn     = document.getElementById("saveBtn");
    let savedArticles = getSavedArticles();
    const articleId   = currentArticle._id || currentArticle.id || currentArticle.articleId;
    const index       = savedArticles.findIndex(s => String(s._id||s.id||s.articleId) === String(articleId));
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

async function shareCurrentArticle() {
    if (!currentArticle) return;
    const title     = currentArticle.title || "Check out this article";
    const appLink   = "https://centrinsicnpt.com";
    const content   = currentArticle.content ? currentArticle.content.substring(0, 200) + '...' : '';
    const shareText = `📰 ${title}\n\n${content}\n\n📲 Read more on Centrinsic NPT:\n${appLink}`;
    const imageUrl  = getImageUrl(currentArticle.image);
    const shareBtn  = document.getElementById('shareBtn');
    if (shareBtn) { shareBtn.innerHTML = '⏳ Sharing...'; shareBtn.disabled = true; }
    try {
        if (window.Capacitor?.Plugins?.Share) {
            const { Share, Filesystem } = window.Capacitor.Plugins;
            let fileUri = null;
            if (imageUrl && Filesystem) {
                try {
                    const imgBlob = await (await fetch(imageUrl)).blob();
                    const base64  = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(imgBlob); });
                    const fileName = `centrinsic_${Date.now()}.jpg`;
                    await Filesystem.writeFile({ path: fileName, data: base64, directory: 'CACHE' });
                    const uriResult = await Filesystem.getUri({ path: fileName, directory: 'CACHE' });
                    fileUri = uriResult.uri;
                } catch(e) {}
            }
            if (fileUri) { await Share.share({ title, text: shareText, url: appLink, files: [fileUri] }); }
            else          { await Share.share({ title, text: shareText, url: appLink }); }
            return;
        }
        if (navigator.share) { try { await navigator.share({ title, text: shareText, url: appLink }); return; } catch(e) { if (e.name === 'AbortError') return; } }
        copyToClipboard(shareText);
        showToast('🔗 Link copied!');
    } catch (err) {
        const msg = (err?.message || err?.errorMessage || '').toLowerCase();
        if (msg.includes('cancel') || err?.name === 'AbortError') return;
        if (window.Capacitor?.Plugins?.Share) { try { await window.Capacitor.Plugins.Share.share({ title, text: shareText, url: appLink }); return; } catch(e) {} }
        copyToClipboard(shareText);
        showToast('🔗 Link copied!');
    } finally {
        if (shareBtn) { shareBtn.innerHTML = '📤 Share'; shareBtn.disabled = false; }
    }
}

function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).then(() => showToast("✅ Link copied!")).catch(() => fallbackCopy(text)); }
    else fallbackCopy(text);
}

function fallbackCopy(text) {
    const el = document.createElement('textarea');
    el.value = text; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
    showToast("✅ Link copied!");
}

function refreshFeed() { isOnline = false; loadNews(); showToast("Refreshing..."); }

function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast'; document.body.appendChild(toast); }
    if (toastTimeout) clearTimeout(toastTimeout);
    toast.textContent = msg; toast.classList.add('show');
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

function bindMobileButtons() {
    const logoutBtn = document.getElementById("logoutButton");
    if (logoutBtn) logoutBtn.onpointerup = () => logout();
    const deleteBtn = document.getElementById("deleteDataButton");
    if (deleteBtn) deleteBtn.onpointerup = () => clearAll();
}

/* ============================================
   MOBILE BACK BUTTON HANDLER - PREVENTS APP CLOSE
============================================ */
let backButtonProcessing = false;
let lastBackPressTime = 0;
let backPressCount = 0;

function setupMobileBackButton() {
    console.log("🚀 Setting up mobile back button handler...");
    
    // ═══ CAPACITOR (for native iOS/Android apps) ═══
    if (window.Capacitor?.Plugins?.App) {
        console.log("✅ Capacitor detected - registering back button");
        try {
            window.Capacitor.Plugins.App.addListener('backButton', (e) => {
                console.log("🔙 CAPACITOR BACK BUTTON PRESSED");
                handleMobileBack();
                // DO NOT call exit() - let our handler manage navigation
            });
        } catch (err) {
            console.warn("⚠️ Capacitor setup error:", err);
        }
    }
    
    // ═══ CORDOVA (for older hybrid apps) ═══
    if (window.cordova) {
        console.log("✅ Cordova detected - registering back button");
        document.addEventListener('backbutton', (e) => {
            e.preventDefault();  // CRITICAL: Prevents app close
            console.log("🔙 CORDOVA BACK BUTTON PRESSED");
            handleMobileBack();
        }, false);
    }
    
    // ═══ Browser/PWA back button ═══
    window.addEventListener('popstate', (e) => {
        e.preventDefault();
        console.log("🔙 BROWSER POPSTATE EVENT");
        handleMobileBack();
    });
    
    // ═══ Alternative: Direct key handler ═══
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.keyCode === 27) {
            e.preventDefault();
            console.log("🔙 ESCAPE KEY PRESSED");
            handleMobileBack();
        }
    });
    
    console.log("✅ Mobile back button fully initialized");
}

function handleMobileBack() {
    // Prevent rapid consecutive back presses
    if (backButtonProcessing) {
        console.log("⚠️ Back button already processing - ignoring");
        return;
    }
    
    backButtonProcessing = true;
    
    // Get the currently active screen
    const activeScreenEl = document.querySelector('.screen.active');
    const currentScreen = activeScreenEl?.id || 'home';
    
    console.log("═══════════════════════════════════════");
    console.log("🔙 BACK BUTTON HANDLER TRIGGERED");
    console.log("📍 Current screen:", currentScreen);
    console.log("═══════════════════════════════════════");
    
    // Route navigation based on current screen
    switch(currentScreen) {
        case 'detail':
            // FROM ARTICLE DETAIL → GO TO HOME
            console.log("📖 Navigating: DETAIL → HOME");
            showScreen('home');
            break;
            
        case 'login':
            // FROM LOGIN → GO TO ABOUT
            console.log("🔐 Navigating: LOGIN → ABOUT");
            showScreen('about');
            break;
            
        case 'aboutpage':
            // FROM ABOUT PAGE → GO TO PREFERENCES
            console.log("ℹ️ Navigating: ABOUTPAGE → PREFERENCES");
            showScreen('preferences');
            break;
            
        case 'contact':
            // FROM CONTACT → GO TO PREFERENCES
            console.log("📧 Navigating: CONTACT → PREFERENCES");
            showScreen('preferences');
            break;
            
        case 'saved':
            // FROM SAVED → GO TO HOME
            console.log("💾 Navigating: SAVED → HOME");
            showScreen('home');
            break;
            
        case 'preferences':
            // FROM PREFERENCES → GO TO HOME
            console.log("⚙️ Navigating: PREFERENCES → HOME");
            showScreen('home');
            break;
            
        case 'about':
        case 'home':
        case 'splash':
            // MAIN SCREENS - PREVENT EXIT
            console.log("🛑 BLOCKING EXIT - Staying on", currentScreen);
            showToast("App navigation active");
            break;
            
        default:
            // UNKNOWN SCREEN - GO TO HOME
            console.log("❓ Unknown screen:", currentScreen, "→ defaulting to HOME");
            showScreen('home');
    }
    
    console.log("✅ Back button action completed\n");
    
    // Re-enable back button after delay
    setTimeout(() => {
        backButtonProcessing = false;
    }, 300);
}

console.log("✅ Centrinsic NPT — getArticleTab() single source of truth for all routing");