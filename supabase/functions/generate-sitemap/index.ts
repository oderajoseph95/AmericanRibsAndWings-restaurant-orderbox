import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://arwfloridablanca.shop";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { trigger = "manual", triggeredBy } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch active products with slugs
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("slug, updated_at")
      .eq("is_active", true)
      .is("archived_at", null)
      .not("slug", "is", null);

    if (productsError) {
      console.error("Error fetching products:", productsError);
      throw productsError;
    }

    // Fetch active categories
    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("id, name, updated_at")
      .eq("is_active", true)
      .is("archived_at", null);

    if (categoriesError) {
      console.error("Error fetching categories:", categoriesError);
      throw categoriesError;
    }

    const now = new Date().toISOString();
    const urls: { loc: string; lastmod: string; priority: string; changefreq: string }[] = [];

    // Add static pages
    urls.push({
      loc: BASE_URL,
      lastmod: now,
      priority: "1.0",
      changefreq: "daily",
    });

    urls.push({
      loc: `${BASE_URL}/order`,
      lastmod: now,
      priority: "0.9",
      changefreq: "daily",
    });

    // Add category pages (if you have category pages)
    const categoryUrls = (categories || []).map((cat) => ({
      loc: `${BASE_URL}/order?category=${encodeURIComponent(cat.name)}`,
      lastmod: cat.updated_at || now,
      priority: "0.8",
      changefreq: "weekly",
    }));
    urls.push(...categoryUrls);

    // Add product pages
    const productUrls = (products || []).map((product) => ({
      loc: `${BASE_URL}/product/${product.slug}`,
      lastmod: product.updated_at || now,
      priority: "0.7",
      changefreq: "weekly",
    }));
    urls.push(...productUrls);

    // Generate XML
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod.split("T")[0]}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

    console.log(`Generated sitemap with ${urls.length} URLs`);

    // Log the generation
    const { error: logError } = await supabase.from("sitemap_logs").insert({
      trigger_type: trigger,
      triggered_by: triggeredBy || null,
      total_urls: urls.length,
      product_urls: productUrls.length,
      category_urls: categoryUrls.length,
      static_urls: 2, // Homepage + Order page
    });

    if (logError) {
      console.error("Error logging sitemap generation:", logError);
    }

    // Return the sitemap XML and stats
    return new Response(
      JSON.stringify({
        success: true,
        totalUrls: urls.length,
        productUrls: productUrls.length,
        categoryUrls: categoryUrls.length,
        staticUrls: 2,
        sitemap: xmlContent,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Sitemap generation error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
