// Small navigation aids for DueVinci's independent page scroll areas.
let initialized = false;

export function findModalScrollRoot(shell) {
    if (!shell || typeof shell.querySelector !== 'function') return null;
    return shell.querySelector('.settings-scroll-pane')
        || (shell.matches?.('[role="dialog"]') ? shell.querySelector('.overflow-y-auto') : null)
        || shell.querySelector('[role="dialog"] .overflow-y-auto');
}

function reducedMotionRequested() {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function initScrollAids() {
    if (initialized || typeof document === 'undefined') return;
    const app = document.getElementById('appScreen');
    const scrollRoot = app?.querySelector('main');
    if (!app || !scrollRoot) return;
    initialized = true;
    let activeScrollRoot = scrollRoot;
    const observedScrollRoots = new WeakSet();
    const observedModalShells = new WeakSet();

    const progress = document.createElement('div');
    progress.id = 'duevinciScrollProgress';
    progress.className = 'fixed z-[70] h-1 pointer-events-none';
    progress.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('div');
    fill.className = 'h-full origin-left';
    fill.style.backgroundColor = 'var(--dv-degree-accent, #4f46e5)';
    fill.style.transform = 'scaleX(0)';
    progress.append(fill);
    document.body.append(progress);

    const backToTop = document.createElement('button');
    backToTop.type = 'button';
    backToTop.className = 'fixed right-4 z-[70] inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 shadow-lg transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-brand-600 dark:bg-brand-800 dark:text-white dark:hover:bg-brand-700';
    backToTop.style.bottom = 'calc(1rem + env(safe-area-inset-bottom))';
    backToTop.setAttribute('aria-label', 'Back to top');
    backToTop.title = 'Back to top';
    backToTop.innerHTML = '<svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"m5 15 7-7 7 7\"/></svg>';
    backToTop.hidden = true;
    document.body.append(backToTop);

    let animationFrame = 0;
    const getModalScrollRoot = () => {
        const shells = [...document.querySelectorAll('#settingsModal, #supportModal, [role="dialog"]')]
            .filter((shell) => !shell.closest('.hidden'));
        for (const shell of shells) {
            const root = findModalScrollRoot(shell);
            if (root && root.clientHeight > 0) return root;
        }
        return null;
    };
    const update = () => {
        const modalRoot = getModalScrollRoot();
        activeScrollRoot = modalRoot || scrollRoot;
        const activeDialog = modalRoot?.closest('[role="dialog"]');
        const backToTopParent = activeDialog || document.body;
        if (backToTop.parentElement !== backToTopParent) backToTopParent.append(backToTop);
        const maxScroll = Math.max(0, activeScrollRoot.scrollHeight - activeScrollRoot.clientHeight);
        const rootVisible = modalRoot ? true : !app.classList.contains('hidden');
        const canScroll = rootVisible && activeScrollRoot.clientHeight > 0 && maxScroll > 1;
        const percent = canScroll ? Math.min(1, Math.max(0, activeScrollRoot.scrollTop / maxScroll)) : 0;
        progress.hidden = !canScroll;
        fill.style.transform = 'scaleX(' + percent + ')';
        if (modalRoot) {
            const bounds = modalRoot.getBoundingClientRect();
            progress.style.top = Math.round(bounds.top) + 'px';
            progress.style.left = Math.round(bounds.left) + 'px';
            progress.style.width = Math.round(bounds.width) + 'px';
        } else {
            const headerBottom = app.querySelector('header')?.getBoundingClientRect().bottom || 0;
            const sidebarRight = app.querySelector('#appSidebar')?.getBoundingClientRect().right || 0;
            const leftOffset = Math.max(0, Math.min(window.innerWidth, sidebarRight));
            progress.style.top = Math.max(0, headerBottom) + 'px';
            progress.style.left = leftOffset + 'px';
            progress.style.width = Math.max(0, window.innerWidth - leftOffset) + 'px';
        }
        backToTop.hidden = !canScroll || (activeScrollRoot.scrollTop < 240 && document.activeElement !== backToTop);
    };
    const scheduleUpdate = () => {
        if (animationFrame) return;
        animationFrame = window.requestAnimationFrame(() => {
            animationFrame = 0;
            update();
        });
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleUpdate) : null;

    scrollRoot.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    backToTop.addEventListener('click', () => {
        activeScrollRoot.scrollTo({ top: 0, behavior: reducedMotionRequested() ? 'auto' : 'smooth' });
        if (!activeScrollRoot.hasAttribute('tabindex')) activeScrollRoot.setAttribute('tabindex', '-1');
        activeScrollRoot.focus({ preventScroll: true });
    });
    backToTop.addEventListener('focusout', scheduleUpdate);
    app.addEventListener('transitionend', scheduleUpdate);

    if (typeof MutationObserver !== 'undefined') {
        const appObserver = new MutationObserver(scheduleUpdate);
        appObserver.observe(app, { attributes: true, attributeFilter: ['class'] });
        const contentObserver = new MutationObserver(scheduleUpdate);
        contentObserver.observe(scrollRoot, { childList: true, subtree: true });
        const discoverIndependentScrollAreas = () => {
            document.querySelectorAll('#settingsModal, #supportModal, [role="dialog"]').forEach((shell) => {
                if (!observedModalShells.has(shell)) {
                    observedModalShells.add(shell);
                    const shellObserver = new MutationObserver(scheduleUpdate);
                    shellObserver.observe(shell, { attributes: true, attributeFilter: ['class'] });
                }
                const root = findModalScrollRoot(shell);
                if (root && !observedScrollRoots.has(root)) {
                    observedScrollRoots.add(root);
                    root.addEventListener('scroll', scheduleUpdate, { passive: true });
                    const rootObserver = new MutationObserver(scheduleUpdate);
                    rootObserver.observe(root, { childList: true, subtree: true });
                    if (resizeObserver) resizeObserver.observe(root);
                }
            });
            scheduleUpdate();
        };
        const documentObserver = new MutationObserver(discoverIndependentScrollAreas);
        documentObserver.observe(document.body, { childList: true, subtree: true });
        discoverIndependentScrollAreas();
        const sidebarHost = app.querySelector('duevinci-sidebar');
        if (sidebarHost) {
            const sidebarObserver = new MutationObserver(scheduleUpdate);
            sidebarObserver.observe(sidebarHost, { attributes: true, attributeFilter: ['class', 'style'], childList: true, subtree: true });
            if (resizeObserver) resizeObserver.observe(sidebarHost);
        }
    }
    if (resizeObserver) resizeObserver.observe(scrollRoot);

    const focusStyle = document.createElement('style');
    focusStyle.id = 'duevinci-nursing-focus-style';
    focusStyle.textContent = '#nursingHub :where(button,a,input,select,textarea,summary,[tabindex]):focus-visible{outline:3px solid var(--dv-degree-accent,#4f46e5);outline-offset:3px}';
    document.head.append(focusStyle);
    update();
}
