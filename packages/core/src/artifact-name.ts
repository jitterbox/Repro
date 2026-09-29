import { createHash } from 'node:crypto';

/** A readable filename component valid on Windows and Linux, never a path. */
export function artifactSlug(value: string): string {
  const normalized = value.normalize('NFKC').trim();
  let slug = normalized
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'work-item';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(slug))
    slug = `item-${slug}`;
  if (Buffer.byteLength(slug, 'utf8') > 72) {
    const suffix = createHash('sha256')
      .update(normalized)
      .digest('hex')
      .slice(0, 8);
    while (Buffer.byteLength(slug, 'utf8') > 60)
      slug = Array.from(slug).slice(0, -1).join('');
    slug = `${slug}-${suffix}`;
  }
  return slug;
}

/** Policy is reusable; issue identity belongs to a particular scenario/run. */
export function artifactBaseName(input: {
  workItem?: string | undefined;
  description: string;
  scenarioId: string;
  useWorkItemId?: boolean | undefined;
}): string {
  if ((input.useWorkItemId ?? true) && input.workItem?.trim())
    return artifactSlug(input.workItem);
  return `${artifactSlug(input.description)}-${createHash('sha256').update(input.scenarioId).digest('hex').slice(0, 8)}`;
}
