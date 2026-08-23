const required = [
    'APP_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_MONTHLY_PRICE_ID',
    'STRIPE_YEARLY_PRICE_ID',
    'CANVAS_TOKEN_ENCRYPTION_KEY',
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing Production release configuration: ${missing.join(', ')}`);
if (process.env.APP_URL !== 'https://duevinci.tech') throw new Error('APP_URL must be https://duevinci.tech for Production.');
if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')) throw new Error('Production requires a Stripe Live secret key.');
if (!process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) throw new Error('STRIPE_WEBHOOK_SECRET is invalid.');
for (const name of ['STRIPE_MONTHLY_PRICE_ID', 'STRIPE_YEARLY_PRICE_ID']) {
    if (!process.env[name].startsWith('price_')) throw new Error(`${name} is invalid.`);
}
if (process.env.ENABLE_CANVAS_MOCK === 'true') throw new Error('ENABLE_CANVAS_MOCK must not be enabled in Production.');
if (process.env.ALLOW_LOCALHOST_RETURN_URLS === 'true') throw new Error('ALLOW_LOCALHOST_RETURN_URLS must not be enabled in Production.');

console.log('Production release configuration passed validation.');
