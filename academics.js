// --- DYNAMIC ACADEMICS, STREAK, EXAM COUNTDOWN, & SETTINGS TOGGLE ---

window.renderAcademicsDashboardWidget = async (containerId) => {
    if (localStorage.getItem('duevinci_hide_academics') === 'true') {
        const existingWidget = document.getElementById('academicsAnalyticsWidget');
        if (existingWidget) existingWidget.remove();
        return;
    }

    const container = document.getElementById(containerId);
    if (!container) return;

    // Remove any existing instance to prevent duplication
    const existing = document.getElementById('academicsAnalyticsWidget');
    if (existing) existing.remove();

    // Fetch real task counts from Supabase
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
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

// Inject Academics visibility toggle directly into Settings -> Appearance tab
window.injectAcademicsSettingsToggle = () => {
    const appearanceTab = document.getElementById('content-appearance');
    if (!appearanceTab || document.getElementById('academicsToggleContainer')) return;

    const toggleDiv = document.createElement('div');
    toggleDiv.id = 'academicsToggleContainer';
    toggleDiv.className = 'max-w-sm mt-6 pt-6 border-t border-zinc-200 dark:border-brand-700';
    
    const isHidden = localStorage.getItem('duevinci_hide_academics') === 'true';
    toggleDiv.innerHTML = `
        <label class="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">Academics Widget</label>
        <div class="flex items-center justify-between">
            <span class="text-xs text-zinc-500 dark:text-zinc-400">Show analytics widget on dashboard</span>
            <input type="checkbox" id="academicsSwitch" ${!isHidden ? 'checked' : ''} onchange="toggleAcademicsVisibility(this.checked)" class="w-4 h-4 text-indigo-600 rounded border-zinc-300 focus:ring-indigo-500 cursor-pointer">
        </div>
    `;
    appearanceTab.appendChild(toggleDiv);
};

window.toggleAcademicsVisibility = (show) => {
    if (show) {
        localStorage.removeItem('duevinci_hide_academics');
        if (typeof window.renderAcademicsDashboardWidget === 'function') {
            window.renderAcademicsDashboardWidget('dashboardGrid');
        }
    } else {
        localStorage.setItem('duevinci_hide_academics', 'true');
        const widget = document.getElementById('academicsAnalyticsWidget');
        if (widget) widget.remove();
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
    setTimeout(window.injectAcademicsSettingsToggle, 400);
});
