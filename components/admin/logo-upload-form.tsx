'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageUp } from 'lucide-react';
import { updateVenueLogoAction } from '@/app/actions/venue-branding';
import { Button } from '@/components/ui/button';

/** Plain uncontrolled file input + FormData, not React Hook Form — a File
 * doesn't round-trip cleanly through RHF's typed values the way every other
 * form field in this app does, and updateVenueLogoAction already wants a
 * FormData straight from the form element. */
export function LogoUploadForm({ currentLogoUrl }: { currentLogoUrl: string | null }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await updateVenueLogoAction(new FormData(e.currentTarget));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    formRef.current?.reset();
    router.refresh();
  }

  const shown = preview ?? currentLogoUrl;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-card) border border-border bg-surface-muted">
          {shown ? (
            // The live preview is a blob: URL next/image can't optimise, and
            // the persisted one is already served flat from Vercel Blob — a
            // plain <img> handles both without a conditional component swap.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="size-full object-contain" />
          ) : (
            <ImageUp className="size-6 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="logo"
            className="w-fit cursor-pointer rounded-(--radius-input) border border-border bg-surface px-3 py-1.5 text-caption font-medium text-text transition-colors hover:bg-surface-muted"
          >
            Choose an image
          </label>
          <input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={onFileChange}
            className="sr-only"
          />
          <p className="text-caption text-text-muted">PNG, JPEG, WebP or SVG, up to 2MB.</p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || !preview} className="w-fit">
        {pending ? 'Uploading…' : 'Save logo'}
      </Button>
    </form>
  );
}
