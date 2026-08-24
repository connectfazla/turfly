/**
 * ROUTE: /login — a permanent redirect to Clerk's sign-in page.
 *
 * Staff authentication moved from Auth.js to Clerk. This stub exists only
 * so existing bookmarks, the browser history of everyone who has ever run
 * the counter, and any printed/pinned instructions keep working. It carries
 * no UI of its own and can be deleted once those have aged out.
 */
import { redirect } from 'next/navigation';

export default function LoginPage() {
  redirect('/sign-in');
}
