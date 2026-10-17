const APP_ROUTES = new Set(['courses', 'grades', 'calendar', 'tutor', 'nursing']);
const APP_ENTRY_MODULE = '/js/app.js';
const routeAssetLoads = new Map();

export function getAppRouteName(pathname = '') {
    const segments = String(pathname).split('/').filter(Boolean);
    const leaf = (segments.at(-1) || '').replace(/\.html$/, '');
    if (APP_ROUTES.has(leaf)) return leaf;
    if (leaf === 'index') {
        const parent = segments.at(-2);
        return APP_ROUTES.has(parent) ? parent : 'index';
    }
    return pathname.endsWith('/') || !segments.length ? 'index' : null;
}

export function resolveSameOriginAssetUrl(value, baseUrl, origin) {
    try {
        const url = new URL(value, baseUrl);
        return url.origin === origin ? url.href : null;
    } catch {
        return null;
    }
}

export function resolveAppRouteHref(routePath, basePath, currentHref) {
    return new URL(routePath, new URL(basePath, currentHref)).href;
}

function getPathKey(url) {
    return `${url.pathname}${url.search}${url.hash}`;
}

function findRouteColumn(appScreen) {
    const sidebar = appScreen?.querySelector(':scope > duevinci-sidebar');
    return sidebar?.nextElementSibling || null;
}

function setAttributes(target, source) {
    for (const attribute of [...target.attributes]) target.removeAttribute(attribute.name);
    for (const attribute of [...source.attributes]) target.setAttribute(attribute.name, attribute.value);
}

function findExistingAsset(selector, url) {
    const resolved = new URL(url, window.location.href);
    return [...document.querySelectorAll(selector)].find((element) => {
        const value = element.src || element.href;
        if (!value) return false;
        try {
            const existing = new URL(value, window.location.href);
            return existing.origin === resolved.origin && existing.pathname === resolved.pathname;
        } catch { return false; }
    }) || null;
}

function loadRouteAsset(url, selector, createElement) {
    const resolved = new URL(url, window.location.href);
    const key = `${selector}:${resolved.origin}${resolved.pathname}`;
    const pending = routeAssetLoads.get(key);
    if (pending) return pending;
    if (findExistingAsset(selector, resolved.href)) return Promise.resolve();

    const element = createElement(resolved.href);
    const loading = new Promise((resolve, reject) => {
        element.onload = resolve;
        element.onerror = () => reject(new Error('A route asset could not be loaded.'));
        document.head.append(element);
    });
    routeAssetLoads.set(key, loading);
    return loading.catch((error) => {
        element.remove();
        throw error;
    }).finally(() => {
        if (routeAssetLoads.get(key) === loading) routeAssetLoads.delete(key);
    });
}

function loadStylesheet(url) {
    return loadRouteAsset(url, 'link[rel="stylesheet"]', (href) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        return link;
    });
}

function loadScript(url, type = '') {
    if (new URL(url, window.location.href).pathname.endsWith(APP_ENTRY_MODULE)) return Promise.resolve();
    return loadRouteAsset(url, 'script[src]', (src) => {
        const script = document.createElement('script');
        if (type) script.type = type;
        script.src = src;
        script.async = false;
        return script;
    });
}

async function loadRouteAssets(sourceDocument, targetUrl) {
    const stylesheets = [...sourceDocument.querySelectorAll('link[rel="stylesheet"][href]')]
        .map((link) => resolveSameOriginAssetUrl(link.getAttribute('href'), targetUrl, window.location.origin))
        .filter(Boolean);
    for (const href of stylesheets) await loadStylesheet(href);

    const scripts = [...sourceDocument.querySelectorAll('script[src]')]
        .map((script) => ({
            src: resolveSameOriginAssetUrl(script.getAttribute('src'), targetUrl, window.location.origin),
            type: script.type,
        }))
        .filter((script) => script.src);
    for (const script of scripts) await loadScript(script.src, script.type);

    const pdfScript = scripts.find((script) => new URL(script.src).pathname.endsWith('/assets/vendor/pdf.js'));
    if (pdfScript && window.pdfjsLib?.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.js', pdfScript.src).href;
    }
}

function updateDocumentMetadata(sourceDocument, targetUrl) {
    document.title = sourceDocument.title || 'DueVinci';
    for (const name of ['description', 'theme-color']) {
        const source = sourceDocument.querySelector(`meta[name="${name}"]`);
        let target = document.querySelector(`meta[name="${name}"]`);
        if (!source) continue;
        if (!target) {
            target = document.createElement('meta');
            target.name = name;
            document.head.append(target);
        }
        target.content = source.content;
    }
    for (const selector of ['link[rel="manifest"]', 'link[rel="icon"]', 'link[rel="apple-touch-icon"]']) {
        const source = sourceDocument.querySelector(selector);
        if (!source) continue;
        let target = document.querySelector(`${selector}[sizes="${source.sizes?.value || ''}"]`);
        if (!target) target = document.querySelector(selector);
        if (!target) {
            target = document.createElement('link');
            target.rel = source.rel;
            if (source.sizes?.value) target.sizes = source.sizes.value;
            document.head.append(target);
        }
        target.href = new URL(source.getAttribute('href'), targetUrl).href;
        if (source.type) target.type = source.type;
    }
}

function updatePageStyles(sourceDocument) {
    document.querySelectorAll('style[data-duevinci-route-style]').forEach((style) => style.remove());
    [...sourceDocument.querySelectorAll('head style')].forEach((source) => {
        const style = document.createElement('style');
        style.dataset.duevinciRouteStyle = 'true';
        style.textContent = source.textContent;
        document.head.append(style);
    });
}

function updateBodyClasses(sourceDocument) {
    const runtimeClasses = [...document.body.classList].filter((className) => className === 'overflow-hidden');
    document.body.className = [...sourceDocument.body.classList, ...runtimeClasses].join(' ');
}

export function pinAppScreenToViewport(screen) {
    screen?.classList?.add('fixed', 'inset-0');
}

function ensureGlobalElements(sourceDocument) {
    for (const source of sourceDocument.body.children) {
        if (!source.id || source.id === 'appScreen' || document.getElementById(source.id)) continue;
        const copy = document.importNode(source, true);
        if (copy.id === 'authScreen') copy.classList.add('hidden');
        document.body.append(copy);
    }
}

function shouldHandleClick(event, link) {
    return Boolean(link)
        && !event.defaultPrevented
        && event.button === 0
        && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
        && !link.hasAttribute('download')
        && (!link.target || link.target === '_self');
}

function closeMobileSidebar() {
    if (window.matchMedia?.('(max-width: 1023px)').matches) window.toggleSidebar?.(false);
}

export function initializeClientNavigation({ onRouteLeave = () => {}, onRouteEnter = () => {} } = {}) {
    if (typeof document === 'undefined' || typeof window === 'undefined' || !window.history?.pushState) return () => {};
    let activeRoute = getAppRouteName(window.location.pathname);
    let renderedUrl = new URL(window.location.href);
    let navigationController = null;
    let navigationGeneration = 0;
    const scrollPositions = new Map();

    const navigate = async (value, { pushHistory = true } = {}) => {
        const targetUrl = new URL(value, window.location.href);
        const nextRoute = getAppRouteName(targetUrl.pathname);
        if (targetUrl.origin !== window.location.origin || !nextRoute) return false;
        if (nextRoute === activeRoute && getPathKey(targetUrl) === getPathKey(renderedUrl)) {
            if (navigationController) {
                navigationController.abort();
                navigationController = null;
                navigationGeneration += 1;
                document.getElementById('appScreen')?.removeAttribute('aria-busy');
            }
            return true;
        }

        const screen = document.getElementById('appScreen');
        const currentColumn = findRouteColumn(screen);
        const currentMain = currentColumn?.querySelector(':scope > main');
        if (!screen || !currentColumn || !currentMain) return false;
        scrollPositions.set(getPathKey(renderedUrl), currentMain.scrollTop);

        navigationController?.abort();
        navigationController = new AbortController();
        const controller = navigationController;
        const generation = ++navigationGeneration;
        screen.setAttribute('aria-busy', 'true');

        try {
            const response = await fetch(targetUrl.href, { credentials: 'same-origin', signal: controller.signal });
            if (!response.ok) throw new Error('The requested section could not be loaded.');
            if (new URL(response.url, targetUrl.href).origin !== window.location.origin) {
                throw new Error('The requested section redirected outside DueVinci.');
            }
            const html = await response.text();
            const sourceDocument = new DOMParser().parseFromString(html, 'text/html');
            const sourceScreen = sourceDocument.getElementById('appScreen');
            const sourceColumn = findRouteColumn(sourceScreen);
            const sourceHeader = sourceColumn?.querySelector(':scope > header');
            const sourceMain = sourceColumn?.querySelector(':scope > main');
            const currentHeader = currentColumn.querySelector(':scope > header');
            if (!sourceScreen || !sourceColumn || !sourceHeader || !sourceMain || !currentHeader) {
                throw new Error('The requested section does not contain the app shell.');
            }
            await loadRouteAssets(sourceDocument, targetUrl.href);
            if (controller.signal.aborted || generation !== navigationGeneration) return true;

            const previousRoute = activeRoute;
            onRouteLeave(previousRoute, nextRoute);
            if (pushHistory) window.history.pushState({ duevinciRoute: true }, '', targetUrl.href);
            updateDocumentMetadata(sourceDocument, targetUrl.href);
            updatePageStyles(sourceDocument);
            updateBodyClasses(sourceDocument);
            ensureGlobalElements(sourceDocument);
            setAttributes(screen, sourceScreen);
            pinAppScreenToViewport(screen);
            screen.classList.remove('hidden');
            screen.removeAttribute('aria-busy');
            setAttributes(currentColumn, sourceColumn);
            currentHeader.replaceWith(document.importNode(sourceHeader, true));
            setAttributes(currentMain, sourceMain);
            currentMain.replaceChildren(...[...sourceMain.childNodes].map((node) => document.importNode(node, true)));
            currentMain.scrollTop = scrollPositions.get(getPathKey(targetUrl)) || 0;
            activeRoute = nextRoute;
            renderedUrl = targetUrl;
            screen.querySelector('duevinci-sidebar')?.syncActiveRoute?.();
            closeMobileSidebar();
            onRouteEnter(nextRoute, previousRoute);
            return true;
        } catch (error) {
            if (controller.signal.aborted || generation !== navigationGeneration) return false;
            screen.removeAttribute('aria-busy');
            console.warn('Client-side section navigation fell back to a page load:', error.message || error);
            window.location.assign(targetUrl.href);
            return true;
        }
    };

    const onClick = (event) => {
        const link = event.target?.closest?.('a[data-app-nav]');
        if (!shouldHandleClick(event, link)) return;
        const url = new URL(link.href, window.location.href);
        if (url.origin !== window.location.origin || !getAppRouteName(url.pathname)) return;
        event.preventDefault();
        navigate(url.href).catch((error) => console.error('Unable to change DueVinci sections:', error));
    };
    const onPopState = () => {
        navigate(window.location.href, { pushHistory: false }).then((handled) => {
            if (!handled) window.location.assign(window.location.href);
        }).catch((error) => console.error('Unable to restore DueVinci section:', error));
    };

    document.addEventListener('click', onClick);
    window.addEventListener('popstate', onPopState);
    return navigate;
}
