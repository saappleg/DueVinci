import { supabaseClient } from './config.js';

const BUCKET = 'profile-avatars';
const AVATAR_FILE = 'avatar';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024;

const avatarPath = (userId) => `${userId}/${AVATAR_FILE}`;

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
    const image = document.getElementById('profileAvatarImage');
    const initials = document.getElementById('profileAvatarInitials');
    const name = document.getElementById('profileIdentityName');
    const email = document.getElementById('profileIdentityEmail');
    if (image) {
        image.removeAttribute('src');
        image.classList.add('hidden');
    }
    if (initials) {
        initials.textContent = initialsFor(user, displayName);
        initials.classList.remove('hidden');
    }
    if (name) name.textContent = String(displayName || fallbackNameFor(user));
    if (email) email.textContent = user?.email || 'Signed in';
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
    if (typeof document === 'undefined' || !user?.id) return;
    setProfileIdentity(user);
    const displayName = await getProfileDisplayName(user);
    if (displayName) setProfileIdentity(user, displayName);
}

export async function saveProfileDisplayName(value, user) {
    const displayName = String(value || '').trim().replace(/\s+/g, ' ');
    if (!user?.id) throw new Error('Please sign in again before changing your name.');
    if (!displayName) throw new Error('Enter the name you want DueVinci to display.');
    if (displayName.length > 80) throw new Error('Display names must be 80 characters or fewer.');

    const { error } = await supabaseClient
        .from('profiles')
        .update({ display_name: displayName, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    if (error) throw error;
    setProfileIdentity(user, displayName);
    return displayName;
}

export async function refreshProfileAvatar(user) {
    if (typeof document === 'undefined' || !user?.id) return;
    await refreshProfileIdentity(user);
    const { data, error } = await supabaseClient.storage.from(BUCKET).createSignedUrl(avatarPath(user.id), 60 * 60);
    if (error || !data?.signedUrl) return;
    const image = document.getElementById('profileAvatarImage');
    const initials = document.getElementById('profileAvatarInitials');
    if (!image) return;
    image.onload = () => {
        image.classList.remove('hidden');
        initials?.classList.add('hidden');
    };
    image.src = `${data.signedUrl}${data.signedUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
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
        await refreshProfileAvatar(user);
        profileMessage('Profile photo removed.', 'text-green-500');
    } catch (error) {
        profileMessage(error?.message || 'Could not remove profile photo.');
    }
}

if (typeof window !== 'undefined') {
    window.uploadProfileAvatar = (event) => uploadProfileAvatar(event?.target?.files?.[0], window.currentUser);
    window.removeProfileAvatar = () => removeProfileAvatar(window.currentUser);
}
