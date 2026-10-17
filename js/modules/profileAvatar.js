import { supabaseClient } from './config.js';

const BUCKET = 'profile-avatars';
const AVATAR_FILE = 'avatar';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024;
const PROFILE_EASTER_EGG_KEY = 'duevinci_profile_easter_egg';
const PROFILE_AVATAR_URL_KEY = 'duevinci_profile_avatar_url';
const PROFILE_AVATAR_URL_TTL_MS = 55 * 60 * 1000;
let profileIdentityGeneration = 0;
let profileAvatarGeneration = 0;
const PROFILE_EASTER_EGG_CLASS = 'pointer-events-none absolute bottom-0 right-0 z-10 h-6 w-6 object-contain drop-shadow-sm';
const PROFILE_EASTER_EGGS = {
    maestro: { asset: new URL('../../assets/images/maestro-logo.svg', import.meta.url).href, label: 'Maestro shield' },
    nightowl: { asset: new URL('../../assets/images/wgu-owl.png', import.meta.url).href, label: 'Night Owl badge' },
};

function profileEasterEggKey(user) {
    return `${PROFILE_EASTER_EGG_KEY}:${user?.id || 'guest'}`;
}

export function getProfileEasterEgg(user = window.currentUser) {
    if (typeof localStorage === 'undefined') return null;
    const egg = localStorage.getItem(profileEasterEggKey(user));
    return PROFILE_EASTER_EGGS[egg] ? egg : null;
}

function getProfileEasterEggBadge() {
    let badge = document.getElementById('profileAvatarEasterEgg');
    if (badge) return badge;

    // The sidebar is a custom element and can be served from an older PWA
    // cache while this module has already updated. Create the badge on demand
    // so the Easter egg does not depend on that markup revision arriving first.
    const avatar = document.getElementById('profileAvatarImage') || document.getElementById('profileAvatarInitials');
    const container = avatar?.parentElement;
    if (!container || typeof document.createElement !== 'function') return null;
    badge = document.createElement('img');
    badge.id = 'profileAvatarEasterEgg';
    badge.className = PROFILE_EASTER_EGG_CLASS;
    badge.alt = '';
    badge.hidden = true;
    container.appendChild(badge);
    return badge;
}

export function renderProfileEasterEgg(user = window.currentUser) {
    if (typeof document === 'undefined') return;
    const badge = getProfileEasterEggBadge();
    if (!badge) return;
    const egg = getProfileEasterEgg(user);
    const config = egg ? PROFILE_EASTER_EGGS[egg] : null;
    if (!config) {
        badge.removeAttribute('src');
        badge.hidden = true;
        badge.style.display = 'none';
        badge.removeAttribute('data-profile-easter-egg');
        return;
    }
    badge.src = config.asset;
    badge.alt = config.label;
    badge.className = PROFILE_EASTER_EGG_CLASS;
    badge.dataset.profileEasterEgg = egg;
    badge.hidden = false;
    badge.style.display = 'block';
}

export function activateProfileEasterEgg(egg, user = window.currentUser) {
    return setProfileEasterEgg(egg, user);
}

export function setProfileEasterEgg(egg, user = window.currentUser) {
    if (typeof localStorage === 'undefined') return false;
    const key = profileEasterEggKey(user);
    if (!egg) {
        localStorage.removeItem(key);
        renderProfileEasterEgg(user);
        return true;
    }
    if (!PROFILE_EASTER_EGGS[egg]) return false;
    // One key stores one value, so a new selection replaces the old badge.
    localStorage.setItem(key, egg);
    renderProfileEasterEgg(user);
    return true;
}

const avatarPath = (userId) => `${userId}/${AVATAR_FILE}`;

function profileAvatarUrlKey(user) {
    return `${PROFILE_AVATAR_URL_KEY}:${user?.id || 'guest'}`;
}

function isCurrentProfileUser(user) {
    if (typeof window === 'undefined' || !Object.prototype.hasOwnProperty.call(window, 'currentUser')) return true;
    return window.currentUser?.id === user?.id;
}

function readCachedProfileAvatarUrl(user) {
    if (!user?.id || typeof sessionStorage === 'undefined') return '';
    const key = profileAvatarUrlKey(user);
    try {
        const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (typeof cached?.url === 'string' && cached.url && Number.isFinite(cached.expiresAt)
            && cached.expiresAt > Date.now() + 60 * 1000) {
            return cached.url;
        }
        sessionStorage.removeItem(key);
    } catch { /* Storage can be disabled; request a fresh signed URL instead. */ }
    return '';
}

function cacheProfileAvatarUrl(user, url) {
    if (!user?.id || typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.setItem(profileAvatarUrlKey(user), JSON.stringify({
            url,
            expiresAt: Date.now() + PROFILE_AVATAR_URL_TTL_MS,
        }));
    } catch { /* The image still works when session storage is unavailable. */ }
}

export function clearCachedProfileAvatarUrl(user) {
    if (!user?.id || typeof sessionStorage === 'undefined') return;
    try { sessionStorage.removeItem(profileAvatarUrlKey(user)); } catch { /* Ignore unavailable session storage. */ }
}

export function invalidateProfileAvatarRequests() {
    profileIdentityGeneration += 1;
    profileAvatarGeneration += 1;
}

function fallbackNameFor(user) {
    const metadata = user?.user_metadata || {};
    const providerName = metadata.full_name || metadata.name || metadata.display_name;
    return String(providerName || user?.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim() || 'Your account';
}

function initialsFor(user, displayName = '') {
    const value = String(displayName || fallbackNameFor(user)).replace(/[._-]+/g, ' ').trim();
    const initials = value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('');
    return (initials || 'DV').toUpperCase();
}

function setProfileIdentity(user, displayName = '') {
    const initials = document.getElementById('profileAvatarInitials');
    const name = document.getElementById('profileIdentityName');
    const email = document.getElementById('profileIdentityEmail');
    if (initials) {
        initials.textContent = initialsFor(user, displayName);
    }
    if (name) name.textContent = String(displayName || fallbackNameFor(user));
    if (email) email.textContent = user?.email || 'Signed in';
}

function showAvatarFallback(user, displayName = '') {
    const image = document.getElementById('profileAvatarImage');
    const initials = document.getElementById('profileAvatarInitials');
    if (image) {
        image.removeAttribute('src');
        image.classList.add('hidden');
    }
    if (initials) {
        initials.textContent = initialsFor(user, displayName);
        initials.classList.remove('hidden');
    }
}

export async function getProfileDisplayName(user) {
    if (!user?.id) return '';
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle();
    if (error) return '';
    return String(data?.display_name || '').trim();
}

export async function refreshProfileIdentity(user) {
    if (typeof document === 'undefined' || !user?.id || !isCurrentProfileUser(user)) return;
    const generation = ++profileIdentityGeneration;
    setProfileIdentity(user);
    const displayName = await getProfileDisplayName(user);
    if (generation !== profileIdentityGeneration || !isCurrentProfileUser(user)) return;
    if (displayName) setProfileIdentity(user, displayName);
}

export async function saveProfileDisplayName(value, user) {
    const displayName = String(value || '').trim().replace(/\s+/g, ' ');
    if (!user?.id) throw new Error('Please sign in again before changing your name.');
    if (!displayName) throw new Error('Enter the name you want DueVinci to display.');
    if (displayName.length > 80) throw new Error('Display names must be 80 characters or fewer.');

    const { error } = await supabaseClient
        .from('profiles')
        .update({ display_name: displayName })
        .eq('user_id', user.id);
    if (error) throw error;
    setProfileIdentity(user, displayName);
    await refreshProfileAvatar(user);
    return displayName;
}

export async function refreshProfileAvatar(user) {
    if (typeof document === 'undefined' || !user?.id || !isCurrentProfileUser(user)) return;
    const generation = ++profileAvatarGeneration;
    await refreshProfileIdentity(user);
    if (generation !== profileAvatarGeneration || !isCurrentProfileUser(user)) return false;
    const image = document.getElementById('profileAvatarImage');
    const initials = document.getElementById('profileAvatarInitials');
    if (!image) return false;

    const displayAvatar = (url) => {
        image.onload = () => {
            if (generation !== profileAvatarGeneration) return;
            image.classList.remove('hidden');
            initials?.classList.add('hidden');
        };
        image.onerror = () => {
            if (generation !== profileAvatarGeneration) return;
            clearCachedProfileAvatarUrl(user);
            showAvatarFallback(user);
            console.warn('Unable to display profile photo.');
        };
        if (image.src !== url) image.src = url;
        if (image.complete && image.naturalWidth > 0) {
            image.classList.remove('hidden');
            initials?.classList.add('hidden');
        }
    };
    const cachedUrl = readCachedProfileAvatarUrl(user);
    if (cachedUrl) {
        displayAvatar(cachedUrl);
        renderProfileEasterEgg(user);
        return true;
    }

    const { data, error } = await supabaseClient.storage.from(BUCKET).createSignedUrl(avatarPath(user.id), 60 * 60);
    if (generation !== profileAvatarGeneration || !isCurrentProfileUser(user)) return false;
    if (error || !data?.signedUrl) {
        // A missing object is normal for accounts without a photo. Keep an
        // already-rendered image intact during transient refresh failures.
        if (!image?.getAttribute('src')) showAvatarFallback(user);
        if (error && !/not found|object not found/i.test(error.message || '')) console.warn('Unable to refresh profile photo:', error.message || error);
        renderProfileEasterEgg(user);
        return false;
    }
    const signedUrl = `${data.signedUrl}${data.signedUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
    cacheProfileAvatarUrl(user, signedUrl);
    displayAvatar(signedUrl);
    renderProfileEasterEgg(user);
    return true;
}

function profileMessage(message, color = 'text-red-500') {
    const target = document.getElementById('avatarMsg') || document.getElementById('settingsMsg');
    if (!target) return;
    target.textContent = message;
    target.className = `text-xs ${color}`;
    target.classList.remove('hidden');
}

export async function uploadProfileAvatar(file, user) {
    if (!file || !user?.id) return;
    if (!ALLOWED_TYPES.has(file.type)) return profileMessage('Choose a JPG, PNG, or WebP image.');
    if (file.size > MAX_BYTES) return profileMessage('Profile photos must be 2 MB or smaller.');

    const input = document.getElementById('profileAvatarInput');
    if (input) input.disabled = true;
    profileMessage('Uploading photo…', 'text-zinc-500');
    try {
        const { error } = await supabaseClient.storage.from(BUCKET).upload(avatarPath(user.id), file, {
            upsert: true,
            contentType: file.type,
            cacheControl: '3600',
        });
        if (error) throw error;
        clearCachedProfileAvatarUrl(user);
        await refreshProfileAvatar(user);
        profileMessage('Profile photo updated.', 'text-green-500');
    } catch (error) {
        profileMessage(error?.message || 'Could not upload profile photo.');
    } finally {
        if (input) {
            input.disabled = false;
            input.value = '';
        }
    }
}

export async function removeProfileAvatar(user) {
    if (!user?.id) return;
    try {
        const { error } = await supabaseClient.storage.from(BUCKET).remove([avatarPath(user.id)]);
        if (error) throw error;
        clearCachedProfileAvatarUrl(user);
        showAvatarFallback(user);
        profileMessage('Profile photo removed.', 'text-green-500');
    } catch (error) {
        profileMessage(error?.message || 'Could not remove profile photo.');
    }
}

if (typeof window !== 'undefined') {
    window.uploadProfileAvatar = (event) => uploadProfileAvatar(event?.target?.files?.[0], window.currentUser);
    window.removeProfileAvatar = () => removeProfileAvatar(window.currentUser);
    window.renderProfileEasterEgg = () => renderProfileEasterEgg(window.currentUser);
}
