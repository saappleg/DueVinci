// --- DYNAMIC ACADEMICS, GPA, STREAK, EXAM COUNTDOWN, & SETTINGS PANEL ---

window.renderAcademicsDashboardWidget = async (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (document.getElementById('academicsAnalyticsWidget')) return;

    // Fetch real task counts from Supabase for accurate stats
    let completedCount = 0;
    let totalCount = 0;
    try {
        const { data: assignments } = await supabaseClient.from('assignments').select('is_completed');
        if (assignments) {
            totalCount = assignments.length;
            completedCount = assignments.filter(a => a.is_completed).length;
        }
    } catch (e) {
        console.error("Error fetching academic stats:", e);
    }

    // Read custom exam countdown from localStorage settings
    const examName = localStorage.getItem('duevinci_exam_name') || 'Midterm Exam';
    const examDateStr = localStorage.getItem('duevinci_exam_date');
    let countdownText = 'No exam set';

    if (examDateStr) {
        const diffTime = new Date(examDateStr) - new Date();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        countdownText = diffDays >= 0 ? `${examName} in ${diffDays} Day${diffDays === 1 ? '' : 's'}` : `${examName} passed`;
    }

    const analyticsDiv = document.createElement('div');
    analyticsDiv.id = 'academicsAnalyticsWidget';
    analyticsDiv.className = 'mb-6';
    analyticsDiv.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white dark:bg-brand-800 p-4 rounded-xl border border-zinc-200 dark:border-brand-700 shadow-sm">
                <h4 class="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Estimated GPA</h4>
                <p id="gpaDisplayResult" class="text-2xl font-extrabold text-indigo-500">4.00</p>
            </div>
            <div class="bg-white dark:bg-brand-800 p-4 rounded-xl border border-zinc-200 dark:border-brand-700 shadow-sm">
                <h4 class="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Study Streak</h4>
                <p class="text-2xl font-extrabold text-emerald-500">🔥 5 Days</p>
            </div>
            <div class="bg-white dark:bg-brand-800 p-4 rounded-xl border border-zinc-200 dark:border-brand-700 shadow-sm">
                <h4 class="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Tasks Completed</h4>
                <p id="tasksCompletedCount" class="text-2xl font-extrabold text-amber-500">${completedCount} / ${totalCount}</p>
            </div>
            <div class="bg-white dark:bg-brand-800 p-4 rounded-xl border border-zinc-200 dark:border-brand-700 shadow-sm">
                <h4 class="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Next Exam Countdown</h4>
                <p id="examCountdownDisplay" class="text-lg font-bold text-red-500 truncate">${countdownText}</p>
            </div>
        </div>
    `;

    const headerTitle = container.querySelector('.flex.justify-between.items-end');
    if (headerTitle && headerTitle.nextSibling) {
        container.insertBefore(analyticsDiv, headerTitle.nextSibling);
    } else {
        container.insertBefore(analyticsDiv, container.firstChild);
    }
};

// Inject Academics & Timers Control Panel into Settings Modal
window.injectAcademicsSettingsTab = () => {
    const settingsModalContent = document.querySelector('#settingsModal .flex-1.p-6');
    const settingsNav = document.querySelector('#settingsModal nav');
    if (!settingsModalContent || !settingsNav) return;

    if (!document.getElementById('tab-academics')) {
        const navBtn = document.createElement('button');
        navBtn.type = 'button';
        navBtn.onclick = () => switchSettingsTab('academics');
        navBtn.className = "w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition";
        navBtn.id = 'tab-academics';
        navBtn.innerText = 'Academics & Timers';
        settingsNav.appendChild(navBtn);

        const tabContent = document.createElement('div');
        tabContent.id = 'content-academics';
        tabContent.className = 'hidden space-y-6';
        
        const savedExamName = localStorage.getItem('duevinci_exam_name') || '';
        const savedExamDate = localStorage.getItem('duevinci_exam_date') || '';

        tabContent.innerHTML = `
            <div>
                <h2 class="text-xl font-bold dark:text-white mb-1">Academics & Timers Control</h2>
                <p class="text-sm text-zinc-500 dark:text-zinc-400">Configure your exam countdown and manage multi-timers.</p>
            </div>
            <div class="space-y-4 max-w-sm">
                <div>
                    <label class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Exam / Milestone Name</label>
                    <input type="text" id="settingExamName" value="${savedExamName}" placeholder="e.g. CS101 Midterm" class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500">
                </div>
                <div>
                    <label class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Exam Date</label>
                    <input type="date" id="settingExamDate" value="${savedExamDate}" class="w-full border border-zinc-300 dark:border-brand-600 dark:bg-brand-900 dark:text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-indigo-500">
                </div>
                <button type="button" onclick="saveAcademicsSettings()" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-lg transition">Save Academic Settings</button>
            </div>
            <div class="pt-4 border-t border-zinc-200 dark:border-brand-700">
                <h3 class="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-3">Manage Multi-Timers</h3>
                <div id="settingsTimersManager" class="space-y-2"></div>
            </div>
        `;
        settingsModalContent.appendChild(tabContent);
    }
};

window.switchSettingsTab = (tabName) => {
    document.getElementById('content-profile').classList.add('hidden');
    document.getElementById('content-appearance').classList.add('hidden');
    const acadContent = document.getElementById('content-academics');
    if (acadContent) acadContent.classList.add('hidden');
    
    document.getElementById('tab-profile').className = "w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition";
    document.getElementById('tab-appearance').className = "w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition";
    const acadTab = document.getElementById('tab-academics');
    if (acadTab) acadTab.className = "w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-brand-700 transition";
    
    document.getElementById(`content-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-${tabName}`).className = "w-full text-left px-3 py-2 rounded-lg text-sm font-bold bg-zinc-200 dark:bg-brand-700 text-indigo-600 dark:text-indigo-400 transition";

    if (tabName === 'academics' && typeof renderTimersManager === 'function') {
        const mgrContainer = document.getElementById('settingsTimersManager');
        if (mgrContainer) renderTimersManager(mgrContainer);
    }
};

window.saveAcademicsSettings = () => {
    const name = document.getElementById('settingExamName').value.trim();
    const date = document.getElementById('settingExamDate').value;
    localStorage.setItem('duevinci_exam_name', name);
    localStorage.setItem('duevinci_exam_date', date);
    alert('Academic settings saved successfully!');
    if (typeof window.renderAcademicsDashboardWidget === 'function') {
        window.renderAcademicsDashboardWidget('dashboardGrid');
    }
};

window.renderResourceLinksSection = (courseId, containerId) => {
    let container = document.getElementById(containerId);
    if (!container) {
        const targetModalBody = document.querySelector('#courseModal .overflow-y-auto > div:first-child');
        if (targetModalBody) {
            container = document.createElement('div');
            container.id = containerId;
            targetModalBody.appendChild(container);
        } else {
            return;
        }
    }

    let savedLinks = JSON.parse(localStorage.getItem(`resources_${courseId}`)) || [
        { title: 'GitHub Repository', url: 'https://github.com' },
        { title: 'Official Documentation', url: 'https://developer.mozilla.org' }
    ];

    let html = `<div class="space-y-3 mt-4 pt-4 border-t border-zinc-200 dark:border-brand-700"><h3 class="text-sm font-bold text-zinc-800 dark:text-zinc-300">🔗 Resource & Note Links</h3><div class="space-y-2">`;
    savedLinks.forEach((link, idx) => {
        html += `<div class="flex items-center justify-between p-2 bg-zinc-100 dark:bg-brand-900 rounded-lg text-xs"><a href="${link.url}" target="_blank" class="font-bold text-indigo-500 hover:underline truncate">${link.title}</a><button onclick="removeResourceLink('${courseId}', ${idx})" class="text-zinc-400 hover:text-red-500 font-bold px-1">✕</button></div>`;
    });
    html += `</div><div class="flex gap-2 mt-2"><input type="text" id="resTitle_${courseId}" placeholder="Title" class="w-1/3 text-xs px-2 py-1.5 rounded border dark:bg-brand-900 dark:border-brand-600 focus:outline-none focus:border-indigo-500"><input type="url" id="resUrl_${courseId}" placeholder="https://..." class="flex-1 text-xs px-2.5 py-1.5 rounded border dark:bg-brand-900 dark:border-brand-600 focus:outline-none focus:border-indigo-500"><button onclick="addResourceLink('${courseId}')" class="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs font-bold transition">+ Add</button></div></div>`;
    container.innerHTML = html;
};

window.addResourceLink = (courseId) => {
    const titleInput = document.getElementById(`resTitle_${courseId}`);
    const urlInput = document.getElementById(`resUrl_${courseId}`);
    const title = titleInput ? titleInput.value.trim() : '';
    const url = urlInput ? urlInput.value.trim() : '';
    if (!title || !url) return;

    let savedLinks = JSON.parse(localStorage.getItem(`resources_${courseId}`)) || [];
    savedLinks.push({ title, url });
    localStorage.setItem(`resources_${courseId}`, JSON.stringify(savedLinks));
    window.renderResourceLinksSection(courseId, 'courseResourceSection');
};

window.removeResourceLink = (courseId, index) => {
    let savedLinks = JSON.parse(localStorage.getItem(`resources_${courseId}`)) || [];
    savedLinks.splice(index, 1);
    localStorage.setItem(`resources_${courseId}`, JSON.stringify(savedLinks));
    window.renderResourceLinksSection(courseId, 'courseResourceSection');
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(window.injectAcademicsSettingsTab, 500);
});
