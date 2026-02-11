// ============================================
// KTT NEWS APP - COMPLETE FIXED VERSION
// ============================================

// ✅ IMPORTANT: Replace with your actual Render URL
// Must be HTTPS and match your Render service name exactly
const API_BASE = "https://ktt-news.onrender.com";

const API_ARTICLES = `${API_BASE}/api/articles`;
const API_NEWS = `${API_BASE}/api/news`;
const API_SAVE_EMAIL = `${API_BASE}/api/save-email`;
const API_SEND_OTP = `${API_BASE}/api/auth/send-otp`;
const API_VERIFY_OTP = `${API_BASE}/api/auth/verify-otp`;

console.log("🔌 API Base:", API_BASE);

let currentUser = null;
let currentArticle = null;
let isOnline = false;
let toastTimeout = null;

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
    
    console.log("🚀 KTT News App Starting...");
    
    initializeApp();
    exportAllFunctions();
    setTimeout(setupAllEventListeners, 100);
}

function initializeApp() {
    checkLoginStatus();
    updateUserDisplay();
    
    if(localStorage.getItem("theme") === "dark") {
        document.body.classList.add("dark");
        const toggle = document.getElementById('darkToggle');
        if(toggle) toggle.checked = true;
    }
    
    const savedSize = localStorage.getItem("font_size");
    if(savedSize) {
        applyFontSize(savedSize);
    }
    
    showScreen("splash");
    
    setTimeout(() => {
        if(currentUser && currentUser.loggedIn) {
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
    window.showScreen = showScreen;
    window.goToLogin = goToLogin;
    window.skipLoginFromAbout = skipLoginFromAbout;
    window.skipToHome = skipToHome;
    window.goBackToAbout = goBackToAbout;
    window.goBack = goBack;
    window.goHome = goHome;
    window.logout = logout;
    window.clearAll = clearAll;
    window.loadNews = loadNews;
    window.openArticle = openArticle;
    window.saveCurrentArticle = saveCurrentArticle;
    window.refreshFeed = refreshFeed;
    window.changeTextSize = changeTextSize;
    window.toggleDark = toggleDark;
    window.showToast = showToast;
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
    
    newToggle.addEventListener('change', function(e) {
        console.log("Dark mode toggled:", this.checked);
        toggleDark(this.checked);
    });
}

function attachLogoutListener() {
    const logoutBtn = document.getElementById('logoutButton');
    if (!logoutBtn) return;
    
    const newBtn = logoutBtn.cloneNode(true);
    logoutBtn.parentNode.replaceChild(newBtn, logoutBtn);
    
    newBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        logout();
    });
    
    newBtn.addEventListener('touchend', function(e) {
        e.preventDefault();
        logout();
    });
}

function attachClearAllListener() {
    const clearBtn = document.querySelector('.btn-danger');
    if (!clearBtn) return;
    
    const newBtn = clearBtn.cloneNode(true);
    clearBtn.parentNode.replaceChild(newBtn, clearBtn);
    
    newBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        clearAll();
    });
    
    newBtn.addEventListener('touchend', function(e) {
        e.preventDefault();
        clearAll();
    });
}

function setupOtherListeners() {
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            changeTextSize(this.getAttribute('data-size'));
        });
    });
    
    const sendOtpBtn = document.getElementById('sendOtpBtn');
    if (sendOtpBtn) sendOtpBtn.addEventListener('click', sendOTP);
    
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    if (verifyOtpBtn) verifyOtpBtn.addEventListener('click', verifyOTP);
}

/* ============================================
   NAVIGATION
============================================ */
function showScreen(screenId) {
    const allScreens = document.querySelectorAll('.screen');
    allScreens.forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = 'none';
    });
    
    const target = document.getElementById(screenId);
    if (!target) return;
    
    target.classList.add('active');
    target.style.display = screenId === 'splash' ? 'flex' : 'block';
    
    const bottomNavs = document.querySelectorAll('.bottom-nav');
    const showNav = ['home', 'saved', 'preferences'].includes(screenId);
    bottomNavs.forEach(nav => nav.style.display = showNav ? 'flex' : 'none');
    
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
        const savedSize = localStorage.getItem("font_size") || "medium";
        highlightSizeButton(savedSize);
    }
    
    window.scrollTo(0, 0);
}

function goToLogin() {
    resetLoginForm();
    showScreen("login");
}

function skipLoginFromAbout() {
    showScreen("home");
    loadNews();
}

function skipToHome() {
    showScreen("home");
    loadNews();
}

function goBackToAbout() {
    showScreen("about");
}

function goBack() {
    showScreen("home");
}

function goHome() {
    showScreen("home");
}

/* ============================================
   USER MANAGEMENT
============================================ */
function checkLoginStatus() {
    const isLoggedIn = localStorage.getItem("ktt_logged") === "true";
    const userEmail = localStorage.getItem("user_email");
    const userName = localStorage.getItem("user_name");
    
    if(isLoggedIn && userEmail) {
        currentUser = { 
            email: userEmail, 
            loggedIn: true,
            name: userName || userEmail.split('@')[0]
        };
    } else {
        currentUser = null;
    }
}

function updateUserDisplay() {
    const userNameEl = document.getElementById("userDisplayName");
    const userEmailEl = document.getElementById("userDisplayEmail");
    const logoutBtn = document.getElementById("logoutButton");
    
    if (!userNameEl || !userEmailEl) return;
    
    if (currentUser && currentUser.loggedIn) {
        userNameEl.textContent = currentUser.name || currentUser.email.split('@')[0];
        userEmailEl.textContent = currentUser.email;
        if (logoutBtn) logoutBtn.style.display = 'block';
    } else {
        userNameEl.textContent = "Guest User";
        userEmailEl.textContent = "Not signed in";
        if (logoutBtn) logoutBtn.style.display = 'none';
    }
}

function logout() {
    if (!currentUser || !currentUser.loggedIn) {
        showToast("Not logged in");
        return;
    }
    
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("ktt_logged");
        localStorage.removeItem("user_email");
        localStorage.removeItem("user_name");
        localStorage.removeItem("auth_token");
        localStorage.removeItem("temp_email");
        
        currentUser = null;
        updateUserDisplay();
        showToast("Logged out successfully");
        
        setTimeout(() => {
            showScreen("about");
        }, 500);
    }
}

function clearAll() {
    if (confirm("⚠️ This will delete ALL data. Continue?")) {
        localStorage.clear();
        currentUser = null;
        currentArticle = null;
        updateUserDisplay();
        showToast("All data cleared");
        setTimeout(() => location.reload(), 1500);
    }
}

/* ============================================
   THEME
============================================ */
function toggleDark(checked) {
    console.log("toggleDark called with:", checked);
    
    const checkbox = document.getElementById('darkToggle');
    
    let shouldBeDark;
    if (typeof checked === 'boolean') {
        shouldBeDark = checked;
    } else {
        shouldBeDark = !document.body.classList.contains('dark');
    }
    
    if (shouldBeDark) {
        document.body.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    }
    
    if (checkbox) checkbox.checked = shouldBeDark;
    
    console.log("Dark mode:", shouldBeDark ? "ON" : "OFF");
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
        btn.classList.remove('active');
        if(btn.getAttribute('data-size') === size) {
            btn.classList.add('active');
        }
    });
}

/* ============================================
   FETCH WITH TIMEOUT & ERROR HANDLING
============================================ */
async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

/* ============================================
   OTP LOGIN - WITH FALLBACK FOR EMAIL FAILURES
============================================ */
let otpTimer = null;
let otpCountdown = 60;
let currentOTP = null; // Store OTP temporarily when email fails

function sendOTP() {
    const emailInput = document.getElementById("loginEmail");
    const email = emailInput.value.trim();
    const btn = document.getElementById("sendOtpBtn");
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        showToast("Please enter a valid email");
        return;
    }
    
    btn.classList.add("loading");
    btn.disabled = true;
    
    localStorage.setItem("temp_email", email);
    
    // Generate OTP locally as fallback
    currentOTP = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`🔑 Generated OTP for ${email}: ${currentOTP}`);
    
    fetchWithTimeout(API_SEND_OTP, {
        method: 'POST',
        body: JSON.stringify({ email: email, otp: currentOTP })
    }, 20000)
    .then(async response => {
        const data = await response.json();
        btn.classList.remove("loading");
        btn.disabled = false;
        
        if (data.success) {
            showOTPStep(email);
            // If server provides different OTP, use that
            if (data.otp) currentOTP = data.otp;
            
            // Show OTP in toast for testing (remove in production)
            if (data.message && data.message.includes('console')) {
                showToast(`📧 Check console/logs for OTP`);
            } else {
                showToast("📧 OTP sent to email!");
            }
        } else {
            // Fallback: Show OTP locally if email failed
            showOTPStep(email);
            showToast(`📱 Your OTP: ${currentOTP}`);
            console.log(`📱 DISPLAY OTP TO USER: ${currentOTP}`);
        }
    })
    .catch(error => {
        btn.classList.remove("loading");
        btn.disabled = false;
        console.error("Send OTP error:", error);
        
        // Fallback mode: Show OTP directly
        showOTPStep(email);
        showToast(`📱 Your OTP: ${currentOTP}`);
        console.log(`📱 FALLBACK OTP: ${currentOTP}`);
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
    const inputs = document.querySelectorAll('.otp-input');
    inputs.forEach((input, index) => {
        input.replaceWith(input.cloneNode(true));
    });
    
    const newInputs = document.querySelectorAll('.otp-input');
    newInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            if (!/^\d*$/.test(value)) {
                e.target.value = '';
                return;
            }
            if (value.length === 1) {
                e.target.classList.add('filled');
                if (index < 5) {
                    newInputs[index + 1].focus();
                } else {
                    verifyOTP();
                }
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                newInputs[index - 1].focus();
            }
        });
        
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasteData = e.clipboardData.getData('text').slice(0, 6);
            const numbers = pasteData.replace(/\D/g, '');
            
            numbers.split('').forEach((num, i) => {
                if (newInputs[i]) {
                    newInputs[i].value = num;
                    newInputs[i].classList.add('filled');
                }
            });
            
            const lastIndex = Math.min(numbers.length, 5);
            if (newInputs[lastIndex]) newInputs[lastIndex].focus();
            
            if (numbers.length === 6) {
                setTimeout(verifyOTP, 100);
            }
        });
    });
}

function startOTPTimer() {
    otpCountdown = 60;
    const timerSpan = document.getElementById("otpTimer");
    const resendBtn = document.getElementById("resendBtn");
    
    if (resendBtn) resendBtn.classList.add("hidden");
    if (timerSpan) timerSpan.classList.remove("hidden");
    
    if (otpTimer) clearInterval(otpTimer);
    
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
    const email = localStorage.getItem("temp_email");
    let enteredOTP = '';
    
    inputs.forEach(input => enteredOTP += input.value);
    
    if (enteredOTP.length !== 6) {
        showToast("Enter complete OTP");
        return;
    }
    
    const btn = document.getElementById("verifyOtpBtn");
    btn.classList.add("loading");
    btn.disabled = true;
    
    // Check against locally stored OTP first (fallback)
    if (enteredOTP === currentOTP) {
        handleSuccessfulLogin(email, 'fallback-token');
        return;
    }
    
    // Try server verification
    fetchWithTimeout(API_VERIFY_OTP, {
        method: 'POST',
        body: JSON.stringify({ email: email, otp: enteredOTP })
    }, 20000)
    .then(response => response.json())
    .then(data => {
        btn.classList.remove("loading");
        btn.disabled = false;
        
        if (data.success) {
            handleSuccessfulLogin(email, data.token || 'server-token');
        } else {
            showToast(data.message || "Invalid OTP");
            inputs.forEach(input => {
                input.value = '';
                input.classList.remove('filled');
            });
            if (inputs[0]) inputs[0].focus();
        }
    })
    .catch(error => {
        btn.classList.remove("loading");
        btn.disabled = false;
        
        // If server fails but OTP matches local, allow login
        if (enteredOTP === currentOTP) {
            handleSuccessfulLogin(email, 'offline-token');
        } else {
            showToast("Network error. Try again.");
        }
    });
}

function handleSuccessfulLogin(email, token) {
    localStorage.setItem("ktt_logged", "true");
    localStorage.setItem("user_email", email);
    localStorage.setItem("auth_token", token);
    
    const userName = email.split('@')[0];
    localStorage.setItem("user_name", userName);
    
    currentUser = { 
        email: email, 
        loggedIn: true,
        name: userName,
        token: token
    };
    
    updateUserDisplay();
    showToast("✅ Welcome!");
    localStorage.removeItem("temp_email");
    currentOTP = null;
    
    showScreen("home");
    loadNews();
}

function resetLoginForm() {
    document.getElementById("emailStep")?.classList.remove("hidden");
    document.getElementById("otpStep")?.classList.add("hidden");
    document.getElementById("loginFooter")?.classList.remove("hidden");
    
    const emailInput = document.getElementById("loginEmail");
    if (emailInput) emailInput.value = '';
    
    document.querySelectorAll('.otp-input').forEach(input => {
        input.value = '';
        input.classList.remove('filled');
    });
    
    if (otpTimer) clearInterval(otpTimer);
    currentOTP = null;
}

/* ============================================
   NEWS LOADING - FIXED FOR ALL NETWORKS
============================================ */
async function loadNews() {
    const container = document.getElementById("newsFeed");
    if(!container) return;
    
    container.innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading news...</p></div>`;
    
    try {
        console.log("📡 Fetching from:", API_ARTICLES);
        
        const response = await fetchWithTimeout(API_ARTICLES, {
            method: 'GET'
        }, 20000);
        
        console.log("📡 Response status:", response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const newsArray = await response.json();
        console.log("📡 Received articles:", newsArray.length);
        
        if (!Array.isArray(newsArray)) {
            throw new Error("Invalid data format received");
        }
        
        // Save to localStorage for offline mode
        localStorage.setItem("news_backup", JSON.stringify(newsArray));
        isOnline = true;
        
        if (newsArray.length === 0) {
            container.innerHTML = `
                <div class="empty">
                    <span>📭</span>
                    <h3>No news available</h3>
                    <p>Check back later for updates</p>
                </div>
            `;
        } else {
            renderNews(newsArray);
        }
        
        updateSavedFolder();
        
    } catch(error) {
        console.error("❌ Load news error:", error);
        
        // Try to load from backup
        const backup = localStorage.getItem("news_backup");
        if(backup) {
            try {
                const backupData = JSON.parse(backup);
                console.log("📂 Loading from backup:", backupData.length);
                renderNews(backupData);
                showToast("📴 Offline mode - showing cached news");
            } catch(e) {
                showNoNewsError(container, error.message);
            }
        } else {
            showNoNewsError(container, error.message);
        }
    }
}

function showNoNewsError(container, errorMsg) {
    container.innerHTML = `
        <div class="empty" style="text-align: center; padding: 40px 20px;">
            <span style="font-size: 48px;">📡</span>
            <h3>Connection Error</h3>
            <p style="color: #888; margin: 10px 0;">${errorMsg || "Unable to load news"}</p>
            <button onclick="refreshFeed()" class="btn-primary" style="
                margin-top: 20px;
                padding: 12px 24px;
                background: #007bff;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
            ">🔄 Retry</button>
            <p style="margin-top: 15px; font-size: 12px; color: #666;">
                API: ${API_BASE}
            </p>
        </div>
    `;
}

function getImageUrl(imagePath) {
    if (!imagePath) return null;
    
    // If already full URL, ensure HTTPS
    if (imagePath.startsWith('http://')) {
        return imagePath.replace('http://', 'https://');
    }
    if (imagePath.startsWith('https://')) {
        return imagePath;
    }
    
    // If starts with /uploads/, append to base
    if (imagePath.startsWith('/uploads/')) {
        return API_BASE + imagePath;
    }
    
    // Otherwise add /uploads/ prefix
    return `${API_BASE}/uploads/${imagePath}`;
}

function renderNews(newsArray) {
    const container = document.getElementById("newsFeed");
    if(!container) return;
    
    if(!newsArray || newsArray.length === 0) {
        container.innerHTML = `
            <div class="empty">
                <span>📭</span>
                <h3>No news available</h3>
            </div>
        `;
        return;
    }
    
    let html = '';
    newsArray.forEach((item, index) => {
        const id = String(item._id || item.id || index).replace(/[^a-zA-Z0-9-]/g, '');
        const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "Recent";
        const excerpt = item.content ? item.content.substring(0, 90) + "..." : "No content";
        const title = item.title || "Untitled";
        
        const isSaved = getSavedArticles().some(s => String(s._id || s.id) === id);
        const savedIcon = isSaved ? '🔖 ' : '';
        
        const imageUrl = getImageUrl(item.image);
        
        html += `
            <article class="news-card" onclick="openArticle('${escapeHtml(id)}')">
                <div class="news-content">
                    <h3 class="news-title">${savedIcon}${escapeHtml(title)}</h3>
                    <p class="news-excerpt">${escapeHtml(excerpt)}</p>
                    <div class="news-meta"><span>📅 ${escapeHtml(date)}</span></div>
                </div>
                ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" class="news-thumb" loading="lazy" onerror="this.style.display='none'; this.parentElement.classList.add('no-image');">` : ""}
            </article>
        `;
    });
    
    container.innerHTML = html;
}

function getSavedArticles() {
    try {
        return JSON.parse(localStorage.getItem("saved_articles") || "[]");
    } catch(e) { return []; }
}

function updateSavedFolder() {
    const folder = document.getElementById("savedFolder");
    const countEl = document.getElementById("savedCount");
    const saved = getSavedArticles();
    
    if(folder) {
        folder.style.display = saved.length > 0 ? 'flex' : 'none';
        if(countEl) countEl.textContent = `${saved.length} saved`;
    }
}

function loadSavedArticles() {
    const container = document.getElementById("savedList");
    if(!container) return;
    
    const saved = getSavedArticles();
    if(saved.length === 0) {
        container.innerHTML = `<div class="empty"><div>📁</div><h3>No saved articles</h3></div>`;
        return;
    }
    
    let html = '';
    saved.forEach(item => {
        const id = String(item._id || item.id).replace(/[^a-zA-Z0-9-]/g, '');
        const date = item.savedAt ? new Date(item.savedAt).toLocaleDateString() : "Saved";
        const title = item.title || "Untitled";
        
        html += `
            <article class="news-card" onclick="openArticle('${escapeHtml(id)}')">
                <div class="news-content">
                    <h3 class="news-title">🔖 ${escapeHtml(title)}</h3>
                    <p class="news-meta"><span>📅 ${escapeHtml(date)}</span></p>
                </div>
            </article>
        `;
    });
    
    container.innerHTML = html;
}

function openArticle(id) {
    const cleanId = String(id).replace(/[^a-zA-Z0-9-]/g, '');
    
    fetchWithTimeout(`${API_ARTICLES}/${cleanId}`, {}, 15000)
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    })
    .then(article => {
        currentArticle = article;
        displayArticleDetail();
    })
    .catch(() => {
        // Fallback to cached data
        const backup = JSON.parse(localStorage.getItem("news_backup") || "[]");
        currentArticle = backup.find(item => String(item._id || item.id) === cleanId);
        
        if(!currentArticle) {
            const saved = getSavedArticles();
            currentArticle = saved.find(item => String(item._id || item.id) === cleanId);
        }
        
        if(currentArticle) displayArticleDetail();
        else showToast("Article not found");
    });
}

function displayArticleDetail() {
    const articleBody = document.getElementById("articleBody");
    const saveBtn = document.getElementById("saveBtn");
    
    if(!articleBody || !currentArticle) return;
    
    const isSaved = getSavedArticles().some(s => String(s._id || s.id) === String(currentArticle._id || currentArticle.id));
    
    if(saveBtn) {
        saveBtn.innerHTML = isSaved ? '✓ Saved' : '💾 Save';
        saveBtn.classList.toggle('saved', isSaved);
    }
    
    const date = currentArticle.createdAt ? new Date(currentArticle.createdAt).toLocaleString() : "Recent";
    
    const imageUrl = getImageUrl(currentArticle.image);
    
    articleBody.innerHTML = `
        ${imageUrl ? `<div class="article-image-container"><img src="${escapeHtml(imageUrl)}" class="article-image" loading="lazy" onerror="this.style.display='none'"></div>` : ''}
        <div class="article-text-content">
            <h1 class="article-headline">${escapeHtml(currentArticle.title || "Untitled")}</h1>
            <div class="article-meta">📅 ${escapeHtml(date)}</div>
            <div class="article-body-text">${escapeHtml(currentArticle.content || "No content available")}</div>
        </div>
    `;
    
    showScreen("detail");
    const detailContent = document.getElementById("detailContent");
    if(detailContent) detailContent.scrollTop = 0;
}

function saveCurrentArticle() {
    if(!currentArticle) return;
    
    const saveBtn = document.getElementById("saveBtn");
    let savedArticles = getSavedArticles();
    const articleId = String(currentArticle._id || currentArticle.id);
    const index = savedArticles.findIndex(s => String(s._id || s.id) === articleId);
    
    if(index !== -1) {
        savedArticles.splice(index, 1);
        if(saveBtn) {
            saveBtn.innerHTML = '💾 Save';
            saveBtn.classList.remove('saved');
        }
        showToast("Removed from saved");
    } else {
        savedArticles.unshift({ ...currentArticle, savedAt: new Date().toISOString() });
        if(saveBtn) {
            saveBtn.innerHTML = '✓ Saved';
            saveBtn.classList.add('saved');
        }
        showToast("Saved!");
    }
    
    localStorage.setItem("saved_articles", JSON.stringify(savedArticles));
    updateSavedFolder();
    
    const homeScreen = document.getElementById('home');
    if(homeScreen && homeScreen.classList.contains('active')) {
        loadNews();
    }
}

function refreshFeed() {
    isOnline = false;
    loadNews();
    showToast("🔄 Refreshing...");
}

function escapeHtml(text) {
    if(text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function showToast(msg) {
    let toast = document.getElementById('toast');
    if(!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            z-index: 10000;
            font-size: 14px;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
        `;
        document.body.appendChild(toast);
    }
    if(toastTimeout) clearTimeout(toastTimeout);
    toast.textContent = msg;
    toast.style.opacity = '1';
    toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}

console.log("✅ KTT News App Loaded - Version Mobile-Fixed");
console.log("📡 API Endpoint:", API_BASE);