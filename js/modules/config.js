// --- DYNAMIC SUPABASE ENVIRONMENT ROUTING & CLIENT ---

// Environment safeguards for browser/Node compatibility
if (typeof window === 'undefined') {
    globalThis.window = globalThis;
}
if (typeof window.addEventListener === 'undefined') {
    window.addEventListener = () => {};
    window.removeEventListener = () => {};
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
}
if (typeof document === 'undefined') {
    globalThis.document = {
        documentElement: { classList: { add: () => {}, remove: () => {} } },
        addEventListener: () => {},
        removeEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null,
        createElement: () => ({
            style: { setProperty: () => {}, transition: '', opacity: '', transform: '', animation: '', width: '', height: '', top: '', left: '' },
            setAttribute: () => {},
            appendChild: () => {},
            removeChild: () => {},
            classList: { add: () => {}, remove: () => {}, contains: () => false },
            addEventListener: () => {},
            removeEventListener: () => {},
            getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100 })
        }),
        head: { appendChild: () => {}, removeChild: () => {} },
        body: { appendChild: () => {}, removeChild: () => {} }
    };
}
if (typeof localStorage === 'undefined' || !localStorage.getItem) {
    globalThis.localStorage = {
        _store: {},
        getItem: function(key) { return this._store[key] || null; },
        setItem: function(key, val) { this._store[key] = String(val); },
        removeItem: function(key) { delete this._store[key]; },
        clear: function() { this._store = {}; }
    };
}

export const DEV_SUPABASE_URL = 'https://kinsxkeerxguqkyzrjfm.supabase.co';
export const DEV_SUPABASE_ANON_KEY = 'sb_publishable_8Paq4c7YXoFfbr0AhlXmpQ_gy-yn0RB';

export const PROD_SUPABASE_URL = 'https://lzmsguzlmjmedlaybckc.supabase.co';
export const PROD_SUPABASE_ANON_KEY = 'sb_publishable_RMNFdMwGYzdOGBCMLgqO9Q_HhiHkEpZ';

export const currentHost = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : 'localhost';

export let SUPABASE_URL = '';
export let SUPABASE_ANON_KEY = '';

// Determine environment based on hostname. Any non-local host is treated as production (GitHub Pages, custom domains, etc.).
if (currentHost.includes('localhost') || currentHost.includes('127.0.0.1') || currentHost.startsWith('file')) {
    SUPABASE_URL = DEV_SUPABASE_URL;
    SUPABASE_ANON_KEY = DEV_SUPABASE_ANON_KEY;
    if (typeof console !== 'undefined') console.log('🔧 Running in Development Mode (DueVinci-Dev)');
} else {
    SUPABASE_URL = PROD_SUPABASE_URL;
    SUPABASE_ANON_KEY = PROD_SUPABASE_ANON_KEY;
    if (typeof console !== 'undefined') console.log('🚀 Running in Production Mode (DueVinci-Prod)');
}

export const supabaseClient = (typeof window !== 'undefined' && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        experimental: { passkey: true }
    }
}) : {
    auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: async () => ({ data: null, error: null }),
        signUp: async () => ({ data: null, error: null }),
        signOut: async () => ({ error: null }),
        signInWithPasskey: async () => ({ data: null, error: null }),
        registerPasskey: async () => ({ data: null, error: null })
    },
    from: () => ({
        select: () => ({ data: [], error: null }),
        insert: () => ({ data: [], error: null }),
        update: () => ({ data: [], error: null }),
        delete: () => ({ data: [], error: null }),
        order: () => ({ data: [], error: null })
    })
};

// Bind to window for global access
if (typeof window !== 'undefined') {
    window.supabaseClient = supabaseClient;
    window.SUPABASE_URL = SUPABASE_URL;
    window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
    window.DEV_SUPABASE_URL = DEV_SUPABASE_URL;
    window.DEV_SUPABASE_ANON_KEY = DEV_SUPABASE_ANON_KEY;
    window.PROD_SUPABASE_URL = PROD_SUPABASE_URL;
    window.PROD_SUPABASE_ANON_KEY = PROD_SUPABASE_ANON_KEY;
}
