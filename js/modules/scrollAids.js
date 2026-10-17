// Small navigation aids for DueVinci's independent page scroll areas.
let initialized = false;

export function findModalScrollRoot(shell) {
    if (!shell || typeof shell.querySelector !== 'function') return null;
    return shell.querySelector('.settings-scroll-pane')
        || (shell.matches?.('[role="dialog"]') ? shell.querySelector('.overflow-y-auto') : null)
        || shell.querySelector('[role="dialog"] .overflow-y-auto')
        || (shell.matches?.('.overflow-y-auto') ? shell : null);
}

function isVisibleModalShell(shell) {
    return Boolean(shell)
        && !shell.closest?.('.hidden')
        && shell.getAttribute?.('aria-hidden') !== 'true';
}

export function findForegroundModalShell(shells = []) {
    // Nested and later-opened dialogs follow their parent shells in document order.
    // Search from the end so a visible foreground dialog wins over its background shell.
    for (let index = shells.length - 1; index >= 0; index -= 1) {
        const shell = shells[index];
        if (isVisibleModalShell(shell)) return shell;
    }
    return null;
}

export function findForegroundModalScrollRoot(shells = []) {
    const shell = findForegroundModalShell(shells);
    const root = findModalScrollRoot(shell);
    return root && root.clientHeight > 0 ? root : null;
}

export function shouldShowScrollProgress({ hasModal = false, modalRoot = null, appVisible = false, scrollHeight = 0, clientHeight = 0 } = {}) {
    return (hasModal ? Boolean(modalRoot) : appVisible)
        && clientHeight > 0
        && scrollHeight - clientHeight > 1;
}

export function findScrollAidLeft(areaBounds, viewportWidth, buttonWidth, gap = 8, defaultRight = 16) {
    if (!areaBounds || !Number.isFinite(viewportWidth) || buttonWidth <= 0) return null;
    const minLeft = areaBounds.left + gap;
    const maxLeft = areaBounds.right - gap - buttonWidth;
    if (minLeft > maxLeft) return null;
    return Math.max(minLeft, Math.min(viewportWidth - buttonWidth - defaultRight, maxLeft));
}

export function createScrollAidCandidateBounds(buttonBounds, left) {
    const width = buttonBounds?.width;
    const height = buttonBounds?.height;
    if (!Number.isFinite(left) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return { left, right: left + width, width, height };
}

export function findScrollAidBottomOffset({ buttonBounds, controlBounds = [], viewportHeight, areaBounds, defaultOffset = 16, gap = 8 } = {}) {
    if (!buttonBounds || !Array.isArray(controlBounds) || !Number.isFinite(viewportHeight)) return null;
    const width = buttonBounds.width ?? buttonBounds.right - buttonBounds.left;
    const height = buttonBounds.height ?? buttonBounds.bottom - buttonBounds.top;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    const areaTop = Math.max(0, areaBounds?.top ?? 0) + gap;
    const areaBottom = Math.min(viewportHeight, areaBounds?.bottom ?? viewportHeight) - gap;
    const minOffset = viewportHeight - areaBottom;
    const maxOffset = viewportHeight - areaTop - height;
    if (minOffset > maxOffset) return null;
    let offset = Math.max(minOffset, Math.min(defaultOffset, maxOffset));
    for (let attempt = 0; attempt <= controlBounds.length; attempt += 1) {
        const top = viewportHeight - offset - height;
        const bottom = top + height;
        const overlapping = controlBounds.filter((control) => (
            control && control.width !== 0 && control.height !== 0
            && control.right > buttonBounds.left && control.left < buttonBounds.right
            && control.bottom > top && control.top < bottom
        ));
        if (!overlapping.length) return offset;
        const nextOffset = Math.max(offset, ...overlapping.map((control) => viewportHeight - control.top + gap));
        if (nextOffset > maxOffset || nextOffset <= offset) return null;
        offset = nextOffset;
    }
    return null;
}

export function setScrollAidVisibility(element, visible) {
    if (visible) {
        element.hidden = false;
        element.style.display = '';
        return;
    }
    element.hidden = true;
    element.style.display = 'none';
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
    setScrollAidVisibility(backToTop, false);
    document.body.append(backToTop);

    let animationFrame = 0;
    const defaultBackToTopBottom = backToTop.style.bottom;
    const update = () => {
        const modalShells = [...document.querySelectorAll('#settingsModal, #supportModal, #canvasSyncModal, [role="dialog"]')];
        const modalShell = findForegroundModalShell(modalShells);
        const modalRootCandidate = findModalScrollRoot(modalShell);
        const modalRoot = modalRootCandidate?.clientHeight > 0 ? modalRootCandidate : null;
        activeScrollRoot = modalRoot || modalShell || scrollRoot;
        const activeDialog = modalRoot?.closest('[role="dialog"]')
            || modalShell?.closest('[role="dialog"]')
            || (modalShell?.matches?.('[role="dialog"]') ? modalShell : null);
        const backToTopParent = activeDialog || document.body;
        if (backToTop.parentElement !== backToTopParent) backToTopParent.append(backToTop);
        const maxScroll = Math.max(0, activeScrollRoot.scrollHeight - activeScrollRoot.clientHeight);
        const canScroll = shouldShowScrollProgress({
            hasModal: Boolean(modalShell),
            modalRoot,
            appVisible: !app.classList.contains('hidden'),
            scrollHeight: activeScrollRoot.scrollHeight,
            clientHeight: activeScrollRoot.clientHeight,
        });
        const percent = canScroll ? Math.min(1, Math.max(0, activeScrollRoot.scrollTop / maxScroll)) : 0;
        progress.hidden = !canScroll;
        fill.style.transform = 'scaleX(' + percent + ')';
        let backToTopPositionSafe = true;
        backToTop.style.bottom = defaultBackToTopBottom;
        backToTop.style.left = '';
        backToTop.style.right = '';
        if (canScroll) {
            setScrollAidVisibility(backToTop, true);
            const buttonBounds = backToTop.getBoundingClientRect();
            const collisionScope = modalShell || app;
            const areaBounds = activeScrollRoot.getBoundingClientRect();
            const controlBounds = [...collisionScope.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
                .filter((element) => element !== backToTop
                    && !element.closest('.hidden')
                    && !element.closest('[aria-hidden="true"]')
                    && element.getClientRects().length > 0
                    && getComputedStyle(element).visibility !== 'hidden')
                .map((element) => element.getBoundingClientRect());
            const preferredLeft = findScrollAidLeft(areaBounds, window.innerWidth, buttonBounds.width);
            if (preferredLeft === null) {
                backToTopPositionSafe = false;
            } else {
                const candidateBounds = createScrollAidCandidateBounds(buttonBounds, preferredLeft);
                const adjustedBottom = candidateBounds && findScrollAidBottomOffset({
                    buttonBounds: candidateBounds,
                    controlBounds,
                    viewportHeight: window.innerHeight,
                    areaBounds,
                    defaultOffset: Number.parseFloat(getComputedStyle(backToTop).bottom) || 16,
                });
                if (adjustedBottom === null) backToTopPositionSafe = false;
                else {
                    backToTop.style.left = Math.round(preferredLeft) + 'px';
                    backToTop.style.right = 'auto';
                    backToTop.style.bottom = Math.round(adjustedBottom) + 'px';
                }
            }
        }
        if (modalRoot) {
            const bounds = modalRoot.getBoundingClientRect();
            progress.style.top = Math.round(bounds.top) + 'px';
            progress.style.left = Math.round(bounds.left) + 'px';
            progress.style.width = Math.round(bounds.width) + 'px';
        } else if (!modalShell) {
            const headerBottom = app.querySelector('header')?.getBoundingClientRect().bottom || 0;
            const sidebarRight = app.querySelector('#appSidebar')?.getBoundingClientRect().right || 0;
            const leftOffset = Math.max(0, Math.min(window.innerWidth, sidebarRight));
            progress.style.top = Math.max(0, headerBottom) + 'px';
            progress.style.left = leftOffset + 'px';
            progress.style.width = Math.max(0, window.innerWidth - leftOffset) + 'px';
        }
        setScrollAidVisibility(backToTop, canScroll && backToTopPositionSafe
            && (activeScrollRoot.scrollTop >= 240 || document.activeElement === backToTop));
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
            document.querySelectorAll('#settingsModal, #supportModal, #canvasSyncModal, [role="dialog"]').forEach((shell) => {
                if (!observedModalShells.has(shell)) {
                    observedModalShells.add(shell);
                    const shellObserver = new MutationObserver(scheduleUpdate);
                    shellObserver.observe(shell, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
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
