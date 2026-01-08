import { toast } from "sonner";

/**
 * Generate a URL-friendly slug from a product name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

/**
 * Share a product using Web Share API or clipboard fallback
 */
export async function shareProduct(product: { name: string; slug: string | null; id: string }) {
  const slug = product.slug || product.id;
  const url = `${window.location.origin}/product/${slug}`;
  const title = product.name;

  // Try Web Share API first (mobile)
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (e) {
      // User cancelled or error - fall through to clipboard
    }
  }

  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard!');
  } catch (e) {
    toast.error('Failed to copy link');
  }
}
