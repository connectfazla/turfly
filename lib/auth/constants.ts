/**
 * Auth constants shared between server and client.
 *
 * Deliberately importless. The client bundle needs the cookie name and the
 * password policy, but lib/auth/session.ts and lib/auth/password.ts pull in
 * node:crypto and bcrypt — importing either from a Client Component drags the
 * whole server-side crypto stack into the browser bundle, which Webpack
 * refuses outright ("Reading from node:crypto is not handled"). Keeping the
 * plain values here means the boundary can't be crossed by accident.
 */

export const SESSION_COOKIE = 'turfly_session';

/** Length beats composition rules — a 12-character passphrase is stronger
 * than "P@ss1!" and far likelier to be remembered rather than written on the
 * counter. */
export const MIN_PASSWORD_LENGTH = 10;
