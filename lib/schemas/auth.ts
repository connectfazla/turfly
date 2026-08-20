import { z } from 'zod';

/** Shared by the /login form and auth.ts's authorize() callback. */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginFormInput = z.input<typeof loginSchema>;
