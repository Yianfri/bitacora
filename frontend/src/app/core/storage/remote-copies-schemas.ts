import { z } from 'zod';

export const csrfSchema = z.object({ token: z.string().min(1) });
export const userSchema = z.object({ username: z.string().min(1) });
export const tripMetadataSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1),
  revision: z.number().int().positive().refine(Number.isSafeInteger),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const tripMetadataArraySchema = z.array(tripMetadataSchema);
export const problemSchema = z.looseObject({
  code: z.enum(['storage_quota_exceeded', 'workspace_account_mismatch']).optional(),
});
