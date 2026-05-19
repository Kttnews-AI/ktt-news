// ============================================
// CENTRINSIC NPT NEWS APP - FULLY UPDATED
// WITH: FIXED MOBILE BACK BUTTON + HISTORY API
// WITH: DYNAMIC TAB ORDER — AI-D first when it has content, else AI-S first
// WITH: STARTUP EVENTS PROPER EVENT CARD VIEW + COUNTDOWN + AUTO-EXPIRE
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
let original60SecContent   = {};
let navigationHistory      = []; // Track navigation stack

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
    
    // Setup back button first thing
    setupMobileBackButton();
    setupHistoryHandling();
    
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
    
    // Set initial history state — SAFELY (file:// WebViews throw SecurityError here)
    try {
        history.replaceState({ screen: 'splash' }, '', '#splash');
    } catch (e) {
        console.warn('History API not available (file:// URL):', e);
    }
    
    showScreen("splash", false); // Don't push state on init
    
    // Main transition after splash animation (2.2s to match CSS loading bar)
    setTimeout(() => {
        if (currentUser && currentUser.loggedIn) { 
            navigateTo('home'); 
            loadNews(); 
        }
        else {
            navigateTo('about');
        }
    }, 2200);
    
    // EMERGENCY FALLBACK: if anything above crashes, force past splash after 4 seconds
    setTimeout(() => {
        const splash = document.getElementById('splash');
        if (splash && splash.classList.contains('active')) {
            console.warn('🚨 Emergency splash bypass triggered');
            if (currentUser && currentUser.loggedIn) {
                showScreen('home', false);
                loadNews();
            } else {
                showScreen('about', false);
            }
        }
    }, 4000);
    
    // Logout Button Handler
    setTimeout(() => {
        const logoutBtn = document.getElementById("logoutButton");
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                logout();
            }, { capture: true });
        }
        const deleteBtn = document.getElementById("deleteDataButton");
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                clearAll();
            }, { capture: true });
        }
    }, 500);
}

/* ============================================
   HISTORY API & BACK BUTTON MANAGEMENT
============================================ */

function setupHistoryHandling() {
    // Handle browser back button (for web/PWA)
    window.addEventListener('popstate', (e) => {
        console.log("🔙 POPSTATE EVENT:", e.state);
        if (e.state && e.state.screen) {
            handleBackNavigation(e.state.screen);
        } else {
            // No state, try to determine current screen
            const hash = window.location.hash.replace('#', '');
            if (hash && hash !== getCurrentScreenId()) {
                handleBackNavigation(hash);
            } else {
                handleBackNavigation('home');
            }
        }
    });
}

function setupMobileBackButton() {
    console.log("🚀 Setting up mobile back button handler...");
    
    // Capacitor/Cordova back button
    if (window.Capacitor?.Plugins?.App) {
        try {
            window.Capacitor.Plugins.App.addListener('backButton', (e) => {
                console.log("🔙 CAPACITOR BACK BUTTON", e);
                // Prevent default exit
                e?.preventDefault?.();
                handleMobileBack();
            });
        } catch (err) {
            console.warn("⚠️ Capacitor setup error:", err);
        }
    }
    
    // Cordova specific
    if (window.cordova) {
        document.addEventListener('backbutton', (e) => {
            console.log("🔙 CORDOVA BACK BUTTON");
            e.preventDefault();
            handleMobileBack();
        }, false);
    }
    
    // Android WebView back button (using history API) — SAFE for file://
    window.addEventListener('hashchange', (e) => {
        console.log("🔙 HASH CHANGE:", e.oldURL, "->", e.newURL);
        const newHash = window.location.hash.replace('#', '');
        if (newHash && newHash !== getCurrentScreenId()) {
            // Don't push state, just show screen
            showScreen(newHash, false);
        }
    });
}

function handleMobileBack() {
    const currentScreen = getCurrentScreenId();
    console.log("🔙 BACK BUTTON - Current:", currentScreen);
    
    // Determine where to go back to
    let targetScreen = 'home';
    
    switch(currentScreen) {
        case 'detail':
            targetScreen = 'home';
            break;
        case 'login':
            targetScreen = 'about';
            break;
        case 'aboutpage':
        case 'contact':
            targetScreen = 'preferences';
            break;
        case 'saved':
        case 'preferences':
            targetScreen = 'home';
            break;
        case 'about':
            // On about screen, stay there (don't exit app)
            showToast("Press back again to exit");
            return;
        case 'home':
            // On home screen, stay there (don't exit app)
            showToast("App is running");
            return;
        default:
            targetScreen = 'home';
    }
    
    console.log("🔙 NAVIGATING:", currentScreen, "->", targetScreen);
    navigateTo(targetScreen);
}

function handleBackNavigation(screenId) {
    // Show screen without pushing new state (we're going back)
    if (document.getElementById(screenId)) {
        showScreen(screenId, false);
    } else {
        showScreen('home', false);
    }
}

function getCurrentScreenId() {
    const activeScreen = document.querySelector('.screen.active');
    return activeScreen?.id || 'home';
}

// Main navigation function - use this instead of showScreen directly
function navigateTo(screenId) {
    // Push state for history tracking (safely for file:// URLs)
    try {
        history.pushState({ screen: screenId }, '', `#${screenId}`);
    } catch (e) {
        console.warn('History API not available (file:// URL):', e);
    }
    showScreen(screenId, false); // State already pushed (or failed safely)
}

/* ============================================
   SCREEN NAVIGATION
============================================ */
function showScreen(screenId, pushState = true) {
    // Hide all screens — clear inline styles and let CSS classes handle visibility
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = '';        // ← clear inline display
        screen.style.visibility = '';     // ← clear inline visibility
        screen.style.opacity = '';        // ← clear inline opacity
    });
    
    // Show target screen
    const target = document.getElementById(screenId);
    if (!target) {
        console.error("Screen not found:", screenId);
        // Emergency fallback: show about screen so user isn't trapped
        const fallback = document.getElementById('about') || document.getElementById('home');
        if (fallback) fallback.classList.add('active');
        return;
    }
    
    target.classList.add('active');
    // Splash needs flex; everything else relies on CSS .screen.active { display: block }
    if (screenId === 'splash') {
        target.style.display = 'flex';
    }
    
    // Update URL safely (wrapped in try-catch for file:// WebViews)
    if (pushState) {
        try {
            if (window.location.hash !== `#${screenId}`) {
                history.pushState({ screen: screenId }, '', `#${screenId}`);
            }
        } catch (e) {
            console.warn('History API not available (file:// URL):', e);
        }
    }
    
    // Show/hide bottom nav
    const showNav = ['home', 'saved', 'preferences'].includes(screenId);
    document.querySelectorAll('.bottom-nav').forEach(nav => {
        nav.style.display = showNav ? 'flex' : 'none';
    });
    
    // Screen-specific logic
    if (screenId === 'home') { 
        updateSavedFolder(); 
        setTimeout(loadNews, 100); 
    }
    if (screenId === 'saved') setTimeout(loadSavedArticles, 100);
    if (screenId === 'preferences') {
        setTimeout(() => { 
            attachLogoutListener(); 
            attachClearAllListener(); 
            attachDarkModeListener(); 
        }, 300);
        updateUserDisplay();
        highlightSizeButton(localStorage.getItem("font_size") || "medium");
    }
    
    // Scroll to top
    window.scrollTo(0, 0);
    setTimeout(bindMobileButtons, 200);
}

/* ============================================
   ✅ SINGLE SOURCE OF TRUTH — which tab does this article belong to?
============================================ */
function getArticleTab(article) {
    if (!article.isManual) return 'gnews';
    const cat    = (article.category    || '').toLowerCase().trim();
    const type   = (article.type        || '').toLowerCase().trim();
    const tag    = (article.tag         || '').toLowerCase().trim();
    const source = (article.source      || '').toLowerCase().trim();
    const is60sec =
        cat === '60sec' || cat === '60 sec' || cat === '60seconds' || cat === '60-sec' || cat === 'sixtysec' ||
        type === '60sec' || tag === '60sec' || article.is60sec === true || article.bulletinDigest === true;
    if (is60sec) return '60sec';
    const isCA = cat === 'currentaffairs' || cat === 'current affairs' || cat === 'current_affairs' ||
        type === 'currentaffairs' || tag === 'currentaffairs' || article.isCurrentAffairs === true;
    if (isCA) return 'currentaffairs';
    const isStartup = cat === 'startupevents' || cat === 'startup events' || cat === 'startup_events' ||
        type === 'startupevents' || tag === 'startupevents' || article.isStartupEvents === true;
    if (isStartup) return 'startupevents';
    return 'manual';
}

/* ============================================
   DYNAMIC TAB ORDER — AI-D first when it has content, else AI-S first
============================================ */
function getDynamicTabOrder(articles) {
    const manualCount = articles.filter(a => getArticleTab(a) === 'manual').length;
    if (manualCount > 0) {
        // AI-D has content → AI-D first, then AI-S, then others
        return ['manual', 'gnews', '60sec', 'startupevents', 'currentaffairs'];
    }
    // Default: AI-S first
    return ['gnews', 'manual', '60sec', 'startupevents', 'currentaffairs'];
}

function getDefaultTab(articles) {
    const order = getDynamicTabOrder(articles);
    return order[0]; // First tab in dynamic order
}

/* ============================================
   EXPORT ALL FUNCTIONS TO WINDOW
============================================ */
function exportAllFunctions() {
    window.showScreen            = showScreen;
    window.navigateTo            = navigateTo;
    window.goToLogin             = () => navigateTo('login');
    window.skipLoginFromAbout    = () => { navigateTo('home'); loadNews(); };
    window.skipToHome            = () => { navigateTo('home'); loadNews(); };
    window.goBackToAbout         = () => navigateTo('about');
    window.goBack                = () => navigateTo('home');
    window.goHome                = () => navigateTo('home');
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
    window.shareStartupEvent     = shareStartupEvent;
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
    
    // Remove all existing listeners
    const newBtn = logoutBtn.cloneNode(true);
    logoutBtn.parentNode.replaceChild(newBtn, logoutBtn);
    
    // Multiple event handlers to ensure it works on all devices
    newBtn.addEventListener('click', (e) => { e.preventDefault(); logout(); });
    newBtn.addEventListener('touchstart', (e) => { e.preventDefault(); logout(); });
}

function attachClearAllListener() {
    const clearBtn = document.querySelector('.btn-danger');
    if (!clearBtn) return;
    
    // Remove all existing listeners
    const newBtn = clearBtn.cloneNode(true);
    clearBtn.parentNode.replaceChild(newBtn, clearBtn);
    
    // Multiple event handlers to ensure it works on all devices
    newBtn.addEventListener('click', (e) => { e.preventDefault(); clearAll(); });
    newBtn.addEventListener('touchstart', (e) => { e.preventDefault(); clearAll(); });
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
    setTimeout(() => navigateTo('about'), 500);
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
            navigateTo('home');
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

        console.log('📊 Manual articles routing:');
        newsArray.filter(a => a.isManual).forEach(a => {
            console.log(`  tab="${getArticleTab(a)}" | category="${a.category}" | title="${(a.title||'').substring(0,40)}"`);
        });

        // ✅ DYNAMIC TAB SWITCHING: AI-D first if it has content, else AI-S
        currentTab = getDefaultTab(allArticles);

        renderTabView();
        updateSavedFolder();
    } catch (error) {
        console.error('Load news error:', error);
        const backup = localStorage.getItem("news_backup");
        if (backup) {
            allArticles = JSON.parse(backup);
            currentTab = getDefaultTab(allArticles); // ✅ Also switch on backup load
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
    'startupevents': {
        label: 'Startup', title: 'Startup Events', icon: '🚀',
        color: '#9c27b0', shadow: 'rgba(156,39,176,0.35)',
        emptyIcon: '🚀', emptyMsg: 'Startup events coming soon',
        filter: (a) => a.filter(x => getArticleTab(x) === 'startupevents')
    },
    'currentaffairs': {
        label: 'Current', title: 'Current Affairs', icon: '🔴',
        color: '#e53935', shadow: 'rgba(229,57,53,0.35)',
        emptyIcon: '🗞️', emptyMsg: 'Current affairs coming soon',
        filter: (a) => a.filter(x => getArticleTab(x) === 'currentaffairs')
    }
};

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

    // ✅ USE DYNAMIC TAB ORDER: AI-D first when it has content, else AI-S first
    const tabOrder       = getDynamicTabOrder(allArticles);
    const cfg            = TAB_CONFIG[currentTab] || TAB_CONFIG[tabOrder[0]];
    const activeArticles = cfg.filter(allArticles);

    const tabButtons = tabOrder.map(tabKey => {
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
            html += `<div style="padding:0 16px calc(100px + env(safe-area-inset-bottom)) 16px;">${render60SecDigest(activeArticles)}</div>`;
        } else if (currentTab === 'startupevents') {
            html += `<div style="padding:0 16px calc(100px + env(safe-area-inset-bottom)) 16px;">${renderStartupEvents(activeArticles)}</div>`;
        } else {
            html += `<div class="articles-list" style="padding:0 16px calc(100px + env(safe-area-inset-bottom)) 16px;">${renderArticleCards(activeArticles)}</div>`;
        }
    } else {
        html += `
            <div style="text-align:center;padding:60px 20px calc(100px + env(safe-area-inset-bottom)) 20px;">
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
                        <select id="digestTranslateSelect_${id}" onchange="translateDigestContent('${id}', this.value, 'digestContent_', 'digestTranslateSelect_')" style="background:#FF9800;color:white;border:none;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;outline:none;">
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

    // Store original HTML if not already stored
    if (!original60SecContent[articleId]) {
        original60SecContent[articleId] = digestEl.innerHTML;
    }

    // Revert to English
    if (targetLang === 'en') {
        digestEl.innerHTML = original60SecContent[articleId];
        if (selectEl) selectEl.value = 'en';
        showToast('↩ Reverted to English');
        return;
    }

    // Show loading
    digestEl.innerHTML = '<div style="text-align:center;color:#FF9800;padding:20px;"><span>🌐 Translating...</span></div>';

    try {
        // Parse original HTML structure back from stored HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = original60SecContent[articleId];

        // Collect all text nodes with their original HTML elements
        const textNodes = [];
        const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            if (text.length > 0 && text !== '•' && !/^\d+$/.test(text)) {
                textNodes.push({ node: node, text: text });
            }
        }

        if (textNodes.length === 0) {
            digestEl.innerHTML = original60SecContent[articleId];
            showToast('⚠️ Nothing to translate');
            return;
        }

        // Batch translate all unique texts (deduplicate to reduce API calls)
        const uniqueTexts = [...new Set(textNodes.map(t => t.text))];
        const translations = new Map();

        // Translate in batches of 20 to avoid URL length limits
        const batchSize = 20;
        for (let i = 0; i < uniqueTexts.length; i += batchSize) {
            const batch = uniqueTexts.slice(i, i + batchSize);
            const combinedText = batch.join('\n§§§\n');

            const response = await fetch(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(combinedText)}`
            );
            const data = await response.json();

            if (data && data[0]) {
                let translatedCombined = '';
                data[0].forEach(seg => { if (seg[0]) translatedCombined += seg[0]; });
                const translatedBatch = translatedCombined.split('\n§§§\n').map(t => t.trim());

                batch.forEach((original, idx) => {
                    translations.set(original, translatedBatch[idx] || original);
                });
            } else {
                batch.forEach(original => translations.set(original, original));
            }
        }

        // Apply translations back to the original HTML structure
        textNodes.forEach(({ node, text }) => {
            const translated = translations.get(text);
            if (translated && translated !== text) {
                node.textContent = node.textContent.replace(text, translated);
            }
        });

        digestEl.innerHTML = tempDiv.innerHTML;
        showToast(`✅ Translated to ${targetLang.toUpperCase()}`);

    } catch (err) {
        console.error('Translation error:', err);
        digestEl.innerHTML = original60SecContent[articleId];
        if (selectEl) selectEl.value = 'en';
        showToast('⚠️ Translation failed — reverted to English');
    }
}

/* ============================================
   🚀 STARTUP EVENTS — FULL EVENT CARD VIEW
   WITH: COUNTDOWN + AUTO-EXPIRE + ALL FIELDS
   ============================================ */
function renderStartupEvents(articles) {
    const isDark = document.body.classList.contains('dark');
    const now = new Date();
    
    // ── AUTO-EXPIRE: Filter out events whose expireDate has passed ──
    const activeEvents = articles.filter(item => {
        const expireDate = item.expireDate || item.autoExpire || item.expiryDate || item.registrationDeadline;
        if (expireDate) {
            const exp = new Date(expireDate);
            if (!isNaN(exp.getTime()) && exp < now) return false; // HIDE expired
        }
        return true;
    }).sort((a, b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
    
    if (activeEvents.length === 0) {
        return `<div style="text-align:center;padding:60px 20px calc(100px + env(safe-area-inset-bottom)) 20px;">
            <div style="font-size:48px;margin-bottom:16px;">🚀</div>
            <h3 style="color:${isDark?'#fff':'#111'};margin-bottom:8px;">No upcoming events</h3>
            <p style="color:${isDark?'#666':'#999'};">Check back later for new startup events</p>
        </div>`;
    }
    
    return activeEvents.map((item, index) => {
        const id = String(item._id || item.articleId || item.id || index).replace(/[^a-zA-Z0-9-]/g, '');
        
        // ── Extract all fields with multiple fallbacks ──
        const title       = item.title       || "Startup Event";
        const organizer   = item.source      || item.organizer    || item.startupName || 'Centrinsic NPT';
        const eventType   = item.eventType   || item.event_type   || item.type || '';
        const eventDate   = item.eventDate   || item.event_date   || item.date || item.startDate || item.createdAt;
        const venue       = item.venue       || item.location     || item.venueOrOnline || '';
        const regLink     = item.registrationLink || item.registration_url || item.signupUrl || item.externalLink || '';
        const website     = item.eventWebsite|| item.website       || item.url || '';
        const content     = item.content     || item.description  || '';
        const imageUrl    = getImageUrl(item.image);
        const expireDate  = item.expireDate  || item.autoExpire   || item.expiryDate || item.registrationDeadline;

        // ── Format Event Date & Time ──
        let formattedDate = 'Date TBA';
        let timeStr = '';
        if (eventDate) {
            try {
                const d = new Date(eventDate);
                if (!isNaN(d.getTime())) {
                    formattedDate = d.toLocaleDateString('en-GB', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                    });
                    const t = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                    if (t !== '12:00 AM') timeStr = t;
                }
            } catch(e) {}
        }

        // ── Countdown Timer Logic ──
        let countdownBadge = '';
        let regStatus = 'open';
        if (expireDate) {
            const exp = new Date(expireDate);
            const diff = exp - now;
            if (diff > 0) {
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                if (days > 0) {
                    countdownBadge = `<span style="background:rgba(255,255,255,0.35);color:#fff;font-size:11px;font-weight:800;padding:4px 12px;border-radius:12px;">⏰ ${days} day${days>1?'s':''} left</span>`;
                } else if (hours > 0) {
                    countdownBadge = `<span style="background:#ff9800;color:#fff;font-size:11px;font-weight:800;padding:4px 12px;border-radius:12px;">⏰ ${hours}h ${mins}m left</span>`;
                } else {
                    countdownBadge = `<span style="background:#ff1744;color:#fff;font-size:11px;font-weight:800;padding:4px 12px;border-radius:12px;">⏰ Closing in ${mins}m</span>`;
                }
            } else {
                regStatus = 'closed';
                countdownBadge = `<span style="background:#ff1744;color:#fff;font-size:11px;font-weight:800;padding:4px 12px;border-radius:12px;">🔒 Registration Closed</span>`;
            }
        }

        // ── Header Badges ──
        const badges = [];
        if (eventType) badges.push(`<<span style="background:rgba(255,255,255,0.25);color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;">🏷️ ${escapeHtml(eventType)}</span>`);
        badges.push(`<<span style="background:rgba(255,255,255,0.25);color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;">📰 ${escapeHtml(organizer)}</span>`);
        if (venue) {
            const isUrl = /^https?:\/\//.test(venue);
            if (isUrl) {
                badges.push(`<<a href="${escapeHtml(venue)}" target="_blank" rel="noopener noreferrer" style="background:rgba(255,255,255,0.25);color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;text-decoration:none;display:inline-block;">🔗 Online Event</a>`);
            } else {
                badges.push(`<<span style="background:rgba(255,255,255,0.25);color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;">📍 ${escapeHtml(venue)}</span>`);
            }
        }
        if (countdownBadge) badges.push(countdownBadge);

        // ── Event Poster Image ──
        let imageHTML = '';
        if (imageUrl) {
            imageHTML = `
                <div style="padding:0 16px 16px 16px;">
                    <img src="${escapeHtml(imageUrl)}" style="width:100%;border-radius:12px;display:block;box-shadow:0 4px 12px rgba(0,0,0,0.15);" loading="lazy" onerror="this.style.display='none'" alt="Event poster">
                </div>`;
        }

        // ── Description Block ──
        let descHTML = '';
        if (content) {
            const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
            if (paragraphs.length > 0) {
                descHTML = paragraphs.map(p => `<p style="margin:0 0 12px 0;line-height:1.7;">${escapeHtml(p.trim())}</p>`).join('');
            } else {
                descHTML = `<p style="margin:0;line-height:1.7;">${escapeHtml(content.trim())}</p>`;
            }
        }

        // ── Registration Section ──
        let regSection = '';
        if (regLink && regStatus === 'open') {
            regSection = `
                <div style="background:linear-gradient(135deg,#1b5e20,#2e7d32);padding:14px 16px;margin:0 -16px 16px -16px;display:flex;align-items:center;gap:12px;">
                    <div style="width:3px;height:20px;background:rgba(255,255,255,0.5);border-radius:2px;flex-shrink:0;"></div>
                    <div style="flex:1;">
                        <div style="color:#fff;font-size:13px;font-weight:700;line-height:1.4;">🚀 Registration Open</div>
                        <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:2px;">${expireDate ? 'Limited time remaining — register now!' : 'Click below to secure your spot'}</div>
                    </div>
                </div>
                <div style="padding:0 16px 20px 16px;">
                    <a href="${escapeHtml(regLink)}" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;background:linear-gradient(135deg,#9c27b0,#7b1fa2);color:#fff;font-size:15px;font-weight:700;padding:14px;border-radius:12px;text-decoration:none;box-shadow:0 4px 12px rgba(156,39,176,0.3);">
                        Register Now →
                    </a>
                </div>`;
        } else if (regLink && regStatus === 'closed') {
            regSection = `
                <div style="background:linear-gradient(135deg,#616161,#424242);padding:14px 16px;margin:0 -16px 16px -16px;display:flex;align-items:center;gap:12px;">
                    <div style="width:3px;height:20px;background:rgba(255,255,255,0.5);border-radius:2px;flex-shrink:0;"></div>
                    <div style="flex:1;">
                        <div style="color:#fff;font-size:13px;font-weight:700;line-height:1.4;">🔒 Registration Closed</div>
                        <div style="color:rgba(255,255,255,0.8);font-size:12px;margin-top:2px;">This event is no longer accepting registrations</div>
                    </div>
                </div>`;
        }

        // ── Event Website Link ──
        let websiteHTML = '';
        if (website && website !== regLink) {
            websiteHTML = `<div style="padding:0 16px 12px 16px;">
                <a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:8px;color:#9c27b0;font-size:13px;text-decoration:none;font-weight:600;">
                    <span>🌐</span> Visit Event Website <span style="margin-left:auto;">→</span>
                </a>
            </div>`;
        }

        const metaBg     = isDark ? '#1a1a1a' : '#fff';
        const metaBorder = isDark ? '#2a2a2a' : '#e0e0e0';
        const cardText   = isDark ? '#e0e0e0' : '#222';
        const descBg     = isDark ? '#16213e' : '#e8eaf6';

        return `
            <div style="background:${metaBg};border-radius:20px;margin-bottom:20px;overflow:hidden;border:1px solid ${metaBorder};box-shadow:0 2px 12px rgba(0,0,0,0.08);">
                <!-- Purple Gradient Header -->
                <div style="background:linear-gradient(135deg,#9c27b0,#7b1fa2);padding:18px 20px;">
                    <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
                        <span style="font-size:24px;flex-shrink:0;">🚀</span>
                        <div style="flex:1;min-width:0;">
                            <div style="color:#fff;font-size:17px;font-weight:800;line-height:1.3;word-break:break-word;">${escapeHtml(title)}</div>
                            <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;">
                                📅 ${escapeHtml(formattedDate)} 
                                ${timeStr ? `<span style="margin-left:8px;">🕐 ${escapeHtml(timeStr)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        ${badges.join('')}
                    </div>
                </div>

                ${imageHTML}

                <!-- Description Block (Dark Blue / Indigo) -->
                <div id="startupContent_${id}" style="background:${descBg};color:${cardText};padding:16px;margin:0 16px 16px 16px;border-radius:12px;font-size:14px;">
                    ${descHTML}
                </div>

                ${websiteHTML}
                ${regSection}

                <!-- Footer -->
                <div style="padding:12px 16px;border-top:1px solid ${metaBorder};display:flex;align-items:center;justify-content:space-between;background:${isDark?'#0a0a0a':'#fafafa'};flex-wrap:wrap;gap:8px;">
                    <span style="color:${isDark?'#555':'#aaa'};font-size:11px;">Centrinsic NPT • Startup Events</span>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <select id="startupTranslateSelect_${id}" onchange="translateDigestContent('${id}', this.value, 'startupContent_', 'startupTranslateSelect_')" style="background:#9c27b0;color:white;border:none;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;outline:none;">
                            <option value="en" style="background:#333;color:#fff;">🌐 English</option>
                            <option value="hi" style="background:#333;color:#fff;">हिंदी</option>
                            <option value="te" style="background:#333;color:#fff;">తెలుగు</option>
                            <option value="ta" style="background:#333;color:#fff;">தமிழ்</option>
                            <option value="kn" style="background:#333;color:#fff;">ಕನ್ನಡ</option>
                            <option value="ml" style="background:#333;color:#fff;">മലയാളം</option>
                        </select>
                        <button onclick="shareStartupEvent('${id}')" style="background:#9c27b0;border:none;border-radius:8px;color:white;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;">📤 Share</button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

/* ============================================
   🚀 STARTUP EVENT SHARE
============================================ */
async function shareStartupEvent(articleId) {
    const article = articlesCache.get(articleId) || allArticles.find(a => String(a._id||a.id||a.articleId).replace(/[^a-zA-Z0-9-]/g,'') === articleId);
    if (!article) return;
    
    const title     = article.title || "Startup Event";
    const regLink   = article.registrationLink || article.registration_url || article.signupUrl || article.url || '';
    const venue     = article.venue || article.location || 'Location TBA';
    const eventDate = article.eventDate || article.event_date || article.date || 'Upcoming';
    const eventType = article.eventType || article.type || '';
    
    let shareText = `🚀 ${title}`;
    if (eventType) shareText += ` | ${eventType}`;
    shareText += `\n\n📅 ${eventDate}\n📍 ${venue}`;
    if (regLink) shareText += `\n\n✍️ Register: ${regLink}`;
    shareText += `\n\n📲 More startup events on Centrinsic NPT:\nhttps://centrinsicnpt.com`;

    if (window.Capacitor?.Plugins?.Share) {
        try { 
            await window.Capacitor.Plugins.Share.share({ title, text: shareText, url: 'https://centrinsicnpt.com' }); 
            return; 
        }
        catch(e) { if ((e?.message||'').toLowerCase().includes('cancel')) return; }
    }
    if (navigator.share) {
        try { 
            await navigator.share({ title, text: shareText }); 
            return; 
        }
        catch(e) { if (e.name === 'AbortError') return; }
    }
    copyToClipboard(shareText);
    showToast('🔗 Event link copied!');
}

/* ============================================
   GENERIC DIGEST TRANSLATE (works for any digest type)
=========================================== */
async function translateDigestContent(articleId, targetLang, contentPrefix, selectPrefix) {
    const contentEl = document.getElementById(`${contentPrefix}${articleId}`);
    const selectEl = document.getElementById(`${selectPrefix}${articleId}`);
    if (!contentEl || !targetLang) return;

    const cacheKey = `${contentPrefix}${articleId}`;
    if (!window._digestOriginals) window._digestOriginals = {};
    if (!window._digestOriginals[cacheKey]) {
        window._digestOriginals[cacheKey] = contentEl.innerHTML;
    }

    if (targetLang === 'en') {
        contentEl.innerHTML = window._digestOriginals[cacheKey];
        if (selectEl) selectEl.value = 'en';
        showToast('↩ Reverted to English');
        return;
    }

    contentEl.innerHTML = '<div style="text-align:center;color:#FF9800;padding:20px;"><span>🌐 Translating...</span></div>';

    try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = window._digestOriginals[cacheKey];

        const textNodes = [];
        const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            if (text.length > 0 && text !== '•' && !/^\d+$/.test(text)) {
                textNodes.push({ node: node, text: text });
            }
        }

        if (textNodes.length === 0) {
            contentEl.innerHTML = window._digestOriginals[cacheKey];
            showToast('⚠️ Nothing to translate');
            return;
        }

        const uniqueTexts = [...new Set(textNodes.map(t => t.text))];
        const translations = new Map();

        const batchSize = 20;
        for (let i = 0; i < uniqueTexts.length; i += batchSize) {
            const batch = uniqueTexts.slice(i, i + batchSize);
            const combinedText = batch.join('\n§§§\n');

            const response = await fetch(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(combinedText)}`
            );
            const data = await response.json();

            if (data && data[0]) {
                let translatedCombined = '';
                data[0].forEach(seg => { if (seg[0]) translatedCombined += seg[0]; });
                const translatedBatch = translatedCombined.split('\n§§§\n').map(t => t.trim());

                batch.forEach((original, idx) => {
                    translations.set(original, translatedBatch[idx] || original);
                });
            } else {
                batch.forEach(original => translations.set(original, original));
            }
        }

        textNodes.forEach(({ node, text }) => {
            const translated = translations.get(text);
            if (translated && translated !== text) {
                node.textContent = node.textContent.replace(text, translated);
            }
        });

        contentEl.innerHTML = tempDiv.innerHTML;
        showToast(`✅ Translated to ${targetLang.toUpperCase()}`);

    } catch (err) {
        console.error('Translation error:', err);
        contentEl.innerHTML = window._digestOriginals[cacheKey];
        if (selectEl) selectEl.value = 'en';
        showToast('⚠️ Translation failed — reverted to English');
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
    if (articlesCache.has(articleId)) { 
        currentArticle = articlesCache.get(articleId); 
        displayArticleDetail(); 
        return; 
    }
    const found = allArticles.find(a => a.title === articleTitle && a.source === articleSource);
    if (found) { 
        currentArticle = found; 
        displayArticleDetail(); 
        return; 
    }
    if (!articleId.startsWith('gnews_')) {
        fetch(`${API_ARTICLES}/${articleId}`).then(r => r.json()).then(a => { 
            currentArticle = a; 
            displayArticleDetail(); 
        }).catch(() => showToast("Failed to load article"));
    } else { 
        showToast("Article expired. Please refresh."); 
    }
}

function getSavedArticles() {
    try { return JSON.parse(localStorage.getItem("saved_articles") || "[]"); } catch (e) { return []; }
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
    if (saved.length === 0) { 
        container.innerHTML = `<div class="empty"><div>📁</div><h3>No saved</h3></div>`; 
        return; 
    }
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
    if (articlesCache.has(cleanId)) { 
        currentArticle = articlesCache.get(cleanId); 
        displayArticleDetail(); 
        return; 
    }
    if (!cleanId.startsWith('gnews_')) {
        fetch(`${API_ARTICLES}/${cleanId}`).then(r => r.json()).then(a => { 
            currentArticle = a; 
            displayArticleDetail(); 
        }).catch(() => showToast("Failed to load article"));
    } else { 
        showToast("Article expired. Please refresh."); 
    }
}

function displayArticleDetail() {
    const articleBody = document.getElementById("articleBody");
    const saveBtn     = document.getElementById("saveBtn");
    if (!articleBody || !currentArticle) { 
        showToast("Article not found"); 
        return; 
    }

    originalArticleContent = null;

    const articleId  = currentArticle._id || currentArticle.id || currentArticle.articleId;
    const isSaved    = getSavedArticles().some(s => String(s._id||s.id||s.articleId) === String(articleId));
    if (saveBtn) { 
        saveBtn.innerHTML = isSaved ? '✓ Saved' : '💾 Save'; 
        saveBtn.classList.toggle('saved', isSaved); 
    }

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
    const isStartup  = articleTab === 'startupevents';

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
                    if (colonIdx > 0 && colonIdx < 60) { 
                        boldPart = point.substring(0, colonIdx); 
                        restPart = point.substring(colonIdx+1).trim(); 
                    }
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
    } else if (isStartup) {
        // Startup Events detail view - plain paragraphs
        const content = currentArticle.content || currentArticle.description || '';
        if (content) {
            const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
            if (paragraphs.length > 0) {
                bodyContent = `<div class="article-body-text" style="color:${bodyColor};line-height:1.8;margin-bottom:20px;">`;
                paragraphs.forEach(p => {
                    bodyContent += `<p style="margin:0 0 14px 0;">${escapeHtml(p.trim())}</p>`;
                });
                bodyContent += `</div>`;
            } else {
                bodyContent = `<div class="article-body-text" style="color:${bodyColor};line-height:1.8;margin-bottom:20px;">${escapeHtml(content.trim())}</div>`;
            }
        } else {
            bodyContent = `<div class="article-body-text" style="color:${bodyColor};line-height:1.8;margin-bottom:20px;">No content available</div>`;
        }
    } else {
        bodyContent = `<div class="article-body-text" style="color:${bodyColor};line-height:1.8;margin-bottom:20px;font-size:16px;">${escapeHtml(currentArticle.content || currentArticle.description || "No content available")}</div>`;
    }

    // ── Startup Event Countdown for Detail View ──
    let startupCountdownHTML = '';
    if (isStartup) {
        const expireDate = currentArticle.expireDate || currentArticle.autoExpire || currentArticle.expiryDate || currentArticle.registrationDeadline;
        const eventDate = currentArticle.eventDate || currentArticle.event_date || currentArticle.date;
        const now = new Date();
        
        let regStatus = 'open';
        let countdownText = '';
        
        if (expireDate) {
            const exp = new Date(expireDate);
            const diff = exp - now;
            if (diff > 0) {
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                if (days > 0) countdownText = `${days} day${days>1?'s':''} remaining`;
                else if (hours > 0) countdownText = `${hours} hours remaining`;
                else countdownText = 'Closing soon';
            } else {
                regStatus = 'closed';
                countdownText = 'Registration Closed';
            }
        }
        
        const regLink = currentArticle.registrationLink || currentArticle.registration_url || currentArticle.signupUrl || '';
        const website = currentArticle.eventWebsite || currentArticle.website || '';
        const venue = currentArticle.venue || currentArticle.location || 'TBA';
        const eventType = currentArticle.eventType || currentArticle.type || '';
        const eventTime = eventDate ? new Date(eventDate).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}) : '';
        
        startupCountdownHTML = `
            <div style="background:${isDark?'#16213e':'#e8eaf6'};border-radius:12px;padding:16px;margin:16px 0;border:1px solid ${detailBorder};">
                <div style="display:flex;flex-direction:column;gap:10px;">
                    ${eventDate ? `<div style="display:flex;align-items:center;gap:10px;"><span style="color:${labelColor};font-size:14px;min-width:100px;">📅 Event Date:</span><span style="color:#9c27b0;font-size:14px;font-weight:700;">${escapeHtml(new Date(eventDate).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}))} ${eventTime ? `at ${eventTime}` : ''}</span></div>` : ''}
                    <div style="display:flex;align-items:center;gap:10px;"><span style="color:${labelColor};font-size:14px;min-width:100px;">📍 Venue:</span><span style="color:${metaColor};font-size:14px;">${escapeHtml(venue)}</span></div>
                    ${eventType ? `<div style="display:flex;align-items:center;gap:10px;"><span style="color:${labelColor};font-size:14px;min-width:100px;">🏷️ Type:</span><span style="color:${metaColor};font-size:14px;">${escapeHtml(eventType)}</span></div>` : ''}
                    ${countdownText ? `<div style="display:flex;align-items:center;gap:10px;"><span style="color:${labelColor};font-size:14px;min-width:100px;">⏰ Status:</span><span style="color:${regStatus==='open'?'#4CAF50':'#ff1744'};font-size:14px;font-weight:700;">${escapeHtml(countdownText)}</span></div>` : ''}
                </div>
            </div>
            ${(regStatus === 'open' && regLink) ? `
            <div style="margin-bottom:20px;">
                <a href="${escapeHtml(regLink)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;gap:10px;background:linear-gradient(135deg,#9c27b0,#7b1fa2);border:none;border-radius:12px;padding:16px;color:#fff;font-size:15px;font-weight:700;width:100%;cursor:pointer;text-decoration:none;box-shadow:0 4px 12px rgba(156,39,176,0.3);">
                    <span>🚀</span><span>Register for this Event</span>
                </a>
            </div>` : ''}
            ${(website && website !== regLink) ? `
            <div style="margin-bottom:20px;">
                <a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;gap:10px;background:${linkBg};border:1px solid ${linkBorder};border-radius:12px;padding:14px;color:${linkColor};font-size:14px;font-weight:500;width:100%;cursor:pointer;text-decoration:none;">
                    <span>🌐</span><span>Visit Event Website</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;margin-left:auto;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
            </div>` : ''}
        `;
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
            ${startupCountdownHTML}
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

    // Use navigateTo for detail screen so back button works
    navigateTo('detail');
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
        const bodyData = await (await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(originalArticleContent.body)}`)).json();
        let translated = ''; 
        if (bodyData && bodyData[0]) bodyData[0].forEach(seg => { if (seg[0]) translated += seg[0]; });
        bodyEl.textContent = translated || 'Translation not available.';
        if (headlineEl && originalArticleContent.title) {
            const titleData = await (await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(originalArticleContent.title)}`)).json();
            let translatedTitle = ''; 
            if (titleData && titleData[0]) titleData[0].forEach(seg => { if (seg[0]) translatedTitle += seg[0]; });
            if (translatedTitle) headlineEl.textContent = translatedTitle;
        }
        if (headlineEl) headlineEl.style.opacity = '1';
    } catch (err) {
        bodyEl.textContent = originalArticleContent.body;
        if (headlineEl) { 
            headlineEl.textContent = originalArticleContent.title; 
            headlineEl.style.opacity = '1'; 
        }
        originalArticleContent = null;
        const select = document.getElementById('translateSelect'); 
        if (select) select.value = 'en';
        showToast('⚠️ Translation failed.');
    }
}

function highlightTranslateBtn(lang) { 
    const s = document.getElementById('translateSelect'); 
    if (s) s.value = lang; 
}

function openExternalLink(url) {
    if (!url || url === '#') { 
        showToast("Link not available"); 
        return; 
    }
    if (window.Capacitor?.Plugins?.Browser) { 
        window.Capacitor.Plugins.Browser.open({ url }); 
    }
    else if (window.cordova?.InAppBrowser)  { 
        window.cordova.InAppBrowser.open(url, '_system'); 
    }
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
        if (saveBtn) { 
            saveBtn.innerHTML = '💾 Save'; 
            saveBtn.classList.remove('saved'); 
        }
        showToast("Removed from saved");
    } else {
        savedArticles.unshift({ ...currentArticle, savedAt: new Date().toISOString() });
        if (saveBtn) { 
            saveBtn.innerHTML = '✓ Saved'; 
            saveBtn.classList.add('saved'); 
        }
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
    if (shareBtn) { 
        shareBtn.innerHTML = '⏳ Sharing...'; 
        shareBtn.disabled = true; 
    }
    try {
        if (window.Capacitor?.Plugins?.Share) {
            const { Share, Filesystem } = window.Capacitor.Plugins;
            let fileUri = null;
            if (imageUrl && Filesystem) {
                try {
                    const imgBlob = await (await fetch(imageUrl)).blob();
                    const base64  = await new Promise((res, rej) => { 
                        const r = new FileReader(); 
                        r.onload = () => res(r.result.split(',')[1]); 
                        r.onerror = rej; 
                        r.readAsDataURL(imgBlob); 
                    });
                    const fileName = `centrinsic_${Date.now()}.jpg`;
                    await Filesystem.writeFile({ path: fileName, data: base64, directory: 'CACHE' });
                    const uriResult = await Filesystem.getUri({ path: fileName, directory: 'CACHE' });
                    fileUri = uriResult.uri;
                } catch(e) {}
            }
            if (fileUri) { 
                await Share.share({ title, text: shareText, url: appLink, files: [fileUri] }); 
            }
            else { 
                await Share.share({ title, text: shareText, url: appLink }); 
            }
            return;
        }
        if (navigator.share) { 
            try { 
                await navigator.share({ title, text: shareText, url: appLink }); 
                return; 
            } catch(e) { 
                if (e.name === 'AbortError') return; 
            } 
        }
        copyToClipboard(shareText);
        showToast('🔗 Link copied!');
    } catch (err) {
        const msg = (err?.message || err?.errorMessage || '').toLowerCase();
        if (msg.includes('cancel') || err?.name === 'AbortError') return;
        if (window.Capacitor?.Plugins?.Share) { 
            try { 
                await window.Capacitor.Plugins.Share.share({ title, text: shareText, url: appLink }); 
                return; 
            } catch(e) {} 
        }
        copyToClipboard(shareText);
        showToast('🔗 Link copied!');
    } finally {
        if (shareBtn) { 
            shareBtn.innerHTML = '📤 Share'; 
            shareBtn.disabled = false; 
        }
    }
}

function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) { 
        navigator.clipboard.writeText(text).then(() => showToast("✅ Link copied!")).catch(() => fallbackCopy(text)); 
    }
    else fallbackCopy(text);
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

function refreshFeed() { 
    isOnline = false; 
    loadNews(); 
    showToast("Refreshing..."); 
}

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
        toast.id = 'toast'; 
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
    if (logoutBtn) {
        logoutBtn.onclick = () => logout();
        logoutBtn.addEventListener('click', () => logout());
        logoutBtn.addEventListener('touchstart', () => logout());
    }
    
    const deleteBtn = document.getElementById("deleteDataButton");
    if (deleteBtn) {
        deleteBtn.onclick = () => clearAll();
        deleteBtn.addEventListener('click', () => clearAll());
        deleteBtn.addEventListener('touchstart', () => clearAll());
    }
}

console.log("✅ Centrinsic NPT — Mobile Back Button Fixed + Dynamic Tab Order + Startup Events with Countdown & Auto-Expire");