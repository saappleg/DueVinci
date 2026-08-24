import { supabaseClient } from './config.js';

const BUCKET = 'profile-avatars';
const AVATAR_FILE = 'avatar';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024;

const avatarPath = (userId) => `${userId}/${AVATAR_FILE}`;

function initialsFor(user) {
    const value = String(user?.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
    const initials = value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('');
    return (initials || 'DV').toUpperCase();
}

function setAvatarFallback(user) {
    const image = document.getElementById('profileAvatarImage');
    const initials = document.getElementById('profileAvatarInitials');
    const name = document.getElementById('profileIdentityName');
    const email = document.getElementById('profileIdentityEmail');
    if (image) {
        image.removeAttribute('src');
        image.classList.add('hidden');
    }
    if (initials) {
        initials.textContent = initialsFor(user);
        initials.classList.remove('hidden');
    }
    if (name) name.textContent = String(user?.email || 'Your account').split('@')[0] || 'Your account';
    if (email) email.textContent = user?.email || 'Signed in';
}

export async function refreshProfileAvatar(user) {
    if (typeof document === 'undefined' || !user?.id) return;
    setAvatarFallback(user);
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
